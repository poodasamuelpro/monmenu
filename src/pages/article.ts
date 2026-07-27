// src/pages/article.ts 
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

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${article.titre} — ${nomProjet}</title>
  <meta name="description" content="${article.extrait}">
  <meta property="og:title" content="${article.titre}">
  <meta property="og:description" content="${article.extrait}">
  <meta property="og:type" content="article">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/static/css/main.css">
  <style>body { font-family: 'Inter', sans-serif; }</style>
</head>
<body class="bg-white">
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
      ${article.temps_lecture ? `<span>· ${article.temps_lecture} de lecture</span>` : ''}
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
