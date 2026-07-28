// MonMenu — Dashboard restaurant (v1.5.0 — notification WhatsApp au client
// lors de la confirmation de commande)
//
// CHANGELOG de ce fichier par rapport à la version précédente :
//   ... (voir historique v1.4.0 dans les sections ci-dessous, inchangées)
//   6. FIX WhatsApp confirmation client — quand le restaurant clique sur
//      "Confirmer" une commande (en_attente → confirmee), un onglet WhatsApp
//      s'ouvre automatiquement vers le CLIENT (numéro pris sur la commande)
//      avec un message pré-rempli : récap de commande + lien de suivi.
//      Ouverture "popup-safe" : la fenêtre est ouverte de façon SYNCHRONE
//      dans le clic (avant le fetch), puis redirigée vers le vrai lien une
//      fois le PATCH de statut confirmé côté serveur — sinon la plupart des
//      navigateurs bloquent l'ouverture (elle doit avoir lieu dans le même
//      geste utilisateur).
//      Pour les autres statuts (Préparer, En livraison, Livrée), PAS de
//      redirection WhatsApp automatique : le livreur contacte directement le
//      client, et ce dernier suit l'avancement sur sa page de suivi.
'use strict';

let currentSection = 'commandes';
let currentFilter = null;
// authToken conservé pour compatibilité interne mais toujours null (cookie httpOnly utilisé)
let authToken = null;
let tenantData = null;
let commandesInterval = null;

// §WhatsApp — Registre des commandes actuellement affichées (id → objet
// commande complet), pour pouvoir construire le message WhatsApp de
// confirmation sans repasser par une requête réseau ni exposer des données
// sensibles dans des attributs onclick="..." (évite les soucis d'échappement
// avec les apostrophes/guillemets dans les noms de clients).
let _commandeRegistry = {};

// §2 — Supabase Realtime : variables de gestion de la connexion
let _supabaseClient = null;
let _realtimeChannel = null;
let _realtimeFallbackInterval = null; // fallback polling 2 min si Realtime échoue

// Jours de la semaine pour l'éditeur d'horaires (PDV + réutilisé ailleurs si besoin)
const JOURS_SEMAINE = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const JOURS_LABELS = {
  lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi', jeudi: 'Jeudi',
  vendredi: 'Vendredi', samedi: 'Samedi', dimanche: 'Dimanche'
};

/**
 * §2 — Initialise le client Supabase (clé anon) + abonnement Realtime.
 * Écoute les INSERT et UPDATE sur la table "commandes" filtrés par tenant_id.
 * En cas d'échec de connexion, active un fallback polling toutes les 2 minutes.
 */
function initRealtimeCommandes(tenantId) {
  const supabaseUrl = window.__SUPABASE_URL__;
  const supabaseAnonKey = window.__SUPABASE_ANON_KEY__;

  // Prérequis : bibliothèque Supabase JS chargée et clés disponibles
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

  // Nettoyer l'abonnement précédent s'il existe
  if (_realtimeChannel) {
    _supabaseClient.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }

  _realtimeChannel = _supabaseClient
    .channel('commandes-dashboard-' + tenantId)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'commandes',
        filter: `tenant_id=eq.${tenantId}`
      },
      (payload) => {
        console.log('[Realtime] Nouvelle commande :', payload.new?.id);
        _onNouvelleCommande(payload.new);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'commandes',
        filter: `tenant_id=eq.${tenantId}`
      },
      (payload) => {
        console.log('[Realtime] Commande mise à jour :', payload.new?.id, payload.new?.statut);
        // Recharger la liste uniquement si on est sur la section commandes
        if (currentSection === 'commandes') fetchCommandes();
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Realtime] Abonnement Realtime actif pour tenant', tenantId);
        // Annuler le fallback si le Realtime fonctionne
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

/**
 * §2 — Appelée quand une nouvelle commande arrive via Realtime.
 * Recharge la liste + affiche une notification visuelle/sonore.
 */
function _onNouvelleCommande(commande) {
  if (currentSection === 'commandes') {
    fetchCommandes();
  }
  _afficherNotificationCommande(commande);
}

/**
 * §2 — Notification visuelle en cas de nouvelle commande.
 */
