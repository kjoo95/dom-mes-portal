export const SAMPLE_NC = {
  "DOM-HSG-032-pocket.nc": `%
O1001 (HOUSING POCKET)
(T1 | 10. FLAT ENDMILL | H1 | D10.)
(T2 | 6. BALL ENDMILL | H2 | D6.)
N100 G21 G90 G17 G40 G49 G80
N110 T1 M6
N120 G0 G90 G54 X12. Y8. S2800 M3
N130 G43 H1 Z50.
N140 G0 Z5.
N150 G1 Z-4.5 F90.
N160 G1 X68. F220.
N170 G1 Y42.
N180 G1 X12.
N190 G1 Y8.
N200 G1 X40. Y25.
N210 G1 Z-8. F80.
N220 G1 X52.
N230 G1 Y33.
N240 G1 X28.
N250 G1 Y17.
N260 G0 Z50.
N270 T2 M6
N280 G0 G90 G54 X20. Y16. S4200 M3
N290 G43 H2 Z50.
N300 G0 Z2.
N310 G1 Z-2. F140.
N320 G1 X60. F320.
N330 G1 Y36.
N340 G1 X20.
N350 G1 Y16.
N360 G0 Z50.
N370 M5
N380 M30
%`,
  "DOM-SFT-018-contour.nc": `%
O1002 (SHAFT CONTOUR)
(T4 | 12. FLAT ENDMILL | H4 | D12.)
(T6 | 3. BALL ENDMILL | H6 | D3.)
N100 G21 G90 G17
N110 T4 M6
N120 G0 G90 G54 X0. Y0. S1800 M3
N130 G43 H4 Z40.
N140 G1 Z-6. F70.
N150 G1 X95. F180.
N160 G1 Y18.
N170 G1 X0.
N180 G1 Y0.
N190 G0 Z40.
N200 T6 M6
N210 G0 G90 G54 X8. Y4. S2400 M3
N220 G43 H6 Z40.
N230 G1 Z-3. F100.
N240 G1 X88. F260.
N250 G0 Z40.
N260 M5
N270 M30
%`,
};

export const TOOL_TABLE = {};

const TOOL_COLORS = ["#c41e3a", "#1d4ed8", "#15803d", "#b45309", "#7c3aed", "#0f766e", "#be123c", "#1e3a8a"];

export function toolSpec(t, lib) {
  const n = Math.max(1, Number(t) || 1);
  const row = lib?.[n] || lib?.[String(n)] || TOOL_TABLE[n];
  const d = Number(row?.d) || 0;
  if (d > 0) {
    return { t: n, d, r: d / 2, name: row.name || `Ø${d} T${n}`, color: TOOL_COLORS[(n - 1) % TOOL_COLORS.length] };
  }
  return { t: n, d: 6, r: 3, name: row?.name || `T${n}`, color: TOOL_COLORS[(n - 1) % TOOL_COLORS.length] };
}

export function toolR(t, lib) {
  return toolSpec(t, lib).r;
}

export function toolColor(t, lib) {
  return toolSpec(t, lib).color;
}

function num(map, key, fallback) {
  return map[key] !== undefined ? map[key] : fallback;
}

function wordMap(line) {
  const map = {};
  const re = /([A-Za-z])\s*(-?(?:\d+\.?\d*|\.\d+))/g;
  let m;
  while ((m = re.exec(line))) map[m[1].toUpperCase()] = Number(m[2]);
  return map;
}

function parseTWord(line) {
  const m = String(line).match(/(?:^|[^A-Z])T\s*(\d+)/i);
  if (!m) return null;
  const raw = m[1];
  if (raw.length >= 4) return Number(raw.slice(0, -2)) || Number(raw);
  return Number(raw);
}

function decodeNc(text) {
  let s = String(text || "");
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  if ((s.match(/\u0000/g) || []).length > s.length / 4) s = s.replace(/\u0000/g, "");
  return s.replace(/[\u2013\u2014]/g, "-");
}

export function looksBinaryText(s) {
  const str = String(s || "");
  const n = Math.min(str.length, 4000);
  if (!n) return false;
  let weird = 0;
  for (let i = 0; i < n; i += 1) {
    const c = str.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13) continue;
    if (c < 32 || c === 0xFFFD) weird += 1;
  }
  return weird > n * 0.08;
}

function isBinaryBytes(u8) {
  const n = Math.min(u8.length, 4000);
  if (!n) return false;
  let weird = 0;
  for (let i = 0; i < n; i += 1) {
    const b = u8[i];
    if (b === 9 || b === 10 || b === 13) continue;
    if (b < 32) weird += 1;
  }
  return weird > n * 0.08;
}

function decodeWith(u8, enc) {
  try {
    return new TextDecoder(enc, { fatal: false }).decode(u8);
  } catch {
    return "";
  }
}

