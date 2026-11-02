import { Group } from "three";
import { Matrix, Point, Rectangle, type PointData } from "./math";
export interface FederatedPointerEvent extends PointData {
  global: PointData;
  target: Container;
  pointerType: string;
  timeStamp: number;
  clientX: number;
  clientY: number;
  pointerId: number;
  buttons: number;
  nativeEvent: PointerEvent;
  stopPropagation(): void;
  preventDefault(): void;
}
export interface DestroyOptions {
  children?: boolean;
  texture?: boolean;
  textureSource?: boolean;
  context?: boolean;
}
export class BlurFilter {
  readonly strength: number;
  readonly quality: number;
  readonly blendMode: string;
  constructor(options: { strength?: number; quality?: number; blendMode?: string } = {}) {
    this.strength = options.strength ?? 8;
    this.quality = options.quality ?? 4;
    this.blendMode = options.blendMode ?? "normal";
  }
  destroy(): void {
    /* Programs belong to the renderer; the filter owns no allocation. */
  }
}
type Listener = (event: FederatedPointerEvent) => void;
export class Container {
  readonly native = new Group();
  readonly children: Container[] = [];
  parent: Container | null = null;
  readonly position = new Point();
  readonly scale = new Point(1, 1);
  readonly pivot = new Point();
  readonly skew = new Point();
  rotation = 0;
  alpha = 1;
  visible = true;
  renderable = true;
  zIndex = 0;
  sortableChildren = false;
  eventMode = "auto";
  cursor = "";
  label = "";
  hitArea: Rectangle | null = null;
  mask: Container | null = null;
  filters: BlurFilter[] = [];
  blendMode = "normal";
  destroyed = false;
  readonly listeners = new Map<string, Set<Listener>>();
  constructor(options: { sortableChildren?: boolean; eventMode?: string; label?: string } = {}) {
    Object.assign(this, options);
    this.native.matrixAutoUpdate = false;
  }
  get x(): number {
    return this.position.x;
  }
  set x(value: number) {
    this.position.x = value;
  }
  get y(): number {
    return this.position.y;
  }
  set y(value: number) {
    this.position.y = value;
  }
  get width(): number {
    return this.getLocalBounds().width * Math.abs(this.scale.x);
  }
  set width(value: number) {
    const width = this.getLocalBounds().width;
    this.scale.x = width ? value / width : 1;
  }
  get height(): number {
    return this.getLocalBounds().height * Math.abs(this.scale.y);
  }
  set height(value: number) {
    const height = this.getLocalBounds().height;
    this.scale.y = height ? value / height : 1;
  }
  setSize(width: number, height = width): void {
    this.width = width;
    this.height = height;
  }
  addChild<T extends Container>(...nodes: T[]): T {
    for (const node of nodes) {
      node.parent?.removeChild(node);
      this.children.push(node);
      node.parent = this;
      this.native.add(node.native);
    }
    const first = nodes[0];
    if (!first) throw new RangeError("At least one child is required");
    return first;
  }
  addChildAt<T extends Container>(node: T, index: number): T {
    this.addChild(node);
    this.children.splice(this.children.indexOf(node), 1);
    this.children.splice(index, 0, node);
    return node;
  }
  removeChild<T extends Container>(node: T, ...others: Container[]): T {
    for (const child of others) this.removeChild(child);
    const index = this.children.indexOf(node);
    if (index >= 0) {
      this.children.splice(index, 1);
      node.parent = null;
      this.native.remove(node.native);
    }
    return node;
  }
  removeChildren(): Container[] {
    const old = [...this.children];
    for (const child of old) this.removeChild(child);
    return old;
  }
  removeChildAt(index: number): Container {
    const child = this.children[index];
    if (!child) throw new RangeError("Child index");
    return this.removeChild(child);
  }
  sortChildren(): void {
    this.children.sort((a, b) => a.zIndex - b.zIndex);
  }
  getGlobalTransform(matrix: Matrix): Matrix {
    return matrix.copyFrom(this.worldMatrix());
  }
  getChildIndex(node: Container): number {
    return this.children.indexOf(node);
  }
  setChildIndex(node: Container, index: number): void {
    if (node.parent !== this) return;
    this.children.splice(this.children.indexOf(node), 1);
    this.children.splice(index, 0, node);
  }
  on(name: string, listener: Listener): this {
    let list = this.listeners.get(name);
    if (!list) {
      list = new Set();
      this.listeners.set(name, list);
    }
    list.add(listener);
    return this;
  }
  once(name: string, listener: Listener): this {
    const once: Listener = (event) => {
      this.off(name, once);
      listener(event);
    };
    return this.on(name, once);
  }
  off(name: string, listener: Listener): this {
    this.listeners.get(name)?.delete(listener);
    return this;
  }
  emit(name: string, event?: FederatedPointerEvent): void {
    for (const listener of this.listeners.get(name) ?? []) {
      if (event) listener(event);
      else (listener as () => void)();
    }
  }
  localMatrix(): Matrix {
    const a = Math.cos(this.rotation + this.skew.y) * this.scale.x,
      b = Math.sin(this.rotation + this.skew.y) * this.scale.x;
    const c = -Math.sin(this.rotation - this.skew.x) * this.scale.y,
      d = Math.cos(this.rotation - this.skew.x) * this.scale.y;
    return new Matrix(
      a,
      b,
      c,
      d,
      this.x - this.pivot.x * a - this.pivot.y * c,
      this.y - this.pivot.x * b - this.pivot.y * d
    );
  }
  worldMatrix(): Matrix {
    return this.parent ? this.parent.worldMatrix().append(this.localMatrix()) : this.localMatrix();
  }
  toLocal(point: PointData, from?: Container): Point {
    return this.worldMatrix().applyInverse(from ? from.toGlobal(point) : point);
  }
  toGlobal(point: PointData): Point {
    return this.worldMatrix().apply(point);
  }
  getLocalBounds(): Rectangle {
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (const child of this.children) {
      const b = child.getLocalBounds(),
        m = child.localMatrix();
      for (const p of [
        m.apply(b),
        m.apply({ x: b.x + b.width, y: b.y }),
        m.apply({ x: b.x + b.width, y: b.y + b.height }),
        m.apply({ x: b.x, y: b.y + b.height })
      ]) {
        left = Math.min(left, p.x);
        top = Math.min(top, p.y);
        right = Math.max(right, p.x);
        bottom = Math.max(bottom, p.y);
      }
    }
    return Number.isFinite(left)
      ? new Rectangle(left, top, right - left, bottom - top)
      : new Rectangle();
  }
  destroy(options: DestroyOptions | boolean = {}): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.parent?.removeChild(this);
    if (options === true || (typeof options === "object" && options.children))
      for (const child of [...this.children]) child.destroy(options);
    this.removeChildren();
    this.emit("destroyed");
    this.listeners.clear();
  }
}
