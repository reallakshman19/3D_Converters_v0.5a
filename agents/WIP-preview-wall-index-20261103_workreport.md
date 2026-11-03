# WIP: Phase 4 Preview staged wall evidence index — 2026-11-03

- **Class:** ENGINEERING_CRITICAL (wall-thickness selection must remain immutable).
- **Source base:** main a3b3d7e329686ceff419d2399ee153986bcab23f.
- **Branch:** perf/xml-cii-preview-wall-index-20261103.
- **Other relevant branch:** perf/xml-cii-preview-single-pass-20261103 currently points at base main (no changed files observed); do not overwrite or assume ownership.
- **Issue:** Phase 4 Preview calls collectStagedBranchWallEvidence(stagedJsonText, branchName) from applyPreviewBoreWallAuthority for every branch. It JSON.parse + traverses the full staged tree per branch.
- **External references:** reallakshman19/3D_Converters/Benchmarks/XML-CII-2019/revamped/{GLRD-1000-PSI-02.xml,STD-00-PX-4338-01001-0001-02.xlsx,STF_2026Nov03-0839_managed_stage.json}; masters at 25db94769994751bb0fb6e6d83a578efd9ac8162/docs/docs/Masters.
- **Baseline artifact:** GitHub Actions run 41609539939 glrd-reference-replay, main-before/raw-enriched.xml, 575722 bytes, SHA256 00d4de83c3add0ce46cc8e395cd98d10fac8efe20fcbdff162c08500cde2c395. WARNING: Python pre-parser replay, not Phase 4 browser-exported XML. Not sufficient alone to certify browser enriched output.
- **Observed GLRD:** baseline has 30 branches, 1224 nodes; staged JSON 1816629 bytes; old staged evidence traversal 373.02ms; single index 72.43ms; 1279 evidence entries identical and in the same order; SHA256 3c29d0922fe75f087e8e245c52f76c93f31ce43266f616d92cd33a4dff0b593b both.
- **Authority:** preserve branch canonicalization, staged item order, evidence fields, direct-wall / schedule / class precedence and master/override semantics. Do not alter conversion writers or sourced engineering data.
- **Proposed bounded patch:** create one staged wall evidence index per applyPreviewBoreWallAuthority invocation and reuse it for each branch; keep legacy public single-branch collector for compatibility.
- **Hypothesis falsifier:** evidence array/order or wall-thickness selection differs on current source or a regression fixture; then revert patch.
- **Validation:** external evidence-array comparison PASS (local prototype); full browser phase 4 run NOT_RUN; enriched XML after fix NOT_RUN; production regression tests NOT_RUN.
- **Change ledger:** pending.
- **Highest risk:** browser Phase 4 enriched XML output cannot yet be independently rerun with exact external fixtures from local restricted workspace. Never declare output identity based only on evidence-array parity.
- **Recovery state:** in progress, branch isolated from main.
- **EXACT_NEXT_ACTION:** Save original production module backups in this branch; implement index-only optimization; run tests and compare reference evidence; then attempt current-branch GLRD replay and publish available diff with limitations.
