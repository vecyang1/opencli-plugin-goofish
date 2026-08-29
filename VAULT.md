> Scope: project-local. Project governance and handoff card.

# VAULT: opencli-plugin-goofish

## Identity & Purpose
- **Name**: `opencli-plugin-goofish`
- **Purpose**: Production-grade OpenCLI adapter suite for Xianyu / Goofish (闲鱼), providing 10+ year buyer order history, collection price-drop monitoring, full IM chat/reply automation, advanced search filtering, asset stats, and AI consumption reasoning.
- **Upstream**: `https://github.com/vecyang1/opencli-plugin-goofish.git` (AGPL-3.0).
- **Maintainer**: Vec Yang.

## Key Capabilities (14 Subcommands)
1. `whoami`: Session identity, location, credit rating.
2. `personal`: Profile details (bio, followers, items count, reviews).
3. `account`: Member name, real-name auth, Alipay auth, ID status.
4. `stats`: One-stop asset & pending order fulfillment dashboard.
5. `orders`: 10+ year order history across tabs with query filters.
6. `favorites`: Collections across tabs with price drop tracking.
7. `published`: Personal inventory (selling & sold).
8. `search`: Multi-dimensional search (sort, price range, tags, pagination).
9. `detail`: Item specification details and seller reputation archive.
10. `inbox`: Virtual scroll downward infinite contact extraction.
11. `messages`: Reverse scroll upward historical chat back-scroll.
12. `chat` / `reply`: Private message sending with `--dry-run` safety.
13. `reason`: AI/Heuristic consumption & pending fulfillment reasoning.
14. `export`: Export to Markdown, interactive HTML, or JSON.

## Verified Evidence
- All 14 commands tested and passed on 2026-08-29 against Chrome Profile 2 live session.
