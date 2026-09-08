import { t, langBar, bindLang, applyHtmlLang } from "./i18n.js?v=79";

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

function playHomeHero() {
  const slides = [...document.querySelectorAll(".hx-slide")];
  if (slides.length < 2) return;
  const dotsWrap = document.querySelector(".hx-dots");
  const nextBtn = document.querySelector(".hx-next");
  let i = 0;
  const dots = slides.map((_, n) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", String(n + 1));
    if (n === 0) b.classList.add("is-on");
    b.addEventListener("click", () => go(n));
    dotsWrap?.append(b);
    return b;
  });
  function go(n) {
    slides[i].classList.remove("is-on");
    dots[i]?.classList.remove("is-on");
    i = (n + slides.length) % slides.length;
    const slide = slides[i];
    const img = slide.querySelector("img");
    if (img) {
      img.style.animation = "none";
      img.offsetWidth;
      img.style.animation = "";
    }
    slide.classList.add("is-on");
    dots[i]?.classList.add("is-on");
  }
  nextBtn?.addEventListener("click", () => go(i + 1));
  if (!reduceMotion) window.setInterval(() => go(i + 1), 7000);
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

playHomeHero();
revealOnScroll();
