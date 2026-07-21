(() => {
  'use strict';

  const STORAGE_KEY = 'rtlEnabled';
  const MESSAGE_SELECTOR =
    '[data-message-author-role="user"], [data-message-author-role="assistant"]';

  // Semantic ChatGPT selector first, followed by tightly scoped fallbacks.
  const COMPOSER_SELECTORS = [
    '#prompt-textarea',
    'form [role="textbox"][contenteditable="true"]',
    'form textarea'
  ];

  const BLOCK_SELECTOR = [
    'p',
    'li',
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'dd',
    'dt',
    'figcaption'
  ].join(',');

  const TECHNICAL_SELECTOR = [
    'pre',
    'code',
    'kbd',
    'samp',
    'table',
    'math',
    '.katex',
    '.MathJax',
    '[data-math]',
    '[data-language]'
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
  const LEADING_DECORATION = /^(?:[\s\u00a0\u200e\u200f\u202a-\u202e\u2066-\u2069]+|(?:[•●◦▪▫‣⁃*-]+|[-–—]+|(?:[\[(\{]\s*)?(?:\d+|[۰-۹]+)(?:[\].,):\}\]]\s*)?))/u;
  const URL_PATTERN = /https?:\/\/\S+|www\.\S+/giu;

  let enabled = false;
  let observer = null;
  let frameId = 0;
  let composer = null;
  const pendingMessages = new Set();
  const boundComposers = new WeakSet();

  function isOfficialChatGPTHost() {
    return location.hostname === 'chatgpt.com' || location.hostname === 'chat.openai.com';
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
    if (!matches) return 0;

    return matches.length;
  }

  function firstStrongDirection(text) {
    for (const char of text) {
      if (RTL_CHAR.test(char)) return 'rtl';
      if (/[A-Za-z]/u.test(char)) return 'ltr';
    }

    return null;
  }

  function detectDirection(text, emptyDirection = 'ltr') {
    const sample = normalizeDirectionalSample(text);
    if (!sample) return emptyDirection;

    const rtlCount = countDirectionalRuns(sample, RTL_RUN);
    const latinCount = countDirectionalRuns(sample, LATIN_RUN);
    const firstStrong = firstStrongDirection(sample);

    if (rtlCount === 0 && latinCount === 0) return emptyDirection;
    if (rtlCount === 0) return 'ltr';
    if (latinCount === 0) return 'rtl';

    if (firstStrong === 'rtl') return 'rtl';

    const total = rtlCount + latinCount;
    const rtlRatio = rtlCount / total;

    // Mixed Persian sentences should stay RTL even when they begin with English
    // tokens, bullets, numbering, or URLs.
    if (rtlCount > latinCount && rtlRatio >= 0.6) return 'rtl';

    return 'ltr';
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
        if (!node.nodeValue || !node.nodeValue.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

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

  function markDirection(element, type, direction) {
    element.dataset.cgptRtlManaged = type;
    element.dataset.cgptRtlDir = direction;
  }

  function clearManagedElement(element) {
    delete element.dataset.cgptRtlManaged;
    delete element.dataset.cgptRtlDir;
  }

  function clearManagedBlocks(message) {
    message.querySelectorAll('[data-cgpt-rtl-managed="block"]').forEach(clearManagedElement);
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

    return null;
  }

  function collectTextContainers(message) {
    const containers = new Set();
    const walker = document.createTreeWalker(message, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        return isExcludedElement(node.parentElement, message)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      }
    });

    let current = walker.nextNode();
    while (current) {
      const container = nearestSafeTextContainer(current, message);
      if (container) containers.add(container);
      current = walker.nextNode();
    }

    return containers;
  }

  function processMessage(message) {
    if (!(message instanceof Element) || !message.matches(MESSAGE_SELECTOR)) return;

    clearManagedBlocks(message);

    for (const container of collectTextContainers(message)) {
      const text = extractDirectionalText(container);
      if (!text) continue;
      markDirection(container, 'block', detectDirection(text));
    }
  }

  function findComposer() {
    for (const selector of COMPOSER_SELECTORS) {
      const candidate = document.querySelector(selector);
      if (!(candidate instanceof HTMLElement)) continue;

      const isEditable =
        candidate instanceof HTMLTextAreaElement ||
        candidate.getAttribute('contenteditable') === 'true';

      if (isEditable) return candidate;
    }

    return null;
  }

  function getComposerText(element) {
    if (element instanceof HTMLTextAreaElement) return element.value;
    return element.textContent ?? '';
  }

  function updateComposerDirection() {
    if (!composer || !document.contains(composer)) composer = findComposer();
    if (!composer) return;

    if (!enabled) {
      clearManagedElement(composer);
      return;
    }

    // Empty composer defaults to RTL, then switches automatically for English text.
    markDirection(composer, 'composer', detectDirection(getComposerText(composer), 'rtl'));

    if (!boundComposers.has(composer)) {
      const refresh = () => {
        if (enabled) updateComposerDirection();
      };

      composer.addEventListener('input', refresh, { passive: true });
      composer.addEventListener('compositionend', refresh, { passive: true });
      boundComposers.add(composer);
    }
  }

  function queueMessage(message) {
    if (message instanceof Element && message.matches(MESSAGE_SELECTOR)) {
      pendingMessages.add(message);
    }
  }

  function collectMessagesFromNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const parentMessage = node.parentElement?.closest(MESSAGE_SELECTOR);
      if (parentMessage) queueMessage(parentMessage);
      return;
    }

    if (!(node instanceof Element)) return;

    queueMessage(node);
    node.querySelectorAll(MESSAGE_SELECTOR).forEach(queueMessage);

    const parentMessage = node.closest(MESSAGE_SELECTOR);
    if (parentMessage) queueMessage(parentMessage);
  }

  function flush() {
    frameId = 0;
    if (!enabled) return;

    pendingMessages.forEach((message) => {
      if (document.contains(message)) processMessage(message);
    });
    pendingMessages.clear();

    updateComposerDirection();
  }

  function scheduleFlush() {
    if (frameId) return;
    frameId = requestAnimationFrame(flush);
  }

  function processExistingContent() {
    document.querySelectorAll(MESSAGE_SELECTOR).forEach(queueMessage);
    updateComposerDirection();
    scheduleFlush();
  }

  function removeAllChanges() {
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }

    pendingMessages.clear();
    document.querySelectorAll('[data-cgpt-rtl-managed]').forEach(clearManagedElement);
  }

  function startObserver() {
    if (observer || !document.body) return;

    observer = new MutationObserver((mutations) => {
      if (!enabled) return;

      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          const message = mutation.target.parentElement?.closest(MESSAGE_SELECTOR);
          if (message) queueMessage(message);
          continue;
        }

        mutation.addedNodes.forEach(collectMessagesFromNode);
      }

      scheduleFlush();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  async function loadState() {
    const result = await chrome.storage.local.get({ [STORAGE_KEY]: true });
    enabled = result[STORAGE_KEY] !== false;

    if (enabled) processExistingContent();
    else removeAllChanges();
  }

  function init() {
    if (!isOfficialChatGPTHost()) return;

    startObserver();
    loadState().catch(() => {
      enabled = true;
      processExistingContent();
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local' || !changes[STORAGE_KEY]) return;

      enabled = changes[STORAGE_KEY].newValue !== false;
      if (enabled) processExistingContent();
      else removeAllChanges();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
