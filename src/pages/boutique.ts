// src/pages/boutique.ts — Page boutique d'un restaurant (vue client)
// ⚠️ TOUJOURS en mode LIGHT uniquement — pas de dark mode ici
//
// FIX v2 (suite retours) —
//   1. #track-order-btn déplacé du header vers un bouton flottant EN BAS À
//      GAUCHE (symétrique du bouton panier en bas à droite), avec un badge
//      de statut affichant soit "Suivre ma commande" (aucune commande /
//      statut inconnu), soit le libellé exact du statut en cours
//      (ex : "En préparation"), rafraîchi en direct par boutique.js.
//   2. #cart-btn (bouton panier flottant) reste en bas à DROITE.
//   3. Bouton "retour en haut" (#back-to-top-btn) : masqué par défaut,
//      affiché par boutique.js quand l'utilisateur approche du bas de page,
//      ramène en douceur tout en haut (bannière/header).
//   4. Liens WhatsApp (contact direct restaurant, header + footer) : numéro
//      normalisé via formatWhatsAppNumber() pour éviter les liens cassés
//      quand le numéro est saisi avec "00" au lieu de "+", espaces, tirets,
//      parenthèses, etc.
//   5. Images légèrement réduites (bannière, logo médaillon, logo footer).
//   6. Footer horaires : jours strictement à GAUCHE, horaires strictement à
//      DROITE (alignement explicite, plus de rendu "centré"), police agrandie.
//   7. Modales (panier / checkout) : hauteur et défilement adaptés mobile
//      (meilleur usage de l'écran, scroll interne plus fluide).
//
// FIX 2026-07-30 — Ajout d'un message d'alerte "#position-manquante-hint"
// sous le bouton "Confirmer" du formulaire de commande. Il est piloté par
// boutique.js (mettreAJourEtatSubmit()) : affiché tant que la géolocalisation
// n'a pas été obtenue en mode livraison, ce qui rend visible pourquoi le
// bouton est désactivé (la position GPS est désormais obligatoire pour
// garantir que le message WhatsApp final contient les liens Maps/Waze).
//
// FIX 2026-08-12 — Retrait de l'icône WhatsApp flottante qui se trouvait en
// haut à droite de la bannière (bouton rond vert superposé à l'image). Le
// contact WhatsApp direct reste disponible via le footer (section Contact).
import { renderHead, jsonLdRestaurant } from '../components/head'

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

// §WhatsApp — Normalise un numéro pour un lien wa.me fiable :
//  - retire tout ce qui n'est pas un chiffre ou un "+"
//  - convertit un préfixe "00" (convention internationale alternative au
//    "+") en "+" avant de le retirer, pour ne pas générer un numéro erroné
//    du type wa.me/0022670000000 (qui ne fonctionne pas)
//  - retire enfin le "+" car wa.me n'accepte que des chiffres
// ⚠️ Ceci ne peut PAS deviner un indicatif pays manquant : si le restaurant
// a enregistré un numéro local sans indicatif (ex: "70 00 00 00"), le lien
// restera invalide. Le champ "Numéro WhatsApp" dans Paramètres doit exiger
// la saisie avec indicatif (+226...).
function formatWhatsAppNumber(numeroRaw: string | null | undefined): string {
  let n = (numeroRaw || '').replace(/[^0-9+]/g, '')
  if (n.startsWith('00')) n = '+' + n.slice(2)
  return n.replace(/\D/g, '')
}

