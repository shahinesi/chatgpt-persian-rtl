(() => {
  'use strict';

  const STORAGE_KEY = 'rtlEnabled';
  const toggle = document.getElementById('toggle');
  const status = document.getElementById('status');

  function render(enabled) {
    toggle.checked = enabled;
    status.textContent = enabled ? 'فعال' : 'غیرفعال';
  }

  chrome.storage.local
    .get({ [STORAGE_KEY]: true })
    .then((result) => render(result[STORAGE_KEY] !== false))
    .catch(() => {
      render(true);
      status.textContent = 'فعال — ذخیره تنظیمات در دسترس نیست';
    });

  toggle.addEventListener('change', async () => {
    const nextValue = toggle.checked;
    status.textContent = 'در حال ذخیره…';

    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: nextValue });
      render(nextValue);
    } catch {
      toggle.checked = !nextValue;
      status.textContent = 'ذخیره تنظیمات ناموفق بود';
    }
  });
})();
