'use strict';

const NOISE_SIZE = 1024;

const RENDER_VERT = `#version 300 es
precision mediump float;

uniform vec2 fov;
uniform vec2 shift;
in vec2 v;
out vec2 pfov;

void main(void) {
  pfov = (v + shift) * fov;
  gl_Position = vec4(v, 0.0, 1.0);
}`;

const RENDER_FRAG_NOISE = `#version 300 es
precision mediump float;

out vec4 col;

${glslRandom('random', 6)}

void main(void) {
  col = vec4(random(uvec2(gl_FragCoord.x, gl_FragCoord.y)), 0.0, 1.0);
}`;

const HELPER_FNS = `
float linearstep(float edge0, float edge1, float x) {
  return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}
`;

const TERRAIN_FNS = `
#define SMOOTHNESS 2

uniform sampler2D noise;
uniform float perlinZoom;
uniform float perlinFlatCliffs;
uniform float perlinFlatPeaks;
uniform float perlinGamma;
uniform float perlinLargeZoom;
uniform float perlinLargeHeight;
uniform float rippleZoom;
uniform float rippleHeight;
uniform vec2 rippleShift;

const float PERLIN_SCALE = 1.92;
const float PERLIN_DIVIDE = 2.0;
const float PERLIN_SHIFT_ANGLE = 0.7;

const float inf = 1.0 / 0.0;

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

vec2 sharpNoise(vec2 pos) {
  return texture(noise, pos * 10000.0).xy;
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
  vec2 m = ((6.0 * f - 15.0) * f + 10.0) * f * f * f;
  vec2 dm = ((f - 2.0) * f * 30.0 + 30.0) * f * f;
#endif

  return vec3(
    p10 * dm.x + p11 * dm.x * m.y, // x grad
    p01 * dm.y + p11 * m.x * dm.y, // y grad
    p00 + p10 * m.x + p01 * m.y + p11 * m.x * m.y - 0.5 // value
  );
}

${[9, 15].map((count) => `
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

float elevationAt(vec3 pos) {
  return pos.z - terrainAndGrad9(pos.xy).z;
}

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
  return sumLarge * rippleHeight * linearstep(0.002, 0.02, depth);
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
  if (near < 0.0 || far <= near) {
    return inf;
  }

  float maxGrad = terrainHeight * 2.0;
  float gradStep = 1.0 / (length(ray.xy) * maxGrad - ray.z);

  vec3 p = o + near * ray;
  float g = elevationAt(p);
  if (g < 0.0) {
    return near;
  }

  const float shift = 0.1;
  near += shift;
  far += shift;
  float d = near + g * gradStep * sharpNoise(ray.xy).y;

  for (int i = 0; i < 500; ++i) {
    d = min(d, far);
    p = o + (d - shift) * ray;
    g = elevationAt(p);
    if (g < 0.0) {
      return raytune2(o, ray, (near + d) * 0.5 - shift, (d - near) * 0.5);
    }
    if (d >= far) {
      return inf;
    }
    near = d;
    d = max(d * dm, d + g * gradStep);
  }
}

float shadowtrace(vec3 o, vec3 ray, float blur) {
  if (ray.z < 0.001) {
    return 0.0;
  }

  float maxGrad = terrainHeight * 2.0;
  float gradStep = 1.0 / (length(ray.xy) * maxGrad - (ray.z - blur));

  float l = (o.z - terrainHeight) / -ray.z;
  float step = max(0.2, l * 0.01);
  float vis = 1.0;
  float d = step * (sharpNoise(o.xy).y * 0.5 + 0.01);
  while (d < l) {
    vec3 p = o + d * ray;
    float g = elevationAt(p);
    float range = blur * d;
    float pvis = linearstep(-range, range, g);
    vis *= pow(pvis, step * 5.0);
    if (vis < 0.05) {
      return 0.0;
    }
    d += max(step, g * gradStep);
  }
  return vis;
}
`;

const RENDER_FRAG_DEPTH = `#version 300 es
precision mediump float;

