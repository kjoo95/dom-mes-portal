import { getSession, logout, isInternalNetwork } from "./auth.js?v=45";
import { loadState, saveState, uid } from "./store.js";
import { collectStats, parseProgram, toNc, toJson, accTime, toolOps, toolSpec, decodeCamFile, isCamFileName } from "./gcode.js?v=48";
import { boot } from "./safety.js";
import { createMill } from "./mill3d.js?v=28";
import { t, langBar, bindLang, applyHtmlLang } from "./i18n.js?v=42";
import { todayISO } from "./data.js?v=43";

const root = document.getElementById("app");
const h = (v) => String(v ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

let state = loadState();
let selectedId = "";
let mill = null;
let opJob = null;
let opIndex = 0;
let focusOp = -1;
let jobQuery = "";
let sim = { playing: false, t: 0, last: 0, raf: 0, speed: 64 };
const SPEEDS = [1, 4, 16, 32, 64, 120, 300];
const CAM0 = { yaw: 0.92, pitch: 0.98, scale: 1.22, panX: 0, panY: 8 };
let cam = { ...CAM0 };
let drag = null;

function allJobs() {
  return (state.cam.jobs || []).filter((j) => !j.optimized);
}

function jobs() {
  const q = jobQuery.trim().toLowerCase();
  const list = allJobs();
  if (!q) return list;
  return list.filter((j) => `${j.partName || ""} ${j.name || ""}`.toLowerCase().includes(q));
}

function current() {
  const list = allJobs();
  return list.find((j) => j.id === selectedId) || jobs()[0] || list[0];
}

function isCamNc(name) {
  return isCamFileName(name);
}

async function readNcText(file) {
  const buf = await file.slice(0, 12_000_000).arrayBuffer().catch(() => null);
  if (!buf) return "";
  return decodeCamFile(buf, file.name);
}

function preferCamFiles(files) {
  const list = [...files];
  const by = new Map();
  list.forEach((f) => {
    const stem = String(f.name || "").replace(/\.[^.]+$/, "").toLowerCase();
    if (!by.has(stem)) by.set(stem, []);
    by.get(stem).push(f);
  });
  const rank = (n) => (/\.nci$/i.test(n) ? 0 : /\.(nc|cnc|tap|min)$/i.test(n) ? 1 : /\.mc9$/i.test(n) ? 2 : 3);
  const out = [];
  by.forEach((group) => {
    group.sort((a, b) => rank(a.name) - rank(b.name));
    out.push(group[0]);
  });
  return out.length ? out : list;
}

async function ingestLabFile(file) {
  if (!isCamNc(file.name)) return null;
  const text = await readNcText(file);
  const parsed = parseProgram(file.name, text);
  if (!parsed?.points?.length) return null;
  if (!state.cam.jobs) state.cam.jobs = [];
  const job = { ...parsed, id: uid("job"), date: todayISO(), folderId: "cam-root" };
  state.cam.jobs.unshift(job);
  return job;
}

function viewJob() {
  const job = current();
  if (!job) return null;
  if (focusOp < 0) return job;
  const seq = job.seq || toolOps(job.points || [], job.toolLib);
  const op = seq[focusOp];
  if (!op) return job;
  const pts = (job.points || []).slice(op.i0, (op.i1 ?? op.i0) + 1);
  if (pts.length < 2) return job;
  const span = Math.max((op.t1 ?? 1) - (op.t0 ?? 0), 0.001);
  return {
    ...job,
    points: pts,
    seq: toolOps(pts, job.toolLib),
    timeMin: Number(((job.timeMin || 0) * span).toFixed(2)),
    partName: `${job.partName || job.name} · T${op.tool}`,
  };
}

function loadView(job) {
  const view = job || viewJob();
  mill = view?.points?.length ? createMill(view) : null;
  opJob = view;
}

function selectTool(index) {
  const src = current();
  if (!src) return;
  const seqNow = src.seq || toolOps(src.points || [], src.toolLib);
  if (!seqNow.length) return;
  focusOp = Math.max(0, Math.min(index, seqNow.length - 1));
  opIndex = focusOp;
  sim.playing = false;
  sim.t = 0;
  sim.last = 0;
  loadView();
  render();
}

function selectAllTools() {
  focusOp = -1;
  opIndex = 0;
  sim.playing = false;
  sim.t = 0;
  sim.last = 0;
  loadView();
  render();
}

function persist() {
  try { saveState(state); } catch { /* keep backup */ }
}

function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
}

