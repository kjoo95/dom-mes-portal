export const SAMPLE_NC = {
  "DOM-HSG-032-pocket.nc": `%
O1001 (HOUSING POCKET)
G21 G90 G17
T1 M6
S2800 M3
G0 X12 Y8 Z50
G0 Z5
G1 Z-4.5 F90
G1 X68 F220
G1 Y42
G1 X12
G1 Y8
G1 X40 Y25
G1 Z-8 F80
G1 X52
G1 Y33
G1 X28
G1 Y17
G0 Z50
T2 M6
S4200 M3
G0 X20 Y16 Z50
G0 Z2
G1 Z-2 F140
G1 X60 F320
G1 Y36
G1 X20
G1 Y16
G0 Z50
M5
M30
%`,
  "DOM-SFT-018-contour.nc": `%
O1002 (SHAFT CONTOUR)
G21 G90
T4 M6
S1800 M3
G0 X0 Y0 Z40
G1 Z-6 F70
G1 X95 F180
G1 Y18
G1 X0
G1 Y0
G0 Z40
T6 M6
S2400 M3
G0 X8 Y4 Z40
G1 Z-3 F100
G1 X88 F260
G0 Z40
M30
%`,
};

export const TOOL_TABLE = {
  1: { d: 10, name: "Ø10 엔드밀" },
  2: { d: 6, name: "Ø6 엔드밀" },
  3: { d: 4, name: "Ø4 엔드밀" },
  4: { d: 12, name: "Ø12 엔드밀" },
  5: { d: 8, name: "Ø8 엔드밀" },
  6: { d: 3, name: "Ø3 엔드밀" },
  7: { d: 16, name: "Ø16 페이스" },
  8: { d: 2, name: "Ø2 볼엔드밀" },
  9: { d: 20, name: "Ø20 페이스" },
  10: { d: 1.5, name: "Ø1.5 드릴" },
};

const TOOL_COLORS = ["#c41e3a", "#1d4ed8", "#15803d", "#b45309", "#7c3aed", "#0f766e", "#be123c", "#1e3a8a"];

export function toolSpec(t) {
  const n = Math.max(1, Number(t) || 1);
  const row = TOOL_TABLE[n];
  if (row) return { t: n, d: row.d, r: row.d / 2, name: row.name, color: TOOL_COLORS[(n - 1) % TOOL_COLORS.length] };
  const d = 3 + ((n * 1.7) % 9);
  return { t: n, d, r: d / 2, name: `Ø${d.toFixed(1)} T${n}`, color: TOOL_COLORS[(n - 1) % TOOL_COLORS.length] };
}

export function toolR(t) {
  return toolSpec(t).r;
}

export function toolColor(t) {
  return toolSpec(t).color;
}

function num(map, key, fallback) {
  return map[key] !== undefined ? map[key] : fallback;
}

function wordMap(line) {
  const map = {};
  const re = /([A-Za-z])\s*(-?\d+\.?\d*)/g;
  let m;
  while ((m = re.exec(line))) map[m[1].toUpperCase()] = Number(m[2]);
  return map;
}

function motionG(line, current) {
  const codes = [];
  const re = /G\s*(0*\d+)/gi;
  let m;
  while ((m = re.exec(line))) codes.push(Number(m[1]));
  const move = [...codes].reverse().find((n) => n === 0 || n === 1 || n === 2 || n === 3);
  return move === undefined ? current : move;
}

function arcSteps(x, y, z, nx, ny, nz, i, j, clockwise) {
  const cx = x + (i || 0);
  const cy = y + (j || 0);
  let a0 = Math.atan2(y - cy, x - cx);
  let a1 = Math.atan2(ny - cy, nx - cx);
  let delta = a1 - a0;
  if (clockwise) {
    while (delta >= -1e-6) delta -= Math.PI * 2;
    if (delta > -1e-6) delta = -Math.PI * 2;
  } else {
    while (delta <= 1e-6) delta += Math.PI * 2;
    if (delta < 1e-6) delta = Math.PI * 2;
  }
  const radius = Math.max(Math.hypot(x - cx, y - cy), 0.2);
  const n = Math.max(6, Math.ceil((Math.abs(delta) * radius) / 0.7));
  const out = [];
  for (let k = 1; k <= n; k += 1) {
    const u = k / n;
    const a = a0 + delta * u;
    out.push({
      x: cx + Math.cos(a) * radius,
      y: cy + Math.sin(a) * radius,
      z: z + (nz - z) * u,
    });
  }
  return out;
}

