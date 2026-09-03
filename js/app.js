import { getSession, login, signup, logout, isInternalNetwork, pullUsers, isAdmin, listUsers, pendingCount, setUserStatus } from "./auth.js?v=46";
import {
  CUSTOMERS, MILL_SHOPS, MACHINES, FIVE_S_SHOP, FIVE_S_LAB, QA_MEASURE_ITEMS,
  EQ_ITEMS, EQ_MARKS, DOM_SUPPLIER,
  fieldsFor, flattenChecks, badgeClass, todayISO,
} from "./data.js?v=56";
import { loadState, loadStateAsync, shareState, uid } from "./store.js?v=64";
import { saveBlob, loadBlob, readAsDataUrl, removeBlob } from "./files.js?v=39";
import { parseProgram, decodeCamFile, mayBeCamFile } from "./gcode.js?v=52";
import { boot, showRecover } from "./safety.js?v=45";
import { chatView, bindChat } from "./comm.js?v=51";
import { t, langBar, bindLang, applyHtmlLang } from "./i18n.js?v=67";

const WHOIS_MAIL = "https://email.whois.co.kr/v2/";

function openWhoisMail() {
  const win = window.open(WHOIS_MAIL, "_blank", "noopener,noreferrer");
  if (win) win.opener = null;
  return Boolean(win);
}

function whoisMailHref() {
  return `href="${WHOIS_MAIL}" target="_blank" rel="noopener noreferrer"`;
}
const root = document.getElementById("app");
let state = loadState();
let camFolder = state.camFolder || "cam-root";
let manageId = "inbound";

const h = (v) => String(v ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const ht = (v) => h(t(v));

let savedSnap = null;
let editKey = "";
let sheetDirty = false;

function persist() {
  state.camFolder = camFolder;
  try { shareState(state); } catch { /* 백업은 store에서 유지 */ }
}

function sheetEditKey() {
  const r = route();
  if (r.page !== "mod") return "";
  return `${r.id}|${r.date || ""}|${r.extra || ""}`;
}

function beginSheetEdit() {
  const key = sheetEditKey();
  if (!key) return;
  if (editKey === key && savedSnap) return;
  savedSnap = structuredClone(state);
  editKey = key;
  sheetDirty = false;
}

function markDirty() {
  sheetDirty = true;
}

function revertUnsavedIfLeft() {
  const key = sheetEditKey();
  if (!editKey || key === editKey) return;
  if (sheetDirty && savedSnap) {
    state = savedSnap;
    camFolder = state.camFolder || camFolder;
  }
  savedSnap = null;
  editKey = "";
  sheetDirty = false;
}

function flashSaved() {
  const n = document.getElementById("save-note");
  const msg = t("이 컴퓨터에 저장했습니다.");
  if (!n) {
    alert(msg);
    return;
  }
  n.hidden = false;
  n.textContent = msg;
  clearTimeout(flashSaved._t);
  flashSaved._t = setTimeout(() => { n.hidden = true; }, 1800);
}

function bindSaveButton(before) {
  beginSheetEdit();
  const run = () => {
    before?.();
    persist();
    savedSnap = structuredClone(state);
    sheetDirty = false;
    flashSaved();
  };
  document.getElementById("sheet-save")?.addEventListener("click", run);
  document.getElementById("folder-save")?.addEventListener("click", run);
}

function saveNote() {
  return `<span class="save-note" id="save-note" hidden></span>`;
}

function printSheet() {
  const sheet = document.querySelector(".a4-sheet");
  const land = sheet?.classList.contains("month-sheet");
  const delivery = sheet?.classList.contains("delivery-sheet");
  let tag = document.getElementById("print-size");
  if (!tag) {
    tag = document.createElement("style");
    tag.id = "print-size";
    document.head.appendChild(tag);
  }
  tag.textContent = land
    ? "@media print { @page { size: A4 landscape; margin: 8mm; } }"
    : delivery
      ? "@media print { @page { size: A4 portrait; margin: 8mm; } }"
      : "@media print { @page { size: A4 portrait; margin: 0; } }";
  window.print();
}

const VAULTS = [
  { id: "sales", title: "영업 폴더", desc: "영업 관련 업무를 이 폴더에 모아 둡니다." },
  { id: "accounting", title: "회계 폴더", desc: "회계 관련 업무를 이 폴더에 모아 둡니다." },
];
const VAULT_SESSION = "dom-vault:";
let vaultResetId = "";

function isVaultId(id) {
  return VAULTS.some((v) => v.id === id);
}

function vaultUnlocked(id) {
  return sessionStorage.getItem(`${VAULT_SESSION}${id}`) === "1";
}

function setVaultUnlocked(id, on) {
  if (on) sessionStorage.setItem(`${VAULT_SESSION}${id}`, "1");
  else sessionStorage.removeItem(`${VAULT_SESSION}${id}`);
}

function vaultBag(id) {
  if (!state.vaults || typeof state.vaults !== "object") state.vaults = {};
  if (!state.vaults[id] || typeof state.vaults[id] !== "object") state.vaults[id] = { pin: "" };
  return state.vaults[id];
}

async function pinHash(id, pin) {
  const raw = `dom-vault|${id}|${String(pin || "")}`;
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `x${(h >>> 0).toString(16)}`;
}

function route() {
  const p = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (!p.length || p[0] === "home") return { page: "home" };
  if (p[0] === "manage") return { page: "manage" };
  if (p[0] === "members") return { page: "members" };
  if (isVaultId(p[0])) return { page: "vault", id: p[0] };
  return { page: "mod", id: p[0], date: p[1] || "", extra: p[2] || "" };
}

function recDate(row, type) {
  if (type === "process") return row.workDate || row.startDate || "";
  if (type === "inbound") return row.month || monthKey(row.date) || "";
  return row.date || "";
}

function isYearKey(v) {
  return /^\d{4}$/.test(String(v || ""));
}

function isMonthKey(v) {
  return /^\d{4}-\d{2}$/.test(String(v || ""));
}

function isDayKey(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
}

function yearOf(v) {
  const s = String(v || "");
  if (isYearKey(s)) return s;
  if (isMonthKey(s) || isDayKey(s)) return s.slice(0, 4);
  return "";
}

function remember(id, date) {
  const mod = state.modules.find((m) => m.id === id);
  const key = isMonthFolder(mod) ? (monthKey(date) || date) : date;
  if (isYearKey(key) || (!isMonthFolder(mod) && isMonthKey(key))) return;
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

function weekdayOf(ym, day) {
  const [y, m] = String(ym).split("-").map(Number);
  return new Date(y, m - 1, day).getDay();
}

function shiftMonth(ym, delta) {
  const [y, m] = String(ym).split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isoDay(ym, day) {
  return `${ym}-${String(day).padStart(2, "0")}`;
}

function datesOf(mod) {
  const set = new Set(state.dateFolders[mod.id] || []);
  (state.records[mod.id] || []).forEach((r) => recDate(r, mod.type) && set.add(recDate(r, mod.type)));
  if (mod.type === "climate" || mod.type === "lab-climate") {
    const bag = climateBag(mod);
    Object.keys(bag.logs || {}).forEach((d) => set.add(d));
    Object.keys(bag.checks || {}).forEach((d) => set.add(d));
    Object.keys(bag.sheet || {}).forEach((d) => set.add(d));
  }
  if (mod.type === "equipment") Object.keys(state.equipment || {}).forEach((d) => set.add(d));
  if (mod.type === "five-s") {
    Object.entries(state.fiveS.dates || {}).forEach(([d, pack]) => {
      if (pack?.shop && Object.keys(pack.shop).length) set.add(d);
    });
    Object.keys(state.fiveS.notes || {}).forEach((d) => set.add(d));
  }
  if (mod.type === "lab-5s") {
    Object.entries(state.fiveS.dates || {}).forEach(([d, pack]) => {
      if (pack?.lab && Object.keys(pack.lab).some((k) => k.startsWith("l") || k === "insp" || k === "conf")) set.add(d);
    });
    Object.keys(state.fiveS.labNotes || {}).forEach((d) => set.add(d));
  }
  if (mod.type === "mastercam") (state.cam.files || []).forEach((f) => f.date && set.add(f.date));
  if (isMonthFolder(mod) || mod.type === "equipment") {
    return [...new Set([...set].map((d) => monthKey(d) || d).filter(isMonthKey))].sort().reverse();
  }
  return [...set].filter(isDayKey).sort().reverse();
}

function yearsOf(mod) {
  const set = new Set(datesOf(mod).map(yearOf).filter(Boolean));
  set.add(String(new Date().getFullYear()));
  return [...set].sort().reverse();
}

function monthsOf(mod, year) {
  const set = new Set();
  datesOf(mod).forEach((d) => {
    const ym = monthKey(d) || (isMonthKey(d) ? d : "");
    if (ym && yearOf(ym) === year) set.add(ym);
  });
  if (year === String(new Date().getFullYear())) set.add(thisMonth());
  return [...set].sort().reverse();
}

function daysOfMonth(mod, ym) {
  return datesOf(mod).filter((d) => isDayKey(d) && d.startsWith(`${ym}-`));
}

function usesTimeFolders(mod) {
  return isSheetMod(mod) || isMonthMod(mod) || mod?.type === "equipment";
}

function yearLabel(y) {
  return t("{y}년", { y });
}

function monthFolderLabel(ym) {
  const m = Number(String(ym).slice(5, 7));
  return t("{m}월", { m });
}

function crumbTrail(parts) {
  return parts.map((p, i) => (p.href && i < parts.length - 1
    ? `<a href="${h(p.href)}">${h(p.label)}</a>`
    : `<span>${h(p.label)}</span>`)).join(`<span class="crumb-sep">/</span>`);
}

function timeFolderList(items, empty) {
  if (!items.length) return `<section class="panel"><p class="mute pad">${ht(empty || "아직 기록이 없습니다.")}</p></section>`;
  return `<section class="panel rec-pack">
    <div class="cam-list time-folders">${items.map((it) => `
      <a class="cam-row rec-folder" href="${h(it.href)}" data-rec="${h(`${it.title} ${it.sub || ""}`.toLowerCase())}">
        <span class="cam-row-main"><b class="folder-name">${h(it.title)}</b><span>${h(it.sub || "")}</span></span>
        <span>${h(it.count || "")}</span>
      </a>`).join("")}</div>
  </section>`;
}

function monthTally(mod, ym) {
  if (isMonthMod(mod)) return count(mod, ym);
  if (mod.type === "inbound") return t("{n}건", { n: rowsOn(mod, ym).filter(inboundUsed).length });
  if (mod.type === "equipment") return t("{n}대", { n: MACHINES.length });
  if (mod.type === "delivery") {
    return t("{n}건", { n: daysOfMonth(mod, ym).reduce((s, d) => s + rowsOn(mod, d).filter(deliveryUsed).length, 0) });
  }
  return t("{n}건", { n: daysOfMonth(mod, ym).reduce((s, d) => s + rowsOn(mod, d).length, 0) });
}

function timeFolderActions(mod) {
  if (isMonthFolder(mod) || mod.type === "equipment") {
    return `<button class="btn sm" id="open-month" type="button">${ht("월 열기")}</button>
      <a class="btn sm" href="#/${mod.id}/${thisMonth()}">${ht("이번 달 표")}</a>`;
  }
  return `<button class="btn sm" id="open-date" type="button">${ht("날짜 열기")}</button>
    <a class="btn sm" href="#/${mod.id}/${todayISO()}">${ht("오늘 표")}</a>`;
}

function yearFolderView(mod) {
  const items = yearsOf(mod).map((y) => ({
    href: `#/${mod.id}/${y}`,
    title: yearLabel(y),
    count: t("{n}개월", { n: monthsOf(mod, y).length }),
  }));
  return `
    <div class="page-head">
      <div>
        <h1>${h(t(mod.title))}</h1>
        <p class="crumbs">${crumbTrail([{ label: t(mod.title) }])}</p>
        <p>${ht("년 폴더를 연 뒤 달을 고르세요.")}</p>
      </div>
      <div class="head-actions">
        ${timeFolderActions(mod)}
      </div>
    </div>
    ${timeFolderList(items, "아직 기록이 없습니다. 이번 달 표에서 적으세요.")}`;
}

function monthFolderView(mod, year) {
  const items = monthsOf(mod, year).map((ym) => ({
    href: `#/${mod.id}/${ym}`,
    title: monthFolderLabel(ym),
    count: monthTally(mod, ym),
  }));
  return `
    <div class="page-head">
      <div>
        <h1>${h(t(mod.title))}</h1>
        <p class="crumbs">${crumbTrail([
          { href: `#/${mod.id}`, label: t(mod.title) },
          { label: yearLabel(year) },
        ])}</p>
        <p>${ht("월 폴더를 누르면 그달 기록이 열립니다.")}</p>
      </div>
      <div class="head-actions">
        ${timeFolderActions(mod)}
      </div>
    </div>
    ${timeFolderList(items, "이 해에 기록이 없습니다.")}`;
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
  if (mod?.type === "records" && extra && !isYearKey(extra) && !isMonthKey(extra)) return true;
  if (mod?.type === "equipment") return Boolean(extra) || MACHINES.some((m) => m.id === date);
  if (isMonthMod(mod) && isMonthKey(date) && extra !== "map") return true;
  if (mod?.type === "inbound" && isMonthKey(date) && !extra) return true;
  if (mod?.type === "delivery" && isDayKey(date)) return true;
  if (!extra) return false;
  if (isYearKey(date) || isMonthKey(date)) return false;
  if (isSheetMod(mod)) return true;
  return false;
}

function brandMark() {
  return `<img class="brand-logo" src="./assets/dom-logo.svg?v=6" alt="주식회사 디오엠">`;
}

function logo(sub = "") {
  const extra = sub ? `<span class="logo-sub">${ht(sub)}</span>` : "";
  return `<div class="logo">${brandMark()}${extra}</div>`;
}

function render() {
  revertUnsavedIfLeft();
  applyHtmlLang();
  const session = getSession();
  const r = route();
  if (!session) return renderLogin();
  if (r.page === "home") {
    shell(session, "home", homeView());
    bindHome();
    return;
  }
  if (r.page === "manage") {
    shell(session, "manage", manageView());
    bindManage();
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
  if (r.page === "vault") {
    const vault = VAULTS.find((v) => v.id === r.id);
    if (!vault) {
      shell(session, "home", homeView());
      bindHome();
      return;
    }
    shell(session, vault.id, vaultView(vault, session));
    bindVault(vault, session);
    return;
  }
  const mod = state.modules.find((m) => m.id === r.id);
  if (!mod) {
    shell(session, "home", homeView());
    bindHome();
    return;
  }
  if (mod.type === "mail") {
    openWhoisMail();
    location.replace(`${location.pathname}${location.search}#/home`);
    return;
  }
  const printMode = isPrintPage(mod, r.extra, r.date);
  shell(session, mod.id, moduleView(mod, r.date, r.extra), printMode);
  bindModule(mod, r.date, r.extra);
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
  if (mod.type === "climate" || mod.type === "lab-climate") return datesOf(mod).length;
  if (mod.type === "equipment") return Object.keys(state.equipment || {}).length;
  if (mod.type === "five-s") return Object.values(state.fiveS.dates || {}).filter((p) => p?.shop && Object.keys(p.shop).length).length;
  if (mod.type === "lab-5s") return Object.values(state.fiveS.dates || {}).filter((p) => p?.lab && Object.keys(p.lab).some((k) => k.startsWith("l"))).length;
  if (mod.type === "mastercam") return (state.cam.files || []).length;
  if (mod.type === "chat") return (state.chat?.messages || []).length;
  if (mod.type === "mail") return (state.mail?.drafts || []).length;
  if (isSheetMod(mod)) return recRowsOf(mod).length;
  return (state.records[mod.id] || []).length;
}

function isCommMod(m) {
  return m?.type === "chat" || m?.type === "mail";
}

function sideFolders(active) {
  return state.modules.filter((m) => !isCommMod(m)).map((m) => {
    const on = m.id === active ? "on" : "";
    return `<a class="nav-head ${on}" href="#/${m.id}">${h(t(m.title))}</a>`;
  }).join("");
}

const NAV_OPEN_KEY = "dom-nav-open";

function navGroupOpen(id) {
  try {
    const map = JSON.parse(localStorage.getItem(NAV_OPEN_KEY) || "{}");
    return Boolean(map[id]);
  } catch {
    return false;
  }
}

