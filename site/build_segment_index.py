"""Read-only byte index for nominal 30-minute CSV ranges at 50 Hz.

Each range includes enough neighboring samples to draw a 120-second window and
begins/ends at breath starts where possible. The original files are unchanged.
"""
import bisect
import hashlib
import io
import json
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent
SAMPLES_PER_SEGMENT = 90_000
CONTEXT_SAMPLES = 6_000
OVERVIEW_BINS = 2_048
NUMBER = re.compile(rb"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$")
STAMP = re.compile(rb"^\d{4}-\d\d-\d\d-\d\d-\d\d-\d\d\.\d+")


def describe(entry):
    path = SOURCE / entry["name"]
    data = path.read_bytes()
    if len(data) != entry["bytes"]:
        raise ValueError(f"Source byte count changed: {path.name}")
    sample_count = entry["samples"]
    targets = {0, sample_count}
    for core in range(0, sample_count, SAMPLES_PER_SEGMENT):
        targets.add(max(0, core - CONTEXT_SAMPLES))
        targets.add(min(sample_count, core + SAMPLES_PER_SEGMENT + CONTEXT_SAMPLES))
    offsets = {0: 0, sample_count: len(data)}
    starts = []
    low = [math.inf] * OVERVIEW_BINS
    high = [-math.inf] * OVERVIEW_BINS
    count = 0
    stream = io.BytesIO(data)
    while True:
        position = stream.tell()
        raw = stream.readline()
        if not raw:
            break
        line = raw.strip()
        if not line:
            continue
        parts = [part.strip() for part in line.split(b",")]
        if parts[0] == b"BS" or len(parts) > 1 and parts[1] == b"BS":
            starts.append((count, position))
            continue
        if parts[0] == b"BE" or len(parts) > 1 and parts[1] == b"BE":
            continue
        if len(parts) == 1 and STAMP.match(parts[0]):
            continue
        stamped = bool(STAMP.match(parts[0]))
        a = parts[1] if stamped and len(parts) > 1 else parts[0]
        b = parts[2] if stamped and len(parts) > 2 else parts[1] if len(parts) > 1 else b""
        if not NUMBER.fullmatch(a) or not NUMBER.fullmatch(b):
            continue
        if count in targets:
            offsets.setdefault(count, position)
        flow = float(a)
        bucket = min(OVERVIEW_BINS - 1, count * OVERVIEW_BINS // sample_count)
        low[bucket] = min(low[bucket], flow)
        high[bucket] = max(high[bucket], flow)
        count += 1
    if count != sample_count:
        raise ValueError(f"Sample count changed in {path.name}: {count} != {sample_count}")
    if len(starts) != entry["breaths"]:
        raise ValueError(f"BS marker count changed in {path.name}")
    positions = [item[0] for item in starts]
    segments = []
    for core_start in range(0, sample_count, SAMPLES_PER_SEGMENT):
        core_end = min(sample_count, core_start + SAMPLES_PER_SEGMENT)
        start_target = max(0, core_start - CONTEXT_SAMPLES)
        end_target = min(sample_count, core_end + CONTEXT_SAMPLES)
        before = bisect.bisect_right(positions, start_target) - 1
        after = bisect.bisect_left(positions, end_target)
        fetch_start, byte_start = starts[before] if before >= 0 else (start_target, offsets[start_target])
        fetch_end, byte_end = starts[after] if after < len(starts) else (sample_count, len(data))
        if fetch_end < core_end or byte_end <= byte_start:
            raise ValueError(f"Invalid range in {path.name} at {core_start}")
        segments.append({"coreStart": core_start, "coreEnd": core_end,
                         "sampleStart": fetch_start, "sampleEnd": fetch_end,
                         "byteStart": byte_start, "byteEnd": byte_end,
                         "sha256": hashlib.sha256(data[byte_start:byte_end]).hexdigest()})
    valid = [(a, b) for a, b in zip(low, high) if math.isfinite(a)]
    return {"bytes": len(data), "samples": sample_count,
            "sha256": hashlib.sha256(data).hexdigest(),
            "overview": {"lo": [round(v, 2) if math.isfinite(v) else None for v in low],
                         "hi": [round(v, 2) if math.isfinite(v) else None for v in high],
                         "min": min((a for a, _ in valid), default=None),
                         "max": max((b for _, b in valid), default=None)},
            "segments": segments}


def main():
    manifest = json.loads((HERE / "manifest.json").read_text())
    if manifest["sampleRate"] != 50:
        raise ValueError("This index requires the verified 50 Hz source rate")
    feeds = {entry["name"]: describe(entry) for entry in manifest["entries"]}
    index = {"version": 1, "sampleRate": 50, "segmentSamples": SAMPLES_PER_SEGMENT,
             "contextSamples": CONTEXT_SAMPLES,
             "sourceRevision": "32063407e7fffb75d3866d080078d80295de476c",
             "feeds": feeds}
    output = HERE / "segment-index.json"
    output.write_text(json.dumps(index, separators=(",", ":")) + "\n")
    total = sum(segment["byteEnd"] - segment["byteStart"]
                for feed in feeds.values() for segment in feed["segments"][:1])
    print(f"Indexed {len(feeds)} feeds; first ranges total {total:,} bytes; {output.stat().st_size:,} byte index")


if __name__ == "__main__":
    main()
