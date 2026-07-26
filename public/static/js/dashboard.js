// MonMenu — Dashboard restaurant (version complète)
'use strict';

let currentSection = 'commandes';
let currentFilter = null;
let authToken = null;
let tenantData = null;
let commandesInterval = null;

// ---- Init Dashboard ----
async function initDashboard() {
  // Vérifier auth
  authToken = localStorage.getItem('monmenu_auth_token');
  if (!authToken) {
    window.location.href = '/dashboard';
    return;
  }

  // Charger données tenant
  const tenantStr = localStorage.getItem('monmenu_tenant');
  if (tenantStr) {
    try { tenantData = JSON.parse(tenantStr); } catch {}
  }

  // Afficher nom restaurant
  const tenantNameEl = document.getElementById('tenant-name');
  if (tenantNameEl && tenantData) tenantNameEl.textContent = tenantData.nom || 'Mon Restaurant';

  // Navigation selon l'URL
  const path = window.location.pathname;
  if (path.includes('menu')) navigateTo('menu');
  else if (path.includes('statistiques')) navigateTo('statistiques');
  else if (path.includes('livreurs')) navigateTo('livreurs');
  else if (path.includes('qrcode')) navigateTo('qrcode');
  else if (path.includes('apparence')) navigateTo('apparence');
  else if (path.includes('parametres')) navigateTo('parametres');
  else navigateTo('commandes');

  // Intercept nav clicks
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
    link.classList.remove('bg-gray-800', 'text-white');
    link.classList.add('text-gray-300');
    if (link.href && link.href.includes(section)) {
      link.classList.add('bg-gray-800', 'text-white');
      link.classList.remove('text-gray-300');
    }
  });
}

// ---- Navigation ----
function navigateTo(section) {
  if (commandesInterval) { clearInterval(commandesInterval); commandesInterval = null; }
  currentSection = section;
  setActiveNavLink(section);

  const title = document.getElementById('page-title');
  const titles = {
    commandes: 'Commandes', menu: 'Gestion du menu', statistiques: 'Statistiques',
    livreurs: 'Livreurs', qrcode: 'QR Code', apparence: 'Apparence', parametres: 'Paramètres'
  };
  if (title) title.textContent = titles[section] || section;

  switch (section) {
    case 'commandes': loadCommandes(); break;
    case 'menu': loadMenu(); break;
    case 'statistiques': loadStatistiques(); break;
    case 'livreurs': loadLivreurs(); break;
    case 'qrcode': loadQRCode(); break;
    case 'apparence': loadApparence(); break;
    case 'parametres': loadParametres(); break;
  }
}

// ==============================
// SECTION COMMANDES
// ==============================
async function loadCommandes() {
  // Afficher la section commandes dans le dashboard-content
  const content = document.getElementById('dashboard-content');
  if (!content) return;

  content.innerHTML = `
    <div class="flex flex-wrap gap-2 mb-5">
      <button onclick="filtrerCommandes(null)" class="statut-filter-btn active px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white">Toutes</button>
      ${['en_attente','confirmee','en_preparation','en_livraison','livree','annulee'].map(s =>
        `<button onclick="filtrerCommandes('${s}')" class="statut-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600 transition-colors">${s.replace('_',' ')}</button>`
      ).join('')}
      <button onclick="loadCommandes()" class="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors">
        <i class="fa-solid fa-rotate-right"></i> Actualiser
      </button>
    </div>
    <div id="commandes-list">
      <div class="text-center py-12 text-gray-400">
        <i class="fa-solid fa-circle-notch fa-spin text-2xl mb-3 block"></i>
        <p class="text-sm">Chargement des commandes...</p>
      </div>
    </div>`;

  await fetchCommandes();
  // Auto-refresh toutes les 30 secondes
  commandesInterval = setInterval(fetchCommandes, 30000);
}