function formatMin(min) {
  const m = Number(min) || 0;
  const total = Math.max(0, Math.round(m * 60));
  const h = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  if (h) return `${h}시간 ${mm}분`;
  if (mm) return ss ? `${mm}분 ${ss}초` : `${mm}분`;
  return `${ss}초`;
}

function render() {
  if (!isInternalNetwork() || !getSession()) {
    location.href = "./portal.html?v=42";
    return;
  }
  const session = getSession();
  const list = jobs();
  const job = current();
  if (job) selectedId = allJobs().some((j) => j.id === selectedId) ? selectedId : job.id;
  const view = viewJob();
  if (!mill && view?.points?.length) loadView(view);
  const stats = collectStats(job ? [job] : []);
  const seq = job?.seq || toolOps(job?.points || [], job?.toolLib);
  if (opIndex >= seq.length) opIndex = Math.max(0, seq.length - 1);
  if (focusOp >= seq.length) focusOp = seq.length ? Math.min(focusOp, seq.length - 1) : -1;
  const curOp = seq[focusOp >= 0 ? focusOp : opIndex];
  const cycle = view?.timeMin || 0;
  const elapsed = cycle * sim.t;
  const remain = Math.max(0, cycle - elapsed);
  const stock = view?.stock || mill?.stock;
  const spec = curOp ? toolSpec(curOp.tool, job?.toolLib) : null;
  const statLine = job
    ? `${h(job.partName || job.name)}${focusOp >= 0 ? ` · T${curOp?.tool}만 보기` : ` · ${seq.map((o) => `T${o.tool}`).join(" → ")}`} · 소재 ${stock ? `${stock.w}×${stock.d}×${stock.h} mm` : "—"}${job.material ? ` · ${h(job.material)}` : ""}`
    : "프로그램 찾기로 NC 또는 NCI를 넣으면 여기 보입니다.";
  root.innerHTML = `
    <div class="app lab">
      <header>
        <a href="./portal.html?v=42#/home"><div class="logo"><b>DOM</b><span>${h(t("가공 프로그램"))}</span></div></a>
        <div class="who">${langBar()}<span>${h(session.name)}</span> <button class="btn ghost" id="out" type="button">${h(t("로그아웃"))}</button></div>
      </header>
      <aside class="side">
        <p class="side-label">프로그램</p>
        <div class="side-actions">
          <button class="btn red sm" id="open-prog" type="button">프로그램 찾기</button>
          <button class="btn sm" id="open-folder" type="button">폴더에서 넣기</button>
          <input id="open-nc" type="file" multiple hidden accept=".nc,.nci,.cnc,.tap,.txt,.iso,.eia,.min,.ncc,.mc9,.mc8">
          <input id="open-dir" type="file" hidden webkitdirectory>
        </div>
        <input class="job-q" id="job-q" type="search" placeholder="이름 찾기" value="${h(jobQuery)}" autocomplete="off">
        ${list.map((j) => `<div class="job-item">
          <button class="job-row ${j.id === job?.id ? "on" : ""}" data-id="${h(j.id)}" type="button">${h(j.partName || j.name)}<small>가공 ${formatMin(j.timeMin)}</small></button>
          <button class="btn sm" data-del="${h(j.id)}" type="button">삭제</button>
        </div>`).join("") || `<p class="mute pad">${jobQuery ? "찾는 프로그램이 없습니다." : "없음"}</p>`}
        <div class="side-actions">
          <button class="btn sm" id="del-all" type="button">목록 모두 지우기</button>
        </div>
        <p class="side-label">프로그램 가공 순서</p>
        <div class="seq-list">
        <button class="seq-row ${focusOp < 0 ? "op-on" : ""}" data-seq-all type="button">전체 프로그램</button>
        ${seq.map((o, i) => `<button class="seq-row ${focusOp === i ? "op-on" : ""}" data-seq="${i}" type="button">T${o.tool} · ${h(o.spec?.name || "")}${focusOp === i ? " · 이 공구만" : ""}</button>`).join("") || `<p class="seq-row mute">없음</p>`}
        </div>
        <p class="side-label">공구 통계</p>
        <div class="seq-list">
        ${stats.map((s) => `<button class="seq-row mag-row ${s.tool === curOp?.tool ? "op-on" : ""}" data-mag="${s.tool}" type="button">
          <b>T${s.tool}</b> ${h(s.name)} · ${h(s.feedLabel)} · ${h(s.spindleLabel)}
        </button>`).join("") || `<p class="seq-row mute">없음</p>`}
        </div>
      </aside>
      <div class="lab-main">
        <div>
          <h1 style="margin:0 0 6px">3D 가공 시뮬레이션</h1>
          <p class="stat">${statLine}</p>
          <div class="times">
            <div class="time-box"><span>예상 가공 시간</span><b id="t-cycle">${formatMin(cycle)}</b></div>
            <div class="time-box"><span>경과</span><b id="t-elapsed">${formatMin(elapsed)}</b></div>
            <div class="time-box"><span>남은 시간</span><b id="t-remain">${formatMin(remain)}</b></div>
            <div class="time-box"><span>현재 공구</span><b id="t-tool">${spec ? `T${spec.t} ${spec.name}` : "—"}</b></div>
            <div class="time-box"><span>이송 F</span><b id="t-feed">—</b></div>
            <div class="time-box"><span>주축 S</span><b id="t-spindle">—</b></div>
          </div>
          <div class="lab-tools">
            <button class="btn red" id="play" type="button">${sim.playing ? "일시정지" : "시뮬레이션"}</button>
            <button class="btn" id="raw" type="button">전체 처음부터</button>
            <button class="btn" id="reset" type="button">이 공구 처음으로</button>
            <button class="btn" id="view" type="button">시점 초기화</button>
            <span class="speeds" id="speeds">${SPEEDS.map((n) => `<button class="btn sm ${n === sim.speed ? "on" : ""}" data-speed="${n}" type="button">${n}x</button>`).join("")}</span>
            <button class="btn" id="nc" type="button">NC 출력</button>
            <button class="btn" id="json" type="button">데이터 출력</button>
          </div>
        </div>
        <div class="stage">
          <canvas id="sim" width="1400" height="780"></canvas>
          <div class="sim-hud" id="sim-hud"></div>
          <p class="view-hint">왼쪽 드래그 회전 · 휠 확대/축소 · 오른쪽 드래그 이동 · 더블클릭 시점 초기화</p>
        </div>
        <textarea class="nc" id="outnc" readonly>${view ? h(toNc(job)) : ""}</textarea>
      </div>
    </div>`;
  applyHtmlLang();
  bindLang(render);
  document.getElementById("out").onclick = () => { logout(); location.href = "./portal.html?v=42"; };
  document.getElementById("job-q")?.addEventListener("change", (e) => {
    jobQuery = e.target.value || "";
    render();
  });
  document.getElementById("job-q")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    jobQuery = e.target.value || "";
    render();
  });
  const takeFiles = async (files) => {
    const list = preferCamFiles([...files].filter((f) => isCamNc(f.name)));
    if (!list.length) return alert("NC, NCI 또는 Mastercam 9(MC9) 파일이 없습니다.");
    let last = null;
    let miss = 0;
    for (const file of list) {
      const job = await ingestLabFile(file);
      if (job) last = job;
      else miss += 1;
    }
    if (!last) return alert("공구경로를 읽지 못했습니다. 마스터캠에서 NCI를 저장하거나 NC로 포스트한 파일을 넣어 주세요. MC9만 있으면 같은 폴더의 NCI/NC를 함께 넣어 주세요.");
    selectedId = last.id;
    focusOp = -1;
    opIndex = 0;
    persist();
    sim.playing = false;
    sim.t = 0;
    loadView();
    render();
    if (miss) alert(`${list.length - miss}개를 넣었습니다. ${miss}개는 경로가 없어 건너뛰었습니다.`);
  };
  document.getElementById("open-prog")?.addEventListener("click", () => {
    document.getElementById("open-nc")?.click();
  });
  document.getElementById("open-folder")?.addEventListener("click", async () => {
    if (window.showDirectoryPicker) {
      try {
        const dir = await window.showDirectoryPicker({ id: "dom-sim-nc" });
        const files = [];
        for await (const [, entry] of dir.entries()) {
          if (entry.kind === "file" && isCamNc(entry.name)) files.push(await entry.getFile());
        }
        await takeFiles(files);
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    document.getElementById("open-dir")?.click();
  });
  document.getElementById("open-nc")?.addEventListener("change", async (e) => {
    await takeFiles(e.target.files || []);
    e.target.value = "";
  });
  document.getElementById("open-dir")?.addEventListener("change", async (e) => {
    await takeFiles(e.target.files || []);
    e.target.value = "";
  });
  root.querySelectorAll("[data-id]").forEach((b) => b.onclick = () => {
    selectedId = b.dataset.id;
    focusOp = -1;
    opIndex = 0;
    sim.playing = false;
    sim.t = 0;
    loadView();
    render();
  });
  root.querySelectorAll("[data-del]").forEach((b) => b.onclick = (event) => {
    event.stopPropagation();
    const id = b.dataset.del;
    const i = (state.cam.jobs || []).findIndex((j) => j.id === id);
    const row = i >= 0 ? state.cam.jobs[i] : null;
    if (!row || !confirm(`‘${row.partName || row.name}’을 지울까요?`)) return;
    state.cam.jobs.splice(i, 1);
    if (selectedId === id) selectedId = allJobs()[0]?.id || "";
    persist();
    sim.playing = false;
    sim.t = 0;
    focusOp = -1;
    loadView();
    render();
  });
  document.getElementById("del-all")?.addEventListener("click", () => {
    if (!state.cam.jobs.length) return;
    if (!confirm("목록의 프로그램을 모두 지울까요?")) return;
    state.cam.jobs = [];
    selectedId = "";
    mill = null;
    opJob = null;
    opIndex = 0;
    focusOp = -1;
    persist();
    sim.playing = false;
    sim.t = 0;
    render();
  });
  document.getElementById("play").onclick = () => {
    sim.playing = !sim.playing;
    const btn = document.getElementById("play");
    if (sim.playing) {
      btn.textContent = "일시정지";
      sim.last = 0;
      if (sim.t >= 1) sim.t = 0;
      loop();
    } else {
      btn.textContent = "시뮬레이션";
    }
  };
  document.getElementById("reset").onclick = () => {
    sim.playing = false;
    sim.t = 0;
    const btn = document.getElementById("play");
    if (btn) btn.textContent = "시뮬레이션";
    mill?.reset?.();
    mill?.setProgress?.(0);
    syncTime();
    draw();
  };
  document.getElementById("raw")?.addEventListener("click", () => {
    selectAllTools();
  });
  root.querySelectorAll("[data-seq-all]").forEach((b) => b.onclick = () => selectAllTools());
  root.querySelectorAll("[data-seq]").forEach((b) => b.onclick = () => selectTool(Number(b.dataset.seq)));
  root.querySelectorAll("[data-mag]").forEach((b) => b.onclick = () => {
    const tool = Number(b.dataset.mag);
    const src = current();
    const seqNow = src?.seq || toolOps(src?.points || [], src?.toolLib);
    const i = seqNow.findIndex((o) => o.tool === tool);
    if (i >= 0) selectTool(i);
  });
  root.querySelectorAll("[data-speed]").forEach((b) => b.onclick = () => {
    sim.speed = Number(b.dataset.speed);
    root.querySelectorAll("[data-speed]").forEach((x) => x.classList.toggle("on", Number(x.dataset.speed) === sim.speed));
    draw();
  });
  document.getElementById("nc").onclick = () => { if (job) download(job.name.replace(/\.[^.]+$/, "") + ".nc", toNc(job), "text/plain"); };
  document.getElementById("json").onclick = () => { if (job) download(job.name.replace(/\.[^.]+$/, "") + ".json", toJson(job), "application/json"); };
  document.getElementById("view")?.addEventListener("click", () => {
    cam = { ...CAM0 };
    draw();
  });
  bindView();
  draw();
}

function fitCanvas(canvas) {
  const box = canvas.parentElement;
  if (!box) return;
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const w = Math.max(720, box.clientWidth);
  const h = Math.max(520, box.clientHeight);
  const tw = Math.round(w * dpr);
  const th = Math.round(h * dpr);
  if (canvas.width !== tw || canvas.height !== th) {
    canvas.width = tw;
    canvas.height = th;
  }
}

function bindView() {
  const canvas = document.getElementById("sim");
  if (!canvas || canvas.dataset.viewBound === "1") return;
  canvas.dataset.viewBound = "1";
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag = {
      x: e.clientX,
      y: e.clientY,
      pan: e.button === 2 || e.button === 1 || e.shiftKey,
      yaw: cam.yaw,
      pitch: cam.pitch,
      panX: cam.panX,
      panY: cam.panY,
    };
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (drag.pan) {
      cam.panX = drag.panX + dx * dpr;
      cam.panY = drag.panY + dy * dpr;
    } else {
      cam.yaw = drag.yaw + dx * 0.008;
      cam.pitch = Math.max(0.12, Math.min(1.45, drag.pitch + dy * 0.008));
    }
    draw();
  });
  const end = () => { drag = null; };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const next = cam.scale * (e.deltaY > 0 ? 0.9 : 1.12);
    cam.scale = Math.max(0.35, Math.min(6, next));
    draw();
  }, { passive: false });
  canvas.addEventListener("dblclick", () => {
    cam = { ...CAM0 };
    draw();
  });
  const ro = new ResizeObserver(() => draw());
  ro.observe(canvas.parentElement);
}

