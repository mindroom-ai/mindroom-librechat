# Fork Context

## Why this fork exists

MindRoom uses LibreChat as a UI, but MindRoom executes tools server-side and streams tool traces inline in assistant content. This differs from upstream LibreChat's primary tool-call expectations and required targeted UI behavior in this fork.

## Operating model

- Upstream (`danny-avila/LibreChat`) is treated as source for periodic sync/rebase.
- Fork-only behavior should stay minimal and clearly documented.
- PRs should target `mindroom-ai/mindroom-librechat`, not upstream.

## Fork maintenance principles

- Prefer small, isolated deltas over broad rewrites.
- Add tests for every fork-specific behavior.
- Keep commit history understandable so future rebases can squash or drop feature churn safely.
