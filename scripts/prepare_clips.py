#!/usr/bin/env python3
"""Select, cut, upload, and register six AMI meeting clips across two role tracks."""

from __future__ import annotations

import argparse
import io
import json
import os
import random
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from datasets import Audio, Dataset, load_dataset
from pydub import AudioSegment
from supabase import create_client

WINDOW_SECONDS = 150
# Clips are cut inside pauses so every reference line is fully audible and no audible
# speech is missing from the reference; the length flexes around WINDOW_SECONDS to find one.
WINDOW_RANGE_SECONDS = (130.0, 170.0)
EDGE_PADDING_SECONDS = 0.1
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
    def duration(self) -> float:
        return self.end - self.start

    @property
    def turn_rate(self) -> float:
        return self.turns / (self.duration / 60)


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
    row_index: int, row: dict[str, Any], start: float, end: float, utterances: list[dict[str, Any]]
) -> Window | None:
    included = [
        item
        for item in utterances
        if float(item["begin_time"]) >= start and float(item["end_time"]) <= end
    ]
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


def pauses(utterances: list[dict[str, Any]]) -> list[tuple[float, float]]:
    """Intervals where nobody is speaking, long enough to cut inside with padding."""
    silent = []
    spoken_until = 0.0
    for item in utterances:
        begin = float(item["begin_time"])
        if begin - spoken_until >= 2 * EDGE_PADDING_SECONDS:
            silent.append((spoken_until, begin))
        spoken_until = max(spoken_until, float(item["end_time"]))
    return silent


def find_candidates(dataset: Dataset) -> list[Window]:
    candidates: list[Window] = []
    for row_index, row in enumerate(dataset):
        if not is_ami(row):
            continue
        utterances = parse_utterances(row.get("utterances_json"))
        if not utterances:
            continue
        silent = pauses(utterances)
        starts: list[float] = []
        for _, speech_resumes in silent:
            start = round(speech_resumes - EDGE_PADDING_SECONDS, 2)
            if not starts or start - starts[-1] >= 5:
                starts.append(start)
        ends = [round(speech_stops + EDGE_PADDING_SECONDS, 2) for speech_stops, _ in silent]
        for start in starts:
            low, high = start + WINDOW_RANGE_SECONDS[0], start + WINDOW_RANGE_SECONDS[1]
            fits = [end for end in ends if low <= end <= high]
            if not fits:
                continue
            end = min(fits, key=lambda value: abs(value - start - WINDOW_SECONDS))
            candidate = window_metrics(row_index, row, start, end, utterances)
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
            if low * item.duration <= item.overlap_seconds <= high * item.duration
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
        end = float(item["end_time"]) - window.start
        output.append(
            {
                "speaker": speaker_map[source_speaker],
                "begin_time": round(begin, 3),
                "end_time": round(end, 3),
                "text": str(item["text"]).strip(),
            }
        )
    return output, " ".join(item["text"] for item in output).strip()


