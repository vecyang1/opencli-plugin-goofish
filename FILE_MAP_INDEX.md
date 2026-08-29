> Scope: project-local. File and directory map.

# File Map Index: opencli-plugin-goofish

```
opencli-plugin-goofish/
├── .gitignore               # Git ignore patterns (node_modules, scratch/)
├── LICENSE                  # GNU AGPL v3.0 license
├── README.md                # Bilingual documentation, CLI reference & usage examples
├── package.json             # NPM package metadata (v1.1.0)
├── opencli-plugin.json      # OpenCLI plugin registration descriptor
├── PROJECT_LINKS.md         # 2nd Brain router & upstream bridge card
├── AGENTS.md                # Agent instructions & runtime gotchas
├── VAULT.md                 # Project governance & status summary
├── decisions.md             # Architectural decision records (ADRs)
├── FILE_MAP_INDEX.md        # File map index
├── tests/
│   └── smoke.test.js        # Automated syntax and convention smoke tests
└── clis/
    └── goofish/
        ├── whoami.js        # Session check & credit level
        ├── personal.js      # User profile details
        ├── account.js       # Real-name & security status
        ├── stats.js         # Unified assets & pending orders dashboard
        ├── orders.js        # 10+ year historical order extraction
        ├── favorites.js     # Collections & price drop tracker
        ├── published.js     # Published inventory
        ├── search.js        # Advanced second-hand goods search
        ├── detail.js        # Item specs & seller reputation
        ├── inbox.js         # IM virtual scrolling contact list
        ├── messages.js      # IM reverse scrolling chat history
        ├── chat.js          # Private message sender
        ├── reply.js         # Private message replier
        ├── reason.js        # Heuristic spending & fulfillment analyzer
        └── export.js        # Markdown, HTML & JSON report exporter
```
