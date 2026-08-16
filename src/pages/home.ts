// =============================================================
// PAGE D'ACCUEIL — renderHomePage()
// i18n retiré — textes en français uniquement
// Dark mode retiré — mode clair forcé
// Design unifié selon charte mobile clair (référence)
// CORRECTION — les scripts loadPartenaires() et
// loadBoutiquesShowcase() construisaient leur HTML avec des
// onerror="..." contenant des apostrophes mal échappées (\' au
// lieu de \\'), ce qui cassait la syntaxe JS générée dans le
// <script nonce="${nonce}"> final et empêchait TOUT le script de s'exécuter
// (erreur silencieuse en console) — donc les sections logos et
// screenshots ne s'affichaient jamais, quel que soit le contenu
// renvoyé par l'API. Corrigé en construisant les éléments via
// document.createElement + assignation de .onerror en JS natif
// (pas de HTML concaténé avec attribut inline), ce qui élimine
// définitivement ce risque d'échappement à répétition.
// =============================================================
import { renderHead, jsonLdOrganization, jsonLdWebSite } from '../components/head'
import { renderNav } from '../components/nav'
import { renderFooter } from '../components/footer'

export function renderHomePage(nomProjet: string, nonce: string = ''): string {
  const description = `${nomProjet} est la plateforme de commande en ligne pour les restaurants d'Afrique de l'Ouest et Centrale. Créez votre boutique en quelques minutes. Sans commission.`

  return `${renderHead(
    `${nomProjet} — Commandez en ligne dans vos restaurants préférés`,
    description,
    nomProjet,
    '',
    '',
    {
      ogType: 'website',
      ogLocale: 'fr_FR',
      jsonLd: { '@context': 'https://schema.org', '@graph': [jsonLdOrganization(nomProjet), jsonLdWebSite(nomProjet)] }
    }
  )}
<body class="font-sans bg-white text-gray-900">
  <style>
    @keyframes partenaires-marquee {
      from { transform: translateX(0); }
      to { transform: translateX(-50%); }
    }
    .partenaires-scroll {
      animation: partenaires-marquee 30s linear infinite;
      width: max-content;
    }
    .partenaires-scroll:hover {
      animation-play-state: paused;
    }
    @keyframes boutiques-marquee {
      from { transform: translateX(0); }
      to { transform: translateX(-50%); }
    }
    .boutiques-scroll {
      animation: boutiques-marquee 50s linear infinite;
      width: max-content;
    }
    .boutiques-scroll:hover {
      animation-play-state: paused;
    }
    @media (prefers-reduced-motion: reduce) {
      .partenaires-scroll, .boutiques-scroll { animation: none; }
    }
  </style>

  ${renderNav(nomProjet, 'accueil')}

  <!-- ===================================================== -->
  <!-- HERO                                                   -->
  <!-- ===================================================== -->
  <section class="relative overflow-hidden bg-gradient-to-br from-red-50 via-white to-blue-50 py-20 lg:py-28" id="hero">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid lg:grid-cols-2 gap-12 items-center">

        <div>
          <div class="inline-flex items-center gap-2 bg-red-100 text-red-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <span class="w-1.5 h-1.5 rounded-full bg-red-600"></span>
            0% de commission sur vos ventes
          </div>

          <h1 class="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
            Votre restaurant,<br>
            <span class="text-red-600">en ligne</span> en<br>
            quelques minutes
          </h1>
          <p class="text-lg text-gray-600 leading-relaxed mb-8 max-w-lg">
            Créez votre boutique de commande en ligne, gérez vos commandes en temps réel et recevez des notifications WhatsApp instantanées. <strong class="text-gray-900">Sans commission. Abonnement fixe.</strong>
          </p>
          <div class="flex flex-col sm:flex-row gap-3">
            <a href="/inscription"
              class="inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-base shadow-lg shadow-red-200">
              <i class="fa-solid fa-store" aria-hidden="true"></i>
              <span>Créer mon menu gratuitement</span>
            </a>
            <a href="#comment-ca-marche"
              class="inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold px-6 py-3 rounded-xl border border-gray-200 transition-colors text-base">
              <i class="fa-regular fa-circle-play" aria-hidden="true"></i>
              <span>Voir comment ça marche</span>
            </a>
          </div>
          <div class="flex flex-wrap items-center gap-x-6 gap-y-2 mt-8 text-sm text-gray-500">
            <div class="flex items-center gap-1.5">
              <i class="fa-solid fa-circle-check text-red-600" aria-hidden="true"></i>
              <span>Sans engagement</span>
            </div>
            <div class="flex items-center gap-1.5">
              <i class="fa-solid fa-circle-check text-red-600" aria-hidden="true"></i>
              <span>Prêt en quelques minutes</span>
            </div>
            <div class="flex items-center gap-1.5">
              <i class="fa-solid fa-circle-check text-red-600" aria-hidden="true"></i>
              <span>Support en français</span>
            </div>
          </div>
        </div>

        <div class="relative mx-auto max-w-md lg:max-w-none">
          <div class="relative rounded-[28px] bg-gray-900 p-8 min-h-[420px] flex items-center justify-center overflow-hidden">
            <svg class="absolute inset-0 w-full h-full opacity-40" viewBox="0 0 400 420" preserveAspectRatio="none" aria-hidden="true">
              <path d="M50 100 C 140 160, 170 280, 310 380" stroke="#3A3630" stroke-width="2" stroke-dasharray="2 10" fill="none" stroke-linecap="round"/>
            </svg>
            <div class="absolute left-6 top-8 bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-lg">
              <i class="fa-solid fa-location-dot" aria-hidden="true"></i> Votre restaurant
            </div>

            <div class="relative w-56 rounded-3xl bg-white border-[6px] border-black shadow-2xl overflow-hidden">
              <div class="bg-red-600 px-4 pt-4 pb-9 text-white">
                <div class="font-bold text-sm">Votre boutique</div>
                <div class="text-[11px] opacity-85 mt-0.5 flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-white"></span> Ouvert maintenant
                </div>
              </div>
              <div class="p-3 -mt-6 space-y-2">
                <div class="bg-white rounded-2xl shadow p-2.5 flex items-center gap-2.5">
                  <div class="w-10 h-10 rounded-lg vignette-plat flex-shrink-0 overflow-hidden">
                    <img src="/api/v1/media/demo/plat-riz-gras.jpg" alt="Riz gras poulet" loading="lazy"
                      id="demo-img-riz"
                      class="w-full h-full object-cover">
                  </div>
                  <div>
                    <div class="text-xs font-bold text-gray-900">Riz gras poulet</div>
                    <div class="text-[11px] text-gray-500">2 500 FCFA</div>
                  </div>
                </div>
                <div class="bg-white rounded-2xl shadow p-2.5 flex items-center gap-2.5">
                  <div class="w-10 h-10 rounded-lg vignette-plat flex-shrink-0 overflow-hidden">
                    <img src="/api/v1/media/demo/plat-poulet-braise.jpg" alt="Poulet braisé" loading="lazy"
                      id="demo-img-poulet"
                      class="w-full h-full object-cover">
                  </div>
                  <div>
                    <div class="text-xs font-bold text-gray-900">Poulet braisé</div>
                    <div class="text-[11px] text-gray-500">3 000 FCFA</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="absolute right-4 bottom-10 bg-white rounded-2xl rounded-br-md shadow-xl p-3.5 w-48 text-xs">
              <div class="flex items-center gap-1.5 font-bold text-gray-900 mb-1">
                <i class="fa-brands fa-whatsapp text-green-500" aria-hidden="true"></i> Commande #42
              </div>
              <div class="text-gray-500">Riz gras poulet ×1 — Livraison confirmée</div>
            </div>
          </div>

          <div class="absolute -top-4 -right-4 bg-white rounded-2xl shadow-sm border border-gray-100 p-3 flex items-center gap-2">
            <div class="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center">
              <i class="fa-solid fa-check text-red-600 text-sm" aria-hidden="true"></i>
            </div>
            <div>
              <div class="text-xs font-bold text-gray-900">0% commission</div>
              <div class="text-xs text-gray-500">Sur vos ventes</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </section>

  <!-- ===================================================== -->
  <!-- RESTAURANTS PARTENAIRES — carrousel de logos            -->
  <!-- ===================================================== -->
  <section class="py-14 bg-gray-50 border-y border-gray-100" id="partenaires">
    <div id="partenaires-container" class="hidden">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 text-center">
        <p class="text-sm font-extrabold text-red-600 uppercase tracking-wider">
          Ils nous font confiance
        </p>
      </div>
      <div class="relative w-full overflow-hidden">
        <div class="pointer-events-none absolute inset-y-0 left-0 w-16 sm:w-32 bg-gradient-to-r from-gray-50 to-transparent z-10"></div>
        <div class="pointer-events-none absolute inset-y-0 right-0 w-16 sm:w-32 bg-gradient-to-l from-gray-50 to-transparent z-10"></div>
        <div id="partenaires-track" class="flex items-center gap-14 partenaires-scroll py-2"></div>
      </div>
    </div>
  </section>

  <!-- ===================================================== -->
  <!-- FONCTIONNALITÉS                                        -->
  <!-- ===================================================== -->
  <section class="py-20 bg-white" id="fonctionnalites">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-14">
        <h2 class="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
          Tout ce dont votre restaurant a besoin
        </h2>
        <p class="text-lg text-gray-600 max-w-2xl mx-auto">
          Une plateforme complète, simple à utiliser au quotidien pour booster votre activité.
        </p>
      </div>

      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        ${[
          { icon: 'fa-mobile-screen-button', title: 'Boutique en ligne', desc: 'Votre menu accessible via un lien unique ou QR code. Aucune application à télécharger.', accent: 'rouge' },
          { icon: 'fa-brands fa-whatsapp', title: 'Notifications WhatsApp', desc: 'Chaque commande arrive instantanément sur votre WhatsApp, prête à confirmer.', accent: 'rouge' },
          { icon: 'fa-chart-line', title: 'Tableau de bord', desc: 'Statistiques claires, historique complet et gestion du menu en temps réel.', accent: 'rouge' },
          { icon: 'fa-location-dot', title: 'Livraison géolocalisée', desc: "Frais de livraison calculés automatiquement selon la distance, l'heure et la météo.", accent: 'rouge' },
          { icon: 'fa-qrcode', title: 'QR Code imprimable', desc: "Généré automatiquement pour chaque boutique, à afficher dans votre établissement.", accent: 'rouge' },
          { icon: 'fa-palette', title: 'Personnalisation', desc: 'Votre boutique à votre image : logo et couleurs, indépendants de la charte MonMenu.', accent: 'rouge' },
        ].map(f => `
          <article class="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all card-hover">
            <div class="w-11 h-11 text-red-600 bg-red-50 rounded-xl flex items-center justify-center mb-5 text-xl">
              <i class="fa-solid ${f.icon}" aria-hidden="true"></i>
            </div>
            <h3 class="text-lg font-bold text-gray-900 mb-2">${f.title}</h3>
            <p class="text-sm text-gray-600 leading-relaxed">${f.desc}</p>
          </article>`
        ).join('')}
      </div>
    </div>
  </section>

  <!-- ===================================================== -->
  <!-- COMMENT ÇA MARCHE                                      -->
  <!-- ===================================================== -->
  <section class="py-20 bg-gray-50" id="comment-ca-marche">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <h2 class="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-6">
            Prêt en 3 étapes
          </h2>
          <div class="space-y-8">
            <div class="flex gap-5">
              <div class="flex-shrink-0 w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center font-bold shadow-lg shadow-red-200">1</div>
              <div>
                <h3 class="text-xl font-bold text-gray-900 mb-1">Inscrivez votre restaurant</h3>
                <p class="text-gray-600">Créez votre compte et renseignez vos informations de base en 2 minutes.</p>
              </div>
            </div>
            <div class="flex gap-5">
              <div class="flex-shrink-0 w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center font-bold shadow-lg shadow-red-200">2</div>
              <div>
                <h3 class="text-xl font-bold text-gray-900 mb-1">Ajoutez vos produits</h3>
                <p class="text-gray-600">Importez votre menu, ajoutez des photos et fixez vos prix.</p>
              </div>
            </div>
            <div class="flex gap-5">
              <div class="flex-shrink-0 w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center font-bold shadow-lg shadow-red-200">3</div>
              <div>
                <h3 class="text-xl font-bold text-gray-900 mb-1">Commencez à vendre</h3>
                <p class="text-gray-600">Partagez votre lien et recevez vos premières commandes sur WhatsApp.</p>
              </div>
            </div>
          </div>
          <div class="mt-10">
            <a href="/inscription" class="text-red-600 font-bold flex items-center gap-2 hover:underline">
              Créer ma boutique maintenant
              <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </a>
          </div>
        </div>

        <div class="relative">
          <div class="aspect-video rounded-2xl bg-gray-200 overflow-hidden shadow-2xl border-8 border-white">
             <div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                <i class="fa-solid fa-play text-5xl text-gray-400" aria-hidden="true"></i>
             </div>
          </div>
          <div class="absolute -bottom-6 -left-6 bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3">
             <div class="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <i class="fa-brands fa-whatsapp text-green-600 text-xl" aria-hidden="true"></i>
             </div>
             <div>
                <div class="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Nouvelle commande</div>
                <div class="text-sm font-bold text-gray-900">Reçue en 0.5s</div>
             </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ===================================================== -->
  <!-- TARIFS                                                 -->
  <!-- ===================================================== -->
  <section class="py-20 bg-white" id="tarifs">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-14">
        <h2 class="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
          Des tarifs simples et transparents
        </h2>
        <p class="text-lg text-gray-600 max-w-2xl mx-auto">
          Aucun frais caché. Aucune commission sur vos ventes. Annulez à tout moment.
        </p>
      </div>

      <div id="plans-container" class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        ${[1, 2, 3, 4].map(() => `
          <div class="animate-pulse bg-gray-50 rounded-2xl p-8 h-96 border border-gray-100">
            <div class="h-4 bg-gray-200 rounded w-1/2 mb-6"></div>
            <div class="h-10 bg-gray-200 rounded w-3/4 mb-4"></div>
            <div class="space-y-3">
              <div class="h-3 bg-gray-200 rounded w-full"></div>
              <div class="h-3 bg-gray-200 rounded w-5/6"></div>
              <div class="h-3 bg-gray-200 rounded w-4/6"></div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="mt-12 text-center">
        <p class="text-gray-500 text-sm">
          <i class="fa-solid fa-circle-info mr-1" aria-hidden="true"></i>
          Tous les plans incluent le support technique 24/7 et les mises à jour automatiques.
        </p>
      </div>
    </div>
  </section>

  <!-- ===================================================== -->
  <!-- FAQ                                                    -->
  <!-- ===================================================== -->
  <section class="py-20 bg-gray-50" id="faq">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-12">
        <h2 class="text-3xl font-extrabold text-gray-900">Questions fréquentes</h2>
      </div>

      <div class="space-y-4" id="faq-list">
        ${[
          { q: 'Est-ce vraiment 0% de commission ?', a: "Oui. Contrairement aux autres plateformes qui prennent 15% à 30% sur chaque commande, MonMenu ne facture qu'un abonnement fixe mensuel ou annuel. Tout le revenu de vos ventes vous revient directement." },
          { q: "Ai-je besoin d'un ordinateur pour gérer ma boutique ?", a: 'Non. Tout le tableau de bord est "mobile-first". Vous pouvez gérer vos produits, vos prix et vos commandes directement depuis votre smartphone.' },
          { q: 'Comment les clients payent-ils ?', a: 'MonMenu facilite la prise de commande. Le paiement se fait directement entre vous et le client (espèces à la livraison, mobile money, etc.) selon vos méthodes habituelles.' },
          { q: 'Puis-je utiliser mon propre nom de domaine ?', a: 'Oui, avec les plans Professionnel et Entreprise, vous pouvez lier votre propre domaine (ex: www.votre-restaurant.com) à votre boutique.' },
          { q: 'WhatsApp est-il obligatoire ?', a: "WhatsApp est notre canal de notification privilégié car utilisé par tous en Afrique, mais vous recevez aussi toutes les commandes dans votre tableau de bord en temps réel." },
          { q: 'Combien de temps pour être en ligne ?', a: "Si vous avez votre menu prêt, vous pouvez être en ligne en moins de 10 minutes. L'inscription est instantanée." },
          { q: 'Y a-t-il un engagement ?', a: 'Non. Vous pouvez résilier votre abonnement à tout moment depuis votre tableau de bord. Aucun frais de sortie.' },
          { q: 'Fournissez-vous des livreurs ?', a: "Non, MonMenu est un outil technique. Vous utilisez vos propres livreurs ou votre partenaire habituel. Nous fournissons l'outil de géolocalisation pour simplifier leur travail." },
          { q: 'Est-ce disponible dans mon pays ?', a: "MonMenu est optimisé pour l'Afrique de l'Ouest et Centrale (Sénégal, Côte d'Ivoire, Cameroun, Mali, Burkina Faso, etc.) mais fonctionne partout dans le monde." },
        ].map((item, idx) => `
          <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button class="faq-btn w-full px-6 py-5 text-left flex items-center justify-between font-bold text-gray-900 hover:bg-gray-50 transition-colors"
                    type="button" aria-expanded="false">
              <span>${item.q}</span>
              <i class="fa-solid fa-chevron-down text-xs transition-transform" aria-hidden="true"></i>
            </button>
            <div class="px-6 pb-5 text-gray-600 text-sm leading-relaxed hidden">
              ${item.a}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- ===================================================== -->
  <!-- BOUTIQUES EN VITRINE — carrousel screenshots           -->
  <!-- ===================================================== -->
  <section class="py-20 bg-gray-50" id="boutiques-showcase">
    <div id="boutiques-showcase-container" class="hidden">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-10 text-center">
        <h2 class="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
          Vos boutiques, <span class="text-red-600">en vitrine</span>
        </h2>
        <p class="text-gray-600 max-w-2xl mx-auto">
          Un aperçu de ce que vos clients verront dès qu'ils ouvriront votre boutique MonMenu.
        </p>
      </div>
      <div class="relative w-full overflow-hidden">
        <div class="pointer-events-none absolute inset-y-0 left-0 w-16 sm:w-32 bg-gradient-to-r from-gray-50 to-transparent z-10"></div>
        <div class="pointer-events-none absolute inset-y-0 right-0 w-16 sm:w-32 bg-gradient-to-l from-gray-50 to-transparent z-10"></div>
        <div id="boutiques-showcase-track" class="flex items-start gap-8 boutiques-scroll py-4"></div>
      </div>
    </div>
  </section>

  <!-- ===================================================== -->
  <!-- CTA FINAL                                              -->
  <!-- ===================================================== -->
  <section class="py-20 bg-white">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="bg-red-600 rounded-3xl p-10 sm:p-16 text-center text-white relative overflow-hidden shadow-2xl shadow-red-200">
        <svg class="absolute top-0 right-0 w-64 h-64 opacity-10 translate-x-20 -translate-y-20" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="100" fill="white"/>
        </svg>

        <h2 class="text-3xl sm:text-4xl font-extrabold mb-6 relative z-10">
          Prêt à booster vos ventes ?
        </h2>
        <p class="text-lg opacity-90 mb-10 max-w-xl mx-auto relative z-10">
          Rejoignez des centaines de restaurants qui utilisent déjà MonMenu pour simplifier leur commande en ligne.
        </p>
        <div class="flex flex-col sm:flex-row justify-center gap-4 relative z-10">
          <a href="/inscription" class="bg-white text-red-600 font-bold px-8 py-3 rounded-xl hover:bg-gray-50 transition-colors shadow-sm">
            Créer ma boutique
          </a>
          <a href="/contact" class="bg-red-700 text-white font-bold px-8 py-3 rounded-xl hover:bg-red-800 transition-colors border border-red-500">
            Contacter un conseiller
          </a>
        </div>
      </div>
    </div>
  </section>

  ${renderFooter(nomProjet, nonce)}

  <!-- Script pour charger les plans dynamiquement -->
  <script nonce="${nonce}">
    async function loadPlans() {
      const container = document.getElementById('plans-container');
      try {
        const res = await fetch('/api/v1/plans');
        const data = await res.json();
        const plans = Array.isArray(data) ? data : (data.plans || []);
        const devise = (data && data.devise) || 'FCFA';
        if (plans.length > 0) {
          const maxPrix = Math.max.apply(null, plans.map(function (p) { return p.prix_mensuel || 0; }));

          container.innerHTML = plans.map(function (p) {
            const f = p.fonctionnalites || {};
            const isPopular = !!f.recommande;
            const isTopTier = !isPopular && p.prix_mensuel === maxPrix && maxPrix > 0;
            const accentBorder = isPopular
              ? 'border-red-500 ring-4 ring-red-500/10'
              : (isTopTier ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-gray-100');

            const features = [];
            if (typeof f.produits_max === 'number') {
              features.push(f.produits_max === -1 ? 'Produits illimités' : f.produits_max + ' produits max');
            }
            if (typeof f.categories_max === 'number') {
              features.push(f.categories_max === -1 ? 'Catégories illimitées' : f.categories_max + ' catégories max');
            }
            const featureLabels = {
              boutique_en_ligne: 'Boutique en ligne',
              qr_code: 'QR Code',
              notifications_whatsapp: 'Notifications WhatsApp',
              statistiques_avancees: 'Statistiques avancées',
              codes_promo: 'Codes promo',
              export_csv: 'Export CSV',
              support_whatsapp_prioritaire: 'Support WhatsApp prioritaire',
              multi_boutique: 'Multi-boutique',
              onboarding_dedie: 'Onboarding dédié',
              acces_api: 'Accès API',
            };
            Object.keys(featureLabels).forEach(function (key) {
              if (f[key]) features.push(featureLabels[key]);
            });

            return \`
            <div class="bg-white rounded-2xl p-8 border \${accentBorder} shadow-sm flex flex-col relative">
              \${isPopular ? '<span class="absolute -top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">Le plus populaire</span>' : ''}
              \${isTopTier ? '<span class="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">Meilleure valeur</span>' : ''}
              <h3 class="text-lg font-bold text-gray-900 mb-2">\${p.nom}</h3>
              \${f.sous_titre ? \`<p class="text-xs text-gray-500 mb-4">\${f.sous_titre}</p>\` : ''}
              <div class="mb-6">
                <span class="text-3xl font-extrabold text-gray-900">\${new Intl.NumberFormat().format(p.prix_mensuel)}</span>
                <span class="text-gray-500 text-sm">\${devise}/mois</span>
              </div>
              <ul class="space-y-4 mb-8 flex-grow">
                \${features.map(function (feat) {
                  return '<li class="flex items-start gap-3 text-sm text-gray-600"><i class="fa-solid fa-check text-green-500 mt-0.5" aria-hidden="true"></i><span>' + feat + '</span></li>';
                }).join('')}
              </ul>
              <a href="/inscription?plan=\${p.id}" class="w-full py-3 rounded-xl font-bold text-center transition-all bg-red-600 text-white hover:bg-red-700 shadow-sm">
                Choisir ce plan
              </a>
            </div>
          \`;
          }).join('');
        }
      } catch (err) {
        console.error('Erreur chargement plans:', err);
      }
    }
    loadPlans();

    // ---- FAQ accordion — event delegation (remplace onclick inline bloqué par CSP L3) ----
    document.addEventListener('DOMContentLoaded', function() {
      var faqList = document.getElementById('faq-list');
      if (!faqList) return;
      faqList.addEventListener('click', function(e) {
        var btn = e.target.closest('.faq-btn');
        if (!btn) return;
        var panel = btn.nextElementSibling;
        if (!panel) return;
        var isOpen = !panel.classList.contains('hidden');
        panel.classList.toggle('hidden', isOpen);
        btn.setAttribute('aria-expanded', String(!isOpen));
        var icon = btn.querySelector('i');
        if (icon) icon.classList.toggle('rotate-180', !isOpen);
      });

      // ---- onerror images demo (remplace onerror inline bloqué par CSP L3) ----
      var demoRiz = document.getElementById('demo-img-riz');
      if (demoRiz) demoRiz.onerror = function() {
        var i = document.createElement('i');
        i.className = 'fa-solid fa-bowl-rice text-red-500 text-sm flex items-center justify-center w-full h-full';
        demoRiz.replaceWith(i);
      };
      var demoPoulet = document.getElementById('demo-img-poulet');
      if (demoPoulet) demoPoulet.onerror = function() {
        var i = document.createElement('i');
        i.className = 'fa-solid fa-drumstick-bite text-blue-500 text-sm flex items-center justify-center w-full h-full';
        demoPoulet.replaceWith(i);
      };
    });
  </script>

  <!-- Script pour charger le carrousel des restaurants partenaires -->
  <!-- CORRIGÉ — construction des éléments via document.createElement -->
  <!-- + assignation directe de .onerror en JS (plus de HTML concaténé -->
  <!-- avec attribut onerror="..." qui nécessitait 3 niveaux -->
  <!-- d'échappement de guillemets et cassait tout le script). -->
  <script nonce="${nonce}">
    async function loadPartenaires() {
      const container = document.getElementById('partenaires-container');
      const track = document.getElementById('partenaires-track');
      if (!container || !track) return;

      try {
        const res = await fetch('/api/v1/tenants?limit=16');
        if (!res.ok) return;
        const data = await res.json();
        const tenants = Array.isArray(data) ? data : (data.tenants || []);

        if (!tenants.length) return;

        function buildItem(tnt) {
          const nom = String(tnt.nom || '');
          const slug = String(tnt.slug || '');
          const logo = String(tnt.logo_url || '');
          const estEssai = tnt.statut === 'essai';

          const a = document.createElement('a');
          a.href = '/' + slug;
          a.title = nom;
          a.dataset.slug = slug;
          a.className = 'relative flex-shrink-0 flex items-center justify-center h-14 w-32 opacity-90 hover:opacity-100 hover:-translate-y-0.5 transition-all duration-300';

          if (estEssai) {
            const badge = document.createElement('span');
            badge.className = 'absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none z-10';
            badge.textContent = 'Nouveau';
            a.appendChild(badge);
          }

          const img = document.createElement('img');
          img.src = logo;
          img.alt = nom;
          img.loading = 'lazy';
          img.className = 'max-h-14 max-w-full object-contain';
          img.onerror = function () {
            console.warn('[partenaires] logo indisponible pour', slug, img.src);
            a.remove();
          };
          a.appendChild(img);

          return a;
        }

        const fragment = document.createDocumentFragment();
        // Deux passages pour un défilement continu (boucle infinie).
        tenants.concat(tenants).forEach(function (tnt) {
          fragment.appendChild(buildItem(tnt));
        });
        track.innerHTML = '';
        track.appendChild(fragment);
        track.style.animationDuration = Math.max(15, tenants.length * 3) + 's';

        // Laisser le temps aux <img> de tenter le chargement (et de se
        // retirer via onerror en cas d'échec) avant de décider si la
        // section vaut la peine d'être montrée.
        setTimeout(function () {
          const survivants = track.querySelectorAll('a').length;
          if (survivants > 0) {
            container.classList.remove('hidden');
          } else {
            container.classList.add('hidden');
          }
        }, 800);
      } catch (err) {
        console.error('Erreur chargement partenaires:', err);
      }
    }
    loadPartenaires();
  </script>

  <!-- Script pour charger le carrousel des captures d'écran boutique -->
  <!-- CORRIGÉ — même approche : construction via document.createElement -->
  <!-- pour éliminer le HTML concaténé fragile. -->
  <script nonce="${nonce}">
    async function loadBoutiquesShowcase() {
      const container = document.getElementById('boutiques-showcase-container');
      const track = document.getElementById('boutiques-showcase-track');
      if (!container || !track) return;

      try {
        const res = await fetch('/api/v1/tenants?limit=12');
        if (!res.ok) return;
        const data = await res.json();
        const tenants = Array.isArray(data) ? data : (data.tenants || []);

        if (!tenants.length) return;

        function buildPhoneCard(tnt) {
          const nom = String(tnt.nom || '');
          const slug = String(tnt.slug || '');

          const wrapper = document.createElement('div');
          wrapper.className = 'flex-shrink-0 w-[200px]';
          wrapper.dataset.slug = slug;

          const a = document.createElement('a');
          a.href = '/' + slug;
          a.title = nom;
          a.className = 'block group';

          const phone = document.createElement('div');
          phone.className = 'relative mx-auto w-[200px] h-[410px] rounded-[36px] bg-gray-900 p-[10px] shadow-2xl group-hover:scale-[1.03] transition-transform';

          const btnVolume1 = document.createElement('div');
          btnVolume1.className = 'absolute -left-[2px] top-20 w-[3px] h-8 bg-gray-700 rounded-l';
          const btnVolume2 = document.createElement('div');
          btnVolume2.className = 'absolute -left-[2px] top-32 w-[3px] h-12 bg-gray-700 rounded-l';
          const btnPower = document.createElement('div');
          btnPower.className = 'absolute -right-[2px] top-28 w-[3px] h-16 bg-gray-700 rounded-r';

          const screen = document.createElement('div');
          screen.className = 'relative w-full h-full rounded-[26px] overflow-hidden bg-white';

          const img = document.createElement('img');
          img.src = '/api/v1/screenshots/' + slug;
          img.alt = 'Aperçu boutique ' + nom;
          img.loading = 'lazy';
          img.className = 'w-full h-full object-cover object-top';
          img.onerror = function () {
            console.warn('[boutiques-showcase] screenshot indisponible pour', slug, img.src);
            wrapper.remove();
          };

          const notch = document.createElement('div');
          notch.className = 'absolute left-1/2 -translate-x-1/2 top-0 w-24 h-6 bg-gray-900 rounded-b-2xl';
          const homeIndicator = document.createElement('div');
          homeIndicator.className = 'absolute left-1/2 -translate-x-1/2 bottom-1.5 w-24 h-1 bg-gray-900/70 rounded-full';

          screen.appendChild(img);
          screen.appendChild(notch);
          screen.appendChild(homeIndicator);

          phone.appendChild(btnVolume1);
          phone.appendChild(btnVolume2);
          phone.appendChild(btnPower);
          phone.appendChild(screen);

          const label = document.createElement('p');
          label.className = 'text-center text-sm font-semibold text-gray-700 mt-4 truncate';
          label.textContent = nom;

          a.appendChild(phone);
          a.appendChild(label);
          wrapper.appendChild(a);

          return wrapper;
        }

        const fragment = document.createDocumentFragment();
        tenants.concat(tenants).forEach(function (tnt) {
          fragment.appendChild(buildPhoneCard(tnt));
        });
        track.innerHTML = '';
        track.appendChild(fragment);
        track.style.animationDuration = Math.max(25, tenants.length * 6) + 's';

        setTimeout(function () {
          const survivantes = track.querySelectorAll('.flex-shrink-0').length;
          if (survivantes > 0) {
            container.classList.remove('hidden');
          } else {
            container.classList.add('hidden');
          }
        }, 800);
      } catch (err) {
        console.error('Erreur chargement showcase boutiques:', err);
      }
    }
    loadBoutiquesShowcase();
  </script>
  <script src="/static/js/main.js"></script>
</body>
</html>`
}
