// src/pages/article.ts
import { renderHead, jsonLdArticle } from '../components/head'
import { renderNav } from '../components/nav'
import { renderFooter } from '../components/footer'
import { getTranslations } from '../i18n'

export interface ArticleDetail {
  titre: string
  contenu: string
  extrait: string
  categorie: string
  temps_lecture: string | null
  image_url: string | null
  date_publication: string | null
  auteur: string | null
}

export function renderArticlePage(nomProjet: string, article: ArticleDetail, locale: string = 'fr'): string {
  const t = getTranslations(locale)

  const formatDate = (iso: string | null) => {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString(locale === 'en' ? 'en-US' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  // SEO étendu pour les articles de blog
  const articleUrl = `https://monmenu.app/blog/${article.titre.toLowerCase().replace(/\s+/g, '-')}`
  return `${renderHead(
    `${article.titre} — ${nomProjet}`,
    article.extrait,
    nomProjet,
    '',
    articleUrl,
    {
      ogType: 'article',
      ogImage: article.image_url ?? undefined,
      ogLocale: locale === 'en' ? 'en_US' : 'fr_FR',
      canonicalUrl: articleUrl,
      articlePublishedTime: article.date_publication ?? undefined,
      articleAuthor: article.auteur ?? undefined,
      jsonLd: jsonLdArticle({
        title: article.titre,
        description: article.extrait,
        imageUrl: article.image_url,
        datePublished: article.date_publication,
        author: article.auteur,
        url: articleUrl,
        nomProjet
      })
    }
  )}
<body class="bg-white dark:bg-gray-900 font-sans transition-colors">
  ${renderNav(nomProjet, 'blog', locale)}

  <article class="max-w-2xl mx-auto px-4 sm:px-6 py-16">
    <a href="/blog" class="text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 transition-colors inline-flex items-center gap-1">
      <i class="fa-solid fa-arrow-left text-xs" aria-hidden="true"></i> ${t.blog.back}
    </a>

    <span class="inline-block text-xs font-bold text-red-600 bg-red-50 dark:bg-red-900/30 px-3 py-1 rounded-full mb-4 uppercase tracking-wide mt-6">
      ${article.categorie}
    </span>
    <h1 class="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white mb-4 leading-tight">${article.titre}</h1>
    <div class="flex items-center gap-3 text-sm text-gray-400 mb-8">
      ${article.date_publication ? `<span><i class="fa-regular fa-calendar mr-1" aria-hidden="true"></i>${formatDate(article.date_publication)}</span>` : ''}
      ${article.temps_lecture ? `<span>· ${article.temps_lecture} ${t.blog.min_read}</span>` : ''}
      ${article.auteur ? `<span>· ${article.auteur}</span>` : ''}
    </div>

    ${article.image_url ? `<img src="${article.image_url}" alt="${article.titre}" class="w-full rounded-2xl mb-8 object-cover aspect-video">` : ''}

    <div class="prose prose-gray dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 leading-relaxed">
      ${article.contenu}
    </div>
  </article>

  ${renderFooter(nomProjet, locale)}
  <script src="/static/js/main.js"></script>
</body>
</html>`
}
