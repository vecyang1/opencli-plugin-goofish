# Changelog - OpenCLI Plugin Goofish

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-09-11

### Added
- **Multi-Category Candidate Pipeline & SQLite SSOT (`src/db.js`, `bin/xy-chat.js`)**:
  - `candidates` SQLite table with FTS5 search, `price_num` indexing, category tagging (`nexg2_nylon`, `lava_me_air`, `lava_me_4`), real item image URL capture, and seller vetting notes.
  - `seller_reviews` SQLite table tracking seller risk status (`responsive`, `ghosted`, `unfit`, `pending`) and evaluation notes.
  - `xy-chat candidates`: Fast querying, category filtering, and status updates for evaluated second-hand listings.
  - `xy-chat reviews`: Multi-seller credibility and interaction assessment management.
  - `xy-chat sync-chats`: Automated scanner linking all active IM sessions and recent message interactions to identify unresponsive bot sellers vs verified responsive sellers.
  - `xy-chat pick`: Unified intelligent deal picker executing multi-keyword search, live detail extraction, seller risk screening, and candidate scoring.
- **Search & Detail Adapter Enhancements (`clis/goofish/search.js`, `clis/goofish/detail.js`)**:
  - Added in-page defensive JavaScript price boundary checks (`minPrice`/`maxPrice`) and numerical price sorting to prevent accessory noise.
  - Added `image_url` and `seller` extraction to search results for instant visual appraisal.
  - Added high-resolution `images` extraction (filtering out Alibaba `-tps-` sprite icons) and `seller_user_id` to detail adapter.

### Fixed
- **React Input Value Setter Fix (`clis/goofish/search.js`)**: Fixed React synthetic state bypass where direct `.value = min` assignment was ignored upon submission; implemented prototype property descriptor setter (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set`) and explicit confirm button click.
- **Accessory Keyword Filtering (`clis/goofish/search.js`, `bin/xy-chat.js`)**: Added `--exclude` flag and regex filtering (filtering out pedals, wireless mics, headsets, repair motherboards, and stickers) to eliminate non-guitar noise from skewing candidate rankings.
- **Avatar Photo Exclusion in Detail Adapter (`clis/goofish/detail.js`)**: Filtered out 110px seller avatar thumbnails (`0-mytaobao`, `0-mtopupload`, `TB1`, `TB2`, `110x10000`) so the primary item photo is always an authentic product photo.
- **Offline-First SSOT Retrieval for Chat & Orders (`bin/xy-chat.js`)**: Enabled instant local SQLite SSOT retrieval for `inbox`, `messages`, `orders`, and `favorites`, with `--live` flag for forced remote fetching.
- **CLI Argument Parsing Robustness (`bin/xy-chat.js`)**: Implemented `parseCliArgs` separating options with values (`--limit`, `--min-price`, `--max-price`, etc.) from positional arguments, preventing option values (e.g. `--limit 5`) from being mistaken for search queries or category filters.
- **Polymorphic `queryMessages` & Category Alias Mapping (`src/db.js`)**: Allowed `queryMessages` to accept either `(contact, limit)` or options object `{ contactName, limit, query }`, and mapped colloquial category aliases (`me4`, `air`, `nexg`, `2n`) to authoritative canonical keys.
- **Regex-Based Seller Risk Scoring (`src/db.js`)**: Replaced brittle substring matching with regexes classifying active seller quotes, stock confirmations, bot auto-replies, and closed trades.

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
