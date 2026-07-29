# IPO.ONE temporary Vercel internal-test deployment

This target publishes only the public, synthetic, no-real-funds sandbox. It
does not publish the PostgreSQL closed pilot, private Tenant data, a production
identity provider, real credit, mainnet funds, Hyperliquid Exchange writes, or
an API Wallet.

`api/index.mjs` is bundled locally from the reviewed root entrypoint before
upload. `apps/web/src` and the public OpenAPI document are included as
read-only runtime files. The temporary bundle uses Node 26 and has no runtime
package installation.

The public sandbox keeps bounded process-local sessions. Vercel Functions may
replace an instance at any time, so internal testers must treat reset state as
ephemeral and must not enter private or irreplaceable data.

The production `ipo.one` domain is intentionally not attached to this target.
Use the generated `vercel.app` URL until a separately reviewed formal launch.
