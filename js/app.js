import { getSession, login, signup, logout, isInternalNetwork, pullUsers, isAdmin, listUsers, pendingCount, setUserStatus } from "./auth.js?v=45";
import {
  CUSTOMERS, MILL_SHOPS, CNC_CHECKS, MACHINES, FIVE_S_SHOP, FIVE_S_LAB,
  fieldsFor, flattenChecks, badgeClass, todayISO,
} from "./data.js?v=43";
import { loadState, saveState, uid } from "./store.js?v=47";
import { saveBlob, loadBlob, readAsDataUrl, saveDirHandle, loadDirHandle } from "./files.js?v=39";
import { parseProgram, decodeCamFile, isCamFileName } from "./gcode.js?v=49";
import { boot, showRecover } from "./safety.js?v=39";
import { chatView, bindChat } from "./comm.js?v=50";
import { t, langBar, bindLang, applyHtmlLang } from "./i18n.js?v=48";

const WHOIS_MAIL = "https://email.whois.co.kr/v2/";
const root = document.getElementById("app");
let state = loadState();
let camFolder = state.camFolder || "cam-root";
let manageId = "inbound";
let camWatchTimer = 0;

const h = (v) => String(v ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const ht = (v) => h(t(v));

function persist() {
  state.camFolder = camFolder;
  try { saveState(state); } catch { /* 백업은 store에서 유지 */ }
}

function route() {
  const p = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (!p.length || p[0] === "home") return { page: "home" };
  if (p[0] === "manage") return { page: "manage" };
  if (p[0] === "members") return { page: "members" };
  return { page: "mod", id: p[0], date: p[1] || "", extra: p[2] || "" };
}

function recDate(row, type) {
  if (type === "process") return row.workDate || row.startDate || "";
  if (type === "inbound") return row.month || monthKey(row.date) || "";
  return row.date || "";
}

function remember(id, date) {
  const mod = state.modules.find((m) => m.id === id);
  const key = isMonthFolder(mod) ? (monthKey(date) || date) : date;
  if (!state.dateFolders[id]) state.dateFolders[id] = [];
  if (key && !state.dateFolders[id].includes(key)) state.dateFolders[id].push(key);
}

function isMonthMod(mod) {
  return ["climate", "lab-climate", "five-s", "lab-5s"].includes(mod?.type);
}

function isMonthFolder(mod) {
  return isMonthMod(mod) || mod?.type === "inbound";
}

function monthKey(v) {
  const s = String(v || "");
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);
  return "";
}

function thisMonth() {
  return todayISO().slice(0, 7);
}

function monthLabel(ym) {
  const [y, m] = String(ym).split("-");
  if (!y || !m) return ym;
  return `${t("{y}년 {m}월", { y, m: Number(m) })}`;
}

