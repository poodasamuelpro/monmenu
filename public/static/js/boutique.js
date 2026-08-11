// MonMenu — Boutique restaurant (JS côté client)
// v1.4.0 — AJOUT : suppléments proposés à l'ajout au panier.
//
// Chaque produit peut désormais porter un tableau `supplements` (renvoyé
// par GET /api/v1/tenants/:slug/menu). Si le produit a au moins un
// supplément actif, un clic sur "+" ouvre une modal de sélection au lieu
// d'ajouter directement au panier — comportement inchangé pour les
// produits SANS supplément (ajout direct, comme avant).
//
// Chaque combinaison produit + suppléments distincts devient une ligne de
// panier séparée (ex: "Pizza + Fromage" et "Pizza" simple sont deux
// lignes distinctes), pour ne jamais fusionner par erreur des choix
// différents. Au moment de la commande, seuls les IDs de suppléments sont
// envoyés au serveur — jamais leur prix (recalculé côté serveur, voir
// api-commandes.ts).
'use strict';

let tenantId = '';
let tenantSlug = '';
let cart = { items: [], tenant_id: '', slug: '' };
let tenantData = null;
let menuData = null;
let pdvData = null;
let fraisLivraison = 0;
let clientLat = null;
let clientLon = null;

let boutiqueOuverte = true;
let _statutIntervalId = null;

let _suiviIntervalId = null;

// Registre des produits (utilisé par renderProduitCard() pour retrouver
// les infos produit — y compris ses suppléments — lors d'un clic +/-).
let _produitRegistry = {};

const STATUT_LABELS = {
  en_attente: 'En attente',
  confirmee: 'Confirmée',
  en_preparation: 'En préparation',
  en_livraison: 'En livraison',
  livree: 'Livrée',
  annulee: 'Annulée'
};

let _menuListenerAttache = false;
function attacherEcouteurMenu() {
  if (_menuListenerAttache) return;
  const menuContent = document.getElementById('menu-content');
  if (!menuContent) return;
  menuContent.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const produitId = btn.getAttribute('data-produit-id');
    const action = btn.getAttribute('data-action');
    if (!produitId) return;
    if (action === 'add') {
      if (!boutiqueOuverte) return;
      const produit = _produitRegistry[produitId];
      if (!produit) return;
      // AJOUT — si le produit a des suppléments actifs, ouvrir la modal
      // de sélection au lieu d'ajouter directement au panier.
      if (produit.supplements && produit.supplements.length > 0) {
        ouvrirModalSupplements(produit);
      } else {
        addToCart(produit);
      }
    } else if (action === 'remove') {
      removeFromCart(produitId);
    }
  });
  _menuListenerAttache = true;
}

let livraisonMap = null;
let livraisonMarker = null;

let promoAppliquee = null;

const DEVISE = 'FCFA';

// ---- Init ----
async function initBoutique(tid, slug) {
  tenantId = '';
  tenantSlug = slug;
  loadCart();
  await Promise.all([loadTenant(), loadMenu()]);
  actualiserStatutOuverture();
  renderMenu();
  attacherEcouteurMenu();
  updateCartUI();
  afficherBoutonSuiviSiCommandeRecente();
  observerFooterPourPanierFlottant();
  initBackToTop();

  if (_statutIntervalId) clearInterval(_statutIntervalId);
  _statutIntervalId = setInterval(() => {
    const etaitOuvert = boutiqueOuverte;
    actualiserStatutOuverture();
    if (etaitOuvert !== boutiqueOuverte) {
      renderMenu();
      updateCartUI();
    }
  }, 60000);
}

// ---- Panier (localStorage) ----
function loadCart() {
  try {
    const stored = localStorage.getItem('monmenu_cart_' + tenantSlug);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.updated_at && Date.now() - new Date(parsed.updated_at).getTime() < 86400000) {
        cart = parsed;
      }
    }
  } catch (e) { cart = { items: [], tenant_id: tenantId, slug: tenantSlug }; }
}

function saveCart() {
  cart.updated_at = new Date().toISOString();
  cart.tenant_id = tenantId;
  cart.slug = tenantSlug;
  localStorage.setItem('monmenu_cart_' + tenantSlug, JSON.stringify(cart));
}

function getCartTotal() {
  return cart.items.reduce((sum, item) => sum + (item.prix + (item.prix_supplement || 0)) * item.quantite, 0);
}

function getCartCount() {
  return cart.items.reduce((sum, item) => sum + item.quantite, 0);
}

// ---- Chargement données ----
async function loadTenant() {
  try {
    const res = await fetch('/api/v1/tenants/' + tenantSlug);
    if (res.ok) {
      tenantData = await res.json();
      if (tenantData && tenantData.id) tenantId = tenantData.id;
      if (tenantData && tenantData.pdv_id) {
        pdvData = { id: tenantData.pdv_id, lat: tenantData.pdv_latitude, lon: tenantData.pdv_longitude };
      }
    }
  } catch (e) { console.error('loadTenant', e); }
}

async function loadMenu() {
  try {
    const res = await fetch('/api/v1/tenants/' + tenantSlug + '/menu');
    if (res.ok) menuData = await res.json();
  } catch (e) { console.error('loadMenu', e); }
}

