'use strict';

const NOISE_SIZE = 1024;
const SKY_SIZE = 64;
const DOWNSCALE = 6;
const SKY_HORIZON_FOCUS = 4.0;

const SUN_DISK_COL = { x: 8, y: 7.2, z: 5.7 };
const PERLIN_SCALE = 1.92;
const PERLIN_SHIFT_ANGLE = 0.7;
const PERLIN_DIVIDE = 2.0;

const HELPER_FNS = `
float linearstep(float edge0, float edge1, float x) {
  return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}

vec3 rayToSkybox(vec3 normRay) {
  return normRay * vec3(${glslFloat(1 / SKY_HORIZON_FOCUS)}, ${glslFloat(1 / SKY_HORIZON_FOCUS)}, 1.0);
}

vec3 skyboxToRay(vec3 sb) {
  return normalize(sb * vec3(${glslFloat(SKY_HORIZON_FOCUS)}, ${glslFloat(SKY_HORIZON_FOCUS)}, 1.0));
}
`;

const RENDER_VERT = `#version 300 es
precision mediump float;

uniform vec2 fov;
uniform vec2 lowResSize;
in vec2 v;
out vec2 pfov;
out vec2 lowResCoord;

void main(void) {
  pfov = v * fov;
  lowResCoord = (v * 0.5 + 0.5) * lowResSize + 1.0;
  gl_Position = vec4(v, 0.0, 1.0);
}`;

const RENDER_VERT_SKYBOX = `#version 300 es
precision mediump float;

uniform vec3 o;
uniform vec3 dx;
uniform vec3 dy;
in vec2 v;
out vec3 p;

void main(void) {
  p = o + v.x * dx + v.y * dy;
  gl_Position = vec4(v, 0.0, 1.0);
}`;

const RENDER_FRAG_SKYBOX = `#version 300 es
precision mediump float;

uniform vec3 sun;
in vec3 p;
out vec4 col;

${HELPER_FNS}

void main(void) {
  vec3 ray = skyboxToRay(p);
  ray.z = max(0.0, ray.z);
  float d = length(cross(ray, sun));
  if (dot(ray, sun) < 0.0) {
    d = 2.0 - d;
  }

  float dAdjusted = d - pow((1.0 - ray.z) * 0.96, 50.0);
  float thin = sqrt(ray.z);
  vec3 c = vec3(
    pow(0.001, dAdjusted - 0.03) * (2.4 - thin * 2.2),
    pow(0.400, dAdjusted - 0.02) * (2.2 - thin * 1.5),
    pow(0.700, dAdjusted) * (2.0 - thin * 1.0)
  ) * (smoothstep(-0.9, 0.0, sun.z) * 0.95 + 0.05);

  col = vec4(c, 1.0);
}`;

// spooky sky:
//  col = vec4(cos(ray * 20.0) + 1.0, 1.0);
//  BLUR_SAMPLES = evenSphericalPoints(500, Math.PI * 0.1);
//  vec3 ray = skyboxToRay(p);
//  vec3 x = cross(vec3(0.0, 0.0, 1.0), ray);
//  mat3 rot = mat3(x, cross(ray, x), ray);
//  r = ${glslVec3(xyzTo3f(pt))} * rot;
//  and use diffuseSkyboxTex as skybox

const BLUR_SAMPLES = evenSphericalPoints(200, Math.PI * 0.5);

const RENDER_FRAG_DIFFUSE_SKYBOX = `#version 300 es
precision mediump float;

uniform samplerCube skybox;
in vec3 p;
out vec4 col;

${HELPER_FNS}

void main(void) {
  vec3 ray = skyboxToRay(p);
  vec3 x = normalize(cross(vec3(0.0, 0.0, 1.0), ray));
  mat3 rot = mat3(x, cross(ray, x), ray);

  vec3 r;
  vec4 agg = vec4(0.0);
  ${BLUR_SAMPLES.map((pt) => `
  r = rot * ${glslVec3(xyzTo3f(pt))};
  agg += texture(skybox, rayToSkybox(r)) * smoothstep(0.0, 0.1, r.z);
  `).join('')}
  col = agg * (1.0 / ${glslFloat(BLUR_SAMPLES.length)});
}`;

function calculateAmbientSky(sun) {
  const d = Math.max(0.8, 1 - sun.z);
  const ambient = smoothstep(-0.9, 0, sun.z) * 0.05 + 0.01;
  return {
    x: Math.pow(0.1, d) * 2.2 * ambient,
    y: Math.pow(0.4, d) * 2.2 * ambient,
    z: Math.pow(0.6, d) * 2.2 * ambient,
  };
}

const RENDER_FRAG_NOISE = `#version 300 es
precision mediump float;

out vec4 col;

${glslRandom('random', 6)}

void main(void) {
  col = vec4(random(uvec2(gl_FragCoord.x, gl_FragCoord.y)), 0.0, 1.0);
}`;

