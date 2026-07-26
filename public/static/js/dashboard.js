// MonMenu — Dashboard restaurant
'use strict';

let currentSection = 'commandes';
let currentFilter = null;

// ---- Init Dashboard ----
async function initDashboard() {
  const path = window.location.pathname;
  if (path.includes('commandes')) navigateTo('commandes');
  else if (path.includes('menu')) navigateTo('menu');
  else if (path.includes('statistiques')) navigateTo('statistiques');
  else if (path.includes('qrcode')) navigateTo('qrcode');
  else navigateTo('commandes');
  
  setActiveNavLink(currentSection);
}

function setActiveNavLink(section) {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active', 'bg-gray-800', 'text-white');
    link.classList.add('text-gray-300');
    if (link.href && link.href.includes(section)) {
      link.classList.add('active', 'bg-gray-800', 'text-white');
      link.classList.remove('text-gray-300');
    }
  });
}

// ---- Navigation ----
function navigateTo(section) {
  currentSection = section;
  const content = document.getElementById('dashboard-content');
  const title = document.getElementById('page-title');
  if (!content) return;

  const titles = {
    commandes: 'Commandes',
    menu: 'Gestion du menu',
    statistiques: 'Statistiques',
    livreurs: 'Livreurs',
    qrcode: 'QR Code',
    apparence: 'Apparence',
    parametres: 'Paramètres'
  };
  if (title) title.textContent = titles[section] || section;

  switch (section) {
    case 'commandes': loadCommandes(); break;
    case 'menu': loadMenu(); break;
    case 'statistiques': loadStatistiques(); break;
    case 'qrcode': loadQRCode(); break;
    default: content.innerHTML = '<div class="text-center py-12 text-gray-400"><p class="text-sm">Section en cours de développement</p></div>';
  }
}

// ---- Commandes ----
async function loadCommandes() {
  const content = document.getElementById('commandes-list');
  if (!content) return;

  content.innerHTML = `<div class="text-center py-12 text-gray-400">
    <i class="fa-solid fa-circle-notch fa-spin text-2xl mb-3 block"></i>
    <p class="text-sm">Chargement des commandes...</p>
  </div>`;

  try {
    const url = '/api/v1/dashboard/commandes' + (currentFilter ? '?statut=' + currentFilter : '');
    const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + getAuthToken() } });
    if (!res.ok) { showAuthError(); return; }
    const data = await res.json();
    renderCommandes(data.commandes || [], content);
  } catch (e) {
    content.innerHTML = '<p class="text-center text-sm text-red-500 py-8">Erreur de chargement. <button onclick="loadCommandes()" class="underline">Réessayer</button></p>';
  }
}