function daysInMonth(ym) {
  const [y, m] = String(ym).split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function isoDay(ym, day) {
  return `${ym}-${String(day).padStart(2, "0")}`;
}

function datesOf(mod) {
  const set = new Set(state.dateFolders[mod.id] || []);
  (state.records[mod.id] || []).forEach((r) => recDate(r, mod.type) && set.add(recDate(r, mod.type)));
  if (mod.type === "climate") {
    Object.keys(state.climate.logs || {}).forEach((d) => set.add(d));
    Object.keys(state.climate.checks || {}).forEach((d) => set.add(d));
  }
  if (mod.type === "lab-climate") {
    Object.keys(state.labClimate?.logs || {}).forEach((d) => set.add(d));
    Object.keys(state.labClimate?.checks || {}).forEach((d) => set.add(d));
  }
  if (mod.type === "equipment") Object.keys(state.equipment || {}).forEach((d) => set.add(d));
  if (mod.type === "five-s") {
    Object.entries(state.fiveS.dates || {}).forEach(([d, pack]) => {
      if (pack?.shop && Object.keys(pack.shop).length) set.add(d);
    });
  }
  if (mod.type === "lab-5s") {
    Object.entries(state.fiveS.dates || {}).forEach(([d, pack]) => {
      if (pack?.lab && Object.keys(pack.lab).some((k) => k.startsWith("l"))) set.add(d);
    });
  }
  if (mod.type === "mastercam") (state.cam.files || []).forEach((f) => f.date && set.add(f.date));
  if (isMonthFolder(mod)) {
    return [...new Set([...set].map((d) => monthKey(d) || d).filter(Boolean))].sort().reverse();
  }
  return [...set].sort().reverse();
}

function rowsOn(mod, date) {
  const list = state.records[mod.id] || [];
  if (mod.type === "inbound") {
    const ym = monthKey(date) || String(date || "").slice(0, 7);
    return list.filter((r) => (r.month || monthKey(r.date)) === ym);
  }
  return list.filter((r) => recDate(r, mod.type) === date);
}

function isSheetMod(mod) {
  return ["inbound", "process", "delivery", "quality", "defect", "inventory", "custom"].includes(mod.type);
}

function isPrintPage(mod, extra, date) {
  if (isMonthMod(mod) && date && extra !== "map") return true;
  if (mod?.type === "inbound" && date && !extra) return true;
  if (!extra) return false;
  if (isSheetMod(mod) || mod.type === "equipment") return true;
  return false;
}

function logo() {
  return `<div class="logo"><b>DOM</b><span>${ht("디오엠 · 제조 운영")}</span></div>`;
}

function render() {
  applyHtmlLang();
  const session = getSession();
  const r = route();
  if (!session) return renderLogin();
  if (r.page === "home") {
    shell(session, "home", homeView());
    bindHome();
    ensureCamWatch();
    return;
  }
  if (r.page === "manage") {
    shell(session, "manage", manageView());
    bindManage();
    ensureCamWatch();
    return;
  }
  if (r.page === "members") {
    if (!isAdmin(session)) {
      shell(session, "home", homeView());
      bindHome();
      return;
    }
    shell(session, "members", membersView());
    bindMembers();
    return;
  }
  const mod = state.modules.find((m) => m.id === r.id);
  if (!mod) {
    shell(session, "home", homeView());
    bindHome();
    return;
  }
  if (mod.type === "mail") {
    location.href = WHOIS_MAIL;
    return;
  }
  const printMode = isPrintPage(mod, r.extra, r.date);
  shell(session, mod.id, moduleView(mod, r.date, r.extra), printMode);
  bindModule(mod, r.date, r.extra);
  ensureCamWatch();
}

function renderLogin(mode = "login") {
  if (!isInternalNetwork()) {
    root.innerHTML = `
      <div class="login">
        <div class="card">
          ${logo()}
          <h1>${ht("내부 전용")}</h1>
          <p>${ht("운영 포털과 가공 프로그램은 디오엠 내부 네트워크에서만 열 수 있습니다.")}</p>
          <p><a href="./index.html">${ht("디오엠 회사 홈")}</a></p>
          ${langBar()}
        </div>
      </div>`;
    bindLang(() => renderLogin(mode));
    return;
  }
  const join = mode === "signup";
  pullUsers();
  root.innerHTML = `
    <div class="login">
      <div class="card auth-card">
        ${logo()}
        ${langBar()}
        <h1>${ht("내부 운영 포털")}</h1>
        <p>${ht("회사 메일로 가입 신청하면, 관리자가 승인한 뒤에만 들어갈 수 있습니다.")}</p>
        <div class="auth-tabs">
          <button class="auth-tab ${join ? "" : "on"}" id="tab-login" type="button">${ht("로그인")}</button>
          <button class="auth-tab ${join ? "on" : ""}" id="tab-signup" type="button">${ht("회원가입")}</button>
        </div>
        <form id="auth-form">
          ${join ? `
            <label>${ht("이름")}<input id="name" type="text" required autocomplete="name" /></label>
            <label>${ht("부서")}<select id="team">
              <option value="office">${ht("사무")}</option>
              <option value="shop">${ht("현장")}</option>
              <option value="lab">${ht("검사실")}</option>
            </select></label>
          ` : ""}
          <label>${ht("아이디")}<input id="email" type="text" required autocomplete="username" placeholder="thswlsvy1021" spellcheck="false" lang="en" /></label>
          <label>${ht("비밀번호")}<input id="password" type="password" required lang="en" autocomplete="${join ? "new-password" : "current-password"}" /></label>
          ${join ? `<label>${ht("비밀번호 확인")}<input id="confirm" type="password" required autocomplete="new-password" /></label>` : ""}
          <p class="err" id="err"></p>
          <button class="btn red" type="submit">${join ? ht("가입 신청") : ht("로그인")}</button>
        </form>
        <p><a href="./index.html">${ht("디오엠 회사 홈")}</a></p>
        <button class="btn" id="install" type="button">${ht("컴퓨터에 앱 설치")}</button>
      </div>
    </div>`;
  document.getElementById("tab-login").onclick = () => renderLogin("login");
  document.getElementById("tab-signup").onclick = () => renderLogin("signup");
  document.getElementById("auth-form").onsubmit = async (e) => {
    e.preventDefault();
    const err = document.getElementById("err");
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    err.className = "err";
    err.textContent = "";
    const res = join
      ? await signup({
          name: document.getElementById("name").value,
          email: document.getElementById("email").value,
          password: document.getElementById("password").value,
          confirm: document.getElementById("confirm").value,
          team: document.getElementById("team").value,
        })
      : await login(document.getElementById("email").value, document.getElementById("password").value);
    btn.disabled = false;
    if (res.pending) {
      err.className = "note";
      err.textContent = t(res.message);
      return;
    }
    if (!res.ok) { err.textContent = t(res.message); return; }
    location.hash = "#/home";
    render();
  };
  bindLang(() => renderLogin(mode));
}

function recordMods() {
  return state.modules.filter((m) => !["records", "chat", "mail"].includes(m.type));
}

function recCount(mod) {
  if (mod.type === "records") {
    return recordMods().reduce((n, m) => n + recCount(m), 0);
  }
  if (mod.type === "climate") return Object.keys(state.climate.checks || {}).length || Object.keys(state.climate.logs || {}).length;
  if (mod.type === "lab-climate") return Object.keys(state.labClimate?.checks || {}).length || Object.keys(state.labClimate?.logs || {}).length;
  if (mod.type === "equipment") return Object.keys(state.equipment || {}).length;
  if (mod.type === "five-s") return Object.values(state.fiveS.dates || {}).filter((p) => p?.shop && Object.keys(p.shop).length).length;
  if (mod.type === "lab-5s") return Object.values(state.fiveS.dates || {}).filter((p) => p?.lab && Object.keys(p.lab).some((k) => k.startsWith("l"))).length;
  if (mod.type === "mastercam") return (state.cam.files || []).length;
  if (mod.type === "chat") return (state.chat?.messages || []).length;
  if (mod.type === "mail") return (state.mail?.drafts || []).length;
  return (state.records[mod.id] || []).length;
}

function isCommMod(m) {
  return m?.type === "chat" || m?.type === "mail";
}

function sideFolders(active) {
  return state.modules.filter((m) => !isCommMod(m)).map((m) => {
    const dates = datesOf(m).slice(0, 10);
    const open = active === m.id ? "open" : "";
    const lines = m.type === "records"
      ? `<a href="#/records">${ht("기록 관리 열기")}</a>`
      : `${dates.map((d) => `<a href="#/${m.id}/${d}">${h(isMonthFolder(m) ? monthLabel(d) : d)}</a>`).join("")}<a href="#/${m.id}">${ht(isMonthFolder(m) ? "월 목록" : "날짜 목록")}</a>`;
    return `<div class="nav-fold ${open}">
      <button class="nav-head ${m.id === active ? "on" : ""}" data-fold="${m.id}" type="button">${h(t(m.title))}</button>
      <div class="nav-drop">${lines}</div>
    </div>`;
  }).join("");
}

function bindShell() {
  root.querySelectorAll("[data-group]").forEach((b) => {
    b.onclick = () => b.parentElement.classList.toggle("open");
  });
  root.querySelectorAll("[data-fold]").forEach((b) => {
    b.onclick = () => {
      const box = b.parentElement;
      const willOpen = !box.classList.contains("open");
      box.parentElement?.querySelectorAll(":scope > .nav-fold.open").forEach((el) => {
        if (el !== box) el.classList.remove("open");
      });
      if (willOpen) box.classList.add("open");
      else box.classList.remove("open");
    };
  });
}

function shell(session, active, inner, printMode = false) {
  const link = (id, title) => `<a class="${id === active ? "on" : ""}" href="#/${id}">${ht(title)}</a>`;
  const folders = sideFolders(active);
  const comm = active === "chat" || active === "mail";
  const wait = isAdmin(session) ? pendingCount() : 0;
  const foldOpen = active !== "home" && active !== "manage" && active !== "members" && !comm ? "open" : "";
  root.innerHTML = `
    <div class="app ${printMode ? "print-mode" : ""}">
      <header>
        <a href="#/home">${logo()}</a>
        <div class="who">${langBar()}<span>${h(session.name)} · ${h(session.email)}</span> <button class="btn ghost" id="out" type="button">${ht("로그아웃")}</button></div>
      </header>
      <aside class="side">
        <div class="side-block go">
          <p class="side-label">${ht("바로가기")}</p>
          ${link("home", "운영 폴더")}
          ${link("manage", "수정·삭제")}
          ${isAdmin(session) ? `<a class="${"members" === active ? "on" : ""}" href="#/members">${ht("가입 승인")}${wait ? ` (${wait})` : ""}</a>` : ""}
          <a href="./cam-lab.html?v=31">${ht("가공 프로그램")}</a>
        </div>
        <div class="side-block comm">
          <p class="side-label">${ht("소통")}</p>
          ${link("chat", "사내 메신저")}
          <a href="${WHOIS_MAIL}">${ht("후이즈 메일")}</a>
        </div>
        <div class="side-block dirs">
          <div class="nav-group ${foldOpen}">
            <button class="nav-group-head" data-group="folders" type="button">${ht("폴더")}</button>
            <div class="nav-group-body">${folders}</div>
          </div>
        </div>
      </aside>
      <main>${inner}</main>
    </div>
    <div id="modal"></div>`;
  document.getElementById("out").onclick = () => { logout(); location.hash = ""; render(); };
  bindShell();
  bindLang(render);
}

function homeGroups() {
  const order = [
    { title: "생산 · 출하", ids: ["inbound", "process", "delivery"] },
    { title: "품질", ids: ["quality", "defect"] },
    { title: "현장 업무", ids: ["climate", "five-s"] },
    { title: "검사실", ids: ["lab-climate", "lab-5s"] },
    { title: "재고 · 설비", ids: ["inventory", "equipment"] },
    { title: "프로그램", ids: ["mastercam"] },
    { title: "관리", ids: ["records"] },
  ];
  const used = new Set([...order.flatMap((g) => g.ids), "chat", "mail"]);
  const extra = state.modules.filter((m) => !used.has(m.id) && !isCommMod(m));
  if (extra.length) order.push({ title: "기타", ids: extra.map((m) => m.id) });
  return order.map((g) => ({
    title: g.title,
    mods: g.ids.map((id) => state.modules.find((m) => m.id === id)).filter(Boolean),
  })).filter((g) => g.mods.length);
}

function folderRow(m) {
  const href = m.type === "mail" || m.id === "mail" ? WHOIS_MAIL : `#/${m.id}`;
  return `<a class="home-row" href="${h(href)}" data-name="${h(`${t(m.title)} ${t(m.desc)} ${m.id}`)}">
      <b>${h(t(m.title))}</b>
      <span>${h(t(m.desc))}</span>
    </a>`;
}

function homeView() {
  const commMods = [
    state.modules.find((m) => m.id === "chat") || { id: "chat", title: "사내 메신저", desc: "카카오톡처럼 현장·검사실·개인 대화를 나눕니다.", type: "chat" },
    state.modules.find((m) => m.id === "mail") || { id: "mail", title: "후이즈 메일", desc: "후이즈 웹메일로 이동합니다.", type: "mail" },
  ];
  const block = (title, mods, kind = "") => `
    <section class="home-band${kind ? ` ${kind}` : ""}" data-band>
      <h2>${ht(title)}</h2>
      <div class="home-list">${mods.map(folderRow).join("")}</div>
    </section>`;
  return `
    <div class="page-head">
      <div>
        <h1>${ht("운영 폴더")}</h1>
        <p>${ht("원하는 업무를 누르면 바로 열립니다.")}</p>
      </div>
      <input id="q" type="text" placeholder="${ht("검색")}" autocomplete="off" />
    </div>
    <div class="home-board">
      ${block("소통", commMods, "is-comm")}
      ${homeGroups().map((g) => block(g.title, g.mods)).join("")}
    </div>`;
}

function bindHome() {
  const q = document.getElementById("q");
  if (!q) return;
  const filter = () => {
    const needle = q.value.trim().toLowerCase();
    document.querySelectorAll(".home-row").forEach((el) => {
      const hay = `${el.getAttribute("data-name") || ""} ${el.textContent || ""}`.toLowerCase();
      el.hidden = Boolean(needle) && !hay.includes(needle);
    });
    document.querySelectorAll("[data-band]").forEach((band) => {
      const items = [...band.querySelectorAll(".home-row")];
      band.hidden = items.length > 0 && items.every((el) => el.hidden);
    });
  };
  q.addEventListener("input", filter);
  q.addEventListener("keyup", filter);
  q.addEventListener("compositionend", filter);
}

function manageView() {
  const rows = state.modules.filter((m) => !isCommMod(m)).map((m) => {
    const locked = m.type === "records";
    return `<div class="row"><b>${h(t(m.title))}</b>
      <button class="btn sm" data-ren="${m.id}" type="button">${ht("이름 변경")}</button>
      ${locked ? "" : `<button class="btn sm" data-rm="${m.id}" type="button">${ht("삭제")}</button>`}</div>`;
  }).join("");
  return `
    <div class="head"><div><h1>${ht("수정·삭제")}</h1><p>${ht("운영 폴더만 여기서 추가·이름 변경·삭제합니다. 기록은 기록 관리 폴더에서 다룹니다.")}</p></div>
      <button class="btn red" id="add-folder" type="button">${ht("폴더 추가")}</button></div>
    <section class="panel">${rows}</section>`;
}

function bindManage() {
  document.getElementById("add-folder").onclick = () => form("폴더 추가", [{ key: "title", label: "이름", type: "text" }, { key: "desc", label: "설명", type: "textarea" }], {}, (v) => {
    const id = uid("f");
    state.modules.push({ id, title: v.title, desc: v.desc || "", type: "custom" });
    state.records[id] = [];
    persist(); render();
  });
  root.querySelectorAll("[data-ren]").forEach((b) => b.onclick = () => {
    const m = state.modules.find((x) => x.id === b.dataset.ren);
    form("이름 변경", [{ key: "title", label: "이름", type: "text" }, { key: "desc", label: "설명", type: "textarea" }], m, (v) => { m.title = v.title || m.title; m.desc = v.desc || ""; persist(); render(); });
  });
  root.querySelectorAll("[data-rm]").forEach((b) => b.onclick = () => {
    const m = state.modules.find((x) => x.id === b.dataset.rm);
    if (prompt(`${t("삭제하려면 이름을 입력하세요.")}\n${m.title}`) !== m.title) return;
    state.modules = state.modules.filter((x) => x.id !== m.id); persist(); render();
  });
}

function teamLabel(team) {
  return t({ shop: "현장", lab: "검사실", office: "사무" }[team] || "사무");
}

function statusLabel(status) {
  return t({ pending: "승인 대기", approved: "사용 중", rejected: "거절" }[status] || status);
}

function membersView() {
  const people = [...listUsers()].sort((a, b) => {
    const order = { pending: 0, approved: 1, rejected: 2 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9) || (b.created || 0) - (a.created || 0);
  });
  const rows = people.map((u) => {
    const wait = u.status === "pending";
    const admin = u.role === "admin";
    return `<tr>
      <td>${h(u.name)}</td>
      <td>${h(u.email)}</td>
      <td>${h(teamLabel(u.team))}</td>
      <td>${h(statusLabel(u.status))}${admin ? ` · ${t("관리자")}` : ""}</td>
      <td class="act">
        ${wait ? `<button class="btn sm red" data-ok="${h(u.email)}" type="button">${ht("승인")}</button>
          <button class="btn sm" data-no="${h(u.email)}" type="button">${ht("거절")}</button>` : ""}
        ${u.status === "approved" && !admin ? `<button class="btn sm" data-no="${h(u.email)}" type="button">${ht("사용 중지")}</button>` : ""}
        ${u.status === "rejected" ? `<button class="btn sm red" data-ok="${h(u.email)}" type="button">${ht("승인")}</button>` : ""}
      </td>
    </tr>`;
  }).join("") || `<tr><td colspan="5">${ht("아직 가입한 사람이 없습니다.")}</td></tr>`;
  return `
    <div class="head compact-head"><div><h1>${ht("가입 승인")}</h1><p>${ht("회원가입한 직원을 여기서 승인한 뒤에만 운영 폴더를 볼 수 있습니다.")}</p></div>
      <button class="btn sm" id="members-refresh" type="button">${ht("목록 새로고침")}</button></div>
    <section class="panel">
      <table class="rows"><thead><tr><th>${ht("이름")}</th><th>${ht("아이디")}</th><th>${ht("부서")}</th><th>${ht("상태")}</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table>
    </section>`;
}

function bindMembers() {
  document.getElementById("members-refresh")?.addEventListener("click", async () => {
    await pullUsers();
    render();
  });
  const act = async (email, status) => {
    const res = await setUserStatus(email, status);
    if (!res.ok) { alert(t(res.message)); return; }
    render();
  };
  root.querySelectorAll("[data-ok]").forEach((b) => {
    b.onclick = () => act(b.dataset.ok, "approved");
  });
  root.querySelectorAll("[data-no]").forEach((b) => {
    b.onclick = () => act(b.dataset.no, "rejected");
  });
}

function recordsView() {
  const mods = recordMods();
  const mod = mods.find((m) => m.id === manageId) || mods[0];
  if (!mod) {
    return `<div class="head"><div><h1>${ht("기록 관리")}</h1><p>${ht("수정할 폴더가 없습니다.")}</p></div></div>`;
  }
  const rows = (state.records[mod.id] || []).map((r) => `
    <tr>
      <td><button class="btn sm" data-edit="${r.id}" type="button">${ht("수정")}</button>
          <button class="btn sm" data-del="${r.id}" type="button">${ht("삭제")}</button></td>
      <td>${h(recDate(r, mod.type))}</td>
      <td>${h(r.item || r.partName || r.customer || r.id)}</td>
      <td>${h(r.status)}</td>
    </tr>`).join("");
  return `
    <div class="head"><div><h1>${ht("기록 관리")}</h1><p>${ht("폴더를 고른 뒤 기록을 수정하거나 삭제합니다.")}</p></div></div>
    <section class="panel">
      <div class="bar"><b>${ht("폴더")}</b>
        <select id="pick">${mods.map((m) => `<option value="${m.id}" ${m.id === mod.id ? "selected" : ""}>${h(t(m.title))}</option>`).join("")}</select>
      </div>
      <table class="rows"><thead><tr><th></th><th>${ht("날짜")}</th><th>${ht("항목")}</th><th>${ht("상태")}</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4">${ht("이 폴더에 기록이 없습니다.")}</td></tr>`}</tbody></table>
    </section>`;
}

function bindRecords(mod) {
  const pick = document.getElementById("pick");
  if (pick) pick.onchange = (e) => { manageId = e.target.value; render(); };
  if (mod) bindRows(mod);
}

function moduleView(mod, date, extra) {
  if (mod.type === "records") return recordsView();
  if (mod.type === "chat") return chatView(state, h, date);
  if (!date) return dateIndex(mod);
  if (mod.type === "climate" || mod.type === "lab-climate") {
    if (extra === "map") return climateView(mod, monthKey(date) || date);
    return monthSheetView(mod, monthKey(date) || date);
  }
  if (mod.type === "five-s" || mod.type === "lab-5s") return monthSheetView(mod, monthKey(date) || date);
  if (mod.type === "inbound") {
    const ym = monthKey(date) || date;
    padInboundRows(mod, ym);
    return inboundMonthView(mod, ym);
  }
  if (mod.type === "equipment") return extra ? eqPrintView(mod, date, extra) : eqView(mod, date);
  if (mod.type === "mastercam") return camView(mod, date);
  if (isSheetMod(mod) && extra) return printDocView(mod, date, extra);
  return dayView(mod, date);
}

function dateIndex(mod) {
  const month = isMonthFolder(mod);
  const folders = datesOf(mod).map((d) => `
    <a class="date-line" href="#/${mod.id}/${d}">
      <strong>${h(mod.type === "inbound" ? inboundMonthTitle(d) : month ? monthLabel(d) : d)}</strong>
      <span>${count(mod, d)}</span>
    </a>`).join("");
  return `
    <div class="head compact-head"><div><h1>${h(t(mod.title))}</h1><p>${h(t(mod.desc))}</p></div><a class="btn ghost sm" href="#/home">${ht("운영 폴더")}</a></div>
    <section class="panel dates-panel">
      <div class="bar compact-bar"><b>${ht(month ? "월" : "날짜")}</b>
        <button class="btn sm red" id="add-date" type="button">${ht(month ? "월 추가" : "날짜 추가")}</button></div>
      <div class="date-list">${folders}</div>
    </section>`;
}

function count(mod, date) {
  if (isMonthMod(mod)) {
    const ym = monthKey(date) || date;
    const n = daysInMonth(ym);
    const { groups, key } = monthItems(mod);
    const items = flattenChecks(groups);
    let days = 0;
    for (let d = 1; d <= n; d++) {
      const iso = isoDay(ym, d);
      if (items.some((i) => monthChecked(mod, key, iso, i.id))) days += 1;
    }
    return t("{n}일 점검", { n: days });
  }
  if (mod.type === "inbound") return t("{n}건", { n: rowsOn(mod, date).filter(inboundUsed).length });
  if (mod.type === "mastercam") return t("{n}개 파일", { n: (state.cam.files || []).filter((f) => f.date === date).length });
  if (mod.type === "equipment") return t("{n}대", { n: MACHINES.length });
  return t("{n}건", { n: rowsOn(mod, date).length });
}

function dayView(mod, date) {
  const rows = rowsOn(mod, date);
  return `
    <div class="head compact-head"><div><h1>${h(t(mod.title))}</h1><p>${h(date)}</p></div>
      <a class="btn ghost sm" href="#/${mod.id}">${ht(isMonthFolder(mod) ? "월 목록" : "날짜")}</a></div>
    <section class="panel">
      <div class="bar compact-bar"><b>${h(date)}</b>
        <button class="btn sm red" id="add-row" type="button">${ht("추가")}</button></div>
      ${tableOf(mod, rows, date)}
    </section>`;
}

function inboundUsed(r) {
  return Boolean(
    String(r.supplier || r.note || "").trim()
    || String(r.item || "").trim()
    || String(r.size || "").trim()
    || r.qty
  );
}

function padInboundRows(mod, ym) {
  let n = rowsOn(mod, ym).length;
  let added = 0;
  while (n < 22) {
    addBlank(mod, ym);
    n += 1;
    added += 1;
  }
  if (added) persist();
}

function inboundCell(row, key, type, placeholder) {
  const val = row[key] ?? "";
  return `<input data-in="${h(row.id)}" data-k="${key}" type="${type}" value="${h(val)}"${placeholder ? ` placeholder="${h(placeholder)}"` : ""}>`;
}

function inboundMonthTitle(ym) {
  const m = Number(String(ym).slice(5, 7));
  return t("{m}월 원자재 입고", { m });
}

function inboundMonthView(mod, ym) {
  const month = monthKey(ym) || ym;
  const year = String(month).slice(0, 4);
  const rows = rowsOn(mod, month);
  const body = rows.map((r) => `<tr>
      <td class="col-date">${inboundCell(r, "date", "date")}</td>
      <td class="col-vendor">${inboundCell(r, "supplier", "text", t("업체"))}</td>
      <td class="col-item">${inboundCell(r, "item", "text")}</td>
      <td class="col-qty">${inboundCell(r, "qty", "number")}</td>
      <td class="col-size">${inboundCell(r, "size", "text")}</td>
      <td class="act no-print"><button class="btn sm" data-del="${r.id}" type="button">${ht("삭제")}</button></td>
    </tr>`).join("");
  return `
    <div class="print-page">
      <div class="a4-tools no-print">
        <a class="btn ghost" href="#/${mod.id}">${ht("월 목록")}</a>
        <button class="btn" id="add-row" type="button">${ht("가로줄 추가")}</button>
        <button class="btn red" id="qa-print" type="button">${ht("인쇄")}</button>
      </div>
      <div class="a4-wrap page">
        <article class="a4-sheet inbound-sheet">
          ${a4Head(inboundMonthTitle(month), year, true)}
          <div class="a4-grow month-scroll">
            <table class="month-grid inbound-month">
              <thead><tr>
                <th class="col-date">${ht("날짜")}</th>
                <th class="col-vendor">${ht("업체")}</th>
                <th class="col-item">${ht("자재 품명")}</th>
                <th class="col-qty">${ht("개수")}</th>
                <th class="col-size">${ht("자재 사이즈")}</th>
                <th class="no-print"></th>
              </tr></thead>
              <tbody>${body}</tbody>
            </table>
          </div>
          <div class="a4-sign">
            <span>${ht("입고")}</span><span>${ht("확인")}</span><span>${ht("승인")}</span>
          </div>
        </article>
      </div>
    </div>`;
}

function processProgress(plan, done) {
  const p = Number(plan) || 0;
  const d = Number(done) || 0;
  if (p <= 0) return d > 0 ? 100 : 0;
  return Math.min(100, Math.round((d / p) * 100));
}

function tableOf(mod, rows, date) {
  if (mod.type === "quality") return qualitySheet(rows, date, mod.id);
  if (mod.type === "delivery") return deliverySheet(rows, date, mod.id);
  const fields = fieldsFor(mod.type, true);
  const extra = (mod.type === "quality" || mod.type === "defect" || mod.type === "process") ? "<th>사진</th>" : "";
  const body = rows.map((r) => {
    const cells = fields.map((f) => {
      if (f.key === "progress") return `<td>${h(processProgress(r.planQty, r.doneQty))}%</td>`;
      return `<td>${h(r[f.key])}</td>`;
    }).join("");
    const pics = (mod.type === "quality" || mod.type === "defect" || mod.type === "process")
      ? `<td>${(r.photos || []).length ? (r.photos || []).map((s) => `<img class="thumb" src="${s}" alt="">`).join("") : "-"}</td>`
      : "";
    return `<tr><td class="act"><a class="btn sm" href="#/${mod.id}/${date}/${r.id}">${ht("수정")}</a>
        <a class="btn sm red" href="#/${mod.id}/${date}/${r.id}">${ht("보기·인쇄")}</a></td>${cells}${pics}</tr>`;
  }).join("");
  const cols = fields.length + (extra ? 1 : 0) + 1;
  return `<p class="mute pad">${ht("수정 또는 보기·인쇄를 누르면 A4 표에서 바로 고칠 수 있습니다.")}</p>
    <div class="scroll"><table class="rows"><thead><tr><th></th>${fields.map((f) => `<th>${h(t(f.label))}</th>`).join("")}${extra}</tr></thead>
    <tbody>${body || `<tr><td colspan="${cols}">${ht("이 날짜 기록이 없습니다.")}</td></tr>`}</tbody></table></div>`;
}

function qualitySheet(rows, date, modId) {
  const body = rows.map((r) => `<tr class="qa-row">
      <td class="act"><a class="btn sm" href="#/${modId}/${date}/${r.id}">수정</a>
        <a class="btn sm red" href="#/${modId}/${date}/${r.id}">보기·인쇄</a></td>
      <td>${h(r.partNo)}</td>
      <td>${h(r.partName)}</td>
      <td>${h(r.lot)}</td>
      <td>${h(r.millCompany)}</td>
      <td>${h(r.customer)}</td>
      <td>${h(r.qtyIn ?? "")}</td>
      <td>${h(r.qtyOut ?? "")}</td>
      <td>${h(r.status)}</td>
    </tr>`).join("");
  return `<p class="mute pad">표 페이지에서 검사 내용을 고치고 인쇄할 수 있습니다.</p>
    <div class="scroll"><table class="rows">
    <thead><tr><th></th><th>품번</th><th>품명</th><th>LOT</th><th>가공 회사</th><th>납품처</th><th>품질실 입고</th><th>납품 출고</th><th>판정</th></tr></thead>
    <tbody>${body || `<tr><td colspan="9">이 날짜 기록이 없습니다. 추가로 검사 내용을 넣으세요.</td></tr>`}</tbody>
  </table></div>`;
}

function deliverySheet(rows, date, modId) {
  const body = rows.map((r) => `<tr class="qa-row">
      <td class="act"><a class="btn sm" href="#/${modId}/${date}/${r.id}">수정</a>
        <a class="btn sm red" href="#/${modId}/${date}/${r.id}">보기·인쇄</a></td>
      <td>${h(r.customer)}</td>
      <td>${h(r.partNo)}</td>
      <td>${h(r.partName)}</td>
      <td>${h(r.lot)}</td>
      <td>${h(r.qty ?? "")}</td>
      <td>${h(r.status)}</td>
    </tr>`).join("");
  return `<p class="mute pad">표 페이지에서 납품 내용을 고치고 인쇄할 수 있습니다.</p>
    <div class="scroll"><table class="rows">
    <thead><tr><th></th><th>납품 회사</th><th>품번</th><th>품명</th><th>LOT</th><th>수량</th><th>상태</th></tr></thead>
    <tbody>${body || `<tr><td colspan="7">이 날짜 기록이 없습니다. 추가로 납품 내용을 넣으세요.</td></tr>`}</tbody>
  </table></div>`;
}

function fi(name, value, type = "text") {
  return `<input name="${name}" type="${type}" value="${h(value ?? "")}">`;
}

function fs(name, value, options) {
  return `<select name="${name}">${(options || []).map((o) => `<option value="${h(o)}" ${o === value ? "selected" : ""}>${h(t(o))}</option>`).join("")}</select>`;
}

function ft(name, value) {
  return `<textarea name="${name}" class="a4-note">${h(value ?? "")}</textarea>`;
}

function fc(f, row) {
  if (f.key === "progress") return `<span data-progress>${h(processProgress(row.planQty, row.doneQty))}%</span>`;
  if (f.key === "customer") return fs("customer", row.customer, CUSTOMERS);
  if (f.type === "select") return fs(f.key, row[f.key], f.options);
  if (f.type === "textarea") return ft(f.key, row[f.key]);
  const type = f.type === "number" ? "number" : f.type === "date" ? "date" : "text";
  return fi(f.key, row[f.key], type);
}

function printDocView(mod, date, id) {
  const row = (state.records[mod.id] || []).find((x) => x.id === id);
  if (!row) return mod.type === "inbound" ? inboundMonthView(mod, monthKey(date) || date) : dayView(mod, date);
  const photos = mod.type === "quality" || mod.type === "defect" || mod.type === "process";
  const back = mod.type === "inbound" ? (monthKey(row.date) || monthKey(date) || date) : date;
  return `
    <div class="print-page">
      <div class="a4-tools no-print">
        <a class="btn ghost" href="#/${mod.id}/${back}">목록</a>
        ${photos ? `<label class="btn">사진<input id="sheet-photos" type="file" accept="image/*" multiple hidden></label>` : ""}
        <button class="btn red" id="qa-print" type="button">인쇄</button>
      </div>
      <div class="a4-wrap page"><form id="sheet-form">${a4For(mod, row)}</form></div>
    </div>`;
}

function a4For(mod, row) {
  if (mod.type === "quality") return qualityA4(row);
  if (mod.type === "delivery") return deliveryA4(row);
  if (mod.type === "process") return processA4(row);
  if (mod.type === "defect") return defectA4(row);
  if (mod.type === "inventory") return inventoryA4(row);
  return genericA4(mod, row);
}

function a4Head(title, date, ready = false) {
  return `<header class="a4-head">
          <div><b>DOM</b><span>${ht("디오엠")}</span></div>
          <h1>${h(ready ? title : t(title))}</h1>
          <p>A4 · ${h(date || "")}</p>
        </header>`;
}

function qualityA4(r) {
  const times = [1, 2, 3, 4, 5];
  const axis = (name, specKey, key) => `
    <tr>
      <th>${name}</th>
      <td>${fi(specKey, r[specKey])}</td>
      ${times.map((n) => `<td>${fi(`${key}${n}`, r[`${key}${n}`], "number")}</td>`).join("")}
    </tr>`;
  const pics = (r.photos || []).length
    ? `<div class="a4-photos">${(r.photos || []).map((s) => `<img src="${s}" alt="">`).join("")}</div>`
    : `<p class="a4-empty">사진 없음 · 위 ‘사진’으로 첨부</p>`;
  return `
      <article class="a4-sheet">
        ${a4Head("품질 검사 성적서", r.date)}
        <table class="a4-meta">
          <tr><th>가공 회사</th><td>${fs("millCompany", r.millCompany, MILL_SHOPS)}</td><th>납품처</th><td>${fs("customer", r.customer, CUSTOMERS)}</td></tr>
          <tr><th>품번</th><td>${fi("partNo", r.partNo)}</td><th>품명</th><td>${fi("partName", r.partName)}</td></tr>
          <tr><th>LOT 번호</th><td>${fi("lot", r.lot)}</td><th>검사일</th><td>${fi("date", r.date, "date")}</td></tr>
          <tr><th>품질실 입고</th><td>${fi("qtyIn", r.qtyIn, "number")}</td><th>납품 출고</th><td>${fi("qtyOut", r.qtyOut, "number")}</td></tr>
          <tr><th>검사자</th><td>${fi("inspector", r.inspector)}</td><th>판정</th><td>${fs("status", r.status, ["합격", "불합격", "보류"])}</td></tr>
        </table>
        <h2>치수 측정 (mm)</h2>
        <table class="a4-meas">
          <thead><tr><th>축</th><th>기준</th>${times.map((n) => `<th>${n}회</th>`).join("")}</tr></thead>
          <tbody>
            ${axis("X", "specX", "x")}
            ${axis("Y", "specY", "y")}
            ${axis("Z", "specZ", "z")}
          </tbody>
        </table>
        <h2>사진 · 외관</h2>
        <div class="a4-grow">${pics}</div>
        <div class="a4-sign">
          <span>작성</span><span>검토</span><span>승인</span>
        </div>
      </article>`;
}

function deliveryA4(r) {
  return `
      <article class="a4-sheet">
        ${a4Head("납품 명세서", r.date)}
        <table class="a4-meta">
          <tr><th>납품 회사</th><td>${fs("customer", r.customer, CUSTOMERS)}</td><th>납품일</th><td>${fi("date", r.date, "date")}</td></tr>
          <tr><th>품번</th><td>${fi("partNo", r.partNo)}</td><th>품명</th><td>${fi("partName", r.partName)}</td></tr>
          <tr><th>LOT 번호</th><td>${fi("lot", r.lot)}</td><th>납품 수량</th><td>${fi("qty", r.qty, "number")}</td></tr>
          <tr><th>상태</th><td>${fs("status", r.status, ["예정", "출하준비", "출하완료"])}</td><th></th><td></td></tr>
        </table>
        <h2>납품 내역</h2>
        <div class="a4-grow">
          <table class="a4-meas">
            <thead><tr><th>납품 회사</th><th>품번</th><th>품명</th><th>LOT</th><th>수량</th><th>상태</th></tr></thead>
            <tbody>
              <tr>
                <td>${h(r.customer)}</td>
                <td>${h(r.partNo)}</td>
                <td>${h(r.partName)}</td>
                <td>${h(r.lot)}</td>
                <td>${h(r.qty ?? "")}</td>
                <td>${h(r.status)}</td>
              </tr>
              <tr><td colspan="6" style="text-align:left;vertical-align:top">${ft("note", r.note)}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="a4-sign">
          <span>담당</span><span>출하</span><span>인수</span>
        </div>
      </article>`;
}

function processStamp(r) {
  const name = (key, fallback) => fi(key, r[key] || fallback || "");
  const day = (key) => fi(key, r[key] || "", "date");
  return `<table class="a4-stamp">
          <thead>
            <tr>
              <th class="stamp-side">결재</th>
              <th>작업자</th>
              <th>확인</th>
              <th>승인</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th class="stamp-side">날인</th>
              <td class="stamp-ink"><span>인</span></td>
              <td class="stamp-ink"><span>인</span></td>
              <td class="stamp-ink"><span>인</span></td>
            </tr>
            <tr>
              <th class="stamp-side">성명</th>
              <td>${name("signWorker", r.owner)}</td>
              <td>${name("signCheck")}</td>
              <td>${name("signApprove")}</td>
            </tr>
            <tr>
              <th class="stamp-side">일자</th>
              <td>${day("signWorkerDate")}</td>
              <td>${day("signCheckDate")}</td>
              <td>${day("signApproveDate")}</td>
            </tr>
          </tbody>
        </table>`;
}

function processPhotos(r) {
  const pics = r.photos || [];
  if (!pics.length) {
    return `<p class="a4-empty">작업·제품 사진<br>위 ‘사진’으로 첨부</p>`;
  }
  const shown = pics.slice(0, 4);
  const cls = shown.length === 1 ? "one" : shown.length === 2 ? "two" : "many";
  return `<div class="a4-photos ${cls}">${shown.map((s) => `<img src="${s}" alt="">`).join("")}</div>`;
}

function processA4(r) {
  return `
      <article class="a4-sheet process-a4">
        <header class="a4-head a4-head-corp">
          <div>
            <b>DOM</b><span>${ht("디오엠")}</span>
            <h1>가공 작업 현황</h1>
            <p>FORM-PR-01 · A4 · ${h(r.workDate || r.startDate || "")}</p>
          </div>
          ${processStamp(r)}
        </header>
        <div class="a4-process-body">
          <div class="a4-process-main">
            <table class="a4-meta">
              <tr><th>품번</th><td>${fi("partNo", r.partNo)}</td><th>품명</th><td>${fi("partName", r.partName)}</td></tr>
              <tr><th>LOT 번호</th><td>${fi("lot", r.lot)}</td><th>라인</th><td>${fi("line", r.line)}</td></tr>
              <tr><th>작업지시</th><td>${fi("wo", r.wo)}</td><th>담당</th><td>${fi("owner", r.owner)}</td></tr>
              <tr><th>가공 시작일</th><td>${fi("startDate", r.startDate, "date")}</td><th>최근 작업일</th><td>${fi("workDate", r.workDate, "date")}</td></tr>
              <tr><th>완료일</th><td>${fi("endDate", r.endDate, "date")}</td><th>상태</th><td>${fi("status", r.status)}</td></tr>
              <tr><th>계획 수량</th><td>${fi("planQty", r.planQty, "number")}</td><th>완료 수량</th><td>${fi("doneQty", r.doneQty, "number")}</td></tr>
              <tr><th>진행률</th><td colspan="3">${fc({ key: "progress" }, r)}</td></tr>
              <tr class="detail-row"><th>완료 상세</th><td colspan="3">${ft("detail", r.detail)}</td></tr>
            </table>
          </div>
          <aside class="a4-process-photo">
            <h2>작업 · 제품 사진</h2>
            ${processPhotos(r)}
          </aside>
        </div>
      </article>`;
}

function defectA4(r) {
  const pics = (r.photos || []).length
    ? `<div class="a4-photos">${(r.photos || []).map((s) => `<img src="${s}" alt="">`).join("")}</div>`
    : `<p class="a4-empty">사진 없음 · 위 ‘사진’으로 첨부</p>`;
  return `
      <article class="a4-sheet">
        ${a4Head("불량 발생 보고서", r.date)}
        <table class="a4-meta">
          <tr><th>발생일</th><td>${fi("date", r.date, "date")}</td><th>상태</th><td>${fi("status", r.status)}</td></tr>
          <tr><th>품번</th><td>${fi("partNo", r.partNo)}</td><th>품명</th><td>${fi("partName", r.partName)}</td></tr>
          <tr><th>LOT 번호</th><td>${fi("lot", r.lot)}</td><th>수량</th><td>${fi("qty", r.qty, "number")}</td></tr>
          <tr><th>불량 유형</th><td colspan="3">${fi("type", r.type)}</td></tr>
        </table>
        <h2>수정 조치 · 재발 방지</h2>
        <table class="a4-meta">
          <tr><th>수정 조치</th><td colspan="3">${ft("action", r.action)}</td></tr>
          <tr><th>재발 방지</th><td colspan="3">${ft("prevent", r.prevent)}</td></tr>
        </table>
        <h2>사진</h2>
        <div class="a4-grow">${pics}</div>
        <div class="a4-sign">
          <span>발견</span><span>조치</span><span>승인</span>
        </div>
      </article>`;
}

function inventoryA4(r) {
  return `
      <article class="a4-sheet">
        ${a4Head("재고 현황표", r.date)}
        <table class="a4-meta">
          <tr><th>기준일</th><td>${fi("date", r.date, "date")}</td><th>구분</th><td>${fi("kind", r.kind)}</td></tr>
          <tr><th>품명</th><td>${fi("item", r.item)}</td><th>LOT 번호</th><td>${fi("lot", r.lot)}</td></tr>
          <tr><th>재고 개수</th><td>${fi("qty", r.qty, "number")}</td><th>위치</th><td>${fi("location", r.location)}</td></tr>
          <tr><th>상태</th><td colspan="3">${fi("status", r.status)}</td></tr>
        </table>
        <h2>실사 · 비고</h2>
        <div class="a4-grow">
          <table class="a4-meas">
            <thead><tr><th>구분</th><th>내용</th><th style="width:28mm">수량</th></tr></thead>
            <tbody>
              <tr><th>장부 재고</th><td>${h(r.item)} · ${h(r.lot)}</td><td>${h(r.qty ?? "")}</td></tr>
              <tr><th>실사 재고</th><td></td><td></td></tr>
              <tr><th>차이</th><td></td><td></td></tr>
              <tr><th>원인</th><td colspan="2"></td></tr>
              <tr><th>조치</th><td colspan="2"></td></tr>
            </tbody>
          </table>
        </div>
        <div class="a4-sign">
          <span>담당</span><span>확인</span><span>승인</span>
        </div>
      </article>`;
}

function genericA4(mod, r) {
  const fields = fieldsFor(mod.type).filter((f) => f.key !== "progress");
  const pairs = [];
  for (let i = 0; i < fields.length; i += 2) {
    const a = fields[i];
    const b = fields[i + 1];
    pairs.push(`<tr><th>${h(a.label)}</th><td>${fc(a, r)}</td>${b ? `<th>${h(b.label)}</th><td>${fc(b, r)}</td>` : `<th></th><td></td>`}</tr>`);
  }
  return `
      <article class="a4-sheet">
        ${a4Head(mod.title, r.date)}
        <table class="a4-meta">${pairs.join("")}</table>
        <div class="a4-grow"><p class="a4-empty">추가 기재 란</p></div>
        <div class="a4-sign">
          <span>작성</span><span>확인</span><span>승인</span>
        </div>
      </article>`;
}

function climateBag(mod) {
  if ((mod?.type || mod) === "lab-climate") {
    if (!state.labClimate) state.labClimate = { rooms: [], points: [], logs: {}, checks: {} };
    if (!state.labClimate.checks) state.labClimate.checks = {};
    return state.labClimate;
  }
  if (!state.climate.checks) state.climate.checks = {};
  return state.climate;
}

function monthItems(mod) {
  if (mod.type === "five-s") return { groups: FIVE_S_SHOP, key: "shop" };
  if (mod.type === "lab-5s") return { groups: FIVE_S_LAB, key: "lab" };
  const bag = climateBag(mod);
  return {
    key: "climate",
    groups: [{
      group: "측정 위치",
      items: (bag.points || []).map((p) => ({ id: p.id, label: `${p.id} ${p.name}` })),
    }],
  };
}

function monthChecked(mod, key, iso, id) {
  if (key === "shop" || key === "lab") return Boolean(state.fiveS.dates[iso]?.[key]?.[id]);
  const bag = climateBag(mod);
  if (bag.checks?.[iso]?.[id]) return true;
  return Boolean((bag.logs?.[iso] || []).some((x) => x.pointId === id));
}

function setMonthCheck(mod, key, iso, id, on) {
  if (key === "shop" || key === "lab") {
    if (!state.fiveS.dates[iso]) state.fiveS.dates[iso] = { shop: {}, lab: {} };
    if (!state.fiveS.dates[iso][key]) state.fiveS.dates[iso][key] = {};
    state.fiveS.dates[iso][key][id] = on;
    return;
  }
  const bag = climateBag(mod);
  if (!bag.checks) bag.checks = {};
  if (!bag.checks[iso]) bag.checks[iso] = {};
  bag.checks[iso][id] = on;
}

function monthSheetView(mod, ym) {
  const month = monthKey(ym) || ym;
  const n = daysInMonth(month);
  const days = Array.from({ length: n }, (_, i) => i + 1);
  const { groups, key } = monthItems(mod);
  const climate = mod.type === "climate" || mod.type === "lab-climate";
  const heads = days.map((d) => `<th>${d}</th>`).join("");
  const body = groups.map((g) => g.items.map((item, idx) => {
    const cells = days.map((d) => {
      const iso = isoDay(month, d);
      const on = monthChecked(mod, key, iso, item.id);
      return `<td class="chk"><input type="checkbox" data-iso="${iso}" data-k="${key}" data-id="${item.id}" ${on ? "checked" : ""}><span class="print-mark">${on ? "✓" : ""}</span></td>`;
    }).join("");
    return `<tr>
      ${idx === 0 ? `<th rowspan="${g.items.length}">${h(t(g.group))}</th>` : ""}
      <td class="item">${h(t(item.label))}</td>
      ${cells}
    </tr>`;
  }).join("")).join("");
  return `
    <div class="print-page">
      <div class="a4-tools no-print">
        <a class="btn ghost" href="#/${mod.id}">${ht("월 목록")}</a>
        ${climate ? `<a class="btn" href="#/${mod.id}/${month}/map">${ht("평면도")}</a>` : ""}
        <button class="btn red" id="qa-print" type="button">${ht("인쇄")}</button>
      </div>
      <div class="a4-wrap page">
        <article class="a4-sheet month-sheet">
          ${a4Head(mod.title, monthLabel(month))}
          <div class="a4-grow month-scroll">
            <table class="month-grid">
              <thead><tr><th>${ht("구분")}</th><th>${ht("점검 항목")}</th>${heads}</tr></thead>
              <tbody>${body}</tbody>
            </table>
          </div>
          <div class="a4-sign">
            <span>${ht("점검자")}</span><span>${ht("확인")}</span><span>${ht("승인")}</span>
          </div>
        </article>
      </div>
    </div>`;
}

function climateView(mod, date) {
  const bag = climateBag(mod);
  const rooms = (bag.rooms || []).map((r) => `<button class="room ${r.kind}" data-room="${r.id}" type="button" style="left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%">${h(r.name)}</button>`).join("");
  const pins = (bag.points || []).map((p) => `<button class="pin ok" data-pin="${p.id}" type="button" style="left:${p.x}%;top:${p.y}%">${h(p.id)}</button>`).join("");
  const lab = mod.type === "lab-climate";
  const ym = monthKey(date) || date;
  return `
    <div class="head"><div><h1>${h(mod.title)}</h1><p>${h(monthLabel(ym))} 평면도 · 구역을 끌어서 배치를 바꿉니다.</p></div>
      <div class="no-print"><a class="btn ghost" href="#/${mod.id}/${ym}">월간 표</a>
        <a class="btn ghost" href="#/${mod.id}">월 목록</a></div></div>
    <section class="panel">
      <div class="bar"><b>${lab ? "검사실 평면도" : "현장 평면도"}</b>
        <button class="btn sm" id="add-room" type="button">구역 추가</button>
        ${lab ? `<button class="btn sm" id="add-p" type="button">측정 위치 추가</button>` : `<button class="btn sm" id="add-m" type="button">기계 추가</button>`}</div>
      <div class="plan" id="plan">${rooms}${pins}</div>
      <p class="mute pad">${lab ? "검사대·정반·시료 위치를 드래그하세요." : "기계·통로·검사실을 드래그하세요."} 점검은 월간 표에서 체크합니다.</p>
    </section>`;
}

function eqView(mod, date) {
  const log = state.equipment[date] || {};
  const photos = state.eqPhotos || {};
  const groups = [...new Set(MACHINES.map((m) => m.group))];
  const blocks = groups.map((g) => {
    const lines = MACHINES.filter((m) => m.group === g).map((m) => {
      const row = log[m.id] || { checks: {} };
      const done = CNC_CHECKS.filter((_, i) => row.checks[i]).length;
      const pic = photos[m.id]
        ? `<img class="eq-thumb" src="${photos[m.id]}" alt="">`
        : `<span class="eq-thumb empty">사진</span>`;
      return `<a class="date-line eq-line" href="#/${mod.id}/${date}/${m.id}">
        ${pic}
        <strong>${h(m.name)}</strong>
        <span>${done}/${CNC_CHECKS.length} · 보기·인쇄</span>
      </a>`;
    }).join("");
    return `<div class="bar compact-bar"><b>${h(g)}</b></div><div class="date-list">${lines}</div>`;
  }).join("");
  return `
    <div class="head compact-head"><div><h1>${h(mod.title)}</h1><p>${h(date)} · 보기·인쇄를 누르면 점검표 페이지가 열립니다.</p></div>
      <a class="btn ghost sm" href="#/${mod.id}">날짜</a></div>
    <section class="panel dates-panel">${blocks}</section>`;
}

function eqPrintView(mod, date, id) {
  const machine = MACHINES.find((m) => m.id === id);
  if (!machine) return eqView(mod, date);
  return `
    <div class="print-page">
      <div class="a4-tools no-print">
        <a class="btn ghost" href="#/${mod.id}/${date}">목록</a>
        <label class="btn">기계 사진<input id="eq-photo" type="file" accept="image/*" hidden></label>
        <button class="btn red" id="qa-print" type="button">인쇄</button>
      </div>
      <div class="a4-wrap page">${eqA4(date, machine)}</div>
    </div>`;
}

function eqA4(date, machine) {
  if (!state.eqPhotos) state.eqPhotos = {};
  if (!state.equipment[date]) state.equipment[date] = {};
  const row = state.equipment[date][machine.id] || { checks: {}, inspector: "" };
  const photo = state.eqPhotos[machine.id];
  const body = CNC_CHECKS.map((c, i) => `<tr>
      <td>${i + 1}</td>
      <td>${h(t(c))}</td>
      <td class="chk"><input type="checkbox" data-eq="${machine.id}" data-c="${i}" ${row.checks[i] ? "checked" : ""}><span class="print-mark">${row.checks[i] ? "✓" : ""}</span></td>
    </tr>`).join("");
  const done = CNC_CHECKS.filter((_, i) => row.checks[i]).length;
  return `
      <article class="a4-sheet">
        ${photo ? `<img class="a4-machine" src="${photo}" alt="${h(machine.name)}">` : `<div class="a4-machine empty">기계 사진을 위에 ‘기계 사진’으로 넣으세요</div>`}
        <header class="a4-head">
          <div><b>DOM</b><span>디오엠 정밀 가공</span></div>
          <h1>설비 일일 점검표</h1>
          <p>A4 · ${h(date)}</p>
        </header>
        <table class="a4-meta">
          <tr><th>설비</th><td>${h(machine.name)}</td><th>구분</th><td>${h(machine.group)}</td></tr>
          <tr><th>점검일</th><td>${h(date)}</td><th>점검 현황</th><td>${done} / ${CNC_CHECKS.length}</td></tr>
          <tr><th>점검자</th><td colspan="3"><input type="text" data-ins="${machine.id}" value="${h(row.inspector)}" placeholder="이름"></td></tr>
        </table>
        <h2>점검 항목</h2>
        <div class="a4-grow">
        <table class="a4-meas">
          <thead><tr><th style="width:12mm">번호</th><th>점검 항목</th><th style="width:18mm">확인</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
        </div>
        <div class="a4-sign">
          <span>점검자</span><span>확인</span><span>승인</span>
        </div>
      </article>`;
}

function camView(mod, date) {
  const folder = state.cam.folders.find((f) => f.id === camFolder) || state.cam.folders[0];
  const kids = state.cam.folders.filter((f) => f.parent === folder.id);
  const files = state.cam.files.filter((f) => f.folderId === folder.id && f.date === date);
  const jobs = (state.cam.jobs || []).filter((j) => j.date === date);
  const jobRows = jobs.map((j) => `<tr>
    <td class="act"><button class="btn sm" data-job="${j.id}" type="button">수정</button></td>
    <td>${h(j.name)}</td><td>${h(j.partName)}</td>
    <td>${(j.tools || []).join(", ") || "—"}</td>
    <td>${j.cutMm} mm</td><td>${j.timeMin} 분</td>
    <td>${j.fromNc ? "NC 해석" : "추정 경로"}</td>
  </tr>`).join("");
  return `<div class="head"><div><h1>${h(mod.title)}</h1><p>${h(date)}</p></div>
    <a class="btn red sm" href="./cam-lab.html?v=31">가공 프로그램</a></div>
    <section class="panel">
      <div class="bar">${folder.parent ? `<button class="btn sm" id="up" type="button">상위</button>` : ""}
        <button class="btn sm" id="nf" type="button">폴더</button>
        <button class="btn sm" id="cam-link" type="button">${state.cam.watchName ? "폴더 다시 연결" : "Mastercam 저장 폴더 연결"}</button>
        <label class="btn sm red">올리기<input id="upl" type="file" multiple hidden></label></div>
      <p class="mute pad">${state.cam.watchName
    ? `연결됨: ${h(state.cam.watchName)} · Mastercam에서 가공 후 저장하면 이 날짜 폴더로 들어옵니다. 포털을 켜 두세요.`
    : "Mastercam이 NC를 저장하는 폴더를 한 번 연결하세요. 연결 뒤 새로 저장한 프로그램만 자동으로 들어옵니다."}</p>
      <div class="grid pad">
        ${kids.map((f) => `<button class="folder small" data-open="${f.id}" type="button"><h2>${h(f.name)}</h2></button>`).join("")}
        ${files.map((f) => `<div class="file"><b>${h(f.name)}</b><button class="btn sm" data-dl="${f.id}" type="button">받기</button></div>`).join("")}
      </div>
    </section>
    <section class="panel">
      <div class="bar"><b>가공 공정 데이터</b></div>
      <div class="scroll"><table class="rows"><thead><tr><th></th><th>프로그램</th><th>품명</th><th>공구</th><th>절삭</th><th>예상 시간</th><th>방식</th></tr></thead>
      <tbody>${jobRows || `<tr><td colspan="7">이 날짜에 올린 프로그램이 없습니다.</td></tr>`}</tbody></table></div>
    </section>`;
}

function bindModule(mod, date, extra) {
  if (mod.type === "records") {
    bindRecords(recordMods().find((m) => m.id === manageId) || recordMods()[0]);
    return;
  }
  if (mod.type === "chat") {
    bindChat(state, persist, render, date);
    return;
  }
  const month = isMonthFolder(mod);
  document.getElementById("add-date")?.addEventListener("click", () => form(
    month ? "월 폴더" : "날짜 폴더",
    [{ key: "date", label: month ? "연월" : "날짜", type: month ? "month" : "date" }],
    { date: month ? thisMonth() : todayISO() },
    (v) => {
      const key = month ? (monthKey(v.date) || v.date) : v.date;
      remember(mod.id, key); persist(); location.hash = `#/${mod.id}/${key}`; render();
    }
  ));
  if (!date) return;
  remember(mod.id, date); persist();
  if (mod.type === "climate" || mod.type === "lab-climate") {
    if (extra === "map") return bindClimate(mod, date);
    return bindMonthGrid(mod);
  }
  if (mod.type === "five-s" || mod.type === "lab-5s") return bindMonthGrid(mod);
  if (mod.type === "inbound") return bindInboundMonth(mod, date);
  if (mod.type === "equipment") return bindEq(date, extra);
  if (mod.type === "mastercam") return bindCam(date);
  bindRows(mod, date, extra);
}

