# macOS

این مسیر برای ChatGPT Desktop روی macOS است.

<p align="center">
  <img src="../../docs/diagrams/desktop-patch-flow.svg" alt="جریان patch کردن ChatGPT Desktop روی macOS" width="100%">
</p>

## نصب

```bash
cd desktop
bash macos/install.sh
```

اگر برنامه در مسیر پیش‌فرض نیست:

```bash
cd desktop
bash macos/install.sh /Applications/ChatGPT.app
```

## بازگردانی

<p align="center">
  <img src="../../docs/diagrams/restore-safety.svg" alt="بازگردانی امن نسخه پشتیبان در macOS" width="100%">
</p>

```bash
cd desktop
bash macos/restore.sh
```

## رفتار فنی

- مسیرهای `/Applications/ChatGPT.app` و `~/Applications/ChatGPT.app` بررسی می‌شوند.
- فایل `Contents/Resources/app.asar` patch می‌شود.
- نسخه‌ی پشتیبان با پسوند `.chatgpt-persian-rtl.bak` کنار فایل اصلی ساخته می‌شود.
- بعد از patch یا restore، hash داخل `Info.plist` به‌روزرسانی می‌شود.
- امضای قبلی و quarantine پاک می‌شوند تا نسخه‌ی تغییرکرده اجرا شود.
