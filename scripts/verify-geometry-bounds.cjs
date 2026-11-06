const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const threeRoot = process.env.CASCADE_THREE_ROOT
    ? path.resolve(process.env.CASCADE_THREE_ROOT)
    : undefined;
  const build = await Bun.build({
    entrypoints: ["scripts/geometry-bounds-entry.ts"],
    target: "browser",
    plugins: [
      {
        name: "qualified-inputs",
        setup(b) {
          if (process.env.BOUNDS_MODULE)
            b.onResolve({ filter: /^\.\.\/src\/geometryBounds$/ }, () => ({
              path: path.resolve(process.env.BOUNDS_MODULE),
            }));
          if (threeRoot)
            b.onResolve({ filter: /^three($|\/addons\/)/ }, ({ path: p }) => ({
              path: path.join(
                threeRoot,
                p === "three"
                  ? "build/three.module.js"
                  : "examples/jsm/" + p.slice(13),
              ),
            }));
        },
      },
    ],
  });
  assert(build.success, String(build.logs));
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-gpu-rasterization",
    ],
  });
  const timer = setTimeout(() => browser.close(), 30000);
  try {
    const page = await browser.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.setContent("<html></html>");
    await page.addScriptTag({ content: await build.outputs[0].text() });
    const result = await page.evaluate(() => window.verifyGeometryBounds());
    assert.deepEqual(errors, []);
    assert.equal(result.baseline.pixels, 0);
    assert(result.padded.pixels > 20);
    assert.deepEqual(result.padded, result.shared);
    assert.deepEqual(result.padded, result.retained);
    assert.deepEqual(result.baseline, result.restored);
    assert(result.identitiesRestored);
    assert(result.endedOnDispose);
    assert.deepEqual(result.memory, { geometries: 0, textures: 0 });
    assert.equal(result.glError, 0);
    const report =
      process.env.BOUNDS_REPORT ||
      `docs/geometry-bounds-2026-11-06/browser-${result.revision}.json`;
    fs.mkdirSync(path.dirname(report), { recursive: true });
    fs.writeFileSync(
      report,
      JSON.stringify({ ...result, errors }, null, 2) + "\n",
    );
    console.log(result);
  } finally {
    clearTimeout(timer);
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
