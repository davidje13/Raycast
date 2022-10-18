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

  compileShader(type, src) {
    const shader = this.ctx.createShader(type);
    this.ctx.shaderSource(shader, src);
    this.ctx.compileShader(shader);
    return shader;
  }

  linkProgram(shaders, prelink) {
    // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#dont_check_shader_compile_status_unless_linking_fails
    const program = this.ctx.createProgram();
    for (const shader of shaders) {
      this.ctx.attachShader(program, shader);
    }
    prelink?.(program);
    this.ctx.linkProgram(program);
    this.ctx.validateProgram(program);
    if (
      shaders.some((shader) => !this.ctx.getShaderParameter(shader, GL.COMPILE_STATUS)) ||
      !this.ctx.getProgramParameter(program, GL.LINK_STATUS) ||
      !this.ctx.getProgramParameter(program, GL.VALIDATE_STATUS)
    ) {
      const logs = shaders.map((s) => this.ctx.getShaderInfoLog(s));
      throw new Error(logs.join('\n\n') + '\n\n' + this.ctx.getProgramInfoLog(program));
    }
    return program;
  }

  linkVertexFragmentProgram(vertex, fragment, prelink) {
    return this.linkProgram([
      this.compileShader(GL.VERTEX_SHADER, vertex),
      this.compileShader(GL.FRAGMENT_SHADER, fragment),
    ], prelink);
  }
}
