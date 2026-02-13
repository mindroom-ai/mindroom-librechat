# Feature: Per-Role Model Permissions Per Endpoint

## Commits

- `3a5519374` feat: add per-role model permissions per endpoint (#13)
- `a63102802` fix: hide endpoints entirely when all models are blocked (#20)

## Provenance

- Fork PRs: [#13](https://github.com/mindroom-ai/mindroom-librechat/pull/13), [#20](https://github.com/mindroom-ai/mindroom-librechat/pull/20)
- Upstream PR: none (fork-only feature)

## Why

MindRoom needs to restrict which models each user role can access, per endpoint. For example, `USER` role gets only `gpt-4o-mini` on OpenAI, while `ADMIN` sees all models. Without this, all authenticated users see every configured model.

## Current limitation: only USER and ADMIN roles exist

LibreChat currently assigns only two roles:

- **`ADMIN`** — the first registered user, or users matched by `OPENID_ADMIN_ROLE`.
- **`USER`** — everyone else.

There is no built-in way to assign custom roles (e.g., `premium`, `basic`). No admin UI or API endpoint exists for changing a user's role — it can only be done by editing the `role` field directly in MongoDB.

The config schema supports arbitrary role names, but **in practice only `USER` and `ADMIN` are useful today**. To support more tiers, the OIDC strategy would need a role mapping feature (e.g., an `OPENID_ROLE_MAPPING` env var that maps IdP groups to LibreChat role names).

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
```

Example with custom roles (requires future OIDC role mapping to be useful):

```yaml
roles:
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
- **Role has an endpoint with empty models `[]`** → that endpoint is omitted from the API response entirely. The UI hides the endpoint (no menu item shown), rather than showing an empty submenu.
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
   - Endpoints where all models are blocked (empty `models: []`) are omitted from the result entirely, so the UI never renders an empty menu item.
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

## Future: multi-tier roles via OIDC

To go beyond `USER`/`ADMIN`, the OIDC strategy (`api/strategies/openidStrategy.js`) would need to map IdP groups to arbitrary LibreChat role names. For example, an `OPENID_ROLE_MAPPING` env var could map groups from any OIDC provider to roles like `premium` or `basic`. This would make the custom role names in `librechat.yaml` functional without requiring direct MongoDB edits.

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
