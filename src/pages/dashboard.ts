// src/pages/dashboard.ts
// v1.9.0 — AJOUT : lien sidebar "Historique paiements" (page dédiée
// /dashboard/historique-paiements, gérée par loadHistoriquePaiements()
// dans dashboard.js). Tout le reste du fichier est inchangé.
import { renderHead } from '../components/head'

export function renderDashboardPage(
  nomProjet: string,
  supabaseUrl: string = '',
  supabaseAnonKey: string = ''
): string {
  const supabaseConfig = supabaseUrl
    ? `<script>window.__SUPABASE_URL__=${JSON.stringify(supabaseUrl)};window.__SUPABASE_ANON_KEY__=${JSON.stringify(supabaseAnonKey)};</script>`
    : ''

  return `${renderHead(
    `Tableau de bord — ${nomProjet}`,
    `Gérez vos commandes, votre menu et vos statistiques.`,
    nomProjet,
    `<meta name="robots" content="noindex, nofollow">\n  ${supabaseConfig}`
  )}
<body class="font-sans bg-gray-50 min-h-screen">
  <div id="dashboard-app">
    <!-- Sidebar -->
    <aside id="sidebar" class="fixed left-0 top-0 h-full w-60 bg-gray-900 text-white flex flex-col z-40 -translate-x-full lg:translate-x-0 transition-transform">
      <div class="p-5 border-b border-gray-800">
        <a href="/" class="flex items-center gap-2 text-red-400 font-bold text-lg hover:text-red-300 transition-colors">
          <i class="fa-solid fa-utensils"></i>
          <span>${nomProjet}</span>
        </a>
        <div id="tenant-name" class="text-xs text-gray-500 mt-1 truncate"></div>
      </div>
      <nav class="flex-1 p-4 space-y-1 overflow-y-auto">
        <a href="/dashboard/commandes" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
          <i class="fa-solid fa-receipt w-4 text-center"></i> Commandes
        </a>
        <a href="/dashboard/menu" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
          <i class="fa-solid fa-book-open w-4 text-center"></i> Menu
        </a>
        <a href="/dashboard/statistiques" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
          <i class="fa-solid fa-chart-bar w-4 text-center"></i> Statistiques
        </a>
        <a href="/dashboard/livreurs" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
          <i class="fa-solid fa-motorcycle w-4 text-center"></i> Livreurs
        </a>
        <a href="/dashboard/qrcode" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
          <i class="fa-solid fa-qrcode w-4 text-center"></i> QR Code
        </a>
        <a href="/dashboard/codes-promo" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
          <i class="fa-solid fa-ticket w-4 text-center"></i> Codes promo
        </a>
        <a href="/dashboard/pdv" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
          <i class="fa-solid fa-map-location-dot w-4 text-center"></i> Mon restaurant
        </a>
        <a href="/dashboard/apparence" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
          <i class="fa-solid fa-palette w-4 text-center"></i> Apparence
        </a>
        <a href="/dashboard/parametres" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
          <i class="fa-solid fa-gear w-4 text-center"></i> Paramètres
        </a>
        <!-- Abonnement -->
        <a href="/dashboard/abonnement" id="nav-abonnement" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
          <i class="fa-solid fa-credit-card w-4 text-center"></i> Abonnement
          <span id="badge-abonnement" class="hidden ml-auto bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full">!</span>
        </a>
        <!-- AJOUT v1.9.0 — Historique paiements (page dédiée) -->
        <a href="/dashboard/historique-paiements" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
          <i class="fa-solid fa-clock-rotate-left w-4 text-center"></i> Historique paiements
        </a>
      </nav>
      <div class="p-4 border-t border-gray-800">
        <button onclick="logout()"
          class="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors w-full">
          <i class="fa-solid fa-arrow-right-from-bracket"></i> Déconnexion
        </button>
      </div>
    </aside>

    <!-- Main content -->
    <div class="lg:pl-60 min-h-screen">
      <header class="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div class="px-4 py-3 flex items-center gap-3">
          <!-- Bouton menu sidebar mobile -->
          <button onclick="toggleSidebar()" class="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-600" aria-label="Menu">
            <i class="fa-solid fa-bars"></i>
          </button>

          <!-- Bouton Retour (masqué sur la section commandes = accueil) -->
          <button id="btn-retour" onclick="retourAccueil()"
            class="hidden items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Retour aux commandes"
            title="Retour aux commandes">
            <i class="fa-solid fa-arrow-left text-sm"></i>
          </button>

          <h1 id="page-title" class="font-bold text-gray-900 text-lg flex-1">Commandes</h1>

          <div class="flex items-center gap-3">
            <!-- Indicateur Realtime -->
            <span id="realtime-indicator" class="flex items-center gap-1.5 text-xs text-green-600">
              <i class="fa-solid fa-circle text-xs animate-pulse"></i>
              <span class="hidden sm:inline">Temps réel</span>
            </span>

            <!-- Lien boutique -->
            <a id="boutique-link" href="#" target="_blank"
              class="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-red-600 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition-colors">
              <i class="fa-solid fa-store text-xs"></i>
              Ma boutique
            </a>

            <!-- Cloche notifications -->
            <div class="relative">
              <button id="btn-notif"
                onclick="toggleNotifPanel()"
                class="relative p-2 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
                aria-label="Notifications">
                <i class="fa-solid fa-bell text-sm"></i>
                <span id="notif-badge"
                  class="hidden absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                  0
                </span>
              </button>

              <!-- Panneau notifications (géré par notifications.js) -->
              <div id="notif-panel"
                class="hidden absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 overflow-hidden">
                <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <span class="font-bold text-gray-900 text-sm">Notifications</span>
                  <button onclick="toutMarquerLu()" class="text-xs text-red-600 hover:underline font-medium">
                    Tout marquer comme lu
                  </button>
                </div>
                <div id="notif-liste" class="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                  <div class="text-center py-8 text-gray-400 text-sm">
                    <i class="fa-solid fa-bell-slash mb-2 block text-xl opacity-40"></i>
                    Aucune notification
                  </div>
                </div>
                <div id="notif-footer" class="hidden px-4 py-2.5 border-t border-gray-100 flex items-center justify-between">
                  <button id="notif-prev" onclick="notifPagePrev()" class="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40" disabled>
                    <i class="fa-solid fa-chevron-left mr-0.5"></i> Précédent
                  </button>
                  <span id="notif-page-info" class="text-xs text-gray-400"></span>
                  <button id="notif-next" onclick="notifPageNext()" class="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40">
                    Suivant <i class="fa-solid fa-chevron-right ml-0.5"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <!-- Zone bandeau notifications paiement -->
      <div id="notification-bandeaux" class="bg-white"></div>

      <main class="p-4 lg:p-6" id="dashboard-content">
        <!-- Section Commandes (chargée par dashboard.js) -->
        <section id="section-commandes">
          <div class="flex flex-wrap gap-3 mb-6">
            ${['en_attente', 'confirmee', 'en_preparation', 'en_livraison', 'livree', 'annulee'].map(s => `
              <button onclick="filtrerCommandes('${s}')" class="statut-btn px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600 transition-colors" data-statut="${s}">
                ${s.replace('_', ' ')}
              </button>
            `).join('')}
            <button onclick="filtrerCommandes(null)" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white">
              Toutes
            </button>
          </div>
          <div id="commandes-list" class="space-y-3">
            <div class="text-center py-12 text-gray-400">
              <i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3 block"></i>
              <p class="text-sm">Chargement des commandes...</p>
            </div>
          </div>
        </section>
      </main>
    </div>

    <!-- Sidebar overlay mobile -->
    <div id="sidebar-overlay" class="fixed inset-0 bg-black/50 z-30 hidden lg:hidden" onclick="toggleSidebar()"></div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
  <!-- auth-fetch.js DOIT être chargé avant dashboard.js et dashboard-paiement.js -->
  <script src="/static/js/auth-fetch.js"></script>
  <script src="/static/js/dashboard.js"></script>
  <script src="/static/js/dashboard-paiement.js"></script>
  <script src="/static/js/notifications.js"></script>
  <script>
    try {
      const tenant = JSON.parse(localStorage.getItem('monmenu_tenant') || '{}');
      if (tenant.nom) {
        document.getElementById('tenant-name').textContent = tenant.nom;
        const boutiqueLink = document.getElementById('boutique-link');
        if (tenant.slug) {
          boutiqueLink.href = '/' + tenant.slug;
          boutiqueLink.classList.remove('hidden');
        }
      }
    } catch {}

    function toggleSidebar() {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      sidebar.classList.toggle('-translate-x-full');
      overlay.classList.toggle('hidden');
    }

    async function logout() {
      if (!confirm('Se déconnecter ?')) return;
      try {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
      } catch {}
      localStorage.removeItem('monmenu_tenant');
      window.location.href = '/dashboard';
    }

    document.addEventListener('click', function(e) {
      const panel = document.getElementById('notif-panel');
      const btn = document.getElementById('btn-notif');
      if (panel && !panel.classList.contains('hidden') && btn) {
        if (!panel.contains(e.target) && !btn.contains(e.target)) {
          panel.classList.add('hidden');
        }
      }
    });

    if (typeof initDashboard === 'function') initDashboard();
    if (typeof initBandeauxPaiement === 'function') initBandeauxPaiement();
  </script>
</body>
</html>`
}
