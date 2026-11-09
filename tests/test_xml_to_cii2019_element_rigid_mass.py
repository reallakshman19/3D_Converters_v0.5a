"""Regression coverage for element-assigned RIGID mass and CII pointers.

Run in the baseline repository:
  python -m unittest discover -s tests -p test_xml_to_cii2019_element_rigid_mass.py -v
"""
from __future__ import annotations

import math
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = ROOT / "converters" / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))

from rigid_mass_assignment import resolve_element_rigid_masses

if (SCRIPT_DIR / "xml_to_cii2019.py").is_file():
    import xml_to_cii2019 as cii
else:
    cii = None


def node(number, x, *, weight=0, ref="", rigid=2, kind="RIGID"):
    return SimpleNamespace(
        node_number=number, position=(float(x), 0.0, 0.0), weight=float(weight),
        component_ref_no=ref, rigid=rigid, component_type=kind,
    )


def edge(a, b, branch="B"):
    return SimpleNamespace(from_node=a, to_node=b, branch_name=branch)


def write_xml(nodes):
    def xml_node(number, x, weight, ref, rigid, kind):
        return (f"<Node><NodeNumber>{number}</NodeNumber>"
                f"<Position>{x} 0 0</Position><ComponentType>{kind}</ComponentType>"
                f"<ComponentRefNo>{ref}</ComponentRefNo><Rigid>{rigid}</Rigid>"
                f"<Weight>{weight}</Weight></Node>")
    content = (
        "<PipeStressExport><Pipe><Branch><Branchname>B</Branchname>"
        + "".join(xml_node(*item) for item in nodes)
        + "</Branch></Pipe></PipeStressExport>"
    )
    temp = tempfile.TemporaryDirectory()
    path = Path(temp.name) / "fixture.xml"
    path.write_text(content, encoding="utf-8")
    return temp, path


class ElementRigidMassUnitTests(unittest.TestCase):
    def test_one_component_split_by_actual_length_without_double_counting(self):
        a = node(100, 0, rigid=0, kind="PIPE")
        b = node(110, 10, weight=30, ref="=VAL-1")
        c = node(120, 40, weight=30, ref="val-1")
        edges = [edge(a, b), edge(b, c)]
        assigned = resolve_element_rigid_masses(edges, {0: 1, 1: 2})
        self.assertEqual([assigned[i].length_mm for i in (0, 1)], [10, 30])
        self.assertEqual(assigned[0].component_key, "ref/B/VAL-1")
        self.assertEqual(assigned[1].allocation_rule, "component-length-proportional")
        self.assertAlmostEqual(assigned[0].resolved_mass, 7.5)
        self.assertAlmostEqual(assigned[1].resolved_mass, 22.5)
        self.assertAlmostEqual(sum(v.resolved_mass for v in assigned.values()), 30)

    def test_same_geometry_but_distinct_refs_remain_distinct(self):
        a = node(1, 0, kind="PIPE", rigid=0)
        b = node(2, 10, weight=12, ref="ITEM-A")
        c = node(3, 20, weight=5, ref="ITEM-B")
        masses = resolve_element_rigid_masses([edge(a, b), edge(b, c)], {0: 1, 1: 2})
        self.assertEqual([masses[i].resolved_mass for i in (0, 1)], [12, 5])

    def test_unreferenced_to_node_is_only_owner(self):
        a = node(1, 0, weight=80, ref="", rigid=2)
        b = node(2, 20, weight=0, ref="", rigid=0, kind="FLAN")
        mass = resolve_element_rigid_masses([edge(a, b)], {0: 1})[0]
        self.assertEqual(mass.resolved_mass, 0.0)
        self.assertEqual(mass.allocation_rule, "missing-or-zero-component-weight")

    def test_repeated_unreferenced_to_node_is_apportioned_once(self):
        a = node(1, 0, rigid=0, kind="PIPE")
        b = node(2, 10, weight=20)
        c = node(3, 40, rigid=0, kind="PIPE")
        masses = resolve_element_rigid_masses([edge(a, b), edge(c, b)], {0: 1, 1: 2})
        self.assertAlmostEqual(masses[0].resolved_mass, 5)
        self.assertAlmostEqual(masses[1].resolved_mass, 15)

    def test_ambiguous_component_masses_fail_instead_of_summing(self):
        a = node(1, 0, rigid=0, kind="PIPE")
        b = node(2, 10, weight=10, ref="ITEM")
        c = node(3, 20, weight=12, ref="ITEM")
        with self.assertRaisesRegex(ValueError, "Conflicting source weights"):
            resolve_element_rigid_masses([edge(a, b), edge(b, c)], {0: 1, 1: 2})

    def test_invalid_mass_and_zero_length_allocation_are_rejected(self):
        for bad in (-1.0, float("nan"), float("inf")):
            with self.subTest(bad=bad), self.assertRaisesRegex(ValueError, "Invalid"):
                resolve_element_rigid_masses(
                    [edge(node(1, 0, rigid=0), node(2, 10, ref="A", weight=bad))], {0: 1}
                )
        a, b, c = node(1, 0, rigid=0), node(2, 0, weight=10, ref="A"), node(3, 0, ref="A")
        with self.assertRaisesRegex(ValueError, "all emitted lengths are zero"):
            resolve_element_rigid_masses([edge(a, b), edge(b, c)], {0: 1, 1: 2})

    def test_removed_short_node_can_be_the_component_mass_source(self):
        a = node(1, 0, rigid=0, kind="PIPE")
        dropped = node(2, 2, weight=24, ref="ITEM")
        b = node(3, 20, weight=0, ref="ITEM")
        c = node(4, 60, weight=0, ref="ITEM")
        masses = resolve_element_rigid_masses(
            [edge(a, b), edge(b, c)], {0: 1, 1: 2},
            mass_source_nodes_by_branch={"B": [a, dropped, b, c]},
        )
        self.assertAlmostEqual(masses[0].resolved_mass, 8.0)
        self.assertAlmostEqual(masses[1].resolved_mass, 16.0)

    def test_nonrigid_elements_have_no_mass_assignment(self):
        a = node(1, 0, rigid=0)
        b = node(2, 10, weight=15, rigid=0)
        self.assertEqual(resolve_element_rigid_masses([edge(a, b)], {}), {})

    def test_pointer_contract_is_explicit(self):
        edges = [edge(node(1, 0), node(2, 10))]
        with self.assertRaisesRegex(ValueError, "from 1"):
            resolve_element_rigid_masses(edges, {0: 2})
        with self.assertRaisesRegex(ValueError, "missing emitted element"):
            resolve_element_rigid_masses(edges, {1: 1})


