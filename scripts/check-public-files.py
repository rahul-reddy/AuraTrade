"""Reject private file categories in Git's index without printing their names.

This complements Gitleaks: broker statements and database dumps need not contain
anything that looks like an API key. Synthetic CSV fixtures remain permitted.
"""

import argparse
from pathlib import Path, PurePosixPath
import subprocess
import sys


PRIVATE_SUFFIXES = {
    ".pem", ".key", ".p12", ".pfx", ".jks", ".sqlite", ".sqlite3",
    ".db", ".dump", ".backup",
}
PRIVATE_DIRECTORIES = {"documents", ".local", ".claude", ".codex"}


def is_private_path(name: str) -> bool:
    path = PurePosixPath(name.lower())
    return (
        bool(PRIVATE_DIRECTORIES.intersection(path.parts[:-1]))
        or path.name.startswith(".env")
        or path.name in {"id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"}
        or path.suffix in PRIVATE_SUFFIXES
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--standalone", type=Path, help="Check a built standalone directory instead of Git's index")
    args = parser.parse_args()
    # Read the index, rather than the worktree: ignored local files are expected
    # and must not be inspected or logged. NUL handles spaces/newlines in paths.
    if args.standalone is not None:
        if not args.standalone.is_dir():
            print("Standalone output is missing; cannot verify private-file exclusion.", file=sys.stderr)
            return 1
        paths = [path.relative_to(args.standalone).as_posix() for path in args.standalone.rglob("*") if path.is_file()]
    else:
        result = subprocess.run(
            ["git", "ls-files", "-z"], check=True, capture_output=True,
        )
        paths = result.stdout.decode("utf-8", errors="surrogateescape").split("\0")
    count = sum(is_private_path(path) for path in paths if path)
    if count:
        print(f"Refusing {count} private file(s) in {'standalone output' if args.standalone else 'Git index'}.", file=sys.stderr)
        return 1
    print("Private-file check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
