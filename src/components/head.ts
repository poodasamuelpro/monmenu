// =============================================================
// COMPOSANT HEAD — <head> commun à toutes les pages
// =============================================================

export function renderHead(
  title: string,
  description: string,
  nomProjet: string,
  extra: string = ''
): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
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
  <link rel="canonical" href="https://monmenu.app/">
  <link rel="icon" type="image/svg+xml" href="/static/img/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="/static/css/main.css">
  ${extra}
  <script>
    tailwind.config = {
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
</head>`
}