// ---- Statut d'ouverture ----
function estOuvertMaintenant(horaireRaw) {
  if (!horaireRaw) return false;
  let horaires;
  try {
    horaires = typeof horaireRaw === 'string' ? JSON.parse(horaireRaw) : horaireRaw;
  } catch { return false; }
  if (!horaires) return false;

  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const joursEn = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const now = new Date();
  const jourIdx = now.getDay();
  const entry = horaires[jours[jourIdx]] || horaires[joursEn[jourIdx]] || null;
  if (!entry) return false;

  const estOuvertJour = entry.ouvert !== false && entry.open !== false;
  if (!estOuvertJour) return false;

  const debut = entry.debut || entry.start || null;
  const fin = entry.fin || entry.end || null;
  if (!debut || !fin) return true;

  const [hD, mD] = debut.split(':').map(Number);
  const [hF, mF] = fin.split(':').map(Number);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const debutMin = hD * 60 + mD;
  let finMin = hF * 60 + mF;
  if (finMin <= debutMin) finMin += 24 * 60;

  return nowMin >= debutMin && nowMin < finMin;
}

function actualiserStatutOuverture() {
  boutiqueOuverte = tenantData ? estOuvertMaintenant(tenantData.pdv_horaires) : true;

  const badge = document.getElementById('statut-horaire-badge');
  if (badge) {
    badge.classList.toggle('statut-ferme', !boutiqueOuverte);
  }

  const avertissement = document.getElementById('boutique-fermee-avertissement');
  if (avertissement) avertissement.classList.toggle('hidden', boutiqueOuverte);
}

// ---- Rendu menu ----
function renderMenu() {
  const skeleton = document.getElementById('menu-skeleton');
  const menuContent = document.getElementById('menu-content');
  const categoriesNav = document.getElementById('categories-nav');

  if (!menuData || !menuData.categories) {
    if (skeleton) skeleton.innerHTML = '<p class="text-gray-500 text-sm text-center py-8">Menu non disponible</p>';
    return;
  }

  if (categoriesNav) {
    categoriesNav.innerHTML = menuData.categories.map((cat, i) =>
      `<a href="#cat-${cat.id}" data-cat-pill="${cat.id}"
          class="cat-pill whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold transition-colors ${i === 0 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">${escHtml(cat.nom)}</a>`
    ).join('');
    attacherEcouteurCategories();
  }

  let html = '';
  for (const categorie of menuData.categories) {
    html += `<section id="cat-${categorie.id}" class="mb-8 scroll-mt-32">`;
    html += `<h2 class="font-bold text-lg text-gray-900 mb-4 px-0">${escHtml(categorie.nom)}</h2>`;
    if (!categorie.produits || categorie.produits.length === 0) {
      html += `<p class="text-sm text-gray-400 italic px-1">Aucun produit disponible pour le moment.</p>`;
    } else {
      html += `<div class="grid grid-cols-2 gap-3">`;
      for (const produit of categorie.produits) {
        html += renderProduitCard(produit);
      }
      html += '</div>';
    }
    html += '</section>';
  }

  if (menuContent) menuContent.innerHTML = html;
}

let _catListenerAttache = false;
function attacherEcouteurCategories() {
  if (_catListenerAttache) return;
  const nav = document.getElementById('categories-nav');
  if (!nav) return;
  nav.addEventListener('click', (e) => {
    const pill = e.target.closest('[data-cat-pill]');
    if (!pill) return;
    nav.querySelectorAll('.cat-pill').forEach(p => {
      p.classList.remove('bg-gray-900', 'text-white');
      p.classList.add('bg-gray-100', 'text-gray-600');
    });
    pill.classList.remove('bg-gray-100', 'text-gray-600');
    pill.classList.add('bg-gray-900', 'text-white');
  });
  _catListenerAttache = true;
}

