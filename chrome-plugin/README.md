# افزونه‌ی کروم ChatGPT Persian RTL

این پوشه منبع اصلی افزونه‌ی کروم و نسخه‌ی وب است.

<p align="center">
✨ *RTL با عشق برای فارسی، عربی، عبری و همه‌ی زبان‌های راست‌به‌چپ؛ Vazirmatn هم به یاد صابر راستی‌کردار.* ✨
</p>

<p align="center">
  <img src="../docs/diagrams/chrome-flow.svg" alt="جریان محدود و امن افزونه کروم برای راست‌چین کردن پیام‌ها" width="100%">
</p>

## توسعه

<div dir="ltr" align="left">

```bash
npm test
npm run build
```

</div>

## فایل‌های مهم

- `content.js` منطق RTL و کادر نوشتن
- `styles.css` استایل‌های محدود به همان ناحیه و فونت
- `popup.html` و `popup.js` رابط روشن/خاموش
- `manifest.json` تعریف افزونه

## خروجی

فایل نهایی ZIP در `dist/` ساخته می‌شود و فونت Vazirmatn هم داخل بسته قرار می‌گیرد.