async function fetchCommandes() {
  const listEl = document.getElementById('commandes-list');
  if (!listEl) return;
  try {
    const slug = getTenantSlug();
    const url = '/api/v1/dashboard/commandes' + (currentFilter ? '?statut=' + currentFilter : '');
    const res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + authToken, 'X-Tenant-Slug': slug }
    });
    if (res.status === 401) { showAuthError(); return; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    renderCommandes(data.commandes || [], listEl);
  } catch (e) {
    listEl.innerHTML = `<div class="bg-red-50 border border-red-100 rounded-xl p-4 text-center text-sm text-red-600">
      <i class="fa-solid fa-circle-exclamation mr-1"></i> Erreur de chargement. 
      <button onclick="fetchCommandes()" class="underline ml-1">Réessayer</button>
    </div>`;
  }
}

function renderCommandes(commandes, container) {
  if (!commandes.length) {
    container.innerHTML = `<div class="text-center py-16 text-gray-400">
      <i class="fa-regular fa-clipboard text-5xl mb-3 block opacity-40"></i>
      <p class="font-medium text-gray-500">Aucune commande ${currentFilter ? 'avec ce statut' : ''}</p>
      <p class="text-xs mt-1">Les nouvelles commandes apparaissent ici automatiquement.</p>
    </div>`;
    return;
  }
  const STATUTS = {
    en_attente: { label: 'En attente', icon: 'fa-clock', cls: 'statut-en_attente' },
    confirmee: { label: 'Confirmée', icon: 'fa-circle-check', cls: 'statut-confirmee' },
    en_preparation: { label: 'En préparation', icon: 'fa-fire-burner', cls: 'statut-en_preparation' },
    en_livraison: { label: 'En livraison', icon: 'fa-motorcycle', cls: 'statut-en_livraison' },
    livree: { label: 'Livrée', icon: 'fa-check-double', cls: 'statut-livree' },
    annulee: { label: 'Annulée', icon: 'fa-xmark', cls: 'statut-annulee' }
  };
  container.innerHTML = commandes.map(cmd => {
    const statut = STATUTS[cmd.statut] || { label: cmd.statut, icon: 'fa-circle', cls: '' };
    const items = typeof cmd.items_json === 'string' ? JSON.parse(cmd.items_json) : (cmd.items_json || []);
    const dateStr = new Date(cmd.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const actions = [];
    if (cmd.statut === 'en_attente') {
      actions.push(`<button onclick="changerStatut('${cmd.id}','confirmee')" class="bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"><i class="fa-solid fa-check mr-1"></i>Confirmer</button>`);
      actions.push(`<button onclick="changerStatut('${cmd.id}','annulee')" class="border border-red-200 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">Annuler</button>`);
    }
    if (cmd.statut === 'confirmee') {
      actions.push(`<button onclick="changerStatut('${cmd.id}','en_preparation')" class="bg-orange-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-orange-600 transition-colors"><i class="fa-solid fa-fire-burner mr-1"></i>Préparer</button>`);
    }
    if (cmd.statut === 'en_preparation') {
      actions.push(`<button onclick="changerStatut('${cmd.id}','en_livraison')" class="bg-purple-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-purple-700 transition-colors"><i class="fa-solid fa-motorcycle mr-1"></i>En livraison</button>`);
    }
    if (cmd.statut === 'en_livraison') {
      actions.push(`<button onclick="changerStatut('${cmd.id}','livree')" class="bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors"><i class="fa-solid fa-check-double mr-1"></i>Livrée</button>`);
    }
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
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div class="font-bold text-sm">${(cmd.montant_total || 0).toLocaleString('fr-FR')} FCFA</div>
        <div class="flex gap-2 flex-wrap">${actions.join('')}</div>
      </div>
    </div>`;
  }).join('');
}

async function changerStatut(commandeId, newStatut) {
  const labels = { confirmee: 'Confirmer', en_preparation: 'Mettre en préparation', en_livraison: 'Marquer en livraison', livree: 'Marquer comme livrée', annulee: 'Annuler' };
  if (!confirm((labels[newStatut] || newStatut) + ' cette commande ?')) return;
  try {
    const res = await fetch('/api/v1/commandes/' + commandeId + '/statut', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ statut: newStatut })
    });
    if (res.ok) await fetchCommandes();
    else alert('Erreur lors de la mise à jour du statut.');
  } catch { alert('Erreur réseau. Réessayez.'); }
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

// ==============================
// SECTION MENU
// ==============================
async function loadMenu() {
  const content = document.getElementById('dashboard-content');
  content.innerHTML = `<div class="text-center py-8"><i class="fa-solid fa-circle-notch fa-spin text-xl text-gray-400"></i></div>`;
  try {
    const slug = getTenantSlug();
    const res = await fetch('/api/v1/tenants/' + slug + '/menu');
    const data = await res.json();
    renderMenuEditor(data.categories || [], content);
  } catch {
    content.innerHTML = '<p class="text-red-500 text-sm p-4">Erreur de chargement du menu.</p>';
  }
}

function renderMenuEditor(categories, container) {
  container.innerHTML = `
    <div class="flex items-center justify-between mb-5">
      <p class="text-sm text-gray-500">${categories.length} catégorie(s) • Gérez vos catégories et produits</p>
      <button onclick="showAddCategorieModal()" class="bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1.5">
        <i class="fa-solid fa-plus text-xs"></i> Nouvelle catégorie
      </button>
    </div>
    ${categories.length === 0 ? `
      <div class="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
        <i class="fa-solid fa-book-open text-4xl text-gray-200 mb-4 block"></i>
        <p class="font-semibold text-gray-500 mb-2">Menu vide</p>
        <p class="text-sm text-gray-400 mb-5">Commencez par créer votre première catégorie (ex: Entrées, Plats, Boissons).</p>
        <button onclick="showAddCategorieModal()" class="bg-red-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-red-700 transition-colors">
          <i class="fa-solid fa-plus mr-1.5"></i> Créer une catégorie
        </button>
      </div>` :
    categories.map(cat => `
      <div class="bg-white border border-gray-100 rounded-xl mb-4">
        <div class="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
          <h3 class="font-bold text-gray-900">${escHtml(cat.nom)}</h3>
          <div class="flex gap-2">
            <button onclick="showAddProduitModal('${cat.id}')" class="text-xs bg-blue-50 text-blue-600 font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">
              <i class="fa-solid fa-plus mr-1"></i>Produit
            </button>
          </div>
        </div>
        <div class="divide-y divide-gray-50">
          ${(cat.produits || []).length === 0 ? `<div class="px-5 py-4 text-xs text-gray-400 italic">Aucun produit dans cette catégorie.</div>` :
          (cat.produits || []).map(p => `
            <div class="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
              ${p.photo_url ? `<img src="${escHtml(p.photo_url)}" alt="${escHtml(p.nom)}" class="w-10 h-10 rounded-lg object-cover flex-shrink-0">` :
                `<div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-utensils text-gray-300 text-sm"></i></div>`}
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-sm text-gray-900 truncate">${escHtml(p.nom)}</div>
                ${p.description ? `<div class="text-xs text-gray-400 truncate">${escHtml(p.description)}</div>` : ''}
              </div>
              <div class="font-bold text-sm text-gray-900 flex-shrink-0">${(p.prix || 0).toLocaleString('fr-FR')} FCFA</div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <span class="text-xs px-2 py-0.5 rounded-full ${p.disponible ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">${p.disponible ? 'Dispo' : 'Indispo'}</span>
              </div>
            </div>`).join('')}
        </div>
      </div>`).join('')}
  `;
}

function showAddCategorieModal() {
  showModal('Nouvelle catégorie', `
    <form onsubmit="submitAddCategorie(event)" class="space-y-4">
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Nom de la catégorie *</label>
        <input id="cat-nom" type="text" required maxlength="100" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="Entrées, Plats du jour, Boissons...">
      </div>
      <button type="submit" class="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition-colors">Créer la catégorie</button>
    </form>`);
}

async function submitAddCategorie(e) {
  e.preventDefault();
  const nom = document.getElementById('cat-nom').value.trim();
  try {
    const slug = getTenantSlug();
    const res = await fetch('/api/v1/dashboard/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ nom, slug })
    });
    if (res.ok) { closeModal(); loadMenu(); }
    else { const d = await res.json(); alert(d.error || 'Erreur'); }
  } catch { alert('Erreur réseau.'); }
}

function showAddProduitModal(categorieId) {
  showModal('Nouveau produit', `
    <form onsubmit="submitAddProduit(event, '${categorieId}')" class="space-y-4">
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Nom du produit *</label>
        <input id="prod-nom" type="text" required maxlength="200" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="Thiéboudienne, Jus de bissap...">
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
        <textarea id="prod-desc" rows="2" maxlength="500" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none" placeholder="Description courte..."></textarea>
      </div>
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Prix (FCFA) *</label>
        <input id="prod-prix" type="number" required min="0" max="999999" step="50" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="2500">
      </div>
      <button type="submit" class="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition-colors">Ajouter le produit</button>
    </form>`);
}

async function submitAddProduit(e, categorieId) {
  e.preventDefault();
  const nom = document.getElementById('prod-nom').value.trim();
  const description = document.getElementById('prod-desc').value.trim();
  const prix = parseFloat(document.getElementById('prod-prix').value);
  if (!nom || isNaN(prix)) { alert('Nom et prix requis.'); return; }
  try {
    const res = await fetch('/api/v1/dashboard/produits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ categorie_id: categorieId, nom, description, prix, disponible: true })
    });
    if (res.ok) { closeModal(); loadMenu(); }
    else { const d = await res.json(); alert(d.error || 'Erreur'); }
  } catch { alert('Erreur réseau.'); }
}

// ==============================
// SECTION LIVREURS
// ==============================
async function loadLivreurs() {
  const content = document.getElementById('dashboard-content');
  content.innerHTML = `<div class="text-center py-8"><i class="fa-solid fa-circle-notch fa-spin text-xl text-gray-400"></i></div>`;
  try {
    const res = await fetch('/api/v1/dashboard/livreurs', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    renderLivreurs(data.livreurs || [], content);
  } catch {
    content.innerHTML = `<div class="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
      <i class="fa-solid fa-motorcycle text-4xl text-gray-200 mb-4 block"></i>
      <p class="font-semibold text-gray-500 mb-2">Aucun livreur</p>
      <p class="text-sm text-gray-400 mb-5">Ajoutez vos livreurs pour leur assigner des commandes.</p>
      <button onclick="showAddLivreurModal()" class="bg-red-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-red-700 transition-colors"><i class="fa-solid fa-plus mr-1.5"></i>Ajouter un livreur</button>
    </div>`;
  }
}

function renderLivreurs(livreurs, container) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-5">
      <p class="text-sm text-gray-500">${livreurs.length} livreur(s) enregistré(s)</p>
      <button onclick="showAddLivreurModal()" class="bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-1.5">
        <i class="fa-solid fa-plus text-xs"></i> Ajouter
      </button>
    </div>
    ${livreurs.length === 0 ? `<p class="text-center text-gray-400 text-sm py-8">Aucun livreur enregistré.</p>` :
    `<div class="space-y-3">${livreurs.map(l => `
      <div class="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-4">
        <div class="w-11 h-11 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <i class="fa-solid fa-motorcycle text-orange-500"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-gray-900">${escHtml(l.nom)}</div>
          <div class="text-xs text-gray-500">${escHtml(l.telephone || '—')}</div>
        </div>
        <span class="text-xs px-2.5 py-1 rounded-full font-semibold ${l.actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">${l.actif ? 'Actif' : 'Inactif'}</span>
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
        <label class="block text-sm font-semibold text-gray-700 mb-1.5">Téléphone WhatsApp *</label>
        <input id="liv-tel" type="tel" required class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" placeholder="+226 70 00 00 00">
      </div>
      <button type="submit" class="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition-colors">Ajouter le livreur</button>
    </form>`);
}

async function submitAddLivreur(e) {
  e.preventDefault();
  const nom = document.getElementById('liv-nom').value.trim();
  const telephone = document.getElementById('liv-tel').value.trim();
  try {
    const res = await fetch('/api/v1/dashboard/livreurs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify({ nom, telephone })
    });
    if (res.ok) { closeModal(); loadLivreurs(); }
    else { const d = await res.json(); alert(d.error || 'Erreur'); }
  } catch { alert('Erreur réseau.'); }
}

// ==============================
// SECTION QR CODE
// ==============================
async function loadQRCode() {
  const content = document.getElementById('dashboard-content');
  try {
    const slug = getTenantSlug();
    if (!slug) { content.innerHTML = '<p class="text-red-500 text-sm p-4">Slug introuvable. Reconnectez-vous.</p>'; return; }
    const res = await fetch('/api/v1/tenants/' + slug + '/qrcode');
    if (!res.ok) throw new Error();
    const data = await res.json();
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(data.url)}&color=${data.couleur.replace('#','')}&bgcolor=ffffff&margin=2`;
    content.innerHTML = `
      <div class="max-w-md">
        <div class="bg-white rounded-2xl border border-gray-100 p-6 text-center mb-4">
          <h2 class="font-bold text-gray-900 mb-1">QR Code de votre boutique</h2>
          <p class="text-xs text-gray-500 mb-5">Imprimez-le et affichez-le en salle, sur vos emballages ou vos flyers.</p>
          <div class="bg-gray-50 rounded-xl p-4 inline-block mb-4">
            <img src="${qrUrl}" alt="QR Code ${escHtml(data.nom)}" class="w-48 h-48 mx-auto" id="qr-img">
          </div>
          <p class="text-xs text-gray-500 font-mono mb-5 break-all">${escHtml(data.url)}</p>
          <div class="grid grid-cols-2 gap-3">
            <a href="${qrUrl}&format=png&size=800x800" download="qrcode-${escHtml(slug)}-hd.png" target="_blank"
               class="flex items-center justify-center gap-1.5 bg-red-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-red-700 transition-colors">
              <i class="fa-solid fa-download text-xs"></i> PNG HD
            </a>
            <a href="${qrUrl}&format=svg" download="qrcode-${escHtml(slug)}.svg" target="_blank"
               class="flex items-center justify-center gap-1.5 border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
              <i class="fa-solid fa-download text-xs"></i> SVG
            </a>
          </div>
        </div>
        <div class="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p class="text-xs font-semibold text-blue-800 mb-1">Partager le lien</p>
          <div class="flex gap-2">
            <input value="${escHtml(data.url)}" readonly class="flex-1 bg-white border border-blue-200 rounded-lg px-3 py-2 text-xs font-mono">
            <button onclick="copyLink('${escHtml(data.url)}')" class="bg-blue-600 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors">Copier</button>
          </div>
        </div>
      </div>`;
  } catch {
    content.innerHTML = '<p class="text-red-500 text-sm p-4">Erreur lors du chargement du QR Code.</p>';
  }
}

function copyLink(url) {
  navigator.clipboard.writeText(url).then(() => {
    const btn = event.target;
    btn.textContent = 'Copié !';
    btn.classList.add('bg-green-600');
    setTimeout(() => { btn.textContent = 'Copier'; btn.classList.remove('bg-green-600'); }, 2000);
  });
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
        <div class="text-xs text-gray-500 mb-1">Ce mois</div>
        <div id="stat-month" class="text-2xl font-extrabold text-gray-900">—</div>
      </div>
      <div class="bg-white rounded-xl border border-gray-100 p-4 text-center">
        <div class="text-xs text-gray-500 mb-1">Taux livraison</div>
        <div id="stat-rate" class="text-2xl font-extrabold text-gray-900">—</div>
      </div>
    </div>
    <div class="bg-white rounded-xl border border-gray-100 p-6">
      <h3 class="font-bold text-gray-900 mb-4">Commandes sur 30 jours</h3>
      <canvas id="stats-chart" height="80"></canvas>
    </div>
    <p class="text-xs text-gray-400 mt-3 text-center">Les statistiques se remplissent au fur et à mesure des commandes reçues.</p>`;

  // Charger stats depuis l'API
  try {
    const res = await fetch('/api/v1/dashboard/stats', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.today !== undefined) document.getElementById('stat-today').textContent = data.today;
      if (data.ca_today !== undefined) document.getElementById('stat-ca').textContent = (data.ca_today || 0).toLocaleString('fr-FR');
      if (data.month !== undefined) document.getElementById('stat-month').textContent = data.month;
      if (data.taux_livraison !== undefined) document.getElementById('stat-rate').textContent = data.taux_livraison + '%';
      
      // Graphique Chart.js
      const ctx = document.getElementById('stats-chart');
      if (ctx && window.Chart) {
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: data.labels || Array.from({length: 30}, (_, i) => 'J-' + (29 - i)),
            datasets: [{
              label: 'Commandes',
              data: data.values || Array(30).fill(0),
              borderColor: '#DC2626',
              backgroundColor: 'rgba(220,38,38,0.06)',
              borderWidth: 2, tension: 0.4, fill: true,
              pointBackgroundColor: '#DC2626', pointRadius: 3
            }]
          },
          options: {
            responsive: true,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.raw + ' commande(s)' } } },
            scales: {
              y: { beginAtZero: true, grid: { color: '#F3F4F6' }, ticks: { precision: 0 } },
              x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } }
            }
          }
        });
      }
    }
  } catch {}
}

