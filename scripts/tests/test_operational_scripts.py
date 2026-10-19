"""Run with Python on Linux; all Docker calls are stubs in disposable temp dirs."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class OperationalScripts(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.home = Path(self.temporary.name)
        self.base = self.home / "auratrade"
        (self.base / "bin").mkdir(parents=True)
        (self.base / "backups").mkdir()
        shutil.copy(ROOT / "deploy/health-status.py", self.base / "bin/health-status.py")
        self.log = self.home / "calls"
        docker = self.base / "bin/docker"
        docker.write_text('''#!/bin/sh
printf '%s\\n' "$*" >> "$CALL_LOG"
case "$*" in
  inspect*) [ "${FAIL_INSPECT:-0}" = 0 ] && echo true; exit 0 ;;
  *createdb*) [ "${FAIL_CREATE:-0}" = 0 ]; exit $? ;;
  *pg_restore*) cat >/dev/null; if [ "${FAIL_RESTORE:-0}" != 0 ]; then echo 'synthetic-private-restore-row' >&2; exit 1; fi; exit 0 ;;
  *pg_dump*) printf 'synthetic dump'; if [ "${FAIL_DUMP:-0}" != 0 ]; then echo 'synthetic-private-dump-row' >&2; exit 1; fi; exit 0 ;;
esac
exit 0
''')
        docker.chmod(0o700)
        self.env = {**os.environ, "HOME": str(self.home), "PATH": f"{self.base / 'bin'}:{os.environ['PATH']}", "CALL_LOG": str(self.log)}

    def tearDown(self):
        self.temporary.cleanup()

    def run_script(self, script, *args, **overrides):
        return subprocess.run(["sh", str(ROOT / "deploy" / script), *args], env={**self.env, **overrides}, capture_output=True, text=True)

    def status(self):
        return json.loads((self.base / "health/status.json").read_text())

    def test_backup_failure_is_not_success_and_partial_is_removed(self):
        result = self.run_script("backup.sh", "daily", FAIL_DUMP="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.status()["backup"]["state"], "failed")
        self.assertEqual(list((self.base / "backups").iterdir()), [])
        self.assertNotIn("synthetic-private-dump-row", result.stdout + result.stderr)

    def test_backup_requires_running_database_and_rejects_path_labels(self):
        self.assertNotEqual(self.run_script("backup.sh", "daily", FAIL_INSPECT="1").returncode, 0)
        self.assertEqual(self.status()["backup"]["state"], "failed")
        self.assertNotEqual(self.run_script("backup.sh", "pre-../../escape").returncode, 0)

    def test_backup_success_records_evidence(self):
        self.assertEqual(self.run_script("backup.sh", "daily").returncode, 0)
        self.assertEqual(self.status()["backup"]["state"], "success")
        self.assertEqual(len(list((self.base / "backups").glob("*.dump"))), 1)

    def test_restore_drops_only_database_created_by_this_invocation(self):
        (self.base / "backups/auratrade-20261018T120000Z-daily.dump").write_text("synthetic")
        result = self.run_script("restore-check.sh")
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.log.read_text().splitlines()
        created = next(line.split()[-1] for line in calls if "createdb" in line)
        dropped = next(line.split()[-1] for line in calls if "dropdb" in line)
        self.assertTrue(created.startswith("auratrade_restore_check_"))
        self.assertEqual(created, dropped)
        self.assertEqual(self.status()["restore"]["state"], "success")

    def test_failed_create_never_drops_an_existing_database(self):
        (self.base / "backups/auratrade-20261018T120000Z-daily.dump").write_text("synthetic")
        self.assertNotEqual(self.run_script("restore-check.sh", FAIL_CREATE="1").returncode, 0)
        self.assertNotIn("dropdb", self.log.read_text())
        self.assertEqual(self.status()["restore"]["state"], "failed")

    def test_failed_restore_cleans_up_and_stays_failed(self):
        (self.base / "backups/auratrade-20261018T120000Z-daily.dump").write_text("synthetic")
        result = self.run_script("restore-check.sh", FAIL_RESTORE="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("synthetic-private-restore-row", result.stdout + result.stderr)
        self.assertIn("dropdb -U auratrade auratrade_restore_check_", self.log.read_text())
        self.assertEqual(self.status()["restore"]["state"], "failed")

    def test_missing_backup_is_not_restore_proof(self):
        self.assertNotEqual(self.run_script("restore-check.sh").returncode, 0)
        self.assertFalse(self.log.exists())
        self.assertEqual(self.status()["restore"]["state"], "failed")

    def test_atomic_health_preserves_last_success_across_failure(self):
        spec = importlib.util.spec_from_file_location("health", ROOT / "deploy/health-status.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        directory = self.base / "health"
        module.record(directory, "backup", "success")
        success = self.status()["backup"]["lastSuccess"]
        module.record(directory, "restore", "success")
        module.record(directory, "backup", "failed")
        self.assertEqual(self.status()["backup"]["lastSuccess"], success)
        self.assertEqual(self.status()["restore"]["state"], "success")
        self.assertEqual((directory / "status.json").stat().st_mode & 0o777, 0o644)
        with self.assertRaises(ValueError):
            module.record(directory, "unrecognized", "success")


if __name__ == "__main__":
    unittest.main()