function bindRows(mod, date, extra) {
  const fields = fieldsFor(mod.type);
  if (extra && isSheetMod(mod)) return bindSheet(mod, extra);
  document.getElementById("add-row")?.addEventListener("click", () => {
    if (date) {
      const row = addBlank(mod, date);
      persist();
      location.hash = `#/${mod.id}/${date}/${row.id}`;
      return;
    }
    edit(mod, null, fields, date);
  });
  root.querySelectorAll("[data-edit]").forEach((b) => b.onclick = (event) => {
    event.stopPropagation();
    const row = (state.records[mod.id] || []).find((x) => x.id === b.dataset.edit);
    if (date && row) {
      location.hash = `#/${mod.id}/${date}/${row.id}`;
      return;
    }
    edit(mod, row, fields, date);
  });
  root.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => {
    if (!confirm("삭제할까요?")) return;
    state.records[mod.id] = (state.records[mod.id] || []).filter((x) => x.id !== b.dataset.del);
    persist(); render();
  });
}

function bindInboundMonth(mod, date) {
  const ym = monthKey(date) || date;
  document.getElementById("qa-print")?.addEventListener("click", () => window.print());
  document.getElementById("add-row")?.addEventListener("click", () => {
    addBlank(mod, ym);
    persist();
    render();
  });
  root.querySelectorAll("[data-in]").forEach((el) => {
    el.onchange = () => {
      const row = (state.records[mod.id] || []).find((x) => x.id === el.dataset.in);
      if (!row) return;
      const key = el.dataset.k;
      if (!key) return;
      row[key] = key === "qty" && el.value !== "" ? Number(el.value) : el.value;
      row.month = ym;
      remember(mod.id, ym);
      persist();
    };
  });
  root.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = () => {
      if (!confirm(t("삭제할까요?"))) return;
      state.records[mod.id] = (state.records[mod.id] || []).filter((x) => x.id !== b.dataset.del);
      persist();
      render();
    };
  });
}