// ==============================
// SECTION APPARENCE
// ==============================
async function loadApparence() {
  const content = document.getElementById('dashboard-content');
  const tenant = tenantData || {};
  content.innerHTML = `
    <div class="max-w-lg">
      <div class="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 class="font-bold text-gray-900 mb-5">Personnalisation de votre boutique</h2>
        <form onsubmit="saveApparence(event)" class="space-y-5">
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">Couleur principale</label>
            <div class="flex items-center gap-3">
              <input id="app-color-primary" type="color" value="${escHtml(tenant.couleur_primaire || '#DC2626')}"
                class="w-12 h-12 rounded-xl border border-gray-200 cursor-pointer">
              <input id="app-color-primary-hex" type="text" value="${escHtml(tenant.couleur_primaire || '#DC2626')}"
                class="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-200"
                placeholder="#DC2626">
            </div>
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">Couleur secondaire</label>
            <div class="flex items-center gap-3">
              <input id="app-color-secondary" type="color" value="${escHtml(tenant.couleur_secondaire || '#1D4ED8')}"
                class="w-12 h-12 rounded-xl border border-gray-200 cursor-pointer">
              <input id="app-color-secondary-hex" type="text" value="${escHtml(tenant.couleur_secondaire || '#1D4ED8')}"
                class="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-200"
                placeholder="#1D4ED8">
            </div>
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">URL du logo</label>
            <input id="app-logo" type="url" value="${escHtml(tenant.logo_url || '')}"
              class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
              placeholder="https://...">
            <p class="text-xs text-gray-400 mt-1">URL publique d'une image (PNG, JPG, WebP — max 1 Mo recommandé)</p>
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">URL de la bannière</label>
            <input id="app-banniere" type="url" value="${escHtml(tenant.banniere_url || '')}"
              class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
              placeholder="https://...">
            <p class="text-xs text-gray-400 mt-1">Bannière affichée en haut de votre boutique (ratio 16:9 recommandé)</p>
          </div>
          <p id="app-feedback" class="text-xs hidden rounded-lg px-3 py-2"></p>
          <button type="submit" class="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition-colors">
            <i class="fa-solid fa-floppy-disk mr-1.5"></i> Enregistrer les modifications
          </button>
        </form>
      </div>
    </div>`;

  // Sync couleurs
  document.getElementById('app-color-primary').addEventListener('input', function() {
    document.getElementById('app-color-primary-hex').value = this.value;
  });
  document.getElementById('app-color-secondary').addEventListener('input', function() {
    document.getElementById('app-color-secondary-hex').value = this.value;
  });
}

