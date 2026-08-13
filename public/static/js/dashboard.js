// MonMenu — Dashboard restaurant (v2.1.0 — AJOUT édition livreur, suppléments, historique paiements, changement de mot de passe)
//
// AJOUTS v2.0.0 :
//   1. Édition livreur — bouton "Modifier" sur chaque carte livreur,
//      utilise la route PATCH /api/v1/dashboard/livreurs/:id déjà
//      existante côté serveur (accepte nom/whatsapp_number/actif).
//   2. Gestion des suppléments par produit — bouton "Suppléments" sur
//      chaque produit du menu, CRUD complet via
//      /api/v1/dashboard/produits/:id/supplements et
//      /api/v1/dashboard/supplements/:id.
//   3. Section "Historique paiements" — nouvelle page dédiée
//      /dashboard/historique-paiements, réutilise construireHistorique()
//      de dashboard-paiement.js sur la liste complète (au lieu du
//      sous-ensemble affiché dans la page Abonnement).
//
// AJOUT v2.1.0 — CORRECTIF BUG-5 (changement de mot de passe) :
//   La section "Sécurité" de Paramètres n'affichait qu'un bouton
//   "Demander un lien de réinitialisation" qui se contentait d'un
//   alert('Contactez le support...') — AUCUN appel réseau n'était fait,
//   alors que la route POST /api/v1/dashboard/profil/change-password
//   existe déjà et fonctionne côté serveur (ancien mdp + nouveau,
//   notification in-app "Mot de passe modifié"). Remplacé par un
//   formulaire réel (ancien mdp + nouveau + confirmation) qui appelle
//   cette route via saveChangementMdp().
//
// Tout le reste du fichier est inchangé — aucune régression sur les
// fonctionnalités existantes (commandes, menu, statistiques, QR code,
// apparence, codes promo, PDV, abonnement).
'use strict';

let currentSection = 'commandes';
let currentFilter = null;
let authToken = null;
let tenantData = null;
let commandesInterval = null;

let _commandeRegistry = {};

let _supabaseClient = null;
let _realtimeChannel = null;
let _realtimeFallbackInterval = null;

const JOURS_SEMAINE = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const JOURS_LABELS = {
  lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi', jeudi: 'Jeudi',
  vendredi: 'Vendredi', samedi: 'Samedi', dimanche: 'Dimanche'
};

// ==============================
// WRAPPER FETCH AVEC SESSION AUTO-RAFRAÎCHIE
// ==============================
function dashFetch(url, opts = {}) {
  const fetchFn = window.fetchAvecSession || fetch;
  return fetchFn(url, { credentials: 'include', ...opts });
}

// ==============================
// UTILITAIRES SÉCURITÉ
// ==============================
function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escJs(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E');
}