// Calcul ouvert/fermé depuis JSONB horaires
// Format attendu : { "lundi": { "ouvert": true, "debut": "08:00", "fin": "22:00" }, ... }
// ou format alternatif string : on fait le mieux possible
function calculerStatutHoraire(horaireRaw: string | null | undefined): { ouvert: boolean; label: string } {
  if (!horaireRaw) return { ouvert: false, label: 'Horaires non disponibles' }

  let horaires: Record<string, { ouvert?: boolean; debut?: string; fin?: string; open?: boolean; start?: string; end?: string }> | null = null

  try {
    horaires = typeof horaireRaw === 'string' ? JSON.parse(horaireRaw) : horaireRaw
  } catch {
    return { ouvert: false, label: 'Horaires non disponibles' }
  }

  if (!horaires) return { ouvert: false, label: 'Horaires non disponibles' }

  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
  const joursEn = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const now = new Date()
  const jourIdx = now.getDay() // 0=dim, 1=lun...
  const jourFr = jours[jourIdx] as string
  const jourEn = joursEn[jourIdx] as string

  const entry = horaires[jourFr] || horaires[jourEn] || null
  if (!entry) return { ouvert: false, label: 'Fermé aujourd\'hui' }

  const estOuvert = entry.ouvert !== false && entry.open !== false
  if (!estOuvert) return { ouvert: false, label: 'Fermé aujourd\'hui' }

  const debut = entry.debut || entry.start || null
  const fin = entry.fin || entry.end || null

  if (!debut || !fin) return { ouvert: true, label: 'Ouvert' }

  // Vérifier si on est dans la plage horaire (gère le passage après minuit,
  // ex : 10:00 - 00:00, où "fin" == "00:00" doit être traité comme 24:00)
  const [hD = 0, mD = 0] = debut.split(':').map(Number)
  const [hF = 0, mF = 0] = fin.split(':').map(Number)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const debutMin = hD * 60 + mD
  let finMin = hF * 60 + mF
  if (finMin <= debutMin) finMin += 24 * 60

  if (nowMin >= debutMin && nowMin < finMin) {
    return { ouvert: true, label: `Ouvert — jusqu'à ${fin}` }
  } else if (nowMin < debutMin) {
    return { ouvert: false, label: `Prochaine ouverture aujourd'hui à ${debut}` }
  } else {
    return { ouvert: false, label: `Fermé — ouvre demain à ${debut}` }
  }
}

// Génère un tableau HTML des horaires hebdomadaires depuis le JSONB
// §Footer — jours strictement alignés à gauche, horaires strictement à
// droite (colonnes de largeurs fixes), police agrandie (text-xs -> text-sm).
function renderHorairesTable(horaireRaw: string | null | undefined): string {
  if (!horaireRaw) {
    return `<p class="text-sm text-gray-500">Horaires non renseignés.</p>`
  }

  let horaires: Record<string, { ouvert?: boolean; debut?: string; fin?: string; open?: boolean; start?: string; end?: string }> | null = null
  try {
    horaires = typeof horaireRaw === 'string' ? JSON.parse(horaireRaw) : horaireRaw
  } catch {
    return `<div class="text-sm text-gray-400 whitespace-pre-line leading-relaxed">${horaireRaw}</div>`
  }

  if (!horaires) return `<p class="text-sm text-gray-500">Horaires non renseignés.</p>`

  const joursFr = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
  const joursEn = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const joursLabels: Record<string, string> = {
    lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer', jeudi: 'Jeu',
    vendredi: 'Ven', samedi: 'Sam', dimanche: 'Dim'
  }

  const jourActuelIdx = new Date().getDay() // 0=dim
  const jourActuelFr = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][jourActuelIdx]

  const lignes = joursFr.map((jour, i) => {
    const entry = horaires![jour] || horaires![joursEn[i] as string] || null
    const estAujourdhui = jour === jourActuelFr
    const estOuvert = entry && entry.ouvert !== false && entry.open !== false
    const debut = entry?.debut || entry?.start || null
    const fin = entry?.fin || entry?.end || null
    const plage = (estOuvert && debut && fin) ? `${debut} – ${fin}` : (estOuvert ? 'Ouvert' : 'Fermé')

    return `<tr class="${estAujourdhui ? 'font-semibold bg-gray-800' : ''}">
      <td class="py-2 pl-2 pr-3 text-left align-middle text-${estAujourdhui ? 'white' : 'gray-400'} text-sm whitespace-nowrap">${joursLabels[jour]}${estAujourdhui ? ' ●' : ''}</td>
      <td class="py-2 pr-2 text-right align-middle text-sm whitespace-nowrap ${estOuvert ? 'text-gray-200' : 'text-gray-500'}">${plage}</td>
    </tr>`
  })

  return `<table class="w-full table-fixed"><colgroup><col style="width:40%"><col style="width:60%"></colgroup>${lignes.join('')}</table>`
}

