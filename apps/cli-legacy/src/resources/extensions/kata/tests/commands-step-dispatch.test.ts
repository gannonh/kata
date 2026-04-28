import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const commandsPath = join(__dirname, "..", "commands.ts");

test("/kata step dispatches via sendUserMessage instead of hidden custom-message triggerTurn", () => {
  const source = readFileSync(commandsPath, "utf8");

  assert.match(
    source,
    /await pi\.sendUserMessage\(prompt\)/,
    "expected /kata step to dispatch the generated prompt as a user message",
  );
  assert.doesNotMatch(
    source,
    /customType:\s*"kata-step"/,
    "expected /kata step to stop relying on the hidden kata-step custom message",
  );
});
