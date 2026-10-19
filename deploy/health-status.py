#!/usr/bin/env python3
"""Atomic, credential-free operational evidence shared read-only with the web app."""
import datetime
import fcntl
import json
import os
from pathlib import Path
import sys
import tempfile


def record(directory: Path, kind: str, state: str) -> None:
    if kind not in {"backup", "restore"} or state not in {"running", "success", "failed"}:
        raise ValueError("Unsupported health event")
    directory.mkdir(parents=True, exist_ok=True)
    directory.chmod(0o755)
    with (directory / ".status.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        target = directory / "status.json"
        try:
            data = json.loads(target.read_text())
            if not isinstance(data, dict):
                data = {}
        except (OSError, ValueError):
            data = {}
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        previous = data.get(kind, {})
        item = {"state": state, "lastAttempt": now}
        if isinstance(previous, dict) and isinstance(previous.get("lastSuccess"), str):
            item["lastSuccess"] = previous["lastSuccess"]
        if state == "success":
            item["lastSuccess"] = now
        data[kind] = item
        descriptor, temporary = tempfile.mkstemp(prefix=".status-", dir=directory)
        try:
            with os.fdopen(descriptor, "w") as output:
                json.dump(data, output)
                output.flush()
                os.fsync(output.fileno())
            os.chmod(temporary, 0o644)
            os.replace(temporary, target)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)


if __name__ == "__main__":
    record(Path.home() / "auratrade" / "health", sys.argv[1], sys.argv[2])
