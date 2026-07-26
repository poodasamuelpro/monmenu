// MonMenu — Scripts globaux
'use strict';

// ---- Menu mobile toggle ----
document.addEventListener('DOMContentLoaded', () => {
  const menuToggle = document.getElementById('menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
      const icon = menuToggle.querySelector('i');
      if (icon) {
        icon.className = mobileMenu.classList.contains('hidden')
          ? 'fa-solid fa-bars'
          : 'fa-solid fa-xmark';
      }
    });
  }

  // ---- Mode sombre/clair ----
  initDarkMode();

  // ---- Cookie banner ----
  initCookieBanner();
});

// ---- Mode sombre ----
function initDarkMode() {
  const stored = localStorage.getItem('color-scheme');
  if (stored === 'light') {
    document.body.classList.add('light-mode');
  } else if (stored === 'dark') {
    document.body.classList.remove('light-mode');
  }
  // Bouton toggle si présent
  const darkToggle = document.getElementById('dark-toggle');
  if (darkToggle) {
    darkToggle.addEventListener('click', () => {
      const isLight = document.body.classList.toggle('light-mode');
      localStorage.setItem('color-scheme', isLight ? 'light' : 'dark');
    });
  }
}

// ---- Cookie banner ----
function initCookieBanner() {
  const banner = document.getElementById('cookie-banner');
  if (!banner) return;
  const consent = localStorage.getItem('cookie-consent');
  if (!consent) {
    setTimeout(() => banner.classList.remove('hidden'), 1500);
  }
}

function acceptCookies() {
  localStorage.setItem('cookie-consent', 'accepted');
  const banner = document.getElementById('cookie-banner');
  if (banner) banner.classList.add('hidden');
}

function rejectCookies() {
  localStorage.setItem('cookie-consent', 'rejected');
  const banner = document.getElementById('cookie-banner');
  if (banner) banner.classList.add('hidden');
}

// ---- Exposer globalement ----
window.acceptCookies = acceptCookies;
window.rejectCookies = rejectCookies;
