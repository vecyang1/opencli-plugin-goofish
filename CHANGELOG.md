# Changelog - OpenCLI Plugin Goofish

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.8.2] - 2026-09-16

### Fixed (Multi-Token Search Ingestion)
- **Robust Positional Query Resolution (`clis/goofish/search.js`)**:
  - Automatically joins `kwargs._` array tokens when multiple search keywords are supplied without single-argument quotes (e.g. `opencli xianyu search 阳朔 门票`), preventing Commander.js / kwargs parser from silently dropping subsequent terms.

## [1.8.1] - 2026-09-16

### Added (Digital Nomad Rental Housing Contract & Aesthetic Grading)
- **Rental Housing Audit Contract (`clis/goofish/_contract.js`)**:
  - Implemented `auditRentalListing({ title, description, price, images })` contract function for digital nomad and long-stay housing evaluation.
  - Enforces strict rejection of deceptive listings (`非照片上的房间`, `非实拍照片`) and mandatory long-term commitments (`半年起租`, `一年起租`, `年租起`, `仅支持年付`).
  - Enforces rejection of unfurnished rooms (`毛坯`, `自备家具`, `自备床`, `无空调`, `无热水器`) and tacky slum conditions (`裸床垫`, `红塑料脸盆`, `老旧招待所`).
  - Enforces aesthetic tier grading: evaluates natural wood/wabi-sabi/minimalist style (`原木`, `侘寂`, `极简`), floor-to-ceiling panoramic windows (`落地窗`, `观景阳台`, `喀斯特峰林`), dedicated workspaces (`书桌`, `工作台`, `高速宽带`), and utilities inclusion.
  - Two-sided verification added to `tests/contract.test.js` (52/52 tests passing).

### Fixed (IM Inbox Parsing & Asynchronous Skeleton Race Condition)
- **Eliminated Skeleton Race Condition & Misattribution (`clis/goofish/inbox.js`)**:
  - Added robust skeleton detection waiting loop (`!hasSkeleton && (hasName || lines.length >= 3)`) ensuring DOM elements finish rendering before parsing.
  - Upgraded contact name extraction using precise inline CSS font-size selectors (`div[style*="font-size: 14px"]`), message selectors (`div[style*="font-size: 12px"]`), and timestamp selectors (`div[style*="font-size: 10px"]`).
  - Fixed misattribution where unread badge counts (`1`, `6`) or trade statuses were incorrectly captured as contact nicknames.

## [1.8.0] - 2026-09-14

### Added & Generalize (Universal Product Archetypes & Extensible Second-Hand Rule Engine)
- **Universal Hardware Archetypes Engine (`clis/goofish/_contract.js`)**:
  - Generalized product handling beyond guitars and single docks to support 8 major consumer hardware archetypes:
    1. `guitar`: Acoustics, electrics, silent guitars, carbon fiber (strings, capos, gigbags, pedals filtered).
    2. `digital_hub`: Multi-function docking stations, converters, hubs (cables, silicone sleeves, mismatch port counts filtered).
    3. `camera`: Mirrorless & DSLR bodies, action cams (cages, dummy batteries, chargers, lens caps, UV filters filtered).
    4. `gaming_console`: Handheld & home consoles (game cards, crystal cases, silicone covers, thumb grips, standalone docks filtered).
    5. `phone_tablet`: Smartphones and tablets (protective cases, tempered films, stylus tips, stands filtered).
    6. `audio_headphone`: Over-ear and in-ear wireless headphones (single earbud, empty charging case, ear tips filtered).
    7. `pc_hardware`: GPUs, motherboards, CPUs, RAM (empty packaging boxes, cooler fans, thermal paste, brackets filtered).
    8. `drawing_tablet`: Digital pen displays and graphics tablets (replacement nibs, pens, 3-in-1 cables, films filtered).
  - Implemented `inferArchetype(text)` for heuristic archetype classification and direct archetype name recognition.
