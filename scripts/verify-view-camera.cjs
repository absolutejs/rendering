const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
(async () => {
  const build = await Bun.build({
    entrypoints: ["scripts/view-camera-entry.ts"],
    target: "browser",
    minify: true,
    plugins: process.env.VIEW_MODULE
      ? [
          {
            name: "exact-view-module",
            setup(builder) {
              builder.onResolve({ filter: /^\.\.\/src\/index$/ }, () => ({
                path: require("node:path").resolve(process.env.VIEW_MODULE),
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
  const timer = setTimeout(() => browser.close(), 30000);
  try {
    const page = await browser.newPage({ viewport: { width: 32, height: 32 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.setContent("<html></html>");
    await page.addScriptTag({ content: await build.outputs[0].text() });
    const result = await page.evaluate(() => window.verifyViewCamera());
    for (const row of result.rows)
      row.pixel.forEach((v, i) =>
        assert(Math.abs(v - row.expected[i]) <= 1, JSON.stringify(row)),
      );
    assert.equal(result.shadowCalls, 3);
    assert.equal(result.renderCalls, 3);
    assert.equal(result.glError, 0);
    assert.equal(result.memory.geometries, 0);
    assert.equal(result.memory.textures, 0);
    assert.deepEqual(errors, []);
    fs.mkdirSync("docs/view-camera-2026-11-05", { recursive: true });
    fs.writeFileSync(
      "docs/view-camera-2026-11-05/browser.json",
      JSON.stringify(
        {
          ...result,
          errors,
          scope:
            "Actual Three directional-shadow callback and GPU uniform readback; synthetic 32px SwiftShader fixture, not tree silhouette or FPS qualification",
        },
        null,
        2,
      ),
    );
    console.log("Three primary-camera shadow readbacks pass.");
  } finally {
    clearTimeout(timer);
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
