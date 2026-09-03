export function showRecover(err) {
  const root = document.getElementById("app") || document.body;
  const msg = String(err?.message || err || "알 수 없는 오류");
  root.innerHTML = `
    <div class="login">
      <div class="card">
        <div class="logo"><img class="logo-full" src="./assets/dom-logo.png?v=5" alt="주식회사 디오엠"></div>
        <h1>화면을 다시 준비합니다</h1>
        <p>오류가 났지만 사이트와 저장 데이터는 지워지지 않았습니다.</p>
        <p class="err">${msg.replaceAll("<", "&lt;").slice(0, 180)}</p>
        <button class="btn red" id="recover-reload" type="button">다시 열기</button>
        <button class="btn" id="recover-home" type="button">회사 홈으로</button>
      </div>
    </div>`;
  document.getElementById("recover-reload")?.addEventListener("click", () => location.reload());
  document.getElementById("recover-home")?.addEventListener("click", () => { location.href = "./index.html"; });
}

export function boot(start) {
  const run = () => {
    try {
      start();
    } catch (err) {
      showRecover(err);
    }
  };
  window.addEventListener("error", (event) => {
    if (event.filename && event.filename.indexOf(location.origin) !== 0) return;
    if (!event.error && !event.message) return;
    showRecover(event.error || event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    showRecover(event.reason);
  });
  run();
  return run;
}
