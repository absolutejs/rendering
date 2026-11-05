const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { chromium } = require("playwright");
(async () => {
  const out = process.env.TRIPLANAR_OUT;
  if (!out || fs.existsSync(out)) throw Error("Fresh TRIPLANAR_OUT required");
  fs.mkdirSync(out, { recursive: true });
  const moduleUnderTest = process.env.TRIPLANAR_MODULE
    ? path.resolve(process.env.TRIPLANAR_MODULE)
    : null;
  const build = await Bun.build({
    plugins: moduleUnderTest
      ? [
          {
            name: "explicit-archive-module",
            setup(builder) {
              builder.onResolve({ filter: /^\.\.\/src$/ }, () => ({
                path: moduleUnderTest,
              }));
              builder.onResolve({ filter: /^three$/ }, () => ({
                path: path.resolve("node_modules/three/build/three.module.js"),
              }));
            },
          },
        ]
      : [],
    entrypoints: ["tests/object-triplanar-browser.ts"],
    target: "browser",
    minify: true,
  });
  if (!build.success) throw Error(build.logs.join("\n"));
  const source = await build.outputs[0].text();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        '<html><head><link rel="icon" href="data:,"></head><body></body></html>',
        { headers: { "Content-Type": "text/html" } },
      ),
  });
  let browser;
  const watchdog = setTimeout(() => void browser?.close(), 60000);
  const errors = [];
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.CHROMIUM_EXECUTABLE ?? chromium.executablePath(),
      args: [
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--disable-gpu-rasterization",
      ],
    });
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(`http://127.0.0.1:${server.port}`);
    await page.addScriptTag({ content: source });
    await page.waitForFunction(() => globalThis.triplanarResult, null, {
      timeout: 20000,
    });
    const result = await page.evaluate(() => globalThis.triplanarResult);
    result.errors = errors;
    result.moduleUnderTest = moduleUnderTest ?? "src/index.ts";
    result.moduleSha256 = moduleUnderTest
      ? crypto
          .createHash("sha256")
          .update(fs.readFileSync(moduleUnderTest))
          .digest("hex")
      : null;
    result.bundleSha256 = crypto
      .createHash("sha256")
      .update(source)
      .digest("hex");
    fs.writeFileSync(
      path.join(out, "result.json"),
      JSON.stringify(result, null, 2) + "\n",
    );
    if (errors.length || !result.passed)
      throw Error("Triplanar browser qualification failed");
    console.log(
      JSON.stringify({
        passed: result.passed,
        cases: result.cases.length,
        renderer: result.renderer,
      }),
    );
  } finally {
    clearTimeout(watchdog);
    await browser?.close();
    server.stop(true);
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
