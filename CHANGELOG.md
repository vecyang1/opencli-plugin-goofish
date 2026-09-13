# Changelog - OpenCLI Plugin Goofish

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] - 2026-09-13

### Added & Hardened (SSOT Hardening, Adversarial Verification & Write-Back Automation)
- **SSOT Resolution Precedence & Schema Auto-Migration (`clis/goofish/_db.js`)**:
  - Unified database path resolution across all commands and tools: `GOOFISH_DB` > `GOOFISH_DATA_DIR` > `~/data/goofish.db` (Primary User SSOT) > `<cwd>/data/goofish.db` (Workspace fallback).
  - Implemented automatic schema migrations in `initSchema` for `candidates` (`images`, `defect_notes` columns) and `seller_reviews` (`seller_user_id`).
  - Added conditional `CASE WHEN` conflict guards in `saveCandidates` to prevent unhydrated or placeholder entries (`'闲鱼商品'`, `'¥0'`) from overwriting valid candidate data.
- **Unidirectional Write-Back Across All Live Adapters**:
  - `search.js`: Automatically persists deduplicated search results to SQLite SSOT via `saveCandidates(..., { filterAccessories: true })`.
  - `detail.js`: Automatically persists rich candidate data into SQLite SSOT when valid item data is extracted.
  - `inbox.js`: Synchronizes contacts into the `sessions` table in SQLite SSOT.
  - `orders.js`: Persists deduplicated historical orders into SQLite SSOT.
  - `favorites.js`: Persists deduplicated favorites into SQLite SSOT.
  - `messages.js`: Persists extracted conversation messages into SQLite SSOT and triggers `syncSellerReviewsFromSessionsAndMessages()`.
- **Universal Category Inference & Alias Normalization (`_contract.js`, `candidates.js`)**:
  - Added positional category mapping in `candidates.js` via `inferCategory` to support queries like `opencli xianyu candidates ugreen_hub` or `xy-chat candidates ugreen_hub`.
  - Extended accessory exclusion rules and unfit seller regex to capture `出掉了`, `出完了`, `无货`, `暂时没货` without false positives on buyer queries.
- **Ant Design Virtual List Scrolling Fix (`inbox.js`)**:
  - Fixed virtual list unmounting bug by dispatching synthetic `scroll` events after stepping `scrollTop += 350`, ensuring React virtualized lists trigger re-renders.
- **Adversarial & Negative Edge-Case Test Suite (`tests/adversarial_and_negative.test.js`)**:
  - Added 5 exhaustive adversarial test scenarios covering malformed input objects, boundary prices, digital accessory noise rejection, buyer/seller dialogue attribution under adversarial phrasing, and idempotent multi-write synchronization (38/38 tests passing across 8 suites).

## [1.5.0] - 2026-09-13

### Added & Generalised (Universal Category Generalization & Zero-Hang Architecture)
- **Universal Multi-Category Support (`_contract.js`, `clis/goofish/pick.js`)**:
  - Modularized noise filtering into `UNIVERSAL_JUNK_REGEX`, `GUITAR_ACCESSORY_REGEX`, and `DIGITAL_NOISE_REGEX`.
  - Upgraded `isAccessoryTitle(title, category, customExclude)` with category awareness, eliminating false positives on 3C digital terms (e.g., "千兆网口", "拓展坞", "转接器").
  - Generalised `pick.js` to accept arbitrary product keywords (e.g., `opencli goofish pick "绿联 15375"`) alongside preset guitar queries, with support for `--category`, `--min-price`, `--max-price`, `--exclude`, `--sort`, and `--limit`.
- **Navigation Resilience & CDP Hang Elimination (`_shared.js`)**:
  - Implemented a 6000ms `Promise.race` timeout guard in `safeGoto`.
  - Eliminates 60s CDP hangs caused by Alibaba's long-polling websockets/trackers by falling back instantly to client-side `window.location.href = url` and DOM content load verification.
- **Unified Toolchain Harmonization & Zero Snippet Rot (`bin/xy-chat.js`)**:
  - Harmonized `bin/xy-chat.js` `case 'pick':` to delegate directly to `opencli xianyu pick`, eliminating duplicated scratch logic and unifying CLI entry points.
  - Removed deprecated one-off scratch scripts.
- **Contract & Type Safety Expansion (`tests/contract.test.js`)**:
  - Added unit tests for 3C hub accessories, packaging junk detection, custom exclusion lists, and dynamic category inference (32/32 tests passing with zero install drift).

## [1.4.2] - 2026-09-11

### Added & Hardened (Anti-Ban & Human Behavior Simulation)
- **Code-Level Rate Limiter & Navigation Cooldown (`_shared.js`, Rung 3 Architectural Guard)**:
  - Enforced `enforceRateLimit(url)` before all page navigations via `safeGoto`.
  - Defined sensitive endpoint cooldowns: Web IM (`/im`, `/chat`) >= 5500ms + 1500~3500ms jitter, item details (`/item?id=`) >= 3500ms + 1000~2500ms jitter, search >= 2500ms + 1000~2000ms jitter.
  - Implemented `humanDelay(minMs, maxMs)` providing stochastic human pauses between sequential operations.
- **Throttled Batch Ingestion (`bin/xy-chat.js`)**:
  - Inserted mandatory `await humanDelay(3500, 6500)` inside `sync-chats` seller loop to prevent burst navigations against `/im`.