- **Universal Product Catalog & Dynamic Runtime Registration (`clis/goofish/_contract.js`)**:
  - Established `PRODUCT_CATALOG` registry mapping product models to archetypes, default search queries, aliases, price floors, and spec constraints.
  - Implemented `registerProductSpec(spec)` for zero-code, runtime registration of new product categories.
  - Implemented `getProductSpec(nameOrQuery)` with alias, defaultQuery, and substring matching plus dynamic generic archetype fallback.
  - Implemented `getPriceFloor(categoryOrQuery)` providing authoritative price sanity thresholds across catalog items and archetypes.
- **Positive Filtering (`--require`) & Price Floor Guard (`--price-floor`)**:
  - Added `--require` flag to `clis/goofish/pick.js` and `clis/goofish/watch.js` to enforce mandatory positive keywords (e.g. `--require 尼龙,2N` or `--require 4K60,千兆`) without modifying code.
  - Added `--price-floor` flag to `clis/goofish/watch.js` allowing custom price floors to reject spurious low-price accessory listings.
- **SSOT Database Generalization (`clis/goofish/_db.js`)**:
  - Removed rigid hardcoded guitar category lists (`['nexg2_nylon', 'lava_me_air', 'lava_me_4']`) in `saveCandidates()` and `purgeJunkCandidates()`.
  - Unified price sanity validation through `getPriceFloor(candidate.category || options.category)`.
- **CLI Ergonomics & Anti-Fragmentation (`bin/xy-chat.js`, `clis/goofish/pick.js`)**:
  - Harmonized category inference and search config dispatch across all commands.
  - Enabled multi-category queries and customizable exclusions via unified interfaces.
- **Exhaustive Two-Sided Verification (`tests/contract.test.js`, `tests/adversarial_and_negative.test.js`)**:
  - Added test cases validating all 8 archetypes, dynamic catalog registration, positive `--require` filtering, and price floor guards.
  - Total test suite expanded to **51 tests, 100% passing green**.

## [1.7.4] - 2026-09-14

### Changed & Hardened (Upstream Anti-Ban Protection & Zero-Token Cadence Alignment)
- **Low-Frequency Upstream Protection Schedule (`cadence-records.md`)**:
  - Replaced aggressive 15-minute polling with a human-like, daytime-only schedule (4 times daily: 09:30, 13:00, 18:30, 21:30 via `launchd`), completely eliminating risk of triggering Xianyu anti-scraping / bot defenses.
  - Aligned primary runtime to `launchd` and strictly enforced `Credit Policy: no_ai_credit` (100% local Node.js + Chrome CDP + SQLite execution, **0 AI Tokens consumed**).
  - Validated with `validate_cadence_card.py` (1 card, 0 errors, 0 warnings).
- **Default Polling Interval Hardening (`clis/goofish/watch.js`)**:
  - Increased default daemon polling interval from 15s to 3600s (1 hour) with a strict `Math.max(60, ...)` guard to prevent any accidental rapid requests to Xianyu servers.
- **Immediate Abort on Risk Challenge**:
  - Enforced `Stop Condition: sec_captcha_detected` across watcher tasks — immediately aborts on slider verification challenge to protect account integrity.

## [1.7.3] - 2026-09-14

### Added & Hardened (E2E Multi-Generation Hardware Inspection & High-Precision Visual Pipeline)
- **Multi-Generation Second-Hand Hardware Inspection Protocol**:
  - Validated against live market search on Xianyu for high-precision digital drawing displays (XPPen Artist Pro 16 Gen 2 2.5K vs. Gen 1 1080P).
  - Codified the three-tier hardware verification protocol:
    1. Title & spec filtering: Eliminates Gen 1 1080P listings falsely labeled or ambiguous in second-hand titles.
    2. Dead-link & placeholder purging: Instantly rejects invalid listings (`price === '¥0' || title.includes('闲鱼 - 闲不住') || description.includes('已经卖了')`).
    3. Multi-angle ground-truth visual confirmation: Cross-checks front shell (Gen 2 has no physical dial/side buttons; Gen 1 has physical red dial + 8 buttons), driver screen (X3 Pro chip / 16,384 levels vs 8,192), and critical accessories (ACK05 wireless shortcut remote valued at ~¥160).