function addBlank(mod, date) {
  const fields = fieldsFor(mod.type).filter((f) => f.key !== "progress");
  const row = { id: uid("r"), photos: [] };
  fields.forEach((f) => { row[f.key] = f.type === "date" ? (date || todayISO()) : ""; });
  if (mod.type === "process") {
    row.workDate = date;
    row.startDate = date;
    row.planQty = 0;
    row.doneQty = 0;
    row.progress = 0;
    row.status = "예정";
  }
  if (mod.type === "delivery") { row.customer = CUSTOMERS[0]; row.status = "예정"; }
  if (mod.type === "quality") {
    row.millCompany = "디오엠";
    row.customer = CUSTOMERS[0];
    row.status = "합격";
  }
  if (mod.type === "inbound") {
    const ym = monthKey(date) || date;
    row.month = ym;
    row.date = "";
    row.supplier = "";
    row.item = "";
    row.size = "";
    row.qty = "";
  }
  if (!state.records[mod.id]) state.records[mod.id] = [];
  if (mod.type === "inbound") state.records[mod.id].push(row);
  else state.records[mod.id].unshift(row);
  remember(mod.id, recDate(row, mod.type) || date);
  return row;
}

function bindSheet(mod, id) {
  const row = (state.records[mod.id] || []).find((x) => x.id === id);
  const formEl = document.getElementById("sheet-form");
  document.getElementById("qa-print")?.addEventListener("click", () => window.print());
  formEl?.addEventListener("submit", (e) => e.preventDefault());
  const save = () => {
    if (!row || !formEl) return;
    const fields = fieldsFor(mod.type).filter((f) => f.key !== "progress");
    const data = Object.fromEntries(new FormData(formEl).entries());
    Object.assign(row, cast(fields, data));
    if (mod.type === "process") {
      row.progress = processProgress(row.planQty, row.doneQty);
      if (row.progress >= 100) row.status = row.status && row.status !== "가동" ? row.status : "완료";
      else if (!row.status || row.status === "완료") row.status = row.progress > 0 ? "가동" : "예정";
      const el = document.querySelector("[data-progress]");
      if (el) el.textContent = `${row.progress}%`;
      ["signWorker", "signCheck", "signApprove", "signWorkerDate", "signCheckDate", "signApproveDate"].forEach((k) => {
        if (k in data) row[k] = data[k];
      });
    }
    remember(mod.id, recDate(row, mod.type));
    persist();
  };
  formEl?.addEventListener("change", save);
  formEl?.addEventListener("input", (e) => {
    if (mod.type === "process" && (e.target.name === "planQty" || e.target.name === "doneQty")) save();
  });
  document.getElementById("sheet-photos")?.addEventListener("change", async (e) => {
    if (!row) return;
    row.photos = row.photos || [];
    for (const f of e.target.files) row.photos.push(await readAsDataUrl(f));
    persist();
    render();
  });
}