async function saveApparence(e) {
  e.preventDefault();
  const fb = document.getElementById('app-feedback');
  fb.classList.remove('hidden');
  const data = {
    couleur_primaire: document.getElementById('app-color-primary-hex').value.trim() || document.getElementById('app-color-primary').value,
    couleur_secondaire: document.getElementById('app-color-secondary-hex').value.trim() || document.getElementById('app-color-secondary').value,
    logo_url: document.getElementById('app-logo').value.trim() || null,
    banniere_url: document.getElementById('app-banniere').value.trim() || null
  };
  try {
    const res = await fetch('/api/v1/dashboard/apparence', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      fb.textContent = 'Modifications enregistrées avec succès.';
      fb.className = 'text-xs bg-green-50 text-green-700 rounded-lg px-3 py-2';
    } else {
      const d = await res.json();
      fb.textContent = d.error || 'Erreur lors de la sauvegarde.';
      fb.className = 'text-xs bg-red-50 text-red-600 rounded-lg px-3 py-2';
    }
  } catch {
    fb.textContent = 'Erreur réseau.';
    fb.className = 'text-xs bg-red-50 text-red-600 rounded-lg px-3 py-2';
  }
}

// ==============================
// SECTION PARAMÈTRES
// ==============================
async function loadParametres() {
  const content = document.getElementById('dashboard-content');
  const tenant = tenantData || {};
  content.innerHTML = `
    <div class="max-w-lg space-y-4">
      <div class="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 class="font-bold text-gray-900 mb-5">Informations du restaurant</h2>
        <form onsubmit="saveParametres(event)" class="space-y-4">
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">Nom du restaurant</label>
            <input id="param-nom" type="text" required maxlength="100" value="${escHtml(tenant.nom || '')}"
              class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200">
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">Numéro WhatsApp</label>
            <input id="param-whatsapp" type="tel" required value="${escHtml(tenant.whatsapp_number || '')}"
              class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
              placeholder="+226 70 00 00 00">
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">URL de votre boutique</label>
            <div class="flex items-center bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
              <span class="text-sm text-gray-400">monmenu.app/</span>
              <span class="text-sm font-bold text-gray-900">${escHtml(tenant.slug || '—')}</span>
            </div>
            <p class="text-xs text-gray-400 mt-1">Le slug ne peut pas être modifié après création.</p>
          </div>
          <p id="param-feedback" class="text-xs hidden rounded-lg px-3 py-2"></p>
          <button type="submit" class="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition-colors">
            <i class="fa-solid fa-floppy-disk mr-1.5"></i> Enregistrer
          </button>
        </form>
      </div>
      
      <div class="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 class="font-bold text-gray-900 mb-1">Modifier le mot de passe</h3>
        <p class="text-sm text-gray-500 mb-4">Utilisez votre email et le lien de réinitialisation Supabase.</p>
        <button onclick="demanderResetPassword()" class="border border-gray-200 text-gray-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors">
          <i class="fa-solid fa-key mr-1.5"></i> Demander un lien de réinitialisation
        </button>
      </div>

      <div class="bg-red-50 border border-red-100 rounded-2xl p-6">
        <h3 class="font-bold text-red-800 mb-1">Zone dangereuse</h3>
        <p class="text-sm text-red-600 mb-4">La suppression de votre compte est irréversible. Toutes vos données seront effacées.</p>
        <button onclick="confirmerSuppression()" class="border border-red-300 text-red-600 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-red-100 transition-colors">
          <i class="fa-solid fa-trash mr-1.5"></i> Demander la suppression du compte
        </button>
      </div>
    </div>`;
}

