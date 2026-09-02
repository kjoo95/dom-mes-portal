let deferred;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then((reg) => reg.update());
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferred = event;
});

document.addEventListener("click", async (event) => {
  if (event.target.id !== "install") return;
  if (!deferred) {
    alert("Chrome 또는 Edge에서 이 사이트를 연 뒤, 주소창 오른쪽 설치 아이콘 또는 메뉴의 ‘앱 설치’를 선택하세요.");
    return;
  }
  deferred.prompt();
  await deferred.userChoice;
  deferred = null;
});
