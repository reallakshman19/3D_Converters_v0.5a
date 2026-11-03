#!/usr/bin/env python3
"""External GLRD reference replay: records exact Python conversion input and CII output."""
from __future__ import annotations
import argparse
import contextlib
import io
import re
import hashlib
import json
import shutil
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "converters" / "scripts"
sys.path.insert(0, str(SCRIPTS))
import xml_to_cii2019 as base
import xml_to_cii2019_runtime_custody as runtime

def local(tag):
    return tag.split("}", 1)[-1]

def child(node, key):
    return next((str(e.text or "").strip() for e in node if local(e.tag) == key), "")

def source_record(path, number):
    root = ET.parse(path).getroot()
    for branch in root.iter():
        if local(branch.tag) != "Branch":
            continue
        for node in branch:
            if local(node.tag) == "Node" and child(node, "NodeNumber") == str(number):
                return {key: child(node, key) for key in
                    ("NodeNumber", "Position", "Weight", "Rigid", "Endpoint",
                     "ComponentType", "ComponentRefNo")} | {"branch": child(branch, "Branchname")}
    raise AssertionError(f"Node {number} not found in {path}")

def reviewed_input(source, dest, mass):
    root = ET.parse(source).getroot()
    for branch in root.iter():
        if local(branch.tag) != "Branch":
            continue
        for node in branch:
            if local(node.tag) != "Node" or child(node, "NodeNumber") != "460":
                continue
            weight = next(e for e in node if local(e.tag) == "Weight")
            assert float(weight.text or 0) == 0, "Expected original Node 460 missing weight"
            weight.text = str(mass)
            ET.ElementTree(root).write(dest, encoding="utf-8", xml_declaration=True)
            return
    raise AssertionError("Node 460 not found for reviewed input")

def read_coords(cii):
    lines = cii.read_text(encoding="utf-8").splitlines()
    index = lines.index("#$ COORDS")
    count = int(lines[index + 1].split()[0])
    rows = {}
    for line in lines[index + 2:index + 2 + count]:
        fields = line.split()
        rows[fields[0]] = [float(value) for value in fields[1:4]]
    assert count == len(rows), "COORDS has duplicate node numbers"
    return rows

def linelist_config(workbook):
    # Read the referenced workbook in place; no fixture rows are committed.
    import re
    from zipfile import ZipFile
    with ZipFile(workbook) as archive:
        strings = ["".join(node.itertext()) for node in
                   ET.fromstring(archive.read("xl/sharedStrings.xml"))]
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet3.xml"))
        ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        rows = []
        for node in sheet.findall(".//m:sheetData/m:row", ns):
            if int(node.attrib.get("r", "0")) < 9:
                continue
            cells = {}
            for cell in node.findall("m:c", ns):
                value = cell.find("m:v", ns)
                if value is None:
                    continue
                col = re.match(r"[A-Z]+", cell.attrib["r"]).group()
                cells[col] = strings[int(value.text)] if cell.attrib.get("t") == "s" else value.text
            service, line_no = cells.get("B", ""), cells.get("C", "")
            if not service or not line_no:
                continue
            rows.append({
                "lineNo": f"{service}{line_no}",
                "Operating Pressure": cells.get("K", ""),
                "Operating Temperature": cells.get("L", ""),
                "Density Gas": cells.get("M", ""),
                "Density Liquid": cells.get("N", ""),
                "Density Mixed": cells.get("O", ""),
                "Design Temp Max": cells.get("Y", ""),
                "Design Temp Min": cells.get("Z", ""),
                "Hydro Test Pressure": cells.get("AF", ""),
                "Insulation Thickness": cells.get("AC", ""),
                "Piping Class": cells.get("V", ""),
                "Size": cells.get("U", ""),
            })
    assert rows, "Line-list workbook has no engineering rows"
    assert any(r["lineNo"] == "B4110011" for r in rows), "Node 460 line missing from line list"
    return {"linelist": {"masterRows": rows, "lineKeyTokenPositions": "4",
            "fieldMap": {"lineSeqNo": "lineNo", "lineNo": "lineNo",
                         "p1": "Operating Pressure", "t1": "Design Temp Max",
                         "t2": "Operating Temperature", "t3": "Design Temp Min",
                         "densityMixed": "Density Mixed",
                         "hydroPressure": "Hydro Test Pressure",
                         "insThk": "Insulation Thickness"}}}


def staged_flange_record(path, ref):
    if path is None or not path.exists() or not path.stat().st_size:
        return None
    root = json.loads(path.read_text(encoding="utf-8-sig"))
    stack = [root]
    while stack:
        item = stack.pop()
        if isinstance(item, list):
            stack.extend(item)
        elif isinstance(item, dict):
            attrs = item.get("attributes")
            if item.get("type") == "FLAN" and isinstance(attrs, dict) and attrs.get("NAME") == ref:
                return {"ref": ref, "dtxr": attrs.get("DTXR", ""), "apos": attrs.get("APOS")}
            stack.extend(v for k, v in item.items() if k == "children")
    raise AssertionError(f"No staged FLAN with ComponentRefNo {ref}")


