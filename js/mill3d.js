import { toolR, toolColor, accTime } from "./gcode.js?v=44";

function bboxOf(job) {
  const b = job?.bbox;
  if (b) return b;
  const pts = job?.points || [];
  if (!pts.length) return { minX: 0, minY: 0, maxX: 80, maxY: 50 };
  return pts.reduce((o, p) => ({
    minX: Math.min(o.minX, p.x), minY: Math.min(o.minY, p.y),
    maxX: Math.max(o.maxX, p.x), maxY: Math.max(o.maxY, p.y),
  }), { minX: pts[0].x, minY: pts[0].y, maxX: pts[0].x, maxY: pts[0].y });
}

function hexRgb(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl, vsSrc, fsSrc) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "program");
  return p;
}

function mul4(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const m = new Float32Array(16);
  m[0] = f / Math.max(aspect, 0.2);
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

function viewOrbit(cx, cy, cz, yaw, pitch, dist) {
  const cy0 = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const r00 = cy0;
  const r01 = -sy;
  const r10 = -sp * sy;
  const r11 = -sp * cy0;
  const r12 = cp;
  const r20 = cp * sy;
  const r21 = cp * cy0;
  const r22 = sp;
  const m = new Float32Array(16);
  m[0] = r00; m[4] = r01; m[8] = 0; m[12] = -(r00 * cx + r01 * cy);
  m[1] = r10; m[5] = r11; m[9] = r12; m[13] = -(r10 * cx + r11 * cy + r12 * cz);
  m[2] = r20; m[6] = r21; m[10] = r22; m[14] = -(r20 * cx + r21 * cy + r22 * cz) - dist;
  m[15] = 1;
  return m;
}

const VS_BG = `
attribute vec2 aPos;
varying float vY;
void main() {
  vY = aPos.y * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.999, 1.0);
}
`;

const FS_BG = `
precision mediump float;
varying float vY;
void main() {
  vec3 top = vec3(0.58, 0.63, 0.68);
  vec3 bot = vec3(0.27, 0.30, 0.34);
  gl_FragColor = vec4(mix(bot, top, vY), 1.0);
}
`;

const VS_LIT = `
attribute vec3 aPos;
attribute vec3 aNrm;
attribute vec3 aCol;
uniform mat4 uMVP;
uniform vec2 uPan;
uniform vec3 uOff;
varying vec3 vN;
varying vec3 vC;
varying vec3 vW;
void main() {
  vN = aNrm;
  vC = aCol;
  vW = aPos + uOff;
  vec4 clip = uMVP * vec4(aPos, 1.0);
  clip.xy += uPan * clip.w;
  gl_Position = clip;
}
`;

const FS_LIT = `
precision mediump float;
varying vec3 vN;
varying vec3 vC;
varying vec3 vW;
uniform vec3 uEye;
uniform vec3 uLight;
void main() {
  vec3 n = normalize(vN);
  vec3 l = normalize(uLight);
  vec3 v = normalize(uEye - vW);
  if (dot(n, v) < 0.0) n = -n;
  vec3 h = normalize(l + v);
    float diff = max(dot(n, l), 0.0);
  float fill = max(dot(n, normalize(vec3(-0.2, 0.35, 0.7))), 0.0);
  float spec = pow(max(dot(n, h), 0.0), 36.0);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.4) * 0.22;
  vec3 col = vC * (0.48 + 0.44 * diff + 0.22 * fill) + vec3(1.0, 1.0, 1.0) * spec * 0.38 + vec3(rim);
  gl_FragColor = vec4(col, 1.0);
}
`;

const VS_LINE = `
attribute vec3 aPos;
attribute vec3 aCol;
uniform mat4 uMVP;
uniform vec2 uPan;
varying vec3 vC;
void main() {
  vC = aCol;
  vec4 clip = uMVP * vec4(aPos, 1.0);
  clip.xy += uPan * clip.w;
  gl_Position = clip;
}
`;

const FS_LINE = `
precision mediump float;
varying vec3 vC;
void main() {
  gl_FragColor = vec4(vC, 1.0);
}
`;

function makeToolMesh(t, topZ, minZ) {
  const cutR = Math.max(toolR(t), 0.9);
  const body = hexRgb(toolColor(t));
  const bodyDk = [body[0] * 0.72, body[1] * 0.72, body[2] * 0.72];
  const steel = [0.78, 0.82, 0.86];
  const steelDk = [0.62, 0.66, 0.7];
  const hold = [0.22, 0.24, 0.27];
  const nut = [0.86, 0.89, 0.92];
  const neckR = Math.max(cutR * 0.55, 0.7);
  const shankR = Math.max(cutR * 0.72, 1.1);
  const holdR = Math.max(cutR * 1.85, 4.2);
  const nutR = Math.max(cutR * 2.2, 5);
  const fluteH = Math.max(12, cutR * 4.2, (topZ - minZ) * 0.32);
  const neckH = 8;
  const shankH = Math.max(22, (topZ - minZ) * 0.5);
  const z = [0, fluteH * 0.18, fluteH, fluteH + neckH, fluteH + neckH + shankH, fluteH + neckH + shankH + 14, fluteH + neckH + shankH + 22, fluteH + neckH + shankH + 38];
  const rad = [cutR * 0.12, cutR, cutR, neckR, shankR, holdR, nutR, shankR * 0.55];
  const colA = [bodyDk, body, bodyDk, steelDk, steel, hold, nut, hold];
  const colB = [body, bodyDk, body, steel, steelDk, [0.3, 0.32, 0.35], [0.74, 0.78, 0.82], [0.18, 0.2, 0.22]];
  const n = 36;
  const pos = [];
  const nrm = [];
  const col = [];
  const idx = [];
  const ring = (zi, r, rgb) => {
    const base = pos.length / 3;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      pos.push(nx * r, ny * r, zi);
      nrm.push(nx, ny, 0.08);
      col.push(rgb[0], rgb[1], rgb[2]);
    }
    return base;
  };
  const tube = (a, b, ca, cb) => {
    const ra = ring(z[a], rad[a], ca);
    const rb = ring(z[b], rad[b], cb);
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      idx.push(ra + i, ra + j, rb + j, ra + i, rb + j, rb + i);
    }
  };
  for (let i = 0; i < z.length - 1; i += 1) tube(i, i + 1, colA[i], colB[i]);
  const cap = ring(z[z.length - 1], rad[rad.length - 1], [0.92, 0.94, 0.96]);
  const c = pos.length / 3;
  pos.push(0, 0, z[z.length - 1]);
  nrm.push(0, 0, 1);
  col.push(0.94, 0.96, 0.98);
  for (let i = 0; i < n; i += 1) idx.push(c, cap + i, cap + ((i + 1) % n));
  const tip = ring(0, rad[0], bodyDk);
  const t0 = pos.length / 3;
  pos.push(0, 0, 0);
  nrm.push(0, 0, -1);
  col.push(bodyDk[0], bodyDk[1], bodyDk[2]);
  for (let i = 0; i < n; i += 1) idx.push(t0, tip + ((i + 1) % n), tip + i);
  return {
    pos: new Float32Array(pos),
    nrm: new Float32Array(nrm),
    col: new Float32Array(col),
    idx: new Uint16Array(idx),
  };
}

