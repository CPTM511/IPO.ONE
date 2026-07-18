import {
  expiredCsrfBootstrapCookie,
  expiredSessionCookie
} from "./human-session-store.js";
import { authenticationError } from "./security-utils.js";

export class HumanSessionBff {
  constructor({ sessionStore, credentialRegistry }) {
    if (
      !sessionStore?.authenticate ||
      !sessionStore?.rotate ||
      !sessionStore?.revoke ||
      !sessionStore?.revokeByCredential ||
      !credentialRegistry?.revoke
    ) {
      throw authenticationError(
        "invalid_authentication_configuration",
        "Human session BFF adapters are required"
      );
    }
    this.sessionStore = sessionStore;
    this.credentialRegistry = credentialRegistry;
    Object.freeze(this);
  }

  async authenticateSession(input) {
    return this.sessionStore.authenticate(input);
  }

  async rotateSession(input) {
    return this.sessionStore.rotate(input);
  }

  async logout(input) {
    return Object.freeze({
      revoked: await this.sessionStore.revoke(input),
      clearSessionCookie: expiredSessionCookie(),
      clearCsrfBootstrapCookie: expiredCsrfBootstrapCookie()
    });
  }

  async deprovisionCredential({ credentialId, performedByActorId, reasonCode, now = new Date() }) {
    if (typeof this.credentialRegistry.deprovision === "function") {
      return this.credentialRegistry.deprovision({
        credentialId,
        performedByActorId,
        reasonCode,
        now
      });
    }
    const credential = await this.credentialRegistry.revoke({
      credentialId,
      performedByActorId,
      reasonCode,
      now
    });
    const revokedSessions = await this.sessionStore.revokeByCredential({
      credentialId,
      reasonCode,
      now
    });
    return Object.freeze({ credential, revokedSessions });
  }
}
