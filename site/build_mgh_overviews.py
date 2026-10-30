"""Build compact full-recording MGH waveform overviews from untouched WFDB files."""
from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
SOURCES = ROOT.parent / "mgh"
OUTPUT = ROOT / "scene3d" / "mgh-overviews"
CHANNELS = ("ECG lead II", "ART", "CVP", "PAP")
BINS = 1200


def header(path: Path):
    lines = path.read_text().splitlines()
    first = lines[0].split()
    count, rate, samples = int(first[1]), int(first[2].split("/")[0]), int(first[3])
    channels = {}
    for index, line in enumerate(lines[1 : count + 1]):
        fields = line.split()
        if fields[1] != "212":
            raise ValueError(f"{path}: unsupported WFDB format {fields[1]}")
        match = re.match(r"([\d.]+)(?:\((-?\d+)\))?", fields[2])
        if not match:
            raise ValueError(f"{path}: invalid gain")
        channels[" ".join(fields[8:]).lower()] = (
            index,
            float(match.group(1)),
            int(match.group(2)) if match.group(2) is not None else int(fields[4]),
        )
    return count, rate, samples, channels


def samples_212(path: Path, count: int, samples: int):
    raw = np.fromfile(path, dtype=np.uint8)
    expected = samples * count * 3 // 2
    if len(raw) < expected:
        raise ValueError(f"{path}: {len(raw)} bytes, expected at least {expected}")
    groups = raw[:expected].reshape(-1, 3).astype(np.int16)
    digital = np.empty(samples * count, dtype=np.int16)
    digital[0::2] = groups[:, 0] | ((groups[:, 1] & 15) << 8)
    digital[1::2] = groups[:, 2] | ((groups[:, 1] >> 4) << 8)
    digital[digital >= 2048] -= 4096
    return digital.reshape(samples, count)


def overview(path: Path):
    count, rate, samples, channels = header(path.with_suffix(".hea"))
    digital = samples_212(path, count, samples)
    edges = np.linspace(0, samples, BINS + 1, dtype=np.int64)
    traces = {}
    for label in CHANNELS:
        info = channels.get(label.lower())
        if info is None:
            traces[label.lower()] = None
            continue
        index, gain, baseline = info
        values = digital[:, index].astype(np.float64)
        missing = values == -2048
        values = (values - baseline) / gain
        values[missing] = np.nan
        bins = []
        for start, end in zip(edges[:-1], edges[1:]):
            valid = values[start:end]
            valid = valid[np.isfinite(valid)]
            bins.append([round(float(valid.min()), 3), round(float(valid.max()), 3)] if valid.size else None)
        traces[label.lower()] = bins
    return {"id": path.stem, "rate": rate, "samples": samples, "bins": BINS, "channels": traces}


def main():
    OUTPUT.mkdir(exist_ok=True)
    files = sorted(SOURCES.glob("mgh*.dat"))
    if len(files) != 24:
        raise ValueError(f"Expected 24 MGH recordings; found {len(files)}")
    for path in files:
        target = OUTPUT / f"{path.stem}.json"
        target.write_text(json.dumps(overview(path), separators=(",", ":")) + "\n")
        print(f"{target.relative_to(ROOT)}: {target.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
