#!/usr/bin/env python3
"""Select, cut, upload, and register six AMI meeting clips across two role tracks."""

from __future__ import annotations

import argparse
import io
import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from datasets import Audio, Dataset, load_dataset
from pydub import AudioSegment
from supabase import create_client

WINDOW_SECONDS = 150
# The practice clip is a candidate's first impression: it must open on speech and never go quiet for long.
PRACTICE_MAX_LEAD_SECONDS = 1.5
PRACTICE_MAX_GAP_SECONDS = 8.0


@dataclass
class Window:
    row_index: int
    meeting_id: str
    start: float
    end: float
    utterances: list[dict[str, Any]]
    speakers: int
    turns: int
    overlap_seconds: float
    crosstalk_seconds: float
    long_silence_seconds: float
    lead_seconds: float
    max_gap_seconds: float

    @property
    def turn_rate(self) -> float:
        return self.turns / (WINDOW_SECONDS / 60)


def parse_utterances(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, str):
        value = json.loads(value)
    return sorted(value or [], key=lambda item: float(item["begin_time"]))


def meeting_id(row: dict[str, Any], index: int) -> str:
    for key in ("meeting_id", "id", "audio_id", "file_name", "name"):
        if row.get(key):
            return str(row[key])
    return f"row-{index}"


def is_ami(row: dict[str, Any]) -> bool:
    searchable = " ".join(
        str(row.get(key, "")) for key in ("dataset", "dataset_name", "corpus", "source", "subset")
    ).lower()
    return not searchable or "ami" in searchable


def window_metrics(
    row_index: int, row: dict[str, Any], start: float, utterances: list[dict[str, Any]]
) -> Window | None:
    end = start + WINDOW_SECONDS
    included = []
    for utterance in utterances:
        begin = float(utterance["begin_time"])
        finish = float(utterance["end_time"])
        overlap = max(0.0, min(finish, end) - max(begin, start))
        if overlap >= max(0.01, (finish - begin) * 0.5):
            included.append(utterance)
    speaker_ids = {str(item["speaker_id"]) for item in included}
    if len(speaker_ids) not in (3, 4) or len(included) < 10:
        return None

    turns = sum(
        str(left["speaker_id"]) != str(right["speaker_id"])
        for left, right in zip(included, included[1:])
    )
    if turns < 15:
        return None
    overlaps = sum(
        max(0.0, float(left["end_time"]) - float(right["begin_time"]))
        for left, right in zip(included, included[1:])
    )
    lead = max(0.0, float(included[0]["begin_time"]) - start)
    gaps = [lead]
    spoken_until = float(included[0]["end_time"])
    for item in included[1:]:
        gaps.append(float(item["begin_time"]) - spoken_until)
        spoken_until = max(spoken_until, float(item["end_time"]))
    gaps.append(end - spoken_until)
    long_silences = sum(gap for gap in gaps if gap > 3)
    return Window(
        row_index=row_index,
        meeting_id=meeting_id(row, row_index),
        start=start,
        end=end,
        utterances=included,
        speakers=len(speaker_ids),
        turns=turns,
        overlap_seconds=overlaps,
        crosstalk_seconds=crosstalk_seconds(included, start, end),
        long_silence_seconds=long_silences,
        lead_seconds=lead,
        max_gap_seconds=max(gaps),
    )


def crosstalk_seconds(utterances: list[dict[str, Any]], start: float, end: float) -> float:
    events = []
    for item in utterances:
        events.append((max(start, float(item["begin_time"])), 1))
        events.append((min(end, float(item["end_time"])), -1))
    events.sort()
    active, previous, total = 0, start, 0.0
    for time, change in events:
        if active >= 2:
            total += time - previous
        active += change
        previous = time
    return total


def find_candidates(dataset: Dataset) -> list[Window]:
    candidates: list[Window] = []
    for row_index, row in enumerate(dataset):
        if not is_ami(row):
            continue
        utterances = parse_utterances(row.get("utterances_json"))
        if not utterances:
            continue
        meeting_end = max(float(item["end_time"]) for item in utterances)
        starts: list[float] = []
        for item in utterances:
            start = round(max(0.0, float(item["begin_time"]) - 0.5), 1)
            if start + WINDOW_SECONDS <= meeting_end and (not starts or start - starts[-1] >= 5):
                starts.append(start)
        for start in starts:
            candidate = window_metrics(row_index, row, start, utterances)
            if candidate:
                candidates.append(candidate)
    if len(candidates) < 3:
        raise RuntimeError("Could not find three qualifying AMI windows")
    return candidates


def windows_overlap(left: Window, right: Window) -> bool:
    return (
        left.meeting_id == right.meeting_id
        and max(left.start, right.start) < min(left.end, right.end)
    )


