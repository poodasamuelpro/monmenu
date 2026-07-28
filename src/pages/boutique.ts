// src/pages/boutique.ts — Page boutique d'un restaurant (vue client)
// ⚠️ TOUJOURS en mode LIGHT uniquement — pas de dark mode ici
//
// FIX (popup suivi + bouton panier) —
//   1. #track-order-btn contient désormais un badge #track-order-status,
//      rafraîchi en direct par boutique.js (actualiserBadgeSuivi), pour que
//      le client voie l'avancement de sa commande sans rouvrir la page suivi.
//   2. #cart-btn (bouton panier flottant) est réduit et repositionné en bas
//      à DROITE (bottom-5 right-4) au lieu du centre, comme demandé — plus
//      discret, ne masque plus le contenu central sur mobile.
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
  const jourFr = jours[jourIdx]
  const jourEn = joursEn[jourIdx]

  const entry = horaires[jourFr] || horaires[jourEn] || null
  if (!entry) return { ouvert: false, label: 'Fermé aujourd\'hui' }

  const estOuvert = entry.ouvert !== false && entry.open !== false
  if (!estOuvert) return { ouvert: false, label: 'Fermé aujourd\'hui' }

  const debut = entry.debut || entry.start || null
  const fin = entry.fin || entry.end || null

  if (!debut || !fin) return { ouvert: true, label: 'Ouvert' }

  // Vérifier si on est dans la plage horaire (gère le passage après minuit,
  // ex : 10:00 - 00:00, où "fin" == "00:00" doit être traité comme 24:00)
  const [hD, mD] = debut.split(':').map(Number)
  const [hF, mF] = fin.split(':').map(Number)
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
function renderHorairesTable(horaireRaw: string | null | undefined): string {
  if (!horaireRaw) {
    return `<p class="text-xs text-gray-500">Horaires non renseignés.</p>`
  }

  let horaires: Record<string, { ouvert?: boolean; debut?: string; fin?: string; open?: boolean; start?: string; end?: string }> | null = null
  try {
    horaires = typeof horaireRaw === 'string' ? JSON.parse(horaireRaw) : horaireRaw
  } catch {
    return `<div class="text-sm text-gray-400 whitespace-pre-line leading-relaxed">${horaireRaw}</div>`
  }

  if (!horaires) return `<p class="text-xs text-gray-500">Horaires non renseignés.</p>`

  const joursFr = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
  const joursEn = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const joursLabels: Record<string, string> = {
    lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer', jeudi: 'Jeu',
    vendredi: 'Ven', samedi: 'Sam', dimanche: 'Dim'
  }

  const jourActuelIdx = new Date().getDay() // 0=dim
  const jourActuelFr = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][jourActuelIdx]

  const lignes = joursFr.map((jour, i) => {
    const entry = horaires![jour] || horaires![joursEn[i]] || null
    const estAujourdhui = jour === jourActuelFr
    const estOuvert = entry && entry.ouvert !== false && entry.open !== false
    const debut = entry?.debut || entry?.start || null
    const fin = entry?.fin || entry?.end || null
    const plage = (estOuvert && debut && fin) ? `${debut} – ${fin}` : (estOuvert ? 'Ouvert' : 'Fermé')

    return `<tr class="${estAujourdhui ? 'font-semibold bg-gray-800' : ''}">
      <td class="py-1.5 pr-3 text-${estAujourdhui ? 'white' : 'gray-400'} text-xs">${joursLabels[jour]}${estAujourdhui ? ' ●' : ''}</td>
      <td class="py-1.5 text-xs ${estOuvert ? 'text-gray-200' : 'text-gray-500'}">${plage}</td>
    </tr>`
  })

  return `<table class="w-full">${lignes.join('')}</table>`
}