export function segmentMin(a, b) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
  const dwell = b.change || ((b.t || 1) !== (a.t || 1)) ? 0.07 : 0;
  if (b.change && dist < 1e-6) return dwell;
  if (b.rapid) return dwell + dist / 4000;
  return dwell + dist / Math.max(b.f || a.f || 200, 1);
}

export function accTime(points) {
  const arr = [0];
  for (let i = 1; i < points.length; i += 1) {
    arr.push(arr[i - 1] + segmentMin(points[i - 1], points[i]));
  }
  return arr;
}

export function toolOps(points) {
  const acc = accTime(points);
  const total = acc[acc.length - 1] || 1;
  const ops = [];
  (points || []).forEach((p, i) => {
    const tool = p.t || 1;
    const last = ops[ops.length - 1];
    if (!last || last.tool !== tool) {
      ops.push({
        tool,
        i0: i,
        i1: i,
        t0: acc[i] / total,
        t1: acc[i] / total,
        spec: toolSpec(tool),
      });
    } else {
      last.i1 = i;
      last.t1 = acc[i] / total;
    }
  });
  return ops;
}

export function parseProgram(name, text) {
  const lines = String(text || "").split(/\r?\n/);
  const gHits = lines.filter((l) => /\bG0*[0123]\b/i.test(l) || /\bX-?\d/.test(l)).length;
  if (gHits < 2) return syntheticJob(name);
  let x = 0, y = 0, z = 20, f = 200, s = 2000, t = 1, g = 0;
  const points = [];
  const ops = [];
  let cut = 0;
  let rapid = 0;
  const tools = new Set();
  const pushPt = (pt) => {
    const prev = points[points.length - 1];
    const dist = prev ? Math.hypot(pt.x - prev.x, pt.y - prev.y, (pt.z || 0) - (prev.z || 0)) : 0;
    if (pt.rapid) rapid += dist; else cut += dist;
    points.push(pt);
    if (!pt.rapid && dist > 0.01) ops.push({ tool: pt.t, feed: pt.f, spindle: pt.s, length: Number(dist.toFixed(2)), kind: "cut" });
  };
  lines.forEach((raw) => {
    const line = raw.replace(/\(.*?\)/g, "").replace(/;.*$/, "").trim();
    if (!line || line === "%") return;
    const w = wordMap(line);
    g = motionG(line, g);
    if (w.S !== undefined) s = w.S;
    if (w.F !== undefined) f = w.F;
    if (w.T !== undefined) {
      const nextT = w.T;
      if (nextT !== t) {
        t = nextT;
        tools.add(t);
        if (points.length) {
          const last = points[points.length - 1];
          pushPt({ x: last.x, y: last.y, z: last.z, rapid: true, change: true, f, s, t });
        }
      } else tools.add(t);
    }
    if (w.X === undefined && w.Y === undefined && w.Z === undefined) return;
    const nx = num(w, "X", x);
    const ny = num(w, "Y", y);
    const nz = num(w, "Z", z);
    const rapidMove = g === 0;
    if (g === 2 || g === 3) {
      const steps = arcSteps(x, y, z, nx, ny, nz, w.I || 0, w.J || 0, g === 2);
      steps.forEach((p) => pushPt({ ...p, rapid: false, f, s, t }));
    } else {
      pushPt({ x: nx, y: ny, z: nz, rapid: rapidMove, f, s, t });
    }
    x = nx; y = ny; z = nz;
  });
  return finishJob(name, points, ops, [...tools], cut, rapid, true);
}

