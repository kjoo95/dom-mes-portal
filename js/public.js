import { t, langBar, bindLang, applyHtmlLang } from "./i18n.js?v=80";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  });
}
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
});

applyHtmlLang();
const nav = document.querySelector(".pub-top nav");
if (nav && !document.getElementById("lang")) {
  nav.insertAdjacentHTML("beforeend", langBar());
}
const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
const home = file === "" || file === "index.html";
nav?.querySelectorAll("a").forEach((a) => {
  if (a.target === "_blank") return;
  const href = (a.getAttribute("href") || "").replace(/^\.\//, "").toLowerCase();
  const isHome = !href || href === "./" || href === "index.html";
  if ((home && isHome) || (!home && href === file)) a.setAttribute("aria-current", "page");
});
document.querySelectorAll("[data-i18n]").forEach((el) => {
  el.textContent = t(el.getAttribute("data-i18n"));
});
bindLang(() => location.reload());

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function pinHeader() {
  const top = document.querySelector(".pub-top");
  if (!top || !document.body.classList.contains("home")) return;
  const on = () => top.classList.toggle("is-scrolled", window.scrollY > 24);
  on();
  window.addEventListener("scroll", on, { passive: true });
}

function playField() {
  const canvas = document.getElementById("sm-field");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  let w = 0;
  let h = 0;
  let t = 0;
  const specks = [];

  function size() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    specks.length = 0;
    const n = Math.round((w * h) / 14000);
    for (let i = 0; i < Math.min(90, Math.max(36, n)); i += 1) {
      specks.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.6 + Math.random() * 1.6,
        v: 0.12 + Math.random() * 0.42,
        red: Math.random() > 0.55,
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const waveT = t * 0.00105;
    const cols = Math.max(36, Math.round(w / 22));
    const rows = 22;
    for (let r = 0; r < rows; r += 1) {
      const depth = r / (rows - 1);
      const rowY = h * 0.36 + depth * h * 0.58;
      const sizeDot = 0.7 + depth * 1.9;
      const alpha = 0.08 + depth * 0.5;
      const spread = 0.42 + depth * 0.58;
      for (let c = 0; c < cols; c += 1) {
        const nx = c / (cols - 1);
        const x = (nx - 0.5) * w * spread + w * 0.5;
        const wave =
          Math.sin(nx * 5.4 + waveT) * (48 - depth * 10) +
          Math.sin(nx * 12.6 + waveT * 1.28) * (18 - depth * 6) +
          Math.sin(nx * 2.7 - waveT * 0.48) * 24;
        const y = rowY + wave * (0.28 + depth * 0.72);
        ctx.beginPath();
        ctx.fillStyle = (c + r) % 6 === 0
          ? `rgba(196,30,58,${alpha})`
          : `rgba(230,236,255,${alpha})`;
        ctx.arc(x, y, sizeDot, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const peaks = [0.28, 0.5, 0.72];
    for (const px of peaks) {
      const baseY = h * 0.58 + Math.sin(waveT + px * 8) * 26;
      for (let i = 0; i < 34; i += 1) {
        const rise = i / 34;
        const y = baseY - rise * h * 0.42;
        const a = 0.5 * (1 - rise);
        const x = px * w + Math.sin(waveT * 1.2 + i * 0.35) * (4 + rise * 10);
        ctx.beginPath();
        ctx.fillStyle = i % 3 === 0
          ? `rgba(196,30,58,${a})`
          : `rgba(255,255,255,${a * 0.9})`;
        ctx.arc(x, y, 1.15 + (1 - rise) * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const d of specks) {
      ctx.beginPath();
      ctx.fillStyle = d.red ? "rgba(196,30,58,.45)" : "rgba(255,255,255,.28)";
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
      d.y -= d.v;
      d.x += Math.sin(waveT + d.y * 0.01) * 0.15;
      if (d.y < -4) {
        d.y = h + 4;
        d.x = Math.random() * w;
      }
    }
    if (!reduceMotion) {
      t += 16;
      requestAnimationFrame(draw);
    }
  }

  size();
  draw();
  window.addEventListener("resize", () => {
    size();
    if (reduceMotion) draw();
  });
}

function revealOnScroll() {
  const nodes = [...document.querySelectorAll(".reveal")];
  if (!nodes.length) return;
  const show = (el) => el.classList.add("is-in");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    nodes.forEach(show);
    return;
  }
  const inView = (el) => {
    const r = el.getBoundingClientRect();
    return r.top < window.innerHeight * 0.9 && r.bottom > 40;
  };
  nodes.filter(inView).forEach(show);
  const rest = nodes.filter((el) => !el.classList.contains("is-in"));
  if (!rest.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      show(entry.target);
      io.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  rest.forEach((el) => io.observe(el));
}

function smoothWheelScroll() {
  if (reduceMotion) return;
  if (window.matchMedia("(pointer: coarse)").matches) return;
  const root = document.scrollingElement || document.documentElement;
  let current = window.scrollY;
  let target = current;
  let running = false;
  window.addEventListener("wheel", (event) => {
    if (event.ctrlKey) return;
    if (event.target.closest?.(".contact-map, .leaflet-container, select, textarea")) return;
    event.preventDefault();
    const max = Math.max(0, root.scrollHeight - window.innerHeight);
    target = Math.max(0, Math.min(max, target + event.deltaY));
    if (!running) {
      running = true;
      requestAnimationFrame(tick);
    }
  }, { passive: false });
  function tick() {
    current += (target - current) * 0.14;
    if (Math.abs(target - current) < 0.5) {
      current = target;
      window.scrollTo(0, current);
      running = false;
      return;
    }
    window.scrollTo(0, current);
    requestAnimationFrame(tick);
  }
}

function parallaxHero() {
  if (reduceMotion) return;
  const hero = document.querySelector(".sm-hero");
  const field = document.querySelector(".sm-field");
  const pageHero = document.querySelector(".page-hero img");
  if (!hero && !pageHero) return;
  const update = () => {
    if (hero && field) {
      const y = Math.max(0, Math.min(window.scrollY, hero.offsetHeight));
      field.style.transform = `translate3d(0, ${y * 0.22}px, 0)`;
    }
    if (pageHero) {
      const box = pageHero.closest(".page-hero");
      const top = box ? box.getBoundingClientRect().top : 0;
      pageHero.style.transform = `scale(1.08) translate3d(0, ${Math.max(0, -top) * 0.18}px, 0)`;
    }
  };
  update();
  window.addEventListener("scroll", update, { passive: true });
}

pinHeader();
playField();
revealOnScroll();
smoothWheelScroll();
parallaxHero();
