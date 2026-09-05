/* Presentation preference only. This parser-blocking script runs before styles. */
(() => {
  if (new URLSearchParams(location.search).get("founder_review") === "web-012b") document.documentElement.dataset.ipoReview = "web-012b";
  const key = "ipo-one-theme";
  const choices = ["system", "light", "dark"];
  const media = matchMedia("(prefers-color-scheme: dark)");
  let preference = "system";
  try { preference = localStorage.getItem(key) ?? localStorage.getItem("ipo-one-whitepaper-theme") ?? "system"; } catch { /* Storage is optional. */ }
  if (!choices.includes(preference)) preference = "system";
  const apply = () => {
    const resolved = preference === "system" ? (media.matches ? "dark" : "light") : preference;
    document.documentElement.dataset.ipoTheme = resolved;
    document.documentElement.dataset.ipoThemePreference = preference;
    document.dispatchEvent(new CustomEvent("ipo-theme-change", { detail: { preference, resolved } }));
  };
  document.addEventListener("ipo-theme-select", ({ detail }) => {
    if (!choices.includes(detail)) return;
    preference = detail;
    try { localStorage.setItem(key, preference); } catch { /* Keep the in-memory selection. */ }
    apply();
  });
  media.addEventListener("change", apply);
  window.addEventListener("storage", (event) => {
    if (event.key !== key) return;
    preference = choices.includes(event.newValue) ? event.newValue : "system";
    apply();
  });
  apply();
})();
