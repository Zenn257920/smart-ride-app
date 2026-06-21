

const THEME_KEY = "smartride_theme";


function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "light";
  document.documentElement.setAttribute("data-theme", saved);
  updateToggleIcon(saved);
}


export function toggleTheme() {
  const current =
    document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
  updateToggleIcon(next);
}


function updateToggleIcon(theme) {
  const btn = document.getElementById("themeToggleBtn");
  if (btn) {
    btn.textContent = theme === "dark" ? "☀️" : "🌙";
    btn.title =
      theme === "dark"
        ? "Light Mode သို့ပြောင်းမည်"
        : "Dark Mode သို့ပြောင်းမည်";
  }
}


initTheme();
