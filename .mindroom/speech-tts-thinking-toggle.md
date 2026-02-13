# Feature: Include Thinking in TTS Toggle

## Commit

- `861887f01` feat: add user toggle for including thinking in TTS (#10)

## Provenance

- Fork PR: <https://github.com/mindroom-ai/mindroom-librechat/pull/10>
- Upstream PR: <https://github.com/danny-avila/LibreChat/pull/11382>

## Why

Some users want TTS to read only final assistant output. Others want TTS to include reasoning/thinking content. A user-level preference was needed.

## What was implemented

- Added persisted setting: `includeThinkingInTTS`.
- Added speech settings UI toggle.
- Updated message-to-TTS parsing to optionally skip/include reasoning blocks.
- Wired behavior through browser/external TTS hooks and playback flow.
- Autoplay honors the toggle on both engines: `StreamAudio` (external) and `BrowserAudio` (browser, added upstream in v0.8.8).
- Each reasoning block (standalone, legacy `:::thinking:::`, and grouped `ReasoningCompact`) has one read-aloud control (`ThinkingReadAloud`) in its header next to copy, shown when expanded and kept mounted (`hidden`) while collapsed so an in-flight playback keeps its Stop state. Upstream v0.8.8 hides the floating thinking bar while the header is on screen, and a single control per block keeps one playback session. The audio id appends the part's `useId` so several reasoning parts in one message never collide.

Key files:
- `client/src/store/settings.ts`
- `client/src/components/Nav/SettingsTabs/Speech/TTS/IncludeThinkingSwitch.tsx`
- `client/src/utils/messages.ts`
- `client/src/hooks/Input/useTextToSpeech.ts`

## User-visible result

Users can control whether TTS reads reasoning/thinking sections or only the normal assistant response text.
