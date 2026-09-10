# Changelog - OpenCLI Plugin Goofish

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-09-11

### Added
- **Global Standalone CLI (`bin/xy-chat.js` / `xy-chat`)**: Unified entrypoint supporting `doctor`, `whoami`, `personal`, `account`, `orders`, `favorites`, `inbox`, `messages`, `chat`, `search`, `sync`, `stats`, and `export`.
- **Single Source of Truth (SSOT) SQLite Storage (`src/db.js`)**: Built-in persistence via Node.js native `node:sqlite` (`DatabaseSync`), storing orders, favorites, sessions, and messages with FTS5 millisecond full-text retrieval.
- **Shared Resilience Module (`clis/goofish/_shared.js`)**: Introduced `safeGoto` with automatic retry and `location.href` fallback to permanently eliminate transient `Navigation rejected.` CDP errors.
- **Global Skill Registration**: Created `goofish-ops` in global skills directory (`~/.gemini/antigravity/skills/goofish-ops/SKILL.md`) for immediate multi-agent discoverability.

### Fixed
- **Ghost Logic Elimination**: Completely eradicated hardcoded nicknames (`Vector_Y`), hardcoded cities, and job titles across all 18 adapters. Now dynamically extracts exact live profile data (location: 日本, published items: 36, followers: 16, following: 11, reviews: 213).
- **Virtual List Async Scroll Synchronization**: Implemented smooth in-page async scrolling loop in `chat.js` and `messages.js` to reliably resolve asynchronous Ant Design contact rendering.
- **Two-Sided Testing Verified**: Full E2E tests against real live Goofish pages and adversarial rejection tests (clean `AUTH_REQUIRED` and `ARGUMENT` exits).

## [1.1.3] - 2026-09-10

### Changed
- Migrated default browser context to dedicated lightweight Chrome Profile 38 (`wg7phej7`, `profile38`) at `~/Library/Application Support/Google/Chrome/Profile 38` to resolve cross-extension iframe injection and Chrome CDP debugger boundary collisions.
- Added operational policy for automatic Profile 38 launching and proactive interactive authentication prompting on `AUTH_REQUIRED`.

## [1.1.2] - 2026-09-03

### Changed
- Documented OpenCLI dual command-timeout architecture and Chrome Manifest V3 service worker lifecycle mitigation.

## [1.1.1] - 2026-09-02

### Fixed
- Replaced directory symlinks with direct file copying in `install-adapters.sh` to resolve adapter loader bypass in OpenCLI.
- Added drift guard validation script preventing unsynchronized local modifications.

## [1.1.0] - 2026-08-29

### Added
- **Seller Intelligence & Product Discovery**:
  - `seller` command: Profiles seller activity, analyzes reviews, and generates automated bargain feasibility scores.
  - `recommend` command: Extracts contextual SKU recommendations from feed carousels.
  - `search`: Added regional geo-filtering, price drop tags, publish timestamps, and search suggestions.
- **IM Messaging & Orders Suite**:
  - Full bidirectional chat messaging, backward message list scrolling, and virtual list handling.
  - Historical multi-year order timeline pagination and order status filtering.
  - Comprehensive automated test suite with 14/14 passing E2E tests.

### Changed
- Defaulted product searches to nationwide scope with 3.4-second response time and deduplication.

## [1.0.0] - 2026-08-29

### Added
- Initial release of OpenCLI plugin for Goofish (闲鱼).
- Zero-captcha browser session reuse for identity, order histories, favorites, and seller interactions.
