const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
(async () => {
  const build = await Bun.build({
    entrypoints: ["scripts/visibility-worker.ts"],
    target: "browser",
    minify: true,
    plugins: [
      {
        name: "qualified-visibility-inputs",
        setup(builder) {
          if (process.env.VISIBILITY_MODULE)
            builder.onResolve({ filter: /^\.\.\/src\/visibility$/ }, () => ({
              path: require("node:path").resolve(process.env.VISIBILITY_MODULE),
            }));
          if (process.env.VISIBILITY_THREE)
            builder.onResolve({ filter: /^three$/ }, () => ({
              path: require("node:path").resolve(process.env.VISIBILITY_THREE),
            }));
        },
      },
    ],
  });
  assert(build.success, String(build.logs));
  const code = await build.outputs[0].text();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      return new URL(request.url).pathname === "/worker.js"
        ? new Response(code, { headers: { "content-type": "text/javascript" } })
        : new Response("<html></html>", {
            headers: { "content-type": "text/html" },
          });
    },
  });
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
    await page.goto(`http://127.0.0.1:${server.port}`);
    const result = await page.evaluate(
      (code) =>
        new Promise((resolve, reject) => {
          const url = "/worker.js";
          const worker = new Worker(url, { type: "module" });
          const timer = setTimeout(() => {
            worker.terminate();
            reject(Error("Worker deadline"));
          }, 10000);
          worker.onmessage = (e) => {
            clearTimeout(timer);
            worker.terminate();
            resolve(e.data);
          };
          worker.onerror = (e) => {
            clearTimeout(timer);
            worker.terminate();
            reject(
              Error(
                JSON.stringify({
                  message: e.message,
                  filename: e.filename,
                  lineno: e.lineno,
                  colno: e.colno,
                }),
              ),
            );
          };
          worker.postMessage({});
        }),
      code,
    );
    assert(!result.error, result.error);
    assert.equal(result.realm, "undefined");
    assert.deepEqual(
      result.rows.map((r) => r.status),
      ["occluded", "clear", "budget-exhausted"],
    );
    assert.equal(result.rows[0].hitDistance, 2);
    assert.equal(result.deformed.status, "occluded");
    assert.equal(result.deformed.hitDistance, 2);
    assert.equal(result.recoveredError, true);
    assert.equal(result.recovered.status, "occluded");
    assert.equal(result.recovered.hitDistance, 2);
    assert.equal(result.releasedBytes, 0);
    assert.equal(result.originalIndex, null);
    assert.deepEqual(errors, []);
    fs.mkdirSync("docs/visibility-2026-11-05", { recursive: true });
    fs.writeFileSync(
      process.env.VISIBILITY_REPORT ||
        "docs/visibility-2026-11-05/browser-worker.json",
      JSON.stringify(
        {
          ...result,
          errors,
          bundleBytes: build.outputs[0].size,
          scope:
            "Real browser module worker, CPU query, no WebGL context or FPS claim",
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "Module-worker cutout visibility, work-budget and disposal controls pass.",
    );
  } finally {
    clearTimeout(deadline);
    await browser.close();
    server.stop(true);
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