function edit(mod, row, fields, date) {
  const formFields = mod.type === "process" ? fields.filter((f) => f.key !== "progress") : fields;
  const def = {};
  formFields.forEach((f) => { def[f.key] = f.type === "date" ? (date || todayISO()) : ""; });
  if (mod.type === "process") { def.workDate = date || todayISO(); def.startDate = date || todayISO(); }
  const val = row ? { ...row } : def;
  if (mod.type === "delivery" && !row) val.customer = CUSTOMERS[0];
  if (mod.type === "quality" && !row) {
    val.millCompany = "디오엠";
    val.customer = CUSTOMERS[0];
    val.status = "합격";
  }
  let extra = "";
  if (mod.type === "quality" || mod.type === "defect") {
    extra = `<label>사진<input id="photos" type="file" accept="image/*" multiple></label><div class="pics" id="prev">${(val.photos || []).map((s) => `<img src="${s}" alt="">`).join("")}</div>`;
  }
  if (mod.type === "process") {
    extra = `<p class="mute" id="prog-hint">진행률은 계획 수량과 완료 수량으로 자동 계산됩니다.</p>
      <label>작업 사진<input id="photos" type="file" accept="image/*" multiple></label>
      <div class="pics" id="prev">${(val.photos || []).map((s) => `<img src="${s}" alt="">`).join("")}</div>`;
  }
  form(row ? "수정" : "추가", formFields, val, async (data) => {
    const next = { ...(row || { id: uid("r"), photos: [] }), ...cast(formFields, data) };
    if (mod.type === "process") {
      next.progress = processProgress(next.planQty, next.doneQty);
      if (next.progress >= 100) next.status = next.status && next.status !== "가동" ? next.status : "완료";
      else if (!next.status || next.status === "완료") next.status = next.progress > 0 ? "가동" : "예정";
    }
    const input = document.getElementById("photos");
    if (input?.files?.length) {
      next.photos = [...(next.photos || [])];
      for (const f of input.files) next.photos.push(await readAsDataUrl(f));
    }
    if (!state.records[mod.id]) state.records[mod.id] = [];
    remember(mod.id, recDate(next, mod.type) || date);
    if (row) Object.assign(row, next); else state.records[mod.id].unshift(next);
    persist(); render();
  }, extra);
  if (mod.type === "process") {
    const plan = document.querySelector('[name="planQty"]');
    const done = document.querySelector('[name="doneQty"]');
    const hint = document.getElementById("prog-hint");
    const sync = () => {
      const pct = processProgress(plan?.value, done?.value);
      if (hint) hint.textContent = `진행률 ${pct}%  ·  계획 ${plan?.value || 0} / 완료 ${done?.value || 0}`;
    };
    plan?.addEventListener("input", sync);
    done?.addEventListener("input", sync);
    sync();
  }
}

