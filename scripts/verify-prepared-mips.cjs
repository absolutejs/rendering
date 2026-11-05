const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
(async () => {
  const build = await Bun.build({
    entrypoints: ["scripts/prepared-mips-entry.ts"],
    plugins: process.env.MIPS_MODULE
      ? [
          {
            name: "exact-archive-module",
            setup(builder) {
              builder.onResolve({ filter: /^\.\.\/src\/index$/ }, () => ({
                path: require("node:path").resolve(process.env.MIPS_MODULE),
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
    await page.setContent("<html></html>");
    await page.addScriptTag({ content: await build.outputs[0].text() });
    const result = await page.evaluate(() => window.verifyPreparedMips());
    for (const r of result.rows) {
      if ("level" in r) {
        assert.deepEqual(r.pixel, [
          r.level === 0 ? 255 : 0,
          r.level === 1 ? 255 : 0,
          r.level === 2 ? 255 : 0,
          255,
        ]);
        assert.equal(r.textures, 1);
      } else assert.equal(r.disposedTextures, 0);
    }
    assert(result.unchanged && result.sourceUnchanged);
    assert.equal(result.glError, 0);
    assert.deepEqual(errors, []);
    fs.mkdirSync("docs/alpha-mips-2026-11-05", { recursive: true });
    fs.writeFileSync(
      "docs/alpha-mips-2026-11-05/browser.json",
      JSON.stringify(
        {
          ...result,
          errors,
          scope:
            "Three explicit mip sampling and disposal on a 4px SwiftShader canvas; no hardware timing claim.",
        },
        null,
        2,
      ),
    );
    console.log("Nine mip readbacks and three disposal cycles pass.");
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
