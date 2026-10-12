import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const cardsDir = path.resolve("packages/shared/data/cards");

const suspiciousFields = [];
const invalidBindings = [];

const entries = await readdir(cardsDir, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isFile() || !entry.name.endsWith(".json")) {
    continue;
  }

  const filePath = path.join(cardsDir, entry.name);
  const raw = await readFile(filePath, "utf8");
  const data = JSON.parse(raw);

  for (const fieldName of ["name", "text"]) {
    const value = data[fieldName];
    if (typeof value !== "string") {
      continue;
    }

    if (value.includes("?")) {
      suspiciousFields.push(`${entry.name}:${fieldName}`);
    }
  }

  const seenOccurrences = new Set();
  for (const binding of data.textValueBindings ?? []) {
    if (seenOccurrences.has(binding.occurrence)) {
      invalidBindings.push(`${entry.name}: duplicate occurrence ${binding.occurrence}`);
    }
    seenOccurrences.add(binding.occurrence);
  }
}

if (suspiciousFields.length > 0) {
  console.error("Suspicious card text detected. Check for mojibake in:");
  for (const field of suspiciousFields) {
    console.error(`- ${field}`);
  }
  process.exit(1);
}

if (invalidBindings.length > 0) {
  console.error("Invalid card text value bindings detected:");
  for (const binding of invalidBindings) {
    console.error(`- ${binding}`);
  }
  process.exit(1);
}

console.log("Card text validation passed.");
