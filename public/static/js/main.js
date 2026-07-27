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

  initDarkMode();
  initCookieBanner();
});

// ---------------------------------------------------------------------
// Mode clair / sombre — 3 états explicites :
//   'system' (par défaut) → suit la préférence de l'OS, réagit en direct
//   'light'  → forcé, indépendant de l'OS
//   'dark'   → forcé, indépendant de l'OS
// La classe "dark" est posée sur <html> (stratégie Tailwind darkMode:'class').
// ---------------------------------------------------------------------
const CLE_THEME = 'monmenu-theme';
const prefersSombre = window.matchMedia('(prefers-color-scheme: dark)');

function appliquerTheme(theme) {
  const doitEtreSombre = theme === 'dark' || (theme === 'system' && prefersSombre.matches);
  document.documentElement.classList.toggle('dark', doitEtreSombre);
  mettreAJourIconeToggle(theme);
}

function mettreAJourIconeToggle(theme) {
  const btn = document.getElementById('dark-toggle');
  if (!btn) return;
  const icon = btn.querySelector('i');
  if (!icon) return;
  // Icône reflète l'état ACTUEL, pour indiquer ce que l'on va basculer
  const map = { system: 'fa-circle-half-stroke', light: 'fa-sun', dark: 'fa-moon' };
  icon.className = 'fa-solid ' + (map[theme] || 'fa-circle-half-stroke');
  btn.setAttribute('aria-label', 'Thème actuel : ' + theme + '. Cliquer pour changer.');
}

function initDarkMode() {
  const theme = localStorage.getItem(CLE_THEME) || 'system';
  appliquerTheme(theme);

  // Réagit en direct si l'utilisateur change la préférence de son OS
  // (uniquement pertinent quand le thème choisi est 'system')
  prefersSombre.addEventListener('change', () => {
    const themeCourant = localStorage.getItem(CLE_THEME) || 'system';
    if (themeCourant === 'system') appliquerTheme('system');
  });

  const darkToggle = document.getElementById('dark-toggle');
  if (darkToggle) {
    darkToggle.addEventListener('click', () => {
      const actuel = localStorage.getItem(CLE_THEME) || 'system';
      // Cycle : system -> light -> dark -> system ...
      const suivant = actuel === 'system' ? 'light' : actuel === 'light' ? 'dark' : 'system';
      localStorage.setItem(CLE_THEME, suivant);
      appliquerTheme(suivant);
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