function bestDecode(u8) {
  const cands = ["utf-8", "euc-kr", "windows-949", "latin1"]
    .map((enc) => {
      const t = decodeWith(u8, enc);
      const bad = (t.match(/\uFFFD/g) || []).length;
      return { enc, t, bad };
    })
    .filter((c) => c.t);
  cands.sort((a, b) => a.bad - b.bad);
  return cands[0]?.t || decodeWith(u8, "latin1");
}

function looksGcode(text) {
  const code = stripComments(text);
  const xyz = (code.match(/\b[XYZ]\s*-?(?:\d|\.)/gi) || []).length;
  const g = (code.match(/\bG\s*0*(0|1|2|3)\b/gi) || []).length;
  return xyz >= 4 && g >= 1;
}

function salvageCamText(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.replace(/\u0000/g, "").trim()).filter((l) => {
    if (!l) return false;
    if (looksBinaryText(l) && l.length > 80) return false;
    return /[\x20-\x7e가-힣]/.test(l);
  });
  return lines.join("\n");
}

function extractCamText(u8) {
  const chunks = [];
  let cur = [];
  const flush = () => {
    if (cur.length < 12) {
      cur = [];
      return;
    }
    chunks.push(Uint8Array.from(cur));
    cur = [];
  };
  for (let i = 0; i < u8.length; i += 1) {
    const b = u8[i];
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b !== 127)) cur.push(b);
    else flush();
  }
  flush();
  const joined = chunks.map((c) => bestDecode(c)).join("\n");
  const utf16 = [];
  let run = "";
  for (let i = 0; i + 1 < Math.min(u8.length, 4_000_000); i += 2) {
    if (u8[i + 1] === 0 && u8[i] >= 32 && u8[i] < 127) run += String.fromCharCode(u8[i]);
    else {
      if (run.length >= 12) utf16.push(run);
      run = "";
    }
  }
  if (run.length >= 12) utf16.push(run);
  const mixed = [joined, utf16.join("\n")].filter(Boolean).join("\n");
  const clean = salvageCamText(mixed);
  if (looksNci(clean) || looksGcode(clean)) return clean;
  return "";
}

export function decodeCamFile(buffer, name = "") {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || []);
  if (!u8.length) return "";
  if (u8.length >= 2 && u8[0] === 0xFF && u8[1] === 0xFE) return decodeNc(new TextDecoder("utf-16le").decode(u8));
  if (u8.length >= 2 && u8[0] === 0xFE && u8[1] === 0xFF) return decodeNc(new TextDecoder("utf-16be").decode(u8));
  if (u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) return decodeNc(new TextDecoder("utf-8").decode(u8));
  const binary = isBinaryBytes(u8) || /\.mc9$/i.test(name);
  if (binary) {
    const extracted = extractCamText(u8);
    return extracted || "";
  }
  let zeros = 0;
  const n = Math.min(u8.length, 400);
  for (let i = 1; i < n; i += 2) if (u8[i] === 0) zeros += 1;
  if (zeros > n / 4) return decodeNc(new TextDecoder("utf-16le").decode(u8));
  return decodeNc(bestDecode(u8));
}

export function isCamFileName(name) {
  return /\.(nc|nci|cnc|tap|txt|iso|eia|min|ncc|mc9|mc8)$/i.test(name || "");
}

function stripComments(text) {
  return String(text || "").replace(/\([^)]*\)/g, " ").replace(/;.*$/gm, " ");
}

function fileToMm(text) {
  const code = stripComments(text);
  const g20 = [...code.matchAll(/\bG\s*0*20\b/gi)];
  const g21 = [...code.matchAll(/\bG\s*0*21\b/gi)];
  if (g20.length && (!g21.length || g20[g20.length - 1].index > (g21[g21.length - 1]?.index || -1))) return 25.4;
  return 1;
}

function diaToMm(val, hint) {
  const n = Number(val) || 0;
  if (n <= 0) return 0;
  if (hint === "inch" || hint === "frac" || hint === "quote") return n * 25.4;
  if (hint === "mm") return n;
  if (n > 0 && n < 2.6) return n * 25.4;
  return n;
}

