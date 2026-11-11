#!/usr/bin/env python3
"""Optional R4 converter fixture parity against the exact 1.R17 base SHA.

Run in a FULL git checkout with:
  XML_CII_R1_PARITY=1 python -m unittest converters/scripts/test_reducer_r1_fixture_parity.py -v

Only fixtures which successfully produce CII at the base are parity-gated.
All byte/SHA rows are emitted at runtime; no guessed fixture hash is embedded.
The raw GLRD benchmark (negative helper REDU ports) is intentionally included
to expose any conflict between strict internal-edge qualification and historic
approach-edge output. It must not be silently excluded from the audit.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
BASE = "566efc33e463846dc71193c4ad5e86140e6e5b78"
SCRIPT = "converters/scripts/xml_to_cii2019_contracted_direction.py"
FIXTURE_ROOTS = [
    ROOT / "Benchmarks" / "XML to CII 2019",
    ROOT / "Benchmarks" / "INPUT XML to CII 2019",
    ROOT / "tabs" / "model-converters" / "tests" / "fixtures",
]
EXTRA = [ROOT / "Benchmarks" / "LAUNCHERTOPO.XML"]


def _run(script: Path, xml: Path, output: Path) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(HERE) + os.pathsep + env.get("PYTHONPATH", "")
    return subprocess.run(
        [sys.executable, str(script), "--input", str(xml), "--output", str(output),
         "--coords-mode", "none"],
        cwd=ROOT, env=env, capture_output=True, text=True,
        timeout=120, check=False,
    )


def _fixtures() -> list[Path]:
    results = set(EXTRA)
    for root in FIXTURE_ROOTS:
        if root.exists():
            results.update(path for path in root.rglob("*")
                           if path.is_file() and path.suffix.lower() == ".xml")
    return sorted(path for path in results if path.is_file())


@unittest.skipUnless(os.environ.get("XML_CII_R1_PARITY") == "1",
                     "R4 native parity audit requires explicit opt-in and full git history")
class TestRealConverterFixtureParity(unittest.TestCase):
    def test_every_baseline_converting_checked_in_fixture_is_byte_identical(self):
        source = subprocess.run(
            ["git", "show", f"{BASE}:{SCRIPT}"],
            cwd=ROOT, capture_output=True, check=False,
        )
        self.assertEqual(source.returncode, 0,
                         "Full git history is required for R4 before/after comparison")
        fixtures = _fixtures()
        self.assertGreater(len(fixtures), 0)
        successful = []
        with tempfile.TemporaryDirectory(prefix="reducer-r1-parity-") as directory:
            temp = Path(directory)
            old_script = temp / "baseline_contract.py"
            old_script.write_bytes(source.stdout)
            new_script = HERE / "xml_to_cii2019_contracted_direction.py"
            for number, fixture in enumerate(fixtures):
                before = temp / f"{number}_before.cii"
                after = temp / f"{number}_after.cii"
                baseline = _run(old_script, fixture, before)
                if baseline.returncode != 0:
                    print("R4 baseline not converting:", fixture.relative_to(ROOT),
                          baseline.stderr[-160:].replace("\n", " "))
                    continue
                self.assertTrue(before.is_file())
                fixed = _run(new_script, fixture, after)
                self.assertEqual(
                    fixed.returncode, 0,
                    f"New R1 converter failed on baseline-working fixture: "
                    f"{fixture.relative_to(ROOT)}\n{fixed.stderr}",
                )
                first = before.read_bytes()
                second = after.read_bytes()
                first_sha = hashlib.sha256(first).hexdigest()
                second_sha = hashlib.sha256(second).hexdigest()
                print(f"R4 fixture={fixture.relative_to(ROOT)} "
                      f"before={len(first)}:{first_sha} "
                      f"after={len(second)}:{second_sha}")
                self.assertEqual(
                    first, second,
                    f"Converter fixture byte drift: {fixture.relative_to(ROOT)}",
                )
                successful.append(str(fixture.relative_to(ROOT)))
        self.assertGreater(len(successful), 0, "No baseline-working fixture was tested")
        print("R4 byte-identical fixtures:", len(successful))


if __name__ == "__main__":
    unittest.main()
