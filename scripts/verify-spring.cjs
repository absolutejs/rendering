const fs = require("node:fs"),
  path = require("node:path");
const { chromium } = require("playwright");

(async () => {
  const out = process.env.SPRING_OUT;
  if (!out || fs.existsSync(out)) throw Error("Fresh SPRING_OUT required");
  fs.mkdirSync(out, { recursive: true });
  const run = {
    dir: out,
    event: (event, detail) =>
      fs.appendFileSync(
        out + "/events.ndjson",
        JSON.stringify({ event, detail }) + "\n",
      ),
    finish: (status, detail) =>
      fs.writeFileSync(
        out + "/status.json",
        JSON.stringify({ status, detail }, null, 2),
      ),
  };
  let browser;
  const errors = [],
    rows = [];
  const watchdog = setTimeout(() => void browser?.close(), 60000);
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
    for (const candidate of [false, true]) {
      const target = path.resolve(
        candidate
          ? (process.env.SPRING_ENTRY ?? "dist/spring.js")
          : "node_modules/@react-spring/three/dist/react-spring_three.modern.mjs",
      );
      const build = await Bun.build({
        entrypoints: ["tests/spring-browser.tsx"],
        target: "browser",
        minify: true,
        plugins: [
          {
            name: "spring-target",
            setup(builder) {
              builder.onResolve(
                { filter: /^spring-target-under-test$/ },
                () => ({ path: target }),
              );
            },
          },
        ],
      });
      if (!build.success) throw Error(build.logs.join("\n"));
      const page = await browser.newPage({
        viewport: { width: 320, height: 120 },
      });
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      const html = '<html><body><div id="root"></div></body></html>';
      await page.setContent(html);
      await page.addScriptTag({
        type: "module",
        content: await build.outputs[0].text(),
      });
      await page.waitForFunction(
        () => globalThis.mixedSpringLab?.snapshot().frames > 0,
      );
      await page.waitForTimeout(250);
      const before = await page.evaluate(() =>
        globalThis.mixedSpringLab.snapshot(),
      );
      if (!/SwiftShader/.test(before.renderer))
        throw Error("Software renderer required");
      await page.evaluate(() => globalThis.mixedSpringLab.web(0));
      const afterWeb = await page.evaluate(() =>
        globalThis.mixedSpringLab.snapshot(),
      );
      await page.evaluate(() => globalThis.mixedSpringLab.three());
      const afterThree = await page.evaluate(() =>
        globalThis.mixedSpringLab.snapshot(),
      );

      await page.evaluate(() => globalThis.mixedSpringLab.clock());
      await page.waitForFunction(
        () => globalThis.mixedSpringLab.snapshot().callbackValue > 0.05,
      );
      await page.evaluate(() => globalThis.mixedSpringLab.pauseClock());
      await page.waitForTimeout(100);
      const paused = await page.evaluate(() =>
        globalThis.mixedSpringLab.snapshot(),
      );
      await page.waitForTimeout(150);
      const stillPaused = await page.evaluate(() =>
        globalThis.mixedSpringLab.snapshot(),
      );
      if (
        paused.callbackValue !== stillPaused.callbackValue ||
        paused.frames !== stillPaused.frames
      )
        throw Error("Paused callback clock changed or rendered");
      await page.evaluate(() => globalThis.mixedSpringLab.resumeClock());
      await page.waitForFunction(
        () => globalThis.mixedSpringLab.snapshot().callbackValue === 1,
      );
      const resumed = await page.evaluate(() =>
        globalThis.mixedSpringLab.snapshot(),
      );
      if (resumed.frames <= stillPaused.frames)
        throw Error("Callback clock did not invalidate scene");
      await page.evaluate(() => globalThis.mixedSpringLab.removeCanvas());
      await page.waitForFunction(() => !document.querySelector("canvas"));
      const withoutCanvas = await page.evaluate(async () => {
        let complete = false;
        globalThis.mixedSpringLab.web(1).then(() => (complete = true));
        await new Promise((r) => setTimeout(r, 900));
        const s = globalThis.mixedSpringLab.snapshot();
        globalThis.mixedSpringLab.stop();
        return { ...s, complete };
      });
      const webFrames = afterWeb.frames - before.frames,
        threeFrames = afterThree.frames - afterWeb.frames;
      rows.push({
        candidate,
        before,
        afterWeb,
        afterThree,
        withoutCanvas,
        paused,
        stillPaused,
        resumed,
        webFrames,
        threeFrames,
      });
      run.event("spring.control", rows[rows.length - 1]);
      if (
        afterWeb.opacity !== 0 ||
        Math.abs(afterThree.x - 1) > 1e-6 ||
        threeFrames < 2
      )
        throw Error("Animation did not complete");
      if (
        candidate &&
        (webFrames !== 0 ||
          !withoutCanvas.complete ||
          withoutCanvas.opacity !== 1)
      )
        throw Error("Candidate DOM/Three scheduling isolation failed");
      if (!candidate && (webFrames < 2 || withoutCanvas.complete))
        throw Error("Baseline coupling was not reproduced");
      await page.evaluate(() => globalThis.mixedSpringLab.dispose());
      await page.close();
    }
    if (errors.length) throw Error(errors.join("\n"));
    fs.writeFileSync(
      run.dir + "/result.json",
      JSON.stringify(
        {
          rows,
          errors,

          scope:
            "Isolated mixed DOM/Three spring scheduler contract on a 32px software canvas. Candidate imports the built package spring entry; includes callback clock pause/resume. No FPS claim.",
        },
        null,
        2,
      ),
    );
    run.finish("completed");
  } catch (error) {
    fs.writeFileSync(
      run.dir + "/failure.json",
      JSON.stringify({ error: String(error), rows, errors }, null, 2),
    );
    run.finish("failed", String(error));
    throw error;
  } finally {
    clearTimeout(watchdog);
    await browser?.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