function diameterFromComment(c) {
  const raw = String(c || "").replace(/,/g, " ");
  const s = raw
    .replace(/DIA\.?\s*OFF\.?[^|]*/gi, " ")
    .replace(/LENGTH\s*-?\s*\d+/gi, " ")
    .replace(/\bH\s*\d+\b/gi, " ");
  let m = s.match(/(\d+)\s*\/\s*(\d+)/);
  if (m) return diaToMm(Number(m[1]) / Number(m[2]), "frac");
  m = s.match(/(\d+\.?\d*|\.\d+)\s*(?:INCH|IN\b|")/i);
  if (m) return diaToMm(Number(m[1]), "quote");
  m = s.match(/(?:[ØΦø]|파이)\s*(\d+\.?\d*|\.\d+)/i);
  if (m) return diaToMm(Number(m[1]), "mm");
  m = s.match(/(\d+\.?\d*|\.\d+)\s*(?:파이|MM)\b/i);
  if (m) return diaToMm(Number(m[1]), "mm");
  m = s.match(/\bD\s*=\s*(\d+\.?\d*|\.\d+)/i);
  if (m) return diaToMm(Number(m[1]), Number(m[1]) < 2.6 ? "inch" : "mm");
  m = s.match(/DIA\.?\s*[-=]?\s*(\d+\.?\d*|\.\d+)/i);
  if (m) return diaToMm(Number(m[1]), Number(m[1]) < 2.6 || /IN/i.test(s) ? "inch" : "mm");
  m = s.match(/(?:T\s*\d+\s*[|:/-]\s*)(\d+\.?\d*|\.\d+)\s*(FLAT|BALL|BULL|END|DRILL|TAP|FACE|CHAMFER|SPOT|MILL)/i);
  if (m) return diaToMm(Number(m[1]), Number(m[1]) < 2.6 ? "inch" : "mm");
  m = s.match(/\b(\d+\.?\d*|\.\d+)\s*(FLAT|BALL|BULL|ENDMILL|DRILL|TAP|FACE)/i);
  if (m) return diaToMm(Number(m[1]), Number(m[1]) < 2.6 ? "inch" : "mm");
  const ds = [...s.matchAll(/\bD\s*(\d+\.?\d*|\.\d+)/gi)]
    .map((x) => Number(x[1]))
    .filter((n) => n >= 1.5 || String(n).includes("."));
  if (ds.length) {
    const d = Math.max(...ds);
    return diaToMm(d, d < 2.6 ? "inch" : "mm");
  }
  return 0;
}

function nameFromComment(c) {
  const s = String(c || "").replace(/T\s*\d+/i, "").replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
  const m = s.match(/((?:\d+\s*\/\s*\d+|\d+\.?\d*|\.\d+)\s*(MM\s*)?(FLAT|BALL|BULL)?\s*(END\s*MILL|ENDMILL|DRILL|TAP|FACE|CHAMFER|SPOT|MILL)[A-Z0-9 .]*)/i);
  if (m) return m[1].trim().slice(0, 40);
  const d = s.match(/[ØΦø]\s*\d+\.?\d*.{0,24}/);
  if (d) return d[0].trim().slice(0, 40);
  const ko = s.match(/(\d+\.?\d*\s*(?:파이|MM)?\s*(?:평|볼|드릴|탭|면|챔퍼|엔드)[^\s|]*)/i);
  if (ko) return ko[1].trim().slice(0, 40);
  return s.replace(/\bH\s*\d+\b/gi, "").replace(/\bD\s*=?\s*\d+\.?\d*\b/gi, "").replace(/DIA\.?\s*OFF\.?[^|]*/gi, "").trim().slice(0, 40);
}

function parseToolLib(text) {
  const lib = {};
  const put = (t, d, name) => {
    if (!t) return;
    const prev = lib[t] || {};
    lib[t] = {
      d: d || prev.d || 0,
      name: (name && name.length > 1 ? name : prev.name) || "",
    };
  };
  [...String(text).matchAll(/\(([^)]*)\)/g)].forEach((m) => {
    const c = m[1];
    const tM = c.match(/T\s*0*(\d+)/i) || c.match(/TOOL\s*-?\s*(\d+)/i);
    const t = tM ? Number(tM[1]) : null;
    put(t, diameterFromComment(c), nameFromComment(c));
  });
  Object.keys(lib).forEach((k) => {
    if (!lib[k].name) lib[k].name = lib[k].d ? `Ø${Number(lib[k].d.toFixed(2))} T${k}` : `T${k}`;
  });
  return lib;
}

function looksNci(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 400);
  if (lines.length < 8) return false;
  let pairs = 0;
  let moves = 0;
  let tools = 0;
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (!/^\d{1,5}$/.test(lines[i])) continue;
    const next = lines[i + 1];
    const numeric = /^[-0-9eE.\s]+$/.test(next);
    const quoted = /"/.test(next);
    if (!numeric && !quoted && /[GMTXYZFS]/i.test(next) && !/^\d/.test(next)) continue;
    pairs += 1;
    const g = Number(lines[i]);
    if (g === 0 || g === 1 || g === 2 || g === 3) moves += 1;
    if (g === 1001 || g === 1002 || g === 1050) tools += 1;
  }
  return pairs >= 6 && moves >= 2 && (tools >= 1 || moves >= 8);
}

function nciNums(line) {
  return String(line || "")
    .replace(/"[^"]*"/g, " ")
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
}

function nciName(line) {
  const q = String(line || "").match(/"([^"]+)"/);
  if (q) return q[1].trim().slice(0, 40);
  const tok = String(line || "").trim().split(/[\s,]+/).filter(Boolean);
  const last = tok[tok.length - 1] || "";
  if (last && Number.isNaN(Number(last)) && /[A-Za-z가-힣]/.test(last)) return last.slice(0, 40);
  return "";
}

function inchFileHint(dias, span) {
  const inchTools = (dias || []).filter((d) => d > 0.04 && d < 2.6);
  if (!inchTools.length) return false;
  return span > 0 && span < 28;
}

