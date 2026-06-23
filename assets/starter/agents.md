# Repository Context Routing

Before every response, route the user prompt through `docs/repo-context/context.index.json` in the main thread.

The index is a direct tree mirror of `docs/`. It contains only folders and Markdown files, and it excludes `docs/repo-context/`.

Do not use a subagent for routing.

## Traversal Rule

Evaluate the index as a tree from the root down.

For each folder node:

1. Evaluate the folder's `load_when` against the current user prompt.
2. If the condition evaluates to `false`, stop at that folder. Do not evaluate any child folders or files.
3. If the condition evaluates to `true`, continue into its children.
4. If `load_when` is `null`, treat the folder as a structural boundary and continue into its children.

For each file node:

1. Evaluate the file's `load_when` against the current user prompt.
2. Select the file only when the condition evaluates to `true`.
3. Do not select a file whose parent folder was rejected.

The result must be the smallest useful pruned `selected_tree` that mirrors `docs/`.

## Decision File

Write the routing decision to:

```text
docs/repo-context/decisions/YYYYMMDDHHMMSS.json
```

The decision file must contain structured JSON with:

- `created_at`
- `prompt_summary`
- `index_path`
- `needs_repo_knowledge`
- `selected_tree`

Include reasons for selected folders and files. Do not include raw document contents in the decision file.

## Context File

After the decision file is written, the `PostToolUse` hook runs `docs/repo-context/scripts/build-context.mjs` and generates the matching file under `docs/repo-context/context/`.

Read the matching context file before answering or editing when `needs_repo_knowledge` is true. The generated file contains `context_tree`, which mirrors `selected_tree` and attaches raw document content at selected file nodes.

Do not dump full documents into hook output. Hooks only run deterministic scripts: one refreshes `docs/repo-context/context.index.json`, and one rebuilds the matching context file from the latest decision file.
