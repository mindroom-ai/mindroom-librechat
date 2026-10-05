# Feature Area: CI and Deployment Workflow Hardening

## Commits

- `2eee13277` Add main-branch Docker build and push workflow (#3)
- `3637bf5ce` ci: guard locize and docker workflows when secrets are missing
- `7d3d5c9aa` ci: fix guarded workflow syntax and secret gating

## Why

Fork CI needed reliable image publishing and safer behavior in environments where optional secrets are not configured.

## What was implemented

- Added main-branch Docker image build/push workflow for GHCR tags (`latest` and short SHA).
- Added explicit secret checks and guarded execution for workflows depending on DockerHub/Locize credentials.
- Fixed workflow condition syntax and output-based gating.
- Guarded upstream's `pr-retarget-dev.yml` to `LibreChat-AI/LibreChat`: fork PRs target `main` by design and the fork has no `dev` branch.
- Guarded the scheduled run of upstream's `frontend-windows-nightly.yml` the same way: it checks out `dev`.
- Guarded upstream's release publishing to `LibreChat-AI/LibreChat`: npm packages (`client.yml`, `data-provider.yml`, `data-schemas.yml`; the names belong to upstream and use its OIDC trusted publisher), Helm charts (`sync-helm-chart-tags.yml`, `helmcharts.yml`) and version-tag images (`tag-images.yml`). The fork's only release artifact is the GHCR image from `docker-build.yml`.

Key files:
- `.github/workflows/docker-build.yml`
- `.github/workflows/dev-images.yml`
- `.github/workflows/locize-i18n-sync.yml`
- `.github/workflows/pr-retarget-dev.yml`
- `.github/workflows/frontend-windows-nightly.yml`

Upstream removed the test-server deploy workflow (`deploy-dev.yml`, LibreChat #14823) in v0.8.8, so the fork's
`ci: stabilize Update Test Server workflow` commit was dropped in the v0.8.8 rebase.

## Operational result

CI is less brittle and avoids running secret-dependent jobs when required secrets are absent.
