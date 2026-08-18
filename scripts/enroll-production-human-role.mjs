import { enrollProductionHumanRole } from "../apps/private-pilot/src/production-bootstrap.js";

const [tenantId, actorId, roleBundle, performedByActorId] = process.argv.slice(2);

if (
  process.argv.length !== 6 ||
  typeof process.env.IPO_ONE_DATABASE_OWNER_URL !== "string" ||
  process.env.IPO_ONE_DATABASE_OWNER_URL.length < 32
) {
  throw new Error(
    "usage: IPO_ONE_DATABASE_OWNER_URL=<owner-url> node scripts/enroll-production-human-role.mjs <tenant-id> <actor-id> <human_borrower|principal_controller> <system-actor-id>"
  );
}

const result = await enrollProductionHumanRole({
  adminConnectionString: process.env.IPO_ONE_DATABASE_OWNER_URL,
  tenantId,
  actorId,
  roleBundle,
  performedByActorId
});

process.stdout.write(`${JSON.stringify(result)}\n`);
