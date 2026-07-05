# Vercel AI SDK is the provider layer; one plugin contract on top

Python llm's most expensive subsystem is its pluggy-based plugin architecture, whose dominant real-world use is model providers. In the TS ecosystem that job is already solved: every provider ships an AI SDK package exposing `LanguageModel`. llm-ts therefore does not port the hook system. Instead there is a single extension mechanism: a **Plugin** is an npm package, declared explicitly in config (no install-time entry-point scanning), that contributes Models, Commands, and/or Tools; a bare AI SDK provider package is auto-wrapped as a models-only Plugin.

## Consequences

- Provider breadth comes from the AI SDK ecosystem for free, forever.
- Model enumeration is weaker than Python llm's (`llm models`): AI SDK providers have no standard "list your models" API, so listing is best-effort per provider.
- Commands are contributed as citty `CommandDef` data; Tools as AI SDK `tool()` objects — the host owns assembly, plugins hand over plain data.