// Carte produit — AJOUT : le registre stocke désormais aussi les
// suppléments du produit (utilisés par ouvrirModalSupplements()). Un
// petit badge "+ options" apparaît sur la photo si le produit a des
// suppléments actifs, pour signaler visuellement qu'un choix suivra.
function renderProduitCard(p) {
  const quantiteInCart = getQuantiteInCart(p.id);
  _produitRegistry[p.id] = {
    id: p.id, nom: p.nom, prix: p.prix, photo_url: p.photo_url,
    supplements: p.supplements || []
  };

  let controles;
  if (!boutiqueOuverte) {
    controles = `<span class="absolute top-2 left-2 text-[11px] font-semibold text-white bg-gray-900/80 px-2 py-1 rounded-lg shadow-sm">Fermé</span>`;
  } else if (!p.disponible) {
    controles = `<span class="absolute top-2 left-2 text-[11px] font-semibold text-gray-500 bg-white/90 px-2 py-1 rounded-lg shadow-sm">Indisponible</span>`;
  } else if (quantiteInCart > 0) {
    controles = `
      <div class="absolute bottom-2 right-2 flex items-center gap-1.5 bg-white/95 backdrop-blur rounded-xl shadow-md p-1">
        <button data-action="remove" data-produit-id="${escHtml(p.id)}" class="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors font-bold" aria-label="Retirer">−</button>
        <span class="text-sm font-bold w-4 text-center">${quantiteInCart}</span>
        <button data-action="add" data-produit-id="${escHtml(p.id)}" class="w-7 h-7 rounded-lg flex items-center justify-center text-white transition-colors font-bold" style="background-color:${PRIMARY_COLOR}" aria-label="Ajouter">+</button>
      </div>`;
  } else {
    controles = `
      <button data-action="add" data-produit-id="${escHtml(p.id)}"
        class="absolute bottom-2 right-2 w-9 h-9 rounded-full flex items-center justify-center text-white shadow-md active:scale-95 transition-transform"
        style="background-color:${PRIMARY_COLOR}" aria-label="Ajouter au panier">
        <i class="fa-solid fa-plus text-sm"></i>
      </button>`;
  }

  const aDesSupplements = p.supplements && p.supplements.length > 0;
  const badgeOptions = (aDesSupplements && boutiqueOuverte && p.disponible)
    ? `<span class="absolute top-2 left-2 text-[10px] font-semibold text-white px-2 py-1 rounded-lg shadow-sm" style="background-color:${PRIMARY_COLOR}">+ options</span>`
    : '';

  const assombri = (!p.disponible || !boutiqueOuverte) ? 'opacity-60' : '';

  return `
  <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-full ${assombri}">
    <div class="relative w-full aspect-[4/3] bg-gray-50 overflow-hidden">
      ${p.photo_url
        ? `<img src="${escHtml(p.photo_url)}" alt="${escHtml(p.nom)}" class="w-full h-full object-cover" loading="lazy">`
        : `<div class="w-full h-full flex items-center justify-center"><i class="fa-solid fa-utensils text-3xl text-gray-300"></i></div>`
      }
      ${badgeOptions}
      ${controles}
    </div>
    <div class="p-3 flex flex-col flex-1">
      <div class="font-semibold text-gray-900 text-sm leading-tight">${escHtml(p.nom)}</div>
      ${p.description ? `<div class="text-xs text-gray-500 mt-1 line-clamp-2">${escHtml(p.description)}</div>` : ''}
      <div class="flex items-center justify-between border-t border-gray-100 mt-2 pt-2">
        <span class="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Prix</span>
        <span class="font-bold text-sm" style="color:${PRIMARY_COLOR}">${formatMontant(p.prix)}</span>
      </div>
    </div>
  </div>`;
}

function getQuantiteInCart(produitId) {
  // AJOUT — additionne toutes les lignes de ce produit, quelle que soit
  // la combinaison de suppléments (le badge quantité sur la carte reste
  // un total global, la distinction par supplément vit dans le panier).
  return cart.items
    .filter(i => i.produit_id === produitId)
    .reduce((sum, i) => sum + i.quantite, 0);
}

// ---- Panier actions ----
function addToCart(produit) {
  if (!boutiqueOuverte) return;
  const existing = cart.items.find(i => i.produit_id === produit.id && !i._supKey);
  if (existing) {
    existing.quantite++;
  } else {
    cart.items.push({
      produit_id: produit.id,
      nom: produit.nom,
      prix: produit.prix,
      quantite: 1,
      photo_url: produit.photo_url || null
    });
  }
  saveCart();
  updateCartUI();
  renderMenu();
}

// AJOUT — Variante d'ajout au panier avec suppléments sélectionnés. Une
// ligne panier distincte est créée par combinaison de suppléments
// (identifiée par `_supKey`, la liste triée des IDs), pour ne jamais
// fusionner par erreur "Pizza + Fromage" avec "Pizza" simple ou "Pizza +
// Olives". Si la même combinaison exacte est reprise, la quantité de la
// ligne existante est incrémentée au lieu de dupliquer la ligne.
function addToCartAvecSupplements(produit, supplements) {
  if (!boutiqueOuverte) return;
  const supIds = supplements.map(s => s.supplement_id).sort().join(',');
  const existing = cart.items.find(i => i.produit_id === produit.id && (i._supKey || '') === supIds);
  if (existing) {
    existing.quantite++;
  } else {
    const totalSupplements = supplements.reduce((s, x) => s + x.prix, 0);
    cart.items.push({
      produit_id: produit.id,
      nom: produit.nom,
      prix: produit.prix,
      prix_supplement: totalSupplements,
      supplements: supplements,
      _supKey: supIds,
      quantite: 1,
      photo_url: produit.photo_url || null
    });
  }
  saveCart();
  updateCartUI();
  renderMenu();
}

function removeFromCart(produitId) {
  // Retire en priorité une ligne SANS supplément si elle existe (clic
  // simple sur "-"), sinon la première ligne trouvée pour ce produit —
  // cas rare car le bouton "-" affiché sur la carte produit ne cible que
  // le badge de quantité global ; le détail par ligne se gère depuis le
  // panier (modal) via addToCart/removeFromCart standard sur cette ligne.
  const idx = cart.items.findIndex(i => i.produit_id === produitId && !i._supKey);
  const idxFallback = idx !== -1 ? idx : cart.items.findIndex(i => i.produit_id === produitId);
  const finalIdx = idx !== -1 ? idx : idxFallback;
  if (finalIdx === -1) return;
  if (cart.items[finalIdx].quantite > 1) {
    cart.items[finalIdx].quantite--;
  } else {
    cart.items.splice(finalIdx, 1);
  }
  saveCart();
  updateCartUI();
  renderMenu();
}