export function createMill(job) {
  const b = bboxOf(job);
  const pad = 2.5;
  const minX = b.minX - pad;
  const maxX = b.maxX + pad;
  const minY = b.minY - pad;
  const maxY = b.maxY + pad;
  const pts0 = job.points || [];
  const cutZ = pts0.filter((p) => !p.rapid).map((p) => p.z || 0);
  const deep = cutZ.length ? Math.min(...cutZ) : -8;
  const high = cutZ.length ? Math.max(...cutZ) : 0;
  const minZ = deep - 1;
  const topZ = Math.max(high, 0) + 5;
  const spanX = Math.max(maxX - minX, 8);
  const spanY = Math.max(maxY - minY, 8);
  const spanZ = Math.max(topZ - minZ, 8);
  const cell = 0.14;
  let cols = Math.round(spanX / cell);
  let rows = Math.round(spanY / cell);
  const maxN = 320;
  const over = Math.max(cols / maxN, rows / maxN, 1);
  cols = Math.max(120, Math.round(cols / over));
  rows = Math.max(90, Math.round(rows / over));
  const dx = (spanX) / Math.max(1, cols - 1);
  const dy = (spanY) / Math.max(1, rows - 1);
  const height = new Float32Array(cols * rows);
  const base = new Float32Array(cols * rows);
  let pts = pts0;
  let acc = accTime(pts);
  let total = acc[acc.length - 1] || 1;
  let lastT = 0;
  let dirty = true;

  function fillStock() {
    height.fill(topZ);
    base.set(height);
    lastT = 0;
    dirty = true;
  }
  fillStock();

  function millAt(x, y, z, r) {
    const cover = Math.max(dx, dy) * 0.55;
    const rHit = r + cover;
    const r2 = rHit * rHit;
    const cut = Math.max(minZ + 0.2, z);
    const c0 = Math.round((x - minX) / dx);
    const r0 = Math.round((y - minY) / dy);
    const span = Math.ceil(rHit / Math.min(dx, dy)) + 2;
    for (let rr = r0 - span; rr <= r0 + span; rr += 1) {
      if (rr < 0 || rr >= rows) continue;
      const py = minY + rr * dy;
      for (let cc = c0 - span; cc <= c0 + span; cc += 1) {
        if (cc < 0 || cc >= cols) continue;
        const px = minX + cc * dx;
        if ((px - x) * (px - x) + (py - y) * (py - y) > r2) continue;
        const i = rr * cols + cc;
        if (height[i] > cut) height[i] = cut;
      }
    }
    dirty = true;
  }

  function carve(fromT, toT) {
    const a0 = fromT * total;
    const a1 = toT * total;
    const step = Math.max(0.12, Math.min(dx, dy) * 0.38);
    for (let i = 1; i < pts.length; i += 1) {
      const s0 = acc[i - 1];
      const s1 = acc[i];
      if (s1 < a0 || s0 > a1) continue;
      const p = pts[i - 1];
      const q = pts[i];
      if (q.rapid) continue;
      const len = Math.max(s1 - s0, 0.001);
      const steps = Math.max(1, Math.ceil(len / step));
      const r = toolR(q.t || p.t);
      for (let k = 0; k <= steps; k += 1) {
        const s = s0 + (len * k) / steps;
        if (s < a0 || s > a1) continue;
        const u = (s - s0) / len;
        millAt(p.x + (q.x - p.x) * u, p.y + (q.y - p.y) * u, (p.z || 0) + ((q.z || 0) - (p.z || 0)) * u, r);
      }
    }
  }

  function loadPath(nextJob) {
    pts = nextJob?.points || [];
    acc = accTime(pts);
    total = acc[acc.length - 1] || 1;
    lastT = 0;
    dirty = true;
    gpu = null;
  }

  function setProgress(t) {
    const next = Math.max(0, Math.min(1, t));
    if (next + 0.0005 < lastT) {
      height.set(base);
      lastT = 0;
      dirty = true;
    }
    if (next > lastT) carve(lastT, next);
    lastT = next;
  }

  function commit() {
    setProgress(1);
    base.set(height);
    lastT = 1;
  }

  function rewindOp() {
    height.set(base);
    lastT = 0;
    dirty = true;
  }

  function reset() {
    fillStock();
    loadPath(job);
  }

  let gl = null;
  let gpu = null;
  let used2d = false;

  function bindAttr(prog, name, buf, size) {
    const loc = gl.getAttribLocation(prog, name);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }

  function buffer(data, usage) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW);
    return b;
  }

  function indexBuffer(data) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  }

  function buildGrid() {
    const pos = [];
    const col = [];
    const push = (x, y, z, rgb) => { pos.push(x, y, z); col.push(rgb[0], rgb[1], rgb[2]); };
    const g0 = [0.52, 0.56, 0.6];
    const g1 = [0.4, 0.43, 0.47];
    const gx0 = minX - 18;
    const gx1 = maxX + 18;
    const gy0 = minY - 18;
    const gy1 = maxY + 18;
    const z = minZ - 1.6;
    const step = 10;
    for (let x = Math.ceil(gx0 / step) * step; x <= gx1; x += step) {
      const c = Math.abs(x) < 0.01 ? [0.78, 0.32, 0.28] : (Math.round(x / step) % 5 === 0 ? g1 : g0);
      push(x, gy0, z, c); push(x, gy1, z, c);
    }
    for (let y = Math.ceil(gy0 / step) * step; y <= gy1; y += step) {
      const c = Math.abs(y) < 0.01 ? [0.28, 0.72, 0.38] : (Math.round(y / step) % 5 === 0 ? g1 : g0);
      push(gx0, y, z, c); push(gx1, y, z, c);
    }
    const axis = Math.max(spanX, spanY) * 0.35;
    push(0, 0, minZ - 1.4, [0.92, 0.22, 0.18]); push(axis, 0, minZ - 1.4, [0.92, 0.22, 0.18]);
    push(0, 0, minZ - 1.4, [0.22, 0.82, 0.32]); push(0, axis, minZ - 1.4, [0.22, 0.82, 0.32]);
    push(0, 0, minZ - 1.4, [0.28, 0.48, 0.95]); push(0, 0, minZ - 1.4 + axis, [0.28, 0.48, 0.95]);
    const edge = [0.25, 0.18, 0.08];
    const z0 = minZ;
    const z1 = topZ;
    const box = [
      [minX, minY, z0], [maxX, minY, z0], [maxX, maxY, z0], [minX, maxY, z0],
      [minX, minY, z1], [maxX, minY, z1], [maxX, maxY, z1], [minX, maxY, z1],
    ];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    edges.forEach(([i, j]) => {
      push(box[i][0], box[i][1], box[i][2], edge);
      push(box[j][0], box[j][1], box[j][2], edge);
    });
    return { pos: new Float32Array(pos), col: new Float32Array(col), n: pos.length / 3 };
  }

  function buildPath() {
    const pos = [];
    const col = [];
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1];
      const b = pts[i];
      const rgb = b.rapid ? [0.35, 0.86, 0.42] : [0.98, 0.82, 0.18];
      pos.push(a.x, a.y, (a.z || 0) + 0.15, b.x, b.y, (b.z || 0) + 0.15);
      col.push(rgb[0], rgb[1], rgb[2], rgb[0], rgb[1], rgb[2]);
    }
    return { pos: new Float32Array(pos), col: new Float32Array(col), n: pos.length / 3 };
  }

  function initGL(canvas) {
    if (used2d) return false;
    if (gl && gl.isContextLost()) {
      gl = null;
      gpu = null;
    }
    if (gpu && gl && gl.canvas === canvas && !gl.isContextLost()) return true;
    gl = canvas.getContext("webgl", {
      antialias: true,
      depth: true,
      alpha: false,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    if (!gl) return false;
    gl.getExtension("OES_element_index_uint");
    let lit;
    let line;
    let bg;
    try {
      lit = compile(gl, VS_LIT, FS_LIT);
      line = compile(gl, VS_LINE, FS_LINE);
      bg = compile(gl, VS_BG, FS_BG);
    } catch {
      gl = null;
      gpu = null;
      return false;
    }
    const surfaceN = cols * rows;
    const wallN = (rows - 1) * 8 + (cols - 1) * 8 + 4;
    const vertN = surfaceN + wallN;
    const pos = new Float32Array(vertN * 3);
    const nrm = new Float32Array(vertN * 3);
    const col = new Float32Array(vertN * 3);
    const idx = [];
    for (let r = 0; r < rows - 1; r += 1) {
      for (let c = 0; c < cols - 1; c += 1) {
        const i00 = r * cols + c;
        const i10 = i00 + 1;
        const i01 = i00 + cols;
        const i11 = i01 + 1;
        idx.push(i00, i10, i11, i00, i11, i01);
      }
    }
    let wall = surfaceN;
    const wallIdx = (a, b, c, d) => { idx.push(a, b, c, a, c, d); };
    for (let r = 0; r < rows - 1; r += 1) {
      wallIdx(wall, wall + 1, wall + 3, wall + 2);
      wall += 4;
      wallIdx(wall, wall + 1, wall + 3, wall + 2);
      wall += 4;
    }
    for (let c = 0; c < cols - 1; c += 1) {
      wallIdx(wall, wall + 1, wall + 3, wall + 2);
      wall += 4;
      wallIdx(wall, wall + 1, wall + 3, wall + 2);
      wall += 4;
    }
    const table = wall;
    idx.push(table, table + 1, table + 2, table, table + 2, table + 3);
    const grid = buildGrid();
    const path = buildPath();
    const use32 = vertN > 65535;
    const Idx = use32 ? Uint32Array : Uint16Array;
    gpu = {
      lit,
      line,
      bg,
      pos,
      nrm,
      col,
      use32,
      posBuf: buffer(pos, gl.DYNAMIC_DRAW),
      nrmBuf: buffer(nrm, gl.DYNAMIC_DRAW),
      colBuf: buffer(col, gl.DYNAMIC_DRAW),
      idxBuf: indexBuffer(new Idx(idx)),
      count: idx.length,
      bgBuf: buffer(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])),
      gridPos: buffer(grid.pos),
      gridCol: buffer(grid.col),
      gridN: grid.n,
      pathPos: buffer(path.pos),
      pathCol: buffer(path.col),
      pathN: path.n,
      tool: null,
      toolT: null,
      locLit: {
        mvp: gl.getUniformLocation(lit, "uMVP"),
        pan: gl.getUniformLocation(lit, "uPan"),
        off: gl.getUniformLocation(lit, "uOff"),
        eye: gl.getUniformLocation(lit, "uEye"),
        light: gl.getUniformLocation(lit, "uLight"),
      },
      locLine: {
        mvp: gl.getUniformLocation(line, "uMVP"),
        pan: gl.getUniformLocation(line, "uPan"),
      },
    };
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    return true;
  }

  function uploadStock() {
    const GOLD = [0.96, 0.78, 0.18];
    const GOLD_SIDE = [0.78, 0.58, 0.12];
    const CUT = [0.86, 0.90, 0.93];
    const TABLE = [0.42, 0.46, 0.50];
    const pos = gpu.pos;
    const nrm = gpu.nrm;
    const col = gpu.col;
    nrm.fill(0);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const i = r * cols + c;
        const o = i * 3;
        const z = height[i];
        pos[o] = minX + c * dx;
        pos[o + 1] = minY + r * dy;
        pos[o + 2] = z;
        const milled = z < topZ - 0.05;
        col[o] = milled ? CUT[0] : GOLD[0];
        col[o + 1] = milled ? CUT[1] : GOLD[1];
        col[o + 2] = milled ? CUT[2] : GOLD[2];
      }
    }
    const addN = (ia, ib, ic) => {
      const ax = pos[ib * 3] - pos[ia * 3];
      const ay = pos[ib * 3 + 1] - pos[ia * 3 + 1];
      const az = pos[ib * 3 + 2] - pos[ia * 3 + 2];
      const bx = pos[ic * 3] - pos[ia * 3];
      const by = pos[ic * 3 + 1] - pos[ia * 3 + 1];
      const bz = pos[ic * 3 + 2] - pos[ia * 3 + 2];
      const nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      const nz = ax * by - ay * bx;
      nrm[ia * 3] += nx; nrm[ia * 3 + 1] += ny; nrm[ia * 3 + 2] += nz;
      nrm[ib * 3] += nx; nrm[ib * 3 + 1] += ny; nrm[ib * 3 + 2] += nz;
      nrm[ic * 3] += nx; nrm[ic * 3 + 1] += ny; nrm[ic * 3 + 2] += nz;
    };
    for (let r = 0; r < rows - 1; r += 1) {
      for (let c = 0; c < cols - 1; c += 1) {
        const i00 = r * cols + c;
        const i10 = i00 + 1;
        const i01 = i00 + cols;
        const i11 = i01 + 1;
        addN(i00, i10, i11);
        addN(i00, i11, i01);
      }
    }
    for (let i = 0; i < cols * rows; i += 1) {
      const o = i * 3;
      const len = Math.hypot(nrm[o], nrm[o + 1], nrm[o + 2]) || 1;
      nrm[o] /= len; nrm[o + 1] /= len; nrm[o + 2] /= len;
    }
    let w = cols * rows;
    const wallVert = (x, y, zb, zt, nx, ny, rgb) => {
      const o = w * 3;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = zb;
      nrm[o] = nx; nrm[o + 1] = ny; nrm[o + 2] = 0;
      col[o] = rgb[0]; col[o + 1] = rgb[1]; col[o + 2] = rgb[2];
      w += 1;
      const o2 = w * 3;
      pos[o2] = x; pos[o2 + 1] = y; pos[o2 + 2] = zt;
      nrm[o2] = nx; nrm[o2 + 1] = ny; nrm[o2 + 2] = 0.08;
      col[o2] = rgb[0]; col[o2 + 1] = rgb[1]; col[o2 + 2] = rgb[2];
      w += 1;
    };
    for (let r = 0; r < rows - 1; r += 1) {
      const y0 = minY + r * dy;
      const y1 = minY + (r + 1) * dy;
      wallVert(minX, y0, minZ, height[r * cols], -1, 0, GOLD_SIDE);
      wallVert(minX, y1, minZ, height[(r + 1) * cols], -1, 0, GOLD_SIDE);
      wallVert(maxX, y0, minZ, height[r * cols + cols - 1], 1, 0, GOLD_SIDE);
      wallVert(maxX, y1, minZ, height[(r + 1) * cols + cols - 1], 1, 0, GOLD_SIDE);
    }
    for (let c = 0; c < cols - 1; c += 1) {
      const x0 = minX + c * dx;
      const x1 = minX + (c + 1) * dx;
      wallVert(x0, minY, minZ, height[c], 0, -1, GOLD_SIDE);
      wallVert(x1, minY, minZ, height[c + 1], 0, -1, GOLD_SIDE);
      wallVert(x0, maxY, minZ, height[(rows - 1) * cols + c], 0, 1, GOLD_SIDE);
      wallVert(x1, maxY, minZ, height[(rows - 1) * cols + c + 1], 0, 1, GOLD_SIDE);
    }
    const t0 = w;
    const tx0 = minX - 18;
    const tx1 = maxX + 18;
    const ty0 = minY - 18;
    const ty1 = maxY + 18;
    const tz = minZ - 1.55;
    const corners = [[tx0, ty0], [tx1, ty0], [tx1, ty1], [tx0, ty1]];
    corners.forEach((p) => {
      const o = w * 3;
      pos[o] = p[0]; pos[o + 1] = p[1]; pos[o + 2] = tz;
      nrm[o] = 0; nrm[o + 1] = 0; nrm[o + 2] = 1;
      col[o] = TABLE[0]; col[o + 1] = TABLE[1]; col[o + 2] = TABLE[2];
      w += 1;
    });
    void t0;
    gl.bindBuffer(gl.ARRAY_BUFFER, gpu.posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, gpu.nrmBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, nrm);
    gl.bindBuffer(gl.ARRAY_BUFFER, gpu.colBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, col);
    dirty = false;
  }

  function ensureTool(t) {
    if (gpu.tool && gpu.toolT === t) return;
    const mesh = makeToolMesh(t, topZ, minZ);
    gpu.tool = {
      pos: buffer(mesh.pos),
      nrm: buffer(mesh.nrm),
      col: buffer(mesh.col),
      idx: indexBuffer(mesh.idx),
      count: mesh.idx.length,
    };
    gpu.toolT = t;
  }

  function drawGL(canvas, w, ht, tool, view) {
    gl.viewport(0, 0, w, ht);
    gl.clearColor(0.32, 0.36, 0.40, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(gpu.bg);
    const bgLoc = gl.getAttribLocation(gpu.bg, "aPos");
    gl.bindBuffer(gl.ARRAY_BUFFER, gpu.bgBuf);
    gl.enableVertexAttribArray(bgLoc);
    gl.vertexAttribPointer(bgLoc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.enable(gl.DEPTH_TEST);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + topZ) / 2;
    const span = Math.max(spanX, spanY, spanZ * 1.5, 8);
    const fov = 26 * Math.PI / 180;
    const dist = (span * 0.72) / Math.max(view?.scale || 1.35, 0.2) / Math.tan(fov / 2);
    const yaw = view?.yaw ?? 0.86;
    const pitch = view?.pitch ?? 0.72;
    const viewM = viewOrbit(cx, cy, cz, yaw, pitch, dist);
    const proj = perspective(fov, w / Math.max(ht, 1), Math.max(1, dist * 0.04), dist + span * 4);
    const mvp = mul4(proj, viewM);
    const pan = [
      (2 * (view?.panX || 0)) / w,
      (-2 * (view?.panY || 0)) / ht,
    ];
    const eye = [
      cx + Math.sin(yaw) * Math.cos(pitch) * dist,
      cy - Math.cos(yaw) * Math.cos(pitch) * dist,
      cz + Math.sin(pitch) * dist,
    ];
    const light = [eye[0] + span * 0.3, eye[1] + span * 0.15, eye[2] + span * 0.8];
    if (dirty) uploadStock();

    gl.useProgram(gpu.lit);
    gl.uniformMatrix4fv(gpu.locLit.mvp, false, mvp);
    gl.uniform2fv(gpu.locLit.pan, pan);
    gl.uniform3f(gpu.locLit.off, 0, 0, 0);
    gl.uniform3fv(gpu.locLit.eye, eye);
    gl.uniform3fv(gpu.locLit.light, light);
    gl.disable(gl.CULL_FACE);
    bindAttr(gpu.lit, "aPos", gpu.posBuf, 3);
    bindAttr(gpu.lit, "aNrm", gpu.nrmBuf, 3);
    bindAttr(gpu.lit, "aCol", gpu.colBuf, 3);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gpu.idxBuf);
    const indexType = gpu.use32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    const indexBytes = gpu.use32 ? 4 : 2;
    const batch = 65532;
    for (let off = 0; off < gpu.count; off += batch) {
      const n = Math.min(batch, gpu.count - off);
      gl.drawElements(gl.TRIANGLES, n, indexType, off * indexBytes);
    }

    gl.useProgram(gpu.line);
    gl.uniformMatrix4fv(gpu.locLine.mvp, false, mvp);
    gl.uniform2fv(gpu.locLine.pan, pan);
    gl.depthMask(false);
    bindAttr(gpu.line, "aPos", gpu.gridPos, 3);
    bindAttr(gpu.line, "aCol", gpu.gridCol, 3);
    gl.drawArrays(gl.LINES, 0, gpu.gridN);
    if (gpu.pathN) {
      bindAttr(gpu.line, "aPos", gpu.pathPos, 3);
      bindAttr(gpu.line, "aCol", gpu.pathCol, 3);
      gl.drawArrays(gl.LINES, 0, gpu.pathN);
    }
    gl.depthMask(true);

    if (tool) {
      ensureTool(tool.t);
      const tx = tool.x || 0;
      const ty = tool.y || 0;
      const tz = tool.z ?? topZ;
      const model = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        tx, ty, tz, 1,
      ]);
      const toolMvp = mul4(mvp, model);
      gl.useProgram(gpu.lit);
      gl.uniformMatrix4fv(gpu.locLit.mvp, false, toolMvp);
      gl.uniform2fv(gpu.locLit.pan, pan);
      gl.uniform3f(gpu.locLit.off, tx, ty, tz);
      gl.enable(gl.CULL_FACE);
      bindAttr(gpu.lit, "aPos", gpu.tool.pos, 3);
      bindAttr(gpu.lit, "aNrm", gpu.tool.nrm, 3);
      bindAttr(gpu.lit, "aCol", gpu.tool.col, 3);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gpu.tool.idx);
      gl.drawElements(gl.TRIANGLES, gpu.tool.count, gl.UNSIGNED_SHORT, 0);
    }
  }

  function mix(hex, k) {
    const n = parseInt(String(hex).replace("#", ""), 16);
    const r = Math.round(((n >> 16) & 255) * k);
    const g = Math.round(((n >> 8) & 255) * k);
    const bl = Math.round((n & 255) * k);
    return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }

  function project(x, y, z, cam, ox, oy, scale) {
    const dxw = x - cam.cx;
    const dyw = y - cam.cy;
    const dz = z - cam.cz;
    const cosY = Math.cos(cam.yaw);
    const sinY = Math.sin(cam.yaw);
    const x1 = dxw * cosY - dyw * sinY;
    const y1 = dxw * sinY + dyw * cosY;
    const cosP = Math.cos(cam.pitch);
    const sinP = Math.sin(cam.pitch);
    const y2 = y1 * cosP + dz * sinP;
    const z2 = -y1 * sinP + dz * cosP;
    return { x: ox + x1 * scale, y: oy - z2 * scale, d: y2, wx: x, wy: y, wz: z };
  }

  function draw2d(ctx, w, ht, tool, view) {
    ctx.fillStyle = "#5c666f";
    ctx.fillRect(0, 0, w, ht);
    const cam = {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      cz: (minZ + topZ) / 2,
      yaw: view?.yaw ?? 0.86,
      pitch: view?.pitch ?? 0.72,
    };
    const span = Math.max(spanX, spanY, spanZ * 1.6, 8);
    const scale = (Math.min(w, ht) * 0.82 * (view?.scale || 1.35)) / span;
    const ox = w * 0.5 + (view?.panX || 0);
    const oy = ht * 0.52 + (view?.panY || 0);
    const pr = (x, y, z) => project(x, y, z, cam, ox, oy, scale);
    const step = Math.max(1, Math.round(Math.max(cols, rows) / 140));
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    for (let r = 0; r < rows - 1; r += step) {
      for (let c = 0; c < cols - 1; c += step) {
        const c1 = Math.min(cols - 1, c + step);
        const r1 = Math.min(rows - 1, r + step);
        const z00 = height[r * cols + c];
        const hex = z00 < topZ - 0.05 ? "#aebcc8" : "#e6ba48";
        const a = pr(minX + c * dx, minY + r * dy, z00);
        const bpt = pr(minX + c1 * dx, minY + r * dy, height[r * cols + c1]);
        const cp = pr(minX + c1 * dx, minY + r1 * dy, height[r1 * cols + c1]);
        const d = pr(minX + c * dx, minY + r1 * dy, height[r1 * cols + c]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(bpt.x, bpt.y);
        ctx.lineTo(cp.x, cp.y);
        ctx.lineTo(d.x, d.y);
        ctx.closePath();
        ctx.fillStyle = mix(hex, 0.82 + 0.18 * ((c + r) % 3 === 0 ? 1 : 0.7));
        ctx.fill();
      }
    }
    if (tool) {
      const p = pr(tool.x, tool.y, tool.z ?? topZ);
      ctx.fillStyle = toolColor(tool.t);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(5, toolR(tool.t) * scale * 0.9), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function draw(target, w, ht, tool, view) {
    const canvas = target?.canvas || target;
    if (!canvas || !canvas.getContext) return;
    if (initGL(canvas)) {
      drawGL(canvas, w, ht, tool, view);
      return;
    }
    used2d = true;
    const ctx = canvas.getContext("2d");
    if (ctx) draw2d(ctx, w, ht, tool, view);
  }

  const stock = {
    w: Number((maxX - minX).toFixed(1)),
    d: Number((maxY - minY).toFixed(1)),
    h: Number((topZ - minZ).toFixed(1)),
  };

  return { setProgress, loadPath, commit, rewindOp, reset, draw, stock, topZ, minZ };
}
