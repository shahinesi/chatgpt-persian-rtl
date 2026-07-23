# ADR: VS Code Codex RTL Runtime Injection

## Status
Accepted

## Context
مسیر `vscode/` باید RTL فارسی را فقط روی پنل Codex داخل VS Code اعمال کند، بدون این‌که:

1. باینری VS Code تغییر کند
2. افزونه OpenAI patch شود
3. پروفایل واقعی کاربر از بین برود
4. کل رابط VS Code ناخواسته RTL شود

راه‌حل باید با lifecycle واقعی webview داخل VS Code کار کند؛ یعنی target ممکن است دیر ظاهر شود، دوباره ساخته شود، یا بعد از باز شدن پنل Codex تازه قابل تزریق باشد.

پیاده‌سازی موجود این نیازها را هم‌زمان دارد:

- launch در پروفایل عادی VS Code
- fallback ایزوله برای شرایط ناسازگار
- پیدا کردن `vscode-webview` مربوط به `openai.chatgpt`
- تزریق runtime و style فقط روی surface مربوط به Codex
- verify کردن reachability و سلامت runtime با diagnose مستقل

## Decision

### 1. External launcher به‌جای patch داخلی
RTL از بیرون VS Code و با یک launcher مستقل فعال می‌شود.

- پیدا کردن VS Code از `/Applications/Visual Studio Code.app` یا `Insiders`
- اجرا با `--remote-debugging-port` روی loopback
- استفاده از پروفایل عادی به‌صورت پیش‌فرض
- فعال‌سازی حالت `isolated` فقط به‌عنوان fallback

این تصمیم دست‌کاری bundle و ریسک شکستن نصب اصلی را حذف می‌کند.

### 2. Targeted webview injection
تزریق فقط روی target مربوط به Codex انجام می‌شود، نه روی کل workbench.

- workbench با `vscode-file://.../workbench.html` رد می‌شود
- فقط `vscode-webview:` معتبر برای `extensionId=openai.chatgpt` پذیرفته می‌شود
- presence پنل Codex با hintهای DOM و editor probe امتیازدهی می‌شود

این تصمیم جلوی RTL ناخواسته در explorer، editor، terminal و سایر بخش‌های VS Code را می‌گیرد.

### 3. Persistent runtime
runtime تزریق‌شده باید idempotent و ماندگار باشد.

- script روی document جدید register می‌شود
- روی target فعلی هم بلافاصله evaluate می‌شود
- بعد از navigation، target recreation و frame changes دوباره ensure می‌شود
- style و markerهای runtime اگر حذف شوند، restore می‌شوند

### 4. Shared font and bidi assets
مسیر `vscode/` منطق bidi و فونت را دوباره اختراع نمی‌کند؛ از assetهای shared استفاده می‌کند.

- `desktop/shared/rtl-runtime.js`
- `desktop/shared/rtl-patch.css`
- `desktop/shared/fonts/webfonts/`

خود adapter فقط لایه VS Code compatibility و target lifecycle را اضافه می‌کند.

### 5. Background daemon with explicit state
حالت پس‌زمینه با LaunchAgent و state file کنترل می‌شود.

- state canonical در `~/Library/Application Support/chatgpt-persian-rtl/vscode-profile`
- process ownership مشخص برای adapter و Electron
- `rtl:stop` برای cleanup کامل
- `rtl:diagnose` برای health check و report

## Consequences

### Benefits
- بدون تغییر در bundle و extension
- سازگار با پروفایل عادی کاربر
- محدود به webview مربوط به Codex
- قابلیت diagnose و stop مستقل
- امکان fallback ایزوله بدون تغییر معماری اصلی

### Drawbacks
- وابسته به remote debugging و lifecycle داخلی webview است
- اگر selectorها یا query parameterهای webview عوض شوند، detection باید به‌روزرسانی شود
- فعلا به macOS و مسیرهای `/Applications` وابسته است

### Alternatives Considered
1. Patch کردن خود افزونه VS Code: رد شد چون upgrade-safe نیست و maintenance بالایی دارد
2. CSS global روی کل workbench: رد شد چون کل VS Code را درگیر می‌کند
3. فقط پروفایل ایزوله: رد شد چون تجربه کاربر و session واقعی را از حالت پیش‌فرض خارج می‌کند
4. Manual DevTools injection: رد شد چون پایدار، قابل‌تکرار و اپراتوری نیست

## Compliance

- بدون tracking یا analytics اضافه
- بدون ذخیره credential یا token
- بدون تغییر دائمی در VS Code bundle
- failureها باید از طریق launcher/diagnose شفاف گزارش شوند
