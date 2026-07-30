// src/pages/legal.ts
import { renderHead } from '../components/head'
import { renderNav } from '../components/nav'
import { renderFooter } from '../components/footer'
import { getCGUContent } from './cgu'
import { getConfidentialiteContent } from './confidentialite'
import { getMentionsContent } from './mentions'
import { getCookiesContent } from './cookies'

export function renderLegalPage(type: 'cgu' | 'confidentialite' | 'mentions' | 'cookies', nomProjet: string): string {
  const year = new Date().getFullYear()

  const titles: Record<string, string> = {
    cgu: 'Conditions Générales d\'Utilisation',
    confidentialite: 'Politique de Confidentialité',
    mentions: 'Mentions Légales',
    cookies: 'Politique des Cookies'
  }
  const navLabels: Record<string, string> = {
    cgu: 'Conditions',
    confidentialite: 'Protection',
    mentions: 'Information',
    cookies: 'Traceurs'
  }

  const contents: Record<string, { title: string; body: string }> = {
    cgu: { title: titles.cgu, body: getCGUContent(nomProjet, year) },
    confidentialite: { title: titles.confidentialite, body: getConfidentialiteContent(nomProjet, year) },
    mentions: { title: titles.mentions, body: getMentionsContent(nomProjet, year) },
    cookies: { title: titles.cookies, body: getCookiesContent(nomProjet, year) }
  }

  const content = contents[type]

  return `${renderHead(
    `${content.title} — ${nomProjet}`,
    `${content.title} de ${nomProjet}. Information sur vos droits et nos obligations.`,
    nomProjet
  )}
<body class="font-sans bg-white text-gray-900">
  ${renderNav(nomProjet, '')}
  <main class="max-w-3xl mx-auto px-4 sm:px-6 py-16">
    <nav class="text-xs text-gray-400 mb-8 flex items-center gap-2">
      <a href="/" class="hover:text-gray-600 transition-colors">Accueil</a>
      <i class="fa-solid fa-chevron-right text-gray-300"></i>
      <span class="text-gray-600">${content.title}</span>
    </nav>
    <article class="prose prose-sm max-w-none text-gray-700 leading-relaxed">
      <h1 class="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-2">${content.title}</h1>
      <p class="text-gray-400 text-sm mb-8">En vigueur à compter de juillet ${year}</p>
      ${content.body}
    </article>

    <!-- Navigation entre pages légales -->
    <nav class="mt-12 pt-8 border-t border-gray-100 grid grid-cols-2 gap-4">
      <a href="/legal/cgu" class="p-4 border border-gray-100 rounded-2xl hover:border-red-200 hover:bg-red-50 transition-colors group">
        <div class="text-xs text-gray-400 mb-0.5 group-hover:text-red-400">${navLabels.cgu}</div>
        <div class="text-sm font-semibold text-gray-900 group-hover:text-red-700">${titles.cgu}</div>
      </a>
      <a href="/legal/confidentialite" class="p-4 border border-gray-100 rounded-2xl hover:border-red-200 hover:bg-red-50 transition-colors group">
        <div class="text-xs text-gray-400 mb-0.5 group-hover:text-red-400">${navLabels.confidentialite}</div>
        <div class="text-sm font-semibold text-gray-900 group-hover:text-red-700">${titles.confidentialite}</div>
      </a>
      <a href="/legal/mentions" class="p-4 border border-gray-100 rounded-2xl hover:border-red-200 hover:bg-red-50 transition-colors group">
        <div class="text-xs text-gray-400 mb-0.5 group-hover:text-red-400">${navLabels.mentions}</div>
        <div class="text-sm font-semibold text-gray-900 group-hover:text-red-700">${titles.mentions}</div>
      </a>
      <a href="/legal/cookies" class="p-4 border border-gray-100 rounded-2xl hover:border-red-200 hover:bg-red-50 transition-colors group">
        <div class="text-xs text-gray-400 mb-0.5 group-hover:text-red-400">${navLabels.cookies}</div>
        <div class="text-sm font-semibold text-gray-900 group-hover:text-red-700">${titles.cookies}</div>
      </a>
    </nav>
  </main>
  ${renderFooter(nomProjet)}
  <script src="/static/js/main.js"></script>
</body>
</html>`
}