function _afficherNotificationCommande(commande) {
  // Notification toast
  const toast = document.createElement('div');
  toast.className = 'fixed top-4 right-4 z-50 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-bounce';
  toast.innerHTML = `<i class="fa-solid fa-bell"></i> <span>Nouvelle commande de <strong>${escHtml(commande?.client_nom || 'Client')}</strong> !</span>`;
  document.body.appendChild(toast);
  // Son natif du navigateur (non bloquant)
  try { const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.frequency.value = 880; gain.gain.setValueAtTime(0.3, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4); osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4); } catch {}
  setTimeout(() => toast.remove(), 5000);
}

/**
 * §2 — Fallback polling toutes les 2 minutes (si Realtime échoue).
 */
function _startFallbackPolling() {
  if (_realtimeFallbackInterval) return; // Évite les doublons
  _realtimeFallbackInterval = setInterval(() => {
    if (currentSection === 'commandes') fetchCommandes();
  }, 120000); // 2 minutes
}

/**
 * §2 — Nettoyage Realtime (appelé lors de la déconnexion/navigation).
 */
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

// ---- Init Dashboard ----
async function initDashboard() {
  authToken = null; // Toujours null — cookie httpOnly utilisé à la place

  const tenantStr = localStorage.getItem('monmenu_tenant');
  if (tenantStr) { try { tenantData = JSON.parse(tenantStr); } catch {} }
  const nameEl = document.getElementById('tenant-name');
  if (nameEl && tenantData) nameEl.textContent = tenantData.nom || 'Mon Restaurant';
  const path = window.location.pathname;
  if (path.includes('menu')) navigateTo('menu');
  else if (path.includes('statistiques')) navigateTo('statistiques');
  else if (path.includes('livreurs')) navigateTo('livreurs');
  else if (path.includes('qrcode')) navigateTo('qrcode');
  else if (path.includes('codes-promo')) navigateTo('codes-promo');
  else if (path.includes('pdv')) navigateTo('pdv');
  else if (path.includes('apparence')) navigateTo('apparence');
  else if (path.includes('parametres')) navigateTo('parametres');
  else navigateTo('commandes');
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const href = this.getAttribute('href') || '';
      const section = href.split('/').pop() || 'commandes';
      history.pushState({}, '', href);
      navigateTo(section);
    });
  });
}

function setActiveNavLink(section) {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('bg-gray-800','text-white');
    link.classList.add('text-gray-300');
    if (link.href && link.href.includes(section)) {
      link.classList.add('bg-gray-800','text-white');
      link.classList.remove('text-gray-300');
    }
  });
}

