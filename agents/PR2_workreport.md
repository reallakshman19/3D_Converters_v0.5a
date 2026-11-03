# PR #2 — Phase 4 Preview staged wall evidence single-pass performance fix

## Recovery / live baseline
- **Classification:** ENGINEERING_CRITICAL; evidence selection and engineering output semantics are protected.
- **PR:** https://github.com/reallakshman19/3D_Converters_v0.5a/pull/2 (draft; NOT MERGED).
- **Branch:** perf/xml-cii-preview-wall-index-20261103; **base:** main `a3b3d7e329686ceff419d2399ee153986bcab23f`.
- **Multi-agent overlap:** `perf/xml-cii-preview-single-pass-20261103` pointed at main with no diff at grounding; no open PR overlap detected. Recheck on takeover.
- **WIP disposition:** completed bounded implementation; blocked on full browser/export validation.

## Mission and root cause
Fix extremely slow standalone XML→CII Phase 4 Preview using user-supplied GLRD references, while preserving baseline enriched XML and all engineering authority. The Preview wall stage previously called `collectStagedBranchWallEvidence(stagedJsonText, branchName)` for every branch, and this function parsed + traversed all staged JSON every time (30 passes over the 1,816,629-byte GLRD JSON).

## Pre-fix baseline and evidence
- Provenance: successfully completed workflow run 41609539939 artifact `glrd-reference-replay`, `main-before/raw-enriched.xml`, 575,722 bytes SHA256 `00d4de83c3add0ce46cc8e395cd98d10fac8efe20fcbdff162c08500cde2c395`. This is a **Python converter pre-parser capture**, NOT the actual Phase 4 browser enriched XML. Never call it Phase 4 output.
- GLRD reference stage SHA256 `1d2469fe05d712cd1dd2da9913a840516ae686fb1616eb6d7b5e14d8918e2746`.
- 30 branches, 1,224 nodes in saved XML.
- Original staged collection: 373.02 ms across 30 branches. New indexed collection (isolated faithful replay): 72.43 ms; 5.15x. Repeat: 330.42 ms vs 69.06 ms; 4.78x.
- 1,279 matched staged evidence records identical by deep equality, order, duplicate and provenance; before and after serialized SHA256 `3c29d0922fe75f087e8e245c52f76c93f31ce43266f616d92cd33a4dff0b593b`; JSON unified diff is EMPTY.

## Implementation / changed files
- `tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-wall-evidence.js`: export single-pass index + indexed lookup; retain legacy collector API for other callers.
- `tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-bore-wall-authority.js`: index JSON once only after XML parse success and reuse per branch.
- `tests/xml-cii-preview-wall-evidence-index.test.mjs`: synthetic ordering, OWNER override, canonical BRANCH /B# handling, invalid JSON, source object, static single indexing wiring, optional exact corpus hash.
- `.backups/connector-20261103-preview-wall-index/...`: exact pre-modification copies of both production modules.
- `agents/PR2_workreport.md`: this recovery report.
No master-data, writer, XML export, workflow, default, or priority rules changed.

## Invariants / authority
Preserve exact staged DFS traversal, evidence order and duplicates, canonical owner root, DTXR attribute precedence, source and bore mapping. Leave independent XML branch wall evidence appended after staged data and `resolveXmlCiiWallThicknessWithEvidence` policy unchanged. Preserve `findExactClassWall`, DTXR direct wall precedence, strict exact Line List and staged editor override authority.

## Validation matrix
- PASS (independent local evidence check): exact GLRD reference evidence 1,279 records deep equality and matching digest.
- PASS (independent local defensive probe): malformed/empty JSON, object input, branch /B# canonicalization, duplicate evidence and staged OWNER override all match original behavior; `node --check` of standalone probe succeeded.
- PASS (independent local hotspot benchmark): two runs ~4.8x–5.2x faster in staged evidence collection only.
- PASS (static source inspection): only intended preview lookup calls altered; no writers touched.
- NOT_RUN: newly added Node suite inside full repository (no remote test-execution tool/CI check available).
- NOT_RUN: complete end-to-end browser Phase 4 build, live wall calculation and runtime timing.
- NOT_RUN: actual main vs fix Phase 4 enriched XML generation and canonical diff; unavailable in this restricted environment.
- NOT_RUN: full regression suite; cannot assert absence of unrelated errors.
- CI status: no check runs or commit statuses on initial PR head at 2026-11-03 09:47Z.

## Highest risk / next falsifier
The isolated 5x hotspot speedup may not remove other major Preview bottlenecks (notably strict-fuzzy branch rebuilds and weight ranking). Actual browser Phase 4 XML and no-new-error guarantee remain **unproven**. Any change in a branch's wall-thickness/engineering provenance or enrichment exported XML invalidates patch and requires investigation.

## Exact next action
1. Obtain exact external GLRD XML + staged JSON + Linelist and version-pinned Masters.
2. In a real environment clone base and this branch; run `node --test tests/xml-cii-preview-wall-evidence-index.test.mjs tests/xml-cii-bore-wall-authority.test.mjs tests/xml-cii-preview-strict-line-authority.test.mjs` with `GLRD_STAGE_FILE` and `GLRD_BRANCH_NAMES_FILE` set for exact corpus test.
3. Open Phase 4 Preview for both base and PR with identical settings, capture enriched XML before/after and diff canonical XML; profile full Preview; identify remaining hotspot if still slow.
4. Update validation matrix, review drift and blockers; keep PR draft and DO NOT MERGE without owner approval.


