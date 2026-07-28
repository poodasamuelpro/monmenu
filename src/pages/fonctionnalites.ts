// =============================================================
// PAGE FONCTIONNALITÉS
// =============================================================
import { renderHead } from '../components/head'
import { renderNav } from '../components/nav'
import { renderFooter } from '../components/footer'
import { getTranslations } from '../i18n'

export function renderFonctionnalitesPage(nomProjet: string, locale: string = 'fr'): string {
  const t = getTranslations(locale)
  return `${renderHead(
    `${t.fonctionnalites.meta_title} — ${nomProjet}`,
    t.fonctionnalites.meta_desc,
    nomProjet
  )}
<body class="font-sans bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors">
  ${renderNav(nomProjet, 'fonctionnalites', locale)}

  <!-- Hero section -->
  <section class="py-16 bg-gradient-to-b from-gray-50 to-white" aria-labelledby="features-hero-heading">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
      <div class="inline-flex items-center gap-2 bg-red-100 text-red-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
        <i class="fa-solid fa-star" aria-hidden="true"></i>
        <span>Plateforme complète</span>
      </div>
      <h1 id="features-hero-heading" class="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-4">
        Tout pour votre restaurant en ligne
      </h1>
      <p class="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
        Une plateforme pensée pour les restaurants africains. Simple à utiliser au quotidien. Puissante pour scaler.
      </p>
      <div class="flex flex-col sm:flex-row gap-3 justify-center">
        <a href="/inscription"
          class="inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-md">
          <i class="fa-solid fa-store" aria-hidden="true"></i>
          Créer ma boutique gratuitement
        </a>
        <a href="/tarifs"
          class="inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold px-6 py-3 rounded-xl border border-gray-200 transition-colors">
          <i class="fa-solid fa-tag" aria-hidden="true"></i>
          Voir les tarifs
        </a>
      </div>
    </div>
  </section>

  <!-- Fonctionnalités détaillées -->
  <section class="py-20" aria-labelledby="features-detail-heading">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="sr-only" id="features-detail-heading">Fonctionnalités en détail</div>
      <div class="space-y-20">

        ${[
          {
            icon: 'fa-store', title: 'Boutique en ligne personnalisée',
            desc: 'Une boutique professionnelle prête en 5 minutes. Vos clients y accèdent via un lien unique ou un QR code — aucune application à télécharger.',
            items: [
              'URL unique : monmenu.app/votre-restaurant',
              'Logo, couleurs de marque et bannière configurables',
              "Mode sombre automatique selon les préférences système",
              'Responsive mobile-first (80% des commandes depuis mobile)',
              'Vitesse de chargement optimisée (Cloudflare Edge Network)',
            ],
            color: 'text-red-600 bg-red-50',
            badge: 'Inclus dans tous les plans'
          },
          {
            icon: 'fa-basket-shopping', title: 'Commande sans inscription client',
            desc: "Aucun compte requis pour commander. Vos clients ajoutent leurs plats, saisissent leur adresse et valident. C'est tout.",
            items: [
              'Panier persistant (localStorage) — survit au rechargement de page',
              'Variantes de produits (taille, cuisson, accompagnements)',
              'Codes promotionnels avec validation en temps réel',
              'Récapitulatif de commande détaillé avant validation',
              'Aucune donnée client stockée sans consentement',
            ],
            color: 'text-blue-600 bg-blue-50',
            badge: 'Inclus dans tous les plans'
          },
          {
            icon: 'fa-location-dot', title: 'Géolocalisation et calcul de livraison',
            desc: 'La carte interactive permet au client de positionner sa livraison à la précision GPS. Les frais sont calculés automatiquement.',
            items: [
              'Carte interactive Mapbox intégrée',
              'Calcul kilométrique des frais de livraison',
              "Majoration heure de pointe (12h-14h, 19h-21h) configurable",
              'Frais de livraison gratuit au-delà d\'un seuil configurable',
              'Lien Google Maps et Waze pour le livreur',
            ],
            color: 'text-green-600 bg-green-50',
            badge: 'Plans Starter et Pro'
          },
          {
            icon: 'fa-brands fa-whatsapp', title: 'Notifications WhatsApp instantanées',
            desc: "Chaque commande confirmée déclenche un message WhatsApp structuré sur votre numéro. Votre numéro existant suffit.",
            items: [
              'Message complet : produits, quantités, adresse, montant',
              'Lien Google Maps vers l\'adresse de livraison dans le message',
              'Notification au livreur avec itinéraire et détails commande',
              'API WhatsApp Business Cloud (Meta) — fiable et officielle',
              'Support WhatsApp Business API via numéro dédié optionnel',
            ],
            color: 'text-green-700 bg-green-50',
            badge: 'Inclus dans tous les plans'
          },
          {
            icon: 'fa-chart-bar', title: 'Tableau de bord restaurant',
            desc: "Votre centre de contrôle. Commandes en temps réel, historique, statistiques, menu, livreurs — tout depuis votre navigateur.",
            items: [
              'Commandes en temps réel (Supabase Realtime)',
              'Historique complet filtrable par date, statut, montant',
              'Export CSV des commandes et statistiques',
              'Statistiques journalières, hebdomadaires, mensuelles',
              'Gestion des catégories et produits du menu',
              'Suivi des livreurs et assignation en temps réel',
            ],
            color: 'text-purple-600 bg-purple-50',
            badge: 'Inclus dans tous les plans'
          },
          {
            icon: 'fa-qrcode', title: 'QR Code haute résolution',
            desc: "Un QR code unique est généré automatiquement pour chaque boutique. Téléchargeable en PNG et SVG pour impression professionnelle.",
            items: [
              'QR code généré automatiquement à l\'inscription',
              'Personnalisable : couleur de marque, logo centré',
              'Téléchargement en PNG (impression) et SVG (vectoriel)',
              'Format prêt pour table de restaurant, flyer, menu imprimé',
              'Lien de partage direct pour réseaux sociaux et messageries',
            ],
            color: 'text-orange-600 bg-orange-50',
            badge: 'Inclus dans tous les plans'
          },
        ].map((feature, idx) => `
          <div class="grid md:grid-cols-2 gap-10 items-center ${idx % 2 === 1 ? 'md:flex-row-reverse' : ''}">
            <div class="${idx % 2 === 1 ? 'md:order-2' : ''}">
              <div class="inline-flex items-center gap-2 text-xs font-semibold bg-gray-100 text-gray-600 px-3 py-1 rounded-full mb-4">
                <i class="fa-solid fa-check text-green-500" aria-hidden="true"></i>
                ${feature.badge}
              </div>
              <div class="w-12 h-12 ${feature.color} rounded-xl flex items-center justify-center mb-4">
                <i class="fa-solid ${feature.icon} text-xl" aria-hidden="true"></i>
              </div>
              <h2 class="text-2xl font-bold text-gray-900 mb-3">${feature.title}</h2>
              <p class="text-gray-600 mb-4 leading-relaxed">${feature.desc}</p>
              <ul class="space-y-2.5">
                ${feature.items.map(item => `
                  <li class="flex items-start gap-2 text-gray-700 text-sm">
                    <i class="fa-solid fa-check text-green-500 flex-shrink-0 mt-0.5" aria-hidden="true"></i>
                    ${item}
                  </li>
                `).join('')}
              </ul>
            </div>
            <div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-10 flex items-center justify-center min-h-48 ${idx % 2 === 1 ? 'md:order-1' : ''}">
              <i class="fa-solid ${feature.icon} text-9xl opacity-10 text-gray-400" aria-hidden="true"></i>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- Tableau comparatif plans -->
  <section class="py-20 bg-gray-50" aria-labelledby="compare-heading">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-12">
        <h2 id="compare-heading" class="text-3xl font-extrabold text-gray-900 mb-3">
          Comparaison des plans
        </h2>
        <p class="text-gray-600">Choisissez le plan adapté à votre volume de commandes.</p>
      </div>

      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full" role="table" aria-label="Comparaison des plans tarifaires">
            <thead>
              <tr class="border-b border-gray-100">
                <th class="text-left px-6 py-4 text-sm font-semibold text-gray-500" scope="col">Fonctionnalité</th>
                <th class="text-center px-4 py-4 text-sm font-bold text-gray-900" scope="col">Gratuit</th>
                <th class="text-center px-4 py-4 text-sm font-bold text-gray-900 bg-red-50" scope="col">Starter</th>
                <th class="text-center px-4 py-4 text-sm font-bold text-red-600" scope="col">Pro</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              ${[
                ['Boutique en ligne', '✅', '✅', '✅'],
                ['Notifications WhatsApp', '✅', '✅', '✅'],
                ['QR Code imprimable', '✅', '✅', '✅'],
                ['Tableau de bord', '✅', '✅', '✅'],
                ['Commandes/mois incluses', '50', '200', '1 000'],
                ['Produits au menu', '20 max', '100 max', 'Illimités'],
                ['Livreurs', '1', '3', 'Illimités'],
                ['Codes promotionnels', '—', '✅', '✅'],
                ['Statistiques avancées', '—', '✅', '✅'],
                ['Support email', '—', '✅', '✅'],
                ['Support WhatsApp', '—', '—', '✅'],
                ['Domaine personnalisé', '—', '—', '✅'],
                ['Export CSV', '—', '—', '✅'],
                ['Accès API', '—', '—', '✅'],
              ].map(row => `
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="px-6 py-3.5 text-sm text-gray-700 font-medium">${row[0]}</td>
                  <td class="text-center px-4 py-3.5 text-sm text-gray-600">${row[1]}</td>
                  <td class="text-center px-4 py-3.5 text-sm text-gray-600 bg-red-50/50">${row[2]}</td>
                  <td class="text-center px-4 py-3.5 text-sm text-gray-600">${row[3]}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="text-center mt-8">
        <a href="/tarifs"
          class="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3.5 rounded-xl transition-colors shadow-md">
          <i class="fa-solid fa-tag" aria-hidden="true"></i>
          Voir les tarifs détaillés
        </a>
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="py-16 bg-white">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 text-center">
      <h2 class="text-2xl font-extrabold text-gray-900 mb-4">
        Commencez gratuitement dès aujourd'hui
      </h2>
      <p class="text-gray-600 mb-8">
        Premier mois offert sur tous les plans. Aucune carte bancaire requise pour démarrer.
      </p>
      <a href="/inscription"
        class="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-4 rounded-xl transition-colors shadow-lg shadow-red-200 text-base">
        <i class="fa-solid fa-store" aria-hidden="true"></i>
        Créer ma boutique gratuitement
      </a>
    </div>
  </section>

  ${renderFooter(nomProjet, locale)}
  <script src="/static/js/main.js"></script>
</body>
</html>`
}
