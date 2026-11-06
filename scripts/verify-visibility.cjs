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
          let payload;
          worker.onmessage = (e) => {
            if (e.data.mask) {
              payload = e.data;
              return;
            }
            clearTimeout(timer);
            worker.terminate();
            resolve(e.data.error ? e.data : { ...payload, ...e.data });
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
    assert.equal(result.indexed.revision, "worker-bounds:1");
    assert.equal(result.indexed.status, "complete");
    assert.deepEqual(result.indexed.candidates, [{ id: 7, near: 1, far: 2 }]);
    assert.equal(result.limitedIndex.status, "budget-exhausted");
    assert.equal(result.limitedIndex.candidates, null);
    assert.equal(result.limitedIndex.boundsTests, 0);
    assert.equal(result.indexSizeAfterDispose, 0);
    assert.equal(result.disposedIndexRejected, true);
    assert.equal(result.detachedMaskBytes, 0);
    assert.equal(result.retainedMaskBytes, 8);
    assert.equal(result.mask.packed.length, 8);
    assert.equal(result.mask.state, "complete");
    assert.equal(result.mask.revision, result.probe.revision);
    for (let i = 0; i < 32; i++)
      assert(
        [1, 2].includes((result.mask.packed[i >> 2] >> ((i & 3) * 2)) & 3),
      );
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
    assert.deepEqual(result.probe, result.single);
    assert.equal(result.probe.state, "complete");
    assert.equal(result.probe.unresolved, 0);
    assert.equal(result.cancelled.state, "cancelled");
    assert.equal(result.cancelled.processed, 1);
    assert.equal(result.cancelled.accessibility, null);
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