- **Zero-Dependency High-Resolution Image Pipeline**:
  - Established CDN thumbnail stripper (`url.replace(/_[0-9]+x[0-9]+.*$/, '')`) to retrieve original lossless camera images (HEIC/JPEG) directly from Alibaba CDN.
  - Leveraged macOS native `sips -s format jpeg` for instant local format conversion without external heavy imaging dependencies.
- **Canonical Skill Alignment (`goofish-ops`)**:
  - Hardened Section 8 in `/Users/vecsatfoxmailcom/.gemini/antigravity/skills/goofish-ops/SKILL.md` following the Choosing the Rung framework: Rung 1 (prose trade-offs) for negotiation and bundling decisions vs. Rung 2 (decidable code predicates) for dead-link rejection, image cleanup, and physical hardware invariant checks.

## [1.7.2] - 2026-09-13

### Fixed & Hardened (Adversarial Negation Disambiguation, Wear Preservation & False Defect Elimination)
- **Casing Wear vs. Dummy Shell Disambiguation (`clis/goofish/_contract.js`)**:
  - Replaced overly restrictive negative lookahead whitelist in `DIGITAL_NOISE_REGEX` with a comprehensive character lookahead covering all real-world cosmetic wear descriptors (`有`, `微`, `细`, `轻`, `磨损`, `划痕`, `划伤`, `磕碰`, `磕伤`, `掉漆`, `完好`, `正常`, `成色`, `全新`, `9\\d新`, `良好`, `氧化`, `保护`).
  - Genuine second-hand listings describing honest casing wear (`外壳有划痕 功能正常`, `外壳有些许划痕`, `外壳有轻微磕碰`, `外壳磨损`) are now preserved 100%, while empty/dummy shells (`拓展坞外壳 出售`, `纯外壳`, `空壳`, `单卖外壳`, `外壳配件`) are strictly rejected.
- **Negation Leaks in Refresh Rate (30Hz) & Ethernet (100M) (`clis/goofish/_contract.js`)**:
  - Added negative lookbehind `(?<!(?:非|不是|不支持|无|并非|绝非))` to `REFRESH_RATE_30HZ_REGEX` and replaced JS ASCII word boundary `\\b` with Unicode-safe `(?<![\\w])`, preventing Chinese negation words (`非30Hz`, `不是30Hz`) from falsely matching 30Hz downgrade patterns.
  - Added negative lookbehind `(?<!(?:非|不是|并非|绝非|无|不带))` to `ETHERNET_100M_REGEX`, preventing `非百兆网口 4K60Hz` from false rejection.
  - Aligned `UGREEN_15375_MISMATCH_REGEX` and port count mismatch lookbehinds (`(?<!(?:非|不是|并非|绝非|比|吊打|秒杀|胜过|远超))`) to allow superiority comparisons (`吊打5合1`, `秒杀6合1`).
- **Defect Extraction Engine False Penalty Elimination (`clis/goofish/_contract.js`)**:
  - Expanded negative lookbehinds in both `extractDefectNotes` and `extractMultiImageDefects` for scratches and bumps to cover two-character compound negations (`无明显`, `没有明显`, `没明显`, `无任何`, `没有任何`, `基本无`, `几乎无`, `未见`, `防`).
  - Fixed critical bug where sellers describing pristine condition as `"无明显划痕，无明显磕碰，从没修过，箱说齐全"` were previously penalized with `85新(有磕碰)` and flagged with defect warnings.
  - Added `箱说齐全` / `原包装齐全` to box and manual indicators in both single-text and multi-image inspection routines.
- **Nylon vs. Steel String Negation Guard (`clis/goofish/_contract.js`)**:
  - Added `无|没有|不带` to negative lookbehind before `尼龙|2N|古典`, ensuring steel string models stating `不带尼龙弦` or `没有尼龙弦` are strictly rejected from `nexg2_nylon`.