# Crosstalk bands as a share of the window: short clips with near-constant overlap are
# untranscribable rather than hard, so each difficulty level is capped.
DIFFICULTY_OVERLAP = {
    "standard": (0.0, 0.12),
    "hard": (0.15, 0.30),
    "expert": (0.30, 0.50),
}
TRACK_LEVELS = ("standard", "hard", "expert", "standard", "hard", "expert")


def choose_windows(candidates: list[Window]) -> tuple[Window, Window, Window, Window, Window, Window]:
    def pool(level: str) -> list[Window]:
        low, high = DIFFICULTY_OVERLAP[level]
        in_band = [
            item
            for item in candidates
            if low * WINDOW_SECONDS <= item.overlap_seconds <= high * WINDOW_SECONDS
        ]
        return sorted(in_band, key=lambda item: item.turn_rate - item.long_silence_seconds, reverse=True)[:250]

    pools = [pool(level) for level in TRACK_LEVELS]

    def select(depth: int, selected: list[Window]) -> list[Window] | None:
        if depth == len(pools):
            return selected
        for candidate in pools[depth]:
            track = selected[depth - depth % 3 :]
            if any(windows_overlap(candidate, chosen) for chosen in selected) or any(
                candidate.meeting_id == chosen.meeting_id for chosen in track
            ):
                continue
            result = select(depth + 1, [*selected, candidate])
            if result:
                return result
        return None

    chosen = select(0, [])
    if not chosen:
        raise RuntimeError("Could not find six non-overlapping AMI windows with distinct meetings per track")
    return tuple(chosen)  # type: ignore[return-value]


def choose_practice(candidates: list[Window], exclude_meetings: list[str]) -> Window:
    eligible = [
        item
        for item in candidates
        if item.lead_seconds <= PRACTICE_MAX_LEAD_SECONDS
        and item.max_gap_seconds <= PRACTICE_MAX_GAP_SECONDS
        and not any(meeting in item.meeting_id for meeting in exclude_meetings)
    ]
    if not eligible:
        raise RuntimeError("No practice window opens on speech without long pauses")
    return min(eligible, key=lambda item: item.crosstalk_seconds + item.long_silence_seconds)


def audio_segment(row: dict[str, Any]) -> AudioSegment:
    audio = row["audio"]
    if isinstance(audio, dict):
        if audio.get("bytes"):
            return AudioSegment.from_file(io.BytesIO(audio["bytes"]), format="wav")
        if audio.get("path"):
            return AudioSegment.from_file(audio["path"])
    if isinstance(audio, str):
        return AudioSegment.from_file(audio)
    if isinstance(audio, dict) and "array" in audio:
        raise RuntimeError("Decoded arrays are unsupported; cast the dataset audio column with decode=False")
    raise RuntimeError("Unrecognized Hugging Face audio value")


def references(window: Window) -> tuple[list[dict[str, Any]], str]:
    speaker_map: dict[str, str] = {}
    output = []
    for item in window.utterances:
        source_speaker = str(item["speaker_id"])
        if source_speaker not in speaker_map:
            speaker_map[source_speaker] = chr(ord("A") + len(speaker_map))
        begin = max(0.0, float(item["begin_time"]) - window.start)
        end = min(WINDOW_SECONDS, float(item["end_time"]) - window.start)
        output.append(
            {
                "speaker": speaker_map[source_speaker],
                "begin_time": round(begin, 3),
                "end_time": round(end, 3),
                "text": str(item["text"]).strip(),
            }
        )
    return output, " ".join(item["text"] for item in output).strip()


