const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
(async () => {
  const build = await Bun.build({
    entrypoints: ["scripts/prepared-array-entry.ts"],
    plugins:
      process.env.ARRAY_MODULE || process.env.ARRAY_THREE
        ? [
            {
              name: "exact-archive-module",
              setup(builder) {
                if (process.env.ARRAY_MODULE)
                  builder.onResolve({ filter: /^\.\.\/src\/index$/ }, () => ({
                    path: require("node:path").resolve(
                      process.env.ARRAY_MODULE,
                    ),
                  }));
                if (process.env.ARRAY_THREE)
                  builder.onResolve({ filter: /^three$/ }, () => ({
                    path: require("node:path").resolve(process.env.ARRAY_THREE),
                  }));
              },
            },
          ]
        : [],
    target: "browser",
    minify: true,
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
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.setContent("<html></html>");
    await page.addScriptTag({ content: await build.outputs[0].text() });
    const result = await page.evaluate(() => window.verifyPreparedArrays());
    assert.equal(result.rows.length, 104);
    for (const r of result.rows) {
      if ("level" in r) {
        assert.equal(r.glError, 0);
        r.pixel.forEach((v, i) => assert(Math.abs(v - r.expected[i]) <= 2));
      } else {
        assert.equal(r.disposedTextures, 0);
        assert.equal(r.programs, 0);
      }
    }
    assert(result.unchanged);
    assert.deepEqual(result.resources, { geometries: 0, textures: 0 });
    assert.deepEqual(errors, []);
    fs.mkdirSync("docs/prepared-arrays-2026-11-05", { recursive: true });
    fs.writeFileSync(
      process.env.ARRAY_REPORT ||
        "docs/prepared-arrays-2026-11-05/browser.json",
      JSON.stringify(
        {
          ...result,
          errors,
          scope:
            "Explicit array layer/mip selection, fractional LOD, sRGB decode and disposal on 4px SwiftShader; no hardware timing claim.",
        },
        null,
        2,
      ),
    );
    console.log("100 array readbacks and four disposal cycles pass.");
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
