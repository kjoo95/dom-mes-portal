if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  });
}
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
});
