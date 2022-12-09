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
uniform float waterFog;
uniform float perlinZoom;
uniform float perlinFlatCliffs;
uniform float perlinFlatPeaks;
uniform float perlinGamma;
uniform float perlinLargeZoom;
uniform float perlinLargeHeight;
uniform float rippleZoom;
uniform float rippleHeight;
uniform vec2 rippleShift;
uniform float snowLow;
uniform float snowHigh;
uniform float snowSlope;
uniform vec3 sun;
uniform bool grid;
uniform bool isP3;

const float PERLIN_SCALE = 1.92;
const float PERLIN_DIVIDE = 2.0;
const float PERLIN_SHIFT_ANGLE = 0.7;

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
const float SIN_2_3 = sin(${Math.PI * 2.0 / 3.0});
const float COS_2_3 = cos(${Math.PI * 2.0 / 3.0});
const mat2 ROT_1_3 = mat2( // rotate, mirror
  COS_2_3, -SIN_2_3,
  SIN_2_3, COS_2_3
);
const float PERLIN_NORM = 1.0 - 1.0 / PERLIN_DIVIDE;

const float nAir = 1.0;
const float nWater = 1.333;
const float airWater = pow(abs(nAir - nWater) / (nAir + nWater), 2.0);
const float inf = 1.0 / 0.0;

${[5, 9, 14].map((count) => `
vec3 terrainAndGrad${count}(vec2 pos) {
  vec3 sumLarge = vec3(0.0, 0.0, 0.5 * 3.0);
  vec2 p = pos * perlinLargeZoom;
  mat2 rot = mat2(1.0, 0.0, 0.0, 1.0) * perlinLargeZoom;
  for (int i = 0; i < 3; i++) {
    vec3 v = noiseAndGrad(p);
    sumLarge += vec3(v.xy * rot, v.z);
    p = p * ROT_1_3 + PERLIN_OFFSET;
    rot *= ROT_1_3;
  }
  sumLarge *= (1.0 / 3.0);

  vec3 sum = vec3(0.0, 0.0, 0.5);
  float m = PERLIN_NORM;
  p = pos * perlinZoom;
  rot = mat2(1.0, 0.0, 0.0, 1.0) * perlinZoom;
  for (int i = 0; i < ${count}; i++) {
    vec3 v = noiseAndGrad(p);
    sum += vec3(v.xy * rot, v.z) * m;
    m /= (
      + PERLIN_DIVIDE
      + dot(sum.xy, sum.xy) * perlinFlatCliffs
      + sum.z * perlinFlatPeaks
    );
    p = p * PERLIN_MATRIX + PERLIN_OFFSET;
    rot *= PERLIN_MATRIX;
  }

  float gammaAdjustedM1 = pow(sum.z, perlinGamma - 1.0);
  return (
    vec3(sum.xy * perlinGamma, sum.z) * gammaAdjustedM1 +
    sumLarge * perlinLargeHeight
  ) * (1.0 / (1.0 + perlinLargeHeight)) * terrainHeight;
}
`).join('')}

vec3 waterAt(vec2 pos, float depth) {
  vec3 sumLarge = vec3(0.0, 0.0, 0.5 * 3.0);
  vec2 p = pos * rippleZoom;
  mat2 rot = mat2(1.0, 0.0, 0.0, 1.0) * rippleZoom;
  for (int i = 0; i < 3; i++) {
    vec3 v = noiseAndGrad(p + rippleShift);
    sumLarge += vec3(v.xy * rot, v.z);
    p = p * ROT_1_3 + PERLIN_OFFSET;
    rot *= ROT_1_3;
  }
  sumLarge *= (1.0 / 3.0);
  return sumLarge * rippleHeight * smoothstep(0.002, 0.02, depth);
}

const float shift = 0.1;

