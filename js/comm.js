import { getSession, listStaff } from "./auth.js?v=45";
import { STAFF } from "./data.js?v=42";
import { uid } from "./store.js?v=42";
import { t } from "./i18n.js?v=42";

const CHANNEL = "dom-mes-chat";
const MAX_MSG = 800;

const ROOMS = [
  { id: "all", title: "전체", hint: "전 직원" },
  { id: "shop", title: "현장", hint: "가공 · 출하" },
  { id: "lab", title: "검사실", hint: "품질 · 입고" },
];

let bus;
let pollTimer = 0;

function roster() {
  const map = new Map();
  STAFF.forEach((s) => map.set(s.id, s));
  listStaff().forEach((s) => map.set(s.id, s));
  return [...map.values()];
}

export function meStaff() {
  const session = getSession();
  const people = roster();
  const email = (session?.email || "").toLowerCase();
  return people.find((s) => s.email.toLowerCase() === email)
    || people.find((s) => s.id === session?.id)
    || { id: session?.id || "guest", name: session?.name || "손님", email: session?.email || "" };
}

export function roomId(raw) {
  const v = String(raw || "all");
  if (ROOMS.some((r) => r.id === v)) return v;
  if (roster().some((s) => s.id === v)) return dmRoom(meStaff().id, v);
  if (v.startsWith("dm-")) return v;
  return "all";
}

function dmRoom(a, b) {
  return `dm-${[a, b].sort().join("-")}`;
}

function roomTitle(id) {
  const g = ROOMS.find((r) => r.id === id);
  if (g) return t(g.title);
  const ids = id.replace(/^dm-/, "").split("-");
  const names = ids.map((x) => roster().find((s) => s.id === x)?.name || x);
  return names.join(" · ");
}

function ensureChat(state) {
  if (!state.chat) state.chat = { messages: [] };
  if (!Array.isArray(state.chat.messages)) state.chat.messages = [];
}

function ensureMail(state) {
  if (!state.mail) state.mail = { address: meStaff().email, web: "https://email.whois.co.kr/v2/", drafts: [] };
  if (!Array.isArray(state.mail.drafts)) state.mail.drafts = [];
  if (!state.mail.web) state.mail.web = "https://email.whois.co.kr/v2/";
  if (!state.mail.address) state.mail.address = meStaff().email;
}

function mergeMessage(state, msg) {
  ensureChat(state);
  if (!msg?.id || !msg.text) return false;
  if (state.chat.messages.some((m) => m.id === msg.id)) return false;
  state.chat.messages.push(msg);
  if (state.chat.messages.length > MAX_MSG) {
    state.chat.messages = state.chat.messages.slice(-MAX_MSG);
  }
  return true;
}

