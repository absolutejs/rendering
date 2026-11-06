const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const build = await Bun.build({
    entrypoints: ["scripts/rooted-bend-entry.ts"],
    target: "browser",
    plugins: [
      {
        name: "qualified-inputs",
        setup(builder) {
          if (process.env.ROOTED_MODULE)
            builder.onResolve({ filter: /^\.\.\/src\/index$/ }, () => ({
              path: path.resolve(process.env.ROOTED_MODULE),
            }));
          if (process.env.ROOTED_THREE)
            builder.onResolve({ filter: /^three$/ }, () => ({
              path: path.resolve(process.env.ROOTED_THREE),
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
    const result = await page.evaluate(() => window.verifyRootedBend());
    assert.equal(result.rows.length, 20);
    assert(result.restorationExact);
    assert(result.maximumError < 0.0001);
    assert(result.changedPixels > 20);
    assert.equal(result.glError, 0);
    assert.deepEqual(result.resources, {
      geometries: 0,
      textures: result.baselineTextures,
    });
    assert.equal(result.programs, 0);
    result.rows.forEach((row) => assert.equal(row.glError, 0));
    assert.deepEqual(errors, []);
    const report =
      process.env.ROOTED_REPORT || "docs/rooted-bend-2026-11-06/browser.json";
    fs.mkdirSync(path.dirname(report), { recursive: true });
    fs.writeFileSync(
      report,
      JSON.stringify({ ...result, errors }, null, 2) + "\n",
    );
    console.log({
      controls: result.rows.length,
      maximumError: result.maximumError,
      resources: result.resources,
      errors,
    });
  } finally {
    clearTimeout(timer);
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