function setNavGroupOpen(id, open) {
  try {
    const map = JSON.parse(localStorage.getItem(NAV_OPEN_KEY) || "{}");
    map[id] = Boolean(open);
    localStorage.setItem(NAV_OPEN_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

function bindShell() {
  root.querySelectorAll("[data-group]").forEach((b) => {
    b.onclick = () => {
      const group = b.parentElement;
      group.classList.toggle("open");
      setNavGroupOpen(b.dataset.group, group.classList.contains("open"));
    };
  });
  root.querySelectorAll("a[href*='whois']").forEach((a) => {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const win = window.open(a.href, "_blank", "noopener,noreferrer");
      if (win) win.opener = null;
    });
  });
}

function sideVaults(active) {
  return `<div class="side-vaults">${VAULTS.map((v) => {
    const on = v.id === active ? "on" : "";
    const mark = vaultUnlocked(v.id) ? "" : `<span class="vault-mark">${ht("잠금")}</span>`;
    return `<a class="nav-vault ${on}" href="#/${v.id}">${ht(v.title)}${mark}</a>`;
  }).join("")}</div>`;
}

function shell(session, active, inner, printMode = false) {
  const link = (id, title) => `<a class="${id === active ? "on" : ""}" href="#/${id}">${ht(title)}</a>`;
  const folders = sideFolders(active);
  const wait = isAdmin(session) ? pendingCount() : 0;
  const foldOpen = navGroupOpen("folders") ? "open" : "";
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
          <a href="./cam-lab.html?v=37">${ht("가공 프로그램")}</a>
        </div>
        <div class="side-block comm">
          <p class="side-label">${ht("소통")}</p>
          ${link("chat", "사내 메신저")}
          <a ${whoisMailHref()}>${ht("후이즈 메일")}</a>
        </div>
        <div class="side-block dirs">
          <div class="nav-group ${foldOpen}">
            <button class="nav-group-head" data-group="folders" type="button">${ht("사내업무 폴더")}</button>
            <div class="nav-group-body">${folders}</div>
          </div>
        </div>
        <div class="side-block vaults">
          ${sideVaults(active)}
        </div>
      </aside>
      <main>${inner}</main>
    </div>
    <div id="modal"></div>`;
  document.getElementById("out").onclick = () => { logout(); location.hash = ""; render(); };
  bindShell();
  bindLang(render);
}

function vaultView(vault, session) {
  const bag = vaultBag(vault.id);
  const hasPin = Boolean(bag.pin);
  const admin = isAdmin(session);
  const setup = !hasPin || vaultResetId === vault.id;
  if (setup && !admin) {
    return `<div class="head"><div><h1>${ht(vault.title)}</h1><p>${ht("관리자가 비밀번호를 정한 뒤에 열 수 있습니다.")}</p></div></div>
      <section class="panel"><p class="mute pad">${ht("이 폴더는 비밀번호가 걸려 있습니다.")}</p></section>`;
  }
  if (setup) {
    return `<section class="panel vault-panel">
      <h1>${ht(vault.title)}</h1>
      <p>${ht("이 폴더를 열 비밀번호를 정하세요. 영업과 회계는 각각 따로 정합니다.")}</p>
      <form id="vault-form">
        <label>${ht("비밀번호")}<input name="pin" type="password" autocomplete="new-password" required minlength="4"></label>
        <label>${ht("비밀번호 확인")}<input name="pin2" type="password" autocomplete="new-password" required minlength="4"></label>
        <p class="err" id="vault-err"></p>
        <button class="btn red" type="submit">${ht("비밀번호 정하기")}</button>
      </form>
    </section>`;
  }
  if (!vaultUnlocked(vault.id)) {
    return `<section class="panel vault-panel">
      <h1>${ht(vault.title)}</h1>
      <p>${ht("비밀번호를 입력하면 이 폴더가 열립니다.")}</p>
      <form id="vault-form">
        <label>${ht("비밀번호")}<input name="pin" type="password" autocomplete="off" required></label>
        <p class="err" id="vault-err"></p>
        <button class="btn red" type="submit">${ht("열기")}</button>
        ${admin ? `<button class="btn ghost" id="vault-reset" type="button">${ht("비밀번호 다시 정하기")}</button>` : ""}
      </form>
    </section>`;
  }
  return `<div class="head"><div><h1>${ht(vault.title)}</h1><p>${h(t(vault.desc))}</p></div>
      ${admin ? `<button class="btn sm" id="vault-reset" type="button">${ht("비밀번호 바꾸기")}</button>` : ""}
    </div>
    <section class="panel"><p class="mute pad">${ht("아직 이 폴더에 넣은 업무가 없습니다. 나중에 영업·회계 항목을 여기로 나누면 됩니다.")}</p></section>`;
}

function bindVault(vault, session) {
  const err = document.getElementById("vault-err");
  const showErr = (msg) => { if (err) err.textContent = t(msg); };
  document.getElementById("vault-reset")?.addEventListener("click", () => {
    vaultResetId = vault.id;
    setVaultUnlocked(vault.id, false);
    render();
  });
  document.getElementById("vault-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    const pin = String(data.pin || "");
    const setup = !vaultBag(vault.id).pin || vaultResetId === vault.id;
    if (setup) {
      if (pin.length < 4) return showErr("비밀번호는 4자리 이상으로 정하세요.");
      if (pin !== String(data.pin2 || "")) return showErr("비밀번호가 같지 않습니다.");
      vaultBag(vault.id).pin = await pinHash(vault.id, pin);
      vaultResetId = "";
      setVaultUnlocked(vault.id, true);
      persist();
      render();
      return;
    }
    const ok = await pinHash(vault.id, pin);
    if (ok !== vaultBag(vault.id).pin) return showErr("비밀번호가 틀렸습니다.");
    setVaultUnlocked(vault.id, true);
    render();
  });
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
  const mail = m.type === "mail" || m.id === "mail";
  const href = mail ? WHOIS_MAIL : `#/${m.id}`;
  const extra = mail ? " target=\"_blank\" rel=\"noopener noreferrer\"" : "";
  return `<a class="home-row" href="${h(href)}"${extra} data-name="${h(`${t(m.title)} ${t(m.desc)} ${m.id}`)}">
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

function isRecordListMod(mod) {
  return isSheetMod(mod);
}

function recRowsOf(mod) {
  const list = state.records[mod.id] || [];
  return list.filter((row) => sheetUsed(mod, row));
}

function sheetUsed(mod, r) {
  if (!r) return false;
  if (mod.type === "inbound") return inboundUsed(r);
  if (mod.type === "process") {
    return Boolean(
      String(r.partNo || r.partName || r.lot || r.line || r.wo || r.detail || r.owner || "").trim()
      || r.planQty || r.doneQty
      || r.status
      || (r.photos || []).some(Boolean)
    );
  }
  if (mod.type === "quality") {
    return Boolean(String(r.partNo || r.partName || r.lot || r.inspector || "").trim() || r.qtyIn || r.qtyOut || r.status);
  }
  if (mod.type === "delivery") return deliveryUsed(r);
  if (mod.type === "defect") {
    return Boolean(String(r.partNo || r.partName || r.type || r.action || "").trim() || r.qty);
  }
  if (mod.type === "inventory") {
    return Boolean(String(r.item || r.kind || r.lot || r.location || "").trim() || r.qty);
  }
  return Boolean(recTitle(r, mod.type));
}

function recTitle(row, type) {
  if (type === "inbound") return [row.supplier, row.item, row.size].filter(Boolean).join(" · ");
  if (type === "process") return [row.partNo, row.partName, row.line].filter(Boolean).join(" · ");
  if (type === "delivery") return [row.partNo, row.partName].filter(Boolean).join(" · ");
  if (type === "quality") return [row.partNo, row.partName, row.customer].filter(Boolean).join(" · ");
  if (type === "defect") return [row.partNo, row.partName, row.type].filter(Boolean).join(" · ");
  if (type === "inventory") return [row.kind, row.item, row.lot].filter(Boolean).join(" · ");
  return [row.item, row.partName, row.customer, row.owner].filter(Boolean).join(" · ") || row.id;
}

function recOpenHash(mod, row) {
  return `#/records/${mod.id}/${row.id}`;
}

function recMonthHash(mod, row) {
  const ym = monthKey(recDate(row, mod.type));
  return ym ? `#/records/${mod.id}/${ym}` : `#/records/${mod.id}`;
}

function recHay(mod, row) {
  return `${t(mod.title)} ${recDate(row, mod.type)} ${recTitle(row, mod.type)} ${row.status || ""} ${row.partNo || ""} ${row.lot || ""} ${row.supplier || ""} ${row.item || ""} ${row.customer || ""}`.toLowerCase();
}

function recStatus(row) {
  const s = row.status || "";
  if (!s) return "—";
  return `<span class="rec-st ${badgeClass(s)}">${h(s)}</span>`;
}

function recAllEntries() {
  return recordMods().filter(isRecordListMod).flatMap((mod) => recRowsOf(mod).map((row) => ({ mod, row })));
}

function recFolderHref(mod) {
  return isRecordListMod(mod) ? `#/records/${mod.id}` : `#/${mod.id}`;
}

function recFolderGroups() {
  return homeGroups().map((g) => ({
    title: g.title,
    mods: g.mods.filter((m) => m.type !== "records"),
  })).filter((g) => g.mods.length);
}

function recEntryDate(entry) {
  return recDate(entry.row, entry.mod.type);
}

function recYears(mod) {
  const rows = mod ? recRowsOf(mod) : recAllEntries();
  const set = new Set();
  if (mod) rows.forEach((r) => yearOf(recDate(r, mod.type)) && set.add(yearOf(recDate(r, mod.type))));
  else recAllEntries().forEach((e) => yearOf(recEntryDate(e)) && set.add(yearOf(recEntryDate(e))));
  set.add(String(new Date().getFullYear()));
  return [...set].sort().reverse();
}

function recMonths(mod, year) {
  const set = new Set();
  const add = (d) => {
    const ym = monthKey(d);
    if (ym && yearOf(ym) === year) set.add(ym);
  };
  if (mod) recRowsOf(mod).forEach((r) => add(recDate(r, mod.type)));
  else recAllEntries().forEach((e) => add(recEntryDate(e)));
  if (year === String(new Date().getFullYear())) set.add(thisMonth());
  return [...set].sort().reverse();
}

function recInMonth(mod, ym) {
  const hit = (d) => monthKey(d) === ym;
  if (mod) return recRowsOf(mod).filter((r) => hit(recDate(r, mod.type))).map((row) => ({ mod, row }));
  return recAllEntries().filter((e) => hit(recEntryDate(e)));
}

function recCell(mod, row, field) {
  if (field.key === "progress") return `${processProgress(row.planQty, row.doneQty)}%`;
  if (field.type === "date" || field.key === "date" || field.key === "workDate" || field.key === "startDate") {
    return camDay(row[field.key] || recDate(row, mod.type));
  }
  const v = row[field.key];
  if (v === 0 || v === "0") return "0";
  return v ? String(v) : "—";
}

function recAct(mod, row) {
  return `<td class="act">
    <a class="btn sm" href="${h(recOpenHash(mod, row))}">${ht("보기")}</a>
  </td>`;
}

function recordsHead(trail, extra = "") {
  return `
    <div class="page-head">
      <div>
        <h1>${ht("기록 관리")}</h1>
        <p class="crumbs">${crumbTrail(trail)}</p>
        <p>${ht("년 폴더와 월 폴더로 저장한 기록을 모아 둡니다.")}</p>
      </div>
      <div class="head-actions">
        <input id="q" type="search" placeholder="${ht("검색")}" autocomplete="off" />
        ${extra}
      </div>
    </div>`;
}

function recordsView(a = "", b = "") {
  const mods = recordMods().filter(isRecordListMod);
  if (!a) return recordsHome();
  if (isYearKey(a)) return recordsMonthFolders(null, a);
  if (isMonthKey(a)) return recordsMonthList(null, a);
  const picked = mods.find((m) => m.id === a);
  if (!picked) return recordsHome();
  if (!b) return recordsYearFolders(picked);
  if (isYearKey(b)) return recordsMonthFolders(picked, b);
  if (isMonthKey(b)) return recordsMonthList(picked, b);
  return recordsPeekView(picked, b);
}

function recordsHome() {
  const groups = recFolderGroups();
  const years = recYears(null).map((y) => ({
    href: `#/records/${y}`,
    title: yearLabel(y),
    count: t("{n}개월", { n: recMonths(null, y).length }),
  }));
  return `
    ${recordsHead([{ label: t("기록 관리") }])}
    <section class="panel rec-pack" data-band>
      <div class="bar compact-bar"><b>${ht("연도")}</b></div>
      <div class="cam-list time-folders">${years.map((it) => `
        <a class="cam-row rec-folder" href="${h(it.href)}" data-rec="${h(it.title)}">
          <span class="cam-row-main"><b class="folder-name">${h(it.title)}</b></span>
          <span>${h(it.count)}</span>
        </a>`).join("")}</div>
    </section>
    ${groups.map((g) => `<section class="panel rec-pack" data-band>
      <div class="bar compact-bar"><b>${ht(g.title)}</b></div>
      <div class="cam-list time-folders">${g.mods.map((m) => {
        const n = recCount(m);
        return `<a class="cam-row rec-folder" href="${h(recFolderHref(m))}" data-rec="${h(`${t(m.title)} ${t(m.desc)}`.toLowerCase())}">
          <span class="cam-row-main"><b class="folder-name">${h(t(m.title))}</b><span>${h(t(m.desc))}</span></span>
          <span>${h(t("{n}건", { n }))}</span>
        </a>`;
      }).join("")}</div>
    </section>`).join("")}`;
}

function recordsYearFolders(mod) {
  const items = recYears(mod).map((y) => ({
    href: `#/records/${mod.id}/${y}`,
    title: yearLabel(y),
    count: t("{n}개월", { n: recMonths(mod, y).length }),
  }));
  return `
    ${recordsHead([
      { href: "#/records", label: t("기록 관리") },
      { label: t(mod.title) },
    ], `<a class="btn sm" href="#/${mod.id}">${ht("폴더 열기")}</a>`)}
    ${timeFolderList(items, "이 폴더에 기록이 없습니다.")}`;
}

function recordsMonthFolders(mod, year) {
  const items = recMonths(mod, year).map((ym) => ({
    href: mod ? `#/records/${mod.id}/${ym}` : `#/records/${ym}`,
    title: monthFolderLabel(ym),
    count: t("{n}건", { n: recInMonth(mod, ym).length }),
  }));
  const trail = mod
    ? [
      { href: "#/records", label: t("기록 관리") },
      { href: `#/records/${mod.id}`, label: t(mod.title) },
      { label: yearLabel(year) },
    ]
    : [
      { href: "#/records", label: t("기록 관리") },
      { label: yearLabel(year) },
    ];
  return `${recordsHead(trail)}${timeFolderList(items, "이 해에 기록이 없습니다.")}`;
}

function recordsMonthList(mod, ym) {
  const entries = recInMonth(mod, ym).slice().sort((a, b) => String(recEntryDate(b)).localeCompare(String(recEntryDate(a))));
  const showFolder = !mod;
  const body = entries.map(({ mod: m, row }) => `<tr data-rec="${h(recHay(m, row))}">
      ${recAct(m, row)}
      ${showFolder ? `<td><a class="rec-fold" href="#/records/${m.id}/${ym}">${h(t(m.title))}</a></td>` : ""}
      <td>${h(camDay(recDate(row, m.type)))}</td>
      <td>${h(recTitle(row, m.type) || "—")}</td>
      <td>${recStatus(row)}</td>
    </tr>`).join("");
  const trail = mod
    ? [
      { href: "#/records", label: t("기록 관리") },
      { href: `#/records/${mod.id}`, label: t(mod.title) },
      { href: `#/records/${mod.id}/${yearOf(ym)}`, label: yearLabel(yearOf(ym)) },
      { label: monthFolderLabel(ym) },
    ]
    : [
      { href: "#/records", label: t("기록 관리") },
      { href: `#/records/${yearOf(ym)}`, label: yearLabel(yearOf(ym)) },
      { label: monthFolderLabel(ym) },
    ];
  const cols = showFolder ? 5 : 4;
  return `
    ${recordsHead(trail, mod ? `<a class="btn sm" href="#/${mod.id}/${ym}">${ht("폴더 열기")}</a>` : "")}
    <section class="panel rec-pack">
      <div class="bar compact-bar">
        <span class="mute">${ht("{n}건", { n: entries.length })}</span>
      </div>
      <div class="scroll"><table class="rows rec-table"><thead><tr>
        <th></th>${showFolder ? `<th>${ht("폴더")}</th>` : ""}<th>${ht("날짜")}</th><th>${ht("내용")}</th><th>${ht("상태")}</th>
      </tr></thead>
      <tbody>${body || `<tr><td colspan="${cols}">${ht("이 달에 적힌 기록이 없습니다.")}</td></tr>`}</tbody></table></div>
    </section>`;
}

function recordsPeekView(mod, rowId) {
  const row = recRowsOf(mod).find((r) => r.id === rowId) || (state.records[mod.id] || []).find((r) => r.id === rowId);
  if (!row) return recordsYearFolders(mod);
  const date = recDate(row, mod.type) || todayISO();
  if (mod.type === "delivery") return deliveryDayView(mod, date, true);
  return printDocView(mod, date, row.id, true);
}

function bindRecords(folderId, extra) {
  if (folderId && !isYearKey(folderId) && !isMonthKey(folderId)) manageId = folderId;
  if (extra && !isYearKey(extra) && !isMonthKey(extra)) {
    document.getElementById("qa-print")?.addEventListener("click", printSheet);
    return;
  }
  const q = document.getElementById("q");
  const filter = () => {
    const needle = (q?.value || "").trim().toLowerCase();
    document.querySelectorAll("[data-rec]").forEach((el) => {
      const hay = `${el.getAttribute("data-rec") || ""} ${el.textContent || ""}`.toLowerCase();
      el.hidden = Boolean(needle) && !hay.includes(needle);
    });
    document.querySelectorAll("[data-band]").forEach((band) => {
      const items = [...band.querySelectorAll("[data-rec]")];
      band.hidden = items.length > 0 && items.every((el) => el.hidden);
    });
  };
  q?.addEventListener("input", filter);
  q?.addEventListener("keyup", filter);
  q?.addEventListener("compositionend", filter);
}

function moduleView(mod, date, extra) {
  if (mod.type === "records") return recordsView(date, extra);
  if (mod.type === "chat") return chatView(state, h, date);
  if (mod.type === "mastercam") {
    applyCamRoute(date);
    return camView(mod);
  }
  if (!date) {
    if (usesTimeFolders(mod)) return yearFolderView(mod);
    if (mod.type === "equipment") return eqView(mod, thisMonth());
    return folderBrowse(mod);
  }
  if (isYearKey(date) && usesTimeFolders(mod)) return monthFolderView(mod, date);
  if (mod.type === "climate") {
    if (extra === "map") return climateView(mod, monthKey(date) || date);
    return shopClimateView(mod, monthKey(date) || date);
  }
  if (mod.type === "lab-climate") {
    if (extra === "map") return climateView(mod, monthKey(date) || date);
    return shopClimateView(mod, monthKey(date) || date);
  }
  if (mod.type === "five-s") return shopFiveSView(mod, monthKey(date) || date);
  if (mod.type === "lab-5s") return shopFiveSView(mod, monthKey(date) || date);
  if (mod.type === "inbound") {
    const ym = monthKey(date) || date;
    padInboundRows(mod, ym);
    return inboundMonthView(mod, ym);
  }
  if (mod.type === "delivery") {
    if (isMonthKey(date)) return deliveryBrowse(mod, date);
    padDeliveryRows(mod, date);
    return deliveryDayView(mod, date);
  }
  if (mod.type === "equipment") {
    const eq = eqRoute(date, extra);
    return eq.machineId ? eqSheetView(mod, eq.ym, eq.machineId) : eqView(mod, eq.ym);
  }
  if (isSheetMod(mod) && extra) return printDocView(mod, date, extra);
  if (isMonthKey(date) && isSheetMod(mod)) return folderBrowse(mod, date);
  return dayView(mod, date);
}

function dateLabel(mod, date) {
  if (mod.type === "inbound") return inboundMonthTitle(date);
  if (isMonthFolder(mod)) return monthLabel(date);
  return camDay(date);
}

function folderBrowse(mod, ym = "") {
  const dates = ym ? daysOfMonth(mod, ym) : datesOf(mod);
  const year = ym ? yearOf(ym) : "";
  const blocks = dates.map((d) => {
    const rows = rowsOn(mod, d);
    return `<section class="panel rec-pack">
      <div class="bar compact-bar">
        <b>${h(dateLabel(mod, d))}</b>
        <span class="mute">${count(mod, d)}</span>
        <a class="btn sm" href="#/${mod.id}/${d}">${ht("표 열기")}</a>
        <button class="btn sm" data-add-date="${h(d)}" type="button">${ht("추가")}</button>
      </div>
      ${tableOf(mod, rows, d, true)}
    </section>`;
  }).join("");
  const trail = ym
    ? [
      { href: `#/${mod.id}`, label: t(mod.title) },
      { href: `#/${mod.id}/${year}`, label: yearLabel(year) },
      { label: monthFolderLabel(ym) },
    ]
    : [{ label: t(mod.title) }];
  return `
    <div class="page-head">
      <div>
        <h1>${h(t(mod.title))}</h1>
        <p class="crumbs">${crumbTrail(trail)}</p>
        <p>${h(t(mod.desc))}</p>
      </div>
      <div class="head-actions">
        ${timeFolderActions(mod)}
      </div>
    </div>
    ${blocks || `<section class="panel"><p class="mute pad">${ht("이 달에 적힌 기록이 없습니다.")}</p></section>`}`;
}

function inboundBrowse(mod) {
  const months = datesOf(mod);
  const blocks = months.map((ym) => {
    const rows = rowsOn(mod, ym).filter(inboundUsed);
    const body = rows.map((r) => `<tr>
        <td>${h(camDay(r.date))}</td>
        <td>${h(r.supplier || "—")}</td>
        <td>${h(r.item || "—")}</td>
        <td>${h(r.qty || "—")}</td>
        <td>${h(r.size || "—")}</td>
        <td class="act"><a class="btn sm" href="#/${mod.id}/${ym}">${ht("수정")}</a></td>
      </tr>`).join("");
    return `<section class="panel rec-pack">
      <div class="bar compact-bar">
        <b>${h(inboundMonthTitle(ym))}</b>
        <span class="mute">${ht("{n}건", { n: rows.length })}</span>
        <a class="btn sm" href="#/${mod.id}/${ym}">${ht("표 열기")}</a>
      </div>
      <div class="scroll"><table class="rows rec-table"><thead><tr>
        <th>${ht("날짜")}</th><th>${ht("업체")}</th><th>${ht("자재 품명")}</th><th>${ht("개수")}</th><th>${ht("자재 사이즈")}</th><th></th>
      </tr></thead>
      <tbody>${body || `<tr><td colspan="6">${ht("이 달에 적힌 입고가 없습니다.")}</td></tr>`}</tbody></table></div>
    </section>`;
  }).join("");
  return `
    <div class="page-head">
      <div>
        <h1>${h(t(mod.title))}</h1>
        <p>${h(t(mod.desc))}</p>
      </div>
      <div class="head-actions">
        <a class="btn sm" href="#/${mod.id}/${thisMonth()}">${ht("이번 달 표")}</a>
      </div>
    </div>
    ${blocks || `<section class="panel"><p class="mute pad">${ht("아직 기록이 없습니다. 이번 달 표에서 적으세요.")}</p></section>`}`;
}

function climVal(obj, d) {
  const v = obj?.[d] ?? obj?.[String(d)];
  return v == null || v === "" ? "" : v;
}

function monthFilledDays(mod, ym) {
  const month = monthKey(ym) || ym;
  const n = daysInMonth(month);
  const days = [];
  if (mod.type === "climate" || mod.type === "lab-climate") {
    const pack = climateBag(mod).sheet?.[month];
    if (!pack) return days;
    for (let d = 1; d <= n; d++) {
      if (climVal(pack.temp, d) !== "" || climVal(pack.hum, d) !== "" || String(climVal(pack.lux, d)).trim()) days.push(d);
    }
    return days;
  }
  const { groups, key } = monthItems(mod);
  const items = flattenChecks(groups);
  for (let d = 1; d <= n; d++) {
    const pack = state.fiveS.dates[isoDay(month, d)]?.[key] || {};
    if (
      items.some((i) => pack[i.id] === true || (typeof pack[i.id] === "string" && String(pack[i.id]).trim()))
      || String(pack.insp || "").trim()
      || String(pack.conf || "").trim()
    ) days.push(d);
  }
  return days;
}

function monthSheetBrowse(mod) {
  const months = datesOf(mod);
  const climate = mod.type === "climate" || mod.type === "lab-climate";
  const blocks = months.map((ym) => {
    const days = monthFilledDays(mod, ym);
    const pack = climate ? climateBag(mod).sheet?.[ym] : null;
    const key = climate ? "" : monthItems(mod).key;
    const checks = climate ? [] : flattenChecks(monthItems(mod).groups);
    const body = days.map((d) => {
      const iso = isoDay(ym, d);
      if (climate) {
        const temp = climVal(pack?.temp, d);
        const hum = climVal(pack?.hum, d);
        const lux = climVal(pack?.lux, d);
        return `<tr>
          <td>${h(camDay(iso))}</td>
          <td>${temp === "" ? "—" : `${h(temp)}℃`}</td>
          <td>${hum === "" ? "—" : `${h(hum)}%`}</td>
          <td>${lux === "" ? "—" : h(lux)}</td>
          <td class="act"><a class="btn sm" href="#/${mod.id}/${ym}">${ht("수정")}</a></td>
        </tr>`;
      }
      const cell = state.fiveS.dates[iso]?.[key] || {};
      const on = checks.filter((i) => cell[i.id] === true).length;
      return `<tr>
        <td>${h(camDay(iso))}</td>
        <td>${on}/${checks.length}</td>
        <td>${h(cell.insp || "—")}</td>
        <td>${h(cell.conf || "—")}</td>
        <td class="act"><a class="btn sm" href="#/${mod.id}/${ym}">${ht("수정")}</a></td>
      </tr>`;
    }).join("");
    const heads = climate
      ? `<th>${ht("날짜")}</th><th>${ht("온도")}</th><th>${ht("습도")}</th><th>${ht("조도")}</th><th></th>`
      : `<th>${ht("날짜")}</th><th>${ht("점검")}</th><th>${ht("점검자")}</th><th>${ht("확인")}</th><th></th>`;
    return `<section class="panel rec-pack">
      <div class="bar compact-bar">
        <b>${h(monthLabel(ym))}</b>
        <span class="mute">${count(mod, ym)}</span>
        <a class="btn sm" href="#/${mod.id}/${ym}">${ht("표 열기")}</a>
      </div>
      <div class="scroll"><table class="rows rec-table"><thead><tr>${heads}</tr></thead>
      <tbody>${body || `<tr><td colspan="5">${ht("이 달에 적힌 점검이 없습니다.")}</td></tr>`}</tbody></table></div>
    </section>`;
  }).join("");
  return `
    <div class="page-head">
      <div>
        <h1>${h(t(mod.title))}</h1>
        <p>${h(t(mod.desc))}</p>
      </div>
      <div class="head-actions">
        <button class="btn sm" id="open-month" type="button">${ht("월 열기")}</button>
        <a class="btn sm" href="#/${mod.id}/${thisMonth()}">${ht("이번 달 표")}</a>
      </div>
    </div>
    ${blocks || `<section class="panel"><p class="mute pad">${ht("아직 기록이 없습니다. 이번 달 표에서 적으세요.")}</p></section>`}`;
}

function deliveryBrowse(mod, ym = "") {
  const dates = ym ? daysOfMonth(mod, ym) : datesOf(mod);
  const year = ym ? yearOf(ym) : "";
  const blocks = dates.map((d) => {
    const rows = rowsOn(mod, d).filter(deliveryUsed);
    const body = rows.map((r) => `<tr>
        <td>${h(r.partNo || "—")}</td>
        <td>${h(r.partName || "—")}</td>
        <td>${h(r.unit || "—")}</td>
        <td>${h(r.qty || "—")}</td>
        <td>${h(moneyText(deliveryAmount(r)) || "—")}</td>
        <td class="act"><a class="btn sm" href="#/${mod.id}/${d}">${ht("수정")}</a></td>
      </tr>`).join("");
    return `<section class="panel rec-pack">
      <div class="bar compact-bar">
        <b>${h(camDay(d))}</b>
        <span class="mute">${ht("{n}건", { n: rows.length })}</span>
        <a class="btn sm" href="#/${mod.id}/${d}">${ht("표 열기")}</a>
      </div>
      <div class="scroll"><table class="rows rec-table"><thead><tr>
        <th>${ht("품번")}</th><th>${ht("품명")}</th><th>${ht("단위")}</th><th>${ht("수량")}</th><th>${ht("금액")}</th><th></th>
      </tr></thead>
      <tbody>${body || `<tr><td colspan="6">${ht("이 날짜에 적힌 납품이 없습니다.")}</td></tr>`}</tbody></table></div>
    </section>`;
  }).join("");
  const trail = ym
    ? [
      { href: `#/${mod.id}`, label: t(mod.title) },
      { href: `#/${mod.id}/${year}`, label: yearLabel(year) },
      { label: monthFolderLabel(ym) },
    ]
    : [{ label: t(mod.title) }];
  return `
    <div class="page-head">
      <div>
        <h1>${h(t(mod.title))}</h1>
        <p class="crumbs">${crumbTrail(trail)}</p>
        <p>${h(t(mod.desc))}</p>
      </div>
      <div class="head-actions">
        ${timeFolderActions(mod)}
      </div>
    </div>
    ${blocks || `<section class="panel"><p class="mute pad">${ht("이 달에 적힌 납품이 없습니다.")}</p></section>`}`;
}

function dateIndex(mod) {
  const month = isMonthFolder(mod);
  const folders = datesOf(mod).map((d) => `
    <a class="date-line" href="#/${mod.id}/${d}">
      <strong>${h(dateLabel(mod, d))}</strong>
      <span>${count(mod, d)}</span>
    </a>`).join("");
  return `
    <div class="head compact-head"><div><h1>${h(t(mod.title))}</h1><p>${h(t(mod.desc))}</p></div><a class="btn ghost sm" href="#/home">${ht("운영 폴더")}</a></div>
    <section class="panel dates-panel">
      <div class="bar compact-bar"><b>${ht(month ? "월" : "날짜")}</b>
        <button class="btn sm" id="add-date" type="button">${ht(month ? "월 추가" : "날짜 추가")}</button></div>
      <div class="date-list">${folders}</div>
    </section>`;
}

function count(mod, date) {
  if (isMonthMod(mod)) return t("{n}일 점검", { n: monthFilledDays(mod, date).length });
  if (mod.type === "inbound") return t("{n}건", { n: rowsOn(mod, date).filter(inboundUsed).length });
  if (mod.type === "delivery") return t("{n}건", { n: rowsOn(mod, date).filter(deliveryUsed).length });
  if (mod.type === "mastercam") return t("{n}개 파일", { n: (state.cam.files || []).filter((f) => f.date === date).length });
  if (mod.type === "equipment") return t("{n}대", { n: MACHINES.length });
  return t("{n}건", { n: rowsOn(mod, date).length });
}

function dayView(mod, date) {
  const rows = rowsOn(mod, date);
  return `
    <div class="head compact-head"><div><h1>${h(t(mod.title))}</h1><p>${h(camDay(date))}</p></div>
      <div class="head-actions">
        <a class="btn ghost sm" href="#/${mod.id}/${monthKey(date) || date}">${ht("뒤로가기")}</a>
      </div></div>
    <section class="panel">
      <div class="bar compact-bar"><b>${h(date)}</b>
        <button class="btn sm" id="add-row" type="button">${ht("추가")}</button></div>
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

function deliveryUsed(r) {
  return Boolean(
    String(r.partNo || r.partName || r.lot || r.note || "").trim()
    || r.qty
    || r.price
  );
}

function deliveryAmount(r) {
  const q = Number(r.qty) || 0;
  const p = Number(r.price) || 0;
  return Math.round(q * p);
}

function moneyText(n) {
  const v = Number(n);
  if (!v) return "";
  return v.toLocaleString("ko-KR");
}

function deliveryHead(date) {
  if (!state.deliveryMeta) state.deliveryMeta = {};
  const cur = state.deliveryMeta[date] || {};
  const rows = (state.records.delivery || []).filter((r) => r.date === date && deliveryUsed(r));
  const fromRow = rows.find((r) => String(r.customer || "").trim())?.customer || "";
  return {
    docNo: cur.docNo || "",
    jobTitle: cur.jobTitle || "",
    customer: cur.customer || fromRow,
    customerAddr: cur.customerAddr || "",
    recvDept: cur.recvDept || "",
    poNo: cur.poNo || "",
    remark: cur.remark || "VAT별도",
  };
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

function padDeliveryRows(mod, date) {
  let n = rowsOn(mod, date).length;
  let added = 0;
  while (n < 16) {
    addBlank(mod, date);
    n += 1;
    added += 1;
  }
  if (added) persist();
}

function printDateText(val) {
  const s = String(val || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return `${m[1]}. ${m[2]}. ${m[3]}`;
}

function datePrintField(attrs, value) {
  return `<span class="date-print-wrap"><input ${attrs} type="date" value="${h(value ?? "")}"><span class="print-date">${h(printDateText(value))}</span></span>`;
}

function syncPrintDate(el) {
  if (!el || el.type !== "date") return;
  const label = el.parentElement?.querySelector(".print-date");
  if (label) label.textContent = printDateText(el.value);
}

function inboundCell(row, key, type, placeholder) {
  const val = row[key] ?? "";
  if (type === "date") return datePrintField(`data-in="${h(row.id)}" data-k="${key}"`, val);
  return `<input data-in="${h(row.id)}" data-k="${key}" type="${type}" value="${h(val)}"${placeholder ? ` placeholder="${h(placeholder)}"` : ""}>`;
}

function deliveryCell(row, key, type, placeholder) {
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
      ${a4Tools(`#/${mod.id}/${yearOf(month) || month}`, `<button class="btn" id="add-row" type="button">${ht("가로줄 추가")}</button>`)}
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

function deliveryDayView(mod, date, viewOnly = false) {
  const rows = rowsOn(mod, date);
  const head = deliveryHead(date);
  const delHead = viewOnly ? "" : `<th class="no-print"></th>`;
  const custOpts = CUSTOMERS.includes(head.customer) || !head.customer
    ? CUSTOMERS
    : [head.customer, ...CUSTOMERS];
  let no = 0;
  const body = rows.map((r) => {
    const used = deliveryUsed(r);
    const num = used ? ++no : "";
    const amt = used ? moneyText(deliveryAmount(r)) : "";
    return `<tr>
      <td class="col-n">${h(num)}</td>
      <td class="col-no">${deliveryCell(r, "partNo", "text")}</td>
      <td class="col-name">${deliveryCell(r, "partName", "text")}</td>
      <td class="col-unit">${deliveryCell(r, "unit", "text", "EA")}</td>
      <td class="col-qty">${deliveryCell(r, "qty", "number")}</td>
      <td class="col-price">${deliveryCell(r, "price", "number")}</td>
      <td class="col-amt" data-amt="${h(r.id)}">${h(amt)}</td>
      <td class="col-note">${deliveryCell(r, "note", "text")}</td>
      ${viewOnly ? "" : `<td class="act no-print"><button class="btn sm" data-del="${r.id}" type="button">${ht("삭제")}</button></td>`}
    </tr>`;
  }).join("");
  const total = moneyText(rows.reduce((s, r) => s + (deliveryUsed(r) ? deliveryAmount(r) : 0), 0));
  const back = viewOnly
    ? `#/records/${mod.id}/${monthKey(date) || date}`
    : `#/${mod.id}/${monthKey(date) || date}`;
  const extra = viewOnly ? "" : `<button class="btn" id="add-row" type="button">${ht("가로줄 추가")}</button>`;
  const delEmpty = viewOnly ? "" : `<td class="no-print"></td>`;
  return `
    <div class="print-page${viewOnly ? " view-only" : ""}">
      ${a4Tools(back, extra, viewOnly)}
      <div class="a4-wrap page">
        <article class="a4-sheet delivery-sheet tx-sheet">
          <table class="tx-form delivery-day">
            <colgroup>
              <col class="col-n"><col class="col-no"><col class="col-name">
              <col class="col-unit"><col class="col-qty"><col class="col-price">
              <col class="col-amt"><col class="col-note">
              ${viewOnly ? "" : "<col class=\"col-act\">"}
            </colgroup>
            <tbody>
              <tr class="tx-meta">
                <td colspan="5"></td>
                <td colspan="3" class="tx-id">
                  <input data-head="docNo" value="${h(head.docNo)}" placeholder="PA0000000" spellcheck="false">
                  <span>${h(printDateText(date))}</span>
                </td>
                ${delEmpty}
              </tr>
              <tr class="tx-title-row">
                <td colspan="8">거래명세표</td>
                ${delEmpty}
              </tr>
              <tr class="tx-party-lab">
                <td colspan="3">User</td>
                <td colspan="5">Supplier</td>
                ${delEmpty}
              </tr>
              <tr>
                <td colspan="3" rowspan="5" class="tx-user">
                  <select data-head="customer">
                    <option value=""></option>
                    ${custOpts.map((o) => `<option value="${h(o)}" ${o === head.customer ? "selected" : ""}>${h(o)}</option>`).join("")}
                  </select>
                  <textarea data-head="customerAddr" rows="3" placeholder="${ht("주소")}">${h(head.customerAddr)}</textarea>
                  <label><span>인수부서명:</span><input data-head="recvDept" value="${h(head.recvDept)}"></label>
                  <label><span>발주번호;</span><input data-head="poNo" value="${h(head.poNo)}"></label>
                </td>
                <td colspan="5" class="tx-sup tx-sup-logo">
                  ${brandMark()}
                </td>
                ${delEmpty}
              </tr>
              <tr><td colspan="5" class="tx-sup">사업자등록번호;${h(DOM_SUPPLIER.bizNo)}</td>${delEmpty}</tr>
              <tr><td colspan="5" class="tx-sup">${h(DOM_SUPPLIER.addr)}</td>${delEmpty}</tr>
              <tr><td colspan="5" class="tx-sup">${h(DOM_SUPPLIER.tel)}</td>${delEmpty}</tr>
              <tr>
                <td colspan="5" class="tx-sup tx-ceo">대표자;${h(DOM_SUPPLIER.ceo)}<img class="tx-seal" src="./assets/dom-seal.png" alt=""></td>
                ${delEmpty}
              </tr>
              <tr class="tx-cols">
                <th class="col-n">No</th>
                <th class="col-no">품번</th>
                <th class="col-name">품명</th>
                <th class="col-unit">단위</th>
                <th class="col-qty">수량</th>
                <th class="col-price">단가</th>
                <th class="col-amt">금액</th>
                <th class="col-note">비고</th>
                ${delHead}
              </tr>
              <tr class="tx-job-row">
                <td></td>
                <td colspan="7"><input class="tx-job" data-head="jobTitle" value="${h(head.jobTitle)}" placeholder="건명"></td>
                ${delEmpty}
              </tr>
              ${body}
              <tr class="tx-blank-row"><td></td><td colspan="7">이 하 여 백</td>${delEmpty}</tr>
              <tr class="tx-total">
                <td colspan="6">Sub-Total(KRW)</td>
                <td colspan="2" data-total>${h(total)}</td>
                ${delEmpty}
              </tr>
            </tbody>
          </table>
          <div class="tx-remark">
            <label>Remark:<input data-head="remark" value="${h(head.remark)}"></label>
            <span>1/1</span>
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

function tableOf(mod, rows, date, quiet = false) {
  if (mod.type === "quality") return qualitySheet(rows, date, mod.id, quiet);
  if (mod.type === "delivery") return deliverySheet(rows, date, mod.id, quiet);
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
        <a class="btn sm" href="#/${mod.id}/${date}/${r.id}">${ht("보기·인쇄")}</a></td>${cells}${pics}</tr>`;
  }).join("");
  const cols = fields.length + (extra ? 1 : 0) + 1;
  const hint = quiet ? "" : `<p class="mute pad">${ht("수정 또는 보기·인쇄를 누르면 A4 표에서 바로 고칠 수 있습니다.")}</p>`;
  return `${hint}<div class="scroll"><table class="rows"><thead><tr><th></th>${fields.map((f) => `<th>${h(t(f.label))}</th>`).join("")}${extra}</tr></thead>
    <tbody>${body || `<tr><td colspan="${cols}">${ht("이 날짜 기록이 없습니다.")}</td></tr>`}</tbody></table></div>`;
}

