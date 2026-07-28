// src/pages/legal.ts
import { renderHead } from '../components/head'
import { renderNav } from '../components/nav'
import { renderFooter } from '../components/footer'
import { getTranslations } from '../i18n'

import { getCGUContent } from './cgu'
import { getConfidentialiteContent } from './confidentialite'
import { getMentionsContent } from './mentions'
import { getCookiesContent } from './cookies'

export function renderLegalPage(type: 'cgu' | 'confidentialite' | 'mentions' | 'cookies', nomProjet: string, locale: string = 'fr'): string {
  const t = getTranslations(locale)
  const year = new Date().getFullYear()

  const contents: Record<string, { title: string; body: string }> = {
    cgu: {
      title: t.legal.cgu,
      body: getCGUContent(nomProjet, year)
    },
    confidentialite: {
      title: t.legal.confidentialite,
      body: getConfidentialiteContent(nomProjet, year)
    },
    mentions: {
      title: t.legal.mentions,
      body: getMentionsContent(nomProjet, year)
    },
    cookies: {
      title: t.legal.cookies,
      body: getCookiesContent(nomProjet, year)
    }
  }

  const content = contents[type]

  return `${renderHead(
    `${content.title} — ${nomProjet}`,
    `${content.title} de ${nomProjet}. Information sur vos droits et nos obligations.`,
    nomProjet
  )}
<body class="font-sans bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors">
  ${renderNav(nomProjet, '', locale)}
  <main class="max-w-3xl mx-auto px-4 sm:px-6 py-16">
    <nav class="text-xs text-gray-400 mb-8 flex items-center gap-2">
      <a href="/" class="hover:text-gray-600 dark:hover:text-gray-200 transition-colors">${t.legal.home}</a>
      <i class="fa-solid fa-chevron-right text-gray-300"></i>
      <span class="text-gray-600 dark:text-gray-300">${content.title}</span>
    </nav>
    <article class="prose prose-sm max-w-none text-gray-700 dark:text-gray-300 leading-relaxed dark:prose-invert">
      <h1 class="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white mb-2">${content.title}</h1>
      <p class="text-gray-400 text-sm mb-8">${t.legal.effective_date} ${year}</p>
      ${content.body}
    </article>

    <!-- Navigation entre pages légales -->
    <nav class="mt-12 pt-8 border-t border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-4">
      <a href="/legal/cgu" class="p-4 border border-gray-100 dark:border-gray-800 rounded-xl hover:border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors group">
        <div class="text-xs text-gray-400 mb-0.5 group-hover:text-red-400">${t.legal.nav_cgu_label}</div>
        <div class="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-red-700">${t.legal.cgu}</div>
      </a>
      <a href="/legal/confidentialite" class="p-4 border border-gray-100 dark:border-gray-800 rounded-xl hover:border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors group">
        <div class="text-xs text-gray-400 mb-0.5 group-hover:text-red-400">${t.legal.nav_confidentialite_label}</div>
        <div class="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-red-700">${t.legal.confidentialite}</div>
      </a>
      <a href="/legal/mentions" class="p-4 border border-gray-100 dark:border-gray-800 rounded-xl hover:border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors group">
        <div class="text-xs text-gray-400 mb-0.5 group-hover:text-red-400">${t.legal.nav_mentions_label}</div>
        <div class="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-red-700">${t.legal.mentions}</div>
      </a>
      <a href="/legal/cookies" class="p-4 border border-gray-100 dark:border-gray-800 rounded-xl hover:border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors group">
        <div class="text-xs text-gray-400 mb-0.5 group-hover:text-red-400">${t.legal.nav_cookies_label}</div>
        <div class="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-red-700">${t.legal.cookies}</div>
      </a>
    </nav>
  </main>
  ${renderFooter(nomProjet, locale)}
  <script src="/static/js/main.js"></script>
</body>
</html>`
}
