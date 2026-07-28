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
      const upRes = await fetch('/api/v1/dashboard/upload-image', {
        method:'POST', headers:{'X-Requested-With':'XMLHttpRequest'}, credentials:'include', body:fd
      });
      if (upRes.ok) { const upData = await upRes.json(); photo_url = upData.url; }
      else { const err = await upRes.json(); alert('Erreur upload : ' + (err.error || 'Échec')); }
    } catch { alert('Erreur upload.'); }
    if (prog) prog.classList.add('hidden');
  }
  const payload = { nom, description, prix };
  if (photo_url !== undefined) payload.photo_url = photo_url;
  try {
    const res = await fetch('/api/v1/dashboard/produits/' + prodId, {
      method:'PATCH', headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'}, credentials:'include',
      body: JSON.stringify(payload)
    });
    if (res.ok) { closeModal(); loadMenu(); }
    else { const d = await res.json(); alert(d.error||'Erreur'); }
  } catch { alert('Erreur réseau.'); }
}
async function supprimerProduit(prodId) {
  if (!confirm('Supprimer ce produit définitivement ?')) return;
  try {
    const res = await fetch('/api/v1/dashboard/produits/' + prodId, {
      method:'DELETE', headers:{'X-Requested-With':'XMLHttpRequest'}, credentials:'include'
    });
    if (res.ok) loadMenu();
    else { const d = await res.json(); alert(d.error||'Erreur'); }
  } catch { alert('Erreur réseau.'); }
}
async function toggleDisponible(prodId, currentDisponible) {
  try {
    const res = await fetch('/api/v1/dashboard/produits/' + prodId, {
      method:'PATCH', headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'}, credentials:'include',
      body: JSON.stringify({ disponible: !currentDisponible })
    });
    if (!res.ok) { const d = await res.json().catch(()=>({})); alert(d.error || 'Erreur lors du changement de disponibilité.'); return; }
    loadMenu();
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
    const res = await fetch('/api/v1/dashboard/stats', { credentials: 'include' });
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
          type:'doughnut',
          data:{ labels:statLabels, datasets:[{ data:statValues, backgroundColor:['#F59E0B','#3B82F6','#F97316','#8B5CF6','#22C55E','#EF4444'] }] },
          options:{ responsive:true, plugins:{ legend:{ position:'bottom', labels:{ padding:10, font:{ size:11 } } } } }
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
    type:'line',
    data:{
      labels: data.labels || [],
      datasets:[{
        label: isCA ? 'CA (FCFA)' : 'Commandes',
        data: isCA ? (data.ca_values||[]) : (data.values||[]),
        borderColor: isCA ? '#22C55E' : '#DC2626',
        backgroundColor: isCA ? 'rgba(34,197,94,0.06)' : 'rgba(220,38,38,0.06)',
        borderWidth:2, tension:0.4, fill:true,
        pointBackgroundColor: isCA ? '#22C55E' : '#DC2626', pointRadius:3
      }]
    },
    options:{
      responsive:true,
      plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label: ctx => isCA ? (ctx.raw||0).toLocaleString('fr-FR')+' FCFA' : ctx.raw+' commande(s)' } } },
      scales:{ y:{ beginAtZero:true, grid:{ color:'#F3F4F6' }, ticks:{ precision:0 } }, x:{ grid:{ display:false }, ticks:{ maxTicksLimit:10 } } }
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
    const res = await fetch('/api/v1/dashboard/livreurs', { credentials: 'include' });
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderLivreurs(data.livreurs||[], content);
  } catch { content.innerHTML = `<div class="text-center py-10"><p class="text-red-500 text-sm">Erreur de chargement.</p><button onclick="loadLivreurs()" class="mt-3 text-xs text-red-600 underline">Réessayer</button></div>`; }
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
    const res = await fetch('/api/v1/dashboard/livreurs', {
      method:'POST', headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'}, credentials:'include',
      body: JSON.stringify({ nom, whatsapp_number })
    });
    if (res.ok) { closeModal(); loadLivreurs(); }
    else { const d = await res.json(); alert(d.error||'Erreur'); }
  } catch { alert('Erreur réseau.'); }
}
async function toggleLivreurActif(livId, currentActif) {
  try {
    await fetch('/api/v1/dashboard/livreurs/' + livId, {
      method:'PATCH', headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'}, credentials:'include',
      body: JSON.stringify({ actif: currentActif ? 0 : 1 })
    });
    loadLivreurs();
  } catch { alert('Erreur réseau.'); }
}
async function supprimerLivreur(livId) {
  if (!confirm('Supprimer ce livreur ?')) return;
  try {
    const res = await fetch('/api/v1/dashboard/livreurs/' + livId, {
      method:'DELETE', headers:{'X-Requested-With':'XMLHttpRequest'}, credentials:'include'
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
    const res = await fetch('/api/v1/dashboard/qrcode', { credentials: 'include' });
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
  } catch { content.innerHTML = '<p class="text-red-500 text-sm p-4">Erreur de chargement du QR Code.</p>'; }
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
    const res = await fetch('/api/v1/dashboard/profil', { credentials: 'include' });
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
    const res = await fetch('/api/v1/dashboard/apparence', {
      method:'PATCH', headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'}, credentials:'include',
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
    const res = await fetch('/api/v1/dashboard/upload-image', { method:'POST', headers:{'X-Requested-With':'XMLHttpRequest'}, credentials:'include', body:fd });
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
    const res = await fetch('/api/v1/dashboard/apparence', {
      method:'PATCH', headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'}, credentials:'include',
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
    const res = await fetch('/api/v1/dashboard/apparence', {
      method:'PATCH', headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'}, credentials:'include',
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
    const res = await fetch('/api/v1/dashboard/profil', { credentials: 'include' });
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
            <input id="param-whatsapp" type="tel" required value="${escHtml(tenant.whatsapp_number||'')}" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="+226 70 00 00 00">
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
          <a href="/tarifs" class="text-xs text-red-600 font-semibold hover:underline">Changer de plan →</a>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 class="font-bold text-gray-900 mb-1">Sécurité</h3>
        <p class="text-sm text-gray-500 mb-4">Réinitialisez votre mot de passe si nécessaire.</p>
        <button onclick="demanderResetPassword()" class="border border-gray-200 text-gray-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-gray-50">
          <i class="fa-solid fa-key mr-1.5"></i> Demander un lien de réinitialisation
        </button>
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
    whatsapp_number: document.getElementById('param-whatsapp').value.trim().replace(/\s/g,''),
    domaine_perso: document.getElementById('param-domaine')?.value?.trim() || null
  };
  try {
    const res = await fetch('/api/v1/dashboard/parametres', {
      method:'PATCH', headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'}, credentials:'include',
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
function demanderResetPassword() { alert('Contactez le support : support@monmenu.app'); }
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
    const res = await fetch('/api/v1/dashboard/codes-promo', { credentials: 'include' });
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderCodesPromo(data.codes||[], content);
  } catch { content.innerHTML = '<p class="text-red-500 text-sm p-4">Erreur de chargement des codes promo.</p>'; }
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
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Type *</label>
        <select id="promo-type" onchange="updatePromoValeurMax()" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
          <option value="pourcentage">Pourcentage (%)</option>
          <option value="montant_fixe">Montant fixe (FCFA)</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Valeur *</label>
        <input id="promo-valeur" type="number" required min="1" max="100" step="1" placeholder="20" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
        <p id="promo-valeur-hint" class="text-xs text-gray-400 mt-1">Max 100%</p>
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Date d'expiration (optionnel)</label>
        <input id="promo-datefin" type="date" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Utilisations max (optionnel)</label>
        <input id="promo-max" type="number" min="1" placeholder="vide = illimité" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
      </div>
      <button type="submit" class="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700">Créer le code promo</button>
    </form>`);
}
function updatePromoValeurMax() {
  const type = document.getElementById('promo-type')?.value;
  const input = document.getElementById('promo-valeur');
  const hint = document.getElementById('promo-valeur-hint');
  if (!input||!hint) return;
  if (type==='pourcentage') { input.max=100; input.placeholder='20'; hint.textContent='Max 100%'; }
  else { input.max=9999999; input.placeholder='1000'; hint.textContent='Montant en FCFA'; }
}
async function submitAddCodePromo(e) {
  e.preventDefault();
  const code = document.getElementById('promo-code').value.trim().toUpperCase();
  const type = document.getElementById('promo-type').value;
  const valeur = parseFloat(document.getElementById('promo-valeur').value);
  const date_fin = document.getElementById('promo-datefin').value || null;
  const usage_max = document.getElementById('promo-max').value ? parseInt(document.getElementById('promo-max').value) : null;
  try {
    const res = await fetch('/api/v1/dashboard/codes-promo', {
      method:'POST', headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'}, credentials:'include',
      body: JSON.stringify({ code, type, valeur, date_fin, usage_max })
    });
    if (res.ok) {
      const d = await res.json();
      closeModal();
      loadCodesPromo();
      if (d && d.code) copierCodePromo(d.code, true);
    }
    else { const d = await res.json(); alert(d.error||'Erreur'); }
  } catch { alert('Erreur réseau.'); }
}
async function supprimerCodePromo(promoId) {
  if (!confirm('Supprimer ce code promo ?')) return;
  try {
    const res = await fetch('/api/v1/dashboard/codes-promo/' + promoId, { method:'DELETE', headers:{'X-Requested-With':'XMLHttpRequest'}, credentials:'include' });
    if (res.ok) loadCodesPromo();
  } catch { alert('Erreur réseau.'); }
}

function copierCodePromo(code, silencieux) {
  navigator.clipboard.writeText(code).then(() => {
    if (silencieux) return;
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg';
    toast.innerHTML = '<i class="fa-solid fa-check mr-1.5"></i>Code « ' + escHtml(code) + ' » copié !';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1800);
  }).catch(() => alert('Code : ' + code));
}

async function exportCodesPromo() {
  try {
    const res = await fetch('/api/v1/dashboard/codes-promo/export-csv', { credentials: 'include' });
    if (!res.ok) { alert('Erreur export.'); return; }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'codes-promo.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  } catch { alert('Erreur réseau.'); }
}

// ==============================
// SECTION PDV — Mon restaurant (horaires enrichis)
// ==============================
async function loadPdv() {
  const content = document.getElementById('dashboard-content');
  content.innerHTML = `<div class="text-center py-8"><i class="fa-solid fa-circle-notch fa-spin text-xl text-gray-400"></i></div>`;
  try {
    const res = await fetch('/api/v1/dashboard/pdv', { credentials: 'include' });
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderPdvConfig(data.pdv, content);
  } catch { content.innerHTML = '<p class="text-red-500 text-sm p-4">Erreur de chargement du point de vente.</p>'; }
}

function parsePdvHoraires(raw) {
  if (!raw) return {};
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return {}; }
}

function renderPdvConfig(pdv, container) {
  container.innerHTML = `
    <div class="max-w-lg space-y-4">
      <div class="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 class="font-bold text-gray-900 mb-1">Point de vente</h2>
        <p class="text-sm text-gray-500 mb-5">Configurez l'adresse et les coordonnées GPS. Ceci active le calcul automatique des frais de livraison.</p>
        <form onsubmit="savePdv(event)" class="space-y-4">
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">Nom du point de vente</label>
            <input id="pdv-nom" type="text" maxlength="100" value="${escHtml(pdv?.nom||'')}" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="Restaurant principal">
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">Adresse complète</label>
            <input id="pdv-adresse" type="text" maxlength="200" value="${escHtml(pdv?.adresse||'')}" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="Quartier, rue, ville...">
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1.5">Latitude GPS</label>
              <input id="pdv-lat" type="number" step="0.000001" min="-90" max="90" value="${pdv?.latitude||''}" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="12.3569">
            </div>
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1.5">Longitude GPS</label>
              <input id="pdv-lon" type="number" step="0.000001" min="-180" max="180" value="${pdv?.longitude||''}" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="-1.5353">
            </div>
          </div>
          <button type="button" onclick="useMyLocation()" class="w-full border border-gray-200 text-gray-700 font-semibold text-sm py-2.5 rounded-xl hover:bg-gray-50 flex items-center justify-center gap-2">
            <i class="fa-solid fa-location-crosshairs"></i> Utiliser ma position actuelle
          </button>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1.5">Tarif base (FCFA)</label>
              <input id="pdv-tarif-base" type="number" min="0" max="99999" step="100" value="${pdv?.tarif_livraison_base??500}" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
              <p class="text-xs text-gray-400 mt-1">Frais fixes min.</p>
            </div>
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1.5">Tarif par km (FCFA)</label>
              <input id="pdv-tarif-km" type="number" min="0" max="9999" step="50" value="${pdv?.tarif_par_km??200}" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
              <p class="text-xs text-gray-400 mt-1">Frais par km.</p>
            </div>
          </div>

          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2">Horaires d'ouverture</label>
            <div id="pdv-horaires-container" class="bg-gray-50 rounded-xl p-3"></div>
            <p class="text-xs text-gray-400 mt-1.5">Ces horaires déterminent le badge « Ouvert / Fermé » affiché sur votre boutique publique.</p>
          </div>

          <p id="pdv-feedback" class="text-xs hidden rounded-lg px-3 py-2"></p>
          <button type="submit" class="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700">
            <i class="fa-solid fa-floppy-disk mr-1.5"></i> Enregistrer
          </button>
        </form>
      </div>
      ${pdv?.latitude && pdv?.longitude ?
      `<div class="bg-green-50 border border-green-100 rounded-2xl p-4 text-sm text-green-700">
        <i class="fa-solid fa-circle-check mr-1.5"></i>GPS configuré : <strong>${pdv.latitude}, ${pdv.longitude}</strong><br>
        Frais de livraison calculés automatiquement.</div>` :
      `<div class="bg-orange-50 border border-orange-100 rounded-2xl p-4 text-sm text-orange-700">
        <i class="fa-solid fa-triangle-exclamation mr-1.5"></i>GPS non configuré. Le calcul des frais de livraison nécessite vos coordonnées GPS.</div>`}
    </div>`;

  renderPdvHorairesEditor(parsePdvHoraires(pdv?.horaires));
}

function renderPdvHorairesEditor(horaires) {
  const container = document.getElementById('pdv-horaires-container');
  if (!container) return;
  container.innerHTML = JOURS_SEMAINE.map(jour => {
    const entry = horaires[jour] || {};
    const ouvert = entry.ouvert !== false;
    const debut = entry.debut || '08:00';
    const fin = entry.fin || '22:00';
    return `<div class="flex items-center gap-3 py-2.5 border-b border-gray-200/70 last:border-0">
      <div class="w-20 text-sm font-medium text-gray-700 flex-shrink-0">${JOURS_LABELS[jour]}</div>
      <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
        <input type="checkbox" id="pdv-h-${jour}-ouvert" class="sr-only peer" ${ouvert ? 'checked' : ''} onchange="_togglePdvHoraire('${jour}')">
        <div class="w-9 h-5 bg-gray-300 rounded-full peer peer-checked:bg-red-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
      </label>
      <div id="pdv-h-${jour}-times" class="flex items-center gap-1.5 flex-1 ${ouvert ? '' : 'hidden'}">
        <input type="time" id="pdv-h-${jour}-debut" value="${debut}" class="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-[6.5rem] bg-white">
        <span class="text-gray-400 text-xs">–</span>
        <input type="time" id="pdv-h-${jour}-fin" value="${fin}" class="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-[6.5rem] bg-white">
      </div>
      <span id="pdv-h-${jour}-closed" class="${ouvert ? 'hidden' : ''} text-xs text-gray-400 italic ml-auto">Fermé</span>
    </div>`;
  }).join('');
}

function _togglePdvHoraire(jour) {
  const checked = document.getElementById('pdv-h-' + jour + '-ouvert').checked;
  document.getElementById('pdv-h-' + jour + '-times').classList.toggle('hidden', !checked);
  document.getElementById('pdv-h-' + jour + '-closed').classList.toggle('hidden', checked);
}

function collecterPdvHoraires() {
  const horaires = {};
  JOURS_SEMAINE.forEach(jour => {
    const ouvertEl = document.getElementById('pdv-h-' + jour + '-ouvert');
    const ouvert = ouvertEl ? ouvertEl.checked : false;
    horaires[jour] = {
      ouvert,
      debut: ouvert ? document.getElementById('pdv-h-' + jour + '-debut').value : null,
      fin: ouvert ? document.getElementById('pdv-h-' + jour + '-fin').value : null
    };
  });
  return horaires;
}

function useMyLocation() {
  if (!navigator.geolocation) { alert('Géolocalisation non supportée.'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    document.getElementById('pdv-lat').value = pos.coords.latitude.toFixed(6);
    document.getElementById('pdv-lon').value = pos.coords.longitude.toFixed(6);
    const fb = document.getElementById('pdv-feedback');
    fb.textContent = 'Position : ' + pos.coords.latitude.toFixed(4) + ', ' + pos.coords.longitude.toFixed(4);
    fb.className = 'text-xs bg-green-50 text-green-700 rounded-lg px-3 py-2'; fb.classList.remove('hidden');
  }, () => alert('Impossible d\'obtenir votre position.'));
}
async function savePdv(e) {
  e.preventDefault();
  const fb = document.getElementById('pdv-feedback');
  const data = {
    nom: document.getElementById('pdv-nom').value.trim(),
    adresse: document.getElementById('pdv-adresse').value.trim(),
    latitude: parseFloat(document.getElementById('pdv-lat').value)||null,
    longitude: parseFloat(document.getElementById('pdv-lon').value)||null,
    tarif_livraison_base: parseFloat(document.getElementById('pdv-tarif-base').value)||500,
    tarif_par_km: parseFloat(document.getElementById('pdv-tarif-km').value)||200,
    horaires: JSON.stringify(collecterPdvHoraires())
  };
  try {
    const res = await fetch('/api/v1/dashboard/pdv', {
      method:'PATCH', headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'}, credentials:'include',
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (res.ok) { fb.textContent = result.created?'Point de vente créé.':'Point de vente mis à jour.'; fb.className = 'text-xs bg-green-50 text-green-700 rounded-lg px-3 py-2'; }
    else { fb.textContent = result.error||'Erreur.'; fb.className = 'text-xs bg-red-50 text-red-600 rounded-lg px-3 py-2'; }
    fb.classList.remove('hidden');
  } catch { fb.textContent = 'Erreur réseau.'; fb.className = 'text-xs bg-red-50 text-red-600 rounded-lg px-3 py-2'; fb.classList.remove('hidden'); }
}

// ==============================
// MODAL UTILITAIRES
// ==============================
function showModal(titre, contenu) {
  let modal = document.getElementById('dash-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'dash-modal'; modal.className = 'fixed inset-0 z-50'; document.body.appendChild(modal); }
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/50" onclick="closeModal()"></div>
    <div class="absolute inset-x-4 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-white rounded-2xl sm:w-96 shadow-2xl max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
        <h3 class="font-bold text-gray-900">${escHtml(titre)}</h3>
        <button onclick="closeModal()" class="p-1.5 hover:bg-gray-100 rounded-lg"><i class="fa-solid fa-xmark text-gray-500"></i></button>
      </div>
      <div class="p-5">${contenu}</div>
    </div>`;
  modal.classList.remove('hidden');
}
function closeModal() { const m = document.getElementById('dash-modal'); if (m) m.classList.add('hidden'); }
function getAuthToken() { return ''; }
function getTenantSlug() {
  if (tenantData && tenantData.slug) return tenantData.slug;
  const t = localStorage.getItem('monmenu_tenant');
  if (t) { try { return JSON.parse(t).slug||''; } catch {} }
  return '';
}
function showAuthError() { localStorage.removeItem('monmenu_tenant'); window.location.href = '/dashboard'; }

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escJs(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

// Expositions globales
window.initDashboard = initDashboard;
window.navigateTo = navigateTo;
window.filtrerCommandes = filtrerCommandes;
window.changerStatut = changerStatut;
window.loadCommandes = loadCommandes;
window.exportCommandes = exportCommandes;
window.loadMenu = loadMenu;
window.showAddCategorieModal = showAddCategorieModal;
window.submitAddCategorie = submitAddCategorie;
window.showEditCategorieModal = showEditCategorieModal;
window.submitEditCategorie = submitEditCategorie;
window.supprimerCategorie = supprimerCategorie;
window.showAddProduitModal = showAddProduitModal;
window.submitAddProduit = submitAddProduit;
window.showEditProduitModal = showEditProduitModal;
window.submitEditProduit = submitEditProduit;
window.supprimerProduit = supprimerProduit;
window.toggleDisponible = toggleDisponible;
window.loadLivreurs = loadLivreurs;
window.showAddLivreurModal = showAddLivreurModal;
window.submitAddLivreur = submitAddLivreur;
window.toggleLivreurActif = toggleLivreurActif;
window.supprimerLivreur = supprimerLivreur;
window.loadQRCode = loadQRCode;
window.copyLink = copyLink;
window.loadStatistiques = loadStatistiques;
window.switchChart = switchChart;
window.loadApparence = loadApparence;
window.saveApparence = saveApparence;
window.saveLogo = saveLogo;
window.saveBanniere = saveBanniere;
window.loadParametres = loadParametres;
window.saveParametres = saveParametres;
window.demanderResetPassword = demanderResetPassword;
window.confirmerSuppression = confirmerSuppression;
window.loadCodesPromo = loadCodesPromo;
window.showAddCodePromoModal = showAddCodePromoModal;
window.updatePromoValeurMax = updatePromoValeurMax;
window.submitAddCodePromo = submitAddCodePromo;
window.supprimerCodePromo = supprimerCodePromo;
window.copierCodePromo = copierCodePromo;
window.exportCodesPromo = exportCodesPromo;
window.loadPdv = loadPdv;
window.savePdv = savePdv;
window.useMyLocation = useMyLocation;
window._togglePdvHoraire = _togglePdvHoraire;
window.showModal = showModal;
window.closeModal = closeModal;
window.escJs = escJs;