function qualitySheet(rows, date, modId, quiet = false) {
  const body = rows.map((r) => `<tr class="qa-row">
      <td class="act"><a class="btn sm" href="#/${modId}/${date}/${r.id}">수정</a>
        <a class="btn sm" href="#/${modId}/${date}/${r.id}">보기·인쇄</a></td>
      <td>${h(r.partNo)}</td>
      <td>${h(r.partName)}</td>
      <td>${h(r.lot)}</td>
      <td>${h(r.millCompany)}</td>
      <td>${h(r.customer)}</td>
      <td>${h(r.qtyIn ?? "")}</td>
      <td>${h(r.qtyOut ?? "")}</td>
      <td>${h(r.status)}</td>
    </tr>`).join("");
  return `${quiet ? "" : `<p class="mute pad">표 페이지에서 검사 내용을 고치고 인쇄할 수 있습니다.</p>`}
    <div class="scroll"><table class="rows">
    <thead><tr><th></th><th>품번</th><th>품명</th><th>LOT</th><th>가공 회사</th><th>납품처</th><th>품질실 입고</th><th>납품 출고</th><th>판정</th></tr></thead>
    <tbody>${body || `<tr><td colspan="9">이 날짜 기록이 없습니다. 추가로 검사 내용을 넣으세요.</td></tr>`}</tbody>
  </table></div>`;
}

