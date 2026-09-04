import { t, langBar, bindLang, applyHtmlLang } from "./i18n.js?v=77";

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

function playHomeFilm() {
  const shots = [...document.querySelectorAll(".home-film img")];
  if (shots.length < 2) return;
  let i = 0;
  window.setInterval(() => {
    shots[i].classList.remove("is-on");
    i = (i + 1) % shots.length;
    const next = shots[i];
    next.style.animation = "none";
    next.classList.add("is-on");
    next.offsetWidth;
    next.style.animation = "";
  }, 6200);
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

if (!reduceMotion) playHomeFilm();
revealOnScroll();
