#!/usr/bin/env python3
"""CORS-echo reverse proxy in front of the local backend, for the benchmark (stdlib only).

The backend only allows the docker dev frontend's origin (http://localhost:3000);
the benchmark's prod build runs on another port. This proxy forwards requests to
the backend and answers CORS itself: it echoes the request's Origin with
credentials allowed, answers preflights locally, and adds Timing-Allow-Origin.

Read-only by default: anything other than GET/HEAD/OPTIONS gets a 403 (and is
counted on GET /__bench/blocked), so painting and shattering in the benchmark
never save to the dev database. Pass --allow-writes to forward them.

    python3 api_proxy.py --port 8010 --upstream http://127.0.0.1:8000
"""

import argparse
import http.client
import json
import socket
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
}
SKIP = {"content-length", "vary", "date", "server"}
blocked = []
blocked_lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    upstream = ("127.0.0.1", 8000)
    allow_writes = False
    log_requests = False
    local = threading.local()

    def log_message(self, fmt, *args):
        if self.log_requests:
            sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))

    def _cors(self):
        origin = self.headers.get("Origin")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Vary", "Origin")
        self.send_header("Timing-Allow-Origin", "*")

    def _send(self, code, body, ctype="application/json"):
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers", self.headers.get("Access-Control-Request-Headers") or "*"
        )
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _conn(self):
        c = getattr(self.local, "conn", None)
        if c is None:
            c = http.client.HTTPConnection(*self.upstream, timeout=120)
            self.local.conn = c
        return c

    def _forward(self):
        if self.path == "/__bench/blocked":
            with blocked_lock:
                body = json.dumps(blocked).encode()
            return self._send(200, body)
        if self.path == "/__bench/blocked/reset":
            with blocked_lock:
                blocked.clear()
            return self._send(200, b"[]")
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n) if n else None
        if self.command not in ("GET", "HEAD") and not self.allow_writes:
            with blocked_lock:
                blocked.append({"method": self.command, "path": urlsplit(self.path).path})
            return self._send(403, b'{"detail":"benchmark proxy is read-only"}')
        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP}
        headers["Host"] = "%s:%d" % self.upstream
        for attempt in (0, 1):
            conn = self._conn()
            try:
                conn.request(self.command, self.path, body=body, headers=headers)
                resp = conn.getresponse()
                data = resp.read()
                break
            except (http.client.HTTPException, OSError):
                conn.close()
                self.local.conn = None
                if attempt:
                    return self._send(502, b'{"detail":"upstream error"}')
        self.send_response(resp.status, resp.reason)
        self._cors()
        for k, v in resp.getheaders():
            kl = k.lower()
            if kl in HOP or kl.startswith("access-control-allow-") or kl in SKIP:
                continue
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    do_GET = do_HEAD = do_POST = do_PUT = do_PATCH = do_DELETE = _forward


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
    ap.add_argument("--port", type=int, default=8010)
    ap.add_argument("--upstream", default="http://127.0.0.1:8000")
    ap.add_argument("--allow-writes", action="store_true")
    ap.add_argument("--log", action="store_true")
    args = ap.parse_args()
    u = urlsplit(args.upstream)
    Handler.upstream = (u.hostname, u.port or 80)
    Handler.allow_writes = args.allow_writes
    Handler.log_requests = args.log
    servers = [Server(("127.0.0.1", args.port), Handler)]
    try:
        servers.append(Server6(("::1", args.port), Handler))
    except OSError as e:
        print("ipv6 loopback unavailable: %s" % e, file=sys.stderr)
    for s in servers[1:]:
        threading.Thread(target=s.serve_forever, daemon=True).start()
    mode = "read-write" if args.allow_writes else "read-only"
    print("proxying http://localhost:%d -> %s (%s)" % (args.port, args.upstream, mode), flush=True)
    try:
        servers[0].serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
