// public/static/js/notifications.js
// MonMenu — Module notifications restaurant (v1.0.0)
//
// Fonctionnalités :
//   • Cloche (#btn-notif) avec badge (#notif-badge) du nombre de non-lues
//   • Panneau déroulant (#notif-panel) avec liste paginée (#notif-liste)
//   • Marquer une notification lue/non lue (clic sur l'icône)
//   • Bouton "Tout marquer comme lu" (#btn-tout-lu)
//   • Pagination : Précédent / Suivant (#notif-prev / #notif-next)
//   • Son natif (oscillateur Web Audio API) à chaque nouvelle notif non lue
//   • Actualisation automatique du badge toutes les 60 secondes
//   • API utilisée :
//       GET  /api/v1/dashboard/notifications/liste?page=X&limit=10
//       PATCH /api/v1/dashboard/notifications/:id      { lue: true/false }
//       PATCH /api/v1/dashboard/notifications/tout-lire
//
'use strict';

// ---- État du module ----
let _notifPage = 1;
const _notifPageSize = 10;
let _notifTotal = 0;
let _notifPanelOpen = false;
let _notifRefreshInterval = null;

// ---- Init (appelée par initDashboard dans dashboard.js) ----
function initNotifBadge() {
  _rafraichirBadge();
  // Actualisation auto toutes les 60 secondes
  if (_notifRefreshInterval) clearInterval(_notifRefreshInterval);
  _notifRefreshInterval = setInterval(_rafraichirBadge, 60000);
}

// Alias exposé pour que dashboard.js puisse l'appeler depuis _onNouvelleCommande
function rafraichirBadgeNotifs() {
  _rafraichirBadge();
}

// ---- Rafraîchir uniquement le badge (requête légère) ----
async function _rafraichirBadge() {
  try {
    const res = await fetch('/api/v1/dashboard/notifications/liste?non_lues=true&limit=1', {
      credentials: 'include'
    });
    if (!res.ok) return;
    const data = await res.json();
    _updateBadge(data.nb_non_lues ?? 0);
  } catch { /* silencieux */ }
}

function _updateBadge(count) {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.remove('hidden');
    badge.classList.add('flex');
  } else {
    badge.classList.add('hidden');
    badge.classList.remove('flex');
  }
}

// ---- Ouvrir/fermer le panneau ----
function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  _notifPanelOpen = !_notifPanelOpen;
  if (_notifPanelOpen) {
    panel.classList.remove('hidden');
    _notifPage = 1;
    _chargerNotifications();
  } else {
    panel.classList.add('hidden');
  }
}

// ---- Charger la page courante de notifications ----
async function _chargerNotifications() {
  const liste = document.getElementById('notif-liste');
  if (!liste) return;

  liste.innerHTML = `<div class="text-center py-6 text-gray-400"><i class="fa-solid fa-circle-notch fa-spin text-lg"></i></div>`;

  try {
    const res = await fetch(
      `/api/v1/dashboard/notifications/liste?page=${_notifPage}&limit=${_notifPageSize}`,
      { credentials: 'include' }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    _notifTotal = data.total ?? 0;
    _updateBadge(data.nb_non_lues ?? 0);
    _renderNotifications(data.notifications ?? [], liste);
    _updatePagination();
  } catch {
    liste.innerHTML = `<div class="text-center py-6 text-sm text-red-500">
      <i class="fa-solid fa-circle-exclamation mb-1 block"></i>
      Erreur de chargement.
      <button onclick="_chargerNotifications()" class="underline ml-1">Réessayer</button>
    </div>`;
  }
}

function _renderNotifications(notifications, container) {
  if (!notifications.length) {
    container.innerHTML = `<div class="text-center py-8 text-gray-400 text-sm">
      <i class="fa-solid fa-bell-slash mb-2 block text-xl opacity-40"></i>
      Aucune notification
    </div>`;
    return;
  }

  const ICONES = {
    commande:  { icon: 'fa-receipt',             cls: 'text-blue-500',   bg: 'bg-blue-50' },
    paiement:  { icon: 'fa-credit-card',          cls: 'text-green-500',  bg: 'bg-green-50' },
    alerte:    { icon: 'fa-triangle-exclamation', cls: 'text-orange-500', bg: 'bg-orange-50' },
    info:      { icon: 'fa-circle-info',           cls: 'text-blue-400',   bg: 'bg-blue-50' },
    success:   { icon: 'fa-circle-check',          cls: 'text-green-500',  bg: 'bg-green-50' },
    warning:   { icon: 'fa-triangle-exclamation', cls: 'text-orange-500', bg: 'bg-orange-50' },
    error:     { icon: 'fa-circle-xmark',          cls: 'text-red-500',    bg: 'bg-red-50' },
  };

  container.innerHTML = notifications.map(n => {
    const style = ICONES[n.type] ?? ICONES.info;
    const dateStr = _formatNotifDate(n.created_at);
    const lueClass = n.lue ? 'opacity-60' : '';
    const fondClass = n.lue ? '' : 'bg-blue-50/30';

    return `<div class="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer ${fondClass} ${lueClass}"
        onclick="_ouvrirLienNotif('${_escAttr(n.lien||'')}','${n.id}')">
      <!-- Icône type -->
      <div class="flex-shrink-0 w-8 h-8 rounded-full ${style.bg} flex items-center justify-center mt-0.5">
        <i class="fa-solid ${style.icon} text-xs ${style.cls}"></i>
      </div>
      <!-- Contenu -->
      <div class="flex-1 min-w-0">
        <div class="flex items-start justify-between gap-1">
          <p class="text-sm font-semibold text-gray-900 leading-tight">${_escHtmlNotif(n.titre)}</p>
          <!-- Bouton lue/non lue -->
          <button
            onclick="event.stopPropagation();toggleNotifLue('${n.id}',${n.lue})"
            title="${n.lue ? 'Marquer non lue' : 'Marquer lue'}"
            class="flex-shrink-0 p-1 text-gray-300 hover:text-blue-500 transition-colors rounded">
            <i class="fa-${n.lue ? 'regular' : 'solid'} fa-circle-dot text-xs"></i>
          </button>
        </div>
        <p class="text-xs text-gray-500 mt-0.5 line-clamp-2">${_escHtmlNotif(n.message)}</p>
        <p class="text-[10px] text-gray-400 mt-1">${dateStr}</p>
      </div>
    </div>`;
  }).join('');
}

function _ouvrirLienNotif(lien, notifId) {
  // Marquer comme lue silencieusement
  if (notifId) _marquerLueSilencieux(notifId, true);
  if (lien && lien !== '') {
    // Si lien interne (commence par /), naviguer via SPA
    if (lien.startsWith('/dashboard/')) {
      const parts = lien.replace(/\/$/, '').split('/');
      const section = parts[parts.length - 1];
      if (typeof navigateTo === 'function') {
        toggleNotifPanel(); // Fermer le panneau
        history.pushState({}, '', lien);
        navigateTo(section);
      } else {
        window.location.href = lien;
      }
    } else {
      window.open(lien, '_blank', 'noopener');
    }
  }
}

async function _marquerLueSilencieux(notifId, lue) {
  try {
    await fetch('/api/v1/dashboard/notifications/' + notifId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
      body: JSON.stringify({ lue })
    });
    _rafraichirBadge();
  } catch { /* silencieux */ }
}

