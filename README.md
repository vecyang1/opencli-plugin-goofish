# 🐟 opencli-plugin-goofish

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![OpenCLI](https://img.shields.io/badge/OpenCLI->=1.8.6-orange.svg)](https://github.com/jackwener/OpenCLI)

> **Goofish (闲鱼) Buyer 10-Year Order History, Favorites Collection, Personal Profile & Published Items, Account Security, Search, and AI Reasoning Suite for OpenCLI.**

闲鱼买家已买到的宝贝（十余年滚动翻页历史订单）、宝贝收藏夹、个人主页与发布管理、账号安全、全网搜物与智能消费洞察套件。

---

## 🌟 Highlights

1. **👑 Zero-Risk & No Captchas (零风控与免验证码)**: Directly reuses authenticated Chrome browser sessions via OpenCLI's Browser Bridge — zero credentials stored locally, zero risk of triggering anti-bot security challenges.
2. **⚡ Deep Backward Virtual Scroll (十余年订单长河滚动拉取)**: Seamless infinite scrolling engine designed specifically for `goofish.com/bought` and `goofish.com/collection`, automatically paging through years of purchase records.
3. **📦 Multi-Dimensional Xianyu Suite (全维度闲鱼指令矩阵)**:
   - `opencli goofish orders`: Extract historical orders across status tabs (`全部`, `待付款`, `待发货`, `待收货`, `待评价`, `退款中`).
   - `opencli goofish favorites`: Extract collected items with price drop tracking and sale status.
   - `opencli goofish personal`: View user profile, location, followers/following, credit rating, and total published count.
   - `opencli goofish published`: Scroll and extract all items published and sold on user's personal page.
   - `opencli goofish search`: Second-hand goods search with prices, locations, want counts, and seller credit badges.
   - `opencli goofish detail`: Full product specification, seller longevity, and description inspector.
   - `opencli goofish account`: Real-name and Alipay authentication audit.
   - `opencli goofish whoami`: Instant identity check for active session.
4. **🧠 AI Semantic Reasoning (智能消费与履约分析)**:
   - `opencli goofish reason`: Computes historical spending totals, top seller relationships, unfulfilled order alerts, and second-hand habits.
5. **📁 Multi-Format Export (结构化导出)**:
   - `opencli goofish export`: Export orders and collections to Markdown, JSON, HTML, or CSV.

---

## 🚀 Installation

```bash
opencli plugin install github:vecyang1/opencli-plugin-goofish
```

Or manually link into your local OpenCLI clis directory:
```bash
cp -r clis/goofish ~/.opencli/clis/
```

---

## 📖 Available Commands

```bash
# 1. Check logged-in Goofish identity
opencli goofish whoami

# 2. View personal profile summary & credit rating
opencli goofish personal -f table

# 3. Extract 10-year historical orders (with infinite scroll pagination)
opencli goofish orders --limit 30 -f table
opencli goofish orders --status "待发货" -f table
opencli goofish orders "吉他" --limit 50 -f table
opencli goofish orders --all -f table

# 4. View favorite / collected items
opencli goofish favorites --limit 30 -f table
opencli goofish favorites --tab "降价宝贝" -f table

# 5. Extract published items
opencli goofish published --limit 30 -f table

# 6. Search items on Goofish
opencli goofish search "MacBook M3" --limit 20 -f table

# 7. View item details
opencli goofish detail 1059195860101 -f yaml

# 8. View account security & verification status
opencli goofish account -f table

# 9. AI reasoning & spending analysis
opencli goofish reason -f yaml

# 10. Export orders or favorites to Markdown / HTML / JSON
opencli goofish export orders --output ./goofish-orders.md
opencli goofish export favorites --file-type html --output ./favorites.html
```

---

## 📄 License

This project is licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0-or-later)](./LICENSE).