## 2026-11-03 follow-up: owner-enforced per-phase enriched XML zero-diff gate
- Owner requirement: **After each optimization phase capture the actual browser-driven enriched XML on the unchanged base and optimized branch using the same inputs, then require zero byte differences. Any diff triggers RCA and an owner discussion before proceeding.**
- **Code added to PR:** `tests/glrd_phase4_enriched_parity.py` is a fail-closed gate. It requires provenance manifests identifying *actual Step 4 browser-derived enriched XML* (not pre-parser or fabricated snapshots), both commit hashes, and SHA-256 of XML, staged JSON, line list, master set, config and manual overrides. It rejects malformed XML, missing captures, identical commit IDs or mismatched input identity; provides hashes, first changed byte and XML path/content classification on a diff.
- **PASS, local standalone gate self-test:** matching XML accepted; changed element content rejected with structural RCA; changed config identity rejected as NOT_PROVEN. Python compilation succeeded. Gate is NOT a claim that real preview output was generated.
- **PASS, earlier isolated reference evidence:** 1,279 staged records equal across 30 GLRD branches with digest `3c29d0922fe75f087e8e245c52f76c93f31ce43266f616d92cd33a4dff0b593b`.
- **NOT_PROVEN / HARD STOP:** No actual browser Step 4 enriched XML capture exists for either pinned baseline `a3b3d7e329686ceff419d2399ee153986bcab23f` or this PR. Existing `main-before/raw-enriched.xml` is **Python pre-parser**, disallowed as gate input. Local sandbox cannot fetch/clone the repository over the network and the linked browser connector is not connected; remote GitHub connector has no workflow dispatch or browser execution capability. Do not advance to Phase 2, merge or claim zero-diff.
- **Capture contract:** metadata JSON for each run: `{"captureKind":"xml-cii-2019-step4-browser-enriched-xml","commit":"<full40HexSHA>","inputSha256":{"sourceXml":"<sha256>","stagedJson":"<sha256>","lineList":"<sha256>","masters":"<sha256>","config":"<sha256>","manualOverrides":"<sha256>"}}`. Use an actual output generated by the browser workflow after Step 4, with all inputs and overrides frozen. Zero difference is **byte-for-byte**. Any difference, including serialization-only, is a hard stop pending RCA and owner acceptance.
- **Command:** `python3 tests/glrd_phase4_enriched_parity.py --before baseline-browser-enriched.xml --after optimized-browser-enriched.xml --before-manifest main-capture.json --after-manifest pr-capture.json --report glrd-phase1-parity.json`.
- **EXACT_NEXT_ACTION:** run browser Step 4 and downstream enriched XML export at main and PR head with pinned references/masters, save both real captures and attested input identities, execute gate. If gate gives `DIFF_REQUIRES_RCA`, isolate first divergence and discuss; if `PASS`, execute full browser and Node regression tests, profile performance and complete review before considering Phase 2. Do not use the pre-parser artifact as an oracle.


## 2026-11-03 10:14Z+ follow-up: gate unit tests and isolated GLRD reference replay
- Owner said **proceed** under the per-phase enriched XML zero-diff contract; **does not waive the hard stop or authorize accepting a technically correct diff without discussion**.
- New committed test file: `tests/test_glrd_phase4_enriched_parity.py` (11 independent gate-behavior cases, including exact match, value mismatch, serialization-only mismatch, input/config/override identity mismatch, original/optimized commit identity, pre-parser provenance rejection, invalid XML, missing/empty capture and missing required digest).
- **PASS — unit tests (local standalone copy of the exact comparator and test logic):** `python3 /mnt/data/test_glrd_phase4_enriched_parity.py -v` -> 11 tests, 0 failures. This is the local isolated copy rather than a native repository CI test execution.
- **PASS — rerun independent GLRD isolated evidence replay:** 30 branches, 1,279 records, pre/post identical digest `3c29d0922fe75f087e8e245c52f76c93f31ce43266f616d92cd33a4dff0b593b`, unified evidence JSON diff 0 lines. Local timing: 379.646798 ms legacy vs 67.364601 ms indexed (~5.64x speedup in this operation, not complete Step 4).
- **NOT_PROVEN — browser enriched XML parity:** gate returned exit 2 (`NOT_PROVEN`) because genuine capture metadata and before/after real browser exports are absent. Do not label the previously retrieved Python-generated `main-before/raw-enriched.xml` as browser output.
- **NOT_RUN — repository-native JavaScript test suite or browser end-to-end:** local container can run Chromium/Node but cannot connect to GitHub; Opera browser integration explicitly reported disconnected; GitHub connector has no workflow-dispatch action. No repo-wide CI checks exist on this PR as inspected.
- **Security/validation caveat:** capture manifests supply asserted source identity and must be generated from actual captured input/configuration bytes in a trusted execution process; matching declarations alone do not independently prove that an XML was browser-produced. Inspect live capture provenance and application logs.
- **Next executable action (hard stop persists):** obtain baseline and optimized actual Step 4 Preview + downstream enriched XML browser captures from same immutable GLRD configuration; compare with committed fail-closed gate; for any nonzero diff, perform RCA and discuss with owner; if exactly zero, then run native Node/browser checks and profile before Phase 2.
