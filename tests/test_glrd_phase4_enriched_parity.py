"""Unit tests for the fail-closed Step 4 enriched XML parity gate."""
import importlib.util
import json
import tempfile
import unittest
from hashlib import sha256
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('glrd_gate', HERE / 'glrd_phase4_enriched_parity.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class Step4EnrichedParityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.dir = Path(self.temp.name)
        self.pr = self.dir / 'pr.xml'
        self.base = self.dir / 'base.xml'
        self.baseline_manifest = self.dir / 'baseline.json'
        self.candidate_manifest = self.dir / 'candidate.json'
        self.base.write_text('<Root><Value>12.0</Value></Root>', encoding='utf-8')
        self.pr.write_bytes(self.base.read_bytes())
        ident = {key: sha256(key.encode()).hexdigest() for key in gate.REQUIRED_INPUTS}
        for name, path, commit in [
            ('base', self.baseline_manifest, 'a' * 40),
            ('candidate', self.candidate_manifest, 'b' * 40),
        ]:
            self.write_manifest(path, {'captureKind': gate.CAPTURE_KIND,
                                       'commit': commit, 'inputSha256': ident})

    @staticmethod
    def write_manifest(path, manifest):
        path.write_text(json.dumps(manifest), encoding='utf-8')

    def compare(self):
        return gate.compare(self.base, self.pr,
                            self.baseline_manifest, self.candidate_manifest)

    def test_exact_output_passes(self):
        code, result = self.compare()
        self.assertEqual((code, result['status'], result['xmlByteDiff']), (0, 'PASS', 0))
        self.assertEqual(result['baselineSha256'], result['candidateSha256'])

    def test_changed_engineering_value_requires_rca(self):
        self.pr.write_text('<Root><Value>12.1</Value></Root>', encoding='utf-8')
        code, result = self.compare()
        self.assertEqual((code, result['status']), (1, 'DIFF_REQUIRES_RCA'))
        self.assertEqual(result['classification']['kind'], 'STRUCTURAL_OR_CONTENT')
        self.assertIn('12.1', str(result['classification']))

    def test_only_xml_formatting_change_still_requires_rca(self):
        self.pr.write_text('<Root><Value>12.0</Value></Root>\n', encoding='utf-8')
        code, result = self.compare()
        self.assertEqual((code, result['status']), (1, 'DIFF_REQUIRES_RCA'))
        self.assertEqual(result['classification']['kind'], 'SERIALIZATION_ONLY')

    def test_changed_config_hash_invalidates_comparison(self):
        meta = json.loads(self.candidate_manifest.read_text())
        meta['inputSha256']['config'] = 'f' * 64
        self.write_manifest(self.candidate_manifest, meta)
        code, result = self.compare()
        self.assertEqual((code, result['status']), (2, 'NOT_PROVEN'))
        self.assertEqual(result['changedInputs'], ['config'])

    def test_override_hash_mismatch_invalidates_comparison(self):
        meta = json.loads(self.candidate_manifest.read_text())
        meta['inputSha256']['manualOverrides'] = 'f' * 64
        self.write_manifest(self.candidate_manifest, meta)
        code, result = self.compare()
        self.assertEqual((code, result['status']), (2, 'NOT_PROVEN'))
        self.assertEqual(result['changedInputs'], ['manualOverrides'])

    def test_same_commit_is_not_a_before_after_proof(self):
        meta = json.loads(self.candidate_manifest.read_text())
        meta['commit'] = 'a' * 40
        self.write_manifest(self.candidate_manifest, meta)
        code, result = self.compare()
        self.assertEqual((code, result['status']), (2, 'NOT_PROVEN'))

    def test_preparser_capture_is_rejected(self):
        meta = json.loads(self.baseline_manifest.read_text())
        meta['captureKind'] = 'python-pre-parser'
        self.write_manifest(self.baseline_manifest, meta)
        code, result = self.compare()
        self.assertEqual((code, result['status']), (2, 'NOT_PROVEN'))

    def test_invalid_xml_is_rejected_even_when_identical(self):
        self.base.write_text('<Root>', encoding='utf-8')
        self.pr.write_bytes(self.base.read_bytes())
        code, result = self.compare()
        self.assertEqual((code, result['status']), (2, 'NOT_PROVEN'))
        self.assertIn('invalid enriched XML', result['reason'])

    def test_missing_capture_is_rejected(self):
        self.pr.unlink()
        code, result = self.compare()
        self.assertEqual((code, result['status']), (2, 'NOT_PROVEN'))

    def test_empty_capture_is_rejected(self):
        self.pr.write_bytes(b'')
        code, result = self.compare()
        self.assertEqual((code, result['status']), (2, 'NOT_PROVEN'))

    def test_missing_input_hash_is_rejected(self):
        meta = json.loads(self.baseline_manifest.read_text())
        del meta['inputSha256']['sourceXml']
        self.write_manifest(self.baseline_manifest, meta)
        code, result = self.compare()
        self.assertEqual((code, result['status']), (2, 'NOT_PROVEN'))


if __name__ == '__main__':
    unittest.main()