- **Automated Rate Limiter Testing (`tests/rate_limiter.test.js`)**:
  - Added unit test suite covering endpoint classification, test-environment auto-bypass, and cooldown logic (32/32 tests passing).
- **Operational Risk Governance (`SKILL.md`)**:
  - Documented 2026-09-11 01:32 violation incident root cause analysis, Alibaba anti-bot mechanics, and the immediate mobile app face-scan unban pathway.

## [1.4.1] - 2026-09-11

### Fixed & Hardened
- **SQLite WAL Mode & Concurrency Resilience (`_db.js`, `src/db.js`)**:
  - Initialized `PRAGMA journal_mode = WAL;`, `PRAGMA busy_timeout = 5000;`, and `PRAGMA synchronous = NORMAL;` to prevent SQLite lock contention under concurrent adapter runs.
- **Centralized Accessory Filtering & Ingestion Guard (`_contract.js`, `_db.js`, `watch.js`, `pick.js`)**:
  - Centralized `isAccessoryTitle(title, category)` and `ACCESSORY_REGEX` in `_contract.js` to eliminate duplicated snippet rot.
  - Implemented `purgeJunkCandidates()` removing cables, pedals, and sub-¥400 accessories from `candidates` table.
  - Guarded `saveCandidates` with automatic accessory rejection and baseline guitar price checks (default min ¥400 for guitar queries).
- **Dual-Key Identity in `candidates_view` (`_contract.js`)**:
  - Added `seller_user_id` to `seller_reviews`. Upgraded `candidates_view` to join on `(c.seller = r.seller OR (c.seller_user_id != '' AND c.seller_user_id != '-' AND r.seller_user_id != '' AND c.seller_user_id = r.seller_user_id))`, ensuring risk status persists across seller nickname changes.
- **Zero-Browser Overhead on Local CLI Adapters (`candidates.js`, `reviews.js`)**:
  - Reconfigured `candidates.js` and `reviews.js` with `browser: false` and `strategy: Strategy.LOCAL` for instant sub-10ms response times without launching Chromium.
- **Context-Aware Seller Chat Classification (`_contract.js`)**:
  - Upgraded `classifySellerCommunication` with negative lookbehinds/lookaheads `(?<!有)没有(?!问题|毛病|瑕疵|损坏)` to ensure buyer questions like "请问有没有现货" never misclassify a seller as `unfit`.
  - Added intelligent fallback to check `session.last_message` when detailed messages are not yet synchronized.
- **Flaky Search Navigation Auth Check Removed (`watch.js`, `pick.js`)**:
  - Removed `checkAuth` from search page navigation routines where account header DOM selectors are intermittently absent.
- **Candidate Cross-Referencing in `sync-chats` (`bin/xy-chat.js`)**:
  - `xy-chat sync-chats` now automatically cross-references and synchronizes chat logs for sellers discovered in the candidate database.

## [1.4.0] - 2026-09-11

### Added
- **Contract-First Architecture & End-to-End Type Safety (`src/contract.js`, `clis/goofish/_contract.js`)**:
  - Authoritative `SCHEMA_CONTRACT` specifying table schemas, constraints, and column definitions.
  - Dynamic DDL generator (`generateDdl()`) replacing brittle hardcoded SQL strings.
  - Runtime object validators (`validateCandidate`, `validateSellerReview`, `validateOrder`) enforcing typed integrity before database persistence.
- **Zero Redundant State & Dynamic SSOT Projection (`candidates_view`)**:
  - Eliminated duplicated `seller_status` and `seller_note` columns in candidates; `candidates_view` executes dynamic `LEFT JOIN seller_reviews ON candidates.seller = seller_reviews.seller`.
  - When seller reputation changes (e.g. seller goes unresponsive or confirms stock), all past and future candidates for that seller automatically project the updated status with zero redundant table writes.
- **Push-Style Real-Time Sync & Reactive Live Queries (`src/db.js`, `clis/goofish/_db.js`)**:
  - Integrated `dbEmitter` and `subscribeLiveQuery` engine.
  - Writes to SQLite automatically trigger typed mutation events, pushing fresh query snapshots to live subscribers in sub-millisecond latency.
- **Native OpenCLI Adapters & Unified Entrypoint**:
  - Implemented `candidates.js`, `reviews.js`, `pick.js`, and `watch.js` inside `clis/goofish/`, fully deployable to `~/.opencli/clis/goofish/` and `~/.opencli/clis/xianyu/`.
  - Both `xy-chat` and `opencli xianyu` share the exact same underlying logic, contracts, and SQLite SSOT database.
- **Push-Style Real-Time Watch (`opencli xianyu watch` / `xy-chat watch`)**:
  - Continuous or iterative background polling with reactive live query subscription.
  - Real-time event notifications (`🆕 新上架`, `📉 降价通知`, `🔍 实时对齐`) emitted as items appear.
- **Comprehensive Two-Sided Verification & Test Suite**:
  - Added `tests/contract.test.js`, `tests/ssot_unidirectional.test.js`, and `tests/live_query.test.js`.
  - 22/22 tests passing green across contract, database CRUD, install drift, live queries, smoke guards, and SSOT views.
- **Cross-Agent Discoverability**:
  - Updated `goofish-ops` canonical skill (`~/.gemini/antigravity/skills/goofish-ops/SKILL.md`) and 2nd Brain capabilities registry (`00 - System/registries/project-capabilities.md`).

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
