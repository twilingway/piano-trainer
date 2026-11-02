export interface PointData {
  x: number;
  y: number;
}
export class Point implements PointData {
  constructor(
    public x = 0,
    public y = 0
  ) {}
  set(x = 0, y = x): this {
    this.x = x;
    this.y = y;
    return this;
  }
  copyFrom(p: PointData): this {
    return this.set(p.x, p.y);
  }
}
export class Rectangle {
  constructor(
    public x = 0,
    public y = 0,
    public width = 0,
    public height = 0
  ) {}
  contains(x: number, y: number): boolean {
    return x >= this.x && y >= this.y && x <= this.x + this.width && y <= this.y + this.height;
  }
}
export class Matrix {
  constructor(
    public a = 1,
    public b = 0,
    public c = 0,
    public d = 1,
    public tx = 0,
    public ty = 0
  ) {}
  translate(x: number, y: number): this {
    this.tx += x;
    this.ty += y;
    return this;
  }
  identity(): this {
    this.a = this.d = 1;
    this.b = this.c = this.tx = this.ty = 0;
    return this;
  }
  copyFrom(m: Matrix): this {
    Object.assign(this, m);
    return this;
  }
  append(m: Matrix): this {
    const { a, b, c, d, tx, ty } = this;
    this.a = a * m.a + c * m.b;
    this.b = b * m.a + d * m.b;
    this.c = a * m.c + c * m.d;
    this.d = b * m.c + d * m.d;
    this.tx = a * m.tx + c * m.ty + tx;
    this.ty = b * m.tx + d * m.ty + ty;
    return this;
  }
  apply(p: PointData): Point {
    return new Point(this.a * p.x + this.c * p.y + this.tx, this.b * p.x + this.d * p.y + this.ty);
  }
  applyInverse(p: PointData): Point {
    const det = this.a * this.d - this.b * this.c;
    return new Point(
      (this.d * (p.x - this.tx) - this.c * (p.y - this.ty)) / det,
      (-this.b * (p.x - this.tx) + this.a * (p.y - this.ty)) / det
    );
  }
}
