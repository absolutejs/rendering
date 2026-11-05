const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
(async () => {
  const build = await Bun.build({
    entrypoints: ["scripts/instance-stream-entry.ts"],
    plugins:
      process.env.STREAM_MODULE || process.env.STREAM_THREE
        ? [
            {
              name: "exact-archive-module",
              setup(builder) {
                if (process.env.STREAM_MODULE)
                  builder.onResolve({ filter: /^\.\.\/src\/index$/ }, () => ({
                    path: require("node:path").resolve(
                      process.env.STREAM_MODULE,
                    ),
                  }));
                if (process.env.STREAM_THREE)
                  builder.onResolve({ filter: /^three$/ }, () => ({
                    path: require("node:path").resolve(
                      process.env.STREAM_THREE,
                    ),
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
    const result = await page.evaluate(() => window.verifyInstanceStreams());
    assert.equal(result.rows.length, 6);
    const expected = [
      [],
      [],
      [{ offset: 0, bytes: 12 }],
      [{ offset: 4, bytes: 4 }],
      [],
      [],
    ];
    result.rows.forEach((r, i) => {
      assert.equal(r.glError, 0);
      assert.deepEqual(r.uploads, expected[i]);
      assert.deepEqual(r.pendingRanges, []);
      for (const p of r.pixels)
        assert.deepEqual(p.pixel, p.visible ? [0, 255, 0, 255] : [0, 0, 0, 0]);
    });
    assert.equal(result.rows[1].version, result.rows[0].version);
    assert.equal(result.rows[4].version, result.rows[3].version);
    assert.equal(result.rows[5].version, result.rows[3].version);
    assert.equal(result.programs, 0);
    assert.deepEqual(result.resources, { geometries: 0, textures: 0 });
    assert.deepEqual(errors, []);
    fs.mkdirSync("docs/instance-stream-2026-11-05", { recursive: true });
    fs.writeFileSync(
      process.env.STREAM_REPORT ||
        "docs/instance-stream-2026-11-05/browser.json",
      JSON.stringify(
        {
          ...result,
          errors,
          scope:
            "Persistent instance storage, exact partial GPU upload bytes, pending-write coalescing and draw-count changes on bounded SwiftShader. No hardware timing claim.",
        },
        null,
        2,
      ),
    );
    console.log("Six instance-stream GPU controls pass.");
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