@unittest.skipIf(cii is None, "The baseline exporter source is not mounted in this container")
class ExportIntegrationTests(unittest.TestCase):
    def test_short_element_filtering_and_exact_cii_aux_indices(self):
        # 100 -> 110 is a 2 mm segment and will be dropped. Emitted rigid
        # edges are 100 -> 120 (20mm), 120 -> 130 (40mm).
        nodes = [
            (100, 0, 0, "", 0, "PIPE"),
            (110, 2, 0, "COMP", 2, "RIGID"),
            (120, 20, 30, "COMP", 2, "RIGID"),
            (130, 60, 30, "COMP", 2, "RIGID"),
            (140, 80, 0, "", 0, "PIPE"),
        ]
        tmp, path = write_xml(nodes)
        self.addCleanup(tmp.cleanup)
        document = cii._parse_xml_document(path)
        model = cii._build_conversion_model(document)
        self.assertEqual([(e.from_node.node_number, e.to_node.node_number) for e in model.edges],
                         [(100, 120), (120, 130), (130, 140)])
        self.assertEqual(model.edge_to_rigid_index, {0: 1, 1: 2})
        masses = model.rigid_mass_assignments
        self.assertAlmostEqual(masses[0].resolved_mass, 10.0)
        self.assertAlmostEqual(masses[1].resolved_mass, 20.0)

        payload = cii._build_elements_payload(model)
        self.assertEqual(len(payload), 3 * 15)
        self.assertEqual([int(payload[i * 15 + 12].split()[1]) for i in range(3)], [1, 2, 0])
        self.assertEqual([int(float(payload[i * 15].split()[1])) for i in range(3)], [120, 130, 140])
        self.assertEqual([float(line.split()[0]) for line in cii._build_rigid_payload(model, 10.0)],
                         [100.0, 200.0])
        cii_sections = cii._build_cii_text(model, "none", cii.DEFAULT_VERSION_LINE, weight_scale=10).split("#$ RIGID\n")[1].split("#$ EXPJT", 1)[0].splitlines()
        self.assertEqual([float(line.split()[0]) for line in cii_sections], [100.0, 200.0])

    def test_pruned_node_is_still_a_source_for_the_surviving_component(self):
        # The only positive source mass belongs to a pruned 2 mm node, but
        # the physical component still survives as 20 mm and 40 mm CII edges.
        nodes = [
            (100, 0, 0, "", 0, "PIPE"),
            (110, 2, 30, "COMP", 2, "RIGID"),
            (120, 20, 0, "COMP", 2, "RIGID"),
            (130, 60, 0, "COMP", 2, "RIGID"),
        ]
        tmp, path = write_xml(nodes)
        self.addCleanup(tmp.cleanup)
        model = cii._build_conversion_model(cii._parse_xml_document(path))
        self.assertEqual([(e.from_node.node_number, e.to_node.node_number) for e in model.edges],
                         [(100, 120), (120, 130)])
        self.assertEqual([model.rigid_mass_assignments[i].resolved_mass for i in (0, 1)],
                         [10.0, 20.0])
        self.assertEqual([float(line.split()[0]) for line in cii._build_rigid_payload(model)],
                         [10.0, 20.0])

    def test_flange_aux_does_not_inherit_upstream_rigid_mass(self):
        nodes = [
            (1, 0, 0, "", 0, "PIPE"),
            (2, 20, 15, "RIG-2", 2, "RIGID"),
            (3, 40, 0, "FLANGE-3", 0, "FLAN"),
        ]
        tmp, path = write_xml(nodes)
        self.addCleanup(tmp.cleanup)
        model = cii._build_conversion_model(cii._parse_xml_document(path))
        self.assertEqual(model.edge_to_rigid_index, {0: 1, 1: 2})
        self.assertEqual([float(line.split()[0]) for line in cii._build_rigid_payload(model)], [15., 0.])

    def test_short_cleanup_branch_fallback_documented(self):
        nodes = [(1, 0, 0, "", 0, "PIPE"), (2, 2, 0, "", 2, "RIGID")]
        tmp, path = write_xml(nodes)
        self.addCleanup(tmp.cleanup)
        document = cii._parse_xml_document(path)
        # Baseline intentionally retains an entire branch if pruning would
        # otherwise eliminate all segments. No cleanup change is introduced.
        self.assertEqual(len(document.branches[0].nodes), 2)


if __name__ == "__main__":
    unittest.main()
