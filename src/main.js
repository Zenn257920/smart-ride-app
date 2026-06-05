// Main entry point
import { isLoggedIn, getCurrentUser } from "./js/auth.js";
import { toggleTheme } from "./js/theme.js";
// Update navigation based on login state
function updateNavigation() {
  const navLinks = document.querySelector(".nav-links");
  if (!navLinks) return;
  if (isLoggedIn()) {
    const user = getCurrentUser();
    // Change login link to dashboard
    const loginLink = navLinks.querySelector(".nav-cta");
    if (loginLink) {
      loginLink.textContent = "Dashboard";
      loginLink.href = "/src/pages/dashboard.html";
    }
    // Add logout option if needed
    const existingLogout = document.querySelector(".logout-btn");
    if (!existingLogout) {
      const logoutBtn = document.createElement("a");
      logoutBtn.href = "#";
      logoutBtn.textContent = "ထွက်ရန်";
      logoutBtn.className = "nav-link";
      logoutBtn.style.marginLeft = "0.5rem";
      logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        localStorage.removeItem("smartride_currentUser");
        window.location.href = "/";
      });
      navLinks.appendChild(logoutBtn);
    }
  }
}
// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  updateNavigation();

  // Theme toggle
  document
    .getElementById("themeToggleBtn")
    ?.addEventListener("click", toggleTheme);

  // Mobile hamburger menu toggle
  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  const navLinks = document.querySelector(".nav-links");
  if (mobileMenuBtn && navLinks) {
    mobileMenuBtn.addEventListener("click", () => {
      navLinks.classList.toggle("active");
      mobileMenuBtn.classList.toggle("active");
    });
    // Close menu when a nav link is clicked
    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        navLinks.classList.remove("active");
        mobileMenuBtn.classList.remove("active");
      });
    });
  }

  // Add animation classes to elements
  const animatedElements = document.querySelectorAll(
    ".step-card, .benefit-item, .price-card",
  );
  animatedElements.forEach((el, index) => {
    if (!el.classList.contains("animate-fade-in-up")) {
      el.classList.add("animate-fade-in-up");
      el.classList.add(`animate-delay-${(index % 5) + 1}`);
    }
  });
});
// Export to use other modules
export { updateNavigation };
