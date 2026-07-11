import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";

const root = process.cwd();
const requiredModules = [
  "authorization",
  "event-audit",
  "identity",
  "ledger",
  "lockbox",
  "obligation",
  "spend-policy",
  "risk",
  "credit-learning",
  "payment",
  "persistence",
  "plugin-registry",
  "rail",
  "settlement",
  "admin"
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(dir, predicate) {
  const files = [];
  let entries = [];

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return files;
    throw error;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath, predicate)));
    } else if (predicate(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

const failures = [];

for (const moduleName of requiredModules) {
  const base = join(root, "modules", moduleName);
  if (!(await exists(join(base, "README.md")))) {
    failures.push(`${moduleName} is missing README.md`);
  }
  if (!(await exists(join(base, "src", "index.js")))) {
    failures.push(`${moduleName} is missing src/index.js`);
  }
  const tests = await collectFiles(join(base, "test"), (file) => file.endsWith(".test.js"));
  if (tests.length === 0) {
    failures.push(`${moduleName} is missing a test file`);
  }
}

const sourceFiles = await collectFiles(root, (file) => {
  const normalized = normalize(file);
  return (
    normalized.endsWith(".js") &&
    !normalized.includes(`${normalize("node_modules")}/`) &&
    !normalized.includes(`${normalize(".git")}/`)
  );
});

function ownerForPath(path) {
  const normalized = normalize(path);
  const modulePrefix = `${normalize(join(root, "modules"))}/`;
  const packagesPrefix = `${normalize(join(root, "packages"))}/`;
  const appsPrefix = `${normalize(join(root, "apps"))}/`;

  if (normalized.startsWith(modulePrefix)) {
    return { type: "module", name: normalized.slice(modulePrefix.length).split("/")[0] };
  }
  if (normalized.startsWith(packagesPrefix)) {
    return { type: "package", name: normalized.slice(packagesPrefix.length).split("/")[0] };
  }
  if (normalized.startsWith(appsPrefix)) {
    return { type: "app", name: normalized.slice(appsPrefix.length).split("/")[0] };
  }
  return { type: "root", name: "" };
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), specifier);
  return base.endsWith(".js") ? base : `${base}.js`;
}

const moduleDeps = new Map(requiredModules.map((moduleName) => [moduleName, new Set()]));

for (const file of sourceFiles) {
  const owner = ownerForPath(file);
  const body = await readFile(file, "utf8");
  const importPattern = /from\s+["']([^"']+)["']/g;
  let match;

  if (owner.type === "package" && owner.name === "domain" && /modules\//.test(body)) {
    failures.push(`domain package must not reference modules: ${file}`);
  }

  if (/\b(class|function|const|let|var)\s+User\b/.test(body) || /\bcreateUser\b/.test(body)) {
    failures.push(`generic User domain object is prohibited: ${file}`);
  }

  while ((match = importPattern.exec(body))) {
    const target = resolveImport(file, match[1]);
    if (!target) continue;

    const targetOwner = ownerForPath(target);

    if (owner.type === "module" && targetOwner.type === "app") {
      failures.push(`module ${owner.name} imports app code: ${file}`);
    }

    if (owner.type === "module" && targetOwner.type === "module" && owner.name !== targetOwner.name) {
      moduleDeps.get(owner.name)?.add(targetOwner.name);
    }

    if (owner.type === "package" && owner.name === "domain" && targetOwner.type !== "package") {
      failures.push(`domain imports outside package boundary: ${file}`);
    }
  }
}

function hasCycle(start, current, visited = new Set()) {
  if (visited.has(current)) return false;
  visited.add(current);

  for (const dep of moduleDeps.get(current) ?? []) {
    if (dep === start || hasCycle(start, dep, visited)) return true;
  }

  return false;
}

for (const moduleName of requiredModules) {
  if (hasCycle(moduleName, moduleName)) {
    failures.push(`circular module dependency detected from ${moduleName}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Boundary lint passed.");
