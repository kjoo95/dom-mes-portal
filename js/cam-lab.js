import { getSession, logout, isInternalNetwork } from "./auth.js?v=43";
import { loadState, saveState, uid } from "./store.js";
import { collectStats, optimizeJob, toNc, toJson, accTime, toolOps, toolSpec } from "./gcode.js?v=44";
import { boot } from "./safety.js";
import { createMill } from "./mill3d.js?v=24";
import { t, langBar, bindLang, applyHtmlLang } from "./i18n.js?v=42";

const root = document.getElementById("app");
const h = (v) => String(v ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

let state = loadState();
let selected = 0;
let mill = null;
let opJob = null;
let opIndex = 0;
let sim = { playing: false, t: 0, last: 0, raf: 0, speed: 64 };
const SPEEDS = [1, 4, 16, 32, 64, 120, 300];
const CAM0 = { yaw: 0.92, pitch: 0.98, scale: 1.22, panX: 0, panY: 8 };
let cam = { ...CAM0 };
let drag = null;

function jobs() {
  return state.cam.jobs || [];
}

function current() {
  return jobs()[selected] || jobs()[0];
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
  if (!mill && job?.points?.length) {
    mill = createMill(job);
    opJob = job;
  }
  const stats = collectStats(job ? [job] : []);
  const seq = job?.seq || toolOps(job?.points || []);
  if (opIndex >= seq.length) opIndex = Math.max(0, seq.length - 1);
  const curOp = seq[opIndex];
  const cycle = job?.timeMin || 0;
  const elapsed = cycle * sim.t;
  const remain = Math.max(0, cycle - elapsed);
  const stock = mill?.stock;
  const nextOp = seq[opIndex + 1];
  const nextLabel = nextOp ? `다음 공구 T${nextOp.tool}` : "마지막 공구";
  const spec = curOp ? toolSpec(curOp.tool) : null;
  const statLine = job
    ? `${h(job.partName || job.name)} · ${seq.map((o, i) => `${i === opIndex ? "▶ " : ""}T${o.tool}`).join(" → ")} · 소재 ${stock ? `${stock.w}×${stock.d}×${stock.h} mm` : "—"}`
    : "마스터캠 폴더에 프로그램을 올리면 여기 쌓입니다.";
  root.innerHTML = `
    <div class="app lab">
      <header>
        <a href="./portal.html?v=42#/home"><div class="logo"><b>DOM</b><span>${h(t("가공 프로그램"))}</span></div></a>
        <div class="who">${langBar()}<span>${h(session.name)}</span> <button class="btn ghost" id="out" type="button">${h(t("로그아웃"))}</button></div>
      </header>
      <aside class="side">
        <p class="side-label">축적 데이터</p>
        ${list.map((j, i) => `<div class="job-item">
          <button class="job-row ${i === selected ? "on" : ""}" data-i="${i}" type="button">${h(j.partName || j.name)}<small>가공 ${formatMin(j.timeMin)}${j.optimized ? " · 최적" : ""}</small></button>
          <button class="btn sm" data-del="${i}" type="button">삭제</button>
        </div>`).join("") || `<p class="mute pad">없음</p>`}
        <div class="side-actions">
          <button class="btn sm" id="del-opt" type="button">최적 경로만 지우기</button>
          <button class="btn sm" id="del-all" type="button">축적 데이터 모두 지우기</button>
        </div>
        <p class="side-label">프로그램 가공 순서</p>
        ${seq.map((o, i) => `<p class="mute pad ${i === opIndex ? "op-on" : ""}" data-seq="${i}">T${o.tool} 자리 · ${h(o.spec?.name || "")}${i === opIndex ? " · 진행 중" : ""}</p>`).join("") || `<p class="mute pad">없음</p>`}
        <p class="side-label">공구 통계</p>
        ${stats.map((s) => `<p class="mute pad mag-row ${s.tool === curOp?.tool ? "op-on" : ""}" data-mag="${s.tool}">
          <b>T${s.tool} 자리</b> ${h(s.name)}<br>F${h(s.feedLabel)} · S${h(s.spindleLabel)} · ${Math.round(s.length)}mm
        </p>`).join("") || `<p class="mute pad">없음</p>`}
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
            <button class="btn red" id="opt" type="button">최적 경로 생성</button>
            <button class="btn red" id="next-op" type="button">${nextLabel}</button>
            <button class="btn" id="raw" type="button">프로그램 처음부터</button>
            <button class="btn" id="play" type="button">${sim.playing ? "일시정지" : "시뮬레이션"}</button>
            <button class="btn" id="reset" type="button">이 공구 처음으로</button>
            <button class="btn" id="view" type="button">시점 초기화</button>
            <span class="speeds" id="speeds">${SPEEDS.map((n) => `<button class="btn sm ${n === sim.speed ? "on" : ""}" data-speed="${n}" type="button">${n}x</button>`).join("")}</span>
            <button class="btn" id="nc" type="button">NC 출력</button>
            <button class="btn" id="json" type="button">데이터 출력</button>
            <a class="btn ghost" href="./portal.html?v=5#/mastercam">마스터캠 폴더</a>
          </div>
        </div>
        <div class="stage">
          <canvas id="sim" width="1400" height="780"></canvas>
          <div class="sim-hud" id="sim-hud"></div>
          <p class="view-hint">왼쪽 드래그 회전 · 휠 확대/축소 · 오른쪽 드래그 이동 · 더블클릭 시점 초기화</p>
        </div>
        <textarea class="nc" id="outnc" readonly>${job ? h(toNc(job)) : ""}</textarea>
      </div>
    </div>`;
  applyHtmlLang();
  bindLang(render);
  document.getElementById("out").onclick = () => { logout(); location.href = "./portal.html?v=42"; };
  root.querySelectorAll("[data-i]").forEach((b) => b.onclick = () => {
    selected = Number(b.dataset.i);
    const next = current();
    mill = next?.points?.length ? createMill(next) : null;
    opJob = next;
    opIndex = 0;
    sim.playing = false;
    sim.t = 0;
    render();
  });
  root.querySelectorAll("[data-del]").forEach((b) => b.onclick = (event) => {
    event.stopPropagation();
    const i = Number(b.dataset.del);
    const row = state.cam.jobs[i];
    if (!row || !confirm(`‘${row.partName || row.name}’을 지울까요?`)) return;
    state.cam.jobs.splice(i, 1);
    if (selected >= state.cam.jobs.length) selected = Math.max(0, state.cam.jobs.length - 1);
    persist();
    sim.playing = false;
    sim.t = 0;
    render();
  });
  document.getElementById("del-opt")?.addEventListener("click", () => {
    if (!state.cam.jobs.some((j) => j.optimized)) return alert("지울 최적 경로가 없습니다.");
    if (!confirm("최적 경로로 만든 항목만 지울까요? 원본 프로그램은 남습니다.")) return;
    state.cam.jobs = state.cam.jobs.filter((j) => !j.optimized);
    selected = 0;
    persist();
    sim.playing = false;
    sim.t = 0;
    render();
  });
  document.getElementById("del-all")?.addEventListener("click", () => {
    if (!state.cam.jobs.length) return;
    if (!confirm("축적된 가공 데이터를 모두 지울까요?")) return;
    state.cam.jobs = [];
    selected = 0;
    mill = null;
    opJob = null;
    opIndex = 0;
    persist();
    sim.playing = false;
    sim.t = 0;
    render();
  });
  document.getElementById("opt").onclick = () => {
    const src = current();
    if (!src) return;
    const next = { ...optimizeJob(src, stats), id: uid("job"), date: src.date, folderId: src.folderId };
    state.cam.jobs.unshift(next);
    selected = 0;
    persist();
    sim.t = 0;
    render();
  };
  document.getElementById("play").onclick = () => {
    sim.playing = !sim.playing;
    const btn = document.getElementById("play");
    if (sim.playing) {
      btn.textContent = "일시정지";
      sim.last = 0;
      loop();
    } else {
      btn.textContent = "시뮬레이션";
    }
  };
  document.getElementById("reset").onclick = () => {
    sim.playing = false;
    const jobNow = current();
    const seqNow = jobNow?.seq || toolOps(jobNow?.points || []);
    sim.t = seqNow[opIndex]?.t0 || 0;
    const btn = document.getElementById("play");
    if (btn) btn.textContent = "시뮬레이션";
    mill?.setProgress?.(sim.t);
    syncTime();
    draw();
  };
  document.getElementById("raw")?.addEventListener("click", () => {
    const src = current();
    if (!src) return;
    mill = createMill(src);
    opJob = src;
    opIndex = 0;
    sim.playing = false;
    sim.t = 0;
    render();
  });
  document.getElementById("next-op")?.addEventListener("click", () => {
    const src = current();
    if (!src) return;
    const seqNow = src.seq || toolOps(src.points || []);
    if (!seqNow.length) return;
    if (!mill) mill = createMill(src);
    const cur = seqNow[Math.min(opIndex, seqNow.length - 1)];
    sim.t = cur?.t1 ?? 1;
    mill.setProgress(sim.t);
    if (opIndex < seqNow.length - 1) opIndex += 1;
    opJob = src;
    sim.playing = false;
    sim.last = 0;
    render();
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
        t: b.t ?? a.t,
        f: b.f ?? a.f ?? 0,
        s: b.s ?? a.s ?? 0,
        rapid: b.rapid,
        change: b.change,
      };
    }
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y, z: last.z || 0, t: last.t, f: last.f || 0, s: last.s || 0, rapid: last.rapid, change: last.change };
}

