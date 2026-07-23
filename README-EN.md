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

# 🌟 ChatGPT Persian RTL Patcher
**Automatic right-to-left patching and beautiful typography for ChatGPT Desktop and the web.**

A smart RTL package for ChatGPT with two main paths:

<p align="center">
✨ *RTL with care for Persian, Arabic, Hebrew, and every right-to-left language; Vazirmatn in memory of Saber Rastikerdar.* ✨
</p>

- `chrome-plugin/` for the Chrome extension and web version
- `desktop/` for the patch and restore package for ChatGPT Desktop on macOS and Windows

> This project is fully independent and is not affiliated with or endorsed by OpenAI.

## Why this project?

<p align="center">
  <table>
    <tr>
      <td align="center" width="50%">
        <strong>Before the patch</strong><br>
        <img src="docs/assets/Before_RTL.png" alt="Before the RTL patch" width="100%">
      </td>
      <td align="center" width="50%">
        <strong>After the patch</strong><br>
        <img src="docs/assets/After_RTL.png" alt="After the RTL patch" width="100%">
      </td>
    </tr>
  </table>
</p>

- Right-aligns Persian and Arabic text with readability first
- Handles mixed English text without breaking layout
- Bullets, numbering, quotes, and URLs do not break direction detection
- Code, tables, formulas, and technical content stay LTR
- Vazirmatn is bundled so the output remains offline-friendly and reliable
- Official font source: [rastikerdar.github.io/vazirmatn/fa](https://rastikerdar.github.io/vazirmatn/fa)

## What’s included?

<p align="center">
  <img src="docs/diagrams/project-map.svg" alt="Project map for web, macOS, and Windows paths" width="100%">
</p>

| Path | Output |
|---|---|
| `chrome-plugin/` | Manifest V3 extension for ChatGPT on the web |
| `desktop/macos/` | Install and restore ChatGPT Desktop on macOS |
| `desktop/windows/` | Install and restore ChatGPT Desktop on Windows |

## Features

- RTL/LTR detection based on cleaned text, not just the first character
- Support for messages in progress and the composer
- Keeps `code`, `pre`, `table`, `math`, and technical content LTR
- Vazirmatn for natural-language text and the extension UI
- No tracking, analytics, or network requests at runtime
- Settings are stored locally only

## One-click install

<div dir="ltr" align="left">

```bash
git clone --depth 1 https://github.com/shahinesi/chatgpt-persian-rtl.git
cd chatgpt-persian-rtl/desktop
npm install
npm run patch:macos
```

</div>

<div dir="ltr" align="left">

```powershell
git clone --depth 1 https://github.com/shahinesi/chatgpt-persian-rtl.git
Set-Location chatgpt-persian-rtl\desktop
npm install
npm run patch:windows
```

</div>

### Install directly from the internet

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

## Restore to original state

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

## Contributors and call for development

If you want to help, these are the highest-value areas:

- Better direction detection for more complex mixed text
- Improved compatibility with newer ChatGPT web and desktop releases
- Testing on macOS and other Chromium-based browsers
- Better install, restore, and packaging experience
- Font, spacing, and RTL rendering polish

Clean, documented PRs and issues are always welcome.

## Support the project

- Star the repo to support the project
- If you find a bug or edge case, send a precise issue with a short repro
- If you have time, send a PR and help keep support stable for newer ChatGPT versions

## Acknowledgements

This project was built with respect for the creator of Vazirmatn, the late **Saber Rastikerdar**.

## License

This project is released under the [MIT](LICENSE) license.
