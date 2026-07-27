// =============================================================
// COMPOSANT NAV — Header/navigation principal
// Affiché sur toutes les pages publiques du site
// Mise à jour : ajout du bouton #dark-toggle (desktop + mobile),
// requis par static/js/main.js pour la bascule clair/sombre/système.
// =============================================================

export function renderNav(nomProjet: string, activePage: string = ''): string {
  const isActive = (page: string) =>
    activePage === page
      ? 'text-red-600 dark:text-red-400 font-semibold'
      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium'

  return `
<header class="bg-white dark:bg-[#0B0A09] border-b border-gray-100 dark:border-gray-800 sticky top-0 z-50 shadow-sm transition-colors" id="main-header">
  <nav class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" aria-label="Navigation principale">
    <div class="flex items-center justify-between h-16">

      <!-- Logo -->
      <a href="/" class="flex items-center gap-2 font-bold text-xl text-red-600 dark:text-red-400 flex-shrink-0" aria-label="${nomProjet} — Accueil">
        <i class="fa-solid fa-utensils" aria-hidden="true"></i>
        <span>${nomProjet}</span>
      </a>

      <!-- Menu desktop -->
      <div class="hidden md:flex items-center gap-6" role="menubar">
        <a href="/#fonctionnalites" role="menuitem"
          class="text-sm transition-colors ${isActive('fonctionnalites')}">
          Fonctionnalités
        </a>
        <a href="/#tarifs" role="menuitem"
          class="text-sm transition-colors ${isActive('tarifs')}">
          Tarifs
        </a>
        <a href="/blog" role="menuitem"
          class="text-sm transition-colors ${isActive('blog')}">
          Blog
        </a>
        <a href="/contact" role="menuitem"
          class="text-sm transition-colors ${isActive('contact')}">
          Contact
        </a>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-3">
        <!-- Bascule thème clair / sombre / système — cf. static/js/main.js -->
        <button id="dark-toggle" type="button"
          class="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:border-red-300 dark:hover:border-red-500 transition-colors flex-shrink-0"
          aria-label="Changer de thème">
          <i class="fa-solid fa-circle-half-stroke text-sm" aria-hidden="true"></i>
        </button>

        <a href="/dashboard"
          class="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
          <i class="fa-regular fa-circle-user text-base" aria-hidden="true"></i>
          <span>Connexion</span>
        </a>
        <a href="/inscription"
          class="hidden md:inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm">
          <i class="fa-solid fa-store text-xs" aria-hidden="true"></i>
          <span>Créer ma boutique</span>
        </a>
        <button id="menu-toggle" aria-expanded="false" aria-controls="mobile-menu"
          class="md:hidden p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Ouvrir le menu">
          <i class="fa-solid fa-bars" aria-hidden="true"></i>
        </button>
      </div>
    </div>

    <!-- Menu mobile -->
    <div id="mobile-menu" class="hidden md:hidden pb-4" aria-hidden="true" role="menu">
      <div class="flex flex-col gap-1 pt-2 border-t border-gray-100 dark:border-gray-800">
        <a href="/#fonctionnalites" role="menuitem"
          class="px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg flex items-center gap-2">
          <i class="fa-solid fa-star text-gray-400 dark:text-gray-500 w-4 text-center" aria-hidden="true"></i>
          Fonctionnalités
        </a>
        <a href="/#tarifs" role="menuitem"
          class="px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg flex items-center gap-2">
          <i class="fa-solid fa-tag text-gray-400 dark:text-gray-500 w-4 text-center" aria-hidden="true"></i>
          Tarifs
        </a>
        <a href="/blog" role="menuitem"
          class="px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg flex items-center gap-2">
          <i class="fa-solid fa-newspaper text-gray-400 dark:text-gray-500 w-4 text-center" aria-hidden="true"></i>
          Blog
        </a>
        <a href="/contact" role="menuitem"
          class="px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg flex items-center gap-2">
          <i class="fa-solid fa-envelope text-gray-400 dark:text-gray-500 w-4 text-center" aria-hidden="true"></i>
          Contact
        </a>
        <div class="border-t border-gray-100 dark:border-gray-800 mt-1 pt-1">
          <a href="/dashboard" role="menuitem"
            class="px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg flex items-center gap-2">
            <i class="fa-regular fa-circle-user text-gray-400 dark:text-gray-500 w-4 text-center" aria-hidden="true"></i>
            Connexion restaurant
          </a>
        </div>
      </div>
    </div>
  </nav>
</header>`
}
