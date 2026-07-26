// src/pages/boutique.ts — Page boutique d'un restaurant (vue client)
import { renderHead } from '../components/head'

export interface TenantBoutique {
  id: string
  nom: string
  slug: string
  logo_url: string | null
  banniere_url: string | null
  couleur_primaire: string
  couleur_secondaire: string
  whatsapp_number: string
  pdv_nom?: string | null
  pdv_adresse?: string | null
  pdv_horaires?: string | null
  pdv_latitude?: number | null
  pdv_longitude?: number | null
}

export function renderBoutiquePage(tenant: TenantBoutique, nomProjet: string): string {
  const primaryColor = tenant.couleur_primaire || '#DC2626'
  const secondaryColor = tenant.couleur_secondaire || '#1D4ED8'
  const currentYear = new Date().getFullYear()

  return `${renderHead(
    `${tenant.nom} — Commander en ligne`,
    `Commandez vos plats chez ${tenant.nom} sur ${nomProjet}. Livraison ou retrait sur place.`,
    nomProjet
  )}
<body class="font-sans bg-gray-50">
  <style>
    :root {
      --color-primary: ${primaryColor};
      --color-secondary: ${secondaryColor};
    }
    .btn-primary { background-color: var(--color-primary); color: white; }
    .btn-primary:hover { filter: brightness(0.9); }
    .text-primary { color: var(--color-primary); }
    .border-primary { border-color: var(--color-primary); }
    .bg-primary { background-color: var(--color-primary); }
  </style>

  <!-- En-tête boutique -->
  <header class="bg-white shadow-sm sticky top-0 z-30">
    ${tenant.banniere_url ? `<div class="h-32 bg-cover bg-center" style="background-image:url('${tenant.banniere_url}')"></div>` : ''}
    <div class="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
      ${tenant.logo_url
        ? `<img src="${tenant.logo_url}" alt="${tenant.nom}" class="w-14 h-14 rounded-xl object-cover border border-gray-100 shadow-sm flex-shrink-0">`
        : `<div class="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0" style="background-color:${primaryColor}">${tenant.nom.charAt(0)}</div>`
      }
      <div class="flex-1 min-w-0">
        <h1 class="font-bold text-xl text-gray-900 truncate">${tenant.nom}</h1>
        <div class="flex items-center gap-1.5 text-xs text-green-600">
          <i class="fa-solid fa-circle text-xs"></i>
          <span>Ouvert — Commande en ligne</span>
        </div>
        ${tenant.pdv_adresse ? `<div class="text-xs text-gray-400 truncate mt-0.5"><i class="fa-solid fa-location-dot mr-1"></i>${tenant.pdv_adresse}</div>` : ''}
      </div>
      <a href="https://wa.me/${tenant.whatsapp_number.replace(/[^0-9]/g, '')}"
         target="_blank" rel="noopener"
         class="flex-shrink-0 w-10 h-10 rounded-xl bg-green-500 hover:bg-green-600 flex items-center justify-center text-white transition-colors"
         title="Contacter sur WhatsApp">
        <i class="fa-brands fa-whatsapp text-lg"></i>
      </a>
    </div>
    <!-- Catégories sticky -->
    <div class="border-t border-gray-100 overflow-x-auto scrollbar-hide">
      <nav class="max-w-3xl mx-auto px-4 flex gap-1 py-2" id="categories-nav"></nav>
    </div>
  </header>

  <!-- Menu -->
  <main class="max-w-3xl mx-auto px-4 py-6 pb-32" id="menu-content">
    <div class="space-y-2" id="menu-skeleton">
      ${Array(4).fill('<div class="animate-pulse bg-gray-200 rounded-xl h-20"></div>').join('')}
    </div>
  </main>

  <!-- Bouton panier flottant -->
  <div id="cart-btn" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 hidden">
    <button onclick="openCart()"
      class="btn-primary font-bold px-6 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 min-w-[260px] justify-between">
      <div class="flex items-center gap-2">
        <div id="cart-count"
          class="bg-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center"
          style="color:${primaryColor}">0</div>
        <span>Voir le panier</span>
      </div>
      <span id="cart-total" class="font-bold">0 FCFA</span>
    </button>
  </div>

  <!-- Modal Panier -->
  <div id="cart-modal" class="fixed inset-0 z-50 hidden">
    <div class="absolute inset-0 bg-black/50" onclick="closeCart()"></div>
    <div class="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[85vh] overflow-y-auto">
      <div class="sticky top-0 bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between">
        <h2 class="font-bold text-lg text-gray-900">Votre commande</h2>
        <button onclick="closeCart()" class="p-2 hover:bg-gray-100 rounded-lg transition-colors" aria-label="Fermer">
          <i class="fa-solid fa-xmark text-gray-600"></i>
        </button>
      </div>
      <div id="cart-items" class="px-4 py-4 divide-y divide-gray-100"></div>
      <div id="cart-footer" class="sticky bottom-0 bg-white border-t border-gray-100 p-4"></div>
    </div>
  </div>

  <!-- Modal Checkout -->
  <div id="checkout-modal" class="fixed inset-0 z-50 hidden">
    <div class="absolute inset-0 bg-black/50" onclick="closeCheckout()"></div>
    <div class="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[95vh] overflow-y-auto">
      <div class="sticky top-0 bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <button onclick="closeCheckout()" class="p-2 hover:bg-gray-100 rounded-lg transition-colors" aria-label="Retour">
          <i class="fa-solid fa-arrow-left text-gray-600"></i>
        </button>
        <h2 class="font-bold text-lg text-gray-900">Finaliser la commande</h2>
      </div>
      <form id="checkout-form" class="px-4 py-6 space-y-5" onsubmit="submitOrder(event)">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">
            Votre prénom et nom <span class="text-red-500">*</span>
          </label>
          <input id="client-nom" type="text" required minlength="2" maxlength="100"
            class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
            placeholder="Fatou Traoré">
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">
            Téléphone <span class="text-red-500">*</span>
          </label>
          <input id="client-tel" type="tel" required
            class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
            placeholder="+226 70 00 00 00">
        </div>

        <div>
          <div class="text-sm font-semibold text-gray-700 mb-2">
            Mode de livraison <span class="text-red-500">*</span>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="border border-gray-200 rounded-xl p-3 cursor-pointer hover:border-red-300 transition-colors has-[:checked]:border-red-500 has-[:checked]:bg-red-50">
              <input type="radio" name="livraison-type" value="livraison" class="sr-only" checked>
              <div class="flex flex-col gap-1">
                <i class="fa-solid fa-motorcycle text-gray-500 text-sm"></i>
                <span class="text-sm font-semibold text-gray-900">Livraison</span>
                <span class="text-xs text-gray-500">À domicile</span>
              </div>
            </label>
            <label class="border border-gray-200 rounded-xl p-3 cursor-pointer hover:border-red-300 transition-colors has-[:checked]:border-red-500 has-[:checked]:bg-red-50">
              <input type="radio" name="livraison-type" value="emporter" class="sr-only">
              <div class="flex flex-col gap-1">
                <i class="fa-solid fa-bag-shopping text-gray-500 text-sm"></i>
                <span class="text-sm font-semibold text-gray-900">À emporter</span>
                <span class="text-xs text-gray-500">Sur place</span>
              </div>
            </label>
          </div>
        </div>

        <div id="map-section">
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">
            Votre adresse de livraison <span class="text-red-500">*</span>
          </label>
          <div class="relative mb-2">
            <i class="fa-solid fa-location-dot absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
            <input id="client-adresse" type="text"
              class="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
              placeholder="Quartier, rue, repère...">
          </div>
          <div id="carte-livraison"
            class="w-full h-48 bg-gray-100 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 text-sm">
            <div class="text-center">
              <i class="fa-solid fa-map text-3xl text-gray-300 mb-2 block"></i>
              <span>Carte de livraison</span><br>
              <button type="button" onclick="geolocaliser()"
                class="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1 mx-auto">
                <i class="fa-solid fa-location-crosshairs"></i> Utiliser ma position
              </button>
            </div>
          </div>
          <div id="frais-livraison-detail" class="mt-2 text-xs text-gray-500"></div>
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">Notes (facultatif)</label>
          <textarea id="client-notes" maxlength="500" rows="2"
            class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 resize-none"
            placeholder="Instructions particulières, étage, code..."></textarea>
        </div>

        <!-- Code promo -->
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">
            <i class="fa-solid fa-ticket mr-1"></i> Code promo (facultatif)
          </label>
          <div class="flex gap-2">
            <input id="promo-input" type="text" maxlength="20" autocomplete="off"
              class="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
              placeholder="EX : PROMO20"
              onkeydown="if(event.key==='Enter'){event.preventDefault();appliquerCodePromo();}">
            <button id="promo-btn" type="button" onclick="appliquerCodePromo()"
              class="btn-primary px-4 py-3 rounded-xl text-sm font-bold transition-colors">
              Appliquer
            </button>
          </div>
          <p id="promo-message" class="text-xs mt-1"></p>
        </div>

        <!-- Récapitulatif -->
        <div class="bg-gray-50 rounded-xl p-4">
          <div class="flex justify-between text-sm mb-1">
            <span class="text-gray-600">Sous-total</span>
            <span id="recap-sous-total" class="font-semibold">0 FCFA</span>
          </div>
          <div id="recap-promo-row" class="flex justify-between text-sm mb-1 hidden">
            <span class="text-green-600 font-medium"><i class="fa-solid fa-ticket mr-1"></i>Remise promo</span>
            <span id="recap-remise" class="font-semibold text-green-600">— FCFA</span>
          </div>
          <div class="flex justify-between text-sm mb-3">
            <span class="text-gray-600">Frais de livraison</span>
            <span id="recap-livraison" class="font-semibold">— FCFA</span>
          </div>
          <div class="flex justify-between font-bold text-base border-t border-gray-200 pt-2">
            <span>Total</span>
            <span id="recap-total" class="text-primary">— FCFA</span>
          </div>
        </div>

        <button type="submit" id="submit-btn"
          class="btn-primary w-full font-bold py-4 rounded-xl flex items-center justify-center gap-2 text-base transition-all">
          <i class="fa-brands fa-whatsapp"></i>
          <span>Confirmer et envoyer sur WhatsApp</span>
        </button>
        <p class="text-xs text-gray-400 text-center">
          En confirmant, vous serez redirigé vers WhatsApp pour finaliser avec le restaurant.
        </p>
      </form>
    </div>
  </div>

  <!-- Footer boutique restaurant -->
  <footer class="bg-gray-900 text-white pt-10 pb-8 mt-12">
    <div class="max-w-3xl mx-auto px-4">
      <div class="flex flex-col sm:flex-row sm:items-start gap-8">
        <!-- Identité restaurant -->
        <div class="flex-1">
          <div class="flex items-center gap-3 mb-3">
            ${tenant.logo_url
              ? `<img src="${tenant.logo_url}" alt="${tenant.nom}" class="w-10 h-10 rounded-lg object-cover border border-gray-700">`
              : `<div class="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-base flex-shrink-0" style="background-color:${primaryColor}">${tenant.nom.charAt(0)}</div>`
            }
            <span class="font-bold text-lg">${tenant.nom}</span>
          </div>
          <a href="https://wa.me/${tenant.whatsapp_number.replace(/[^0-9]/g, '')}"
             target="_blank" rel="noopener"
             class="inline-flex items-center gap-2 text-sm text-green-400 hover:text-green-300 transition-colors font-medium">
            <i class="fa-brands fa-whatsapp text-base"></i>
            ${tenant.whatsapp_number}
          </a>
          ${tenant.pdv_adresse ? `
          <div class="mt-2 text-sm text-gray-400 flex items-start gap-2">
            <i class="fa-solid fa-location-dot mt-0.5 flex-shrink-0 text-gray-500"></i>
            <span>${tenant.pdv_adresse}</span>
          </div>` : ''}
          ${tenant.pdv_latitude && tenant.pdv_longitude ? `
          <a href="https://www.google.com/maps?q=${tenant.pdv_latitude},${tenant.pdv_longitude}"
             target="_blank" rel="noopener"
             class="mt-2 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
            <i class="fa-solid fa-map-location-dot"></i>
            Voir sur la carte
          </a>` : ''}
        </div>

        <!-- Horaires -->
        ${tenant.pdv_horaires ? `
        <div class="sm:w-56">
          <div class="font-semibold text-sm mb-2 text-gray-300 flex items-center gap-2">
            <i class="fa-regular fa-clock"></i> Horaires
          </div>
          <div class="text-sm text-gray-400 whitespace-pre-line leading-relaxed">${tenant.pdv_horaires}</div>
        </div>` : ''}
      </div>

      <div class="border-t border-gray-800 mt-8 pt-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
        <span>© ${currentYear} ${tenant.nom} — Propulsé par <a href="/" class="text-red-400 hover:text-red-300">${nomProjet}</a></span>
        <div class="flex gap-4">
          <a href="/legal/cgu" class="hover:text-gray-300 transition-colors">CGU</a>
          <a href="/legal/confidentialite" class="hover:text-gray-300 transition-colors">Confidentialité</a>
          <a href="/contact" class="hover:text-gray-300 transition-colors">Contact</a>
        </div>
      </div>
    </div>
  </footer>

  <script src="/static/js/boutique.js"></script>
  <script>
    const TENANT_ID = '${tenant.id}';
    const TENANT_SLUG = '${tenant.slug}';
    const WHATSAPP_NUMBER = '${tenant.whatsapp_number}';
    const PRIMARY_COLOR = '${primaryColor}';
    if (typeof initBoutique === 'function') initBoutique(TENANT_ID, TENANT_SLUG);
  </script>
</body>
</html>`
}
