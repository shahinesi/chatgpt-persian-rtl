<div align="center">
  <img src="chrome-plugin/assets/hero.svg" alt="ChatGPT Persian RTL" width="100%">

  <br>

  [![Manifest V3](https://img.shields.io/badge/Manifest-V3-10a37f)](chrome-plugin/manifest.json)
  [![Validation](https://github.com/shahinesi/chatgpt-persian-rtl/actions/workflows/validate.yml/badge.svg)](https://github.com/shahinesi/chatgpt-persian-rtl/actions/workflows/validate.yml)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
  [![No tracking](https://img.shields.io/badge/tracking-none-success)](SECURITY.md)
</div>

# بسته‌ی راست‌چین ChatGPT

پکیج راست‌چین هوشمند برای ChatGPT که دو مسیر اصلی دارد:

- `chrome-plugin/` برای افزونه‌ی کروم و نسخه‌ی وب
- `desktop/` برای بسته‌ی پچ و بازگردانی ChatGPT دسکتاپ روی macOS و Windows

> این پروژه مستقل است و هیچ وابستگی یا تاییدی از سمت OpenAI ندارد.

## چرا این پروژه؟

<p align="center">
  <img src="docs/diagrams/rtl-problem.svg" alt="مقایسه مشکل RTL قبل و بعد از ChatGPT Persian RTL" width="100%">
</p>

- متن فارسی و عربی را با اولویت خوانایی راست‌چین می‌کند
- متن‌های ترکیبی با انگلیسی را بدون به‌هم‌ریختن چیدمان تشخیص می‌دهد
- بولت، شماره‌گذاری، نقل‌قول و URL تشخیص جهت را خراب نمی‌کنند
- کد، جدول، فرمول و محتوای فنی همچنان LTR می‌مانند
- فونت Vazirmatn داخل پروژه قرار گرفته تا خروجی آفلاین و قابل‌اعتماد باشد

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

منظور از «یک کلیک» در این پروژه این است که کاربر نهایی به Node.js و build محلی نیاز ندارد.

- برای وب: از خروجی آماده‌ی `chrome-plugin/dist/` یا نسخه‌ی منتشرشده استفاده کن و افزونه را از `chrome://extensions` بارگذاری کن.
- برای دسکتاپ macOS: مسیر `desktop/macos/` را ببین.
- برای دسکتاپ Windows: مسیر `desktop/windows/` را ببین.

## نصب توسط هوش مصنوعی

اگر می‌خواهی همین کار را به یک AI بدهی، این دستور کار را به آن بده:

> پروژه را بخوان، `chrome-plugin/` را برای ChatGPT در وب آماده کن، منطق RTL را برای بولت و متن ترکیبی اصلاح کن، فونت Vazirmatn را داخل پروژه قرار بده، و بخش‌های `desktop/macos/` و `desktop/windows/` را طبق README به‌روز نگه دار.

## بازگردانی به حالت اولیه (Restore)

- در وب، افزونه را از Chrome غیرفعال یا حذف کن.
- در دسکتاپ، بسته‌ی بازگردانی مخصوص سیستم‌عامل را از `desktop/macos/` یا `desktop/windows/` اجرا کن و نسخه‌ی پشتیبان را برگردان.

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