function updateCartUI() {
  const count = getCartCount();
  const total = getCartTotal();
  const cartBtn = document.getElementById('cart-btn');
  const cartCount = document.getElementById('cart-count');
  const cartTotal = document.getElementById('cart-total');
  const cartFermeTag = document.getElementById('cart-ferme-tag');

  if (cartBtn) cartBtn.classList.toggle('hidden', count === 0);
  if (cartCount) cartCount.textContent = count;
  if (cartTotal) cartTotal.textContent = formatMontant(total);
  if (cartFermeTag) cartFermeTag.classList.toggle('hidden', boutiqueOuverte);
}

// ---- AJOUT — Modal de sélection des suppléments ----
function ouvrirModalSupplements(produit) {
  document.getElementById('modal-supplements')?.remove();
  const modal = document.createElement('div');
  modal.id = 'modal-supplements';
  modal.className = 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] overflow-y-auto">
      <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 class="font-bold text-gray-900">${escHtml(produit.nom)}</h2>
        <button onclick="document.getElementById('modal-supplements').remove()" class="text-gray-400 hover:text-gray-700 text-xl font-bold" aria-label="Fermer">&times;</button>
      </div>
      <div class="p-5">
        <p class="text-sm text-gray-500 mb-3">Ajoutez des suppléments (facultatif) :</p>
        <div class="space-y-2 mb-5">
          ${produit.supplements.map(s => `
            <label class="flex items-center justify-between border border-gray-200 rounded-xl px-4 py-3 cursor-pointer hover:border-red-300 has-[:checked]:border-red-500 has-[:checked]:bg-red-50">
              <span class="flex items-center gap-2">
                <input type="checkbox" data-sup-id="${escHtml(s.id)}" data-sup-prix="${s.prix}" data-sup-nom="${escHtml(s.nom)}" class="text-red-600 rounded">
                <span class="text-sm font-medium">${escHtml(s.nom)}</span>
              </span>
              <span class="text-sm font-semibold text-gray-600">+${formatMontant(s.prix)}</span>
            </label>`).join('')}
        </div>
        <button onclick="confirmerAjoutAvecSupplements('${escHtml(produit.id)}')" class="w-full text-white font-bold py-3.5 rounded-xl transition-colors" style="background-color:${PRIMARY_COLOR}">
          Ajouter au panier
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

function confirmerAjoutAvecSupplements(produitId) {
  const produit = _produitRegistry[produitId];
  if (!produit) return;
  const modal = document.getElementById('modal-supplements');
  const checked = modal ? Array.from(modal.querySelectorAll('input[data-sup-id]:checked')) : [];
  const supplements = checked.map(el => ({
    supplement_id: el.getAttribute('data-sup-id'),
    nom: el.getAttribute('data-sup-nom'),
    prix: parseFloat(el.getAttribute('data-sup-prix'))
  }));
  modal?.remove();
  if (supplements.length === 0) {
    addToCart(produit);
  } else {
    addToCartAvecSupplements(produit, supplements);
  }
}

// ---- Suivi de commande ----
function afficherBoutonSuiviSiCommandeRecente() {
  try {
    const raw = localStorage.getItem('monmenu_dernier_suivi_' + tenantSlug);
    if (!raw) return;
    const info = JSON.parse(raw);
    if (!info.url_suivi) return;

    const wrap = document.getElementById('track-order-btn-wrap');
    const btn = document.getElementById('track-order-btn');
    const label = document.getElementById('track-order-label');
    if (btn) btn.href = info.url_suivi;
    if (label) label.textContent = STATUT_LABELS[info.statut] || 'Suivre ma commande';
    if (wrap) wrap.classList.remove('hidden');

    actualiserBadgeSuivi(info.url_suivi);
    if (_suiviIntervalId) clearInterval(_suiviIntervalId);
    _suiviIntervalId = setInterval(() => actualiserBadgeSuivi(info.url_suivi), 30000);
  } catch {}
}

async function actualiserBadgeSuivi(urlSuivi) {
  const token = (urlSuivi || '').split('/').filter(Boolean).pop();
  if (!token) return;
  try {
    const res = await fetch('/api/v1/commandes/suivi/' + token);
    if (!res.ok) return;
    const data = await res.json();
    const statut = data && data.commande ? data.commande.statut : null;
    const label = STATUT_LABELS[statut] || 'Suivre ma commande';
    const labelEl = document.getElementById('track-order-label');
    if (labelEl) labelEl.textContent = label;

    try {
      const raw = localStorage.getItem('monmenu_dernier_suivi_' + tenantSlug);
      if (raw) {
        const info = JSON.parse(raw);
        info.statut = statut;
        localStorage.setItem('monmenu_dernier_suivi_' + tenantSlug, JSON.stringify(info));
      }
    } catch {}
  } catch {}
}

