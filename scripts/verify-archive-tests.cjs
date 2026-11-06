/** Run the maintained unit suite against emitted files from an extracted archive. */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const candidate = path.resolve(process.argv[2] || "");
assert(process.argv[2], "Supply the extracted package directory");
assert.equal(
  JSON.parse(fs.readFileSync(path.join(candidate, "package.json"), "utf8"))
    .name,
  "@absolutejs/rendering",
);
fs.mkdirSync(".qualification", { recursive: true });
const target = fs.mkdtempSync(path.resolve(".qualification/archive-tests-"));
try {
  let mapped = 0;
  const files = fs
    .readdirSync("tests")
    .filter((name) => name.endsWith(".test.ts"));
  for (const name of files) {
    const original = fs.readFileSync(path.join("tests", name), "utf8");
    const content = original.replace(
      /(["'])\.\.\/src(?:\/([^"']+))?\1/g,
      (_, quote, module) => {
        const emitted = path.join(
          candidate,
          "dist",
          (module || "index") + ".js",
        );
        assert(fs.existsSync(emitted), "Missing emitted module: " + emitted);
        mapped++;
        return JSON.stringify(emitted);
      },
    );
    fs.writeFileSync(path.join(target, name), content);
  }
  assert(mapped > 0);
  const run = spawnSync(process.execPath, ["test", target], {
    encoding: "utf8",
    stdio: "inherit",
  });
  if (run.error) throw run.error;
  assert.equal(run.status, 0, "Archive unit suite failed");
  console.log(
    JSON.stringify({
      files: files.length,
      mappedImports: mapped,
      scope:
        "Maintained test bodies unchanged; source imports redirected to exact archive emitted modules.",
    }),
  );
} finally {
  fs.rmSync(target, { recursive: true, force: true });
}
