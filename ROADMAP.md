# Roadmap

Execution planning lives in the issue tracker: [#1 — Spec: llm-ts v1](https://github.com/nbbaier/llm-ts/issues/1) is the parent spec, with the sequenced implementation plans (#2–#12) linked from it. This file carries only what the tracker doesn't: stance, boundaries, and ideas not yet planned.

## Porting stance

The Python `llm` repo is a **behavioral reference, not source material**. Port the domain model (see `CONTEXT.md`), don't translate `cli.py`. When behavior questions arise ("what exactly does `-c` resend?"), read the Python; never transliterate it.

The reference lives as a sibling checkout at `../llm` (fork of `simonw/llm`). Keep it through v1 — it's most needed for the parity-sensitive plans (#3 config/env precedence, #7 logs, #8 models & aliases, #9 plugin host). Once those land and llm-ts behaves as intended, the local copy can be deleted: it's a clean clone of `nbbaier/llm`, so removal loses nothing and it can be re-cloned if the `logs.db` import fast-follow ever needs the Python schema.

## Fast-follows (build when missed, not before)

- Concise schema DSL (`'name, age int'`) — compiles to JSON Schema in front of the same pipe
- Interactive `llm chat` REPL — pure UI layer over `conversation.prompt()`
- Tool-call chaining across `-c` continuations
- Full-text search for `llx logs`
- Lazy plugin loading (startup cost grows with plugin count)
- Templates (as a plugin, if they return at all)
- One-time import from Python llm's `logs.db` (only if history is actually missed)

## Out of scope

- Embeddings, fragments (dropped from the domain)
- Write-compatibility with Python llm's `logs.db` (ADR-0003)
- Node runtime support (ADR-0002)