function observerFooterPourPanierFlottant() {
  const footer = document.querySelector('footer');
  const cartBtn = document.getElementById('cart-btn');
  const trackWrap = document.getElementById('track-order-btn-wrap');
  if (!footer || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (cartBtn) cartBtn.classList.toggle('cart-btn-masque', entry.isIntersecting);
      if (trackWrap) trackWrap.classList.toggle('cart-btn-masque', entry.isIntersecting);
    });
  }, { threshold: 0.05 });
  observer.observe(footer);
}

// ---- Retour en haut de page ----
function initBackToTop() {
  const btn = document.getElementById('back-to-top-btn');
  if (!btn) return;
  const onScroll = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const pctScrolled = scrollable > 0 ? scrollTop / scrollable : 0;
    btn.classList.toggle('visible', pctScrolled > 0.75);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---- Modals panier/checkout ----
function openCart() {
  renderCartModal();
  document.getElementById('cart-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  document.getElementById('cart-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

// AJOUT — chaque ligne de panier affiche désormais ses suppléments choisis
// (le cas échéant) sous le nom du produit.
function renderCartModal() {
  const itemsEl = document.getElementById('cart-items');
  const footerEl = document.getElementById('cart-footer');
  if (!itemsEl || !footerEl) return;

  if (cart.items.length === 0) {
    itemsEl.innerHTML = '<div class="text-center py-8 text-gray-400"><i class="fa-solid fa-basket-shopping text-3xl mb-3 block"></i><p class="text-sm">Votre panier est vide</p></div>';
    footerEl.innerHTML = '';
    return;
  }

  itemsEl.innerHTML = cart.items.map((item, idx) => `
    <div class="flex items-center gap-3 py-3">
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-sm text-gray-900">${escHtml(item.nom)}</div>
        ${item.supplements && item.supplements.length ? `<div class="text-xs text-gray-400 truncate">+ ${item.supplements.map(s => escHtml(s.nom)).join(', ')}</div>` : ''}
        <div class="text-xs text-gray-500">${formatMontant(item.prix + (item.prix_supplement||0))} l'unité</div>
      </div>
      <div class="flex items-center gap-2 bg-gray-50 rounded-xl p-1">
        <button data-cart-action="remove" data-cart-idx="${idx}" class="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-200 font-bold">−</button>
        <span class="text-sm font-bold w-6 text-center">${item.quantite}</span>
        <button data-cart-action="add" data-cart-idx="${idx}" class="w-7 h-7 rounded-xl flex items-center justify-center text-white font-bold" style="background-color:${PRIMARY_COLOR}">+</button>
      </div>
      <div class="text-sm font-bold w-20 text-right">${formatMontant((item.prix + (item.prix_supplement||0)) * item.quantite)}</div>
    </div>
  `).join('');

  itemsEl.querySelectorAll('[data-cart-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!boutiqueOuverte) return;
      const idx = parseInt(btn.getAttribute('data-cart-idx'), 10);
      const action = btn.getAttribute('data-cart-action');
      const item = cart.items[idx];
      if (!item) return;
      if (action === 'add') {
        item.quantite++;
      } else {
        if (item.quantite > 1) item.quantite--;
        else cart.items.splice(idx, 1);
      }
      saveCart();
      renderCartModal();
      updateCartUI();
      renderMenu();
    });
  });

  const total = getCartTotal();
  const boutonDesactive = !boutiqueOuverte;
  footerEl.innerHTML = `
    <div class="flex justify-between font-bold text-base mb-3">
      <span>Total articles</span>
      <span>${formatMontant(total)}</span>
    </div>
    ${!boutiqueOuverte ? `<p class="text-xs text-center text-red-600 font-medium mb-2"><i class="fa-solid fa-circle-exclamation mr-1"></i>Le restaurant est actuellement fermé — la commande ne peut pas être finalisée.</p>` : ''}
    <button ${boutonDesactive ? 'disabled' : ''} onclick="closeCart(); openCheckout();" class="w-full text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 ${boutonDesactive ? 'opacity-50 cursor-not-allowed' : ''}" style="background-color:${PRIMARY_COLOR}">
      <i class="fa-solid fa-arrow-right"></i> Passer à la commande
    </button>
  `;
}

function openCheckout() {
  if (!boutiqueOuverte) {
    alert('Le restaurant est actuellement fermé. Vous pourrez commander pendant ses horaires d\'ouverture.');
    return;
  }
  promoAppliquee = null;
  _resetPromoUI();
  updateCheckoutRecap();
  document.getElementById('checkout-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  document.querySelectorAll('input[name="livraison-type"]').forEach(radio => {
    radio.addEventListener('change', onLivraisonTypeChange);
  });
  const isLivraison = document.querySelector('input[name="livraison-type"]:checked')?.value === 'livraison';
  mettreAJourEtatSubmit();
  if (isLivraison) {
    setTimeout(() => initCartelivraison(), 200);
    if (clientLat === null || clientLon === null) {
      setTimeout(() => geolocaliser(), 300);
    } else {
      calculerFraisLivraison();
    }
  }
}

