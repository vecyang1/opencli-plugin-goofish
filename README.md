# 🐟 opencli-plugin-goofish (闲鱼 OpenCLI 生产级插件)

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![OpenCLI](https://img.shields.io/badge/OpenCLI-Plugin-orange.svg)](https://github.com/jackwener/opencli)
[![Node: >=18](https://img.shields.io/badge/Node-%3E%3D18-green.svg)]()

> **闲鱼 (Goofish.com) 生产级 Agent-Native 终端适配器与数据自动化套件。**  
> 一键通过 OpenCLI 操作闲鱼十余年历史订单拉取、收藏夹分类与降价监控、全网多维度二手搜索、完整 IM 私信收发与历史回溯、个人在售列表、账号安全认证状态与 AI 消费推断报表。

---

## ⚡ 核心能力一览

- 👤 **身份与主页画像**: `whoami`, `personal`, `account` (快速确认登录态、昵称、城市、粉丝、信用极好/优秀徽章与实人/支付宝认证)
- 📦 **十余年历史订单**: `orders` (支持十余年跨页滚动加载、`全部/待付款/待发货/待收货/待评价/退款中` 状态筛选与关键词搜索)
- ⭐ **收藏夹与降价监控**: `favorites` (支持分类Tab筛选、自动提取降价幅度如 `降¥179.00`、在售与已失效状态)
- 🛍️ **全网高级搜索**: `search` (支持综合/新降价/新发布/价格排序、`--min-price` / `--max-price` 价格区间、8种商品标签筛选与分页跳转)
- 💬 **完整 IM 私信交互**:
  - `inbox`: 驱动虚拟滚动列表向下持续加载历史联系人 (`.rc-virtual-list-holder`)，提取交易状态与最新消息摘要。
  - `messages`: 驱动逆序聊天容器向上自动滚动加载早期消息 (`#msg-list-container`)，精准区分发送方、文本与链接。
  - `chat` / `reply`: 向联系人发送或回复私信，内置 `--dry-run` 空跑模式确保安全。
- 📊 **智能消费与看板**: `reason` (统计总流水、高频卖家、待发货预警与消费画像), `stats` (一站式资产与待办看板)
- 📑 **多格式数据导出**: `export` (一键将订单或收藏夹导出为交互式 HTML、Markdown 表格或 JSON 结构体)

---

## 🚀 安装与启用

### 方式 1: 本地开发与链接 (推荐)
```bash
# 1. 克隆本仓库到本地
git clone https://github.com/vecyang1/opencli-plugin-goofish.git ~/Documents/A-coding/opencli-plugin-goofish

# 2. 安装适配器到 OpenCLI 本地覆盖目录 (同时注册 goofish 与 xianyu 两个站点名)
cd ~/Documents/A-coding/opencli-plugin-goofish && npm run install-adapters
```

`install-adapters` 会把 `clis/goofish/*.js` 以**真实文件**复制到 `~/.opencli/clis/goofish/`，再生成一份 `site:` 行改为 `'xianyu'` 的副本到 `~/.opencli/clis/xianyu/`，重启守护进程，并以 `opencli list` 同时列出两个站点的 `whoami` 作为回执。两点不能绕开：

- **OpenCLI 不加载符号链接**（v1.8.7 `dist/src/cli.js` 的 `listJsFiles` 只认真实目录与真实 `.js` 文件），把 `~/.opencli/clis/goofish` 做成软链会让 `opencli goofish *` 整站消失且没有任何报错。
- **命令按适配器里的 `site:` 字段注册，不按目录名**。直接把 `site: 'goofish'` 的文件复制进 `xianyu/` 目录不会得到 `opencli xianyu *`。

改完 `clis/goofish/` 之后必须重新运行 `npm run install-adapters`，否则正在运行的命令仍是旧副本；`npm test` 里的漂移守卫会在两处不一致时变红。

### 方式 2: 使用 OpenCLI 插件管理器
```bash
opencli plugin install ./opencli-plugin-goofish
```

---

## 📖 命令完整手册 (Command Reference)

| 命令 | 类型 | 说明 | 核心参数与选项 |
| :--- | :--- | :--- | :--- |
| `opencli xianyu whoami` | `[read]` | 检查当前登录的闲鱼账号身份与信用等级 | `-f table/json/yaml` |
| `opencli xianyu personal` | `[read]` | 获取个人主页概览 (城市、粉丝、宝贝数、信用评级) | `-f table/yaml` |
| `opencli xianyu account` | `[read]` | 查看账号基本信息、实人认证、支付宝实名与身份信息 | `-f table/yaml` |
| `opencli xianyu orders` | `[read]` | 获取已买到的宝贝历史订单 (十余年翻页) | `[query] [--limit 50] [--status 全部] [--all]` |
| `opencli xianyu favorites` | `[read]` | 查看收藏夹宝贝与降价监控 | `[query] [--tab 全部/降价宝贝/有效宝贝] [--limit 30]` |
| `opencli xianyu published` | `[read]` | 获取个人发布在售与已卖出闲置列表 | `[query] [--limit 30] [--all]` |
| `opencli xianyu search` | `[read]` | 全网高级搜索二手商品 (地区/排序/价格/标签/降价) | `<query> [--region 珠三角/广东] [--sort 综合/新发布/新降价/价格] [--min-price] [--max-price] [--tags] [--page-num 1]` |
| `opencli xianyu suggest` | `[read]` | 获取闲鱼全网热搜词与搜索关键词联想补全 | `[query] [--limit 20]` |
| `opencli xianyu detail` | `[read]` | 获取指定商品详情与卖家信誉档案 | `<item_id>` |
| `opencli xianyu seller` | `[read]` | 深度分析卖家画像、在售SKU全貌、历史买家评价与砍价博弈策略 | `<user_id/url/item_id> [--limit 20]` |
| `opencli xianyu recommend` | `[read]` | 提取商品页面「为你推荐」相似竞品、隐藏好价替代品与生态SKU | `<item_id/url> [--limit 20] [--filter all/same/gear/study]` |
| `opencli xianyu inbox` | `[read]` | 获取私信联系人列表 (向下虚拟滚动加载) | `[query] [--limit 30] [--scrolls 6] [--unread-only]` |
| `opencli xianyu messages` | `[read]` | 读取指定联系人聊天消息历史 (向上逆向滚动) | `<contact> [--limit 50] [--scrolls 5]` |
| `opencli xianyu chat` | `[write]` | 向指定联系人发送或回复私信 | `<contact> <message> [--dry-run]` |
| `opencli xianyu reason` | `[read]` | 智能消费推断分析 (流水、高频卖家、待发货预警) | `[query] [--limit 50]` |
| `opencli xianyu stats` | `[read]` | 个人资产、订单待办与消息看板 | `-f table/yaml` |
| `opencli xianyu export` | `[read]` | 将订单或收藏导出为 Markdown、JSON 或 HTML 报表 | `[type orders/favorites] [--output path] [--file-type md/html/json]` |

---

## 💡 典型使用示例

### 1. 检查账号状态与一站式资产看板
```bash
opencli xianyu whoami -f table
opencli xianyu stats -f table
```

### 2. 跨页检索历史订单
```bash
# 检索最近 20 笔订单
opencli xianyu orders --limit 20 -f table

# 筛选包含「吉他」关键词的全部历史订单
opencli xianyu orders "吉他" --status 全部 -f table
```

### 3. 查看收藏夹并监控降价宝贝
```bash
# 查看降价分类下的所有收藏
opencli xianyu favorites --tab 降价宝贝 -f table
```

### 4. 全网二手高级搜索与比价
```bash
# 搜索「吉他」，按新发布排序，价格在 50~500 元之间，筛选「个人闲置」和「包邮」
opencli xianyu search "吉他" --sort new_publish --min-price 50 --max-price 500 --tags 个人闲置,包邮 --limit 10 -f table

# 区域精准筛选 (如: 筛选广东/珠三角地区的「nexg2」二手在售吉他)
opencli xianyu search "nexg2" --region 广东 --limit 10 -f table

# 获取平台实时热搜关键词或特定前缀联想词
opencli xianyu suggest -f table
opencli xianyu suggest "nexg" -f table

# 查看特定商品详情
opencli xianyu detail 1076198967894 -f yaml

# 深度分析卖家在售SKU全貌、历史买家评价与智能砍价博弈策略
opencli xianyu seller 4108054065 -f yaml

# 提取商品详情页「为你推荐」相似竞品与周边生态好价 SKU
opencli xianyu recommend 1076198967894 --filter same -f table
```

### 5. IM 私信会话管理与聊天记录回溯
```bash
# 列出最近 15 位联系人
opencli xianyu inbox --limit 15 -f table

# 向上加载回溯与「吉他小铺」的最近 20 条聊天记录
opencli xianyu messages "吉他小铺" --limit 20 -f table

# 空跑测试回复
opencli xianyu chat "吉他小铺" "你好，请问宝贝还在吗？" --dry-run -f table

# 正式发送私信
opencli xianyu chat "吉他小铺" "你好，请问宝贝还在吗？" -f table
```

### 6. 数据报表导出
```bash
# 导出历史订单为 Markdown 流水清单
opencli xianyu export orders --limit 50 --output ./my-orders.md

# 导出收藏夹为美观的 HTML 交互报表
opencli xianyu export favorites --file-type html --output ./my-favorites.html
```

---

## 🛠️ 技术架构与第一性原理

1. **虚拟滚动技术适配 (Virtual List Downward Loading)**:
   闲鱼联系人列表采用 `.rc-virtual-list-holder` 进行动态 DOM 渲染。适配器自动在浏览器内执行分段步进滚动并派发 `scroll` 事件，动态捕获所有离屏联系人数据。
2. **逆序消息流回溯 (Reverse Message Scroll Loading)**:
   聊天窗口为 `#msg-list-container` 逆向滚动容器。适配器通过对容器 `scrollTop = 0` 的精准触发，自动拉取历史聊天气泡并解析发送者角色、文字与富文本链接。
3. **SPA 状态自愈与认证校验 (Self-Healing Auth)**:
   每个命令均包含轻量级会话嗅探机制，当检测到登录态失效时精准抛出 `AuthRequiredError`，引导用户在 Chrome 浏览器中无缝续期。

---

## 📄 许可证

本项目采用 [AGPL-3.0-or-later](LICENSE) 协议开源。
