const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const threeRoot = process.env.CASCADE_THREE_ROOT;
  const firstSplit = Number(process.env.CASCADE_REFLECTION_SPLIT ?? 27.2);
  assert([16, 27.2].includes(firstSplit));
  const steep = process.env.CASCADE_REFLECTION_SCENARIO === "steep";
  const build = await Bun.build({
    define: {
      __REFLECTION_SPLIT__: String(firstSplit),
      __REFLECTION_STEEP__: String(steep),
    },
    entrypoints: ["scripts/cascade-reflection-entry.ts"],
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
    const result = await page.evaluate(() => window.verifyReflection());
    assert.deepEqual(errors, []);
    assert.equal(result.restorationDifferences, 0);
    assert.equal(result.glError, 0);
    for (const name of ["renderView", "refittedView"]) {
      const c = result.coverage[name];
      assert(c.tested > 2000 && c.shadowed > 40 && c.outsideMainTested > 700);
      assert.equal(c.missing, 0);
      assert.equal(c.falseShadow, 0);
    }
    if (steep) {
      assert(result.coverage.atlasView.falseShadow > 200);
      assert.equal(
        result.coverage.atlasView.outsideMainFalseShadow,
        result.coverage.atlasView.falseShadow,
      );
    } else {
      assert.equal(result.coverage.atlasView.missing, 0);
      assert.equal(result.coverage.atlasView.falseShadow, 0);
    }
    const compact = result;
    if (steep || firstSplit === 27.2) assert(result.changedPixels > 100);
    else assert.equal(result.changedPixels, 0);
    fs.mkdirSync("docs/scoped-cascades-2026-11-06", { recursive: true });
    fs.writeFileSync(
      `docs/scoped-cascades-2026-11-06/reflection-${result.revision}-${firstSplit}${steep ? "-steep" : ""}.json`,
      JSON.stringify({ ...compact, errors }, null, 2) + "\n",
    );
    console.log(compact);
  } finally {
    clearTimeout(timer);
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
