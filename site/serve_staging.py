"""Local static server with byte ranges for the original PhysioNet recordings."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import re

ROOT = Path(__file__).resolve().parent.parent

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format, *args):
        # Six active monitors issue frequent small byte-range requests.
        # Keep the local terminal usable while the scene runs.
        if self.headers.get("Range"):
            return
        super().log_message(format, *args)

    def send_head(self):
        path = Path(self.translate_path(self.path))
        self.range = None
        if path.is_file() and (match := re.fullmatch(r"bytes=(\d+)-(\d+)", self.headers.get("Range", ""))):
            size = path.stat().st_size
            start, end = map(int, match.groups())
            if start >= size or end < start:
                self.send_error(416, "Range Not Satisfiable")
                return None
            end = min(end, size - 1)
            self.range = (start, end)
            self.send_response(206)
            self.send_header("Content-Type", self.guess_type(str(path)))
            self.send_header("Content-Length", str(end - start + 1))
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.send_header("Accept-Ranges", "bytes")
            self.end_headers()
            file = path.open("rb")
            file.seek(start)
            return file
        return super().send_head()

    def copyfile(self, source, outputfile):
        if self.range is None:
            return super().copyfile(source, outputfile)
        remaining = self.range[1] - self.range[0] + 1
        while remaining:
            chunk = source.read(min(65536, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)

if __name__ == "__main__":
    port = int(os.environ.get("WARD_PORT", "8767"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Open http://127.0.0.1:{port}/full_catalog_release_candidate/", flush=True)
    server.serve_forever()
