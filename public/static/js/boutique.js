// MonMenu — Boutique restaurant (JS côté client)
// v1.3.0 — FIX 2026-07-30 : géolocalisation rendue OBLIGATOIRE en mode
// livraison. Avant ce fix, la validation acceptait "adresse texte OU
// coordonnées GPS", ce qui permettait de valider une commande sans position
// GPS dès lors qu'une adresse était tapée manuellement. Résultat : le
// message WhatsApp envoyé au restaurant n'avait ni lien Google Maps ni lien
// Waze (ces liens ne peuvent être construits qu'à partir de coordonnées).
// Désormais : adresse ET coordonnées sont toutes les deux requises pour
// livraison, et le bouton "Confirmer" reste désactivé tant que la position
// n'est pas connue.
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

// §Horaires — Statut d'ouverture calculé côté client depuis pdv_horaires
// (renvoyé par GET /api/v1/tenants/:slug). Optimiste par défaut (true) tant
// que les données n'ont pas encore été chargées, pour ne pas faire clignoter
// l'UI. Recalculé après loadTenant() puis toutes les 60s pour rester exact
// même si l'utilisateur reste longtemps sur la page (ex: passage de l'heure
// de fermeture pendant la navigation).
let boutiqueOuverte = true;
let _statutIntervalId = null;

// §Suivi — id de l'intervalle qui rafraîchit périodiquement le badge de
// statut du bouton "Suivre ma commande" (voir actualiserBadgeSuivi()).
let _suiviIntervalId = null;

// Registre des produits (utilisé par renderProduitCard() pour retrouver
// les infos produit lors d'un clic +/- sans passer par du JSON inline).
let _produitRegistry = {};

// Libellés de statut affichés sur le bouton flottant de suivi (bas gauche).
const STATUT_LABELS = {
  en_attente: 'En attente',
  confirmee: 'Confirmée',
  en_preparation: 'En préparation',
  en_livraison: 'En livraison',
  livree: 'Livrée',
  annulee: 'Annulée'
};

// Écouteur unique (délégation d'événements) sur le conteneur du menu pour
// les boutons +/- des cartes produits (data-action="add"/"remove").
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
      if (!boutiqueOuverte) return; // sécurité : jamais d'ajout hors horaires
      const produit = _produitRegistry[produitId];
      if (produit) addToCart(produit);
    } else if (action === 'remove') {
      removeFromCart(produitId);
    }
  });
  _menuListenerAttache = true;
}

// ---- Carte Leaflet (§1.1) ----
let livraisonMap = null;
let livraisonMarker = null;

// --- Code promo state ---
let promoAppliquee = null; // { code, type, valeur, remise } ou null

// Devises
const DEVISE = 'FCFA';

// ---- Init ----
async function initBoutique(tid, slug) {
  tenantId = ''; // Sera rempli par loadTenant()
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

  // Revérifie le statut d'ouverture toutes les 60s (ex : l'utilisateur reste
  // sur la page au moment précis de l'ouverture/fermeture du restaurant).
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

// ---- Statut d'ouverture (miroir client de calculerStatutHoraire() côté serveur) ----
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
  if (!debut || !fin) return true; // ouvert toute la journée si pas de plage précisée

  const [hD, mD] = debut.split(':').map(Number);
  const [hF, mF] = fin.split(':').map(Number);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const debutMin = hD * 60 + mD;
  let finMin = hF * 60 + mF;
  // Gère le cas d'une fermeture après minuit (ex: 10:00 - 00:00 → traité comme 24:00)
  if (finMin <= debutMin) finMin += 24 * 60;

  return nowMin >= debutMin && nowMin < finMin;
}