- **Wanted Posts Buyer Noise Rejection (`clis/goofish/_contract.js`)**:
  - Expanded `UNIVERSAL_JUNK_REGEX` to cover acquisition and wanted prefixes (`收购`, `回收`, `求收`, `带价收`, `只收不卖`), while preserving genuine recent purchase statements (`刚收到拆封自用出`).
- **Seller Communication Affirmation Expansion (`clis/goofish/_contract.js`)**:
  - Expanded `RESPONSIVE_SELLER_REGEX` to include `可拍`, `随时可拍`, `随时可发`, `都在`, `东西都在`, preventing responsive sellers using concise affirmative speech from falling into `unknown`.
- **Default Category Query in Watch Engine (`clis/goofish/watch.js`)**:
  - Added `defaultQueryMap` so `--category ugreen_hub` defaults search query to `'绿联 15375'` instead of guitar default `'nexg 2n'`.
- **Zero-Price Candidate Leak Guard in Queries (`clis/goofish/_db.js`)**:
  - Enforced `price_num > 0` on all candidate queries when `minPrice` is unspecified, preventing unpriced or display placeholder listings from leaking through `price_desc` or `updated` sorts.

## [1.7.1] - 2026-09-13

### Fixed & Hardened (Cross-Domain Noise Disambiguation, Mismatch Precision & Transaction Atomicity)
- **Cross-Domain Noise Disambiguation (`clis/goofish/_contract.js`)**:
  - Resolved false rejection bug where items with empty category `""` or `'other'` defaulted to `isGuitarCategory = true`, previously rejecting legitimate UGREEN docks that mentioned `网线`, `连接线`, `充电线`, or `插头`.
  - Added smart category disambiguation based on title keywords when category is unspecified.
  - Refined `DIGITAL_NOISE_REGEX` to permit metal and aluminum alloy casing (`铝合金外壳`, `金属外壳`) while strictly rejecting standalone dummy shells (`单机壳`, `纯外壳`, `替换壳`, `拓展坞外壳`).
  - Allowed docking station converter synonyms (`Type-C 转换器`) for multi-function hubs while rejecting standalone dongles.
- **Exhaustive Mismatch Detection for UGREEN 15375 (`clis/goofish/_contract.js`)**:
  - Expanded port count mismatch rejection to cover Chinese numerals (`5合一`, `6合一`, `7合一`, `8合一`, `10合一`, `五合一`, `六合一`, `七合一`, `八合一`, `十合一`) and English notation (`6 in 1`, `5 in 1`).
  - Added refresh rate downgrade detection (`4K@30Hz`, `4K/30Hz`, `4K 30帧`) while preserving legitimate listings with 60Hz and backward compatibility (`4K60Hz向下兼容1080P`, `兼容2K`).
  - Added Ethernet downgrade detection (`100兆网口`, `100M网口`, `百兆`) without falsely matching high-speed card readers (`100MB/s`).
- **Category-Aware Defect Inspection & Condition Normalization (`clis/goofish/_contract.js`, `detail.js`, `watch.js`)**:
  - Upgraded `extractMultiImageDefects` with category awareness: 3C digital products now receive `'功能全好无暗病'` instead of instrument-specific `'琴颈笔直无暗病'`.
  - Added pristine condition extraction (`全新未拆封`, `99新(准新仅拆)`) to prevent downgrading brand new sealed items to `'95新'`.
  - Wired `condition`, `category`, and `defect_notes` into `detail.js` output and SQLite SSOT write-back.
- **Seller Communication Intelligence (`clis/goofish/_contract.js`)**:
  - Expanded `RESPONSIVE_SELLER_REGEX` to recognize sub-4-digit digital price quotes (`110出`, `120包邮`, `109元`) and active stock confirmations (`在的，可以拍`, `能发`, `随时发`).
  - Expanded `UNFIT_SELLER_REGEX` to catch common Xianyu seller sold-out idioms (`不好意思，刚卖掉了`, `被人拍了`, `出给别人了`).
- **SQLite SSOT ACID Transactions (`clis/goofish/_db.js`)**:
  - Wrapped batch operations (`saveOrders`, `saveCandidates`, `purgeJunkCandidates`) inside atomic `BEGIN TRANSACTION` / `COMMIT` blocks with rollback protection.
  - Hardened `queryCandidates` numeric price parsing to handle string prices, currency symbols (`¥120`), and numbers uniformly.
