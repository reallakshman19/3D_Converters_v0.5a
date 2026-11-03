#!/usr/bin/env python3
"""Fail-closed parity gate for *actual browser Step 4 enriched XML exports*.

Never substitute Python pre-parser XML or synthetic evidence captures.
"""
import argparse
import difflib
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

REQUIRED_INPUTS = ('sourceXml', 'stagedJson', 'lineList', 'masters', 'config', 'manualOverrides')
CAPTURE_KIND = 'xml-cii-2019-step4-browser-enriched-xml'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_attestation(path):
    obj = json.loads(Path(path).read_text(encoding='utf-8'))
    if obj.get('captureKind') != CAPTURE_KIND:
        raise ValueError('captureKind must identify a real Step 4 browser enriched XML export')
    commit = obj.get('commit', '')
    if not re.fullmatch(r'[0-9a-fA-F]{40}', commit):
        raise ValueError('missing or invalid captured commit SHA')
    inputs = obj.get('inputSha256', {})
    if not isinstance(inputs, dict):
        raise ValueError('inputSha256 must be an object')
    for key in REQUIRED_INPUTS:
        if not re.fullmatch(r'[0-9a-fA-F]{64}', str(inputs.get(key, ''))):
            raise ValueError('missing valid SHA256 for ' + key)
    return obj


def nodes(element, location=''):
    """Ordered path/value traversal; no whitespace or numeric tolerance."""
    path = f'{location}/{element.tag}'
    yield (path + '/@attributes', sorted(element.attrib.items()))
    yield (path + '/#text', element.text or '')
    yield (path + '/#tail', element.tail or '')
    counters = {}
    for child in element:
        counters[child.tag] = counters.get(child.tag, 0) + 1
        yield from nodes(child, f'{path}[{counters[child.tag]}]')


def first_structural_difference(before, after):
    try:
        left, right = ET.fromstring(before), ET.fromstring(after)
    except ET.ParseError as exc:
        return {'kind': 'XML_PARSE_ERROR', 'detail': str(exc)}
    from itertools import zip_longest
    for a, b in zip_longest(nodes(left), nodes(right), fillvalue=None):
        if a != b:
            return {'kind': 'STRUCTURAL_OR_CONTENT', 'baseline': a, 'candidate': b}
    return {'kind': 'SERIALIZATION_ONLY'}


def compare(before_path, after_path, before_manifest, after_manifest):
    try:
        b_meta, a_meta = read_attestation(before_manifest), read_attestation(after_manifest)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        return 2, {'status': 'NOT_PROVEN', 'reason': 'invalid capture attestation: ' + str(exc)}
    if b_meta['commit'].lower() == a_meta['commit'].lower():
        return 2, {'status': 'NOT_PROVEN', 'reason': 'baseline and candidate must use distinct commits'}
    if b_meta['inputSha256'] != a_meta['inputSha256']:
        changed = [k for k in REQUIRED_INPUTS if b_meta['inputSha256'][k] != a_meta['inputSha256'][k]]
        return 2, {'status': 'NOT_PROVEN', 'reason': 'input identity mismatch', 'changedInputs': changed}
    try:
        before, after = Path(before_path).read_bytes(), Path(after_path).read_bytes()
    except OSError as exc:
        return 2, {'status': 'NOT_PROVEN', 'reason': 'capture unavailable: ' + str(exc)}
    if not before or not after:
        return 2, {'status': 'NOT_PROVEN', 'reason': 'empty enriched XML capture'}
    base = {'baselineSha256': sha(before), 'candidateSha256': sha(after),
            'baselineBytes': len(before), 'candidateBytes': len(after),
            'baselineCommit': b_meta['commit'], 'candidateCommit': a_meta['commit']}
    if before == after:
        return 0, dict(base, status='PASS', xmlByteDiff=0)
    first_byte = next((i for i, (x, y) in enumerate(zip(before, after)) if x != y), min(len(before), len(after)))
    detail = first_structural_difference(before, after)
    lines = list(difflib.unified_diff(before.decode('utf-8', 'replace').splitlines(),
                                      after.decode('utf-8', 'replace').splitlines(),
                                      fromfile='baseline-step4', tofile='optimized-step4', lineterm=''))
    return 1, dict(base, status='DIFF_REQUIRES_RCA', firstDifferentByte=first_byte,
                   classification=detail, unifiedDiffSample='\n'.join(lines[:100]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--before', required=True)
    parser.add_argument('--after', required=True)
    parser.add_argument('--before-manifest', required=True)
    parser.add_argument('--after-manifest', required=True)
    parser.add_argument('--report', help='write machine-readable gate result')
    args = parser.parse_args()
    code, result = compare(args.before, args.after, args.before_manifest, args.after_manifest)
    output = json.dumps(result, indent=2, ensure_ascii=False) + '\n'
    if args.report:
        Path(args.report).parent.mkdir(parents=True, exist_ok=True)
        Path(args.report).write_text(output, encoding='utf-8')
    print(output)
    return code


if __name__ == '__main__':
    sys.exit(main())
