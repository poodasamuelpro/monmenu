// MonMenu — Scripts globaux
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  // ---- Menu mobile toggle ----
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

  initCookieBanner();
});

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
