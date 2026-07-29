// Page affichée quand un tenant (essai expiré ou suspendu) tente
// d'accéder au dashboard. Redirigée depuis index.ts, route /dashboard/*.
import { renderHead } from '../components/head'
import { renderNav } from '../components/nav'
import { renderFooter } from '../components/footer'

export function renderCompteInactifPage(nomProjet: string): string {
  return `${renderHead(
    `Compte inactif — ${nomProjet}`,
    `Votre période d'essai est terminée.`,
    nomProjet,
    `<meta name="robots" content="noindex, nofollow">`
  )}
<body class="font-sans bg-white dark:bg-[#0B0A09] text-gray-900 dark:text-gray-50">
  ${renderNav(nomProjet, '', 'fr')}
  <section class="max-w-2xl mx-auto px-4 sm:px-6 py-24 text-center">
    <div class="w-16 h-16 mx-auto mb-6 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center">
      <i class="fa-solid fa-clock text-red-600 dark:text-red-400 text-2xl" aria-hidden="true"></i>
    </div>
    <h1 class="text-3xl font-extrabold text-gray-900 dark:text-white mb-4">
      Votre période d'essai est terminée
    </h1>
    <p class="text-gray-600 dark:text-gray-300 mb-8 leading-relaxed">
      Activez votre abonnement pour continuer à recevoir des commandes et
      retrouver l'accès complet à votre tableau de bord.
    </p>
    <div class="flex flex-col sm:flex-row gap-3 justify-center">
      <a href="/tarifs" class="inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3.5 rounded-xl transition-colors">
        Voir les abonnements
      </a>
      <a href="/contact" class="inline-flex items-center justify-center gap-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold px-6 py-3.5 rounded-xl border border-gray-200 dark:border-gray-700 transition-colors">
        Contacter un conseiller
      </a>
    </div>
  </section>
  ${renderFooter(nomProjet, 'fr')}
</body>
</html>`
}