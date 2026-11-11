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
    ROOT / "Benchmarks",
    ROOT / "tabs" / "model-converters" / "tests",
    ROOT / "tests" / "fixtures",
    ROOT / "converters" / "scripts",
]


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
    results: set[Path] = set()
    for root in FIXTURE_ROOTS:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() != ".xml":
                continue
            with path.open("rb") as file:
                prefix = file.read(4096)
            # Only PSI116 source documents are inputs to this converter;
            # explicitly exclude InputXML/other unrelated XML schemas.
            if b"<PipeStressExport" in prefix or b"<CleanXML" in prefix:
                results.add(path)
    return sorted(results)


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
        regressions = []
        reported = []
        with tempfile.TemporaryDirectory(prefix="reducer-r1-parity-") as directory:
            temp = Path(directory)
            old_script = temp / "baseline_contract.py"
            old_script.write_bytes(source.stdout)
            new_script = HERE / "xml_to_cii2019_contracted_direction.py"
            for number, fixture in enumerate(fixtures):
                before = temp / f"{number}_before.cii"
                after = temp / f"{number}_after.cii"
                baseline = _run(old_script, fixture, before)
                fixed = _run(new_script, fixture, after)
                base_ok = baseline.returncode == 0 and before.is_file()
                head_ok = fixed.returncode == 0 and after.is_file()
                old_bytes = before.read_bytes() if base_ok else b""
                new_bytes = after.read_bytes() if head_ok else b""
                old_sha = hashlib.sha256(old_bytes).hexdigest() if base_ok else "-"
                new_sha = hashlib.sha256(new_bytes).hexdigest() if head_ok else "-"
                matches = base_ok and head_ok and old_bytes == new_bytes
                label = str(fixture.relative_to(ROOT))
                print(f"R4 fixture={label} base_converts={base_ok} "
                      f"base_bytes={len(old_bytes) if base_ok else '-'} base_sha={old_sha} "
                      f"head_converts={head_ok} "
                      f"head_bytes={len(new_bytes) if head_ok else '-'} "
                      f"head_sha={new_sha} sha_equal={matches if base_ok else 'N/A'}",
                      flush=True)
                reported.append(label)
                if base_ok:
                    successful.append(label)
                    if not matches:
                        regressions.append(
                            f"{label}: base={len(old_bytes)}/{old_sha}, "
                            f"head={len(new_bytes) if head_ok else 'FAILED'}/{new_sha}; "
                            f"head_error={fixed.stderr[-400:]}"
                        )
        self.assertGreater(len(successful), 0, "No baseline-working fixture was tested")
        print(f"R4 counted={len(reported)} base_converts={len(successful)} "
              f"regressions={len(regressions)}")
        self.assertFalse(regressions,
                         "Previously working fixtures drifted:\\n" + "\\n".join(regressions))


if __name__ == "__main__":
    unittest.main()
