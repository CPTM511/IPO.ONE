-- WEB-027J: encrypted material for explicitly created local sandbox Agents.
-- This table is not a kernel or a financial authority. Only the local enrollment
-- service uses it; deployed hosts receive no enrollment handler or credentials.
CREATE TABLE local_principal_agent_runtimes (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  controller_actor_id TEXT NOT NULL,
  agent_actor_id TEXT NOT NULL,
  credential_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  account_address TEXT NOT NULL CHECK (account_address ~ '^0x[0-9a-fA-F]{40}$'),
  encrypted_material TEXT NOT NULL CHECK (encrypted_material ~ '^v1\.' AND length(encrypted_material)<24000),
  status TEXT NOT NULL CHECK (status IN ('active','revoked')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL CHECK (updated_at>=created_at),
  schema_version TEXT NOT NULL CHECK (schema_version='local_principal_agent_runtime.v1'),
  PRIMARY KEY (tenant_id,controller_actor_id),
  UNIQUE (tenant_id,agent_actor_id),
  UNIQUE (tenant_id,credential_id),
  FOREIGN KEY (tenant_id,controller_actor_id) REFERENCES memberships(tenant_id,actor_id),
  FOREIGN KEY (tenant_id,agent_actor_id) REFERENCES memberships(tenant_id,actor_id),
  FOREIGN KEY (tenant_id,credential_id) REFERENCES authentication_credentials(tenant_id,id)
);
ALTER TABLE local_principal_agent_runtimes ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_principal_agent_runtimes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_local_principal_agent_runtimes ON local_principal_agent_runtimes
  USING (tenant_id=current_app_tenant_id()) WITH CHECK (tenant_id=current_app_tenant_id());
CREATE TRIGGER tenant_context_guard_local_principal_agent_runtimes
  BEFORE INSERT OR UPDATE OR DELETE ON local_principal_agent_runtimes
  FOR EACH ROW EXECUTE FUNCTION enforce_tenant_context();
CREATE FUNCTION guard_local_principal_agent_runtime() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND (
    OLD.status<>'active' OR NEW.status<>'revoked' OR
    ROW(NEW.tenant_id,NEW.controller_actor_id,NEW.agent_actor_id,NEW.credential_id,NEW.client_id,
        NEW.account_address,NEW.encrypted_material,NEW.created_at,NEW.schema_version)
    IS DISTINCT FROM ROW(OLD.tenant_id,OLD.controller_actor_id,OLD.agent_actor_id,OLD.credential_id,OLD.client_id,
        OLD.account_address,OLD.encrypted_material,OLD.created_at,OLD.schema_version))) THEN
    RAISE EXCEPTION 'Local Agent runtime permits only terminal revocation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_local_principal_agent_runtime BEFORE UPDATE OR DELETE ON local_principal_agent_runtimes
  FOR EACH ROW EXECUTE FUNCTION guard_local_principal_agent_runtime();
REVOKE ALL ON local_principal_agent_runtimes FROM PUBLIC;
