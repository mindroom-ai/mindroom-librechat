# Feature: Refresh Models When Opening Model Selector

## Commit

- `35eda803d` Refresh models when opening the model selector dropdown (#16)

## Why

Cached model lists can become stale during runtime. Users need a lightweight way to see updated model availability/config without full page reload.

## What was implemented

- Added refresh-capable models endpoint flow:
  - API supports `refresh=true` on models fetch.
  - Data provider passes optional refresh flag.
- Model selector triggers refresh when opened.
- Added loading indicator while refresh is in progress.
- Added smoke coverage in controller/UI tests.

Key files:
- `api/server/controllers/ModelController.js`
- `client/src/components/Chat/Menus/Endpoints/ModelSelectorContext.tsx`
- `client/src/components/Chat/Menus/Endpoints/ModelSelector.tsx`
- `packages/data-provider/src/api-endpoints.ts`
- `packages/data-provider/src/data-service.ts`

## User-visible result

Opening the model selector requests a fresh models config (with throttling/cooldown) and shows loading state while updating.