export function renderBoutiquePage(tenant: TenantBoutique, nomProjet: string): string {
  const primaryColor = tenant.couleur_primaire || '#DC2626'
  const secondaryColor = tenant.couleur_secondaire || '#1D4ED8'
  const currentYear = new Date().getFullYear()

  const boutiqueUrl = `/${tenant.slug}`
  const description = `Commandez vos plats chez ${tenant.nom} sur ${nomProjet}. Livraison ou retrait sur place.`

  // Calcul statut horaire depuis JSONB — recalculé côté client par
  // boutique.js (estOuvertMaintenant) pour rester exact toute la session.
  const statutHoraire = calculerStatutHoraire(tenant.pdv_horaires)

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
      hreflangAlternates: [
        { lang: 'fr', url: boutiqueUrl },
        { lang: 'x-default', url: boutiqueUrl }
      ],
      extra: \`<!-- Leaflet CSS — carte interactive livraison -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css">\`
    }
  )}
<!-- Forcer le mode light sur la boutique — pas de dark mode -->
<script>document.documentElement.classList.remove('dark');</script>
<body class="font-sans bg-gray-50 transition-colors">
  <style>
    :root {
      --color-primary: \${primaryColor};
      --color-secondary: \${secondaryColor};
    }
    .btn-primary { background-color: var(--color-primary); color: white; }
    .btn-primary:hover { filter: brightness(0.9); }
    .text-primary { color: var(--color-primary); }
    .border-primary { border-color: var(--color-primary); }
    .bg-primary { background-color: var(--color-primary); }
    .scrollbar-hide::-webkit-scrollbar { display: none; }
    .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

    /* §Images — tailles FIXES quelle que soit la photo fournie par le
       restaurant : object-fit: cover recadre toujours au centre, jamais
       d'étirement ni de débordement. C'est ce qui garantit un rendu
       homogène (bannière, logo, photos produits) indépendamment du format
       source de l'image uploadée. */
    .boutique-banniere {
      background-size: cover;
      background-position: center;
      height: 140px; /* hauteur fixe et raisonnable, jamais "trop grande" */
    }
    .logo-medaillon {
      width: 72px;
      height: 72px;
      object-fit: cover;
    }
    .logo-footer {
      width: 40px;
      height: 40px;
      object-fit: cover;
    }

    /* Pastille de statut horaire — couleur dynamique (ouvert = couleur du
       restaurant, fermé = rouge) pilotée en JS via la classe .statut-ferme */
    #statut-horaire-badge { background-color: \${primaryColor}1A; color: \${primaryColor}; }
    #statut-horaire-badge.statut-ferme { background-color: #FEE2E2; color: #DC2626; }

    /* §UX — le panier flottant se masque en douceur quand le footer est visible.
       FIX : plus de translate horizontal (-50%) car le bouton n'est plus centré
       mais ancré à droite — seul un léger décalage vertical est appliqué. */
    #cart-btn { transition: opacity .2s ease, transform .2s ease; }
    #cart-btn.cart-btn-masque { opacity: 0; transform: translateY(16px) scale(.95); pointer-events: none; }
  </style>

  <!-- En-tête boutique : bannière + logo médaillon + nom -->
  <header class="bg-white shadow-sm sticky top-0 z-30 transition-colors">
    <div class="relative">
      \${tenant.banniere_url
        ? \`<div class="boutique-banniere" style="background-image:url('\${tenant.banniere_url}')"></div>\`
        : \`<div class="boutique-banniere" style="background-color:\${primaryColor}"></div>\`
      }
      <div class="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent pointer-events-none"></div>

      <!-- Logo médaillon, taille fixe, chevauche la bannière -->
      <div class="absolute -bottom-7 left-4">
        \${tenant.logo_url
          ? \`<img src="\${tenant.logo_url}" alt="\${tenant.nom}" class="logo-medaillon rounded-2xl border-4 border-white shadow-lg bg-white">\`
          : \`<div class="w-[72px] h-[72px] rounded-2xl flex items-center justify-center text-white font-bold text-2xl border-4 border-white shadow-lg" style="background-color:\${primaryColor}">\${tenant.nom.charAt(0)}</div>\`
        }
      </div>

      <!-- Actions rapides (WhatsApp + suivi) en haut à droite de la bannière -->
      <div class="absolute top-3 right-3 flex items-center gap-2">
        <!-- FIX suivi — bouton toujours affiché tant qu'une commande a été
             passée sur cet appareil (plus de limite 48h), avec un badge de
             statut (#track-order-status) rafraîchi en direct par boutique.js. -->
        <a id="track-order-btn" href="#" class="hidden flex-shrink-0 items-center gap-1.5 text-xs font-semibold text-gray-700 bg-white/95 backdrop-blur px-3 py-2 rounded-xl shadow-sm hover:bg-white transition-colors">
          <i class="fa-solid fa-receipt"></i>
          <span class="hidden sm:inline">Suivre ma commande</span>
          <span id="track-order-status" class="text-[10px] font-bold text-primary"></span>
        </a>
        <a href="https://wa.me/\${tenant.whatsapp_number.replace(/[^0-9]/g, '')}"
           target="_blank" rel="noopener"
           class="flex-shrink-0 w-10 h-10 rounded-xl bg-green-500 hover:bg-green-600 flex items-center justify-center text-white shadow-sm transition-colors"
           title="Contacter sur WhatsApp">
          <i class="fa-brands fa-whatsapp text-lg"></i>
        </a>
      </div>
    </div>

    <!-- Nom + adresse, sous le logo -->
    <div class="max-w-3xl mx-auto px-4 pt-9 pb-3">
      <h1 class="font-bold text-xl text-gray-900 truncate">\${tenant.nom}</h1>
      \${tenant.pdv_adresse ? \`<div class="text-xs text-gray-400 truncate mt-0.5"><i class="fa-solid fa-location-dot mr-1"></i>\${tenant.pdv_adresse}</div>\` : ''}
    </div>

    <!-- Pastille de statut horaire -->
    <div class="max-w-3xl mx-auto px-4 pb-3">
      <div id="statut-horaire-badge" class="w-full text-center font-semibold text-sm rounded-2xl py-3 px-4 \${!statutHoraire.ouvert ? 'statut-ferme' : ''}">
        <i class="fa-solid \${statutHoraire.ouvert ? 'fa-circle-check' : 'fa-clock'} mr-1.5"></i>
        <span id="statut-horaire-label">\${statutHoraire.label}</span>
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
      \${Array(4).fill('<div class="animate-pulse bg-gray-200 rounded-2xl aspect-[3/4]"></div>').join('')}
    </div>
  </main>

  <!-- Bouton panier flottant — FIX : réduit et déplacé en bas à DROITE
       (bottom-5 right-4) au lieu d'être centré, taille et paddings réduits. -->
  <div id="cart-btn" class="fixed bottom-5 right-4 z-40 hidden">
    <button onclick="openCart()"
      class="btn-primary font-semibold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 min-w-[180px] justify-between relative text-sm">
      <span id="cart-ferme-tag" class="hidden absolute -top-2 -right-2 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">Fermé</span>
      <div class="flex items-center gap-1.5">
        <i class="fa-solid fa-basket-shopping"></i>
        <span>Mon panier</span>
      </div>
      <div class="flex items-center gap-2">
        <span id="cart-count" class="bg-white/20 px-1.5 py-0.5 rounded-lg text-xs">0</span>
        <span id="cart-total" class="font-bold">0 FCFA</span>
      </div>
    </button>
  </div>

  <!-- Footer boutique -->
  <footer class="bg-gray-900 text-white pt-12 pb-8 px-4 mt-auto transition-colors" id="boutique-footer">
    <div class="max-w-3xl mx-auto">
      <div class="flex flex-col sm:flex-row gap-8 justify-between items-start">
        <div class="max-w-xs">
          <div class="flex items-center gap-3 mb-4">
            \${tenant.logo_url
              ? \`<img src="\${tenant.logo_url}" alt="\${tenant.nom}" class="logo-footer rounded-xl bg-white p-0.5">\`
              : \`<div class="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg" style="background-color:\${primaryColor}">\${tenant.nom.charAt(0)}</div>\`
            }
            <span class="font-bold text-lg tracking-tight">\${tenant.nom}</span>
          </div>
          <p class="text-xs text-gray-400 leading-relaxed mb-5">
            Commandez vos plats préférés en quelques clics et faites-vous livrer ou récupérez-les sur place.
          </p>
          \${tenant.pdv_adresse ? \`<a href="https://www.google.com/maps/search/?api=1&query=\${encodeURIComponent(tenant.pdv_adresse)}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors bg-gray-800/50 px-3 py-2 rounded-xl">
            <i class="fa-solid fa-map-location-dot"></i>
            Voir sur la carte
          </a>\` : ''}
        </div>

        <!-- Horaires calculés depuis JSONB — toujours affiché (avec repli) -->
        <div class="sm:w-56">
          <div class="font-semibold text-sm mb-3 text-gray-300 flex items-center gap-2">
            <i class="fa-regular fa-clock"></i> Horaires
          </div>
          \${renderHorairesTable(tenant.pdv_horaires)}
        </div>
      </div>

      <div class="border-t border-gray-800 mt-8 pt-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
        <span>© \${currentYear} \${tenant.nom} — Propulsé par <a href="/" class="text-red-400 hover:text-red-300">\${nomProjet}</a></span>
        <div class="flex gap-4">
          <a href="/legal/cgu" class="hover:text-gray-300 transition-colors">CGU</a>
          <a href="/legal/confidentialite" class="hover:text-gray-300 transition-colors">Confidentialité</a>
          <a href="/contact" class="hover:text-gray-300 transition-colors">Contact</a>
        </div>
      </div>
    </div>
  </footer>

  <!-- Leaflet JS — carte interactive -->
  <script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js"></script>
  <script src="/static/js/main.js"></script>
  <script src="/static/js/boutique.js"></script>
  <script>
    const TENANT_SLUG = '\${tenant.slug}';
    const WHATSAPP_NUMBER = '\${tenant.whatsapp_number}';
    const PRIMARY_COLOR = '\${primaryColor}';
    if (typeof initBoutique === 'function') initBoutique(TENANT_SLUG, TENANT_SLUG);
  </script>
</body>
</html>\`
}
