> Scope: project-local. Architectural decisions and rationale.

# Architectural Decisions: opencli-plugin-goofish

## ADR-001: Dual Alias Registration (`goofish` & `xianyu`)
- **Context**: Users commonly refer to the platform as both "闲鱼" (xianyu) and "Goofish" (official English domain goofish.com).
- **Decision**: Register the exact same 14 subcommands under both `~/.opencli/clis/goofish/` and `~/.opencli/clis/xianyu/`.

## ADR-002: Browser-Native DOM Evaluator over API Reverse Engineering
- **Context**: Goofish employs strict Anti-Scraping / WUA token signing on raw HTTP endpoints, but renders smoothly in standard Chrome.
- **Decision**: Route all operations through OpenCLI's browser evaluate layer (`Strategy.COOKIE, browser: true`) connected to the user's live Chrome Profile 2 session.

## ADR-003: Step-and-Dispatch Event Loop for Ant Design Virtual Lists
- **Context**: Contact list uses virtual DOM (`rc-virtual-list-holder`), rendering only ~8 items at once.
- **Decision**: In-page async loops step `scrollTop += 350` and explicitly dispatch `Event('scroll')` to ensure full DOM synchronization before extraction.