function syntheticJob(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const w = 36 + (h % 70);
  const d = 18 + ((h >> 7) % 40);
  const z = -(2 + (h % 7));
  const t = 1 + (h % 6);
  const f = 160 + (h % 180);
  const s = 1600 + (h % 2400);
  const points = [
    { x: 0, y: 0, z: 40, rapid: true, f, s, t },
    { x: 8, y: 6, z: 5, rapid: true, f, s, t },
    { x: 8, y: 6, z, rapid: false, f, s, t },
    { x: 8 + w, y: 6, z, rapid: false, f, s, t },
    { x: 8 + w, y: 6 + d, z, rapid: false, f, s, t },
    { x: 8, y: 6 + d, z, rapid: false, f, s, t },
    { x: 8, y: 6, z, rapid: false, f, s, t },
    { x: 8 + w / 2, y: 6 + d / 2, z: z - 2, rapid: false, f: Math.max(80, f - 40), s, t },
    { x: 8, y: 6, z: 40, rapid: true, f, s, t },
  ];
  let cut = 0, rapid = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1], b = points[i];
    const dist = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (b.rapid) rapid += dist; else cut += dist;
  }
  const ops = points.filter((p, i) => i && !p.rapid).map((p, i, arr) => ({
    tool: t, feed: p.f, spindle: p.s, length: i ? Number(Math.hypot(p.x - arr[i - 1].x, p.y - arr[i - 1].y).toFixed(2)) : 0, kind: "cut",
  }));
  return finishJob(name, points, ops, [t], cut, rapid, false);
}

function finishJob(name, points, ops, tools, cut, rapid, fromNc) {
  const acc = accTime(points);
  const timeMin = acc[acc.length - 1] || 0;
  const part = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  const seq = toolOps(points);
  return {
    name,
    partName: part,
    fromNc,
    tools: tools.length ? tools : seq.map((o) => o.tool),
    ops,
    seq,
    points,
    cutMm: Number(cut.toFixed(1)),
    rapidMm: Number(rapid.toFixed(1)),
    timeMin: Number(timeMin.toFixed(2)),
    bbox: bbox(points),
  };
}

function bbox(points) {
  if (!points.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return points.reduce((b, p) => ({
    minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y),
    maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y),
  }), { minX: points[0].x, minY: points[0].y, maxX: points[0].x, maxY: points[0].y });
}

export function seedJobs() {
  return Object.entries(SAMPLE_NC).map(([name, text]) => parseProgram(name, text));
}

export function collectStats(jobs) {
  const byTool = {};
  const add = (tool, dist, f, s) => {
    const key = String(tool || 1);
    if (!byTool[key]) {
      byTool[key] = {
        tool: Number(key),
        length: 0,
        fw: 0,
        sw: 0,
        fSum: 0,
        sSum: 0,
        fMin: Infinity,
        fMax: 0,
        sMin: Infinity,
        sMax: 0,
      };
    }
    const row = byTool[key];
    row.length += dist;
    if (f) {
      row.fw += dist;
      row.fSum += f * dist;
      row.fMin = Math.min(row.fMin, f);
      row.fMax = Math.max(row.fMax, f);
    }
    if (s) {
      row.sw += dist;
      row.sSum += s * dist;
      row.sMin = Math.min(row.sMin, s);
      row.sMax = Math.max(row.sMax, s);
    }
  };
  (jobs || []).forEach((job) => {
    const seq = job.seq || toolOps(job.points || []);
    seq.forEach((op) => add(op.tool, 0, 0, 0));
    (job.tools || []).forEach((tool) => add(tool, 0, 0, 0));
    const pts = job.points || [];
    if (pts.length > 1) {
      for (let i = 1; i < pts.length; i += 1) {
        const a = pts[i - 1];
        const b = pts[i];
        if (b.rapid) continue;
        const dist = Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
        if (dist < 0.01) continue;
        add(b.t ?? a.t, dist, b.f || a.f, b.s || a.s);
      }
      return;
    }
    (job.ops || []).forEach((op) => add(op.tool, op.length || 0, op.feed, op.spindle));
  });
  return Object.values(byTool).map((row) => {
    const spec = toolSpec(row.tool);
    const feed = row.fw ? Math.round(row.fSum / row.fw) : 0;
    const spindle = row.sw ? Math.round(row.sSum / row.sw) : 0;
    const feedLabel = row.fMin !== Infinity && row.fMin !== row.fMax
      ? `${Math.round(row.fMin)}~${Math.round(row.fMax)}`
      : String(feed || "—");
    const spindleLabel = row.sMin !== Infinity && row.sMin !== row.sMax
      ? `${Math.round(row.sMin)}~${Math.round(row.sMax)}`
      : String(spindle || "—");
    return { ...row, spec, name: spec.name, feed, spindle, feedLabel, spindleLabel };
  }).sort((a, b) => a.tool - b.tool);
}