function renderCommandes(commandes, container) {
  if (!commandes.length) {
    container.innerHTML = `<div class="text-center py-12 text-gray-400">
      <i class="fa-regular fa-clipboard text-4xl mb-3 block"></i>
      <p class="font-medium text-gray-500">Aucune commande</p>
      <p class="text-sm mt-1">Les nouvelles commandes apparaîtront ici en temps réel.</p>
    </div>`;
    return;
  }

  const STATUTS = {
    en_attente: { label: 'En attente', icon: 'fa-clock' },
    confirmee: { label: 'Confirmée', icon: 'fa-circle-check' },
    en_preparation: { label: 'En préparation', icon: 'fa-fire-burner' },
    en_livraison: { label: 'En livraison', icon: 'fa-motorcycle' },
    livree: { label: 'Livrée', icon: 'fa-check-double' },
    annulee: { label: 'Annulée', icon: 'fa-xmark' }
  };

  container.innerHTML = commandes.map(cmd => {
    const statut = STATUTS[cmd.statut] || { label: cmd.statut, icon: 'fa-circle' };
    const items = typeof cmd.items_json === 'string' ? JSON.parse(cmd.items_json) : (cmd.items_json || []);
    const dateStr = new Date(cmd.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

    return `<div class="bg-white border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-shadow">
      <div class="flex items-start justify-between gap-3 mb-3">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="font-bold text-gray-900">${escHtml(cmd.client_nom)}</span>
            <span class="text-xs text-gray-400">${dateStr}</span>
          </div>
          <div class="text-xs text-gray-500 font-mono">#${cmd.id ? cmd.id.slice(0, 8).toUpperCase() : '—'}</div>
        </div>
        <div>
          <span class="statut-badge statut-${cmd.statut}">
            <i class="fa-solid ${statut.icon} text-xs"></i> ${statut.label}
          </span>
        </div>
      </div>
      <div class="text-xs text-gray-600 mb-3">${items.map(i => `${escHtml(i.nom)} ×${i.quantite}`).join(', ')}</div>
      <div class="flex items-center justify-between">
        <div class="font-bold text-sm">${(cmd.montant_total || 0).toLocaleString('fr-FR')} FCFA</div>
        <div class="flex gap-2">
          ${cmd.statut === 'en_attente' ? `
            <button onclick="changerStatut('${cmd.id}', 'confirmee')" class="bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
              <i class="fa-solid fa-check mr-1"></i>Confirmer
            </button>
          ` : ''}
          ${cmd.statut === 'confirmee' ? `
            <button onclick="changerStatut('${cmd.id}', 'en_preparation')" class="bg-orange-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-orange-600 transition-colors">
              <i class="fa-solid fa-fire-burner mr-1"></i>Préparer
            </button>
          ` : ''}
          ${cmd.statut === 'en_preparation' ? `
            <button onclick="changerStatut('${cmd.id}', 'en_livraison')" class="bg-purple-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-purple-700 transition-colors">
              <i class="fa-solid fa-motorcycle mr-1"></i>En livraison
            </button>
          ` : ''}
          ${cmd.statut === 'en_livraison' ? `
            <button onclick="changerStatut('${cmd.id}', 'livree')" class="bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors">
              <i class="fa-solid fa-check-double mr-1"></i>Livrée
            </button>
          ` : ''}
          ${['en_attente', 'confirmee'].includes(cmd.statut) ? `
            <button onclick="changerStatut('${cmd.id}', 'annulee')" class="border border-red-200 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
              Annuler
            </button>
          ` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

async function changerStatut(commandeId, newStatut) {
  if (!confirm(`Passer la commande à "${newStatut}" ?`)) return;
  try {
    const res = await fetch('/api/v1/commandes/' + commandeId + '/statut', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAuthToken() },
      body: JSON.stringify({ statut: newStatut })
    });
    if (res.ok) loadCommandes();
    else alert('Erreur lors de la mise à jour.');
  } catch (e) { alert('Erreur réseau.'); }
}

function filtrerCommandes(statut) {
  currentFilter = statut;
  loadCommandes();
}

// ---- Menu ----
async function loadMenu() {
  const content = document.getElementById('dashboard-content');
  content.innerHTML = `<div class="text-center py-12 text-gray-400">
    <i class="fa-solid fa-circle-notch fa-spin text-2xl mb-3 block"></i>
    <p class="text-sm">Chargement du menu...</p>
  </div>`;
  // Placeholder - Intégration Supabase Realtime à connecter
  content.innerHTML = `<div class="bg-white rounded-xl border border-gray-100 p-6">
    <div class="flex items-center justify-between mb-4">
      <h2 class="font-bold text-gray-900">Catégories et produits</h2>
      <button class="bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2">
        <i class="fa-solid fa-plus text-xs"></i> Ajouter une catégorie
      </button>
    </div>
    <p class="text-sm text-gray-500">Gestion du menu disponible après connexion Supabase.</p>
  </div>`;
}

// ---- QR Code ----
async function loadQRCode() {
  const content = document.getElementById('dashboard-content');
  try {
    const res = await fetch('/api/v1/tenants/' + getTenantSlug() + '/qrcode');
    if (!res.ok) throw new Error();
    const data = await res.json();
    content.innerHTML = `
      <div class="max-w-sm">
        <div class="bg-white rounded-2xl border border-gray-100 p-6 text-center">
          <h2 class="font-bold text-gray-900 mb-4">QR Code de votre boutique</h2>
          <img src="${data.qr_api_url}" alt="QR Code ${escHtml(data.nom)}" class="w-48 h-48 mx-auto mb-4 rounded-xl border border-gray-100">
          <p class="text-xs text-gray-500 font-mono mb-4">${escHtml(data.url)}</p>
          <div class="flex gap-3 justify-center">
            <a href="${data.qr_api_url}&format=png" download="qrcode-${getTenantSlug()}.png" class="flex items-center gap-1.5 bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-700 transition-colors">
              <i class="fa-solid fa-download text-xs"></i> PNG HD
            </a>
            <a href="${data.qr_api_url}&format=svg" download="qrcode-${getTenantSlug()}.svg" class="flex items-center gap-1.5 border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
              <i class="fa-solid fa-download text-xs"></i> SVG
            </a>
          </div>
        </div>
      </div>`;
  } catch {
    content.innerHTML = '<p class="text-red-500 text-sm">Erreur chargement QR Code.</p>';
  }
}

// ---- Statistiques ----
async function loadStatistiques() {
  const content = document.getElementById('dashboard-content');
  content.innerHTML = `
    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      ${['Commandes aujourd\'hui','CA du jour','Commandes ce mois','Taux de livraison'].map((label, i) => `
        <div class="bg-white rounded-xl border border-gray-100 p-4">
          <div class="text-xs text-gray-500 mb-1">${label}</div>
          <div class="text-2xl font-bold text-gray-900">—</div>
          <div class="text-xs text-gray-400 mt-1">Données réelles à venir</div>
        </div>
      `).join('')}
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-6">
      <h3 class="font-bold text-gray-900 mb-4">Commandes sur 30 jours</h3>
      <canvas id="stats-chart" height="100"></canvas>
    </div>`;

  // Chart.js placeholder
  const ctx = document.getElementById('stats-chart');
  if (ctx && window.Chart) {
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: Array.from({length: 30}, (_, i) => 'J-' + (29 - i)),
        datasets: [{
          label: 'Commandes',
          data: Array(30).fill(0),
          borderColor: '#DC2626',
          backgroundColor: 'rgba(220,38,38,0.05)',
          borderWidth: 2,
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, grid: { color: '#F3F4F6' } }, x: { grid: { display: false } } }
      }
    });
  }
}

// ---- Auth ----
function getAuthToken() {
  return localStorage.getItem('monmenu_auth_token') || '';
}

function getTenantSlug() {
  return localStorage.getItem('monmenu_tenant_slug') || '';
}

function showAuthError() {
  window.location.href = '/dashboard';
}

// ---- Utilitaires ----
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.initDashboard = initDashboard;
window.navigateTo = navigateTo;
window.filtrerCommandes = filtrerCommandes;
window.changerStatut = changerStatut;