function lengths(points) {
  const arr = [0];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1], b = points[i];
    arr.push(arr[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0)));
  }
  return arr;
}

function at(points, t) {
  if (!points.length) return { x: 0, y: 0, z: 0, t: 1, f: 0, s: 0 };
  const acc = accTime(points);
  const total = acc[acc.length - 1] || 1;
  const target = t * total;
  for (let i = 1; i < acc.length; i += 1) {
    if (acc[i] >= target) {
      const span = acc[i] - acc[i - 1] || 1;
      const u = (target - acc[i - 1]) / span;
      const a = points[i - 1], b = points[i];
      return {
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * u,
        t: Number(b.t ?? a.t ?? 1),
        f: b.f ?? a.f ?? 0,
        s: b.s ?? a.s ?? 0,
        rapid: b.rapid,
        change: b.change,
      };
    }
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y, z: last.z || 0, t: Number(last.t || 1), f: last.f || 0, s: last.s || 0, rapid: last.rapid, change: last.change };
}

function syncTime(pos) {
  const job = current();
  const pathJob = opJob || viewJob() || job;
  const cycle = pathJob?.timeMin || 0;
  const elapsed = cycle * sim.t;
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set("t-cycle", formatMin(cycle));
  set("t-elapsed", formatMin(elapsed));
  set("t-remain", formatMin(Math.max(0, cycle - elapsed)));
  const p = pos || (pathJob?.points?.length ? at(pathJob.points, sim.t) : null);
  const spec = p ? toolSpec(p.t, pathJob?.toolLib) : null;
  set("t-tool", spec ? `T${spec.t} ${spec.name}` : "—");
  if (!p) {
    set("t-feed", "—");
    set("t-spindle", "—");
  } else if (p.change) {
    set("t-feed", "공구교환");
    set("t-spindle", p.s ? `S${Math.round(p.s)}` : "—");
  } else if (p.rapid) {
    set("t-feed", "급속");
    set("t-spindle", p.s ? `S${Math.round(p.s)}` : "—");
  } else {
    set("t-feed", p.f ? `F${Math.round(p.f)}` : "—");
    set("t-spindle", p.s ? `S${Math.round(p.s)}` : "—");
  }
  document.querySelectorAll("[data-mag]").forEach((el) => {
    el.classList.toggle("op-on", Number(el.dataset.mag) === Number(p?.t));
  });
  document.querySelectorAll("[data-seq-all]").forEach((el) => {
    el.classList.toggle("op-on", focusOp < 0);
  });
  document.querySelectorAll("[data-seq]").forEach((el) => {
    const i = Number(el.dataset.seq);
    el.classList.toggle("op-on", focusOp >= 0 ? i === focusOp : i === opIndex);
  });
}

