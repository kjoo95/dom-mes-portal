import { t, langBar, bindLang, applyHtmlLang } from "./i18n.js?v=73";

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