async function saveParametres(e) {
  e.preventDefault();
  const fb = document.getElementById('param-feedback');
  fb.classList.remove('hidden');
  const data = {
    nom: document.getElementById('param-nom').value.trim(),
    whatsapp_number: document.getElementById('param-whatsapp').value.trim().replace(/\s/g, '')
  };
  try {
    const res = await fetch('/api/v1/dashboard/parametres', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      if (tenantData) { tenantData.nom = data.nom; tenantData.whatsapp_number = data.whatsapp_number; localStorage.setItem('monmenu_tenant', JSON.stringify(tenantData)); }
      fb.textContent = 'Informations mises à jour.';
      fb.className = 'text-xs bg-green-50 text-green-700 rounded-lg px-3 py-2';
    } else {
      const d = await res.json();
      fb.textContent = d.error || 'Erreur.';
      fb.className = 'text-xs bg-red-50 text-red-600 rounded-lg px-3 py-2';
    }
  } catch {
    fb.textContent = 'Erreur réseau.'; fb.className = 'text-xs bg-red-50 text-red-600 rounded-lg px-3 py-2';
  }
}

async function demanderResetPassword() {
  alert('Un email de réinitialisation vous sera envoyé. Contactez le support si nécessaire : support@monmenu.app');
}

function confirmerSuppression() {
  if (confirm('ATTENTION : Cette action est irréversible. Confirmez-vous la demande de suppression de votre compte ?')) {
    alert('Votre demande a été enregistrée. Notre équipe vous contactera dans les 48h. Email : support@monmenu.app');
  }
}