const TERRAIN_FNS = `
#define SMOOTHNESS 2

uniform sampler2D noise;
uniform float maxDrawDist;
uniform float perlinZoom;
uniform float perlinFlatCliffs;
uniform float perlinFlatPeaks;
uniform float perlinGamma;
uniform float perlinLargeZoom;
uniform float perlinLargeHeight;
uniform float terrainHeight;
uniform float terrainHeightAdjust; // terrainHeight / (1.0 + perlinLargeHeight)
uniform float rippleZoom;
uniform float rippleHeight;
uniform vec2 rippleShift;
uniform float ripple2Zoom;
uniform float ripple2Height;
uniform vec2 ripple2Shift;
uniform float shadowBlur;
uniform float waveDist;
uniform float waveHeight;
uniform float waveFreq;
uniform float wavePhase;

const float inf = 1.0 / 0.0;

const float PERLIN_SIN = ${glslFloat(Math.sin(PERLIN_SHIFT_ANGLE) * PERLIN_SCALE)};
const float PERLIN_COS = ${glslFloat(Math.cos(PERLIN_SHIFT_ANGLE) * PERLIN_SCALE)};
const mat2 PERLIN_MATRIX = mat2( // rotate, mirror
  -PERLIN_COS, PERLIN_SIN,
  PERLIN_SIN, PERLIN_COS
);
const vec2 PERLIN_OFFSET = vec2(400.1234, 2.4321);
const float SIN_2_3 = ${glslFloat(Math.sin(Math.PI * 2.0 / 3.0))};
const float COS_2_3 = ${glslFloat(Math.cos(Math.PI * 2.0 / 3.0))};
const mat2 ROT_1_3 = mat2( // rotate
  COS_2_3, -SIN_2_3,
  SIN_2_3, COS_2_3
);
const float PERLIN_NORM = ${glslFloat(1 - 1 / PERLIN_DIVIDE)};

vec2 sharpNoise(vec3 pos) {
  return texelFetch(noise, ivec2(fract(pos.xy + pos.yz) * ${glslFloat(NOISE_SIZE)}), 0).xy;
}

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
  vec2 f2 = f * f;
  vec2 m = ((6.0 * f - 15.0) * f + 10.0) * f2 * f;
  vec2 dm = ((f * 30.0 - 60.0) * f + 30.0) * f2;
#endif

  return vec3(
    (vec2(p10, p01) + p11 * m.yx) * dm.xy, // x/y grad
    p00 + p10 * m.x + (p01 + p11 * m.x) * m.y - 0.5 // value
  );
}

${[9, 15].map((count) => `
vec3 terrainAndGrad${count}(vec2 pos) {
  vec3 sumLarge = vec3(0.0, 0.0, 0.5 * 3.0);
  vec2 p = pos * perlinLargeZoom;
  mat2 rot = mat2(perlinLargeZoom, 0.0, 0.0, perlinLargeZoom);
  for (int i = 0; i < 3; i++) {
    vec3 v = noiseAndGrad(p);
    sumLarge += vec3(v.xy * rot, v.z);
    p = p * ROT_1_3 + PERLIN_OFFSET;
    rot *= ROT_1_3;
  }

  vec3 sum = vec3(0.0, 0.0, 0.5);
  float m = PERLIN_NORM;
  p = pos * perlinZoom;
  rot = mat2(perlinZoom, 0.0, 0.0, perlinZoom);
  for (int i = 0; i < ${count}; i++) {
    vec3 v = noiseAndGrad(p);
    sum += vec3(v.xy * rot, v.z) * m;
    m /= (
      + ${glslFloat(PERLIN_DIVIDE)}
      + dot(sum.xy, sum.xy) * perlinFlatCliffs
      + sum.z * perlinFlatPeaks
    );
    p = p * PERLIN_MATRIX + PERLIN_OFFSET;
    rot *= PERLIN_MATRIX;
  }

  float gammaAdjustedM1 = pow(sum.z, perlinGamma - 1.0);
  return (
    vec3(sum.xy * perlinGamma, sum.z) * gammaAdjustedM1 +
    sumLarge * (1.0 / 3.0) * perlinLargeHeight
  ) * terrainHeightAdjust;
}
`).join('')}

float elevationAt(vec3 pos) {
  return pos.z - terrainAndGrad9(pos.xy).z;
}

vec4 waterAt(vec2 pos) {
  vec3 g = terrainAndGrad15(pos);
  float depth = waterHeight - g.z;
  vec3 ripple = vec3(0.0);
  float rippleMult = (1.0 / 3.0) * rippleHeight * linearstep(0.002, 0.02, depth);
  if (rippleMult > 0.0) {
    vec2 p = pos * rippleZoom;
    mat2 rot = mat2(1.0, 0.0, 0.0, 1.0) * rippleZoom;
    for (int i = 0; i < 3; i++) {
      vec3 v = noiseAndGrad(p + rippleShift);
      ripple += vec3(v.xy * rot, v.z);
      p = p * ROT_1_3 + PERLIN_OFFSET;
      rot *= ROT_1_3;
    }
    ripple *= rippleMult;
  }
  vec3 ripple2 = vec3(0.0);
  float ripple2Mult = (1.0 / 3.0) * ripple2Height * linearstep(0.01, 0.04, depth);
  if (ripple2Mult > 0.0) {
    vec2 p = pos * ripple2Zoom;
    mat2 rot = mat2(1.0, 0.0, 0.0, 1.0) * ripple2Zoom;
    for (int i = 0; i < 3; i++) {
      vec3 v = noiseAndGrad(p + ripple2Shift);
      ripple2 += vec3(v.xy * rot, v.z);
      p = p * ROT_1_3 + PERLIN_OFFSET;
      rot *= ROT_1_3;
    }
    ripple2 *= ripple2Mult;
  }
  vec3 wave = vec3(0.0);
  float waveMult = waveHeight * linearstep(0.0, 0.02, depth) * linearstep(waveDist, 0.01, depth);
  if (waveMult > 0.0) {
    vec3 offset = noiseAndGrad(pos * 0.47) * 10.0;
    float rtDepth = sqrt(depth);
    float v = offset.z + rtDepth * waveFreq + wavePhase;
    wave = vec3((offset.xy - g.xy * waveFreq * 0.5 / rtDepth) * cos(v), sin(v)) * waveMult;
  }
  return vec4(ripple + ripple2 + wave, depth);
}

float raytraceWater(vec3 o, vec3 ray) {
  float d = (o.z - waterHeight) / -ray.z;
  float range = 0.05;
  for (int i = 0; i < 1; i++) {
    vec3 p = o + d * ray;
    vec3 g = waterAt(p.xy).xyz;
    d += clamp((p.z - waterHeight - g.z) / (dot(g.xy, ray.xy) - ray.z), -range, range);
    range *= 0.75;
  }
  return d;
}

float raytune0(vec3 o, vec3 ray, float d, float range) {
  for (int i = 0; i < 2; i++) {
    vec3 p = o + d * ray;
    d += (step(terrainAndGrad9(p.xy).z, p.z) * 2.0 - 1.0) * range;
    range *= 0.5;
  }
  return d;
}

float raytune2(vec3 o, vec3 ray, float d, float range) {
  for (int i = 0; i < 2; i++) {
    vec3 p = o + d * ray;
    vec3 g = terrainAndGrad9(p.xy);
    d += clamp((p.z - g.z) / (dot(g.xy, ray.xy) - ray.z), -range, range);
    range *= 0.5;
  }
  return d;
}

float raytrace(vec3 o, vec3 ray, float near, float far, float dm) {
  float maxGrad = terrainHeight;
  float gradStep = 1.0 / max(length(ray.xy) * maxGrad * 0.5 - ray.z, 0.001);

  float g = elevationAt(o + near * ray);
  if (g < 0.0) {
    return near;
  }

  float d = near + g * gradStep * sharpNoise(ray).y;

  for (int i = 0; i < 250; ++i) {
    d = min(d, far);
    g = elevationAt(o + d * ray);
    if (g < 0.0) {
      return raytune2(o, ray, (d + near) * 0.5, (d - near) * 0.5);
    }
    if (d >= far) {
      return inf;
    }
    near = d;
    d = max((d + 0.1) * dm - 0.1, d + g * gradStep);
  }
  return inf;
}

float shadowtrace(vec3 o, vec3 ray) {
  float vis = min(1.0, ray.z / shadowBlur);
  if (vis < -0.9) {
    return 0.0;
  }

  float maxGrad = terrainHeight * 0.5; // allow missing some shadow casters in exchange for better performance
  float gradStep = 1.0 / (length(ray.xy) * maxGrad * 0.5 - (ray.z - shadowBlur));

  float step = clamp(((o.z - terrainHeight) / -ray.z) * 0.01, 0.1, 0.5);
  float d = step * (sharpNoise(o).y * 0.5 + 0.01);
  for (int i = 0; i < 20; ++i) {
    float range = shadowBlur * d;
    vec3 p = o + d * ray;
    if (range * 0.1 > terrainHeight || p.z - range > terrainHeight) {
      return vis * 0.5 + 0.5;
    }
    float g = elevationAt(p);
    vis = min(vis, g / range);
    if (vis < -0.9) {
      return 0.0;
    }
    d += max(step, g * gradStep);
  }
  return vis * 0.5 + 0.5;
}
`;

