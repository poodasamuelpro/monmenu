// MonMenu — Boutique restaurant (JS côté client)
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

// ---- Carte Leaflet (§1.1) ----
let livraisonMap = null;
let livraisonMarker = null;

// --- Code promo state ---
let promoAppliquee = null; // { code, type, valeur, remise } ou null

// Devises
const DEVISE = 'FCFA';

// ---- Init ----
async function initBoutique(tid, slug) {
  // §2.4 : tid est maintenant le slug (TENANT_ID retiré du HTML).
  // tenantId sera résolu depuis l'API via loadTenant().
  tenantId = ''; // Sera rempli par loadTenant()
  tenantSlug = slug;
  loadCart();
  await Promise.all([loadTenant(), loadMenu()]);
  renderMenu();
  updateCartUI();
}

// ---- Panier (localStorage) ----
function loadCart() {
  try {
    const stored = localStorage.getItem('monmenu_cart_' + tenantSlug);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Invalider si > 24h
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
      // §2.4 : tenantId résolu depuis l'API (non exposé dans le HTML)
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

// ---- Rendu menu ----
function renderMenu() {
  const skeleton = document.getElementById('menu-skeleton');
  const menuContent = document.getElementById('menu-content');
  const categoriesNav = document.getElementById('categories-nav');

  if (!menuData || !menuData.categories) {
    if (skeleton) skeleton.innerHTML = '<p class="text-gray-500 text-sm text-center py-8">Menu non disponible</p>';
    return;
  }

  // Navigation catégories
  if (categoriesNav) {
    categoriesNav.innerHTML = menuData.categories.map((cat, i) =>
      `<a href="#cat-${cat.id}" class="whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-medium ${i === 0 ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-gray-100'} transition-colors">${escHtml(cat.nom)}</a>`
    ).join('');
  }

  // Menu complet
  let html = '';
  for (const categorie of menuData.categories) {
    if (!categorie.produits || categorie.produits.length === 0) continue;
    html += `<section id="cat-${categorie.id}" class="mb-8">`;
    html += `<h2 class="font-bold text-lg text-gray-900 mb-4 px-0">${escHtml(categorie.nom)}</h2>`;
    html += `<div class="space-y-3">`;
    for (const produit of categorie.produits) {
      html += renderProduitCard(produit);
    }
    html += '</div></section>';
  }

  if (menuContent) menuContent.innerHTML = html;
}

function renderProduitCard(p) {
  const quantiteInCart = getQuantiteInCart(p.id);
  return `
  <div class="bg-white rounded-xl border border-gray-100 p-4 flex gap-3 items-start shadow-sm ${!p.disponible ? 'opacity-50' : ''}">
    <div class="flex-1 min-w-0">
      <div class="font-semibold text-gray-900 text-sm leading-tight">${escHtml(p.nom)}</div>
      ${p.description ? `<div class="text-xs text-gray-500 mt-0.5 line-clamp-2">${escHtml(p.description)}</div>` : ''}
      <div class="font-bold text-sm mt-2" style="color:${PRIMARY_COLOR}">${formatMontant(p.prix)}</div>
    </div>
    <div class="flex flex-col items-end gap-2 flex-shrink-0">
      ${p.photo_url ? `<img src="${escHtml(p.photo_url)}" alt="${escHtml(p.nom)}" class="w-16 h-16 rounded-lg object-cover border border-gray-100" loading="lazy">` : ''}
      ${p.disponible ? (
        quantiteInCart > 0 ?
        `<div class="flex items-center gap-2 bg-gray-50 rounded-xl p-1">
          <button onclick="removeFromCart('${p.id}')" class="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors font-bold">−</button>
          <span class="text-sm font-bold w-4 text-center">${quantiteInCart}</span>
          <button onclick="addToCart(${JSON.stringify({id: p.id, nom: p.nom, prix: p.prix, photo_url: p.photo_url}).replace(/"/g, '&quot;')})" class="w-7 h-7 rounded-lg flex items-center justify-center text-white transition-colors font-bold" style="background-color:${PRIMARY_COLOR}">+</button>
        </div>` :
        `<button onclick="addToCart(${JSON.stringify({id: p.id, nom: p.nom, prix: p.prix, photo_url: p.photo_url}).replace(/"/g, '&quot;')})" class="w-8 h-8 rounded-xl flex items-center justify-center text-white transition-all font-bold shadow-sm" style="background-color:${PRIMARY_COLOR}">
          <i class="fa-solid fa-plus text-xs"></i>
        </button>`
      ) : '<span class="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">Indisponible</span>'}
    </div>
  </div>`;
}