function dist2(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cutRuns(points) {
  const runs = [];
  let cur = [];
  points.forEach((p) => {
    if (p.rapid) {
      if (cur.length) { runs.push(cur); cur = []; }
      return;
    }
    cur.push(p);
  });
  if (cur.length) runs.push(cur);
  return runs;
}

export function optimizeJob(job, stats = []) {
  const runs = cutRuns(job.points || []);
  if (!runs.length) return job;
  const groups = [];
  runs.forEach((run) => {
    const tool = run[0]?.t ?? 1;
    const last = groups[groups.length - 1];
    if (!last || last.tool !== tool) groups.push({ tool, runs: [run] });
    else last.runs.push(run);
  });
  const seq = [];
  groups.forEach((group) => {
    const used = new Set();
    let last = group.runs[0][0];
    while (used.size < group.runs.length) {
      let best = -1, bestD = Infinity;
      group.runs.forEach((run, i) => {
        if (used.has(i)) return;
        const d = dist2(last, run[0]);
        if (d < bestD) { bestD = d; best = i; }
      });
      used.add(best);
      seq.push(group.runs[best]);
      last = group.runs[best][group.runs[best].length - 1];
    }
  });
  void stats;
  const points = [];
  seq.forEach((run) => {
    const start = run[0];
    points.push({ ...start, z: Math.max(start.z, 20), rapid: true });
    run.forEach((p) => points.push({ ...p, rapid: false }));
    const end = run[run.length - 1];
    points.push({ ...end, z: 40, rapid: true });
  });
  let cut = 0, rapid = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1], b = points[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (b.rapid) rapid += d; else cut += d;
  }
  const next = finishJob(job.name.replace(/(\.[^.]+)?$/, "") + "-opt.nc", points, job.ops || [], job.tools || [], cut, rapid, true);
  next.optimized = true;
  next.partName = `${job.partName || job.name} 최적 경로`;
  return next;
}

export function toNc(job) {
  const lines = ["%", `O1100 (${(job.partName || job.name || "DOM").slice(0, 32)})`, "G21 G90 G17"];
  let t;
  (job.points || []).forEach((p) => {
    if (p.t !== t) {
      t = p.t;
      lines.push(`T${t} M6`);
      if (p.s) lines.push(`S${Math.round(p.s)} M3`);
    }
    const words = [p.rapid ? "G0" : "G1"];
    words.push(`X${p.x.toFixed(3)}`, `Y${p.y.toFixed(3)}`, `Z${p.z.toFixed(3)}`);
    if (!p.rapid && p.f) words.push(`F${Math.round(p.f)}`);
    lines.push(words.join(" "));
  });
  lines.push("M5", "M30", "%");
  return lines.join("\n");
}

export function toJson(job) {
  return JSON.stringify({
    name: job.name,
    partName: job.partName,
    tools: job.tools,
    cutMm: job.cutMm,
    rapidMm: job.rapidMm,
    timeMin: job.timeMin,
    optimized: Boolean(job.optimized),
    points: job.points,
    ops: job.ops,
  }, null, 2);
}
