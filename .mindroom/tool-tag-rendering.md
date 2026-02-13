# Feature: Tool Tag Rendering

## Final state in this fork

- Assistant inline tool tags are rendered as native LibreChat `ToolCall` cards.
- Parsing is strict to the current MindRoom contract:
  - `<tool id="N" state="start">call</tool>`
  - `<tool id="N" state="done">call\nresult</tool>`
- Reconciliation is by stable tool `id`, not call-string matching.
- Completed cards stay anchored at the original `start` position (no visual jump).

Main commits in this repo:
- `2ff285cbd` Render inline `<tool>/<tool-group>` markup as ToolCall UI cards ([PR #1](https://github.com/mindroom-ai/mindroom-librechat/pull/1))
- `ce8db230f` fix(tool-tags): anchor merged tool cards at start position ([PR #17](https://github.com/mindroom-ai/mindroom-librechat/pull/17))

## Why this feature exists

MindRoom streams tool activity inside assistant content. Without parsing these tags, users see raw markup and confusing duplicated states.

## Full iteration history (including failed/reverted paths)

Backend (`mindroom-ai/mindroom`) evolution:

1. Structured SSE events for LibreChat were attempted in [mindroom#84](https://github.com/mindroom-ai/mindroom/pull/84), then reverted in [mindroom#85](https://github.com/mindroom-ai/mindroom/pull/85) due to incompatibility with LibreChat's request/stream pipeline.
2. HTML `<details>` tool rendering was attempted in [mindroom#86](https://github.com/mindroom-ai/mindroom/pull/86), then reverted in [mindroom#88](https://github.com/mindroom-ai/mindroom/pull/88) due to rendering/escaping issues and poor LibreChat compatibility.
3. Format mismatch between streaming paths was tracked in [mindroom issue #89](https://github.com/mindroom-ai/mindroom/issues/89).
4. Canonical `<tool>call\nresult</tool>` formatting was unified in [mindroom#90](https://github.com/mindroom-ai/mindroom/pull/90).
5. Stable `id` + explicit `state` were added in [mindroom#91](https://github.com/mindroom-ai/mindroom/pull/91), which enabled robust frontend reconciliation.

Frontend (`mindroom-librechat`) evolution:

1. Initial parser/render integration landed in [PR #1](https://github.com/mindroom-ai/mindroom-librechat/pull/1).
2. Duplicate pending/completed workaround PRs ([PR #12](https://github.com/mindroom-ai/mindroom-librechat/pull/12), [PR #14](https://github.com/mindroom-ai/mindroom-librechat/pull/14)) handled transitional backend output but were interim logic.
3. Strict `id/state` parsing and `id`-based collapse landed in [PR #15](https://github.com/mindroom-ai/mindroom-librechat/pull/15), replacing old-format fallback behavior.
4. Anchor-at-start behavior landed in [PR #17](https://github.com/mindroom-ai/mindroom-librechat/pull/17) to prevent dropdown movement when `done` arrives later.

Note:
- Fork history was later cleaned via squash/rebase, so many intermediate attempts are represented primarily by PR history rather than many commits on `main`.

## Implementation surface

- Parser: `client/src/utils/toolTags.ts`
- Rendering integration: `client/src/components/Chat/Messages/Content/Parts/Text.tsx`
- Tests:
  - `client/src/utils/__tests__/toolTags.test.ts`
  - `client/src/components/Chat/Messages/Content/__tests__/Text.tool-tags.test.tsx`

## User-visible result

- One logical tool call appears as one card that updates in place.
- Tool output is shown inside the dropdown card (not as plain text below).
- Interleaved assistant text remains stable and readable during streaming.
