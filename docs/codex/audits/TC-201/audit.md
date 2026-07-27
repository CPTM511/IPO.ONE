# TC-201 Audit

Status: `IMPLEMENTED_UNVERIFIED`  
Completed at: `2026-07-25T10:33:18.616Z`  
Repository: `/Users/cptmao/Documents/IPO.ONE`  
Branch: `codex/commercial-access-release`  
Source commit: `de5e72d5a912d2d55c2ce86570408f37c07d4a4f`  
Task boundary: TC-201 only

## Result

TC-201 adds one fixed, signer-free Hyperliquid Testnet Info read adapter. It
does not integrate the adapter into a Tenant operation or mutate product
state. `userRole` is always queried first. Only a returned `user` for a
requested master or a returned `subAccount` with a valid master address for a
requested subaccount can proceed. `agent`, `vault`, `missing`, malformed, and
role-mismatched results fail closed before positions, orders, fills, equity, or
subaccount discovery are queried.

The remaining read allowlist is:

- `clearinghouseState`;
- `frontendOpenOrders`;
- `userFillsByTime` with a maximum 24-hour requested window; and
- `subAccounts` for a verified master role only.

There is no Exchange action, signer, API wallet, key, credential, dynamic
origin, proxy, mainnet origin, browser integration, account-binding claim, or
state mutation.

## Changed files

New TC-201 files:

- `modules/hyperliquid-info/src/index.js`
- `modules/hyperliquid-info/README.md`
- `modules/hyperliquid-info/test/fixtures/official-info-responses.v1.json`
- `modules/hyperliquid-info/test/hyperliquid-info-adapter.test.js`
- `modules/hyperliquid-info/test-live/hyperliquid-testnet-info.contract.mjs`
- `schemas/v2/hyperliquid-info-account-snapshot.schema.json`
- `docs/codex/audits/TC-201/pre-change-mapping.md`
- `docs/codex/audits/TC-201/live-testnet-info-evidence.json`
- `docs/codex/audits/TC-201/audit.md`

Shared files with TC-201 hunks:

- `package.json`: adds the explicitly gated live contract-test command.
- `scripts/check-schemas.mjs`: makes the snapshot schema required.
- `security/test/gateway-security.test.mjs`: adds the static read-plane
  security regression.
- `docs/codex/audits/TC-104/audit.md`: records Founder acceptance and unlocks
  TC-201 only.

No dependency or lockfile change was introduced by TC-201.

Primary artifact hashes:

| Artifact | SHA-256 |
| --- | --- |
| `modules/hyperliquid-info/src/index.js` | `946eaa7d9511a704a13396dee23fab8b0493cdbd437f81c29454b77d64d65dd3` |
| `modules/hyperliquid-info/test/hyperliquid-info-adapter.test.js` | `79a88c9e195c2a78325e3d355ec4db1dda5d9ef1c22344e9f7d57a3220dbe3b7` |
| `modules/hyperliquid-info/test/fixtures/official-info-responses.v1.json` | `521fda222da3886186f6bee1131d1f182fec691fa5c01324ad3e4ea315f0747b` |
| `modules/hyperliquid-info/test-live/hyperliquid-testnet-info.contract.mjs` | `e980cffc8822e3de5101a9b56b178b5f4a7bf5a16572077f6414013b236e3742` |
| `modules/hyperliquid-info/README.md` | `45cfd5a76c323c2168e0999d1124d14594362a4fef6ed72d1e11ed37c49b07ec` |
| `schemas/v2/hyperliquid-info-account-snapshot.schema.json` | `f72425e40a6640aef16532084f80897b94bdd266d9f283e5c3e5a4dde1a15d7d` |

## Contracts and provenance

`hyperliquid_info_account_snapshot.v1` is a closed JSON Schema. Every
successful snapshot carries:

- fixed profile, Testnet origin, path, method, and exact query types;
- hashed requested and verified-master addresses, never a raw address;
- verified account role;
- observation and venue times, 15-second freshness classification, and
  staleness ceiling;
- per-response hashes, bundle hash, and normalized snapshot hash;
- bounded normalized equity, positions, open orders, fills, and subaccounts;
  and
- explicit non-authorizing, no-funds, no-credentials, no-signer, no-Exchange,
  no-PII, and no-secret safety flags.

The recorded fixture carries official documentation URLs and official response
shapes. It is documentation-derived test data, not live account Evidence.

The live probe used the public non-binding zero address only to exercise the
approved profile. Testnet returned role `user` and an empty snapshot. The
checked-in receipt contains only hashes and counts. It does not claim account
ownership, account binding, funding, or production readiness.

## Security proof

- Origin/path/method are source constants:
  `POST https://api.hyperliquid-testnet.xyz/info`.
- Request bodies are internally constructed from five typed query branches.
  Callers cannot submit a URL, method, header, raw query type, or arbitrary
  body.