function parseNci(name, text) {
  const rawText = decodeNc(text);
  const lines = rawText.split(/\r?\n/);
  const toolLib = {};
  const points = [];
  const ops = [];
  const tools = new Set();
  let t = 1;
  let f = 0;
  let s = 0;
  let x = 0;
  let y = 0;
  let z = 20;
  let cut = 0;
  let rapid = 0;
  let pendingDia = 0;
  let pendingName = "";
  let metric = null;
  let stockW = 0;
  let stockD = 0;
  let stockH = 0;
  let stockX = 0;
  let stockY = 0;
  let material = "";
  let partHint = "";
  const putLib = (tn, d, nm) => {
    if (!tn) return;
    const prev = toolLib[tn] || {};
    toolLib[tn] = { d: d || prev.d || 0, name: nm || prev.name || `T${tn}` };
  };
  const pushPt = (pt) => {
    const tool = pt.t || t || 1;
    const spec = toolSpec(tool, toolLib);
    const next = {
      ...pt,
      t: tool,
      f: pt.f ?? f,
      s: pt.s ?? s,
      feedMm: 0,
      d: spec.d || pendingDia || 0,
    };
    const prev = points[points.length - 1];
    const dist = prev ? Math.hypot(next.x - prev.x, next.y - prev.y, (next.z || 0) - (prev.z || 0)) : 0;
    if (next.rapid) rapid += dist;
    else cut += dist;
    points.push(next);
    if (!next.rapid && dist > 0.01) ops.push({ tool: next.t, feed: next.f, spindle: next.s, length: Number(dist.toFixed(2)), kind: "cut" });
    return next;
  };
  for (let i = 0; i < lines.length; i += 1) {
    const head = lines[i].trim();
    if (!/^\d{1,5}$/.test(head)) continue;
    const g = Number(head);
    const data = (lines[i + 1] || "").trim();
    if (g >= 0 && g <= 30000) i += 1;
    const n = nciNums(data);
    const nm = nciName(data);
    if (g === 1050) {
      const path = data.replace(/^[-0-9eE.\s]+/, "").trim();
      if (path) partHint = path.split(/[/\\]/).pop().replace(/\.[^.]+$/, "");
    } else if (g === 1008 || g === 1005) {
      const c = data.replace(/^[-0-9eE.\s]+/, "").trim() || nm;
      if (c && !pendingName) pendingName = c.slice(0, 40);
    } else if (g === 1020) {
      if (n[0]) stockW = Math.abs(n[0]);
      if (n[1]) stockD = Math.abs(n[1]);
      if (n[2]) stockH = Math.abs(n[2]);
      if (n[3] !== undefined) stockX = n[3];
      if (n[4] !== undefined) stockY = n[4];
      material = nciName(data) || data.replace(/^[-0-9eE.\s]+/, "").trim().slice(0, 40);
    } else if (g === 1013) {
      const dia = n[1] || 0;
      if (dia) pendingDia = dia;
      const fromPath = (data.match(/([^\\/]+)\.(mc9|tl9)/i) || [])[1];
      if (fromPath) pendingName = fromPath.replace(/[_-]+/g, " ").slice(0, 40);
      else if (nm && !/[\\/]/.test(nm)) pendingName = nm;
      else if (nm) pendingName = nm.split(/[/\\]/).pop().replace(/\.[^.]+$/, "").slice(0, 40);
      if (metric == null && n[9] !== undefined) metric = Number(n[9]) !== 0;
    } else if (g === 1016) {
      if (n[9] !== undefined) metric = Number(n[9]) !== 0;
    } else if (g === 20001 && nm) {
      pendingName = nm;
    } else if (g === 20007 && n[0]) {
      pendingDia = n[0];
    } else if (g === 4) {
      if (n[1]) s = Math.abs(n[1]);
    } else if (g === 1000 || g === 1001 || g === 1002) {
      const nextT = Math.max(1, Math.round(n[3] || t || 1));
      if (n[7]) s = Math.abs(n[7]);
      if (n[8] > 0) f = n[8];
      putLib(nextT, pendingDia, pendingName);
      tools.add(nextT);
      if (points.length && nextT !== t) {
        const last = points[points.length - 1];
        pushPt({ x: last.x, y: last.y, z: last.z, rapid: true, change: true, f, s, t: nextT });
      }
      t = nextT;
      if (n[10] !== undefined && n[11] !== undefined) {
        x = n[10];
        y = n[11];
        z = n[12] !== undefined ? n[12] : z;
        pushPt({ x, y, z, rapid: true, f, s, t });
      }
      pendingDia = 0;
      pendingName = "";
    } else if (g === 0 || g === 1) {
      const nx = n[1];
      const ny = n[2];
      const nz = n[3];
      const fr = n[4];
      if (fr > 0) f = fr;
      if (nx === undefined || ny === undefined || nz === undefined) continue;
      x = nx;
      y = ny;
      z = nz;
      pushPt({ x, y, z, rapid: g === 0 || fr === -2, f, s, t });
    } else if (g === 2 || g === 3) {
      const nx = n[2];
      const ny = n[3];
      const cx = n[4];
      const cy = n[5];
      const nz = n[6];
      const fr = n[7];
      if (fr > 0) f = fr;
      if (nx === undefined || ny === undefined) continue;
      const iOff = (cx !== undefined ? cx : x) - x;
      const jOff = (cy !== undefined ? cy : y) - y;
      const steps = arcSteps(x, y, z, nx, ny, nz !== undefined ? nz : z, iOff, jOff, g === 2);
      steps.forEach((p) => pushPt({ ...p, rapid: false, f, s, t }));
      x = nx;
      y = ny;
      z = nz !== undefined ? nz : z;
    } else if (g === 11) {
      const nx = n[0];
      const ny = n[1];
      const nz = n[2];
      const fr = n[6];
      if (fr > 0) f = fr;
      if (nx === undefined) continue;
      x = nx;
      y = ny;
      z = nz;
      pushPt({ x, y, z, rapid: fr === -2, f, s, t });
    }
  }
  const span = points.length
    ? Math.max(
      ...points.map((p) => p.x),
      ...points.map((p) => p.y),
    ) - Math.min(
      ...points.map((p) => p.x),
      ...points.map((p) => p.y),
    )
    : 0;
  const dias = Object.values(toolLib).map((row) => row.d || 0);
  const toMm = metric === false || (metric == null && inchFileHint(dias, span)) ? 25.4 : 1;
  if (toMm !== 1) {
    points.forEach((p) => {
      p.x *= toMm;
      p.y *= toMm;
      p.z *= toMm;
    });
    Object.keys(toolLib).forEach((k) => {
      if (toolLib[k].d) toolLib[k].d = Number((toolLib[k].d * toMm).toFixed(3));
    });
    cut *= toMm;
    rapid *= toMm;
  }
  points.forEach((p) => {
    const spec = toolSpec(p.t, toolLib);
    p.d = spec.d;
    p.feedMm = (p.f || 0) * toMm;
  });
  const job = finishJob(name, points, ops, [...tools], cut, rapid, true, looksBinaryText(rawText) ? "" : rawText, toolLib);
  if (partHint) job.partName = partHint.replace(/[_-]+/g, " ");
  if (material) job.material = material;
  return job;
}

