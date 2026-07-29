# OPS-003B — Node 26 Runtime Upgrade

Status: Implemented locally on 2026-07-27; hosted container verification pending

## Context

The repository release contract was pinned to Node.js 24.18.0 while the active
developer environment had already moved to Node 26. The Founder approved Node
26 as the primary repository runtime and requested the latest available Node 26
release.

The official Node release index identified Node.js 26.5.0 as the current Node 26
release on 2026-07-27. Historical checkpoints and audits remain valid records of
the runtime used at their collection time and are not rewritten by this issue.

## Scope

- pin `.node-version` and `.nvmrc` to Node.js 26.5.0;
- require `>=26.5.0 <27` from the root package engine;
- update the executable runtime and deployment drift gates;
- update GitHub Actions and the container runtime assertion;
- replace the pinned Node 24 build and distroless runtime images with reviewed
  Node 26 image digests;
- update the temporary Vercel bundle runtime to Node 26; and
- update current operator/developer documentation without rewriting historical
  audit evidence.

## Non-goals

- no package or application behavior change;
- no dependency-version, API, database, schema, policy, permission, or funds
  change;
- no CI dispatch, image publication, cloud deployment, or remote access;
- no claim that the Node 24 evidence was collected under Node 26; and
- no bypass for a runtime other than the exact reviewed Node 26.5.0 process.

## Likely files

- `.node-version`
- `.nvmrc`
- `package.json`
- `scripts/check-runtime.mjs`
- `scripts/check-deploy.mjs`
- `.github/workflows/quality.yml`
- `Dockerfile`
- `deploy/vercel/package.bundle.json`
- `deploy/vercel/README.md`
- `deploy/gcp/README.md`
- `README.md`

## Acceptance criteria

- `.node-version`, `.nvmrc`, package engine, CI, Docker build, distroless
  runtime, Vercel bundle, and executable drift checks agree on Node 26;
- the exact repository runtime gate accepts Node 26.5.0 and rejects Node 26.0.0
  or another unreviewed release;
- the container build remains digest-pinned, non-root, and shell-free;
- the complete repository, security, transport, and PostgreSQL gates pass under
  Node 26.5.0;
- active documentation points to Node 26.5.0; and
- historical audit/checkpoint/ADR evidence remains unchanged.

## Test commands

```sh
pnpm run check:runtime
pnpm run check
pnpm run test:security
pnpm run test:transport
pnpm run test:postgres
git diff --check
```

## Security checklist

- [x] Runtime drift continues to fail before release evidence is collected.
- [x] Build and runtime container images use immutable digests.
- [x] The final image remains distroless and non-root.
- [x] No secret, credential, endpoint, remote access, signer, or funds
  permission is added.
- [x] Historical evidence is not relabelled.
- [x] The Node 26 image builds locally with pnpm 11.1.3 installed explicitly
  through the image-bundled npm (the slim image does not include Corepack).
- [ ] CI must independently build and smoke the Node 26 image.

## Verification evidence

- The official Node.js release page identified
  `https://nodejs.org/en/blog/release/v26.5.0` as Node 26.5.0 Current.
- The official `node-v26.5.0-darwin-arm64.tar.gz` matched published SHA-256
  `ee920559aaa2391569cff4d737e3b83963430e3a14dedd91bfe0ff53171b5af9`.
- `pnpm run check`: 562/562 under exact Node 26.5.0 and pnpm 11.1.3.
- `pnpm run test:security`: 33/33.
- `pnpm run test:transport`: 52/52.
- `pnpm run test:postgres`: 77/77 against an isolated PostgreSQL 17 cluster,
  including production bootstrap, authentication, RLS, restart, replay,
  reconciliation, and recovery behavior.
- The Node 26.5.0 Docker build image index and Node 26 distroless runtime are
  digest-pinned. The build image was verified to provide Node 26.5.0 and npm
  11.17.0 but not Corepack, so the Dockerfile installs exact pnpm 11.1.3
  through npm. Independent CI smoke and signature verification remain
  connected-release checks.
- `git diff --check` passes.