function deliverySheet(rows, date, modId, quiet = false) {
  const body = rows.map((r) => `<tr class="qa-row">
      <td class="act"><a class="btn sm" href="#/${modId}/${date}">${ht("수정")}</a>
        <a class="btn sm" href="#/${modId}/${date}">${ht("표 열기")}</a></td>
      <td>${h(r.partNo)}</td>
      <td>${h(r.partName)}</td>
      <td>${h(r.unit)}</td>
      <td>${h(r.qty ?? "")}</td>
      <td>${h(moneyText(deliveryAmount(r)))}</td>
    </tr>`).join("");
  return `${quiet ? "" : `<p class="mute pad">${ht("그날 나가는 품목을 한 장에 모아 적고 인쇄합니다.")}</p>`}
    <div class="scroll"><table class="rows">
    <thead><tr><th></th><th>${ht("품번")}</th><th>${ht("품명")}</th><th>${ht("단위")}</th><th>${ht("수량")}</th><th>${ht("금액")}</th></tr></thead>
    <tbody>${body || `<tr><td colspan="6">${ht("이 날짜에 적힌 납품이 없습니다.")}</td></tr>`}</tbody>
  </table></div>`;
}

function fi(name, value, type = "text") {
  if (type === "date") return datePrintField(`name="${name}"`, value);
  return `<input name="${name}" type="${type}" value="${h(value ?? "")}">`;
}

function fm(i, k, value) {
  return `<input data-qa-m="${i}" data-k="${k}" value="${h(value ?? "")}">`;
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

function a4Tools(backHref, extras = "", viewOnly = false) {
  const extra = String(extras).trim();
  return `<div class="a4-tools no-print">
    ${backHref ? `<a class="btn ghost" href="${h(backHref)}">${ht("뒤로가기")}</a>` : ""}
    ${viewOnly ? "" : extra}
    ${viewOnly ? "" : `<button class="btn" id="sheet-save" type="button">${ht("저장")}</button>`}
    <button class="btn red" id="qa-print" type="button">${ht("인쇄")}</button>
    ${viewOnly ? "" : saveNote()}
  </div>`;
}

function printDocView(mod, date, id, viewOnly = false) {
  if (mod.type === "delivery") return deliveryDayView(mod, date, viewOnly);
  const row = (state.records[mod.id] || []).find((x) => x.id === id);
  if (!row) return mod.type === "inbound" ? inboundMonthView(mod, monthKey(date) || date) : dayView(mod, date);
  const photos = mod.type === "quality" || mod.type === "defect" || mod.type === "process";
  const backDate = mod.type === "inbound" ? (monthKey(row.date) || monthKey(date) || date) : date;
  const backYm = monthKey(backDate) || backDate;
  const backYear = yearOf(backYm);
  const back = viewOnly
    ? `#/records/${mod.id}/${backYm}`
    : (mod.type === "inbound" ? `#/${mod.id}/${backYear}` : `#/${mod.id}/${isDayKey(backDate) ? backYm : backDate}`);
  return `
    <div class="print-page${viewOnly ? " view-only" : ""}">
      ${a4Tools(back, photos ? `<label class="btn">${ht("사진 추가")}<input id="sheet-photos" type="file" accept="image/*" multiple hidden></label>` : "", viewOnly)}
      <div class="a4-wrap page"><form id="sheet-form">${a4For(mod, row)}</form></div>
    </div>`;
}

function a4For(mod, row) {
  if (mod.type === "quality") return qualityA4(row);
  if (mod.type === "process") return processA4(row);
  if (mod.type === "defect") return defectA4(row);
  if (mod.type === "inventory") return inventoryA4(row);
  return genericA4(mod, row);
}

function a4Head(title, date, ready = false) {
  return `<header class="a4-head">
          <div>${brandMark()}</div>
          <h1>${h(ready ? title : t(title))}</h1>
        </header>`;
}

function qaMeasures(r) {
  const blank = () => ({ item: "", spec: "", v1: "", v2: "", v3: "", note: "" });
  const pad = (rows) => {
    const next = rows.map((row) => ({
      item: row.item || "",
      spec: row.spec || "",
      v1: row.v1 ?? "",
      v2: row.v2 ?? "",
      v3: row.v3 ?? "",
      note: row.note || "",
    }));
    while (next.length < 14) next.push(blank());
    return next.slice(0, 14);
  };
  if (Array.isArray(r.measures) && r.measures.length) {
    r.measures = pad(r.measures);
    return r.measures;
  }
  const named = QA_MEASURE_ITEMS.map((item) => blank());
  named[0] = { item: "X", spec: r.specX || "", v1: r.x1 ?? "", v2: r.x2 ?? "", v3: r.x3 ?? "", note: "" };
  named[1] = { item: "Y", spec: r.specY || "", v1: r.y1 ?? "", v2: r.y2 ?? "", v3: r.y3 ?? "", note: "" };
  named[2] = { item: "Z", spec: r.specZ || "", v1: r.z1 ?? "", v2: r.z2 ?? "", v3: r.z3 ?? "", note: "" };
  QA_MEASURE_ITEMS.forEach((item, i) => { if (!named[i].item) named[i].item = item; });
  r.measures = pad(named);
  return r.measures;
}

function picDel(attr) {
  return `<button type="button" class="pic-del no-print" ${attr} aria-label="사진 빼기" title="사진 빼기">×</button>`;
}

function qaPhotos(r) {
  const pics = Array.from({ length: 3 }, (_, i) => (r.photos || [])[i] || "");
  return `<div class="qa-photos">${pics.map((src, i) => `<div class="qa-shot${src ? " has-pic" : ""}">
      <label>
        ${src ? `<img src="${src}" alt="">` : `<span>사진 ${i + 1}</span>`}
        <input data-qa-pic="${i}" type="file" accept="image/*" hidden>
      </label>
      ${src ? picDel(`data-qa-del="${i}"`) : ""}
    </div>`).join("")}</div>`;
}

function qualityA4(r) {
  const rows = qaMeasures(r);
  const body = rows.map((row, i) => `<tr>
      <td class="qa-item">${fm(i, "item", row.item)}</td>
      <td>${fm(i, "spec", row.spec)}</td>
      <td>${fm(i, "v1", row.v1)}</td>
      <td>${fm(i, "v2", row.v2)}</td>
      <td>${fm(i, "v3", row.v3)}</td>
      <td class="qa-note">${fm(i, "note", row.note)}</td>
    </tr>`).join("");
  return `
      <article class="a4-sheet qa-a4">
        ${a4Head("품질 검사 성적서", r.date)}
        <table class="a4-meta">
          <tr><th>가공 회사</th><td>${fs("millCompany", r.millCompany, MILL_SHOPS)}</td><th>납품처</th><td>${fs("customer", r.customer, CUSTOMERS)}</td></tr>
          <tr><th>품번</th><td>${fi("partNo", r.partNo)}</td><th>품명</th><td>${fi("partName", r.partName)}</td></tr>
          <tr><th>LOT 번호</th><td>${fi("lot", r.lot)}</td><th>검사일</th><td>${fi("date", r.date, "date")}</td></tr>
          <tr><th>품질실 입고</th><td>${fi("qtyIn", r.qtyIn, "number")}</td><th>납품 출고</th><td>${fi("qtyOut", r.qtyOut, "number")}</td></tr>
          <tr><th>검사자</th><td>${fi("inspector", r.inspector)}</td><th>판정</th><td>${fs("status", r.status, ["합격", "불합격", "보류"])}</td></tr>
        </table>
        <h2>사진 · 외관</h2>
        ${qaPhotos(r)}
        <h2>치수 측정 (mm)</h2>
        <table class="a4-meas qa-meas">
          <thead><tr><th>항목</th><th>기준 / 공차</th><th>1회</th><th>2회</th><th>3회</th><th>비고</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
        <div class="a4-sign">
          <span>작성</span><span>검토</span><span>승인</span>
        </div>
      </article>`;
}

function deliveryA4(r) {
  return deliveryDayView({ id: "delivery", type: "delivery" }, r.date || todayISO());
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
  const pics = (r.photos || []).filter(Boolean);
  if (!pics.length) {
    return `<p class="a4-empty">작업·제품 사진<br>위 ‘사진’으로 첨부</p>`;
  }
  const shown = pics.slice(0, 4);
  const cls = shown.length === 1 ? "one" : shown.length === 2 ? "two" : "many";
  return `<div class="a4-photos ${cls}">${shown.map((s, i) => `<div class="pic-item">
      <img src="${s}" alt="">
      ${picDel(`data-pic-del="${i}"`)}
    </div>`).join("")}</div>`;
}

function processA4(r) {
  return `
      <article class="a4-sheet process-a4">
        <header class="process-head">
          <div class="process-head-top">
            <div class="process-brand">
              ${brandMark()}
              <h1>가공 작업 현황</h1>
            </div>
            ${processStamp(r)}
          </div>
        </header>
        <div class="a4-process-body">
          <div class="a4-process-main">
            <table class="a4-meta">
              <tr><th>품번</th><td>${fi("partNo", r.partNo)}</td><th>라인</th><td>${fi("line", r.line)}</td></tr>
              <tr class="name-row"><th>품명</th><td colspan="3">${fi("partName", r.partName)}</td></tr>
              <tr><th>LOT 번호</th><td>${fi("lot", r.lot)}</td><th>작업지시</th><td>${fi("wo", r.wo)}</td></tr>
              <tr><th>담당</th><td>${fi("owner", r.owner)}</td><th>상태</th><td>${fi("status", r.status)}</td></tr>
              <tr><th>가공 시작일</th><td>${fi("startDate", r.startDate, "date")}</td><th>최근 작업일</th><td>${fi("workDate", r.workDate, "date")}</td></tr>
              <tr><th>완료일</th><td>${fi("endDate", r.endDate, "date")}</td><th>진행률</th><td>${fc({ key: "progress" }, r)}</td></tr>
              <tr><th>계획 수량</th><td>${fi("planQty", r.planQty, "number")}</td><th>완료 수량</th><td>${fi("doneQty", r.doneQty, "number")}</td></tr>
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
  const list = (r.photos || []).filter(Boolean);
  const pics = list.length
    ? `<div class="a4-photos">${list.map((s, i) => `<div class="pic-item">
        <img src="${s}" alt="">
        ${picDel(`data-pic-del="${i}"`)}
      </div>`).join("")}</div>`
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
  if (key === "shop" || key === "lab") return state.fiveS.dates[iso]?.[key]?.[id] === true;
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
      ${a4Tools(`#/${mod.id}/${yearOf(month)}`, climate ? `<a class="btn" href="#/${mod.id}/${month}/map">${ht("평면도")}</a>` : "")}
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

function climPack(mod, ym) {
  const bag = climateBag(mod);
  if (!bag.sheet) bag.sheet = {};
  if (!bag.sheet[ym]) bag.sheet[ym] = { temp: {}, hum: {}, lux: {}, inspector: "", manager: "" };
  const p = bag.sheet[ym];
  if (!p.temp) p.temp = {};
  if (!p.hum) p.hum = {};
  if (!p.lux) p.lux = {};
  return p;
}

function shopClimateView(mod, ym) {
  const month = monthKey(ym) || ym || thisMonth();
  const [year, mon] = month.split("-").map(Number);
  const n = daysInMonth(month);
  const pack = climPack(mod, month);
  const lab = mod.type === "lab-climate";
  const y0 = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => y0 - 4 + i);
  if (!years.includes(year)) years.push(year);
  years.sort((a, b) => a - b);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const wd = ["일", "월", "화", "수", "목", "금", "토"];
  const wkClass = (d) => {
    if (d > n) return "off";
    const w = weekdayOf(month, d);
    return w === 0 ? "sun" : w === 6 ? "sat" : "";
  };
  const temps = [40, 35, 30, 25, 20, 15, 10, 5];
  const hums = [80, 70, 60, 50, 40, 30, 20, 10];
  const dayHeads = days.map((d) => `<th class="${wkClass(d)}">${String(d).padStart(2, "0")}</th>`).join("");
  const weekHeads = days.map((d) => `<th class="${wkClass(d)}">${d > n ? "" : wd[weekdayOf(month, d)]}</th>`).join("");
  const band = (kind, levels, unit) => levels.map((lv, i) => {
    const cells = days.map((d) => {
      if (d > n) return `<td class="off"></td>`;
      const stored = pack[kind][d] ?? pack[kind][String(d)];
      const on = stored !== "" && stored != null && Number(stored) === lv;
      return `<td class="clim-x ${kind}${on ? " on" : ""} ${wkClass(d)}" data-clim="${kind}" data-day="${d}" data-val="${lv}">${on ? "X" : ""}</td>`;
    }).join("");
    const head = i === 0
      ? `<th rowspan="${levels.length}">${kind === "temp" ? "1" : "2"}</th>
         <th rowspan="${levels.length}">${kind === "temp" ? "온도" : "습도"}</th>
         <td class="spec" rowspan="${levels.length}">${kind === "temp"
           ? "[관리 SPEC] 18℃~25℃<br>[적색 표기]"
           : "[습도 SPEC] 70% 이하<br>[흑색 표기]"}</td>`
      : "";
    return `<tr>${head}<th class="time">${lv}${unit}</th>${cells}</tr>`;
  }).join("");
  const luxRow = days.map((d) => {
    if (d > n) return `<td class="off"></td>`;
    const v = pack.lux[d] ?? pack.lux[String(d)] ?? "";
    return `<td class="lux ${wkClass(d)}"><input data-clim-lux data-day="${d}" value="${h(v)}" inputmode="numeric"></td>`;
  }).join("");
  return `
    <div class="print-page">
      ${a4Tools(`#/${mod.id}/${yearOf(month)}`, `
        <button class="btn ghost" id="clim-prev" type="button">${ht("이전달")}</button>
        <button class="btn ghost" id="clim-next" type="button">${ht("다음달")}</button>
        <a class="btn" href="#/${mod.id}/${month}/map">${ht("평면도")}</a>
      `)}
      <div class="a4-wrap page">
        <article class="a4-sheet month-sheet clim-sheet">
          <header class="clim-head">
            <h1>${lab ? "완제품 창고 온,습도 점검 CHECK SHEET" : "생산라인 온,습도 점검 CHECK SHEET"}</h1>
            <div class="clim-ym no-print">
              <select id="clim-y">${years.map((y) => `<option value="${y}" ${y === year ? "selected" : ""}>${y}</option>`).join("")}</select>
              <span>년</span>
              <select id="clim-m">${Array.from({ length: 12 }, (_, i) => i + 1).map((m) => `<option value="${m}" ${m === mon ? "selected" : ""}>${m}</option>`).join("")}</select>
              <span>월</span>
            </div>
            <p class="clim-ym-print">${year} 년 ${mon} 월</p>
          </header>
          <table class="clim-grid">
            <colgroup>
              <col class="c-no">
              <col class="c-kind">
              <col class="c-spec">
              <col class="c-time">
              ${days.map(() => `<col class="c-day">`).join("")}
            </colgroup>
            <thead>
              <tr>
                <th rowspan="3">NO</th>
                <th rowspan="3">구분</th>
                <th rowspan="3">관리기준</th>
                <th rowspan="3">TIME</th>
                <th colspan="31">일</th>
              </tr>
              <tr>${dayHeads}</tr>
              <tr>${weekHeads}</tr>
            </thead>
            <tbody>
              ${band("temp", temps, "℃")}
              ${band("hum", hums, "%")}
              <tr>
                <th>3</th>
                <th>조도</th>
                <td class="spec">[조도 SPEC] ${lab ? "1000Lx" : "800Lx"} 이상<br>[숫자 표기]</td>
                <th class="time">조도(Lx)</th>
                ${luxRow}
              </tr>
            </tbody>
          </table>
          <div class="clim-bottom">
            <table class="clim-cond">
              <thead><tr><th colspan="2">${lab ? "완제품, 소모성 자재에 대한 저장조건" : "생산 라인에 대한 저장조건"}</th></tr></thead>
              <tbody>
                ${lab ? `
                <tr>
                  <th>완제품</th>
                  <td>상온 10~25℃, 상습 0~70% 이하<br>1) 직사광선을 피할 것<br>2) 기타 유해한 저장 조건이 생기지 않도록 한다.</td>
                </tr>
                <tr>
                  <th>소모성</th>
                  <td>포장 박스 등 소모성 자재. 유해한 저장 조건이 생기지 않도록 한다.</td>
                </tr>
                <tr>
                  <th>조도</th>
                  <td>2D 측정기 테이블 상면 기준 1000Lx 이상<br>1) Lux 범위 이내여야 한다<br>2) 측정 위치에서 측정한다.</td>
                </tr>` : `
                <tr>
                  <th>온,습도</th>
                  <td>상온 10~25℃, 상습 0~70% 이하<br>1) 직사광선을 피할 것<br>2) 기타 유해한 저장 조건이 생기지 않도록 한다.</td>
                </tr>
                <tr>
                  <th>조도</th>
                  <td>자주검사대 상면 기준 800Lx 이상<br>1) Lux 범위 이내여야 한다<br>2) 3파장 스탠드에서 측정한다.</td>
                </tr>`}
              </tbody>
            </table>
            <table class="clim-sign">
              <thead><tr><th>구분</th><th>CHECK TIME</th></tr></thead>
              <tbody>
                <tr><th>점검시간</th><td>08:30 ~ 09:30</td></tr>
                <tr><th>점검자</th><td><input data-clim-k="inspector" value="${h(pack.inspector || "")}"></td></tr>
                <tr><th>책임자</th><td><input data-clim-k="manager" value="${h(pack.manager || "")}"></td></tr>
              </tbody>
            </table>
          </div>
          <p class="clim-note">${lab ? "* 적정 온,습도 유지 관리할 것" : "* 적정 온,습도 유지 관리철저"}</p>
          <p class="clim-co">(주)디오엠</p>
        </article>
      </div>
    </div>`;
}

