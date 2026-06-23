# Origin

This project comes from the section "We made repository knowledge the system of record" in OpenAI's [Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/).

> "give Codex a map, not a 1,000-page instruction manual."

The original section argues that context management is one of the central problems in making agents useful on large, complex tasks.

OpenAI describes trying the "one big `AGENTS.md`" approach and finding that it failed because context is scarce, giant instruction files crowd out the actual task and code, broad guidance stops being actionable, monolithic manuals become stale quickly, and a single blob is hard to verify mechanically.

The pattern they moved toward is to treat `AGENTS.md` as a table of contents rather than an encyclopedia.

In that pattern, a short `AGENTS.md` is injected into context and points to deeper sources of truth in a structured repository knowledge base.

The article's example knowledge store includes top-level orientation files, design docs, execution plans, generated schema docs, product specs, reference material, and domain documents for frontend, reliability, security, product sense, plans, and quality.

This project turns that idea into a Codex hook-backed context router: each prompt is classified, then Codex receives compact guidance about which repository knowledge to inspect.

Codex hooks are the enforcement point.

A `UserPromptSubmit` hook runs before the user prompt is sent to the model.

The hook receives JSON on `stdin`, including the prompt, current working directory, session id, and transcript path.

It can return extra developer context with `hookSpecificOutput.additionalContext`, or block the prompt with a decision and reason.

The practical goal is:

1. The user submits a request.
2. A hook classifies the request against repository knowledge rules.
3. The hook returns compact routing instructions.
4. Codex reads only the relevant docs and files instead of receiving a giant manual up front.

# How It Works

`repo-context-router` is a hook-backed context selection system.

It should maintain three kinds of files:

- A knowledge manifest, such as `docs/index.yaml`, listing canonical docs, owners, paths, tags, and `read_when` guidance.
- A routing policy, such as `knowledge/rules.yaml`, containing natural-language boolean checks.
- A hook script, such as `.codex/hooks/user-prompt-router.mjs`, that runs on `UserPromptSubmit`.

The hook script should:

1. Parse the hook input JSON from `stdin`.
2. Read the knowledge manifest and routing policy.
3. Evaluate whether the prompt needs repository-specific context.
4. Select the smallest relevant set of docs.
5. Return a short `additionalContext` message telling Codex what to inspect.

The hook may use an LLM judge, but the hook output must still be deterministic JSON in Codex's expected shape.

Prefer a hybrid approach:

- Use deterministic matching first: paths, doc titles, tags, `read_when`, and obvious keywords.
- Use an LLM judge only when the deterministic score is ambiguous or when the route depends on natural-language policy.
- Validate the LLM result against a strict schema before returning it to Codex.
- Fail open with a conservative routing note if the LLM call fails; fail closed only for safety or destructive-action policies.

Example LLM judge output:

```json
{
  "needs_repo_knowledge": true,
  "selected_docs": [
    {
      "path": "docs/architecture.md",
      "reason": "The request changes module boundaries or data flow."
    }
  ],
  "block": false,
  "block_reason": null
}
```

Example hook output:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "Repo context routing: before editing, inspect docs/architecture.md. If the change touches storage or schema, also inspect docs/generated/db-schema.md."
  }
}
```

Example block output:

```json
{
  "decision": "block",
  "reason": "This request needs clarification before changing repository policy docs."
}
```

The router should not dump full docs into the prompt.

It should act like a librarian: identify which sources matter, explain why, and let Codex read them on demand.

# Set Up

Create the hook script:

```text
.codex/
  hooks.json
  hooks/
    user-prompt-router.mjs
docs/
  index.yaml
knowledge/
  rules.yaml
```

Add a project hook in `.codex/hooks.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$(pwd)/.codex/hooks/user-prompt-router.mjs\"",
            "timeout": 30,
            "statusMessage": "Routing repository context"
          }
        ]
      }
    ]
  }
}
```

For a repository hook, prefer resolving from the repository root when the repo is under git:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$(git rev-parse --show-toplevel)/.codex/hooks/user-prompt-router.mjs\"",
            "timeout": 30,
            "statusMessage": "Routing repository context"
          }
        ]
      }
    ]
  }
}
```

Create a minimal `docs/index.yaml`:

```yaml
docs:
  - path: docs/architecture.md
    title: Architecture
    read_when:
      - changing module boundaries
      - changing storage flow
      - explaining how the repository is organized
    tags:
      - architecture
      - storage

  - path: docs/generated/db-schema.md
    title: Database schema
    read_when:
      - changing SQLite tables
      - changing imports
      - debugging persistence
    tags:
      - database
      - generated
```

Create a minimal `knowledge/rules.yaml`:

```yaml
rules:
  - id: needs_repo_knowledge
    check: "Does this prompt require repository-specific knowledge to answer safely?"

  - id: architecture
    check: "Does this prompt involve architecture, module boundaries, data flow, or storage?"
    docs:
      - docs/architecture.md

  - id: database
    check: "Does this prompt involve schema, SQLite, imports, persistence, or migrations?"
    docs:
      - docs/generated/db-schema.md
```

After adding the hook, restart Codex or open a new session, then review and trust the hook with `/hooks`.

Project-local hooks run only when the project `.codex` configuration layer is trusted.

For LLM-backed routing, configure the hook script with an API key through the environment.

Keep the LLM prompt strict: request JSON only, validate the output, and cap the selected docs.

Avoid spawning another Codex session from inside the hook; use a direct model API call so the hook stays bounded and non-recursive.

Suggested defaults:

- Maximum selected docs: 5.
- Maximum `additionalContext`: 1,500 characters.
- Hook timeout: 30 seconds.
- LLM timeout: 10 seconds.
- Fallback: deterministic routing plus a warning if the LLM judge fails.

For stronger enforcement, pair this with a `Stop` hook that checks whether Codex actually followed required routing instructions before ending the turn.
