'use strict';

const GL = WebGL2RenderingContext;

class GLContext {
  constructor(canvas, options) {
    this.ctx = canvas.getContext('webgl2', options);
  }

  resize(width, height, dpr) {
    const w = (width * dpr)|0;
    const h = (height * dpr)|0;
    if (this.ctx.canvas.width !== w || this.ctx.canvas.height !== h) {
      this.ctx.canvas.width = w;
      this.ctx.canvas.height = h;
      this.ctx.canvas.style.width = `${width}px`;
      this.ctx.canvas.style.height = `${height}px`;
    }
    return { w, h };
  }

  createBuffer(data, mode) {
    const buffer = this.ctx.createBuffer();
    this.ctx.bindBuffer(GL.ARRAY_BUFFER, buffer);
    this.ctx.bufferData(GL.ARRAY_BUFFER, data, mode);
    return buffer;
  }

  compileShader(type, src) {
    const shader = this.ctx.createShader(type);
    this.ctx.shaderSource(shader, src);
    this.ctx.compileShader(shader);
    if (!this.ctx.getShaderParameter(shader, GL.COMPILE_STATUS)) {
      throw new Error(this.ctx.getShaderInfoLog(shader));
    }
    return shader;
  }

  linkProgram(...shaders) {
    const program = this.ctx.createProgram();
    for (const shader of shaders) {
      this.ctx.attachShader(program, shader);
    }
    this.ctx.linkProgram(program);
    if (!this.ctx.getProgramParameter(program, GL.LINK_STATUS)) {
      throw new Error(this.ctx.getProgramInfoLog(program));
    }
    this.ctx.validateProgram(program);
    if (!this.ctx.getProgramParameter(program, GL.VALIDATE_STATUS)) {
      throw new Error(this.ctx.getProgramInfoLog(program));
    }
    return program;
  }

  linkVertexFragmentProgram(vertex, fragment) {
    return this.linkProgram(
      this.compileShader(GL.VERTEX_SHADER, vertex),
      this.compileShader(GL.FRAGMENT_SHADER, fragment),
    );
  }
}
