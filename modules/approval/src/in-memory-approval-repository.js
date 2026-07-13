import { hashId } from "../../../packages/domain/src/index.js";
import { ApprovalProjectionType } from "./approval-constants.js";
import {
  approvalError,
  assertApprovalIdentifier,
  assertApprovalShape,
  cloneApproval,
  deepFreezeApproval
} from "./approval-utils.js";

const ID_FIELDS = Object.freeze({
  [ApprovalProjectionType.APPROVAL_PROPOSAL]: "approvalProposalId",
  [ApprovalProjectionType.APPROVAL_DECISION]: "approvalDecisionId",
  [ApprovalProjectionType.APPROVAL_EXECUTION]: "approvalExecutionId",
  [ApprovalProjectionType.BREAK_GLASS_INCIDENT]: "breakGlassIncidentId",
  [ApprovalProjectionType.BREAK_GLASS_CUSTODIAN_DECISION]: "breakGlassCustodianDecisionId",
  [ApprovalProjectionType.BREAK_GLASS_REVIEW]: "breakGlassReviewId"
});
const MUTABLE_PROJECTIONS = new Set([
  ApprovalProjectionType.APPROVAL_PROPOSAL,
  ApprovalProjectionType.BREAK_GLASS_INCIDENT
]);

function streamKey(type, id) {
  return `${type}\0${id}`;
}

function projectionKey(type, id) {
  return `${type}\0${id}`;
}

export class InMemoryApprovalRepository {
  #commands = new Map();
  #events = [];
  #streamVersions = new Map();
  #projections = new Map();

  async findCommand({ idempotencyKey, commandHash }) {
    const command = this.#commands.get(assertApprovalIdentifier("idempotencyKey", idempotencyKey));
    if (!command) return undefined;
    if (command.commandHash !== commandHash) {
      throw approvalError("approval_idempotency_conflict", "approval idempotency key was reused");
    }
    return cloneApproval(command.result);
  }

  async commitCommand({
    aggregateType,
    aggregateId,
    idempotencyKey,
    commandHash,
    events,
    writes,
    response
  }) {
    for (const [name, value] of Object.entries({
      aggregateType,
      aggregateId,
      idempotencyKey,
      commandHash
    })) {
      assertApprovalIdentifier(name, value);
    }
    const replay = await this.findCommand({ idempotencyKey, commandHash });
    if (replay) return replay;
    if (!Array.isArray(events) || events.length === 0 || !Array.isArray(writes) || writes.length === 0) {
      throw approvalError("invalid_approval_repository_input", "approval command is empty");
    }

    const nextVersions = new Map(this.#streamVersions);
    const committedVersions = [];
    for (const descriptor of events) {
      assertApprovalShape("approval event descriptor", descriptor, {
        required: ["aggregateType", "aggregateId", "expectedVersion", "event"]
      });
      const key = streamKey(descriptor.aggregateType, descriptor.aggregateId);
      const current = nextVersions.get(key) ?? 0;
      if (descriptor.expectedVersion !== current) {
        throw approvalError("stale_aggregate_version", "approval aggregate changed since it was read");
      }
      nextVersions.set(key, current + 1);
      committedVersions.push(current + 1);
    }

    const nextProjections = new Map(this.#projections);
    const writeKeys = new Set();
    for (const write of writes) {
      if (!write || !Object.hasOwn(ID_FIELDS, write.type) || !write.value) {
        throw approvalError("unsupported_approval_projection", "approval projection is invalid");
      }
      const id = write.value[ID_FIELDS[write.type]];
      assertApprovalIdentifier(ID_FIELDS[write.type], id);
      const key = projectionKey(write.type, id);
      if (writeKeys.has(key)) {
        throw approvalError("duplicate_approval_projection", "approval projection is duplicated");
      }
      writeKeys.add(key);
      const existing = nextProjections.get(key);
      if (
        existing &&
        MUTABLE_PROJECTIONS.has(write.type) &&
        write.value.version !== existing.version + 1
      ) {
        throw approvalError("stale_approval_proposal", "approval proposal version is stale");
      }
      if (existing && !MUTABLE_PROJECTIONS.has(write.type)) {
        if (hashId("approval_projection", existing) !== hashId("approval_projection", write.value)) {
          throw approvalError("approval_projection_conflict", "immutable approval projection changed");
        }
      }
      nextProjections.set(key, deepFreezeApproval(cloneApproval(write.value)));
    }

    const committedEvents = events.map((descriptor, index) => deepFreezeApproval({
      ...cloneApproval(descriptor.event),
      aggregateType: descriptor.aggregateType,
      aggregateId: descriptor.aggregateId,
      aggregateVersion: committedVersions[index]
    }));
    const result = deepFreezeApproval({
      event: cloneApproval(committedEvents[0]),
      events: cloneApproval(committedEvents),
      response: cloneApproval(response),
      replayed: false
    });
    this.#streamVersions = nextVersions;
    this.#projections = nextProjections;
    this.#events.push(...committedEvents);
    this.#commands.set(idempotencyKey, deepFreezeApproval({ commandHash, result }));
    return cloneApproval(result);
  }

  async getApprovalProposal(proposalId) {
    return this.#get(ApprovalProjectionType.APPROVAL_PROPOSAL, proposalId);
  }

  async listApprovalDecisions(proposalId) {
    assertApprovalIdentifier("proposalId", proposalId);
    return [...this.#projections.entries()]
      .filter(([key, value]) =>
        key.startsWith(`${ApprovalProjectionType.APPROVAL_DECISION}\0`) &&
        value.approvalProposalId === proposalId
      )
      .map(([, value]) => cloneApproval(value))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async getApprovalExecutionByProposal(proposalId) {
    assertApprovalIdentifier("proposalId", proposalId);
    const match = [...this.#projections.entries()].find(([key, value]) =>
      key.startsWith(`${ApprovalProjectionType.APPROVAL_EXECUTION}\0`) &&
      value.approvalProposalId === proposalId
    );
    return match ? cloneApproval(match[1]) : undefined;
  }

  async getBreakGlassIncident(incidentId) {
    return this.#get(ApprovalProjectionType.BREAK_GLASS_INCIDENT, incidentId);
  }

  async listBreakGlassCustodianDecisions(incidentId) {
    assertApprovalIdentifier("incidentId", incidentId);
    return [...this.#projections.entries()]
      .filter(([key, value]) =>
        key.startsWith(`${ApprovalProjectionType.BREAK_GLASS_CUSTODIAN_DECISION}\0`) &&
        value.breakGlassIncidentId === incidentId
      )
      .map(([, value]) => cloneApproval(value))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async getBreakGlassReview(incidentId) {
    assertApprovalIdentifier("incidentId", incidentId);
    const match = [...this.#projections.entries()].find(([key, value]) =>
      key.startsWith(`${ApprovalProjectionType.BREAK_GLASS_REVIEW}\0`) &&
      value.breakGlassIncidentId === incidentId
    );
    return match ? cloneApproval(match[1]) : undefined;
  }

  listEvents(filter = {}) {
    return this.#events.filter((event) => Object.entries(filter).every(
      ([key, value]) => value === undefined || event[key] === value
    )).map(cloneApproval);
  }

  async #get(type, id) {
    const value = this.#projections.get(projectionKey(type, assertApprovalIdentifier("id", id)));
    return value ? cloneApproval(value) : undefined;
  }
}
