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
  lines.forEach((raw) => {
    const line = raw.replace(/\(.*?\)/g, "").replace(/;.*$/, "").trim();
    if (!line || line === "%") return;
    const w = wordMap(line);
    if (w.T !== undefined) { t = w.T; tools.add(t); }
    if (w.S !== undefined) s = w.S;
    if (w.F !== undefined) f = w.F;
    if (w.G !== undefined) g = w.G;
    const nx = num(w, "X", x);
    const ny = num(w, "Y", y);
    const nz = num(w, "Z", z);
    if (w.X === undefined && w.Y === undefined && w.Z === undefined) return;
    const dist = Math.hypot(nx - x, ny - y, nz - z);
    const rapidMove = g === 0;
    if (rapidMove) rapid += dist; else cut += dist;
    points.push({ x: nx, y: ny, z: nz, rapid: rapidMove, f, s, t });
    if (!rapidMove && dist > 0.01) ops.push({ tool: t, feed: f, spindle: s, length: Number(dist.toFixed(2)), kind: "cut" });
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
  const feed = ops[0]?.feed || 200;
  const timeMin = cut / Math.max(feed, 1) + rapid / 4000;
  const part = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  return {
    name,
    partName: part,
    fromNc,
    tools,
    ops,
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
  jobs.forEach((job) => {
    (job.ops || []).forEach((op) => {
      const key = String(op.tool);
      if (!byTool[key]) byTool[key] = { tool: op.tool, cuts: 0, length: 0, feed: 0, spindle: 0 };
      byTool[key].cuts += 1;
      byTool[key].length += op.length || 0;
      byTool[key].feed += op.feed || 0;
      byTool[key].spindle += op.spindle || 0;
    });
  });
  return Object.values(byTool).map((t) => ({
    ...t,
    feed: Math.round(t.feed / Math.max(t.cuts, 1)),
    spindle: Math.round(t.spindle / Math.max(t.cuts, 1)),
  })).sort((a, b) => b.length - a.length);
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
  const preferred = stats[0]?.tool;
  const ordered = [...runs].sort((a, b) => {
    const ta = a[0]?.t ?? 99, tb = b[0]?.t ?? 99;
    if (preferred !== undefined && ta === preferred && tb !== preferred) return -1;
    if (preferred !== undefined && tb === preferred && ta !== preferred) return 1;
    return ta - tb || a[0].z - b[0].z;
  });
  const used = new Set();
  const seq = [];
  let last = { x: 0, y: 0 };
  while (seq.length < ordered.length) {
    let best = -1, bestD = Infinity;
    ordered.forEach((run, i) => {
      if (used.has(i)) return;
      const d = dist2(last, run[0]);
      if (d < bestD) { bestD = d; best = i; }
    });
    used.add(best);
    seq.push(ordered[best]);
    last = ordered[best][ordered[best].length - 1];
  }
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
  return {
    ...job,
    name: job.name.replace(/(\.[^.]+)?$/, "") + "-opt.nc",
    partName: (job.partName || job.name) + " 최적 경로",
    points,
    cutMm: Number(cut.toFixed(1)),
    rapidMm: Number(rapid.toFixed(1)),
    timeMin: Number((cut / Math.max(job.ops?.[0]?.feed || 200, 1) + rapid / 4000).toFixed(2)),
    optimized: true,
    bbox: bbox(points),
  };
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
