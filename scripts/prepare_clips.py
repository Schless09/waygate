#!/usr/bin/env python3
"""Select, cut, upload, and register two AMI meeting clips."""

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

WINDOW_SECONDS = 300


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
    long_silence_seconds: float

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
    if len(speaker_ids) not in (3, 4) or len(included) < 20:
        return None

    turns = sum(
        str(left["speaker_id"]) != str(right["speaker_id"])
        for left, right in zip(included, included[1:])
    )
    overlaps = sum(
        max(0.0, float(left["end_time"]) - float(right["begin_time"]))
        for left, right in zip(included, included[1:])
    )
    long_silences = sum(
        gap
        for left, right in zip(included, included[1:])
        if (gap := float(right["begin_time"]) - float(left["end_time"])) > 3
    )
    return Window(
        row_index=row_index,
        meeting_id=meeting_id(row, row_index),
        start=start,
        end=end,
        utterances=included,
        speakers=len(speaker_ids),
        turns=turns,
        overlap_seconds=overlaps,
        long_silence_seconds=long_silences,
    )


def find_candidates(dataset: Dataset) -> list[Window]:
    candidates: list[Window] = []
    for row_index, row in enumerate(dataset):
        if not is_ami(row):
            continue
        utterances = parse_utterances(row.get("utterances_json"))
        if not utterances:
            continue
        meeting_end = max(float(item["end_time"]) for item in utterances)
        for start in range(0, max(1, int(meeting_end - WINDOW_SECONDS) + 1), 15):
            candidate = window_metrics(row_index, row, float(start), utterances)
            if candidate and candidate.long_silence_seconds <= 35:
                candidates.append(candidate)
    if len(candidates) < 2:
        raise RuntimeError("Could not find two qualifying AMI windows")
    return candidates


def choose_windows(candidates: list[Window]) -> tuple[Window, Window]:
    standard = max(
        candidates,
        key=lambda item: item.turn_rate - item.overlap_seconds * 0.8 - item.long_silence_seconds,
    )
    alternatives = [
        item
        for item in candidates
        if item.meeting_id != standard.meeting_id
        or abs(item.start - standard.start) >= WINDOW_SECONDS
    ]
    hard = max(
        alternatives,
        key=lambda item: item.turn_rate * 2 + item.overlap_seconds * 1.5 - item.long_silence_seconds,
    )
    return standard, hard


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


def export_upload_insert(
    dataset: Dataset, window: Window, slug: str, title: str, difficulty: str, sort_order: int
) -> None:
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    supabase = create_client(url, key)
    clip = audio_segment(dataset[window.row_index])
    cut = clip[int(window.start * 1000) : int(window.end * 1000)].set_channels(1)
    utterances, reference_text = references(window)
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

    supabase.table("clips").upsert(
        {
            "slug": slug,
            "title": title,
            "audio_path": audio_path,
            "duration_seconds": WINDOW_SECONDS,
            "speaker_count": window.speakers,
            "reference_utterances": utterances,
            "reference_text": reference_text,
            "difficulty": difficulty,
            "sort_order": sort_order,
        },
        on_conflict="slug",
    ).execute()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Choose and print windows without uploading")
    args = parser.parse_args()

    dataset = load_dataset("Trelis/tiron-eval-meetings", split="train")
    if "audio" not in dataset.column_names:
        raise RuntimeError("Dataset has no audio column")
    dataset = dataset.cast_column("audio", Audio(decode=False))
    standard, hard = choose_windows(find_candidates(dataset))

    for label, window in (("standard", standard), ("hard", hard)):
        print(
            f"{label}: meeting={window.meeting_id} window={window.start:.1f}-{window.end:.1f}s "
            f"speakers={window.speakers} turns={window.turns} overlap={window.overlap_seconds:.1f}s"
        )
    if args.dry_run:
        return

    export_upload_insert(dataset, standard, "clip-1", "Clip 1 — Standard", "standard", 1)
    export_upload_insert(dataset, hard, "clip-2", "Clip 2 — Challenging", "hard", 2)
    print("Uploaded trial-audio/clip-1.mp3 and clip-2.mp3; clip rows upserted.")


if __name__ == "__main__":
    main()
