const SESSION_KEY = "dom-session";
const LOCK_KEY = "dom-login-lock";
const USERS_KEY = "dom-users-v1";
const DOMAIN = "domeng.co.kr";
const SESSION_MS = 12 * 60 * 60 * 1000;
const FAIL_LIMIT = 5;
const LOCK_MS = 10 * 60 * 1000;

const HARRY = {
  id: "thswlsvy1021",
  name: "관리자",
  email: "thswlsvy1021@domeng.co.kr",
  team: "office",
  role: "admin",
  status: "approved",
  salt: "dom-admin-seed",
  hash: "37b18bffe0e945e5863e138c98667192635d8bb14025b8139b18bea9f11e1445",
};

const OLD_ADMIN = ["harry@domeng.co.kr", "harry"];

function foldText(raw) {
  return String(raw || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

function isSeedAdmin(userOrEmail) {
  const email = foldText(userOrEmail?.email || userOrEmail).toLowerCase();
  const id = foldText(userOrEmail?.id || "").toLowerCase();
  return email === HARRY.email || email === OLD_ADMIN[0] || id === HARRY.id || id === OLD_ADMIN[1]
    || email.split("@")[0] === HARRY.id;
}

function userStatus(u) {
  if (u?.status === "pending" || u?.status === "rejected" || u?.status === "approved") return u.status;
  return "approved";
}

function userRole(u) {
  if (isSeedAdmin(u) || u?.role === "admin") return "admin";
  return "user";
}

function stamp(u) {
  return u?.updated || u?.created || 0;
}

function normalizeUser(u) {
  if (!u?.email) return u;
  return { ...u, status: isSeedAdmin(u) ? "approved" : userStatus(u), role: userRole(u) };
}

export function isInternalNetwork() {
  const host = (location.hostname || "").replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (host === "kjoo95.github.io") return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return false;
}

function lockInfo() {
  try {
    return JSON.parse(localStorage.getItem(LOCK_KEY) || "null") || { fails: 0, until: 0 };
  } catch {
    return { fails: 0, until: 0 };
  }
}

function setLock(info) {
  localStorage.setItem(LOCK_KEY, JSON.stringify(info));
}

async function digest(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function hashPass(password, salt) {
  return digest(`${salt}:${password}`);
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function readUsers() {
  try {
    const list = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeUsers(list) {
  localStorage.setItem(USERS_KEY, JSON.stringify(list));
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    team: u.team || "office",
    role: userRole(u),
    status: userStatus(u),
    created: u.created || 0,
  };
}

function mergeUsers(base, incoming) {
  const map = new Map();
  [...base, ...incoming].forEach((raw) => {
    const u = normalizeUser(raw);
    if (!u?.email || !u.hash || !u.salt) return;
    const key = String(u.email).toLowerCase();
    const prev = map.get(key);
    if (!prev || stamp(u) >= stamp(prev)) map.set(key, u);
  });
  return [...map.values()];
}

function ensureSeed() {
  const list = readUsers().map(normalizeUser);
  const rest = list.filter((u) => !isSeedAdmin(u));
  const prev = list.find((u) => isSeedAdmin(u));
  const next = [{ ...HARRY, created: prev?.created || 0, updated: Date.now() }, ...rest].map(normalizeUser);
  if (JSON.stringify(list) !== JSON.stringify(next)) {
    writeUsers(next);
    localStorage.removeItem(LOCK_KEY);
  }
  return next;
}

export function normalizeEmail(raw) {
  const v = foldText(raw).toLowerCase();
  if (!v) return "";
  if (v.includes("@")) return v;
  return `${v}@${DOMAIN}`;
}

export function emailOk(email) {
  return email.endsWith(`@${DOMAIN}`) && email.length > DOMAIN.length + 2 && !email.includes(" ");
}

function makeId(email, existing) {
  const local = email.split("@")[0].replace(/[^a-z0-9]/g, "") || "user";
  const taken = new Set(existing.map((u) => u.id));
  if (!taken.has(local)) return local;
  let n = 2;
  while (taken.has(`${local}${n}`)) n += 1;
  return `${local}${n}`;
}

function findUser(email) {
  const raw = foldText(email).toLowerCase();
  const key = normalizeEmail(raw);
  const local = raw.includes("@") ? raw.split("@")[0] : raw;
  return ensureSeed().find((u) => {
    const mail = String(u.email || "").toLowerCase();
    const id = String(u.id || "").toLowerCase();
    return mail === key || id === local || mail.split("@")[0] === local;
  }) || null;
}

export function listStaff() {
  return ensureSeed().filter((u) => userStatus(u) === "approved").map(publicUser);
}

export function listUsers() {
  return ensureSeed().map(publicUser);
}

export function pendingCount() {
  return ensureSeed().filter((u) => userStatus(u) === "pending").length;
}

export function isAdmin(session = getSession()) {
  if (!session?.email) return false;
  if (session.role === "admin" || isSeedAdmin(session)) return true;
  const user = findUser(session.email);
  return userRole(user) === "admin";
}

export async function pullUsers() {
  try {
    const res = await fetch("/api/users", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const incoming = Array.isArray(data) ? data : data.users;
    if (!Array.isArray(incoming)) return;
    writeUsers(mergeUsers(ensureSeed(), incoming));
  } catch { /* static server */ }
}

async function pushUser(user) {
  try {
    await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user),
    });
  } catch { /* static server */ }
}

function startSession(user) {
  const session = {
    email: user.email,
    name: user.name,
    id: user.id,
    team: user.team || "office",
    role: userRole(user),
    at: Date.now(),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession() {
  if (!isInternalNetwork()) return null;
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (!session?.email) return null;
    if (!session.at || Date.now() - session.at > SESSION_MS) {
      logout();
      return null;
    }
    const user = findUser(session.email);
    if (!user || userStatus(user) !== "approved") {
      logout();
      return null;
    }
    session.role = userRole(user);
    session.name = user.name;
    return session;
  } catch {
    return null;
  }
}

export async function login(email, password) {
  if (!isInternalNetwork()) {
    return { ok: false, message: "내부 네트워크에서만 로그인할 수 있습니다." };
  }
  const lock = lockInfo();
  if (lock.until > Date.now()) {
    const min = Math.ceil((lock.until - Date.now()) / 60000);
    return { ok: false, message: `로그인이 잠시 잠겼습니다. ${min}분 뒤에 다시 시도하세요.` };
  }
  await pullUsers();
  const user = findUser(email);
  const ok = user && (await hashPass(foldText(password), user.salt)) === user.hash;
  if (ok) {
    setLock({ fails: 0, until: 0 });
    const status = userStatus(user);
    if (status === "pending") {
      return { ok: false, message: "가입 신청이 아직 승인되지 않았습니다. 관리자 승인 후 로그인하세요." };
    }
    if (status === "rejected") {
      return { ok: false, message: "가입이 거절되었습니다. 다시 회원가입으로 신청하세요." };
    }
    startSession(user);
    return { ok: true };
  }
  const fails = (lock.fails || 0) + 1;
  const until = fails >= FAIL_LIMIT ? Date.now() + LOCK_MS : 0;
  setLock({ fails, until });
  if (until) return { ok: false, message: "로그인 실패가 반복되어 10분간 잠겼습니다." };
  return { ok: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." };
}

export async function signup({ name, email, password, confirm, team }) {
  if (!isInternalNetwork()) {
    return { ok: false, message: "내부 네트워크에서만 가입할 수 있습니다." };
  }
  const display = String(name || "").trim();
  const mail = normalizeEmail(email);
  const pass = foldText(password);
  const teamId = ["shop", "lab", "office"].includes(team) ? team : "office";
  if (display.length < 2) return { ok: false, message: "이름을 두 글자 이상 입력하세요." };
  if (!emailOk(mail)) return { ok: false, message: `회사 메일(@${DOMAIN})만 가입할 수 있습니다.` };
  if (pass.length < 8) return { ok: false, message: "비밀번호는 8자 이상이어야 합니다." };
  if (pass !== foldText(confirm)) return { ok: false, message: "비밀번호 확인이 같지 않습니다." };
  await pullUsers();
  const list = ensureSeed();
  const existing = list.find((u) => String(u.email).toLowerCase() === mail);
  if (existing && userStatus(existing) === "approved") {
    return { ok: false, message: "이미 가입된 아이디입니다. 로그인하세요." };
  }
  if (existing && userStatus(existing) === "pending") {
    return { ok: false, message: "이미 승인 대기 중입니다. 관리자 승인을 기다려 주세요." };
  }
  const salt = randomSalt();
  const user = {
    id: existing?.id || makeId(mail, list),
    name: display,
    email: mail,
    team: teamId,
    role: "user",
    status: "pending",
    salt,
    hash: await hashPass(pass, salt),
    created: existing?.created || Date.now(),
    updated: Date.now(),
  };
  const next = mergeUsers(list, [user]);
  writeUsers(next);
  await pushUser(user);
  return { ok: true, pending: true, message: "가입 신청이 접수되었습니다. 관리자가 승인한 뒤에 로그인할 수 있습니다." };
}

export async function setUserStatus(email, status) {
  if (!isAdmin()) return { ok: false, message: "승인 권한이 없습니다." };
  if (!["approved", "rejected", "pending"].includes(status)) return { ok: false, message: "잘못된 요청입니다." };
  await pullUsers();
  const list = ensureSeed();
  const user = list.find((u) => String(u.email).toLowerCase() === normalizeEmail(email));
  if (!user) return { ok: false, message: "해당 직원을 찾을 수 없습니다." };
  if (isSeedAdmin(user) && status !== "approved") return { ok: false, message: "관리자 계정은 거절할 수 없습니다." };
  user.status = status;
  user.updated = Date.now();
  writeUsers(list);
  await pushUser(user);
  return { ok: true };
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
}
