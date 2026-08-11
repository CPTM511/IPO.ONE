# PROD-CUTOVER-001 Vercel candidate deployment evidence

Date: 2026-08-11

Verdict: `BLOCKED — NOT PRODUCTION RELEASED`

## Exact release identity

- release candidate: `prod-cutover-001-20260811-001`
- deployed source commit:
  `3320b7c62d59853a0adfed570cd6bbd8762950e3`
- deployed source tree: `983f46b1529aa4da325888f61cf6f847ddd2beac`
- integrated product source commit:
  `285cc74aadd65e147fe223f032516635138979f5`
- integrated product source tree:
  `171ec9d9df83a01ba8a25cd40df1c5d8142221c6`
- bundle build source: clean detached worktree at the exact release commit
- dirty compatibility build: `false`

## Artifact manifests

| Role | Artifact count | Manifest SHA-256 |
| --- | ---: | --- |
| Primary | 165 | `a1d5b2d6e0fda3c397bf6ef39f2ed989b939ece33ffea7afde7fdbb939d9e39a` |
| Risk | 163 | `3acf927fe70fffa56656d96a5fa532b17e3aab601adf019d7805ed70e46a3d38` |

Both bundles passed Node syntax checks. The repository Vercel static gate passed
and preserved Node 24 Functions, Primary-only Cron, PostgreSQL durability and
the explicit no-real-funds boundary.

## Non-promoted Vercel candidates

| Role | Project | Deployment ID | Candidate URL | Vercel state |
| --- | --- | --- | --- | --- |
| Primary | `ipo-one-internal` | `dpl_DQFnHLVvz51j8auKGihizRGjJeuu` | `https://ipo-one-internal-5zper8dyu-cptm-111-s-projects.vercel.app` | `READY` |
| Risk | `ipo-one-internal-risk` | `dpl_uF2MjKp87zwKeN6tzkWY1SFVDgFB` | `https://ipo-one-internal-risk-hrv320td9-cptm-111-s-projects.vercel.app` | `READY` |

The candidates were created with the Vercel production environment only so the
Primary Cron topology could be built, but with `--skip-domain`. The exact
release SHA was supplied as a deployment-specific, non-secret
`IPO_ONE_RELEASE_ID` override. No persistent production variable or secret was
changed.

The Primary bundle produced `api/vercel-sandbox` and
`api/vercel-sandbox-cron`. The Risk bundle produced only
`api/vercel-sandbox`. Local Vercel CLI was 58.5.1; the Vercel build environment
reported CLI 58.1.0 and Node 24 Functions.

## Promotion and domain state

The stable project aliases were not promoted:

- `https://ipo-one-internal.vercel.app` remains bound to
  `dpl_7NhTtf5Px5nuP3maXowDeftJNQz5`, created 2026-08-07.
- `https://ipo-one-internal-risk.vercel.app` remains bound to
  `dpl_5v3utf2uUXSH4G5m1QJ9e8Wyj2DR`, created 2026-08-07.

Vercel reported zero custom domains in team `cptm-111-s-projects`; `ipo.one`
is not attached through this Vercel team. No DNS or custom-domain mutation was
performed.

## Environment handling

Both existing projects expose the required production variable names through
Vercel metadata. Values remain encrypted. A request to pull all production
secret values into local files was rejected by the safety boundary and was not
circumvented. The two pre-created empty temporary files were deleted. No secret
value is recorded in this Evidence.

## Health and application readiness

Vercel build state alone is not application readiness. The following required
checks could not be completed:

- Primary `/livez` and `/readyz`: connection to the candidate hostname timed
  out at the bounded five-second connect timeout.
- Risk `/livez` and `/readyz`: connection to the candidate hostname was
  refused/unavailable.
- A separate Codex in-app browser remained at `about:blank` after an eight-
  second bounded navigation attempt to the Primary candidate.

Consequently, the exact release ID, PostgreSQL reachability, migration head,
runtime environment digest, Human/Agent/Risk journeys, Cron behavior and
rollback behavior are not deployed-verified. The candidates must not be
promoted while these signals are unavailable.

## Real-value state

- real funds enabled: `false`
- external Provider execution enabled: `false`
- production signer authority enabled: `false`
- Venue write authority enabled: `false`
- production funds moved: `false`
- exact real-value transaction prepared: `false`

No candidate deployment or test changed the Product Constitution or launch
policy. L4 controlled real value remains disabled, L5 remains not approved and
the controlled Agent credit profile remains release-disabled.

## Exact continuation boundary

1. From a network that can reach the candidate URLs, prove `/livez` and
   `/readyz` for both deployment IDs, including release SHA and migration 0061.
2. Complete the invited-wallet AccountBinding signature and reload recovery on
   the visible product.
3. Run deployed Human, Agent, Risk and rollback acceptance.
4. Promote stable aliases only after those checks pass.
5. Approve a named production profile and policy revision before any real-value
   configuration or transaction is considered.