function closeCheckout() {
  document.getElementById('checkout-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

function onLivraisonTypeChange() {
  const isLivraison = document.querySelector('input[name="livraison-type"]:checked')?.value === 'livraison';
  const mapSection = document.getElementById('map-section');
  if (mapSection) mapSection.style.display = isLivraison ? 'block' : 'none';

  if (isLivraison) {
    setTimeout(() => initCartelivraison(), 100);
    if (clientLat === null || clientLon === null) {
      setTimeout(() => geolocaliser(), 200);
    }
  } else {
    fraisLivraison = 0;
  }
  mettreAJourEtatSubmit();
  updateCheckoutRecap();
}

function mettreAJourEtatSubmit() {
  const submitBtn = document.getElementById('submit-btn');
  const hintEl = document.getElementById('position-manquante-hint');
  if (!submitBtn) return;

  const isLivraison = document.querySelector('input[name="livraison-type"]:checked')?.value === 'livraison';
  const positionManquante = isLivraison && (clientLat === null || clientLon === null);

  submitBtn.disabled = positionManquante;
  submitBtn.classList.toggle('opacity-50', positionManquante);
  submitBtn.classList.toggle('cursor-not-allowed', positionManquante);

  if (hintEl) hintEl.classList.toggle('hidden', !positionManquante);
}

// ---- Carte Leaflet interactive ----
function initCartelivraison() {
  const container = document.getElementById('carte-livraison');
  if (!container) return;

  container.innerHTML = '';
  container.style.height = '220px';

  const defaultLat = (pdvData && pdvData.lat) ? pdvData.lat : 12.3647;
  const defaultLon = (pdvData && pdvData.lon) ? pdvData.lon : -1.5321;
  const startLat = clientLat || defaultLat;
  const startLon = clientLon || defaultLon;

  if (!livraisonMap) {
    livraisonMap = L.map('carte-livraison').setView([startLat, startLon], clientLat ? 15 : 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(livraisonMap);

    livraisonMarker = L.marker([startLat, startLon], { draggable: true }).addTo(livraisonMap);
    livraisonMarker.bindPopup('Votre position de livraison.<br>Déplacez-moi si besoin.').openPopup();

    livraisonMarker.on('dragend', async function(e) {
      const pos = e.target.getLatLng();
      clientLat = pos.lat;
      clientLon = pos.lng;
      mettreAJourEtatSubmit();
      await geocoderInverse(pos.lat, pos.lng);
      await calculerFraisLivraison();
    });

    if (pdvData && pdvData.lat && pdvData.lon) {
      L.marker([pdvData.lat, pdvData.lon], {
        icon: L.icon({
          iconUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          shadowUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png',
          iconSize: [25, 41], iconAnchor: [12, 41],
          popupAnchor: [1, -34], shadowSize: [41, 41]
        })
      }).addTo(livraisonMap).bindPopup('Restaurant');
    }
  } else {
    livraisonMap.invalidateSize();
    livraisonMap.setView([startLat, startLon], clientLat ? 15 : 13);
    if (livraisonMarker) livraisonMarker.setLatLng([startLat, startLon]);
  }
}

async function geocoderInverse(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { 'Accept-Language': 'fr', 'User-Agent': 'MonMenu/1.0' } }
    );
    if (!res.ok) return;
    const data = await res.json();
    const adresse = data.display_name || '';
    const inputAdresse = document.getElementById('client-adresse');
    if (inputAdresse && adresse) {
      inputAdresse.value = adresse;
    }
  } catch (e) {
    console.warn('Géocodage inverse échoué', e);
  }
}

// ---- Code promo — appliquer ----
async function appliquerCodePromo() {
  const input = document.getElementById('promo-input');
  const msgEl = document.getElementById('promo-message');
  const btnEl = document.getElementById('promo-btn');
  if (!input || !msgEl) return;

  const code = input.value.trim().toUpperCase();
  if (!code) {
    _setPromoMsg(msgEl, 'Saisissez un code promo.', 'error');
    return;
  }

  if (btnEl) { btnEl.disabled = true; btnEl.textContent = '...'; }

  try {
    const sousTotal = getCartTotal();
    const res = await fetch('/api/v1/commandes/valider-promo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId, code, sous_total: sousTotal })
    });
    const data = await res.json();

    if (res.ok && data.valide) {
      promoAppliquee = {
        code: data.code,
        type: data.type,
        valeur: data.valeur,
        remise: data.remise
      };
      _setPromoMsg(msgEl, `✓ Code « ${escHtml(data.code)} » appliqué — ${formatMontant(data.remise)} de remise !`, 'success');
      if (input) input.disabled = true;
      if (btnEl) { btnEl.textContent = 'Retirer'; btnEl.onclick = retirerCodePromo; }
    } else {
      promoAppliquee = null;
      _setPromoMsg(msgEl, data.error || 'Code promo invalide ou expiré.', 'error');
    }
  } catch (e) {
    _setPromoMsg(msgEl, 'Erreur réseau. Réessayez.', 'error');
  } finally {
    if (btnEl && promoAppliquee === null) {
      btnEl.disabled = false;
      btnEl.textContent = 'Appliquer';
    }
  }
  updateCheckoutRecap();
}

