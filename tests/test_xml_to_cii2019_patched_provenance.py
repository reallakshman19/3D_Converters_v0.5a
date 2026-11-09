"""Required red/green integration test for patched XML->CII2019 entry point.

This is expected to fail against the initial fix kit until patched.py threads
pre-pruning source-node provenance into the ConversionModel. Use in the full
checkout only. No tests are silently skipped.
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / 'converters' / 'scripts'
sys.path.insert(0, str(SCRIPTS))
import xml_to_cii2019 as base
import xml_to_cii2019_patched as patched


class PatchedRIGIDMassProvenanceRegression(unittest.TestCase):
    def test_pruned_source_mass_survives_patched_conversion_model(self):
        # 2 mm arriving node carries the only positive physical component
        # mass, but is pruned before ELEMENTS are formed.
        entries = [
            (100, 0, 0, '', 0, 'PIPE'),
            (110, 2, 30, 'COMP-A', 2, 'RIGID'),
            (120, 20, 0, 'COMP-A', 2, 'RIGID'),
            (130, 60, 0, 'COMP-A', 2, 'RIGID'),
        ]
        nodes = ''.join(
            f'<Node><NodeNumber>{num}</NodeNumber><Position>{x} 0 0</Position>'
            f'<ComponentType>{kind}</ComponentType><ComponentRefNo>{ref}</ComponentRefNo>'
            f'<Rigid>{rigid}</Rigid><Weight>{weight}</Weight></Node>'
            for num, x, weight, ref, rigid, kind in entries
        )
        xml = ("<PipeStressExport><Pipe><Branch><Branchname>B</Branchname>"
               + nodes + "</Branch></Pipe></PipeStressExport>")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'fixture.xml'
            path.write_text(xml, encoding='utf-8')
            document = base._parse_xml_document(path)
            self.assertEqual([node.node_number for node in document.branches[0].nodes],
                             [100, 120, 130])
            self.assertEqual([node.node_number for node in document.branches[0].mass_source_nodes],
                             [100, 110, 120, 130])
            model = patched._build_conversion_model(document, {}, None, {})
            self.assertEqual(model.edge_to_rigid_index, {0: 1, 1: 2})
            self.assertIn('B', model.rigid_mass_source_nodes_by_branch,
                          'Patched entry point lost the pre-pruning component provenance')
            self.assertEqual([float(row.split()[0]) for row in base._build_rigid_payload(model)],
                             [10.0, 20.0])
            text = base._build_cii_text(model, 'none', base.DEFAULT_VERSION_LINE)
            rigid = text.split('#$ RIGID\n', 1)[1].split('#$ EXPJT', 1)[0].splitlines()
            self.assertEqual([float(row.split()[0]) for row in rigid], [10.0, 20.0])


if __name__ == '__main__':
    unittest.main()