uniform vec3 origin;
uniform mat3 view;
uniform float terrainHeight;
uniform float waterHeight;
uniform float waterFog;
uniform float snowLow;
uniform float snowHigh;
uniform float snowSlope;
uniform vec3 sun;

in vec2 pfov;
out vec4 col;

${HELPER_FNS}
${TERRAIN_FNS}

const float nAir = 1.0;
const float nWater = 1.333;
const float airWater = pow(abs(nAir - nWater) / (nAir + nWater), 2.0);

void main(void) {
  float inclination = length(pfov);
  vec3 ray = view * -vec3(sin(inclination) * pfov / inclination, cos(inclination));

  float dTop = (origin.z - terrainHeight) / -ray.z;
  float dWater = (origin.z - waterHeight) / -ray.z;
  float dBase = origin.z / -ray.z;

  float far = (origin.z > waterHeight)
    ? (ray.z > 0.0 ? dTop : dWater)
    : (ray.z > 0.0 ? dWater : dBase);
  float d = raytrace(
    origin,
    ray,
    origin.z > terrainHeight ? dTop : 0.0,
    far,
    1.02
  );

  if (d <= 0.0) {
    // burried
    col = vec4(0.0, 0.0, 0.0, 0.0);
  } else if (d <= far) {
    // land
    vec3 p = origin + ray * d;
    vec3 terrain = terrainAndGrad15(p.xy);
    vec3 norm = normalize(vec3(-terrain.xy, 1.0));
    col = vec4(d, dot(sun, norm) > 0.0 ? shadowtrace(p, sun, 0.2) : 0.0, 0.0, 0.0);
  } else if (origin.z >= waterHeight && ray.z > 0.0) {
    // sky
    col = vec4(inf, 1.0, 0.0, 0.0);
  } else {
    // water
    vec3 p = origin + ray * dWater;
    col = vec4(inf, shadowtrace(p, sun, 0.2), 0.0, 0.0);
  }
}`;

const RENDER_FRAG_TERRAIN = `#version 300 es
precision mediump float;

uniform sampler2D lowResDepth;
uniform vec3 origin;
uniform mat3 view;
uniform float terrainHeight;
uniform float waterHeight;
uniform float waterFog;
uniform float snowLow;
uniform float snowHigh;
uniform float snowSlope;
uniform vec3 sun;
uniform bool grid;
uniform bool isP3;

in vec2 pfov;
out vec4 col;

${HELPER_FNS}
${TERRAIN_FNS}

const float nAir = 1.0;
const float nWater = 1.333;
const float airWater = pow(abs(nAir - nWater) / (nAir + nWater), 2.0);

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
  return skyScatterInternal(d - pow(0.96 - ray.z, 50.0)) + sunDiskCol * pow(linearstep(0.06, 0.03, d), 10.0);
}

