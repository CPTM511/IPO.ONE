# PROD-CUTOVER-002 Completion Audit

Completed: 2026-08-12

## Outcome

IPO.ONE is production-hosted at <https://ipo.one> on the exact zero-funded
release below. The formal domain, TLS certificate, product UI, health routes,
OpenAPI and deployment capability document are publicly reachable. This is a
hosted zero-funded production profile, not real-capital activation.

## Exact release and deployments

| Item | Evidence |
| --- | --- |
| Source commit | `d36ff20c2049b199ed3032e85752f36e36300312` |
| Source tree | `9a47dbb359f0124131f907d2786ece34549cd84f` |
| Primary deployment | `dpl_2JBesAqB2MXZZBCEDypMq5Gzm7Ue` — Ready, production |
| Risk deployment | `dpl_62VpuVX2GRd2uMxpfYXZ7EYxKY7p` — Ready, production |
| Primary rollback | `dpl_6gDN62RphEfXPAMMxas7cTw7jixe` |
| Risk rollback | `dpl_uF2MjKp87zwKeN6tzkWY1SFVDgFB` |

`vercel inspect` resolved both `ipo.one` and
`ipo-one-internal.vercel.app` to the exact Primary deployment. The separate
Risk alias resolved to the exact Risk deployment.

## DNS and TLS

Pre-cutover apex A: `136.68.214.66`.

Post-cutover authoritative state on both `ns47.domaincontrol.com` and
`ns48.domaincontrol.com`:

- apex A: `216.150.1.1`
- apex A: `216.150.16.1`
- `www` CNAME: `ipo.one.`
- NS: `ns47.domaincontrol.com`, `ns48.domaincontrol.com`
- MX: priority 0 `smtp.secureserver.net`, priority 10
  `mailstore1.secureserver.net`
- unrelated `apiv1` A record preserved at `54.251.69.243`

Vercel's live verifier returned `configured_correctly` and `verified:true` for
both `ipo.one` and `www.ipo.one`. It accepted the existing `www -> ipo.one`
chain, so no unnecessary third GoDaddy mutation was made. Certificate
`cert_kIsDJy71Q78FCMG88nTi6zS3` covers both names, expires in approximately 90
days, and has automatic renewal enabled.

## Public acceptance

| Request | Result |
| --- | --- |
| `GET https://ipo.one/` | HTTP 200; real Chrome rendered `IPO.ONE Product Workspace` |
| `GET https://ipo.one/livez` | HTTP 200; exact release; `status: alive` |
| `GET https://ipo.one/readyz` | HTTP 200; `status: ready`; `realFundsEnabled:false` |
| `GET https://ipo.one/.well-known/ipo-one.json` | HTTP 200; zero-funded support; activation disabled |
| `GET https://ipo.one/agent-openapi.json` | HTTP 200; versioned remote Agent contract |
| `GET https://www.ipo.one/` | HTTP 308 to `https://ipo.one/` |

The real-browser page visibly presented Human, Agent, Capital Partner and
Developer/API entry modes, with the no-real-funds banner and sign-in gate.

## Runtime and value boundary

A Vercel production Cron request returned HTTP 200 for the exact release with
one outbox delivery, `reconciliationStatus: passed` and
`realFundsEnabled:false`.

The public capability document reports:

- `supportStatus: SUPPORTED_INACTIVE_ZERO_FUNDED`
- `activationStatus: DISABLED`
- `realFundsEnabled:false`
- `productionFundsMoved:false`
- Provider sandbox `AVAILABLE`
- external Provider execution `DISABLED`
- generic EVM and HyperCore production execution `BLOCKED_EXTERNAL_DEPENDENCY`
- production signer, withdrawal and Venue-write authority disabled

No production funds moved. Provider execution, a production signer and every
real-value activation input remain separately gated.

## Tests and rollback

The exact release passed the focused 24-test suite, 33 security tests, 76
transport tests, 5 Provider tests, lint, typecheck, deployment, Vercel sandbox,
Provider selection, OpenAPI, Tenant protocol, product traceability and diff
checks before promotion.

Rollback is the corresponding previous Primary/Risk deployment plus restoring
the apex A record to `136.68.214.66` and removing the additional Vercel apex A
record. Mail, nameserver and unrelated records require no rollback because they
were not changed.