function bindMonthGrid(mod) {
  document.getElementById("qa-print")?.addEventListener("click", () => window.print());
  root.querySelectorAll("[data-iso][data-id]").forEach((el) => el.onchange = () => {
    setMonthCheck(mod, el.dataset.k, el.dataset.iso, el.dataset.id, el.checked);
    const mark = el.parentElement?.querySelector(".print-mark");
    if (mark) mark.textContent = el.checked ? "✓" : "";
    persist();
  });
}

function bindEq(date, machineId) {
  if (!state.equipment[date]) state.equipment[date] = {};
  document.getElementById("qa-print")?.addEventListener("click", () => {
    const ins = document.querySelector("[data-ins]");
    if (ins && machineId) {
      if (!state.equipment[date][machineId]) state.equipment[date][machineId] = { checks: {}, inspector: "" };
      state.equipment[date][machineId].inspector = ins.value;
      persist();
    }
    window.print();
  });
  document.getElementById("eq-photo")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file || !machineId) return;
    if (!state.eqPhotos) state.eqPhotos = {};
    state.eqPhotos[machineId] = await readAsDataUrl(file);
    persist();
    render();
  });
  root.querySelectorAll("[data-eq]").forEach((el) => el.onchange = () => {
    const id = el.dataset.eq;
    if (!state.equipment[date][id]) state.equipment[date][id] = { checks: {}, inspector: "" };
    state.equipment[date][id].checks[el.dataset.c] = el.checked;
    const mark = el.parentElement?.querySelector(".print-mark");
    if (mark) mark.textContent = el.checked ? "✓" : "";
    persist();
  });
  root.querySelectorAll("[data-ins]").forEach((el) => el.onchange = () => {
    const id = el.dataset.ins;
    if (!state.equipment[date][id]) state.equipment[date][id] = { checks: {}, inspector: "" };
    state.equipment[date][id].inspector = el.value; persist();
  });
}

