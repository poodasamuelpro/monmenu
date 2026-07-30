// src/pages/not-found.ts — FR uniquement, sans dark mode
import { renderHead } from '../components/head'

export function render404Page(nomProjet: string = 'MonMenu'): string {

  return `${renderHead(
    `Page introuvable — ${nomProjet}`,
    'La page que vous cherchez n\'existe pas, a été déplacée, ou le restaurant n\'est plus disponible.',
    nomProjet
  )}
<body class="bg-gray-50 font-sans flex items-center justify-center min-h-screen p-4">
  <div class="text-center max-w-md">
    <!-- Illustration 404 -->
    <div class="mb-8">
      <div class="text-9xl font-extrabold text-red-600 leading-none mb-2">404</div>
      <div class="flex items-center justify-center gap-2 text-gray-400">
        <div class="h-px w-16 bg-gray-200"></div>
        <i class="fa-solid fa-utensils text-gray-300"></i>
        <div class="h-px w-16 bg-gray-200"></div>
      </div>
    </div>

    <h1 class="text-2xl font-bold text-gray-900 mb-3">Page introuvable</h1>
    <p class="text-gray-600 mb-8">
      La page que vous cherchez n'existe pas, a été déplacée, ou le restaurant n'est plus disponible.
    </p>

    <div class="flex flex-col sm:flex-row gap-3 justify-center">
      <a href="/"
        class="inline-flex items-center justify-center gap-2 bg-red-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-red-700 transition-colors">
        <i class="fa-solid fa-house"></i>
        Retour à l'accueil
      </a>
      <a href="/contact"
        class="inline-flex items-center justify-center gap-2 border border-gray-200 text-gray-700 font-semibold px-6 py-3 rounded-xl hover:bg-gray-50 transition-colors">
        <i class="fa-solid fa-envelope"></i>
        Nous contacter
      </a>
    </div>

    <!-- Liens utiles -->
    <div class="mt-8 pt-8 border-t border-gray-200">
      <p class="text-sm text-gray-500 mb-4">Liens utiles</p>
      <div class="flex flex-wrap justify-center gap-4 text-sm">
        <a href="/fonctionnalites" class="text-red-600 hover:underline">Fonctionnalités</a>
        <a href="/tarifs" class="text-red-600 hover:underline">Tarifs</a>
        <a href="/blog" class="text-red-600 hover:underline">Blog</a>
        <a href="/inscription" class="text-red-600 hover:underline">Créer ma boutique</a>
      </div>
    </div>
  </div>
  <script src="/static/js/main.js"></script>
</body>
</html>`
}
