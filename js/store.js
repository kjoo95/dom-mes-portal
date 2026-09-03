import { STORAGE_KEY, defaultState, todayISO } from "./data.js?v=51";
import { seedJobs, parseProgram, toNc, looksBinaryText } from "./gcode.js?v=52";

const BAK = `${STORAGE_KEY}-bak`;

function refreshJob(job) {
  if (!job) return job;
  if (looksBinaryText(job.source || "") && !(job.points || []).length) {
    return { ...job, points: [], source: "" };
  }
  const src = looksBinaryText(job.source || "") ? "" : (job.source || (job.points?.length ? toNc(job) : ""));
  if (!src) return job;
  try {
    const parsed = parseProgram(job.name || "job.nc", src);
    if ((parsed?.points || []).filter((p) => !p.rapid && !p.change).length < 2) {
      return job;
    }
    return {
      ...job,
      ...parsed,
      id: job.id,
      date: job.date,
      folderId: job.folderId,
      fileId: job.fileId,
      partName: job.partName || parsed.partName,
      method: job.method,
      fromNc: job.fromNc,
      optimized: job.optimized,
      source: parsed.source || src,
    };
  } catch {
    return job;
  }
}

function withJobMeta(jobs) {
  const date = todayISO();
  return jobs.map((job, i) => ({
    ...job,
    id: job.id || `seed-${i}`,
    date: job.date || date,
    folderId: job.folderId || "cam-root",
  }));
}

function mergeModules(base, saved) {
  const list = (saved?.length ? [...saved] : [...base]).filter((m) => m.id !== "saves" && m.type !== "saves");
  base.forEach((mod) => {
    if (mod.id === "saves") return;
    if (!list.some((item) => item.id === mod.id)) {
      if (mod.id === "records") list.unshift(mod);
      else if (mod.id === "lab-climate") {
        const i = list.findIndex((item) => item.id === "lab-5s");
        if (i >= 0) list.splice(i, 0, { ...mod });
        else list.push({ ...mod });
      } else list.push(mod);
    }
  });
  const quality = list.find((item) => item.id === "quality");
  if (quality && (quality.desc?.includes("3회") || quality.desc?.includes("X·Y·Z"))) {
    quality.desc = "사진과 치수·비고를 성적서 한 장에 기록하고 인쇄합니다.";
  }
  const mail = list.find((item) => item.id === "mail");
  if (mail) {
    mail.desc = "새 창에서 후이즈 웹메일을 엽니다.";
  }
  const inbound = list.find((item) => item.id === "inbound");
  if (inbound) {
    inbound.desc = "월 폴더에 A4 한 장으로 적습니다. 날짜, 업체, 자재 품명, 개수, 자재 사이즈 순입니다.";
  }
  const lab5 = list.find((item) => item.id === "lab-5s");
  if (lab5) {
    lab5.title = "검사실 3정5S 관리";
    lab5.desc = "검사실(완제품 창고) 3정 5S 체크시트를 연·월을 바꿔 가며 작성합니다.";
  }
  const labClim = list.find((item) => item.id === "lab-climate");
  if (labClim) {
    labClim.title = "검사실 온습도 관리";
    labClim.desc = "완제품 창고 온·습도 점검 체크시트를 연·월을 바꿔 가며 작성합니다.";
  }
  return list;
}

function fresh() {
  const state = structuredClone(defaultState());
  state.cam.jobs = withJobMeta(seedJobs());
  return state;
}

function hydrate(parsed) {
  const base = defaultState();
  const cam = { ...base.cam, ...(parsed.cam || {}) };
  cam.jobs = Array.isArray(parsed.cam?.jobs) && parsed.cam.jobs.length
    ? parsed.cam.jobs.map(refreshJob).filter((j) => j && !j.optimized)
    : withJobMeta(seedJobs());
  cam.seen = parsed.cam?.seen || {};
  cam.watchName = parsed.cam?.watchName || "";
  const state = {
    ...base,
    ...parsed,
    modules: mergeModules(base.modules, parsed.modules),
    records: { ...base.records, ...(parsed.records || {}) },
    climate: { ...base.climate, ...(parsed.climate || {}), rooms: parsed.climate?.rooms || base.climate.rooms, checks: parsed.climate?.checks || base.climate.checks || {}, sheet: parsed.climate?.sheet || {} },
    labClimate: {
      ...base.labClimate,
      ...(parsed.labClimate || {}),
      rooms: parsed.labClimate?.rooms || base.labClimate.rooms,
      points: parsed.labClimate?.points || base.labClimate.points,
      logs: parsed.labClimate?.logs || {},
      checks: parsed.labClimate?.checks || {},
      sheet: parsed.labClimate?.sheet || {},
    },
    dateFolders: parsed.dateFolders || {},
    fiveS: { dates: {}, notes: {}, labNotes: {}, ...(parsed.fiveS || {}) },
    cam,
    equipment: parsed.equipment || {},
    eqPhotos: parsed.eqPhotos || {},
    chat: {
      messages: Array.isArray(parsed.chat?.messages) ? parsed.chat.messages : (base.chat?.messages || []),
    },
    mail: {
      address: parsed.mail?.address || base.mail?.address || "",
      web: migrateWhoisWeb(parsed.mail?.web) || base.mail?.web || "https://email.whois.co.kr/v2/",
      drafts: Array.isArray(parsed.mail?.drafts) ? parsed.mail.drafts : [],
    },
  };
  migrateLabClimate(state, base);
  migrateInbound(state);
  migrateMonthFolders(state);
  migrateCamFolders(state, base);
  return state;
}

