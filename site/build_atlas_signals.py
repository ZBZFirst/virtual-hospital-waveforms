"""Read source CSVs and build a compact, synchronized atlas display track.

Every fifth original 50 Hz sample is retained as a signed flow/pressure pair.
Each pair uses two bytes on fixed physical scales, never feed percentiles.
Flow is clipped at +/-60 L/min and resolves 60/127 L/min per step;
pressure is clipped at 51 cmH2O and resolves 0.2 cmH2O per step.
Both clipped endpoints already saturate the requested color/MIDI mappings.
Byte 255 marks a missing value. Source CSVs are never changed.
"""

from pathlib import Path
import gzip
import json
import math

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent
STRIDE = 5


def samples(path):
    with path.open(encoding="utf-8", errors="replace") as source:
        for line in source:
            parts = line.strip().split(",")
            if len(parts) not in (2, 3):
                continue
            try:
                flow, pressure = float(parts[-2]), float(parts[-1])
            except ValueError:
                continue
            if not math.isfinite(flow) or not math.isfinite(pressure):
                yield math.nan, math.nan
            else:
                yield flow, pressure


def main():
    manifest = json.loads((HERE / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["sampleRate"] == 50
    count = 0
    with gzip.GzipFile(HERE / "atlas_signals.bin.gz", "wb", compresslevel=6, mtime=0) as output:
        for entry in manifest["entries"]:
            path = SOURCE / entry["name"]
            if path.stat().st_size != entry["bytes"]:
                raise ValueError(f"Source size changed: {path.name}")
            seen = kept = 0
            for flow, pressure in samples(path):
                if seen % STRIDE == 0:
                    if math.isfinite(flow) and math.isfinite(pressure):
                        flow_byte = max(0, min(254, round(max(-60, min(60, flow)) / 60 * 127) + 127))
                        pressure_byte = max(0, min(254, round(max(0, min(50.8, pressure)) * 5)))
                    else:
                        flow_byte = pressure_byte = 255
                    output.write(bytes((flow_byte, pressure_byte)))
                    kept += 1
                seen += 1
            if seen != entry["samples"] or kept != math.ceil(seen / STRIDE):
                raise ValueError(f"Sample count changed: {path.name}")
            count += kept
    print(f"{len(manifest['entries'])} recordings, {count:,} synchronized 10 Hz pairs")


if __name__ == "__main__":
    main()
