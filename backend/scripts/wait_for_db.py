import os
import socket
import sys

host = os.environ.get("POSTGRES_SERVER", "")
port = int(os.environ.get("POSTGRES_PORT", 5432))

if not host:
    print("POSTGRES_SERVER not set", flush=True)
    sys.exit(1)

try:
    s = socket.create_connection((host, port), timeout=5)
    s.close()
    print(f"TCP connection to {host}:{port} OK", flush=True)
    sys.exit(0)
except Exception as e:
    print(f"TCP connection to {host}:{port} failed: {e}", flush=True)
    sys.exit(1)
