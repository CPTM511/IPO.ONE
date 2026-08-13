import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  verifyM1BCriticalArtifactContents,
  verifyM1BArtifactFiles,
  verifyM1BCurrentGitSource
} from "../../../scripts/m1-b-acceptance-evidence-files.mjs";
import { M1BAcceptanceEvidenceError } from "../../release-governance/src/m1-b-acceptance-evidence.js";

const SHA = "a".repeat(40);
const TREE = "b".repeat(40);

function artifact(path, content) {
  return {
    id: "artifact_test",
    relativePath: path,
    sha256: createHash("sha256").update(content).digest("hex")
  };
}

function issue(fragment) {
  return (error) =>
    error instanceof M1BAcceptanceEvidenceError &&
    error.issues.some((entry) => entry.includes(fragment));
}

test("artifact verifier opens and hashes a contained regular file", async () => {
  const root = await mkdtemp(join(tmpdir(), "ipo-one-m1-b-evidence-"));
  const content = Buffer.from("durable receipt\n");
  await mkdir(join(root, "receipts"));
  await writeFile(join(root, "receipts", "runtime.json"), content);
  assert.equal(
    await verifyM1BArtifactFiles(
      [artifact("receipts/runtime.json", content)],
      { evidenceRoot: root }
    ),
    true
  );
});

test("artifact verifier rejects missing and tampered files", async () => {
  const root = await mkdtemp(join(tmpdir(), "ipo-one-m1-b-evidence-tamper-"));
  await assert.rejects(
    verifyM1BArtifactFiles(
      [artifact("missing.json", "expected")],
      { evidenceRoot: root }
    ),
    issue("does not exist")
  );
  await writeFile(join(root, "tampered.json"), "actual");
  await assert.rejects(
    verifyM1BArtifactFiles(
      [artifact("tampered.json", "expected")],
      { evidenceRoot: root }
    ),
    issue("SHA-256")
  );
});

test("artifact verifier rejects symlink files and symlink roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "ipo-one-m1-b-evidence-link-"));
  const outside = await mkdtemp(join(tmpdir(), "ipo-one-m1-b-evidence-outside-"));
  await writeFile(join(outside, "receipt.json"), "outside");
  await symlink(join(outside, "receipt.json"), join(root, "receipt.json"));
  await assert.rejects(
    verifyM1BArtifactFiles(
      [artifact("receipt.json", "outside")],
      { evidenceRoot: root }
    ),
    issue("symbolic-link")
  );
  const rootLink = `${root}-link`;
  await symlink(root, rootLink);
  await assert.rejects(
    verifyM1BArtifactFiles([], { evidenceRoot: rootLink }),
    issue("Evidence root")
  );
});

test("Git verifier binds HEAD, tree, and tracked cleanliness", () => {
  const evidence = { source: { commitSha: SHA, treeSha: TREE } };
  const cleanGit = (args) => {
    if (args[0] === "status") return "";
    return args[1] === "HEAD" ? SHA : TREE;
  };
  assert.equal(
    verifyM1BCurrentGitSource(evidence, SHA, {
      root: "/repo",
      git: cleanGit
    }),
    true
  );
  assert.throws(
    () => verifyM1BCurrentGitSource(
      { source: { commitSha: SHA, treeSha: "c".repeat(40) } },
      SHA,
      { root: "/repo", git: cleanGit }
    ),
    issue("treeSha")
  );
  assert.throws(
    () => verifyM1BCurrentGitSource(evidence, SHA, {
      root: "/repo",
      git: (args) => args[0] === "status" ? " M tracked.js" : cleanGit(args)
    }),
    issue("not clean")
  );
});