const nAir = 1;
const nWater = 4 / 3;
const airWater = Math.pow(Math.abs(nAir - nWater) / (nAir + nWater), 2);

const RENDER_FRAG_DEPTH = `#version 300 es
precision mediump float;

uniform vec3 origin;
uniform mat3 view;
uniform float waterHeight;
uniform float snowLow;
uniform float snowHigh;
uniform float snowSlope;
uniform vec3 sun;

in vec2 pfov;
out vec4 col;

${HELPER_FNS}
${TERRAIN_FNS}

void main(void) {
  float inclination = length(pfov);
  vec3 ray = view * -vec3(sin(inclination) * pfov / inclination, cos(inclination));

  float dTop = (origin.z - terrainHeight) / -ray.z;
  float dWater = (origin.z - waterHeight) / -ray.z;
  float dBase = origin.z / -ray.z;

  float far = min(maxDrawDist, (origin.z > waterHeight)
    ? (ray.z > 0.0 ? dTop : dWater)
    : (ray.z > 0.0 ? dWater : dBase));
  float d = raytrace(
    origin,
    ray,
    origin.z > terrainHeight ? dTop : 0.0,
    far,
    1.01
  );

  float dWaterAdjust;
  float shadow;
  float shadow2;
  if (d <= 0.0) {
    // burried
    d = 0.0;
    dWaterAdjust = 0.0;
    shadow = 0.0;
    shadow2 = 0.0;
  } else if (d <= far) {
    // land
    vec3 p = origin + ray * d;
    vec3 terrain = terrainAndGrad15(p.xy);
    vec3 norm = normalize(vec3(-terrain.xy, 1.0));
    dWaterAdjust = 0.0;
    shadow = dot(sun, norm) > 0.0 ? shadowtrace(p, sun) : 0.0;
    shadow2 = shadow;
  } else if (origin.z >= waterHeight && ray.z > 0.0 || far == maxDrawDist) {
    // sky
    d = inf;
    dWaterAdjust = 0.0;
    shadow = 1.0;
    shadow2 = 1.0;
  } else {
    // water

    vec3 waterOrigin = origin + ray * dWater;
    float dWaterAdjusted = raytraceWater(origin, ray);
    vec3 waterNorm = normalize(vec3(-waterAt((origin + ray * dWaterAdjusted).xy).xy, 1.0));

    dWaterAdjust = dWaterAdjusted - dWater;
    shadow = shadowtrace(waterOrigin, sun);

    if (origin.z < waterHeight) {
      // looking up (store internal reflection)
      d = inf; // TODO
      shadow2 = -1.0;
    } else {
      // looking down (store refraction)
      vec3 rayRefract = refract(ray, waterNorm, ${glslFloat(nAir / nWater)});
      rayRefract.z = -abs(rayRefract.z); // don't allow waves to cause refraction to go upwards
      d = raytrace(waterOrigin, rayRefract, 0.0, waterHeight / -rayRefract.z, 1.5);
      // TODO: would be nice to account for refraction of sunlight
      shadow2 = shadowtrace(waterOrigin + d * rayRefract, sun);
    }
    d += far;
  }
  col = vec4(d, dWaterAdjust, shadow, shadow2);
}`;

