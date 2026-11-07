"""BEN/XBEN vs jsonb on single real plans. uv run --with binary-ensemble --with numpy python bench_ben.py vectors.jsonl"""

import json
import os
import sys
import tempfile
import time
import zlib
import numpy as np
from binary_ensemble import (
    BenEncoder,
    BenDecoder,
    encode_ben_to_xben,
    decode_xben_to_ben,
)


def ms(f, reps=7):
    ts = []
    for _ in range(reps):
        t0 = time.perf_counter()
        out = f()
        ts.append((time.perf_counter() - t0) * 1000)
    return sorted(ts)[len(ts) // 2], out


def rle(v):  # ponytail: the core of BEN in numpy, for comparison
    a = np.asarray(v, dtype=np.uint16)
    starts = np.flatnonzero(np.r_[True, a[1:] != a[:-1]])
    lens = np.diff(np.r_[starts, a.size]).astype(np.uint32)
    return a[starts], lens


tmp = tempfile.mkdtemp()
for line in open(sys.argv[1]):
    p = json.loads(line)
    v = p["assignment"]
    ben, xben = os.path.join(tmp, "p.ben"), os.path.join(tmp, "p.xben")

    def enc():
        with BenEncoder(ben, overwrite=True, variant="standard") as e:
            e.write(v)

    enc_ms, _ = ms(enc)
    dec_ms, got = ms(lambda: next(iter(BenDecoder(ben))))
    assert got == v
    xenc_ms, _ = ms(lambda: encode_ben_to_xben(ben, xben, overwrite=True), 3)
    xdec_ms, _ = ms(lambda: decode_xben_to_ben(xben, ben + "2", overwrite=True), 3)
    vals, lens = rle(v)
    rle_zlib = zlib.compress(vals.tobytes() + lens.tobytes(), 6)
    print(
        json.dumps(
            {
                "plan": p["name"],
                "rows": p["rows"],
                "blocks": p["blocks"],
                "runs": int(vals.size),
                "ben_bytes": os.path.getsize(ben),
                "xben_bytes": os.path.getsize(xben),
                "numpy_rle_zlib_bytes": len(rle_zlib),
                "ben_encode_ms": round(enc_ms, 2),
                "ben_decode_ms": round(dec_ms, 2),
                "xben_encode_ms": round(xenc_ms, 1),
                "xben_decode_ms": round(xdec_ms, 1),
            }
        )
    )