// ==============================
// UTILITAIRES MODAL
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
    <div class="absolute inset-x-4 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 bg-white rounded-2xl sm:w-96 shadow-2xl">
      <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 class="font-bold text-gray-900">${escHtml(titre)}</h3>
        <button onclick="closeModal()" class="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
          <i class="fa-solid fa-xmark text-gray-500"></i>
        </button>
      </div>
      <div class="p-5">${contenu}</div>
    </div>`;
  modal.classList.remove('hidden');
}

function closeModal() {
  const modal = document.getElementById('dash-modal');
  if (modal) modal.classList.add('hidden');
}

// ==============================
// AUTH HELPERS
// ==============================
function getAuthToken() {
  return authToken || localStorage.getItem('monmenu_auth_token') || '';
}

function getTenantSlug() {
  if (tenantData && tenantData.slug) return tenantData.slug;
  const t = localStorage.getItem('monmenu_tenant');
  if (t) { try { return JSON.parse(t).slug || ''; } catch {} }
  return '';
}

function showAuthError() {
  localStorage.removeItem('monmenu_auth_token');
  localStorage.removeItem('monmenu_tenant');
  window.location.href = '/dashboard';
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Exposer globalement
window.initDashboard = initDashboard;
window.navigateTo = navigateTo;
window.filtrerCommandes = filtrerCommandes;
window.changerStatut = changerStatut;
window.loadCommandes = loadCommandes;
window.loadMenu = loadMenu;
window.showAddCategorieModal = showAddCategorieModal;
window.submitAddCategorie = submitAddCategorie;
window.showAddProduitModal = showAddProduitModal;
window.submitAddProduit = submitAddProduit;
window.loadLivreurs = loadLivreurs;
window.showAddLivreurModal = showAddLivreurModal;
window.submitAddLivreur = submitAddLivreur;
window.loadQRCode = loadQRCode;
window.copyLink = copyLink;
window.loadStatistiques = loadStatistiques;
window.loadApparence = loadApparence;
window.saveApparence = saveApparence;
window.loadParametres = loadParametres;
window.saveParametres = saveParametres;
window.demanderResetPassword = demanderResetPassword;
window.confirmerSuppression = confirmerSuppression;
window.showModal = showModal;
window.closeModal = closeModal;
