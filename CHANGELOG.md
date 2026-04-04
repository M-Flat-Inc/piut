# Changelog

All notable changes to `piut` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

---

## [3.12.3] — 2026-04-04

### Security

- **CRITICAL**: Fixed command injection in tool discovery — replaced `execSync(quickCommand())` shell string with `execFileSync` array form
- **MEDIUM**: Added HTTPS enforcement for `PIUT_API_BASE` environment variable
- **MEDIUM**: Config files now written with mode `0o600` (owner-only read) to protect API keys
