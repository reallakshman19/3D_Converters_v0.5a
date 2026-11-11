#!/usr/bin/env python3
"""Opt-in R5 native mutation qualification of the REAL converter.

Execute with XML_CII_R1_MUTANTS=1 python -m unittest
converters/scripts/test_reducer_r1_mutants.py -v

For each case this runs the unmutated converter test GREEN and a temporary
mutated copy RED, with real PSI116 parsing, edge indexing and CII generation.
No product or git files are rewritten by the mutations.
"""
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "xml_to_cii2019_contracted_direction.py"
TEST = HERE / "test_reducer_owner_r1.py"


def _replace_function(source: str, name: str, new_function: str) -> str:
    pattern = rf"(?ms)^def {re.escape(name)}\(.*?(?=^def |^class |^install_component_topology_patch\(\)|\Z)"
    matched = re.search(pattern, source)
    if not matched:
        raise AssertionError(f"Cannot locate {name} for R5 mutant")
    return source[:matched.start()] + new_function.rstrip() + "\n\n\n" + source[matched.end():]


def _runner(source: str, method: str) -> subprocess.CompletedProcess[str]:
    with tempfile.TemporaryDirectory(prefix="xml-cii-reducer-mutant-") as directory:
        temp = Path(directory)
        (temp / SOURCE.name).write_text(source, encoding="utf-8")
        shutil.copy2(TEST, temp / TEST.name)
        env = os.environ.copy()
        env["PYTHONPATH"] = str(temp) + os.pathsep + str(HERE) + os.pathsep + env.get("PYTHONPATH", "")
        return subprocess.run(
            [sys.executable, "-m", "unittest", "-v", f"test_reducer_owner_r1.TestReducerOwnerR1.{method}"],
            cwd=temp, env=env, text=True, capture_output=True, timeout=90,
            check=False,
        )


@unittest.skipUnless(os.environ.get("XML_CII_R1_MUTANTS") == "1",
                     "native R5 mutation qualification is opt-in")
class TestReducerR1ActualMutants(unittest.TestCase):
    def _expect_green_red(self, mutation: str, source: str, method: str) -> None:
        original = SOURCE.read_text(encoding="utf-8")
        green = _runner(original, method)
        self.assertEqual(green.returncode, 0, f"{mutation} baseline not GREEN:\n{green.stderr}")
        red = _runner(source, method)
        self.assertNotEqual(red.returncode, 0,
                            f"{mutation} survived; expected GREEN -> RED:\n{red.stderr}")
        self.assertIn("FAIL", red.stderr, f"{mutation}: expected a behavioral assertion failure")
        print(f"R5 {mutation}: GREEN -> RED ({method})")

    def test_endpoint_one_only_owner(self):
        source = SOURCE.read_text(encoding="utf-8")
        mutant = _replace_function(
            source, "_reducer_owner_node",
            "def _reducer_owner_node(edge: base.Edge) -> base.XmlNode | None:\n"
            "    return edge.from_node if _reducer_edge_occurrence(edge) is not None else None",
        )
        self._expect_green_red(
            "owner always Endpoint 1", mutant,
            "test_nine_reducers_full_python_converter_and_pointer_census",
        )

    def test_approach_edge_chosen(self):
        source = SOURCE.read_text(encoding="utf-8")
        mutant = _replace_function(
            source, "_build_reducer_indices",
            "def _build_reducer_indices(edges: list[base.Edge]) -> tuple[list[base.Edge], dict[int, int]]:\n"
            '    return _build_component_indices(edges, {"REDU"})',
        )
        self._expect_green_red(
            "generic approach-pipe reducer selection", mutant,
            "test_nine_reducers_full_python_converter_and_pointer_census",
        )

    def test_missing_angle_fabricated_as_zero(self):
        source = SOURCE.read_text(encoding="utf-8")
        needle = '''        if occ is None or owner is None or alpha is None:
            ref = occ.component_ref_no if occ is not None else "unpaired"
            raise ValueError(
                f"REDUCERS refusal: component '{ref}' branch '{edge.branch_name}' "
                f"nodes {edge.from_node.node_number}/{edge.to_node.node_number} "
                "has no PSI116 internal reducer owner/AlphaAngle."
            )'''
        self.assertIn(needle, source)
        replacement = '''        if occ is None:
            raise ValueError("REDUCERS missing internal edge")
        if owner is None:
            owner = edge.to_node
        if alpha is None:
            alpha = 0.0'''
        mutant = source.replace(needle, replacement, 1)
        self._expect_green_red(
            "missing AlphaAngle emitted as 0", mutant,
            "test_missing_angle_named_refusal_no_fabricated_zero",
        )


if __name__ == "__main__":
    unittest.main()