function retirerCodePromo() {
  promoAppliquee = null;
  _resetPromoUI();
  updateCheckoutRecap();
}

function _resetPromoUI() {
  const input = document.getElementById('promo-input');
  const msgEl = document.getElementById('promo-message');
  const btnEl = document.getElementById('promo-btn');
  if (input) { input.value = ''; input.disabled = false; }
  if (msgEl) { msgEl.textContent = ''; msgEl.className = 'text-xs mt-1'; }
  if (btnEl) { btnEl.textContent = 'Appliquer'; btnEl.disabled = false; btnEl.onclick = appliquerCodePromo; }
}

function _setPromoMsg(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.className = 'text-xs mt-1 ' + (type === 'success' ? 'text-green-600' : 'text-red-600');
}

// ---- Calcul recap avec remise promo ----
function updateCheckoutRecap() {
  const sousTotal = getCartTotal();
  const isLivraison = document.querySelector('input[name="livraison-type"]:checked')?.value === 'livraison';
  const frais = isLivraison ? fraisLivraison : 0;

  let remise = 0;
  if (promoAppliquee) {
    if (promoAppliquee.type === 'pourcentage') {
      remise = Math.round(sousTotal * promoAppliquee.valeur / 100);
    } else {
      remise = Math.min(promoAppliquee.valeur, sousTotal);
    }
    promoAppliquee.remise = remise;
  }

  const totalAvantFrais = Math.max(0, sousTotal - remise);
  const total = totalAvantFrais + frais;

  const el_sous = document.getElementById('recap-sous-total');
  const el_promo = document.getElementById('recap-promo-row');
  const el_remise = document.getElementById('recap-remise');
  const el_liv = document.getElementById('recap-livraison');
  const el_tot = document.getElementById('recap-total');

  if (el_sous) el_sous.textContent = formatMontant(sousTotal);
  if (el_promo) el_promo.style.display = promoAppliquee ? 'flex' : 'none';
  if (el_remise && promoAppliquee) el_remise.textContent = '− ' + formatMontant(remise);
  if (el_liv) el_liv.textContent = isLivraison ? (fraisLivraison > 0 ? formatMontant(fraisLivraison) : 'À calculer') : 'Gratuit';
  if (el_tot) el_tot.textContent = (isLivraison && fraisLivraison === 0) ? 'À calculer' : formatMontant(total);
}

// ---- Géolocalisation client ----
function geolocaliser() {
  const detailEl = document.getElementById('frais-livraison-detail');
  if (!navigator.geolocation) {
    if (detailEl) detailEl.textContent = 'Géolocalisation non supportée par votre navigateur. Déplacez le repère sur la carte pour continuer (obligatoire).';
    return;
  }
  if (detailEl) detailEl.textContent = 'Localisation en cours...';

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      clientLat = pos.coords.latitude;
      clientLon = pos.coords.longitude;
      mettreAJourEtatSubmit();
      if (livraisonMap && livraisonMarker) {
        livraisonMarker.setLatLng([clientLat, clientLon]);
        livraisonMap.setView([clientLat, clientLon], 16);
      } else {
        initCartelivraison();
      }
      await geocoderInverse(clientLat, clientLon);
      await calculerFraisLivraison();
    },
    (err) => {
      console.warn('Géolocalisation refusée ou indisponible', err);
      if (detailEl) detailEl.textContent = 'Position non disponible — déplacez le repère sur la carte pour continuer (obligatoire pour la livraison).';
      mettreAJourEtatSubmit();
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
  );
}

async function calculerFraisLivraison() {
  if (!pdvData || !clientLat || !clientLon) return;
  try {
    const res = await fetch('/api/v1/livraison/calcul', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdv_id: pdvData.id, client_lat: clientLat, client_lon: clientLon })
    });
    if (res.ok) {
      const data = await res.json();
      fraisLivraison = data.frais_livraison || 0;
      const detailEl = document.getElementById('frais-livraison-detail');
      if (detailEl) detailEl.textContent = data.detail + ' — ' + data.temps_estime_min + ' min estimés';
      updateCheckoutRecap();
    } else {
      const detailEl = document.getElementById('frais-livraison-detail');
      if (detailEl) detailEl.textContent = 'Impossible de calculer les frais pour cette position.';
    }
  } catch (e) {
    console.error('calcul livraison', e);
    const detailEl = document.getElementById('frais-livraison-detail');
    if (detailEl) detailEl.textContent = 'Erreur réseau lors du calcul des frais de livraison.';
  }
}