function bindCam(date) {
  document.getElementById("up")?.addEventListener("click", () => {
    const cur = state.cam.folders.find((f) => f.id === camFolder);
    if (cur?.parent) camFolder = cur.parent; persist(); render();
  });
  document.getElementById("nf")?.addEventListener("click", () => {
    const name = prompt("폴더 이름"); if (!name) return;
    state.cam.folders.push({ id: uid("c"), name, parent: camFolder }); persist(); render();
  });
  document.getElementById("cam-link")?.addEventListener("click", () => { pickCamWatchDir().catch((err) => alert(err.message || "폴더를 열 수 없습니다.")); });
  root.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => { camFolder = b.dataset.open; persist(); render(); });
  root.querySelectorAll("[data-job]").forEach((b) => b.onclick = () => {
    const job = (state.cam.jobs || []).find((j) => j.id === b.dataset.job);
    if (!job) return;
    form("수정", [
      { key: "name", label: "프로그램", type: "text" },
      { key: "partName", label: "품명", type: "text" },
    ], job, (v) => {
      job.name = v.name || job.name;
      job.partName = v.partName || job.partName;
      persist(); render();
    });
  });
  document.getElementById("upl")?.addEventListener("change", async (e) => {
    for (const f of e.target.files) await ingestCamFile(f, date);
    persist(); render();
  });
  root.querySelectorAll("[data-dl]").forEach((b) => b.onclick = async () => {
    const meta = state.cam.files.find((f) => f.id === b.dataset.dl);
    const blob = await loadBlob(meta.id); if (!blob) return alert("없음");
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = meta.name; a.click();
  });
}

