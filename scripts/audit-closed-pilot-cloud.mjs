import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

const SHA = /^[a-f0-9]{40}$/;
const IMAGE = /^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/;

function runGcloud(arguments_) {
  const result = spawnSync("gcloud", [...arguments_, "--quiet", "--format=json"], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024
  });
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || "gcloud command failed")
      .trim()
      .split("\n")
      .slice(-3)
      .join(" ");
    return { ok: false, message };
  }
  try {
    return { ok: true, value: JSON.parse(result.stdout || "null") };
  } catch {
    return { ok: false, message: "gcloud returned non-JSON output" };
  }
}

function addCheck(checks, id, passed, detail) {
  checks.push(Object.freeze({ id, passed: passed === true, detail: String(detail).slice(0, 512) }));
}

function ruleAt(policy, priority) {
  return policy?.rules?.find((rule) => Number(rule.priority) === priority);
}

function membersForRole(iamPolicy, role) {
  return new Set(
    (iamPolicy?.bindings ?? [])
      .filter((binding) => binding.role === role)
      .flatMap((binding) => binding.members ?? [])
  );
}

function exactServiceAccount(value) {
  return `serviceAccount:${value}`;
}

async function main() {
  let values;
  try {
    ({ values } = parseArgs({
      allowPositionals: false,
      strict: true,
      options: {
        stack: { type: "string", default: "deploy/gcp/closed-pilot/stack.v1.json" },
        "expected-sha": { type: "string" },
        "expected-image": { type: "string" },
        output: { type: "string" }
      }
    }));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }

  if (!SHA.test(values["expected-sha"] ?? "") || !IMAGE.test(values["expected-image"] ?? "")) {
    console.error("--expected-sha and immutable --expected-image are required");
    process.exit(2);
  }

  const stack = JSON.parse(await readFile(resolve(values.stack), "utf8"));
  const checks = [];
  const project = stack.projectId;
  const region = stack.region;

  const projectResult = runGcloud(["projects", "describe", project]);
  addCheck(
    checks,
    "project_active",
    projectResult.ok && projectResult.value?.projectId === project && projectResult.value?.lifecycleState === "ACTIVE",
    projectResult.ok ? `${projectResult.value?.projectId}:${projectResult.value?.lifecycleState}` : projectResult.message
  );

  const sqlResult = runGcloud(["sql", "instances", "describe", stack.cloudSql.instance, "--project", project]);
  const sql = sqlResult.ok ? sqlResult.value : undefined;
  const sqlSettings = sql?.settings;
  const ip = sqlSettings?.ipConfiguration;
  const backup = sqlSettings?.backupConfiguration;
  addCheck(checks, "cloud_sql_runnable", sql?.state === "RUNNABLE", sqlResult.ok ? String(sql?.state) : sqlResult.message);
  addCheck(
    checks,
    "cloud_sql_identity",
    sql?.connectionName === stack.cloudSql.connectionName &&
      sql?.region === region &&
      sql?.databaseVersion === stack.cloudSql.databaseVersion,
    `${sql?.connectionName ?? "missing"};${sql?.databaseVersion ?? "missing"}`
  );
  addCheck(
    checks,
    "cloud_sql_ha_and_deletion_protection",
    sqlSettings?.availabilityType === stack.cloudSql.availabilityType &&
      sqlSettings?.deletionProtectionEnabled === true,
    `${sqlSettings?.availabilityType ?? "missing"};deletionProtection=${String(sqlSettings?.deletionProtectionEnabled)}`
  );
  addCheck(
    checks,
    "cloud_sql_connector_only",
    sqlSettings?.connectorEnforcement === stack.cloudSql.connectorEnforcement &&
      ip?.ipv4Enabled === stack.cloudSql.publicIpv4Enabled &&
      ip?.sslMode === stack.cloudSql.sslMode &&
      (ip?.authorizedNetworks?.length ?? 0) === 0,
    `connector=${sqlSettings?.connectorEnforcement ?? "missing"};ipv4=${String(ip?.ipv4Enabled)};ssl=${ip?.sslMode ?? "missing"};authorizedNetworks=${ip?.authorizedNetworks?.length ?? 0}`
  );
  addCheck(
    checks,
    "cloud_sql_backup_policy",
    backup?.enabled === true &&
      backup?.pointInTimeRecoveryEnabled === true &&
      Number(backup?.backupRetentionSettings?.retainedBackups) >= stack.cloudSql.retainedBackups &&
      Number(backup?.transactionLogRetentionDays) >= stack.cloudSql.transactionLogRetentionDays,
    `backup=${String(backup?.enabled)};pitr=${String(backup?.pointInTimeRecoveryEnabled)};retained=${backup?.backupRetentionSettings?.retainedBackups ?? "missing"};logs=${backup?.transactionLogRetentionDays ?? "missing"}`
  );

  const backupsResult = runGcloud([
    "sql", "backups", "list", "--project", project, "--instance", stack.cloudSql.instance
  ]);
  const successfulBackups = backupsResult.ok
    ? (backupsResult.value ?? []).filter((entry) => entry.status === "SUCCESSFUL")
    : [];
  addCheck(
    checks,
    "cloud_sql_successful_backup_exists",
    successfulBackups.length > 0,
    backupsResult.ok ? `${successfulBackups.length} successful backups` : backupsResult.message
  );

  const secretsResult = runGcloud(["secrets", "list", "--project", project]);
  const secretNames = new Set(
    (secretsResult.ok ? secretsResult.value : []).map((secret) => String(secret.name).split("/").at(-1))
  );
  for (const secret of stack.secrets) {
    addCheck(checks, `secret_${secret.replaceAll("-", "_")}`, secretNames.has(secret), secretNames.has(secret) ? "present" : "missing");
  }

  const runResult = runGcloud([
    "run", "services", "describe", stack.cloudRun.service,
    "--project", project,
    "--region", region
  ]);
  const service = runResult.ok ? runResult.value : undefined;
  const serviceAnnotations = service?.metadata?.annotations ?? {};
  const revisionAnnotations = service?.spec?.template?.metadata?.annotations ?? {};
  const container = service?.spec?.template?.spec?.containers?.[0];
  const env = Object.fromEntries((container?.env ?? []).map((entry) => [entry.name, entry.value]));
  addCheck(
    checks,
    "cloud_run_origin_boundary",
    serviceAnnotations["run.googleapis.com/default-url-disabled"] === "true" &&
      serviceAnnotations["run.googleapis.com/ingress"] === stack.cloudRun.ingress,
    runResult.ok ? `ingress=${serviceAnnotations["run.googleapis.com/ingress"] ?? "missing"};defaultUrlDisabled=${serviceAnnotations["run.googleapis.com/default-url-disabled"] ?? "missing"}` : runResult.message
  );
  addCheck(
    checks,
    "cloud_run_runtime_identity",
    service?.spec?.template?.spec?.serviceAccountName === stack.cloudRun.runtimeServiceAccount,
    service?.spec?.template?.spec?.serviceAccountName ?? "missing"
  );
  addCheck(
    checks,
    "cloud_run_sql_attachment",
    revisionAnnotations["run.googleapis.com/cloudsql-instances"] === stack.cloudSql.connectionName,
    revisionAnnotations["run.googleapis.com/cloudsql-instances"] ?? "missing"
  );
  addCheck(
    checks,
    "cloud_run_exact_release",
    container?.image === values["expected-image"] && env.IPO_ONE_RELEASE_ID === values["expected-sha"],
    `image=${container?.image ?? "missing"};release=${env.IPO_ONE_RELEASE_ID ?? "missing"}`
  );
  addCheck(
    checks,
    "cloud_run_no_funds_profile",
    env.IPO_ONE_DEPLOYMENT_MODE === "closed_pilot" &&
      env.IPO_ONE_AUTHENTICATION_MODE === "closed_pilot" &&
      env.IPO_ONE_PUBLIC_ORIGIN === stack.publicOrigin,
    `mode=${env.IPO_ONE_DEPLOYMENT_MODE ?? "missing"};auth=${env.IPO_ONE_AUTHENTICATION_MODE ?? "missing"};origin=${env.IPO_ONE_PUBLIC_ORIGIN ?? "missing"}`
  );

  const armorResult = runGcloud([
    "compute", "security-policies", "describe", stack.edge.securityPolicy, "--project", project
  ]);
  const armor = armorResult.ok ? armorResult.value : undefined;
  addCheck(
    checks,
    "edge_authentication_admission",
    ruleAt(armor, 150)?.preview === false && ruleAt(armor, 160)?.preview === false,
    armorResult.ok ? `start=${String(ruleAt(armor, 150)?.preview)};complete=${String(ruleAt(armor, 160)?.preview)}` : armorResult.message
  );
  addCheck(
    checks,
    "edge_waf_enforced",
    ruleAt(armor, 300)?.preview === false && ruleAt(armor, 310)?.preview === false,
    armorResult.ok ? `sqli=${String(ruleAt(armor, 300)?.preview)};xss=${String(ruleAt(armor, 310)?.preview)}` : armorResult.message
  );

  const monitoringResult = runGcloud(["monitoring", "policies", "list", "--project", project]);
  const closedPilotPolicies = monitoringResult.ok
    ? (monitoringResult.value ?? []).filter((policy) => /closed pilot/i.test(policy.displayName ?? ""))
    : [];
  addCheck(
    checks,
    "closed_pilot_alerts_with_notification",
    closedPilotPolicies.length >= 4 && closedPilotPolicies.every((policy) => (policy.notificationChannels?.length ?? 0) > 0),
    monitoringResult.ok ? `${closedPilotPolicies.length} closed-pilot policies` : monitoringResult.message
  );

  const iamResult = runGcloud(["projects", "get-iam-policy", project]);
  const iam = iamResult.ok ? iamResult.value : undefined;
  const runtimeMember = exactServiceAccount(stack.cloudRun.runtimeServiceAccount);
  const migrationMember = exactServiceAccount(stack.cloudRun.migrationServiceAccount);
  addCheck(
    checks,
    "runtime_cloud_sql_client",
    membersForRole(iam, "roles/cloudsql.client").has(runtimeMember),
    runtimeMember
  );
  addCheck(
    checks,
    "migration_cloud_sql_client",
    membersForRole(iam, "roles/cloudsql.client").has(migrationMember),
    migrationMember
  );
  addCheck(
    checks,
    "no_project_wide_secret_accessor",
    !membersForRole(iam, "roles/secretmanager.secretAccessor").has(runtimeMember) &&
      !membersForRole(iam, "roles/secretmanager.secretAccessor").has(migrationMember),
    "Secret access must be granted on exact secrets only"
  );

  const ready = checks.every((check) => check.passed);
  const receipt = {
    schemaVersion: "ipo.one.closed-pilot-cloud-observation/v1",
    observedAt: new Date().toISOString(),
    projectId: project,
    region,
    release: {
      commitSha: values["expected-sha"],
      imageUri: values["expected-image"]
    },
    ready,
    checks
  };
  const output = `${JSON.stringify(receipt, null, 2)}\n`;
  if (values.output) {
    const path = resolve(values.output);
    if (!path.endsWith(".local.json")) {
      console.error("--output must end in .local.json so evidence cannot be committed accidentally");
      process.exit(2);
    }
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, output, { mode: 0o600 });
  } else {
    process.stdout.write(output);
  }
  process.exitCode = ready ? 0 : 1;
}

await main();
