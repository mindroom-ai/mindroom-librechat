# Feature: Custom Endpoint Logos

## Provenance

- Fork PRs: <https://github.com/mindroom-ai/mindroom-librechat/pull/25>, <https://github.com/mindroom-ai/mindroom-librechat/pull/26>
- Upstream PR: none. Upstream's provider icon registry (LibreChat #15148, v0.8.8) now covers most of the original fork behavior; the fork keeps only the delta below.

## Why

MindRoom's documented LibreChat config adds a custom endpoint named `MindRoom` without an `iconURL`. It should show the MindRoom logo instead of the generic custom-endpoint icon. Custom endpoints named after a provider (for example `Claude Gateway`) should show that provider's logo.

## What upstream provides (v0.8.8)

- `ProviderId` + `resolveProviderId()` in `packages/data-provider/src/providers.ts` (aliases like `claude`, `chatgpt`, `gemini`).
- `resolveEndpointProviderId()` in `packages/api/src/endpoints/custom/providers.ts` sets `providerId` on each custom endpoint at config load: `iconURL` key, then `baseURL` host, then `provider`, then exact name.
- `resolveProviderIcon()` in `client/src/hooks/Endpoint/useProviderIcon.ts` picks the art: image `iconURL`, `iconURL` naming a provider, served `providerId`, first-class endpoint, then endpoint name.

## What the fork adds

- `ProviderId.mindroom` and a registry entry using `assets/mindroom-logo.png` (`packages/client/src/icons/provider/registry.ts`; the asset ships in both `client/public/assets/` and `packages/client/src/icons/provider/assets/`).
- `resolveNameProviderFallback()` in `packages/api/src/endpoints/custom/brand.ts`, used when upstream resolution finds nothing:
  - a provider word inside the name matches (`MindRoom-Dev`, `Claude Gateway`, `OpenRouter Proxy`);
  - a custom endpoint named `agents` maps to MindRoom.
- Conversations saved before v0.8.8 may carry `iconURL: 'mindroom'` (the old fork wrote brand keys into `iconURL`); `resolveProviderId('mindroom')` resolves them.

Key files:
- `packages/data-provider/src/providers.ts`
- `packages/client/src/icons/provider/registry.ts`
- `packages/api/src/endpoints/custom/brand.ts`
- `packages/api/src/endpoints/custom/config.ts`

## User-visible result

A custom endpoint named `MindRoom` (or `agents`, or containing a known provider word) shows the matching logo in the model selector, conversation list, and messages. Explicit `iconURL` values (URLs, paths, or provider keys) still win.
