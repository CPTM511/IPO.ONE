import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { parseStrictJson } from "../modules/authentication/src/strict-json.js";

const requireFromApiContract = createRequire(
  new URL("../packages/api-contract/package.json", import.meta.url)
);
const Ajv2020 = requireFromApiContract("ajv/dist/2020").default;
const MAXIMUM_ATTESTATION_BYTES = 64 * 1024;
const MAXIMUM_REPORT_BYTES = 4 * 1024 * 1024;
const REVIEW_MAXIMUM_AGE_MS = 720 * 60 * 60 * 1_000;
const SHA = /^[a-f0-9]{40}$/;
const ZERO_SHA = "0".repeat(40);
const ZERO_DIGEST = `sha256:${"0".repeat(64)}`;
const SOURCE_PATHS = Object.freeze({
  oracleAdapter: "contracts/src/m2/IpoOnePriceOracleAdapterV1.sol",
  securedPool: "contracts/src/m2/IpoOneSecuredPoolV1.sol",
  securedPoolMath: "contracts/src/m2/libraries/SecuredPoolMathV1.sol"
});

export class M2A008IndependentReviewError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = "M2A008IndependentReviewError";
    this.issues = issues;
  }
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function readBoundedRegularFile(path, maximumBytes, label) {
  const absolutePath = resolve(path);
  let stats;
  try {
    stats = await lstat(absolutePath);
  } catch {
    throw new M2A008IndependentReviewError(`${label} could not be read.`);
  }
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.size < 1 ||
    stats.size > maximumBytes
  ) {
    throw new M2A008IndependentReviewError(
      `${label} must be one bounded regular non-symlink file.`
    );
  }
  return readFile(absolutePath);
}

function immutableReportUrl(value) {
  if (typeof value !== "string") return false;
  if (/^ipfs:\/\/[A-Za-z0-9]+(?:\/|$)/.test(value)) return true;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.pathname.split("/").some((segment) => SHA.test(segment))
    );
  } catch {
    return false;
  }
}

async function currentSourceDigests(rootDirectory) {
  const entries = await Promise.all(
    Object.entries(SOURCE_PATHS).map(async ([id, path]) => [
      id,
      sha256(await readFile(resolve(rootDirectory, path)))
    ])
  );
  return Object.freeze(Object.fromEntries(entries));
}

