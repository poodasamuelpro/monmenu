// src/pages/blog.ts
import { renderNav } from '../components/nav'
import { renderFooter } from '../components/footer'

export function renderBlogPage(nomProjet: string): string {
  const articles = [
    {
      slug: 'digitaliser-restaurant-afrique',
      titre: 'Comment digitaliser son restaurant en Afrique de l\'Ouest en 2025',
      extrait: 'Découvrez les étapes concrètes pour passer des commandes WhatsApp à une boutique en ligne professionnelle, sans investissement matériel.',
      date: '15 janvier 2025',
      categorie: 'Guide',
      lecture: '5 min',
      image: '🍽️'
    },
    {
      slug: 'commandes-whatsapp-vs-boutique-en-ligne',
      titre: 'Commandes WhatsApp vs boutique en ligne : ce qui change vraiment',
      extrait: 'Beaucoup de restaurateurs gèrent leurs commandes via WhatsApp. Voici pourquoi une boutique dédiée change la donne pour vous et vos clients.',
      date: '8 janvier 2025',
      categorie: 'Comparatif',
      lecture: '4 min',
      image: '📱'
    },
    {
      slug: 'qr-code-restaurant',
      titre: 'QR code restaurant : comment booster vos commandes à table',
      extrait: 'Le QR code est devenu incontournable pour les restaurateurs. Apprenez à créer, placer et exploiter vos QR codes pour maximiser vos commandes.',
      date: '2 janvier 2025',
      categorie: 'Astuce',
      lecture: '3 min',
      image: '📲'
    },
    {
      slug: 'frais-livraison-restaurant',
      titre: 'Comment calculer les frais de livraison pour votre restaurant',
      extrait: 'Tarif kilométrique, heure de pointe, seuil de gratuité... Tout ce qu\'il faut savoir pour fixer des frais de livraison rentables et compétitifs.',
      date: '26 décembre 2024',
      categorie: 'Finance',
      lecture: '6 min',
      image: '🛵'
    },
    {
      slug: 'mobile-money-paiement-restaurant',
      titre: 'Mobile Money et paiement en ligne pour les restaurants : guide 2025',
      extrait: 'Orange Money, Wave, MTN Mobile Money... Comment intégrer ces solutions de paiement dans votre restaurant et fidéliser vos clients.',
      date: '18 décembre 2024',
      categorie: 'Paiement',
      lecture: '7 min',
      image: '💳'
    },
    {
      slug: 'photos-plats-vendre-plus',
      titre: '5 astuces photo pour vendre plus de plats en ligne',
      extrait: 'Une bonne photo de plat, c\'est 30 % de commandes en plus. Découvrez comment prendre des photos appétissantes avec votre téléphone.',
      date: '10 décembre 2024',
      categorie: 'Marketing',
      lecture: '4 min',
      image: '📸'
    }
  ]

  const articlesHtml = articles.map(a => `
    <article class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div class="aspect-video bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center text-6xl">
        ${a.image}
      </div>
      <div class="p-6">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-full">${a.categorie}</span>
          <span class="text-xs text-gray-400">${a.lecture} de lecture</span>
        </div>
        <h2 class="font-bold text-gray-900 text-lg leading-tight mb-2 hover:text-red-600 transition-colors">
          <a href="/blog/${a.slug}">${a.titre}</a>
        </h2>
        <p class="text-sm text-gray-600 line-clamp-2 mb-4">${a.extrait}</p>
        <div class="flex items-center justify-between">
          <span class="text-xs text-gray-400"><i class="fa-regular fa-calendar mr-1"></i>${a.date}</span>
          <a href="/blog/${a.slug}" class="text-sm font-semibold text-red-600 hover:text-red-700 flex items-center gap-1">
            Lire <i class="fa-solid fa-arrow-right text-xs"></i>
          </a>
        </div>
      </div>
    </article>
  `).join('')

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blog — ${nomProjet} · Conseils pour restaurateurs</title>
  <meta name="description" content="Conseils, guides et ressources pour les restaurateurs d'Afrique de l'Ouest : digitalisation, commandes en ligne, livraison, marketing.">
  <meta property="og:title" content="Blog — ${nomProjet} · Conseils pour restaurateurs">
  <meta property="og:description" content="Guides pratiques pour digitaliser votre restaurant en Afrique de l'Ouest.">
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
      <p class="text-gray-600 max-w-xl mx-auto">Guides pratiques, astuces et tendances pour digitaliser votre restaurant et booster vos ventes en ligne.</p>
    </div>
  </header>

  <!-- Articles -->
  <main class="max-w-6xl mx-auto px-4 sm:px-6 py-12">
    <!-- Filtres catégories -->
    <div class="flex flex-wrap gap-2 mb-8">
      <button onclick="filtrerArticles('tous')" class="cat-btn text-sm font-semibold text-white bg-red-600 px-4 py-1.5 rounded-full" data-cat="tous">Tous les articles</button>
      <button onclick="filtrerArticles('Guide')" class="cat-btn text-sm font-medium text-gray-600 bg-white border border-gray-200 px-4 py-1.5 rounded-full hover:border-red-300 transition-colors" data-cat="Guide">Guide</button>
      <button onclick="filtrerArticles('Marketing')" class="cat-btn text-sm font-medium text-gray-600 bg-white border border-gray-200 px-4 py-1.5 rounded-full hover:border-red-300 transition-colors" data-cat="Marketing">Marketing</button>
      <button onclick="filtrerArticles('Finance')" class="cat-btn text-sm font-medium text-gray-600 bg-white border border-gray-200 px-4 py-1.5 rounded-full hover:border-red-300 transition-colors" data-cat="Finance">Finance</button>
      <button onclick="filtrerArticles('Astuce')" class="cat-btn text-sm font-medium text-gray-600 bg-white border border-gray-200 px-4 py-1.5 rounded-full hover:border-red-300 transition-colors" data-cat="Astuce">Astuce</button>
      <button onclick="filtrerArticles('Paiement')" class="cat-btn text-sm font-medium text-gray-600 bg-white border border-gray-200 px-4 py-1.5 rounded-full hover:border-red-300 transition-colors" data-cat="Paiement">Paiement</button>
      <button onclick="filtrerArticles('Comparatif')" class="cat-btn text-sm font-medium text-gray-600 bg-white border border-gray-200 px-4 py-1.5 rounded-full hover:border-red-300 transition-colors" data-cat="Comparatif">Comparatif</button>
    </div>

    <!-- Grille articles -->
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12" id="articles-grid">
      ${articlesHtml}
    </div>

    <!-- Newsletter -->
    <div class="bg-white border border-gray-100 rounded-3xl p-8 mb-8 text-center shadow-sm">
      <h2 class="text-xl font-bold text-gray-900 mb-2">Recevez nos conseils par email</h2>
      <p class="text-gray-600 text-sm mb-6">Un guide pratique par semaine pour booster votre restaurant.</p>
      <form class="flex flex-col sm:flex-row gap-3 max-w-md mx-auto" onsubmit="subscribeNewsletter(event)">
        <input type="email" required placeholder="votre@email.com"
          class="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400">
        <button type="submit" class="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors whitespace-nowrap">
          S'abonner
        </button>
      </form>
      <p id="newsletter-msg" class="text-xs text-green-600 mt-3 hidden">Merci ! Vous recevrez nos prochains articles.</p>
    </div>

    <!-- CTA -->
    <div class="bg-gradient-to-r from-red-600 to-orange-500 rounded-3xl p-8 text-center text-white">
      <h2 class="text-2xl font-extrabold mb-2">Prêt à digitaliser votre restaurant ?</h2>
      <p class="text-red-100 mb-6">Créez votre boutique en ligne en 5 minutes. Premier mois offert.</p>
      <a href="/inscription" class="inline-flex items-center gap-2 bg-white text-red-600 font-bold px-6 py-3 rounded-xl hover:bg-red-50 transition-colors">
        <i class="fa-solid fa-rocket"></i>
        Créer ma boutique gratuitement
      </a>
    </div>
  </main>

  ${renderFooter(nomProjet)}
  <script src="/static/js/main.js"></script>
  <script>
    function filtrerArticles(cat) {
      const articles = document.querySelectorAll('#articles-grid article');
      articles.forEach(a => {
        const categorie = a.querySelector('.text-red-600')?.textContent?.trim() || '';
        if (cat === 'tous' || categorie === cat) {
          a.style.display = '';
        } else {
          a.style.display = 'none';
        }
      });
      document.querySelectorAll('.cat-btn').forEach(btn => {
        if (btn.dataset.cat === cat) {
          btn.className = 'cat-btn text-sm font-semibold text-white bg-red-600 px-4 py-1.5 rounded-full';
        } else {
          btn.className = 'cat-btn text-sm font-medium text-gray-600 bg-white border border-gray-200 px-4 py-1.5 rounded-full hover:border-red-300 transition-colors';
        }
      });
    }
    function subscribeNewsletter(e) {
      e.preventDefault();
      document.getElementById('newsletter-msg').classList.remove('hidden');
      e.target.reset();
    }
  </script>
</body>
</html>`
}