- `userRole` precedes every account-data query and prevents an `agent`
  (API-wallet) address from being treated as a master or subaccount.
- Fetch uses `credentials: "omit"`, `redirect: "error"`,
  `referrerPolicy: "no-referrer"`, JSON-only content types, and an abort
  timeout no greater than three seconds.
- Responses are limited to 1 MiB and strict JSON parsing rejects malformed
  input, duplicate object keys, more than 64 nesting levels, or more than
  20,000 keys.
- Normalized collections are capped at 200 positions, 200 orders, 500 fills,
  and 100 subaccounts. Fill requests are capped at 24 hours.
- Retries are capped at two attempts and only cover timeouts, rate limiting,
  transport failure, and 5xx responses. Cache TTL is at most 10 seconds,
  outbound calls are capped at 20 per minute, and the circuit opens after a
  bounded failure threshold.
- Static security tests reject the mainnet host, `/exchange`, authorization
  headers, private keys, signing/transfer action names, environment credential
  reads, and low-level network escape modules.

## Migrations, catalog, AuthZ, admission, and state

- Migrations: none.
- Tenant protocol catalog: unchanged at 71 operations.
- Trading Capital local no-funds catalog: unchanged at 25/25.
- AuthZ/admission/approval/abuse policy: no new operation or permission.
- PostgreSQL/Ledger/Event/outbox/reconciliation: no mutation and no change.
- Product traceability deliberately remains `REAL_TESTNET_READ=0`: TC-201 is
  an isolated adapter contract, not a callable product action. TC-202 remains
  responsible for human-reviewed account binding and Evidence import.

## Verification

PASS:

1. `npx -y node@24.18.0 --test modules/hyperliquid-info/test/hyperliquid-info-adapter.test.js`
   - 7/7 passed.
   - Covers fixed profile, official fixtures, master/subaccount role
     verification, API-wallet denial, exact bodies, cache, retry, timeout,
     request budget, circuit, malformed/duplicate JSON, oversized responses,
     partial responses, collection limits, provenance, schema validation, and
     raw-address omission.
2. `npx -y node@24.18.0 /opt/homebrew/bin/pnpm run test:security`
   - 25/25 passed.
3. `IPO_ONE_APPROVE_HYPERLIQUID_TESTNET_READ=TC-201 npx -y node@24.18.0 /opt/homebrew/bin/pnpm run test:hyperliquid-info:live`
   - 1/1 passed.
   - Five fixed no-credential Testnet Info reads; no external write.
   - Evidence: `live-testnet-info-evidence.json`.
4. `npx -y node@24.18.0 /opt/homebrew/bin/pnpm check`
   - Runtime Node `v24.18.0`, pnpm `11.1.3`.
   - Boundary lint passed.
   - 66 Schema contracts passed.
   - OpenAPI passed: 21 paths and 21 operations.
   - 32 ordered migration up/down pairs passed.
   - Deploy, launch, approval, abuse, and operations policies passed.
   - Tenant protocol passed: 71 operations.
   - Product traceability and Web bundle integrity passed.
   - Repository tests: 476/476 passed.

Resolved intermediate failures:

- Two unit assertions expected `userRole` before sorting the actual query list;
  expected order was corrected without changing runtime behavior.
- One cache assertion retained the prior four-query count after the mandatory
  role preflight; it was corrected to five.
- The first hardened live contract expected a non-binding address to return
  `missing`; Testnet returned the documented `user` role. The contract was
  corrected to assert the actual role response, its first-query ordering, and
  the resulting empty read-only snapshot. No safety boundary was weakened.

UNVERIFIED:

- Independent reviewer acceptance of TC-201.
- A Founder-approved real Hyperliquid master address and real subaccount
  binding. This belongs to TC-202.
- Non-empty real-account positions/orders/fills normalization against a bound
  Testnet account.
- Production/mainnet behavior, Exchange writes, API-wallet signing, custody,
  and real funds; all are explicitly out of scope and disabled.

## Rollback

Rollback is code-only and does not require a database action:

1. Remove the nine new TC-201 files listed above.
2. Remove only the TC-201 script, schema-registration, and security-test hunks
   from the four shared files.
3. Re-run `pnpm check`.

Because the worktree contains accepted stacked tasks, do not use a broad reset
or checkout to perform rollback.

## Next task

TC-202 remains `BLOCKED_PENDING_HUMAN_REVIEW`.

This audit does not approve TC-202, bind an account, create credentials, enable
Exchange, submit an order, deploy anything, move funds, or claim production
readiness.

## Founder acceptance

Accepted by: IPO.ONE Founder  
Accepted at: `2026-07-25T10:45:45.462Z`  
Instruction: `接受，继续`

This acceptance closes the TC-201 review gate and unlocks TC-202 only. It does
not authorize an API wallet, Exchange action, order, transfer, credential,
mainnet, real funds, deployment, or any TC-203 successor work.
