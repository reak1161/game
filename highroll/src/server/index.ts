import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rolesPath = resolve(__dirname, "../../data/roles.json");
const compiledPath = resolve(__dirname, "../../data/roles_compiled.json");
const rulesPath = resolve(__dirname, "../../data/rules.json");

const roles = JSON.parse(readFileSync(rolesPath, "utf-8"));
const compiled = JSON.parse(readFileSync(compiledPath, "utf-8"));
const rules = JSON.parse(readFileSync(rulesPath, "utf-8"));

console.log("[hiroll] roles:", roles.roles.map((r:any)=>r.id).join(", "));
console.log("[hiroll] rules:", rules);
console.log("[hiroll] compiled ability ids:", compiled.roles.flatMap((r:any)=>r.abilities?.map((a:any)=>a.id) ?? []));
