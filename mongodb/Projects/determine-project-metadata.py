#!/usr/bin/env python3
"""Transform a subset of PT project Settings.xml items into JSON.
Usage: ./determine-project-metadata.py
or: cat ./determine-project-metadata.py | ssh scriptureforge-qa python3
"""

import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

SEARCH_ROOT = Path("/var/lib/scriptureforge/sync")
GLOB_PATTERN = "**/target/Settings.xml"


def parse_scripture_text(path: Path) -> dict:
    root = ET.parse(path).getroot()
    return {
        "guid": root.findtext("Guid"),
        "name": root.findtext("Name"),
        "fullName": root.findtext("FullName"),
        "visibility": root.findtext("Visibility"),
    }


def main() -> None:
    entries = []
    skipped = []
    for xml_path in sorted(SEARCH_ROOT.glob(GLOB_PATTERN)):
        try:
            entries.append(parse_scripture_text(xml_path))
        except ET.ParseError as exc:
            skipped.append((xml_path, str(exc)))

    print(json.dumps(entries, indent=2))

    for path, err in skipped:
        print(f"Skipped {path}: {err}", file=sys.stderr)


if __name__ == "__main__":
    main()
