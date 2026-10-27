"""Create and verify a static Toy ZIP; this script never uploads anything."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo
import hashlib

ROOT = Path(__file__).resolve().parent.parent
FILES = ("index.html", "styles.css", "data.js", "kb.js", "storage.js", "app.js")
MAX_PACKAGE = 50_000_000
MAX_HTML = 1_000_000


def build():
    assets = {name: (ROOT / name).read_bytes() for name in FILES}
    if len(assets["index.html"]) >= MAX_HTML:
        raise ValueError("index.html must be below 1 MB")
    if sum(map(len, assets.values())) >= MAX_PACKAGE:
        raise ValueError("Uncompressed assets must be below 50 MB")
    html = assets["index.html"].decode("utf-8")
    for name in FILES[1:]:
        if f'./{name}' not in html:
            raise ValueError(f"Missing HTML asset reference: {name}")
    output = ROOT / "dist" / "first-car-toy.zip"
    output.parent.mkdir(exist_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for name, content in assets.items():
            entry = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o644 << 16
            archive.writestr(entry, content)
    with ZipFile(output) as archive:
        assert set(archive.namelist()) == set(FILES)
        assert archive.testzip() is None
        for name, content in assets.items():
            assert archive.read(name) == content
    size = output.stat().st_size
    if size >= MAX_PACKAGE:
        raise ValueError("Compressed package must be below 50 MB")
    print(f"Verified package: {output}")
    print(f"ZIP: {size:,} bytes; assets: {sum(map(len, assets.values())):,} bytes")
    print(f"Root index.html: {len(assets['index.html']):,} bytes")
    print(f"SHA-256: {hashlib.sha256(output.read_bytes()).hexdigest()}")
    print("Only static runtime assets included. No source transcript, backups, tests, or dependencies.")
    print("Not published. Authorized SDK/container verification is still required before release.")


if __name__ == "__main__":
    build()