function draw() {
  const canvas = document.getElementById("sim");
  if (!canvas) return;
  fitCanvas(canvas);
  const hud = document.getElementById("sim-hud");
  const job = current();
  const pathJob = opJob || viewJob();
  if (!pathJob?.points?.length) {
    if (hud) hud.textContent = "프로그램 찾기로 NC 또는 NCI를 넣으세요.";
    syncTime();
    return;
  }
  const pos = at(pathJob.points, sim.t);
  if (focusOp < 0) {
    const seqNow = job?.seq || toolOps(job?.points || [], job?.toolLib);
    let hit = 0;
    seqNow.forEach((o, i) => { if (sim.t >= o.t0 - 1e-6) hit = i; });
    opIndex = hit;
  }
  const specNow = toolSpec(pos.t, pathJob.toolLib);
  const cycle = pathJob.timeMin || 0;
  const mode = pos.rapid ? "급속이송" : pos.change ? "공구교환" : "절삭";
  const only = focusOp >= 0 ? "  이 공구만" : "";
  const fs = pos.change ? "" : pos.rapid ? `  S${Math.round(pos.s || 0)}` : `  F${Math.round(pos.f || 0)}  S${Math.round(pos.s || 0)}`;
  try {
    if (!mill) {
      mill = createMill(pathJob);
      opJob = pathJob;
    }
    mill.setProgress(sim.t);
    mill.draw(canvas, canvas.width, canvas.height, pos, cam);
    if (hud) {
      hud.textContent = `${pathJob.partName}  T${pos.t} ${specNow.name}${fs}  ${mode}${only}  ${sim.speed}x  X${pos.x.toFixed(1)}  Y${pos.y.toFixed(1)}  Z${pos.z.toFixed(1)}  ${formatMin(cycle * sim.t)} / ${formatMin(cycle)}`;
    }
  } catch {
    if (hud) hud.textContent = "3D 화면을 준비하지 못했습니다. 다시 열기를 눌러 주세요.";
  }
  syncTime(pos);
}

function loop(now = 0) {
  if (!sim.playing) return;
  if (!sim.last) sim.last = now;
  const dt = Math.min(0.05, (now - sim.last) / 1000);
  sim.last = now;
  const cycleSec = Math.max((opJob || current())?.timeMin || 0.2, 0.05) * 60;
  sim.t = Math.min(1, sim.t + (dt * sim.speed) / Math.max(cycleSec, 1));
  draw();
  if (sim.t >= 1) {
    mill?.commit?.();
    sim.playing = false;
    sim.last = 0;
    const btn = document.getElementById("play");
    if (btn) btn.textContent = "시뮬레이션";
    return;
  }
  sim.raf = requestAnimationFrame(loop);
}

boot(render);
