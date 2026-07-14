# Contributing

Thank you for helping improve ChatGPT Persian RTL.

## Development workflow

1. Fork the repository and create a focused branch.
2. Make the smallest change required.
3. Run `npm test`.
4. Run `npm run build` and install the generated ZIP as an unpacked extension for manual verification.
5. Open a pull request describing the problem, approach and test results.

## Manual test checklist

- Persian and Arabic messages render RTL.
- Fully English messages render LTR.
- Mixed Persian/English text remains readable.
- Code blocks, inline code, formulas and tables remain LTR.
- Streaming responses update correctly.
- The composer caret and Arrow/Home/End behavior remain natural.
- Sidebar, header, model picker, menus, buttons and modals remain unchanged.
- Disabling the extension removes all managed attributes immediately.

## Selector changes

Prefer semantic attributes such as `data-message-author-role` and `#prompt-textarea`. Do not introduce broad selectors for `html`, `body`, `main`, generated class names or the entire application shell.
