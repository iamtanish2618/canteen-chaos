const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readdirSync, readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.name === "node_modules") return [];
    return entry.isDirectory()
      ? files(path)
      : /\.(js|mjs|css)$/.test(path)
        ? [path]
        : [];
  });
}
test("source modules and regression tests stay below 350 lines", () => {
  for (const file of [
    ...files(resolve(__dirname, "../..")),
    ...files(resolve(__dirname, "../../../frontend")),
  ]) {
    const count = readFileSync(file, "utf8").trimEnd().split("\n").length;
    assert.ok(
      count <= 350,
      `${file} has ${count} lines; extract a focused module.`,
    );
  }
});
