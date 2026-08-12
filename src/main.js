import { isLoggedIn, getCurrentUser } from "./js/auth.js";
import { toggleTheme } from "./js/theme.js";

function updateNavigation() {
  const navLinks = document.querySelector(".nav-links");
  if (!navLinks) return;
  if (isLoggedIn()) {
    const user = getCurrentUser();

    const loginLink = navLinks.querySelector(".nav-cta");
    if (loginLink) {
      loginLink.textContent = "Dashboard";
      loginLink.href = "/src/pages/dashboard.html";
    }

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

document.addEventListener("DOMContentLoaded", () => {
  updateNavigation();

  document
    .getElementById("themeToggleBtn")
    ?.addEventListener("click", toggleTheme);

  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  const navLinks = document.querySelector(".nav-links");
  if (mobileMenuBtn && navLinks) {
    mobileMenuBtn.addEventListener("click", () => {
      navLinks.classList.toggle("active");
      mobileMenuBtn.classList.toggle("active");
    });

    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        navLinks.classList.remove("active");
        mobileMenuBtn.classList.remove("active");
      });
    });
  }

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

export { updateNavigation };

window.addEventListener("load", () => {
  setTimeout(() => {
    const splash = document.getElementById("splash-screen");

    splash.style.opacity = "0";

    setTimeout(() => {
      splash.style.display = "none";
    }, 800);
  }, 2500);
});