function actualiserStatutOuverture() {
  boutiqueOuverte = tenantData ? estOuvertMaintenant(tenantData.pdv_horaires) : true;

  // Met à jour la pastille de statut dans l'en-tête si elle existe déjà en DOM
  const badge = document.getElementById('statut-horaire-badge');
  if (badge) {
    badge.classList.toggle('statut-ferme', !boutiqueOuverte);
  }

  // Bandeau d'avertissement au-dessus du menu, uniquement si fermé
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

// Carte produit — photo carrée (taille fixe, toujours recadrée en object-cover
// pour que le rendu reste identique quelle que soit la taille/format de la
// photo fournie par le restaurant), nom + description, puis "Prix — montant".
// §Horaires — Si la boutique est fermée, TOUT bouton d'ajout disparaît,
// quel que soit le statut `disponible` du produit : impossible de commander.
function renderProduitCard(p) {
  const quantiteInCart = getQuantiteInCart(p.id);
  _produitRegistry[p.id] = { id: p.id, nom: p.nom, prix: p.prix, photo_url: p.photo_url };

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

  // §Images — carte produit légèrement réduite : ratio 4/3 (au lieu du
  // carré plein) pour un rendu un peu plus compact sur mobile.
  const assombri = (!p.disponible || !boutiqueOuverte) ? 'opacity-60' : '';

  return `
  <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-full ${assombri}">
    <div class="relative w-full aspect-[4/3] bg-gray-50 overflow-hidden">
      ${p.photo_url
        ? `<img src="${escHtml(p.photo_url)}" alt="${escHtml(p.nom)}" class="w-full h-full object-cover" loading="lazy">`
        : `<div class="w-full h-full flex items-center justify-center"><i class="fa-solid fa-utensils text-3xl text-gray-300"></i></div>`
      }
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
  const item = cart.items.find(i => i.produit_id === produitId);
  return item ? item.quantite : 0;
}

// ---- Panier actions ----
function addToCart(produit) {
  if (!boutiqueOuverte) return; // double sécurité
  const existing = cart.items.find(i => i.produit_id === produit.id);
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

function removeFromCart(produitId) {
  const idx = cart.items.findIndex(i => i.produit_id === produitId);
  if (idx === -1) return;
  if (cart.items[idx].quantite > 1) {
    cart.items[idx].quantite--;
  } else {
    cart.items.splice(idx, 1);
  }
  saveCart();
  updateCartUI();
  renderMenu();
}

// §Horaires — Le bouton panier flottant reste visible si des articles sont
// déjà dedans (pour permettre de finaliser une commande passée avant la
// fermeture), mais on affiche un badge "Fermé" dessus et le checkout est
// bloqué dans openCheckout(). S'il est vide et fermé, on le masque.
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

// ---- Suivi de commande (bouton flottant bas de page, à gauche) ----
// FIX suivi — Le bouton reste affiché en permanence dès qu'une commande a
// été passée sur cet appareil, sans limite de temps. Il affiche soit
// "Suivre ma commande" (statut inconnu), soit le libellé exact du statut
// (ex : "En préparation"), rafraîchi périodiquement.
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

    // Rafraîchit tout de suite, puis toutes les 30s tant que la page reste ouverte.
    actualiserBadgeSuivi(info.url_suivi);
    if (_suiviIntervalId) clearInterval(_suiviIntervalId);
    _suiviIntervalId = setInterval(() => actualiserBadgeSuivi(info.url_suivi), 30000);
  } catch {}
}

// FIX suivi — Interroge l'API de suivi public pour afficher un statut à jour
// sur le bouton "Suivre ma commande" (ex : "En préparation"). Échec
// silencieux (réseau, commande introuvable...) : le bouton garde simplement
// son dernier libellé connu.
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

    // Persiste le dernier statut connu (utile au prochain chargement de page).
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

// §UX — Masque les boutons flottants (panier + suivi) lorsque le footer
// entre dans le viewport (évite qu'ils se superposent visuellement aux
// horaires/contact du footer, ce qui rendait la lecture confuse en bas de
// page).
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

// ---- Modals ----
function openCart() {
  renderCartModal();
  document.getElementById('cart-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  document.getElementById('cart-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

function renderCartModal() {
  const itemsEl = document.getElementById('cart-items');
  const footerEl = document.getElementById('cart-footer');
  if (!itemsEl || !footerEl) return;

  if (cart.items.length === 0) {
    itemsEl.innerHTML = '<div class="text-center py-8 text-gray-400"><i class="fa-solid fa-basket-shopping text-3xl mb-3 block"></i><p class="text-sm">Votre panier est vide</p></div>';
    footerEl.innerHTML = '';
    return;
  }

  itemsEl.innerHTML = cart.items.map(item => `
    <div class="flex items-center gap-3 py-3">
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-sm text-gray-900">${escHtml(item.nom)}</div>
        <div class="text-xs text-gray-500">${formatMontant(item.prix)} l'unité</div>
      </div>
      <div class="flex items-center gap-2 bg-gray-50 rounded-xl p-1">
        <button data-cart-action="remove" data-produit-id="${escHtml(item.produit_id)}" class="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-200 font-bold">−</button>
        <span class="text-sm font-bold w-6 text-center">${item.quantite}</span>
        <button data-cart-action="add" data-produit-id="${escHtml(item.produit_id)}" class="w-7 h-7 rounded-xl flex items-center justify-center text-white font-bold" style="background-color:${PRIMARY_COLOR}">+</button>
      </div>
      <div class="text-sm font-bold w-20 text-right">${formatMontant(item.prix * item.quantite)}</div>
    </div>
  `).join('');

  itemsEl.querySelectorAll('[data-cart-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!boutiqueOuverte) return;
      const produitId = btn.getAttribute('data-produit-id');
      const action = btn.getAttribute('data-cart-action');
      if (action === 'add') {
        const item = cart.items.find(i => i.produit_id === produitId);
        if (item) addToCart({ id: item.produit_id, nom: item.nom, prix: item.prix, photo_url: item.photo_url });
      } else {
        removeFromCart(produitId);
      }
      renderCartModal();
      updateCartUI();
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

// §Horaires — Verrou final avant ouverture du formulaire de paiement :
// même si l'état a changé entre-temps (fermeture pendant la navigation),
// impossible d'ouvrir le checkout hors horaires.
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
  // FIX — état initial du bouton Confirmer selon que la position est déjà connue
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

// FIX — Verrouille/déverrouille le bouton "Confirmer" du formulaire de
// commande selon que la position GPS est connue (mode livraison
// uniquement). Empêche de soumettre une commande livraison sans
// coordonnées, ce qui garantit que le message WhatsApp final contiendra
// toujours les liens Maps/Waze quand il s'agit d'une livraison.
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

// ---- Carte Leaflet interactive (§1.1) ----
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

// ---- Géolocalisation client (auto + bouton manuel) ----
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
// FIX WhatsApp — À la confirmation, la commande doit rediriger vers WhatsApp
// du RESTAURANT avec le récap pré-rempli (lien_whatsapp renvoyé par
// POST /api/v1/commandes), en plus de la redirection vers la page de suivi.
// Le lien_whatsapp est construit CÔTÉ SERVEUR (genererMessageCommande dans
// lib/whatsapp.ts) et contient désormais TOUJOURS les liens Google Maps et
// Waze dès lors que client_latitude/client_longitude sont fournis — ce qui
// est maintenant garanti par la validation stricte ci-dessous (FIX
// 2026-07-30 : géolocalisation obligatoire en livraison).
//
// Pour éviter le blocage popup des navigateurs (qui n'autorisent l'ouverture
// de fenêtre que si elle a lieu de façon SYNCHRONE dans le même geste
// utilisateur, i.e. le clic sur "Confirmer"), on ouvre un onglet vide
// immédiatement, AVANT le fetch, puis on le redirige vers le vrai lien
// WhatsApp une fois la réponse serveur reçue.
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

  // FIX 2026-07-30 — En mode livraison, l'ADRESSE et les COORDONNÉES GPS
  // sont désormais TOUTES LES DEUX obligatoires (et non plus l'une ou
  // l'autre). C'est ce qui garantit que le message WhatsApp final contient
  // toujours les liens Google Maps / Waze.
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

  // FIX popup — ouverture synchrone de l'onglet WhatsApp, dans le clic.
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
    items: cart.items.map(item => ({ produit_id: item.produit_id, quantite: item.quantite })),
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

      // FIX WhatsApp — redirige l'onglet ouvert plus haut vers le lien
      // WhatsApp réel (restaurant), pré-rempli avec le récap de commande
      // (adresse + Maps + Waze désormais garantis pour toute livraison).
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

      // La page principale du client va vers le suivi de commande.
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

// §WhatsApp — Filet de sécurité côté client : si le lien renvoyé par le
// serveur contient un numéro mal formaté (ex: wa.me/00226..., espaces,
// tirets...), on le corrige avant redirection. Ne peut pas ajouter un
// indicatif pays manquant — seule la correction de format est possible ici.
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
    return lien; // URL invalide : on laisse tel quel plutôt que de casser la redirection
  }
}

// §WhatsApp — Même logique de normalisation que côté serveur (boutique.ts) :
// retire tout ce qui n'est pas chiffre/+, convertit un préfixe "00" en "+"
// puis retire le "+" (wa.me n'accepte que des chiffres).
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
