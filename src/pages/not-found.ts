// src/pages/not-found.ts
import { renderHead } from '../components/head'
import { getTranslations } from '../i18n'

export function render404Page(nomProjet: string = 'MonMenu', locale: string = 'fr'): string {
  const t = getTranslations(locale)

  return `${renderHead(
    `${t.not_found.title} — ${nomProjet}`,
    t.not_found.desc,
    nomProjet
  )}
<body class="bg-gray-50 dark:bg-gray-900 font-sans flex items-center justify-center min-h-screen p-4 transition-colors">
  <div class="text-center max-w-md">
    <!-- Illustration 404 -->
    <div class="mb-8">
      <div class="text-9xl font-extrabold text-red-600 leading-none mb-2">404</div>
      <div class="flex items-center justify-center gap-2 text-gray-400">
        <div class="h-px w-16 bg-gray-200 dark:bg-gray-700"></div>
        <i class="fa-solid fa-utensils text-gray-300 dark:text-gray-600"></i>
        <div class="h-px w-16 bg-gray-200 dark:bg-gray-700"></div>
      </div>
    </div>

    <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-3">${t.not_found.heading}</h1>
    <p class="text-gray-600 dark:text-gray-300 mb-8">
      ${t.not_found.desc}
    </p>

    <div class="flex flex-col sm:flex-row gap-3 justify-center">
      <a href="/"
        class="inline-flex items-center justify-center gap-2 bg-red-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-red-700 transition-colors">
        <i class="fa-solid fa-house"></i>
        ${t.not_found.back_home}
      </a>
      <a href="/contact"
        class="inline-flex items-center justify-center gap-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-semibold px-6 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
        <i class="fa-solid fa-envelope"></i>
        ${t.not_found.contact}
      </a>
    </div>

    <!-- Liens utiles -->
    <div class="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">${t.not_found.useful_links}</p>
      <div class="flex flex-wrap justify-center gap-4 text-sm">
        <a href="/fonctionnalites" class="text-red-600 hover:underline">${t.not_found.features}</a>
        <a href="/tarifs" class="text-red-600 hover:underline">${t.not_found.pricing}</a>
        <a href="/blog" class="text-red-600 hover:underline">${t.not_found.blog}</a>
        <a href="/inscription" class="text-red-600 hover:underline">${t.not_found.create_shop}</a>
      </div>
    </div>
  </div>
  <script src="/static/js/main.js"></script>
</body>
</html>`
}