def qa_source(utterances: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    rows = [dict(item) for item in utterances]
    errors: list[dict[str, Any]] = []
    if len(rows) < 8:
        raise RuntimeError("QA clip does not contain enough utterances")

    words = rows[1]["text"].split()
    if len(words) > 2:
        removed = words[-1]
        rows[1]["text"] = " ".join(words[:-1])
        errors.append({"type": "omission", "turn": 2, "detail": f"Missing final word: {removed}"})

    original_speaker = rows[3]["speaker"]
    rows[3]["speaker"] = "A" if original_speaker != "A" else "B"
    errors.append({"type": "speaker", "turn": 4, "detail": f"Should be Speaker {original_speaker}"})

    rows[5]["begin_time"] += 12
    errors.append({"type": "timestamp", "turn": 6, "detail": "Timestamp shifted 12 seconds late"})

    rows[6]["text"] = f"um {rows[6]['text']}"
    errors.append({"type": "clean_verbatim", "turn": 7, "detail": "Inserted filler word 'um'"})

    replaced_words = rows[7]["text"].split()
    if replaced_words:
        replaced = replaced_words[len(replaced_words) // 2]
        replaced_words[len(replaced_words) // 2] = "[inaudible]"
        rows[7]["text"] = " ".join(replaced_words)
        errors.append({"type": "false_inaudible", "turn": 8, "detail": f"Replaced clear word: {replaced}"})

    lines = []
    for item in rows:
        seconds = max(0, int(item["begin_time"]))
        timestamp = f"{seconds // 60:02d}:{seconds % 60:02d}"
        lines.append(f"[{timestamp}] Speaker {item['speaker']}: {item['text']}")
    return "\n".join(lines), errors


def export_upload_insert(
    dataset: Dataset,
    window: Window,
    slug: str,
    title: str,
    difficulty: str,
    sort_order: int,
    role: str,
) -> None:
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    supabase = create_client(url, key)
    clip = audio_segment(dataset[window.row_index])
    cut = clip[int(window.start * 1000) : int(window.end * 1000)].set_channels(1)
    utterances, reference_text = references(window)
    source_transcript, error_key = qa_source(utterances) if role == "qa" else (None, None)
    audio_path = f"{slug}.mp3"

    with tempfile.TemporaryDirectory() as directory:
        output = Path(directory) / audio_path
        cut.export(output, format="mp3", bitrate="128k")
        with output.open("rb") as file:
            supabase.storage.from_("trial-audio").upload(
                audio_path,
                file,
                {"content-type": "audio/mpeg", "upsert": "true"},
            )

    supabase.table("trial_clips").upsert(
        {
            "slug": slug,
            "title": title,
            "audio_path": audio_path,
            "duration_seconds": WINDOW_SECONDS,
            "speaker_count": window.speakers,
            "reference_utterances": utterances,
            "reference_text": reference_text,
            "qa_source_transcript": source_transcript,
            "qa_error_key": error_key,
            "difficulty": difficulty,
            "role": role,
            "sort_order": sort_order,
        },
        on_conflict="slug",
    ).execute()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Choose and print windows without uploading")
    parser.add_argument(
        "--practice-only",
        action="store_true",
        help="Replace only the annotator practice clip, leaving scored clips untouched",
    )
    parser.add_argument(
        "--exclude-meeting",
        action="append",
        default=[],
        help="Meeting id the practice clip must not come from (e.g. those used by scored clips)",
    )
    args = parser.parse_args()

    dataset = load_dataset("Trelis/tiron-eval-meetings", split="ami")
    if "audio" not in dataset.column_names:
        raise RuntimeError("Dataset has no audio column")
    dataset = dataset.cast_column("audio", Audio(decode=False))
    if args.practice_only:
        practice = choose_practice(find_candidates(dataset), args.exclude_meeting)
        print(
            f"practice: meeting={practice.meeting_id} window={practice.start:.1f}-{practice.end:.1f}s "
            f"turns={practice.turns} crosstalk={practice.crosstalk_seconds:.1f}s "
            f"lead={practice.lead_seconds:.1f}s longest_pause={practice.max_gap_seconds:.1f}s"
        )
        if not args.dry_run:
            export_upload_insert(dataset, practice, "clip-1", "Practice — Standard", "standard", 1, "annotator")
            print("Uploaded and registered the practice clip.")
        return
    standard, hard, expert, qa_standard, qa_hard, qa_expert = choose_windows(
        find_candidates(dataset)
    )

    selected = (
        ("annotator-standard", standard),
        ("annotator-hard", hard),
        ("annotator-expert", expert),
        ("qa-standard", qa_standard),
        ("qa-hard", qa_hard),
        ("qa-expert", qa_expert),
    )
    for label, window in selected:
        print(
            f"{label}: meeting={window.meeting_id} window={window.start:.1f}-{window.end:.1f}s "
            f"speakers={window.speakers} turns={window.turns} overlap={window.overlap_seconds:.1f}s"
        )
    if args.dry_run:
        return

    export_upload_insert(dataset, standard, "clip-1", "Practice — Standard", "standard", 1, "annotator")
    export_upload_insert(dataset, hard, "clip-2", "Clip 1 — Challenging", "hard", 2, "annotator")
    export_upload_insert(dataset, expert, "clip-3", "Clip 2 — Expert", "hard", 3, "annotator")
    export_upload_insert(dataset, qa_standard, "qa-clip-1", "QA Practice — Standard", "standard", 1, "qa")
    export_upload_insert(dataset, qa_hard, "qa-clip-2", "QA Clip 1 — Challenging", "hard", 2, "qa")
    export_upload_insert(dataset, qa_expert, "qa-clip-3", "QA Clip 2 — Expert", "hard", 3, "qa")
    print("Uploaded and registered three annotator clips and three distinct QA clips.")


if __name__ == "__main__":
    main()