// ---- Toggle lue/non lue depuis le bouton ----
async function toggleNotifLue(notifId, estActuellementLue) {
  const nouvelleLue = !estActuellementLue;
  try {
    const res = await fetch('/api/v1/dashboard/notifications/' + notifId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
      body: JSON.stringify({ lue: nouvelleLue })
    });
    if (res.ok) {
      _chargerNotifications(); // Recharger la liste
    } else {
      const d = await res.json().catch(() => ({}));
      console.error('[Notifs] Erreur toggle lue:', d.error);
    }
  } catch (e) {
    console.error('[Notifs] Erreur réseau:', e);
  }
}

// ---- Tout marquer comme lu ----
async function toutMarquerLu() {
  try {
    const res = await fetch('/api/v1/dashboard/notifications/tout-lire', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include'
    });
    if (res.ok) {
      _chargerNotifications();
      _jouerSon('lu'); // petit son de confirmation
    }
  } catch (e) {
    console.error('[Notifs] Erreur tout-lire:', e);
  }
}

// ---- Pagination ----
function _updatePagination() {
  const footer   = document.getElementById('notif-footer');
  const prev     = document.getElementById('notif-prev');
  const next     = document.getElementById('notif-next');
  const pageInfo = document.getElementById('notif-page-info');

  if (!footer) return;

  const totalPages = Math.max(1, Math.ceil(_notifTotal / _notifPageSize));

  if (_notifTotal > _notifPageSize) {
    footer.classList.remove('hidden');
    footer.classList.add('flex');
  } else {
    footer.classList.add('hidden');
    footer.classList.remove('flex');
  }

  if (pageInfo) pageInfo.textContent = `Page ${_notifPage} / ${totalPages}`;

  if (prev) {
    prev.disabled = _notifPage <= 1;
    prev.classList.toggle('opacity-40', _notifPage <= 1);
    prev.classList.toggle('cursor-not-allowed', _notifPage <= 1);
  }
  if (next) {
    next.disabled = _notifPage >= totalPages;
    next.classList.toggle('opacity-40', _notifPage >= totalPages);
    next.classList.toggle('cursor-not-allowed', _notifPage >= totalPages);
  }
}

function notifPagePrev() {
  if (_notifPage > 1) {
    _notifPage--;
    _chargerNotifications();
  }
}

function notifPageNext() {
  const totalPages = Math.ceil(_notifTotal / _notifPageSize);
  if (_notifPage < totalPages) {
    _notifPage++;
    _chargerNotifications();
  }
}

// ---- Son de notification ----
// Utilise l'API Web Audio — ne bloque jamais, silencieux si l'API est indisponible.
// type : 'new' (nouvelle notif — tonalité haute) | 'lu' (confirmation — tonalité basse)
function _jouerSon(type) {
  try {
    const ctx  = new AudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'lu') {
      // Double bip descendant
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.setValueAtTime(440, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    } else {
      // Bip montant pour nouvelle notification
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch { /* Web Audio non disponible — silencieux */ }
}

// ---- Utilitaires internes ----
function _escHtmlNotif(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function _escAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/'/g, '&#039;')
    .replace(/"/g, '&quot;');
}

function _formatNotifDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000); // secondes
    if (diff < 60) return 'Il y a quelques secondes';
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
    if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)} j`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  } catch { return ''; }
}
