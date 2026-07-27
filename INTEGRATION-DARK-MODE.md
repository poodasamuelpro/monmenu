# Intégration du mode sombre — à vérifier dans vos fichiers existants

Je n'ai pas le contenu de `components/head.ts` et `components/nav.ts` (non fournis),
donc je ne peux pas les modifier directement. Voici précisément ce qu'ils doivent
contenir pour que `home.ts`, `styles.css` et `main.js` (livrés) fonctionnent.

## 1. `components/head.ts` — configurer Tailwind en mode "class"

Si vous chargez Tailwind via son CDN (`<script src="https://cdn.tailwindcss.com">`),
la config par défaut du dark mode est basée sur `prefers-color-scheme` (media query).
Pour que la bascule manuelle clair/sombre fonctionne (exigence du cahier des charges),
il faut passer en stratégie **"class"**, avec ce snippet **avant** le script Tailwind :

```html
<script>
  tailwind.config = { darkMode: 'class' }
</script>
<script src="https://cdn.tailwindcss.com"></script>
```

## 2. Anti-flash (FOUC) — script bloquant en tout début de `<head>`

Sans ça, la page peut afficher une fraction de seconde le mauvais thème avant que
`main.js` ne s'exécute. Ajoutez ce script **inline**, tout en haut du `<head>`,
avant tout CSS/contenu visible :

```html
<script>
  (function() {
    var t = localStorage.getItem('monmenu-theme') || 'system';
    var sombre = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (sombre) document.documentElement.classList.add('dark');
  })();
</script>
```

## 3. `components/nav.ts` — bouton de bascule de thème

Le script `main.js` cherche un élément `#dark-toggle`. Ajoutez-le dans la nav
(desktop et/ou mobile), par exemple :

```html
<button id="dark-toggle" type="button"
  class="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:border-red-300 dark:hover:border-red-500 transition-colors"
  aria-label="Changer de thème">
  <i class="fa-solid fa-circle-half-stroke text-sm"></i>
</button>
```

Le menu mobile doit garder les IDs `#menu-toggle` et `#mobile-menu` déjà utilisés
par `main.js` (inchangé).

## 4. Pourquoi ce choix plutôt que l'ancien système `.light-mode` ?

L'ancienne version de `main.js`/`styles.css` ne permettait de **forcer le sombre**
que si l'OS était déjà en clair — il n'y avait pas de vrai état "dark" indépendant
du système, seulement un override vers "light". Ce n'était pas conforme à
l'exigence du cahier des charges (« mode clair et sombre, bascule manuelle
mémorisée »). La nouvelle version gère un vrai cycle à 3 états : `system` → `light`
→ `dark`, stocké dans `localStorage['monmenu-theme']`, appliqué via la classe
`dark` sur `<html>` (convention Tailwind standard), lue par toutes les classes
`dark:` utilisées dans `home.ts`.

## 5. Migration à appliquer

```
wrangler d1 execute <NOM_DB> --file=migrations/0002_seed_plans_faso.sql
```

Cette migration **supprime les 3 anciens plans et insère les 4 nouveaux**
(Faso / Baraka / Naaba / Mogho). Vérifiez qu'aucune donnée de production
importante ne dépend des anciens `id` de plans avant de l'exécuter (si des
tenants Supabase référencent déjà un `plan_id` D1 par ID, il faudra les
migrer vers les nouveaux `id` — `plan_faso`, `plan_baraka`, `plan_naaba`,
`plan_mogho` — dans une requête Supabase séparée).
