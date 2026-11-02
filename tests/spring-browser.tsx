import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { animated as dom, useSpring as useWebSpring } from "@react-spring/web";
// Resolved to the installed target or isolated candidate by the runner.
import { animated, useSpring } from "spring-target-under-test";
import type { Mesh } from "three";
let frames = 0,
  mesh: Mesh | null = null,
  rendererIdentity = "",
  invalidateScene = () => {},
  callbackValue = 0;
const root = createRoot(document.getElementById("root")!);
function App() {
  const [canvas, setCanvas] = useState(true),
    [web, webApi] = useWebSpring(() => ({
      opacity: 1,
      config: { duration: 200 },
    })),
    [three, threeApi] = useSpring(() => ({
      x: 0,
      config: { duration: 200 },
    }));
  const [, clockApi] = useSpring(() => ({
    clock: 0,
    config: { duration: 600 },
    onChange: ({ value }) => {
      callbackValue = value.clock;
      invalidateScene();
    },
  }));
  useEffect(() => {
    (globalThis as any).mixedSpringLab = {
      snapshot: () => ({
        frames,
        callbackValue,
        renderer: rendererIdentity,
        x: mesh?.position.x ?? null,
        opacity: Number(
          getComputedStyle(document.getElementById("spring-panel")!).opacity,
        ),
        canvas: !!document.querySelector("canvas"),
      }),
      web: async (value: number) => {
        await Promise.all(webApi.start({ opacity: value }));
      },
      three: async () => {
        await Promise.all(threeApi.start({ x: 1 }));
      },
      clock: () => {
        void Promise.all(clockApi.start({ clock: 1 }));
      },
      pauseClock: () => clockApi.pause(),
      resumeClock: () => clockApi.resume(),
      removeCanvas: () => setCanvas(false),
      stop: () => {
        webApi.stop();
        clockApi.stop();
        threeApi.stop();
      },
      dispose: () => root.unmount(),
    };
  }, [webApi, threeApi, clockApi]);
  return (
    <>
      <dom.div id="spring-panel" style={{ opacity: web.opacity }}>
        Actual spring-driven DOM panel
      </dom.div>
      {canvas && (
        <Canvas
          frameloop="demand"
          dpr={1}
          gl={{ antialias: false }}
          camera={{ position: [0, 0, 5] }}
          style={{ width: 32, height: 32 }}
          onCreated={({ gl, invalidate }) => {
            invalidateScene = invalidate;
            const context = gl.getContext(),
              debug = context.getExtension("WEBGL_debug_renderer_info");
            rendererIdentity = debug
              ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL)
              : context.getParameter(context.RENDERER);
            const render = gl.render.bind(gl);
            gl.render = (scene, camera) => {
              frames++;
              render(scene, camera);
            };
          }}
        >
          <animated.mesh
            ref={(m: Mesh | null) => {
              mesh = m;
            }}
            position-x={three.x}
          >
            <boxGeometry />
            <meshBasicMaterial color="white" />
          </animated.mesh>
        </Canvas>
      )}
    </>
  );
}
root.render(<App />);
