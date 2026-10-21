"""Exercise the index guard using actual Git repositories and ignored files."""

from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "check-public-files.py"


class PublicFileTests(unittest.TestCase):
    def check_paths(self, tracked: list[str], ignored: list[str] | None = None):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "--quiet", directory], check=True)
            for name in tracked + (ignored or []):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("synthetic", encoding="utf-8")
            for name in tracked:
                subprocess.run(["git", "add", "--", name], cwd=root, check=True)
            return subprocess.run(
                [sys.executable, str(SCRIPT)], cwd=root,
                capture_output=True, text=True, check=False,
            )

    def test_synthetic_fixtures_and_source_are_allowed(self):
        result = self.check_paths(["playwright/fixtures/synthetic.csv", "src/app/page.tsx"])
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_untracked_local_configuration_is_not_read(self):
        result = self.check_paths(["README.md"], [".env.local", "documents/private.csv"])
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_private_categories_are_rejected_without_disclosing_names(self):
        for name in [
            "documents/private statement.csv", "nested/Documents/private.csv",
            ".env.production", "nested/.env", "keys/client.PEM", "keys/id_ed25519",
            "backup.sql.dump", "data.sqlite3", ".local/report.json",
        ]:
            with self.subTest(name=name):
                result = self.check_paths([name])
                self.assertEqual(result.returncode, 1)
                self.assertNotIn(name, result.stdout + result.stderr)

    def test_standalone_bundle_must_exist(self):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--standalone", str(Path(directory) / "missing")],
                capture_output=True, text=True, check=False,
            )
            self.assertEqual(result.returncode, 1)

    def test_standalone_bundle_rejects_private_files(self):
        for name in ["nested/.env.local", ".git/config", "documents/private.csv"]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / "server.js").write_text("// synthetic", encoding="utf-8")
                command = [sys.executable, str(SCRIPT), "--standalone", directory]
                clean = subprocess.run(command, capture_output=True, text=True, check=False)
                self.assertEqual(clean.returncode, 0, clean.stderr)
                private = root / name
                private.parent.mkdir()
                private.write_text("SYNTHETIC=1", encoding="utf-8")
                unsafe = subprocess.run(command, capture_output=True, text=True, check=False)
                self.assertEqual(unsafe.returncode, 1)
                self.assertNotIn(str(private), unsafe.stdout + unsafe.stderr)


if __name__ == "__main__":
    unittest.main()
