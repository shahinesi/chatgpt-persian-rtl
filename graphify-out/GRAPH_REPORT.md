# Graph Report - chatgpt-persian-rtl  (2026-07-24)

## Corpus Check
- 46 files · ~94,433 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 519 nodes · 1030 edges · 30 communities (25 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d3aac51c`
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
- codex-vscode-rtl-launcher.mjs
- codex-vscode-rtl-launcher.test.mjs
- scripts
- VS Code Codex RTL Design
- ADR: VS Code Codex RTL Runtime Injection
- 🌟 پچ راست‌چین Codex در VS Code

## God Nodes (most connected - your core abstractions)
1. `runForeground()` - 19 edges
2. `runDaemon()` - 18 edges
3. `runBackground()` - 17 edges
4. `log()` - 17 edges
5. `processTargetInfo()` - 14 edges
6. `watcherLoop()` - 14 edges
7. `scripts` - 14 edges
8. `sleep()` - 12 edges
9. `loadState()` - 12 edges
10. `applyResolvedDirection()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `README.md (Desktop)` --references--> `Vazirmatn Font`  [EXTRACTED]
  desktop/README.md → chrome-plugin/fonts/NOTICE.txt
- `main()` --calls--> `checkCDP()`  [EXTRACTED]
  vscode/bin/codex-vscode-rtl-diagnose.mjs → vscode/bin/vscode-rtl-state.mjs
- `main()` --calls--> `checkPid()`  [EXTRACTED]
  vscode/bin/codex-vscode-rtl-diagnose.mjs → vscode/bin/vscode-rtl-state.mjs
- `main()` --calls--> `launchctlIsLoaded()`  [EXTRACTED]
  vscode/bin/codex-vscode-rtl-diagnose.mjs → vscode/bin/vscode-rtl-state.mjs
- `main()` --calls--> `launchctlPrint()`  [EXTRACTED]
  vscode/bin/codex-vscode-rtl-diagnose.mjs → vscode/bin/vscode-rtl-state.mjs

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Multilingual README Translations** — readme_ar_md, readme_en_md, readme_fa_md, readme_he_md, readme_md [EXTRACTED 1.00]
- **Diagram References in Documentation** — docs_diagrams_chrome_flow_svg, docs_diagrams_desktop_patch_flow_svg, docs_diagrams_project_map_svg, docs_diagrams_restore_safety_svg, docs_diagrams_rtl_problem_svg [EXTRACTED 1.00]
- **Vazirmatn Font Integration** — chrome_plugin_fonts_notice_txt, desktop_adr_md, desktop_design_md, desktop_readme_md, vazirmatn_font [EXTRACTED 1.00]

## Communities (30 total, 5 thin omitted)

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

### Community 24 - "codex-vscode-rtl-launcher.mjs"
Cohesion: 0.06
Nodes (92): cdpConnect(), main(), sanitizeReportState(), assertNormalVSCodeAvailable(), buildCandidateState(), buildFontFaceBlocks(), buildInjectionSource(), buildJsonListTargetMap() (+84 more)

### Community 25 - "codex-vscode-rtl-launcher.test.mjs"
Cohesion: 0.15
Nodes (11): cssPath, desktopShared, __dirname, launcherPath, pendingTests, projectRoot, runtimePath, stateModulePath (+3 more)

### Community 26 - "scripts"
Cohesion: 0.15
Nodes (12): name, private, scripts, rtl:diagnose, rtl:launch, rtl:launch:bg, rtl:launch:bg:isolated, rtl:launch:isolated (+4 more)

### Community 27 - "VS Code Codex RTL Design"
Cohesion: 0.10
Nodes (19): 1. Launcher, 2. Shared state module, 3. Codex target resolution, 4. Runtime injection, 5. Background mode, 6. Diagnose command, 7. Stop command, Architecture (+11 more)

### Community 28 - "ADR: VS Code Codex RTL Runtime Injection"
Cohesion: 0.13
Nodes (14): 1. External launcher به‌جای patch داخلی, 2. Targeted webview injection, 3. Persistent runtime, 4. Shared font and bidi assets, 5. Background daemon with explicit state, ADR: VS Code Codex RTL Runtime Injection, Alternatives Considered, Benefits (+6 more)

### Community 29 - "🌟 پچ راست‌چین Codex در VS Code"
Cohesion: 0.17
Nodes (11): امنیت و حریم خصوصی, حالت‌ها, دستورها, رفتار اجرایی, لایسنس, محدودیت‌ها, مقایسه قبل و بعد, نصب سریع (+3 more)

## Knowledge Gaps
- **152 isolated node(s):** `Status`, `Context`, `1. External launcher به‌جای patch داخلی`, `2. Targeted webview injection`, `3. Persistent runtime` (+147 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `Status`, `Context`, `1. External launcher به‌جای patch داخلی` to the rest of the system?**
  _152 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `rtl-runtime.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08210526315789474 - nodes in this community are weakly interconnected._
- **Should `chatgpt-rtl-patcher.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `codex-rtl-launcher.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.11904761904761904 - nodes in this community are weakly interconnected._
- **Should `manifest.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `codex-vscode-rtl-launcher.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.06164527666736798 - nodes in this community are weakly interconnected._