- **Pick Engine & CLI Enhancements (`clis/goofish/pick.js`, `bin/xy-chat.js`)**:
  - Fixed issue where default `target = 'all'` hijacked explicit `--category ugreen_hub`.
  - Propagated category-specific `minPrice` and `maxPrice` to `queryCandidates` on authoritative read-back.
  - Added `xy-chat purge` / `xy-chat clean` command to prune accessories and invalid low-price items.
  - Expanded test suite from 46 to 48 passing tests (100% pass rate).

## [1.7.0] - 2026-09-13

### Added & Hardened (Digital Spec Hardening, Defect Extraction, & Watch Push Engine)
- **3C Digital Specification & UGREEN 15375 Guard (`_contract.js`, `_db.js`)**:
  - Expanded `DIGITAL_NOISE_REGEX` to filter cases, sleeves, dust plugs, bags, and dongles (`收纳袋`, `保护壳`, `硅胶套`, `防尘塞`, `外壳`, `转接头`, `延长线`).
  - Added `UGREEN_15375_MISMATCH_REGEX` to automatically reject downgraded models (5合1, 6合1, 7合1, 10合1, 4K30Hz, 百兆网口).
  - Added category-specific price floor in `saveCandidates` and `purgeJunkCandidates` (rejecting spurious digital accessories under ¥60).
  - Fixed category check in `purgeJunkCandidates` by removing the empty string entry that previously risked purging uncategorized products under ¥400.
- **Objective Condition & Defect Notes Inspection Engine (`_contract.js`, `detail.js`)**:
  - Implemented `extractDefectNotes(title, description)` extracting scratches, bumps, repair history, and missing parts vs. certifying pristine condition (`全新未拆封`, `箱说配件全`).
  - Integrated `extractDefectNotes` into `detail.js` so live item fetches automatically populate `defect_notes` in both CLI output and SQLite SSOT.
- **Dynamic Sort & Filter Alignment in Pick Engine (`clis/goofish/pick.js`)**:
  - Resolved bug where `--sort` was previously ignored; now maps user sort input (`价格降序`, `price_desc`, `updated`) directly into authoritative query.
  - Enforced `filterAccessories: true` during write-back in `pick.js` to trigger database-level contract and price floor guards.
- **Toolchain Alignment (`bin/xy-chat.js`)**:
  - Aligned `knownCats` and category normalization with `inferCategory`, adding `ugreen_hub`, `15375`, `hub`, `dock`.
  - Added `--sync` option to `xy-chat reviews` for on-demand seller review synchronization.
- **Periodic Monitoring & Watch Push Architecture (`clis/goofish/watch.js`, `tests/watch_and_monitoring.test.js`)**:
  - Enhanced `watch.js` with HTTP Webhook notification dispatch (`sendWebhookNotification`) supporting Bearer authentication (`--webhook-token` / `WEBHOOK_BEARER_TOKEN`) and 4s timeout protection.
  - Added native macOS desktop alert banner integration (`sendDesktopNotification`) via `osascript`.
  - Hardened steel-vs-nylon string discrimination in `isAccessoryTitle` for `nexg2_nylon` (`非尼龙|钢弦|民谣|电吉他` strictly blocked; `尼龙|2N|古典` preserved).
  - Added anti-bot risk challenge detection (`sec.taobao.com`, `login.m.taobao.com`) with graceful cooldown and Gaussian jittered polling intervals.
  - Registered durable Cadence card `CAD-20260913-goofish-nexg2n-watch` in `cadence-records.md` (validated with 0 errors via `validate_cadence_card.py`).
  - Successfully verified live E2E probe against Xianyu for `"nexg 2n 尼龙"` (capturing authentic listings at ¥2699/¥2999 with zero steel string/accessory leakage).
  - Full test suite expanded to 46 automated tests with 100% pass rate and 0 install drift across 50 served files.

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
