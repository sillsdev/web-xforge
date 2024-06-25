import re
import subprocess


def get_latest_tag(tag_prefix: str) -> str:
    """Get the latest tag starting with tag_prefix."""
    result: str = subprocess.check_output(
        ["git", "describe", "--match", f"{tag_prefix}?*", "--abbrev=0"], text=True
    )
    return result.strip()


def increment_production_version(tag: str, release_type: str, tag_prefix: str) -> str:
    """Output the next version number, after tag, for a release_type release."""
    pattern: re.Pattern = re.compile(rf"^{re.escape(tag_prefix)}(\d+)\.(\d+)\.(\d+)$")
    match: re.Match = pattern.match(tag)
    if not match:
        raise ValueError(f"Tag does not match pattern {tag_prefix}1.2.3")

    major, minor, patch = map(int, match.groups())

    if release_type == "major":
        major += 1
        minor = 0
        patch = 0
    elif release_type == "minor":
        minor += 1
        patch = 0
    elif release_type == "patch":
        patch += 1
    else:
        raise ValueError("Invalid release_type value")

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
