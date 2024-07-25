import argparse
import re
import subprocess


def get_latest_tag(tag_prefix: str) -> str:
    """Get the latest tag starting with tag_prefix."""
    result: str = subprocess.check_output(
        ["git", "describe", "--match", f"{tag_prefix}?*", "--abbrev=0"], text=True
    )
    return result.strip()


def increment_production_version(tag: str, release_level: str, tag_prefix: str) -> str:
    """Output the next version number, after tag, for a release_level release."""
    pattern: re.Pattern = re.compile(rf"^{re.escape(tag_prefix)}(\d+)\.(\d+)\.(\d+)$")
    match: re.Match = pattern.match(tag)
    if not match:
        raise ValueError(f"Tag does not match pattern {tag_prefix}1.2.3")

    major, minor, patch = map(int, match.groups())

    if release_level == "major":
        major += 1
        minor = 0
        patch = 0
    elif release_level == "minor":
        minor += 1
        patch = 0
    elif release_level == "patch":
        patch += 1
    else:
        raise ValueError("Invalid release_level value")

    return f"{major}.{minor}.{patch}"


def increment_staging_version(tag: str, tag_prefix: str) -> str:
    """Output the next version number after tag."""
    pattern: re.Pattern = re.compile(rf"^{re.escape(tag_prefix)}(\d+)$")
    match: re.Match = pattern.match(tag)
    if not match:
        raise ValueError(f"Tag does not match pattern {tag_prefix}123")

    patch: int = int(match.groups()[0])
    patch += 1

    return f"{patch}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--versioning-system", required=True)
    parser.add_argument("--release-level", required=False)
    parser.add_argument("--tag-prefix", required=True)
    args = parser.parse_args()

    latest_tag = get_latest_tag(args.tag_prefix)

    if args.versioning_system == "production":
        if not args.release_level:
            raise ValueError(
                "Release level is required for production versioning system"
            )
        next_version = increment_production_version(
            latest_tag, args.release_level, args.tag_prefix
        )
    elif args.versioning_system == "staging":
        next_version = increment_staging_version(latest_tag, args.tag_prefix)
    else:
        raise ValueError("Invalid versioning system")

    print(next_version)


if __name__ == "__main__":
    main()