function expandSubs(text) {
  const codeOnly = stripComments(text);
  if (!/\bM\s*0*98\b/i.test(codeOnly)) return text;
  const lines = String(text).split(/\r?\n/);
  const blocks = { __pre: [] };
  let cur = "__pre";
  const order = ["__pre"];
  lines.forEach((line) => {
    const bare = stripComments(line).trim();
    const o = bare.match(/^[O:](\d+)/i);
    if (o) {
      cur = String(Number(o[1]));
      if (!blocks[cur]) {
        blocks[cur] = [];
        order.push(cur);
      }
      blocks[cur].push(line);
      return;
    }
    if (!blocks[cur]) blocks[cur] = [];
    blocks[cur].push(line);
  });
  const first = order.find((k) => k !== "__pre") || "__pre";
  const main = [...(blocks.__pre || []), ...(blocks[first] || [])];
  const walk = (src, depth) => {
    const out = [];
    src.forEach((line) => {
      const bare = stripComments(line);
      if (depth < 6 && /\bM\s*0*98\b/i.test(bare)) {
        const p = bare.match(/\bP\s*(\d+)/i);
        const l = Math.min(50, Math.max(1, Number((bare.match(/\bL\s*(\d+)/i) || [])[1] || 1)));
        if (p) {
          let key = p[1];
          if (key.length >= 5) key = key.slice(-4);
          key = String(Number(key));
          const sub = blocks[key];
          if (sub) {
            const body = sub.filter((ln) => !/^\s*M\s*0*99\b/i.test(stripComments(ln)));
            for (let k = 0; k < l; k += 1) out.push(...walk(body, depth + 1));
            return;
          }
        }
      }
      out.push(line);
    });
    return out;
  };
  return walk(main, 0).join("\n");
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

function arcFromR(x, y, nx, ny, r, clockwise) {
  const dx = nx - x;
  const dy = ny - y;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-8) return null;
  let rad = Math.abs(r);
  if (rad < chord / 2) rad = chord / 2 + 1e-6;
  const h = Math.sqrt(Math.max(0, rad * rad - (chord / 2) * (chord / 2)));
  const mx = (x + nx) / 2;
  const my = (y + ny) / 2;
  const ux = dx / chord;
  const uy = dy / chord;
  const side = ((r >= 0) === clockwise) ? 1 : -1;
  const i = (mx - x) + (-uy) * h * side;
  const j = (my - y) + ux * h * side;
  return { i, j };
}

export function segmentMin(a, b) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
  const dwell = b.change || ((b.t || 1) !== (a.t || 1)) ? 0.14 : 0;
  if (b.change && dist < 1e-6) return dwell;
  const feed = b.feedMm || a.feedMm || ((b.f || a.f || 200));
  if (b.rapid) return dwell + dist / 4000;
  return dwell + dist / Math.max(feed, 1);
}

