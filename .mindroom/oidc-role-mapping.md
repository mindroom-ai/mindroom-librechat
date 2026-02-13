# Feature: OIDC Role Mapping

## Provenance

- Fork PR: (this PR)
- Upstream PR: none (fork-only feature)

## Why

The role-based model permissions feature supports arbitrary role names in `librechat.yaml`, but the OIDC strategy only assigned `USER` or `ADMIN`. There was no way to map IdP groups to custom roles like `premium` or `basic` without editing MongoDB directly.

## What was implemented

Added `OPENID_ROLE_MAPPING` env var support to the OIDC strategy. It maps IdP group claims to LibreChat role names.

## Configuration

```bash
# Comma-separated group:role pairs, checked in order (first match wins)
OPENID_ROLE_MAPPING=idp-premium-group:premium,idp-basic-group:basic

# Where to find groups in the token (optional — falls back to OPENID_ADMIN_ROLE_* values)
OPENID_ROLE_MAPPING_PARAMETER_PATH=groups
OPENID_ROLE_MAPPING_TOKEN_KIND=id
```

Combined with `librechat.yaml`:

```yaml
roles:
  basic:
    endpoints:
      openAI:
        models: [gpt-4o-mini]
  premium:
    endpoints:
      openAI:
        models: [gpt-4o, gpt-4o-mini, o1]
  ADMIN:
    # No entry = no restrictions
```

### Rules

- **First match wins**: Mappings are checked in order. The first group found in the user's token determines their role.
- **ADMIN takes priority**: If the user is assigned ADMIN via `OPENID_ADMIN_ROLE`, role mapping is skipped entirely.
- **No match = no change**: If none of the mapped groups are in the user's token, the role is not modified (stays at default `USER`).
- **Falls back to admin path config**: If `OPENID_ROLE_MAPPING_PARAMETER_PATH` / `OPENID_ROLE_MAPPING_TOKEN_KIND` are not set, the values from `OPENID_ADMIN_ROLE_PARAMETER_PATH` / `OPENID_ADMIN_ROLE_TOKEN_KIND` are used.
- **Single string or array**: The group claim can be a single string or an array of strings.

## Key files

| File | What it does |
|------|-------------|
| `api/strategies/openidStrategy.js` | Role mapping logic (after admin role check) |
| `api/strategies/openidStrategy.spec.js` | 7 tests for role mapping |

## User-visible result

Users are automatically assigned the correct role on login based on their IdP group membership. The model selector shows only the models allowed for that role.
