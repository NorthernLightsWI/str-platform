if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(function (reg) {
        console.log("[SW] registered, scope:", reg.scope)
      })
      .catch(function (err) {
        console.warn("[SW] registration failed:", err)
      })
  })
}
