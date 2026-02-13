# Feature: OIDC Group-Based Model Permissions

## Provenance

- Fork PRs: [#19](https://github.com/mindroom-ai/mindroom-librechat/pull/19), [#20](https://github.com/mindroom-ai/mindroom-librechat/pull/20)
- Upstream PR: none (fork-only feature)
- Depends on: role-based model permissions (PR #13)

## Why

The role-based model permissions feature (PR #13) restricts models per role, but roles are mutually exclusive — a user can only have one role. When users belong to multiple IdP groups that each grant access to different endpoints/models, a single-role mapping can't represent the union of all their permissions. This feature maps IdP groups directly to model permissions and takes the union, so users in multiple groups get combined access.

## What was implemented

1. **Group extraction from OIDC tokens**: The OIDC strategy reads the user's group memberships from their token and stores them on the User document (`openidGroups` field).

2. **`groups` config section in `librechat.yaml`**: Each group maps to per-endpoint model allowlists, using the same shape as `roles`.

3. **Union-based permission resolution**: When a user has multiple matching groups, the allowed models are the union across all groups. Groups take precedence over role-based config when both are configured.

## Configuration

### Environment variables

```bash
# Where to find groups in the OIDC token
OPENID_GROUPS_PARAMETER_PATH=groups          # dot-path to the groups claim
OPENID_GROUPS_TOKEN_KIND=id                   # 'id', 'access', or 'userinfo'
```

### librechat.yaml

```yaml
groups:
  openai-users:
    endpoints:
      openAI:
        models: [gpt-4o-mini]
  mindroom-users:
    endpoints:
      custom:
        MindRoom:
          models: [mindroom-basic, mindroom-pro]
  premium-openai:
    endpoints:
      openAI:
        models: [gpt-4o, gpt-4o-mini, o1, o3-mini]
```

A user in both `openai-users` and `mindroom-users` gets `gpt-4o-mini` on OpenAI **and** `mindroom-basic`/`mindroom-pro` on MindRoom.

A user in both `openai-users` and `premium-openai` gets the union: `gpt-4o-mini`, `gpt-4o`, `o1`, `o3-mini` on OpenAI.

### Precedence rules

1. **Groups over roles**: If the user has matching groups in the `groups` config, those are used. Role-based config (`roles` section) is only used as a fallback.
2. **No matching groups → fall back to role**: If the user has groups but none match the config, the `roles` section is checked.
3. **No config → no restrictions**: If neither `groups` nor `roles` is configured, all models are visible.

## How it works

```
OIDC token (groups claim)
    ↓
openidStrategy.js extracts groups, stores on user.openidGroups
    ↓
ModelController reads req.user.openidGroups
    ↓
getAppConfig({ openidGroups }) → applyGroupBasedConfig()
    ↓
Union of all matching groups' endpoint restrictions
    ↓
filterModelsByRole() filters available models
    ↓
Client receives only allowed models
```

### Data flow detail

1. **Login**: `openidStrategy.js` reads the groups claim from the OIDC token (path configured via `OPENID_GROUPS_PARAMETER_PATH`), stores the array on `user.openidGroups` in MongoDB.

2. **Model request**: `ModelController.getModelsConfig()` reads `req.user.openidGroups` and passes them to `getAppConfig()`.

3. **Group resolution**: `applyGroupBasedConfig()` iterates the user's groups, looks each up in `baseConfig.groups`, and builds a union of all matching endpoint restrictions using `flattenEndpointRestrictions()`.

4. **Filtering**: `filterModelsByRole()` intersects the union restrictions with the available models per endpoint. Endpoints where all models are blocked (empty `models: []` or no models survive filtering) are omitted from the result entirely — the UI hides the endpoint rather than showing an empty submenu.

5. **Caching**: Group-based results are cached per sorted group combination in `ModelController` (key: `MODELS_CONFIG:g:ROLE:["group-a","group-b"]`). The key includes the role to prevent cross-role cache poisoning, and uses `JSON.stringify` on sorted groups to avoid collisions from group names containing commas. Group cache entries have a 10-minute TTL to prevent unbounded memory growth. They are not cached in `getAppConfig` since group combinations are per-user.

## Key files

| File | What it does |
|------|-------------|
| `api/strategies/openidStrategy.js` | Extracts groups from OIDC token, stores on user. Clears stale groups when extraction env vars are removed. |
| `api/server/services/Config/app.js` | `applyGroupBasedConfig()` — union logic. Skips per-role cache when groups present to avoid stale results. |
| `api/server/controllers/ModelController.js` | `filterModelsByRole()` (omits blocked endpoints), per-group cache key with role + JSON groups, 10-min TTL |
| `packages/data-provider/src/config.ts` | `groupsConfigSchema` — YAML schema validation |
| `packages/data-schemas/src/app/service.ts` | Passes `groups` through AppService |
| `packages/data-schemas/src/schema/user.ts` | `openidGroups` field on User document |
| `packages/data-schemas/src/types/user.ts` | `openidGroups` on `IUser` interface |

## Tests

| File | Count | What it covers |
|------|-------|---------------|
| `api/strategies/openidStrategy.spec.js` | 6 tests | Group extraction from tokens (id/access/userinfo, nested paths, single string) |
| `api/server/services/Config/__tests__/roleModelPermissions.integration.spec.js` | 23 tests | Schema validation (4 role + 4 group) + end-to-end filtering (14) + cache regression (1) |
| `api/server/controllers/ModelController.spec.js` | 7 group tests | Group cache keys, sorted consistency, cross-role isolation, cache miss compute, getAppConfig passthrough, empty/undefined groups fallback |
| `api/server/routes/__tests__/models.spec.js` | 8 tests | Full HTTP path (supertest): no restrictions, role-based, group union, group precedence, role fallback, cross-role isolation, overlapping unions, empty models blocking |

## User-visible result

Users are automatically assigned model access based on their IdP group membership. The model selector shows only the union of models allowed across all their groups. No admin intervention required after initial YAML config.