const RENDER_FRAG_TERRAIN = `#version 300 es
precision mediump float;

uniform sampler2D lowResDepth;
uniform samplerCube skybox;
uniform samplerCube diffuseSkybox;
uniform vec3 origin;
uniform mat3 view;
uniform float waterHeight;
uniform float waterFog;
uniform float atmosphere;
uniform float snowLow;
uniform float snowHigh;
uniform float snowSlope;
uniform vec3 sun;
uniform vec3 sunDiskCol;
uniform vec3 skyAmbientCol;
uniform bool grid;
uniform bool isP3;

in vec2 pfov;
in vec2 lowResCoord;
out vec4 col;

${HELPER_FNS}
${TERRAIN_FNS}

vec3 sky(vec3 ray) {
  float d = dot(ray, sun) > 0.0 ? length(cross(ray, sun)) : 1.0;
  return texture(skybox, rayToSkybox(ray)).xyz + sunDiskCol * smoothstep(0.024, 0.016, d);
}

vec3 skyFog(vec3 c, vec3 ray, float d) {
  return mix(
    texture(skybox, rayToSkybox(vec3(ray.xy, 1.0 / (d + 500.0)))).xyz * min(d * 0.08, 1.0),
    c,
    pow(atmosphere, d)
  );
}

vec3 terrainColAt(vec2 p, vec3 ray, float shadow) {
  vec3 terrain = terrainAndGrad15(p);
  vec3 norm = normalize(vec3(-terrain.xy, 1.0));
  float grad2 = dot(terrain.xy, terrain.xy);
  float heightAboveWater = terrain.z - waterHeight;
  float sunDotNorm = dot(sun, norm);

  if (sunDotNorm <= 0.0) {
    shadow = 0.0;
  } else if (shadow == -1.0) {
    shadow = shadowtrace(vec3(p, terrain.z), sun);
  }

  // lighting
  vec3 reflectRay = reflect(ray, norm);
  float glossDot1 = max(dot(sun, reflectRay), 0.0) * linearstep(0.0, 0.1, reflectRay.z * max(0.0, sun.z + 0.1));
  float glossDot2 = glossDot1 * glossDot1;
  float glossDot4 = glossDot2 * glossDot2;
  float glossDot8 = glossDot4 * glossDot4;
  vec3 reflectCol = sunDiskCol * shadow * 0.04;
  vec3 diffuseCol = (
    + skyAmbientCol
    + texture(diffuseSkybox, rayToSkybox(norm)).xyz
    + sunDiskCol * max(sunDotNorm, 0.0) * shadow
  ) * 0.04;
  vec3 scatterCol = sunDiskCol * max(sunDotNorm * 0.6 + 0.4, 0.0) * 0.04 * linearstep(-0.3, 0.1, sun.z);

  // approx. water attenuation of incoming light
  if (heightAboveWater < 0.0) {
    reflectCol *= pow(waterFog, -heightAboveWater / max(sun.z * ${nWater / nAir}, 0.001));
    diffuseCol *= pow(waterFog, -heightAboveWater);
  }

  vec3 rock = (
    + diffuseCol * vec3(0.50, 0.40, 0.50)
    + reflectCol * vec3(0.30, 0.40, 0.40) * glossDot8
  );

  vec3 dirt = (
    + diffuseCol * vec3(0.40, 0.12, 0.02)
  );

  vec3 grass = (
    + diffuseCol * vec3(0.15, 0.40, 0.07)
  );

  vec3 sand = (
    + diffuseCol * vec3(5.00, 4.00, 2.00)
  );

  vec3 wetSand = (
    + diffuseCol * vec3(0.50, 0.40, 0.20)
    + reflectCol * vec3(0.75, 0.50, 0.40) * glossDot4
  );

  vec3 snow = (
    + diffuseCol * vec3(3.75, 3.75, 3.75)
    + scatterCol * vec3(3.50, 3.70, 4.00)
    + reflectCol * vec3(1.00, 1.00, 1.00) * glossDot1
  );

  vec3 c = mix(
    mix(
      mix(
        wetSand,
        sand,
        linearstep(-0.002, 0.008, heightAboveWater - grad2 * 0.001)
      ),
      mix(
        grass,
        mix(dirt, rock, linearstep(0.1, 0.5, grad2)),
        linearstep(0.1, 0.3, grad2)
      ),
      linearstep(0.1, 0.15, sqrt(heightAboveWater) + linearstep(0.1, 0.45, grad2) * 0.1 + linearstep(0.4, 0.6, grad2) * 2.0)
    ),
    snow,
    linearstep(snowLow, snowHigh, terrain.z - grad2 * snowSlope)
  );

  // grid
  if (grid) {
    vec2 edge = abs(mod(p.xy, 1.0) - 0.5);
    float edge2 = abs(mod(terrain.z * 10.0, 1.0) - 0.5);
    c = mix(
      c,
      vec3(2.0),
      max(max(
        linearstep(0.49, 0.495, edge.x),
        linearstep(0.49, 0.495, edge.y)),
        linearstep(0.47, 0.49, edge2)
      ) * 0.6
    );
  }

  return c;
}

void upscaleLowRes(vec3 ray, float far, out float d, out float dWaterAdjust, out float shadow, out float shadow2) {
  vec2 lowfract = fract(lowResCoord) - 0.5;
  ivec2 lowpos1 = ivec2(lowResCoord);
  ivec2 lowpos2 = ivec2(lowResCoord + step(0.0, lowfract) * 2.0 - 1.0);
  vec4 lowres00 = texelFetch(lowResDepth, lowpos1, 0);
  vec4 lowres10 = texelFetch(lowResDepth, ivec2(lowpos2.x, lowpos1.y), 0);
  vec4 lowres01 = texelFetch(lowResDepth, ivec2(lowpos1.x, lowpos2.y), 0);
  vec4 lowres11 = texelFetch(lowResDepth, lowpos2, 0);

  vec4 ds = vec4(lowres00.x, lowres01.x, lowres10.x, lowres11.x);
  if (ds.y < ds.x) { ds.xy = ds.yx; }
  if (ds.w < ds.z) { ds.zw = ds.wz; }
  if (ds.z < ds.y) {
    ds.yz = ds.zy;
    if (ds.y < ds.x) { ds.xy = ds.yx; }
    if (ds.w < ds.z) { ds.zw = ds.wz; }
  }

  lowfract = abs(lowfract);
  float m00 = (1.0 - lowfract.x) * (1.0 - lowfract.y);
  float m01 = (1.0 - lowfract.x) * lowfract.y;
  float m10 = lowfract.x * (1.0 - lowfract.y);
  float m11 = lowfract.x * lowfract.y;

  if (ds.x > far) {
    vec4 i = lowres00 * m00 + lowres01 * m01 + lowres10 * m10 + lowres11 * m11;
    d = i.x;
    dWaterAdjust = i.y;
    shadow = i.z;
    shadow2 = i.w;
    return;
  } else if (ds.w <= 0.0) {
    d = 0.0;
    return;
  }

  float tuning = max(ds.x * 0.02, 0.01);
  ds.x = raytune2(origin, ray, ds.x, tuning);
  if (elevationAt(origin + ray * (ds.x + 0.01)) <= 0.0) { d = ds.x; }
  else {
    if (ds.y < ds.x + 0.01) {
      ds.yz = ds.zw;
    }
    ds.y = raytune2(origin, ray, ds.y, tuning);
    if (elevationAt(origin + ray * (ds.y + 0.01)) <= 0.0) { d = ds.y; }
    else if (elevationAt(origin + ray * (ds.z + 0.01)) <= 0.0) { d = ds.z; }
    else { d = ds.w; }
  }

  dWaterAdjust = lowres00.y * m00 + lowres01.y * m01 + lowres10.y * m10 + lowres11.y * m11;
  m00 = linearstep(0.5, 0.0, abs(lowres00.x - d)) + m00 * 0.0001;
  m01 = linearstep(0.5, 0.0, abs(lowres01.x - d)) + m01 * 0.0001;
  m10 = linearstep(0.5, 0.0, abs(lowres10.x - d)) + m10 * 0.0001;
  m11 = linearstep(0.5, 0.0, abs(lowres11.x - d)) + m11 * 0.0001;
  float mt = m00 + m01 + m10 + m11;

  vec2 i = (lowres00.zw * m00 + lowres01.zw * m01 + lowres10.zw * m10 + lowres11.zw * m11) / mt;
  shadow2 = i.y;
  if (mt < 3.5 || lowres00.z * lowres01.z * lowres10.z * lowres11.z > 0.0) {
    shadow = i.x;
  } else if (m00 > 0.997) {
    shadow = lowres00.z;
  } else if (m01 > 0.997) {
    shadow = lowres01.z;
  } else if (m10 > 0.997) {
    shadow = lowres10.z;
  } else if (m11 > 0.997) {
    shadow = lowres11.z;
  } else {
    shadow = -1.0; // calculate for this pixel when needed
  }
}

vec3 render(vec3 ray) {
  float dTop = (origin.z - terrainHeight) / -ray.z;
  float dWater = (origin.z - waterHeight) / -ray.z;
  float dBase = origin.z / -ray.z;

  float far = min(maxDrawDist, (origin.z > waterHeight)
    ? (ray.z > 0.0 ? dTop : dWater)
    : (ray.z > 0.0 ? dWater : dBase));

  float d;
  float dWaterAdjust;
  float shadow;
  float shadow2;
  upscaleLowRes(ray, far, d, dWaterAdjust, shadow, shadow2);

  if (d <= 0.0) {
    return vec3(0.15, 0.1, 0.05);
  }

  vec3 waterCol = vec3(0.00, 0.01, 0.03) * sunDiskCol * smoothstep(-0.2, 0.4, sun.z);

  if (d < far) {
    // ground
    vec3 c = terrainColAt((origin + d * ray).xy, ray, shadow);

    if (origin.z < waterHeight) {
      return mix(waterCol, c, pow(waterFog, d));
    } else {
      return skyFog(c, ray, d);
    }
  }

  if (origin.z >= waterHeight && ray.z > 0.0) {
    // sky
    return sky(ray);
  }

  if (dWater >= maxDrawDist) {
    return skyFog(vec3(0.0), ray, inf);
  }

  vec3 waterOrigin = origin + ray * dWater;
  if (shadow == -1.0) {
    shadow = shadowtrace(waterOrigin, sun);
  }
  waterCol *= shadow * 0.8 + 0.2;
  vec4 water = waterAt((origin + ray * (dWater + dWaterAdjust)).xy);
  vec3 waterNorm = normalize(vec3(-water.xy, 1.0));

  // water interaction
  vec3 rayReflect = reflect(ray, waterNorm);

  if (origin.z < waterHeight) {
    // internal reflection in water
    rayReflect.z = -abs(rayReflect.z); // assume reflection up will reflect back down
    float dReflect = raytrace(
      waterOrigin,
      rayReflect,
      0.0,
      min(maxDrawDist - dWater, waterHeight / -rayReflect.z),
      1.3
    );
    vec3 colReflect = terrainColAt((waterOrigin + dReflect * rayReflect).xy, rayReflect, -1.0);

    // refraction out of water
    vec3 rayRefract = refract(ray, -waterNorm, ${glslFloat(nWater / nAir)});
    if (rayRefract == vec3(0.0)) {
      return mix(waterCol, colReflect, pow(waterFog, dWater + dReflect));
    }

    rayRefract.z = abs(rayRefract.z); // don't allow waves to cause refraction to go downwards
    float far2 = min(maxDrawDist - dWater, (terrainHeight - waterHeight) / rayRefract.z);
    float dRefract = raytrace(waterOrigin, rayRefract, 0.0, far2, 1.3);
    vec3 colRefract = dRefract <= far2 ? terrainColAt((waterOrigin + dRefract * rayRefract).xy, rayRefract, -1.0) : sky(rayRefract);

    // Schlick's approximation
    float p5 = 1.0 - dot(ray, waterNorm);
    float p55 = p5 * p5;
    float reflectance = ${glslFloat(airWater)} + ${glslFloat(1 - airWater)} * p55 * p55 * p5;

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
  vec3 rayRefract = refract(ray, waterNorm, ${glslFloat(nAir / nWater)});
  rayRefract.z = -abs(rayRefract.z); // don't allow waves to cause refraction to go upwards
  // difference between 'far' for low/high res means we need to tune here to avoid stripes
  float dRefract = raytune2(waterOrigin, rayRefract, d - far, 0.15);
  float refractionVis = pow(waterFog, dRefract);
  vec3 colRefract;
  if (refractionVis > 0.05) {
    colRefract = mix(waterCol, terrainColAt((waterOrigin + dRefract * rayRefract).xy, rayRefract, shadow2), refractionVis);
  } else {
    colRefract = waterCol;
  }

  rayReflect.z = abs(rayReflect.z); // assume rays which reflect downwards will eventually reflect back up
  float far2 = min(maxDrawDist - dWater, (terrainHeight - waterHeight) / rayReflect.z);
  float dReflect = raytrace(waterOrigin, rayReflect, 0.0, far2, 1.15);
  vec3 colReflect;
  if (dReflect <= far2) {
    colReflect = skyFog(
      terrainColAt((waterOrigin + dReflect * rayReflect).xy, rayReflect, 0.4),
      rayReflect,
      dReflect
    );
  } else {
    colReflect = sky(rayReflect);
  }

  // Schlick's approximation
  float p5 = 1.0 + dot(ray, waterNorm);
  float p55 = p5 * p5;
  float reflectance = ${glslFloat(airWater)} + ${glslFloat(1 - airWater)} * p55 * p55 * p5;

  return skyFog(mix(colRefract, colReflect, clamp(water.w * 40.0, 0.0, reflectance)), ray, dWater);
}

vec3 convertToDisplayColourSpace(vec3 c) {
  c *= 0.5;
  if (isP3) {
    c = pow(c, vec3(1.0 / 2.2));
  } else {
    c = pow(c, vec3(1.0 / 2.2));
    // match P3 and SRGB (thanks, http://endavid.com/index.php?entry=79)
    // TODO: instead, convert both from a physically meaningful space
    c *= mat3(1.2249, -0.2247, 0.0, -0.0420, 1.0419, 0.0, -0.0197, -0.0786, 1.0979);
  }
  return c;
}

void main(void) {
  float inclination = length(pfov);
  vec3 ray = view * -vec3(sin(inclination) * pfov / inclination, cos(inclination));

  vec3 c = render(ray);
  c = convertToDisplayColourSpace(c);
  c += sharpNoise(vec3(pfov, 0.0)).yyy * (1.0 / 256.0);
  col = vec4(c, 1.0);
}`;

