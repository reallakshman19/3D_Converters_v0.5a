# GLRD Step 4 Preview — source-level state and cache contract, Issue #7

> **Status: PARTIAL AUDIT / RELEASE BLOCKED.** This is a source-derived contract map at pinned revisions, not a claim of full transitive proof. The experimental cache must remain isolated. This document is intentionally separate from the PR #2 production recovery report.

## Immutable source revisions

- Unmodified product baseline: `a3b3d7e329686ceff419d2399ee153986bcab23f`.
- Phase 1 production candidate PR #2: `814157b162b981c9876f564f3cb0474435c8c37e`.
- Experimental cache original: `24917f2855d23473293797edf510872990a9d18c`; compare without mixing unrelated writer modifications.
- Browser test harness source: `19efc37c96b314e4e94194e46d348743207fea6c`.
- Reference fixtures: [pinned XML](https://github.com/reallakshman19/3D_Converters/blob/3377b7f4baeeee5851e72dcc414d6c4a93f5a933/Benchmarks/XML-CII-2019/revamped/GLRD-1000-PSI-02.xml), original line-list XLSX, staged JSON; measured G2 Preview SHA-256 `76bedf169f0a6e00e42539e634735d4736f86f205ca0c7be9da145e4c9f0adec` and enriched XML SHA-256 `f00da45caf73b15e930e4c91d068d8d1bebd1b9ad1452ad0d7b204af9c3a8aa2`.

## Static execution graph — direct code-level observations

```text
UI 4 Preview Build -> xmlCiiBuildAndRenderPreview(root, xml, cfg, options)
  - localStorage Preview cache lookup from pvCacheFingerprint(xml,cfg); may SKIP calculation
  - resolve staged source (if actual build)
  -> xmlCiiDryRunPreview(xml,cfg,staged) [wrapper]
      -> buildStrictLineAuthorityCorePreview
          -> core.xmlCiiDryRunPreview
              -> buildPipingClassIndex(cfg.pipingClass.masterRows)
              -> buildStagedDtxrIndex(staged,cfg)
              -> each branch process resolver, line list, rating etc
              -> each eligible node: rankXmlCiiWeightCandidates(context,cfg,{includeRejected:true})
          -> if fuzzy automatic line match: shallow clone top-level cfg;
             reset only linelist.masterRows; rebuild branch fragments with shared
             cfg.weight, cfg.pipingClass, cfg.material, overrides etc
      -> applyPreviewBoreWallAuthority
          -> staged wall evidence index; bore and wall evidence resolver
      -> applyPreviewMaterialCodeAuthority
          -> material map / line-list / overrides / fuzzy material resolution
      -> applyPreviewRatingAuthority
          -> build another piping class index
          -> rating override/DTXR authority and branch rating
          -> RERANK each eligible node with FINAL rating & different node-name source
  -> render editable table, register overrides and save state / optional UI cache write

Run -> runXmlCii2019Workflow
  -> enrichment core and standalone Preview-to-XML parity authority
  -> browser-enriched XML -> Python/Pyodide CII engine
```

## State and side-effect ledger (verified direct call sites)

| Scope | Inputs / authority | Constructed output | Confirmed mutation or state hazard | Source |
|---|---|---|---|---|
| UI cache lookup | XML, cfg fingerprint | `branchRows`, `nodeRows` loaded from localStorage | Fingerprint is incomplete; bypasses staged import/calculation on cache hit | `ui-adapted/xml-cii-adapted-preview-renderer.js:20-41,250-271,433` |
| Strict-line | XML branches, `cfg.linelist` + mapping, staged | Recomputed blocked rows and node rows | Shallow clone changes only linelist; nested config objects shared; new cfg object identity | `ui-adapted/xml-cii-adapted-preview-dryrun.js:37-44,106-165` |
| Core Preview | config masters, overrides, XML, staged | branchRows and nodeRows; local class index and DTXR index | Calls mutating weight ranker for eligible nodes; builds piping-class index | `ui-adapted/xml-cii-adapted-preview-dryrun-core.js:384-410,440-568` |
| Weight ranker | context, config.weight masters, defaults, rules, tolerance, options | selected, candidates, rejected with ordering, semantic provenance, fallback | `ensureValveHintConfig(config)` installs defaults and **writes** flags; output rowData retains source row reference | `converters/xml-cii2019-core/weight-valve-hints.js:42-54,64-70,119-158` |
| Bore/wall | existing branchRows, XML, staged evidence, class/master config | corrected wall/bore, provenance and records, corrected node bores | Builds separate staged evidence index; no config mutation demonstrated by audit yet | `ui-adapted/xml-cii-adapted-preview-bore-wall-authority.js:24-84,117-138` |
| Material code | intermediate branchRows, config.linelist/material/overrides | material code/provenance/needs-review | Reads potentially re-imported linelist and material maps; no config mutation demonstrated yet | `ui-adapted/xml-cii-adapted-preview-material-authority.js:69-98,160-260` |
| Rating authority | XML, staged DTXR, config overrides, pipingClass.masterRows, intermediate rows | final rating/DTXR evidence, re-ranked weight nodes | Builds **second** full class index; second rank context may differ from core | `ui-adapted/xml-cii-adapted-preview-rating-authority.js:89-155` |
| Class index | master array, optional fieldMap | Map indexed by class, normalized row copies, knownClasses | Cached array identity alone is insufficient when same array contents change; self-referential `map.byClass=map` | `converters/xml-cii2019-core/piping-class-resolver.js:186-202` |
| Persisted config | localStorage masters and per-workflow config | restored config/master rows | Large master arrays stripped from saved context; piping class may not restore. Identity and hydrated content can change after reload | `ui-adapted/xml-cii-adapted-state.js:81-154` |
| Run/export | enriched XML, Preview authority, overrides, rule/config | downstream enriched XML and engineering run evidence | Separate parse/config and output writer; direct Chromium service parity is NOT full UI | `xml-cii-standalone-run-parity.js:91-145`, `xml-cii-workflow-service.js` |

### UI Preview cache: direct source-confirmed under-invalidation

The real `pvCacheFingerprint(xmlText,cfg)` in `xml-cii-adapted-preview-renderer.js:22-29` serializes **XML length and first 80 chars**, line-list and class master **row counts**, first 300 chars of line-list field map and overrides, and first 120 chars of process defaults. It does **not** include staged JSON, weight-master content, master-row content, full XML, or entire overrides. `xmlCiiBuildAndRenderPreview` reads localStorage based on this fingerprint prior to resolving staged data when `!forceBuild` and can display cached rows.

This is a **separate correctness risk from the proposed per-build rank cache**. It cannot be justified by the per-build cache's G2 equal outputs. Test audit source: `tests/glrd_issue7_ui_preview_fingerprint_collisions.test.mjs`. Collision tests must pass before any remedial proposal; a production change needs its own G3 UI regression and cache migration strategy.

### Invalidation/side-effect counterexamples

Source/tests: `tests/glrd_issue7_negative_contract_audit.test.mjs` on audit branch. Passing negative tests establish counterexamples, not safe behavior:

- Change weight master 10→77 under same `config`/array identity: direct ranking changes, cached result unchanged.
- Delete `weight.valveHintMapping` after first fill: direct ranking reinstalls defaults, cached hit does not.
- Append second piping-class row: cached Map still contains old `knownClasses` only.
- Workbook-like `Service` + `Line Number` row matches Preview, but early enrichment matcher expects different column aliases.

### Critical distinctions and open proof obligations

- **One synchronous build** limits typical interleaving but does NOT establish a transitive no-mutation guarantee. The core ranker itself writes config defaults; strict fallback shares nested config; getters/setters may observe writes; runtime code paths need instrumentation.
- The core and final rating ranker use distinct context representations and ratings. No key based only on node/branch/bore can safely cross those stages.
- `WeakMap(config)` / `WeakMap(masterRows)` entries do not detect in-place source mutation. Returning a deep clone of one cached rank result changes identity semantics relative to a fresh rank whose candidate `rowData` points to master row objects.
- Config normalization and resulting post-call observable state are part of the correctness contract.
- **Full transitive read/write closure remains NOT PROVEN:** function calls inside class-process, DTXR/wall evidence and material resolvers, stage DOM/state, UI event processing, and Python converter require separate review.
- **G3 full interactive UI import→Preview→edit→Run→download remains NOT_RUN.**

## Required next gate

1. Execute the new genuine Chromium stage-write probe at pinned PR #2 and experimental cache revisions: compare full Preview JSON and post-call semantic config, observe writes on three `weight` flags per stage; do not treat only sampled property observations as exhaustive.
2. Execute UI fingerprint collision tests (real source extraction) and record exact fixture values and CI.
3. Trace `pvCacheFingerprint` and stage resolution into real UI tests. Design separate minimal correction, never bundle with ranking memoization.
4. Audit remaining nested helper mutation dependencies and missing-versus-present configs (including frozen and strict fallback).
5. Until reviewed: **reject cache merge**; keep all production authority and writer unchanged.

This audit is **source-cited to pinned repository files**. Absence of observed mutations in a limited test is not proof of absence across all supported configurations.
