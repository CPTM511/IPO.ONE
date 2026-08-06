# IPO.ONE Vercel Sandbox Environment Variables

## Rules

Apply these variables only to the Vercel `production` targets used by the M1-B
Sandbox. The primary and Risk projects use distinct public origins and identity
configurations while sharing the same least-privilege PostgreSQL URLs and
cryptographic reference/encryption keys. Do not commit values, print values in
logs, include values in evidence, or expose values to browser code. Enable
Vercel system environment variables.

Every secret value must be generated independently. Secret references contain
the variable name and SHA-256 digest, never the secret value:

```text
vercel://environment/production/VARIABLE_NAME@sha256:<64 lowercase hex>
```

The runtime verifies that each reference digest matches the exact deployed
value and fails closed on drift.

## Vercel-provided variables

| Name | Required value or constraint |
| --- | --- |
| `VERCEL` | `1` |
| `VERCEL_ENV` | `production` |
| `VERCEL_TARGET_ENV` | `production` |
| `VERCEL_URL` | Unique deployment hostname; supplied by Vercel |
| `VERCEL_PROJECT_PRODUCTION_URL` | Stable project hostname; supplied by Vercel |
| `VERCEL_DEPLOYMENT_ID` | Deployment identifier; evidence-only |
| `VERCEL_PROJECT_ID` | Must match the approved project |

## Non-secret application variables

| Name | Required value or constraint |
| --- | --- |
| `NODE_ENV` | `production` |
| `IPO_ONE_DEPLOYMENT_PROFILE` | `vercel_sandbox` |
| `IPO_ONE_DEPLOYMENT_MODE` | `vercel_sandbox` |
| `IPO_ONE_VERCEL_PROJECT_ROLE` | `primary` on `ipo-one-internal`; `risk` on `ipo-one-internal-risk` |
| `IPO_ONE_NO_REAL_FUNDS_ACK` | `I_UNDERSTAND_DEPLOYABLE_SANDBOX_NO_REAL_FUNDS` |
| `IPO_ONE_PUBLIC_ORIGIN` | Exact project-specific `https://${VERCEL_PROJECT_PRODUCTION_URL}` |
| `IPO_ONE_TENANT_ID` | Exact seeded sandbox Tenant |
| `IPO_ONE_SYSTEM_ACTOR_ID` | Exact seeded system worker Actor |
| `IPO_ONE_POLICY_VERSION` | Exact reviewed policy version |
| `IPO_ONE_RELEASE_ID` | Exact deployed 40-character Git commit SHA |
| `IPO_ONE_SANDBOX_AGENT_ACCOUNT_ADDRESS` | Primary project only: exact reviewed public test-chain Agent EVM address used for account-proof requests; never a private key or signer |
| `IPO_ONE_AUTHENTICATION_MODE` | `closed_pilot` |
| `IPO_ONE_IDP_DEPLOYMENT_APPROVAL` | `APPROVED` |
| `IPO_ONE_IDP_VENDOR_ID` | `wallet_only` |
| `IPO_ONE_IDP_DEPLOYMENT_APPROVAL_SHA` | Exact commit containing this approved deployment boundary |

## Secret variables

| Name | Purpose | Browser exposure |
| --- | --- | --- |
| `IPO_ONE_GATEWAY_DATABASE_URL` | Neon pooled URL for the least-privilege Gateway role | Prohibited |
| `IPO_ONE_AUTH_DATABASE_URL` | Neon pooled URL for the least-privilege authentication role | Prohibited |
| `IPO_ONE_AUTH_REFERENCE_HASH_KEY` | Random 32-64 byte base64url reference hashing key | Prohibited |
| `IPO_ONE_AUTH_ENCRYPTION_KEY` | Independent random 32-64 byte base64url session/transaction encryption key | Prohibited |
| `IPO_ONE_IDENTITY_CONFIG_JSON` | Minified reviewed wallet-only identity configuration v2 with public workload JWKS | Prohibited |
| `CRON_SECRET` | Primary project only; independent random credential of at least 16 characters | Prohibited |

## Immutable secret-reference variables

| Name | Must bind |
| --- | --- |
| `IPO_ONE_IDP_CONFIGURATION_REF` | `IPO_ONE_IDENTITY_CONFIG_JSON` |
| `IPO_ONE_AUTH_REFERENCE_HASH_KEY_REF` | `IPO_ONE_AUTH_REFERENCE_HASH_KEY` |
| `IPO_ONE_AUTH_ENCRYPTION_KEY_REF` | `IPO_ONE_AUTH_ENCRYPTION_KEY` |

`IPO_ONE_OIDC_CLIENT_SECRET` and
`IPO_ONE_OIDC_CLIENT_CREDENTIAL_REF` are absent in the wallet-only profile.

## Project-specific identity binding

The primary identity configuration binds the Founder wallet to the Principal
Controller credential and sets the Agent workload audience to the primary
origin. The Risk identity configuration binds the same invited wallet to the
Risk Operator credential through a different issuer/client tuple. Both
configurations contain the same reviewed public workload JWKS and no private
key material.

The primary project also renders `IPO_ONE_SANDBOX_AGENT_ACCOUNT_ADDRESS` as a
public account-proof input. The Risk project must not define it. This value is
non-authorizing and contains no private key, signature, transaction capability,
or funds authority.

The workload private key is held only by the external Golden Flow runner. It is
an authentication key for short-lived access JWT and DPoP proof signatures; it
has no transaction, transfer, withdrawal, custody, or venue-write authority.
No variable containing that private key may be added to either Vercel project.

## Prohibited variables

Do not configure any fee key, mainnet RPC, workload private key, private
transaction key, evidence
attestor key, provider signer, venue signer, withdrawal credential, custody
credential, real-funds acknowledgement, local-test authentication mode, owner
database URL, migration credential, or bootstrap credential in Vercel runtime
Functions.

## Validation

Run before deployment:

```bash
pnpm run check:vercel-sandbox
```

After configuring Vercel, pull values only into an owner-only temporary path,
validate names and digests without printing values, then delete the temporary
file. A missing, extra, preview-scoped, digest-drifted, or origin-drifted value
blocks readiness.
