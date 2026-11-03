#!/usr/bin/env python3
"""Compare unmodified main against GLRD fixes, including exact non-COORDS parity."""
from __future__ import annotations
import argparse
import difflib
import json
import math
from pathlib import Path

def records(path):
    sections = {}
    name = None
    for line in path.read_text().splitlines():
        if line.startswith("#$ "):
            name = line[3:]
            sections[name] = []
        elif name is not None:
            sections[name].append(line)
    return sections

def assert_close(actual, expected, label, tolerance=1e-4):
    assert actual is not None, f"{label}: missing"
    assert len(actual) == len(expected)
    for x, y in zip(actual, expected):
        assert math.isclose(x, y, rel_tol=0, abs_tol=tolerance), f"{label}: {actual} != {expected}"

def run(before, after, out):
    out.mkdir(parents=True, exist_ok=True)
    summary = {"cases": {}}
    expected_10 = [111348.12, 101002.40, -107984.90]
    expected_460 = [111042.13, 101698.73, -108573.75]
    for kind in ("raw", "reviewed"):
        b = json.loads((before / f"{kind}-report.json").read_text())
        a = json.loads((after / f"{kind}-report.json").read_text())
        assert b["enrichedSha256"] == a["enrichedSha256"], f"{kind}: enriched XML drift"
        for key in ("edgeCount", "rigidEdgeCount", "restraintCount", "node460Edges"):
            assert b[key] == a[key], f"{kind}: model drift in {key}"
        before_sections, after_sections = records(before / f"{kind}.cii"), records(after / f"{kind}.cii")
        assert before_sections.keys() == after_sections.keys(), f"{kind}: sections differ"
        for section in before_sections:
            if section == "COORDS":
                continue
            assert before_sections[section] == after_sections[section], f"{kind}: unexpected changes in {section}"
        before_coords, after_coords = b["coords"], a["coords"]
        for node, xyz in before_coords.items():
            assert after_coords.get(node) == xyz, f"{kind}: prior anchor changed/lost node={node}"
        assert_close(after_coords.get("10"), expected_10, f"{kind}: Node 10 coordinate")
        assert a["enrichedNode460"]["Position"] == "111042.13 108573.75 101698.73"
        assert a["enrichedNode10"]["Position"] == "111348.12 107984.90 101002.40"
        expected_mass = 123.974 if kind == "reviewed" else 0
        assert math.isclose(float(a["enrichedNode460"]["Weight"]), expected_mass)
        matches = a["node460Edges"]
        assert len(matches) == 1 and matches[0]["rigidAux"], f"{kind}: Node 460 RIGID edge missing"
        assert_close(list(matches[0]["toPosition"]), [111042.13, 108573.75, 101698.73], f"{kind}: Node 460 parsed position")
        assert math.isclose(matches[0]["rawMassKg"], expected_mass)
        assert math.isclose(matches[0]["ciiMassForceN"], expected_mass * 10)
        enriched_diff = list(difflib.unified_diff(
            (before / f"{kind}-enriched.xml").read_text().splitlines(keepends=True),
            (after / f"{kind}-enriched.xml").read_text().splitlines(keepends=True),
            fromfile=f"main-before/{kind}-enriched.xml", tofile=f"pr-after/{kind}-enriched.xml"))
        cii_diff = list(difflib.unified_diff(
            (before / f"{kind}.cii").read_text().splitlines(keepends=True),
            (after / f"{kind}.cii").read_text().splitlines(keepends=True),
            fromfile=f"main-before/{kind}.cii", tofile=f"pr-after/{kind}.cii"))
        (out / f"{kind}-enriched.diff").write_text("".join(enriched_diff))
        (out / f"{kind}-cii.diff").write_text("".join(cii_diff))
        summary["cases"][kind] = {
            "enrichedXmlIdentical": True,
            "nonCoordsCiiIdentical": True,
            "beforeCoordAnchors": len(before_coords),
            "afterCoordAnchors": len(after_coords),
            "node10BeforeExplicit": before_coords.get("10"),
            "node10AfterExplicit": after_coords.get("10"),
            "node460ExpectedCiiCoordinate": expected_460,
            "node460MassKg": expected_mass,
            "node460CiiWeightN": matches[0]["ciiMassForceN"],
            "ciiDiffLines": len(cii_diff),
        }
    (out / "comparison.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--before", type=Path, required=True)
    parser.add_argument("--after", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    run(args.before, args.after, args.out)
