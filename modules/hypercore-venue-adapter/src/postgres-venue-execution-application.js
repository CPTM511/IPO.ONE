import {
  DomainError,
  hashId
} from "../../../packages/domain/src/index.js";
import { CoreProjectionType } from "../../persistence/src/index.js";
import {
  verifyHypercoreAccountBinding,
  verifyHypercoreDelegate
} from "./hypercore-delegate.js";
import { createLocalHypercoreVenueProvider } from "./hypercore-venue-adapter.js";
import { planHypercoreDelegatePreparation } from "./postgres-hypercore-delegate-repository.js";

function fail(code, message) {
  throw new DomainError(code, message);
}

function safety(schemaVersion) {
  return {
    transactionsAllowed: false,
    sandboxOnly: true,
    productionAuthority: false,
    fundsAuthority: false,
    schemaVersion
  };
}

async function state({ client, coreRepository, type, id, lock = false }) {
  const result = await coreRepository.getProjectionStateInTransaction(
    client,
    type,
    id,
    { lock }
  );
  if (!result?.value) {
    fail("venue_resource_unavailable", "Venue resource is unavailable");
  }
  return result;
}

export function createPostgresVenueExecutionApplication() {
  return Object.freeze({
    async discoverCapabilities({ now }) {
      const provider = createLocalHypercoreVenueProvider({ now });
      return {
        items: [{
          adapterId: provider.descriptor.adapterId,
          venueId: provider.descriptor.venueId,
          adapterVersion: provider.descriptor.adapterVersion,
          descriptorHash: provider.descriptor.descriptorHash,
          enabled: provider.descriptor.enabled,
          externalCallsEnabled: false,
          approveAgentEnabled: false,
          officialSigningEnabled: false,
          exchangeSubmissionEnabled: false
        }],
        count: 1,
        ...safety("venue_capability_descriptor_list.v1")
      };
    },

    async readBinding({ client, coreRepository, resourceId }) {
      const current = await state({
        client,
        coreRepository,
        type: CoreProjectionType.HYPERCORE_ACCOUNT_BINDING,
        id: resourceId
      });
      verifyHypercoreAccountBinding(current.value);
      return {
        bindingId: current.value.accountBindingId,
        status: "verified",
        ...safety("tenant_venue_binding_view.v1")
      };
    },

    async prepareDelegate({
      client,
      coreRepository,
      directory,
      resourceId,
      payload,
      now
    }) {
      const expiresAt = new Date(payload.requestedExpiresAt);
      const planned = await planHypercoreDelegatePreparation({
        client,
        coreRepository,
        bindingId: resourceId,
        apiWalletAddressHash: payload.delegateAddressHash,
        signerReferenceHash: payload.signerReferenceHash,
        delegateNameHash: hashId("hypercore_delegate_name", {
          accountBindingId: resourceId,
          apiWalletAddressHash: payload.delegateAddressHash
        }),
        expiresAt,
        now
      });
      const actorBindings = await directory.listActiveResourceBindings({
        resourceType: "venue_binding",
        resourceId,
        now
      });
      return {
        ...planned.plan,
        response: {
          delegateId: planned.delegate.delegateId,
          delegateHash: planned.delegate.delegateHash,
          status: "prepared",
          activationAllowed: false,
          ...safety("tenant_venue_delegate_prepared.v1")
        },
        authorizationResource: {
          resourceType: "venue_delegate",
          resourceId: planned.delegate.delegateId,
          actorBindings: actorBindings.map((binding) => ({
            actorId: binding.actorId,
            actorType: binding.actorType,
            relationship: binding.relationship,
            ...(binding.controllerActorId
              ? { controllerActorId: binding.controllerActorId }
              : {})
          }))
        }
      };
    },

    async assertActivationDisabled({
      client,
      coreRepository,
      resourceId,
      payload
    }) {
      const current = await state({
        client,
        coreRepository,
        type: CoreProjectionType.HYPERCORE_API_WALLET_DELEGATE,
        id: resourceId,
        lock: true
      });
      verifyHypercoreDelegate(current.value);
      if (current.value.delegateHash !== payload.expectedDelegateHash) {
        fail("hypercore_delegate_concurrency_conflict", "delegate changed or is unavailable");
      }
      return true;
    },

    async assertRevocationDisabled({ client, coreRepository, resourceId }) {
      const current = await state({
        client,
        coreRepository,
        type: CoreProjectionType.HYPERCORE_API_WALLET_DELEGATE,
        id: resourceId,
        lock: true
      });
      verifyHypercoreDelegate(current.value);
      return true;
    },

    async prepareExecution() {
      fail(
        "venue_execution_preparation_not_composed_l0_local_no_funds",
        "Venue execution preparation remains outside HYPERLIQUID-002B"
      );
    },

    async assertSubmissionDisabled() {
      return true;
    },

    async readExecution() {
      fail(
        "venue_execution_unavailable_l0_local_no_funds",
        "Venue execution Evidence is unavailable in the local persistence profile"
      );
    }
  });
}
