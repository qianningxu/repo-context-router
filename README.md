# Repo Doc Router

`repo-doc-router` is a Codex skill for initializing repository doc routing.

It is inspired by OpenAI's [Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/), especially the idea that `AGENTS.md` should be a map rather than a large instruction manual.

The problem is that a structured `docs/` tree does not automatically tell an agent what to read. Without an explicit routing layer, the agent has to infer relevance from paths, filenames, directory names, and ad hoc searches. That can miss required docs, load irrelevant docs, or produce output that is not grounded in the repository's declared source of truth.

This skill initializes a small routing pipeline that turns document-level loading rules into a compact index, records routing decisions, and builds bounded selected-context JSON from the selected docs.

## 1. Create The Expected Architecture

Repository knowledge lives under `docs/`.

The authored documents are the source of truth. Router-owned files live under `docs/repo-context/` so the index, decisions, generated context, and scripts stay together.

Expected architecture:

```text
agents.md
.codex/
  hooks.json
docs/
  ...
  repo-context/
    context.index.json
    decisions/
      YYYYMMDDHHMMSS.json
    context/
      YYYYMMDDHHMMSS.json
    scripts/
      build-index.mjs
      build-context.mjs
```

`agents.md` is the small entry point that instructs the main agent to route each prompt before answering.

The target repository adds its own documentation under `docs/`. Those docs can cover architecture, product, reliability, security, schema, design, planning, or references.

`docs/repo-context/context.index.json` is the full mirror of the documentation tree. It contains only folder nodes and Markdown file nodes from `docs/`; it excludes `docs/repo-context/` and non-Markdown files. `docs/repo-context/decisions/` stores pruned tree decisions. `docs/repo-context/context/` stores the matching pruned tree with selected file contents attached. Decision files and context files use the same timestamp filename.

The starter includes mock index, decision, and context JSON files to show the file relationship. `build-index.mjs` replaces the index from the real `docs/` tree, and `build-context.mjs` replaces the matching context file from the latest decision.

## 2. Add `load_when` And Compile The Index

Each Markdown document declares when it should be loaded with a `load_when` field in frontmatter:

```yaml
---
load_when: "The prompt involves database tables, migrations, persistence, imports, queries, schema validation, or data model changes."
---
```

`docs/repo-context/context.index.json` is the compact representation of the repository knowledge tree.

Generate or update it from the repository root:

```bash
node docs/repo-context/scripts/build-index.mjs
```

The build script scans `docs/`, skips `docs/repo-context/`, reads Markdown document `load_when` frontmatter, and writes a folder/file tree to `docs/repo-context/context.index.json`. Folder-level `load_when` values are edited only in that index; they default to `null` and are preserved when the tree is refreshed.

## 3. Configure The First Hook

Install project-level Codex hooks at:

```text
<repo>/.codex/hooks.json
```

`UserPromptSubmit` runs after the user submits a prompt and before Codex sends that prompt to the model:

```json
{
  "type": "command",
  "command": "node \"$(git rev-parse --show-toplevel)/docs/repo-context/scripts/build-index.mjs\"",
  "timeout": 30,
  "statusMessage": "Updating repository context index"
}
```

This keeps `docs/repo-context/context.index.json` current before the main agent routes the prompt. `UserPromptSubmit` does not support `matcher`; any configured matcher is ignored for this event.

## 4. Route In The Main Agent

After `docs/repo-context/context.index.json` is current, the main agent reads it, evaluates the user prompt against the `load_when` values, and writes a routing decision to:

```text
docs/repo-context/decisions/YYYYMMDDHHMMSS.json
```

Routing is top-down. If a folder's `load_when` condition evaluates to false, the main agent stops at that folder and does not evaluate its children. If the condition evaluates to true, or if `load_when` is null, the main agent can continue into its children.

Each decision should contain the actual prompt details and the smallest useful pruned `selected_tree` that mirrors the `docs/` tree instead of a flat list. If no repository knowledge is needed, `selected_tree.children` should be empty. The generated context file should contain a matching `context_tree` with file contents attached at file nodes. Keep only the latest 10 decision files by default.

## 5. Configure The Second Hook

`PostToolUse` runs after file-writing tools and shell commands. In this pattern, it runs after the main agent writes the routing decision:

```json
{
  "matcher": "Bash|apply_patch|Edit|Write",
  "hooks": [
    {
      "type": "command",
      "command": "node \"$(git rev-parse --show-toplevel)/docs/repo-context/scripts/build-context.mjs\"",
      "timeout": 30,
      "statusMessage": "Updating selected repository context"
    }
  ]
}
```

This runs `docs/repo-context/scripts/build-context.mjs`, which reads the latest decision, loads the selected documents, writes the matching context file under `docs/repo-context/context/`, and prunes older decision and context files. If no decision file exists, the script exits without changing context.

Before answering or editing, the main agent reads the matching context file when the selected tree is not empty.
