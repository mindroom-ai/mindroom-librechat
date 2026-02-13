# Claude Code Instructions for mindroom-librechat

## Critical: Pull Requests

**NEVER open PRs against upstream `danny-avila/LibreChat`.** This is MindRoom's independent repo, not a fork. All PRs must target `mindroom-ai/mindroom-librechat`.

Always use:
```bash
gh pr create --repo mindroom-ai/mindroom-librechat
```

## Repository context

This repo is MindRoom's version of LibreChat, used as the web UI for MindRoom's AI agent platform. The upstream `danny-avila/LibreChat` remote exists only for syncing upstream changes — never push PRs to it.

## Instruction files process

- `CLAUDE.md` is the single source of truth for repository-specific agent instructions.
- `AGENTS.md` must be a symlink to `CLAUDE.md` (do not duplicate content across two independent files).
- When updating instructions:
  - edit `CLAUDE.md` only
  - ensure the symlink exists and points to `CLAUDE.md`
  - include both files in PR review checks

Verification commands:
```bash
test -L AGENTS.md
readlink AGENTS.md   # should print: CLAUDE.md
```

## Testing

```bash
npm run test:client                # full client test suite
cd client && npm run test -- --runInBand <path>  # targeted tests
```