const QUAD_ATTRIB_LOCATION = 0;

class Renderer {
  constructor(canvas, { width, height }) {
    this.width = Math.ceil(width / DOWNSCALE) * DOWNSCALE;
    this.height = Math.ceil(height / DOWNSCALE) * DOWNSCALE;
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

    this.lowResDepthTex = createEmptyTexture(this.ctx, {
      wrap: GL.CLAMP,
      mag: GL.NEAREST,
      min: GL.NEAREST,
      format: getFloatBufferFormats(this.ctx).rgba,
      width: this.width / DOWNSCALE + 2,
      height: this.height / DOWNSCALE + 2,
    });
    this.lowResDepthBuffer = this.ctx.createFramebuffer();
    this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, this.lowResDepthBuffer);
    this.ctx.framebufferTexture2D(
      GL.DRAW_FRAMEBUFFER,
      GL.COLOR_ATTACHMENT0,
      GL.TEXTURE_2D,
      this.lowResDepthTex,
      0
    );

    this.skyboxTex = createEmptyCubeTexture(this.ctx, {
      mag: GL.LINEAR,
      min: GL.LINEAR,
      format: getFloatBufferFormats(this.ctx).rgba,
      size: SKY_SIZE,
    });
    this.skybox = CUBE_MAP_FACES.filter((face) => face.o.z >= 0).map((face) => {
      const buffer = this.ctx.createFramebuffer();
      this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, buffer);
      this.ctx.framebufferTexture2D(
        GL.DRAW_FRAMEBUFFER,
        GL.COLOR_ATTACHMENT0,
        face.glEnum,
        this.skyboxTex,
        0
      );
      return { buffer, face };
    });

    this.diffuseSkyboxTex = createEmptyCubeTexture(this.ctx, {
      mag: GL.LINEAR,
      min: GL.LINEAR,
      format: getFloatBufferFormats(this.ctx).rgba,
      size: SKY_SIZE,
    });
    this.diffuseSkybox = CUBE_MAP_FACES.filter((face) => face.o.z >= 0).map((face) => {
      const buffer = this.ctx.createFramebuffer();
      this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, buffer);
      this.ctx.framebufferTexture2D(
        GL.DRAW_FRAMEBUFFER,
        GL.COLOR_ATTACHMENT0,
        face.glEnum,
        this.diffuseSkyboxTex,
        0
      );
      return { buffer, face };
    });

    this.renderNoiseProgram = new ProgramBuilder(this.ctx)
      .withShader(commonVert)
      .withFragmentShader(RENDER_FRAG_NOISE)
      .bindAttribLocation(QUAD_ATTRIB_LOCATION, 'v')
      .link();

    this.renderSkyboxProgram = new ProgramBuilder(this.ctx)
      .withVertexShader(RENDER_VERT_SKYBOX)
      .withFragmentShader(RENDER_FRAG_SKYBOX)
      .bindAttribLocation(QUAD_ATTRIB_LOCATION, 'v')
      .withUniform3f('o')
      .withUniform3f('dx')
      .withUniform3f('dy')
      .withUniform3f('sun')
      .link();

    this.renderDiffuseSkyboxProgram = new ProgramBuilder(this.ctx)
      .withVertexShader(RENDER_VERT_SKYBOX)
      .withFragmentShader(RENDER_FRAG_DIFFUSE_SKYBOX)
      .bindAttribLocation(QUAD_ATTRIB_LOCATION, 'v')
      .withUniform3f('o')
      .withUniform3f('dx')
      .withUniform3f('dy')
      .withUniform1i('skybox')
      .link();

    this.renderLowResDepthProgram = new ProgramBuilder(this.ctx)
      .withShader(commonVert)
      .withFragmentShader(RENDER_FRAG_DEPTH)
      .bindAttribLocation(QUAD_ATTRIB_LOCATION, 'v')
      .withUniform3f('origin')
      .withUniformMatrix3fv('view')
      .withUniform2f('fov')
      .withUniform1f('maxDrawDist')
      .withUniform3f('sun')
      .withUniform1i('noise')
      .withUniform1f('terrainHeight')
      .withUniform1f('terrainHeightAdjust')
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
      .withUniform1f('ripple2Zoom')
      .withUniform1f('ripple2Height')
      .withUniform2f('ripple2Shift')
      .withUniform1f('waveDist')
      .withUniform1f('waveHeight')
      .withUniform1f('waveFreq')
      .withUniform1f('wavePhase')
      .withUniform1f('shadowBlur')
      .withUniform1f('snowLow')
      .withUniform1f('snowHigh')
      .withUniform1f('snowSlope')
      .link();

    this.renderTerrainProgram = new ProgramBuilder(this.ctx)
      .withShader(commonVert)
      .withFragmentShader(RENDER_FRAG_TERRAIN)
      .bindAttribLocation(QUAD_ATTRIB_LOCATION, 'v')
      .withUniform3f('origin')
      .withUniformMatrix3fv('view')
      .withUniform2f('fov')
      .withUniform1f('maxDrawDist')
      .withUniform2f('lowResSize')
      .withUniform3f('sun')
      .withUniform3f('sunDiskCol')
      .withUniform3f('skyAmbientCol')
      .withUniform1i('grid')
      .withUniform1i('isP3')
      .withUniform1i('lowResDepth')
      .withUniform1i('skybox')
      .withUniform1i('diffuseSkybox')
      .withUniform1i('noise')
      .withUniform1f('terrainHeight')
      .withUniform1f('terrainHeightAdjust')
      .withUniform1f('waterHeight')
      .withUniform1f('waterFog')
      .withUniform1f('atmosphere')
      .withUniform1f('perlinZoom')
      .withUniform1f('perlinFlatCliffs')
      .withUniform1f('perlinFlatPeaks')
      .withUniform1f('perlinGamma')
      .withUniform1f('perlinLargeZoom')
      .withUniform1f('perlinLargeHeight')
      .withUniform1f('rippleZoom')
      .withUniform1f('rippleHeight')
      .withUniform2f('rippleShift')
      .withUniform1f('ripple2Zoom')
      .withUniform1f('ripple2Height')
      .withUniform2f('ripple2Shift')
      .withUniform1f('waveDist')
      .withUniform1f('waveHeight')
      .withUniform1f('waveFreq')
      .withUniform1f('wavePhase')
      .withUniform1f('shadowBlur')
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

    this._renderNoise();
  }

  _renderNoise() {
    this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, this.renderNoiseBuffer);
    this.ctx.viewport(0, 0, NOISE_SIZE, NOISE_SIZE);
    this.renderNoiseProgram.use();
    this.ctx.drawArrays(GL.TRIANGLE_STRIP, 0, 4);
  }

  _renderSky(sun) {
    this.ctx.viewport(0, 0, SKY_SIZE, SKY_SIZE);
    this.renderSkyboxProgram.use({
      sun: xyzTo3f(norm3(sun)),
    });
    for (const { buffer, face } of this.skybox) {
      this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, buffer);
      this.renderSkyboxProgram.set({
        o: xyzTo3f(face.o),
        dx: xyzTo3f(face.dx),
        dy: xyzTo3f(face.dy),
      });
      this.ctx.drawArrays(GL.TRIANGLE_STRIP, 0, 4);
    }

    this.renderDiffuseSkyboxProgram.use({
      skybox: { index: 1, glEnum: GL.TEXTURE_CUBE_MAP, texture: this.skyboxTex },
    });
    for (const { buffer, face } of this.diffuseSkybox) {
      this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, buffer);
      this.renderDiffuseSkyboxProgram.set({
        o: xyzTo3f(face.o),
        dx: xyzTo3f(face.dx),
        dy: xyzTo3f(face.dy),
      });
      this.ctx.drawArrays(GL.TRIANGLE_STRIP, 0, 4);
    }
  }

  forceFullRender() {
    this.renderedConfig = {};
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

    if (!deepEqual(config.sun, this.renderedConfig.sun)) {
      this._renderSky(config.sun);
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

    const atmosphere = 0.997;
    const maxDrawDist = Math.log(0.1) / Math.log(atmosphere);

    const lowW = viewport[2] / DOWNSCALE;
    const lowH = viewport[3] / DOWNSCALE;
    this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, this.lowResDepthBuffer);
    this.ctx.viewport(0, 0, lowW + 2, lowH + 2);
    this.renderLowResDepthProgram.use({
      origin: xyzTo3f(origin),
      view: [false, mat4xyz(view)],
      fov: [fovx * (lowW + 2) / lowW, fovy * (lowH + 2) / lowH],
      maxDrawDist,
      sun: xyzTo3f(norm3(config.sun)),
      noise: { index: 0, texture: this.noiseTex },
      terrainHeight: config.terrainHeight,
      waterHeight: config.waterHeight,
      perlinZoom: config.zoom,
      perlinFlatCliffs: config.cliffFlatness,
      perlinFlatPeaks: config.peakFlatness,
      perlinGamma: config.flatness,
      perlinLargeZoom: config.largeZoom,
      perlinLargeHeight: config.largeHeight,
      terrainHeightAdjust: config.terrainHeight / (1 + config.largeHeight),
      rippleZoom: config.ripple.zoom,
      rippleHeight: config.ripple.height,
      rippleShift: [config.ripple.shift.x, config.ripple.shift.y],
      ripple2Zoom: config.ripple2.zoom,
      ripple2Height: config.ripple2.height,
      ripple2Shift: [config.ripple2.shift.x, config.ripple2.shift.y],
      waveDist: config.wave.distance,
      waveHeight: config.wave.height,
      waveFreq: config.wave.frequency,
      wavePhase: config.wave.phase,
      shadowBlur: config.shadowBlur,
      snowLow: config.snow.low,
      snowHigh: config.snow.high,
      snowSlope: config.snow.slope,
    });
    this.ctx.drawArrays(GL.TRIANGLE_STRIP, 0, 4);

    this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, buffer);
    this.ctx.viewport(...viewport);
    this.ctx.bindVertexArray(this.quadVertexArray);
    this.renderTerrainProgram.use({
      origin: xyzTo3f(origin),
      view: [false, mat4xyz(view)],
      fov: [fovx, fovy],
      maxDrawDist,
      lowResSize: [lowW, lowH],
      sun: xyzTo3f(norm3(config.sun)),
      sunDiskCol: xyzTo3f(SUN_DISK_COL),
      skyAmbientCol: xyzTo3f(calculateAmbientSky(norm3(config.sun))),
      grid: Boolean(config.grid),
      isP3: this.colorspace === 'display-p3',
      noise: { index: 0, texture: this.noiseTex },
      lowResDepth: { index: 1, texture: this.lowResDepthTex },
      skybox: { index: 2, glEnum: GL.TEXTURE_CUBE_MAP, texture: this.skyboxTex },
      diffuseSkybox: { index: 3, glEnum: GL.TEXTURE_CUBE_MAP, texture: this.diffuseSkyboxTex },
      terrainHeight: config.terrainHeight,
      waterHeight: config.waterHeight,
      waterFog: Math.pow(10, -config.waterFog),
      atmosphere,
      perlinZoom: config.zoom,
      perlinFlatCliffs: config.cliffFlatness,
      perlinFlatPeaks: config.peakFlatness,
      perlinGamma: config.flatness,
      perlinLargeZoom: config.largeZoom,
      perlinLargeHeight: config.largeHeight,
      terrainHeightAdjust: config.terrainHeight / (1 + config.largeHeight),
      rippleZoom: config.ripple.zoom,
      rippleHeight: config.ripple.height,
      rippleShift: [config.ripple.shift.x, config.ripple.shift.y],
      ripple2Zoom: config.ripple2.zoom,
      ripple2Height: config.ripple2.height,
      ripple2Shift: [config.ripple2.shift.x, config.ripple2.shift.y],
      waveDist: config.wave.distance,
      waveHeight: config.wave.height,
      waveFreq: config.wave.frequency,
      wavePhase: config.wave.phase,
      shadowBlur: config.shadowBlur,
      snowLow: config.snow.low,
      snowHigh: config.snow.high,
      snowSlope: config.snow.slope,
    });
    this.ctx.drawArrays(GL.TRIANGLE_STRIP, 0, 4);
  }
}
