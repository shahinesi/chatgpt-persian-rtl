ChatGPT Persian RTL — VS Code normal-profile switch

This package changes only VS Code launch/profile handling.
The working RTL, frame injection, and Vazirmatn font logic are preserved.

Replace the included `vscode` folder over:
  /Users/shahineskandari/Desktop/chatgpt-persian-rtl/vscode

Default commands now use your normal VS Code profile:
  npm --prefix vscode run rtl:launch
  npm --prefix vscode run rtl:launch:bg

Isolated fallback:
  npm --prefix vscode run rtl:launch:isolated
  npm --prefix vscode run rtl:launch:bg:isolated

Before the first normal-profile test:
  1. npm --prefix vscode run rtl:stop
  2. Quit every VS Code window completely.
  3. npm --prefix vscode run rtl:launch:bg
