# Feature Area: CI and Deployment Workflow Hardening

## Commits

- `2eee13277` Add main-branch Docker build and push workflow (#3)
- `5dee9c08f` ci: stabilize Update Test Server workflow
- `3637bf5ce` ci: guard locize and docker workflows when secrets are missing
- `7d3d5c9aa` ci: fix guarded workflow syntax and secret gating

## Why

Fork CI needed reliable image publishing and safer behavior in environments where optional secrets are not configured.

## What was implemented

- Added main-branch Docker image build/push workflow for GHCR tags (`latest` and short SHA).
- Stabilized test server update flow with pre-cleanup to avoid low-disk failures during deploy automation.
- Added explicit secret checks and guarded execution for workflows depending on DockerHub/Locize credentials.
- Fixed workflow condition syntax and output-based gating.

Key files:
- `.github/workflows/docker-build.yml`
- `.github/workflows/deploy-dev.yml`
- `.github/workflows/dev-images.yml`
- `.github/workflows/locize-i18n-sync.yml`

## Operational result

CI is less brittle and avoids running secret-dependent jobs when required secrets are absent.
