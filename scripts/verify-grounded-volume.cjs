const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const build = await Bun.build({
    entrypoints: ["scripts/grounded-volume-entry.ts"],
    target: "browser",
    minify: true,
    plugins: [
      {
        name: "qualified-volume",
        setup(b) {
          if (process.env.VOLUME_MODULE)
            b.onResolve({ filter: /^\.\.\/src\/index$/ }, () => ({
              path: path.resolve(process.env.VOLUME_MODULE),
            }));
          if (process.env.VOLUME_THREE)
            b.onResolve({ filter: /^three$/ }, () => ({
              path: path.resolve(process.env.VOLUME_THREE),
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
  const timer = setTimeout(() => void browser.close(), 60000),
    errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 9, height: 9 } });
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.addScriptTag({ content: await build.outputs[0].text() });
    const result = await page.evaluate(() => verifyGroundedVolumes());
    assert(result.identity.includes("SwiftShader"));
    assert.deepEqual(errors, []);
    let maxError = 0;
    for (const row of result.rows) {
      assert.equal(row.glError, 0);
      for (let i = 0; i < 3; i++) {
        const error = Math.abs(row.pixel[i] - row.expected[i]);
        maxError = Math.max(maxError, error);
        assert(error <= 2, JSON.stringify(row));
      }
      assert.equal(row.pixel[3], 255);
    }
    assert.equal(result.resources.geometries, 0);
    assert(result.resources.textures <= 1);
    assert.equal(result.programs, 0);
    const output =
      process.env.VOLUME_REPORT ||
      "docs/grounded-volume-2026-11-06/browser.json";
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(
      output,
      JSON.stringify(
        {
          ...result,
          maxError,
          errors,
          scope:
            "Ground-relative SH9 interpolation and finite falloff on rectangular grids with 2,3,8 layers; linear 9px software readbacks, not hardware performance",
        },
        null,
        2,
      ) + "\n",
    );
    console.log({
      three: result.three,
      controls: result.rows.length,
      maxError,
      resources: result.resources,
    });
  } finally {
    clearTimeout(timer);
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
