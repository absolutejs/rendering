const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const threeRoot = process.env.CASCADE_THREE_ROOT;
  const build = await Bun.build({
    entrypoints: ["scripts/scoped-cascades-entry.ts"],
    target: "browser",
    plugins: threeRoot
      ? [
          {
            name: "three-version",
            setup(b) {
              b.onResolve(
                { filter: /^three($|\/addons\/)/ },
                ({ path: p }) => ({
                  path: path.join(
                    threeRoot,
                    p === "three"
                      ? "build/three.module.js"
                      : "examples/jsm/" + p.slice(13),
                  ),
                }),
              );
            },
          },
        ]
      : [],
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
    const result = await page.evaluate(() => window.verifyCascades());
    assert.deepEqual(errors, []);
    assert(result.changed > 100);
    assert(result.transmissionComponents > 100);
    assert.equal(result.restoration, 0);
    assert(result.globalChunksUnchanged);
    assert.equal(result.glError, 0);
    assert.equal(result.memoryAfter.geometries, 0);
    assert(result.memoryAfter.textures <= 1);
    fs.mkdirSync("docs/scoped-cascades-2026-11-06", { recursive: true });
    fs.writeFileSync(
      `docs/scoped-cascades-2026-11-06/browser-${result.revision}.json`,
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