function fiveText(iso, id, key = "shop") {
  const v = state.fiveS.dates[iso]?.[key]?.[id];
  return typeof v === "string" ? v : "";
}

function shopFiveSView(mod, ym) {
  const month = monthKey(ym) || ym || thisMonth();
  const [year, mon] = month.split("-").map(Number);
  const n = daysInMonth(month);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const wd = ["일", "월", "화", "수", "목", "금", "토"];
  const wkClass = (d) => {
    if (d > n) return "off";
    const w = weekdayOf(month, d);
    return w === 0 ? "sun" : w === 6 ? "sat" : "";
  };
  const y0 = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => y0 - 4 + i);
  if (!years.includes(year)) years.push(year);
  years.sort((a, b) => a - b);
  const { groups, key } = monthItems(mod);
  const lab = mod.type === "lab-5s";
  const note = (lab ? state.fiveS.labNotes : state.fiveS.notes)?.[month] || "";
  const dayHeads = days.map((d) => `<th class="${wkClass(d)}">${String(d).padStart(2, "0")}</th>`).join("");
  const weekHeads = days.map((d) => `<th class="${wkClass(d)}">${d > n ? "" : wd[weekdayOf(month, d)]}</th>`).join("");
  const body = groups.map((g) => g.items.map((item, idx) => {
    const cells = days.map((d) => {
      if (d > n) return `<td class="off"></td>`;
      const iso = isoDay(month, d);
      if (item.kind === "text") {
        return `<td class="name ${wkClass(d)}"><input type="text" data-five-name data-iso="${iso}" data-id="${item.id}" value="${h(fiveText(iso, item.id, key))}" autocomplete="off"></td>`;
      }
      const on = monthChecked(mod, key, iso, item.id);
      return `<td class="chk ${on ? "on" : ""} ${wkClass(d)}"><label><input type="checkbox" data-iso="${iso}" data-k="${key}" data-id="${item.id}" ${on ? "checked" : ""}><span class="print-mark">${on ? "✓" : ""}</span></label></td>`;
    }).join("");
    return `<tr>
      ${idx === 0 ? `<th class="g" rowspan="${g.items.length}">${h(t(g.group))}</th>` : ""}
      <td class="item">${h(t(item.label))}</td>
      ${cells}
    </tr>`;
  }).join("")).join("");
  return `
    <div class="print-page">
      ${a4Tools(`#/${mod.id}/${yearOf(month)}`, `
        <button class="btn ghost" id="five-prev" type="button">${ht("이전달")}</button>
        <button class="btn ghost" id="five-next" type="button">${ht("다음달")}</button>
      `)}
      <div class="a4-wrap page">
        <article class="a4-sheet month-sheet sheet-5s">
          <header class="sheet-5s-head">
            <h1>${lab ? "검사실(완제품 창고) 3정 5S CHECK SHEET" : "생산라인 3정 5S CHECK SHEET"}</h1>
            <div class="sheet-5s-ym no-print">
              <select id="five-y" aria-label="년도">${years.map((y) => `<option value="${y}" ${y === year ? "selected" : ""}>${y}</option>`).join("")}</select>
              <span>년</span>
              <select id="five-m" aria-label="월">${Array.from({ length: 12 }, (_, i) => i + 1).map((m) => `<option value="${m}" ${m === mon ? "selected" : ""}>${m}</option>`).join("")}</select>
              <span>월</span>
            </div>
            <p class="sheet-5s-ym-print">${year} 년 ${mon} 월</p>
          </header>
          <div class="a4-grow sheet-5s-body">
            <table class="month-grid sheet-5s-grid">
              <colgroup>
                <col class="c-g">
                <col class="c-item">
                ${days.map(() => `<col class="c-day">`).join("")}
              </colgroup>
              <thead>
                <tr><th rowspan="2">${ht("구분")}</th><th rowspan="2">${ht("점검사항")}</th>${dayHeads}</tr>
                <tr>${weekHeads}</tr>
              </thead>
              <tbody>${body}</tbody>
            </table>
          </div>
          <div class="sheet-5s-foot">
            <div class="sheet-5s-note">
              <b>비고 및 특이사항</b>
              <textarea data-five-note>${h(note)}</textarea>
            </div>
            <div class="sheet-5s-rule">
              <p>1) 매일 퇴근 10분전에 청소 실시</p>
              <p>2) 매주 금요일 퇴근 20분전에는 대청소 실시</p>
              <p>청소시간 : 17:10 ~ 17:30분 (업무 STOP 후 청소 실시)</p>
            </div>
          </div>
          <p class="sheet-5s-co">(주)디오엠</p>
        </article>
      </div>
    </div>`;
}

function roomBoxStyle(r) {
  const rot = Number(r.rot) || 0;
  return `left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%;transform:rotate(${rot}deg)`;
}

function applyRoomBox(el, r) {
  el.style.left = `${r.x}%`;
  el.style.top = `${r.y}%`;
  el.style.width = `${r.w}%`;
  el.style.height = `${r.h}%`;
  el.style.transform = `rotate(${Number(r.rot) || 0}deg)`;
}

function removeClimatePoint(mod, id) {
  const bag = climateBag(mod);
  bag.points = (bag.points || []).filter((p) => p.id !== id);
  Object.keys(bag.logs || {}).forEach((d) => {
    bag.logs[d] = (bag.logs[d] || []).filter((x) => x.pointId !== id);
  });
  Object.keys(bag.checks || {}).forEach((d) => {
    if (bag.checks[d]) delete bag.checks[d][id];
  });
}

function climateView(mod, date) {
  const bag = climateBag(mod);
  const rooms = (bag.rooms || []).map((r) => `<div class="room ${h(r.kind || "")}" data-room="${h(r.id)}" style="${roomBoxStyle(r)}">
      <span class="room-name">${h(r.name)}</span>
      <button class="room-rot" data-room-rot type="button" title="회전"></button>
      <span class="room-h nw" data-room-rs="nw"></span>
      <span class="room-h ne" data-room-rs="ne"></span>
      <span class="room-h sw" data-room-rs="sw"></span>
      <span class="room-h se" data-room-rs="se"></span>
    </div>`).join("");
  const pins = (bag.points || []).map((p) => `<div class="pin-wrap" data-pin="${h(p.id)}" style="left:${p.x}%;top:${p.y}%">
      <button class="pin ok" type="button">${h(p.id)}</button>
      <button class="pin-del" data-pin-del="${h(p.id)}" type="button" title="위치 빼기">×</button>
    </div>`).join("");
  const lab = mod.type === "lab-climate";
  const ym = monthKey(date) || date;
  return `
    <div class="head"><div><h1>${h(mod.title)}</h1><p>${h(monthLabel(ym))} 평면도 · 구역을 끌어서 옮기고, 모서리로 크기·위쪽 점으로 회전합니다.</p></div>
      <div class="head-actions no-print">
        ${saveNote()}
        <button class="btn" id="folder-save" type="button">${ht("저장")}</button>
        <a class="btn ghost" href="#/${mod.id}/${ym}">${ht("뒤로가기")}</a>
      </div></div>
    <section class="panel">
      <div class="bar"><b>${lab ? "검사실 평면도" : "현장 평면도"}</b>
        <button class="btn sm" id="add-room" type="button">구역 추가</button>
        ${lab ? "" : `<button class="btn sm" id="add-m" type="button">기계 추가</button>`}
        <button class="btn sm" id="add-p" type="button">측정 위치 추가</button></div>
      <div class="plan" id="plan">${rooms}${pins}</div>
      <p class="mute pad">구역을 누르면 모서리·회전점이 나옵니다. 측정 위치는 끌어 옮기고, ×로 뺍니다. 점검은 월간 표에서 합니다.</p>
    </section>`;
}