function dateMillis(value) {
  const milliseconds = new Date(value).getTime();
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export async function verifyM2A008IndependentReview(attestation, {
  expectedCommitSha,
  reportBytes,
  rootDirectory = process.cwd(),
  now = new Date()
}) {
  const schema = JSON.parse(await readFile(
    new URL(
      "../schemas/v2/m2a-008-independent-contract-review.schema.json",
      import.meta.url
    ),
    "utf8"
  ));
  const validate = new Ajv2020({
    allErrors: true,
    strict: true,
    validateFormats: false
  }).compile(schema);
  const issues = [];
  if (!validate(attestation)) {
    issues.push(...validate.errors.map((error) =>
      `${error.instancePath || "/"} ${error.message}`
    ));
  }
  if (!SHA.test(expectedCommitSha ?? "") || expectedCommitSha === ZERO_SHA) {
    issues.push("expected release SHA must be one non-zero 40-character git SHA");
  }
  if (attestation?.release?.commitSha !== expectedCommitSha) {
    issues.push("reviewed release SHA does not match the expected release SHA");
  }
  const sourceDigests = await currentSourceDigests(rootDirectory);
  for (const [id, digest] of Object.entries(sourceDigests)) {
    if (attestation?.release?.sourceSha256?.[id] !== digest) {
      issues.push(`${id} source digest does not match the reviewed source`);
    }
  }
  if (
    !["approved", "approved_with_resolved_findings"].includes(
      attestation?.review?.conclusion
    )
  ) {
    issues.push("independent review conclusion must be approved");
  }
  const findings = attestation?.review?.findingSummary;
  if (
    findings?.openCritical !== 0 ||
    findings?.openHigh !== 0 ||
    findings?.resolved > findings?.total
  ) {
    issues.push("independent review must have no open critical/high finding");
  }
  const completedAtMs = dateMillis(attestation?.review?.completedAt);
  const nowMs = now instanceof Date ? now.getTime() : Number.NaN;
  if (
    completedAtMs === null ||
    !Number.isFinite(nowMs) ||
    completedAtMs > nowMs ||
    nowMs - completedAtMs > REVIEW_MAXIMUM_AGE_MS
  ) {
    issues.push("independent review is invalid, future-dated or older than 720 hours");
  }
  if (!immutableReportUrl(attestation?.review?.reportUrl)) {
    issues.push("review report URL must be IPFS or HTTPS with an immutable 40-character revision");
  }
  if (
    !Buffer.isBuffer(reportBytes) ||
    reportBytes.length < 1 ||
    attestation?.review?.reportSha256 === ZERO_DIGEST ||
    sha256(reportBytes) !== attestation?.review?.reportSha256
  ) {
    issues.push("review report bytes do not match the non-zero attested SHA-256 digest");
  }
  if (
    /PENDING/i.test(attestation?.reviewer?.name ?? "") ||
    /PENDING/i.test(attestation?.reviewer?.organizationOrIndependentCapacity ?? "") ||
    attestation?.review?.methods?.some((method) => /PENDING/i.test(method))
  ) {
    issues.push("independent reviewer identity, capacity and methods must be final");
  }
  if (issues.length > 0) {
    throw new M2A008IndependentReviewError(
      "M2A-008 independent review Evidence is invalid.",
      issues
    );
  }
  const completedAt = new Date(completedAtMs);
  return Object.freeze({
    schemaVersion: "m2a_008_independent_review_gate_result.v1",
    gate: Object.freeze({
      id: "independent_contract_review",
      status: "approved",
      ownerRole: "Independent Security",
      approvedBy: attestation.reviewer.name,
      approvedAt: completedAt.toISOString(),
      expiresAt: new Date(completedAtMs + REVIEW_MAXIMUM_AGE_MS).toISOString(),
      evidenceUrl: attestation.review.reportUrl
    }),
    reviewId: attestation.reviewId,
    releaseCommitSha: expectedCommitSha,
    reportSha256: attestation.review.reportSha256,
    sourceSha256: sourceDigests,
    testAssetsOnly: true,
    mainnetAuthorized: false,
    realFundsAuthorized: false
  });
}

function usage() {
  return [
    "Usage:",
    "  pnpm run testnet:m2a008:review:verify -- --attestation <json> \\",
    "    --report <review-report> --expected-sha <40-character-git-sha>",
    "",
    "This command validates Independent Security Evidence; it does not deploy."
  ].join("\n");
}

async function runCli() {
  let values;
  try {
    const args = process.argv.slice(2);
    if (args[0] === "--") args.shift();
    ({ values } = parseArgs({
      args,
      allowPositionals: false,
      strict: true,
      options: {
        attestation: { type: "string" },
        report: { type: "string" },
        "expected-sha": { type: "string" }
      }
    }));
  } catch (error) {
    throw new M2A008IndependentReviewError(error.message);
  }
  if (!values.attestation || !values.report || !values["expected-sha"]) {
    throw new M2A008IndependentReviewError(usage());
  }
  const [attestationBytes, reportBytes] = await Promise.all([
    readBoundedRegularFile(
      values.attestation,
      MAXIMUM_ATTESTATION_BYTES,
      "Independent review attestation"
    ),
    readBoundedRegularFile(
      values.report,
      MAXIMUM_REPORT_BYTES,
      "Independent review report"
    )
  ]);
  let attestation;
  try {
    attestation = parseStrictJson(attestationBytes.toString("utf8"), {
      maximumBytes: MAXIMUM_ATTESTATION_BYTES,
      maximumDepth: 10,
      maximumKeys: 128
    });
  } catch {
    throw new M2A008IndependentReviewError(
      "Independent review attestation must contain one bounded strict JSON object."
    );
  }
  const result = await verifyM2A008IndependentReview(attestation, {
    expectedCommitSha: values["expected-sha"],
    reportBytes
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  runCli().catch((error) => {
    if (error instanceof M2A008IndependentReviewError) {
      console.error(error.message);
      for (const issue of error.issues.slice(0, 50)) console.error(`- ${issue}`);
      if (error.message !== usage() && error.issues.length === 0) {
        console.error(usage());
      }
      process.exitCode = 1;
      return;
    }
    throw error;
  });
}
