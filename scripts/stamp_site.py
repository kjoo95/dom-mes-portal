#!/usr/bin/env python3
"""Replace example.com with the public https origin in SEO files."""
import sys
from pathlib import Path

OLD = "https://example.com"


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: stamp_site.py https://origin [/path]")
    origin = sys.argv[1].rstrip("/")
    root = Path(sys.argv[2] if len(sys.argv) > 2 else ".")
    for name in ("sitemap.xml", "robots.txt", "index.html"):
        path = root / name
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        path.write_text(text.replace(OLD, origin), encoding="utf-8")
    print(f"stamped {origin}")


if __name__ == "__main__":
    main()
