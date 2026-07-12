# Plugin Registry

The plugin registry stores and reviews data-only adapter manifests for identity,
KYC/KYP, compliance, payment rails, on/off-ramps, providers, attesters, chains,
and risk services.

Registration validates only the declared contract. Activation is a separate,
audited review action. The registry never loads third-party code and never
stores credentials or raw PII. Capability checks fail unless a manifest is
active and explicitly supports the requested type, capability, schema, and
jurisdiction.

No remote plugin is invoked by this MVP. Production certification, signature
verification, credential vaulting, health checks, timeouts, attestation
validation, and legal/compliance allocation remain future reviewed work.