function eqView(mod, date) {
  const ym = monthKey(date) || thisMonth();
  const groups = [...new Set(MACHINES.map((m) => m.group))];
  const blocks = groups.map((g) => {
    const lines = MACHINES.filter((m) => m.group === g).map((m) => {
      const pic = eqPhotoBag(m.id).machine;
      const thumb = pic
        ? `<img class="eq-thumb" src="${pic}" alt="">`
        : `<span class="eq-thumb empty">사진</span>`;
      return `<a class="date-line eq-line" href="#/${mod.id}/${ym}/${m.id}">
        ${thumb}
        <strong>${h(m.name)}</strong>
        <span>${h(m.no || "")} · 점검표</span>
      </a>`;
    }).join("");
    return `<div class="bar compact-bar"><b>${h(g)}</b></div><div class="date-list">${lines}</div>`;
  }).join("");
  return `
    <div class="head compact-head"><div><h1>${h(mod.title)}</h1>
      <p class="crumbs">${crumbTrail([
        { href: `#/${mod.id}`, label: t(mod.title) },
        { href: `#/${mod.id}/${yearOf(ym)}`, label: yearLabel(yearOf(ym)) },
        { label: monthFolderLabel(ym) },
      ])}</p>
      <p>설비를 누르면 설비일상점검표가 열립니다. 사진과 연·월은 표에서 넣습니다.</p></div>
      <div class="head-actions">
        ${timeFolderActions(mod)}
      </div></div>
    <section class="panel dates-panel">${blocks}</section>`;
}

function eqRoute(date, extra) {
  if (MACHINES.some((m) => m.id === date) && !extra) return { ym: thisMonth(), machineId: date };
  if (extra) return { ym: monthKey(date) || thisMonth(), machineId: extra };
  return { ym: monthKey(date) || thisMonth(), machineId: "" };
}

function eqPhotoBag(id) {
  if (!state.eqPhotos) state.eqPhotos = {};
  const cur = state.eqPhotos[id];
  if (!cur) state.eqPhotos[id] = { machine: "", items: {} };
  else if (typeof cur === "string") state.eqPhotos[id] = { machine: cur, items: {} };
  if (!state.eqPhotos[id].items) state.eqPhotos[id].items = {};
  return state.eqPhotos[id];
}

function eqPack(ym, id) {
  const m = MACHINES.find((x) => x.id === id) || { name: "", no: "", model: "", process: "" };
  if (!state.equipment[ym] || typeof state.equipment[ym] !== "object") state.equipment[ym] = {};
  let pack = state.equipment[ym][id];
  if (!pack || pack.checks) {
    pack = {
      no: pack?.no || m.no || "",
      name: pack?.name || m.name || "",
      model: pack?.model || m.model || "",
      process: pack?.process || m.process || "MCT 가공",
      writer: pack?.writer || "",
      approver: pack?.approver || "",
      owner: pack?.owner || pack?.inspector || "",
      remark: pack?.remark || "",
      cells: pack?.cells || {},
      issues: pack?.issues || [{}, {}, {}, {}, {}],
    };
    state.equipment[ym][id] = pack;
  }
  if (!pack.cells) pack.cells = {};
  if (!Array.isArray(pack.issues)) pack.issues = [];
  while (pack.issues.length < 5) pack.issues.push({});
  return pack;
}

function eqCell(pack, itemId, day) {
  return pack.cells?.[itemId]?.[day] ?? pack.cells?.[itemId]?.[String(day)] ?? "";
}

function eqSheetView(mod, ym, machineId) {
  const month = monthKey(ym) || thisMonth();
  const [year, mon] = month.split("-").map(Number);
  const n = daysInMonth(month);
  const machine = MACHINES.find((m) => m.id === machineId);
  if (!machine) return eqView(mod, month);
  const pack = eqPack(month, machineId);
  const pics = eqPhotoBag(machineId);
  const y0 = new Date().getFullYear();
  const years = Array.from({ length: 8 }, (_, i) => y0 - 4 + i);
  if (!years.includes(year)) years.push(year);
  years.sort((a, b) => a - b);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const dayHeads = days.map((d) => `<th class="${d > n ? "off" : ""}">${d}</th>`).join("");
  const guide = EQ_ITEMS.map((item) => {
    const src = pics.items[item.id];
    return `<td>
      <b>${item.no} ${h(item.name)}</b>
      <div class="eq-shot-box">
        <label class="eq-shot">
          ${src ? `<img src="${src}" alt="">` : `<span>사진 넣기</span>`}
          <input data-eq-item-pic="${item.id}" type="file" accept="image/*" hidden>
        </label>
        ${src ? picDel(`data-eq-del="${item.id}"`) : ""}
      </div>
      <p>${h(item.criteria)}</p>
    </td>`;
  }).join("");
  const body = EQ_ITEMS.map((item) => {
    const cells = days.map((d) => {
      if (d > n) return `<td class="off"></td>`;
      const val = eqCell(pack, item.id, d);
      if (item.kind === "text") {
        return `<td><input data-eq-cell data-item="${item.id}" data-day="${d}" value="${h(val)}"></td>`;
      }
      return `<td class="eq-mark${val ? " on" : ""}" data-eq-mark data-item="${item.id}" data-day="${d}" type="button">${h(val)}</td>`;
    }).join("");
    return `<tr>
      <th>${item.no}</th>
      <td class="item">${h(item.item)}</td>
      <td class="cyc">${h(item.cycle)}</td>
      ${cells}
    </tr>`;
  }).join("");
  const issues = pack.issues.map((row, i) => `<tr>
    <td><input data-eq-issue="${i}" data-k="at" value="${h(row.at || "")}"></td>
    <td><input data-eq-issue="${i}" data-k="who" value="${h(row.who || "")}"></td>
    <td><input data-eq-issue="${i}" data-k="problem" value="${h(row.problem || "")}"></td>
    <td><input data-eq-issue="${i}" data-k="action" value="${h(row.action || "")}"></td>
    <td><input data-eq-issue="${i}" data-k="down" value="${h(row.down || "")}"></td>
  </tr>`).join("");
  const machinePic = pics.machine;
  return `
    <div class="print-page">
      ${a4Tools(`#/${mod.id}/${ym}`, `
        <button class="btn ghost" id="eq-prev" type="button">${ht("이전달")}</button>
        <button class="btn ghost" id="eq-next" type="button">${ht("다음달")}</button>
      `)}
      <div class="a4-wrap page">
        <article class="a4-sheet month-sheet eq-sheet">
          <header class="eq-head">
            <div class="eq-head-left">
              <div class="eq-ym no-print">
                <select id="eq-y">${years.map((y) => `<option value="${y}" ${y === year ? "selected" : ""}>${y}</option>`).join("")}</select>
                <span>년</span>
                <select id="eq-m">${Array.from({ length: 12 }, (_, i) => i + 1).map((m) => `<option value="${m}" ${m === mon ? "selected" : ""}>${m}</option>`).join("")}</select>
                <span>월</span>
              </div>
              <p class="eq-ym-print">${year}년 ${mon}월</p>
            </div>
            <h1>설비 일상점검표</h1>
            <table class="eq-stamp">
              <tr><th>작성</th><th>승인</th></tr>
              <tr><td><input data-eq-k="writer" value="${h(pack.writer || "")}"></td><td><input data-eq-k="approver" value="${h(pack.approver || "")}"></td></tr>
            </table>
          </header>
          <table class="eq-info">
            <tr>
              <th>관리번호</th><td><input data-eq-k="no" value="${h(pack.no || "")}"></td>
              <th>설비명</th><td><input data-eq-k="name" value="${h(pack.name || "")}"></td>
              <th>모델명</th><td><input data-eq-k="model" value="${h(pack.model || "")}"></td>
              <th>공정명</th><td><input data-eq-k="process" value="${h(pack.process || "")}"></td>
            </tr>
          </table>
          <table class="eq-guide">
            <thead><tr><th colspan="6">점검항목 · 점검위치 (사진 칸을 누르면 넣고, ×로 뺍니다)</th></tr></thead>
            <tbody><tr>${guide}</tr></tbody>
          </table>
          <table class="eq-grid">
            <thead>
              <tr>
                <th rowspan="2">NO</th>
                <th rowspan="2">관리항목</th>
                <th rowspan="2">점검주기</th>
                <th colspan="31">일</th>
              </tr>
              <tr>${dayHeads}</tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
          <div class="eq-bottom">
            <div class="eq-hist">
              <div class="eq-hist-h">문제 발생 조치 이력 <span>(설비 이상 발생 시 즉시 생산담당자에게 보고하고 바로 조치한다)</span></div>
              <table>
                <thead><tr><th>일시</th><th>발견자</th><th>문제점</th><th>조치사항</th><th>비가동시간</th></tr></thead>
                <tbody>${issues}</tbody>
              </table>
              <p class="eq-legend">범례 : O 양호 &nbsp; X 이상 &nbsp; △ 교환 &nbsp; V 보충</p>
              <div class="eq-foot-fields">
                <label>담당자 <input data-eq-k="owner" value="${h(pack.owner || "")}"></label>
                <label>비고 <input data-eq-k="remark" value="${h(pack.remark || "")}"></label>
              </div>
            </div>
            <div class="eq-machine">
              <b>설비사진</b>
              <label class="eq-machine-body">
                ${machinePic ? `<img src="${machinePic}" alt="">` : `<span>사진을 넣으세요</span>`}
                <input id="eq-photo" type="file" accept="image/*" hidden>
              </label>
              ${machinePic ? picDel(`data-eq-del="machine"`) : ""}
            </div>
          </div>
        </article>
      </div>
    </div>`;
}

function camFileStem(name) {
  return String(name || "").replace(/\.[^.]+$/, "").toLowerCase();
}

function camMethod(name, cuts) {
  if (cuts >= 2 && /\.nci$/i.test(name)) return "NCI 해석";
  if (cuts >= 2 && /\.(nc|cnc|tap|iso|eia|min|ncc)$/i.test(name)) return "NC 해석";
  if (cuts >= 2 && /\.mc[89]$/i.test(name)) return "MC9 추출";
  if (/\.mc[89]$/i.test(name)) return "MC9 원본";
  return cuts >= 2 ? "NC 해석" : "파일 등록";
}

function camPartName(fileName, parsed) {
  const fromFile = String(fileName || "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  const fromParse = String(parsed?.partName || "").trim();
  if (fromParse && fromParse.toLowerCase() !== fromFile.toLowerCase()) return fromParse;
  return fromParse || fromFile || fileName;
}

function camJobFields(file, parsed) {
  const cuts = (parsed?.points || []).filter((p) => !p.rapid && !p.change).length;
  return {
    ...(parsed || {}),
    name: file.name,
    partName: camPartName(file.name, parsed),
    fromNc: cuts >= 2,
    method: camMethod(file.name, cuts),
    tools: parsed?.tools || [],
    cutMm: Number(parsed?.cutMm) || 0,
    timeMin: Number(parsed?.timeMin) || 0,
    points: parsed?.points || [],
  };
}

function cutCount(job) {
  return (job?.points || []).filter((p) => !p.rapid && !p.change).length;
}

function camRank(name) {
  if (/\.nci$/i.test(name)) return 3;
  if (/\.(nc|cnc|tap|iso|eia|min|ncc)$/i.test(name)) return 2;
  if (/\.mc[89]$/i.test(name)) return 1;
  return 0;
}

function camCount(folderId) {
  const files = (state.cam.files || []).filter((f) => f.folderId === folderId).length;
  const jobs = (state.cam.jobs || []).filter((j) => (j.folderId || "cam-root") === folderId).length;
  return Math.max(files, jobs);
}

function camDay(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}. ${m[2]}. ${m[3]}` : (iso || "—");
}

function camHash(folderId) {
  return (!folderId || folderId === "cam-root") ? "#/mastercam" : `#/mastercam/${folderId}`;
}

function applyCamRoute(seg) {
  const hit = (state.cam.folders || []).find((f) => f.id === seg);
  camFolder = hit ? hit.id : "cam-root";
}

function goCam(folderId) {
  const id = folderId || "cam-root";
  camFolder = id;
  persist();
  const next = camHash(id);
  if (location.hash === next) render();
  else location.hash = next;
}

async function removeCamFile(id) {
  const meta = (state.cam.files || []).find((f) => f.id === id);
  state.cam.files = (state.cam.files || []).filter((f) => f.id !== id);
  state.cam.jobs = (state.cam.jobs || []).filter((j) => j.fileId !== id);
  if (meta) {
    const stem = camFileStem(meta.name);
    state.cam.jobs = (state.cam.jobs || []).filter((j) => !(j.folderId === meta.folderId && camFileStem(j.name) === stem && j.date === meta.date));
  }
  await removeBlob(id).catch(() => {});
}

async function removeCamJob(id) {
  const job = (state.cam.jobs || []).find((j) => j.id === id);
  state.cam.jobs = (state.cam.jobs || []).filter((j) => j.id !== id);
  if (job?.fileId) await removeCamFile(job.fileId);
}

function camView(mod) {
  const folder = state.cam.folders.find((f) => f.id === camFolder) || state.cam.folders[0];
  const atRoot = !folder.parent;
  const kids = state.cam.folders.filter((f) => f.parent === folder.id);
  const files = state.cam.files.filter((f) => f.folderId === folder.id);
  const jobs = (state.cam.jobs || [])
    .filter((j) => (j.folderId || "cam-root") === folder.id)
    .slice()
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(a.name || "").localeCompare(String(b.name || "")));
  const jobRows = jobs.map((j) => `<tr>
    <td class="act">
      <button class="btn sm" data-job="${j.id}" type="button">수정</button>
      <button class="btn sm" data-del-job="${j.id}" type="button">삭제</button>
    </td>
    <td>${h(j.name)}</td><td>${h(j.partName || camPartName(j.name, j))}</td>
    <td>${h(camDay(j.date))}</td>
    <td>${(j.tools || []).join(", ") || "—"}</td>
    <td>${j.cutMm ? `${j.cutMm} mm` : "—"}</td>
    <td>${j.timeMin ? `${j.timeMin} 분` : "—"}</td>
    <td>${h(j.method || camMethod(j.name, cutCount(j)))}</td>
  </tr>`).join("");
  const path = atRoot ? "업체를 고른 뒤 프로그램을 넣습니다." : `${h(folder.name)} · 프로그램은 넣은 날이 자동으로 적힙니다.`;
  const headActs = atRoot
    ? `<button class="btn sm" id="nf" type="button">업체 추가</button>`
    : `<label class="btn sm">프로그램 넣기<input id="upl" type="file" multiple hidden></label>
      <button class="btn ghost sm" id="up" type="button">업체 목록</button>`;
  return `<div class="head"><div><h1>${h(mod.title)}</h1><p>${path}</p></div>
    <div class="head-actions">
      ${saveNote()}
      <button class="btn sm" id="folder-save" type="button">${ht("저장")}</button>
      ${headActs}
      <a class="btn sm" href="./cam-lab.html?v=37">가공 프로그램</a>
    </div></div>
    <section class="panel">
      <p class="mute pad">${atRoot
    ? "참테크, 인텔릭스처럼 업체를 연 다음 프로그램을 넣으세요. 들어온 날은 오늘로 적힙니다."
    : `${h(folder.name)}에 마스터캠 9.1 파일(.mc9, .nci, .nc)을 넣으세요. 들어온 날은 오늘로 적힙니다.`}</p>
      <div class="cam-list">
        ${kids.map((f) => `<div class="cam-row">
          <button class="folder-open cam-row-main" data-open="${f.id}" type="button">
            <b>${h(f.name)}</b>
            <span>${camCount(f.id)}개 프로그램</span>
          </button>
          <button class="btn sm" data-del-folder="${f.id}" type="button">삭제</button>
        </div>`).join("")}
        ${files.map((f) => `<div class="cam-row">
          <b class="cam-row-main">${h(f.name)}</b>
          <span>${h(camDay(f.date))}</span>
          <span class="file-acts">
            <button class="btn sm" data-dl="${f.id}" type="button">받기</button>
            <button class="btn sm" data-del-file="${f.id}" type="button">삭제</button>
          </span>
        </div>`).join("")}
      </div>
    </section>
    ${atRoot ? "" : `<section class="panel">
      <div class="bar"><b>${h(folder.name)} 프로그램</b></div>
      <div class="scroll"><table class="rows"><thead><tr><th></th><th>프로그램</th><th>품명</th><th>들어온 날</th><th>공구</th><th>절삭</th><th>예상 시간</th><th>방식</th></tr></thead>
      <tbody>${jobRows || `<tr><td colspan="8">이 업체에 올린 프로그램이 없습니다.</td></tr>`}</tbody></table></div>
    </section>`}`;
}

function bindTimeFolderClicks(mod) {
  document.getElementById("open-month")?.addEventListener("click", () => form(
    "월 폴더",
    [{ key: "date", label: "연월", type: "month" }],
    { date: thisMonth() },
    (v) => {
      const key = monthKey(v.date) || v.date;
      remember(mod.id, key);
      persist();
      location.hash = `#/${mod.id}/${key}`;
      render();
    }
  ));
  document.getElementById("open-date")?.addEventListener("click", () => form(
    "날짜 폴더",
    [{ key: "date", label: "날짜", type: "date" }],
    { date: todayISO() },
    (v) => {
      remember(mod.id, v.date);
      persist();
      location.hash = `#/${mod.id}/${v.date}`;
      render();
    }
  ));
  bindSaveButton();
}

function bindModule(mod, date, extra) {
  if (mod.type === "records") {
    bindRecords(date, extra);
    return;
  }
  if (mod.type === "chat") {
    bindChat(state, persist, render, date);
    return;
  }
  if (mod.type === "mastercam") return bindCam();
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
  const browsing = !date || isYearKey(date) || (isMonthKey(date) && !isMonthFolder(mod) && mod.type !== "inbound" && mod.type !== "equipment");
  if (browsing) {
    bindTimeFolderClicks(mod);
    if (isMonthKey(date) && isSheetMod(mod) && mod.type !== "delivery" && mod.type !== "inbound") bindFolderBrowse(mod);
    if (mod.type === "equipment" && isMonthKey(date)) return bindEq(date, extra);
    return;
  }
  remember(mod.id, date);
  if (!sheetDirty) persist();
  if (mod.type === "climate" || mod.type === "lab-climate") {
    if (extra === "map") return bindClimate(mod, date);
    return bindShopClimate(mod);
  }
  if (mod.type === "five-s" || mod.type === "lab-5s") return bindShopFiveS(mod);
  if (mod.type === "inbound") return bindInboundMonth(mod, date);
  if (mod.type === "delivery") return bindDeliveryDay(mod, date);
  if (mod.type === "equipment") return bindEq(date, extra);
  bindRows(mod, date, extra);
}

function bindFolderBrowse(mod) {
  document.getElementById("add-row")?.addEventListener("click", () => {
    const d = todayISO();
    const row = addBlank(mod, d);
    persist();
    location.hash = `#/${mod.id}/${d}/${row.id}`;
  });
  root.querySelectorAll("[data-add-date]").forEach((b) => {
    b.onclick = () => {
      const d = b.dataset.addDate;
      const row = addBlank(mod, d);
      persist();
      location.hash = `#/${mod.id}/${d}/${row.id}`;
    };
  });
  bindSaveButton();
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
  bindSaveButton();
}

function bindInboundMonth(mod, date) {
  const ym = monthKey(date) || date;
  document.getElementById("qa-print")?.addEventListener("click", printSheet);
  document.getElementById("add-row")?.addEventListener("click", () => {
    addBlank(mod, ym);
    markDirty();
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
      syncPrintDate(el);
      remember(mod.id, ym);
      markDirty();
    };
  });
  root.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = () => {
      if (!confirm(t("삭제할까요?"))) return;
      state.records[mod.id] = (state.records[mod.id] || []).filter((x) => x.id !== b.dataset.del);
      markDirty();
      render();
    };
  });
  bindSaveButton();
}

