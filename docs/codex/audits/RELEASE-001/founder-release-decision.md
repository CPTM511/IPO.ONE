# RELEASE-001 Founder release decision

Decision status: `ACCEPTED_AS_IMPLEMENTED_UNVERIFIED`

Accepted at: `2026-07-26T12:31:18.000Z`

Release owner: `IPO.ONE Founder`

Candidate implementation identity:
`0x88b8fccd24a4ecab4d3e2ba90bfed0fab641773398c1ea9cbe8ecd0f978c895d`

Baseline commit:
`de5e72d5a912d2d55c2ce86570408f37c07d4a4f`

Acceptance matrix SHA-256:
`1260226d1316bea2f6894acef15c725300b8bd9e9e2fae3a012b7d0e85e9a381`

## Recommended verdict

`ACCEPT_RELEASE_001_AS_IMPLEMENTED_UNVERIFIED`

This verdict means:

- accept the complete private no-funds V9 + V10 product evidence;
- accept the protected Hyperliquid Testnet implementation as
  `IMPLEMENTED_UNVERIFIED`, not as live Exchange-validated;
- accept the Founder process waiver for external-review evidence collection as
  a disclosed `UNVERIFIED` row, not as `PASS`;
- permit only the successor decision-package task after this task stops;
- keep launch policy, mainnet, real funds, production custody, API Wallet,
  privileged signer, Exchange write, withdrawal, transfer, deployment, and
  real-value authority locked.

## Known unverified items accepted by this verdict

1. no independently attributable external review report or attestation is
   attached;
2. no Founder-controlled Hyperliquid Testnet master/subaccount pair or non-empty
   history is verified;
3. no real API Wallet, signed order, fill, reduce-only/flatten, funding,
   settlement, recovery, signer rotation, or key-destruction E2E is verified;
4. no external screen-reader or formal WCAG conformance review is attached; and
5. one P2 remains open:
   `TC403-REV-P2-002 runtime_alert_provenance_not_composed`.

## Founder response

To accept, use the exact statement:

`接受 RELEASE-001 为 IMPLEMENTED_UNVERIFIED，确认矩阵 SHA-256=1260226d1316bea2f6894acef15c725300b8bd9e9e2fae3a012b7d0e85e9a381；保留所有 UNVERIFIED、P2 和真实资金/主网/签名器/Exchange 写入/部署锁；仅解锁下一项决策包任务。`

To reject, identify the exact matrix row and required remediation.

No response, “继续”, or acceptance of an earlier task is a RELEASE-001
verdict.

## Recorded Founder verdict

The Founder supplied the exact acceptance statement and confirmed the exact
matrix SHA-256:

`接受 RELEASE-001 为 IMPLEMENTED_UNVERIFIED，确认矩阵 SHA-256=1260226d1316bea2f6894acef15c725300b8bd9e9e2fae3a012b7d0e85e9a381；保留所有 UNVERIFIED、P2 和真实资金/主网/签名器/Exchange 写入/部署锁；解锁下一项决策包任务。`

Recorded effect:

- RELEASE-001 is accepted only at `IMPLEMENTED_UNVERIFIED`;
- all `UNVERIFIED` rows and the open P2 remain open;
- real funds, mainnet, signer, Exchange write, and deployment remain locked;
- `REALVALUE-001` decision-package preparation is unlocked; and
- no real-value approval, launch-policy change, provisioning, deployment, or
  funds authority is created.