function isCamNc(name) {
  return isCamFileName(name);
}

async function readNcText(file) {
  const buf = await file.slice(0, 12_000_000).arrayBuffer().catch(() => null);
  if (!buf) return "";
  return decodeCamFile(buf, file.name);
}

async function ingestCamFile(file, date = todayISO()) {
  if (!state.cam.jobs) state.cam.jobs = [];
  if (!state.cam.files) state.cam.files = [];
  if (!state.records.process) state.records.process = [];
  const id = uid("file");
  await saveBlob(id, file);
  const folderId = camFolder || "cam-root";
  state.cam.files.push({ id, folderId, name: file.name, size: file.size, date, auto: true });
  const text = await readNcText(file);
  const parsed = parseProgram(file.name, text);
  const cuts = (parsed?.points || []).filter((p) => !p.rapid && !p.change).length;
  if (cuts < 2) {
    remember("mastercam", date);
    return;
  }
  const stem = file.name.replace(/\.[^.]+$/, "").toLowerCase();
  const idx = state.cam.jobs.findIndex((j) => (j.name || "").replace(/\.[^.]+$/, "").toLowerCase() === stem);
  if (idx >= 0) {
    const oldCuts = (state.cam.jobs[idx].points || []).filter((p) => !p.rapid && !p.change).length;
    if (cuts <= oldCuts) {
      remember("mastercam", date);
      return;
    }
    state.cam.jobs.splice(idx, 1);
  }
  const job = { ...parsed, id: uid("job"), fileId: id, folderId, date };
  state.cam.jobs.push(job);
  state.records.process.unshift({
    id: uid("pr"),
    partNo: file.name.replace(/\.[^.]+$/, ""),
    partName: job.partName,
    lot: "",
    line: "Mastercam 9.1",
    wo: id,
    startDate: date,
    workDate: date,
    endDate: "",
    progress: 0,
    planQty: 1,
    doneQty: 0,
    detail: `공구 ${(job.tools || []).join(",") || "-"} · 절삭 ${job.cutMm}mm · 예상 ${job.timeMin}분`,
    owner: "",
    status: "프로그램 등록",
  });
  remember("mastercam", date);
  remember("process", date);
}

async function pickCamWatchDir() {
  if (!window.showDirectoryPicker) {
    alert("Chrome 또는 Edge에서만 폴더 연결이 됩니다. Mastercam이 NC를 저장하는 폴더를 선택하세요.");
    return;
  }
  const handle = await window.showDirectoryPicker({ id: "dom-mcam-nc", mode: "read" });
  await saveDirHandle(handle);
  state.cam.watchName = handle.name;
  if (!state.cam.seen) state.cam.seen = {};
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== "file" || !isCamNc(name)) continue;
    const file = await entry.getFile();
    state.cam.seen[`${name}:${file.size}:${file.lastModified}`] = 1;
  }
  persist();
  ensureCamWatch();
  render();
}

async function scanCamWatch() {
  const handle = await loadDirHandle();
  if (!handle) return;
  const perm = await handle.queryPermission({ mode: "read" });
  if (perm !== "granted") return;
  if (!state.cam.seen) state.cam.seen = {};
  let added = 0;
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== "file" || !isCamNc(name)) continue;
    const file = await entry.getFile();
    if (Date.now() - file.lastModified < 2500) continue;
    const key = `${name}:${file.size}:${file.lastModified}`;
    if (state.cam.seen[key]) continue;
    if ((state.cam.files || []).some((f) => f.name === name && f.size === file.size && f.date === todayISO())) {
      state.cam.seen[key] = 1;
      continue;
    }
    await ingestCamFile(file, todayISO());
    state.cam.seen[key] = 1;
    added += 1;
  }
  const keys = Object.keys(state.cam.seen);
  if (keys.length > 800) {
    keys.slice(0, keys.length - 500).forEach((k) => { delete state.cam.seen[k]; });
  }
  if (added) {
    persist();
    if (!document.getElementById("modal")?.innerHTML) render();
  }
}

function ensureCamWatch() {
  if (camWatchTimer) return;
  camWatchTimer = setInterval(() => { scanCamWatch().catch(() => {}); }, 4000);
  scanCamWatch().catch(() => {});
}

function bindClimate(mod, date) {
  const bag = climateBag(mod);
  document.getElementById("add-room")?.addEventListener("click", () => {
    bag.rooms.push({ id: uid("rm"), name: "새 구역", x: 40, y: 40, w: 18, h: 16, kind: mod.type === "lab-climate" ? "qa" : "area" });
    persist(); render();
  });
  document.getElementById("add-m")?.addEventListener("click", () => {
    bag.rooms.push({ id: uid("rm"), name: "새 기계", x: 42, y: 44, w: 12, h: 14, kind: "machine" });
    persist(); render();
  });
  document.getElementById("add-p")?.addEventListener("click", () => {
    bag.points.push({ id: uid("p").slice(0, 6).toUpperCase(), name: "새 위치", x: 50, y: 50 });
    persist(); render();
  });
  root.querySelectorAll("[data-rec]").forEach((b) => b.onclick = () => recPoint(mod, date, b.dataset.rec));
  drag(mod, date);
}

function drag(mod, date) {
  const bag = climateBag(mod);
  const plan = document.getElementById("plan"); if (!plan) return;
  let act = null, moved = false, n = 0;
  const bind = (sel, kind) => plan.querySelectorAll(sel).forEach((el) => {
    el.onpointerdown = (e) => { act = { el, kind, id: el.dataset.room || el.dataset.pin, x: e.clientX, y: e.clientY }; moved = false; el.setPointerCapture(e.pointerId); };
    el.onpointermove = (e) => {
      if (!act || act.el !== el) return;
      if (Math.hypot(e.clientX - act.x, e.clientY - act.y) > 5) moved = true;
      if (!moved) return;
      const box = plan.getBoundingClientRect();
      el.style.left = `${clamp(((e.clientX - box.left) / box.width) * 100, 1, 97)}%`;
      el.style.top = `${clamp(((e.clientY - box.top) / box.height) * 100, 1, 97)}%`;
    };
    el.onpointerup = () => {
      if (!act) return;
      if (moved) {
        const left = parseFloat(el.style.left), top = parseFloat(el.style.top);
        if (kind === "room") Object.assign(bag.rooms.find((r) => r.id === act.id), { x: left, y: top });
        else Object.assign(bag.points.find((p) => p.id === act.id), { x: left, y: top });
        persist();
      } else if (kind === "pin") recPoint(mod, date, act.id);
      else { n += 1; setTimeout(() => { n = 0; }, 280); if (n >= 2) editRoom(mod, act.id); }
      act = null;
    };
  });
  bind("[data-room]", "room");
  bind("[data-pin]", "pin");
}

function editRoom(mod, id) {
  const bag = climateBag(mod);
  const room = bag.rooms.find((r) => r.id === id);
  form("구역 수정", [
    { key: "name", label: "이름", type: "text" },
    { key: "w", label: "가로(%)", type: "number" },
    { key: "h", label: "세로(%)", type: "number" },
    { key: "kind", label: "종류 area/hall/qa/machine", type: "text" },
  ], room, (v) => { Object.assign(room, { name: v.name, w: Number(v.w), h: Number(v.h), kind: v.kind || room.kind }); persist(); render(); });
}

function recPoint(mod, date, id) {
  const bag = climateBag(mod);
  const p = bag.points.find((x) => x.id === id);
  const cur = (bag.logs[date] || []).find((x) => x.pointId === id) || { name: p.name, temp: "", humidity: "", lux: "", status: "정상" };
  cur.name = cur.name || p.name;
  form(`${p.id} 기록`, fieldsFor("climatePoint"), cur, (v) => {
    p.name = v.name || p.name;
    if (!bag.logs[date]) bag.logs[date] = [];
    const list = bag.logs[date];
    const i = list.findIndex((x) => x.pointId === id);
    const next = { pointId: id, temp: Number(v.temp), humidity: Number(v.humidity), lux: Number(v.lux), status: v.status || "정상" };
    if (i >= 0) list[i] = next; else list.push(next);
    persist(); render();
  });
}

function form(title, fields, values, onSave, extra = "") {
  const box = document.getElementById("modal");
  box.innerHTML = `<div class="mask"><form class="card ${fields.length > 16 ? "wide" : ""}" id="f"><h2>${h(t(title))}</h2>${fields.map((f) => {
    const v = h(values[f.key] ?? "");
    if (f.key === "customer") return `<label>${h(t(f.label))}<select name="customer">${CUSTOMERS.map((c) => `<option ${c === values.customer ? "selected" : ""}>${h(c)}</option>`).join("")}</select></label>`;
    if (f.type === "select") {
      const opts = f.options || [];
      const cur = values[f.key] ?? opts[0] ?? "";
      return `<label>${h(t(f.label))}<select name="${f.key}">${opts.map((o) => `<option value="${h(o)}" ${o === cur ? "selected" : ""}>${h(t(o))}</option>`).join("")}</select></label>`;
    }
    if (f.type === "textarea") return `<label>${h(t(f.label))}<textarea name="${f.key}">${v}</textarea></label>`;
    return `<label>${h(t(f.label))}<input name="${f.key}" type="${f.type}" value="${v}"></label>`;
  }).join("")}${extra}<div class="bar"><button class="btn ghost" id="c" type="button">${ht("취소")}</button><button class="btn red" type="submit">${ht("저장")}</button></div></form></div>`;
  document.getElementById("c").onclick = () => { box.innerHTML = ""; };
  document.getElementById("photos")?.addEventListener("change", async (e) => {
    const prev = document.getElementById("prev");
    for (const f of e.target.files) prev.insertAdjacentHTML("beforeend", `<img src="${await readAsDataUrl(f)}" alt="">`);
  });
  document.getElementById("f").onsubmit = async (e) => {
    e.preventDefault();
    await onSave(Object.fromEntries(new FormData(e.currentTarget).entries()));
    box.innerHTML = "";
  };
}

function cast(fields, values) {
  const o = {};
  fields.forEach((f) => { o[f.key] = f.type === "number" && values[f.key] !== "" ? Number(values[f.key]) : values[f.key]; });
  return o;
}

function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

window.addEventListener("hashchange", () => {
  try { render(); } catch (err) { showRecover(err); }
});
boot(render);
