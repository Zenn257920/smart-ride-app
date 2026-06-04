// theme.js - Dark/Light Mode Toggle for Innovix SmartRide

const THEME_KEY = "smartride_theme";

/**
 * Apply the saved theme on page load.
 * Called automatically when this module is imported.
 */
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "light";
  document.documentElement.setAttribute("data-theme", saved);
  updateToggleIcon(saved);
}

/**
 * Toggle between light and dark themes.
 */
export function toggleTheme() {
  const current =
    document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
  updateToggleIcon(next);
}

/**
 * Update the toggle button icon to match the current theme.
 */
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

// Auto-initialize on import
initTheme();