function syncTime(pos) {
  const job = current();
  const cycle = job?.timeMin || 0;
  const elapsed = cycle * sim.t;
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set("t-cycle", formatMin(cycle));
  set("t-elapsed", formatMin(elapsed));
  set("t-remain", formatMin(Math.max(0, cycle - elapsed)));
  const pathJob = opJob || job;
  const p = pos || (pathJob?.points?.length ? at(pathJob.points, sim.t) : null);
  const spec = p ? toolSpec(p.t) : null;
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
  document.querySelectorAll("[data-seq]").forEach((el) => {
    el.classList.toggle("op-on", Number(el.dataset.seq) === opIndex);
  });
}

function draw() {
  const canvas = document.getElementById("sim");
  if (!canvas) return;
  fitCanvas(canvas);
  const hud = document.getElementById("sim-hud");
  const job = current();
  if (!job?.points?.length) {
    if (hud) hud.textContent = "가공할 프로그램이 없습니다.";
    syncTime();
    return;
  }
  const pathJob = opJob || job;
  const pos = at(pathJob.points, sim.t);
  const seqNow = pathJob.seq || toolOps(pathJob.points || []);
  let hit = 0;
  seqNow.forEach((o, i) => { if (sim.t >= o.t0 - 1e-6) hit = i; });
  opIndex = hit;
  const specNow = toolSpec(pos.t);
  const cycle = job.timeMin || 0;
  const mode = pos.rapid ? "급속이송" : pos.change ? "공구교환" : "절삭";
  const fs = pos.change ? "" : pos.rapid ? `  S${Math.round(pos.s || 0)}` : `  F${Math.round(pos.f || 0)}  S${Math.round(pos.s || 0)}`;
  try {
    if (!mill) {
      mill = createMill(pathJob);
      opJob = pathJob;
    }
    mill.setProgress(sim.t);
    mill.draw(canvas, canvas.width, canvas.height, pos, cam);
    if (hud) {
      hud.textContent = `${job.partName}  T${pos.t} ${specNow.name}${fs}  ${mode}  ${sim.speed}x  X${pos.x.toFixed(1)}  Y${pos.y.toFixed(1)}  Z${pos.z.toFixed(1)}  ${formatMin(cycle * sim.t)} / ${formatMin(cycle)}`;
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
  const cycleSec = Math.max((current()?.timeMin || 0.2) * 60, 1);
  sim.t = Math.min(1, sim.t + (dt * sim.speed) / cycleSec);
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
