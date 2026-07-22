# macOS

این مسیر فقط برای نسخه Electron/Codex روی macOS است؛ یعنی همان appای که `Contents/Resources/app.asar` دارد.

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

`ChatGPT Classic.app` target این اسکریپت نیست. آن برنامه native است و با `ChatGPT.framework` اجرا می‌شود، نه با `app.asar`.

اگر با خطای `Operation not permitted` یا `EPERM` روبه‌رو شدید، macOS اجازه تغییر برنامه‌های داخل `/Applications` را به ترمینال نداده است. از مسیر **System Settings → Privacy & Security → App Management** یا **Full Disk Access** به Terminal، iTerm یا IDE خودتان دسترسی بدهید و دستور نصب را دوباره اجرا کنید.

اسکریپت نصب در این حالت ابتدا بدون دسترسی admin تلاش می‌کند و اگر macOS اجازه نوشتن نداد، همان patch را با `sudo` دوباره اجرا می‌کند. نصب dependencyها با `sudo` انجام نمی‌شود تا فایل‌های پروژه مالک root نشوند.

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
- runtime مستقل RTL به preload و assetهای مکالمه تزریق می‌شود تا فونت Vazirmatn و جهت متن واقعا روی DOM پیام‌ها، بولت‌ها، نقل‌قول‌ها و composer اعمال شود.
- منبع رسمی فونت Vazirmatn: [rastikerdar.github.io/vazirmatn/fa](https://rastikerdar.github.io/vazirmatn/fa)
- بعد از patch یا restore، hash داخل `Info.plist` به‌روزرسانی می‌شود.
- bundle دوباره sign و با `codesign --verify --deep --strict` اعتبارسنجی می‌شود؛ اگر این مرحله رد شود، patch نباید موفق اعلام شود.
