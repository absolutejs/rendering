import { expect, test } from "bun:test";
import {
  Camera,
  ArrayCamera,
  PerspectiveCamera,
  OrthographicCamera,
  Group,
  Mesh,
} from "three";
import { createViewCameraState, bindViewCamera } from "../src/viewCamera";
test("view state reads parented camera world transforms without replacing uniform objects", () => {
  const state = createViewCameraState(),
    parent = new Group(),
    camera = new PerspectiveCamera();
  parent.position.set(10, 20, 30);
  parent.rotation.y = Math.PI / 2;
  camera.position.z = 5;
  parent.add(camera);
  const position = state.position,
    direction = state.direction;
  state.update(camera);
  expect(state.position).toBe(position);
  expect(state.direction).toBe(direction);
  expect(state.position.value.x).toBeCloseTo(15, 10);
  expect(state.position.value.y).toBe(20);
  expect(state.position.value.z).toBeCloseTo(30, 10);
  expect(state.direction.value.x).toBeCloseTo(1, 10);
  expect(state.orthographic.value).toBe(false);
  state.update(new OrthographicCamera());
  expect(state.orthographic.value).toBe(true);
  for (const unsupported of [new Camera(), new ArrayCamera()])
    expect(() => state.update(unsupported)).toThrow();
  const bad = new PerspectiveCamera();
  bad.position.x = NaN;
  expect(() => state.update(bad)).toThrow();
});
test("render/shadow hooks use primary camera, compose prior hooks and restore owned callbacks", () => {
  const object = new Mesh(),
    main = new PerspectiveCamera(),
    light = new OrthographicCamera(),
    state = createViewCameraState();
  main.position.set(1, 2, 3);
  light.position.set(90, 80, 70);
  let renderCalls = 0,
    shadowCalls = 0;
  const render = (object.onBeforeRender = function () {
    expect(this).toBe(object);
    renderCalls++;
  });
  const shadow = (object.onBeforeShadow = function (...args) {
    expect(this).toBe(object);
    expect(args[3]).toBe(light);
    shadowCalls++;
  });
  const stop = bindViewCamera(object, state);
  expect(bindViewCamera(object, state)).toBe(stop);
  expect(() => bindViewCamera(object, createViewCameraState())).toThrow();
  object.onBeforeRender(
    {} as any,
    {} as any,
    main,
    {} as any,
    {} as any,
    {} as any,
  );
  expect(state.position.value.toArray()).toEqual([1, 2, 3]);
  main.position.y = 4;
  object.onBeforeShadow(
    {} as any,
    object,
    main,
    light,
    {} as any,
    {} as any,
    {} as any,
  );
  expect(state.position.value.toArray()).toEqual([1, 4, 3]);
  expect(state.orthographic.value).toBe(false);
  expect(renderCalls).toBe(1);
  expect(shadowCalls).toBe(1);
  stop();
  stop();
  expect(object.onBeforeRender).toBe(render);
  expect(object.onBeforeShadow).toBe(shadow);
});
test("disposing view ownership preserves a later callback owner", () => {
  const object = new Mesh(),
    stop = bindViewCamera(object, createViewCameraState()),
    later = () => {};
  object.onBeforeRender = later;
  expect(() => bindViewCamera(object, createViewCameraState())).toThrow();
  stop();
  expect(object.onBeforeRender).toBe(later);
});
