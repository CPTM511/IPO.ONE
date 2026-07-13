import { ActorType } from "./constants.js";
import {
  assertExactObjectKeys,
  assertSafeIdentifier,
  authenticationError
} from "./security-utils.js";

const ACTOR_TYPES = new Set(Object.values(ActorType));
const ACTOR_STATUSES = new Set(["active", "suspended", "revoked"]);

export class InMemoryActorDirectory {
  #actors = new Map();

  constructor({ maximumActors = 10_000 } = {}) {
    if (!Number.isSafeInteger(maximumActors) || maximumActors < 1 || maximumActors > 100_000) {
      throw authenticationError("invalid_authentication_configuration", "maximumActors is invalid");
    }
    this.maximumActors = maximumActors;
  }

  register(input) {
    assertExactObjectKeys("actor registration", input, {
      required: ["actorId", "actorType"],
      optional: ["status"]
    });
    const actorId = assertSafeIdentifier("actorId", input.actorId);
    if (!ACTOR_TYPES.has(input.actorType) || !ACTOR_STATUSES.has(input.status ?? "active")) {
      throw authenticationError("invalid_authentication_input", "actor binding is invalid");
    }
    if (this.#actors.has(actorId) || this.#actors.size >= this.maximumActors) {
      throw authenticationError("authentication_actor_conflict", "actor binding cannot be registered");
    }
    const actor = Object.freeze({
      actorId,
      actorType: input.actorType,
      status: input.status ?? "active",
      schemaVersion: "authentication_actor_binding.v1"
    });
    this.#actors.set(actorId, actor);
    return structuredClone(actor);
  }

  setStatus({ actorId, status }) {
    const current = this.#actors.get(actorId);
    if (!current || !["suspended", "revoked"].includes(status)) {
      throw authenticationError("authentication_actor_rejected", "actor is not active");
    }
    if (current.status === status) return structuredClone(current);
    if (current.status === "revoked" || (current.status === "suspended" && status !== "revoked")) {
      throw authenticationError("authentication_actor_rejected", "actor is not active");
    }
    const updated = Object.freeze({ ...current, status });
    this.#actors.set(actorId, updated);
    return structuredClone(updated);
  }

  assertActive({ actorId, actorType }) {
    const actor = this.#actors.get(actorId);
    if (!actor || actor.status !== "active" || actor.actorType !== actorType) {
      throw authenticationError("authentication_actor_rejected", "actor is not active");
    }
    return structuredClone(actor);
  }
}