function bindDeliveryDay(mod, date) {
  document.getElementById("qa-print")?.addEventListener("click", printSheet);
  document.getElementById("add-row")?.addEventListener("click", () => {
    addBlank(mod, date);
    markDirty();
    render();
  });
  const saveHead = (el) => {
    if (!state.deliveryMeta) state.deliveryMeta = {};
    const cur = { ...deliveryHead(date) };
    cur[el.dataset.head] = el.value;
    state.deliveryMeta[date] = cur;
    if (el.dataset.head === "customer") {
      (state.records[mod.id] || []).filter((r) => r.date === date).forEach((r) => { r.customer = el.value; });
    }
    remember(mod.id, date);
    markDirty();
  };
  root.querySelectorAll("[data-head]").forEach((el) => {
    el.onchange = () => saveHead(el);
    el.oninput = () => saveHead(el);
  });
  const refreshMoney = () => {
    const list = state.records[mod.id] || [];
    let sum = 0;
    list.filter((r) => r.date === date).forEach((r) => {
      const cell = root.querySelector(`[data-amt="${r.id}"]`);
      if (cell) cell.textContent = deliveryUsed(r) ? moneyText(deliveryAmount(r)) : "";
      if (deliveryUsed(r)) sum += deliveryAmount(r);
    });
    const tot = root.querySelector("[data-total]");
    if (tot) tot.textContent = moneyText(sum);
  };
  root.querySelectorAll("[data-in]").forEach((el) => {
    const save = () => {
      const row = (state.records[mod.id] || []).find((x) => x.id === el.dataset.in);
      if (!row) return;
      const key = el.dataset.k;
      if (!key) return;
      row[key] = (key === "qty" || key === "price") && el.value !== "" ? Number(el.value) : el.value;
      row.date = date;
      if ((key === "qty" || key === "price") && row.qty && !row.unit) {
        row.unit = "EA";
        const unitEl = root.querySelector(`[data-in="${row.id}"][data-k="unit"]`);
        if (unitEl && !unitEl.value) unitEl.value = "EA";
      }
      if (key === "qty" || key === "price") row.amount = deliveryAmount(row);
      remember(mod.id, date);
      markDirty();
      refreshMoney();
    };
    el.onchange = save;
    el.oninput = save;
  });
  root.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = () => {
      if (!confirm(t("삭제할까요?"))) return;
      state.records[mod.id] = (state.records[mod.id] || []).filter((x) => x.id !== b.dataset.del);
      markDirty();
      render();
    };
  });
  bindSaveButton();
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
  if (mod.type === "delivery") {
    row.customer = "";
    row.status = "";
    row.unit = "";
    row.price = "";
    row.date = date || todayISO();
  }
  if (mod.type === "quality") {
    row.millCompany = "디오엠";
    row.customer = CUSTOMERS[0];
    row.status = "합격";
    qaMeasures(row);
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
  if (mod.type === "inbound" || mod.type === "delivery") state.records[mod.id].push(row);
  else state.records[mod.id].unshift(row);
  remember(mod.id, recDate(row, mod.type) || date);
  return row;
}

function bindSheet(mod, id) {
  const row = (state.records[mod.id] || []).find((x) => x.id === id);
  const formEl = document.getElementById("sheet-form");
  document.getElementById("qa-print")?.addEventListener("click", printSheet);
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
    formEl.querySelectorAll('input[type="date"]').forEach(syncPrintDate);
    remember(mod.id, recDate(row, mod.type));
    markDirty();
  };
  formEl?.addEventListener("change", save);
  formEl?.addEventListener("input", (e) => {
    if (mod.type === "process" && (e.target.name === "planQty" || e.target.name === "doneQty")) save();
    if (mod.type === "quality" && e.target.dataset.qaM != null) {
      const i = Number(e.target.dataset.qaM);
      const k = e.target.dataset.k;
      if (!row.measures) qaMeasures(row);
      if (!row.measures[i]) row.measures[i] = { item: "", spec: "", v1: "", v2: "", v3: "", note: "" };
      row.measures[i][k] = e.target.value;
      markDirty();
    }
  });
  root.querySelectorAll("[data-qa-pic]").forEach((el) => {
    el.onchange = async () => {
      if (!row || !el.files?.[0]) return;
      const i = Number(el.dataset.qaPic);
      row.photos = Array.from({ length: 3 }, (_, n) => (row.photos || [])[n] || "");
      row.photos[i] = await readAsDataUrl(el.files[0]);
      markDirty();
      render();
    };
  });
  root.querySelectorAll("[data-qa-del]").forEach((b) => {
    b.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!row) return;
      const i = Number(b.dataset.qaDel);
      row.photos = Array.from({ length: 3 }, (_, n) => (row.photos || [])[n] || "");
      row.photos[i] = "";
      markDirty();
      render();
    };
  });
  root.querySelectorAll("[data-pic-del]").forEach((b) => {
    b.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!row) return;
      const i = Number(b.dataset.picDel);
      row.photos = (row.photos || []).filter(Boolean).filter((_, n) => n !== i);
      markDirty();
      render();
    };
  });
  document.getElementById("sheet-photos")?.addEventListener("change", async (e) => {
    if (!row) return;
    if (mod.type === "quality") {
      row.photos = Array.from({ length: 3 }, (_, n) => (row.photos || [])[n] || "");
      for (const f of e.target.files) {
        const slot = row.photos.findIndex((p) => !p);
        if (slot < 0) break;
        row.photos[slot] = await readAsDataUrl(f);
      }
    } else {
      row.photos = row.photos || [];
      for (const f of e.target.files) row.photos.push(await readAsDataUrl(f));
    }
    markDirty();
    render();
  });
  bindSaveButton(save);
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
  const photoDraft = [...(val.photos || [])].filter(Boolean);
  if (mod.type === "quality" || mod.type === "defect") {
    extra = `<label>사진<input id="photos" type="file" accept="image/*" multiple></label><div class="pics" id="prev"></div>`;
  }
  if (mod.type === "process") {
    extra = `<p class="mute" id="prog-hint">진행률은 계획 수량과 완료 수량으로 자동 계산됩니다.</p>
      <label>작업 사진<input id="photos" type="file" accept="image/*" multiple></label>
      <div class="pics" id="prev"></div>`;
  }
  form(row ? "수정" : "추가", formFields, val, async (data) => {
    const next = { ...(row || { id: uid("r"), photos: [] }), ...cast(formFields, data) };
    if (mod.type === "process") {
      next.progress = processProgress(next.planQty, next.doneQty);
      if (next.progress >= 100) next.status = next.status && next.status !== "가동" ? next.status : "완료";
      else if (!next.status || next.status === "완료") next.status = next.progress > 0 ? "가동" : "예정";
    }
    if (mod.type === "quality" || mod.type === "defect" || mod.type === "process") {
      next.photos = [...photoDraft];
    }
    if (!state.records[mod.id]) state.records[mod.id] = [];
    remember(mod.id, recDate(next, mod.type) || date);
    if (row) Object.assign(row, next); else state.records[mod.id].unshift(next);
    persist(); render();
  }, extra);
  bindPhotoDraft(photoDraft);
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
  document.getElementById("qa-print")?.addEventListener("click", printSheet);
  root.querySelectorAll("[data-iso][data-id]").forEach((el) => el.onchange = () => {
    setMonthCheck(mod, el.dataset.k, el.dataset.iso, el.dataset.id, el.checked);
    const mark = el.parentElement?.querySelector(".print-mark");
    if (mark) mark.textContent = el.checked ? "✓" : "";
    el.closest("td")?.classList.toggle("on", el.checked);
    markDirty();
  });
  bindSaveButton();
}

function bindShopClimate(mod) {
  const monthOf = () => {
    const y = document.getElementById("clim-y")?.value;
    const m = document.getElementById("clim-m")?.value;
    if (!y || !m) return thisMonth();
    return `${y}-${String(Number(m)).padStart(2, "0")}`;
  };
  const go = (ym) => {
    remember(mod.id, ym);
    const next = `#/${mod.id}/${ym}`;
    if (location.hash.replace(/^#\/?/, "") === `${mod.id}/${ym}`) render();
    else location.hash = next;
  };
  document.getElementById("qa-print")?.addEventListener("click", printSheet);
  document.getElementById("clim-prev")?.addEventListener("click", () => go(shiftMonth(monthOf(), -1)));
  document.getElementById("clim-next")?.addEventListener("click", () => go(shiftMonth(monthOf(), 1)));
  document.getElementById("clim-y")?.addEventListener("change", () => go(monthOf()));
  document.getElementById("clim-m")?.addEventListener("change", () => go(monthOf()));
  const pack = climPack(mod, monthOf());
  root.querySelectorAll("[data-clim]").forEach((el) => {
    el.onclick = () => {
      const kind = el.dataset.clim;
      const day = el.dataset.day;
      const val = Number(el.dataset.val);
      const cur = pack[kind][day] ?? pack[kind][String(day)];
      if (cur !== "" && cur != null && Number(cur) === val) {
        delete pack[kind][day];
        delete pack[kind][String(day)];
      } else {
        pack[kind][day] = val;
      }
      root.querySelectorAll(`[data-clim="${kind}"][data-day="${day}"]`).forEach((cell) => {
        const on = Number(cell.dataset.val) === Number(pack[kind][day]);
        cell.textContent = on ? "X" : "";
        cell.classList.toggle("on", on);
      });
      markDirty();
    };
  });
  root.querySelectorAll("[data-clim-lux]").forEach((el) => {
    el.oninput = () => {
      pack.lux[el.dataset.day] = el.value;
      markDirty();
    };
  });
  root.querySelectorAll("[data-clim-k]").forEach((el) => {
    el.oninput = () => {
      pack[el.dataset.climK] = el.value;
      markDirty();
    };
  });
  bindSaveButton();
}

function bindShopFiveS(mod) {
  const { key } = monthItems(mod);
  const monthOf = () => {
    const y = document.getElementById("five-y")?.value;
    const m = document.getElementById("five-m")?.value;
    if (!y || !m) return thisMonth();
    return `${y}-${String(Number(m)).padStart(2, "0")}`;
  };
  const go = (ym) => {
    remember(mod.id, ym);
    const next = `#/${mod.id}/${ym}`;
    if (location.hash.replace(/^#\/?/, "") === `${mod.id}/${ym}`) render();
    else location.hash = next;
  };
  document.getElementById("qa-print")?.addEventListener("click", printSheet);
  document.getElementById("five-prev")?.addEventListener("click", () => go(shiftMonth(monthOf(), -1)));
  document.getElementById("five-next")?.addEventListener("click", () => go(shiftMonth(monthOf(), 1)));
  document.getElementById("five-y")?.addEventListener("change", () => go(monthOf()));
  document.getElementById("five-m")?.addEventListener("change", () => go(monthOf()));
  root.querySelectorAll("[data-iso][data-id][type='checkbox']").forEach((el) => {
    el.onchange = () => {
      setMonthCheck(mod, el.dataset.k, el.dataset.iso, el.dataset.id, el.checked);
      const mark = el.parentElement?.querySelector(".print-mark");
      if (mark) mark.textContent = el.checked ? "✓" : "";
      el.closest("td")?.classList.toggle("on", el.checked);
      markDirty();
    };
  });
  root.querySelectorAll("[data-five-name]").forEach((el) => {
    el.onchange = () => {
      const iso = el.dataset.iso;
      if (!state.fiveS.dates[iso]) state.fiveS.dates[iso] = { shop: {}, lab: {} };
      if (!state.fiveS.dates[iso][key]) state.fiveS.dates[iso][key] = {};
      state.fiveS.dates[iso][key][el.dataset.id] = el.value;
      markDirty();
    };
  });
  root.querySelector("[data-five-note]")?.addEventListener("change", (e) => {
    if (key === "lab") {
      if (!state.fiveS.labNotes) state.fiveS.labNotes = {};
      state.fiveS.labNotes[monthOf()] = e.target.value;
    } else {
      if (!state.fiveS.notes) state.fiveS.notes = {};
      state.fiveS.notes[monthOf()] = e.target.value;
    }
    markDirty();
  });
  bindSaveButton();
}

function bindEq(date, machineId) {
  const eq = eqRoute(date, machineId);
  const ym = eq.ym;
  const id = eq.machineId;
  if (!id) {
    bindSaveButton();
    return;
  }
  const pack = eqPack(ym, id);
  const go = (nextYm) => {
    remember("equipment", nextYm);
    location.hash = `#/equipment/${nextYm}/${id}`;
  };
  const monthOf = () => {
    const y = document.getElementById("eq-y")?.value;
    const m = document.getElementById("eq-m")?.value;
    if (!y || !m) return ym;
    return `${y}-${String(Number(m)).padStart(2, "0")}`;
  };
  document.getElementById("qa-print")?.addEventListener("click", printSheet);
  document.getElementById("eq-prev")?.addEventListener("click", () => go(shiftMonth(monthOf(), -1)));
  document.getElementById("eq-next")?.addEventListener("click", () => go(shiftMonth(monthOf(), 1)));
  document.getElementById("eq-y")?.addEventListener("change", () => go(monthOf()));
  document.getElementById("eq-m")?.addEventListener("change", () => go(monthOf()));
  const save = () => markDirty();
  root.querySelectorAll("[data-eq-k]").forEach((el) => {
    el.onchange = () => { pack[el.dataset.eqK] = el.value; save(); };
  });
  root.querySelectorAll("[data-eq-cell]").forEach((el) => {
    el.onchange = () => {
      const item = el.dataset.item;
      if (!pack.cells[item]) pack.cells[item] = {};
      pack.cells[item][el.dataset.day] = el.value;
      save();
    };
  });
  root.querySelectorAll("[data-eq-mark]").forEach((el) => {
    el.onclick = () => {
      const item = el.dataset.item;
      if (!pack.cells[item]) pack.cells[item] = {};
      const cur = pack.cells[item][el.dataset.day] || "";
      const next = EQ_MARKS[(EQ_MARKS.indexOf(cur) + 1) % EQ_MARKS.length];
      pack.cells[item][el.dataset.day] = next;
      el.textContent = next;
      el.classList.toggle("on", Boolean(next));
      save();
    };
  });
  root.querySelectorAll("[data-eq-issue]").forEach((el) => {
    el.onchange = () => {
      const i = Number(el.dataset.eqIssue);
      if (!pack.issues[i]) pack.issues[i] = {};
      pack.issues[i][el.dataset.k] = el.value;
      save();
    };
  });
  const setPic = async (key, file) => {
    if (!file) return;
    const bag = eqPhotoBag(id);
    const url = await readAsDataUrl(file);
    if (key === "machine") bag.machine = url;
    else bag.items[key] = url;
    markDirty();
    render();
  };
  document.getElementById("eq-photo")?.addEventListener("change", (e) => setPic("machine", e.target.files?.[0]));
  root.querySelectorAll("[data-eq-item-pic]").forEach((el) => {
    el.onchange = (e) => setPic(el.dataset.eqItemPic, e.target.files?.[0]);
  });
  root.querySelectorAll("[data-eq-del]").forEach((b) => {
    b.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const bag = eqPhotoBag(id);
      const key = b.dataset.eqDel;
      if (key === "machine") bag.machine = "";
      else delete bag.items[key];
      markDirty();
      render();
    };
  });
  bindSaveButton();
}

function bindCam() {
  const folder = state.cam.folders.find((f) => f.id === camFolder);
  if (folder?.parent) {
    hydrateCamJobs(folder.id).then((dirty) => { if (dirty) render(); });
  }
  document.getElementById("up")?.addEventListener("click", () => goCam("cam-root"));
  document.getElementById("nf")?.addEventListener("click", () => {
    const name = prompt("업체 이름"); if (!name) return;
    const parent = camFolder || "cam-root";
    if ((state.cam.folders || []).some((f) => f.parent === parent && f.name === name.trim())) {
      alert("같은 이름 업체가 있습니다.");
      return;
    }
    state.cam.folders.push({ id: uid("c"), name: name.trim(), parent }); persist(); render();
  });
  document.getElementById("upl")?.addEventListener("change", async (e) => {
    await putCamFiles(e.target.files);
    e.target.value = "";
  });
  root.querySelectorAll("[data-open]").forEach((b) => {
    b.onclick = () => goCam(b.dataset.open);
  });
  root.querySelectorAll("[data-job]").forEach((b) => b.onclick = () => {
    const job = (state.cam.jobs || []).find((j) => j.id === b.dataset.job);
    if (!job) return;
    form("수정", [
      { key: "name", label: "프로그램", type: "text" },
      { key: "partName", label: "품명", type: "text" },
      { key: "date", label: "들어온 날", type: "date" },
    ], { ...job, date: job.date || todayISO() }, (v) => {
      job.name = v.name || job.name;
      job.partName = v.partName || job.partName;
      job.date = v.date || job.date || todayISO();
      const meta = (state.cam.files || []).find((f) => f.id === job.fileId);
      if (meta) meta.date = job.date;
      persist(); render();
    });
  });
  const camPanel = root.querySelector("section.panel");
  if (camPanel && state.cam.folders.find((f) => f.id === camFolder)?.parent) {
    const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    camPanel.addEventListener("dragover", stop);
    camPanel.addEventListener("drop", async (ev) => {
      stop(ev);
      await putCamFiles(ev.dataTransfer?.files);
    });
  }
  root.querySelectorAll("[data-dl]").forEach((b) => b.onclick = async () => {
    const meta = state.cam.files.find((f) => f.id === b.dataset.dl);
    const blob = await loadBlob(meta.id); if (!blob) return alert("없음");
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = meta.name; a.click();
  });
  root.querySelectorAll("[data-del-file]").forEach((b) => b.onclick = async () => {
    const meta = state.cam.files.find((f) => f.id === b.dataset.delFile);
    if (!meta || !confirm(`‘${meta.name}’을 지울까요?`)) return;
    await removeCamFile(meta.id);
    persist(); render();
  });
  root.querySelectorAll("[data-del-job]").forEach((b) => b.onclick = async () => {
    const job = (state.cam.jobs || []).find((j) => j.id === b.dataset.delJob);
    if (!job || !confirm(`‘${job.partName || job.name}’을 지울까요?`)) return;
    await removeCamJob(job.id);
    persist(); render();
  });
  const dropFolder = async (id) => {
    const row = state.cam.folders.find((f) => f.id === id);
    if (!row || row.id === "cam-root" || !confirm(`‘${row.name}’ 폴더와 안의 프로그램을 지울까요?`)) return;
    const ids = new Set([id, ...(state.cam.folders || []).filter((f) => f.parent === id).map((f) => f.id)]);
    const files = (state.cam.files || []).filter((f) => ids.has(f.folderId));
    for (const f of files) await removeCamFile(f.id);
    state.cam.jobs = (state.cam.jobs || []).filter((j) => !ids.has(j.folderId || "cam-root"));
    state.cam.folders = (state.cam.folders || []).filter((f) => !ids.has(f.id));
    persist();
    if (ids.has(camFolder)) goCam(row.parent || "cam-root");
    else render();
  };
  root.querySelectorAll("[data-del-folder]").forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    dropFolder(b.dataset.delFolder);
  });
  bindSaveButton();
}

function isCamNc(name, type) {
  return mayBeCamFile(name, type);
}

async function readNcText(file) {
  const size = Math.min(file.size || 0, 40_000_000);
  const buf = await file.slice(0, size || 1).arrayBuffer().catch(() => null);
  if (!buf) return "";
  return decodeCamFile(buf, file.name);
}

async function putCamFiles(fileList) {
  const cur = state.cam.folders.find((f) => f.id === camFolder);
  if (!cur?.parent) {
    alert("업체를 먼저 고른 뒤 프로그램을 넣으세요.");
    return;
  }
  try {
    const result = await ingestCamBatch(fileList, todayISO());
    persist();
    render();
    if (!result.tried) alert("마스터캠 9.1 프로그램 파일(.mc9, .nci, .nc)을 넣으세요.");
    else if (!result.jobs) alert("파일은 들어갔습니다. 품명·시간은 파일 이름으로 올렸습니다. NCI 또는 NC를 같이 넣으면 경로가 채워집니다.");
  } catch (err) {
    alert(err.message || "프로그램을 넣을 수 없습니다.");
  }
}

async function ingestCamBatch(fileList, date = todayISO()) {
  const files = [...(fileList || [])].filter((f) => f && f.size && isCamNc(f.name, f.type));
  if (!files.length) return { tried: 0, files: 0, jobs: 0 };
  const byStem = new Map();
  for (const file of files) {
    const stem = camFileStem(file.name);
    const list = byStem.get(stem) || [];
    list.push(file);
    byStem.set(stem, list);
  }
  let kept = 0;
  let jobs = 0;
  for (const group of byStem.values()) {
    group.sort((a, b) => camRank(b.name) - camRank(a.name));
    let best = null;
    for (const file of group) {
      const text = await readNcText(file);
      const parsed = parseProgram(file.name, text);
      const cuts = (parsed?.points || []).filter((p) => !p.rapid && !p.change).length;
      if (!best || cuts > best.cuts || (cuts === best.cuts && camRank(file.name) > camRank(best.file.name))) {
        best = { file, parsed, cuts };
      }
    }
    if (best) {
      await ingestCamFile(best.file, date, best.parsed);
      kept += 1;
      jobs += 1;
    }
  }
  return { tried: files.length, files: kept, jobs };
}

async function hydrateCamJobs(folderId) {
  const files = (state.cam.files || []).filter((f) => f.folderId === folderId);
  if (!files.length) return false;
  if (!state.cam.jobs) state.cam.jobs = [];
  let dirty = false;
  for (const meta of files) {
    if (!meta.date) {
      meta.date = todayISO();
      dirty = true;
    }
    const stem = camFileStem(meta.name);
    const idx = state.cam.jobs.findIndex((j) => (j.folderId || "cam-root") === folderId && camFileStem(j.name) === stem);
    const blob = await loadBlob(meta.id).catch(() => null);
    let parsed = null;
    if (blob) {
      const file = blob instanceof File ? blob : new File([blob], meta.name);
      parsed = parseProgram(meta.name, await readNcText(file));
    }
    const fields = camJobFields({ name: meta.name }, parsed);
    if (idx >= 0) {
      const cur = state.cam.jobs[idx];
      const better = cutCount(fields) > cutCount(cur);
      if (!better && cur.partName && cur.method && cur.date) continue;
      state.cam.jobs[idx] = {
        ...cur,
        ...(better ? fields : {}),
        partName: better ? fields.partName : (cur.partName || fields.partName),
        method: better ? fields.method : (cur.method || fields.method),
        id: cur.id,
        fileId: meta.id,
        folderId,
        date: cur.date || meta.date || todayISO(),
      };
      dirty = true;
      continue;
    }
    state.cam.jobs.push({ ...fields, id: uid("job"), fileId: meta.id, folderId, date: meta.date || todayISO() });
    dirty = true;
  }
  if (dirty) persist();
  return dirty;
}

async function ingestCamFile(file, date = todayISO(), parsedIn) {
  if (!state.cam.jobs) state.cam.jobs = [];
  if (!state.cam.files) state.cam.files = [];
  const folderId = camFolder || "cam-root";
  const stem = camFileStem(file.name);
  const parsed = parsedIn || parseProgram(file.name, await readNcText(file));
  const fields = camJobFields(file, parsed);
  const arrived = date || todayISO();
  const sameFile = (state.cam.files || []).find((f) => f.folderId === folderId && f.name === file.name && f.size === file.size);
  let fileId = sameFile?.id;
  if (!fileId) {
    const dupFile = (state.cam.files || []).find((f) => f.folderId === folderId && camFileStem(f.name) === stem);
    if (dupFile) await removeCamFile(dupFile.id);
    fileId = uid("file");
    await saveBlob(fileId, file).catch(() => {
      throw new Error("파일이 너무 크거나 저장할 수 없습니다.");
    });
    state.cam.files.push({ id: fileId, folderId, name: file.name, size: file.size, date: arrived, auto: true });
  }
  const idx = state.cam.jobs.findIndex((j) => camFileStem(j.name) === stem && (j.folderId || "cam-root") === folderId);
  const keepDate = sameFile?.date || (idx >= 0 ? state.cam.jobs[idx].date : "") || arrived;
  if (idx >= 0) {
    const oldCuts = cutCount(state.cam.jobs[idx]);
    if (cutCount(fields) < oldCuts && oldCuts >= 2) return;
    const id = state.cam.jobs[idx].id;
    state.cam.jobs.splice(idx, 1);
    state.cam.jobs.push({ ...fields, id, fileId, folderId, date: keepDate });
  } else {
    state.cam.jobs.push({ ...fields, id: uid("job"), fileId, folderId, date: keepDate });
  }
}

function bindClimate(mod, date) {
  const bag = climateBag(mod);
  document.getElementById("add-room")?.addEventListener("click", () => {
    bag.rooms.push({ id: uid("rm"), name: "새 구역", x: 40, y: 40, w: 18, h: 16, rot: 0, kind: mod.type === "lab-climate" ? "qa" : "area" });
    markDirty(); render();
  });
  document.getElementById("add-m")?.addEventListener("click", () => {
    bag.rooms.push({ id: uid("rm"), name: "새 기계", x: 42, y: 44, w: 12, h: 14, rot: 0, kind: "machine" });
    markDirty(); render();
  });
  document.getElementById("add-p")?.addEventListener("click", () => {
    bag.points.push({ id: uid("p").slice(0, 6).toUpperCase(), name: "새 위치", x: 50, y: 50 });
    markDirty(); render();
  });
  root.querySelectorAll("[data-pin-del]").forEach((b) => {
    b.onpointerdown = (e) => e.stopPropagation();
    b.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm("이 측정 위치를 뺄까요?")) return;
      removeClimatePoint(mod, b.dataset.pinDel);
      markDirty();
      render();
    };
  });
  root.querySelectorAll("[data-rec]").forEach((b) => b.onclick = () => recPoint(mod, date, b.dataset.rec));
  drag(mod, date);
  bindSaveButton();
}

