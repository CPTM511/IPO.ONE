import { randomBytes } from "node:crypto";
import {
  ActorType,
  ClientAuthenticationMethod,
  InMemoryActorDirectory,
  InMemoryAuthenticationEventStore,
  InMemoryCredentialRegistry,
  SenderConstraintMethod,
  createReferenceHasher
} from "../../../modules/authentication/src/index.js";
import { createAuthenticationContext } from "../../../modules/authentication/src/authentication-context.js";
import {
  AUTHORIZATION_POLICY_VERSION,
  AuthorizationPolicyRegistry,
  PilotCapability,
  RoleBundle
} from "../../../modules/authorization/src/index.js";
import { DEFAULT_PRIVATE_PILOT_PROFILE, assertPrivatePilotProfile } from "./private-pilot-profile.js";

export const LOCAL_PILOT_TENANT_ID = DEFAULT_PRIVATE_PILOT_PROFILE.tenantId;
export const LOCAL_PILOT_RISK_PORTFOLIO_ID = DEFAULT_PRIVATE_PILOT_PROFILE.riskPortfolioId;
export const LOCAL_PILOT_SERVICING_QUEUE_ID = DEFAULT_PRIVATE_PILOT_PROFILE.servicingQueueId;

const IDENTITY_SPECS = Object.freeze({
  borrower: Object.freeze({
    actorId: "actor_human_borrower_pilot",
    actorType: ActorType.HUMAN,
    roleBundle: RoleBundle.HUMAN_BORROWER,
    capabilities: Object.freeze([
      PilotCapability.HUMAN_SUBJECT_CREATE_SELF,
      PilotCapability.SUBJECT_READ_SELF,
      PilotCapability.WORKSPACE_RESUME_SELF,
      PilotCapability.CONSENT_CREATE_SELF,
      PilotCapability.CONSENT_READ_SELF,
      PilotCapability.CONSENT_REVOKE_SELF,
      PilotCapability.IDENTITY_REFERENCE_READ_SELF,
      PilotCapability.CREDIT_REQUEST,
      PilotCapability.CREDIT_READ_SELF,
      PilotCapability.CREDIT_EVALUATE_SELF,
      PilotCapability.CREDIT_OFFER_ACCEPT_SELF,
      PilotCapability.CREDIT_EXECUTE_SANDBOX_SELF,
      PilotCapability.REPAYMENT_POST_SANDBOX_SELF,
      PilotCapability.OBLIGATION_READ_OWNED,
      PilotCapability.EVIDENCE_READ_OWNED,
      PilotCapability.PILOT_FEEDBACK_SUBMIT_SELF
    ])
  }),
  controller: Object.freeze({
    actorId: "actor_principal_controller_pilot",
    actorType: ActorType.HUMAN,
    roleBundle: RoleBundle.PRINCIPAL_CONTROLLER,
    capabilities: Object.freeze([
      PilotCapability.AGENT_CREATE,
      PilotCapability.AGENT_MANAGE_OWNED,
      PilotCapability.WORKSPACE_RESUME_SELF,
      PilotCapability.AGENT_ACCOUNT_CHALLENGE_CREATE_OWNED,
      PilotCapability.AGENT_ACCOUNT_BINDING_READ_SELF,
      PilotCapability.INTEGRATION_READ_OWNED,
      PilotCapability.MANDATE_DRAFT_CREATE,
      PilotCapability.MANDATE_DRAFT_REVOKE,
      PilotCapability.MANDATE_ACTIVATE_OWNED,
      PilotCapability.EVIDENCE_READ_OWNED
    ])
  }),
  agent: Object.freeze({
    actorId: "actor_agent_pilot_alpha",
    actorType: ActorType.AGENT,
    roleBundle: RoleBundle.AGENT_RUNTIME,
    capabilities: Object.freeze([
      PilotCapability.SUBJECT_READ_SELF,
      PilotCapability.AGENT_ACCOUNT_PROOF_SUBMIT_SELF,
      PilotCapability.AGENT_ACCOUNT_BINDING_READ_SELF,
      PilotCapability.CREDIT_REQUEST,
      PilotCapability.CREDIT_READ_SELF,
      PilotCapability.CREDIT_EVALUATE_SELF,
      PilotCapability.CREDIT_OFFER_ACCEPT_SELF,
      PilotCapability.CREDIT_EXECUTE_SANDBOX_SELF,
      PilotCapability.REPAYMENT_POST_SANDBOX_SELF,
      PilotCapability.OBLIGATION_READ_OWNED,
      PilotCapability.EVIDENCE_READ_OWNED,
      PilotCapability.PILOT_FEEDBACK_SUBMIT_SELF
    ]),
    controllerActorId: "actor_principal_controller_pilot"
  }),
  risk: Object.freeze({
    actorId: "actor_risk_operations_pilot",
    actorType: ActorType.RISK_OPERATOR,
    roleBundle: RoleBundle.RISK_OPERATOR,
    capabilities: Object.freeze([
      PilotCapability.RISK_READ_TENANT,
      PilotCapability.PILOT_HEALTH_READ,
      PilotCapability.PILOT_FEEDBACK_READ_TENANT,
      PilotCapability.SERVICING_QUEUE_READ,
      PilotCapability.RISK_FREEZE
    ])
  })
});

