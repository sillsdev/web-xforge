#!/usr/bin/env python3
"""Read a JSON array of {guid, name, fullName, visibility} objects from stdin,
annotate each with reasonIsTest, and print either the full details (--details) or just
the guids of flagged entries (--values).
Usage: cat project-metadata.json | ./annotate-test-project-reasons.py --values
or: cat ./determine-project-metadata.py | ssh scriptureforge-qa python3 | ./annotate-test-project-reasons.py --values
"""

import argparse
import json
import re
import sys

TEST_NAME_PATTERN = re.compile(
    r'(?i:(?<![a-zA-Z])test(?!ament|amento|aman\b|ment)\w*)'
    r'|(?<=[a-z])T[Ee][Ss][Tt](?i:(?!ament|amento|aman\b|ment))\w*'
)


def compute_reason_is_test(visibility: str | None, full_name: str | None) -> str | None:
    full_name = full_name or ""
    reasons = []

    if visibility == "Test":
        # Mark a project as a test project if its project Visibility is "Test".
        reasons.append("projectSetting")
    if TEST_NAME_PATTERN.search(full_name):
        # Mark a project as a test project if it says something like "Test" in the project name.
        #
        # Match things like
        # - AI Test Project
        # - Back translation for zzTEST
        # Don't match things like
        # - New Testament Revised Edition
        # - Nuevo Testamento
        #
        # The regex was made while considering the first 84 of the 417 production projects containing
        # case-insensitive "test" in their name.
        # Branch A (standard case): (?i:(?<![a-zA-Z])test(?!ament|amento|aman\b|ment)\w*) — "test" at a true word boundary, case-insensitive, not followed by a Testament-like continuation. This is for Test, TEST, Testing, test.
        # Branch B (glued/camelCase): (?<=[a-z])T[Ee][Ss][Tt](?i:(?!ament|amento|aman\b|ment))\w* — a capital T immediately preceded by a lowercase letter, with no space (so no \b). The capital T itself is the signal that a new "word" is starting inside the string (zzTESTAB, FooBazTest), rather than an ordinary lowercase blend like attest (where the t stays lowercase and Branch B never triggers).
        reasons.append("testName")
    if "demo" in full_name.casefold():
        # Mark a project as a test project if it has case-insensitive "demo" in the name.
        reasons.append("demoName")
    if "sample" in full_name.casefold():
        # Mark a project as a test project if it has case-insensitive "sample" in the name.
        reasons.append("sampleName")

    return ",".join(reasons) if reasons else None


def annotate(entry: dict) -> dict:
    reason_is_test = compute_reason_is_test(entry.get("visibility"), entry.get("fullName"))
    if reason_is_test is not None:
        entry["reasonIsTest"] = reason_is_test
    return entry


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Annotate project entries with reasonIsTest."
    )
    output_mode = parser.add_mutually_exclusive_group(required=True)
    output_mode.add_argument(
        "--details", action="store_true", help="Print all entries as JSON"
    )
    output_mode.add_argument(
        "--values",
        action="store_true",
        help="Print newline-delimited guids of entries with a non-null reasonIsTest",
    )
    args = parser.parse_args()

    entries = [annotate(entry) for entry in json.load(sys.stdin)]

    if args.details:
        print(json.dumps(entries, indent=2))
    else:
        for entry in entries:
            if entry.get("reasonIsTest") is not None:
                print(entry["guid"])


if __name__ == "__main__":
    main()
