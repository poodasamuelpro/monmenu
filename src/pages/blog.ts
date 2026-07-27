// src/pages/blog.ts
import { renderNav } from '../components/nav'
import { renderFooter } from '../components/footer'

export interface ArticleBlog {
  slug: string
  titre: string
  extrait: string
  categorie: string
  temps_lecture: string | null
  image_url: string | null
  date_publication: string | null
}

export function renderBlogPage(nomProjet: string, articles: ArticleBlog[] = []): string {
  const categories = Array.from(new Set(articles.map(a => a.categorie))).sort()

  const formatDate = (iso: string | null) => {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  const articlesHtml = articles.map(a => `
    <article class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow" data-cat="${a.categorie}">
      <div class="aspect-video bg-gray-100 overflow-hidden">
        ${a.image_url
          ? `<img src="${a.image_url}" alt="${a.titre}" class="w-full h-full object-cover" loading="lazy">`
          : `<div class="w-full h-full flex items-center justify-center text-gray-300"><i class="fa-regular fa-image text-4xl" aria-hidden="true"></i></div>`
        }
      </div>
      <div class="p-6">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-full">${a.categorie}</span>
          ${a.temps_lecture ? `<span class="text-xs text-gray-400">${a.temps_lecture} de lecture</span>` : ''}
        </div>
        <h2 class="font-bold text-gray-900 text-lg leading-tight mb-2 hover:text-red-600 transition-colors">
          <a href="/blog/${a.slug}">${a.titre}</a>
        </h2>
        <p class="text-sm text-gray-600 line-clamp-2 mb-4">${a.extrait}</p>
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-400">${a.date_publication ? `<i class="fa-regular fa-calendar mr-1" aria-hidden="true"></i>${formatDate(a.date_publication)}` : ''}</span>
          <a href="/blog/${a.slug}" class="text-sm font-semibold text-red-600 hover:text-red-700 flex items-center gap-1">
            Lire <i class="fa-solid fa-arrow-right text-xs" aria-hidden="true"></i>
          </a>
        </div>
      </div>
    </article>
  `).join('')

  const filtresHtml = categories.length > 1 ? `
    <div class="flex flex-wrap gap-2 mb-8">
      <button onclick="filtrerArticles('tous')" class="cat-btn text-sm font-semibold text-white bg-red-600 px-4 py-1.5 rounded-full" data-cat="tous">Tous les articles</button>
      ${categories.map(cat => `
        <button onclick="filtrerArticles('${cat}')" class="cat-btn text-sm font-medium text-gray-600 bg-white border border-gray-200 px-4 py-1.5 rounded-full hover:border-red-300 transition-colors" data-cat="${cat}">${cat}</button>
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
        <p class="text-gray-500">Aucun article publié pour le moment. Revenez bientôt.</p>
      </div>
    `

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blog — ${nomProjet} · Conseils pour restaurateurs</title>
  <meta name="description" content="Conseils et guides pratiques pour digitaliser votre restaurant et vendre en ligne.">
  <meta property="og:title" content="Blog — ${nomProjet} · Conseils pour restaurateurs">
  <meta property="og:description" content="Guides pratiques pour digitaliser votre restaurant.">
  <meta property="og:type" content="website">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/static/css/main.css">
  <style>
    body { font-family: 'Inter', sans-serif; }
    .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  </style>
</head>
<body class="bg-gray-50">
  ${renderNav(nomProjet, 'blog')}

  <!-- Header blog -->
  <header class="bg-white border-b border-gray-100 py-12">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 text-center">
      <span class="inline-block text-xs font-bold text-red-600 bg-red-50 px-3 py-1 rounded-full mb-4 uppercase tracking-wide">Blog</span>
      <h1 class="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">Conseils pour restaurateurs</h1>
      <p class="text-gray-600 max-w-xl mx-auto">Guides pratiques et astuces pour digitaliser votre restaurant et vendre plus en ligne.</p>
    </div>
  </header>

  <!-- Articles -->
  <main class="max-w-6xl mx-auto px-4 sm:px-6 py-12">
    ${contenuArticles}

    <!-- CTA -->
    <div class="bg-gradient-to-r from-red-600 to-orange-500 rounded-3xl p-8 text-center text-white">
      <h2 class="text-2xl font-extrabold mb-2">Prêt à digitaliser votre restaurant ?</h2>
      <p class="text-red-100 mb-6">Créez votre boutique en ligne en quelques minutes.</p>
      <a href="/inscription" class="inline-flex items-center gap-2 bg-white text-red-600 font-bold px-6 py-3 rounded-xl hover:bg-red-50 transition-colors">
        <i class="fa-solid fa-rocket" aria-hidden="true"></i>
        Créer ma boutique gratuitement
      </a>
    </div>
  </main>

  ${renderFooter(nomProjet)}
  <script src="/static/js/main.js"></script>
  <script>
    function filtrerArticles(cat) {
      document.querySelectorAll('#articles-grid article').forEach(a => {
        a.style.display = (cat === 'tous' || a.dataset.cat === cat) ? '' : 'none';
      });
      document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.className = btn.dataset.cat === cat
          ? 'cat-btn text-sm font-semibold text-white bg-red-600 px-4 py-1.5 rounded-full'
          : 'cat-btn text-sm font-medium text-gray-600 bg-white border border-gray-200 px-4 py-1.5 rounded-full hover:border-red-300 transition-colors';
      });
    }
  </script>
</body>
</html>`
}
