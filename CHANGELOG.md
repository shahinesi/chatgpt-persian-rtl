# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-07-14

### Added

- Smart Persian and Arabic RTL detection for ChatGPT messages.
- Automatic LTR handling for fully English messages.
- RTL/LTR switching in the ChatGPT composer without modifying its value or selection.
- LTR isolation for code blocks, inline code, formulas, tables, links and technical fragments.
- MutationObserver support for streamed responses, new messages and conversation navigation.
- Popup toggle persisted through `chrome.storage.local`.
- Minimal Manifest V3 permissions and official ChatGPT domain restrictions.