const HUMAN_ACTOR_TYPES = new Set([
  ActorType.HUMAN,
  ActorType.RISK_OPERATOR,
  ActorType.OPERATIONS_OPERATOR,
  ActorType.AUDITOR
]);

export function createLocalPilotIdentities({
  now = new Date(),
  profile = DEFAULT_PRIVATE_PILOT_PROFILE
} = {}) {
  const checkedProfile = assertPrivatePilotProfile(profile);
  const referenceHasher = createReferenceHasher(randomBytes(32));
  const eventStore = new InMemoryAuthenticationEventStore();
  const actorDirectory = new InMemoryActorDirectory();
  const credentialRegistry = new InMemoryCredentialRegistry({
    referenceHasher,
    eventStore,
    actorDirectory
  });
  const policyRegistry = new AuthorizationPolicyRegistry();
  const identities = {};

  for (const [name, template] of Object.entries(IDENTITY_SPECS)) {
    const spec = Object.freeze({
      ...template,
      actorId: checkedProfile.identities[name].actorId,
      controllerActorId: name === "agent"
        ? checkedProfile.identities.controller.actorId
        : template.controllerActorId
    });
    const clientId = `client_${spec.actorId}`;
    const human = HUMAN_ACTOR_TYPES.has(spec.actorType);
    actorDirectory.register({ actorId: spec.actorId, actorType: spec.actorType });
    const credential = credentialRegistry.register({
      tenantId: checkedProfile.tenantId,
      actorId: spec.actorId,
      actorType: spec.actorType,
      issuer: "https://private-pilot.ipo.one",
      externalSubject: `local_${spec.actorId}`,
      clientId,
      clientAuthenticationMethod: human
        ? ClientAuthenticationMethod.OIDC_PKCE_BFF
        : ClientAuthenticationMethod.PRIVATE_KEY_JWT,
      senderConstraint: {
        method: human ? SenderConstraintMethod.HOST_SESSION : SenderConstraintMethod.DPOP,
        thumbprint: referenceHasher.hash("pilot.sender", spec.actorId)
      },
      roles: [spec.roleBundle],
      allowedCapabilities: [...spec.capabilities],
      policyVersion: AUTHORIZATION_POLICY_VERSION,
      performedByActorId: "actor_local_system",
      reasonCode: "local_private_no_funds_pilot",
      now
    });
    const createContext = ({ authenticatedAt = new Date() } = {}) => createAuthenticationContext({
      tenantId: checkedProfile.tenantId,
      actorId: spec.actorId,
      actorType: spec.actorType,
      clientId,
      credentialId: credential.credentialId,
      credentialVersion: credential.version,
      policyVersion: AUTHORIZATION_POLICY_VERSION,
      capabilities: [...spec.capabilities],
      roles: [spec.roleBundle],
      tokenJtiHash: referenceHasher.hash("pilot.token.jti", spec.actorId),
      authenticationMethod: credential.clientAuthenticationMethod,
      senderConstraintMethod: credential.senderConstraint.method,
      authenticatedAt,
      authTime: human ? authenticatedAt : undefined,
      acr: human ? "urn:ipo-one:local:phishing-resistant" : undefined,
      amr: human ? ["webauthn"] : []
    });
    identities[name] = Object.freeze({
      ...spec,
      clientId,
      credential,
      membershipId: `membership_${spec.actorId}`,
      createContext
    });
  }

  return Object.freeze({
    credentialRegistry,
    identities: Object.freeze(identities),
    policyRegistry,
    referenceHasher,
    profile: checkedProfile
  });
}
