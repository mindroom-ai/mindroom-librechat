# MindRoom Fork Docs

This directory documents the fork-specific changes in `mindroom-ai/mindroom-librechat` that are not part of upstream `danny-avila/LibreChat`.

Goal:
- explain why each fork feature exists
- explain what behavior it adds
- keep upstream sync/rebase easier by making fork deltas explicit

## Feature docs

- `fork-context.md`
- `tool-tag-rendering.md`
- `model-selector-refresh.md`
- `speech-tts-thinking-toggle.md`
- `speech-stt-caret-insertion.md`
- `ci-and-deployment.md`
- `commit-log.md`

## Upstream provenance links

The following fork features are explicit ports from upstream LibreChat PRs:

1. `speech-tts-thinking-toggle.md`  
   Fork PR: <https://github.com/mindroom-ai/mindroom-librechat/pull/10>  
   Upstream PR: <https://github.com/danny-avila/LibreChat/pull/11382>
2. `speech-stt-caret-insertion.md`  
   Fork PR: <https://github.com/mindroom-ai/mindroom-librechat/pull/11>  
   Upstream PR: <https://github.com/danny-avila/LibreChat/pull/7908>

## Fork baseline

Current fork-only history is documented relative to:
- upstream base commit: `e142ab72da7ca53327543fcf2cc30461262f5e28`
- local branch at generation time: `main`

When adding a new fork feature, add/update the relevant file here in the same PR.
