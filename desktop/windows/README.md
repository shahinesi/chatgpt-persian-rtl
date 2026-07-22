# Windows

این مسیر برای ChatGPT Desktop روی Windows است.

منبع رسمی فونت Vazirmatn: [rastikerdar.github.io/vazirmatn/fa](https://rastikerdar.github.io/vazirmatn/fa)

<p align="center">
  <img src="../../docs/diagrams/desktop-patch-flow.svg" alt="جریان patch کردن ChatGPT Desktop روی Windows" width="100%">
</p>

## نصب

```powershell
cd desktop
powershell -ExecutionPolicy Bypass -File .\windows\install.ps1
```

اگر برنامه در مسیر پیش‌فرض نیست:

```powershell
cd desktop
powershell -ExecutionPolicy Bypass -File .\windows\install.ps1 "$env:LOCALAPPDATA\Programs\ChatGPT\resources\app.asar"
```

## بازگردانی

<p align="center">
  <img src="../../docs/diagrams/restore-safety.svg" alt="بازگردانی امن نسخه پشتیبان در Windows" width="100%">
</p>

```powershell
cd desktop
powershell -ExecutionPolicy Bypass -File .\windows\restore.ps1
```

## رفتار فنی

- مسیرهای رایج نصب در `LOCALAPPDATA` و `Program Files` بررسی می‌شوند.
- فایل `resources\app.asar` patch می‌شود.
- نسخه‌ی پشتیبان با پسوند `.chatgpt-persian-rtl.bak` کنار فایل اصلی ساخته می‌شود.
- Restore همان نسخه‌ی پشتیبان را روی `app.asar` برمی‌گرداند.
