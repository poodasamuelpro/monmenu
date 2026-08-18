# Correction SEO du blog — articles dans le sitemap + canonical depuis le slug réel

**Date :** 18 août 2026
**Repo concerné :** [poodasamuelpro/monmenu](https://github.com/poodasamuelpro/monmenu) (app web)
**Repo admin :** inchangé (aucune modification)

## Contexte

L'audit SEO du site monmenu.com avait confirmé une base solide : meta title et description par article, Open Graph et Twitter Card complets, JSON-LD Article/BlogPosting structuré, URL canonique, sitemap XML dynamique avec cache KV, robots.txt, JSON-LD Restaurant par boutique. Deux écarts réels ont été identifiés et sont corrigés ici.

## Correction 1 — Les articles de blog publiés sont ajoutés au sitemap.xml

**Fichier :** `src/index.tsx` — route `GET /sitemap.xml`

**Problème :** le sitemap ne listait que les pages statiques et les boutiques de restaurants actifs. Les articles de blog publiés en étaient absents : Google ne pouvait les découvrir que via la page `/blog` (découverte par crawling, plus lente et non priorisée).

**Correction :** une requête `articles` est ajoutée à la génération du sitemap — seuls les articles `statut = 'publie'` avec une `date_publication` renseignée sont listés, sur l'URL réelle `/blog/:slug`, avec `lastmod` = date de publication, `changefreq = monthly`, `priority = 0.6` (sous les boutiques à 0.7, cohérent avec leur importance relative). La sélection est triée par date de publication décroissante et plafonnée à 200 articles. Le cache KV existant (TTL 1h) couvre aussi les nouveaux articles : après publication d'un article, le sitemap se met à jour au plus tard à la prochaine régénération du cache.

**Impact :** Google découvre chaque nouvel article directement via le sitemap, ce qui accélère le référencement. Aucun risque de régression : les anciennes URLs restent intactes, et les brouillons ne sont jamais listés.

## Correction 2 — URL canonique et og:url construits depuis le slug réel de la base

**Fichiers :** `src/pages/article.ts` (rendu), `src/index.tsx` (requête)

**Problème :** `renderArticlePage` reconstruisait l'URL canonique et l'`og:url` depuis le **titre slugifié à la volée** (`article.titre.toLowerCase().replace(/\s+/g, '-')`) au lieu d'utiliser le **slug réel** stocké en base. Si le slug en base différait du titre slugifié (accents, caractères spéciaux, reformulation), la balise canonique pointait vers une URL différente de la vraie page — Google pouvait alors voir deux versions du même article et diluer le référencement, voire indexer la mauvaise URL.

**Correction :**
- `ArticleDetail` (article.ts) gagne un champ `slug: string`.
- La requête de `GET /blog/:slug` (index.tsx) sélectionne désormais le champ `slug` en plus des champs existants.
- `renderArticlePage` utilise `article.slug` pour la canonical, l'`og:url` et l'URL du JSON-LD, avec un fallback sur le titre slugifié uniquement pour la compatibilité avec d'anciennes données qui n'auraient pas de slug.

**Impact :** la canonical correspond toujours exactement à l'URL servie (`/blog/:slug`), ce qui consolide le référencement et évite tout contenu dupliqué. Aucune régression : le fallback protège les données anciennes.

## Vérifications

| Vérification | Résultat |
| --- | --- |
| Typecheck `tsc --noEmit` | 0 erreur |
| Build production `pnpm run build` | OK |
| Repo admin | Inchangé (conformément à la consigne) |

## Rappel — actions manuelles

Le SEO côté web ne se contrôle que partiellement depuis le code. Pour garantir l'indexation rapide des articles :
1. Ajouter/valider la propriété du site dans [Google Search Console](https://search.google.com/search-console)
2. Soumettre `https://monmenu.com/sitemap.xml` (l'outil indique ensuite quelles pages sont indexées)
3. Publier des articles régulièrement — le sitemap se régénère automatiquement via le cache KV (TTL 1h)

## Fichiers modifiés

| Fichier | Modification |
| --- | --- |
| `src/index.tsx` | Sitemap : requête `articles` publiée + `articleUrls` dans `<urlset>` ; `GET /blog/:slug` sélectionne `slug` |
| `src/pages/article.ts` | Interface `ArticleDetail` + champ `slug` ; canonical/og:url/JSON-LD depuis `article.slug` avec fallback |