// ---- Soumettre la commande ----
// AJOUT — chaque item envoyé au serveur inclut désormais supplement_ids
// (IDs uniquement, jamais le prix — recalculé côté serveur).
async function submitOrder(e) {
  e.preventDefault();

  if (!boutiqueOuverte) {
    alert('Le restaurant est actuellement fermé. La commande ne peut pas être envoyée.');
    return;
  }

  const btn = document.getElementById('submit-btn');
  const nom = document.getElementById('client-nom')?.value?.trim();
  const tel = document.getElementById('client-tel')?.value?.trim();
  const adresse = document.getElementById('client-adresse')?.value?.trim();
  const notes = document.getElementById('client-notes')?.value?.trim();
  const modeType = document.querySelector('input[name="livraison-type"]:checked')?.value;

  if (!nom || !tel) { alert('Veuillez renseigner votre nom et téléphone.'); return; }
  if (cart.items.length === 0) { alert('Votre panier est vide.'); return; }

  const isEmporter = modeType === 'emporter';

  if (!isEmporter) {
    if (clientLat === null || clientLon === null) {
      alert('La position GPS est obligatoire pour la livraison. Merci d\'autoriser la géolocalisation ou de déplacer le repère sur la carte.');
      return;
    }
    if (!adresse) {
      alert('Merci de préciser votre adresse (quartier, rue, repère...).');
      return;
    }
  }

  const labelInitial = '<i class="fa-solid fa-check"></i> Confirmer';
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Envoi en cours...';

  const whatsappWindow = window.open('about:blank', '_blank');

  const idempotencyKey = crypto.randomUUID();

  const payload = {
    tenant_id: tenantId,
    point_de_vente_id: pdvData ? pdvData.id : '',
    client_nom: nom,
    client_telephone: tel,
    client_adresse: isEmporter ? null : adresse,
    client_latitude: isEmporter ? null : clientLat,
    client_longitude: isEmporter ? null : clientLon,
    items: cart.items.map(item => ({
      produit_id: item.produit_id,
      quantite: item.quantite,
      supplement_ids: (item.supplements || []).map(s => s.supplement_id)
    })),
    mode_paiement: 'especes_livraison',
    mode_livraison: isEmporter ? 'emporter' : 'livraison',
    idempotency_key: idempotencyKey,
    notes: notes || null,
    code_promo: promoAppliquee ? promoAppliquee.code : undefined
  };

  try {
    const res = await fetch('/api/v1/commandes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (res.ok && data.success) {
      cart = { items: [], tenant_id: tenantId, slug: tenantSlug };
      saveCart();
      updateCartUI();
      promoAppliquee = null;

      if (data.url_suivi) {
        try {
          localStorage.setItem('monmenu_dernier_suivi_' + tenantSlug, JSON.stringify({
            url_suivi: data.url_suivi,
            date: new Date().toISOString(),
            statut: 'en_attente'
          }));
        } catch {}
      }

      if (data.lien_whatsapp) {
        const lienCorrige = corrigerLienWhatsApp(data.lien_whatsapp);
        if (whatsappWindow) {
          whatsappWindow.location.href = lienCorrige;
        } else {
          window.open(lienCorrige, '_blank');
        }
      } else if (whatsappWindow) {
        whatsappWindow.close();
      }

      window.location.href = data.url_suivi || '/';
    } else {
      if (whatsappWindow) whatsappWindow.close();
      alert(data.error || 'Erreur lors de la commande. Réessayez.');
      btn.disabled = false;
      btn.innerHTML = labelInitial;
    }
  } catch (err) {
    if (whatsappWindow) whatsappWindow.close();
    alert('Erreur réseau. Vérifiez votre connexion et réessayez.');
    btn.disabled = false;
    btn.innerHTML = labelInitial;
  }
}

function corrigerLienWhatsApp(lien) {
  try {
    const url = new URL(lien);
    if (!/wa\.me$/i.test(url.hostname) && !/whatsapp\.com$/i.test(url.hostname)) return lien;
    if (/wa\.me$/i.test(url.hostname)) {
      const numeroBrut = url.pathname.replace(/^\//, '');
      const numeroPropre = formatWhatsAppNumber(numeroBrut);
      if (numeroPropre && numeroPropre !== numeroBrut) {
        url.pathname = '/' + numeroPropre;
      }
    } else {
      const phone = url.searchParams.get('phone');
      if (phone) {
        const numeroPropre = formatWhatsAppNumber(phone);
        if (numeroPropre) url.searchParams.set('phone', numeroPropre);
      }
    }
    return url.toString();
  } catch {
    return lien;
  }
}

function formatWhatsAppNumber(numeroRaw) {
  let n = (numeroRaw || '').replace(/[^0-9+]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  return n.replace(/\D/g, '');
}

// ---- Utilitaires ----
function formatMontant(montant) {
  return (montant || 0).toLocaleString('fr-FR') + ' FCFA';
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Exposer les fonctions globalement
window.initBoutique = initBoutique;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.openCart = openCart;
window.closeCart = closeCart;
window.openCheckout = openCheckout;
window.closeCheckout = closeCheckout;
window.submitOrder = submitOrder;
window.geolocaliser = geolocaliser;
window.appliquerCodePromo = appliquerCodePromo;
window.retirerCodePromo = retirerCodePromo;
window.scrollToTop = scrollToTop;
window.ouvrirModalSupplements = ouvrirModalSupplements;
window.confirmerAjoutAvecSupplements = confirmerAjoutAvecSupplements;
