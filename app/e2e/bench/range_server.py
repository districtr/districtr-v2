#!/usr/bin/env python3
"""Static range server for the map-load benchmark (stdlib only).

Serves a directory over threaded HTTP/1.1 with keep-alive and behaves like the
tileset CDN as far as the app can tell:

- HEAD and GET, Content-Length, ETag, Last-Modified, Accept-Ranges: bytes
- single Range -> 206 with Content-Range
- multiple ranges -> 206 multipart/byteranges (one part per requested range)
- unsatisfiable Range -> 416
- CORS: Access-Control-Allow-Origin: *, OPTIONS preflight allowing Range (any
  requested header is echoed, like S3's AllowedHeaders: *)
- Timing-Allow-Origin: * so Resource Timing reports transferSize
- Content-Range is NOT exposed to JS (Access-Control-Expose-Headers: ETag only),
  matching the CDN

Listens on 127.0.0.1 and ::1 (so `localhost` never waits on a refused family).

    python3 range_server.py --root /path/to/www --port 8020 [--log]
"""

import argparse
import email.utils
import mimetypes
import os
import re
import socket
import sys
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

CHUNK = 1 << 20
RANGE_RE = re.compile(r"^\s*(\d*)\s*-\s*(\d*)\s*$")
mimetypes.add_type("application/vnd.apache.parquet", ".parquet")
mimetypes.add_type("application/vnd.pmtiles", ".pmtiles")
mimetypes.add_type("application/json", ".json")


def parse_ranges(header, size):
    """Return a list of (start, end_inclusive), [] if unsatisfiable, None if invalid."""
    if not header.startswith("bytes="):
        return None
    out = []
    for spec in header[6:].split(","):
        m = RANGE_RE.match(spec)
        if not m:
            return None
        a, b = m.groups()
        if a == "" and b == "":
            return None
        if a == "":  # suffix range
            n = int(b)
            if n == 0:
                continue
            out.append((max(0, size - n), size - 1))
            continue
        start = int(a)
        end = size - 1 if b == "" else min(int(b), size - 1)
        if b != "" and int(b) < start:
            return None
        if start >= size:
            continue
        out.append((start, end))
    return out


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "districtr-bench-range/1.0"
    root = "."
    log_requests = False

    def log_message(self, fmt, *args):
        if self.log_requests:
            extra = " ".join(
                "%s=%s" % (h, self.headers.get(h))
                for h in ("Range", "If-Range", "If-None-Match", "If-Modified-Since")
                if self.headers and self.headers.get(h)
            )
            sys.stderr.write("%s %s %s\n" % (self.log_date_time_string(), fmt % args, extra))

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Expose-Headers", "ETag")
        self.send_header("Timing-Allow-Origin", "*")
        self.send_header("Vary", "Origin")

    def _resolve(self):
        path = unquote(urlsplit(self.path).path)
        full = os.path.realpath(os.path.join(self.root, path.lstrip("/")))
        if not (full == self.root or full.startswith(self.root + os.sep)):
            return None
        return full if os.path.isfile(full) else None

    def _error(self, code, extra=None):
        body = ("%d\n" % code).encode()
        self.send_response(code)
        self._cors()
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        req_headers = self.headers.get("Access-Control-Request-Headers")
        self.send_header("Access-Control-Allow-Headers", req_headers or "Range")
        self.send_header("Access-Control-Max-Age", "3000")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_HEAD(self):
        self._serve(head=True)

    def do_GET(self):
        self._serve(head=False)

    def _copy(self, f, start, length):
        f.seek(start)
        remaining = length
        while remaining > 0:
            buf = f.read(min(CHUNK, remaining))
            if not buf:
                break
            self.wfile.write(buf)
            remaining -= len(buf)

    def _serve(self, head):
        full = self._resolve()
        if full is None:
            return self._error(404)
        st = os.stat(full)
        size = st.st_size
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        etag = '"%x-%x"' % (int(st.st_mtime), size)
        common = {
            "Accept-Ranges": "bytes",
            "ETag": etag,
            "Last-Modified": email.utils.formatdate(st.st_mtime, usegmt=True),
        }
        rh = self.headers.get("Range")
        ranges = parse_ranges(rh, size) if rh else None
        if rh and ranges == []:
            return self._error(416, {"Content-Range": "bytes */%d" % size})
        try:
            with open(full, "rb") as f:
                if not ranges:
                    self.send_response(200)
                    self._cors()
                    for k, v in common.items():
                        self.send_header(k, v)
                    self.send_header("Content-Type", ctype)
                    self.send_header("Content-Length", str(size))
                    self.end_headers()
                    if not head:
                        self._copy(f, 0, size)
                    return
                if len(ranges) == 1:
                    s, e = ranges[0]
                    self.send_response(206)
                    self._cors()
                    for k, v in common.items():
                        self.send_header(k, v)
                    self.send_header("Content-Type", ctype)
                    self.send_header("Content-Range", "bytes %d-%d/%d" % (s, e, size))
                    self.send_header("Content-Length", str(e - s + 1))
                    self.end_headers()
                    if not head:
                        self._copy(f, s, e - s + 1)
                    return
                boundary = uuid.uuid4().hex
                heads = [
                    (
                        "--%s\r\nContent-Type: %s\r\nContent-Range: bytes %d-%d/%d\r\n\r\n"
                        % (boundary, ctype, s, e, size)
                    ).encode()
                    for s, e in ranges
                ]
                tail = ("--%s--\r\n" % boundary).encode()
                total = sum(len(h) + (e - s + 1) + 2 for h, (s, e) in zip(heads, ranges)) + len(tail)
                self.send_response(206)
                self._cors()
                for k, v in common.items():
                    self.send_header(k, v)
                self.send_header("Content-Type", "multipart/byteranges; boundary=%s" % boundary)
                self.send_header("Content-Length", str(total))
                self.end_headers()
                if head:
                    return
                for h, (s, e) in zip(heads, ranges):
                    self.wfile.write(h)
                    self._copy(f, s, e - s + 1)
                    self.wfile.write(b"\r\n")
                self.wfile.write(tail)
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128


class Server6(Server):
    address_family = socket.AF_INET6

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
        super().server_bind()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", required=True)
    ap.add_argument("--port", type=int, default=8020)
    ap.add_argument("--log", action="store_true", help="log every request to stderr")
    args = ap.parse_args()
    Handler.root = os.path.realpath(args.root)
    Handler.log_requests = args.log
    servers = [Server(("127.0.0.1", args.port), Handler)]
    try:
        servers.append(Server6(("::1", args.port), Handler))
    except OSError as e:
        print("ipv6 loopback unavailable: %s" % e, file=sys.stderr)
    for s in servers[1:]:
        threading.Thread(target=s.serve_forever, daemon=True).start()
    print("serving %s on http://localhost:%d" % (Handler.root, args.port), flush=True)
    try:
        servers[0].serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
