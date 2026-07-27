import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve, sep } from "node:path";

const requireFromApiContract = createRequire(
  new URL("../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;
const schema = JSON.parse(
  await readFile(
    new URL(
      "../schemas/v2/real-value-offline-review-attestation.schema.json",
      import.meta.url
    ),
    "utf8"
  )
);

const validate = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false
})
  .addFormat("date-time", {
    type: "string",
    validate(value) {
      return (
        typeof value === "string" &&
        /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value) &&
        Number.isFinite(new Date(value).getTime())
      );
    }
  })
  .compile(schema);

assert.equal(
  schema.properties.reviewer.properties.onlineAccountRequired.const,
  false
);
assert.equal(
  schema.properties.reviewer.properties.identityHeldOfflineBy.const,
  "IPO.ONE Founder"
);
assert.equal(
  schema.properties.sourceRecord.properties.containsSecretOrCredential.const,
  false
);
assert.equal(
  schema.properties.sourceRecord.properties.containsRawPiiInRepository.const,
  false
);
assert.equal(
  schema.properties.approvalEffect.const,
  "NONE_UNTIL_DECISION_PACKAGE_UPDATED_AND_REVALIDATED"
);
for (const authority of Object.values(
  schema.properties.authority.properties
)) {
  assert.equal(authority.const, false);
}

const attestationArgumentIndex = process.argv.indexOf("--attestation");
if (attestationArgumentIndex === -1) {
  console.log(
    "REALVALUE-001 offline review contract is closed, privacy-minimized, account-free, and non-authorizing."
  );
} else {
  assert.equal(
    process.argv.length,
    attestationArgumentIndex + 2,
    "Provide exactly one path after --attestation"
  );
  const repositoryRoot = resolve(
    new URL("..", import.meta.url).pathname
  );
  const reviewDirectory = resolve(
    repositoryRoot,
    "docs/codex/audits/REALVALUE-001/offline-reviews"
  );
  const attestationPath = resolve(
    repositoryRoot,
    process.argv[attestationArgumentIndex + 1]
  );
  assert.ok(
    attestationPath.startsWith(`${reviewDirectory}${sep}`),
    "Offline attestation must be stored under the REALVALUE-001 offline-reviews directory"
  );
  const metadata = await stat(attestationPath);
  assert.equal(metadata.isFile(), true);
  assert.ok(metadata.size > 0 && metadata.size <= 128 * 1024);
  const attestation = JSON.parse(await readFile(attestationPath, "utf8"));
  assert.equal(
    validate(attestation),
    true,
    JSON.stringify(validate.errors, null, 2)
  );
  const reviewedAt = new Date(attestation.reviewedAt).getTime();
  const expiresAt = new Date(attestation.expiresAt).getTime();
  const receivedAt = new Date(
    attestation.founderCustodyReceipt.receivedAt
  ).getTime();
  assert.ok(expiresAt > reviewedAt, "Review expiry must follow review time");
  assert.ok(
    receivedAt >= reviewedAt,
    "Founder cannot receive an opinion before it was reviewed"
  );
  assert.equal(
    new Set(
      attestation.evidenceRefs.map(
        ({ sha256, custodyLocationRef }) =>
          `${sha256}:${custodyLocationRef}`
      )
    ).size,
    attestation.evidenceRefs.length,
    "Evidence references must be unique"
  );
  console.log(
    `${attestation.attestationId} is structurally valid and remains non-authorizing (${attestation.opinion}).`
  );
}
