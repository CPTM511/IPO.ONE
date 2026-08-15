# REALVALUE-001 offline reviewer opinion intake

Use one copy of this form per reviewer opinion. The reviewer does not need a
repository account, wallet, email integration or any other online account.

The signed paper/PDF, meeting minutes or exported message stays with the
IPO.ONE Founder as Evidence custodian. The repository receives only an opaque
reviewer reference, role, decision IDs, opinion, conditions and SHA-256 hashes.
Do not place a legal name, signature image, address, phone number, credential,
private key, reusable wallet signature or raw PII in the repository.

## Founder intake fields

```text
Attestation ID: REALVALUE-001-OFFLINE-___
Opaque reviewer reference: offline_reviewer____
Reviewer role:
Decision IDs reviewed: RV-P0-__
Opinion: APPROVE / REJECT / REVISE_REQUIRED
Conditions, one per line:
Evidence labels and SHA-256 hashes:
Offline source format:
Offline source SHA-256:
Opaque custody location reference:
Reviewed at, exact UTC:
Expires at, exact UTC:
Independence required: yes/no
If required, does the offline source explicitly claim independence: yes/no
Conflicts disclosed in source record: yes/no
Founder received at, exact UTC:
Founder verified source hash: yes/no
Founder confirms faithful transcription: yes/no
```

## Interpretation

- `APPROVE` is the reviewer's recorded opinion, not an immediate product
  authorization.
- `REJECT` keeps the affected decisions locked.
- `REVISE_REQUIRED` keeps the affected decisions locked and must identify the
  required changes.
- Conditional approval remains unresolved until every condition has exact
  Evidence.
- Expired opinions cannot satisfy a P0 gate.
- An independence claim is accepted only as a claim bound to the offline source
  hash until the final human gate validates the reviewer and conflict status.
- The Founder custody receipt proves transcription and Evidence custody; it
  does not replace the reviewer's substantive opinion.

## Machine record

After receiving the completed fields, Codex may transcribe them into
`real_value_offline_review_attestation.v1` and validate the record. Every such
record has:

`approvalEffect=NONE_UNTIL_DECISION_PACKAGE_UPDATED_AND_REVALIDATED`

and all authority flags remain false. No offline opinion alone can modify
`deploy/launch-policy.v1.json`, provision a signer/account, deploy, submit an
Exchange write or move capital.

The resulting JSON is stored under
`docs/codex/audits/REALVALUE-001/offline-reviews/` and checked with:

```sh
npx -y node@24.18.0 scripts/check-realvalue-offline-review-contract.mjs \
  --attestation docs/codex/audits/REALVALUE-001/offline-reviews/<record>.json
```
