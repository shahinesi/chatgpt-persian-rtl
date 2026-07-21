(() => {
  'use strict';

  const PATCH_ID = 'chatgpt-persian-rtl-desktop-runtime';
  const STYLE_ID = 'chatgpt-persian-rtl-desktop-style';
  const MESSAGE_SELECTOR =
    '[data-message-author-role="user"], [data-message-author-role="assistant"], main article, [data-testid*="conversation-turn"]';
  const COMPOSER_SELECTORS = [
    '#prompt-textarea',
    '[contenteditable="true"][role="textbox"]',
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
  const CSS = __CHATGPT_PERSIAN_RTL_CSS__;

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window[PATCH_ID]) return;
  window[PATCH_ID] = true;

  let frameId = 0;
  let observer = null;
  let composer = null;
  const pendingMessages = new Set();
  const boundComposers = new WeakSet();

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.setAttribute('data-chatgpt-persian-rtl', 'desktop');
    style.textContent = CSS;
    const target = document.head || document.documentElement;
    target.appendChild(style);
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

    const rtlRatio = rtlCount / (rtlCount + latinCount);
    return rtlCount > latinCount && rtlRatio >= 0.45 ? 'rtl' : 'ltr';
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
    element.setAttribute('dir', direction);
  }

  function clearManagedElement(element) {
    delete element.dataset.cgptRtlManaged;
    delete element.dataset.cgptRtlDir;
    element.removeAttribute('dir');
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
    if (!(message instanceof Element)) return;

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

    markDirection(composer, 'composer', detectDirection(getComposerText(composer), 'rtl'));

    if (!boundComposers.has(composer)) {
      const refresh = () => updateComposerDirection();
      composer.addEventListener('input', refresh, { passive: true });
      composer.addEventListener('compositionend', refresh, { passive: true });
      boundComposers.add(composer);
    }
  }

  function queueMessage(message) {
    if (message instanceof Element) pendingMessages.add(message);
  }

  function collectMessagesFromNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const parentMessage = node.parentElement?.closest(MESSAGE_SELECTOR);
      if (parentMessage) queueMessage(parentMessage);
      return;
    }

    if (!(node instanceof Element)) return;

    if (node.matches(MESSAGE_SELECTOR)) queueMessage(node);
    node.querySelectorAll(MESSAGE_SELECTOR).forEach(queueMessage);

    const parentMessage = node.closest(MESSAGE_SELECTOR);
    if (parentMessage) queueMessage(parentMessage);
  }

  function flush() {
    frameId = 0;
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

  function startObserver() {
    if (observer || !document.body) return;

    observer = new MutationObserver((mutations) => {
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

  function init() {
    if (!document.documentElement) return;
    injectStyle();
    startObserver();
    processExistingContent();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
