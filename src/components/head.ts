// =============================================================
// COMPOSANT HEAD — <head> commun à toutes les pages
// Mise à jour : passage du dark mode en stratégie "class" (Tailwind)
// + script anti-flash (FOUC) exécuté avant tout rendu visible.
// Voir notes/INTEGRATION-DARK-MODE.md pour le détail de ce choix.
// =============================================================

export function renderHead(
  title: string,
  description: string,
  nomProjet: string,
  extra: string = '',
  canonicalUrl: string = 'https://monmenu.app/'
): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">

  <!-- Anti-flash (FOUC) — DOIT rester tout en haut du <head>, avant tout
       CSS/contenu visible, pour appliquer le thème sombre avant le premier
       rendu si l'utilisateur l'a choisi (ou si son OS est en sombre). -->
  <script>
    (function() {
      var t = localStorage.getItem('monmenu-theme') || 'system';
      var sombre = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (sombre) document.documentElement.classList.add('dark');
    })();
  </script>

  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="https://monmenu.app/static/img/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="icon" type="image/svg+xml" href="/static/img/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css">

  <!-- Config Tailwind : DOIT être déclarée avant le <script src="...tailwindcss.com">
       pour que darkMode:'class' soit pris en compte (sinon Tailwind retombe sur
       la stratégie "media" basée uniquement sur l'OS, ce qui casse le bouton
       de bascule manuelle #dark-toggle géré par static/js/main.js). -->
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: { red: '#DC2626', 'red-dark': '#B91C1C', blue: '#1D4ED8', 'blue-dark': '#1E40AF' },
            neutral: { 50: '#FAFAFA', 900: '#111827' }
          },
          fontFamily: { sans: ['Inter', 'sans-serif'] }
        }
      }
    }
  </script>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/static/css/main.css">
  ${extra}
</head>`
}
