const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
(async () => {
  const build = await Bun.build({
    entrypoints: ["scripts/associated-color-entry.ts"],
    target: "browser",
    minify: true,
    plugins: process.env.COLOR_MODULE
      ? [
          {
            name: "exact-color-module",
            setup(builder) {
              builder.onResolve({ filter: /^\.\.\/src\/index$/ }, () => ({
                path: require("node:path").resolve(process.env.COLOR_MODULE),
              }));
            },
          },
        ]
      : [],
  });
  assert(build.success);
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-gpu-rasterization",
    ],
  });
  const deadline = setTimeout(() => browser.close(), 30000);
  try {
    const page = await browser.newPage({ viewport: { width: 4, height: 4 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.setContent("<html></html>");
    await page.addScriptTag({ content: await build.outputs[0].text() });
    const result = await page.evaluate(() => window.verifyAssociatedColor());
    for (const row of result.rows) {
      assert(row.pixel[0] >= 254);
      assert.equal(row.pixel[1], 0);
      assert.equal(row.pixel[2], 0);
      assert(Math.abs(row.pixel[3] - 128) <= 1);
    }
    assert.equal(result.textures, 0);
    assert.equal(result.geometries, 0);
    assert.equal(result.glError, 0);
    assert.deepEqual(errors, []);
    fs.mkdirSync("docs/associated-colors-2026-11-05", { recursive: true });
    fs.writeFileSync(
      "docs/associated-colors-2026-11-05/browser.json",
      JSON.stringify(
        {
          ...result,
          errors,
          scope:
            "4px SwiftShader bilinear filtering through actual MeshBasicMaterial; no hardware performance claim.",
        },
        null,
        2,
      ),
    );
    console.log("Associated color browser controls pass.");
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
