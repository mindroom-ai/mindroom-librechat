# Feature: Per-Role Model Permissions Per Endpoint

## Commit

- `3a5519374` feat: add per-role model permissions per endpoint (#13)

## Provenance

- Fork PR: <https://github.com/mindroom-ai/mindroom-librechat/pull/13>
- Upstream PR: none (fork-only feature)

## Why

MindRoom needs to restrict which models each user role can access, per endpoint. For example, `USER` role gets only `gpt-4o-mini` on OpenAI, while `ADMIN` sees all models. Without this, all authenticated users see every configured model.

## Configuration

Add a `roles` section to `librechat.yaml`:

```yaml
roles:
  USER:
    endpoints:
      openAI:
        models: [gpt-4o-mini]
      custom:
        MindRoom:
          models: [mindroom-basic]
  ADMIN:
    # No entry = no restrictions (sees all models)
  premium:
    endpoints:
      openAI:
        models: [gpt-4o, gpt-4o-mini, o1]
      custom:
        MindRoom:
          models: [mindroom-pro, mindroom-basic]
```

### Rules

- **No `roles` section at all** → every user sees every model (existing behavior).
- **Role has no entry** (e.g., `ADMIN` above) → no restrictions, sees all models.
- **Role has an endpoint with a models list** → only those models are visible for that endpoint. Other endpoints without an entry remain unrestricted.
- **Role has an endpoint with empty models `[]`** → that endpoint is blocked entirely (no models shown).
- Built-in endpoint names (`openAI`, `google`, `anthropic`, `azureOpenAI`, `assistants`, `azureAssistants`, `agents`, `bedrock`) are validated with strict mode — typos are rejected at startup.
- Custom endpoint names go under the `custom:` key and are normalized via `normalizeEndpointName()`.

## How it works

### Data flow

```
librechat.yaml         (1) parsed by zod configSchema at startup
       ↓
    AppService          (2) stores roles config in AppConfig
       ↓
  getAppConfig(role)    (3) applies role restrictions → _roleModelRestrictions
       ↓
  getModelsConfig(req)  (4) loads all models, then filters by role
       ↓
   client / API         (5) user sees only their allowed models
```

### Step by step

1. **Startup**: `librechat.yaml` is parsed. The `roles` section is validated by a zod schema (`rolesConfigSchema` in `config.ts`). Invalid endpoint names are rejected immediately.

2. **AppService** (`service.ts`): The parsed `roles` object is passed through to `AppConfig` alongside all other config. It is stored in the base config cache.

3. **getAppConfig({ role })** (`app.js`): When called with a role (e.g., `"USER"`), `applyRoleBasedConfig()` looks up that role's endpoint restrictions. It flattens custom endpoints to top level (e.g., `custom.MindRoom` becomes `MindRoom`) and returns a cloned config with `_roleModelRestrictions` set. Results are cached per role.

4. **getModelsConfig(req)** (`ModelController.js`): This is the single entry point for all model list retrieval. It:
   - Reads `req.user.role` (set by auth middleware, not user-controllable).
   - Checks the per-role cache (`MODELS_CONFIG:USER`, `MODELS_CONFIG:ADMIN`, etc.).
   - On cache miss, loads the base (unfiltered) model list from all configured providers, then calls `filterModelsByRole()` to intersect with the role's allowed models.
   - Caches the filtered result for that role.
   - Supports `refresh=true` query param to bypass cache (from the model-selector-refresh feature).

5. **Client**: The model selector dropdown shows only the models returned by `getModelsConfig`. No client-side changes were needed.

### Enforcement

- **Model selector**: Only allowed models appear in the dropdown (server returns filtered list).
- **Submission**: `validateModel` middleware calls `getModelsConfig(req)` before processing a chat request. If the submitted model is not in the filtered list, the request is rejected with "Illegal model request". Since `getModelsConfig` already filters by role, enforcement is automatic.

## Security

- `req.user.role` is set server-side by auth middleware (JWT strategy or OIDC strategy). It comes from the database, not from the client request.
- All filtering happens server-side. The client never receives the full model list.
- Even if a user crafts a direct API request with a restricted model, `validateModel` middleware blocks it.

## OIDC integration

The OIDC strategy (`api/strategies/openidStrategy.js`) currently assigns only two roles:
- `ADMIN` — if the user's token contains the `OPENID_ADMIN_ROLE` group.
- `USER` — everyone else.

This means `librechat.yaml` can differentiate `USER` vs `ADMIN` model access today. To support more tiers (e.g., `basic`, `premium`), a future `OPENID_ROLE_MAPPING` env var would map IdP groups to arbitrary LibreChat role names.

## Key files

| File | What it does |
|------|-------------|
| `packages/data-provider/src/config.ts` | Zod schema for `roles` config validation |
| `packages/data-schemas/src/types/app.ts` | `AppConfig` type with `roles` and `_roleModelRestrictions` |
| `packages/data-schemas/src/app/service.ts` | Passes `roles` from config to `AppConfig` |
| `api/server/services/Config/app.js` | `applyRoleBasedConfig()` — core restriction logic |
| `api/server/controllers/ModelController.js` | `filterModelsByRole()`, per-role caching, `getModelsConfig()` |

## User-visible result

Users see only the models allowed for their role in the model selector dropdown. Submitting a restricted model is rejected server-side.
