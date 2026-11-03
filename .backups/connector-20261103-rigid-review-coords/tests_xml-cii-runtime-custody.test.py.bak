#!/usr/bin/env python3
from __future__ import annotations

from collections import Counter
from pathlib import Path
from types import SimpleNamespace
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "converters" / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import xml_to_cii2019 as base
import xml_to_cii2019_runtime_custody as runtime
from xml_to_cii2019_bend_radius_policy import apply_bend_radius_policy


def node(number, position, *, od=100.0, component_type="PIPE", endpoint=0, bend_type=None):
    return SimpleNamespace(
        node_number=number,
        position=position,
        outside_diameter=od,
        component_type=component_type,
        endpoint=endpoint,
        bend_type=bend_type,
    )


def edge(left, right):
    return SimpleNamespace(from_node=left, to_node=right)


# Degree-1 engineering node 459 is physically coincident with another retained
# occurrence 1001, so neither occurrence is a true physical open end.
e1 = edge(node(450, (0.0, 0.0, 0.0)), node(459, (10.0, 0.0, 0.0)))
e2 = edge(node(1001, (10.2, 0.0, 0.0)), node(1010, (20.0, 0.0, 0.0)))
degrees = Counter({450: 1, 459: 1, 1001: 1, 1010: 1})
adjusted, suppressed = runtime.topology_aware_open_end_degrees([e1, e2], degrees, tolerance_mm=0.5)
assert adjusted[459] == 2
assert adjusted[1001] == 2
assert adjusted[450] == 1
assert adjusted[1010] == 1
assert {row["nodeNumber"] for row in suppressed} == {459, 1001}

# Outside tolerance, degree-1 nodes remain true open-end candidates.
adjusted_far, suppressed_far = runtime.topology_aware_open_end_degrees(
    [e1, edge(node(1001, (10.6, 0.0, 0.0)), node(1010, (20.0, 0.0, 0.0)))],
    degrees,
    tolerance_mm=0.5,
)
assert adjusted_far[459] == 1
assert not any(row["nodeNumber"] == 459 for row in suppressed_far)

xml = """<?xml version='1.0' encoding='utf-8'?>
<PipeStressExport xmlns='http://aveva.com/pipeStress116.xsd'>
  <Pipe><Branch><Branchname>/B1</Branchname>
    <Node><NodeNumber>10</NodeNumber><Endpoint>0</Endpoint><ComponentType>ELBO</ComponentType><OutsideDiameter>100</OutsideDiameter><BendRadius>75</BendRadius></Node>
    <Node><NodeNumber>20</NodeNumber><Endpoint>0</Endpoint><ComponentType>PIPE</ComponentType><OutsideDiameter>100</OutsideDiameter><BendRadius>0</BendRadius></Node>
  </Branch></Pipe>
</PipeStressExport>
"""
with tempfile.TemporaryDirectory() as td:
    source = Path(td) / "source.xml"
    source.write_text(xml, encoding="utf-8")
    off_path, off_stats = apply_bend_radius_policy(source, {})
    off_text = off_path.read_text(encoding="utf-8")
    assert off_stats["enabled"] is False
    assert "BendRadius" not in off_text

    on_path, on_stats = apply_bend_radius_policy(source, {"bendRadius": {"publishOnePointFiveD": True}})
    on_text = on_path.read_text(encoding="utf-8")
    assert on_stats["enabled"] is True
    assert on_stats["published"] == 1
    assert ">150<" in on_text
    assert on_text.count("BendRadius") == 2  # opening + closing tag for ELBO only

    bad = Path(td) / "bad.xml"
    bad.write_text(xml.replace("<OutsideDiameter>100</OutsideDiameter>", "<OutsideDiameter>0</OutsideDiameter>", 1), encoding="utf-8")
    try:
        apply_bend_radius_policy(bad, {"bendRadius": {"publishOnePointFiveD": True}})
        raise AssertionError("Expected unresolved OD to block 1.5D publication")
    except ValueError as exc:
        assert "BEND_RADIUS_1_5D_OD_UNRESOLVED" in str(exc)

# CII BEND auxiliary field: OFF is zero so CAESAR owns its default; ON is 1.5D.
bend_edge = edge(
    node(10, (0, 0, 0), od=100, component_type="PIPE", endpoint=0),
    node(20, (1, 1, 0), od=100, component_type="ELBO", endpoint=0, bend_type=0),
)
model = SimpleNamespace(bend_edges=[bend_edge])
runtime._PUBLISH_BEND_RADIUS_1_5D = False
assert float(runtime._runtime_bend_payload(model)[0].split()[0]) == 0.0
runtime._PUBLISH_BEND_RADIUS_1_5D = True
assert float(runtime._runtime_bend_payload(model)[0].split()[0]) == 150.0

invocation = (ROOT / "converters" / "xml-cii-2019-standalone" / "invocation-builder.js").read_text(encoding="utf-8")
engine = (ROOT / "converters" / "xml-cii-2019-standalone" / "engine.js").read_text(encoding="utf-8")
assert "xml_to_cii2019_runtime_custody.py" in invocation
assert "xml_to_cii2019_runtime_custody.py" in engine
assert "xml_to_cii2019_bend_radius_policy.py" in engine
print("XML/CII runtime open-end and bend custody checks passed.")
