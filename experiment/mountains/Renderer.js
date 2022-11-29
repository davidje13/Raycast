'use strict';

const NOISE_SIZE = 1024;

const RENDER_VERT = `#version 300 es
precision mediump float;

uniform vec2 fov;
in vec2 v;
out vec2 pfov;

void main(void) {
  pfov = v * fov;
  gl_Position = vec4(v, 0.0, 1.0);
}`;

const RENDER_FRAG_NOISE = `#version 300 es
precision mediump float;

out vec4 col;

${glslRandom('random', 6)}

void main(void) {
  col = vec4(random(uvec2(gl_FragCoord.x, gl_FragCoord.y)), 0.0, 1.0);
}`;

const RENDER_FRAG_TERRAIN = `#version 300 es
precision mediump float;

#define SMOOTHNESS 2

uniform sampler2D noise;
uniform vec3 origin;
uniform mat3 view;
uniform float terrainHeight;
uniform float waterHeight;
uniform float PERLIN_FLAT_CLIFFS;
uniform float PERLIN_FLAT_PEAKS;
uniform float PERLIN_GAMMA;
const vec3 sun = normalize(vec3(-1.0, 0.0, 0.3));

const float PERLIN_ZOOM = 0.4;
const float PERLIN_SCALE = 1.92;
const float PERLIN_DIVIDE = 2.0;
const float PERLIN_SHIFT_ANGLE = 0.7;
const float PERLIN_LARGE_ZOOM = 0.17;
const float PERLIN_LARGE_HEIGHT = 1.5;

in vec2 pfov;
out vec4 col;

vec3 noiseAndGrad(vec2 pos) {
  vec2 f = fract(pos);
  ivec2 c = ivec2(floor(pos));
  float p00 = texelFetch(noise, c & ${NOISE_SIZE - 1}, 0).x;
  float p01 = texelFetch(noise, (c + ivec2(0, 1)) & ${NOISE_SIZE - 1}, 0).x - p00;
  float p10 = texelFetch(noise, (c + ivec2(1, 0)) & ${NOISE_SIZE - 1}, 0).x - p00;
  float p11 = texelFetch(noise, (c + ivec2(1, 1)) & ${NOISE_SIZE - 1}, 0).x - p01 - p10 - p00;

#if SMOOTHNESS == 0
  // 0 to 1, symmetric
  vec2 m = f;
  vec2 dm = vec2(1.0);
#elif SMOOTHNESS == 1
  // 0 to 1, grad = 0 at 0 and 1, symmetric
  vec2 m = (3.0 - 2.0 * f) * f * f;
  vec2 dm = 6.0 * f * (1.0 - f);
#elif SMOOTHNESS == 2
  // 0 to 1, grad & grad^2 = 0 at 0 and 1, symmetric
  vec2 m = ((6.0 * f - 15.0) * f + 10.0) * f * f * f;
  vec2 dm = ((f - 2.0) * f * 30.0 + 30.0) * f * f;
#endif

  return vec3(
    p10 * dm.x + p11 * dm.x * m.y, // x grad
    p01 * dm.y + p11 * m.x * dm.y, // y grad
    p00 + p10 * m.x + p01 * m.y + p11 * m.x * m.y - 0.5 // value
  );
}

const float PERLIN_SIN = sin(PERLIN_SHIFT_ANGLE) * PERLIN_SCALE;
const float PERLIN_COS = cos(PERLIN_SHIFT_ANGLE) * PERLIN_SCALE;
const mat2 PERLIN_MATRIX = mat2( // rotate, mirror
  -PERLIN_COS, PERLIN_SIN,
  PERLIN_SIN, PERLIN_COS
);
const vec2 PERLIN_OFFSET = vec2(400.1234, 2.4321);
const float PERLIN_LARGE_SIN = sin(${Math.PI * 2.0 / 3.0});
const float PERLIN_LARGE_COS = cos(${Math.PI * 2.0 / 3.0});
const mat2 PERLIN_LARGE_MATRIX = mat2( // rotate, mirror
  PERLIN_LARGE_COS, -PERLIN_LARGE_SIN,
  PERLIN_LARGE_SIN, PERLIN_LARGE_COS
);
const float PERLIN_NORM = 1.0 - 1.0 / PERLIN_DIVIDE;

const float nAir = 1.0;
const float nWater = 1.333;
const float airWater = pow((nAir - nWater) / (nAir + nWater), 2.0);

${[5, 9, 14].map((count) => `
vec3 terrainAndGrad${count}(vec2 pos) {
  vec3 sumLarge = vec3(0.0, 0.0, 0.5 * 3.0);
  vec2 p = pos * PERLIN_LARGE_ZOOM;
  mat2 rot = mat2(1.0, 0.0, 0.0, 1.0) * PERLIN_LARGE_ZOOM;
  for (int i = 0; i < 3; i++) {
    vec3 v = noiseAndGrad(p);
    sumLarge += vec3(v.xy * rot, v.z);
    p = p * PERLIN_LARGE_MATRIX + PERLIN_OFFSET;
    rot *= PERLIN_LARGE_MATRIX;
  }
  sumLarge *= (1.0 / 3.0);

  vec3 sum = vec3(0.0, 0.0, 0.5);
  float m = PERLIN_NORM;
  p = pos * PERLIN_ZOOM;
  rot = mat2(1.0, 0.0, 0.0, 1.0) * PERLIN_ZOOM;
  for (int i = 0; i < ${count}; i++) {
    vec3 v = noiseAndGrad(p);
    sum += vec3(v.xy * rot, v.z) * m;
    m /= (
      + PERLIN_DIVIDE
      + dot(sum.xy, sum.xy) * PERLIN_FLAT_CLIFFS
      + sum.z * PERLIN_FLAT_PEAKS
    );
    p = p * PERLIN_MATRIX + PERLIN_OFFSET;
    rot *= PERLIN_MATRIX;
  }

  float gammaAdjustedM1 = pow(sum.z, PERLIN_GAMMA - 1.0);
  return (
    vec3(sum.xy * PERLIN_GAMMA, sum.z) * gammaAdjustedM1 +
    sumLarge * PERLIN_LARGE_HEIGHT
  ) * (1.0 / (1.0 + PERLIN_LARGE_HEIGHT));
}
`).join('')}

const float shift = 0.1;

${[16, 64].map((steps) => `
float raytrace${steps}(vec3 o, vec3 ray, float near, float far) {
  if (near < 0.0 || far <= near) {
    return -1.0;
  }
  float d0 = near + shift;
  float d1 = 1.0 / 0.0;

  float dm = pow((far + shift) / d0, 1.0 / ${steps}.0);
  float d = d0 * pow(dm, texture(noise, ray.xy * 1000.0).y);
  for (int i = 0; i < ${steps} + 2; i++) {
    vec3 p = o + (d - shift) * ray;
    vec3 t = terrainAndGrad5(p.xy) * terrainHeight;
    if (t.z > p.z) {
      d1 = d;
    } else {
      d0 = d;
    }
    d = d0 * dm;
    if (d >= d1) {
      dm = sqrt(dm);
      d = d0 * dm;
    }
  }

  return (d1 <= far + shift + 0.001) ? (d0 + d1) * 0.5 - shift : -1.0;
}
`).join('')}

float raytune(vec3 o, vec3 ray, float d) {
  for (int i = 0; i < 2; i++) {
    vec3 guessP = o + d * ray;
    vec3 guess = terrainAndGrad9(guessP.xy) * terrainHeight;
    float guessGrad = dot(guess.xy, ray.xy);
    d = clamp(
      d + (guessP.z - guess.z) / (guessGrad - ray.z),
      d - terrainHeight * 0.005,
      d + terrainHeight * 0.005
    );
  }
  return d;
}

vec3 terrainColAt(vec2 p) {
  vec3 terrain = terrainAndGrad14(p) * terrainHeight;
  float grad2 = dot(terrain.xy, terrain.xy);

  // light
  float lum = pow(max(dot(sun, normalize(vec3(-terrain.xy, 1.0))) * 0.7 + 0.3, 0.0), 0.5);

  // grass
  //vec3 c = vec3(0.2, 0.3, 0.3) + terrain.xxy * vec3(0.2, 0.3, 0.2);
  vec3 c = mix(vec3(0.0, 0.0, 0.2), vec3(0.2, 0.4, 0.25), lum);

  // snow
  c = mix(
    c,
    mix(vec3(0.3, 0.3, 0.5), vec3(1.0), pow(lum, 0.7)),
    smoothstep(0.75, 0.9, terrain.z - grad2 * 0.3)
  );

  // rock
  c = mix(
    c,
    vec3(0.25, 0.1, 0.2) + terrain.xxx * vec3(0.2, 0.3, 0.3),
    smoothstep(0.1, 0.7, grad2) * 0.8
  );

  // beach
  c = mix(
    c,
    mix(
      vec3(0.7, 0.6, 0.3),
      vec3(0.5, 0.4, 0.2),
      smoothstep(0.02, -0.01, terrain.z - waterHeight - grad2 * 0.1)
    ),
    smoothstep(0.012, 0.007, terrain.z - waterHeight + smoothstep(0.0, 0.5, grad2) * 0.04) * 0.8
  );

  //// grid
  //vec2 grid = abs(mod(p.xy, 1.0) - 0.5);
  //c = mix(c, vec3(0.5, 0.9, 0.7), max(smoothstep(0.49, 0.5, grid.x), smoothstep(0.49, 0.5, grid.y)) * 0.2);

  return c;
}

vec3 sky(vec3 ray) {
  float d = length(cross(ray, sun));
  if (dot(ray, sun) < 0.0) {
    d = 2.0 - d;
  }
  d -= pow(0.96 - ray.z, 50.0);
  float disk = pow(smoothstep(0.07, 0.02, d), 10.0);
  return vec3(
    pow(0.001, d - 0.03) * 1.2,
    pow(0.300, d - 0.02) * 1.1,
    pow(0.700, d)
  ) + disk * vec3(4.0, 3.8, 3.6);
}

void main(void) {
  float inclination = length(pfov);
  vec3 ray = view * -vec3(sin(inclination) * pfov / inclination, cos(inclination));

  if (origin.z < terrainAndGrad9(origin.xy).z * terrainHeight) {
    col = vec4(0.15, 0.1, 0.05, 1.0);
    return;
  }

  float dTop = (origin.z - terrainHeight) / -ray.z;
  float dWater = (origin.z - waterHeight) / -ray.z;
  float dBase = origin.z / -ray.z;

  float d = raytrace64(
    origin,
    ray,
    origin.z > terrainHeight ? dTop : 0.0,
    (origin.z > waterHeight)
      ? (ray.z > 0.0 ? dTop : dWater)
      : (ray.z > 0.0 ? dWater : dBase)
  );
  if (d >= 0.0) {
    // ground
    d = raytune(origin, ray, d);
    vec3 c = terrainColAt((origin + d * ray).xy);

    if (origin.z < waterHeight) {
      c = mix(vec3(0.1, 0.2, 0.4), c, pow(1e-7, d));
    }
    col = vec4(c, 1.0);
    return;
  }

  vec3 waterOrigin = origin + ray * dWater;
  vec3 waterNorm = normalize(vec3(noiseAndGrad(waterOrigin.xy * 80.0).xy * 0.03, 1.0));

  if (origin.z < waterHeight) {
    // refraction out of water
    vec3 rayRefract = refract(ray, -waterNorm, nWater / nAir);
    float lim;
    float fogM;
    if (rayRefract == vec3(0.0)) {
      // TODO: this should actually always include some reflection; this is just the TIR case
      rayRefract = reflect(ray, waterNorm);
      lim = waterHeight / -rayRefract.z;
      fogM = 1.0;
    } else {
      lim = (terrainHeight - waterHeight) / rayRefract.z;
      fogM = 0.0;
    }
    float dRefract = raytrace16(waterOrigin, rayRefract, 0.0, lim);
    vec3 colRefract = dRefract >= 0.0 ? terrainColAt((waterOrigin + dRefract * rayRefract).xy) : sky(rayRefract);
    col = vec4(mix(vec3(0.1, 0.2, 0.4), colRefract, pow(1e-7, dWater + dRefract * fogM)), 1.0);
    return;
  }

  if (ray.z > 0.0) {
    // sky
    col = vec4(sky(ray), 1.0);
    return;
  }

  // refraction into water
  vec3 rayRefract = refract(ray, waterNorm, nAir / nWater);
  float dRefract = raytrace16(waterOrigin, rayRefract, 0.0, waterHeight / -rayRefract.z);
  vec3 colRefract = terrainColAt((waterOrigin + dRefract * rayRefract).xy);

  vec3 rayReflect = reflect(ray, waterNorm);
  float dReflect = raytrace16(waterOrigin, rayReflect, 0.0, (terrainHeight - waterHeight) / rayReflect.z);
  vec3 colReflect = dReflect >= 0.0 ? terrainColAt((waterOrigin + dReflect * rayReflect).xy) : sky(rayReflect);

  // ((Z2 cosI - Z1 cosT) / (Z2 cosI + Z1 cosT))^2
  // ((Z2 cosT - Z1 cosI) / (Z2 cosT + Z1 cosI))^2
  // Schlick's approximation
  float reflectance = airWater + (1.0 - airWater) * pow(1.0 + dot(ray, waterNorm), 5.0);

  col = vec4(mix(
    mix(vec3(0.1, 0.2, 0.4), colRefract, pow(1e-7, dRefract)),
    colReflect,
    reflectance
  ), 1.0);
}`;

