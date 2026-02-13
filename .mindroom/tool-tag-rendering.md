# Feature: Tool Tag Rendering

## Commits

- `2ff285cbd` Render inline `<tool>/<tool-group>` markup as ToolCall UI cards (#1)
- `ce8db230f` fix(tool-tags): anchor merged tool cards at start position (#17)

## Why

MindRoom backend emits tool execution traces inside assistant content (tool call start + completion). Without parsing those tags in the client, users see raw markup and duplicated/misaligned tool states.

## What was implemented

- Added parser utility at `client/src/utils/toolTags.ts`.
- Integrated parser output into assistant text rendering in `client/src/components/Chat/Messages/Content/Parts/Text.tsx`.
- Rendered parsed tool segments as native `ToolCall` cards.
- Added/expanded tests:
  - `client/src/utils/__tests__/toolTags.test.ts`
  - `client/src/components/Chat/Messages/Content/__tests__/Text.tool-tags.test.tsx`

## Current behavior

- Strictly parses tool blocks with explicit id/state metadata.
- Ignores literal tool-tag examples inside markdown code spans/fences.
- Reconciles start/done updates by tool id.
- Keeps merged tool cards anchored at the original start position (prevents card jump when completion appears later in streamed content).

## User-visible result

- Tool calls show as dropdown/cards instead of raw tags.
- A single tool call updates in place from running to completed.
- Interleaved assistant text remains readable without tool-card reordering artifacts.
