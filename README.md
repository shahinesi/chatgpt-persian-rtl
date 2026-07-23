<div align="center">
  <img src="chrome-plugin/assets/hero.svg" alt="ChatGPT Persian RTL" width="100%">

  <br>

  [![Manifest V3](https://img.shields.io/badge/Manifest-V3-10a37f)](chrome-plugin/manifest.json)
  [![Validation](https://github.com/shahinesi/chatgpt-persian-rtl/actions/workflows/validate.yml/badge.svg)](https://github.com/shahinesi/chatgpt-persian-rtl/actions/workflows/validate.yml)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
  [![No tracking](https://img.shields.io/badge/tracking-none-success)](SECURITY.md)

  <br>

  <strong>npm version</strong> · <strong>License: MIT</strong> · <strong>PRs Welcome</strong> · <strong>GitHub stars</strong>

  <br><br>

  [🇮🇷 نسخه فارسی](README-FA.md) | [🇸🇦 العربية](README-AR.md) | [🇮🇱 עברית](README-HE.md) | [🌍 English](README-EN.md)
</div>

# 🌟 پچ راست‌چین ChatGPT فارسی
**پچ خودکار راست‌به‌چپ و تایپوگرافی خوش‌خوان برای ChatGPT Desktop و نسخه‌ی وب.**

پکیج راست‌چین هوشمند برای ChatGPT که دو مسیر اصلی دارد:

<p align="center">
✨ *با عشق برای فارسی، عربی، عبری و همه‌ی زبان‌های راست‌چین؛ Vazirmatn هم به یاد صابر راستی‌کردار.* ✨
</p>

- `chrome-plugin/` برای افزونه‌ی کروم و نسخه‌ی وب
- `desktop/` برای بسته‌ی پچ و بازگردانی ChatGPT دسکتاپ روی macOS و Windows

> این پروژه مستقل است و هیچ وابستگی یا تاییدی از سمت OpenAI ندارد.

## چرا این پروژه؟

<p align="center">
  <img src="docs/diagrams/rtl-problem.svg" alt="مقایسه مشکل RTL قبل و بعد از ChatGPT Persian RTL" width="100%">
</p>

### مقایسه قبل و بعد

<p align="center">
  <table>
    <tr>
      <td align="center" width="50%">
        <strong>قبل از پچ</strong><br>
        <img src="docs/assets/Before_RTL.png" alt="مقایسه قبل از راست‌چین" width="100%">
      </td>
      <td align="center" width="50%">
        <strong>بعد از پچ</strong><br>
        <img src="docs/assets/After_RTL.png" alt="مقایسه بعد از راست‌چین" width="100%">
      </td>
    </tr>
  </table>
</p>

- متن فارسی و عربی را با اولویت خوانایی راست‌چین می‌کند
- متن‌های ترکیبی با انگلیسی را بدون به‌هم‌ریختن چیدمان تشخیص می‌دهد
- بولت، شماره‌گذاری، نقل‌قول و URL تشخیص جهت را خراب نمی‌کنند
- کد، جدول، فرمول و محتوای فنی همچنان LTR می‌مانند
- فونت Vazirmatn داخل پروژه قرار گرفته تا خروجی آفلاین و قابل‌اعتماد باشد
- منبع رسمی فونت: [rastikerdar.github.io/vazirmatn/fa](https://rastikerdar.github.io/vazirmatn/fa)

## چه چیزهایی دارد؟

<p align="center">
  <img src="docs/diagrams/project-map.svg" alt="نقشه مسیرهای وب، مک و ویندوز پروژه" width="100%">
</p>

| مسیر | خروجی |
|---|---|
| `chrome-plugin/` | افزونه‌ی Manifest V3 برای ChatGPT در وب |
| `desktop/macos/` | نصب و بازگردانی ChatGPT دسکتاپ روی macOS |
| `desktop/windows/` | نصب و بازگردانی ChatGPT دسکتاپ روی Windows |

## ویژگی‌ها

- تشخیص RTL/LTR بر اساس متن پاک‌سازی‌شده و نه صرفا اولین کاراکتر
- پشتیبانی از پیام‌های در حال تولید و کادر نوشتن
- حفظ LTR برای `code`، `pre`، `table`، `math` و بخش‌های فنی
- فونت Vazirmatn برای متن‌های فارسی و رابط افزونه
- بدون رهگیری، تحلیل‌گر یا درخواست شبکه در زمان اجرا
- ذخیره تنظیم فقط به‌صورت محلی

## نصب با یک کلیک

### نصب سریع

<div dir="ltr" align="left">

```bash
git clone --depth 1 https://github.com/shahinesi/chatgpt-persian-rtl.git
cd chatgpt-persian-rtl/desktop
npm install
npm run patch:macos
```

</div>

برای Windows:

<div dir="ltr" align="left">

```powershell
git clone --depth 1 https://github.com/shahinesi/chatgpt-persian-rtl.git
Set-Location chatgpt-persian-rtl\desktop
npm install
npm run patch:windows
```

</div>

### نصب مستقیم از اینترنت

<div dir="ltr" align="left">

```bash
git clone --depth 1 https://github.com/shahinesi/chatgpt-persian-rtl.git /tmp/chatgpt-persian-rtl && cd /tmp/chatgpt-persian-rtl/desktop && npm install && npm run patch:macos
```

</div>

<div dir="ltr" align="left">

```powershell
git clone --depth 1 https://github.com/shahinesi/chatgpt-persian-rtl.git $env:TEMP\chatgpt-persian-rtl; cd $env:TEMP\chatgpt-persian-rtl\desktop; npm install; npm run patch:windows
```

</div>

## بازگردانی به حالت اولیه (Restore)

<div dir="ltr" align="left">

```bash
cd chatgpt-persian-rtl/desktop
npm run restore:macos
```

</div>

<div dir="ltr" align="left">

```powershell
Set-Location chatgpt-persian-rtl\desktop
npm run restore:windows
```

</div>

## مشارکت‌کنندگان و فراخوان توسعه

اگر می‌خواهی کمک کنی، این حوزه‌ها بیشترین ارزش را دارند:

- بهبود تشخیص جهت برای متن‌های ترکیبی پیچیده‌تر
- سازگارسازی بهتر با نسخه‌های جدید ChatGPT در وب و دسکتاپ
- تست روی macOS و مرورگرهای دیگر Chromium-based
- بهبود تجربه نصب، restore و packaging
- بهینه‌سازی فونت، spacing و render در RTL

درخواست ادغام و issue تمیز و مستند همیشه ارزشمند است.

## حمایت از پروژه

- با Star دادن به ریپو از پروژه حمایت کن
- اگر باگ یا حالت مرزی دیدی، issue دقیق و نمونه‌ی بازتولید کوتاه بفرست
- اگر وقت داری، PR بده و کمک کن پشتیبانی از نسخه‌های جدیدتر ChatGPT پایدار بماند

## قدردانی

این پروژه با احترام به تلاش‌های خالق فونت Vazirmatn، زنده‌یاد **صابر راستی‌کردار** توسعه داده شده است.

## لایسنس

این پروژه تحت مجوز [MIT](LICENSE) منتشر شده است.
