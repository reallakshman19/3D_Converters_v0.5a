#!/usr/bin/env python3
"""PERF-TASK2 2.R1: real PSI116 converter REDUCERS output and refusal contracts.

All fixtures here are explicitly SYNTHETIC; the private BM2 enriched XML is
not distributed in the repository. BM2's authoritative nine-row and CII SHA
must be measured separately using the Owner's saved R12 engine input.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import xml_to_cii2019 as base
import xml_to_cii2019_direction as direction
import xml_to_cii2019_patched as patched
import xml_to_cii2019_contracted_direction as contracted


def _node(number: int, kind: str, endpoint: int, ref: str,
          diameter: float, thickness: float, x: float,
          angle: float | None = None) -> str:
    fields = {
        "NodeNumber": str(number),
        "ComponentType": kind,
        "Endpoint": str(endpoint),
        "ComponentRefNo": ref,
        "OutsideDiameter": str(diameter),
        "WallThickness": str(thickness),
        "Position": f"{x} 0 0",
    }
    if angle is not None:
        fields["AlphaAngle"] = str(angle)
    return "<Node>" + "".join(
        f"<{key}>{value}</{key}>" for key, value in fields.items()
    ) + "</Node>"


def _branch(name: str, nodes: list[str]) -> str:
    return (
        f'<Branch Name="{name}"><Branchname>{name}</Branchname>'
        "<MaterialNumber>1</MaterialNumber>"
        + "".join(nodes)
        + "</Branch>"
    )


def _document(branches: list[str]) -> str:
    return (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<PipeStressExport xmlns="http://aveva.com/pipeStress116.xsd">'
        '<Pipe><FullName>/REDUCER-TEST</FullName>'
        + "".join(branches)
        + "</Pipe></PipeStressExport>"
    )


def _synthetic_nine() -> tuple[str, list[tuple[str, tuple[int, int], float, float, float]]]:
    branches = []
    expected = []
    for index in range(1, 10):
        start = index * 1000
        ref = "=SYNTH-REDU" + str(index)
        angle = float(10 + index)
        second_diameter = float(90 + 10 * index)
        second_thickness = round(5.0 + index * 0.45, 2)
        # The arrival pipe has the FIRST port's OD/thickness. Correct D2/T2
        # intentionally differ so copying D1/T1 is caught.
        nodes = [
            _node(start, "PIPE", 2, "=PIPE", 60.3, 3.91, 0),
            _node(start + 10, "REDU", 1, ref, 60.3, 3.91, 100),
            _node(start + 20, "REDU", 2, ref, second_diameter,
                  second_thickness, 200, angle),
            _node(start + 30, "PIPE", 1, "=PIPE", second_diameter,
                  second_thickness, 300),
        ]
        branches.append(_branch(f"/SYNTH/B{index}", nodes))
        expected.append((ref, (start + 10, start + 20), angle,
                         second_diameter, second_thickness))
    return _document(branches), expected


def _model(xml_path: Path) -> base.ConversionModel:
    document = base._parse_xml_document(xml_path)
    support_config = {
        "teeSifTypeMapping": direction.DEFAULT_TEE_SIF_TYPE_MAPPING,
        "defaultTeeSifType": 0,
        "splitCondensedValveFlange": True,
    }
    components = direction._component_type_restraint_specs(document, support_config)
    source = base._build_explicit_restraint_specs(document.branches)
    explicit = direction._merge_spec_maps(components, source, {})
    return patched._build_conversion_model(document, explicit, {}, support_config)


def _run_cli(xml_path: Path, destination: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(HERE / "xml_to_cii2019_contracted_direction.py"),
         "--input", str(xml_path), "--output", str(destination),
         "--coords-mode", "none"],
        text=True, capture_output=True, timeout=60, check=False,
    )


def _section(text: str, name: str) -> list[str]:
    lines = text.splitlines()
    title = f"#$ {name}"
    start = lines.index(title) + 1
    end = next((i for i in range(start, len(lines)) if lines[i].startswith("#$")), len(lines))
    return lines[start:end]


class TestReducerOwnerR1(unittest.TestCase):
    def test_nine_reducers_full_python_converter_and_pointer_census(self):
        """R1/R3/R5: real CLI emits nine distinct internal edges, D2/T2/angle."""
        xml, expected = _synthetic_nine()
        with tempfile.TemporaryDirectory(prefix="reducer-owner-nine-") as directory:
            input_path = Path(directory) / "synthetic_nine.xml"
            output_path = Path(directory) / "synthetic_nine.cii"
            input_path.write_text(xml, encoding="utf-8")
            model = _model(input_path)
            self.assertEqual(len(model.reducer_edges), 9,
                             "a reducer must not be silently dropped or counted twice")
            self.assertEqual(len(model.edge_to_reducer_index), 9)
            for index, (ref, pair, angle, diameter, thickness) in enumerate(expected, start=1):
                edge = model.reducer_edges[index - 1]
                self.assertEqual(
                    (edge.from_node.node_number, edge.to_node.node_number),
                    pair, f"{ref}: never choose upstream approach pipe"
                )
                self.assertEqual(contracted._reducer_owner_node(edge).node_number, pair[1])
                pointer = next(i for i, e in enumerate(model.edges) if e is edge)
                self.assertEqual(model.edge_to_reducer_index[pointer], index)
                approach = next(i for i, e in enumerate(model.edges)
                                if e.to_node.node_number == pair[0]
                                and e.branch_name == edge.branch_name)
                self.assertEqual(model.edge_to_reducer_index.get(approach, 0), 0)
                vals = base._build_reducer_payload(model)[index - 1].split()
                self.assertAlmostEqual(float(vals[0]), diameter)
                self.assertAlmostEqual(float(vals[1]), thickness)
                self.assertAlmostEqual(float(vals[2]), angle)

            process = _run_cli(input_path, output_path)
            self.assertEqual(process.returncode, 0, process.stderr)
            self.assertTrue(output_path.is_file())
            cii = output_path.read_text(encoding="utf-8")
            self.assertEqual(len(_section(cii, "REDUCERS")), 9)
            control = _section(cii, "CONTROL")[0].split()
            self.assertEqual(int(control[4]), 9)
            for row, (_, _, angle, diameter, thickness) in zip(
                _section(cii, "REDUCERS"), expected, strict=True
            ):
                cols = row.split()
                self.assertAlmostEqual(float(cols[0]), diameter)
                self.assertAlmostEqual(float(cols[1]), thickness)
                self.assertAlmostEqual(float(cols[2]), angle)
            actual = output_path.read_bytes()
            self.assertGreater(len(actual), 0)
            self.assertEqual(len(hashlib.sha256(actual).hexdigest()), 64)

    def test_endpoint_one_angle_keeps_second_port_diameter_and_thickness(self):
        """R1/R5: reverse angle carrier must not copy first port's D1/T1."""
        xml = _document([_branch("/SYNTH/REV", [
            _node(10, "PIPE", 2, "=PIPE", 168.3, 8.2, 0),
            _node(20, "REDU", 1, "=REV", 168.3, 8.2, 100, 23.5),
            _node(30, "REDU", 2, "=REV", 114.3, 6.2, 200),
            _node(40, "PIPE", 1, "=PIPE", 114.3, 6.2, 300),
        ])])
        with tempfile.TemporaryDirectory(prefix="reducer-owner-reverse-") as directory:
            path = Path(directory) / "reverse.xml"
            output = Path(directory) / "reverse.cii"
            path.write_text(xml, encoding="utf-8")
            model = _model(path)
            self.assertEqual(len(model.reducer_edges), 1)
            self.assertEqual(contracted._reducer_owner_node(model.reducer_edges[0]).node_number, 20)
            self.assertEqual(
                [float(value) for value in base._build_reducer_payload(model)[0].split()[:3]],
                [114.3, 6.2, 23.5],
            )
            process = _run_cli(path, output)
            self.assertEqual(process.returncode, 0, process.stderr)
            vals = [float(x) for x in _section(output.read_text(), "REDUCERS")[0].split()[:3]]
            self.assertEqual(vals, [114.3, 6.2, 23.5])

    def test_missing_angle_named_refusal_no_fabricated_zero(self):
        """R2/R5: source missing AlphaAngle must be refused with component identity."""
        xml = _document([_branch("/SYNTH/MISSING", [
            _node(100, "PIPE", 2, "=PIPE", 60.3, 3.91, 0),
            _node(110, "REDU", 1, "=MISSING_ALPHA", 60.3, 3.91, 100),
            _node(120, "REDU", 2, "=MISSING_ALPHA", 88.9, 5.49, 200),
        ])])
        with tempfile.TemporaryDirectory(prefix="reducer-owner-missing-") as directory:
            path = Path(directory) / "missing.xml"
            output = Path(directory) / "missing.cii"
            path.write_text(xml, encoding="utf-8")
            model = _model(path)
            self.assertEqual(len(model.reducer_edges), 1,
                             "a no-angle reducer must be refused, not dropped")
            with self.assertRaisesRegex(ValueError, r"REDUCERS refusal:.*=MISSING_ALPHA.*AlphaAngle"):
                base._build_reducer_payload(model)
            process = _run_cli(path, output)
            self.assertNotEqual(process.returncode, 0)
            self.assertIn("=MISSING_ALPHA", process.stderr)
            self.assertIn("AlphaAngle", process.stderr)
            self.assertFalse(output.exists(), "no invalid CII is permitted on refusal")

    def test_no_approach_fallback_when_only_first_port_survives(self):
        """R1/R2/R5: incomplete component refuses instead of choosing arrival pipe."""
        xml = _document([_branch("/SYNTH/BROKEN", [
            _node(100, "PIPE", 2, "=PIPE", 60.3, 3.91, 0),
            _node(110, "REDU", 1, "=INCOMPLETE", 60.3, 3.91, 100, 16.0),
            _node(120, "PIPE", 1, "=PIPE", 88.9, 5.49, 200),
        ])])
        with tempfile.TemporaryDirectory(prefix="reducer-owner-incomplete-") as directory:
            path = Path(directory) / "incomplete.xml"
            output = Path(directory) / "incomplete.cii"
            path.write_text(xml, encoding="utf-8")
            with self.assertRaisesRegex(ValueError, r"REDUCERS refusal:.*=INCOMPLETE.*no internal"):
                _model(path)
            process = _run_cli(path, output)
            self.assertNotEqual(process.returncode, 0)
            self.assertIn("=INCOMPLETE", process.stderr)
            self.assertFalse(output.exists())

    def test_two_reducers_different_angles_no_cross_component_contamination(self):
        """R5: two close REDU components must not swap angle or D2/T2."""
        xml = _document([_branch("/SYNTH/SERIES", [
            _node(1, "PIPE", 1, "=PIPE", 60.3, 3.91, 0),
            _node(2, "REDU", 1, "=A", 60.3, 3.91, 100),
            _node(3, "REDU", 2, "=A", 88.9, 5.49, 200, 12.5),
            _node(4, "REDU", 1, "=B", 88.9, 5.49, 300),
            _node(5, "REDU", 2, "=B", 114.3, 7.11, 400, 29.5),
        ])])
        with tempfile.TemporaryDirectory(prefix="reducer-owner-series-") as directory:
            path = Path(directory) / "series.xml"
            output = Path(directory) / "series.cii"
            path.write_text(xml, encoding="utf-8")
            model = _model(path)
            self.assertEqual(len(model.reducer_edges), 2)
            self.assertEqual(
                [tuple(n.node_number for n in (e.from_node, e.to_node))
                 for e in model.reducer_edges],
                [(2, 3), (4, 5)],
            )
            self.assertEqual(
                [[float(v) for v in row.split()[:3]]
                 for row in base._build_reducer_payload(model)],
                [[88.9, 5.49, 12.5], [114.3, 7.11, 29.5]],
            )
            process = _run_cli(path, output)
            self.assertEqual(process.returncode, 0, process.stderr)
            self.assertEqual(
                [[float(v) for v in row.split()[:3]] for row in
                 _section(output.read_text(), "REDUCERS")],
                [[88.9, 5.49, 12.5], [114.3, 7.11, 29.5]],
            )

    def test_second_port_missing_thickness_not_copied_from_first(self):
        """R5: T2 absent produces zero, not an invented copy of T1."""
        xml = _document([_branch("/SYNTH/T2", [
            _node(10, "PIPE", 2, "=PIPE", 60.3, 3.91, 0),
            _node(20, "REDU", 1, "=T2", 60.3, 8.75, 100),
            _node(30, "REDU", 2, "=T2", 88.9, 0.0, 200, 16.0),
        ])])
        with tempfile.TemporaryDirectory(prefix="reducer-owner-t2-") as directory:
            path = Path(directory) / "t2.xml"
            output = Path(directory) / "t2.cii"
            path.write_text(xml, encoding="utf-8")
            model = _model(path)
            self.assertEqual([float(x) for x in base._build_reducer_payload(model)[0].split()[:3]],
                             [88.9, 0.0, 16.0])
            process = _run_cli(path, output)
            self.assertEqual(process.returncode, 0, process.stderr)
            self.assertEqual(
                [float(x) for x in _section(output.read_text(), "REDUCERS")[0].split()[:3]],
                [88.9, 0.0, 16.0])


    def test_negative_helper_resolves_by_position_not_source_order(self):
        """S1: Endpoint1 -1 follows Endpoint2 in source order, but matches RIGID."""
        xml = _document([_branch("/SYNTH/HELPER", [
            _node(10, "PIPE", 1, "=PIPE", 60.3, 3.91, 0),
            _node(20, "PIPE", 2, "=PIPE", 60.3, 3.91, 100),
            _node(30, "RIGID", 2, "=RIGID", 60.3, 3.91, 300),
            _node(40, "REDU", 2, "=HELPER-PAIR", 88.9, 5.49, 400, 23.81),
            # The nearest source-order positive record is 40 (wrong).
            # Position 300 uniquely matches real rigid node 30 (right).
            _node(-1, "REDU", 1, "=HELPER-PAIR", 60.3, 3.91, 300),
            _node(50, "PIPE", 1, "=PIPE", 88.9, 5.49, 500),
        ])])
        with tempfile.TemporaryDirectory(prefix="reducer-helper-position-") as directory:
            path = Path(directory) / "helper.xml"
            output = Path(directory) / "helper.cii"
            path.write_text(xml, encoding="utf-8")
            model = _model(path)
            self.assertEqual(len(model.reducer_edges), 1)
            edge = model.reducer_edges[0]
            self.assertEqual((edge.from_node.node_number, edge.to_node.node_number), (30, 40))
            self.assertEqual(contracted._reducer_owner_node(edge).node_number, 40)
            selected = next(i for i, e in enumerate(model.edges) if e is edge)
            self.assertEqual(model.edge_to_reducer_index[selected], 1)
            for i, e in enumerate(model.edges):
                if (e.from_node.node_number, e.to_node.node_number) == (20, 30):
                    self.assertEqual(model.edge_to_reducer_index.get(i, 0), 0,
                                     "upstream approach pipe must have no REDUCERS pointer")
            self.assertEqual([float(v) for v in base._build_reducer_payload(model)[0].split()[:3]],
                             [88.9, 5.49, 23.81])
            result = _run_cli(path, output)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(
                [float(v) for v in _section(output.read_text(), "REDUCERS")[0].split()[:3]],
                [88.9, 5.49, 23.81],
                "D2/T2 must be from real positive Endpoint2, never the -1 helper",
            )

    def test_negative_helper_two_coincident_positive_nodes_refuses(self):
        """S1: two same-branch numbered candidates at one position = refusal."""
        xml = _document([_branch("/SYNTH/AMBIG", [
            _node(10, "PIPE", 1, "=PIPE", 60.3, 3.91, 0),
            _node(30, "FLAN", 2, "=FLANGE", 60.3, 3.91, 300),
            _node(31, "RIGID", 1, "=RIGID", 60.3, 3.91, 300.2),
            _node(-1, "REDU", 1, "=AMBIG-PORT", 60.3, 3.91, 300.1),
            _node(40, "REDU", 2, "=AMBIG-PORT", 88.9, 5.49, 400, 14.81),
        ])])
        with tempfile.TemporaryDirectory(prefix="reducer-helper-ambiguous-") as directory:
            path = Path(directory) / "ambiguous.xml"
            output = Path(directory) / "ambiguous.cii"
            path.write_text(xml, encoding="utf-8")
            with self.assertRaisesRegex(ValueError, r"REDUCERS refusal:.*=AMBIG-PORT.*2 same-branch"):
                _model(path)
            result = _run_cli(path, output)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("=AMBIG-PORT", result.stderr)
            self.assertIn("2 same-branch", result.stderr)
            self.assertFalse(output.exists())

    def test_negative_helper_never_uses_coincident_node_from_other_branch(self):
        """S1: same Position elsewhere is not a valid reducer port."""
        xml = _document([
            _branch("/SYNTH/OTHER", [
                _node(90, "PIPE", 1, "=PIPE", 60.3, 3.91, 300),
                _node(91, "PIPE", 2, "=PIPE", 60.3, 3.91, 350),
            ]),
            _branch("/SYNTH/REDU", [
                _node(20, "PIPE", 1, "=PIPE", 60.3, 3.91, 0),
                _node(30, "PIPE", 2, "=PIPE", 60.3, 3.91, 100),
                _node(-1, "REDU", 1, "=FOREIGN", 60.3, 3.91, 300),
                _node(40, "REDU", 2, "=FOREIGN", 88.9, 5.49, 400, 14.81),
            ]),
        ])
        with tempfile.TemporaryDirectory(prefix="reducer-helper-foreign-") as directory:
            path = Path(directory) / "foreign.xml"
            output = Path(directory) / "foreign.cii"
            path.write_text(xml, encoding="utf-8")
            with self.assertRaisesRegex(ValueError, r"REDUCERS refusal:.*=FOREIGN.*0 same-branch"):
                _model(path)
            result = _run_cli(path, output)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("=FOREIGN", result.stderr)
            self.assertIn("0 same-branch", result.stderr)
            self.assertFalse(output.exists())

    def test_helper_euclidean_half_mm_tolerance_and_no_flange_approach(self):
        """S1: one 0.3mm match, a 10mm decoy; flange approach is not reducer."""
        xml = _document([_branch("/SYNTH/TOLERANCE", [
            _node(10, "PIPE", 1, "=PIPE", 60.3, 3.91, 0),
            _node(20, "PIPE", 2, "=PIPE", 60.3, 3.91, 100),
            _node(29, "PIPE", 1, "=DECOY", 60.3, 3.91, 290),
            _node(30, "FLAN", 2, "=FLANGE", 60.3, 3.91, 300.3),
            _node(-1, "REDU", 1, "=TOL-REDU", 60.3, 3.91, 300.0),
            _node(40, "REDU", 2, "=TOL-REDU", 114.3, 6.35, 400, 15.7),
        ])])
        with tempfile.TemporaryDirectory(prefix="reducer-helper-tolerance-") as directory:
            path = Path(directory) / "tolerance.xml"
            output = Path(directory) / "tolerance.cii"
            path.write_text(xml, encoding="utf-8")
            model = _model(path)
            self.assertEqual(len(model.reducer_edges), 1)
            edge = model.reducer_edges[0]
            self.assertEqual((edge.from_node.node_number, edge.to_node.node_number), (30, 40))
            self.assertEqual(
                [float(v) for v in base._build_reducer_payload(model)[0].split()[:3]],
                [114.3, 6.35, 15.7])
            result = _run_cli(path, output)
            self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(os.environ.get("XML_CII_BM2_INPUT"), "private R12 engine XML not supplied")
    def test_private_bm2_nine_reducer_records_and_cli_sha(self):
        """R3: Owner-only enriched engine XML; prints actual nine-row D2/T2/angle table.

        Run with XML_CII_BM2_INPUT=<absolute enriched R12 engine input XML>.
        This optional test does NOT pretend the repo's raw GLRD benchmark is
        the same input as the R12 UI's 687252-byte enriched engine XML.
        """
        path = Path(os.environ["XML_CII_BM2_INPUT"]).resolve()
        self.assertTrue(path.is_file(), f"BM2 engine input missing: {path}")
        input_payload = path.read_bytes()
        input_sha = hashlib.sha256(input_payload).hexdigest()
        print("BM2 supplied XML bytes:", len(input_payload))
        print("BM2 supplied XML sha256:", input_sha)
        self.assertEqual(len(input_payload), 687252, "R12 enriched BM2 XML byte drift")
        self.assertEqual(
            input_sha,
            "5cf2bfbe4cbe88361afcb3374c5230ee4badf42d9f503ec2cb5b2f0b7414e00c",
            "R12 enriched BM2 XML hash drift",
        )
        model = _model(path)
        self.assertEqual(len(model.reducer_edges), 9)
        self.assertEqual(len(model.edge_to_reducer_index), 9)
        rows = base._build_reducer_payload(model)
        self.assertEqual(len(rows), 9)
        observed = []
        for ordinal, (edge, row) in enumerate(zip(model.reducer_edges, rows, strict=True), 1):
            occ = contracted._reducer_edge_occurrence(edge)
            self.assertIsNotNone(occ)
            port1, port2 = edge.from_node, contracted._reducer_second_port(edge)
            owner = contracted._reducer_owner_node(edge)
            self.assertIsNotNone(owner, f"{occ.component_ref_no} missing AlphaAngle")
            alpha = contracted._reducer_taper_angle(owner, edge.branch_name)
            self.assertIsNotNone(alpha)
            vals = [float(x) for x in row.split()[:3]]
            self.assertAlmostEqual(vals[0], port2.outside_diameter, places=3)
            self.assertAlmostEqual(vals[1], max(0.0, port2.wall_thickness), places=3)
            self.assertAlmostEqual(vals[2], alpha, places=3)
            observed.append((occ.component_ref_no,
                             f"{edge.from_node.node_number}->{edge.to_node.node_number}",
                             alpha, port2.outside_diameter, port2.wall_thickness))
            edge_index = next(i for i, e in enumerate(model.edges) if e is edge)
            self.assertEqual(model.edge_to_reducer_index.get(edge_index), ordinal)
        # Seven known first-port cases from Owner's R15 observation.
        known = {
            "=134234934/24704": 540,
            "=134234934/25788": 1010,
            "=134234934/25852": 1470,
            "=134234934/25916": 1930,
            "=134234934/25980": 2400,
            "=134234934/26044": 2870,
            "=134234934/27546": 3470,
        }
        for component_ref, first_number in known.items():
            self.assertTrue(
                any(ref == component_ref and pair.startswith(f"{first_number}->")
                    for ref, pair, *_ in observed),
                f"BM2 reducer {component_ref}, first port {first_number} missing",
            )
        with tempfile.TemporaryDirectory(prefix="reducer-owner-private-bm2-") as directory:
            output = Path(directory) / "bm2_owner_r1.cii"
            completed = _run_cli(path, output)
            self.assertEqual(completed.returncode, 0, completed.stderr)
            cii_rows = _section(output.read_text(encoding="utf-8"), "REDUCERS")
            self.assertEqual(len(cii_rows), 9)
            self.assertEqual(
                [[float(x) for x in line.split()[:3]] for line in cii_rows],
                [[float(x) for x in line.split()[:3]] for line in rows],
            )
            payload = output.read_bytes()
            print("BM2 CII bytes:", len(payload))
            print("BM2 CII sha256:", hashlib.sha256(payload).hexdigest())
            print("BM2 REDUCERS: component | from->to | angle | D2 | T2")
            for record in observed:
                print(" | ".join(map(str, record)))


if __name__ == "__main__":
    unittest.main()