export function accTime(points) {
  const arr = [0];
  for (let i = 1; i < points.length; i += 1) {
    arr.push(arr[i - 1] + segmentMin(points[i - 1], points[i]));
  }
  return arr;
}

export function toolOps(points, lib) {
  const acc = accTime(points);
  const total = acc[acc.length - 1] || 1;
  const ops = [];
  (points || []).forEach((p, i) => {
    const tool = Number(p.t || 1);
    const last = ops[ops.length - 1];
    if (!last || last.tool !== tool) {
      ops.push({
        tool,
        i0: i,
        i1: i,
        t0: acc[i] / total,
        t1: acc[i] / total,
        spec: toolSpec(tool, lib),
      });
    } else {
      last.i1 = i;
      last.t1 = acc[i] / total;
    }
  });
  return ops;
}

function cutScore(job) {
  return (job?.points || []).filter((p) => !p.rapid && !p.change).length;
}

function safeParse(fn, name, text) {
  try {
    return fn(name, text);
  } catch {
    return null;
  }
}

export function parseProgram(name, text) {
  let rawText = decodeNc(text);
  if (!rawText.trim()) return finishJob(name, [], [], [], 0, 0, true, "", {});
  if (looksBinaryText(rawText) || /\.mc9$/i.test(name || "")) {
    const salvaged = salvageCamText(rawText);
    if (looksNci(salvaged) || looksGcode(salvaged)) rawText = salvaged;
    else return finishJob(name, [], [], [], 0, 0, true, "", {});
  }
  const nciJob = safeParse(parseNci, name, rawText);
  const ncJob = safeParse(parseFanuc, name, rawText);
  const nciCuts = cutScore(nciJob);
  const ncCuts = cutScore(ncJob);
  if (nciCuts >= 2 && nciCuts >= ncCuts) return nciJob;
  if (ncCuts >= 2) return ncJob;
  if ((nciJob?.points || []).length >= 2) return nciJob;
  if ((ncJob?.points || []).length >= 2) return ncJob;
  return finishJob(name, [], [], [], 0, 0, true, "", {});
}