const QUAD_ATTRIB_LOCATION = 0;

class Renderer {
  constructor(canvas, { width, height }) {
    this.width = width;
    this.height = height;
    this.lastSetConfig = {};

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('webglcontextrestored', () => {
      this._init();
      this.render();
    }, { passive: true });

    this.ctx = canvas.getContext('webgl2', {
      // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#avoid_alphafalse_which_can_be_expensive
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });

    this._init();
  }

  _init() {
    this.renderedConfig = {};

    const commonVert = { type: GL.VERTEX_SHADER, src: RENDER_VERT };

    this.noiseTex = createEmptyTexture(this.ctx, {
      wrap: GL.REPEAT,
      mag: GL.LINEAR,
      min: GL.LINEAR,
      format: GL.RGBA8,
      width: NOISE_SIZE,
      height: NOISE_SIZE,
    });

    this.renderNoiseBuffer = this.ctx.createFramebuffer();
    this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, this.renderNoiseBuffer);
    this.ctx.framebufferTexture2D(
      GL.DRAW_FRAMEBUFFER,
      GL.COLOR_ATTACHMENT0,
      GL.TEXTURE_2D,
      this.noiseTex,
      0
    );

    this.renderNoiseProgram = new ProgramBuilder(this.ctx)
      .withShader(commonVert)
      .withFragmentShader(RENDER_FRAG_NOISE)
      .bindAttribLocation(QUAD_ATTRIB_LOCATION, 'v')
      .link();

