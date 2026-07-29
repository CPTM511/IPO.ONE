# WEB-018 — Credit Passport usability and chain-trust UI

Status: Completed locally; not deployed

## Context

The private Human pilot currently renders Credit Passport claim checkboxes with
the global text-input sizing rules. At desktop widths this makes the controls
look broken and obscures the labels. The page also asks the owner to paste
Subject and Credit Intent identifiers already known by the authenticated
application.

The Obligation Evidence table displays server Evidence digests beside a
`Finality` label. Those values are deterministic PostgreSQL-backed Evidence
digests, not EVM transaction hashes, and `finalized` is the Evidence source
state rather than Base Sepolia consensus finality. The current presentation can
therefore be mistaken for a public-chain transaction record.

## Scope

- Restore bounded native checkbox dimensions and an accessible claim-card
  layout.
- Bind the proof issuer to the current authenticated Subject and Credit Intent
  instead of requiring the owner to copy opaque identifiers.
- Keep recovery and verifier tooling available as secondary advanced actions.
- Relabel server Evidence state and digest fields so they cannot be confused
  with chain finality or a BaseScan transaction hash.
- Add a separate Base Sepolia anchor status that remains explicitly
  `Not anchored` until a verified transaction reference exists.
- Preserve every existing Credit Passport operation and no-funds lifecycle
  behavior.

## Non-goals

- No contract deployment, chain write, signer, token, native-value transfer,
  lending capital, custody, or production funds.
- No conversion of an Evidence digest into a fake transaction hash or
  block-explorer link.
- No public or bearer Credit Passport.
- No change to Decision, Offer, Obligation, repayment, Evidence, authorization,
  or Tenant isolation semantics.

## Likely files

- `apps/web/src/index.html`
- `apps/web/src/styles.css`
- `apps/web/src/app.js`
- `apps/web/test/static-ui.test.js`

## Acceptance criteria

1. Credit Passport checkboxes render as bounded checkbox controls and do not
   inherit full-width text-input geometry.
2. Current Subject and Credit Intent fields are read-only and track the
   authenticated Decision source.
3. Proof recovery and verifier operations remain reachable but are visually
   secondary to issue/read/revoke.
4. Obligation UI calls the PostgreSQL value an `Evidence digest (offchain)` and
   the lifecycle value `Server Evidence state`.
5. A separate Base Sepolia card says that no blockchain transaction exists
   while no verified chain reference is present.
6. Existing operation IDs, element IDs, and authenticated handlers remain
   compatible.
7. Web tests, bundle checks, and browser verification pass under Node 26.

## Test commands

```sh
node --test apps/web/test/static-ui.test.js
pnpm run check:web-bundle
pnpm run check
git diff --check
```

## Security checklist

- [x] No private identifier is added to a public URL.
- [x] No offchain digest is presented as an EVM transaction.
- [x] Missing or denied resources remain non-enumerating.
- [x] Credit Passport remains same-Tenant, online-only, expiring, and
      non-authorizing.
- [x] No funds or chain authority is added by this UI issue.

## Local verification

- `node --test apps/web/test/*.test.js`: passed.
- `pnpm run check:web-bundle`: passed.
- Browser verification covered the authenticated Credit Passport empty state,
  explicit action confirmation, cancellation without mutation, and the
  unanchored Obligation state.
- `pnpm check`: passed with 632 tests on Node 26.5.0.
- `git diff --check`: passed.