function parseFanuc(name, text) {
  const rawText = decodeNc(text);
  const expanded = expandSubs(rawText);
  let toMm = fileToMm(expanded);
  const toolLib = parseToolLib(expanded);
  const lines = expanded.split(/\r?\n/);
  let x = 0, y = 0, z = 20, f = 0, s = 0, t = 0, g = 0;
  let abs = true;
  let cycle = 0;
  let cR = 0;
  let cZ = 0;
  let g98 = true;
  let initZ = 20;
  const points = [];
  const ops = [];
  let cut = 0;
  let rapid = 0;
  const tools = new Set();
  let pendingChange = null;
  const pushPt = (pt) => {
    const tool = pt.t || t || 1;
    const spec = toolSpec(tool, toolLib);
    const next = { ...pt, t: tool, f: pt.f ?? f, s: pt.s ?? s, feedMm: ((pt.f ?? f) || 0) * toMm, d: spec.d };
    const prev = points[points.length - 1];
    const dist = prev ? Math.hypot(next.x - prev.x, next.y - prev.y, (next.z || 0) - (prev.z || 0)) : 0;
    if (next.rapid) rapid += dist; else cut += dist;
    points.push(next);
    if (!next.rapid && dist > 0.01) ops.push({ tool: next.t, feed: next.f, spindle: next.s, length: Number(dist.toFixed(2)), kind: "cut" });
    return next;
  };
  const read = (w, key, cur) => {
    if (w[key] === undefined) return cur;
    const v = w[key] * toMm;
    return abs ? v : cur + v;
  };
  lines.forEach((raw) => {
    if (/^\s*\//.test(raw)) return;
    const comments = [...raw.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
    comments.forEach((c) => {
      const tM = c.match(/T\s*0*(\d+)/i) || c.match(/TOOL\s*-?\s*(\d+)/i);
      const d = diameterFromComment(c);
      const nm = nameFromComment(c);
      const tn = tM ? Number(tM[1]) : (t || null);
      if (tn && (d || nm)) {
        const prev = toolLib[tn] || {};
        toolLib[tn] = { d: d || prev.d || 0, name: nm || prev.name || `T${tn}` };
      }
    });
    const line = raw.replace(/\(.*?\)/g, "").replace(/;.*$/, "").trim();
    if (!line || line === "%") return;
    const w = wordMap(line);
    const gs = [...line.matchAll(/G\s*(0*\d+)/gi)].map((m) => Number(m[1]));
    if (gs.includes(20)) toMm = 25.4;
    if (gs.includes(21)) toMm = 1;
    if (gs.includes(90)) abs = true;
    if (gs.includes(91)) abs = false;
    if (gs.includes(98)) g98 = true;
    if (gs.includes(99)) g98 = false;
    if (gs.includes(80)) cycle = 0;
    const cyc = gs.find((n) => n === 73 || n === 74 || (n >= 81 && n <= 89));
    if (cyc) cycle = cyc;
    if (!cyc && gs.some((n) => n === 0 || n === 1 || n === 2 || n === 3)) cycle = 0;
    g = motionG(line, g);
    const m6 = /\bM\s*0*6\b/i.test(line);
    const nextT = parseTWord(line);
    if (nextT != null) {
      tools.add(nextT);
      if (nextT !== t || m6) {
        t = nextT;
        if (points.length) {
          const last = points[points.length - 1];
          if (!last.change || last.t !== t) pendingChange = pushPt({ x: last.x, y: last.y, z: last.z, rapid: true, change: true, f, s, t });
        }
      }
    } else if (m6 && points.length) {
      const last = points[points.length - 1];
      if (!last.change) pendingChange = pushPt({ x: last.x, y: last.y, z: last.z, rapid: true, change: true, f, s, t: t || 1 });
    }
    if (w.S !== undefined) {
      s = Math.abs(w.S);
      if (pendingChange) pendingChange.s = s;
    }
    if (w.F !== undefined && w.F > 0) f = w.F;
    if (gs.includes(28) || gs.includes(30)) {
      if (w.Z !== undefined) z = Math.max(z, toMm === 25.4 ? 40 * 25.4 : 40);
      pushPt({ x, y, z, rapid: true, f, s, t: t || 1 });
      pendingChange = null;
      return;
    }
    if (w.R !== undefined && cycle) cR = read(w, "R", cR);
    if (w.Z !== undefined && cycle && g !== 0 && g !== 1) cZ = read(w, "Z", cZ);
    const hasMove = w.X !== undefined || w.Y !== undefined || w.Z !== undefined;
    if (!hasMove) return;
    if (!t) {
      const first = Number(Object.keys(toolLib)[0]);
      t = first || 1;
      tools.add(t);
    }
    const nx = read(w, "X", x);
    const ny = read(w, "Y", y);
    const nz = read(w, "Z", z);
    if (cycle && (w.X !== undefined || w.Y !== undefined)) {
      if (w.Z !== undefined) cZ = nz;
      if (w.R !== undefined) cR = read(w, "R", z);
      const rPlane = cR || Math.max(z, 0);
      const hole = cZ || nz;
      const top = g98 ? Math.max(initZ, rPlane) : rPlane;
      pushPt({ x: nx, y: ny, z, rapid: true, f, s, t });
      pushPt({ x: nx, y: ny, z: rPlane, rapid: true, f, s, t });
      pushPt({ x: nx, y: ny, z: hole, rapid: false, f, s, t });
      pushPt({ x: nx, y: ny, z: top, rapid: true, f, s, t });
      x = nx; y = ny; z = top;
      pendingChange = null;
      return;
    }
    const rapidMove = g === 0;
    if (g === 2 || g === 3) {
      let iVal = (w.I || 0) * toMm;
      let jVal = (w.J || 0) * toMm;
      if (w.R !== undefined && w.I === undefined && w.J === undefined) {
        const ij = arcFromR(x, y, nx, ny, w.R * toMm, g === 2);
        if (ij) { iVal = ij.i; jVal = ij.j; }
      }
      const steps = arcSteps(x, y, z, nx, ny, nz, iVal, jVal, g === 2);
      steps.forEach((p) => pushPt({ ...p, rapid: false, f, s, t }));
    } else {
      pushPt({ x: nx, y: ny, z: nz, rapid: rapidMove, f, s, t });
    }
    pendingChange = null;
    x = nx; y = ny; z = nz;
    if (rapidMove) initZ = z;
  });
  let lf = 0;
  let ls = 0;
  points.forEach((p) => {
    if (p.f) lf = p.f;
    else if (lf) p.f = lf;
    if (p.s) ls = p.s;
    else if (ls) p.s = ls;
    p.feedMm = (p.f || 0) * toMm;
    const spec = toolSpec(p.t, toolLib);
    if (spec.d) p.d = spec.d;
  });
  return finishJob(name, points, ops, [...tools], cut, rapid, true, looksBinaryText(rawText) ? "" : rawText, toolLib);
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
  return finishJob(name, points, ops, [t], cut, rapid, false, "", { [t]: { d: 6, name: `T${t}` } });
}

function cutPts(points) {
  const cuts = (points || []).filter((p) => !p.rapid && !p.change);
  return cuts.length ? cuts : (points || []).filter((p) => !p.change);
}

function stockZ(points) {
  const zs = cutPts(points).map((p) => p.z || 0);
  if (!zs.length) return { deep: -8, top: 0 };
  const deep = Math.min(...zs);
  const work = zs.filter((z) => z <= 1.5);
  if (work.length) return { deep, top: Math.max(0, ...work) };
  const sorted = [...zs].sort((a, b) => a - b);
  const p90 = sorted[Math.max(0, Math.round((sorted.length - 1) * 0.9))];
  return { deep, top: Math.max(0, p90) };
}

function stockSize(points) {
  const src = cutPts(points);
  if (!src.length) return { w: 0, d: 0, h: 0 };
  const b = bbox(src);
  const { deep, top } = stockZ(points);
  const pad = 1.6;
  return {
    w: Number((b.maxX - b.minX + pad * 2).toFixed(1)),
    d: Number((b.maxY - b.minY + pad * 2).toFixed(1)),
    h: Number((top - (deep - 0.2)).toFixed(1)),
  };
}

function finishJob(name, points, ops, tools, cut, rapid, fromNc, source, toolLib) {
  const lib = toolLib || {};
  const acc = accTime(points);
  const timeMin = acc[acc.length - 1] || 0;
  const part = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  const seq = toolOps(points, lib);
  return {
    name,
    partName: part,
    fromNc,
    source: source || "",
    toolLib: lib,
    tools: tools.length ? tools : seq.map((o) => o.tool),
    ops,
    seq,
    points,
    cutMm: Number(cut.toFixed(1)),
    rapidMm: Number(rapid.toFixed(1)),
    timeMin: Number(timeMin.toFixed(2)),
    bbox: bbox(cutPts(points).length ? cutPts(points) : points),
    stock: stockSize(points),
    material: "",
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
  const add = (tool, dist, f, s, lib) => {
    const key = String(tool || 1);
    if (!byTool[key]) {
      byTool[key] = {
        tool: Number(key),
        length: 0,
        feeds: new Set(),
        spindles: new Set(),
        lib,
      };
    }
    const row = byTool[key];
    row.length += dist;
    if (lib && !row.lib) row.lib = lib;
    if (f) row.feeds.add(Math.round(f));
    if (s) row.spindles.add(Math.round(s));
  };
  (jobs || []).forEach((job) => {
    const lib = job.toolLib;
    const seq = job.seq || toolOps(job.points || [], lib);
    seq.forEach((op) => add(op.tool, 0, 0, 0, lib));
    (job.tools || []).forEach((tool) => add(tool, 0, 0, 0, lib));
    const pts = job.points || [];
    if (pts.length > 1) {
      for (let i = 1; i < pts.length; i += 1) {
        const a = pts[i - 1];
        const b = pts[i];
        if (b.rapid || b.change) continue;
        const dist = Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
        if (dist < 0.01) continue;
        add(b.t ?? a.t, dist, b.f || a.f, b.s || a.s, lib);
      }
      return;
    }
    (job.ops || []).forEach((op) => add(op.tool, op.length || 0, op.feed, op.spindle, lib));
  });
  const label = (set, prefix) => {
    const nums = [...set].sort((a, b) => a - b);
    return nums.length ? nums.map((n) => `${prefix}${n}`).join(" ") : `${prefix}—`;
  };
  return Object.values(byTool).map((row) => {
    const spec = toolSpec(row.tool, row.lib);
    const feeds = [...row.feeds].sort((a, b) => a - b);
    const spindles = [...row.spindles].sort((a, b) => a - b);
    return {
      ...row,
      spec,
      name: spec.name,
      feed: feeds[feeds.length - 1] || 0,
      spindle: spindles[spindles.length - 1] || 0,
      feedLabel: label(row.feeds, "F"),
      spindleLabel: label(row.spindles, "S"),
    };
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
  const next = finishJob(job.name.replace(/(\.[^.]+)?$/, "") + "-opt.nc", points, job.ops || [], job.tools || [], cut, rapid, true, job.source || "", job.toolLib || {});
  next.optimized = true;
  next.partName = `${job.partName || job.name} 최적 경로`;
  return next;
}

export function toNc(job) {
  const src = String(job?.source || "");
  if (src && job.fromNc && !looksBinaryText(src) && /[GMTXYZFS]/i.test(src) && !looksNci(src)) return src.endsWith("\n") ? src : `${src}\n`;
  const lines = ["%", `O1100 (${(job.partName || job.name || "DOM").slice(0, 32)})`, "G21 G90 G17"];
  Object.entries(job.toolLib || {}).forEach(([tn, spec]) => {
    if (!spec) return;
    lines.push(`(T${tn} | ${spec.d || ""} ${spec.name || ""} | D${spec.d || ""})`);
  });
  let t;
  let lastF;
  let lastS;
  (job.points || []).forEach((p) => {
    if (p.t !== t) {
      t = p.t;
      lines.push(`T${t} M6`);
      if (p.s) {
        lines.push(`S${Math.round(p.s)} M3`);
        lastS = p.s;
      }
    } else if (p.s && p.s !== lastS) {
      lines.push(`S${Math.round(p.s)}`);
      lastS = p.s;
    }
    const words = [p.rapid ? "G0" : "G1"];
    words.push(`X${p.x.toFixed(3)}`, `Y${p.y.toFixed(3)}`, `Z${p.z.toFixed(3)}`);
    if (!p.rapid && p.f && p.f !== lastF) {
      words.push(`F${Number(p.f)}`);
      lastF = p.f;
    }
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
