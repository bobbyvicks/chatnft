"""sha256 of the reference's INPUT for every oracle image, one JSON line each.

The reference's modes/one.py feeds detect() np.array(Image.open(p).convert("RGBA")).
This prints the sha256 of exactly those bytes (C order, h*w*4 uint8), so
tools/test-oracle-full.cjs --decode can prove tools/oracle/decode-png.cjs
hands the JS detector the same pixels - before any detector result is read.

Run with the reference interpreter:
  pafenv2/Scripts/python.exe tools/oracle/py-decode-hash.py <modes.jsonl> > tools/oracle/py-decode-hash.jsonl
"""
import hashlib
import json
import sys

import numpy as np
from PIL import Image

for line in open(sys.argv[1], encoding="utf-8"):
    path = json.loads(line)["path"]
    a = np.ascontiguousarray(np.array(Image.open(path).convert("RGBA")))
    assert a.dtype == np.uint8 and a.ndim == 3 and a.shape[2] == 4, (path, a.dtype, a.shape)
    print(json.dumps({"path": path, "w": int(a.shape[1]), "h": int(a.shape[0]),
                      "sha256": hashlib.sha256(a.tobytes()).hexdigest()}), flush=True)
