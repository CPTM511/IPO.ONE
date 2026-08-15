import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const webRoot = resolve(root, "apps/web/src");
const htmlPath = join(webRoot, "index.html");
const failures = [];

function fail(condition, message) {
  if (!condition) failures.push(message);
}

async function authoredJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "vendor") continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await authoredJavaScriptFiles(absolute));
    if (entry.isFile() && extname(entry.name) === ".js") files.push(absolute);
  }
  return files.sort();
}

const html = await readFile(htmlPath, "utf8");
const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
fail(scriptTags.length === 1, "web shell must contain exactly one script element");
if (scriptTags.length === 1) {
  const [, attributes, body] = scriptTags[0];
  fail(/\btype\s*=\s*["']module["']/i.test(attributes), "web entry script must be a module");
  fail(
    /\bsrc\s*=\s*["']\/app\.js(?:\?[^"']*)?["']/i.test(attributes),
    "web entry script must load the authored /app.js module"
  );
  fail(body.trim() === "", "web shell must not contain inline JavaScript");
}
fail(
  !/<[^>]+\son[a-z]+\s*=/i.test(html),
  "inline DOM event handlers are prohibited"
);
fail(!/\bjavascript\s*:/i.test(html), "javascript: URLs are prohibited");
fail(
  !/(?:^|\n)\s*(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=/.test(
    html.replaceAll(scriptTags[0]?.[0] ?? "", "")
  ),
  "JavaScript source appears as visible HTML text"
);

const ids = [...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
fail(new Set(ids).size === ids.length, "web shell contains duplicate static IDs");

const files = await authoredJavaScriptFiles(webRoot);
for (const file of files) {
  const source = await readFile(file, "utf8");
  fail(!/<\/script\s*>/i.test(source), `${file} contains a script-closing sequence`);
  for (const match of source.matchAll(
    /(?:import|export)\s+(?:[\s\S]*?\sfrom\s+)?["'](\.[^"']+)["']/g
  )) {
    const imported = resolve(dirname(file), match[1]);
    try {
      fail((await stat(imported)).isFile(), `${file} imports a non-file module: ${match[1]}`);
    } catch {
      failures.push(`${file} imports a missing module: ${match[1]}`);
    }
  }
  try {
    await execFileAsync(process.execPath, ["--check", file], {
      cwd: root,
      timeout: 30_000
    });
  } catch (error) {
    failures.push(`${file} failed JavaScript syntax validation: ${error.stderr || error.message}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `Web bundle integrity checks passed (1 external module, ${files.length} authored modules, ${ids.length} unique IDs).`
);
