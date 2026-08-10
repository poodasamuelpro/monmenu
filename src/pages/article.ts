// src/pages/article.ts — FR uniquement, sans dark mode
import { renderHead, jsonLdArticle } from '../components/head'
import { renderNav } from '../components/nav'
import { renderFooter } from '../components/footer'

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

export function renderArticlePage(nomProjet: string, article: ArticleDetail): string {
  const formatDate = (iso: string | null) => {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  // SEO étendu pour les articles de blog
  const articleUrl = `https://monmenu.com/blog/${article.titre.toLowerCase().replace(/\s+/g, '-')}`
  return `${renderHead(
    `${article.titre} — ${nomProjet}`,
    article.extrait,
    nomProjet,
    '',
    articleUrl,
    {
      ogType: 'article',
      ogImage: article.image_url ?? undefined,
      ogLocale: 'fr_FR',
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
<body class="bg-white font-sans">
  ${renderNav(nomProjet, 'blog')}

  <article class="max-w-2xl mx-auto px-4 sm:px-6 py-16">
    <a href="/blog" class="text-sm text-gray-500 hover:text-red-600 transition-colors inline-flex items-center gap-1">
      <i class="fa-solid fa-arrow-left text-xs" aria-hidden="true"></i> Retour au blog
    </a>

    <span class="inline-block text-xs font-bold text-red-600 bg-red-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wide mt-6">
      ${article.categorie}
    </span>
    <h1 class="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">${article.titre}</h1>
    <div class="flex items-center gap-3 text-sm text-gray-400 mb-8">
      ${article.date_publication ? `<span><i class="fa-regular fa-calendar mr-1" aria-hidden="true"></i>${formatDate(article.date_publication)}</span>` : ''}
      ${article.temps_lecture ? `<span>· ${article.temps_lecture} min de lecture</span>` : ''}
      ${article.auteur ? `<span>· ${article.auteur}</span>` : ''}
    </div>

    ${article.image_url ? `<img src="${article.image_url}" alt="${article.titre}" class="w-full rounded-2xl mb-8 object-cover aspect-video">` : ''}

    <div class="prose prose-gray max-w-none text-gray-700 leading-relaxed">
      ${article.contenu}
    </div>
  </article>

  ${renderFooter(nomProjet)}
  <script src="/static/js/main.js"></script>
</body>
</html>`
}