function drag(mod, date) {
  const bag = climateBag(mod);
  const plan = document.getElementById("plan");
  if (!plan) return;
  let act = null;
  let moved = false;
  let clicks = 0;
  const selectRoom = (id) => {
    plan.querySelectorAll("[data-room]").forEach((el) => el.classList.toggle("on", el.dataset.room === id));
  };
  const pctOf = (e) => {
    const box = plan.getBoundingClientRect();
    return {
      x: ((e.clientX - box.left) / box.width) * 100,
      y: ((e.clientY - box.top) / box.height) * 100,
    };
  };
  const copyRoom = (r) => ({ x: r.x, y: r.y, w: r.w, h: r.h, rot: Number(r.rot) || 0 });
  const resizeRoom = (room, handle, start, lx, ly) => {
    const dw = handle.includes("e") ? lx : handle.includes("w") ? -lx : 0;
    const dh = handle.includes("s") ? ly : handle.includes("n") ? -ly : 0;
    const w = clamp(start.w + dw, 6, 92);
    const h = clamp(start.h + dh, 6, 92);
    const a = ((start.rot || 0) * Math.PI) / 180;
    const fix = { se: [-0.5, -0.5], sw: [0.5, -0.5], ne: [-0.5, 0.5], nw: [0.5, 0.5] }[handle] || [-0.5, -0.5];
    const cx0 = start.x + start.w / 2;
    const cy0 = start.y + start.h / 2;
    const wx = cx0 + fix[0] * start.w * Math.cos(a) - fix[1] * start.h * Math.sin(a);
    const wy = cy0 + fix[0] * start.w * Math.sin(a) + fix[1] * start.h * Math.cos(a);
    const cx = wx - fix[0] * w * Math.cos(a) + fix[1] * h * Math.sin(a);
    const cy = wy - fix[0] * w * Math.sin(a) - fix[1] * h * Math.cos(a);
    room.w = w;
    room.h = h;
    room.x = cx - w / 2;
    room.y = cy - h / 2;
  };
  plan.addEventListener("pointerdown", (e) => {
    if (e.target === plan) selectRoom("");
  });
  plan.querySelectorAll("[data-room]").forEach((el) => {
    const roomOf = () => bag.rooms.find((r) => r.id === el.dataset.room);
    el.onpointerdown = (e) => {
      if (e.target.closest("[data-room-rs], [data-room-rot]")) return;
      const room = roomOf();
      if (!room) return;
      selectRoom(room.id);
      act = { type: "move", kind: "room", el, id: room.id, x: e.clientX, y: e.clientY, start: copyRoom(room) };
      moved = false;
      el.setPointerCapture(e.pointerId);
    };
    el.onpointermove = (e) => {
      if (!act || act.el !== el || act.type !== "move") return;
      if (Math.hypot(e.clientX - act.x, e.clientY - act.y) > 4) moved = true;
      if (!moved) return;
      const room = roomOf();
      if (!room) return;
      const box = plan.getBoundingClientRect();
      room.x = clamp(act.start.x + ((e.clientX - act.x) / box.width) * 100, 0, 94);
      room.y = clamp(act.start.y + ((e.clientY - act.y) / box.height) * 100, 0, 94);
      applyRoomBox(el, room);
    };
    el.onpointerup = () => {
      if (!act || act.el !== el || act.type !== "move") return;
      if (moved) markDirty();
      else {
        clicks += 1;
        setTimeout(() => { clicks = 0; }, 280);
        if (clicks >= 2) editRoom(mod, act.id);
      }
      act = null;
    };
    el.querySelectorAll("[data-room-rs]").forEach((h) => {
      h.onpointerdown = (e) => {
        e.stopPropagation();
        const room = roomOf();
        if (!room) return;
        selectRoom(room.id);
        act = { type: "rs", el, handle: h.dataset.roomRs, id: room.id, px: e.clientX, py: e.clientY, start: copyRoom(room) };
        h.setPointerCapture(e.pointerId);
      };
      h.onpointermove = (e) => {
        if (!act || act.type !== "rs" || act.el !== el) return;
        const room = roomOf();
        if (!room) return;
        const box = plan.getBoundingClientRect();
        const dx = ((e.clientX - act.px) / box.width) * 100;
        const dy = ((e.clientY - act.py) / box.height) * 100;
        const a = -((act.start.rot || 0) * Math.PI) / 180;
        const lx = dx * Math.cos(a) - dy * Math.sin(a);
        const ly = dx * Math.sin(a) + dy * Math.cos(a);
        resizeRoom(room, act.handle, act.start, lx, ly);
        applyRoomBox(el, room);
      };
      h.onpointerup = () => {
        if (act?.type === "rs") markDirty();
        act = null;
      };
    });
    const rot = el.querySelector("[data-room-rot]");
    if (rot) {
      rot.onpointerdown = (e) => {
        e.stopPropagation();
        const room = roomOf();
        if (!room) return;
        selectRoom(room.id);
        act = { type: "rot", el, id: room.id };
        rot.setPointerCapture(e.pointerId);
      };
      rot.onpointermove = (e) => {
        if (!act || act.type !== "rot" || act.el !== el) return;
        const room = roomOf();
        if (!room) return;
        const p = pctOf(e);
        const cx = room.x + room.w / 2;
        const cy = room.y + room.h / 2;
        const ang = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
        room.rot = ((Math.round(ang / 5) * 5) % 360 + 360) % 360;
        applyRoomBox(el, room);
      };
      rot.onpointerup = () => {
        if (act?.type === "rot") markDirty();
        act = null;
      };
    }
  });
  plan.querySelectorAll("[data-pin]").forEach((el) => {
    el.onpointerdown = (e) => {
      if (e.target.closest("[data-pin-del]")) return;
      selectRoom("");
      act = { type: "move", kind: "pin", el, id: el.dataset.pin, x: e.clientX, y: e.clientY };
      moved = false;
      el.setPointerCapture(e.pointerId);
    };
    el.onpointermove = (e) => {
      if (!act || act.el !== el || act.kind !== "pin") return;
      if (Math.hypot(e.clientX - act.x, e.clientY - act.y) > 4) moved = true;
      if (!moved) return;
      const box = plan.getBoundingClientRect();
      el.style.left = `${clamp(((e.clientX - box.left) / box.width) * 100, 2, 98)}%`;
      el.style.top = `${clamp(((e.clientY - box.top) / box.height) * 100, 2, 98)}%`;
    };
    el.onpointerup = () => {
      if (!act || act.el !== el || act.kind !== "pin") return;
      if (moved) {
        const p = bag.points.find((x) => x.id === act.id);
        if (p) Object.assign(p, { x: parseFloat(el.style.left), y: parseFloat(el.style.top) });
        markDirty();
      } else recPoint(mod, date, act.id);
      act = null;
    };
  });
}

function editRoom(mod, id) {
  const bag = climateBag(mod);
  const room = bag.rooms.find((r) => r.id === id);
  if (!room) return;
  form("구역 수정", [
    { key: "name", label: "이름", type: "text" },
    { key: "w", label: "가로(%)", type: "number" },
    { key: "h", label: "세로(%)", type: "number" },
    { key: "rot", label: "회전(도)", type: "number" },
    { key: "kind", label: "종류 area/hall/qa/machine", type: "text" },
  ], { ...room, rot: Number(room.rot) || 0 }, (v) => {
    Object.assign(room, {
      name: v.name,
      w: Number(v.w),
      h: Number(v.h),
      rot: Number(v.rot) || 0,
      kind: v.kind || room.kind,
    });
    markDirty();
    render();
  }, `<button class="btn ghost" id="del-room" type="button">구역 빼기</button>`);
  document.getElementById("del-room")?.addEventListener("click", () => {
    if (!confirm("이 구역을 뺄까요?")) return;
    bag.rooms = bag.rooms.filter((r) => r.id !== id);
    document.getElementById("modal").innerHTML = "";
    markDirty();
    render();
  });
}

function recPoint(mod, date, id) {
  const bag = climateBag(mod);
  const p = bag.points.find((x) => x.id === id);
  if (!p) return;
  const cur = (bag.logs[date] || []).find((x) => x.pointId === id) || { name: p.name, temp: "", humidity: "", lux: "", status: "정상" };
  cur.name = cur.name || p.name;
  form(`${p.id} 기록`, fieldsFor("climatePoint"), cur, (v) => {
    p.name = v.name || p.name;
    if (!bag.logs[date]) bag.logs[date] = [];
    const list = bag.logs[date];
    const i = list.findIndex((x) => x.pointId === id);
    const next = { pointId: id, temp: Number(v.temp), humidity: Number(v.humidity), lux: Number(v.lux), status: v.status || "정상" };
    if (i >= 0) list[i] = next; else list.push(next);
    markDirty(); render();
  }, `<button class="btn ghost" id="del-point" type="button">위치 빼기</button>`);
  document.getElementById("del-point")?.addEventListener("click", () => {
    if (!confirm("이 측정 위치를 뺄까요?")) return;
    removeClimatePoint(mod, id);
    document.getElementById("modal").innerHTML = "";
    markDirty();
    render();
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
  document.getElementById("f").onsubmit = async (e) => {
    e.preventDefault();
    await onSave(Object.fromEntries(new FormData(e.currentTarget).entries()));
    box.innerHTML = "";
  };
}

function bindPhotoDraft(photos) {
  const box = document.getElementById("prev");
  const input = document.getElementById("photos");
  if (!box || !input) return;
  const paint = () => {
    box.innerHTML = photos.map((s, i) => `<span class="pic-item">
        <img src="${s}" alt="">
        ${picDel(`data-draft-del="${i}"`)}
      </span>`).join("");
    box.querySelectorAll("[data-draft-del]").forEach((b) => {
      b.onclick = (ev) => {
        ev.preventDefault();
        photos.splice(Number(b.dataset.draftDel), 1);
        paint();
      };
    });
  };
  paint();
  input.addEventListener("change", async (e) => {
    for (const f of [...(e.target.files || [])]) photos.push(await readAsDataUrl(f));
    e.target.value = "";
    paint();
  });
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
boot(() => {
  loadStateAsync().then((next) => {
    state = next;
    camFolder = state.camFolder || "cam-root";
    shareState(state);
    render();
  }).catch(showRecover);
});