function getQuantiteInCart(produitId) {
  const item = cart.items.find(i => i.produit_id === produitId);
  return item ? item.quantite : 0;
}

// ---- Panier actions ----
function addToCart(produit) {
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
  // Mettre à jour la card
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

function updateCartUI() {
  const count = getCartCount();
  const total = getCartTotal();
  const cartBtn = document.getElementById('cart-btn');
  const cartCount = document.getElementById('cart-count');
  const cartTotal = document.getElementById('cart-total');

  if (cartBtn) cartBtn.classList.toggle('hidden', count === 0);
  if (cartCount) cartCount.textContent = count;
  if (cartTotal) cartTotal.textContent = formatMontant(total);
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
        <button onclick="removeFromCart('${item.produit_id}'); renderCartModal(); updateCartUI();" class="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-200 font-bold">−</button>
        <span class="text-sm font-bold w-6 text-center">${item.quantite}</span>
        <button onclick="addToCart({id:'${item.produit_id}',nom:'${escHtml(item.nom)}',prix:${item.prix}}); renderCartModal(); updateCartUI();" class="w-7 h-7 rounded-xl flex items-center justify-center text-white font-bold" style="background-color:${PRIMARY_COLOR}">+</button>
      </div>
      <div class="text-sm font-bold w-20 text-right">${formatMontant(item.prix * item.quantite)}</div>
    </div>
  `).join('');

  const total = getCartTotal();
  footerEl.innerHTML = `
    <div class="flex justify-between font-bold text-base mb-3">
      <span>Total articles</span>
      <span>${formatMontant(total)}</span>
    </div>
    <button onclick="closeCart(); openCheckout();" class="w-full text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2" style="background-color:${PRIMARY_COLOR}">
      <i class="fa-solid fa-arrow-right"></i> Passer à la commande
    </button>
  `;
}

function openCheckout() {
  // Réinitialiser le code promo à l'ouverture
  promoAppliquee = null;
  _resetPromoUI();
  updateCheckoutRecap();
  document.getElementById('checkout-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  // Écouter changements de mode de livraison
  document.querySelectorAll('input[name="livraison-type"]').forEach(radio => {
    radio.addEventListener('change', onLivraisonTypeChange);
  });
  // Initialiser la carte si mode livraison sélectionné par défaut
  const isLivraison = document.querySelector('input[name="livraison-type"]:checked')?.value === 'livraison';
  if (isLivraison) {
    setTimeout(() => initCartelivraison(), 200);
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
    // Initialiser la carte si pas encore fait
    setTimeout(() => initCartelivraison(), 100);
  }
  if (!isLivraison) {
    // Mode à emporter : pas de frais
    fraisLivraison = 0;
  }
  updateCheckoutRecap();
}

// ---- Carte Leaflet interactive (§1.1) ----
function initCartelivraison() {
  const container = document.getElementById('carte-livraison');
  if (!container) return;

  // Vider le placeholder texte
  container.innerHTML = '';
  container.style.height = '220px';

  // Coordonnées initiales : PDV du restaurant ou Ouagadougou par défaut
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

    // Marker déplaçable pour la position client
    livraisonMarker = L.marker([startLat, startLon], { draggable: true }).addTo(livraisonMap);
    livraisonMarker.bindPopup('Votre position de livraison.<br>Déplacez-moi si besoin.').openPopup();

    livraisonMarker.on('dragend', async function(e) {
      const pos = e.target.getLatLng();
      clientLat = pos.lat;
      clientLon = pos.lng;
      // Géocodage inverse (Nominatim/OSM — gratuit)
      await geocoderInverse(pos.lat, pos.lng);
      await calculerFraisLivraison();
    });

    // Marker fixe PDV (non draggable)
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
    // Carte déjà créée : invalider la taille au cas où le container était caché
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

  // Désactiver pendant la requête
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

  // Calculer remise
  let remise = 0;
  if (promoAppliquee) {
    if (promoAppliquee.type === 'pourcentage') {
      remise = Math.round(sousTotal * promoAppliquee.valeur / 100);
    } else {
      remise = Math.min(promoAppliquee.valeur, sousTotal);
    }
    // Stocker la remise recalculée
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

  // Ligne remise — afficher seulement si promo active
  if (el_promo) el_promo.style.display = promoAppliquee ? 'flex' : 'none';
  if (el_remise && promoAppliquee) el_remise.textContent = '− ' + formatMontant(remise);

  if (el_liv) el_liv.textContent = isLivraison ? (fraisLivraison > 0 ? formatMontant(fraisLivraison) : 'À calculer') : 'Gratuit';
  if (el_tot) el_tot.textContent = (isLivraison && fraisLivraison === 0) ? 'À calculer' : formatMontant(total);
}

// Géolocalisation
function geolocaliser() {
  if (!navigator.geolocation) { alert('Géolocalisation non supportée par votre navigateur.'); return; }
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      clientLat = pos.coords.latitude;
      clientLon = pos.coords.longitude;
      // Mettre à jour le marqueur sur la carte si elle est initialisée
      if (livraisonMap && livraisonMarker) {
        livraisonMarker.setLatLng([clientLat, clientLon]);
        livraisonMap.setView([clientLat, clientLon], 15);
        await geocoderInverse(clientLat, clientLon);
      }
      await calculerFraisLivraison();
    },
    (err) => { console.warn('Géolocalisation refusée', err); }
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
    }
  } catch (e) { console.error('calcul livraison', e); }
}

// ---- Soumettre la commande ----
async function submitOrder(e) {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  const nom = document.getElementById('client-nom')?.value?.trim();
  const tel = document.getElementById('client-tel')?.value?.trim();
  const adresse = document.getElementById('client-adresse')?.value?.trim();
  const notes = document.getElementById('client-notes')?.value?.trim();
  const modeType = document.querySelector('input[name="livraison-type"]:checked')?.value;

  if (!nom || !tel) { alert('Veuillez renseigner votre nom et téléphone.'); return; }
  if (cart.items.length === 0) { alert('Votre panier est vide.'); return; }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Envoi en cours...';

  const idempotencyKey = crypto.randomUUID();

  // §1.9 — Détecter le mode de livraison choisi par l'utilisateur
  const isEmporter = modeType === 'emporter';

  const payload = {
    tenant_id: tenantId,
    point_de_vente_id: pdvData ? pdvData.id : '',
    client_nom: nom,
    client_telephone: tel,
    // En mode "à emporter", pas d'adresse ni de coordonnées
    client_adresse: isEmporter ? null : (adresse || null),
    client_latitude: isEmporter ? null : clientLat,
    client_longitude: isEmporter ? null : clientLon,
    items: cart.items.map(item => ({ produit_id: item.produit_id, quantite: item.quantite })),
    mode_paiement: 'especes_livraison',
    mode_livraison: isEmporter ? 'emporter' : 'livraison',
    idempotency_key: idempotencyKey,
    notes: notes || null,
    // Code promo : inclure uniquement si une promo a été validée
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
      // Vider le panier
      cart = { items: [], tenant_id: tenantId, slug: tenantSlug };
      saveCart();
      updateCartUI();
      promoAppliquee = null;

      // Redirection WhatsApp
      if (data.lien_whatsapp) {
        window.open(data.lien_whatsapp, '_blank');
      }

      // Rediriger vers suivi
      window.location.href = data.url_suivi || '/';
    } else {
      alert(data.error || 'Erreur lors de la commande. Réessayez.');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-brands fa-whatsapp"></i> Confirmer et envoyer sur WhatsApp';
    }
  } catch (err) {
    alert('Erreur réseau. Vérifiez votre connexion et réessayez.');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-brands fa-whatsapp"></i> Confirmer et envoyer sur WhatsApp';
  }
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