    this.renderTerrainProgram = new ProgramBuilder(this.ctx)
      .withShader(commonVert)
      .withFragmentShader(RENDER_FRAG_TERRAIN)
      .bindAttribLocation(QUAD_ATTRIB_LOCATION, 'v')
      .withUniform3f('origin')
      .withUniformMatrix3fv('view')
      .withUniform2f('fov')
      .withUniform1i('noise')
      .withUniform1f('terrainHeight')
      .withUniform1f('waterHeight')
      .withUniform1f('PERLIN_FLAT_CLIFFS')
      .withUniform1f('PERLIN_FLAT_PEAKS')
      .withUniform1f('PERLIN_GAMMA')
      .link();

    this.quadVertexArray = this.ctx.createVertexArray();
    this.ctx.bindVertexArray(this.quadVertexArray);
    const quadBuffer = this.ctx.createBuffer();
    this.ctx.bindBuffer(GL.ARRAY_BUFFER, quadBuffer);
    this.ctx.bufferData(GL.ARRAY_BUFFER, new Float32Array([
      -1.0, -1.0,
      1.0, -1.0,
      -1.0, 1.0,
      1.0, 1.0,
    ]), GL.STATIC_DRAW);
    this.ctx.enableVertexAttribArray(QUAD_ATTRIB_LOCATION);
    this.ctx.vertexAttribPointer(QUAD_ATTRIB_LOCATION, 2, GL.FLOAT, false, 0, 0);

