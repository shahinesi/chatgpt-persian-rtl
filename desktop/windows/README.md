# Windows

این مسیر برای ChatGPT Desktop روی Windows است.

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

```powershell
cd desktop
powershell -ExecutionPolicy Bypass -File .\windows\restore.ps1
```

## رفتار فنی

- مسیرهای رایج نصب در `LOCALAPPDATA` و `Program Files` بررسی می‌شوند.
- فایل `resources\app.asar` patch می‌شود.
- نسخه‌ی پشتیبان با پسوند `.chatgpt-persian-rtl.bak` کنار فایل اصلی ساخته می‌شود.
- Restore همان نسخه‌ی پشتیبان را روی `app.asar` برمی‌گرداند.