function when(at) {
  const d = new Date(at || Date.now());
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

export function chatView(state, h, roomRaw) {
  ensureChat(state);
  const me = meStaff();
  const room = roomId(roomRaw);
  const msgs = state.chat.messages
    .filter((m) => m.room === room)
    .sort((a, b) => a.at - b.at);
  const bubbles = msgs.map((m) => {
    const mine = m.from === me.id;
    return `<div class="talk-row ${mine ? "mine" : ""}">
      ${mine ? "" : `<span class="talk-ava">${h((m.name || "?").slice(0, 1))}</span>`}
      <div>
        ${mine ? "" : `<b>${h(m.name)}</b>`}
        <p class="talk-bubble">${h(m.text)}</p>
        <em>${h(when(m.at))}</em>
      </div>
    </div>`;
  }).join("") || `<p class="mute pad">${t("아직 대화가 없습니다. 아래 칸에 적어 보내세요.")}</p>`;
  const groups = ROOMS.map((r) => `<a class="${room === r.id ? "on" : ""}" href="#/chat/${r.id}">${h(t(r.title))}<span>${h(t(r.hint))}</span></a>`).join("");
  const people = roster().filter((s) => s.id !== me.id).map((s) => {
    const id = dmRoom(me.id, s.id);
    return `<a class="${room === id ? "on" : ""}" href="#/chat/${s.id}">${h(s.name)}<span>${h(s.email)}</span></a>`;
  }).join("");
  return `
    <div class="head compact-head"><div><h1>${t("사내 메신저")}</h1><p>${t("카카오톡처럼 현장·검사실·개인 대화를 나눕니다.")}</p></div>
      <a class="btn ghost sm" href="https://email.whois.co.kr/v2/" target="_blank" rel="noopener noreferrer">${t("후이즈 메일")}</a></div>
    <section class="talk">
      <aside class="talk-rooms">
        <p>${t("대화방")}</p>
        ${groups}
        <p>${t("직원")}</p>
        ${people}
      </aside>
      <div class="talk-main">
        <div class="talk-top"><b>${h(roomTitle(room))}</b><span>${h(t("{name}으로 보냄", { name: me.name }))}</span></div>
        <div class="talk-log" id="talk-log">${bubbles}</div>
        <form class="talk-send" id="talk-form">
          <input id="talk-text" type="text" maxlength="800" placeholder="${t("메시지 입력")}" autocomplete="off" />
          <button class="btn red" type="submit">${t("전송")}</button>
        </form>
      </div>
    </section>`;
}

export function bindChat(state, persist, render, roomRaw) {
  ensureChat(state);
  const room = roomId(roomRaw);
  const me = meStaff();
  const log = document.getElementById("talk-log");
  if (log) log.scrollTop = log.scrollHeight;
  document.getElementById("talk-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("talk-text");
    const text = input?.value.trim();
    if (!text) return;
    const msg = { id: uid("m"), room, from: me.id, name: me.name, text, at: Date.now() };
    mergeMessage(state, msg);
    persist();
    publish(msg);
    input.value = "";
    render();
  });
  startSync(state, persist, render);
}

export function mailView(state, h) {
  ensureMail(state);
  const mail = state.mail;
  const drafts = [...mail.drafts].sort((a, b) => (b.at || 0) - (a.at || 0));
  const rows = drafts.map((d) => `<tr>
    <td>${h(when(d.at))}</td>
    <td>${h(d.to)}</td>
    <td>${h(d.subject)}</td>
    <td class="act">
      <button class="btn sm" data-send="${d.id}" type="button">${t("보내기")}</button>
      <button class="btn sm" data-del="${d.id}" type="button">${t("삭제")}</button>
    </td>
  </tr>`).join("") || `<tr><td colspan="4">${t("저장된 초안이 없습니다.")}</td></tr>`;
  return `
    <div class="head compact-head"><div><h1>${t("후이즈 메일")}</h1><p>${t("후이즈 웹메일을 열고, 보낼 초안을 남겨 둡니다.")}</p></div>
      <a class="btn ghost sm" href="#/chat">${t("사내 메신저")}</a></div>
    <section class="panel mail-panel">
      <div class="bar compact-bar">
        <b>${t("웹메일")}</b>
        <a class="btn sm red" id="open-whois" href="${h(mail.web)}" target="_blank" rel="noopener noreferrer">${t("후이즈 메일 열기")}</a>
        <a class="btn sm" href="https://smart.whoismail.net" target="_blank" rel="noopener noreferrer">${t("스마트웹메일")}</a>
      </div>
      <form class="mail-set" id="mail-set">
        <label>${t("내 메일")}<input name="address" type="email" value="${h(mail.address)}" /></label>
        <label>${t("웹메일 주소")}<input name="web" type="url" value="${h(mail.web)}" /></label>
        <button class="btn sm" type="submit">${t("저장")}</button>
      </form>
      <p class="mute pad">${t("회사 도메인이면 보통 후이즈 웹메일 주소를 씁니다. 비밀번호는 여기에 넣지 마세요.")}</p>
    </section>
    <section class="panel">
      <div class="bar compact-bar"><b>${t("새 메일 초안")}</b></div>
      <form class="mail-compose" id="mail-compose">
        <label>${t("받는 사람")}<input name="to" type="text" placeholder="이름 &lt;email@domeng.co.kr&gt;" required /></label>
        <label>${t("제목")}<input name="subject" type="text" required /></label>
        <label>${t("내용")}<textarea name="body" rows="8" required></textarea></label>
        <div class="bar">
          <button class="btn red" type="submit">${t("초안 저장 후 웹메일로 보내기")}</button>
          <button class="btn" id="mail-draft" type="button">${t("초안만 저장")}</button>
        </div>
      </form>
    </section>
    <section class="panel">
      <div class="bar compact-bar"><b>${t("초안")}</b></div>
      <table class="rows"><thead><tr><th>${t("시각")}</th><th>${t("받는 사람")}</th><th>${t("제목")}</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table>
    </section>`;
}

