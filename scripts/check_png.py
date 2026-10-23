"""Refuse anything but a well-formed PNG of sane size.

The shots workflow's propose job runs this over screenshots that came from a job which
ran third-party code, before they are committed and later decoded by the build. Only
the standard library, so the privileged job still installs nothing.
"""

import struct
import sys
import zlib

MAX_BYTES = 5 * 1024 * 1024
MAX_SIDE = 4096
SIGNATURE = b"\x89PNG\r\n\x1a\n"


def check(path: str) -> str | None:
    data = open(path, "rb").read()
    if len(data) > MAX_BYTES:
        return f"larger than {MAX_BYTES} bytes"
    if not data.startswith(SIGNATURE):
        return "no PNG signature"
    pos, chunks = len(SIGNATURE), []
    while pos < len(data):
        if pos + 12 > len(data):
            return "truncated chunk"
        length, kind = struct.unpack(">I4s", data[pos : pos + 8])
        body = data[pos + 8 : pos + 8 + length]
        if len(body) != length or pos + 12 + length > len(data):
            return f"chunk {kind!r} runs past the end"
        (crc,) = struct.unpack(">I", data[pos + 8 + length : pos + 12 + length])
        if zlib.crc32(kind + body) != crc:
            return f"bad CRC in {kind!r}"
        chunks.append((kind, body))
        pos += 12 + length
        if kind == b"IEND":
            break
    if pos != len(data):
        return "data after IEND"
    if not chunks or chunks[0][0] != b"IHDR" or chunks[-1][0] != b"IEND":
        return "IHDR must come first and IEND last"
    width, height = struct.unpack(">II", chunks[0][1][:8])
    if not (0 < width <= MAX_SIDE and 0 < height <= MAX_SIDE):
        return f"{width}x{height} is out of range"
    return None


failed = False
for path in sys.argv[1:]:
    problem = check(path)
    if problem:
        failed = True
        print(f"::error file={path}::{problem}")
sys.exit(1 if failed else 0)
