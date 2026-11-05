const fs = require('node:fs'),
	path = require('node:path'),
	crypto = require('node:crypto');
const {
	chromium
} = require('playwright');
(async () => {
	const out = process.env.DESTINATION_OUT;
	if (!out || fs.existsSync(out))
		throw Error('Fresh DESTINATION_OUT required');
	fs.mkdirSync(out, { recursive: true });
	const build = await Bun.build({
		entrypoints: ['tests/browser.ts'],
		target: 'browser',
		minify: true
	});
	if (!build.success) throw Error(build.logs.join('\n'));
	const source = await build.outputs[0].text();
	const server = Bun.serve({
		hostname: '127.0.0.1',
		port: 0,
		fetch: () =>
			new Response(
				'<html><head><link rel="icon" href="data:,"></head><body></body></html>',
				{ headers: { 'Content-Type': 'text/html' } }
			)
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
				'--use-angle=swiftshader',
				'--enable-unsafe-swiftshader',
				'--disable-gpu-rasterization'
			]
		});
		const page = await browser.newPage();
		page.on('pageerror', (e) => errors.push(String(e)));
		page.on('console', (m) => {
			if (m.type() === 'error') errors.push(m.text());
		});
		await page.goto(`http://127.0.0.1:${server.port}`);
		await page.evaluate((value) => {
			globalThis.__destinationFix = value;
		}, process.env.DESTINATION_FIX === '1');
		await page.addScriptTag({ content: source });
		await page.waitForFunction(
			() => globalThis.destinationComparison,
			null,
			{
				timeout: 20000
			}
		);
		const result = await page.evaluate(
			() => globalThis.destinationComparison
		);
		result.errors = errors;
		result.bundleSha256 = crypto
			.createHash('sha256')
			.update(source)
			.digest('hex');
		fs.writeFileSync(
			path.join(out, 'result.json'),
			JSON.stringify(result, null, 2) + '\n'
		);
		if (errors.length || result.disposed.geometries !== 0 || result.disposed.textures !== 0 || !result.passed)
			throw Error('Unexpected destination comparison result');
		console.log(JSON.stringify({passed:result.passed,draws:result.rows.length,stablePrograms:result.stablePrograms,disposed:result.disposed}));
	} finally {
		clearTimeout(watchdog);
		await browser?.close();
		server.stop(true);
	}
})().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
