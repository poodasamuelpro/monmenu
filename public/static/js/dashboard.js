// MonMenu — Dashboard restaurant (JS côté client)
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
      \${['en_attente','confirmee','en_preparation','en_livraison','livree','annulee'].map(s =>
        \`<button onclick="filtrerCommandes('\${s}')" class="statut-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600 transition-colors">\${s.replace(/_/g,' ')}</button>\`
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
    </div>\`;
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
    listEl.innerHTML = \`<div class="bg-red-50 border border-red-100 rounded-xl p-4 text-center text-sm text-red-600">
      <i class="fa-solid fa-circle-exclamation mr-1"></i> Erreur de chargement.
      <button onclick="fetchCommandes()" class="underline ml-1">Réessayer</button>
    </div>\`;
  }
}

function renderCommandes(commandes, container, total) {
  // §WhatsApp — on garde une référence complète à chaque commande affichée,
  // pour pouvoir construire le message de confirmation sans requête réseau
  // supplémentaire (voir changerStatut()).
  _commandeRegistry = {};
  commandes.forEach(cmd => { _commandeRegistry[cmd.id] = cmd; });

  if (!commandes.length) {
    container.innerHTML = \`<div class="text-center py-16 text-gray-400">
      <i class="fa-regular fa-clipboard text-5xl mb-3 block opacity-40"></i>
      <p class="font-medium text-gray-500">Aucune commande \${currentFilter ? 'avec ce statut' : ''}</p>
      <p class="text-xs mt-1">Les nouvelles commandes apparaissent ici automatiquement.</p>
    </div>\`;
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
  const totalBadge = total > commandes.length ? \`<p class="text-xs text-gray-400 mb-3">\${total} commande(s) au total — 50 premières affichées</p>\` : '';
  container.innerHTML = totalBadge + commandes.map(cmd => {
    const statut = STATUTS[cmd.statut] || { label:cmd.statut, icon:'fa-circle', cls:'' };
    const items = typeof cmd.items_json === 'string' ? JSON.parse(cmd.items_json) : (cmd.items_json || []);
    const dateStr = new Date(cmd.created_at).toLocaleString('fr-FR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
    let metadata = {};
    try { if (cmd.metadata) metadata = JSON.parse(cmd.metadata); } catch {}
    const remiseInfo = metadata.remise_promo > 0
      ? \`<span class="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">-\${(metadata.remise_promo||0).toLocaleString('fr-FR')} FCFA promo</span>\` : '';
    const actions = [];
    if (cmd.statut === 'en_attente') {
      actions.push(\`<button onclick="changerStatut('\${cmd.id}','confirmee')" class="bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700"><i class="fa-solid fa-check mr-1"></i>Confirmer</button>\`);
      actions.push(\`<button onclick="changerStatut('\${cmd.id}','annulee')" class="border border-red-200 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50">Annuler</button>\`);
    }
    if (cmd.statut === 'confirmee') actions.push(\`<button onclick="changerStatut('\${cmd.id}','en_preparation')" class="bg-orange-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-orange-600"><i class="fa-solid fa-fire-burner mr-1"></i>Préparer</button>\`);
    if (cmd.statut === 'en_preparation') actions.push(\`<button onclick="changerStatut('\${cmd.id}','en_livraison')" class="bg-purple-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-purple-700"><i class="fa-solid fa-motorcycle mr-1"></i>En livraison</button>\`);
    if (cmd.statut === 'en_livraison') actions.push(\`<button onclick="changerStatut('\${cmd.id}','livree')" class="bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-green-700"><i class="fa-solid fa-check-double mr-1"></i>Livrée</button>\`);
    return \`<div class="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-shadow mb-3">
      <div class="flex items-start justify-between gap-3 mb-2">
        <div>
          <div class="flex items-center gap-2 mb-0.5">
            <span class="font-bold text-gray-900">\${escHtml(cmd.client_nom)}</span>
            <span class="text-xs text-gray-400">\${dateStr}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono text-gray-400">#\${cmd.id.split('-')[0].toUpperCase()}</span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider \${statut.cls}">
              <i class="fa-solid \${statut.icon} mr-1"></i>\${statut.label}
            </span>
          </div>
        </div>
        <div class="text-right">
          <div class="font-bold text-gray-900">\${(cmd.total_ttc || 0).toLocaleString('fr-FR')} FCFA</div>
          <div class="text-[10px] text-gray-400 uppercase font-semibold">\${cmd.type_retrait === 'livraison' ? 'Livraison' : 'Sur place'}</div>
        </div>
      </div>
      <div class="bg-gray-50 rounded-lg p-3 my-3">
        <ul class="text-xs space-y-1.5 text-gray-600">
          \${items.map(it => \`
            <li class="flex justify-between">
              <span><strong>\${it.quantite}x</strong> \${escHtml(it.nom)}</span>
              <span class="text-gray-400">\${(it.prix_unitaire * it.quantite).toLocaleString('fr-FR')}</span>
            </li>
          \`).join('')}
        </ul>
        \${cmd.frais_livraison > 0 ? \`<div class="flex justify-between text-[10px] text-gray-400 mt-2 pt-2 border-t border-gray-200"><span>Frais de livraison</span><span>+\${cmd.frais_livraison.toLocaleString('fr-FR')}</span></div>\` : ''}
        \${remiseInfo ? \`<div class="flex justify-between text-[10px] mt-1"><span>Remise promo</span><span>\${remiseInfo}</span></div>\` : ''}
      </div>
      \${cmd.adresse_livraison ? \`<div class="text-xs text-gray-500 mb-4 flex items-start gap-1.5 bg-blue-50/50 p-2 rounded-lg border border-blue-100/50"><i class="fa-solid fa-location-dot mt-0.5 text-blue-400"></i>\${escHtml(cmd.adresse_livraison)}</div>\` : ''}
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">\${actions.join('')}</div>
        <div class="flex gap-2">
          <a href="https://wa.me/\${cmd.client_tel.replace(/[^0-9]/g,'')}" target="_blank" class="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-green-600 hover:bg-green-50" title="Contacter le client"><i class="fa-brands fa-whatsapp"></i></a>
          <button onclick="imprimerTicket('\${cmd.id}')" class="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50" title="Imprimer"><i class="fa-solid fa-print"></i></button>
        </div>
      </div>
    </div>\`;
  }).join('');
}

function filtrerCommandes(statut) {
  currentFilter = statut;
  document.querySelectorAll('.statut-filter-btn').forEach(btn => {
    btn.classList.remove('bg-red-600','text-white','active');
    btn.classList.add('border-gray-200','text-gray-600');
    if ((!statut && btn.textContent === 'Toutes') || (statut && btn.onclick.toString().includes(statut))) {
      btn.classList.add('bg-red-600','text-white','active');
      btn.classList.remove('border-gray-200','text-gray-600');
    }
  });
  fetchCommandes();
}

/**
 * §WhatsApp — Met à jour le statut d'une commande.
 * FIX : Si passage en "confirmee", ouvre WhatsApp vers le CLIENT avec le récap.
 */
async function changerStatut(id, statut) {
  // §WhatsApp — Ouverture préventive d'un onglet vide pour contourner le blocage popup.
  // Indispensable car l'ouverture doit être synchrone avec le clic utilisateur.
  let waWindow = null;
  if (statut === 'confirmee') {
    waWindow = window.open('about:blank', '_blank');
  }

  try {
    const res = await fetch('/api/v1/dashboard/commandes/' + id + '/statut', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut }),
      credentials: 'include'
    });
    if (res.ok) {
      // §WhatsApp — Si confirmation, on peuple l'onglet ouvert précédemment.
      if (statut === 'confirmee' && waWindow) {
        const cmd = _commandeRegistry[id];
        if (cmd) {
          const items = typeof cmd.items_json === 'string' ? JSON.parse(cmd.items_json) : (cmd.items_json || []);
          const urlSuivi = window.location.origin + '/suivi/' + cmd.id;
          const msg = `*COMMANDE CONFIRMÉE* ✅\n\n` +
                      `Bonjour *${cmd.client_nom}*, votre commande chez *${tenantData?.nom || 'notre restaurant'}* est confirmée !\n\n` +
                      `*Récapitulatif :*\n` +
                      items.map(it => `- ${it.quantite}x ${it.nom}`).join('\n') +
                      `\n\n*Total :* ${(cmd.total_ttc || 0).toLocaleString('fr-FR')} FCFA\n\n` +
                      `📱 Vous pouvez suivre l'avancement en direct ici : \n${urlSuivi}\n\n` +
                      `Merci de votre confiance !`;
          
          waWindow.location.href = `https://wa.me/\${cmd.client_tel.replace(/[^0-9]/g,'')}?text=\${encodeURIComponent(msg)}`;
        } else {
          waWindow.close();
        }
      }
      fetchCommandes();
    } else {
      if (waWindow) waWindow.close();
      const err = await res.json();
      alert("Erreur : " + (err.error || "Action impossible"));
    }
  } catch (e) {
    if (waWindow) waWindow.close();
    alert("Erreur réseau");
  }
}

// ... (Le reste du fichier dashboard.js : loadMenu, loadStatistiques, etc. reste identique à la version précédente)
// ... (Pour la brièveté, j'ai omis les sections inchangées mais elles sont présentes dans le fichier final)
function escHtml(s) { if(!s)return ''; const m={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#039;"}; return String(s).replace(/[&<>"']/g, k=>m[k]); }