float raytrace(vec3 o, vec3 ray, float near, float far, float dm) {
  if (near < 0.0 || far <= near) {
    return -1.0;
  }
  float d0 = near + shift;
  float d1 = inf;

  int steps = int(ceil(log((far + shift) / d0) / log(dm)));
  float d = d0 * pow(dm, texture(noise, ray.xy * 1000.0).y);
  for (int i = 0; i < steps + 2; i++) {
    vec3 p = o + (d - shift) * ray;
    vec3 t = terrainAndGrad5(p.xy);
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

float raytune(vec3 o, vec3 ray, float d) {
  for (int i = 0; i < 2; i++) {
    vec3 guessP = o + d * ray;
    vec3 guess = terrainAndGrad9(guessP.xy);
    float guessGrad = dot(guess.xy, ray.xy);
    d = clamp(
      d + (guessP.z - guess.z) / (guessGrad - ray.z),
      d - terrainHeight * 0.005,
      d + terrainHeight * 0.005
    );
  }
  return d;
}

const vec3 sunDiskCol = vec3(8.0, 7.6, 7.2);

vec3 skyScatterInternal(float d) {
  return vec3(
    pow(0.001, d - 0.03) * 2.4,
    pow(0.400, d - 0.02) * 2.2,
    pow(0.700, d) * 2.0
  ) * (smoothstep(-0.9, 0.0, sun.z) * 0.95 + 0.05);
}

vec3 skyScatter(vec3 ray) {
  float d = length(cross(ray, sun));
  if (dot(ray, sun) < 0.0) {
    d = 2.0 - d;
  }
  return skyScatterInternal(d - pow(0.96 - ray.z, 50.0));
}

vec3 sky(vec3 ray) {
  float d = length(cross(ray, sun));
  if (dot(ray, sun) < 0.0) {
    d = 2.0 - d;
  }
  return skyScatterInternal(d - pow(0.96 - ray.z, 50.0)) + sunDiskCol * pow(smoothstep(0.07, 0.02, d), 10.0);
}

vec3 terrainColAt(vec2 p, vec3 ray) {
  vec3 terrain = terrainAndGrad14(p);
  vec3 norm = normalize(vec3(-terrain.xy, 1.0));
  float grad2 = dot(terrain.xy, terrain.xy);

  // lighting
  vec3 reflectRay = reflect(ray, norm);
  float glossDot = max(dot(sun, reflectRay), 0.0) * smoothstep(0.0, 0.1, reflectRay.z * max(0.0, sun.z + 0.1));
  vec3 diffuseCol = skyScatter(norm) + sunDiskCol * max(dot(sun, norm), 0.0);
  float innerScatter = dot(sun, norm) * 0.5 + 0.5;
  vec3 ambientCol = skyScatter(vec3(0.0, 0.0, 1.0)) + sunDiskCol * smoothstep(-0.4, 0.4, sun.z);

  vec3 rock = (
    + ambientCol * vec3(0.003, 0.003, 0.002)
    + diffuseCol * vec3(0.050, 0.040, 0.050)
    + sunDiskCol * vec3(0.030, 0.040, 0.040) * pow(glossDot, 10.0)
  ) * 0.4;

  vec3 dirt = (
    + ambientCol * vec3(0.020, 0.008, 0.010)
    + diffuseCol * vec3(0.200, 0.080, 0.020)
  ) * 0.3;

  vec3 grass = (
    + ambientCol * vec3(0.001, 0.002, 0.000)
    + diffuseCol * vec3(0.010, 0.030, 0.015)
  );

  vec3 sand = (
    + ambientCol * vec3(0.040, 0.030, 0.010)
    + diffuseCol * vec3(0.030, 0.024, 0.012)
  );

  vec3 wetSand = sand * 0.6 + sunDiskCol * vec3(0.020, 0.015, 0.011) * pow(glossDot, 2.0);

  vec3 sandmix = mix(
    wetSand,
    sand,
    smoothstep(-0.0005, 0.01, terrain.z - waterHeight - grad2 * 0.001)
  );

  vec3 snow = (
    + ambientCol * (vec3(0.060, 0.070, 0.075) + innerScatter * 0.2)
    + diffuseCol * 0.150
    + sunDiskCol * 0.100 * pow(glossDot, 10.0)
  );

  vec3 c = mix(
    mix(
      sandmix,
      mix(
        grass,
        mix(rock, dirt, smoothstep(0.5, 0.1, grad2)),
        clamp((grad2 - 0.1) * (1.0 / 0.2), 0.0, 1.0)
      ),
      smoothstep(0.008, 0.02, terrain.z - waterHeight + smoothstep(0.0, 0.5, grad2) * 0.03)
    ),
    snow,
    smoothstep(snowLow, snowHigh, terrain.z - grad2 * snowSlope)
  );

  // approx. water attenuation of incoming light
  if (terrain.z < waterHeight) {
    c *= pow(waterFog, waterHeight - terrain.z);
  }

  // grid
  if (grid) {
    vec2 edge = abs(mod(p.xy, 1.0) - 0.5);
    float edge2 = abs(mod(terrain.z * 10.0, 1.0) - 0.5);
    c = mix(
      c,
      vec3(2.0),
      max(max(smoothstep(0.49, 0.495, edge.x), smoothstep(0.49, 0.495, edge.y)), smoothstep(0.47, 0.49, edge2)) * 0.6
    );
  }

  return c;
}

vec3 render(vec3 ray) {
  if (origin.z < terrainAndGrad9(origin.xy).z) {
    return vec3(0.15, 0.1, 0.05);
  }

  float dTop = (origin.z - terrainHeight) / -ray.z;
  float dWater = (origin.z - waterHeight) / -ray.z;
  float dBase = origin.z / -ray.z;

  float d = raytrace(
    origin,
    ray,
    origin.z > terrainHeight ? dTop : 0.0,
    (origin.z > waterHeight)
      ? (ray.z > 0.0 ? dTop : dWater)
      : (ray.z > 0.0 ? dWater : dBase),
    1.04
  );

  vec3 waterCol = vec3(0.00, 0.01, 0.03) * sunDiskCol * smoothstep(-0.2, 0.4, sun.z);

  if (d >= 0.0) {
    // ground
    d = raytune(origin, ray, d);
    vec3 c = terrainColAt((origin + d * ray).xy, ray);

    if (origin.z < waterHeight) {
      c = mix(waterCol, c, pow(waterFog, d));
    }
    return c;
  }

  if (origin.z >= waterHeight && ray.z > 0.0) {
    // sky
    return sky(ray);
  }

  vec3 waterOrigin = origin + ray * dWater;
  float depth = waterHeight - terrainAndGrad14(waterOrigin.xy).z;
  vec3 waterNorm = normalize(vec3(-waterAt(waterOrigin.xy, depth).xy, 1.0));

  // water interaction
  vec3 rayReflect = reflect(ray, waterNorm);

  if (origin.z < waterHeight) {
    // internal reflection in water
    rayReflect.z = -abs(rayReflect.z); // assume reflection up will reflect back down
    float dReflect = raytrace(waterOrigin, rayReflect, 0.0, waterHeight / -rayReflect.z, 1.3);
    vec3 colReflect = terrainColAt((waterOrigin + dReflect * rayReflect).xy, rayReflect);

    // refraction out of water
    vec3 rayRefract = refract(ray, -waterNorm, nWater / nAir);
    if (rayRefract == vec3(0.0)) {
      return mix(waterCol, colReflect, pow(waterFog, dWater + dReflect));
    }

    rayRefract.z = abs(rayRefract.z); // don't allow waves to cause refraction to go downwards
    float dRefract = raytrace(waterOrigin, rayRefract, 0.0, (terrainHeight - waterHeight) / rayRefract.z, 1.3);
    vec3 colRefract = dRefract >= 0.0 ? terrainColAt((waterOrigin + dRefract * rayRefract).xy, rayRefract) : sky(rayRefract);

    // Schlick's approximation
    float reflectance = airWater + (1.0 - airWater) * pow(1.0 - dot(ray, waterNorm), 5.0);

    return mix(
      waterCol,
      mix(
        colRefract,
        mix(waterCol, colReflect, pow(waterFog, dReflect)),
        reflectance
      ),
      pow(waterFog, dWater)
    );
  }

  // refraction into water
  vec3 rayRefract = refract(ray, waterNorm, nAir / nWater);
  rayRefract.z = -abs(rayRefract.z); // don't allow waves to cause refraction to go upwards
  float dRefract = raytrace(waterOrigin, rayRefract, 0.0, waterHeight / -rayRefract.z, 1.3);
  vec3 colRefract = terrainColAt((waterOrigin + dRefract * rayRefract).xy, rayRefract);

  rayReflect.z = abs(rayReflect.z); // assume rays which reflect downwards will eventually reflect back up
  float dReflect = raytrace(waterOrigin, rayReflect, 0.0, (terrainHeight - waterHeight) / rayReflect.z, 1.3);
  vec3 colReflect = dReflect >= 0.0 ? terrainColAt((waterOrigin + dReflect * rayReflect).xy, rayReflect) : sky(rayReflect);

  // Schlick's approximation
  float reflectance = airWater + (1.0 - airWater) * pow(1.0 + dot(ray, waterNorm), 5.0);

  return mix(
    mix(waterCol, colRefract, pow(waterFog, dRefract)),
    colReflect,
    clamp(depth * 40.0, 0.0, reflectance)
  );
}

void main(void) {
  float inclination = length(pfov);
  vec3 ray = view * -vec3(sin(inclination) * pfov / inclination, cos(inclination));

  vec3 c = render(ray);
  c *= 0.5;
  if (isP3) {
    c = pow(c, vec3(1.0 / 2.2));
  } else {
    c = pow(c, vec3(1.0 / 2.2));
    // match P3 and SRGB (thanks, http://endavid.com/index.php?entry=79)
    // TODO: instead, convert both from a physically meaningful space
    c *= mat3(1.2249, -0.2247, 0.0, -0.0420, 1.0419, 0.0, -0.0197, -0.0786, 1.0979);
  }
  col = vec4(c + texture(noise, ray.xy * 10000.0).yyy * (1.0 / 256.0), 1.0);
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
      mag: GL.NEAREST,
      min: GL.NEAREST,
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
      .withUniform3f('sun')
      .withUniform1i('grid')
      .withUniform1i('isP3')
      .withUniform1i('noise')
      .withUniform1f('terrainHeight')
      .withUniform1f('waterHeight')
      .withUniform1f('waterFog')
      .withUniform1f('perlinZoom')
      .withUniform1f('perlinFlatCliffs')
      .withUniform1f('perlinFlatPeaks')
      .withUniform1f('perlinGamma')
      .withUniform1f('perlinLargeZoom')
      .withUniform1f('perlinLargeHeight')
      .withUniform1f('rippleZoom')
      .withUniform1f('rippleHeight')
      .withUniform2f('rippleShift')
      .withUniform1f('snowLow')
      .withUniform1f('snowHigh')
      .withUniform1f('snowSlope')
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

    this.colorspace = 'srgb';
    if ('drawingBufferColorSpace' in this.ctx) {
      this.ctx.drawingBufferColorSpace = config.colorspace;
      this.colorspace = this.ctx.drawingBufferColorSpace; // check if p3 is supported
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
    const fovx = config.view.fovy * 0.5 / aspect;
    const fovy = config.view.fovy * -0.5;

    this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, buffer);
    this.ctx.viewport(...viewport);
    this.ctx.bindVertexArray(this.quadVertexArray);
    this.renderTerrainProgram.use({
      origin: xyzTo3f(origin),
      view: [false, mat4xyz(view)],
      fov: [fovx, fovy],
      sun: xyzTo3f(norm3(config.sun)),
      grid: Boolean(config.grid),
      isP3: this.colorspace === 'display-p3',
      noise: { index: 0, texture: this.noiseTex },
      terrainHeight: config.terrainHeight,
      waterHeight: config.waterHeight,
      waterFog: Math.pow(10, -config.waterFog),
      perlinZoom: config.zoom,
      perlinFlatCliffs: config.cliffFlatness,
      perlinFlatPeaks: config.peakFlatness,
      perlinGamma: config.flatness,
      perlinLargeZoom: config.largeZoom,
      perlinLargeHeight: config.largeHeight,
      rippleZoom: config.ripple.zoom,
      rippleHeight: config.ripple.height,
      rippleShift: [config.ripple.shift.x, config.ripple.shift.y],
      snowLow: config.snow.low,
      snowHigh: config.snow.high,
      snowSlope: config.snow.slope,
    });
    this.ctx.drawArrays(GL.TRIANGLE_STRIP, 0, 4);
  }
}
