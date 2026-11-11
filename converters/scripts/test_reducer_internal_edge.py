#!/usr/bin/env python3
"""Comprehensive regression and qualification tests for REDUCER internal edge selection.

Ported from v0.4 commit d40a6db (internal-edge R1.4) for PERF-TASK2 2.R1:

1. test_reducer_internal_edge_selected_over_approach_edge: Approach edge vs internal edge.
2. test_multiple_reducers: Multiple reducers in series with distinct occurrences.
3. test_reversed_orientation_reducer: Reducer with reversed endpoint orientation.
4. test_shared_catalog_references: Two physical reducers sharing one ComponentRefNo.
5. test_missing_alpha_angle_fails_closed: Missing taper angle fails closed (ValueError).
6. test_unaffected_components_preserved: Verifies BEND, SIF, and RIGID are untouched.
"""
import unittest
from pathlib import Path
import sys

REPO_SCRIPTS = Path(__file__).resolve().parent
if str(REPO_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(REPO_SCRIPTS))

import xml_to_cii2019 as base
import xml_to_cii2019_direction as direction
import xml_to_cii2019_patched as patched
import xml_to_cii2019_contracted_direction as cdir


class TestReducerInternalEdgeQualification(unittest.TestCase):
    def setUp(self):
        self.tmp_files = []

    def tearDown(self):
        for f in self.tmp_files:
            if f.exists():
                f.unlink()

    def _create_xml(self, content: str, name: str = "temp_test.xml") -> Path:
        p = REPO_SCRIPTS / name
        p.write_text(content, encoding="utf-8")
        self.tmp_files.append(p)
        return p

    def _build_model(self, xml_path: Path) -> base.ConversionModel:
        document = base._parse_xml_document(xml_path)
        support_config = {
            "teeSifTypeMapping": direction.DEFAULT_TEE_SIF_TYPE_MAPPING,
            "defaultTeeSifType": 0,
            "splitCondensedValveFlange": True
        }
        component_specs = direction._component_type_restraint_specs(document, support_config)
        xml_specs = base._build_explicit_restraint_specs(document.branches)
        explicit_specs = direction._merge_spec_maps(component_specs, xml_specs, {})
        return patched._build_conversion_model(
            document,
            explicit_specs,
            {},
            support_config
        )

    def test_reducer_internal_edge_selected_over_approach_edge(self):
        """Case 1: Standard approach elbow -> reducer -> departure pipe."""
        xml = """<?xml version="1.0" encoding="utf-8"?>
<PipeStressExport xmlns="http://aveva.com/pipeStress116.xsd">
  <Pipe>
    <FullName>/PIPE1</FullName>
    <Branch Name="/B1">
      <Branchname>/B1</Branchname>
      <MaterialNumber>1</MaterialNumber>
      <Node>
        <NodeNumber>530</NodeNumber>
        <ComponentType>ELBO</ComponentType>
        <Endpoint>1</Endpoint>
        <ComponentRefNo>=ELB_1</ComponentRefNo>
        <OutsideDiameter>60.3</OutsideDiameter>
        <WallThickness>3.91</WallThickness>
        <Position>0 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>540</NodeNumber>
        <ComponentType>REDU</ComponentType>
        <Endpoint>1</Endpoint>
        <ComponentRefNo>=RED_1</ComponentRefNo>
        <OutsideDiameter>60.3</OutsideDiameter>
        <WallThickness>3.91</WallThickness>
        <Position>100 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>550</NodeNumber>
        <ComponentType>REDU</ComponentType>
        <Endpoint>2</Endpoint>
        <ComponentRefNo>=RED_1</ComponentRefNo>
        <OutsideDiameter>88.9</OutsideDiameter>
        <WallThickness>5.49</WallThickness>
        <AlphaAngle>14.81</AlphaAngle>
        <Position>200 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>560</NodeNumber>
        <ComponentType>PIPE</ComponentType>
        <Endpoint>2</Endpoint>
        <OutsideDiameter>88.9</OutsideDiameter>
        <WallThickness>5.49</WallThickness>
        <Position>300 0 0</Position>
      </Node>
    </Branch>
  </Pipe>
</PipeStressExport>"""
        p = self._create_xml(xml, "test_case1.xml")
        model = self._build_model(p)

        self.assertEqual(len(model.reducer_edges), 1)
        sel = model.reducer_edges[0]
        self.assertEqual((sel.from_node.node_number, sel.to_node.node_number), (540, 550))

        # Check edge pointers
        approach_idx = [i for i, e in enumerate(model.edges) if e.from_node.node_number == 530 and e.to_node.node_number == 540][0]
        internal_idx = [i for i, e in enumerate(model.edges) if e.from_node.node_number == 540 and e.to_node.node_number == 550][0]
        self.assertEqual(model.edge_to_reducer_index.get(approach_idx, 0), 0)
        self.assertEqual(model.edge_to_reducer_index.get(internal_idx, 0), 1)

        payload = base._build_reducer_payload(model)
        self.assertEqual(len(payload), 1)
        row = payload[0].split()
        self.assertAlmostEqual(float(row[0]), 88.9, places=2)
        self.assertAlmostEqual(float(row[2]), 14.81, places=2)

    def test_multiple_reducers_in_same_branch(self):
        """Case 2: Multiple reducers in series in the same branch."""
        xml = """<?xml version="1.0" encoding="utf-8"?>
<PipeStressExport xmlns="http://aveva.com/pipeStress116.xsd">
  <Pipe>
    <FullName>/PIPE2</FullName>
    <Branch Name="/B1">
      <Branchname>/B1</Branchname>
      <MaterialNumber>1</MaterialNumber>
      <Node>
        <NodeNumber>10</NodeNumber>
        <ComponentType>PIPE</ComponentType>
        <Endpoint>1</Endpoint>
        <OutsideDiameter>60.3</OutsideDiameter>
        <WallThickness>3.91</WallThickness>
        <Position>0 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>20</NodeNumber>
        <ComponentType>REDU</ComponentType>
        <Endpoint>1</Endpoint>
        <ComponentRefNo>=RED_A</ComponentRefNo>
        <OutsideDiameter>60.3</OutsideDiameter>
        <WallThickness>3.91</WallThickness>
        <Position>100 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>30</NodeNumber>
        <ComponentType>REDU</ComponentType>
        <Endpoint>2</Endpoint>
        <ComponentRefNo>=RED_A</ComponentRefNo>
        <OutsideDiameter>88.9</OutsideDiameter>
        <WallThickness>5.49</WallThickness>
        <AlphaAngle>15.0</AlphaAngle>
        <Position>200 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>40</NodeNumber>
        <ComponentType>PIPE</ComponentType>
        <Endpoint>1</Endpoint>
        <OutsideDiameter>88.9</OutsideDiameter>
        <WallThickness>5.49</WallThickness>
        <Position>300 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>50</NodeNumber>
        <ComponentType>REDU</ComponentType>
        <Endpoint>1</Endpoint>
        <ComponentRefNo>=RED_B</ComponentRefNo>
        <OutsideDiameter>88.9</OutsideDiameter>
        <WallThickness>5.49</WallThickness>
        <Position>400 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>60</NodeNumber>
        <ComponentType>REDU</ComponentType>
        <Endpoint>2</Endpoint>
        <ComponentRefNo>=RED_B</ComponentRefNo>
        <OutsideDiameter>114.3</OutsideDiameter>
        <WallThickness>6.02</WallThickness>
        <AlphaAngle>20.0</AlphaAngle>
        <Position>500 0 0</Position>
      </Node>
    </Branch>
  </Pipe>
</PipeStressExport>"""
        p = self._create_xml(xml, "test_case2.xml")
        model = self._build_model(p)

        self.assertEqual(len(model.reducer_edges), 2)
        sel1 = model.reducer_edges[0]
        sel2 = model.reducer_edges[1]
        self.assertEqual((sel1.from_node.node_number, sel1.to_node.node_number), (20, 30))
        self.assertEqual((sel2.from_node.node_number, sel2.to_node.node_number), (50, 60))

        payload = base._build_reducer_payload(model)
        self.assertEqual(len(payload), 2)
        row1 = payload[0].split()
        row2 = payload[1].split()
        self.assertAlmostEqual(float(row1[0]), 88.9, places=2)
        self.assertAlmostEqual(float(row1[2]), 15.0, places=2)
        self.assertAlmostEqual(float(row2[0]), 114.3, places=2)
        self.assertAlmostEqual(float(row2[2]), 20.0, places=2)

    def test_reversed_orientation_reducer(self):
        """Case 3: Reducer with reversed orientation (from_node carries alpha angle)."""
        xml = """<?xml version="1.0" encoding="utf-8"?>
<PipeStressExport xmlns="http://aveva.com/pipeStress116.xsd">
  <Pipe>
    <FullName>/PIPE3</FullName>
    <Branch Name="/B1">
      <Branchname>/B1</Branchname>
      <MaterialNumber>1</MaterialNumber>
      <Node>
        <NodeNumber>100</NodeNumber>
        <ComponentType>PIPE</ComponentType>
        <Endpoint>1</Endpoint>
        <OutsideDiameter>114.3</OutsideDiameter>
        <WallThickness>6.02</WallThickness>
        <Position>0 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>110</NodeNumber>
        <ComponentType>REDU</ComponentType>
        <Endpoint>1</Endpoint>
        <ComponentRefNo>=RED_REV</ComponentRefNo>
        <OutsideDiameter>114.3</OutsideDiameter>
        <WallThickness>6.02</WallThickness>
        <AlphaAngle>18.5</AlphaAngle>
        <Position>100 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>120</NodeNumber>
        <ComponentType>REDU</ComponentType>
        <Endpoint>2</Endpoint>
        <ComponentRefNo>=RED_REV</ComponentRefNo>
        <OutsideDiameter>60.3</OutsideDiameter>
        <WallThickness>3.91</WallThickness>
        <Position>200 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>130</NodeNumber>
        <ComponentType>PIPE</ComponentType>
        <Endpoint>2</Endpoint>
        <OutsideDiameter>60.3</OutsideDiameter>
        <WallThickness>3.91</WallThickness>
        <Position>300 0 0</Position>
      </Node>
    </Branch>
  </Pipe>
</PipeStressExport>"""
        p = self._create_xml(xml, "test_case3.xml")
        model = self._build_model(p)

        self.assertEqual(len(model.reducer_edges), 1)
        sel = model.reducer_edges[0]
        self.assertEqual((sel.from_node.node_number, sel.to_node.node_number), (110, 120))
        payload = base._build_reducer_payload(model)
        self.assertEqual(len(payload), 1)
        row = payload[0].split()
        self.assertAlmostEqual(float(row[2]), 18.5, places=2)

    def test_shared_catalog_references_distinct_reducers(self):
        """Case 4: Two distinct physical reducers sharing one catalog part number."""
        xml = """<?xml version="1.0" encoding="utf-8"?>
<PipeStressExport xmlns="http://aveva.com/pipeStress116.xsd">
  <Pipe>
    <FullName>/PIPE4</FullName>
    <Branch Name="/B1">
      <Branchname>/B1</Branchname>
      <MaterialNumber>1</MaterialNumber>
      <Node>
        <NodeNumber>200</NodeNumber>
        <ComponentType>PIPE</ComponentType>
        <Endpoint>1</Endpoint>
        <OutsideDiameter>60.3</OutsideDiameter>
        <WallThickness>3.91</WallThickness>
        <Position>0 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>210</NodeNumber>
        <ComponentType>REDU</ComponentType>
        <Endpoint>1</Endpoint>
        <ComponentRefNo>=CATALOG_REDU_PART_X</ComponentRefNo>
        <OutsideDiameter>60.3</OutsideDiameter>
        <WallThickness>3.91</WallThickness>
        <Position>100 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>220</NodeNumber>
        <ComponentType>REDU</ComponentType>
        <Endpoint>2</Endpoint>
        <ComponentRefNo>=CATALOG_REDU_PART_X</ComponentRefNo>
        <OutsideDiameter>88.9</OutsideDiameter>
        <WallThickness>5.49</WallThickness>
        <AlphaAngle>15.0</AlphaAngle>
        <Position>200 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>230</NodeNumber>
        <ComponentType>PIPE</ComponentType>
        <Endpoint>1</Endpoint>
        <OutsideDiameter>88.9</OutsideDiameter>
        <WallThickness>5.49</WallThickness>
        <Position>300 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>240</NodeNumber>
        <ComponentType>REDU</ComponentType>
        <Endpoint>1</Endpoint>
        <ComponentRefNo>=CATALOG_REDU_PART_X</ComponentRefNo>
        <OutsideDiameter>60.3</OutsideDiameter>
        <WallThickness>3.91</WallThickness>
        <Position>400 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>250</NodeNumber>
        <ComponentType>REDU</ComponentType>
        <Endpoint>2</Endpoint>
        <ComponentRefNo>=CATALOG_REDU_PART_X</ComponentRefNo>
        <OutsideDiameter>88.9</OutsideDiameter>
        <WallThickness>5.49</WallThickness>
        <AlphaAngle>15.0</AlphaAngle>
        <Position>500 0 0</Position>
      </Node>
    </Branch>
  </Pipe>
</PipeStressExport>"""
        p = self._create_xml(xml, "test_case4.xml")
        model = self._build_model(p)

        self.assertEqual(len(model.reducer_edges), 2)
        self.assertEqual((model.reducer_edges[0].from_node.node_number, model.reducer_edges[0].to_node.node_number), (210, 220))
        self.assertEqual((model.reducer_edges[1].from_node.node_number, model.reducer_edges[1].to_node.node_number), (240, 250))

    def test_missing_alpha_angle_fails_closed(self):
        """Case 5: Reducer with completely missing AlphaAngle must fail closed."""
        xml = """<?xml version="1.0" encoding="utf-8"?>
<PipeStressExport xmlns="http://aveva.com/pipeStress116.xsd">
  <Pipe>
    <FullName>/PIPE5</FullName>
    <Branch Name="/B1">
      <Branchname>/B1</Branchname>
      <MaterialNumber>1</MaterialNumber>
      <Node>
        <NodeNumber>300</NodeNumber>
        <ComponentType>PIPE</ComponentType>
        <Endpoint>1</Endpoint>
        <OutsideDiameter>60.3</OutsideDiameter>
        <WallThickness>3.91</WallThickness>
        <Position>0 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>310</NodeNumber>
        <ComponentType>REDU</ComponentType>
        <Endpoint>1</Endpoint>
        <ComponentRefNo>=RED_NO_ANGLE</ComponentRefNo>
        <OutsideDiameter>60.3</OutsideDiameter>
        <WallThickness>3.91</WallThickness>
        <Position>100 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>320</NodeNumber>
        <ComponentType>REDU</ComponentType>
        <Endpoint>2</Endpoint>
        <ComponentRefNo>=RED_NO_ANGLE</ComponentRefNo>
        <OutsideDiameter>88.9</OutsideDiameter>
        <WallThickness>5.49</WallThickness>
        <Position>200 0 0</Position>
      </Node>
    </Branch>
  </Pipe>
</PipeStressExport>"""
        p = self._create_xml(xml, "test_case5.xml")
        model = self._build_model(p)
        # Building payload must raise ValueError because angle is absent (no invented angles)
        with self.assertRaises(ValueError) as ctx:
            base._build_reducer_payload(model)
        self.assertIn("AlphaAngle", str(ctx.exception))

    def test_unaffected_components_preserved(self):
        """Case 6: BENDs, SIFs, and RIGIDs are preserved alongside reducers."""
        xml = """<?xml version="1.0" encoding="utf-8"?>
<PipeStressExport xmlns="http://aveva.com/pipeStress116.xsd">
  <Pipe>
    <FullName>/PIPE6</FullName>
    <Branch Name="/B1">
      <Branchname>/B1</Branchname>
      <MaterialNumber>1</MaterialNumber>
      <Node>
        <NodeNumber>400</NodeNumber>
        <ComponentType>ELBO</ComponentType>
        <Endpoint>1</Endpoint>
        <ComponentRefNo>=ELB_6</ComponentRefNo>
        <OutsideDiameter>60.3</OutsideDiameter>
        <WallThickness>3.91</WallThickness>
        <Position>0 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>410</NodeNumber>
        <ComponentType>TEE</ComponentType>
        <Endpoint>1</Endpoint>
        <ComponentRefNo>=TEE_6</ComponentRefNo>
        <OutsideDiameter>60.3</OutsideDiameter>
        <WallThickness>3.91</WallThickness>
        <Position>100 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>420</NodeNumber>
        <ComponentType>FLAN</ComponentType>
        <Endpoint>1</Endpoint>
        <Rigid>2</Rigid>
        <ComponentRefNo>=VALVE_6</ComponentRefNo>
        <OutsideDiameter>60.3</OutsideDiameter>
        <WallThickness>3.91</WallThickness>
        <Weight>15.0</Weight>
        <Position>200 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>430</NodeNumber>
        <ComponentType>RIGID</ComponentType>
        <Endpoint>2</Endpoint>
        <Rigid>2</Rigid>
        <ComponentRefNo>=VALVE_6</ComponentRefNo>
        <OutsideDiameter>60.3</OutsideDiameter>
        <WallThickness>3.91</WallThickness>
        <Position>300 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>440</NodeNumber>
        <ComponentType>REDU</ComponentType>
        <Endpoint>1</Endpoint>
        <ComponentRefNo>=RED_6</ComponentRefNo>
        <OutsideDiameter>60.3</OutsideDiameter>
        <WallThickness>3.91</WallThickness>
        <Position>400 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>450</NodeNumber>
        <ComponentType>REDU</ComponentType>
        <Endpoint>2</Endpoint>
        <ComponentRefNo>=RED_6</ComponentRefNo>
        <OutsideDiameter>88.9</OutsideDiameter>
        <WallThickness>5.49</WallThickness>
        <AlphaAngle>16.2</AlphaAngle>
        <Position>500 0 0</Position>
      </Node>
    </Branch>
  </Pipe>
</PipeStressExport>"""
        p = self._create_xml(xml, "test_case6.xml")
        model = self._build_model(p)

        # 1 bend edge, 1 SIF edge, 1 reducer edge
        self.assertEqual(len(model.bend_edges), 1, "Bend edge must be preserved")
        self.assertEqual(len(model.sif_edges), 1, "SIF edge must be preserved")
        self.assertEqual(len(model.reducer_edges), 1, "Reducer edge must be preserved")
        self.assertEqual((model.reducer_edges[0].from_node.node_number, model.reducer_edges[0].to_node.node_number), (440, 450))


if __name__ == "__main__":
    unittest.main()