    this.renderNoise();
  }

  renderNoise() {
    this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, this.renderNoiseBuffer);
    this.ctx.viewport(0, 0, NOISE_SIZE, NOISE_SIZE);
    this.renderNoiseProgram.use();
    this.ctx.drawArrays(GL.TRIANGLE_STRIP, 0, 4);
  }

  render(config) {
    if (config) {
      this.lastSetConfig = config;
    } else {
      config = this.lastSetConfig;
    }
    if (deepEqual(config, this.renderedConfig)) {
      return;
    }
    if (this.ctx.isContextLost()) {
      throw new Error('cannot render: context lost');
    }

    const eyeSep = config.view.eyeSeparation;
    const stereoscopic = Boolean(eyeSep);

    const w = (this.width * (stereoscopic ? 2 : 1) * config.resolution)|0;
    const h = (this.height * config.resolution)|0;
    if (this.ctx.canvas.width !== w || this.ctx.canvas.height !== h) {
      this.ctx.canvas.width = w;
      this.ctx.canvas.height = h;
    }

    if (stereoscopic) {
      this._renderEye(config, -eyeSep * 0.5, null, [0, 0, w / 2, h]);
      this._renderEye(config, eyeSep * 0.5, null, [w / 2, 0, w / 2, h]);
    } else {
      this._renderEye(config, 0, null, [0, 0, w, h]);
    }

    this.ctx.flush();

    this.renderedConfig = config;
  }

  _renderEye(config, eyeShift, buffer, viewport) {
    let view = makeViewMatrix(config.view.camera, config.view.focus, config.view.up);
    if (eyeShift) {
      view = makeViewMatrix(
        {
          x: config.view.camera.x + view[0] * eyeShift,
          y: config.view.camera.y + view[1] * eyeShift,
          z: config.view.camera.z + view[2] * eyeShift,
        },
        config.view.focus,
        {
          x: view[4],
          y: view[5],
          z: view[6],
        },
      );
    }
    const origin = { x: view[12], y: view[13], z: view[14] };
    const aspect = this.height / this.width;
    const fovx = (config.view.fovx ?? (config.view.fovy / aspect)) * 0.5;
    const fovy = (config.view.fovy ?? (fovx * aspect)) * -0.5;

    this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, buffer);
    this.ctx.viewport(...viewport);
    this.ctx.bindVertexArray(this.quadVertexArray);
    this.renderTerrainProgram.use({
      origin: [origin.x, origin.y, origin.z],
      view: [false, mat4xyz(view)],
      fov: [fovx, fovy],
      noise: { index: 0, texture: this.noiseTex },
      terrainHeight: config.stencil.trace, // TODO: own properties
      waterHeight: config.fog, // TODO: own properties
      PERLIN_FLAT_CLIFFS: config.saturation,
      PERLIN_FLAT_PEAKS: config.dust.opacity,
      PERLIN_GAMMA: config.gamma,
    });
    this.ctx.drawArrays(GL.TRIANGLE_STRIP, 0, 4);
  }
}
