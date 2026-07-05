# Bun is the runtime, not Node

llm-ts targets Bun exclusively: `bun:sqlite` for the log database, Bun's zero-build TS imports for `--functions` / `--schema` scratch files and plugin loading, and optionally `bun compile` for distribution. Chosen over Node 24 (+`node:sqlite`) because CLI cold-start latency is felt on every invocation of a daily-driver tool, and the primary (only) user runs Bun happily.

## Consequences

- No Node compatibility promise. If the tool ever grows an audience, a SQLite driver seam gets retrofitted then — deliberately not built now.
