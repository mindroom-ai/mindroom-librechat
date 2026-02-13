# Feature: STT Inserts at Caret

## Commit

- `ef0749078` fix: make Speech-to-Text insert at caret instead of overwriting (#11)

## Provenance

- Fork PR: <https://github.com/mindroom-ai/mindroom-librechat/pull/11>
- Upstream PR: <https://github.com/danny-avila/LibreChat/pull/7908>

## Why

Overwriting the whole input on transcription is disruptive when users are editing text or dictating in the middle of a prompt.

## What was implemented

- Updated STT text insertion logic in `AudioRecorder` to insert at the current textarea selection/caret using `setRangeText`.
- Kept a fallback path when textarea is not mounted.

Key file:
- `client/src/components/Chat/Input/AudioRecorder.tsx`

## User-visible result

Speech transcription behaves like normal text input insertion and no longer replaces the full draft unexpectedly.
