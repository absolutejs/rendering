const { chromium } = require("playwright");
(async () => {
  const build = await Bun.build({
    entrypoints: ["artifacts/thin-foliage/environment.ts"],
    target: "browser",
    plugins: process.env.FOLIAGE_THREE
      ? [
          {
            name: "qualified-three",
            setup(build) {
              build.onResolve({ filter: /^three$/ }, () => ({
                path: process.env.FOLIAGE_THREE,
              }));
            },
          },
        ]
      : [],
  });
  if (!build.success) throw Error(build.logs.join("\n"));
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-gpu-rasterization",
    ],
  });
  const timer = setTimeout(() => browser.close(), 45000),
    errors = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.setContent("<html></html>");
    await page.addScriptTag({
      type: "module",
      content: await build.outputs[0].text(),
    });
    await page.waitForFunction(() => globalThis.leafEnvironmentProbe);
    const identity = await page.evaluate(
      () => globalThis.leafEnvironmentProbe.identity,
    );
    if (!String(identity).includes("SwiftShader"))
      throw Error("Software renderer required");
    const result = await page.evaluate(() =>
      globalThis.leafEnvironmentProbe.run(),
    );
    if (errors.length) throw Error(errors.join("\n"));
    await Bun.write(
      process.env.FOLIAGE_ENV_REPORT || "docs/foliage-sky-0.6/environment.json",
      JSON.stringify({ identity, ...result, errors }, null, 2),
    );
    console.log({
      controls: result.visibilityRows.length,
      maxDirectEmissiveError: result.maxDirectEmissiveError,
      maxDiffuseError: Math.max(
        ...result.visibilityRows.map((r) => r.maxError),
      ),
      maxSpecularError: Math.max(
        ...result.visibilityRows.map((r) => r.maxSpecularError),
      ),
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
