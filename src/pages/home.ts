// =============================================================
// PAGE D'ACCUEIL — renderHomePage()
// =============================================================
import { renderHead } from '../components/head'
import { renderNav } from '../components/nav'
import { renderFooter } from '../components/footer'

export function renderHomePage(nomProjet: string): string {
  return `${renderHead(
    `${nomProjet} — Commandez en ligne dans vos restaurants préférés`,
    `${nomProjet} est la plateforme de commande en ligne pour les restaurants. Créez votre boutique en quelques minutes. Sans commission.`,
    nomProjet
  )}
<body class="font-sans bg-white text-gray-900">
  ${renderNav(nomProjet, 'accueil')}

  <!-- ===== HERO ===== -->
  <section class="bg-gradient-to-br from-red-50 via-white to-blue-50 py-20 lg:py-28" id="hero">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid lg:grid-cols-2 gap-12 items-center">
        <div>
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
          </div>
        </div>

        <div class="relative">
          <div class="relative rounded-2xl overflow-hidden shadow-2xl max-w-lg mx-auto lg:ml-auto bg-gray-100">
            <img src="/static/img/hero-illustration.jpg"
                 alt="Restaurant en ligne"
                 class="w-full h-auto object-cover rounded-2xl"
                 loading="eager"
                 onerror="this.parentElement.innerHTML='<div class=\\'min-h-72 bg-gradient-to-br from-red-100 to-orange-100 flex items-center justify-center rounded-2xl\\'><i class=\\'fa-solid fa-utensils text-6xl text-red-300\\'></i></div>'">
            
            <div class="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-3 border border-white/50">
              <div class="flex items-center gap-3 mb-2.5">
                <div class="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <i class="fa-solid fa-drumstick-bite text-red-600 text-sm" aria-hidden="true"></i>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-bold text-gray-900 text-sm truncate">Restaurant Partenaire</div>
                  <div class="text-xs text-green-600 flex items-center gap-1">
                    <i class="fa-solid fa-circle text-xs" aria-hidden="true"></i> Ouvert · Commande sans inscription
                  </div>
                </div>
              </div>
              <button class="w-full bg-green-600 text-white text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-1.5">
                <i class="fa-brands fa-whatsapp text-sm" aria-hidden="true"></i>
                Commander via WhatsApp
              </button>
            </div>
          </div>
          <div class="absolute -top-3 -right-3 bg-white rounded-xl shadow-lg border border-gray-100 p-3 flex items-center gap-2">
            <div class="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <i class="fa-solid fa-check text-green-600 text-sm" aria-hidden="true"></i>
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

  <!-- ===== FONCTIONNALITÉS ===== -->
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
          { icon: 'fa-mobile-screen-button', title: 'Boutique en ligne', desc: 'Votre menu accessible via un lien unique ou QR code. Aucune application à télécharger.', color: 'text-red-600 bg-red-50' },
          { icon: 'fa-brands fa-whatsapp', title: 'Notifications WhatsApp', desc: 'Chaque commande arrive instantanément sur votre WhatsApp.', color: 'text-green-600 bg-green-50' },
          { icon: 'fa-chart-line', title: 'Tableau de bord', desc: 'Statistiques claires et gestion du menu en temps réel.', color: 'text-blue-600 bg-blue-50' },
          { icon: 'fa-location-dot', title: 'Géolocalisation', desc: "Calcul automatique des frais de livraison selon la distance.", color: 'text-orange-600 bg-orange-50' },
          { icon: 'fa-qrcode', title: 'QR Code imprimable', desc: "Générez votre QR code pour l'afficher dans votre établissement.", color: 'text-purple-600 bg-purple-50' },
          { icon: 'fa-palette', title: 'Personnalisation', desc: 'Votre boutique à votre image, couleurs et logo personnalisables.', color: 'text-pink-600 bg-pink-50' },
        ].map(f => `
          <article class="bg-gray-50 rounded-xl p-6 border border-gray-100 hover:shadow-md transition-shadow">
            <div class="w-11 h-11 ${f.color} rounded-xl flex items-center justify-center mb-4" aria-hidden="true">
              <i class="fa-solid ${f.icon} text-lg"></i>
            </div>
            <h3 class="font-bold text-gray-900 mb-2">${f.title}</h3>
            <p class="text-sm text-gray-600 leading-relaxed">${f.desc}</p>
          </article>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- ===== TARIFS ===== -->
  <section class="py-20 bg-gray-50" id="tarifs">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-10">
        <h2 class="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4">
          Tarifs transparents
        </h2>
        <p class="text-gray-600 mb-6 text-lg">Sans commission sur vos ventes. Forfait fixe sans surprise.</p>
      </div>
      
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
        <!-- Plan Basique -->
        <div class="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
          <h3 class="font-bold text-gray-900 text-xl mb-2">Essentiel</h3>
          <div class="text-3xl font-bold text-red-600 mb-4">Gratuit</div>
          <ul class="text-sm text-gray-600 space-y-3 mb-8 flex-1">
            <li class="flex items-center gap-2"><i class="fa-solid fa-check text-green-500"></i> Menu numérique</li>
            <li class="flex items-center gap-2"><i class="fa-solid fa-check text-green-500"></i> QR Code standard</li>
            <li class="flex items-center gap-2"><i class="fa-solid fa-check text-green-500"></i> Jusqu'à 20 articles</li>
          </ul>
          <a href="/inscription" class="block text-center py-3 px-6 rounded-xl border border-red-600 text-red-600 font-bold hover:bg-red-50 transition-colors">Démarrer</a>
        </div>

        <!-- Plan Pro -->
        <div class="bg-white p-8 rounded-2xl border-2 border-red-600 shadow-xl flex flex-col relative scale-105 z-10">
          <div class="absolute -top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase">Populaire</div>
          <h3 class="font-bold text-gray-900 text-xl mb-2">Professionnel</h3>
          <div class="text-3xl font-bold text-red-600 mb-4">Sur mesure</div>
          <ul class="text-sm text-gray-600 space-y-3 mb-8 flex-1">
            <li class="flex items-center gap-2"><i class="fa-solid fa-check text-green-500"></i> Commandes illimitées</li>
            <li class="flex items-center gap-2"><i class="fa-solid fa-check text-green-500"></i> Notifications WhatsApp</li>
            <li class="flex items-center gap-2"><i class="fa-solid fa-check text-green-500"></i> Géolocalisation client</li>
            <li class="flex items-center gap-2"><i class="fa-solid fa-check text-green-500"></i> Support prioritaire</li>
          </ul>
          <a href="/inscription" class="block text-center py-3 px-6 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-200">Choisir Pro</a>
        </div>

        <!-- Plan Enterprise -->
        <div class="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
          <h3 class="font-bold text-gray-900 text-xl mb-2">Business</h3>
          <div class="text-3xl font-bold text-red-600 mb-4">Contact</div>
          <ul class="text-sm text-gray-600 space-y-3 mb-8 flex-1">
            <li class="flex items-center gap-2"><i class="fa-solid fa-check text-green-500"></i> Multi-restaurants</li>
            <li class="flex items-center gap-2"><i class="fa-solid fa-check text-green-500"></i> Statistiques avancées</li>
            <li class="flex items-center gap-2"><i class="fa-solid fa-check text-green-500"></i> Formation dédiée</li>
          </ul>
          <a href="/contact" class="block text-center py-3 px-6 rounded-xl border border-gray-200 text-gray-700 font-bold hover:bg-gray-50 transition-colors">Nous contacter</a>
        </div>
      </div>
    </div>
  </section>

  <!-- ===== FAQ ===== -->
  <section class="py-20 bg-white">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-12">
        <h2 class="text-3xl font-extrabold text-gray-900 mb-3">Questions fréquentes</h2>
        <p class="text-gray-600">Tout ce que vous devez savoir avant de vous lancer.</p>
      </div>
      <div class="space-y-4">
        <details class="group bg-gray-50 rounded-xl p-4 border border-gray-100">
          <summary class="list-none font-bold text-gray-900 cursor-pointer flex justify-between items-center">
            Comment recevoir les commandes ?
            <i class="fa-solid fa-chevron-down text-xs transition-transform group-open:rotate-180"></i>
          </summary>
          <p class="mt-3 text-sm text-gray-600 leading-relaxed">
            Les commandes arrivent instantanément sur votre tableau de bord et sont également envoyées sur votre numéro WhatsApp avec tous les détails du client et des produits.
          </p>
        </details>
        <details class="group bg-gray-50 rounded-xl p-4 border border-gray-100">
          <summary class="list-none font-bold text-gray-900 cursor-pointer flex justify-between items-center">
            Y a-t-il des frais cachés ?
            <i class="fa-solid fa-chevron-down text-xs transition-transform group-open:rotate-180"></i>
          </summary>
          <p class="mt-3 text-sm text-gray-600 leading-relaxed">
            Non, aucun. Nous ne prélevons aucune commission sur vos ventes. Vous ne payez que votre abonnement fixe.
          </p>
        </details>
      </div>
    </div>
  </section>

  ${renderFooter(nomProjet)}
  <script src="/static/js/main.js"></script>
</body>
</html>`
}
