// =============================================================
// PAGE D'ACCUEIL — renderHomePage()
// =============================================================
import { renderHead } from '../components/head'
import { renderNav } from '../components/nav'
import { renderFooter } from '../components/footer'

export function renderHomePage(nomProjet: string): string {
  return `${renderHead(
    `${nomProjet} — Commandez en ligne dans vos restaurants préférés`,
    `${nomProjet} est la plateforme de commande en ligne pour les restaurants d'Afrique de l'Ouest. Créez votre boutique en quelques minutes. Sans commission.`,
    nomProjet
  )}
<body class="font-sans bg-white text-gray-900">
  ${renderNav(nomProjet, 'accueil')}

  <!-- ===== HERO ===== -->
  <section class="bg-gradient-to-br from-red-50 via-white to-blue-50 py-20 lg:py-28" id="hero">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <div class="inline-flex items-center gap-2 bg-red-100 text-red-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
            <span>Disponible au Burkina Faso — Côte d'Ivoire bientôt</span>
          </div>
          <h1 class="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
            Votre restaurant,<br>
            <span class="text-red-600">en ligne</span> en<br>
            quelques minutes
          </h1>
          <p class="text-lg text-gray-600 leading-relaxed mb-8 max-w-lg">
            Créez votre boutique de commande en ligne, gérez vos commandes en temps réel
            et recevez des notifications WhatsApp instantanées. <strong>Sans commission. Abonnement fixe.</strong>
          </p>
          <div class="flex flex-col sm:flex-row gap-3">
            <a href="/inscription"
              class="inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3.5 rounded-xl transition-colors text-base shadow-lg shadow-red-200">
              <i class="fa-solid fa-store" aria-hidden="true"></i>
              <span>Créer ma boutique gratuitement</span>
            </a>
            <a href="#demo"
              class="inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold px-6 py-3.5 rounded-xl border border-gray-200 transition-colors text-base">
              <i class="fa-regular fa-circle-play" aria-hidden="true"></i>
              <span>Voir la démonstration</span>
            </a>
          </div>
          <div class="flex items-center gap-6 mt-8 text-sm text-gray-500">
            <div class="flex items-center gap-1.5">
              <i class="fa-solid fa-check text-green-500" aria-hidden="true"></i>
              <span>Sans engagement</span>
            </div>
            <div class="flex items-center gap-1.5">
              <i class="fa-solid fa-check text-green-500" aria-hidden="true"></i>
              <span>Prêt en 5 min</span>
            </div>
            <div class="flex items-center gap-1.5">
              <i class="fa-solid fa-check text-green-500" aria-hidden="true"></i>
              <span>Support en français</span>
            </div>
          </div>
        </div>

        <div class="relative">
          <div class="relative rounded-2xl overflow-hidden shadow-2xl max-w-lg mx-auto lg:ml-auto bg-gray-100">
            <img src="/static/img/hero-illustration.jpg"
                 alt="Restaurant africain en ligne avec MonMenu"
                 class="w-full h-auto object-cover rounded-2xl"
                 loading="eager"
                 onerror="this.parentElement.innerHTML='<div class=\\'min-h-72 bg-gradient-to-br from-red-100 to-orange-100 flex items-center justify-center rounded-2xl\\'><i class=\\'fa-solid fa-utensils text-6xl text-red-300\\'></i></div>'">
            <!-- Overlay card commande flottante -->
            <div class="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-3 border border-white/50">
              <div class="flex items-center gap-3 mb-2.5">
                <div class="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <i class="fa-solid fa-drumstick-bite text-red-600 text-sm" aria-hidden="true"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-bold text-gray-900 text-sm truncate">Restaurant Chez Fatou</div>
                  <div class="text-xs text-green-600 flex items-center gap-1">
                    <i class="fa-solid fa-circle text-xs" aria-hidden="true"></i> Ouvert · Commande sans inscription
                  </div>
                </div>
              </div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs text-gray-500 font-medium">Panier · 2 articles</span>
                <span class="text-sm font-bold text-gray-900">5 500 FCFA</span>
              </div>
              <button class="w-full bg-green-600 text-white text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-1.5">
                <i class="fa-brands fa-whatsapp text-sm" aria-hidden="true"></i>
                Commander via WhatsApp
              </button>
            </div>
          </div>
          <!-- Badge 0% commission -->
          <div class="absolute -top-3 -right-3 bg-white rounded-xl shadow-lg border border-gray-100 p-3 flex items-center gap-2">
            <div class="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <i class="fa-solid fa-check text-green-600 text-sm" aria-hidden="true"></i>
            </div>
            <div>
              <div class="text-xs font-bold text-gray-900">0% commission</div>
              <div class="text-xs text-gray-500">Sur vos ventes</div>
            </div>
          </div>
          <div class="absolute -bottom-4 -right-4 w-24 h-24 bg-red-100 rounded-full opacity-40 -z-10"></div>
          <div class="absolute -top-4 -left-4 w-16 h-16 bg-blue-100 rounded-full opacity-40 -z-10"></div>
        </div>
      </div>
    </div>
  </section>

  <!-- ===== STATISTIQUES ===== -->
  <section class="bg-white border-y border-gray-100 py-10" aria-label="Chiffres clés">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        <div>
          <div class="text-3xl font-extrabold text-red-600 mb-1">5 min</div>
          <div class="text-sm text-gray-500">Pour créer votre boutique</div>
        </div>
        <div>
          <div class="text-3xl font-extrabold text-red-600 mb-1">0%</div>
          <div class="text-sm text-gray-500">Commission sur vos ventes</div>
        </div>
        <div>
          <div class="text-3xl font-extrabold text-red-600 mb-1">14</div>
          <div class="text-sm text-gray-500">Pays d'Afrique disponibles</div>
        </div>
        <div>
          <div class="text-3xl font-extrabold text-red-600 mb-1">WhatsApp</div>
          <div class="text-sm text-gray-500">Commandes instantanées</div>
        </div>
      </div>
    </div>
  </section>

  <!-- ===== FONCTIONNALITÉS ===== -->
  <section class="py-20 bg-gray-50" id="fonctionnalites" aria-labelledby="features-heading">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-14">
        <h2 id="features-heading" class="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
          Tout ce dont votre restaurant a besoin
        </h2>
        <p class="text-lg text-gray-600 max-w-2xl mx-auto">
          Une plateforme complète pensée pour le contexte africain, simple à utiliser au quotidien.
        </p>
      </div>

      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        ${[
          { icon: 'fa-mobile-screen-button', title: 'Boutique en ligne', desc: 'Votre menu accessible via un lien unique ou QR code. Aucune application à télécharger pour vos clients.', color: 'text-red-600 bg-red-50' },
          { icon: 'fa-brands fa-whatsapp', title: 'Notifications WhatsApp', desc: 'Chaque commande arrive instantanément sur votre WhatsApp. Votre numéro existant suffit, aucun abonnement Meta requis.', color: 'text-green-600 bg-green-50' },
          { icon: 'fa-chart-line', title: 'Tableau de bord', desc: 'Statistiques claires, historique complet des commandes, gestion du menu et des livreurs en temps réel.', color: 'text-blue-600 bg-blue-50' },
          { icon: 'fa-location-dot', title: 'Géolocalisation', desc: "Le client positionne sa livraison sur une carte interactive. Les frais sont calculés automatiquement selon la distance.", color: 'text-orange-600 bg-orange-50' },
          { icon: 'fa-qrcode', title: 'QR Code imprimable', desc: "Générez et téléchargez votre QR code en HD pour l'afficher en salle, à la caisse ou sur vos supports print.", color: 'text-purple-600 bg-purple-50' },
          { icon: 'fa-palette', title: 'Personnalisation', desc: 'Couleurs, logo, bannière personnalisés. Votre boutique à votre image, sans toucher à une ligne de code.', color: 'text-pink-600 bg-pink-50' },
          { icon: 'fa-globe', title: 'Multi-pays Afrique', desc: "Burkina Faso, Côte d'Ivoire, Cameroun, Sénégal... Architecture prête pour toute l'Afrique francophone.", color: 'text-teal-600 bg-teal-50' },
          { icon: 'fa-shield-halved', title: 'Sécurité renforcée', desc: 'Données isolées par restaurant (multi-tenant). Chiffrement TLS 1.3. Protection anti-abus intégrée.', color: 'text-gray-700 bg-gray-100' },
          { icon: 'fa-motorcycle', title: 'Gestion livreurs', desc: "Assignez un livreur à chaque commande. Il reçoit l'itinéraire et les détails de livraison directement sur WhatsApp.", color: 'text-yellow-600 bg-yellow-50' },
        ].map(f => `
          <article class="bg-white rounded-xl p-6 border border-gray-100 hover:shadow-md transition-shadow">
            <div class="w-11 h-11 ${f.color} rounded-xl flex items-center justify-center mb-4" aria-hidden="true">
              <i class="fa-solid ${f.icon} text-lg"></i>
            </div>
            <h3 class="font-bold text-gray-900 mb-2">${f.title}</h3>
            <p class="text-sm text-gray-600 leading-relaxed">${f.desc}</p>
          </article>
        `).join('')}
      </div>

      <div class="text-center mt-10">
        <a href="/fonctionnalites"
          class="inline-flex items-center gap-2 text-red-600 font-semibold hover:text-red-700 transition-colors">
          Voir toutes les fonctionnalités
          <i class="fa-solid fa-arrow-right text-sm" aria-hidden="true"></i>
        </a>
      </div>
    </div>
  </section>

  <!-- ===== COMMENT ÇA FONCTIONNE ===== -->
  <section class="py-20 bg-white" id="demo" aria-labelledby="how-heading">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-14">
        <h2 id="how-heading" class="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
          Comment ça fonctionne ?
        </h2>
        <p class="text-gray-600 text-lg">Simple pour vos clients. Efficace pour vous.</p>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
        ${[
          { num: '01', icon: 'fa-qrcode', title: 'Scan ou lien', desc: 'Le client scanne votre QR code ou ouvre votre lien unique. Aucune application à installer.' },
          { num: '02', icon: 'fa-basket-shopping', title: 'Choisit ses plats', desc: 'Il parcourt votre menu, ajoute ses plats au panier en quelques secondes. Sans inscription.' },
          { num: '03', icon: 'fa-location-crosshairs', title: 'Confirme sa position', desc: "Il positionne son adresse de livraison sur la carte. Les frais sont calculés automatiquement." },
          { num: '04', icon: 'fa-brands fa-whatsapp', title: 'Commande via WhatsApp', desc: 'La commande complète arrive sur votre WhatsApp avec tous les détails. Vous confirmez en 1 clic.' },
        ].map(s => `
          <div class="relative">
            <div class="bg-red-600 text-white text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center mb-4">${s.num}</div>
            <div class="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mb-3 border border-gray-100">
              <i class="fa-solid ${s.icon} text-gray-700 text-lg" aria-hidden="true"></i>
            </div>
            <h3 class="font-bold text-gray-900 mb-2">${s.title}</h3>
            <p class="text-sm text-gray-600 leading-relaxed">${s.desc}</p>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- ===== TARIFS APERÇU ===== -->
  <section class="py-20 bg-gray-50" id="tarifs" aria-labelledby="pricing-heading">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-10">
        <h2 id="pricing-heading" class="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
          Tarifs transparents
        </h2>
        <p class="text-gray-600 mb-6 text-lg">Sans commission sur vos ventes. Forfait fixe mensuel ou annuel.</p>
        <div class="inline-flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
          <button id="btn-devise-fcfa" onclick="changerDevise('FCFA')"
            class="devise-btn px-4 py-1.5 rounded-lg text-sm font-semibold bg-red-600 text-white transition-colors">
            FCFA
          </button>
          <button id="btn-devise-eur" onclick="changerDevise('EUR')"
            class="devise-btn px-4 py-1.5 rounded-lg text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors">
            EUR
          </button>
          <button id="btn-devise-usd" onclick="changerDevise('USD')"
            class="devise-btn px-4 py-1.5 rounded-lg text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors">
            USD
          </button>
        </div>
      </div>
      <div id="plans-container" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
        <div class="animate-pulse bg-gray-200 rounded-xl h-64"></div>
        <div class="animate-pulse bg-gray-200 rounded-xl h-64"></div>
        <div class="animate-pulse bg-gray-200 rounded-xl h-64"></div>
      </div>
      <div class="text-center mt-8">
        <a href="/tarifs" class="text-sm text-gray-500 hover:text-red-600 transition-colors underline underline-offset-2">
          Voir le détail complet des fonctionnalités par plan →
        </a>
      </div>
    </div>
  </section>

  <!-- ===== FAQ ===== -->
  <section class="py-20 bg-white" aria-labelledby="faq-heading">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-12">
        <h2 id="faq-heading" class="text-3xl font-extrabold text-gray-900 mb-3">
          Questions fréquentes
        </h2>
        <p class="text-gray-600">Tout ce que vous devez savoir avant de vous lancer.</p>
      </div>
      <div class="space-y-3" id="faq" role="list">
        ${[
          {
            q: 'Les clients doivent-ils créer un compte pour commander ?',
            a: "Non. Vos clients commandent directement sans inscription, sans mot de passe, sans email obligatoire. Ils donnent juste leur nom et téléphone pour la livraison. C'est votre boutique, pas une marketplace qui monopolise vos clients."
          },
          {
            q: 'Combien prenez-vous par commande ?',
            a: "Aucune commission sur vos ventes. Vous payez uniquement un abonnement mensuel fixe. Au-delà du quota de commandes incluses dans votre plan, des frais fixes très faibles s'appliquent par commande supplémentaire. Tout est transparent sur la page Tarifs."
          },
          {
            q: 'Comment les clients paient-ils ?',
            a: "En version initiale : espèces à la livraison ou à l'emporter. L'intégration Mobile Money (Orange Money, Wave, MTN) et carte bancaire sera activée progressivement selon les pays, sans frais supplémentaires de notre part."
          },
          {
            q: 'Mes données sont-elles isolées des autres restaurants ?',
            a: "Oui. Chaque restaurant est un tenant complètement isolé. Les politiques RLS (Row-Level Security) de Supabase garantissent qu'aucune donnée ne peut être accessible par un autre restaurant. C'est une architecture multi-tenant testée et validée."
          },
          {
            q: "Puis-je personnaliser l'apparence de ma boutique ?",
            a: "Oui : logo, couleurs de marque, bannière, photos de vos plats. Tout se configure depuis votre tableau de bord en quelques clics, sans intervention technique requise."
          },
          {
            q: "Que se passe-t-il si je dépasse mon quota de commandes ?",
            a: "Votre boutique reste active. Chaque commande supplémentaire est facturée à un tarif fixe très bas (défini par votre plan). Vous pouvez aussi upgrader votre plan à tout moment depuis votre tableau de bord."
          },
          {
            q: 'Y a-t-il un engagement de durée ?',
            a: "Non. L'abonnement est mensuel, sans engagement de durée. Vous pouvez annuler à tout moment depuis votre tableau de bord. Vos données sont exportées sur demande avant suppression."
          },
        ].map((item, i) => `
          <div class="border border-gray-100 rounded-xl overflow-hidden" role="listitem">
            <button
              class="w-full text-left px-5 py-4 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
              onclick="toggleFaq(${i})"
              aria-expanded="false"
              aria-controls="faq-content-${i}">
              <span class="font-semibold text-gray-900 text-sm">${item.q}</span>
              <i id="faq-icon-${i}" class="fa-solid fa-chevron-down text-gray-400 text-xs flex-shrink-0 transition-transform" aria-hidden="true"></i>
            </button>
            <div id="faq-content-${i}" class="hidden px-5 pb-4" role="region">
              <p class="text-sm text-gray-600 leading-relaxed">${item.a}</p>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="text-center mt-8">
        <p class="text-sm text-gray-500">Vous n'avez pas trouvé la réponse ?
          <a href="/contact" class="text-red-600 font-semibold hover:underline ml-1">Contactez-nous</a>
        </p>
      </div>
    </div>
  </section>

  <!-- ===== TÉMOIGNAGE RESTAURATEUR ===== -->
  <section class="py-20 bg-gray-50" aria-labelledby="testimony-heading">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid lg:grid-cols-2 gap-12 items-center">
        <div class="relative rounded-2xl overflow-hidden shadow-xl bg-gray-200 min-h-64">
          <img src="/static/img/restaurant-owner.jpg"
               alt="Restauratrice africaine utilisant MonMenu sur son téléphone"
               class="w-full h-auto object-cover"
               loading="lazy"
               onerror="this.parentElement.innerHTML='<div class=\\'min-h-64 bg-gradient-to-br from-orange-100 to-red-100 flex flex-col items-center justify-center p-8\\'><i class=\\'fa-solid fa-store text-5xl text-red-300 mb-3\\'></i><p class=\\'text-gray-500 text-sm\\'>Photo restauratrice</p></div>'">
        </div>
        <div>
          <div class="inline-flex items-center gap-2 bg-green-100 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <i class="fa-solid fa-star" aria-hidden="true"></i>
            <span>Témoignage restauratrice</span>
          </div>
          <h2 id="testimony-heading" class="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
            « En 5 minutes, ma boutique était en ligne »
          </h2>
          <blockquote class="text-lg text-gray-600 leading-relaxed mb-6 border-l-4 border-red-200 pl-4">
            Avec ${nomProjet}, j'ai créé mon menu en ligne le lundi, et dès le mardi mes clients commandaient via WhatsApp. Plus besoin de répondre aux appels pour prendre les commandes. Mes clients adorent !
          </blockquote>
          <div class="flex items-center gap-4 mb-8">
            <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 font-bold text-lg flex-shrink-0" aria-hidden="true">A</div>
            <div>
              <div class="font-bold text-gray-900">Awa K.</div>
              <div class="text-sm text-gray-500">Restaurant Chez Awa — Ouagadougou, Burkina Faso</div>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-4 text-center">
            <div class="bg-white rounded-xl p-4 shadow-sm">
              <div class="text-2xl font-extrabold text-red-600">5 min</div>
              <div class="text-xs text-gray-500 mt-1">Pour créer sa boutique</div>
            </div>
            <div class="bg-white rounded-xl p-4 shadow-sm">
              <div class="text-2xl font-extrabold text-red-600">0%</div>
              <div class="text-xs text-gray-500 mt-1">De commission</div>
            </div>
            <div class="bg-white rounded-xl p-4 shadow-sm">
              <div class="text-xl font-extrabold text-green-600">WhatsApp</div>
              <div class="text-xs text-gray-500 mt-1">Commandes directes</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ===== APERÇU DASHBOARD ===== -->
  <section class="py-20 bg-white" aria-labelledby="dashboard-heading">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <div class="inline-flex items-center gap-2 bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <i class="fa-solid fa-chart-bar" aria-hidden="true"></i>
            <span>Tableau de bord</span>
          </div>
          <h2 id="dashboard-heading" class="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
            Gérez vos commandes en temps réel
          </h2>
          <p class="text-lg text-gray-600 leading-relaxed mb-6">
            Votre tableau de bord centralise tout : commandes entrantes, historique, statistiques,
            gestion du menu et livreurs. Accessible depuis n'importe quel appareil, partout.
          </p>
          <ul class="space-y-3 mb-8">
            ${[
              { icon: 'fa-bell', text: 'Notification instantanée pour chaque nouvelle commande' },
              { icon: 'fa-chart-line', text: "Statistiques journalières et chiffre d'affaires en temps réel" },
              { icon: 'fa-book-open', text: 'Éditeur de menu avec catégories et photos' },
              { icon: 'fa-motorcycle', text: 'Assignation livreur avec envoi WhatsApp automatique' },
              { icon: 'fa-ticket', text: 'Gestion des codes promotionnels' },
            ].map(item => `
              <li class="flex items-center gap-3">
                <div class="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <i class="fa-solid ${item.icon} text-blue-600 text-sm" aria-hidden="true"></i>
                </div>
                <span class="text-gray-700 text-sm font-medium">${item.text}</span>
              </li>
            `).join('')}
          </ul>
          <a href="/inscription"
            class="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm">
            <i class="fa-solid fa-store" aria-hidden="true"></i>
            Accéder à mon tableau de bord
          </a>
        </div>
        <div class="relative rounded-2xl overflow-hidden shadow-2xl border border-gray-100 bg-gray-100">
          <img src="/static/img/dashboard-preview.jpg"
               alt="Tableau de bord MonMenu — gestion des commandes restaurant"
               class="w-full h-auto object-cover"
               loading="lazy"
               onerror="this.parentElement.innerHTML='<div class=\\'min-h-64 bg-gradient-to-br from-blue-100 to-indigo-100 flex flex-col items-center justify-center p-8\\'><i class=\\'fa-solid fa-chart-line text-5xl text-blue-300 mb-3\\'></i><p class=\\'text-gray-500 text-sm\\'>Aperçu tableau de bord</p></div>'">
        </div>
      </div>
    </div>
  </section>

  <!-- ===== CTA FINAL ===== -->
  <section class="bg-red-600 py-16" aria-labelledby="cta-heading">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
      <h2 id="cta-heading" class="text-3xl sm:text-4xl font-extrabold text-white mb-4">
        Prêt à digitaliser votre restaurant ?
      </h2>
      <p class="text-red-100 text-lg mb-8 max-w-2xl mx-auto">
        Créez votre boutique en quelques minutes. Premier mois offert. Support en français inclus.
      </p>
      <div class="flex flex-col sm:flex-row gap-4 justify-center">
        <a href="/inscription"
          class="inline-flex items-center justify-center gap-2 bg-white text-red-600 font-bold px-8 py-4 rounded-xl hover:bg-red-50 transition-colors text-base shadow-lg">
          <i class="fa-solid fa-store" aria-hidden="true"></i>
          <span>Créer ma boutique gratuitement</span>
        </a>
        <a href="https://wa.me/22600000000?text=Bonjour%2C%20je%20souhaite%20en%20savoir%20plus%20sur%20${encodeURIComponent(nomProjet)}"
          target="_blank" rel="noopener noreferrer"
          class="inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold px-8 py-4 rounded-xl transition-colors text-base">
          <i class="fa-brands fa-whatsapp" aria-hidden="true"></i>
          <span>Nous contacter sur WhatsApp</span>
        </a>
      </div>
    </div>
  </section>

  ${renderFooter(nomProjet)}

  <!-- Bandeau cookies -->
  <div id="cookie-banner" class="fixed bottom-0 left-0 right-0 bg-gray-900 text-white p-4 z-50 hidden" role="dialog" aria-label="Consentement cookies">
    <div class="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
      <p class="text-sm text-gray-300">
        Nous utilisons des cookies techniques essentiels au fonctionnement du site.
        <a href="/legal/cookies" class="text-blue-400 hover:underline ml-1">En savoir plus</a>
      </p>
      <div class="flex gap-3">
        <button onclick="acceptCookies()"
          class="bg-white text-gray-900 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
          Accepter
        </button>
        <button onclick="rejectCookies()"
          class="border border-gray-600 text-gray-300 text-sm px-4 py-2 rounded-lg hover:border-gray-400 transition-colors">
          Refuser
        </button>
      </div>
    </div>
  </div>

  <script src="/static/js/main.js"></script>
  <script>
    // Chargement dynamique des plans depuis D1 via API
    async function changerDevise(devise) {
      document.querySelectorAll('.devise-btn').forEach(b => {
        b.classList.remove('bg-red-600', 'text-white');
        b.classList.add('text-gray-500');
      });
      const btn = document.getElementById('btn-devise-' + devise.toLowerCase());
      if (btn) {
        btn.classList.add('bg-red-600', 'text-white');
        btn.classList.remove('text-gray-500');
      }
      await chargerPlans(devise);
    }

    async function chargerPlans(devise = 'FCFA') {
      try {
        const res = await fetch('/api/v1/plans?devise=' + devise);
        const data = await res.json();
        if (data.plans && data.plans.length) {
          renderPlans(data.plans, data.devise || devise);
        } else {
          renderPlansFallback();
        }
      } catch(e) {
        console.error('Erreur chargement plans:', e);
        renderPlansFallback();
      }
    }

    function renderPlans(plans, devise) {
      const container = document.getElementById('plans-container');
      if (!plans || !plans.length) { renderPlansFallback(); return; }
      container.innerHTML = plans.filter(p => p.nom !== 'Enterprise').map(plan => {
        const isPro = plan.nom && plan.nom.toLowerCase().includes('pro');
        const prix = (plan.prix_mensuel_converti || 0).toLocaleString('fr-FR');
        const features = plan.fonctionnalites ? (typeof plan.fonctionnalites === 'string' ? JSON.parse(plan.fonctionnalites) : plan.fonctionnalites) : {};
        return \`<div class="bg-white rounded-xl border \${isPro ? 'border-red-500 shadow-lg shadow-red-100 ring-1 ring-red-200' : 'border-gray-100 shadow-sm'} p-6 relative flex flex-col">
          \${isPro ? '<div class=\\"absolute -top-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap\\">Recommandé</div>' : ''}
          <div class="mb-5">
            <div class="font-bold text-xl text-gray-900">\${plan.nom}</div>
            <div class="text-4xl font-extrabold text-gray-900 mt-3">
              \${plan.prix_mensuel === 0 ? '<span class=\\"text-green-600\\">Gratuit</span>' : prix + ' <span class=\\"text-base font-normal text-gray-500\\">' + devise + '/mois</span>'}
            </div>
            \${plan.prix_annuel > 0 ? '<div class=\\"text-xs text-green-600 mt-1 font-medium\\">Annuel : ' + (plan.prix_annuel_converti || plan.prix_annuel).toLocaleString(\\'fr-FR\\') + ' ' + devise + ' (2 mois offerts)</div>' : ''}
          </div>
          <ul class="space-y-2 mb-6 text-sm text-gray-600 flex-1">
            <li class="flex items-start gap-2">
              <i class="fa-solid fa-check text-green-500 text-xs mt-0.5 flex-shrink-0"></i>
              <span>\${plan.commandes_incluses === -1 ? 'Commandes illimitées' : (plan.commandes_incluses || 0) + ' commandes/mois incluses'}</span>
            </li>
            \${features.support_whatsapp ? '<li class=\\"flex items-start gap-2\\"><i class=\\"fa-solid fa-check text-green-500 text-xs mt-0.5 flex-shrink-0\\"></i><span>Support WhatsApp prioritaire</span></li>' : ''}
            \${features.domaine_perso ? '<li class=\\"flex items-start gap-2\\"><i class=\\"fa-solid fa-check text-green-500 text-xs mt-0.5 flex-shrink-0\\"></i><span>Domaine personnalisé</span></li>' : ''}
            \${features.export_csv ? '<li class=\\"flex items-start gap-2\\"><i class=\\"fa-solid fa-check text-green-500 text-xs mt-0.5 flex-shrink-0\\"></i><span>Export CSV des commandes</span></li>' : ''}
            \${features.codes_promo ? '<li class=\\"flex items-start gap-2\\"><i class=\\"fa-solid fa-check text-green-500 text-xs mt-0.5 flex-shrink-0\\"></i><span>Codes promotionnels</span></li>' : ''}
            \${features.stats_avancees ? '<li class=\\"flex items-start gap-2\\"><i class=\\"fa-solid fa-check text-green-500 text-xs mt-0.5 flex-shrink-0\\"></i><span>Statistiques avancées</span></li>' : ''}
          </ul>
          <a href="/inscription"
            class="block w-full text-center \${isPro ? 'bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-200' : 'bg-gray-50 hover:bg-gray-100 text-gray-900 border border-gray-200'} font-bold py-3 rounded-xl transition-colors text-sm mt-auto">
            \${plan.prix_mensuel === 0 ? 'Commencer gratuitement' : 'Choisir ce plan'}
          </a>
        </div>\`;
      }).join('');
    }

    function renderPlansFallback() {
      const container = document.getElementById('plans-container');
      container.innerHTML = \`
        <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-6 col-span-full text-center py-10">
          <i class="fa-solid fa-spinner fa-spin text-gray-300 text-3xl mb-3 block"></i>
          <p class="text-gray-500 text-sm">Chargement des tarifs...</p>
          <a href="/tarifs" class="text-red-600 text-sm mt-2 inline-block hover:underline">Voir la page tarifs complète</a>
        </div>\`;
    }

    // FAQ toggle
    function toggleFaq(i) {
      const content = document.getElementById('faq-content-' + i);
      const icon = document.getElementById('faq-icon-' + i);
      const isOpen = !content.classList.contains('hidden');
      content.classList.toggle('hidden');
      icon.classList.toggle('rotate-180');
      const btn = icon.closest('button');
      if (btn) btn.setAttribute('aria-expanded', String(!isOpen));
    }

    document.addEventListener('DOMContentLoaded', () => {
      chargerPlans('FCFA');
    });
  </script>
</body>
</html>`
}