function navigateTo(section) {
  if (commandesInterval) { clearInterval(commandesInterval); commandesInterval = null; }
  // §2 — Nettoyer le Realtime/fallback si on quitte la section commandes
  if (currentSection === 'commandes' && section !== 'commandes') {
    teardownRealtime();
  }
  currentSection = section;
  setActiveNavLink(section);
  const title = document.getElementById('page-title');
  const titles = {
    commandes:'Commandes', menu:'Gestion du menu', statistiques:'Statistiques',
    livreurs:'Livreurs', qrcode:'QR Code', apparence:'Apparence & Médias',
    parametres:'Paramètres', 'codes-promo':'Codes promo', pdv:'Mon restaurant'
  };
  if (title) title.textContent = titles[section] || section;
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

  // §2 — Supabase Realtime remplace le polling 30s (setInterval supprimé)
  let tenantId = tenantData?.id ?? null;
  if (!tenantId) {
    try {
      const res = await fetch('/api/v1/dashboard/profil', { credentials: 'include' });
      if (res.ok) {
        const profil = await res.json();
        tenantData = profil;
        tenantId = profil.id;
        try {
          localStorage.setItem('monmenu_tenant', JSON.stringify({
            id: profil.id, nom: profil.nom, slug: profil.slug,
            couleur_primaire: profil.couleur_primaire, couleur_secondaire: profil.couleur_secondaire
          }));
        } catch {}
        const nameEl = document.getElementById('tenant-name');
        if (nameEl) nameEl.textContent = profil.nom || 'Mon Restaurant';
      }
    } catch { /* silencieux — fallback polling ci-dessous */ }
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
    const res = await fetch(url, { credentials: 'include' });
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
  // §WhatsApp — on garde une référence complète à chaque commande affichée,
  // pour pouvoir construire le message de confirmation sans requête réseau
  // supplémentaire (voir changerStatut()).
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
    en_attente:     { label:'En attente',    icon:'fa-clock',        cls:'statut-en_attente' },
    confirmee:      { label:'Confirmée',     icon:'fa-circle-check', cls:'statut-confirmee' },
    en_preparation: { label:'En préparation',icon:'fa-fire-burner',  cls:'statut-en_preparation' },
    en_livraison:   { label:'En livraison',  icon:'fa-motorcycle',   cls:'statut-en_livraison' },
    livree:         { label:'Livrée',        icon:'fa-check-double', cls:'statut-livree' },
    annulee:        { label:'Annulée',       icon:'fa-xmark',        cls:'statut-annulee' }
  };
  const totalBadge = total > commandes.length ? `<p class="text-xs text-gray-400 mb-3">${total} commande(s) au total — 50 premières affichées</p>` : '';
  container.innerHTML = totalBadge + commandes.map(cmd => {
    const statut = STATUTS[cmd.statut] || { label:cmd.statut, icon:'fa-circle', cls:'' };
    const items = typeof cmd.items_json === 'string' ? JSON.parse(cmd.items_json) : (cmd.items_json || []);
    const dateStr = new Date(cmd.created_at).toLocaleString('fr-FR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
    let metadata = {};
    try { if (cmd.metadata) metadata = JSON.parse(cmd.metadata); } catch {}
    const remiseInfo = metadata.remise_promo > 0
      ? `<span class="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">-${(metadata.remise_promo||0).toLocaleString('fr-FR')} FCFA promo</span>` : '';
    const actions = [];
    if (cmd.statut === 'en_attente') {
      actions.push(`<button onclick="changerStatut('${cmd.id}','confirmee')" class="bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700"><i class="fa-solid fa-check mr-1"></i>Confirmer</button>`);
      actions.push(`<button onclick="changerStatut('${cmd.id}','annulee')" class="border border-red-200 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50">Annuler</button>`);
    }
    if (cmd.statut === 'confirmee') actions.push(`<button onclick="changerStatut('${cmd.id}','en_preparation')" class="bg-orange-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-orange-600"><i class="fa-solid fa-fire-burner mr-1"></i>Préparer</button>`);
    if (cmd.statut === 'en_preparation') actions.push(`<button onclick="changerStatut('${cmd.id}','en_livraison')" class="bg-purple-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-purple-700"><i class="fa-solid fa-motorcycle mr-1"></i>En livraison</button>`);
    if (cmd.statut === 'en_livraison') actions.push(`<button onclick="changerStatut('${cmd.id}','livree')" class="bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-green-700"><i class="fa-solid fa-check-double mr-1"></i>Livrée</button>`);
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
      <div class="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 mb-3">${items.map(i => `<span>${escHtml(i.nom)} ×${i.quantite}</span>`).join(' · ')}</div>
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

// §WhatsApp — Construit le message de confirmation envoyé au CLIENT quand le
// restaurant clique sur "Confirmer" (statut en_attente → confirmee). Inclut
// le récap de commande et le lien de suivi (domaine dynamique via
// window.location.origin — s'adapte automatiquement .workers.dev / domaine
// personnalisé, comme partout ailleurs dans le code).
function construireMessageConfirmationClient(cmd) {
  const items = typeof cmd.items_json === 'string' ? JSON.parse(cmd.items_json) : (cmd.items_json || []);
  const lignes = items.map(i => `  - ${i.nom} x${i.quantite}`).join('\n');
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

// §WhatsApp — Construit un lien wa.me vers le numéro du CLIENT (pas celui du
// restaurant) avec le message pré-rempli.
function genererLienWhatsAppClient(numero, message) {
  const numeroNettoye = (numero || '').replace(/\D/g, '');
  return `https://wa.me/${numeroNettoye}?text=${encodeURIComponent(message)}`;
}

// FIX WhatsApp confirmation — Lorsqu'une commande passe à "confirmee", un
// onglet WhatsApp s'ouvre automatiquement vers le CLIENT pour le notifier
// (récap + lien de suivi). Aucune redirection automatique pour les autres
// statuts (Préparer/En livraison/Livrée) : le livreur contacte directement
// le client, qui suit l'avancement sur sa page de suivi.
//
// Popup-safe : la fenêtre WhatsApp est ouverte de façon SYNCHRONE au moment
// du clic (avant tout `await`), puis redirigée vers le vrai lien une fois le
// PATCH de statut confirmé côté serveur. Si le PATCH échoue, la fenêtre est
// simplement fermée (pas de notification envoyée pour un statut non
// appliqué).
async function changerStatut(commandeId, newStatut) {
  const labels = { confirmee:'Confirmer', en_preparation:'Mettre en préparation', en_livraison:'Marquer en livraison', livree:'Marquer comme livrée', annulee:'Annuler' };
  if (!confirm((labels[newStatut]||newStatut) + ' cette commande ?')) return;

  const doitNotifierClient = newStatut === 'confirmee';
  let whatsappWindow = null;
  if (doitNotifierClient) {
    whatsappWindow = window.open('about:blank', '_blank');
  }

  try {
    const res = await fetch('/api/v1/dashboard/commandes/' + commandeId + '/statut', {
      method: 'PATCH',
      headers: { 'Content-Type':'application/json', 'X-Requested-With':'XMLHttpRequest' },
      credentials: 'include',
      body: JSON.stringify({ statut: newStatut })
    });

    if (res.ok) {
      if (doitNotifierClient) {
        const cmd = _commandeRegistry[commandeId];
        if (cmd && cmd.client_telephone) {
          const message = construireMessageConfirmationClient(cmd);
          const lien = genererLienWhatsAppClient(cmd.client_telephone, message);
          if (whatsappWindow) whatsappWindow.location.href = lien;
          else window.open(lien, '_blank');
        } else if (whatsappWindow) {
          whatsappWindow.close();
        }
      }
      await fetchCommandes();
    } else {
      if (whatsappWindow) whatsappWindow.close();
      alert('Erreur lors de la mise à jour du statut.');
    }
  } catch {
    if (whatsappWindow) whatsappWindow.close();
    alert('Erreur réseau.');
  }
}

function filtrerCommandes(statut) {
  currentFilter = statut;
  document.querySelectorAll('.statut-filter-btn').forEach(b => {
    b.classList.remove('bg-red-600','text-white');
    b.classList.add('border','border-gray-200','text-gray-600');
  });
  const activeBtn = statut
    ? document.querySelector(`[onclick="filtrerCommandes('${statut}')"]`)
    : document.querySelector(`[onclick="filtrerCommandes(null)"]`);
  if (activeBtn) { activeBtn.classList.add('bg-red-600','text-white'); activeBtn.classList.remove('border','border-gray-200','text-gray-600'); }
  fetchCommandes();
}

async function exportCommandes() {
  const dateDebut = new Date(Date.now() - 30*86400000).toISOString().split('T')[0];
  const dateFin = new Date().toISOString().split('T')[0];
  try {
    const res = await fetch(`/api/v1/dashboard/commandes/export-csv?date_debut=${dateDebut}&date_fin=${dateFin}`, { credentials: 'include' });
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
    const res = await fetch('/api/v1/dashboard/menu', { credentials: 'include' });
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderMenuEditor(data.categories || [], content);
  } catch { content.innerHTML = '<p class="text-red-500 text-sm p-4">Erreur de chargement du menu.</p>'; }
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
    const res = await fetch('/api/v1/dashboard/categories', {
      method:'POST', headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'}, credentials:'include',
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
    const res = await fetch('/api/v1/dashboard/categories/' + catId, {
      method:'PATCH', headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'}, credentials:'include',
      body: JSON.stringify({ nom })
    });
    if (res.ok) { closeModal(); loadMenu(); }
    else { const d = await res.json(); alert(d.error||'Erreur'); }
  } catch { alert('Erreur réseau.'); }
}
async function supprimerCategorie(catId) {
  if (!confirm('Supprimer cette catégorie ? Elle doit être vide.')) return;
  try {
    const res = await fetch('/api/v1/dashboard/categories/' + catId, {
      method:'DELETE', headers:{'X-Requested-With':'XMLHttpRequest'}, credentials:'include'
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
      const upRes = await fetch('/api/v1/dashboard/upload-image', {
        method:'POST', headers:{'X-Requested-With':'XMLHttpRequest'}, credentials:'include', body: fd
      });
      if (upRes.ok) { const upData = await upRes.json(); photo_url = upData.url;
        const prev = document.getElementById('photo-preview');
        if (prev) { prev.innerHTML = `<img src="${upData.url}" class="w-16 h-16 rounded-lg object-cover border border-green-200">`; prev.classList.remove('hidden'); }
      } else { const err = await upRes.json(); alert('Erreur upload : '+(err.error||'Échec')); }
    } catch { alert('Erreur upload.'); }
    if (uploadDiv) uploadDiv.classList.add('hidden');
  }
  try {
    const res = await fetch('/api/v1/dashboard/produits', {
      method:'POST', headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'}, credentials:'include',
      body: JSON.stringify({ categorie_id: categorieId, nom, description, prix, disponible:true, photo_url })
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
   