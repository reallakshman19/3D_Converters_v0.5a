#!/usr/bin/env python3
"""Zero/invalid/positive and emitted byte-level RIGID ledger regression."""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "converters" / "scripts"
sys.path.insert(0, str(SCRIPTS))
import xml_to_cii2019 as base
from xml_to_cii2019_rigid_ledger import build_rigid_emission_ledger


def source(raw_first: str = "0", raw_second: str = "15") -> str:
    def weight(raw: str) -> str:
        return "" if raw == "MISSING" else f"<Weight>{raw}</Weight>"
    return f"""<PipeStressExport><Pipe><Branch><Branchname>BR-LEDGER</Branchname>
    <Node><NodeNumber>930</NodeNumber><Position>0 0 0</Position><ComponentType>PIPE</ComponentType><Weight>0</Weight></Node>
    <Node><NodeNumber>939</NodeNumber><Position>89.9 0 0</Position><ComponentType>RIGID</ComponentType><Rigid>2</Rigid><Endpoint>1</Endpoint><ComponentRefNo>=REF-LEDGER</ComponentRefNo>{weight(raw_first)}</Node>
    <Node><NodeNumber>10020</NodeNumber><Position>109 0 0</Position><ComponentType>RIGID</ComponentType><Rigid>2</Rigid><Endpoint>2</Endpoint><ComponentRefNo>=REF-LEDGER</ComponentRefNo>{weight(raw_second)}</Node>
    </Branch></Pipe></PipeStressExport>"""


def convert(raw_first: str, raw_second: str) -> tuple[dict, str]:
    with tempfile.TemporaryDirectory() as tmp:
        xml = Path(tmp) / "case.xml"
        xml.write_text(source(raw_first, raw_second))
        doc = base._parse_xml_document(xml)
        model = base._build_conversion_model(doc)
        assert len(model.rigid_edges) == 2, len(model.rigid_edges)
        cii = base._build_cii_text(model, "first", base.DEFAULT_VERSION_LINE, 10)
        ledger = build_rigid_emission_ledger(model, cii, 10, xml)
        assert ledger["preparedXmlSha256"]
        assert ledger["ciiSha256"]
        assert len(ledger["rows"]) == 2
        assert [row["rigidAuxIndex"] for row in ledger["rows"]] == [1, 2]
        assert [row["edgeIndex"] for row in ledger["rows"]] == [1, 2]
        assert [row["toNode"] for row in ledger["rows"]] == [939, 10020]
        assert [row["toNodeOccurrence"] for row in ledger["rows"]] == [1, 2]
        assert [row["branchOccurrence"] for row in ledger["rows"]] == [0, 0]
        assert [row["componentRefNo"] for row in ledger["rows"]] == ["=REF-LEDGER"] * 2
        assert abs(ledger["rows"][1]["elementLengthMm"] - 19.1) < 1e-8
        assert ledger["rows"][1]["emittedCiiMass"] == 150
        tampered = cii.replace("#$ RIGID\n", "#$ RIGID\n", 1).replace(
            "        150.000", "        999.000", 1
        )
        assert tampered != cii
        try:
            build_rigid_emission_ledger(model, tampered, 10, xml)
        except ValueError as error:
            assert "differs from Python owner" in str(error), error
        else:
            raise AssertionError("Mutated CII RIGID auxiliary was accepted")
        return ledger, cii


if __name__ == "__main__":
    normal, _ = convert("0", "15")
    assert [row["weightState"] for row in normal["rows"]] == ["ZERO", "POSITIVE"]
    assert normal["summary"]["zeroCount"] == 1
    assert normal["summary"]["totalMassKg"] == 15
    assert normal["summary"]["totalEmittedCiiMass"] == 150
    missing, _ = convert("MISSING", "15")
    assert [row["weightState"] for row in missing["rows"]] == ["MISSING", "POSITIVE"]
    invalid, _ = convert("not-a-number", "15")
    assert invalid["rows"][0]["weightState"] == "INVALID"
    negative, _ = convert("-3", "15")
    assert negative["rows"][0]["weightState"] == "NEGATIVE"
    print("RIGID_PYTHON_EMITTED_AUX_LEDGER_PASS", json.dumps(normal["summary"]))