test("critical artifact verifier binds runtime identity and both Agent phases", async () => {
  const root = await mkdtemp(join(tmpdir(), "ipo-one-m1-b-critical-"));
  const linkage = {
    candidateReleaseId: SHA,
    candidateMarker: `m1b.agent.${SHA}`,
    accountHash: `0x${"1".repeat(64)}`,
    subjectId: "subject_candidate",
    mandateId: "mandate_candidate",
    creditIntentId: "credit_intent_candidate",
    creditOfferId: "credit_offer_candidate",
    obligationId: "obligation_candidate",
    facilityId: "facility_candidate",
    creditLineId: "credit_line_candidate"
  };
  const acceptanceLinkage = {
    ...linkage,
    candidateReleaseId: linkage.candidateReleaseId,
    candidateMarker: linkage.candidateMarker
  };
  const beforeTime = "2026-08-13T11:00:00.000Z";
  const afterTime = "2026-08-13T11:30:00.000Z";
  const documents = {
    release_identity: {
      schemaVersion: "m1_b_local_release_identity.v1",
      releaseId: SHA,
      imageRevision: SHA,
      pilotRevision: SHA,
      workerRevision: SHA,
      postgresBacked: true,
      fixtureHost: false
    },
    before: {
      schemaVersion: "local_agent_reference_acceptance.v1",
      status: "passed",
      acceptanceMode: "before_restart_executed",
      acceptancePhase: "before_restart",
      ...acceptanceLinkage,
      databaseStartedAt: beforeTime,
      sandboxOnly: true,
      productionFundsMoved: false
    },
    application: {
      schemaVersion: "agent_credit_offer_workflow_receipt.v1",
      status: "offer_ready",
      transportProfile: "mcp_stdio_local",
      subjectId: linkage.subjectId,
      mandateId: linkage.mandateId,
      creditIntent: { creditIntentId: linkage.creditIntentId },
      offer: { creditOfferId: linkage.creditOfferId },
      nonAuthorizing: true,
      sandboxOnly: true,
      productionFundsApproved: false,
      fundsAuthority: false,
      credentialsIncluded: false,
      publicEndpointEnabled: false,
      remoteMcpEnabled: false,
      steps: [
        ["ipo_one_read_self", "pilotReadAgentSelf", "tenant_agent_subject_view.v2"],
        ["ipo_one_request_credit", "pilotRequestCredit", "tenant_credit_intent_created.v1"],
        ["ipo_one_read_credit_application", "pilotReadCreditApplication", "tenant_credit_application_view.v2"],
        ["ipo_one_evaluate_credit_application", "pilotEvaluateCreditApplication", "tenant_credit_application_evaluated.v2"]
      ].map(([tool, operationId, responseSchemaVersion], index) => ({
        sequence: index + 1,
        tool,
        operationId,
        requestId: `request-application-${index + 1}`,
        replayed: false,
        responseSchemaVersion
      }))
    },
    runtime: {
      schemaVersion: "local_agent_mcp_transport_receipt.v1",
      status: "evidence_read",
      transportProfile: "mcp_stdio_local",
      registryVersion: "agent_mcp_registry.v2",
      obligationId: linkage.obligationId,
      providerTarget: {
        providerId: "provider_gateway_compute",
        providerCategory: "compute"
      },
      sandboxOnly: true,
      productionFundsMoved: false,
      withdrawable: false,
      fundsAuthority: false,
      credentialsIncluded: false,
      remoteMcpEnabled: false,
      steps: [
        ["pilotAcceptCreditOffer", "ipo_one_accept_credit_offer", "tenant_credit_offer_accepted.v1"],
        ["pilotExecuteSandboxObligation", "ipo_one_execute_sandbox_obligation", "tenant_sandbox_obligation_executed.v1"],
        ["pilotPostSandboxRepayment", "ipo_one_post_sandbox_repayment", "tenant_sandbox_repayment_posted.v1"],
        ["pilotReadOwnObligationEvidence", "ipo_one_read_obligation_evidence", "tenant_owned_obligation_evidence_view.v1"]
      ].map(([operationId, tool, responseSchemaVersion], index) => ({
        sequence: index + 1,
        operationId,
        tool,
        requestId: `request-runtime-${index + 1}`,
        replayed: false,
        responseSchemaVersion
      }))
    },
    after: {
      schemaVersion: "local_agent_reference_acceptance.v1",
      status: "passed",
      acceptanceMode: "after_restart_recovered",
      acceptancePhase: "after_restart",
      ...acceptanceLinkage,
      databaseStartedAt: afterTime,
      sandboxOnly: true,
      productionFundsMoved: false
    },
    recovery: {
      schemaVersion: "local_agent_reference_recovery_receipt.v1",
      status: "recovered",
      subjectId: linkage.subjectId,
      mandateId: linkage.mandateId,
      creditIntentId: linkage.creditIntentId,
      creditOfferId: linkage.creditOfferId,
      obligationId: linkage.obligationId,
      facilityId: linkage.facilityId,
      creditLineId: linkage.creditLineId,
      serverTruth: true,
      canonicalLifecycleReadOnly: true,
      lifecycleMutationPerformed: false,
      sandboxOnly: true,
      productionFundsMoved: false
    }
  };
  const artifacts = [];
  for (const [id, document] of Object.entries(documents)) {
    const content = `${JSON.stringify(document)}\n`;
    await writeFile(join(root, `${id}.json`), content);
    artifacts.push({
      id,
      kind: new Set(["application", "runtime"]).has(id)
        ? "agent_mcp_receipt"
        : id === "release_identity"
          ? "release_identity"
          : "runtime_receipt",
      relativePath: `${id}.json`,
      sha256: createHash("sha256").update(content).digest("hex")
    });
  }
  const evidence = {
    artifacts,
    runtime: {
      local: {
        releaseIdentityArtifactId: "release_identity",
        agentAcceptance: {
          ...acceptanceLinkage,
          schemaVersion: "local_agent_release_acceptance_linkage.v1",
          status: "passed",
          beforeRestart: {
            acceptanceMode: "before_restart_executed",
            databaseStartedAt: beforeTime,
            acceptanceArtifactId: "before",
            applicationMcpArtifactId: "application",
            runtimeMcpArtifactId: "runtime"
          },
          afterRestart: {
            acceptanceMode: "after_restart_recovered",
            databaseStartedAt: afterTime,
            acceptanceArtifactId: "after",
            recoveryReceiptArtifactId: "recovery"
          }
        }
      }
    }
  };
  assert.equal(
    await verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    true
  );

  documents.application.steps[0].operationId = "pilotRequestCredit";
  await writeFile(
    join(root, "application.json"),
    `${JSON.stringify(documents.application)}\n`
  );
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("four-tool")
  );
  documents.application.steps[0].operationId = "pilotReadAgentSelf";
  await writeFile(
    join(root, "application.json"),
    `${JSON.stringify(documents.application)}\n`
  );

  documents.runtime.steps[3].responseSchemaVersion =
    "tenant_sandbox_repayment_posted.v1";
  await writeFile(join(root, "runtime.json"), `${JSON.stringify(documents.runtime)}\n`);
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("Provider-scoped")
  );
  documents.runtime.steps[3].responseSchemaVersion =
    "tenant_owned_obligation_evidence_view.v1";
  await writeFile(join(root, "runtime.json"), `${JSON.stringify(documents.runtime)}\n`);

  documents.after.lifecycle = { mcpReceipt: {} };
  await writeFile(join(root, "after.json"), `${JSON.stringify(documents.after)}\n`);
  await assert.rejects(
    verifyM1BCriticalArtifactContents(evidence, {
      evidenceRoot: root,
      expectedCommitSha: SHA
    }),
    issue("recovery-only")
  );
});
