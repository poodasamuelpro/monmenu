// src/pages/blog.ts
import { renderHead } from '../components/head'
import { renderNav } from '../components/nav'
import { renderFooter } from '../components/footer'
import { getTranslations } from '../i18n'

export interface ArticleBlog {
  slug: string
  titre: string
  extrait: string
  categorie: string
  temps_lecture: string | null
  image_url: string | null
  date_publication: string | null
}

export function renderBlogPage(nomProjet: string, articles: ArticleBlog[] = [], locale: string = 'fr'): string {
  const t = getTranslations(locale)
  const categories = Array.from(new Set(articles.map(a => a.categorie))).sort()

  const formatDate = (iso: string | null) => {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString(locale === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  const articlesHtml = articles.map(a => `
    <article class="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden hover:shadow-md transition-shadow" data-cat="${a.categorie}">
      <div class="aspect-video bg-gray-100 dark:bg-gray-700 overflow-hidden">
        ${a.image_url
          ? `<img src="${a.image_url}" alt="${a.titre}" class="w-full h-full object-cover" loading="lazy">`
          : `<div class="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-500"><i class="fa-regular fa-image text-4xl" aria-hidden="true"></i></div>`
        }
      </div>
      <div class="p-6">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-900/30 px-2.5 py-1 rounded-full">${a.categorie}</span>
          ${a.temps_lecture ? `<span class="text-xs text-gray-400">${a.temps_lecture} ${t.blog.min_read}</span>` : ''}
        </div>
        <h2 class="font-bold text-gray-900 dark:text-white text-lg leading-tight mb-2 hover:text-red-600 transition-colors">
          <a href="/blog/${a.slug}">${a.titre}</a>
        </h2>
        <p class="text-sm text-gray-600 dark:text-gray-300 line-clamp-2 mb-4">${a.extrait}</p>
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-400">${a.date_publication ? `<i class="fa-regular fa-calendar mr-1" aria-hidden="true"></i>${formatDate(a.date_publication)}` : ''}</span>
          <a href="/blog/${a.slug}" class="text-sm font-semibold text-red-600 hover:text-red-700 flex items-center gap-1">
            ${t.blog.read} <i class="fa-solid fa-arrow-right text-xs" aria-hidden="true"></i>
          </a>
        </div>
      </div>
    </article>
  `).join('')

  const filtresHtml = categories.length > 1 ? `
    <div class="flex flex-wrap gap-2 mb-8">
      <button onclick="filtrerArticles('tous')" class="cat-btn text-sm font-semibold text-white bg-red-600 px-4 py-1.5 rounded-full" data-cat="tous">${t.blog.all_articles}</button>
      ${categories.map(cat => `
        <button onclick="filtrerArticles('${cat}')" class="cat-btn text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 px-4 py-1.5 rounded-full hover:border-red-300 transition-colors" data-cat="${cat}">${cat}</button>
      `).join('')}
    </div>
  ` : ''

  const contenuArticles = articles.length > 0
    ? `
      ${filtresHtml}
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12" id="articles-grid">
        ${articlesHtml}
      </div>
    `
    : `
      <div class="text-center py-20 mb-12">
        <i class="fa-regular fa-newspaper text-4xl text-gray-300 mb-4" aria-hidden="true"></i>
        <p class="text-gray-500 dark:text-gray-400">${t.blog.no_articles_soon}</p>
      </div>
    `

  return `${renderHead(
    `${t.blog.title} — ${nomProjet}`,
    t.blog.description,
    nomProjet
  )}
<body class="bg-gray-50 dark:bg-gray-900 font-sans transition-colors">
  ${renderNav(nomProjet, 'blog', locale)}

  <!-- Header blog -->
  <header class="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 py-12">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 text-center">
      <span class="inline-block text-xs font-bold text-red-600 bg-red-50 dark:bg-red-900/30 px-3 py-1 rounded-full mb-4 uppercase tracking-wide">${t.blog.guides}</span>
      <h1 class="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white mb-3">${t.blog.title}</h1>
      <p class="text-gray-600 dark:text-gray-300 max-w-xl mx-auto">${t.blog.subtitle}</p>
    </div>
  </header>

  <!-- Articles -->
  <main class="max-w-6xl mx-auto px-4 sm:px-6 py-12">
    ${contenuArticles}

    <!-- CTA -->
    <div class="bg-gradient-to-r from-red-600 to-orange-500 rounded-3xl p-8 text-center text-white">
      <h2 class="text-2xl font-extrabold mb-2">${t.blog.cta_title}</h2>
      <p class="text-red-100 mb-6">${t.blog.cta_subtitle}</p>
      <a href="/inscription" class="inline-flex items-center gap-2 bg-white text-red-600 font-bold px-6 py-3 rounded-xl hover:bg-red-50 transition-colors">
        <i class="fa-solid fa-rocket" aria-hidden="true"></i>
        ${t.blog.cta_btn}
      </a>
    </div>
  </main>

  ${renderFooter(nomProjet, locale)}
  <script src="/static/js/main.js"></script>
  <script>
    function filtrerArticles(cat) {
      document.querySelectorAll('#articles-grid article').forEach(a => {
        a.style.display = (cat === 'tous' || a.dataset.cat === cat) ? '' : 'none';
      });
      document.querySelectorAll('.cat-btn').forEach(btn => {
        const isActive = btn.dataset.cat === cat;
        btn.className = isActive
          ? 'cat-btn text-sm font-semibold text-white bg-red-600 px-4 py-1.5 rounded-full'
          : 'cat-btn text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 px-4 py-1.5 rounded-full hover:border-red-300 transition-colors';
      });
    }
  </script>
</body>
</html>`
}