function migrateCamFolders(state, base) {
  if (!state.cam) state.cam = { folders: [], files: [], jobs: [] };
  if (!Array.isArray(state.cam.folders)) state.cam.folders = [];
  (base.cam?.folders || []).forEach((seed) => {
    const has = state.cam.folders.some((f) => f.id === seed.id || (f.parent === seed.parent && f.name === seed.name));
    if (!has) state.cam.folders.push({ ...seed });
  });
}

function migrateWhoisWeb(web) {
  const v = String(web || "");
  if (!v || /whoismail\.net/i.test(v)) return "https://email.whois.co.kr/v2/";
  return v;
}

function migrateMonthFolders(state) {
  ["climate", "lab-climate", "five-s", "lab-5s", "inbound"].forEach((id) => {
    const list = state.dateFolders[id] || [];
    state.dateFolders[id] = [...new Set(list.map((d) => String(d).slice(0, 7)).filter((d) => /^\d{4}-\d{2}$/.test(d)))];
  });
}

function migrateInbound(state) {
  (state.records?.inbound || []).forEach((r) => {
    const ym = String(r.month || r.date || "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) r.month = ym;
    const d = String(r.date || "");
    if (/^\d{4}-\d{2}$/.test(d)) r.date = `${d}-01`;
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) r.date = "";
    if (!r.supplier) {
      const fromNotes = Array.isArray(r.notes) ? r.notes.map((n) => String(n ?? "").trim()).filter(Boolean).join(", ") : "";
      r.supplier = r.note || fromNotes || "";
    }
    const filled = String(r.supplier || "").trim() || String(r.item || "").trim() || String(r.size || "").trim() || r.qty;
    if (!filled) r.date = "";
  });
}

function migrateLabClimate(state, base) {
  if (!state.dateFolders) state.dateFolders = {};
  if (!state.dateFolders["lab-climate"]?.length && state.dateFolders["lab-5s"]?.length) {
    state.dateFolders["lab-climate"] = [...state.dateFolders["lab-5s"]];
  }
  const hadLogs = Object.keys(state.labClimate.logs || {}).length > 0;
  if (hadLogs) return;
  const dates = state.fiveS?.dates || {};
  for (const [d, pack] of Object.entries(dates)) {
    const lab = pack?.lab;
    if (!lab) continue;
    const has = lab.temp !== undefined && lab.temp !== "" || lab.humidity !== undefined && lab.humidity !== "" || lab.lux !== undefined && lab.lux !== "";
    if (!has) continue;
    const first = (state.labClimate.points || base.labClimate.points)[0];
    if (!first) continue;
    if (!state.labClimate.logs) state.labClimate.logs = {};
    state.labClimate.logs[d] = [{
      pointId: first.id,
      temp: lab.temp === "" || lab.temp == null ? "" : Number(lab.temp),
      humidity: lab.humidity === "" || lab.humidity == null ? "" : Number(lab.humidity),
      lux: lab.lux === "" || lab.lux == null ? "" : Number(lab.lux),
      status: "정상",
    }];
  }
}

function readKey(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  return hydrate(JSON.parse(raw));
}

export function loadState() {
  try {
    const main = readKey(STORAGE_KEY);
    if (main) return main;
  } catch { /* backup */ }
  try {
    const bak = readKey(BAK);
    if (bak) return bak;
  } catch { /* default */ }
  return fresh();
}

export function saveState(state) {
  try {
    const raw = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, raw);
    localStorage.setItem(BAK, raw);
  } catch {
    try {
      const raw = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, raw);
    } catch { /* keep last backup */ }
  }
}

export function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}
