# Fix: Scoped Endpoints Cache & Import Cleanup

## Provenance

- Fork PR: [#22](https://github.com/mindroom-ai/mindroom-librechat/pull/22)
- Upstream PR: none (fork-only fix)
- Depends on: role-based model permissions (#13), OIDC group-based model permissions (#19), endpoint hiding (#20, #21)

## Why

Several issues arose from the role/group-based model permissions features:

1. **Endpoints cache was not scoped by role/groups.** `getEndpointsConfig()` used a single cache key (`ENDPOINT_CONFIG`) for all users. After one user loaded the endpoints, every other user — regardless of role or groups — got that same cached result. A `USER` with restricted models could see an `ADMIN`'s endpoints, or vice versa.

2. **Blocked endpoints not hidden in endpoints config.** The model selector correctly hid blocked endpoints, but the `/api/endpoints` response still included them. The endpoints route also lacked authentication, so unauthenticated requests saw all endpoints.

3. **Import read endpoints config from unscoped cache.** `importLibreChatConvo()` fetched endpoints config directly from the cache using the unscoped key, bypassing role/group restrictions. This also created a hidden dependency on cache state.

4. **Fallback config could pollute scoped cache.** When the config middleware fell back to base config (on error), `getEndpointsConfig()` could cache that unscoped result under a scoped key.

## What changed

### Scoped endpoints cache (`getEndpointsConfig.js`)

- Cache key now includes role and groups: `ENDPOINT_CONFIG:USER`, `ENDPOINT_CONFIG:g:USER:["group-a","group-b"]`.
- Group-scoped entries use a 10-minute TTL (same as model config) to prevent unbounded growth.
- `getEndpointsCacheKey(role, openidGroups)` builds the key; groups are sorted and JSON-stringified for consistency.

### Endpoint restriction filtering (`getEndpointsConfig.js`)

- `applyEndpointRestrictions()` removes endpoints where `_roleModelRestrictions` has `models: []` before returning the config.
- This ensures blocked endpoints are omitted from both the model selector and the `/api/endpoints` response.

### Endpoints route authentication (`endpoints.js`)

- Added `optionalJwtAuth` middleware so `req.user` is populated when available. This allows `getEndpointsConfig()` to scope results by role/groups.

### Config middleware hardening (`app.js`, `app.spec.js`)

- Added `req.configIsFallback` flag: `false` on success, `true` when falling back to base config.
- `getEndpointsConfig()` detects fallback config and re-fetches scoped config directly, refusing to cache the result on failure.

### Import cleanup (`importers.js`, `importConversations.js`, `convos.js`)

- `importLibreChatConvo()` no longer reads endpoints config from the cache. Instead, it receives `endpointsConfig` via an `importContext` parameter.
- The import route (`convos.js`) fetches `endpointsConfig` via `getEndpointsConfig(req)` (which respects role/groups) and passes it through.
- Removed unused `getLogStores` and `CacheKeys` imports from `importers.js`.
- Added temp file cleanup when the import fails before starting.

## Key files

| File | What changed |
|------|-------------|
| `api/server/services/Config/getEndpointsConfig.js` | Scoped cache key, `applyEndpointRestrictions()`, fallback-safe caching |
| `api/server/services/Config/getEndpointsConfig.spec.js` | New test suite (scoped caching, restrictions, fallback handling) |
| `api/server/routes/endpoints.js` | Added `optionalJwtAuth` middleware |
| `api/server/middleware/config/app.js` | Added `req.configIsFallback` flag |
| `api/server/middleware/config/app.spec.js` | New test suite for config middleware |
| `api/server/utils/import/importers.js` | Receives `endpointsConfig` via param instead of cache |
| `api/server/utils/import/importConversations.js` | Passes `importContext` through to importer |
| `api/server/routes/convos.js` | Fetches scoped endpoints config, passes to import, cleans up temp file on error |
