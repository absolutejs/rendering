import {
	WebGLRenderer,
	ShaderChunk,
	Scene,
	OrthographicCamera,
	PlaneGeometry,
	Mesh,
	MeshBasicMaterial,
	DataTexture,
	WebGLRenderTarget
} from 'three';
import {
	bindAlphaToCoverageDestination,
	cloneRenderMaterial
} from '../dist/index.js';
const fixed = (globalThis as any).__destinationFix === true;
const canvas = document.createElement('canvas');
const context = canvas.getContext('webgl2', {alpha:false,antialias:true});
if(!context) throw Error('WebGL 2 required');
const renderer = new WebGLRenderer({canvas,context});
function configureBakedVisibilityCoverage(material: MeshBasicMaterial, enabled:boolean) {
 material.alphaToCoverage=enabled;
 if(!enabled)return;
 material.onBeforeCompile=shader=>{
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',ShaderChunk.alphatest_fragment.replace('smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a )','clamp(diffuseColor.a, 0., 1.)'));
 };
 material.customProgramCacheKey=()=> 'visibility-control';
}
function readTargetPixelsScoped(renderer:WebGLRenderer,target:WebGLRenderTarget,width:number,height:number,pixels:Uint8Array) {
 renderer.setRenderTarget(null);
 try {renderer.readRenderTargetPixels(target,0,0,width,height,pixels);}
 finally {renderer.setRenderTarget(target);}
}
renderer.setSize(16, 16);
const ctx = renderer.getContext(),
	debug = ctx.getExtension('WEBGL_debug_renderer_info');
const identity = ctx.getParameter(
	debug ? debug.UNMASKED_RENDERER_WEBGL : ctx.RENDERER
);
if (!/SwiftShader/.test(identity)) throw Error('Software renderer required');
const scene = new Scene(),
	camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 2;
const geometry = new PlaneGeometry(2, 2),
	target = new WebGLRenderTarget(16, 16, { samples: 0 }),
	sampled = new WebGLRenderTarget(16, 16, { samples: 4 });
const rows = [],
	programs = [];
for (const alpha of [0.25, 0.5, 0.75]) {
	const texture = new DataTexture(
		new Uint8Array([255, 255, 255, Math.round(alpha * 255)]),
		1,
		1
	);
	texture.needsUpdate = true;
	for (const configured of [true, false])
		for (const cloned of [false, true]) {
			const source = new MeshBasicMaterial({
				map: texture,
				alphaTest: 0.35
			});
			configureBakedVisibilityCoverage(source, configured);
			if (fixed && configured) bindAlphaToCoverageDestination(source);
			const material = cloned ? cloneRenderMaterial(source) : source;
			const mesh = new Mesh(geometry, material);
			scene.add(mesh);
			let warmPrograms = 0;
			for (let cycle = 0; cycle < 4; cycle++) {
				for (const destination of [
					'canvas',
					'offscreen',
					'sampled-target',
					'canvas-return'
				]) {
					const output =
						destination === 'offscreen'
							? target
							: destination === 'sampled-target'
								? sampled
								: null;
					renderer.setRenderTarget(output);
					const drawSamples = ctx.getParameter(ctx.SAMPLES);
					renderer.render(scene, camera);
					const pixels = new Uint8Array(16 * 16 * 4);
					if (output)
						readTargetPixelsScoped(
							renderer,
							output,
							16,
							16,
							pixels
						);
					else
						ctx.readPixels(
							0,
							0,
							16,
							16,
							ctx.RGBA,
							ctx.UNSIGNED_BYTE,
							pixels
						);
					let coverage = 0;
					for (let i = 0; i < pixels.length; i += 4)
						coverage += pixels[i]! / (255 * 256);
					const expected =
						configured && drawSamples > 0
							? alpha
							: alpha > 0.35
								? 1
								: 0;
					rows.push({
						alpha,
						configured,
						cloned,
						cycle,
						destination,
						drawSamples,
						coverage,
						expected,
						alphaToCoverage: material.alphaToCoverage
					});
				}
				const count = renderer.info.programs?.length ?? 0;
				if (cycle === 0) warmPrograms = count;
				programs.push({
					alpha,
					configured,
					cloned,
					cycle,
					count,
					warmPrograms
				});
			}
			scene.remove(mesh);
			material.dispose();
			if (cloned) source.dispose();
		}
	texture.dispose();
}
geometry.dispose();
target.dispose();
sampled.dispose();
const disposed = { ...renderer.info.memory };
renderer.dispose();
const coveragePass = rows.every(
	(r) => Math.abs(r.coverage - r.expected) <= 1 / 255 + 1e-6
);
const stablePrograms = programs.every((r) => r.count === r.warmPrograms);
(globalThis as any).destinationComparison = {
	identity,
	fixed,
	passed: (fixed ? coveragePass : !coveragePass) && stablePrograms,
	coveragePass,
	stablePrograms,
	rows,
	programs,
	disposed
};
