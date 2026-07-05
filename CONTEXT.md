# llm-ts

A TypeScript library-plus-CLI for interacting with LLMs — a personal daily-driver rewrite of (a fork of) simonw/llm, built on the Vercel AI SDK's provider ecosystem rather than a ported model abstraction.

## Language

**Plugin**:
An npm package, declared in config, that contributes Models, Commands, and/or Tools. The only extension mechanism — there is no separate hook system per contribution type.
_Avoid_: extension, addon, hook package

**Provider**:
A Vercel AI SDK provider package (e.g. `@ai-sdk/anthropic`). A bare Provider declared in config is auto-wrapped as a models-only Plugin.
_Avoid_: backend, adapter

**Model**:
A chat-capable model exposed to the user, wrapping an AI SDK `LanguageModel` plus llm-ts metadata (id, aliases, capabilities).

**Response**:
The record of one prompt execution against a Model — streamable while in flight, persisted to the log once complete. The unit of logging.

**Conversation**:
An ordered sequence of Responses sharing context. Continuing a Conversation re-sends prior turns; it is stitched from Responses, not stored as its own transcript.

**Command**:
A CLI subcommand contributed by the core or by a Plugin.

**Tool**:
A function the Model may call during a prompt, contributed by the core or by a Plugin.
