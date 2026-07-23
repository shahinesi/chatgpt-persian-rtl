(() => {
  'use strict';

  const PATCH_ID = 'chatgpt-persian-rtl-desktop-runtime';
  const STYLE_ID = 'chatgpt-rtl-style';
  const BUILD_MARKER = __CHATGPT_RTL_BUILD__;
  const RUNTIME_SOURCE_HASH = __CHATGPT_RTL_RUNTIME_SHA256__;
  const CSS_SOURCE_HASH = __CHATGPT_RTL_CSS_SHA256__;
  const DIAGNOSTIC_MODE = __CHATGPT_RTL_DIAGNOSTIC_MODE__;
  const CSS = __CHATGPT_PERSIAN_RTL_CSS__;
  const COMPOSER_SELECTOR = '.ProseMirror, #prompt-textarea, [contenteditable="true"][role="textbox"], form textarea';
  const MESSAGE_ROOT_SELECTOR = [
    'article',
    '[role="article"]',
    '[data-testid*="conversation-turn"]',
    '[data-testid*="message"]',
    '[class*="message"]',
    '[class*="conversation"]',
    '[class*="turn"]',
    'div.text-size-chat',
    'div.text-size-chat.whitespace-pre-wrap',
    'div.text-size-chat.relative.w-full.min-w-0',
    'div.group.flex.w-full.flex-col.items-end.justify-end.gap-1',
    'div.group.flex.w-full.flex-col.items-start.justify-start.gap-1',
    'div.flex.flex-col.items-end.gap-1',
    'div.flex.flex-col.items-start.gap-1',
    '[data-local-conversation-final-assistant]',
    '[data-local-conversation-user-anchor]',
    '[data-user-message-bubble]',
    '[data-content-search-unit-key]'
  ].join(',');
  const BLOCK_SELECTOR = ['p', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'dd', 'dt', 'figcaption'].join(',');
  const TECHNICAL_SELECTOR = [
    'pre',
    'code',
    'kbd',
    'samp',
    'table',
    'math',
    '.katex',
    '.MathJax',
    '.CodeMirror',
    '.cm-editor',
    '.monaco-editor',
    '[data-math]',
    '[data-language]',
    '[class*="code"]'
  ].join(',');
  const INTERACTIVE_SELECTOR = [
    'button',
    '[role="button"]',
    'input',
    'textarea',
    'select',
    'option',
    'svg',
    '[aria-hidden="true"]'
  ].join(',');
  const RTL_CHAR = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;
  const URL_PATTERN = /https?:\/\/\S+|www\.\S+/giu;
  const LEADING_DECORATION = /^(?:[\s\u00a0\u200e\u200f\u202a-\u202e\u2066-\u2069]+|(?:[•●◦▪▫‣⁃*-]+|[-–—]+|(?:[\[(\{]\s*)?(?:\d+|[۰-۹]+)(?:[\].,):\}\]]\s*)?))/u;

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const previous = window[PATCH_ID];
  if (previous && typeof previous.destroy === 'function') {
    try {
      previous.destroy('reentry');
    } catch {}
  }

  const runtimeInstanceGlobal = '__CHATGPT_RTL_RUNTIME_INSTANCES__';
  const runtimeInstanceCount = Number(window[runtimeInstanceGlobal] || 0) + 1;
  window[runtimeInstanceGlobal] = runtimeInstanceCount;

  const state = {
    version: 3,
    installedAt: Date.now(),
    lastReason: 'boot',
    buildMarker: BUILD_MARKER,
    runtimeSourceHash: RUNTIME_SOURCE_HASH,
    cssSourceHash: CSS_SOURCE_HASH,
    diagnosticMode: Boolean(DIAGNOSTIC_MODE),
    errors: [],
    fontErrors: [],
    fontLoadResults: null,
    fontFaceEntries: [],
    fontFaceSources: [],
    fontCheck: null,
    fontReady: false,
    canvasMeasurement: null,
    refreshCount: 0,
    styleTextHash: '',
    styleElement: null,
    adoptedSheet: null,
    fontReadyPromise: null,
    observer: null,
    rootObserver: null,
    mutationQueue: new Set(),
    pendingFrame: 0,
    composer: null,
    composerState: new WeakMap(),
    composerBootstrapped: new WeakSet(),
    blockState: new WeakMap(),
    composerListeners: new Map(),
    composerRoots: new Set(),
    managedElements: new Set(),
    messageSignatures: new WeakMap(),
    pendingRootScan: false,
    proofSelector: '.ProseMirror',
    runtimeInstanceCount,
    counters: {
      inputEventCount: 0,
      compositionStartCount: 0,
      compositionEndCount: 0,
      scheduledUpdateCount: 0,
      appliedDirectionCount: 0,
      lastProcessedText: '',
      lastResolvedDirection: null,
      lastProcessedElement: null
    },
    ensure,
    destroy,
    flush,
    processMessage,
    queueMessage,
    diagnostics
  };

  window[PATCH_ID] = state;
  window.__CHATGPT_RTL_RUNTIME__ = state;
  window.__CHATGPT_RTL_BUILD__ = BUILD_MARKER;
  window.__CHATGPT_RTL_DIAGNOSTICS__ = state.diagnostics();

  function countTopLevelRules(css) {
    let depth = 0;
    let inString = null;
    let inComment = false;
    let count = 0;

    for (let index = 0; index < css.length; index += 1) {
      const char = css[index];
      const next = css[index + 1];

      if (inComment) {
        if (char === '*' && next === '/') {
          inComment = false;
          index += 1;
        }
        continue;
      }

      if (inString) {
        if (char === '\\') {
          index += 1;
          continue;
        }
        if (char === inString) {
          inString = null;
        }
        continue;
      }

      if (char === '/' && next === '*') {
        inComment = true;
        index += 1;
        continue;
      }

      if (char === '"' || char === "'") {
        inString = char;
        continue;
      }

      if (char === '{') {
        if (depth === 0) count += 1;
        depth += 1;
        continue;
      }

      if (char === '}') {
        depth = Math.max(0, depth - 1);
      }
    }

    return count;
  }

  function normalizeDirectionalSample(text) {
    if (!text) return '';

    let sample = text.replace(URL_PATTERN, ' ');
    sample = sample.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '');

    let previous = '';
    while (sample !== previous) {
      previous = sample;
      sample = sample.replace(LEADING_DECORATION, '');
    }

    return sample.replace(/\s+/gu, ' ').trim();
  }

  function resolveBaseDirection(text) {
    const sample = normalizeDirectionalSample(text);
    if (!sample) return null;

    for (const char of sample) {
      if (RTL_CHAR.test(char)) return 'rtl';
      if (/[A-Za-z]/u.test(char)) return 'ltr';
    }
    return null;
  }

  function setAttributeIfChanged(element, name, value) {
    if (value == null) {
      if (element.hasAttribute(name)) element.removeAttribute(name);
      return;
    }

    if (element.getAttribute(name) !== value) {
      element.setAttribute(name, value);
    }
  }

  function setStyleIfChanged(element, property, value) {
    if (element.style.getPropertyValue(property) !== value) {
      element.style.setProperty(property, value, 'important');
    }
  }

  function removeStyleIfPresent(element, property) {
    if (element.style.getPropertyValue(property)) {
      element.style.removeProperty(property);
    }
  }

  function isExcludedElement(element, boundary) {
    if (!element || !boundary.contains(element)) return true;

    const technicalParent = element.closest(TECHNICAL_SELECTOR);
    if (technicalParent && boundary.contains(technicalParent)) return true;

    const interactiveParent = element.closest(INTERACTIVE_SELECTOR);
    return Boolean(interactiveParent && boundary.contains(interactiveParent));
  }

  function extractDirectionalText(element) {
    if (!element) return '';

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return isExcludedElement(node.parentElement, element)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      }
    });

    const parts = [];
    let current = walker.nextNode();
    while (current) {
      parts.push(current.nodeValue);
      current = walker.nextNode();
    }

    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  function getManagedState(element) {
    let managed = state.blockState.get(element);
    if (!managed) {
      managed = {
        version: 0,
        frameId: 0,
        composing: false,
        lastDirection: null,
        lastSignature: '',
        lastRole: null,
        lastManagedTag: null
      };
      state.blockState.set(element, managed);
      state.managedElements.add(element);
    }
    return managed;
  }

  function publishDiagnostics() {
    const snapshot = diagnostics();
    window.__CHATGPT_RTL_DIAGNOSTICS__ = snapshot;
    return snapshot;
  }

  function disconnectComposerListeners() {
    for (const [root, listeners] of state.composerListeners.entries()) {
      try {
        root.removeEventListener('input', listeners.onInput);
        root.removeEventListener('compositionstart', listeners.onCompositionStart);
        root.removeEventListener('compositionend', listeners.onCompositionEnd);
        root.removeEventListener('paste', listeners.onPaste);
        root.removeEventListener('focus', listeners.onFocus, true);
      } catch {}
    }
    state.composerListeners.clear();
  }

  function clearManagedStyles(element, preserveRole = false) {
    if (!preserveRole) {
      delete element.dataset.cgptRtlRole;
      element.removeAttribute('data-cgpt-rtl-role');
    }

    delete element.dataset.cgptRtlDir;
    element.removeAttribute('dir');
    element.removeAttribute('data-cgpt-rtl-dir');
    element.removeAttribute('data-cgpt-rtl-managed');
    removeStyleIfPresent(element, 'direction');
    removeStyleIfPresent(element, 'text-align');
    removeStyleIfPresent(element, 'unicode-bidi');
  }

  function clearManagedStylesPreservingDirection(element, preserveRole = false) {
    if (!(element instanceof HTMLElement)) return;
    if (!preserveRole) {
      delete element.dataset.cgptRtlRole;
      element.removeAttribute('data-cgpt-rtl-role');
    }

    element.removeAttribute('data-cgpt-rtl-dir');
    element.removeAttribute('data-cgpt-rtl-managed');
    removeStyleIfPresent(element, 'direction');
    removeStyleIfPresent(element, 'text-align');
    removeStyleIfPresent(element, 'unicode-bidi');
  }

  function isEligibleManagedBlock(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (isTechnicalElement(element)) return false;
    if (element.matches('p, h1, h2, h3, h4, h5, h6')) return true;
    if (!element.matches('li')) return false;
    return !element.querySelector('p, h1, h2, h3, h4, h5, h6, blockquote, pre, code, kbd, samp, [data-language], .monaco-editor, .cm-editor, .CodeMirror, table, ul, ol, article, section');
  }

  function isTechnicalElement(element) {
    if (!(element instanceof Element)) return false;
    return Boolean(
      element.closest('pre, code, kbd, samp, [data-language], .monaco-editor, .cm-editor, .CodeMirror, .katex, .MathJax, [data-math]')
    );
  }

  function isAssistantUnitKey(value) {
    if (!value) return false;
    return /(?:^|:)assistant\b/u.test(String(value));
  }

  function isAssistantMessageRoot(element) {
    if (!(element instanceof Element)) return false;
    if (element.closest('[data-local-conversation-final-assistant]')) return true;
    if (element.closest('[data-local-conversation-assistant]')) return true;
    const unit = element.closest('[data-content-search-unit-key]');
    if (unit && isAssistantUnitKey(unit.getAttribute('data-content-search-unit-key'))) return true;
    return false;
  }

  function clearTechnicalState(root) {
    if (!(root instanceof Element)) return;

    root.querySelectorAll('pre, code, kbd, samp, [data-language], .monaco-editor, .cm-editor, .CodeMirror, .katex, .MathJax, [data-math]').forEach((element) => {
      clearManagedStyles(element);
    });
  }

  function applyTechnicalProtection(root) {
    if (!(root instanceof Element)) return [];

    const protectedBlocks = [];
    const selectors = 'pre, code, kbd, samp, [data-language], .monaco-editor, .cm-editor, .CodeMirror, .katex, .MathJax, [data-math]';
    root.querySelectorAll(selectors).forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      clearManagedStyles(element);
      element.setAttribute('dir', 'ltr');
      setStyleIfChanged(element, 'direction', 'ltr');
      setStyleIfChanged(element, 'text-align', 'left');
      setStyleIfChanged(element, 'unicode-bidi', 'isolate');
      setStyleIfChanged(element, 'writing-mode', 'horizontal-tb');
      protectedBlocks.push(element);
    });
    return protectedBlocks;
  }

  function cleanupLegacyBidiState(root = document) {
    if (!(root instanceof Document || root instanceof Element)) return;

    cleanupLegacyAssistantRuntimeState(root);

    root.querySelectorAll('[data-cgpt-user-bubble-dir]').forEach((element) => {
      element.removeAttribute('data-cgpt-user-bubble-dir');
      removeStyleIfPresent(element, 'margin-inline-start');
      removeStyleIfPresent(element, 'margin-inline-end');
    });

    root.querySelectorAll('[data-cgpt-rtl-role="message"], [data-cgpt-rtl-managed="message-text"]').forEach((element) => {
      clearManagedStyles(element);
    });

    root.querySelectorAll('.ProseMirror, #prompt-textarea, [contenteditable="true"], form textarea, ol, ul, li').forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      clearManagedStylesPreservingDirection(element);
    });

    applyTechnicalProtection(root);
  }

  function isComposerElement(element) {
    return Boolean(
      element instanceof Element &&
      (element.closest('.ProseMirror') ||
        element.closest('[contenteditable="true"]') ||
        element.closest('#prompt-textarea') ||
        element.closest('form textarea'))
    );
  }

  function clearComposerManagedState(root, clearDescendants = true) {
    if (!(root instanceof HTMLElement)) return;

    root.removeAttribute('data-cgpt-rtl-role');
    root.removeAttribute('data-cgpt-rtl-managed');
    root.removeAttribute('data-cgpt-rtl-composer');
    removeStyleIfPresent(root, 'direction');
    removeStyleIfPresent(root, 'text-align');
    removeStyleIfPresent(root, 'unicode-bidi');

    if (clearDescendants) {
      root.querySelectorAll('[data-cgpt-rtl-role], [data-cgpt-rtl-managed]').forEach((element) => {
        clearManagedStylesPreservingDirection(element);
      });
    }
  }

  function applyComposerNativeState(root, clearDescendants = false) {
    if (!(root instanceof HTMLElement)) return null;

    clearComposerManagedState(root, clearDescendants);

    const blocks = [root, ...collectManagedBlocks(root, false)];
    for (const block of blocks) {
      if (!(block instanceof HTMLElement)) continue;
      if (isExcludedElement(block, root)) continue;
      if (block.dataset.cgptRtlManaged !== 'composer-text') {
        block.dataset.cgptRtlManaged = 'composer-text';
      }
      setAttributeIfChanged(block, 'dir', 'auto');
      setStyleIfChanged(block, 'unicode-bidi', 'plaintext');
      setStyleIfChanged(block, 'text-align', 'start');
      removeStyleIfPresent(block, 'direction');
    }

    const managed = getManagedState(root);
    managed.lastRole = null;
    managed.lastManagedTag = 'composer-text';
    managed.lastSignature = `composer:${normalizeSignature(getComposerText(root))}`;
    return root;
  }

  function cleanupLegacyAssistantRuntimeState(root) {
    if (!(root instanceof Element)) return;

    migrateObsoleteLogicalWrappers(root);

    root.querySelectorAll('[data-cgpt-list-structure-dir], [data-cgpt-list-dir]').forEach((element) => {
      element.removeAttribute('data-cgpt-list-structure-dir');
      element.removeAttribute('data-cgpt-list-dir');
      removeStyleIfPresent(element, 'direction');
      removeStyleIfPresent(element, 'text-align');
      removeStyleIfPresent(element, 'unicode-bidi');
      if (element.matches('li')) {
        element.removeAttribute('dir');
      }
    });

    root.querySelectorAll('[data-cgpt-rtl-managed="assistant-text"], [data-cgpt-rtl-role="assistant"], [data-cgpt-rtl-dir]').forEach((element) => {
      element.removeAttribute('data-cgpt-rtl-managed');
      element.removeAttribute('data-cgpt-rtl-role');
      element.removeAttribute('data-cgpt-rtl-dir');
      removeStyleIfPresent(element, 'direction');
      removeStyleIfPresent(element, 'text-align');
      removeStyleIfPresent(element, 'unicode-bidi');
    });
  }

  function applyAssistantNativeState(element) {
    if (!(element instanceof HTMLElement)) return null;
    if (isComposerElement(element)) return null;
    if (isTechnicalElement(element)) return null;

    const isLeafBlock = element.matches('p, h1, h2, h3, h4, h5, h6, blockquote') || (element.matches('li') && isEligibleManagedBlock(element));
    const isListStructure = element.matches('ol, ul, li');
    if (!isLeafBlock && !isListStructure) return null;

    const managed = getManagedState(element);
    const sample = normalizeSignature(extractDirectionalText(element));
    const marker = isLeafBlock ? 'assistant-text' : null;
    const signature = `assistant-native:${marker || 'list'}:${sample.slice(0, 2000)}`;

    if (
      managed.lastSignature === signature &&
      element.getAttribute('dir') === 'auto' &&
      (!marker || element.dataset.cgptRtlManaged === marker)
    ) {
      return { direction: 'auto', empty: !sample, unchanged: true };
    }

    managed.lastSignature = signature;
    managed.lastDirection = 'auto';
    managed.lastRole = 'assistant';
    managed.lastManagedTag = marker || 'assistant-list';

    if (marker) {
      element.dataset.cgptRtlManaged = marker;
      element.removeAttribute('data-cgpt-rtl-role');
      element.removeAttribute('data-cgpt-rtl-dir');
    } else {
      element.removeAttribute('data-cgpt-rtl-managed');
      element.removeAttribute('data-cgpt-rtl-role');
      element.removeAttribute('data-cgpt-rtl-dir');
    }

    setAttributeIfChanged(element, 'dir', 'auto');
    removeStyleIfPresent(element, 'direction');
    removeStyleIfPresent(element, 'text-align');
    removeStyleIfPresent(element, 'unicode-bidi');

    return {
      direction: 'auto',
      empty: !sample
    };
  }

  function extractDirectionalTextFromNodes(nodes) {
    const parts = [];
    for (const node of nodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.nodeValue) parts.push(node.nodeValue);
        continue;
      }

      if (node instanceof Element) {
        if (node.matches('br')) continue;
        parts.push(node.textContent || '');
      }
    }

    return parts.join('');
  }

  function charStrongDirection(char) {
    if (RTL_CHAR.test(char)) return 'rtl';
    if (/[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/u.test(char)) return 'ltr';
    return null;
  }

  function resolveFlowDirection(text, fallback = null) {
    const sample = normalizeDirectionalSample(text);
    if (!sample) return fallback;
    return resolveBaseDirection(sample) || fallback;
  }

  function isAtomicLtrText(text) {
    const value = String(text || '').trim();
    if (!value) return false;
    if (/^(?:https?:\/\/\S+|www\.\S+)/iu.test(value)) return true;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) return true;
    if (/^(?:[A-Za-z]:\\|\/|\.\/|\.\.\/)[\w./\\-]+$/u.test(value)) return true;
    return false;
  }

  function splitTextIntoDirectionalPieces(text) {
    const source = String(text || '');
    if (!source) return [];

    const tokens = [];
    const atomicRe = /https?:\/\/\S+|www\.\S+|[^\s@]+@[^\s@]+\.[^\s@]+|(?:[A-Za-z]:\\|\/|\.\/|\.\.\/)[\w./\\-]+/giu;
    let lastIndex = 0;
    let match;
    while ((match = atomicRe.exec(source)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({ type: 'text', text: source.slice(lastIndex, match.index) });
      }
      tokens.push({ type: 'atomic-ltr', text: match[0] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < source.length) {
      tokens.push({ type: 'text', text: source.slice(lastIndex) });
    }

    const pieces = [];
    let currentDir = null;
    let currentText = '';
    let leading = '';

    const flush = () => {
      if (currentDir && currentText) {
        pieces.push({ dir: currentDir, text: currentText });
      }
      currentDir = null;
      currentText = '';
    };

    for (const token of tokens) {
      if (token.type === 'atomic-ltr') {
        if (!currentDir) {
          currentDir = 'ltr';
          currentText = leading + token.text;
          leading = '';
        } else if (currentDir === 'ltr') {
          currentText += token.text;
        } else {
          flush();
          currentDir = 'ltr';
          currentText = token.text;
        }
        continue;
      }

      for (const char of Array.from(token.text)) {
        const charDir = charStrongDirection(char);
        if (charDir) {
          if (!currentDir) {
            currentDir = charDir;
            currentText = leading + char;
            leading = '';
            continue;
          }
          if (currentDir === charDir) {
            currentText += char;
            continue;
          }
          flush();
          currentDir = charDir;
          currentText = char;
          continue;
        }

        if (currentDir) {
          currentText += char;
        } else {
          leading += char;
        }
      }
    }

    if (currentDir) {
      pieces.push({ dir: currentDir, text: currentText });
    } else if (leading) {
      pieces.push({ dir: resolveFlowDirection(leading, 'ltr'), text: leading });
    }

    return pieces;
  }

  function isAtomicLtrElement(node) {
    if (!(node instanceof Element)) return false;
    return node.matches('code, kbd, samp, a[href], [data-language], .monaco-editor, .cm-editor, .CodeMirror, math, .katex, .MathJax, [data-math]');
  }

  function splitNodeIntoDirectionalPieces(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return splitTextIntoDirectionalPieces(node.nodeValue || '').map((piece) => ({
        dir: piece.dir,
        node: document.createTextNode(piece.text)
      }));
    }

    if (!(node instanceof Element)) return [];
    if (node.matches('br')) return [];

    if (isTechnicalElement(node) || isAtomicLtrElement(node)) {
      return [{
        dir: 'ltr',
        node: node.cloneNode(true)
      }];
    }

    const childPieces = [];
    for (const child of node.childNodes) {
      childPieces.push(...splitNodeIntoDirectionalPieces(child));
    }

    if (childPieces.length === 0) {
      const text = node.textContent || '';
      if (!text) return [];
      const dir = resolveFlowDirection(text, 'ltr');
      return [{
        dir,
        node: node.cloneNode(true)
      }];
    }

    const pieces = [];
    let currentPiece = null;
    for (const piece of childPieces) {
      if (!currentPiece || currentPiece.dir !== piece.dir) {
        currentPiece = {
          dir: piece.dir,
          node: node.cloneNode(false)
        };
        pieces.push(currentPiece);
      }
      currentPiece.node.appendChild(piece.node);
    }

    return pieces.map((piece) => ({
      dir: piece.dir,
      node: piece.node
    }));
  }

  function segmentDirectionalRuns(nodes) {
    const pieces = [];
    for (const node of nodes) {
      pieces.push(...splitNodeIntoDirectionalPieces(node));
    }

    if (pieces.length === 0) return [];

    const runs = [];
    let current = null;
    for (const piece of pieces) {
      if (!current || current.dir !== piece.dir) {
        current = { dir: piece.dir, nodes: [] };
        runs.push(current);
      }
      current.nodes.push(piece.node);
    }
    return runs;
  }

  function buildLogicalLine(nodes, flowDir) {
    const originalText = extractDirectionalTextFromNodes(nodes);
    if (!originalText.trim()) return null;

    const runs = segmentDirectionalRuns(nodes);
    if (runs.length === 0) return null;

    const resolvedFlow = flowDir || resolveFlowDirection(originalText, 'ltr');
    const uniqueDirs = new Set(runs.map((run) => run.dir));
    const isMixed = uniqueDirs.size > 1;
    const isOppositePure = !isMixed && runs.length === 1 && runs[0].dir !== resolvedFlow;

    if (!isMixed && !isOppositePure) return null;

    const container = document.createElement('span');
    container.dataset.cgptLogicalLine = 'assistant';
    container.dataset.cgptFlowDir = resolvedFlow;
    container.setAttribute('dir', resolvedFlow);

    for (const run of runs) {
      const bdi = document.createElement('bdi');
      bdi.dataset.cgptBidiRun = run.dir;
      bdi.setAttribute('dir', run.dir);
      for (const child of run.nodes) {
        bdi.appendChild(child);
      }
      container.appendChild(bdi);
    }

    if ((container.textContent || '') !== originalText) return null;
    return container;
  }

  function discoverLogicalLineSegments(host) {
    const segments = [];
    let current = [];

    const flush = () => {
      if (current.length === 0) return;
      segments.push(current);
      current = [];
    };

    for (const node of Array.from(host.childNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
        flush();
        continue;
      }

      if (node.nodeType === Node.ELEMENT_NODE && node.matches('[data-cgpt-logical-line="assistant"]')) {
        flush();
        continue;
      }

      if (node.nodeType === Node.ELEMENT_NODE && node.matches('p, h1, h2, h3, h4, h5, h6, blockquote, ul, ol, li, pre, table')) {
        flush();
        continue;
      }

      current.push(node);
    }

    flush();
    return segments;
  }

  function applyAssistantLogicalLines(host, flowDir) {
    if (!(host instanceof HTMLElement)) return false;
    if (isComposerElement(host) || isTechnicalElement(host)) return false;
    if (host.matches('[data-cgpt-logical-line="assistant"]')) return false;
    if (host.querySelector(':scope > [data-cgpt-logical-line="assistant"]') && !host.querySelector(':scope > br')) {
      const onlyLogical = Array.from(host.childNodes).every((node) => {
        if (node.nodeType === Node.TEXT_NODE && !(node.nodeValue || '').trim()) return true;
        return node.nodeType === Node.ELEMENT_NODE && node.matches('[data-cgpt-logical-line="assistant"], br');
      });
      if (onlyLogical) return false;
    }

    const segments = discoverLogicalLineSegments(host);
    if (segments.length === 0) return false;

    let transformed = false;
    for (const segment of segments) {
      if (segment.some((node) => node instanceof Element && node.matches('[data-cgpt-logical-line="assistant"]'))) {
        continue;
      }

      const line = buildLogicalLine(segment, flowDir);
      if (!line) continue;

      const firstNode = segment[0];
      if (!firstNode || !firstNode.parentNode) continue;

      firstNode.parentNode.insertBefore(line, firstNode);
      for (const node of segment) {
        if (node.parentNode) node.parentNode.removeChild(node);
      }
      transformed = true;
    }

    return transformed;
  }

  function resolveListFlowDirection(list) {
    if (!(list instanceof HTMLElement)) return null;
    const items = Array.from(list.children).filter((child) => child instanceof HTMLElement && child.matches('li'));
    for (const item of items) {
      const sample = normalizeDirectionalSample(extractDirectionalText(item));
      if (!sample) continue;
      return resolveBaseDirection(sample);
    }
    return null;
  }

  function applyListStructuralDirection(list) {
    if (!(list instanceof HTMLElement)) return null;
    if (!list.matches('ol, ul')) return null;
    if (isComposerElement(list) || isTechnicalElement(list)) return null;

    const flow = resolveListFlowDirection(list);
    if (!flow) {
      list.removeAttribute('data-cgpt-list-direction');
      removeStyleIfPresent(list, 'direction');
      removeStyleIfPresent(list, 'text-align');
      return null;
    }

    if (list.dataset.cgptListDirection !== flow) {
      list.dataset.cgptListDirection = flow;
    }
    removeStyleIfPresent(list, 'text-align');
    removeStyleIfPresent(list, 'unicode-bidi');
    return flow;
  }

  function migrateObsoleteLogicalWrappers(root) {
    if (!(root instanceof Element)) return;

    root.querySelectorAll('[data-cgpt-mixed-line="assistant"], [data-cgpt-bidi-line="assistant"], [data-cgpt-rtl-line="assistant"]').forEach((wrapper) => {
      if (!(wrapper instanceof HTMLElement)) return;
      const parent = wrapper.parentElement;
      if (!parent) return;

      while (wrapper.firstChild) {
        parent.insertBefore(wrapper.firstChild, wrapper);
      }
      wrapper.remove();
    });
  }

  function applyAssistantNativeMessage(messageRoot) {
    if (!(messageRoot instanceof HTMLElement)) return [];
    if (isComposerElement(messageRoot)) return [];
    if (inferMessageManagedTag(messageRoot) !== 'assistant-text') return [];

    migrateObsoleteLogicalWrappers(messageRoot);

    const applied = new Set();
    const blockSelector = 'p, h1, h2, h3, h4, h5, h6, blockquote, li';

    messageRoot.querySelectorAll('ol, ul').forEach((list) => {
      if (!(list instanceof HTMLElement)) return;
      if (!messageRoot.contains(list)) return;
      if (isTechnicalElement(list)) return;
      applyListStructuralDirection(list);
      applied.add(list);
    });

    if (messageRoot.matches('ol, ul')) {
      applyListStructuralDirection(messageRoot);
      applied.add(messageRoot);
    }

    const processHost = (host) => {
      if (!(host instanceof HTMLElement)) return;
      if (!messageRoot.contains(host) && host !== messageRoot) return;
      if (isTechnicalElement(host)) return;

      let flowDir = resolveFlowDirection(extractDirectionalText(host), null);
      const list = host.closest('ol, ul');
      if (list instanceof HTMLElement) {
        const listFlow = list.dataset.cgptListDirection || applyListStructuralDirection(list);
        if (listFlow) flowDir = listFlow;
      }

      if (applyAssistantLogicalLines(host, flowDir)) {
        applied.add(host);
      }

      const result = applyAssistantNativeState(host);
      if (result) applied.add(host);
    };

    if (messageRoot.matches(blockSelector)) processHost(messageRoot);
    messageRoot.querySelectorAll(blockSelector).forEach(processHost);

    return [...applied];
  }

  function applyAutoListDirection(element) {
    if (!(element instanceof HTMLElement)) return null;
    if (isComposerElement(element)) return null;

    if (element.matches('ol, ul') && isAssistantMessageRoot(element)) {
      const flow = applyListStructuralDirection(element);
      return flow ? { direction: flow, empty: false } : null;
    }

    if (element.matches('li') && isAssistantMessageRoot(element)) {
      const list = element.parentElement;
      if (list instanceof HTMLElement && list.matches('ol, ul')) {
        applyListStructuralDirection(list);
      }
      return { direction: list?.dataset?.cgptListDirection || null, empty: false };
    }

    if (isExcludedElement(element, element.parentElement || element)) return null;

    const managed = getManagedState(element);
    const sample = normalizeDirectionalSample(extractDirectionalText(element));
    const signature = `list:auto:${sample.slice(0, 2000)}`;

    if (managed.lastSignature === signature && element.getAttribute('dir') === 'auto') {
      return { direction: 'auto', empty: !sample, unchanged: true };
    }

    managed.lastSignature = signature;
    managed.lastDirection = 'auto';
    managed.lastRole = null;
    managed.lastManagedTag = null;

    clearManagedStylesPreservingDirection(element);
    setAttributeIfChanged(element, 'dir', 'auto');
    return {
      direction: 'auto',
      empty: !sample
    };
  }

  function applyResolvedDirection(element, role, managedTag, text) {
    if (!(element instanceof HTMLElement)) return null;
    if (isExcludedElement(element, element.parentElement || element)) return null;
    if (isComposerElement(element)) return null;

    const sample = normalizeDirectionalSample(text ?? extractDirectionalText(element));
    const nextDirection = sample ? resolveBaseDirection(sample) : null;
    const managed = getManagedState(element);
    const signature = `${role}:${managedTag}:${nextDirection || 'neutral'}:${sample.slice(0, 2000)}`;

    if (
      managed.lastSignature === signature &&
      element.getAttribute('dir') === (nextDirection || null) &&
      element.dataset.cgptRtlRole === role &&
      element.dataset.cgptRtlManaged === managedTag
    ) {
      return { direction: nextDirection, empty: !sample, unchanged: true };
    }

    managed.lastSignature = signature;
    managed.lastDirection = nextDirection;
    managed.lastRole = role;
    managed.lastManagedTag = managedTag;
    state.counters.appliedDirectionCount += 1;
    state.counters.lastProcessedText = sample;
    state.counters.lastResolvedDirection = nextDirection;
    state.counters.lastProcessedElement = element;

    if (element.dataset.cgptRtlRole !== role) {
      element.dataset.cgptRtlRole = role;
    }

    if (element.dataset.cgptRtlManaged !== managedTag) {
      element.dataset.cgptRtlManaged = managedTag;
    }

    if (nextDirection) {
      setAttributeIfChanged(element, 'dir', nextDirection);
    } else {
      element.removeAttribute('dir');
    }

    setStyleIfChanged(element, 'unicode-bidi', 'plaintext');
    if (nextDirection) {
      if (element.dataset.cgptRtlDir !== nextDirection) {
        element.dataset.cgptRtlDir = nextDirection;
      }
      setStyleIfChanged(element, 'direction', nextDirection);
      setStyleIfChanged(element, 'text-align', nextDirection === 'rtl' ? 'right' : 'left');
    } else {
      delete element.dataset.cgptRtlDir;
      element.removeAttribute('data-cgpt-rtl-dir');
      removeStyleIfPresent(element, 'direction');
      removeStyleIfPresent(element, 'text-align');
    }

    return {
      direction: nextDirection,
      empty: !sample
    };
  }

  function nearestSafeTextContainer(node, boundary) {
    let element = node.parentElement;
    while (element && element !== boundary) {
      if (isExcludedElement(element, boundary)) return null;
      if (isEligibleManagedBlock(element)) return element;

      const parent = element.parentElement;
      if (!parent || parent === boundary) return null;
      element = parent;
    }

    return isEligibleManagedBlock(boundary) ? boundary : null;
  }

  function collectManagedBlocks(root, includeRootFallback = true) {
    const containers = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return isExcludedElement(node.parentElement, root)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      }
    });

    let current = walker.nextNode();
    while (current) {
      const container = nearestSafeTextContainer(current, root);
      if (container) containers.add(container);
      current = walker.nextNode();
    }

    if (containers.size === 0 && includeRootFallback && isEligibleManagedBlock(root)) {
      const rootText = extractDirectionalText(root);
      if (rootText) containers.add(root);
    }

    return containers;
  }

  function normalizeSignature(text) {
    return normalizeDirectionalSample(text).slice(0, 2000);
  }

  function reclassifyAssistantDescendants(root) {
    if (!(root instanceof Element)) return 0;
    let cleared = 0;
    const selector = '[data-cgpt-rtl-managed="message-text"], [data-cgpt-rtl-role="message"]';
    const walk = (node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node !== root && node.matches(selector)) {
          clearManagedStyles(node);
          cleared++;
        }
        for (const child of node.children) walk(child);
      }
    };
    walk(root);
    return cleared;
  }

  function reclassifyStaleAssistantNodes(root) {
    if (!(root instanceof Element)) return 0;
    let cleared = 0;
    const roots = [];
    root.querySelectorAll('[data-local-conversation-final-assistant], [data-local-conversation-assistant]').forEach((el) => {
      if (el instanceof HTMLElement) roots.push(el);
    });
    root.querySelectorAll('[data-content-search-unit-key]').forEach((el) => {
      if (el instanceof HTMLElement && isAssistantUnitKey(el.getAttribute('data-content-search-unit-key'))) roots.push(el);
    });
    for (const r of roots) {
      cleared += reclassifyAssistantDescendants(r);
    }
    return cleared;
  }

  function inferMessageManagedTag(root) {
    if (isComposerElement(root)) return 'composer-text';
    if (isTechnicalElement(root)) return 'assistant-text';

    const attrRole = root.closest('[data-message-author-role]')?.getAttribute('data-message-author-role');
    if (attrRole === 'user') return 'user-text';
    if (attrRole === 'assistant') return 'assistant-text';

    if (root.closest('[data-user-message-bubble]')) return 'user-text';
    if (root.closest('[data-local-conversation-user-anchor]')) return 'user-text';

    if (isAssistantMessageRoot(root)) return 'assistant-text';

    const userContainer = root.closest([
      'div.group.flex.w-full.flex-col.items-end.justify-end.gap-1',
      'div.flex.flex-col.items-end.gap-1',
      'div.text-size-chat.relative.w-full.min-w-0.items-end',
      '[data-testid*="message"][class*="items-end"]',
      '[data-testid*="conversation-turn"][class*="items-end"]'
    ].join(','));
    if (userContainer) return 'user-text';

    const assistantContainer = root.closest([
      'div.group.flex.w-full.flex-col.items-start.justify-start.gap-1',
      'div.flex.flex-col.items-start.gap-1',
      'div.text-size-chat.relative.w-full.min-w-0.items-start',
      '[data-testid*="message"][class*="items-start"]',
      '[data-testid*="conversation-turn"][class*="items-start"]'
    ].join(','));
    if (assistantContainer) return 'assistant-text';

    return 'message-text';
  }

  function updateManagedBlocks(root, role, managedTag, includeRootFallback = true) {
    if (!(root instanceof Element)) return [];
    if (isComposerElement(root)) return [];
    if (managedTag === 'assistant-text') return [];

    const blocks = collectManagedBlocks(root, includeRootFallback);
    const applied = new Set();
    const listBlocks = new Set();
    for (const block of blocks) {
      if (block.matches('li')) {
        listBlocks.add(block);
        continue;
      }
      const text = extractDirectionalText(block);
      const result = applyResolvedDirection(block, role, managedTag, text);
      if (result) applied.add(block);
    }

    root.querySelectorAll('ol, ul, li').forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      if (isComposerElement(element)) return;
      applyAutoListDirection(element);
    });

    listBlocks.forEach((block) => {
      const result = applyAutoListDirection(block);
      if (result) applied.add(block);
    });

    root
      .querySelectorAll('[data-cgpt-rtl-role], [data-cgpt-rtl-managed]')
      .forEach((element) => {
        if (applied.has(element)) return;
        const managed = state.blockState.get(element);
        if (managed) {
          managed.lastSignature = '';
        }
        clearManagedStyles(element);
      });

    if (!applied.has(root) && root.matches?.('[data-cgpt-rtl-role], [data-cgpt-rtl-managed]')) {
      clearManagedStyles(root);
    }

    return [...applied];
  }

  function processMessage(message) {
    if (!(message instanceof Element)) return;
    if (isComposerElement(message)) return;

    const text = extractDirectionalText(message);
    const signature = normalizeSignature(text);
    state.messageSignatures.set(message, signature);

    clearTechnicalState(message);
    applyTechnicalProtection(message);

    if (isAssistantMessageRoot(message) && !message.closest('[data-user-message-bubble]') && !message.closest('[data-local-conversation-user-anchor]')) {
      reclassifyAssistantDescendants(message);
      applyAssistantNativeMessage(message);
      return;
    }

    const managedTag = inferMessageManagedTag(message);
    if (managedTag === 'assistant-text') {
      reclassifyAssistantDescendants(message);
      applyAssistantNativeMessage(message);
      return;
    }

    updateManagedBlocks(message, 'message', managedTag, true);
  }

  function getComposerState(root) {
    let composerState = state.composerState.get(root);
    if (!composerState) {
      composerState = {
        composing: false,
        version: 0,
        frameId: 0,
        lastActiveBlock: null
      };
      state.composerState.set(root, composerState);
    }
    return composerState;
  }

  function getComposerBlocks(root) {
    if (root instanceof HTMLTextAreaElement) return [root];
    return [...collectManagedBlocks(root, false)];
  }

  function getComposerTargetBlock(root, target = null) {
    if (root instanceof HTMLTextAreaElement) return root;

    const candidateNode = target && root.contains(target) ? target : document.getSelection()?.anchorNode;
    if (candidateNode) {
      const element = candidateNode.nodeType === Node.TEXT_NODE ? candidateNode.parentElement : candidateNode;
      if (element instanceof Element && root.contains(element)) {
        const block = element.closest(BLOCK_SELECTOR);
        if (block && root.contains(block)) return block;
      }
    }

    const blocks = getComposerBlocks(root);
    return blocks[0] || null;
  }

  function composerNeedsRefresh(root) {
    if (!(root instanceof HTMLElement)) return false;
    if (root.dataset.cgptRtlManaged !== 'composer-text' || root.getAttribute('dir') !== 'auto') return true;

    for (const block of collectManagedBlocks(root, false)) {
      if (!(block instanceof HTMLElement)) continue;
      if (block.dataset.cgptRtlManaged !== 'composer-text') return true;
      if (block.getAttribute('dir') !== 'auto') return true;
    }

    return false;
  }

  function scheduleManagedResolution(element, role, managedTag, textGetter) {
    if (!(element instanceof HTMLElement)) return;
    const managed = getManagedState(element);
    managed.version += 1;
    const token = managed.version;
    state.counters.scheduledUpdateCount += 1;

    if (managed.frameId) {
      cancelAnimationFrame(managed.frameId);
      managed.frameId = 0;
    }

    queueMicrotask(() => {
      if (!document.contains(element) || managed.version !== token) return;
      managed.frameId = requestAnimationFrame(() => {
        if (!document.contains(element) || managed.version !== token) return;
        managed.frameId = 0;
        applyResolvedDirection(element, role, managedTag, textGetter());
      });
    });
  }

  function updateComposerBlocks(root, reason = 'scan') {
    if (!(root instanceof HTMLElement)) return [];

    applyComposerNativeState(root, reason === 'boot' || reason === 'rescan');

    if (reason === 'boot' || reason === 'rescan') {
      state.pendingRootScan = false;
    }

    return [root];
  }

  function bindComposerListeners(root) {
    if (!(root instanceof HTMLElement)) return null;
    if (!state.composerListeners.has(root)) {
      state.composerListeners.set(root, {
        state: getComposerState(root)
      });
    }
    return state.composerListeners.get(root)?.state || null;
  }

  function isVisibleElement(element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function findComposer() {
    const candidates = document.querySelectorAll(COMPOSER_SELECTOR);
    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement)) continue;
      const isEditable =
        candidate instanceof HTMLTextAreaElement ||
        candidate.getAttribute('contenteditable') === 'true' ||
        candidate.classList.contains('ProseMirror');
      if (!isEditable || !isVisibleElement(candidate)) continue;
      return candidate;
    }

    return null;
  }

  function getComposerText(element) {
    if (element instanceof HTMLTextAreaElement) return element.value;
    return element.innerText || element.textContent || '';
  }

  function getFontFaceSources(style) {
    const sources = [];
    const sheet = style?.sheet;
    if (!sheet || !sheet.cssRules) return sources;

    for (const rule of sheet.cssRules) {
      if (rule.type !== CSSRule.FONT_FACE_RULE) continue;
      sources.push({
        family: rule.style.getPropertyValue('font-family').replace(/["']/g, ''),
        weight: rule.style.getPropertyValue('font-weight') || null,
        style: rule.style.getPropertyValue('font-style') || null
      });
    }

    return sources;
  }

  async function ensureFontStatus() {
    if (state.fontReadyPromise) return state.fontReadyPromise;

    state.fontReadyPromise = (async () => {
      const errors = [];
      const requestedWeights = [100, 400, 500, 600, 700, 900];
      const loadResults = Object.fromEntries(requestedWeights.map((weight) => [String(weight), {
        requested: `${weight} 16px "Vazirmatn"`,
        loaded: 0,
        ok: false
      }]));
      const checkResults = Object.fromEntries(requestedWeights.map((weight) => [String(weight), false]));
      const fontFaces = [];
      const sampleText = 'سلام فارسی';
      const measureFontWidth = (font) => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D context unavailable');
        context.font = font;
        return context.measureText(sampleText).width;
      };
      try {
        if (document.fonts?.ready) {
          await document.fonts.ready;
        }

        if (document.fonts?.load) {
          for (const weight of requestedWeights) {
            const loaded = await document.fonts.load(`${weight} 16px "Vazirmatn"`);
            const key = String(weight);
            loadResults[key].loaded = loaded.length;
            loadResults[key].ok = loaded.length > 0;
          }
        }

        if (document.fonts) {
          for (const fontFace of document.fonts) {
            const family = String(fontFace.family || '').replace(/["']/g, '');
            if (family !== 'Vazirmatn') continue;
            const weight = String(fontFace.weight || '');
            const sourceType = /\d+\s+\d+/.test(weight) ? 'variable' : 'static';
            fontFaces.push({
              family,
              weight,
              style: String(fontFace.style || ''),
              status: String(fontFace.status || ''),
              sourceType
            });
          }
        }

        const vazirmatnWidth = measureFontWidth('400 24px "Vazirmatn", "Tahoma", "Segoe UI", system-ui, sans-serif');
        const fallbackWidth = measureFontWidth('400 24px system-ui, sans-serif');
        const boldWidth = measureFontWidth('700 24px "Vazirmatn", "Tahoma", "Segoe UI", system-ui, sans-serif');
        state.canvasMeasurement = {
          sampleText,
          regularWidth: vazirmatnWidth,
          fallbackWidth,
          boldWidth,
          delta: Math.abs(vazirmatnWidth - fallbackWidth),
          boldDeltaFromRegular: Math.abs(boldWidth - vazirmatnWidth)
        };

        if (state.canvasMeasurement.delta <= 0) {
          throw new Error('Vazirmatn and fallback canvas widths are identical');
        }
      } catch (error) {
        errors.push(String(error?.stack || error?.message || error));
      }

      state.fontReady = true;
      state.fontErrors = errors;
      state.fontLoadResults = loadResults;
      state.fontFaceEntries = fontFaces;
      for (const weight of requestedWeights) {
        checkResults[String(weight)] = Boolean(document.fonts?.check?.(`${weight} 16px "Vazirmatn"`));
      }
      state.fontCheck = checkResults;
      return {
        ready: true,
        check: state.fontCheck,
        load: state.fontLoadResults,
        entries: [...state.fontFaceEntries],
        canvas: state.canvasMeasurement,
        errors: [...state.fontErrors]
      };
    })();

    return state.fontReadyPromise;
  }

  function ensureComposer() {
    if (!state.composer || !document.contains(state.composer)) {
      state.composer = findComposer();
    }

    if (!state.composer) return null;

    if (!state.composerBootstrapped.has(state.composer) || composerNeedsRefresh(state.composer)) {
      updateComposerBlocks(state.composer, 'boot');
      state.composerBootstrapped.add(state.composer);
    }

    return state.composer;
  }

  function queueMessage(message) {
    if (!(message instanceof Element)) return;
    state.mutationQueue.add(message);
  }

  function collectMessagesFromNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.parentElement && isComposerElement(node.parentElement)) {
        state.pendingRootScan = true;
        return;
      }
      const parentMessage = node.parentElement?.closest(MESSAGE_ROOT_SELECTOR);
      if (parentMessage && !isComposerElement(parentMessage)) queueMessage(parentMessage);
      return;
    }

    if (!(node instanceof Element)) return;

    if (isComposerElement(node)) {
      state.pendingRootScan = true;
      return;
    }

    if (node.matches(MESSAGE_ROOT_SELECTOR)) queueMessage(node);
    node.querySelectorAll(MESSAGE_ROOT_SELECTOR).forEach((candidate) => {
      if (!isComposerElement(candidate)) queueMessage(candidate);
    });

    const parentMessage = node.closest(MESSAGE_ROOT_SELECTOR);
    if (parentMessage && !isComposerElement(parentMessage)) queueMessage(parentMessage);
  }

  function flush() {
    state.pendingFrame = 0;

    for (const message of state.mutationQueue) {
      if (document.contains(message)) processMessage(message);
    }
    state.mutationQueue.clear();

    if (state.pendingRootScan || !state.composer || !document.contains(state.composer)) {
      state.pendingRootScan = false;
      ensureComposer();
    }
  }

  function scheduleFlush() {
    if (state.pendingFrame) return;
    state.pendingFrame = requestAnimationFrame(flush);
  }

  function ensureStyleSheet() {
    const root = document.documentElement;
    if (!root) throw new Error('document.documentElement is missing');

    let style = document.getElementById(STYLE_ID);
    if (!(style instanceof HTMLStyleElement)) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      style.setAttribute('data-chatgpt-persian-rtl', 'desktop');
    }

    style.setAttribute('data-chatgpt-rtl-build', BUILD_MARKER);

    if (style.textContent !== CSS) {
      style.textContent = CSS;
    }

    const head = document.head || root;
    if (!style.isConnected || style.parentElement !== head) {
      head.appendChild(style);
    }

    if (document.adoptedStyleSheets && typeof CSSStyleSheet !== 'undefined' && 'replaceSync' in CSSStyleSheet.prototype) {
      if (!state.adoptedSheet) {
        state.adoptedSheet = new CSSStyleSheet();
        state.adoptedSheet.replaceSync(CSS);
      }

      const sheets = document.adoptedStyleSheets;
      if (!sheets.includes(state.adoptedSheet)) {
        document.adoptedStyleSheets = [...sheets, state.adoptedSheet];
      }
    }

    const sheet = style.sheet;
    const ruleCount = sheet ? sheet.cssRules.length : 0;
    const expectedRuleCount = countTopLevelRules(CSS);
    const styleState = {
      id: STYLE_ID,
      connected: style.isConnected,
      hasSheet: Boolean(sheet),
      ruleCount,
      expectedRuleCount,
      adoptedSheets: document.adoptedStyleSheets ? document.adoptedStyleSheets.length : 0
    };

    if (!styleState.connected || !styleState.hasSheet || ruleCount !== expectedRuleCount) {
      throw new Error(`RTL stylesheet validation failed: ${JSON.stringify(styleState)}`);
    }

    state.styleTextHash = `${ruleCount}:${expectedRuleCount}`;
    state.styleElement = style;
    state.fontFaceSources = getFontFaceSources(style);
    publishDiagnostics();
    return styleState;
  }

  async function refreshAll(reason) {
    state.lastReason = reason;
    state.refreshCount += 1;

    const styleState = ensureStyleSheet();
    ensureComposer();
    await ensureFontStatus();

    const messageRoots = document.querySelectorAll(MESSAGE_ROOT_SELECTOR);
    messageRoots.forEach(queueMessage);
    scheduleFlush();

    const proof = {
      composerOutline: null,
      composerMatches: Boolean(document.querySelector('.ProseMirror')),
      rootReady: Boolean(document.documentElement),
      messageRoots: messageRoots.length
    };

    const composer = state.composer;
    if (composer) {
      const style = window.getComputedStyle(composer);
      proof.composerOutline = style.outline;
    }

    return {
      installed: true,
      version: state.version,
      reason,
      style: styleState,
      fonts: {
        ready: state.fontReady,
        status: document.fonts?.status || null,
        check: state.fontCheck,
        load: state.fontLoadResults,
        entries: [...state.fontFaceEntries],
        errors: [...state.fontErrors],
        fontFaceSources: [...state.fontFaceSources]
      },
      composer: composer ? {
        wrapperSelector: describeManagedSelector(composer),
        managedRole: composer.dataset.cgptRtlRole || null,
        dir: composer.getAttribute('dir'),
        text: getComposerText(composer).slice(0, 200),
        direction: window.getComputedStyle(composer).direction,
        outline: window.getComputedStyle(composer).outline,
        fontFamily: window.getComputedStyle(composer).fontFamily,
        blockSelector: describeManagedSelector(findFirstManagedTextBlock())
      } : null,
      proof,
      errors: [...state.errors]
    };
  }

  async function ensure(reason = 'ensure') {
    if (!document.documentElement) {
      throw new Error('document.documentElement does not exist');
    }

    cleanupLegacyBidiState(document);

    reclassifyStaleAssistantNodes(document);

    if (!state.observer) {
      state.observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'characterData') {
            const message = mutation.target.parentElement?.closest(MESSAGE_ROOT_SELECTOR);
            if (message) queueMessage(message);
            continue;
          }

          mutation.addedNodes.forEach(collectMessagesFromNode);

          if (mutation.removedNodes.length > 0) {
            const currentStyle = document.getElementById(STYLE_ID);
            if (!currentStyle || !currentStyle.isConnected) {
              try {
                ensureStyleSheet();
              } catch (error) {
                state.errors.push(String(error.stack || error.message));
                throw error;
              }
            }
          }
        }

        scheduleFlush();
      });

      state.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    const result = await refreshAll(reason);
    publishDiagnostics();
    return result;
  }

  function findFirstManagedTextBlock() {
    const selectors = [
      '[data-cgpt-rtl-managed="assistant-text"]',
      '[data-cgpt-rtl-managed="user-text"]',
      '[data-cgpt-rtl-managed="composer-text"]',
      'p[data-cgpt-rtl-managed="assistant-text"]',
      'li[data-cgpt-rtl-managed="assistant-text"]',
      'blockquote[data-cgpt-rtl-managed="assistant-text"]',
      'h1[data-cgpt-rtl-managed="assistant-text"]',
      'h2[data-cgpt-rtl-managed="assistant-text"]',
      'h3[data-cgpt-rtl-managed="assistant-text"]',
      'h4[data-cgpt-rtl-managed="assistant-text"]',
      'h5[data-cgpt-rtl-managed="assistant-text"]',
      'h6[data-cgpt-rtl-managed="assistant-text"]'
    ].join(', ');

    return document.querySelector(selectors);
  }

  function describeManagedSelector(element) {
    if (!(element instanceof Element)) return null;
    if (element.matches('[data-cgpt-rtl-managed="composer-text"]')) return '[data-cgpt-rtl-managed="composer-text"]';
    if (element.matches('[data-cgpt-rtl-managed="user-text"]')) return '[data-cgpt-rtl-managed="user-text"]';
    if (element.matches('[data-cgpt-rtl-managed="assistant-text"]')) return '[data-cgpt-rtl-managed="assistant-text"]';
    if (element.matches('.ProseMirror')) return '.ProseMirror';
    if (element.matches('#prompt-textarea')) return '#prompt-textarea';
    if (element.matches('[contenteditable="true"][role="textbox"]')) return '[contenteditable="true"][role="textbox"]';
    return element.tagName.toLowerCase();
  }

  function findFirstCodeBlock() {
    const selectors = [
      'pre',
      'code',
      'kbd',
      'samp',
      '[data-language]',
      '.monaco-editor',
      '.cm-editor',
      '.CodeMirror'
    ].join(',');
    const managedRoots = document.querySelectorAll('[data-cgpt-rtl-managed="user-text"], [data-cgpt-rtl-managed="assistant-text"], [data-cgpt-rtl-managed="composer-text"]');
    for (const root of managedRoots) {
      const code = root.querySelector(selectors);
      if (code) return code;
    }
    return document.querySelector(selectors);
  }

  function diagnostics() {
    const style = document.getElementById(STYLE_ID);
    const composer = state.composer && document.contains(state.composer) ? state.composer : findComposer();
    const composerText = composer ? getComposerText(composer) : '';
    const composerDirection = composer ? window.getComputedStyle(composer).direction : null;
    const messageRoots = document.querySelectorAll(MESSAGE_ROOT_SELECTOR);
    const messageBlock = findFirstManagedTextBlock();
    const codeBlock = findFirstCodeBlock();

    return {
      installed: true,
      version: state.version,
      buildMarker: state.buildMarker,
      runtimeSourceHash: state.runtimeSourceHash,
      cssSourceHash: state.cssSourceHash,
      runtimeInstanceCount: state.runtimeInstanceCount,
      activeMutationObservers: state.observer ? 1 : 0,
      reason: state.lastReason,
      readyState: document.readyState,
      refreshCount: state.refreshCount,
      runtimeGlobal: window.__CHATGPT_RTL_RUNTIME__ === state,
      buildGlobal: window.__CHATGPT_RTL_BUILD__ || null,
      style: {
        id: STYLE_ID,
        present: Boolean(style),
        connected: Boolean(style && style.isConnected),
        hasSheet: Boolean(style && style.sheet),
        ruleCount: style && style.sheet ? style.sheet.cssRules.length : 0,
        expectedRuleCount: countTopLevelRules(CSS),
        adoptedSheets: document.adoptedStyleSheets ? document.adoptedStyleSheets.length : 0
      },
      fonts: {
        ready: state.fontReady,
        status: document.fonts?.status || null,
        check: state.fontCheck,
        load: state.fontLoadResults,
        entries: [...state.fontFaceEntries],
        canvas: state.canvasMeasurement,
        errors: [...state.fontErrors],
        fontFaceSources: [...state.fontFaceSources]
      },
      composer: composer ? {
        wrapperSelector: describeManagedSelector(composer),
        dir: composer.getAttribute('dir'),
        computedDirection: composerDirection,
        text: composerText.slice(0, 200),
        empty: normalizeDirectionalSample(composerText).length === 0,
        outline: window.getComputedStyle(composer).outline,
        fontFamily: window.getComputedStyle(composer).fontFamily,
        blockSelector: describeManagedSelector(findFirstManagedTextBlock()),
        found: true
      } : { found: false },
      messageBlock: messageBlock ? {
        selector: describeManagedSelector(messageBlock),
        direction: window.getComputedStyle(messageBlock).direction,
        textAlign: window.getComputedStyle(messageBlock).textAlign,
        unicodeBidi: window.getComputedStyle(messageBlock).unicodeBidi,
        fontFamily: window.getComputedStyle(messageBlock).fontFamily
      } : null,
      codeBlock: codeBlock ? {
        selector: codeBlock.matches('pre') ? 'pre' : codeBlock.matches('code') ? 'code' : codeBlock.matches('kbd') ? 'kbd' : codeBlock.matches('samp') ? 'samp' : codeBlock.matches('.monaco-editor') ? '.monaco-editor' : codeBlock.matches('.cm-editor') ? '.cm-editor' : codeBlock.matches('.CodeMirror') ? '.CodeMirror' : codeBlock.matches('[data-language]') ? '[data-language]' : codeBlock.tagName.toLowerCase(),
        direction: window.getComputedStyle(codeBlock).direction,
        textAlign: window.getComputedStyle(codeBlock).textAlign,
        unicodeBidi: window.getComputedStyle(codeBlock).unicodeBidi,
        fontFamily: window.getComputedStyle(codeBlock).fontFamily,
        monospace: /monospace|courier|console|menlo|sf mono|monaco/i.test(window.getComputedStyle(codeBlock).fontFamily)
      } : null,
      messageRoots: messageRoots.length,
      counters: { ...state.counters },
      errors: [...state.errors]
    };
  }

  function destroy(reason = 'destroy') {
    state.lastReason = reason;
    state.destroyed = true;

    if (state.pendingFrame) {
      cancelAnimationFrame(state.pendingFrame);
      state.pendingFrame = 0;
    }

    for (const managed of state.managedElements) {
      if (managed && managed instanceof HTMLElement) {
        clearManagedStyles(managed);
      }
    }
    state.managedElements.clear();
    state.blockState = new WeakMap();
    state.composerState = new WeakMap();
    state.composerBootstrapped = new WeakSet();
    state.messageSignatures = new WeakMap();

    disconnectComposerListeners();

    if (state.observer) {
      try {
        state.observer.disconnect();
      } catch {}
      state.observer = null;
    }

    if (state.rootObserver) {
      try {
        state.rootObserver.disconnect();
      } catch {}
      state.rootObserver = null;
    }

    if (state.styleElement && state.styleElement.isConnected) {
      try {
        state.styleElement.remove();
      } catch {}
    }
    if (state.adoptedSheet && document.adoptedStyleSheets) {
      try {
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => sheet !== state.adoptedSheet);
      } catch {}
    }

    state.styleElement = null;
    state.adoptedSheet = null;
    state.composer = null;
    state.mutationQueue.clear();
    state.pendingRootScan = false;
    state.fontFaceSources = [];
    delete window[PATCH_ID];
    if (window.__CHATGPT_RTL_RUNTIME__ === state) delete window.__CHATGPT_RTL_RUNTIME__;
    delete window.__CHATGPT_RTL_BUILD__;
    if (window.__CHATGPT_RTL_DIAGNOSTICS__ && window.__CHATGPT_RTL_DIAGNOSTICS__.buildMarker === state.buildMarker) {
      delete window.__CHATGPT_RTL_DIAGNOSTICS__;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      try {
        ensure('DOMContentLoaded');
      } catch (error) {
        state.errors.push(String(error.stack || error.message));
        throw error;
      }
    }, { once: true });
  } else {
    ensure('boot');
  }
})();
