# Claude Code Instructions for mindroom-librechat

## Critical: Pull Requests

**NEVER open PRs against upstream `danny-avila/LibreChat`.** This is MindRoom's independent repo, not a fork. All PRs must target `mindroom-ai/mindroom-librechat`.

Always use:
```bash
gh pr create --repo mindroom-ai/mindroom-librechat
```

## Repository context

This repo is MindRoom's version of LibreChat, used as the web UI for MindRoom's AI agent platform. The upstream `danny-avila/LibreChat` remote exists only for syncing upstream changes — never push PRs to it.

## Testing

```bash
npm run test:client                # full client test suite
cd client && npm run test -- --runInBand <path>  # targeted tests
```
