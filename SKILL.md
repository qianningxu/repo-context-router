---
name: repo-doc-router
description: Initialize repository doc routing for Codex by installing docs/repo-context/context.index.json generation, two deterministic Codex hooks, agents.md main-thread routing instructions, context decision logging, and selected-context generation.
---


1. Copy `assets/starter/agents.md` into the target repository as `agents.md` or merge its repository context routing section into an existing agent instruction file.
2. Copy `assets/starter/.codex/hooks.json` into `.codex/hooks.json`.
3. Copy `assets/starter/docs/repo-context/` into `docs/repo-context/`. This directory contains the index, generated context target, decision-log location, and scripts.
4. Run `node docs/repo-context/scripts/build-index.mjs` from the target repository root to create or update `docs/repo-context/context.index.json`.
