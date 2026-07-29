// =============================================================
// PAGE D'ACCUEIL — renderHomePage()
// AJOUT (statut essai/actif) — loadPartenaires() affiche désormais
// un badge "Nouveau" sur les restaurants en essai, distingués des
// restaurants actifs. La priorité/tri vient déjà de l'API
// (/api/v1/tenants, voir api-tenants.ts) — rien à changer côté ordre.
// =============================================================
import { renderHead, jsonLdOrganization, jsonLdWebSite } from '../components/head'
import { renderNav } from '../components/nav'
import { renderFooter } from '../components/footer'
import { getTranslations } from '../i18n'

export function renderHomePage(nomProjet: string, locale: string = 'fr'): string {
  const t = getTranslations(locale)
  const isEn = locale === 'en'

  const description = isEn
    ? `${nomProjet} is the online ordering platform for restaurants in West and Central Africa. Create your shop in minutes. No commission.`
    : `${nomProjet} est la plateforme de commande en ligne pour les restaurants d'Afrique de l'Ouest et Centrale. Créez votre boutique en quelques minutes. Sans commission.`

  const heroTitle = isEn
    ? `Your restaurant,<br>\n            <span class="text-red-600 dark:text-red-400">online</span> in<br>\n            minutes`
    : `Votre restaurant,<br>\n            <span class="text-red-600 dark:text-red-400">en ligne</span> en<br>\n            quelques minutes`

  const heroSubtitle = isEn
    ? `Create your online ordering shop, manage your orders in real time and receive instant WhatsApp notifications. <strong class="text-gray-900 dark:text-white">No commission. Fixed subscription.</strong>`
    : `Créez votre boutique de commande en ligne, gérez vos commandes en temps réel et recevez des notifications WhatsApp instantanées. <strong class="text-gray-900 dark:text-white">Sans commission. Abonnement fixe.</strong>`

  const heroCta = t.home.hero_cta
  const heroCta2 = isEn ? 'See how it works' : 'Voir comment ça marche'
  const zeroCommission = isEn ? '0% commission on your sales' : '0% de commission sur vos ventes'
  const trustItems = isEn
    ? ['No commitment', 'Ready in minutes', 'French & English support']
    : ['Sans engagement', 'Prêt en quelques minutes', 'Support en français']

  const partenairesLabel = isEn ? 'Trusted by restaurants across the region' : 'Ils nous font confiance'

  return `${renderHead(
    isEn ? `${nomProjet} — Order online at your favourite restaurants` : `${nomProjet} — Commandez en ligne dans vos restaurants préférés`,
    description,
    nomProjet,
    '',
    '',
    {
      ogType: 'website',
      ogLocale: isEn ? 'en_US' : 'fr_FR',
      jsonLd: { '@context': 'https://schema.org', '@graph': [jsonLdOrganization(nomProjet), jsonLdWebSite(nomProjet)] },
      hreflangAlternates: [
        { lang: 'fr', url: '/?lang=fr' },
        { lang: 'en', url: '/?lang=en' },
        { lang: 'x-default', url: '/' }
      ]
    }
  )}
<body class="font-sans bg-white dark:bg-[#0B0A09] text-gray-900 dark:text-gray-50 transition-colors">
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
    @media (prefers-reduced-motion: reduce) {
      .partenaires-scroll { animation: none; }
    }
  </style>

  ${renderNav(nomProjet, 'accueil', locale)}

  <!-- ===================================================== -->
  <!-- HERO                                                   -->
  <!-- ===================================================== -->
  <section class="relative overflow-hidden bg-gradient-to-br from-red-50 via-white to-blue-50 dark:from-[#1A0F0F] dark:via-[#0B0A09] dark:to-[#0B1220] py-20 lg:py-28" id="hero">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid lg:grid-cols-2 gap-12 items-center">

        <div>
          <div class="inline-flex items-center gap-2 bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <span class="w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-red-400"></span>
            ${zeroCommission}
          </div>

          <h1 class="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 dark:text-white leading-tight mb-6">
            ${heroTitle}
          </h1>
          <p class="text-lg text-gray-600 dark:text-gray-300 leading-relaxed mb-8 max-w-lg">
            ${heroSubtitle}
          </p>
          <div class="flex flex-col sm:flex-row gap-3">
            <a href="/inscription"
              class="inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500 text-white font-semibold px-6 py-3.5 rounded-xl transition-colors text-base shadow-lg shadow-red-200 dark:shadow-none">
              <i class="fa-solid fa-store" aria-hidden="true"></i>
              <span>${heroCta}</span>
            </a>
            <a href="#comment-ca-marche"
              class="inline-flex items-center justify-center gap-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold px-6 py-3.5 rounded-xl border border-gray-200 dark:border-gray-700 transition-colors text-base">
              <i class="fa-regular fa-circle-play" aria-hidden="true"></i>
              <span>${heroCta2}</span>
            </a>
          </div>
          <div class="flex flex-wrap items-center gap-x-6 gap-y-2 mt-8 text-sm text-gray-500 dark:text-gray-400">
            <div class="flex items-center gap-1.5">
              <i class="fa-solid fa-circle-check text-red-600 dark:text-red-400" aria-hidden="true"></i>
              <span>${trustItems[0]}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <i class="fa-solid fa-circle-check text-blue-600 dark:text-blue-400" aria-hidden="true"></i>
              <span>${trustItems[1]}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <i class="fa-solid fa-circle-check text-red-600 dark:text-red-400" aria-hidden="true"></i>
              <span>${trustItems[2]}</span>
            </div>
          </div>
        </div>

        <div class="relative mx-auto max-w-md lg:max-w-none">
          <div class="relative rounded-[28px] bg-gray-900 dark:bg-black p-8 min-h-[420px] flex items-center justify-center overflow-hidden">
            <svg class="absolute inset-0 w-full h-full opacity-40" viewBox="0 0 400 420" preserveAspectRatio="none" aria-hidden="true">
              <path d="M50 100 C 140 160, 170 280, 310 380" stroke="#3A3630" stroke-width="2" stroke-dasharray="2 10" fill="none" stroke-linecap="round"/>
            </svg>
            <div class="absolute left-6 top-8 bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-lg">
              <i class="fa-solid fa-location-dot" aria-hidden="true"></i> Votre restaurant
            </div>

            <div class="relative w-56 rounded-3xl bg-white dark:bg-gray-900 border-[6px] border-black shadow-2xl overflow-hidden">
              <div class="bg-red-600 px-4 pt-4 pb-9 text-white">
                <div class="font-bold text-sm">Votre boutique</div>
                <div class="text-[11px] opacity-85 mt-0.5 flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-white"></span> Ouvert maintenant
                </div>
              </div>
              <div class="p-3 -mt-6 space-y-2">
                <div class="bg-white dark:bg-gray-800 rounded-xl shadow p-2.5 flex items-center gap-2.5">
                  <div class="w-10 h-10 rounded-lg vignette-plat flex-shrink-0 overflow-hidden">
                    <img src="/api/v1/media/demo/plat-riz-gras.jpg" alt="Riz gras poulet" loading="lazy"
                      class="w-full h-full object-cover" onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'fa-solid fa-bowl-rice text-red-500 dark:text-red-400 text-sm flex items-center justify-center w-full h-full'}))">
                  </div>
                  <div>
                    <div class="text-xs font-bold text-gray-900 dark:text-white">Riz gras poulet</div>
                    <div class="text-[11px] text-gray-500 dark:text-gray-400">2 500 FCFA</div>
                  </div>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl shadow p-2.5 flex items-center gap-2.5">
                  <div class="w-10 h-10 rounded-lg vignette-plat flex-shrink-0 overflow-hidden">
                    <img src="/api/v1/media/demo/plat-poulet-braise.jpg" alt="Poulet braisé" loading="lazy"
                      class="w-full h-full object-cover" onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'fa-solid fa-drumstick-bite text-blue-500 dark:text-blue-400 text-sm flex items-center justify-center w-full h-full'}))">
                  </div>
                  <div>
                    <div class="text-xs font-bold text-gray-900 dark:text-white">Poulet braisé</div>
                    <div class="text-[11px] text-gray-500 dark:text-gray-400">3 000 FCFA</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="absolute right-4 bottom-10 bg-white dark:bg-gray-800 rounded-2xl rounded-br-md shadow-xl p-3.5 w-48 text-xs">
              <div class="flex items-center gap-1.5 font-bold text-gray-900 dark:text-white mb-1">
                <i class="fa-brands fa-whatsapp text-green-500" aria-hidden="true"></i> Commande #42
              </div>
              <div class="text-gray-500 dark:text-gray-400">Riz gras poulet ×1 — Livraison confirmée</div>
            </div>
          </div>

          <div class="absolute -top-4 -right-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 p-3 flex items-center gap-2">
            <div class="w-8 h-8 bg-red-100 dark:bg-red-950/50 rounded-lg flex items-center justify-center">
              <i class="fa-solid fa-check text-red-600 dark:text-red-400 text-sm" aria-hidden="true"></i>
            </div>
            <div>
              <div class="text-xs font-bold text-gray-900 dark:text-white">0% commission</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">Sur vos ventes</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </section>

  <!-- ===================================================== -->
  <!-- RESTAURANTS PARTENAIRES — carrousel dynamique          -->
  <!-- Charge actif ET essai (non expiré) depuis /api/v1/tenants -->
  <!-- ===================================================== -->
  <section class="py-14 bg-gray-50 dark:bg-[#0B0A09]/50 border-y border-gray-100 dark:border-gray-800" id="partenaires">
    <div id="partenaires-container" class="hidden">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 text-center">
        <p class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          ${partenairesLabel}
        </p>
      </div>
      <div class="relative w-full overflow-hidden">
        <div class="pointer-events-none absolute inset-y-0 left-0 w-16 sm:w-32 bg-gradient-to-r from-gray-50 dark:from-[#0B0A09] to-transparent z-10"></div>
        <div class="pointer-events-none absolute inset-y-0 right-0 w-16 sm:w-32 bg-gradient-to-l from-gray-50 dark:from-[#0B0A09] to-transparent z-10"></div>
        <div id="partenaires-track" class="flex items-center gap-14 partenaires-scroll py-2"></div>
      </div>
    </div>
  </section>

  <!-- ===================================================== -->
  <!-- FONCTIONNALITÉS                                        -->
  <!-- ===================================================== -->
  <section class="py-20 bg-white dark:bg-[#0B0A09]" id="fonctionnalites">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-14">
        <h2 class="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white mb-4">
          ${isEn ? 'Everything your restaurant needs' : 'Tout ce dont votre restaurant a besoin'}
        </h2>
        <p class="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
          ${isEn ? 'A complete platform, easy to use daily to boost your business.' : 'Une plateforme complète, simple à utiliser au quotidien pour booster votre activité.'}
        </p>
      </div>

      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        ${(isEn ? [
          { icon: 'fa-mobile-screen-button', title: 'Online Shop', desc: 'Your menu accessible via a unique link or QR code. No app to download.', accent: 'rouge' },
          { icon: 'fa-brands fa-whatsapp', title: 'WhatsApp Notifications', desc: 'Every order arrives instantly on your WhatsApp, ready to confirm.', accent: 'bleu' },
          { icon: 'fa-chart-line', title: 'Dashboard', desc: 'Clear statistics, full history and real-time menu management.', accent: 'noir' },
          { icon: 'fa-location-dot', title: 'Geolocated Delivery', desc: 'Delivery fees calculated automatically based on distance, time and weather.', accent: 'bleu' },
          { icon: 'fa-qrcode', title: 'Printable QR Code', desc: 'Automatically generated for each shop, to display in your establishment.', accent: 'rouge' },
          { icon: 'fa-palette', title: 'Customization', desc: 'Your shop in your image: logo and colors, independent of MonMenu branding.', accent: 'noir' },
        ] : [
          { icon: 'fa-mobile-screen-button', title: 'Boutique en ligne', desc: 'Votre menu accessible via un lien unique ou QR code. Aucune application à télécharger.', accent: 'rouge' },
          { icon: 'fa-brands fa-whatsapp', title: 'Notifications WhatsApp', desc: 'Chaque commande arrive instantanément sur votre WhatsApp, prête à confirmer.', accent: 'bleu' },
          { icon: 'fa-chart-line', title: 'Tableau de bord', desc: 'Statistiques claires, historique complet et gestion du menu en temps réel.', accent: 'noir' },
          { icon: 'fa-location-dot', title: 'Livraison géolocalisée', desc: "Frais de livraison calculés automatiquement selon la distance, l'heure et la météo.", accent: 'bleu' },
          { icon: 'fa-qrcode', title: 'QR Code imprimable', desc: "Généré automatiquement pour chaque boutique, à afficher dans votre établissement.", accent: 'rouge' },
          { icon: 'fa-palette', title: 'Personnalisation', desc: 'Votre boutique à votre image : logo et couleurs, indépendants de la charte MonMenu.', accent: 'noir' },
        ]).map(f => {
          const styles = {
            rouge: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40',
            bleu: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40',
            noir: 'text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-800',
          }[f.accent as 'rouge' | 'bleu' | 'noir']
          return `
          <article class="bg-gray-50 dark:bg-gray-900/60 rounded-xl p-6 border border-gray-100 dark:border-gray-800 hover:shadow-md dark:hover:shadow-none dark:hover:border-gray-700 transition-all card-hover">
            <div class="w-11 h-11 ${styles} rounded-lg flex items-center justify-center mb-5 text-xl">
              <i class="fa-solid ${f.icon}" aria-hidden="true"></i>
            </div>
            <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-2">${f.title}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">${f.desc}</p>
          </article>`
        }).join('')}
      </div>
    </div>
  </section>

  <!-- ===================================================== -->
  <!-- COMMENT ÇA MARCHE                                      -->
  <!-- ===================================================== -->
  <section class="py-20 bg-gray-50 dark:bg-[#0B0A09]/50" id="comment-ca-marche">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <h2 class="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white mb-6">
            ${isEn ? 'Ready in 3 steps' : 'Prêt en 3 étapes'}
          </h2>
          <div class="space-y-8">
            <div class="flex gap-5">
              <div class="flex-shrink-0 w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center font-bold shadow-lg shadow-red-200 dark:shadow-none">1</div>
              <div>
                <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-1">${isEn ? 'Register your restaurant' : 'Inscrivez votre restaurant'}</h3>
                <p class="text-gray-600 dark:text-gray-400">${isEn ? 'Create your account and fill in your basic information in 2 minutes.' : 'Créez votre compte et renseignez vos informations de base en 2 minutes.'}</p>
              </div>
            </div>
            <div class="flex gap-5">
              <div class="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shadow-lg shadow-blue-200 dark:shadow-none">2</div>
              <div>
                <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-1">${isEn ? 'Add your products' : 'Ajoutez vos produits'}</h3>
                <p class="text-gray-600 dark:text-gray-400">${isEn ? 'Import your menu, add photos and set your prices.' : 'Importez votre menu, ajoutez des photos et fixez vos prix.'}</p>
              </div>
            </div>
            <div class="flex gap-5">
              <div class="flex-shrink-0 w-10 h-10 rounded-full bg-gray-900 dark:bg-white dark:text-gray-900 text-white flex items-center justify-center font-bold">3</div>
              <div>
                <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-1">${isEn ? 'Start selling' : 'Commencez à vendre'}</h3>
                <p class="text-gray-600 dark:text-gray-400">${isEn ? 'Share your link and receive your first orders on WhatsApp.' : 'Partagez votre lien et recevez vos premières commandes sur WhatsApp.'}</p>
              </div>
            </div>
          </div>
          <div class="mt-10">
            <a href="/inscription" class="text-red-600 dark:text-red-400 font-bold flex items-center gap-2 hover:underline">
              ${isEn ? 'Create my shop now' : 'Créer ma boutique maintenant'}
              <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </a>
          </div>
        </div>

        <div class="relative">
          <div class="aspect-video rounded-2xl bg-gray-200 dark:bg-gray-800 overflow-hidden shadow-2xl border-8 border-white dark:border-gray-900">
             <div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900">
                <i class="fa-solid fa-play text-5xl text-gray-400 dark:text-gray-600" aria-hidden="true"></i>
             </div>
          </div>
          <div class="absolute -bottom-6 -left-6 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-xl flex items-center gap-3">
             <div class="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                <i class="fa-brands fa-whatsapp text-green-600 text-xl" aria-hidden="true"></i>
             </div>
             <div>
                <div class="text-[10px] text-gray-500 uppercase font-bold tracking-wider">${isEn ? 'New order' : 'Nouvelle commande'}</div>
                <div class="text-sm font-bold text-gray-900 dark:text-white">${isEn ? 'Received in 0.5s' : 'Reçue en 0.5s'}</div>
             </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ===================================================== -->
  <!-- TARIFS                                                 -->
  <!-- ===================================================== -->
  <section class="py-20 bg-white dark:bg-[#0B0A09]" id="tarifs">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-14">
        <h2 class="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white mb-4">
          ${isEn ? 'Simple and transparent pricing' : 'Des tarifs simples et transparents'}
        </h2>
        <p class="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
          ${isEn ? 'No hidden fees. No commission on your sales. Cancel anytime.' : 'Aucun frais caché. Aucune commission sur vos ventes. Annulez à tout moment.'}
        </p>
      </div>

      <div id="plans-container" class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        ${[1, 2, 3, 4].map(() => `
          <div class="animate-pulse bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-8 h-96 border border-gray-100 dark:border-gray-800">
            <div class="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/2 mb-6"></div>
            <div class="h-10 bg-gray-200 dark:bg-gray-800 rounded w-3/4 mb-4"></div>
            <div class="space-y-3">
              <div class="h-3 bg-gray-200 dark:bg-gray-800 rounded w-full"></div>
              <div class="h-3 bg-gray-200 dark:bg-gray-800 rounded w-5/6"></div>
              <div class="h-3 bg-gray-200 dark:bg-gray-800 rounded w-4/6"></div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="mt-12 text-center">
        <p class="text-gray-500 dark:text-gray-400 text-sm">
          <i class="fa-solid fa-circle-info mr-1" aria-hidden="true"></i>
          ${isEn ? 'All plans include 24/7 technical support and automatic updates.' : 'Tous les plans incluent le support technique 24/7 et les mises à jour automatiques.'}
        </p>
      </div>
    </div>
  </section>

  <!-- ===================================================== -->
  <!-- FAQ                                                    -->
  <!-- ===================================================== -->
  <section class="py-20 bg-gray-50 dark:bg-[#0B0A09]/50" id="faq">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-12">
        <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white">${isEn ? 'Frequently Asked Questions' : 'Questions fréquentes'}</h2>
      </div>

      <div class="space-y-4">
        ${(isEn ? [
          { q: 'Is it really 0% commission?', a: 'Yes. Unlike other platforms that take 15% to 30% on each order, MonMenu charges only a fixed monthly or annual subscription. All your sales revenue goes directly to you.' },
          { q: 'Do I need a computer to manage my shop?', a: 'No. The entire dashboard is "mobile-first". You can manage your products, prices and orders directly from your smartphone.' },
          { q: 'How do customers pay?', a: 'MonMenu facilitates order taking. Payment is made directly between you and the customer (cash on delivery, mobile money, etc.) according to your usual methods.' },
          { q: 'Can I use my own domain name?', a: 'Yes, with the Professional and Enterprise plans, you can link your own domain (e.g. www.votre-restaurant.com) to your shop.' },
          { q: 'Is WhatsApp mandatory?', a: 'WhatsApp is our primary notification channel because it is used by everyone in Africa, but you also receive all orders in your real-time dashboard.' },
          { q: 'How long does it take to be online?', a: 'If you have your menu ready, you can be online in less than 10 minutes. Registration is instant.' },
          { q: 'Is there a commitment?', a: 'No. You can cancel your subscription at any time from your dashboard. No exit fees.' },
          { q: 'Do you provide delivery drivers?', a: 'No, MonMenu is a technical tool. You use your own delivery drivers or your usual partner. We provide the geolocation tool to simplify their work.' },
          { q: 'Is it available in my country?', a: 'MonMenu is optimized for West and Central Africa (Senegal, Ivory Coast, Cameroon, Mali, Burkina Faso, etc.) but works globally.' },
        ] : [
          { q: 'Est-ce vraiment 0% de commission ?', a: "Oui. Contrairement aux autres plateformes qui prennent 15% à 30% sur chaque commande, MonMenu ne facture qu'un abonnement fixe mensuel ou annuel. Tout le revenu de vos ventes vous revient directement." },
          { q: 'Ai-je besoin d\'un ordinateur pour gérer ma boutique ?', a: 'Non. Tout le tableau de bord est "mobile-first". Vous pouvez gérer vos produits, vos prix et vos commandes directement depuis votre smartphone.' },
          { q: 'Comment les clients payent-ils ?', a: 'MonMenu facilite la prise de commande. Le paiement se fait directement entre vous et le client (espèces à la livraison, mobile money, etc.) selon vos méthodes habituelles.' },
          { q: 'Puis-je utiliser mon propre nom de domaine ?', a: 'Oui, avec les plans Professionnel et Entreprise, vous pouvez lier votre propre domaine (ex: www.votre-restaurant.com) à votre boutique.' },
          { q: 'WhatsApp est-il obligatoire ?', a: 'WhatsApp est notre canal de notification privilégié car utilisé par tous en Afrique, mais vous recevez aussi toutes les commandes dans votre tableau de bord en temps réel.' },
          { q: 'Combien de temps pour être en ligne ?', a: 'Si vous avez votre menu prêt, vous pouvez être en ligne en moins de 10 minutes. L\'inscription est instantanée.' },
          { q: 'Y a-t-il un engagement ?', a: 'Non. Vous pouvez résilier votre abonnement à tout moment depuis votre tableau de bord. Aucun frais de sortie.' },
          { q: 'Fournissez-vous des livreurs ?', a: 'Non, MonMenu est un outil technique. Vous utilisez vos propres livreurs ou votre partenaire habituel. Nous fournissons l\'outil de géolocalisation pour simplifier leur travail.' },
          { q: 'Est-ce disponible dans mon pays ?', a: 'MonMenu est optimisé pour l\'Afrique de l\'Ouest et Centrale (Sénégal, Côte d\'Ivoire, Cameroun, Mali, Burkina Faso, etc.) mais fonctionne partout dans le monde.' },
        ]).map((item, idx) => `
          <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            <button class="w-full px-6 py-5 text-left flex items-center justify-between font-bold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    onclick="this.nextElementSibling.classList.toggle('hidden'); this.querySelector('i').classList.toggle('rotate-180')">
              <span>${item.q}</span>
              <i class="fa-solid fa-chevron-down text-xs transition-transform" aria-hidden="true"></i>
            </button>
            <div class="px-6 pb-5 text-gray-600 dark:text-gray-400 text-sm leading-relaxed hidden">
              ${item.a}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- ===================================================== -->
  <!-- CTA FINAL                                              -->
  <!-- ===================================================== -->
  <section class="py-20 bg-white dark:bg-[#0B0A09]">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="bg-red-600 rounded-3xl p-10 sm:p-16 text-center text-white relative overflow-hidden shadow-2xl shadow-red-200 dark:shadow-none">
        <svg class="absolute top-0 right-0 w-64 h-64 opacity-10 translate-x-20 -translate-y-20" viewBox="0 0 200 200" fill="none">
          <circle cx="100" cy="100" r="100" fill="white"/>
        </svg>

        <h2 class="text-3xl sm:text-4xl font-extrabold mb-6 relative z-10">
          ${isEn ? 'Ready to boost your sales?' : 'Prêt à booster vos ventes ?'}
        </h2>
        <p class="text-lg opacity-90 mb-10 max-w-xl mx-auto relative z-10">
          ${isEn ? 'Join hundreds of restaurants already using MonMenu to simplify their online ordering.' : 'Rejoignez des centaines de restaurants qui utilisent déjà MonMenu pour simplifier leur commande en ligne.'}
        </p>
        <div class="flex flex-col sm:flex-row justify-center gap-4 relative z-10">
          <a href="/inscription" class="bg-white text-red-600 font-bold px-8 py-4 rounded-xl hover:bg-gray-50 transition-colors shadow-lg">
            ${isEn ? 'Create my shop' : 'Créer ma boutique'}
          </a>
          <a href="/contact" class="bg-red-700 text-white font-bold px-8 py-4 rounded-xl hover:bg-red-800 transition-colors border border-red-500">
            ${isEn ? 'Contact sales' : 'Contacter un conseiller'}
          </a>
        </div>
      </div>
    </div>
  </section>

  ${renderFooter(nomProjet, locale)}

  <!-- Script pour charger les plans dynamiquement -->
  <script>
    async function loadPlans() {
      const container = document.getElementById('plans-container');
      const isEn = ${isEn};
      try {
        const res = await fetch('/api/v1/plans');
        const data = await res.json();
        const plans = Array.isArray(data) ? data : (data.plans || []);
        const devise = (data && data.devise) || 'FCFA';
        if (plans.length > 0) {
          const featureLabels = {
            boutique_en_ligne: isEn ? 'Online shop' : 'Boutique en ligne',
            qr_code: 'QR Code',
            notifications_whatsapp: isEn ? 'WhatsApp notifications' : 'Notifications WhatsApp',
            statistiques_avancees: isEn ? 'Advanced statistics' : 'Statistiques avancées',
            codes_promo: isEn ? 'Promo codes' : 'Codes promo',
            domaine_perso: isEn ? 'Custom domain' : 'Domaine personnalisé',
            export_csv: isEn ? 'CSV export' : 'Export CSV',
            support_whatsapp_prioritaire: isEn ? 'Priority WhatsApp support' : 'Support WhatsApp prioritaire',
            multi_boutique: isEn ? 'Multi-shop' : 'Multi-boutique',
            onboarding_dedie: isEn ? 'Dedicated onboarding' : 'Onboarding dédié',
            acces_api: isEn ? 'API access' : 'Accès API',
          };

          function buildFeatures(f) {
            const list = [];
            if (typeof f.produits_max === 'number') {
              list.push(f.produits_max === -1
                ? (isEn ? 'Unlimited products' : 'Produits illimités')
                : (isEn ? f.produits_max + ' products max' : f.produits_max + ' produits max'));
            }
            if (typeof f.categories_max === 'number') {
              list.push(f.categories_max === -1
                ? (isEn ? 'Unlimited categories' : 'Catégories illimitées')
                : (isEn ? f.categories_max + ' categories max' : f.categories_max + ' catégories max'));
            }
            Object.keys(featureLabels).forEach(function (key) {
              if (f[key]) list.push(featureLabels[key]);
            });
            return list;
          }

          const maxPrix = Math.max.apply(null, plans.map(function (p) { return p.prix_mensuel || 0; }));

          container.innerHTML = plans.map(function (p) {
            const f = p.fonctionnalites || {};
            const isPopular = !!f.recommande;
            const isTopTier = !isPopular && p.prix_mensuel === maxPrix && maxPrix > 0;
            const accentBorder = isPopular
              ? 'border-red-500 ring-4 ring-red-500/10'
              : (isTopTier ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-gray-100 dark:border-gray-800');
            const features = buildFeatures(f);
            return \`
            <div class="bg-white dark:bg-gray-900 rounded-2xl p-8 border \${accentBorder} flex flex-col relative">
              \${isPopular ? \`<span class="absolute -top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">\${isEn ? 'Most Popular' : 'Le plus populaire'}</span>\` : ''}
              \${isTopTier ? \`<span class="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">\${isEn ? 'Best Value' : 'Meilleure valeur'}</span>\` : ''}
              <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-2">\${p.nom}</h3>
              \${f.sous_titre ? \`<p class="text-xs text-gray-500 dark:text-gray-400 mb-4">\${f.sous_titre}</p>\` : ''}
              <div class="mb-6">
                <span class="text-3xl font-extrabold text-gray-900 dark:text-white">\${new Intl.NumberFormat().format(p.prix_mensuel)}</span>
                <span class="text-gray-500 dark:text-gray-400 text-sm">\${devise}/\${isEn ? 'month' : 'mois'}</span>
              </div>
              <ul class="space-y-4 mb-8 flex-grow">
                \${features.map(function (feat) {
                  return \`
                  <li class="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <i class="fa-solid fa-check text-green-500 mt-0.5" aria-hidden="true"></i>
                    <span>\${feat}</span>
                  </li>
                \`;
                }).join('')}
              </ul>
              <a href="/inscription?plan=\${p.id}" class="w-full py-3 rounded-xl font-bold text-center transition-all bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-200 dark:shadow-none">
                \${isEn ? 'Choose this plan' : 'Choisir ce plan'}
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
  </script>

  <!-- Script pour charger le carrousel des restaurants partenaires -->
  <script>
    // Charge les tenants actifs ET en essai (non expiré) depuis
    // GET /api/v1/tenants — voir api-tenants.ts. Un tenant en essai
    // reçoit un petit badge "Nouveau" pour le distinguer visuellement
    // (statut renvoyé désormais par l'API). Section masquée si la
    // liste est vide : aucune donnée fictive n'est jamais affichée.
    async function loadPartenaires() {
      const container = document.getElementById('partenaires-container');
      const track = document.getElementById('partenaires-track');
      if (!container || !track) return;

      try {
        const res = await fetch('/api/v1/tenants?limit=16');
        if (!res.ok) return;
        const data = await res.json();
        const tenants = Array.isArray(data) ? data : (data.tenants || []);

        if (!tenants.length) return; // état vide honnête : section reste masquée

        const itemHtml = function (tnt) {
          const nom = String(tnt.nom || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
          const slug = String(tnt.slug || '');
          const logo = String(tnt.logo_url || '');
          const estEssai = tnt.statut === 'essai';
          const badge = estEssai
            ? '<span class="absolute -top-1.5 -right-1.5 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none z-10">Nouveau</span>'
            : '';
          return '<a href="/' + slug + '" title="' + nom + '" ' +
            'class="relative flex-shrink-0 flex items-center justify-center h-14 w-32 grayscale hover:grayscale-0 opacity-70 hover:opacity-100 transition-all duration-300">' +
            badge +
            '<img src="' + logo + '" alt="' + nom + '" class="max-h-14 max-w-full object-contain" loading="lazy" ' +
            'onerror="this.closest(\\'a\\').remove()">' +
            '</a>';
        };

        // Liste dupliquée pour un défilement infini sans coupure visible.
        track.innerHTML = tenants.map(itemHtml).join('') + tenants.map(itemHtml).join('');

        // Vitesse de défilement constante quel que soit le nombre de logos.
        track.style.animationDuration = Math.max(15, tenants.length * 3) + 's';

        container.classList.remove('hidden');
      } catch (err) {
        console.error('Erreur chargement partenaires:', err);
        // Échec silencieux côté UI : la section reste masquée.
      }
    }
    loadPartenaires();
  </script>
</body>
</html>`;
}