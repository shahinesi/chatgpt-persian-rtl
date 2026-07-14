# Security Policy

## Supported versions

Security fixes are provided for the latest released version.

## Reporting a vulnerability

Please do not open a public issue for a security vulnerability. Report it privately through GitHub's **Security advisories → Report a vulnerability** section for this repository.

Include the affected version, reproduction steps, expected impact and any proposed mitigation. Reports will be acknowledged as soon as reasonably possible.

## Security design

This extension:

- requests only the `storage` permission;
- runs only on official ChatGPT domains listed in `manifest.json`;
- contains no remote code, analytics, tracking, network requests or third-party runtime dependencies;
- does not read or transmit conversation content outside the active page;
- stores only the enabled/disabled preference locally.
