import { t, langBar, bindLang, applyHtmlLang } from "./i18n.js?v=69";

applyHtmlLang();
const nav = document.querySelector(".pub-top nav");
if (nav && !document.getElementById("lang")) {
  nav.insertAdjacentHTML("beforeend", langBar());
}
document.querySelectorAll("[data-i18n]").forEach((el) => {
  el.textContent = t(el.getAttribute("data-i18n"));
});
bindLang(() => location.reload());
