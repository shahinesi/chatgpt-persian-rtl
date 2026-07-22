(() => {
  'use strict';

  const PATCH_ID = 'chatgpt-persian-rtl-desktop-runtime';
  const STYLE_ID = 'chatgpt-rtl-style';
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
    'div.flex.flex-col.items-start.gap-1'
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
  const RTL_RUN = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]+/gu;
  const LATIN_RUN = /[A-Za-z]+/gu;
  const URL_PATTERN = /https?:\/\/\S+|www\.\S+/giu;
  const LEADING_DECORATION = /^(?:[\s\u00a0\u200e\u200f\u202a-\u202e\u2066-\u2069]+|(?:[•●◦▪▫‣⁃*-]+|[-–—]+|(?:[\[(\{]\s*)?(?:\d+|[۰-۹]+)(?:[\].,):\}\]]\s*)?))/u;

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const previous = window[PATCH_ID];
  if (previous && previous.version === 2 && typeof previous.ensure === 'function') {
    previous.ensure('reentry');
    return;
  }

  const state = {
    version: 2,
    installedAt: Date.now(),
    lastReason: 'boot',
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
    composerDirection: 'rtl',
    composerListeners: new WeakSet(),
    messageSignatures: new WeakMap(),
    pendingRootScan: false,
    proofSelector: '.ProseMirror',
    ensure,
    diagnostics
  };

  window[PATCH_ID] = state;

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

  function countDirectionalRuns(text, pattern) {
    const matches = text.match(pattern);
    return matches ? matches.length : 0;
  }

  function firstStrongDirection(text) {
    for (const char of text) {
      if (RTL_CHAR.test(char)) return 'rtl';
      if (/[A-Za-z]/u.test(char)) return 'ltr';
    }
    return null;
  }

  function detectDirection(text, emptyDirection = state.composerDirection || 'rtl') {
    const sample = normalizeDirectionalSample(text);
    if (!sample) return null;
    return firstStrongDirection(sample) || emptyDirection || null;
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

  function setManagedDirection(element, role, direction) {
    element.dataset.cgptRtlRole = role;
    element.dataset.cgptRtlDir = direction;
    element.setAttribute('dir', direction);
    element.setAttribute('data-cgpt-rtl-managed', role);
    element.style.setProperty('direction', direction, 'important');
    element.style.setProperty('text-align', direction === 'rtl' ? 'right' : 'left', 'important');
    element.style.setProperty('unicode-bidi', 'plaintext', 'important');
  }

  function clearManagedDirection(element, preserveRole = false) {
    if (!preserveRole) {
      delete element.dataset.cgptRtlRole;
      element.removeAttribute('data-cgpt-rtl-role');
    }
    delete element.dataset.cgptRtlDir;
    element.removeAttribute('dir');
    element.removeAttribute('data-cgpt-rtl-managed');
    element.style.removeProperty('direction');
    element.style.removeProperty('text-align');
    element.style.removeProperty('unicode-bidi');
  }

  function isNaturalLanguageContainer(element, boundary) {
    if (!(element instanceof Element)) return false;
    if (!element.matches(BLOCK_SELECTOR)) return false;
    return boundary.contains(element);
  }

  function nearestSafeTextContainer(node, boundary) {
    let element = node.parentElement;
    while (element && element !== boundary) {
      if (isExcludedElement(element, boundary)) return null;
      if (element.matches(BLOCK_SELECTOR)) return element;

      const parent = element.parentElement;
      if (!parent || parent === boundary) return element;
      element = parent;
    }

    return boundary.matches(BLOCK_SELECTOR) ? boundary : null;
  }

  function collectTextContainers(message) {
    const containers = new Set();
    const walker = document.createTreeWalker(message, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return isExcludedElement(node.parentElement, message)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      }
    });

    let current = walker.nextNode();
    while (current) {
      const container = nearestSafeTextContainer(current, message);
      if (container && isNaturalLanguageContainer(container, message)) containers.add(container);
      current = walker.nextNode();
    }

    return containers;
  }

  function clearManagedBlocks(message) {
    message.querySelectorAll('[data-cgpt-rtl-managed="block"], [data-cgpt-rtl-managed="message"], [data-cgpt-rtl-managed="composer"]').forEach(clearManagedDirection);
  }

  function normalizeSignature(text) {
    return normalizeDirectionalSample(text).slice(0, 2000);
  }

  function processMessage(message) {
    if (!(message instanceof Element)) return;

    const text = extractDirectionalText(message);
    const signature = normalizeSignature(text);
    if (state.messageSignatures.get(message) === signature) return;
    state.messageSignatures.set(message, signature);

    clearManagedBlocks(message);

    const containers = collectTextContainers(message);
    if (containers.size === 0) {
      if (text && message.matches(BLOCK_SELECTOR)) {
        const direction = detectDirection(text);
        if (direction) {
          setManagedDirection(message, 'message', direction);
        } else {
          clearManagedDirection(message);
        }
      }
      return;
    }

    for (const container of containers) {
      const containerText = extractDirectionalText(container);
      if (!containerText) continue;
      const direction = detectDirection(containerText);
      if (direction) {
        setManagedDirection(container, 'message', direction);
      } else {
        clearManagedDirection(container);
      }
    }
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
        src: rule.style.getPropertyValue('src'),
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

    const text = getComposerText(state.composer);
    const direction = detectDirection(text, state.composerDirection || null);
    state.composerDirection = direction;
    state.composer.setAttribute('data-cgpt-rtl-composer', 'true');
    state.composer.dataset.cgptRtlRole = 'composer';
    state.composer.style.setProperty('font-family', '"Vazirmatn", "Tahoma", "Segoe UI", system-ui, sans-serif', 'important');

    if (direction) {
      setManagedDirection(state.composer, 'composer', direction);
    } else {
      clearManagedDirection(state.composer, true);
      state.composer.removeAttribute('dir');
      state.composer.removeAttribute('data-cgpt-rtl-managed');
    }

    if (!state.composerListeners.has(state.composer)) {
      const refresh = () => {
        try {
          ensureComposer();
        } catch (error) {
          state.errors.push(String(error.stack || error.message));
          throw error;
        }
      };

      state.composer.addEventListener('input', refresh, { passive: true });
      state.composer.addEventListener('beforeinput', refresh, { passive: true });
      state.composer.addEventListener('paste', refresh, { passive: true });
      state.composer.addEventListener('focus', refresh, { passive: true });
      state.composer.addEventListener('compositionend', refresh, { passive: true });
      state.composerListeners.add(state.composer);
    }

    return state.composer;
  }

  function queueMessage(message) {
    if (message instanceof Element) state.mutationQueue.add(message);
  }

  function collectMessagesFromNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const parentMessage = node.parentElement?.closest(MESSAGE_ROOT_SELECTOR);
      if (parentMessage) queueMessage(parentMessage);
      return;
    }

    if (!(node instanceof Element)) return;

    if (node.matches(MESSAGE_ROOT_SELECTOR)) queueMessage(node);
    node.querySelectorAll(MESSAGE_ROOT_SELECTOR).forEach(queueMessage);

    const parentMessage = node.closest(MESSAGE_ROOT_SELECTOR);
    if (parentMessage) queueMessage(parentMessage);

    if (node.matches(COMPOSER_SELECTOR) || node.querySelector(COMPOSER_SELECTOR)) {
      state.pendingRootScan = true;
    }
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
        selector: composer.matches('.ProseMirror') ? '.ProseMirror' : composer.matches('#prompt-textarea') ? '#prompt-textarea' : '[contenteditable="true"][role="textbox"]',
        role: composer.dataset.cgptRtlRole,
        dir: composer.getAttribute('dir'),
        text: getComposerText(composer).slice(0, 200),
        direction: state.composerDirection,
        outline: window.getComputedStyle(composer).outline,
        fontFamily: window.getComputedStyle(composer).fontFamily
      } : null,
      proof,
      errors: [...state.errors]
    };
  }

  async function ensure(reason = 'ensure') {
    if (!document.documentElement) {
      throw new Error('document.documentElement does not exist');
    }

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

    if (!state.rootObserver && document.body) {
      state.rootObserver = new MutationObserver(() => {
        if (!document.getElementById(STYLE_ID)) {
          try {
            ensureStyleSheet();
          } catch (error) {
            state.errors.push(String(error.stack || error.message));
            throw error;
          }
        }
      });

      state.rootObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    const result = await refreshAll(reason);
    return result;
  }

  function findFirstManagedTextBlock() {
    const selectors = [
      '[data-cgpt-rtl-role="message"]',
      '[data-cgpt-rtl-managed="message"]',
      '[data-cgpt-rtl-managed="block"]',
      'div.text-size-chat p',
      'div.text-size-chat li',
      'div.text-size-chat blockquote',
      'div.text-size-chat h1',
      'div.text-size-chat h2',
      'div.text-size-chat h3',
      'div.text-size-chat h4',
      'div.text-size-chat h5',
      'div.text-size-chat h6',
      'div.text-size-chat div[dir]',
      'div.text-size-chat div'
    ].join(', ');

    return document.querySelector(selectors);
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
    const managedRoots = document.querySelectorAll('[data-cgpt-rtl-role="message"], [data-cgpt-rtl-managed="message"], [data-cgpt-rtl-managed="block"]');
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
      reason: state.lastReason,
      readyState: document.readyState,
      refreshCount: state.refreshCount,
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
        selector: composer.matches('.ProseMirror') ? '.ProseMirror' : composer.matches('#prompt-textarea') ? '#prompt-textarea' : '[contenteditable="true"][role="textbox"]',
        role: composer.dataset.cgptRtlRole || null,
        dir: composer.getAttribute('dir'),
        computedDirection: composerDirection,
        text: composerText.slice(0, 200),
        empty: normalizeDirectionalSample(composerText).length === 0,
        outline: window.getComputedStyle(composer).outline,
        fontFamily: window.getComputedStyle(composer).fontFamily,
        found: true
      } : { found: false },
      messageBlock: messageBlock ? {
        selector: messageBlock.matches('p') ? 'p' : messageBlock.matches('li') ? 'li' : messageBlock.matches('blockquote') ? 'blockquote' : messageBlock.matches('h1,h2,h3,h4,h5,h6') ? 'heading' : messageBlock.tagName.toLowerCase(),
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
      errors: [...state.errors]
    };
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
