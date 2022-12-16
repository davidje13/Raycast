'use strict';

const GL = WebGL2RenderingContext;

function compileShader(ctx, shader) {
  if (!shader.compiled) {
    shader.compiled = ctx.createShader(shader.type);
    ctx.shaderSource(shader.compiled, shader.src);
    ctx.compileShader(shader.compiled);
    // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#dont_check_shader_compile_status_unless_linking_fails
  }
  return shader.compiled;
}

const UNIFORM_TYPES = [
  '1f', '2f', '3f', '4f',
  '1fv', '2fv', '3fv', '4fv',
  '1i', '2i', '3i', '4i',
  '1iv', '2iv', '3iv', '4iv',
  '1ui', '2ui', '3ui', '4ui',
  '1uiv', '2uiv', '3uiv', '4uiv',
  'Matrix2fv', 'Matrix3fv', 'Matrix4fv',
];

class ProgramBuilder {
  constructor(ctx) {
    this.ctx = ctx;
    this.program = ctx.createProgram();
    this.shaders = [];
    this.uniforms = [];
    this.attributes = [];

    for (const type of UNIFORM_TYPES) {
      this[`withUniform${type}`] = (name) => {
        this.uniforms.push({ type, name });
        return this;
      };
    }
  }

  withShader(shader) {
    this.shaders.push(shader);
    return this;
  }

  withVertexShader(src) {
    return this.withShader({ type: GL.VERTEX_SHADER, src });
  }

  withFragmentShader(src) {
    return this.withShader({ type: GL.FRAGMENT_SHADER, src });
  }

  withAttribute(name) {
    this.attributes.push({ name });
    return this;
  }

  bindAttribLocation(location, name) {
    this.ctx.bindAttribLocation(this.program, location, name);
    this.attributes.push({ name, location });
    return this;
  }

  transformFeedbackVaryings(...args) {
    this.ctx.transformFeedbackVaryings(this.program, ...args);
    return this;
  }

  link() {
    const { ctx, program } = this;
    for (const shader of this.shaders) {
      ctx.attachShader(program, compileShader(ctx, shader));
    }
    ctx.linkProgram(program);
    ctx.validateProgram(program);
    if (!ctx.isContextLost()) {
      if (
        this.shaders.some(({ compiled }) => !ctx.getShaderParameter(compiled, GL.COMPILE_STATUS)) ||
        !ctx.getProgramParameter(program, GL.LINK_STATUS) ||
        !ctx.getProgramParameter(program, GL.VALIDATE_STATUS)
      ) {
        const logs = this.shaders.map(({ compiled }) => ctx.getShaderInfoLog(compiled));
        throw new Error(logs.join('\n\n') + '\n\n' + ctx.getProgramInfoLog(program));
      }
    }

    return new Program(
      ctx,
      program,
      new Map(this.uniforms.map(({ name, type }) => [name, {
        type,
        location: ctx.getUniformLocation(program, name),
      }])),
      new Map(this.attributes.map(({ name, location }) => [name, {
        location: location ?? ctx.getAttribLocation(program, name),
      }])),
    );
  }
}

class Program {
  constructor(ctx, linked, uniforms, attributes) {
    this.ctx = ctx;
    this.linked = linked;
    this.uniforms = uniforms;
    this.attributes = attributes;
  }

  vertexAttribPointer(attributeName, size, type, normalized, stride, offset, { divisor = 0 } = {}) {
    const attr = this.attributes.get(attributeName);
    if (!attr) {
      throw new Error(`Unknown attr: ${attributeName}`);
    }
    this.ctx.enableVertexAttribArray(attr.location);
    if (divisor) {
      this.ctx.vertexAttribDivisor(attr.location, divisor);
    }
    this.ctx.vertexAttribPointer(attr.location, size, type, normalized, stride, offset);
    return this;
  }

  set(uniforms) {
    for (const name in uniforms) {
      if (!this.uniforms.has(name)) {
        throw new Error(`unknown uniform: ${name}`);
      }
      const { type, location } = this.uniforms.get(name);
      const v = uniforms[name];
      if (Array.isArray(v)) {
        this.ctx[`uniform${type}`](location, ...v);
      } else if (typeof v === 'object') {
        const { index, texture } = v;
        this.ctx.uniform1i(location, index);
        this.ctx.activeTexture(GL.TEXTURE0 + index);
        this.ctx.bindTexture(GL.TEXTURE_2D, texture);
      } else {
        this.ctx[`uniform${type}`](location, v);
      }
    }
    return this;
  }

  use(uniforms = {}) {
    this.ctx.useProgram(this.linked);
    return this.set(uniforms);
  }
}

function getFloatBufferFormats(ctx) {
  if (ctx.getExtension('EXT_color_buffer_float')) {
    return {
      r: GL.R16F,
      rg: GL.RG16F,
      rgb: GL.RGB16F,
      rgba: GL.RGBA16F,
    };
  }
  const ext = ctx.getExtension('EXT_color_buffer_half_float');
  if (ext) {
    return {
      r: ext.RGBA16F_EXT,
      rg: ext.RGBA16F_EXT,
      rgb: ext.RGBA16F_EXT,
      rgba: ext.RGBA16F_EXT,
    };
  }
  return {
    r: GL.R8,
    rg: GL.RG8,
    rgb: GL.RGB8,
    rgba: GL.RGBA8,
  };
}

function createEmptyTexture(ctx, {
  wrap = GL.CLAMP_TO_EDGE,
  mag = GL.LINEAR,
  min = GL.LINEAR,
  format,
  width,
  height,
}) {
  const texture = ctx.createTexture();
  ctx.bindTexture(GL.TEXTURE_2D, texture);
  ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, wrap);
  ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, wrap);
  ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, mag);
  ctx.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, min);
  // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#use_texstorage_to_create_textures
  ctx.texStorage2D(GL.TEXTURE_2D, 1, format, width, height);
  return texture;
}

function glslRandom(name, quality) {
  // thanks, https://gaim.umbc.edu/2010/07/01/gpu-random-numbers/

  return `
  const uint s = 0x9E3779B9u;
  const uint k1 = 0xA341316Cu;
  const uint k2 = 0xC8013EA4u;
  const uint k3 = 0xAD90777Du;
  const uint k4 = 0x7E95761Eu;
  vec2 ${name}(uvec2 seed) {
    uvec2 v = seed;
    ${`
    v.x += ((v.y << 4u) + k1) ^ (v.y + s) ^ ((v.y >> 5u) + k2);
    v.y += ((v.x << 4u) + k3) ^ (v.x + s) ^ ((v.x >> 5u) + k4);
    `.repeat(quality)}
    return vec2(v & 0xFFFFu) / 65535.0;
  }`;
}