def qa_source(utterances: list[dict[str, Any]], seed: str) -> tuple[str, list[dict[str, Any]]]:
    rows = [dict(item) for item in utterances]
    errors: list[dict[str, Any]] = []
    if len(rows) < 12:
        raise RuntimeError("QA clip does not contain enough utterances")

    # Placement varies per clip so the practice round doesn't reveal which lines to check.
    rng = random.Random(seed)
    used: set[int] = set()

    def pick(predicate: Any) -> int:
        options = [
            index
            for index in range(1, len(rows) - 1)
            if index not in used and index - 1 not in used and index + 1 not in used and predicate(rows[index])
        ]
        if not options:
            raise RuntimeError("QA clip has no eligible line for a planted error")
        index = rng.choice(options)
        used.add(index)
        return index

    def wordy(row: dict[str, Any]) -> bool:
        return len(row["text"].split()) >= 5

    index = pick(wordy)
    words = rows[index]["text"].split()
    rows[index]["text"] = " ".join(words[:-1])
    errors.append({"type": "omission", "turn": index + 1, "detail": f"Missing final word: {words[-1]}"})

    speakers = sorted({row["speaker"] for row in rows})
    index = pick(lambda row: len(row["text"].split()) >= 3)
    original_speaker = rows[index]["speaker"]
    rows[index]["speaker"] = rng.choice([speaker for speaker in speakers if speaker != original_speaker])
    errors.append({"type": "speaker", "turn": index + 1, "detail": f"Should be Speaker {original_speaker}"})

    index = pick(lambda row: len(row["text"].split()) >= 3)
    rows[index]["begin_time"] += 12
    errors.append({"type": "timestamp", "turn": index + 1, "detail": "Timestamp shifted 12 seconds late"})

    index = pick(lambda row: not row["text"].lower().startswith(("um", "uh")))
    rows[index]["text"] = f"um {rows[index]['text']}"
    errors.append({"type": "clean_verbatim", "turn": index + 1, "detail": "Inserted filler word 'um'"})

    def has_clear_word(row: dict[str, Any]) -> bool:
        return any(len(word.strip(",.?!")) > 3 for word in row["text"].split()[1:-1])

    index = pick(lambda row: wordy(row) and has_clear_word(row))
    replaced_words = rows[index]["text"].split()
    position = rng.choice([i for i in range(1, len(replaced_words) - 1) if len(replaced_words[i].strip(",.?!")) > 3])
    replaced = replaced_words[position].strip(",.?!")
    replaced_words[position] = "[inaudible]" + replaced_words[position][len(replaced_words[position].rstrip(",.?!")) :]
    rows[index]["text"] = " ".join(replaced_words)
    errors.append({"type": "false_inaudible", "turn": index + 1, "detail": f"Replaced clear word: {replaced}"})
    errors.sort(key=lambda error: error["turn"])

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
    source_transcript, error_key = qa_source(utterances, slug) if role == "qa" else (None, None)
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
            "duration_seconds": round(window.duration),
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


def locate_existing(dataset: Dataset, reference: list[dict[str, Any]]) -> tuple[int, float]:
    """Find the meeting row and source offset an already-uploaded clip was cut from."""
    anchors = reference[1:7]
    for row_index, row in enumerate(dataset):
        utterances = parse_utterances(row.get("utterances_json"))
        for item in utterances:
            if str(item["text"]).strip() != anchors[0]["text"]:
                continue
            offset = float(item["begin_time"]) - anchors[0]["begin_time"]
            matched = all(
                any(
                    str(other["text"]).strip() == anchor["text"]
                    and abs(float(other["begin_time"]) - offset - anchor["begin_time"]) < 0.05
                    for other in utterances
                )
                for anchor in anchors[1:]
            )
            if matched:
                return row_index, offset
    raise RuntimeError(f"Could not locate clip starting with {anchors[0]['text']!r}")


def recut_existing(dataset: Dataset, dry_run: bool) -> None:
    """Re-cut every uploaded audio clip at the pauses nearest its current window."""
    supabase = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    clips = (
        supabase.table("trial_clips")
        .select("slug,title,difficulty,sort_order,role,reference_utterances")
        .eq("task_type", "audio")
        .order("role")
        .order("sort_order")
        .execute()
        .data
    )
    candidates = find_candidates(dataset)
    for clip in clips:
        row_index, offset = locate_existing(dataset, clip["reference_utterances"])
        nearby = [item for item in candidates if item.row_index == row_index and abs(item.start - offset) <= 20]
        if not nearby:
            print(f"{clip['slug']}: no clean window within 20s of {offset:.1f}s; skipped (re-pick it instead)")
            continue
        window = min(nearby, key=lambda item: abs(item.start - offset))
        print(
            f"{clip['slug']}: meeting={window.meeting_id} was {offset:.1f}s, now {window.start:.2f}-{window.end:.2f}s "
            f"({window.duration:.1f}s) lines={len(window.utterances)} turns={window.turns} "
            f"crosstalk={window.crosstalk_seconds:.1f}s longest_pause={window.max_gap_seconds:.1f}s"
        )
        if not dry_run:
            export_upload_insert(
                dataset, window, clip["slug"], clip["title"], clip["difficulty"], clip["sort_order"], clip["role"]
            )


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
    parser.add_argument(
        "--recut",
        action="store_true",
        help="Re-cut the uploaded audio clips at clean pauses near their current windows",
    )
    args = parser.parse_args()

    dataset = load_dataset("Trelis/tiron-eval-meetings", split="ami")
    if "audio" not in dataset.column_names:
        raise RuntimeError("Dataset has no audio column")
    dataset = dataset.cast_column("audio", Audio(decode=False))
    if args.recut:
        recut_existing(dataset, args.dry_run)
        return
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