vec3 terrainColAt(vec2 p, vec3 ray, float shadow) {
  vec3 terrain = terrainAndGrad15(p);
  vec3 norm = normalize(vec3(-terrain.xy, 1.0));
  float grad2 = dot(terrain.xy, terrain.xy);
  float heightAboveWater = terrain.z - waterHeight;

  // lighting
  vec3 reflectRay = reflect(ray, norm);
  float glossDot1 = max(dot(sun, reflectRay), 0.0) * linearstep(0.0, 0.1, reflectRay.z * max(0.0, sun.z + 0.1));
  float glossDot2 = glossDot1 * glossDot1;
  float glossDot4 = glossDot2 * glossDot2;
  float glossDot8 = glossDot4 * glossDot4;
  vec3 reflectCol = sunDiskCol;
  vec3 diffuseCol = skyScatter(norm) + sunDiskCol * max(dot(sun, norm), 0.0);
  float innerScatter = dot(sun, norm) * 0.5 + 0.5;
  vec3 ambientCol = skyScatter(vec3(0.0, 0.0, 1.0)) + sunDiskCol * smoothstep(-0.4, 0.4, sun.z);
  if (shadow == -1.0) {
    shadow = dot(sun, norm) > 0.0 ? shadowtrace(vec3(p, terrain.z), sun, 0.2) : 0.0;
  }
  diffuseCol *= shadow * 0.8 + 0.2;
  ambientCol *= shadow * 0.7 + 0.3;
  reflectCol *= shadow;

  vec3 rock = (
    + ambientCol * vec3(0.003, 0.003, 0.002) * 0.4
    + diffuseCol * vec3(0.050, 0.040, 0.050) * 0.4
    + reflectCol * vec3(0.030, 0.040, 0.040) * 0.4 * glossDot8
  );

  vec3 dirt = (
    + ambientCol * vec3(0.020, 0.008, 0.010) * 0.3
    + diffuseCol * vec3(0.200, 0.080, 0.020) * 0.3
  );

  vec3 grass = (
    + ambientCol * vec3(0.001, 0.002, 0.000)
    + diffuseCol * vec3(0.010, 0.030, 0.015)
  );

  vec3 sand = (
    + ambientCol * vec3(0.040, 0.030, 0.010)
    + diffuseCol * vec3(0.030, 0.024, 0.012)
  );

  vec3 wetSand = (
    + sand * 0.6
    + reflectCol * vec3(0.020, 0.015, 0.011) * glossDot2
  );

  vec3 sandmix = mix(
    wetSand,
    sand,
    linearstep(-0.0005, 0.01, heightAboveWater - grad2 * 0.001)
  );

  vec3 snow = (
    + ambientCol * (vec3(0.060, 0.070, 0.075) + innerScatter * 0.2)
    + diffuseCol * 0.150
    + reflectCol * 0.100 * glossDot8
  );

  vec3 c = mix(
    mix(
      sandmix,
      mix(
        grass,
        mix(dirt, rock, linearstep(0.1, 0.5, grad2)),
        linearstep(0.1, 0.3, grad2)
      ),
      linearstep(0.009, 0.019, heightAboveWater + linearstep(0.05, 0.45, grad2) * 0.03)
    ),
    snow,
    linearstep(snowLow, snowHigh, terrain.z - grad2 * snowSlope)
  );

  // approx. water attenuation of incoming light
  if (heightAboveWater < 0.0) {
    c *= pow(waterFog, -heightAboveWater);
  }

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

vec2 upscaleLowRes(vec3 ray) {
  vec2 fragcoord = gl_FragCoord.xy * 0.25;
  ivec2 lowpos = ivec2(fragcoord);
  vec2 lowfract = fract(fragcoord) - 0.5;
  ivec2 lowshift = ivec2(step(0.0, lowfract) * 2.0 - 1.0);
  vec2 lowres00 = texelFetch(lowResDepth, lowpos, 0).xy;
  vec2 lowres10 = texelFetch(lowResDepth, lowpos + ivec2(lowshift.x, 0), 0).xy;
  vec2 lowres01 = texelFetch(lowResDepth, lowpos + ivec2(0, lowshift.y), 0).xy;
  vec2 lowres11 = texelFetch(lowResDepth, lowpos + lowshift, 0).xy;

  if (lowres00.x == 0.0) {
    return lowres00;
  }

  float d0 = lowres00.x;
  float d1 = lowres01.x;
  float d2 = lowres10.x;
  float d3 = lowres11.x;
  if (d1 < d0) { float t = d0; d0 = d1; d1 = t; }
  if (d2 < d1) { float t = d1; d1 = d2; d2 = t; }
  if (d1 < d0) { float t = d0; d0 = d1; d1 = t; }
  if (d3 < d2) { float t = d2; d2 = d3; d3 = t; }
  if (d2 < d1) { float t = d1; d1 = d2; d2 = t; }
  if (d1 < d0) { float t = d0; d0 = d1; d1 = t; }

  float d;
  d0 = raytune2(origin, ray, d0, 0.15);
  if (elevationAt(origin + ray * (d0 + 0.01)) <= 0.0) { d = d0; }
  else {
    if (d1 < d0 + 0.05) {
      d1 = d2;
      d2 = d3;
      if (d1 < d0 + 0.05) {
        d1 = d2;
      }
    }
    d1 = raytune2(origin, ray, d1, 0.15);
    if (elevationAt(origin + ray * (d1 + 0.02)) <= 0.0) { d = d1; }
    else if (elevationAt(origin + ray * (d2 + 0.05)) <= 0.0) { d = d2; }
    else { d = d3; }
  }

  lowfract = abs(lowfract);
  float m00 = linearstep(0.5, 0.0, abs(lowres00.x - d)) + (1.0 - lowfract.x) * (1.0 - lowfract.y) * 0.0001;
  float m01 = linearstep(0.5, 0.0, abs(lowres01.x - d)) + (1.0 - lowfract.x) * lowfract.y * 0.0001;
  float m10 = linearstep(0.5, 0.0, abs(lowres10.x - d)) + lowfract.x * (1.0 - lowfract.y) * 0.0001;
  float m11 = linearstep(0.5, 0.0, abs(lowres11.x - d)) + lowfract.x * lowfract.y * 0.0001;
  float mt = m00 + m01 + m10 + m11;

  float shadow;
  if (mt < 0.2) {
    shadow = (lowres00.y * m00 + lowres01.y * m01 + lowres10.y * m10 + lowres11.y * m11) / mt;
  } else if (m00 > 0.999) {
    shadow = lowres00.y;
  } else if (m01 > 0.999) {
    shadow = lowres01.y;
  } else if (m10 > 0.999) {
    shadow = lowres10.y;
  } else if (m11 > 0.999) {
    shadow = lowres11.y;
  } else {
    shadow = -1.0; // calculate for this pixel when needed
  }

  return vec2(d, shadow);
}

vec3 render(vec3 ray) {
  float dTop = (origin.z - terrainHeight) / -ray.z;
  float dWater = (origin.z - waterHeight) / -ray.z;
  float dBase = origin.z / -ray.z;

  vec2 upscaled = upscaleLowRes(ray);
  float d = upscaled.x;
  float shadow = upscaled.y;

  if (d == 0.0) {
    return vec3(0.15, 0.1, 0.05);
  }

  vec3 waterCol = vec3(0.00, 0.01, 0.03) * sunDiskCol * smoothstep(-0.2, 0.4, sun.z);

  float far = (origin.z > waterHeight)
    ? (ray.z > 0.0 ? dTop : dWater)
    : (ray.z > 0.0 ? dWater : dBase);

  if (d < far) {
    // ground
    vec3 c = terrainColAt((origin + d * ray).xy, ray, shadow);

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
  if (shadow == -1.0) {
    shadow = shadowtrace(waterOrigin, sun, 0.3);
  }
  waterCol *= shadow * 0.8 + 0.2;
  float depth = waterHeight - terrainAndGrad15(waterOrigin.xy).z;
  vec3 waterNorm = normalize(vec3(-waterAt(waterOrigin.xy, depth).xy, 1.0));

  // water interaction
  vec3 rayReflect = reflect(ray, waterNorm);

  if (origin.z < waterHeight) {
    // internal reflection in water
    rayReflect.z = -abs(rayReflect.z); // assume reflection up will reflect back down
    float dReflect = raytrace(waterOrigin, rayReflect, 0.0, waterHeight / -rayReflect.z, 1.3);
    vec3 colReflect = terrainColAt((waterOrigin + dReflect * rayReflect).xy, rayReflect, -1.0);

    // refraction out of water
    vec3 rayRefract = refract(ray, -waterNorm, nWater / nAir);
    if (rayRefract == vec3(0.0)) {
      return mix(waterCol, colReflect, pow(waterFog, dWater + dReflect));
    }

    rayRefract.z = abs(rayRefract.z); // don't allow waves to cause refraction to go downwards
    float far2 = (terrainHeight - waterHeight) / rayRefract.z;
    float dRefract = raytrace(waterOrigin, rayRefract, 0.0, far2, 1.3);
    vec3 colRefract = dRefract <= far2 ? terrainColAt((waterOrigin + dRefract * rayRefract).xy, rayRefract, -1.0) : sky(rayRefract);

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
  vec3 colRefract = terrainColAt((waterOrigin + dRefract * rayRefract).xy, rayRefract, -1.0);

  rayReflect.z = abs(rayReflect.z); // assume rays which reflect downwards will eventually reflect back up
  float far2 = (terrainHeight - waterHeight) / rayReflect.z;
  float dReflect = raytrace(waterOrigin, rayReflect, 0.0, far2, 1.1);
  vec3 colReflect = dReflect <= far2 ? terrainColAt((waterOrigin + dReflect * rayReflect).xy, rayReflect, -1.0) : sky(rayReflect);

  // Schlick's approximation
  float reflectance = airWater + (1.0 - airWater) * pow(1.0 + dot(ray, waterNorm), 5.0);

  return mix(
    mix(waterCol, colRefract, pow(waterFog, dRefract)),
    colReflect,
    clamp(depth * 40.0, 0.0, reflectance)
  );
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
  c += sharpNoise(pfov.xy).yyy * (1.0 / 256.0);
  col = vec4(c, 1.0);
}`;

const QUAD_ATTRIB_LOCATION = 0;

class Renderer {
  constructor(canvas, { width, height }) {
    this.width = (width + 3) & ~3;
    this.height = (height + 3) & ~3;
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
      format: getFloatBufferFormats(this.ctx).rg,
      width: this.width / 4,
      height: this.height / 4,
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

    this.renderNoiseProgram = new ProgramBuilder(this.ctx)
      .withShader(commonVert)
      .withFragmentShader(RENDER_FRAG_NOISE)
      .bindAttribLocation(QUAD_ATTRIB_LOCATION, 'v')
      .link();

    this.renderLowResDepthProgram = new ProgramBuilder(this.ctx)
      .withShader(commonVert)
      .withFragmentShader(RENDER_FRAG_DEPTH)
      .bindAttribLocation(QUAD_ATTRIB_LOCATION, 'v')
      .withUniform3f('origin')
      .withUniformMatrix3fv('view')
      .withUniform2f('fov')
      .withUniform2f('shift')
      .withUniform3f('sun')
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

    this.renderTerrainProgram = new ProgramBuilder(this.ctx)
      .withShader(commonVert)
      .withFragmentShader(RENDER_FRAG_TERRAIN)
      .bindAttribLocation(QUAD_ATTRIB_LOCATION, 'v')
      .withUniform3f('origin')
      .withUniformMatrix3fv('view')
      .withUniform2f('fov')
      .withUniform2f('shift')
      .withUniform3f('sun')
      .withUniform1i('grid')
      .withUniform1i('isP3')
      .withUniform1i('lowResDepth')
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

    this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, this.lowResDepthBuffer);
    this.ctx.viewport(0, 0, viewport[2] / 4, viewport[3] / 4);
    this.renderLowResDepthProgram.use({
      origin: xyzTo3f(origin),
      view: [false, mat4xyz(view)],
      fov: [fovx, fovy],
      shift: [0, 0],//[(1 / 4 - 1) / (2 * this.width), (1 / 4 - 1) / (2 * this.height)],
      sun: xyzTo3f(norm3(config.sun)),
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

    this.ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, buffer);
    this.ctx.viewport(...viewport);
    this.ctx.bindVertexArray(this.quadVertexArray);
    this.renderTerrainProgram.use({
      origin: xyzTo3f(origin),
      view: [false, mat4xyz(view)],
      fov: [fovx, fovy],
      shift: [0, 0],
      sun: xyzTo3f(norm3(config.sun)),
      grid: Boolean(config.grid),
      isP3: this.colorspace === 'display-p3',
      noise: { index: 0, texture: this.noiseTex },
      lowResDepth: { index: 1, texture: this.lowResDepthTex },
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