// ==============================
// MODAL UTILITAIRES
// ==============================
function showModal(titre, contenu) {
  let modal = document.getElementById('dash-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'dash-modal';
    modal.className = 'fixed inset-0 z-50';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/50" onclick="closeModal()"></div>
    <div class="absolute inset-x-4 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-white rounded-2xl sm:w-96 shadow-2xl max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
        <h3 class="font-bold text-gray-900">${escHtml(titre)}</h3>
        <button onclick="closeModal()" class="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors" aria-label="Fermer">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="p-5">${contenu}</div>
    </div>`;
  modal.classList.remove('hidden');
  document.addEventListener('keydown', _modalEscHandler);
}

function closeModal() {
  const modal = document.getElementById('dash-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.innerHTML = '';
  }
  document.removeEventListener('keydown', _modalEscHandler);
}

function _modalEscHandler(e) {
  if (e.key === 'Escape') closeModal();
}

// ==============================
// GESTION DU BOUTON RETOUR
// ==============================
const SECTIONS_AVEC_RETOUR = ['menu','statistiques','livreurs','qrcode','apparence','parametres','codes-promo','pdv','abonnement','historique-paiements'];

function _updateBtnRetour(section) {
  const btn = document.getElementById('btn-retour');
  if (!btn) return;
  if (SECTIONS_AVEC_RETOUR.includes(section)) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}

function retourAccueil() {
  navigateTo('commandes');
  history.pushState({}, '', '/dashboard/commandes');
}

// ==============================
// SUPABASE REALTIME
// ==============================
function initRealtimeCommandes(tenantId) {
  const supabaseUrl = window.__SUPABASE_URL__;
  const supabaseAnonKey = window.__SUPABASE_ANON_KEY__;

  if (!supabaseUrl || !supabaseAnonKey || typeof window.supabase === 'undefined') {
    console.warn('[Realtime] Supabase JS ou clés indisponibles — fallback polling activé');
    _startFallbackPolling();
    return;
  }

  if (!_supabaseClient) {
    _supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
      realtime: { timeout: 30000 }
    });
  }

  if (_realtimeChannel) {
    _supabaseClient.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }

  _realtimeChannel = _supabaseClient
    .channel('commandes-dashboard-' + tenantId)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'commandes', filter: `tenant_id=eq.${tenantId}` },
      (payload) => {
        console.log('[Realtime] Nouvelle commande :', payload.new?.id);
        _onNouvelleCommande(payload.new);
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'commandes', filter: `tenant_id=eq.${tenantId}` },
      (payload) => {
        console.log('[Realtime] Commande mise à jour :', payload.new?.id, payload.new?.statut);
        if (currentSection === 'commandes') fetchCommandes();
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Realtime] Abonnement Realtime actif pour tenant', tenantId);
        if (_realtimeFallbackInterval) {
          clearInterval(_realtimeFallbackInterval);
          _realtimeFallbackInterval = null;
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[Realtime] Erreur connexion Realtime (' + status + ') — fallback polling activé', err);
        _startFallbackPolling();
      }
    });
}

function _onNouvelleCommande(commande) {
  if (currentSection === 'commandes') fetchCommandes();
  _afficherNotificationCommande(commande);
  if (typeof rafraichirBadgeNotifs === 'function') rafraichirBadgeNotifs();
}

function _afficherNotificationCommande(commande) {
  const toast = document.createElement('div');
  toast.className = 'fixed top-4 right-4 z-50 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-bounce';
  toast.innerHTML = `<i class="fa-solid fa-bell"></i> <span>Nouvelle commande de <strong>${escHtml(commande?.client_nom || 'Client')}</strong> !</span>`;
  document.body.appendChild(toast);
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
  setTimeout(() => toast.remove(), 5000);
}

function _startFallbackPolling() {
  if (_realtimeFallbackInterval) return;
  _realtimeFallbackInterval = setInterval(() => {
    if (currentSection === 'commandes') fetchCommandes();
  }, 120000);
}

function teardownRealtime() {
  if (_realtimeChannel && _supabaseClient) {
    _supabaseClient.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
  if (_realtimeFallbackInterval) {
    clearInterval(_realtimeFallbackInterval);
    _realtimeFallbackInterval = null;
  }
}

// ==============================
// INIT DASHBOARD
// ==============================
async function initDashboard() {
  authToken = null;

  try {
    const res = await dashFetch('/api/v1/dashboard/profil');
    if (res.ok) {
      const profil = await res.json();
      tenantData = profil;
      try {
        localStorage.setItem('monmenu_tenant', JSON.stringify({
          id: profil.id, nom: profil.nom, slug: profil.slug,
          couleur_primaire: profil.couleur_primaire,
          couleur_secondaire: profil.couleur_secondaire
        }));
      } catch {}
      const nameEl = document.getElementById('tenant-name');
      if (nameEl) nameEl.textContent = profil.nom || 'Mon Restaurant';
      const boutiqueLink = document.getElementById('boutique-link');
      if (boutiqueLink && profil.slug) {
        boutiqueLink.href = '/' + profil.slug;
        boutiqueLink.classList.remove('hidden');
      }
    }
  } catch {}

  if (!tenantData) {
    const tenantStr = localStorage.getItem('monmenu_tenant');
    if (tenantStr) {
      try { tenantData = JSON.parse(tenantStr); } catch {}
    }
    const nameEl = document.getElementById('tenant-name');
    if (nameEl && tenantData) nameEl.textContent = tenantData.nom || 'Mon Restaurant';
  }

  const path = window.location.pathname;
  let section = 'commandes';
  if (path.includes('/menu')) section = 'menu';
  else if (path.includes('/statistiques')) section = 'statistiques';
  else if (path.includes('/livreurs')) section = 'livreurs';
  else if (path.includes('/qrcode')) section = 'qrcode';
  else if (path.includes('/codes-promo')) section = 'codes-promo';
  else if (path.includes('/pdv')) section = 'pdv';
  else if (path.includes('/apparence')) section = 'apparence';
  else if (path.includes('/abonnement')) section = 'abonnement';
  else if (path.includes('/historique-paiements')) section = 'historique-paiements';
  else if (path.includes('/parametres')) section = 'parametres';

  try {
    navigateTo(section);
  } catch (err) {
    console.error('[Dashboard] Erreur navigateTo initial:', err);
  }

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const href = this.getAttribute('href') || '';
      const parts = href.replace(/\/$/, '').split('/');
      const seg = parts[parts.length - 1] || 'commandes';
      const sectionName = seg === 'dashboard' ? 'commandes' : seg;
      history.pushState({ section: sectionName }, '', href);
      navigateTo(sectionName);
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      if (sidebar) sidebar.classList.add('-translate-x-full');
      if (overlay) overlay.classList.add('hidden');
    });
  });

  window.addEventListener('popstate', function(e) {
    const path = window.location.pathname;
    let sec = 'commandes';
    if (path.includes('/menu')) sec = 'menu';
    else if (path.includes('/statistiques')) sec = 'statistiques';
    else if (path.includes('/livreurs')) sec = 'livreurs';
    else if (path.includes('/qrcode')) sec = 'qrcode';
    else if (path.includes('/codes-promo')) sec = 'codes-promo';
    else if (path.includes('/pdv')) sec = 'pdv';
    else if (path.includes('/apparence')) sec = 'apparence';
    else if (path.includes('/abonnement')) sec = 'abonnement';
    else if (path.includes('/historique-paiements')) sec = 'historique-paiements';
    else if (path.includes('/parametres')) sec = 'parametres';
    navigateTo(sec);
  });

  if (typeof initNotifBadge === 'function') initNotifBadge();
}

function setActiveNavLink(section) {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('bg-gray-800', 'text-white');
    link.classList.add('text-gray-300');
    const href = link.getAttribute('href') || '';
    const parts = href.replace(/\/$/, '').split('/');
    const seg = parts[parts.length - 1] || '';
    if (seg === section || (section === 'commandes' && seg === 'commandes')) {
      link.classList.add('bg-gray-800', 'text-white');
      link.classList.remove('text-gray-300');
    }
  });
}

function navigateTo(section) {
  if (commandesInterval) { clearInterval(commandesInterval); commandesInterval = null; }
  if (currentSection === 'commandes' && section !== 'commandes') {
    teardownRealtime();
  }
  currentSection = section;
  setActiveNavLink(section);

  const title = document.getElementById('page-title');
  const titles = {
    commandes: 'Commandes',
    menu: 'Gestion du menu',
    statistiques: 'Statistiques',
    livreurs: 'Livreurs',
    qrcode: 'QR Code',
    apparence: 'Apparence & Médias',
    parametres: 'Paramètres',
    'codes-promo': 'Codes promo',
    pdv: 'Mon restaurant',
    abonnement: 'Abonnement',
    'historique-paiements': 'Historique paiements'
  };
  if (title) title.textContent = titles[section] || section;

  _updateBtnRetour(section);

  switch (section) {
    case 'commandes':    loadCommandes();    break;
    case 'menu':         loadMenu();         break;
    case 'statistiques': loadStatistiques(); break;
    case 'livreurs':     loadLivreurs();     break;
    case 'qrcode':       loadQRCode();       break;
    case 'apparence':    loadApparence();    break;
    case 'parametres':   loadParametres();   break;
    case 'codes-promo':  loadCodesPromo();   break;
    case 'pdv':          loadPdv();          break;
    case 'abonnement':   loadAbonnement();   break;
    case 'historique-paiements': loadHistoriquePaiements(); break;
    default:             loadCommandes();    break;
  }
}

function showAuthError() {
  const content = document.getElementById('dashboard-content');
  if (content) {
    content.innerHTML = `<div class="bg-red-50 border border-red-100 rounded-xl p-6 text-center">
      <i class="fa-solid fa-lock text-2xl text-red-400 mb-3 block"></i>
      <p class="font-semibold text-red-700">Session expirée</p>
      <p class="text-sm text-red-500 mt-1">Veuillez vous reconnecter.</p>
      <a href="/connexion" class="mt-4 inline-block bg-red-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-red-700">Se connecter</a>
    </div>`;
  }
}

// ==============================
// SECTION ABONNEMENT
// ==============================
function loadAbonnement() {
  const content = document.getElementById('dashboard-content');
  if (!content) return;
  content.innerHTML = `<div id="section-abonnement-content" class="max-w-2xl"></div>`;

  if (typeof initSectionAbonnement === 'function') {
    initSectionAbonnement();
  } else {
    content.innerHTML = `
      <div class="bg-red-50 border border-red-100 rounded-xl p-4 text-center text-sm text-red-600">
        <i class="fa-solid fa-circle-exclamation mr-1"></i>
        Module de paiement indisponible (dashboard-paiement.js non chargé).
      </div>`;
  }
}

// ==============================
// AJOUT — SECTION HISTORIQUE PAIEMENTS (page dédiée)
// ==============================
// Réutilise construireHistorique() de dashboard-paiement.js sur la liste
// complète de l'historique (au lieu du sous-ensemble affiché dans la page
// Abonnement). Route déjà existante côté serveur : GET /api/v1/paiement/historique.
async function loadHistoriquePaiements() {
  const content = document.getElementById('dashboard-content');
  if (!content) return;

  content.innerHTML = `
    <div id="historique-paiements-content" class="max-w-2xl">
      <div class="text-center py-16 text-gray-400">
        <i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3 block"></i>
        <p class="text-sm">Chargement de l'historique...</p>
      </div>
    </div>`;

  const wrap = document.getElementById('historique-paiements-content');

  try {
    const fetchFn = window.fetchAvecSession || fetch;
    const res = await fetchFn('/api/v1/paiement/historique?limit=50', {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });

    if (res.status === 401) { showAuthError(); return; }
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const data = await res.json();
    wrap.innerHTML = '';

    if (data.abonnements?.length && typeof construireHistorique === 'function') {
      wrap.appendChild(construireHistorique(data.abonnements));
      if (data.total > data.abonnements.length) {
        const note = document.createElement('p');
        note.className = 'text-xs text-gray-400 mt-3 text-center';
        note.textContent = `${data.abonnements.length} sur ${data.total} paiement(s) affiché(s).`;
        wrap.appendChild(note);
      }
    } else {
      wrap.innerHTML = `
        <div class="text-center py-16 text-gray-400">
          <i class="fa-solid fa-receipt text-4xl mb-3 block opacity-40"></i>
          <p class="text-sm font-medium text-gray-600 mb-1">Aucun paiement pour le moment.</p>
          <p class="text-xs">Votre historique de paiements apparaîtra ici.</p>
        </div>`;
    }
  } catch (err) {
    wrap.innerHTML = `
      <div class="bg-red-50 border border-red-100 rounded-xl p-4 text-center text-sm text-red-600">
        <i class="fa-solid fa-circle-exclamation mr-1"></i> Erreur de chargement.
        <button onclick="loadHistoriquePaiements()" class="underline ml-1">Réessayer</button>
      </div>`;
  }
}

// ==============================
// SECTION COMMANDES
// ==============================
async function loadCommandes() {
  const content = document.getElementById('dashboard-content');
  if (!content) return;
  content.innerHTML = `
    <div class="flex flex-wrap gap-2 mb-5">
      <button onclick="filtrerCommandes(null)" class="statut-filter-btn active px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white">Toutes</button>
      ${['en_attente','confirmee','en_preparation','en_livraison','livree','annulee'].map(s =>
        `<button onclick="filtrerCommandes('${s}')" class="statut-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600 transition-colors">${s.replace(/_/g,' ')}</button>`
      ).join('')}
      <button onclick="loadCommandes()" class="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors">
        <i class="fa-solid fa-rotate-right"></i> Actualiser
      </button>
      <button onclick="exportCommandes()" class="flex items-center gap-1.5 text-xs text-green-700 hover:text-green-800 border border-green-200 rounded-lg px-3 py-1.5 transition-colors bg-green-50 hover:bg-green-100">
        <i class="fa-solid fa-file-csv"></i> Export CSV
      </button>
    </div>
    <div id="commandes-list">
      <div class="text-center py-12 text-gray-400">
        <i class="fa-solid fa-circle-notch fa-spin text-2xl mb-3 block"></i>
        <p class="text-sm">Chargement...</p>
      </div>
    </div>`;
  await fetchCommandes();

  let tenantId = tenantData?.id ?? null;
  if (!tenantId) {
    try {
      const res = await dashFetch('/api/v1/dashboard/profil');
      if (res.ok) {
        const profil = await res.json();
        tenantData = profil;
        tenantId = profil.id;
        try {
          localStorage.setItem('monmenu_tenant', JSON.stringify({
            id: profil.id, nom: profil.nom, slug: profil.slug,
            couleur_primaire: profil.couleur_primaire,
            couleur_secondaire: profil.couleur_secondaire
          }));
        } catch {}
        const nameEl = document.getElementById('tenant-name');
        if (nameEl) nameEl.textContent = profil.nom || 'Mon Restaurant';
      }
    } catch {}
  }

  if (tenantId) {
    initRealtimeCommandes(tenantId);
  } else {
    _startFallbackPolling();
  }
}

async function fetchCommandes() {
  const listEl = document.getElementById('commandes-list');
  if (!listEl) return;
  try {
    const url = '/api/v1/dashboard/commandes' + (currentFilter ? '?statut=' + currentFilter : '');
    const res = await dashFetch(url);
    if (res.status === 401) { showAuthError(); return; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    renderCommandes(data.commandes || [], listEl, data.total || 0);
  } catch {
    listEl.innerHTML = `<div class="bg-red-50 border border-red-100 rounded-xl p-4 text-center text-sm text-red-600">
      <i class="fa-solid fa-circle-exclamation mr-1"></i> Erreur de chargement.
      <button onclick="fetchCommandes()" class="underline ml-1">Réessayer</button>
    </div>`;
  }
}

function renderCommandes(commandes, container, total) {
  _commandeRegistry = {};
  commandes.forEach(cmd => { _commandeRegistry[cmd.id] = cmd; });

  if (!commandes.length) {
    container.innerHTML = `<div class="text-center py-16 text-gray-400">
      <i class="fa-regular fa-clipboard text-5xl mb-3 block opacity-40"></i>
      <p class="font-medium text-gray-500">Aucune commande ${currentFilter ? 'avec ce statut' : ''}</p>
      <p class="text-xs mt-1">Les nouvelles commandes apparaissent ici automatiquement.</p>
    </div>`;
    return;
  }
  const STATUTS = {
    en_attente:     { label:'En attente',     icon:'fa-clock',        cls:'statut-en_attente' },
    confirmee:      { label:'Confirmée',      icon:'fa-circle-check', cls:'statut-confirmee' },
    en_preparation: { label:'En préparation', icon:'fa-fire-burner',  cls:'statut-en_preparation' },
    en_livraison:   { label:'En livraison',   icon:'fa-motorcycle',   cls:'statut-en_livraison' },
    livree:         { label:'Livrée',         icon:'fa-check-double', cls:'statut-livree' },
    annulee:        { label:'Annulée',        icon:'fa-xmark',        cls:'statut-annulee' }
  };
  const totalBadge = total > commandes.length
    ? `<p class="text-xs text-gray-400 mb-3">${total} commande(s) au total — 50 premières affichées</p>`
    : '';
  container.innerHTML = totalBadge + commandes.map(cmd => {
    const statut = STATUTS[cmd.statut] || { label: cmd.statut, icon: 'fa-circle', cls: '' };
    const items = typeof cmd.items_json === 'string' ? JSON.parse(cmd.items_json) : (cmd.items_json || []);
    const dateStr = new Date(cmd.created_at).toLocaleString('fr-FR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
    let metadata = {};
    try { if (cmd.metadata) metadata = JSON.parse(cmd.metadata); } catch {}
    const remiseInfo = metadata.remise_promo > 0
      ? `<span class="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">-${(metadata.remise_promo||0).toLocaleString('fr-FR')} FCFA promo</span>`
      : '';
    const actions = [];
    if (cmd.statut === 'en_attente') {
      actions.push(`<button onclick="changerStatut('${cmd.id}','confirmee')" class="bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700"><i class="fa-solid fa-check mr-1"></i>Confirmer</button>`);
      actions.push(`<button onclick="changerStatut('${cmd.id}','annulee')" class="border border-red-200 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50">Annuler</button>`);
    }
    if (cmd.statut === 'confirmee') {
      actions.push(`<button onclick="choisirLivreurEtPreparer('${cmd.id}')" class="bg-orange-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-orange-600"><i class="fa-solid fa-fire-burner mr-1"></i>Préparer</button>`);
    }
    if (cmd.statut === 'en_preparation') {
      actions.push(`<button onclick="changerStatut('${cmd.id}','en_livraison')" class="bg-purple-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-purple-700"><i class="fa-solid fa-motorcycle mr-1"></i>En livraison</button>`);
    }
    if (cmd.statut === 'en_livraison') {
      actions.push(`<button onclick="changerStatut('${cmd.id}','livree')" class="bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-green-700"><i class="fa-solid fa-check-double mr-1"></i>Livrée</button>`);
    }
    // AJOUT — affichage des suppléments choisis sous chaque ligne d'article
    const itemsHtml = items.map(i => {
      const supp = (i.supplements && i.supplements.length)
        ? ` <span class="text-gray-400">(+ ${i.supplements.map(s => escHtml(s.nom)).join(', ')})</span>`
        : '';
      return `<span>${escHtml(i.nom)}${supp} ×${i.quantite}</span>`;
    }).join(' · ');
    return `<div class="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-shadow mb-3">
      <div class="flex items-start justify-between gap-3 mb-2">
        <div>
          <div class="flex items-center gap-2 mb-0.5">
            <span class="font-bold text-gray-900">${escHtml(cmd.client_nom)}</span>
            <span class="text-xs text-gray-400">${dateStr}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-400 font-mono">#${cmd.id ? cmd.id.slice(0,8).toUpperCase() : '—'}</span>
            ${cmd.client_telephone ? `<a href="tel:${escHtml(cmd.client_telephone)}" class="text-xs text-blue-600 hover:underline"><i class="fa-solid fa-phone text-xs mr-0.5"></i>${escHtml(cmd.client_telephone)}</a>` : ''}
          </div>
        </div>
        <span class="statut-badge ${statut.cls} flex-shrink-0"><i class="fa-solid ${statut.icon} text-xs"></i> ${statut.label}</span>
      </div>
      <div class="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 mb-3">${itemsHtml}</div>
      ${cmd.client_adresse ? `<div class="text-xs text-gray-500 mb-2"><i class="fa-solid fa-location-dot mr-1 text-gray-300"></i>${escHtml(cmd.client_adresse)}</div>` : ''}
      ${cmd.notes ? `<div class="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-1.5 mb-2"><i class="fa-solid fa-comment mr-1"></i>${escHtml(cmd.notes)}</div>` : ''}
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div class="flex items-center gap-2 flex-wrap">
          <div class="font-bold text-sm">${(cmd.montant_total||0).toLocaleString('fr-FR')} FCFA</div>
          ${remiseInfo}
          ${cmd.frais_livraison > 0 ? `<span class="text-xs text-gray-400">+${(cmd.frais_livraison).toLocaleString('fr-FR')} liv.</span>` : ''}
        </div>
        <div class="flex gap-2 flex-wrap">${actions.join('')}</div>
      </div>
    </div>`;
  }).join('');
}

// §WhatsApp
function formatWhatsAppNumber(numeroRaw) {
  let n = (numeroRaw || '').replace(/[^0-9+]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  return n.replace(/\D/g, '');
}

function construireMessageConfirmationClient(cmd) {
  const items = typeof cmd.items_json === 'string' ? JSON.parse(cmd.items_json) : (cmd.items_json || []);
  const lignes = items.map(i => {
    const supp = (i.supplements && i.supplements.length) ? ` (+ ${i.supplements.map(s => s.nom).join(', ')})` : '';
    return `  - ${i.nom}${supp} x${i.quantite}`;
  }).join('\n');
  const nomRestaurant = (tenantData && tenantData.nom) ? tenantData.nom : 'notre restaurant';
  const lienSuivi = window.location.origin + '/suivi/' + cmd.token_suivi;

  let msg = `Bonjour ${cmd.client_nom},\n\n`;
  msg += `Votre commande chez *${nomRestaurant}* est *confirmée* ✅\n\n`;
  msg += `*Récapitulatif :*\n${lignes}\n\n`;
  msg += `*Total :* ${(cmd.montant_total || 0).toLocaleString('fr-FR')} FCFA\n`;
  if (cmd.frais_livraison > 0) msg += `*Frais de livraison :* ${(cmd.frais_livraison).toLocaleString('fr-FR')} FCFA\n`;
  msg += `\nSuivez votre commande en temps réel ici :\n${lienSuivi}`;
  return msg;
}

function genererLienWhatsAppClient(numero, message) {
  const numeroNettoye = formatWhatsAppNumber(numero);
  return `https://wa.me/${numeroNettoye}?text=${encodeURIComponent(message)}`;
}

// ==============================
// ASSIGNATION LIVREUR
// ==============================
async function choisirLivreurEtPreparer(commandeId) {
  let livreurs = [];
  try {
    const res = await dashFetch('/api/v1/dashboard/livreurs');
    if (res.ok) {
      const d = await res.json();
      livreurs = (d.livreurs || []).filter(l => l.actif);
    }
  } catch {}

  if (!livreurs.length) {
    changerStatut(commandeId, 'en_preparation');
    return;
  }

  showModal('Mettre en préparation', `
    <form onsubmit="submitChoixLivreur(event,'${commandeId}')" class="space-y-4">
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Assigner un livreur (optionnel)</label>
        <select id="choix-livreur" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
          <option value="">Ne pas assigner maintenant</option>
          ${livreurs.map(l => `<option value="${l.id}">${escHtml(l.nom)}</option>`).join('')}
        </select>
        <p class="text-xs text-gray-400 mt-1">
          Si vous assignez un livreur, un message WhatsApp avec l'adresse, l'itinéraire (Maps/Waze)
          et le montant à encaisser lui sera envoyé automatiquement.
        </p>
      </div>
      <button type="submit" class="w-full bg-orange-500 text-white font-bold py-3 rounded-xl hover:bg-orange-600">
        <i class="fa-solid fa-fire-burner mr-1.5"></i> Mettre en préparation
      </button>
    </form>`);
}

function submitChoixLivreur(e, commandeId) {
  e.preventDefault();
  const livreurId = document.getElementById('choix-livreur')?.value || null;
  closeModal();
  changerStatut(commandeId, 'en_preparation', livreurId);
}

async function changerStatut(commandeId, newStatut, livreurId) {
  const labels = {
    confirmee: 'Confirmer',
    en_preparation: 'Mettre en préparation',
    en_livraison: 'Marquer en livraison',
    livree: 'Marquer comme livrée',
    annulee: 'Annuler'
  };
  if (!confirm((labels[newStatut] || newStatut) + ' cette commande ?')) return;

  const doitNotifierClient = newStatut === 'confirmee';
  const doitNotifierLivreur = newStatut === 'en_preparation' && !!livreurId;

  let whatsappWindowClient = null;
  let whatsappWindowLivreur = null;
  if (doitNotifierClient) whatsappWindowClient = window.open('about:blank', '_blank');
  if (doitNotifierLivreur) whatsappWindowLivreur = window.open('about:blank', '_blank');

  try {
    const body = { statut: newStatut };
    if (livreurId) body.livreur_id = livreurId;

    const res = await dashFetch('/api/v1/dashboard/commandes/' + commandeId + '/statut', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));

      if (doitNotifierClient) {
        const cmd = _commandeRegistry[commandeId];
        if (cmd && cmd.client_telephone) {
          const message = construireMessageConfirmationClient(cmd);
          const lien = genererLienWhatsAppClient(cmd.client_telephone, message);
          if (whatsappWindowClient) whatsappWindowClient.location.href = lien;
          else window.open(lien, '_blank');
        } else if (whatsappWindowClient) {
          whatsappWindowClient.close();
        }
      }

      if (doitNotifierLivreur) {
        if (data.lien_whatsapp_livreur) {
          if (whatsappWindowLivreur) whatsappWindowLivreur.location.href = data.lien_whatsapp_livreur;
          else window.open(data.lien_whatsapp_livreur, '_blank');
        } else if (whatsappWindowLivreur) {
          whatsappWindowLivreur.close();
        }
      }

      await fetchCommandes();
    } else {
      if (whatsappWindowClient) whatsappWindowClient.close();
      if (whatsappWindowLivreur) whatsappWindowLivreur.close();
      alert('Erreur lors de la mise à jour du statut.');
    }
  } catch {
    if (whatsappWindowClient) whatsappWindowClient.close();
    if (whatsappWindowLivreur) whatsappWindowLivreur.close();
    alert('Erreur réseau.');
  }
}

