# Graph Report - chatgpt-persian-rtl  (2026-07-23)

## Corpus Check
- 37 files · ~28,082 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 347 nodes · 667 edges · 24 communities (19 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2822eb33`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- rtl-runtime.js
- chatgpt-rtl-patcher.mjs
- scripts
- codex-classic-rtl.swift
- codex-rtl-launcher.mjs
- content.js
- manifest.json
- codex-classic-probe.swift
- chrome-plugin/package.json
- chatgpt-rtl-patcher.test.mjs
- package.json
- validate.mjs
- verify-patch.sh
- Vazirmatn Font
- package.sh
- install.sh
- restore.sh
- codebase-memory-index.sh

## God Nodes (most connected - your core abstractions)
1. `scripts` - 14 edges
2. `applyResolvedDirection()` - 12 edges
3. `processMessage()` - 12 edges
4. `main()` - 11 edges
5. `isComposerElement()` - 11 edges
6. `applyComposerNativeState()` - 11 edges
7. `applyAssistantNativeMessage()` - 11 edges
8. `applyAutoListDirection()` - 11 edges
9. `removeStyleIfPresent()` - 10 edges
10. `applyAssistantNativeState()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `README.md (Desktop)` --references--> `Vazirmatn Font`  [EXTRACTED]
  desktop/README.md → chrome-plugin/fonts/NOTICE.txt

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Multilingual README Translations** — readme_ar_md, readme_en_md, readme_fa_md, readme_he_md, readme_md [EXTRACTED 1.00]
- **Diagram References in Documentation** — docs_diagrams_chrome_flow_svg, docs_diagrams_desktop_patch_flow_svg, docs_diagrams_project_map_svg, docs_diagrams_restore_safety_svg, docs_diagrams_rtl_problem_svg [EXTRACTED 1.00]
- **Vazirmatn Font Integration** — chrome_plugin_fonts_notice_txt, desktop_adr_md, desktop_design_md, desktop_readme_md, vazirmatn_font [EXTRACTED 1.00]

## Communities (24 total, 5 thin omitted)

### Community 0 - "rtl-runtime.js"
Cohesion: 0.08
Nodes (74): applyAssistantLogicalLines(), applyAssistantNativeMessage(), applyAssistantNativeState(), applyAutoListDirection(), applyComposerNativeState(), applyListStructuralDirection(), applyResolvedDirection(), applyTechnicalProtection() (+66 more)

### Community 1 - "chatgpt-rtl-patcher.mjs"
Cohesion: 0.10
Nodes (38): args, candidateRoots(), customPath, desktopRoot, __dirname, ensureTargetClosed(), fail(), fontRoot (+30 more)

### Community 2 - "scripts"
Cohesion: 0.07
Nodes (29): bin, chatgpt-rtl-patcher, dependencies, @electron/asar, plist, description, engines, node (+21 more)

### Community 3 - "codex-classic-rtl.swift"
Cohesion: 0.17
Nodes (25): CoreGraphics, actionNames(), activateApp(), attr(), attrArray(), attributeNames(), attrString(), dumpTextNodes() (+17 more)

### Community 4 - "codex-rtl-launcher.mjs"
Cohesion: 0.12
Nodes (26): args, buildFontFaceBlocks(), buildInjectionSource(), canaryMode, cdpConnect(), createDiagnosticsReader(), createEnsureReader(), cssPath (+18 more)

### Community 5 - "content.js"
Cohesion: 0.18
Nodes (25): clearManagedBlocks(), clearManagedElement(), collectMessagesFromNode(), collectTextContainers(), countDirectionalRuns(), detectDirection(), extractDirectionalText(), findComposer() (+17 more)

### Community 6 - "manifest.json"
Cohesion: 0.09
Nodes (22): action, default_icon, default_popup, default_title, author, content_scripts, 128, 16 (+14 more)

### Community 7 - "codex-classic-probe.swift"
Cohesion: 0.24
Nodes (16): AppKit, ApplicationServices, attr(), attrArray(), attrString(), dumpTree(), findEditable(), isEditable() (+8 more)

### Community 9 - "chrome-plugin/package.json"
Cohesion: 0.17
Nodes (11): author, description, engines, node, license, name, private, scripts (+3 more)

### Community 10 - "chatgpt-rtl-patcher.test.mjs"
Cohesion: 0.17
Nodes (7): assertRunMatrix(), __dirname, patchCssPath, patcherPath, patchRuntimePath, pending, splitTextIntoDirectionalPiecesForTest()

### Community 11 - "package.json"
Cohesion: 0.20
Nodes (9): devDependencies, @electron/asar, @electron/asar, name, private, scripts, build, test (+1 more)

### Community 12 - "validate.mjs"
Cohesion: 0.33
Nodes (4): expectedMatches, manifest, requiredFiles, root

### Community 13 - "verify-patch.sh"
Cohesion: 0.53
Nodes (4): abort(), check(), run_node_list(), verify-patch.sh script

## Knowledge Gaps
- **90 isolated node(s):** `__dirname`, `patchCssPath`, `patchRuntimePath`, `patcherPath`, `pending` (+85 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Foundation` connect `codex-classic-probe.swift` to `codex-classic-rtl.swift`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Why does `AppKit` connect `codex-classic-probe.swift` to `codex-classic-rtl.swift`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **What connects `__dirname`, `patchCssPath`, `patchRuntimePath` to the rest of the system?**
  _90 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `rtl-runtime.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08210526315789474 - nodes in this community are weakly interconnected._
- **Should `chatgpt-rtl-patcher.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `codex-rtl-launcher.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.11904761904761904 - nodes in this community are weakly interconnected._