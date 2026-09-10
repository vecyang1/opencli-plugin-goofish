# Changelog - OpenCLI Plugin Goofish

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
