'use strict';

const STENCIL_VERT = `#version 300 es
precision mediump float;

in vec2 pos;
in vec2 corner;
in float lineR;
in float arcR;
in vec4 lineCol;

out vec2 uv;
flat out float lr;
flat out float ar;
flat out vec4 c;

void main(void) {
  uv = corner;
  lr = lineR;
  ar = arcR;
  c = lineCol;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

const STENCIL_FRAG = `#version 300 es
precision mediump float;

uniform float iblurRGB;
uniform float iblurA;

in vec2 uv;
flat in float lr;
flat in float ar;
flat in vec4 c;

out vec4 col;

void main(void) {
  float d = abs(length(uv) - ar) - lr;
  col = vec4(
    c.xyz * clamp(1.0 - d * iblurRGB, 0.0, 1.0),
    c.w * clamp(0.5 - d * iblurA, 0.0, 1.0)
  );
}`;

const StencilRenderer = (size, animation) => (ctx) => {
  const texture = createEmptyTexture(ctx, {
    wrap: GL.CLAMP_TO_EDGE,
    mag: GL.LINEAR,
    min: GL.LINEAR,
    format: GL.RGBA8, // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#some_formats_e.g._rgb_may_be_emulated
    width: size,
    height: size,
  });
  const buffer = ctx.createFramebuffer();
  ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, buffer);
  ctx.framebufferTexture2D(
    GL.DRAW_FRAMEBUFFER,
    GL.COLOR_ATTACHMENT0,
    GL.TEXTURE_2D,
    texture,
    0
  );

  const program = new ProgramBuilder(ctx)
    .withVertexShader(STENCIL_VERT)
    .withFragmentShader(STENCIL_FRAG)
    .withUniform1f('iblurRGB')
    .withUniform1f('iblurA')
    .withAttribute('pos')
    .withAttribute('corner')
    .withAttribute('lineR')
    .withAttribute('arcR')
    .withAttribute('lineCol')
    .link();

  const vertexArray = ctx.createVertexArray();
  ctx.bindVertexArray(vertexArray);
  const vertexBuffer = ctx.createBuffer();
  ctx.bindBuffer(GL.ARRAY_BUFFER, vertexBuffer);
  program.vertexAttribPointer('pos', 2, GL.FLOAT, false, 10 * Float32Array.BYTES_PER_ELEMENT, 0 * Float32Array.BYTES_PER_ELEMENT);
  program.vertexAttribPointer('corner', 2, GL.FLOAT, false, 10 * Float32Array.BYTES_PER_ELEMENT, 2 * Float32Array.BYTES_PER_ELEMENT);
  program.vertexAttribPointer('lineR', 1, GL.FLOAT, false, 10 * Float32Array.BYTES_PER_ELEMENT, 4 * Float32Array.BYTES_PER_ELEMENT);
  program.vertexAttribPointer('arcR', 1, GL.FLOAT, false, 10 * Float32Array.BYTES_PER_ELEMENT, 5 * Float32Array.BYTES_PER_ELEMENT);
  program.vertexAttribPointer('lineCol', 4, GL.FLOAT, false, 10 * Float32Array.BYTES_PER_ELEMENT, 6 * Float32Array.BYTES_PER_ELEMENT);

  const blurRGB = 1 / size;
  const blurA = 8 / size;
  const maxBlur = Math.max(blurRGB, blurA);

  const draw = (linesToRender, palette) => {
    const vertexData = [];
    let vertexCount = 0;
    const addQuad = (x1, y1, x2, y2, u1, v1, u2, v2, r, t, col) => {
      vertexData.push(x1, y1, u1, v1, r, t, col[0], col[1], col[2], col[3]);
      vertexData.push(x2, y1, u2, v1, r, t, col[0], col[1], col[2], col[3]);
      vertexData.push(x1, y2, u1, v2, r, t, col[0], col[1], col[2], col[3]);
      vertexData.push(x1, y2, u1, v2, r, t, col[0], col[1], col[2], col[3]);
      vertexData.push(x2, y1, u2, v1, r, t, col[0], col[1], col[2], col[3]);
      vertexData.push(x2, y2, u2, v2, r, t, col[0], col[1], col[2], col[3]);
      vertexCount += 6;
    };
    const addLineQuad = (x1, y1, x2, y2, expand, r, col) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const m = expand / Math.sqrt(dx * dx + dy * dy);
      const sx = -dy * m;
      const sy = dx * m;
      vertexData.push(x1 - sx, y1 - sy, -expand, 0, r, 0, col[0], col[1], col[2], col[3]);
      vertexData.push(x1 + sx, y1 + sy, expand, 0, r, 0, col[0], col[1], col[2], col[3]);
      vertexData.push(x2 - sx, y2 - sy, -expand, 0, r, 0, col[0], col[1], col[2], col[3]);
      vertexData.push(x2 - sx, y2 - sy, -expand, 0, r, 0, col[0], col[1], col[2], col[3]);
      vertexData.push(x1 + sx, y1 + sy, expand, 0, r, 0, col[0], col[1], col[2], col[3]);
      vertexData.push(x2 + sx, y2 + sy, expand, 0, r, 0, col[0], col[1], col[2], col[3]);
      vertexCount += 6;
    };
    const addArc = (cx, cy, outerRadius, a1, a2, ar, lr, col) => {
      if (a1 === a2) {
        return;
      }
      const extr = outerRadius / Math.cos(Math.abs(a2 - a1) * 0.5);
      vertexData.push(cx, cy, 0, 0, ar, lr, col[0], col[1], col[2], col[3]);
      const dx1 = Math.cos(a1) * extr;
      const dy1 = Math.sin(a1) * extr;
      vertexData.push(cx + dx1, cy + dy1, dx1, dy1, ar, lr, col[0], col[1], col[2], col[3]);
      const dx2 = Math.cos(a2) * extr;
      const dy2 = Math.sin(a2) * extr;
      vertexData.push(cx + dx2, cy + dy2, dx2, dy2, ar, lr, col[0], col[1], col[2], col[3]);
      vertexCount += 3;
    };
    linesToRender.visit((step, { lineWidth, colour }) => {
      const r = lineWidth / 2 + maxBlur;
      const col = palette[colour];
      if (step instanceof Line) {
        addLineQuad(
          step.x1,
          step.y1,
          step.x,
          step.y,
          r,
          lineWidth / 2,
          col,
        );
      } else if (step instanceof Arc) {
        let a = step.da;
        const d = step.r + r;
        while (Math.abs(a) > Math.PI / 4) {
          const next = a + (Math.PI / 4) * ((a > 0) ? -1 : 1);
          addArc(step.cx, step.cy, d, step.a1 + a, step.a1 + next, lineWidth / 2, step.r, col);
          a = next;
        }
        addArc(step.cx, step.cy, d, step.a1 + a, step.a1, lineWidth / 2, step.r, col);
      }
      addQuad(
        step.x - r,
        step.y - r,
        step.x + r,
        step.y + r,
        -r,
        -r,
        r,
        r,
        lineWidth / 2,
        0,
        col,
      );
    });

    ctx.bindVertexArray(vertexArray);
    ctx.bindBuffer(GL.ARRAY_BUFFER, vertexBuffer);
    ctx.bufferData(GL.ARRAY_BUFFER, new Float32Array(vertexData), GL.DYNAMIC_DRAW);
    ctx.drawArrays(GL.TRIANGLES, 0, vertexCount);
  };

  return ({ frame, trace }) => {
    const lines = new MultiLine2D(animation.at(animation.duration * frame));

    ctx.bindFramebuffer(GL.DRAW_FRAMEBUFFER, buffer);
    ctx.viewport(0, 0, size, size);
    ctx.clearColor(0, 0, 0, 0);
    ctx.clear(GL.COLOR_BUFFER_BIT);
    ctx.blendEquation(GL.MAX);
    ctx.blendFunc(GL.ONE, GL.ONE);
    ctx.enable(GL.BLEND);
    // avoid setting edge pixels, which leak due to CLAMP_TO_EDGE
    ctx.scissor(1, 1, size - 2, size - 2);
    ctx.enable(GL.SCISSOR_TEST);

    program.use({
      iblurRGB: 0.5 / blurRGB,
      iblurA: 0.5 / blurA,
    });
    draw(lines, { white: [1, 1, 1, 1], grey: [trace, trace, trace, 1] });

    ctx.disable(GL.BLEND);
    ctx.disable(GL.SCISSOR_TEST);

    const activePos = { x: 0, y: 0 };
    let activeWeight = 0;
    lines.visit((step, { lineWidth, colour }) => {
      if (colour === 'white') {
        activePos.x += step.x * lineWidth;
        activePos.y += step.y * lineWidth;
        activeWeight += lineWidth;
      }
    });
    if (activeWeight > 0) {
      activePos.x /= activeWeight;
      activePos.y /= activeWeight;
    }

    return {
      texture,
      texturePixelSize: size,
      edge: blurA,
      bounds: growBounds(lines.bounds(), blurRGB + 1 / size),
      focusPos: activePos,
    };
  };
};
