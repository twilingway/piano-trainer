/** Clears actual GL bindings as well as renderer caches at the Three/Pixi boundary. */
export class SharedTextureBindings {
  private readonly units: number;

  constructor(private readonly gl: WebGL2RenderingContext) {
    const count: unknown = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    this.units =
      typeof count === "number" && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  }

  release(empty: WebGLTexture | null): void {
    const gl = this.gl;
    for (let index = 0; index < this.units; index++) {
      gl.activeTexture(gl.TEXTURE0 + index);
      gl.bindTexture(gl.TEXTURE_2D, empty);
    }
    gl.activeTexture(gl.TEXTURE0);
  }
}
