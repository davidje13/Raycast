const GL = WebGL2RenderingContext;

class GLContext {
  constructor(canvas, options) {
    this.ctx = canvas.getContext('webgl2', options);

    this.quad = this.createBuffer(new Float32Array([
      -1.0, -1.0,
      1.0, -1.0,
      -1.0, 1.0,
      1.0, 1.0,
    ]));
  }

  resize(width, height, dpr) {
    this.ctx.canvas.width = width * dpr;
    this.ctx.canvas.height = height * dpr;
    this.ctx.canvas.style.width = `${width}px`;
    this.ctx.canvas.style.height = `${height}px`;
    this.ctx.viewport(0, 0, width * dpr, height * dpr);
  }

  createBuffer(data) {
    const buffer = this.ctx.createBuffer();
    this.ctx.bindBuffer(GL.ARRAY_BUFFER, buffer);
    this.ctx.bufferData(GL.ARRAY_BUFFER, data, GL.STATIC_DRAW);
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
    return program;
  }

  linkVertexFragmentProgram(vertex, fragment) {
    return this.linkProgram(
      this.compileShader(GL.VERTEX_SHADER, vertex),
      this.compileShader(GL.FRAGMENT_SHADER, fragment),
    );
  }

  drawQuad(vertexAttrib = false) {
    if (vertexAttrib !== false) {
      this.ctx.enableVertexAttribArray(vertexAttrib);
      this.ctx.vertexAttribPointer(vertexAttrib, 2, GL.FLOAT, false, 0, 0);
    }
    this.ctx.bindBuffer(GL.ARRAY_BUFFER, this.quad);
    this.ctx.drawArrays(GL.TRIANGLE_STRIP, 0, 4);
  }
}
