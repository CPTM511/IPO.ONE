import {
  CreditEventType,
  DomainError,
  PluginStatus,
  PluginTransitions,
  assertNonEmptyString,
  assertTransition,
  createAuditEvent,
  createCreditEvent,
  createPluginManifest
} from "../../../packages/domain/src/index.js";

function clone(value) {
  return structuredClone(value);
}

export class PluginRegistryService {
  constructor({ eventStore }) {
    this.eventStore = eventStore;
    this.plugins = new Map();
    this.pluginIdsByVersionKey = new Map();
  }

  registerPlugin(input) {
    const manifest = createPluginManifest(input);
    const versionKey = `${manifest.publisherId}\0${manifest.pluginKey}\0${manifest.serviceVersion}`;
    const existingId = this.pluginIdsByVersionKey.get(versionKey);
    if (existingId) {
      const existing = this.#requirePlugin(existingId);
      if (existing.manifestHash !== manifest.manifestHash) {
        throw new DomainError("plugin_version_conflict", "plugin version was registered with a different manifest", {
          publisherId: manifest.publisherId,
          pluginKey: manifest.pluginKey,
          serviceVersion: manifest.serviceVersion
        });
      }
      return clone(existing);
    }

    this.plugins.set(manifest.pluginId, manifest);
    this.pluginIdsByVersionKey.set(versionKey, manifest.pluginId);
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.PLUGIN_REGISTERED,
        payload: {
          pluginId: manifest.pluginId,
          manifestHash: manifest.manifestHash,
          pluginKey: manifest.pluginKey,
          pluginType: manifest.pluginType,
          publisherId: manifest.publisherId,
          serviceVersion: manifest.serviceVersion,
          sandboxOnly: manifest.sandboxOnly
        },
        now: input.now
      })
    );
    return clone(manifest);
  }

  activatePlugin({ pluginId, reviewerId, reason, now = new Date() }) {
    return this.#setStatus({ pluginId, nextStatus: PluginStatus.ACTIVE, reviewerId, reason, now });
  }

  suspendPlugin({ pluginId, reviewerId, reason, now = new Date() }) {
    return this.#setStatus({ pluginId, nextStatus: PluginStatus.SUSPENDED, reviewerId, reason, now });
  }

  revokePlugin({ pluginId, reviewerId, reason, now = new Date() }) {
    return this.#setStatus({ pluginId, nextStatus: PluginStatus.REVOKED, reviewerId, reason, now });
  }

  assertCapability({ pluginId, pluginType, capability, schemaVersion, jurisdiction }) {
    const plugin = this.#requirePlugin(pluginId);
    if (plugin.status !== PluginStatus.ACTIVE) {
      throw new DomainError("plugin_not_active", "plugin must be active", { pluginId, status: plugin.status });
    }
    if (pluginType && plugin.pluginType !== pluginType) {
      throw new DomainError("plugin_type_mismatch", "plugin type does not match the requested integration", {
        pluginId,
        pluginType
      });
    }
    assertNonEmptyString("capability", capability);
    if (!plugin.capabilities.includes(capability)) {
      throw new DomainError("plugin_capability_denied", "plugin does not declare the requested capability", {
        pluginId,
        capability
      });
    }
    if (schemaVersion && !plugin.supportedSchemaVersions.includes(schemaVersion)) {
      throw new DomainError("plugin_schema_unsupported", "plugin does not support the requested schema", {
        pluginId,
        schemaVersion
      });
    }
    if (jurisdiction && !plugin.jurisdictions.includes("global") && !plugin.jurisdictions.includes(jurisdiction)) {
      throw new DomainError("plugin_jurisdiction_denied", "plugin does not cover the requested jurisdiction", {
        pluginId,
        jurisdiction
      });
    }
    return clone(plugin);
  }

  getManifestConformance(pluginId) {
    const plugin = this.#requirePlugin(pluginId);
    return {
      pluginId,
      manifestHash: plugin.manifestHash,
      dataOnly: true,
      secretFree: true,
      executablePayloadFree: true,
      secureEndpoint: plugin.endpoint.startsWith("https://") || plugin.sandboxOnly,
      failClosed: ["fail_closed", "queue_for_review", "deny_and_alert"].includes(plugin.failurePolicy),
      declaredCapabilityCount: plugin.capabilities.length,
      declaredSchemaCount: plugin.supportedSchemaVersions.length,
      remoteConformanceTested: false,
      schemaVersion: "plugin_manifest_conformance.v1"
    };
  }

  getPlugin(pluginId) {
    return clone(this.#requirePlugin(pluginId));
  }

  listPlugins(filter = {}) {
    return [...this.plugins.values()]
      .filter((plugin) => Object.entries(filter).every(([key, value]) => value === undefined || plugin[key] === value))
      .map(clone);
  }

  #setStatus({ pluginId, nextStatus, reviewerId, reason, now }) {
    assertNonEmptyString("reviewerId", reviewerId);
    assertNonEmptyString("reason", reason);
    const plugin = this.#requirePlugin(pluginId);
    if (plugin.status === nextStatus) return clone(plugin);
    assertTransition("plugin", PluginTransitions, plugin.status, nextStatus);
    const previousStatus = plugin.status;
    plugin.status = nextStatus;
    plugin.updatedAt = now.toISOString();
    this.eventStore.appendCreditEvent(
      createCreditEvent({
        eventType: CreditEventType.PLUGIN_STATUS_CHANGED,
        payload: { pluginId, previousStatus, newStatus: nextStatus, reason, actorId: reviewerId },
        now
      })
    );
    this.eventStore.appendAuditEvent(
      createAuditEvent({
        actorId: reviewerId,
        actionType: `plugin_${nextStatus}`,
        targetType: "plugin",
        targetId: pluginId,
        reason,
        payload: { previousStatus, newStatus: nextStatus },
        now
      })
    );
    return clone(plugin);
  }

  #requirePlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new DomainError("plugin_not_found", "plugin not found", { pluginId });
    return plugin;
  }
}
