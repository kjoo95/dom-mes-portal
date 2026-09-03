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
  const cell = 0.34;
  let cols = Math.round(spanX / cell);
  let rows = Math.round(spanY / cell);
  const maxN = 220;
  const over = Math.max(cols / maxN, rows / maxN, 1);
  cols = Math.max(96, Math.round(cols / over));
  rows = Math.max(72, Math.round(rows / over));
  const dx = (maxX - minX) / Math.max(1, cols - 1);
  const dy = (maxY - minY) / Math.max(1, rows - 1);
  const height = new Float32Array(cols * rows);
  const base = new Float32Array(cols * rows);
  let pts = pts0;
  let acc = accTime(pts);
  let total = acc[acc.length - 1] || 1;
  let lastT = 0;

  function fillStock() {
    height.fill(topZ);
    base.set(height);
    lastT = 0;
  }

  fillStock();

  function millAt(x, y, z, r) {
    const pad = Math.hypot(dx, dy) * 0.55;
    const rHit = r + pad;
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
  }

  function carve(fromT, toT) {
    const a0 = fromT * total;
    const a1 = toT * total;
    const step = Math.max(0.18, Math.min(dx, dy) * 0.42);
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
        millAt(p.x + (q.x - p.x) * u, p.y + (q.y - p.y) * u, p.z + (q.z - p.z) * u, r);
      }
    }
  }

  function loadPath(nextJob) {
    pts = nextJob?.points || [];
    acc = accTime(pts);
    total = acc[acc.length - 1] || 1;
    lastT = 0;
  }

  function setProgress(t) {
    const next = Math.max(0, Math.min(1, t));
    if (next + 0.0005 < lastT) {
      height.set(base);
      lastT = 0;
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
  }

  function reset() {
    fillStock();
    loadPath(job);
  }

  function mix(hex, k) {
    const n = parseInt(String(hex).replace("#", ""), 16);
    const r = Math.round(((n >> 16) & 255) * k);
    const g = Math.round(((n >> 8) & 255) * k);
    const b = Math.round((n & 255) * k);
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }

  function shade(hex, a, b, c) {
    const ux = b.wx - a.wx;
    const uy = b.wy - a.wy;
    const uz = b.wz - a.wz;
    const vx = c.wx - a.wx;
    const vy = c.wy - a.wy;
    const vz = c.wz - a.wz;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    const d = Math.max(0, (nx * 0.38 + ny * -0.48 + nz * 0.8) / len);
    return mix(hex, 0.38 + 0.62 * d);
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

  function paint(ctx, a, b, c, d, fill) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    if (d && (d !== c)) ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function zAt(c, r) {
    const cc = Math.max(0, Math.min(cols - 1, c));
    const rr = Math.max(0, Math.min(rows - 1, r));
    return height[rr * cols + cc];
  }

  function drawTool(ctx, pr, tool, push, paintFaces) {
    const tipZ = tool.z ?? topZ;
    const cutR = Math.max(toolR(tool.t), 0.9);
    const body = toolColor(tool.t);
    const bodyDk = mix(body, 0.72);
    const neckR = Math.max(cutR * 0.55, 0.7);
    const shankR = Math.max(cutR * 0.72, 1.1);
    const holdR = Math.max(cutR * 1.85, 4.2);
    const nutR = Math.max(cutR * 2.2, 5);
    const fluteH = Math.max(12, cutR * 4.2, (topZ - minZ) * 0.32);
    const neckH = 8;
    const shankH = Math.max(22, (topZ - minZ) * 0.5);
    const holdH = 14;
    const nutH = 8;
    const stubH = 16;
    const n = 14;
    const x = tool.x;
    const y = tool.y;
    const ring = (z, rad) => {
      const out = [];
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2;
        out.push(pr(x + Math.cos(a) * rad, y + Math.sin(a) * rad, z));
      }
      return out;
    };
    const tube = (lo, hi, hexA, hexB) => {
      for (let i = 0; i < n; i += 1) {
        const j = (i + 1) % n;
        push(lo[i], lo[j], hi[j], hi[i], i % 2 ? hexB : hexA);
      }
    };
    const cap = (ringPts, z, rad, hex, up) => {
      const c = pr(x, y, z);
      for (let i = 0; i < n; i += 1) {
        const j = (i + 1) % n;
        const a = ringPts[i];
        const b = ringPts[j];
        if (up) push(c, a, b, c, hex);
        else push(a, b, c, a, hex);
      }
      void rad;
    };

    const z0 = tipZ;
    const z1 = z0 + fluteH * 0.18;
    const z2 = z0 + fluteH;
    const z3 = z2 + neckH;
    const z4 = z3 + shankH;
    const z5 = z4 + holdH;
    const z6 = z5 + nutH;
    const z7 = z6 + stubH;

    const tip = ring(z0, cutR * 0.15);
    const fluteLo = ring(z1, cutR);
    const fluteHi = ring(z2, cutR);
    const neckLo = ring(z2, neckR);
    const neckHi = ring(z3, neckR);
    const shankLo = ring(z3, shankR);
    const shankHi = ring(z4, shankR);
    const holdLo = ring(z4, holdR);
    const holdHi = ring(z5, holdR);
    const nutLo = ring(z5, nutR);
    const nutHi = ring(z6, nutR);
    const stubLo = ring(z6, shankR * 0.7);
    const stubHi = ring(z7, shankR * 0.55);

    tube(tip, fluteLo, mix(body, 0.55), body);
    tube(fluteLo, fluteHi, body, bodyDk);
    tube(fluteHi, neckLo, "#6a6e74", "#5a5e64");
    tube(neckLo, neckHi, "#8a9098", "#7a8088");
    tube(neckHi, shankLo, "#9aa0a8", "#8a9098");
    tube(shankLo, shankHi, "#c8ced4", "#b4bac0");
    tube(shankHi, holdLo, "#4a4e54", "#3a3e44");
    tube(holdLo, holdHi, "#2a2e34", "#3a3e44");
    tube(holdHi, nutLo, body, mix(body, 0.8));
    tube(nutLo, nutHi, "#d8dee4", "#c4cad0");
    tube(nutHi, stubLo, "#6a7078", "#5a6068");
    tube(stubLo, stubHi, "#3a3e44", "#2a2e34");
    cap(stubHi, z7, shankR * 0.55, "#e8ecee", true);
    cap(tip, z0, cutR * 0.15, mix(body, 0.4), false);

    paintFaces();

    const axisTop = pr(x, y, z7 + 4);
    const axisBot = pr(x, y, z0);
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(axisTop.x, axisTop.y);
    ctx.lineTo(axisBot.x, axisBot.y);
    ctx.stroke();
  }

  function draw(ctx, w, ht, tool, view) {
    ctx.fillStyle = "#101012";
    ctx.fillRect(0, 0, w, ht);
    const cam = {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      cz: (minZ + topZ) / 2,
      yaw: view?.yaw ?? 0.86,
      pitch: view?.pitch ?? 0.72,
    };
    const span = Math.max(spanX, spanY, (topZ - minZ) * 1.6, 8);
    const scale = (Math.min(w, ht) * 0.82 * (view?.scale || 1.35)) / span;
    const ox = w * 0.5 + (view?.panX || 0);
    const oy = ht * 0.52 + (view?.panY || 0);
    const pr = (x, y, z) => project(x, y, z, cam, ox, oy, scale);
    const faces = [];
    const push = (a, b, c, d, hex) => {
      faces.push({ a, b, c, d, hex, depth: (a.d + b.d + c.d + d.d) / 4 });
    };
    const pushTri = (a, b, c, hex) => {
      faces.push({ a, b, c, d: c, hex, depth: (a.d + b.d + c.d) / 3 });
    };

    push(pr(minX - 10, minY - 10, minZ - 1.4), pr(maxX + 10, minY - 10, minZ - 1.4),
      pr(maxX + 10, maxY + 10, minZ - 1.4), pr(minX - 10, maxY + 10, minZ - 1.4), "#262624");

    for (let r = 0; r < rows - 1; r += 1) {
      const y0 = minY + r * dy;
      const y1 = minY + (r + 1) * dy;
      push(pr(minX, y0, minZ), pr(minX, y1, minZ), pr(minX, y1, zAt(0, r + 1)), pr(minX, y0, zAt(0, r)), "#5c626a");
      push(pr(maxX, y0, minZ), pr(maxX, y0, zAt(cols - 1, r)), pr(maxX, y1, zAt(cols - 1, r + 1)), pr(maxX, y1, minZ), "#4a5058");
    }
    for (let c = 0; c < cols - 1; c += 1) {
      const x0 = minX + c * dx;
      const x1 = minX + (c + 1) * dx;
      push(pr(x0, minY, minZ), pr(x1, minY, minZ), pr(x1, minY, zAt(c + 1, 0)), pr(x0, minY, zAt(c, 0)), "#686e76");
      push(pr(x0, maxY, minZ), pr(x0, maxY, zAt(c, rows - 1)), pr(x1, maxY, zAt(c + 1, rows - 1)), pr(x1, maxY, minZ), "#3e444c");
    }

    for (let r = 0; r < rows - 1; r += 1) {
      for (let c = 0; c < cols - 1; c += 1) {
        const x0 = minX + c * dx;
        const y0 = minY + r * dy;
        const x1 = minX + (c + 1) * dx;
        const y1 = minY + (r + 1) * dy;
        const z00 = zAt(c, r);
        const z10 = zAt(c + 1, r);
        const z11 = zAt(c + 1, r + 1);
        const z01 = zAt(c, r + 1);
        const gx = dx * 0.08;
        const gy = dy * 0.08;
        const p00 = pr(x0 - gx, y0 - gy, z00);
        const p10 = pr(x1 + gx, y0 - gy, z10);
        const p11 = pr(x1 + gx, y1 + gy, z11);
        const p01 = pr(x0 - gx, y1 + gy, z01);
        const avg = (z00 + z10 + z11 + z01) / 4;
        const hex = avg < topZ - 0.08 ? "#c2ccd4" : "#eceff2";
        if (Math.abs(z00 - z11) <= Math.abs(z10 - z01)) {
          pushTri(p00, p10, p11, hex);
          pushTri(p00, p11, p01, hex);
        } else {
          pushTri(p00, p10, p01, hex);
          pushTri(p10, p11, p01, hex);
        }
      }
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    faces.sort((a, b) => a.depth - b.depth);
    for (const f of faces) paint(ctx, f.a, f.b, f.c, f.d, shade(f.hex, f.a, f.b, f.c));

    if (tool) {
      const toolFaces = [];
      const pushTool = (a, b, c, d, hex) => {
        toolFaces.push({ a, b, c, d, hex, depth: (a.d + b.d + c.d + d.d) / 4 });
      };
      drawTool(ctx, pr, tool, pushTool, () => {
        toolFaces.sort((a, b) => a.depth - b.depth);
        for (const f of toolFaces) paint(ctx, f.a, f.b, f.c, f.d, shade(f.hex, f.a, f.b, f.c));
      });
    }
  }

  const stock = {
    w: Number((maxX - minX).toFixed(1)),
    d: Number((maxY - minY).toFixed(1)),
    h: Number((topZ - minZ).toFixed(1)),
  };

  return { setProgress, loadPath, commit, rewindOp, reset, draw, stock, topZ, minZ };
}
