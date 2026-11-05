import { Vector3, type Camera, type Object3D } from "three";
/** Stable uniform objects shared by beauty and shadow shaders. Direction points
 * from the view into its camera (+Z in camera-local coordinates). Call update for
 * an explicit view or bindViewCamera to follow Three's actual render callbacks. */
export function createViewCameraState() {
  const position = { value: new Vector3() },
    direction = { value: new Vector3(0, 0, 1) },
    orthographic = { value: false };
  return {
    position,
    direction,
    orthographic,
    update(camera: Camera) {
      const c = camera as Camera & {
        isPerspectiveCamera?: boolean;
        isOrthographicCamera?: boolean;
        isArrayCamera?: boolean;
      };
      if (
        !c ||
        c.isArrayCamera ||
        (!c.isPerspectiveCamera && !c.isOrthographicCamera)
      )
        throw Error(
          "View state requires a single perspective or orthographic camera",
        );
      c.updateWorldMatrix(true, false);
      const e = c.matrixWorld.elements;
      if (!e.every(Number.isFinite) || Math.hypot(e[8]!, e[9]!, e[10]!) < 1e-12)
        throw Error("Invalid view camera transform");
      position.value.setFromMatrixPosition(c.matrixWorld);
      direction.value.setFromMatrixColumn(c.matrixWorld, 2).normalize();
      orthographic.value = c.isOrthographicCamera === true;
    },
  };
}
export type ViewCameraState = ReturnType<typeof createViewCameraState>;
type Binding = {
  state: ViewCameraState;
  render: Object3D["onBeforeRender"];
  shadow: Object3D["onBeforeShadow"];
  dispose: () => void;
};
const bindings = new WeakMap<Object3D, Binding>();
/** Bind on an owned render object, not a global frame loop. Shadow callbacks use
 * their primary camera argument, never the light's shadowCamera. Existing hooks
 * retain their receiver/arguments; disposal only restores callbacks still owned. */
export function bindViewCamera(
  object: Object3D,
  state: ViewCameraState,
): () => void {
  if (!object?.isObject3D || !state || typeof state.update !== "function")
    throw Error("Invalid view camera binding");
  const existing = bindings.get(object);
  if (
    existing &&
    (object.onBeforeRender === existing.render ||
      object.onBeforeShadow === existing.shadow)
  ) {
    if (
      object.onBeforeRender !== existing.render ||
      object.onBeforeShadow !== existing.shadow ||
      existing.state !== state
    )
      throw Error(
        "Render object already owns a different or partially replaced view binding",
      );
    return existing.dispose;
  }
  const beforeRender = object.onBeforeRender,
    beforeShadow = object.onBeforeShadow;
  let disposed = false;
  const render: Object3D["onBeforeRender"] = function (
    this: Object3D,
    ...args
  ) {
    beforeRender.apply(this, args);
    state.update(args[2]);
  };
  const shadow: Object3D["onBeforeShadow"] = function (
    this: Object3D,
    ...args
  ) {
    beforeShadow.apply(this, args);
    state.update(args[2]);
  };
  const binding: Binding = {
    state,
    render,
    shadow,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (object.onBeforeRender === render)
        object.onBeforeRender = beforeRender;
      if (object.onBeforeShadow === shadow)
        object.onBeforeShadow = beforeShadow;
      if (bindings.get(object) === binding) bindings.delete(object);
    },
  };
  object.onBeforeRender = render;
  object.onBeforeShadow = shadow;
  bindings.set(object, binding);
  return binding.dispose;
}