export function bindMail(state, persist, render) {
  ensureMail(state);
  document.getElementById("mail-set")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.mail.address = String(fd.get("address") || "").trim() || state.mail.address;
    state.mail.web = String(fd.get("web") || "").trim() || state.mail.web;
    persist();
    render();
  });
  const compose = document.getElementById("mail-compose");
  const saveDraft = (send) => {
    const fd = new FormData(compose);
    const draft = {
      id: uid("d"),
      to: String(fd.get("to") || "").trim(),
      subject: String(fd.get("subject") || "").trim(),
      body: String(fd.get("body") || "").trim(),
      at: Date.now(),
    };
    if (!draft.to || !draft.subject || !draft.body) return null;
    state.mail.drafts.unshift(draft);
    persist();
    if (send) openSend(state, draft);
    return draft;
  };
  compose?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (saveDraft(true)) render();
  });
  document.getElementById("mail-draft")?.addEventListener("click", () => {
    if (saveDraft(false)) render();
  });
  document.querySelectorAll("[data-send]").forEach((b) => {
    b.onclick = () => {
      const d = state.mail.drafts.find((x) => x.id === b.dataset.send);
      if (d) openSend(state, d);
    };
  });
  document.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = () => {
      state.mail.drafts = state.mail.drafts.filter((x) => x.id !== b.dataset.del);
      persist();
      render();
    };
  });
}

function openSend(state, draft) {
  const to = encodeURIComponent(draft.to);
  const sub = encodeURIComponent(draft.subject);
  const body = encodeURIComponent(`${draft.body}\n\n— ${state.mail.address || meStaff().email}`);
  window.open(state.mail.web, "_blank", "noopener");
  location.href = `mailto:${to}?subject=${sub}&body=${body}`;
}

function publish(msg) {
  try {
    if (!bus) bus = new BroadcastChannel(CHANNEL);
    bus.postMessage({ type: "msg", msg });
  } catch { /* ignore */ }
  fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(msg),
  }).catch(() => {});
}

function startSync(state, persist, render) {
  try {
    if (!bus) bus = new BroadcastChannel(CHANNEL);
    bus.onmessage = (e) => {
      if (e.data?.type !== "msg") return;
      if (mergeMessage(state, e.data.msg)) {
        persist();
        render();
      }
    };
  } catch { /* ignore */ }
  clearInterval(pollTimer);
  pollTimer = setInterval(() => pullServer(state, persist, render), 4000);
  pullServer(state, persist, render);
}

async function pullServer(state, persist, render) {
  try {
    const res = await fetch("/api/chat", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.messages;
    if (!Array.isArray(list)) return;
    let changed = false;
    list.forEach((msg) => {
      if (mergeMessage(state, msg)) changed = true;
    });
    if (changed) {
      persist();
      render();
    }
  } catch { /* static server has no API */ }
}

export function chatRooms() {
  return ROOMS;
}
