# بسته‌ی دسکتاپ برای ChatGPT

این پوشه مسیر دسکتاپ پروژه است و به دو بخش جدا تقسیم شده:

<p align="center">
  <img src="../docs/diagrams/desktop-patch-flow.svg" alt="جریان patch کردن app.asar در نسخه دسکتاپ ChatGPT" width="100%">
</p>

| مسیر | کاربرد |
|---|---|
| `macos/` | نصب و بازگردانی نسخه Electron/Codex روی macOS |
| `windows/` | نصب و بازگردانی نسخه Electron/Codex روی Windows |
| `bin/` | patcher مشترک برای targetهای Electron/asar |
| `shared/` | CSS مشترک RTL و فونت Vazirmatn |

## ماتریس پشتیبانی

| برنامه | وضعیت |
|---|---|
| `ChatGPT.app` با `com.openai.codex` | پشتیبانی می‌شود |
| `ChatGPT Classic.app` با `com.openai.chat` | فعلا پشتیبانی نمی‌شود |

دلیل این تفکیک فنی است: `ChatGPT.app` یک اپ Electron با `app.asar` است و RTL/font patch روی assetهای وب و preload آن قابل اعمال است. اما `ChatGPT Classic.app` یک اپ native مبتنی بر `ChatGPT.framework` و bundleهای Swift است و دیگر surface مشابه `app.asar` برای این patcher ندارد.

## ایده فنی

این بخش از الگوی patcher دسکتاپ Electron الهام گرفته است: پیدا کردن `app.asar`، ساخت نسخه‌ی پشتیبان، استخراج، تزریق CSS/JS، بسته‌بندی دوباره و امکان Restore.

در macOS علاوه بر repack، hash مربوط به `ElectronAsarIntegrity` در `Info.plist` به‌روزرسانی می‌شود و bundle به‌صورت ad-hoc دوباره sign و validate می‌شود. patch فقط زمانی موفق تلقی می‌شود که این مسیر کامل تمام شود.

در Windows مسیرهای رایج نصب ChatGPT بررسی می‌شوند و اگر برنامه در مسیر سفارشی نصب شده باشد، می‌توان مسیر برنامه یا خود `app.asar` را به دستور داد.

## نصب سریع

```bash
cd desktop
npm install
npm run patch:macos
```

برای Windows:

```powershell
cd desktop
npm install
npm run patch:windows
```

## بازگردانی

<p align="center">
  <img src="../docs/diagrams/restore-safety.svg" alt="جریان بازگردانی امن با نسخه پشتیبان" width="100%">
</p>

```bash
cd desktop
npm run restore:macos
```

برای Windows:

```powershell
cd desktop
npm run restore:windows
```

## مسیر سفارشی

اگر ChatGPT در مسیر پیش‌فرض نیست، مسیر نسخه Electron یعنی `ChatGPT.app`، پوشه نصب یا فایل `app.asar` را به دستور اضافه کنید.

```bash
npm run patch:macos -- /Applications/ChatGPT.app
```

```powershell
npm run patch:windows -- "$env:LOCALAPPDATA\Programs\ChatGPT\resources\app.asar"
```

## بسته آماده بدون Node.js

در حالت توسعه، patcher با Node.js اجرا می‌شود. خروجی انتشار باید به‌صورت binary یا installer بسته‌بندی شود تا کاربر نهایی به Node.js نیاز نداشته باشد.
