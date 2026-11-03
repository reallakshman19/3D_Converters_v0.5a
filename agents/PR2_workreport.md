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