function filtrerCommandes(statut) {
  currentFilter = statut;
  document.querySelectorAll('.statut-filter-btn').forEach(b => {
    b.classList.remove('bg-red-600', 'text-white');
    b.classList.add('border', 'border-gray-200', 'text-gray-600');
  });
  const activeBtn = statut
    ? document.querySelector(`[onclick="filtrerCommandes('${statut}')"]`)
    : document.querySelector(`[onclick="filtrerCommandes(null)"]`);
  if (activeBtn) {
    activeBtn.classList.add('bg-red-600', 'text-white');
    activeBtn.classList.remove('border', 'border-gray-200', 'text-gray-600');
  }
  fetchCommandes();
}

async function exportCommandes() {
  const dateDebut = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const dateFin = new Date().toISOString().split('T')[0];
  try {
    const res = await dashFetch(`/api/v1/dashboard/commandes/export-csv?date_debut=${dateDebut}&date_fin=${dateFin}`);
    if (!res.ok) { alert('Erreur export.'); return; }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `commandes_${dateFin}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch { alert('Erreur réseau.'); }
}

// ==============================
// SECTION MENU
// ==============================
async function loadMenu() {
  const content = document.getElementById('dashboard-content');
  content.innerHTML = `<div class="text-center py-8"><i class="fa-solid fa-circle-notch fa-spin text-xl text-gray-400"></i></div>`;
  try {
    const res = await dashFetch('/api/v1/dashboard/menu');
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderMenuEditor(data.categories || [], content);
  } catch {
    content.innerHTML = '<p class="text-red-500 text-sm p-4">Erreur de chargement du menu.</p>';
  }
}

function renderMenuEditor(categories, container) {
  container.innerHTML = `
    <div class="flex items-center justify-between mb-5">
      <p class="text-sm text-gray-500">${categories.length} catégorie(s)</p>
      <button onclick="showAddCategorieModal()" class="bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1.5">
        <i class="fa-solid fa-plus text-xs"></i> Nouvelle catégorie
      </button>
    </div>
    ${categories.length === 0 ? `
      <div class="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
        <i class="fa-solid fa-book-open text-4xl text-gray-200 mb-4 block"></i>
        <p class="font-semibold text-gray-500 mb-2">Menu vide</p>
        <p class="text-sm text-gray-400 mb-5">Commencez par créer votre première catégorie (ex: Entrées, Plats, Boissons).</p>
        <button onclick="showAddCategorieModal()" class="bg-red-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-red-700">
          <i class="fa-solid fa-plus mr-1.5"></i> Créer une catégorie
        </button>
      </div>` :
    categories.map(cat => `
      <div class="bg-white border border-gray-100 rounded-xl mb-4">
        <div class="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
          <div>
            <h3 class="font-bold text-gray-900">${escHtml(cat.nom)}</h3>
            ${cat.description ? `<p class="text-xs text-gray-400">${escHtml(cat.description)}</p>` : ''}
          </div>
          <div class="flex gap-2">
            <button onclick="showAddProduitModal('${cat.id}')" class="text-xs bg-blue-50 text-blue-600 font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">
              <i class="fa-solid fa-plus mr-1"></i>Produit
            </button>
            <button onclick="showEditCategorieModal('${cat.id}','${escJs(cat.nom)}')" class="text-xs bg-gray-50 text-gray-600 font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-100">
              <i class="fa-solid fa-pen text-xs"></i>
            </button>
            <button onclick="supprimerCategorie('${cat.id}')" class="text-xs bg-red-50 text-red-500 font-semibold px-3 py-1.5 rounded-lg hover:bg-red-100">
              <i class="fa-solid fa-trash text-xs"></i>
            </button>
          </div>
        </div>
        <div class="divide-y divide-gray-50">
          ${(cat.produits||[]).length === 0 ? `<div class="px-5 py-4 text-xs text-gray-400 italic">Aucun produit.</div>` :
          (cat.produits||[]).map(p => `
            <div class="flex items-center gap-4 px-5 py-3 hover:bg-gray-50">
              ${p.photo_url ? `<img src="${escHtml(p.photo_url)}" alt="${escHtml(p.nom)}" class="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-gray-100">` :
                `<div class="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-utensils text-gray-300 text-sm"></i></div>`}
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-sm text-gray-900 truncate">${escHtml(p.nom)}</div>
                ${p.description ? `<div class="text-xs text-gray-400 truncate">${escHtml(p.description)}</div>` : ''}
                <div class="text-xs font-bold text-gray-700 mt-0.5">${(p.prix||0).toLocaleString('fr-FR')} FCFA</div>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <span class="text-xs px-2 py-0.5 rounded-full cursor-pointer ${p.disponible ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}"
                  onclick="toggleDisponible('${p.id}',${p.disponible?1:0})" title="${p.disponible?'Désactiver':'Activer'}">${p.disponible?'Dispo':'Indispo'}</span>
                <button onclick="showSupplementsModal('${p.id}','${escJs(p.nom)}')" class="p-1.5 text-gray-400 hover:text-purple-600" title="Suppléments">
                  <i class="fa-solid fa-layer-group text-xs"></i>
                </button>
                <button onclick="showEditProduitModal('${p.id}','${escJs(p.nom)}','${escJs(p.description||'')}',${p.prix},'${escJs(p.photo_url||'')}')" class="p-1.5 text-gray-400 hover:text-blue-600" title="Modifier">
                  <i class="fa-solid fa-pen text-xs"></i>
                </button>
                <button onclick="supprimerProduit('${p.id}')" class="p-1.5 text-gray-400 hover:text-red-500" title="Supprimer">
                  <i class="fa-solid fa-trash text-xs"></i>
                </button>
              </div>
            </div>`).join('')}
        </div>
      </div>`).join('')}`;
}

// --- Catégories modals ---
function showAddCategorieModal() {
  showModal('Nouvelle catégorie', `
    <form onsubmit="submitAddCategorie(event)" class="space-y-4">
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Nom *</label>
        <input id="cat-nom" type="text" required maxlength="100" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="Entrées, Plats, Boissons...">
      </div>
      <button type="submit" class="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700">Créer la catégorie</button>
    </form>`);
}
async function submitAddCategorie(e) {
  e.preventDefault();
  const nom = document.getElementById('cat-nom').value.trim();
  try {
    const res = await dashFetch('/api/v1/dashboard/categories', {
      method: 'POST', headers: {'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
      body: JSON.stringify({ nom })
    });
    if (res.ok) { closeModal(); loadMenu(); }
    else { const d = await res.json(); alert(d.error||'Erreur'); }
  } catch { alert('Erreur réseau.'); }
}
function showEditCategorieModal(catId, nom) {
  showModal('Modifier la catégorie', `
    <form onsubmit="submitEditCategorie(event,'${catId}')" class="space-y-4">
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Nom *</label>
        <input id="edit-cat-nom" type="text" required maxlength="100" value="${escHtml(nom)}" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
      </div>
      <button type="submit" class="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700">Enregistrer</button>
    </form>`);
}
async function submitEditCategorie(e, catId) {
  e.preventDefault();
  const nom = document.getElementById('edit-cat-nom').value.trim();
  try {
    const res = await dashFetch('/api/v1/dashboard/categories/' + catId, {
      method: 'PATCH', headers: {'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
      body: JSON.stringify({ nom })
    });
    if (res.ok) { closeModal(); loadMenu(); }
    else { const d = await res.json(); alert(d.error||'Erreur'); }
  } catch { alert('Erreur réseau.'); }
}
async function supprimerCategorie(catId) {
  if (!confirm('Supprimer cette catégorie ? Elle doit être vide.')) return;
  try {
    const res = await dashFetch('/api/v1/dashboard/categories/' + catId, {
      method: 'DELETE', headers: {'X-Requested-With':'XMLHttpRequest'}
    });
    if (res.ok) loadMenu();
    else { const d = await res.json(); alert(d.error||'Impossible de supprimer.'); }
  } catch { alert('Erreur réseau.'); }
}

// --- Produits modals ---
function showAddProduitModal(categorieId) {
  showModal('Nouveau produit', `
    <form onsubmit="submitAddProduit(event,'${categorieId}')" class="space-y-4">
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Nom *</label>
        <input id="prod-nom" type="text" required maxlength="200" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="Thiéboudienne, Jus de bissap...">
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
        <textarea id="prod-desc" rows="2" maxlength="500" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"></textarea>
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Prix (FCFA) *</label>
        <input id="prod-prix" type="number" required min="0" max="999999" step="50" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="2500">
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Photo (optionnel — JPEG/PNG/WebP, max 5 MB)</label>
        <input id="prod-photo" type="file" accept="image/jpeg,image/png,image/webp" class="w-full text-sm text-gray-600 border border-gray-200 rounded-xl px-3 py-2.5">
        <div id="upload-progress" class="hidden mt-2 text-xs text-blue-600"><i class="fa-solid fa-circle-notch fa-spin mr-1"></i>Téléversement...</div>
        <div id="photo-preview" class="hidden mt-2"></div>
      </div>
      <button type="submit" class="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700">Ajouter le produit</button>
    </form>`);
}
async function submitAddProduit(e, categorieId) {
  e.preventDefault();
  const nom = document.getElementById('prod-nom').value.trim();
  const description = document.getElementById('prod-desc').value.trim();
  const prix = parseFloat(document.getElementById('prod-prix').value);
  const photoInput = document.getElementById('prod-photo');
  if (!nom || isNaN(prix)) { alert('Nom et prix requis.'); return; }
  let photo_url = null;
  if (photoInput && photoInput.files && photoInput.files[0]) {
    const uploadDiv = document.getElementById('upload-progress');
    if (uploadDiv) uploadDiv.classList.remove('hidden');
    try {
      const fd = new FormData();
      fd.append('file', photoInput.files[0]);
      const upRes = await dashFetch('/api/v1/dashboard/upload-image', {
        method: 'POST', headers: {'X-Requested-With':'XMLHttpRequest'}, body: fd
      });
      if (upRes.ok) {
        const upData = await upRes.json();
        photo_url = upData.url;
        const prev = document.getElementById('photo-preview');
        if (prev) { prev.innerHTML = `<img src="${upData.url}" class="w-16 h-16 rounded-lg object-cover border border-green-200">`; prev.classList.remove('hidden'); }
      } else { const err = await upRes.json(); alert('Erreur upload : '+(err.error||'Échec')); }
    } catch { alert('Erreur upload.'); }
    if (uploadDiv) uploadDiv.classList.add('hidden');
  }
  try {
    const res = await dashFetch('/api/v1/dashboard/produits', {
      method: 'POST', headers: {'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
      body: JSON.stringify({ categorie_id: categorieId, nom, description, prix, disponible: true, photo_url })
    });
    if (res.ok) { closeModal(); loadMenu(); }
    else { const d = await res.json(); alert(d.error||'Erreur'); }
  } catch { alert('Erreur réseau.'); }
}

function showEditProduitModal(prodId, nom, description, prix, photoUrl) {
  showModal('Modifier le produit', `
    <form onsubmit="submitEditProduit(event,'${prodId}')" class="space-y-4">
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Nom *</label>
        <input id="edit-prod-nom" type="text" required maxlength="200" value="${escHtml(nom)}" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
        <textarea id="edit-prod-desc" rows="2" maxlength="500" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none">${escHtml(description)}</textarea>
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Prix (FCFA) *</label>
        <input id="edit-prod-prix" type="number" required min="0" max="999999" step="50" value="${prix}" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
      </div>
      ${photoUrl ? `<div class="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
        <img src="${escHtml(photoUrl)}" class="w-12 h-12 rounded-lg object-cover border border-gray-200">
        <span class="text-xs text-gray-500">Photo actuelle</span>
      </div>` : ''}
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">${photoUrl?'Remplacer la photo':'Ajouter une photo'} (optionnel)</label>
        <input id="edit-prod-photo" type="file" accept="image/jpeg,image/png,image/webp" class="w-full text-sm text-gray-600 border border-gray-200 rounded-xl px-3 py-2.5">
        <div id="edit-upload-progress" class="hidden mt-2 text-xs text-blue-600"><i class="fa-solid fa-circle-notch fa-spin mr-1"></i>Téléversement...</div>
      </div>
      <button type="submit" class="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700">Enregistrer</button>
    </form>`);
}
async function submitEditProduit(e, prodId) {
  e.preventDefault();
  const nom = document.getElementById('edit-prod-nom').value.trim();
  const description = document.getElementById('edit-prod-desc').value.trim();
  const prix = parseFloat(document.getElementById('edit-prod-prix').value);
  const photoInput = document.getElementById('edit-prod-photo');
  if (!nom || isNaN(prix)) { alert('Nom et prix requis.'); return; }
  let photo_url = undefined;
  if (photoInput && photoInput.files && photoInput.files[0]) {
    const prog = document.getElementById('edit-upload-progress');
    if (prog) prog.classList.remove('hidden');
    try {
      const fd = new FormData();
      fd.append('file', photoInput.files[0]);
      const upRes = await dashFetch('/api/v1/dashboard/upload-image', {
        method: 'POST', headers: {'X-Requested-With':'XMLHttpRequest'}, body: fd
      });
      if (upRes.ok) { const upData = await upRes.json(); photo_url = upData.url; }
      else { const err = await upRes.json(); alert('Erreur upload : ' + (err.error || 'Échec')); }
    } catch { alert('Erreur upload.'); }
    if (prog) prog.classList.add('hidden');
  }
  const payload = { nom, description, prix };
  if (photo_url !== undefined) payload.photo_url = photo_url;
  try {
    const res = await dashFetch('/api/v1/dashboard/produits/' + prodId, {
      method: 'PATCH', headers: {'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
      body: JSON.stringify(payload)
    });
    if (res.ok) { closeModal(); loadMenu(); }
    else { const d = await res.json(); alert(d.error||'Erreur'); }
  } catch { alert('Erreur réseau.'); }
}
async function supprimerProduit(prodId) {
  if (!confirm('Supprimer ce produit définitivement ?')) return;
  try {
    const res = await dashFetch('/api/v1/dashboard/produits/' + prodId, {
      method: 'DELETE', headers: {'X-Requested-With':'XMLHttpRequest'}
    });
    if (res.ok) loadMenu();
    else { const d = await res.json(); alert(d.error||'Erreur'); }
  } catch { alert('Erreur réseau.'); }
}
async function toggleDisponible(prodId, currentDisponible) {
  try {
    const res = await dashFetch('/api/v1/dashboard/produits/' + prodId, {
      method: 'PATCH', headers: {'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
      body: JSON.stringify({ disponible: !currentDisponible })
    });
    if (!res.ok) { const d = await res.json().catch(()=>({})); alert(d.error || 'Erreur lors du changement de disponibilité.'); return; }
    loadMenu();
  } catch { alert('Erreur réseau.'); }
}

// ==============================
// AJOUT — SUPPLÉMENTS D'UN PRODUIT
// ==============================
async function showSupplementsModal(produitId, produitNom) {
  showModal('Suppléments — ' + produitNom, `
    <div id="supplements-list-${produitId}" class="space-y-2 mb-4">
      <div class="text-center py-4 text-gray-400"><i class="fa-solid fa-circle-notch fa-spin"></i></div>
    </div>
    <form onsubmit="submitAddSupplement(event,'${produitId}')" class="space-y-2">
      <div class="flex gap-2">
        <input id="sup-nom-${produitId}" type="text" required maxlength="100" placeholder="Ex: Fromage"
          class="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
        <input id="sup-prix-${produitId}" type="number" required min="0" max="999999" step="50" placeholder="Prix"
          class="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
      </div>
      <button type="submit" class="w-full bg-red-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-red-700">
        <i class="fa-solid fa-plus mr-1.5"></i>Ajouter ce supplément
      </button>
    </form>
    <p class="text-xs text-gray-400 mt-3">
      Les suppléments actifs seront proposés au client lorsqu'il ajoute ce produit à son panier sur la boutique.
    </p>
  `);
  await chargerSupplements(produitId);
}

async function chargerSupplements(produitId) {
  const list = document.getElementById('supplements-list-' + produitId);
  if (!list) return;
  try {
    const res = await dashFetch('/api/v1/dashboard/produits/' + produitId + '/supplements');
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (!data.supplements.length) {
      list.innerHTML = '<p class="text-xs text-gray-400 italic py-2">Aucun supplément pour ce produit.</p>';
      return;
    }
    list.innerHTML = data.supplements.map(s => `
      <div class="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
        <span class="flex-1 text-sm font-medium text-gray-800 truncate">${escHtml(s.nom)}</span>
        <span class="text-xs text-gray-500 flex-shrink-0">${(s.prix||0).toLocaleString('fr-FR')} FCFA</span>
        <button onclick="toggleSupplementActif('${s.id}',${s.actif?1:0},'${produitId}')"
          class="text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${s.actif?'bg-green-100 text-green-700':'bg-gray-200 text-gray-500'}"
          title="${s.actif?'Désactiver':'Activer'}">${s.actif?'Actif':'Inactif'}</button>
        <button onclick="supprimerSupplement('${s.id}','${produitId}')" class="text-gray-400 hover:text-red-500 flex-shrink-0" title="Supprimer">
          <i class="fa-solid fa-trash text-xs"></i>
        </button>
      </div>`).join('');
  } catch {
    list.innerHTML = '<p class="text-xs text-red-500 py-2">Erreur de chargement.</p>';
  }
}

async function submitAddSupplement(e, produitId) {
  e.preventDefault();
  const nomInput = document.getElementById('sup-nom-' + produitId);
  const prixInput = document.getElementById('sup-prix-' + produitId);
  const nom = nomInput.value.trim();
  const prix = parseFloat(prixInput.value);
  if (!nom || isNaN(prix)) { alert('Nom et prix requis.'); return; }
  try {
    const res = await dashFetch('/api/v1/dashboard/produits/' + produitId + '/supplements', {
      method: 'POST', headers: {'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
      body: JSON.stringify({ nom, prix })
    });
    if (res.ok) {
      nomInput.value = '';
      prixInput.value = '';
      chargerSupplements(produitId);
    } else {
      const d = await res.json();
      alert(d.error || 'Erreur lors de la création du supplément.');
    }
  } catch { alert('Erreur réseau.'); }
}

async function toggleSupplementActif(supId, actuellementActif, produitId) {
  try {
    const res = await dashFetch('/api/v1/dashboard/supplements/' + supId, {
      method: 'PATCH', headers: {'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
      body: JSON.stringify({ actif: !actuellementActif })
    });
    if (!res.ok) { const d = await res.json().catch(()=>({})); alert(d.error || 'Erreur.'); return; }
    chargerSupplements(produitId);
  } catch { alert('Erreur réseau.'); }
}

async function supprimerSupplement(supId, produitId) {
  if (!confirm('Supprimer ce supplément ?')) return;
  try {
    const res = await dashFetch('/api/v1/dashboard/supplements/' + supId, {
      method: 'DELETE', headers: {'X-Requested-With':'XMLHttpRequest'}
    });
    if (res.ok) chargerSupplements(produitId);
    else { const d = await res.json().catch(()=>({})); alert(d.error || 'Erreur lors de la suppression.'); }
  } catch { alert('Erreur réseau.'); }
}

// ==============================
// SECTION STATISTIQUES
// ==============================
async function loadStatistiques() {
  const content = document.getElementById('dashboard-content');
  content.innerHTML = `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div class="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <div class="text-xs text-gray-500 mb-1">Commandes aujourd'hui</div>
        <div id="stat-today" class="text-2xl font-extrabold text-gray-900">—</div>
      </div>
      <div class="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <div class="text-xs text-gray-500 mb-1">CA du jour (FCFA)</div>
        <div id="stat-ca" class="text-2xl font-extrabold text-gray-900">—</div>
      </div>
      <div class="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <div class="text-xs text-gray-500 mb-1">CA du mois (FCFA)</div>
        <div id="stat-ca-month" class="text-2xl font-extrabold text-red-600">—</div>
      </div>
      <div class="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <div class="text-xs text-gray-500 mb-1">Taux livraison</div>
        <div id="stat-rate" class="text-2xl font-extrabold text-green-600">—</div>
      </div>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      <div class="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <div class="text-xs text-gray-500 mb-1">Commandes ce mois</div>
        <div id="stat-month" class="text-2xl font-extrabold text-blue-600">—</div>
      </div>
      <div class="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <div class="text-xs text-gray-500 mb-1">Taux annulation</div>
        <div id="stat-cancel-rate" class="text-2xl font-extrabold text-orange-500">—</div>
      </div>
      <div class="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <div class="text-xs text-gray-500 mb-1">Produits actifs</div>
        <div id="stat-produits" class="text-2xl font-extrabold text-purple-600">—</div>
      </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-6 mb-4">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-bold text-gray-900">Évolution sur 30 jours</h3>
        <div class="flex gap-2">
          <button onclick="switchChart('commandes')" id="btn-chart-cmd" class="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold">Commandes</button>
          <button onclick="switchChart('ca')" id="btn-chart-ca" class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50">CA (FCFA)</button>
        </div>
      </div>
      <canvas id="stats-chart" height="80"></canvas>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-6">
      <h3 class="font-bold text-gray-900 mb-4">Répartition par statut</h3>
      <div id="statuts-chart-container" class="max-w-xs mx-auto">
        <canvas id="statuts-chart" height="120"></canvas>
      </div>
    </div>
    <p class="text-xs text-gray-400 mt-3 text-center">Données en temps réel depuis la base de données.</p>`;

  try {
    const res = await dashFetch('/api/v1/dashboard/stats');
    if (!res.ok) return;
    const data = await res.json();
    if (data.today !== undefined) document.getElementById('stat-today').textContent = data.today;
    if (data.ca_today !== undefined) document.getElementById('stat-ca').textContent = (data.ca_today||0).toLocaleString('fr-FR');
    if (data.ca_month !== undefined) document.getElementById('stat-ca-month').textContent = (data.ca_month||0).toLocaleString('fr-FR');
    if (data.month !== undefined) document.getElementById('stat-month').textContent = data.month;
    if (data.taux_livraison !== undefined) document.getElementById('stat-rate').textContent = data.taux_livraison + '%';
    if (data.taux_annulation !== undefined) document.getElementById('stat-cancel-rate').textContent = data.taux_annulation + '%';
    if (data.nb_produits !== undefined) document.getElementById('stat-produits').textContent = data.nb_produits;
    if (window.Chart) {
      window._statsData = data;
      window._statsChart = null;
      renderStatsChart('commandes');
      const statuts = data.statuts || {};
      const statLabels = Object.keys(statuts).map(s => s.replace(/_/g,' '));
      const statValues = Object.values(statuts);
      if (statValues.length > 0) {
        const ctxPie = document.getElementById('statuts-chart');
        if (ctxPie) new Chart(ctxPie, {
          type: 'doughnut',
          data: { labels: statLabels, datasets: [{ data: statValues, backgroundColor: ['#F59E0B','#3B82F6','#F97316','#8B5CF6','#22C55E','#EF4444'] }] },
          options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { padding: 10, font: { size: 11 } } } } }
        });
      } else {
        const ctxPie = document.getElementById('statuts-chart');
        if (ctxPie) ctxPie.parentElement.innerHTML = '<p class="text-center text-sm text-gray-400 py-4">Aucune commande enregistrée.</p>';
      }
    }
  } catch {}
}

function renderStatsChart(mode) {
  const data = window._statsData;
  if (!data || !window.Chart) return;
  if (window._statsChart) { window._statsChart.destroy(); }
  const ctx = document.getElementById('stats-chart');
  if (!ctx) return;
  const isCA = mode === 'ca';
  window._statsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.labels || [],
      datasets: [{
        label: isCA ? 'CA (FCFA)' : 'Commandes',
        data: isCA ? (data.ca_values||[]) : (data.values||[]),
        borderColor: isCA ? '#22C55E' : '#DC2626',
        backgroundColor: isCA ? 'rgba(34,197,94,0.06)' : 'rgba(220,38,38,0.06)',
        borderWidth: 2, tension: 0.4, fill: true,
        pointBackgroundColor: isCA ? '#22C55E' : '#DC2626', pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => isCA ? (ctx.raw||0).toLocaleString('fr-FR')+' FCFA' : ctx.raw+' commande(s)' } } },
      scales: { y: { beginAtZero: true, grid: { color: '#F3F4F6' }, ticks: { precision: 0 } }, x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } } }
    }
  });
}

function switchChart(mode) {
  document.getElementById('btn-chart-cmd').className = 'text-xs px-3 py-1.5 rounded-lg font-semibold ' + (mode==='commandes' ? 'bg-red-600 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50');
  document.getElementById('btn-chart-ca').className  = 'text-xs px-3 py-1.5 rounded-lg font-semibold ' + (mode==='ca'         ? 'bg-green-600 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50');
  renderStatsChart(mode);
}

// ==============================
// SECTION LIVREURS
// ==============================
async function loadLivreurs() {
  const content = document.getElementById('dashboard-content');
  content.innerHTML = `<div class="text-center py-8"><i class="fa-solid fa-circle-notch fa-spin text-xl text-gray-400"></i></div>`;
  try {
    const res = await dashFetch('/api/v1/dashboard/livreurs');
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderLivreurs(data.livreurs||[], content);
  } catch {
    content.innerHTML = `<div class="text-center py-10"><p class="text-red-500 text-sm">Erreur de chargement.</p><button onclick="loadLivreurs()" class="mt-3 text-xs text-red-600 underline">Réessayer</button></div>`;
  }
}
function renderLivreurs(livreurs, container) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-5">
      <p class="text-sm text-gray-500">${livreurs.length} livreur(s) enregistré(s)</p>
      <button onclick="showAddLivreurModal()" class="bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-700 flex items-center gap-1.5">
        <i class="fa-solid fa-plus text-xs"></i> Ajouter
      </button>
    </div>
    ${livreurs.length === 0 ? `
      <div class="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
        <i class="fa-solid fa-motorcycle text-4xl text-gray-200 mb-4 block"></i>
        <p class="font-semibold text-gray-500 mb-2">Aucun livreur</p>
        <p class="text-sm text-gray-400 mb-5">Ajoutez vos livreurs pour leur assigner des commandes.</p>
        <button onclick="showAddLivreurModal()" class="bg-red-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-red-700"><i class="fa-solid fa-plus mr-1.5"></i>Ajouter</button>
      </div>` :
    `<div class="space-y-3">${livreurs.map(l => `
      <div class="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-4">
        <div class="w-11 h-11 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <i class="fa-solid fa-motorcycle text-orange-500"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-gray-900">${escHtml(l.nom)}</div>
          <div class="text-xs text-gray-500">${escHtml(l.whatsapp_number||'—')}</div>
        </div>
        <span class="text-xs px-2.5 py-1 rounded-full font-semibold ${l.actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">${l.actif?'Actif':'Inactif'}</span>
        <button onclick="toggleLivreurActif('${l.id}',${l.actif?1:0})" class="p-1.5 text-gray-400 hover:text-blue-600" title="${l.actif?'Désactiver':'Activer'}">
          <i class="fa-solid ${l.actif ? 'fa-toggle-on text-green-500' : 'fa-toggle-off'} text-lg"></i>
        </button>
        <button onclick="showEditLivreurModal('${l.id}','${escJs(l.nom)}','${escJs(l.whatsapp_number||'')}')" class="p-1.5 text-gray-400 hover:text-blue-600" title="Modifier">
          <i class="fa-solid fa-pen text-xs"></i>
        </button>
        <button onclick="supprimerLivreur('${l.id}')" class="p-1.5 text-gray-400 hover:text-red-500" title="Supprimer">
          <i class="fa-solid fa-trash text-sm"></i>
        </button>
      </div>`).join('')}</div>`}`;
}
function showAddLivreurModal() {
  showModal('Ajouter un livreur', `
    <form onsubmit="submitAddLivreur(event)" class="space-y-4">
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Nom complet *</label>
        <input id="liv-nom" type="text" required maxlength="100" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="Kofi Mensah">
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">WhatsApp *</label>
        <input id="liv-tel" type="tel" required class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="+226 70 00 00 00">
      </div>
      <button type="submit" class="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700">Ajouter le livreur</button>
    </form>`);
}
async function submitAddLivreur(e) {
  e.preventDefault();
  const nom = document.getElementById('liv-nom').value.trim();
  const whatsapp_number = document.getElementById('liv-tel').value.trim();
  try {
    const res = await dashFetch('/api/v1/dashboard/livreurs', {
      method: 'POST', headers: {'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
      body: JSON.stringify({ nom, whatsapp_number })
    });
    if (res.ok) { closeModal(); loadLivreurs(); }
    else { const d = await res.json(); alert(d.error||'Erreur'); }
  } catch { alert('Erreur réseau.'); }
}

// AJOUT — Édition d'un livreur existant (nom + WhatsApp). Utilise la
// route PATCH /api/v1/dashboard/livreurs/:id, déjà prête côté serveur à
// accepter ces deux champs indépendamment.
function showEditLivreurModal(livId, nom, whatsapp) {
  showModal('Modifier le livreur', `
    <form onsubmit="submitEditLivreur(event,'${livId}')" class="space-y-4">
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Nom complet *</label>
        <input id="edit-liv-nom" type="text" required maxlength="100" value="${escHtml(nom)}" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">WhatsApp *</label>
        <input id="edit-liv-tel" type="tel" required value="${escHtml(whatsapp)}" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="+226 70 00 00 00">
      </div>
      <button type="submit" class="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700">Enregistrer</button>
    </form>`);
}
async function submitEditLivreur(e, livId) {
  e.preventDefault();
  const nom = document.getElementById('edit-liv-nom').value.trim();
  const whatsapp_number = document.getElementById('edit-liv-tel').value.trim();
  if (nom.length < 2) { alert('Nom invalide (2 caractères minimum).'); return; }
  try {
    const res = await dashFetch('/api/v1/dashboard/livreurs/' + livId, {
      method: 'PATCH', headers: {'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
      body: JSON.stringify({ nom, whatsapp_number })
    });
    if (res.ok) { closeModal(); loadLivreurs(); }
    else { const d = await res.json(); alert(d.error||'Erreur'); }
  } catch { alert('Erreur réseau.'); }
}

async function toggleLivreurActif(livId, currentActif) {
  try {
    await dashFetch('/api/v1/dashboard/livreurs/' + livId, {
      method: 'PATCH', headers: {'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
      body: JSON.stringify({ actif: currentActif ? 0 : 1 })
    });
    loadLivreurs();
  } catch { alert('Erreur réseau.'); }
}
async function supprimerLivreur(livId) {
  if (!confirm('Supprimer ce livreur ?')) return;
  try {
    const res = await dashFetch('/api/v1/dashboard/livreurs/' + livId, {
      method: 'DELETE', headers: {'X-Requested-With':'XMLHttpRequest'}
    });
    if (res.ok) loadLivreurs();
  } catch { alert('Erreur réseau.'); }
}

// ==============================
// SECTION QR CODE
// ==============================
async function loadQRCode() {
  const content = document.getElementById('dashboard-content');
  content.innerHTML = `<div class="text-center py-8"><i class="fa-solid fa-circle-notch fa-spin text-xl text-gray-400"></i></div>`;
  try {
    const res = await dashFetch('/api/v1/dashboard/qrcode');
    if (!res.ok) throw new Error();
    const data = await res.json();
    content.innerHTML = `
      <div class="max-w-lg space-y-4">
        <div class="bg-white rounded-2xl border border-gray-100 p-6 text-center">
          <h2 class="font-bold text-gray-900 mb-1">QR Code de votre boutique</h2>
          <p class="text-xs text-gray-500 mb-5">Imprimez-le et affichez-le en salle, sur vos emballages ou en vitrine.</p>
          <div id="qr-image-wrap" class="w-48 h-48 mx-auto rounded-2xl border border-gray-200 shadow-sm mb-4 bg-white flex items-center justify-center overflow-hidden">
            <img src="${escHtml(data.qr_display)}" alt="QR Code" class="w-full h-full object-contain p-3"
              onerror="this.parentElement.innerHTML='<div class=&quot;text-xs text-red-500 p-4&quot;><i class=&quot;fa-solid fa-triangle-exclamation mb-2 block text-lg&quot;></i>QR indisponible pour le moment.<br><button onclick=&quot;loadQRCode()&quot; class=&quot;underline mt-2&quot;>Réessayer</button></div>'">
          </div>
          <p class="text-xs text-gray-400 mb-4"><strong>${escHtml(data.boutique_url)}</strong></p>
          <div class="flex gap-3 justify-center flex-wrap">
            <a href="${escHtml(data.qr_download_png)}" download="qrcode-${escHtml(data.slug)}.png" target="_blank" rel="noopener"
              class="flex items-center gap-1.5 bg-gray-900 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-gray-800 transition-colors">
              <i class="fa-solid fa-download"></i> PNG HD
            </a>
            <a href="${escHtml(data.qr_download_svg)}" download="qrcode-${escHtml(data.slug)}.svg" target="_blank" rel="noopener"
              class="flex items-center gap-1.5 border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 rounded-xl hover:bg-gray-50">
              <i class="fa-solid fa-vector-square"></i> SVG
            </a>
            <button onclick="copyLink('${escJs(data.boutique_url)}')"
              class="flex items-center gap-1.5 border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 rounded-xl hover:bg-gray-50">
              <i class="fa-solid fa-copy"></i> Copier lien
            </button>
          </div>
        </div>
        <div class="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 class="font-bold text-gray-900 mb-3">Partager votre boutique</h3>
          <div class="flex flex-col gap-3">
            <a href="https://wa.me/?text=${encodeURIComponent('Commandez chez '+data.nom+' : '+data.boutique_url)}" target="_blank"
              class="flex items-center gap-3 p-3 bg-green-50 border border-green-100 rounded-xl hover:bg-green-100">
              <i class="fa-brands fa-whatsapp text-green-600 text-xl"></i>
              <div><div class="font-semibold text-sm text-green-900">WhatsApp</div><div class="text-xs text-green-700">Envoyer le lien à vos clients</div></div>
            </a>
            <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(data.boutique_url)}" target="_blank"
              class="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100">
              <i class="fa-brands fa-facebook text-blue-600 text-xl"></i>
              <div><div class="font-semibold text-sm text-blue-900">Facebook</div><div class="text-xs text-blue-700">Publier sur votre page</div></div>
            </a>
          </div>
        </div>
        <div class="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <p class="text-sm font-semibold text-blue-800 mb-2"><i class="fa-solid fa-link mr-1.5"></i>URL de votre boutique</p>
          <div class="flex items-center gap-2">
            <code class="flex-1 bg-white border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-900 font-mono break-all">${escHtml(data.boutique_url)}</code>
            <button onclick="copyLink('${escJs(data.boutique_url)}')" class="bg-blue-600 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-blue-700 flex-shrink-0">Copier</button>
          </div>
        </div>
      </div>`;
  } catch {
    content.innerHTML = '<p class="text-red-500 text-sm p-4">Erreur de chargement du QR Code.</p>';
  }
}

function copyLink(url) {
  navigator.clipboard.writeText(url).then(() => {
    const btn = event && event.target ? event.target.closest('button') : null;
    if (btn) { const orig = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-check"></i> Copié !'; setTimeout(()=>btn.innerHTML=orig, 2000); }
    else alert('Copié : ' + url);
  }).catch(() => alert('Lien : ' + url));
}

// ==============================
// SECTION APPARENCE & MÉDIAS
// ==============================
async function loadApparence() {
  const content = document.getElementById('dashboard-content');
  content.innerHTML = `<div class="text-center py-8"><i class="fa-solid fa-circle-notch fa-spin text-xl text-gray-400"></i></div>`;
  let tenant = tenantData || {};
  try {
    const res = await dashFetch('/api/v1/dashboard/profil');
    if (res.ok) tenant = await res.json();
  } catch {}
  content.innerHTML = `
    <div class="max-w-lg space-y-4">
      <div class="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 class="font-bold text-gray-900 mb-5">Couleurs de la boutique</h2>
        <form onsubmit="saveApparence(event)" class="space-y-5">
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">Couleur principale</label>
            <div class="flex items-center gap-3">
              <input id="app-color-primary" type="color" value="${escHtml(tenant.couleur_primaire||'#DC2626')}" class="w-12 h-12 rounded-xl border border-gray-200 cursor-pointer">
              <input id="app-color-primary-hex" type="text" value="${escHtml(tenant.couleur_primaire||'#DC2626')}" class="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="#DC2626">
            </div>
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">Couleur secondaire</label>
            <div class="flex items-center gap-3">
              <input id="app-color-secondary" type="color" value="${escHtml(tenant.couleur_secondaire||'#1D4ED8')}" class="w-12 h-12 rounded-xl border border-gray-200 cursor-pointer">
              <input id="app-color-secondary-hex" type="text" value="${escHtml(tenant.couleur_secondaire||'#1D4ED8')}" class="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="#1D4ED8">
            </div>
          </div>
          <p id="app-feedback" class="text-xs hidden rounded-lg px-3 py-2"></p>
          <button type="submit" class="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700">
            <i class="fa-solid fa-floppy-disk mr-1.5"></i> Enregistrer les couleurs
          </button>
        </form>
      </div>
      <div class="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 class="font-bold text-gray-900 mb-1">Logo du restaurant</h2>
        <p class="text-sm text-gray-500 mb-4">PNG/JPG recommandé, fond transparent idéal.</p>
        ${tenant.logo_url ? `<div class="flex items-center gap-3 mb-4 bg-gray-50 rounded-xl p-3">
          <img src="${escHtml(tenant.logo_url)}" class="w-16 h-16 rounded-xl object-cover border border-gray-200">
          <div><p class="text-xs font-semibold text-gray-700">Logo actuel</p><p class="text-xs text-gray-400 break-all">${escHtml(tenant.logo_url)}</p></div>
        </div>` : ''}
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Téléverser un fichier</label>
            <input id="logo-file" type="file" accept="image/jpeg,image/png,image/webp" class="w-full text-sm text-gray-600 border border-gray-200 rounded-xl px-3 py-2.5">
            <div id="logo-upload-progress" class="hidden mt-2 text-xs text-blue-600"><i class="fa-solid fa-circle-notch fa-spin mr-1"></i>Téléversement...</div>
          </div>
          <p class="text-xs text-gray-400 text-center">— ou URL externe —</p>
          <input id="app-logo" type="url" value="${escHtml(tenant.logo_url||'')}" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="https://...">
          <p id="logo-feedback" class="text-xs hidden rounded-lg px-3 py-2"></p>
          <button onclick="saveLogo()" type="button" class="w-full border border-red-200 text-red-600 font-bold py-2.5 rounded-xl hover:bg-red-50 text-sm">
            <i class="fa-solid fa-floppy-disk mr-1.5"></i> Enregistrer le logo
          </button>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 class="font-bold text-gray-900 mb-1">Bannière</h2>
        <p class="text-sm text-gray-500 mb-4">Ratio 16:9 recommandé, max 5 MB.</p>
        ${tenant.banniere_url ? `<div class="mb-4 rounded-xl overflow-hidden border border-gray-200"><img src="${escHtml(tenant.banniere_url)}" class="w-full h-32 object-cover"></div>` : ''}
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Téléverser un fichier</label>
            <input id="banniere-file" type="file" accept="image/jpeg,image/png,image/webp" class="w-full text-sm text-gray-600 border border-gray-200 rounded-xl px-3 py-2.5">
            <div id="banniere-upload-progress" class="hidden mt-2 text-xs text-blue-600"><i class="fa-solid fa-circle-notch fa-spin mr-1"></i>Téléversement...</div>
          </div>
          <p class="text-xs text-gray-400 text-center">— ou URL externe —</p>
          <input id="app-banniere" type="url" value="${escHtml(tenant.banniere_url||'')}" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="https://...">
          <p id="banniere-feedback" class="text-xs hidden rounded-lg px-3 py-2"></p>
          <button onclick="saveBanniere()" type="button" class="w-full border border-red-200 text-red-600 font-bold py-2.5 rounded-xl hover:bg-red-50 text-sm">
            <i class="fa-solid fa-floppy-disk mr-1.5"></i> Enregistrer la bannière
          </button>
        </div>
      </div>
    </div>`;
  document.getElementById('app-color-primary').addEventListener('input', function() { document.getElementById('app-color-primary-hex').value = this.value; });
  document.getElementById('app-color-secondary').addEventListener('input', function() { document.getElementById('app-color-secondary-hex').value = this.value; });
}

async function saveApparence(e) {
  e.preventDefault();
  const fb = document.getElementById('app-feedback');
  fb.classList.remove('hidden');
  const data = {
    couleur_primaire: document.getElementById('app-color-primary-hex').value.trim() || document.getElementById('app-color-primary').value,
    couleur_secondaire: document.getElementById('app-color-secondary-hex').value.trim() || document.getElementById('app-color-secondary').value
  };
  try {
    const res = await dashFetch('/api/v1/dashboard/apparence', {
      method: 'PATCH', headers: {'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
      body: JSON.stringify(data)
    });
    if (res.ok) {
      fb.textContent = 'Couleurs enregistrées.'; fb.className = 'text-xs bg-green-50 text-green-700 rounded-lg px-3 py-2';
      if (tenantData) { tenantData.couleur_primaire = data.couleur_primaire; tenantData.couleur_secondaire = data.couleur_secondaire; localStorage.setItem('monmenu_tenant', JSON.stringify(tenantData)); }
    } else { const d = await res.json(); fb.textContent = d.error||'Erreur.'; fb.className = 'text-xs bg-red-50 text-red-600 rounded-lg px-3 py-2'; }
  } catch { fb.textContent = 'Erreur réseau.'; fb.className = 'text-xs bg-red-50 text-red-600 rounded-lg px-3 py-2'; }
}

async function _uploadMedia(fileInputId, progressId) {
  const fileInput = document.getElementById(fileInputId);
  if (!fileInput || !fileInput.files || !fileInput.files[0]) return null;
  const prog = document.getElementById(progressId);
  if (prog) prog.classList.remove('hidden');
  try {
    const fd = new FormData(); fd.append('file', fileInput.files[0]);
    const res = await dashFetch('/api/v1/dashboard/upload-image', { method: 'POST', headers: {'X-Requested-With':'XMLHttpRequest'}, body: fd });
    if (prog) prog.classList.add('hidden');
    if (res.ok) { const d = await res.json(); return d.url; }
    const err = await res.json(); return { error: err.error || 'Échec upload' };
  } catch { if (prog) prog.classList.add('hidden'); return { error: 'Erreur réseau' }; }
}

async function saveLogo() {
  const fb = document.getElementById('logo-feedback'); fb.classList.remove('hidden');
  let logo_url = document.getElementById('app-logo').value.trim() || null;
  const upload = await _uploadMedia('logo-file', 'logo-upload-progress');
  if (upload && typeof upload === 'string') logo_url = upload;
  else if (upload && upload.error) { fb.textContent = 'Erreur upload : '+upload.error; fb.className = 'text-xs bg-red-50 text-red-600 rounded-lg px-3 py-2'; return; }
  try {
    const res = await dashFetch('/api/v1/dashboard/apparence', {
      method: 'PATCH', headers: {'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
      body: JSON.stringify({ logo_url })
    });
    if (res.ok) { fb.textContent = logo_url?'Logo mis à jour.':'Logo supprimé.'; fb.className = 'text-xs bg-green-50 text-green-700 rounded-lg px-3 py-2'; if (logo_url) document.getElementById('app-logo').value = logo_url; }
    else { const d = await res.json(); fb.textContent = d.error||'Erreur.'; fb.className = 'text-xs bg-red-50 text-red-600 rounded-lg px-3 py-2'; }
  } catch { fb.textContent = 'Erreur réseau.'; fb.className = 'text-xs bg-red-50 text-red-600 rounded-lg px-3 py-2'; }
}

async function saveBanniere() {
  const fb = document.getElementById('banniere-feedback'); fb.classList.remove('hidden');
  let banniere_url = document.getElementById('app-banniere').value.trim() || null;
  const upload = await _uploadMedia('banniere-file', 'banniere-upload-progress');
  if (upload && typeof upload === 'string') banniere_url = upload;
  else if (upload && upload.error) { fb.textContent = 'Erreur upload : '+upload.error; fb.className = 'text-xs bg-red-50 text-red-600 rounded-lg px-3 py-2'; return; }
  try {
    const res = await dashFetch('/api/v1/dashboard/apparence', {
      method: 'PATCH', headers: {'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
      body: JSON.stringify({ banniere_url })
    });
    if (res.ok) { fb.textContent = banniere_url?'Bannière mise à jour.':'Bannière supprimée.'; fb.className = 'text-xs bg-green-50 text-green-700 rounded-lg px-3 py-2'; if (banniere_url) document.getElementById('app-banniere').value = banniere_url; }
    else { const d = await res.json(); fb.textContent = d.error||'Erreur.'; fb.className = 'text-xs bg-red-50 text-red-600 rounded-lg px-3 py-2'; }
  } catch { fb.textContent = 'Erreur réseau.'; fb.className = 'text-xs bg-red-50 text-red-600 rounded-lg px-3 py-2'; }
}

// ==============================
// SECTION PARAMÈTRES
// ==============================
async function loadParametres() {
  const content = document.getElementById('dashboard-content');
  content.innerHTML = `<div class="text-center py-8"><i class="fa-solid fa-circle-notch fa-spin text-xl text-gray-400"></i></div>`;
  let tenant = tenantData || {};
  try {
    const res = await dashFetch('/api/v1/dashboard/profil');
    if (res.ok) tenant = await res.json();
  } catch {}
  content.innerHTML = `
    <div class="max-w-lg space-y-4">
      <div class="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 class="font-bold text-gray-900 mb-5">Informations du restaurant</h2>
        <form onsubmit="saveParametres(event)" class="space-y-4">
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">Nom du restaurant</label>
            <input id="param-nom" type="text" required maxlength="100" value="${escHtml(tenant.nom||'')}" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">Numéro WhatsApp</label>
            <input id="param-whatsapp" type="tel" required
              pattern="^\\+[0-9]{8,15}$"
              title="Format international requis, avec indicatif pays. Exemple : +22670000000"
              value="${escHtml(tenant.whatsapp_number||'')}" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="+226 70 00 00 00">
            <p class="text-xs text-gray-400 mt-1">Indispensable : indicatif pays inclus (ex : +226 pour le Burkina Faso).</p>
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">URL de votre boutique</label>
            <div class="flex items-center bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
              <span class="text-sm text-gray-400">monmenu.app/</span>
              <span class="text-sm font-bold text-gray-900">${escHtml(tenant.slug||'—')}</span>
            </div>
            <p class="text-xs text-gray-400 mt-1">Le slug ne peut pas être modifié.</p>
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">Domaine personnalisé (optionnel)</label>
            <input id="param-domaine" type="text" value="${escHtml(tenant.domaine_perso||'')}" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="monrestaurant.com">
            <p class="text-xs text-gray-400 mt-1">Configurez un CNAME vers <code>monmenu.app</code> chez votre registrar.</p>
          </div>
          <p id="param-feedback" class="text-xs hidden rounded-lg px-3 py-2"></p>
          <button type="submit" class="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700">
            <i class="fa-solid fa-floppy-disk mr-1.5"></i> Enregistrer
          </button>
        </form>
      </div>
      <div class="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 class="font-bold text-gray-900 mb-1">Plan actuel</h3>
        <div class="flex items-center justify-between mt-3">
          <div>
            <span class="inline-flex items-center gap-1.5 bg-blue-100 text-blue-800 text-sm font-bold px-3 py-1 rounded-lg">
              <i class="fa-solid fa-star text-xs"></i> ${escHtml(tenant.plan_nom||'Gratuit')}
            </span>
            <p class="text-xs text-gray-500 mt-1">Statut : <strong>${escHtml(tenant.statut||'essai')}</strong> • ${tenant.total_commandes||0} commande(s) total</p>
          </div>
          <a href="/dashboard/abonnement" onclick="navigateTo('abonnement');return false;" class="text-xs text-red-600 font-semibold hover:underline">Gérer l'abonnement →</a>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 class="font-bold text-gray-900 mb-1">Sécurité</h3>
        <p class="text-sm text-gray-500 mb-4">Changez votre mot de passe.</p>
        <form onsubmit="saveChangementMdp(event)" class="space-y-3">
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Mot de passe actuel</label>
            <input id="pwd-actuel" type="password" required autocomplete="current-password"
              class="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Nouveau mot de passe</label>
            <input id="pwd-nouveau" type="password" required minlength="8" autocomplete="new-password"
              class="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
              placeholder="8 caractères minimum">
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Confirmer le nouveau mot de passe</label>
            <input id="pwd-confirme" type="password" required minlength="8" autocomplete="new-password"
              class="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
          </div>
          <p id="pwd-feedback" class="hidden text-xs rounded-lg px-3 py-2"></p>
          <button type="submit" id="pwd-submit-btn" class="w-full border border-gray-200 text-gray-700 font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
            <i class="fa-solid fa-key mr-1.5"></i> Changer le mot de passe
          </button>
        </form>
      </div>
      <div class="bg-red-50 border border-red-100 rounded-2xl p-6">
        <h3 class="font-bold text-red-800 mb-1">Zone dangereuse</h3>
        <p class="text-sm text-red-600 mb-4">La suppression est irréversible. Toutes vos données seront effacées.</p>
        <button onclick="confirmerSuppression()" class="border border-red-300 text-red-600 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-red-100">
          <i class="fa-solid fa-trash mr-1.5"></i> Demander la suppression du compte
        </button>
      </div>
    </div>`;
}
async function saveParametres(e) {
  e.preventDefault();
  const fb = document.getElementById('param-feedback'); fb.classList.remove('hidden');
  const data = {
    nom: document.getElementById('param-nom').value.trim(),
    whatsapp_number: formatWhatsAppNumberAvecPlus(document.getElementById('param-whatsapp').value.trim()),
    domaine_perso: document.getElementById('param-domaine')?.value?.trim() || null
  };
  try {
    const res = await dashFetch('/api/v1/dashboard/parametres', {
      method: 'PATCH', headers: {'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
      body: JSON.stringify(data)
    });
    if (res.ok) {
      if (tenantData) { tenantData.nom = data.nom; tenantData.whatsapp_number = data.whatsapp_number; localStorage.setItem('monmenu_tenant', JSON.stringify(tenantData)); }
      const nameEl = document.getElementById('tenant-name');
      if (nameEl) nameEl.textContent = data.nom;
      fb.textContent = 'Informations mises à jour.'; fb.className = 'text-xs bg-green-50 text-green-700 rounded-lg px-3 py-2';
    } else { const d = await res.json(); fb.textContent = d.error||'Erreur.'; fb.className = 'text-xs bg-red-50 text-red-600 rounded-lg px-3 py-2'; }
  } catch { fb.textContent = 'Erreur réseau.'; fb.className = 'text-xs bg-red-50 text-red-600 rounded-lg px-3 py-2'; }
}

function formatWhatsAppNumberAvecPlus(numeroRaw) {
  let n = (numeroRaw || '').replace(/[^0-9+]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (n && !n.startsWith('+')) n = '+' + n;
  return n;
}

// AJOUT — CORRECTIF BUG-5 — Changement de mot de passe (Paramètres >
// Sécurité). Utilise la route existante POST
// /api/v1/dashboard/profil/change-password (ancien mdp requis,
// notification in-app envoyée côté serveur). Avant ce correctif, le
// bouton de cette section ne faisait qu'un alert() sans aucun appel
// réseau — remplacé par un vrai formulaire (voir loadParametres()
// ci-dessus) qui appelle cette fonction à la soumission.
async function saveChangementMdp(e) {
  e.preventDefault();
  const fb = document.getElementById('pwd-feedback');
  const btn = document.getElementById('pwd-submit-btn');
  const actuel = document.getElementById('pwd-actuel').value;
  const nouveau = document.getElementById('pwd-nouveau').value;
  const confirme = document.getElementById('pwd-confirme').value;

  fb.classList.remove('hidden');

  if (nouveau.length < 8) {
    fb.textContent = 'Le nouveau mot de passe doit contenir au moins 8 caractères.';
    fb.className = 'text-xs rounded-lg px-3 py-2 bg-red-50 text-red-600';
    return;
  }
  if (nouveau !== confirme) {
    fb.textContent = 'Les deux nouveaux mots de passe ne correspondent pas.';
    fb.className = 'text-xs rounded-lg px-3 py-2 bg-red-50 text-red-600';
    return;
  }
  if (nouveau === actuel) {
    fb.textContent = 'Le nouveau mot de passe doit être différent de l\'ancien.';
    fb.className = 'text-xs rounded-lg px-3 py-2 bg-red-50 text-red-600';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-1.5"></i> Changement en cours...';

  try {
    const res = await dashFetch('/api/v1/dashboard/profil/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ current_password: actuel, new_password: nouveau })
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      fb.textContent = data.message || 'Mot de passe mis à jour avec succès.';
      fb.className = 'text-xs rounded-lg px-3 py-2 bg-green-50 text-green-700';
      document.getElementById('pwd-actuel').value = '';
      document.getElementById('pwd-nouveau').value = '';
      document.getElementById('pwd-confirme').value = '';
      if (typeof rafraichirBadgeNotifs === 'function') rafraichirBadgeNotifs();
    } else {
      fb.textContent = data.error || 'Erreur lors du changement de mot de passe.';
      fb.className = 'text-xs rounded-lg px-3 py-2 bg-red-50 text-red-600';
    }
  } catch {
    fb.textContent = 'Erreur réseau. Réessayez.';
    fb.className = 'text-xs rounded-lg px-3 py-2 bg-red-50 text-red-600';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-key mr-1.5"></i> Changer le mot de passe';
  }
}

function confirmerSuppression() {
  if (confirm('ATTENTION : Irréversible. Confirmer ?')) alert('Demande enregistrée. Notre équipe vous contactera dans 48h.');
}

// ==============================
// SECTION CODES PROMO
// ==============================
async function loadCodesPromo() {
  const content = document.getElementById('dashboard-content');
  content.innerHTML = `<div class="text-center py-8"><i class="fa-solid fa-circle-notch fa-spin text-xl text-gray-400"></i></div>`;
  try {
    const res = await dashFetch('/api/v1/dashboard/codes-promo');
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderCodesPromo(data.codes||[], content);
  } catch {
    content.innerHTML = '<p class="text-red-500 text-sm p-4">Erreur de chargement des codes promo.</p>';
  }
}
function renderCodesPromo(codes, container) {
  const now = new Date();
  container.innerHTML = `
    <div class="flex items-center justify-between mb-5 flex-wrap gap-2">
      <p class="text-sm text-gray-500">${codes.length} code(s) promo</p>
      <div class="flex gap-2">
        <button onclick="exportCodesPromo()" class="flex items-center gap-1.5 text-xs text-green-700 hover:text-green-800 border border-green-200 rounded-lg px-3 py-1.5 transition-colors bg-green-50 hover:bg-green-100">
          <i class="fa-solid fa-file-csv"></i> Exporter
        </button>
        <button onclick="showAddCodePromoModal()" class="bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-700 flex items-center gap-1.5">
          <i class="fa-solid fa-plus text-xs"></i> Nouveau code
        </button>
      </div>
    </div>
    ${codes.length === 0 ? `
      <div class="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
        <i class="fa-solid fa-ticket text-4xl text-gray-200 mb-4 block"></i>
        <p class="font-semibold text-gray-500 mb-2">Aucun code promo</p>
        <p class="text-sm text-gray-400 mb-5">Créez des codes de réduction pour fidéliser vos clients.</p>
        <button onclick="showAddCodePromoModal()" class="bg-red-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-red-700">Créer un code promo</button>
      </div>` :
    `<div class="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div class="divide-y divide-gray-50">
        ${codes.map(c => {
          const expire = c.date_fin ? new Date(c.date_fin) < now : false;
          const epuise = c.usage_max && c.usage_actuel >= c.usage_max;
          const actif = c.actif && !expire && !epuise;
          return `<div class="flex items-center gap-4 px-5 py-4 hover:bg-gray-50">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-bold text-gray-900 font-mono text-sm">${escHtml(c.code)}</span>
                <span class="text-xs px-2 py-0.5 rounded-full ${actif?'bg-green-100 text-green-700':expire?'bg-orange-100 text-orange-600':'bg-gray-100 text-gray-500'}">
                  ${actif?'Actif':expire?'Expiré':epuise?'Épuisé':'Inactif'}
                </span>
              </div>
              <div class="text-xs text-gray-500 mt-0.5">
                ${c.type==='pourcentage' ? c.valeur+'% de réduction' : (c.valeur||0).toLocaleString('fr-FR')+' FCFA de réduction'}
                ${c.date_fin ? ' • Expire le '+new Date(c.date_fin).toLocaleDateString('fr-FR') : ''}
                ${c.usage_max ? ' • '+c.usage_actuel+'/'+c.usage_max+' util.' : ' • '+c.usage_actuel+' util.'}
              </div>
            </div>
            <button onclick="copierCodePromo('${escJs(c.code)}')" class="p-2 text-gray-400 hover:text-blue-600" title="Copier le code">
              <i class="fa-solid fa-copy text-sm"></i>
            </button>
            <button onclick="supprimerCodePromo('${c.id}')" class="p-2 text-gray-400 hover:text-red-500" title="Supprimer">
              <i class="fa-solid fa-trash text-sm"></i>
            </button>
          </div>`;
        }).join('')}
      </div>
    </div>`}`;
}
function showAddCodePromoModal() {
  showModal('Nouveau code promo', `
    <form onsubmit="submitAddCodePromo(event)" class="space-y-4">
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Code *</label>
        <input id="promo-code" type="text" required maxlength="20" placeholder="BIENVENUE20" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-200 uppercase" oninput="this.value=this.value.toUpperCase()">
        <p class="text-xs text-gray-400 mt-1">3-20 caractères alphanumériques.</p>
      </div>
      <div>
        <label 