def run_one(source, target, kind, out, scale, staged, config):
    out.mkdir(parents=True, exist_ok=True)
    input_path = source
    candidateMasses = {"reviewed": 123.974, "master900": 15.0, "master1500": 14.0}
    if kind in candidateMasses:
        input_path = out / f"{kind}-source.xml"
        reviewed_input(source, input_path, candidateMasses[kind])
    cii_path = out / f"{kind}.cii"
    enriched = out / f"{kind}-enriched.xml"
    original_parse = base._parse_xml_document
    original_write = base._build_cii_text
    captured = {}
    def parse_capture(path):
        shutil.copyfile(path, enriched)
        return original_parse(path)
    def write_capture(model, *args, **kwargs):
        matches = []
        for edge in model.edges:
            if edge.to_node.node_number != 460:
                continue
            matches.append({
                "from": edge.from_node.node_number, "to": edge.to_node.node_number,
                "fromPosition": edge.from_node.position, "toPosition": edge.to_node.position,
                "rigidAux": edge in model.rigid_edges,
                "rawMassKg": base._rigid_weight_for_edge(edge),
                "ciiMassForceN": base._rigid_weight_for_edge(edge) * scale,
            })
        captured["node460Edges"] = matches
        captured["edgeCount"] = len(model.edges)
        captured["rigidEdgeCount"] = len(model.rigid_edges)
        captured["restraintCount"] = len(model.restraints)
        return original_write(model, *args, **kwargs)
    base._parse_xml_document = parse_capture
    base._build_cii_text = write_capture
    saved_argv = sys.argv
    sys.argv = ["xml_to_cii2019_runtime_custody.py", "--input", str(input_path),
                "--output", str(cii_path), "--coords-mode", "first",
                "--weight-scale", str(scale), "--split-condensed-valve-flange"]
    if staged is not None and staged.stat().st_size:
        sys.argv.extend(["--staged-json", str(staged)])
    if config:
        sys.argv.extend(["--support-config-json", json.dumps(config)])
    diagnostic_buffer = io.StringIO()
    try:
        with contextlib.redirect_stderr(diagnostic_buffer):
            runtime.main()
    finally:
        sys.argv = saved_argv
        base._parse_xml_document = original_parse
        base._build_cii_text = original_write
    warning_text = diagnostic_buffer.getvalue()
    sys.stderr.write(warning_text)
    captured["skippedRestraintNodeNumbers"] = [
        int(match) for match in re.findall(r"WARNING: Unable to assign restraint for NodeNumber (\d+); restraint skipped", warning_text)
    ]
    captured["stagedFlange460"] = staged_flange_record(staged, "=134234934/27950")
    captured.update({
        "kind": kind,
        "inputSha256": hashlib.sha256(input_path.read_bytes()).hexdigest(),
        "enrichedSha256": hashlib.sha256(enriched.read_bytes()).hexdigest(),
        "ciiSha256": hashlib.sha256(cii_path.read_bytes()).hexdigest(),
        "sourceNode10": source_record(source, 10),
        "sourceNode460": source_record(source, 460),
        "enrichedNode10": source_record(enriched, 10),
        "enrichedNode460": source_record(enriched, 460),
        "coords": read_coords(cii_path),
    })
    (out / f"{kind}-report.json").write_text(json.dumps(captured, indent=2))
    return captured

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--label", default="baseline")
    parser.add_argument("--weight-scale", type=float, default=10)
    parser.add_argument("--staged", type=Path)
    parser.add_argument("--linelist", type=Path)
    args = parser.parse_args()
    folder = args.out / args.label
    config = linelist_config(args.linelist) if args.linelist else {}
    raw = run_one(args.source, folder, "raw", folder, args.weight_scale, args.staged, config)
    reviewed = run_one(args.source, folder, "reviewed", folder, args.weight_scale, args.staged, config)
    if args.label == "pr-after":
        run_one(args.source, folder, "master900", folder, args.weight_scale, args.staged, config)
        run_one(args.source, folder, "master1500", folder, args.weight_scale, args.staged, config)
    summary = {"label": args.label, "raw": {k: raw[k] for k in ("edgeCount", "rigidEdgeCount", "restraintCount")},
               "reviewed": {k: reviewed[k] for k in ("edgeCount", "rigidEdgeCount", "restraintCount")},
               "node10CoordsRaw": raw["coords"].get("10"),
               "node10CoordsReviewed": reviewed["coords"].get("10"),
               "node460Weight": reviewed["node460Edges"],
               "reviewedSourceMassKg": reviewed["enrichedNode460"]["Weight"]}
    (folder / "summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))

if __name__ == "__main__":
    main()
