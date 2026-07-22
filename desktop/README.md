# بسته‌ی دسکتاپ برای ChatGPT Persian RTL

این پوشه مسیر دسکتاپ پروژه است و به دو بخش جدا تقسیم شده است:

<p align="center">
  <img src="../docs/diagrams/desktop-patch-flow.svg" alt="جریان patch کردن app.asar در نسخه دسکتاپ ChatGPT" width="100%">
</p>

| مسیر | کاربرد |
|---|---|
| `macos/` | نصب و بازگردانی نسخه Electron/Codex روی macOS |
| `windows/` | نصب و بازگردانی نسخه Electron/Codex روی Windows |
| `bin/` | پچر مشترک برای targetهای Electron/asar |
| `shared/` | CSS مشترک RTL و فونت Vazirmatn |

منبع رسمی فونت Vazirmatn: [rastikerdar.github.io/vazirmatn/fa](https://rastikerdar.github.io/vazirmatn/fa)

## ماتریس پشتیبانی

| برنامه | وضعیت |
|---|---|
| `ChatGPT.app` با `com.openai.codex` | پشتیبانی می‌شود |
| `ChatGPT Classic.app` با `com.openai.chat` | probe جداگانه دارد |

دلیل این تفکیک فنی است: `ChatGPT.app` یک اپ Electron با `app.asar` است و پچ RTL/فونت روی assetهای وب و preload آن قابل اعمال است. اما `ChatGPT Classic.app` یک اپ native مبتنی بر `ChatGPT.framework` و bundleهای Swift است و سطح آن باید با probe جداگانه‌ی Accessibility/view hierarchy بررسی شود.

## ایده فنی

این بخش از الگوی پچر دسکتاپ Electron الهام گرفته است: پیدا کردن `app.asar`، ساخت نسخه‌ی پشتیبان، استخراج، تزریق CSS/JS، بسته‌بندی دوباره و امکان بازگردانی.

در macOS علاوه بر repack، hash مربوط به `ElectronAsarIntegrity` در `Info.plist` به‌روزرسانی می‌شود و bundle به‌صورت ad-hoc دوباره sign و validate می‌شود. پچ فقط زمانی موفق تلقی می‌شود که این مسیر کامل تمام شود.

در Windows مسیرهای رایج نصب ChatGPT بررسی می‌شوند و اگر برنامه در مسیر سفارشی نصب شده باشد، می‌توان مسیر برنامه یا خود `app.asar` را به دستور داد.

## نصب سریع

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

## نصب مستقیم از اینترنت

<div dir="ltr" align="left">

```bash
git clone --depth 1 https://github.com/shahinesi/chatgpt-persian-rtl.git /tmp/chatgpt-persian-rtl && cd /tmp/chatgpt-persian-rtl/desktop && npm install && npm run patch:macos
```

</div>

<div dir="ltr" align="left">

```powershell
git clone --depth 1 https://github.com/shahinesi/chatgpt-persian-rtl.git $env:TEMP\chatgpt-persian-rtl; Set-Location $env:TEMP\chatgpt-persian-rtl\desktop; npm install; npm run patch:windows
```

</div>

<div dir="rtl" align="right">

## injector خارجی بدون تغییر bundle

این helperها اپ رسمی را دست‌نخورده نگه می‌دارند و فقط در زمان اجرا روی loopback به CDP وصل می‌شوند:

</div>

<div dir="ltr" align="left">

```bash
cd chatgpt-persian-rtl/desktop
npm run rtl:canary
```

</div>

<div dir="ltr" align="left">

```bash
cd chatgpt-persian-rtl/desktop
npm run rtl:launch
```

</div>

<div dir="ltr" align="left">

```bash
cd chatgpt-persian-rtl/desktop
npm run rtl:stop
```

</div>

<div dir="rtl" align="right">

برای Classic:

</div>

<div dir="ltr" align="left">

```bash
cd chatgpt-persian-rtl/desktop
npm run classic:probe
```

</div>

## بازگردانی

<p align="center">
  <img src="../docs/diagrams/restore-safety.svg" alt="جریان بازگردانی امن با نسخه پشتیبان" width="100%">
</p>

<div dir="ltr" align="left">

```bash
cd chatgpt-persian-rtl/desktop
npm run restore:macos
```

</div>

برای Windows:

<div dir="ltr" align="left">

```powershell
Set-Location chatgpt-persian-rtl\desktop
npm run restore:windows
```

</div>

## مسیر سفارشی

اگر ChatGPT در مسیر پیش‌فرض نیست، مسیر نسخه Electron یعنی `ChatGPT.app`، پوشه نصب یا فایل `app.asar` را به دستور اضافه کنید.

<div dir="ltr" align="left">

```bash
npm run patch:macos -- /Applications/ChatGPT.app
```

</div>

<div dir="ltr" align="left">

```powershell
npm run patch:windows -- "$env:LOCALAPPDATA\Programs\ChatGPT\resources\app.asar"
```

</div>

## بسته آماده بدون Node.js

در حالت توسعه، پچر با Node.js اجرا می‌شود. خروجی انتشار باید به‌صورت binary یا installer بسته‌بندی شود تا کاربر نهایی به Node.js نیاز نداشته باشد.