export function renderBoutiquePage(tenant: TenantBoutique, nomProjet: string, nonce: string = ''): string {
  const primaryColor = tenant.couleur_primaire || '#DC2626'
  const secondaryColor = tenant.couleur_secondaire || '#1D4ED8'
  const currentYear = new Date().getFullYear()

  const boutiqueUrl = `/${tenant.slug}`
  const description = `Commandez vos plats chez ${tenant.nom} sur ${nomProjet}. Livraison ou retrait sur place.`

  // Calcul statut horaire depuis JSONB — recalculé côté client par
  // boutique.js (estOuvertMaintenant) pour rester exact toute la session.
  const statutHoraire = calculerStatutHoraire(tenant.pdv_horaires)
  const whatsappNumeroPropre = formatWhatsAppNumber(tenant.whatsapp_number)

  return `${renderHead(
    `${tenant.nom} — Commander en ligne | ${nomProjet}`,
    description,
    nomProjet,
    '',
    boutiqueUrl,
    {
      ogImage: tenant.logo_url ?? tenant.banniere_url ?? undefined,
      ogType: 'website',
      ogLocale: 'fr_FR',
      canonicalUrl: boutiqueUrl,
      jsonLd: jsonLdRestaurant({
        nom: tenant.nom,
        logoUrl: tenant.logo_url,
        adresse: tenant.pdv_adresse,
        latitude: tenant.pdv_latitude,
        longitude: tenant.pdv_longitude,
        horaires: typeof tenant.pdv_horaires === 'string' ? tenant.pdv_horaires : null,
        url: boutiqueUrl
      }),
      extra: `<!-- Leaflet CSS — carte interactive livraison -->
  <!-- S6-03 : SRI sha384 calculé sur leaflet@1.9.4/dist/leaflet.min.css -->
  <link rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css"
        integrity="sha384-b8ANgTJvdlAnWM5YGMpKn7Kodm+1k7NYNG9zdjTCcZcKatzYHwZ0RLdWarbJJVzU"
        crossorigin="anonymous">`
    }
  )}
<body class="font-sans bg-gray-50">
  <style>
    :root {
      --color-primary: ${primaryColor};
      --color-secondary: ${secondaryColor};
    }
    html { scroll-behavior: smooth; }
    .btn-primary { background-color: var(--color-primary); color: white; }
    .btn-primary:hover { filter: brightness(0.9); }
    .text-primary { color: var(--color-primary); }
    .border-primary { border-color: var(--color-primary); }
    .bg-primary { background-color: var(--color-primary); }
    .scrollbar-hide::-webkit-scrollbar { display: none; }
    .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

    /* §Images — tailles FIXES, légèrement réduites par rapport à la version
       précédente, quelle que soit la photo fournie par le restaurant :
       object-fit: cover recadre toujours au centre, jamais d'étirement ni
       de débordement. */
    .boutique-banniere {
      background-size: cover;
      background-position: center;
      height: 124px; /* réduit de 140px -> 124px */
    }
    .logo-medaillon {
      width: 64px; /* réduit de 72px -> 64px */
      height: 64px;
      object-fit: cover;
    }
    .logo-footer {
      width: 36px; /* réduit de 40px -> 36px */
      height: 36px;
      object-fit: cover;
    }

    /* Pastille de statut horaire — couleur dynamique (ouvert = couleur du
       restaurant, fermé = rouge) pilotée en JS via la classe .statut-ferme */
    #statut-horaire-badge { background-color: ${primaryColor}1A; color: ${primaryColor}; }
    #statut-horaire-badge.statut-ferme { background-color: #FEE2E2; color: #DC2626; }

    /* §UX — boutons flottants bas de page : panier (droite) + suivi de
       commande (gauche), sur la même ligne. Se masquent en douceur quand le
       footer entre dans le viewport (évite la superposition visuelle avec
       les horaires/contact du footer). */
    #cart-btn, #track-order-btn-wrap { transition: opacity .2s ease, transform .2s ease; }
    #cart-btn.cart-btn-masque, #track-order-btn-wrap.cart-btn-masque { opacity: 0; transform: translateY(16px) scale(.95); pointer-events: none; }

    /* §Retour en haut — masqué par défaut, affiché par boutique.js quand on
       approche du bas de la page. Positionné au-dessus du bouton panier
       pour ne jamais le chevaucher. */
    #back-to-top-btn {
      opacity: 0;
      transform: translateY(12px) scale(.9);
      pointer-events: none;
      transition: opacity .2s ease, transform .2s ease;
    }
    #back-to-top-btn.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    /* §Scroll modales — meilleur rendu mobile : la feuille occupe presque
       tout l'écran (au lieu de 85vh fixe), avec un défilement interne fluide
       (momentum iOS) et sans rebond qui entraîne le fond derrière elle. */
    .sheet-modal {
      max-height: 94vh;
      max-height: 94dvh;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }

    /* FIX 2026-07-30 — bouton Confirmer désactivé tant que la position GPS
       n'est pas connue (mode livraison). Le style disabled natif suffit
       pour le curseur/l'opacité (gérés en JS via classes), ceci évite juste
       un focus visuel trompeur sur un bouton non cliquable. */
    #submit-btn:disabled { pointer-events: none; }
  </style>

  <!-- En-tête boutique : bannière + logo médaillon + nom -->
  <header class="bg-white shadow-sm sticky top-0 z-30 transition-colors">
    <div class="relative">
      ${tenant.banniere_url
        ? `<div class="boutique-banniere" style="background-image:url('${tenant.banniere_url}')"></div>`
        : `<div class="boutique-banniere" style="background-color:${primaryColor}"></div>`
      }
      <div class="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent pointer-events-none"></div>

      <!-- Logo médaillon, taille fixe, chevauche la bannière -->
      <div class="absolute -bottom-6 left-4">
        ${tenant.logo_url
          ? `<img src="${tenant.logo_url}" alt="${tenant.nom}" class="logo-medaillon rounded-2xl border-4 border-white shadow-lg bg-white">`
          : `<div class="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-xl border-4 border-white shadow-lg" style="background-color:${primaryColor}">${tenant.nom.charAt(0)}</div>`
        }
      </div>
    </div>

    <!-- Nom + adresse, sous le logo -->
    <div class="max-w-3xl mx-auto px-4 pt-8 pb-3">
      <h1 class="font-bold text-xl text-gray-900 truncate">${tenant.nom}</h1>
      ${tenant.pdv_adresse ? `<div class="text-xs text-gray-400 truncate mt-0.5"><i class="fa-solid fa-location-dot mr-1"></i>${tenant.pdv_adresse}</div>` : ''}
    </div>

    <!-- Pastille de statut horaire -->
    <div class="max-w-3xl mx-auto px-4 pb-3">
      <div id="statut-horaire-badge" class="w-full text-center font-semibold text-sm rounded-2xl py-3 px-4 ${!statutHoraire.ouvert ? 'statut-ferme' : ''}">
        <i class="fa-solid ${statutHoraire.ouvert ? 'fa-circle-check' : 'fa-clock'} mr-1.5"></i>
        <span id="statut-horaire-label">${statutHoraire.label}</span>
      </div>
    </div>

    <!-- Catégories sticky, pastilles arrondies (rendu dynamique en JS) -->
    <div class="border-t border-gray-100 overflow-x-auto scrollbar-hide">
      <nav class="max-w-3xl mx-auto px-4 flex gap-2 py-3" id="categories-nav"></nav>
    </div>
  </header>

  <!-- Menu -->
  <main class="max-w-3xl mx-auto px-4 py-6 pb-32" id="menu-content">
    <!-- §Horaires — Bandeau visible uniquement si la boutique est fermée
         (affiché/masqué dynamiquement par actualiserStatutOuverture()) -->
    <div id="boutique-fermee-avertissement" class="hidden mb-4 rounded-xl border border-red-100 bg-red-50 text-red-700 text-sm px-4 py-3 flex items-center gap-2">
      <i class="fa-solid fa-circle-exclamation"></i>
      <span>Ce restaurant est actuellement fermé. La commande sera possible pendant ses horaires d'ouverture.</span>
    </div>
    <div class="grid grid-cols-2 gap-3" id="menu-skeleton">
      ${Array(4).fill('<div class="animate-pulse bg-gray-200 rounded-2xl aspect-[3/4]"></div>').join('')}
    </div>
  </main>

  <!-- §Retour en haut — visible uniquement en approchant du bas de page (géré en JS) -->
  <button id="back-to-top-btn"
    class="fixed bottom-24 right-4 z-40 w-11 h-11 rounded-full bg-gray-900/90 backdrop-blur text-white shadow-lg flex items-center justify-center hover:bg-gray-900 transition-colors"
    aria-label="Revenir en haut de la page">
    <i class="fa-solid fa-arrow-up"></i>
  </button>

  <!-- Bouton suivi de commande flottant — EN BAS À GAUCHE, symétrique du
       panier. Masqué tant qu'aucune commande n'a été passée sur cet
       appareil ; affiche le statut exact une fois une commande passée. -->
  <div id="track-order-btn-wrap" class="fixed bottom-5 left-4 z-40 hidden">
    <a id="track-order-btn" href="#"
      class="flex items-center gap-2 bg-white border border-gray-200 text-gray-800 font-semibold px-4 py-2.5 rounded-xl shadow-lg text-sm hover:bg-gray-50 transition-colors">
      <i class="fa-solid fa-receipt text-primary"></i>
      <span id="track-order-label">Suivre ma commande</span>
    </a>
  </div>

  <!-- Bouton panier flottant — EN BAS À DROITE -->
  <div id="cart-btn" class="fixed bottom-5 right-4 z-40 hidden">
    <button id="cart-open-btn"
      class="btn-primary font-semibold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 min-w-[180px] justify-between relative text-sm">
      <span id="cart-ferme-tag" class="hidden absolute -top-2 -right-2 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">Fermé</span>
      <div class="flex items-center gap-1.5">
        <div id="cart-count"
          class="bg-white text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center"
          style="color:${primaryColor}">0</div>
        <span>Panier</span>
      </div>
      <span id="cart-total" class="font-bold text-sm">0 FCFA</span>
    </button>
  </div>

  <!-- Modal Panier -->
  <div id="cart-modal" class="fixed inset-0 z-50 hidden">
    <div id="cart-overlay" class="absolute inset-0 bg-black/50"></div>
    <div class="sheet-modal absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl overflow-y-auto flex flex-col">
      <div class="sticky top-0 bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between z-10">
        <button id="cart-back-btn" class="flex items-center gap-1.5 p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium text-gray-600" aria-label="Retour">
          <i class="fa-solid fa-arrow-left"></i> Retour
        </button>
        <h2 class="font-bold text-lg text-gray-900">Votre commande</h2>
        <button id="cart-close-btn" class="p-2 hover:bg-gray-100 rounded-lg transition-colors" aria-label="Fermer">
          <i class="fa-solid fa-xmark text-gray-600"></i>
        </button>
      </div>
      <div id="cart-items" class="px-4 py-4 divide-y divide-gray-100"></div>
      <div id="cart-footer" class="sticky bottom-0 bg-white border-t border-gray-100 p-4 mt-auto"></div>
    </div>
  </div>

  <!-- Modal Checkout (confirmation / paiement) -->
  <div id="checkout-modal" class="fixed inset-0 z-50 hidden">
    <div id="checkout-overlay" class="absolute inset-0 bg-black/50"></div>
    <div class="sheet-modal absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl overflow-y-auto">
      <!-- §Retour — Bouton retour explicite (icône + texte) toujours visible
           en haut de la confirmation de commande / paiement. -->
      <div class="sticky top-0 bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 z-10">
        <button id="checkout-back-btn" class="flex items-center gap-1.5 p-2 -ml-2 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium text-gray-600" aria-label="Retour au panier">
          <i class="fa-solid fa-arrow-left"></i> Retour
        </button>
        <h2 class="font-bold text-lg text-gray-900">Finaliser la commande</h2>
      </div>
      <form id="checkout-form" class="px-4 py-6 space-y-5">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">
            Votre prénom et nom <span class="text-red-500">*</span>
          </label>
          <input id="client-nom" type="text" required minlength="2" maxlength="100"
            class="w-full border border-gray-200 bg-white text-gray-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 placeholder-gray-400"
            placeholder="Fatou Traoré">
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">
            Téléphone <span class="text-red-500">*</span>
          </label>
          <input id="client-tel" type="tel" required
            class="w-full border border-gray-200 bg-white text-gray-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 placeholder-gray-400"
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
          <!-- §Géoloc — Rempli automatiquement via géolocalisation navigateur
               + géocodage inverse, déclenché à l'ouverture du formulaire.
               Modifiable manuellement si besoin. -->
          <div class="relative mb-2">
            <i class="fa-solid fa-location-dot absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
            <input id="client-adresse" type="text"
              class="w-full border border-gray-200 bg-white text-gray-900 rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 placeholder-gray-400"
              placeholder="Quartier, rue, repère...">
          </div>
          <div id="carte-livraison"
            class="w-full h-48 bg-gray-100 rounded-xl border border-gray-200 overflow-hidden">
            <div class="flex items-center justify-center h-full text-gray-500 text-sm" id="carte-placeholder">
              <div class="text-center">
                <i class="fa-solid fa-map text-3xl text-gray-300 mb-2 block"></i>
                <span>Localisation en cours...</span><br>
                <button type="button" id="geolocate-btn"
                  class="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1 mx-auto">
                  <i class="fa-solid fa-location-crosshairs"></i> Utiliser ma position
                </button>
              </div>
            </div>
          </div>
          <div id="frais-livraison-detail" class="mt-2 text-xs text-gray-500"></div>
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">Notes (facultatif)</label>
          <textarea id="client-notes" maxlength="500" rows="2"
            class="w-full border border-gray-200 bg-white text-gray-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 resize-none placeholder-gray-400"
            placeholder="Instructions particulières, étage, code..."></textarea>
        </div>

        <!-- Code promo -->
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">
            <i class="fa-solid fa-ticket mr-1"></i> Code promo (facultatif)
          </label>
          <div class="flex gap-2">
            <input id="promo-input" type="text" maxlength="20" autocomplete="off"
              class="flex-1 border border-gray-200 bg-white text-gray-900 rounded-xl px-4 py-3 text-sm uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 placeholder-gray-400"
              placeholder="EX : PROMO20"
>
            <button id="promo-btn" type="button"
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
            <span id="recap-sous-total" class="font-semibold text-gray-900">0 FCFA</span>
          </div>
          <div id="recap-promo-row" class="flex justify-between text-sm mb-1 hidden">
            <span class="text-green-600 font-medium"><i class="fa-solid fa-ticket mr-1"></i>Remise promo</span>
            <span id="recap-remise" class="font-semibold text-green-600">— FCFA</span>
          </div>
          <div class="flex justify-between text-sm mb-3">
            <span class="text-gray-600">Frais de livraison</span>
            <span id="recap-livraison" class="font-semibold text-gray-900">— FCFA</span>
          </div>
          <div class="flex justify-between font-bold text-base border-t border-gray-200 pt-2">
            <span class="text-gray-900">Total</span>
            <span id="recap-total" class="text-primary">— FCFA</span>
          </div>
        </div>

        <!-- FIX 2026-07-30 — Message visible tant que la position GPS n'est
             pas connue en mode livraison (géré par boutique.js via
             mettreAJourEtatSubmit()). Le bouton "Confirmer" est désactivé
             en même temps, pour empêcher l'envoi d'une commande sans
             coordonnées (garantit les liens Maps/Waze dans le message). -->
        <p id="position-manquante-hint" class="hidden text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 flex items-center gap-1.5">
          <i class="fa-solid fa-location-crosshairs"></i>
          Position GPS requise pour la livraison — autorisez la géolocalisation ou déplacez le repère sur la carte ci-dessus.
        </p>

        <!-- §Confirmer — En confirmant, un onglet WhatsApp s'ouvre vers le
             restaurant avec le récap de commande pré-rempli (voir
             boutique.js:submitOrder), en plus de la redirection vers le
             suivi de commande. -->
        <button type="submit" id="submit-btn"
          class="btn-primary w-full font-bold py-4 rounded-xl flex items-center justify-center gap-2 text-base transition-all">
          <i class="fa-solid fa-check"></i>
          <span>Confirmer</span>
        </button>
        <p class="text-xs text-gray-400 text-center">
          En confirmant, votre commande est transmise directement au restaurant par WhatsApp.
        </p>
      </form>
    </div>
  </div>

  <!-- Footer boutique restaurant — logo, nom, contact (WhatsApp + adresse) et
       horaires : toujours affichés avec un texte de repli si une donnée est
       manquante, pour ne jamais laisser de section vide ou cassée. -->
  <footer class="bg-gray-900 text-white pt-10 pb-8 mt-12">
    <div class="max-w-3xl mx-auto px-4">
      <div class="flex flex-col sm:flex-row sm:items-start gap-8">
        <!-- Identité restaurant -->
        <div class="flex-1">
          <div class="flex items-center gap-3 mb-3">
            ${tenant.logo_url
              ? `<img src="${tenant.logo_url}" alt="${tenant.nom}" class="logo-footer rounded-lg object-cover border border-gray-700">`
              : `<div class="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style="background-color:${primaryColor}">${tenant.nom.charAt(0)}</div>`
            }
            <span class="font-bold text-lg">${tenant.nom}</span>
          </div>

          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Contact</div>
          <a href="https://wa.me/${whatsappNumeroPropre}"
             target="_blank" rel="noopener"
             class="inline-flex items-center gap-2 text-sm text-green-400 hover:text-green-300 transition-colors font-medium">
            <i class="fa-brands fa-whatsapp text-base"></i>
            ${tenant.whatsapp_number || 'Numéro non communiqué'}
          </a>
          <div class="mt-2 text-sm text-gray-400 flex items-start gap-2">
            <i class="fa-solid fa-location-dot mt-0.5 flex-shrink-0 text-gray-500"></i>
            <span>${tenant.pdv_adresse || 'Adresse non renseignée'}</span>
          </div>
          ${tenant.pdv_latitude && tenant.pdv_longitude ? `
          <a href="https://www.google.com/maps/search/?api=1&query=${tenant.pdv_latitude},${tenant.pdv_longitude}"
             target="_blank" rel="noopener"
             class="mt-2 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
            <i class="fa-solid fa-map-location-dot"></i>
            Voir sur la carte
          </a>` : ''}
        </div>

        <!-- Horaires calculés depuis JSONB — toujours affiché (avec repli).
             §Footer — jours à gauche / horaires à droite, police agrandie. -->
        <div class="sm:w-64 w-full">
          <div class="font-semibold text-sm mb-3 text-gray-300 flex items-center gap-2">
            <i class="fa-regular fa-clock"></i> Horaires
          </div>
          ${renderHorairesTable(tenant.pdv_horaires)}
        </div>
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

  <!-- Leaflet JS — carte interactive -->
  <!-- S6-03 : SRI sha384 calculé sur leaflet@1.9.4/dist/leaflet.min.js -->
  <script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js"
          integrity="sha384-u5N8qJeJOO2iqNjIKTdl6KeKsEikMAmCUBPc6sC6uGpgL34aPJ4VgNhuhumedpEk"
          crossorigin="anonymous"></script>
  <script src="/static/js/main.js"></script>
  <script src="/static/js/boutique.js"></script>
  <script nonce="${nonce}">
    const TENANT_SLUG = '${tenant.slug}';
    const WHATSAPP_NUMBER = '${tenant.whatsapp_number}';
    const PRIMARY_COLOR = '${primaryColor}';
    if (typeof initBoutique === 'function') initBoutique(TENANT_SLUG, TENANT_SLUG);

    // ═══════════════════════════════════════════
    // CSP-FIX (session 16) — Event listeners boutique
    // Remplace tous les onclick=/onsubmit=/onkeydown= inline
    // ═══════════════════════════════════════════
    (function() {
      var _ids = [
        ['back-to-top-btn', 'click',  function() { scrollToTop(); }],
        ['cart-open-btn',   'click',  function() { openCart(); }],
        ['cart-overlay',    'click',  function() { closeCart(); }],
        ['cart-back-btn',   'click',  function() { closeCart(); }],
        ['cart-close-btn',  'click',  function() { closeCart(); }],
        ['checkout-overlay','click',  function() { closeCheckout(); }],
        ['checkout-back-btn','click', function() { closeCheckout(); }],
        ['geolocate-btn',   'click',  function() { geolocaliser(); }],
        ['promo-btn',       'click',  function() { appliquerCodePromo(); }]
      ];
      _ids.forEach(function(t) {
        var el = document.getElementById(t[0]);
        if (el) el.addEventListener(t[1], t[2]);
      });

      // #checkout-form submit → submitOrder
      var form = document.getElementById('checkout-form');
      if (form) form.addEventListener('submit', function(e) { submitOrder(e); });

      // #promo-input onkeydown Enter → appliquerCodePromo
      var promoInput = document.getElementById('promo-input');
      if (promoInput) promoInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); appliquerCodePromo(); }
      });
    }());
  </script>
</body>
</html>`
}
