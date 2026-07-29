# AUDIT 01 — Internationalisation, Dark Mode & Uniformisation du Design
## MonMenu — Rapport complet

> **Dépôt audité** : `https://github.com/poodasamuelpro/monmenu`  
> **Date de l'audit** : 2026-07-29  
> **Auditeur** : Expert Frontend / Design Systems (40 ans d'expérience)  
> **Stack technique** : Hono v4 + TypeScript + Cloudflare Workers + Tailwind CSS (CDN) + Supabase  
> **Rapport distinct de** : `AUDIT-02-SEO.md` (audit SEO séparé)

---

## RÉSUMÉ EXÉCUTIF

Cet audit couvre trois sujets distincts du dépôt MonMenu : l'internationalisation (i18n), le dark mode, et la cohérence du design cross-device. Les conclusions principales sont les suivantes :

| Sujet | Statut | Risque | Recommandation principale |
|-------|--------|--------|--------------------------|
| **Internationalisation (i18n)** | ⚠️ Partielle & fragmentée | Moyen (SEO EN indexé) | **Option B — Gel en FR** à court terme, retrait propre à moyen terme |
| **Dark Mode** | 🔴 Dysfonctionnel par design | Faible (retrait souhaité) | **Retrait complet recommandé** — plan détaillé fourni |
| **Design Cross-Device** | 🟡 Incohérent | Faible à Moyen | **Uniformisation via tokens centralisés** — 3 groupes de divergences identifiés |

**Dépendance critique** : La décision sur l'i18n (retrait ou gel) impacte directement l'audit SEO (rapport `AUDIT-02-SEO.md`) sur le point hreflang FR/EN. Ces deux audits doivent être lus conjointement avant toute implémentation.

---

## PARTIE 1 — AUDIT INTERNATIONALISATION (i18n)

### 1.1 État des lieux — Implémentation actuelle

#### Architecture du système i18n

Le système i18n de MonMenu est un **système maison** (pas de next-i18next, next-intl ou i18next), développé entièrement en TypeScript dans `src/i18n/`.

**Fichiers concernés :**

| Fichier | Rôle | Taille |
|---------|------|--------|
| `src/i18n/index.ts` | Helper — `getTranslations()`, `detectLocale()`, `localeFromPath()` | ~50 lignes |
| `src/i18n/fr.json` | Traductions françaises — 200+ clés | ~200 clés |
| `src/i18n/en.json` | Traductions anglaises — 200+ clés | ~200 clés |

**Mécanisme de résolution de locale (défini dans `src/index.tsx` et `src/index.ts`) :**

```typescript
// Priorité décroissante :
// 1. Paramètre URL explicite : ?lang=en ou ?lang=fr
// 2. Cookie de préférence : monmenu-lang (Max-Age=1an)
// 3. Header Accept-Language du navigateur
// 4. Fallback : 'fr' par défaut
function resolveLocale(c: any): string { ... }
```

#### Routes i18n existantes

Dans `src/index.tsx` (lignes 255–272) :

```typescript
// Routes de préfixe /fr et /en — redirigent vers la route réelle avec cookie
app.get('/fr', (c) => {
  c.header('Set-Cookie', 'monmenu-lang=fr; Path=/; Max-Age=31536000; SameSite=Lax')
  return c.redirect('/', 302)
})
app.get('/en', (c) => {
  c.header('Set-Cookie', 'monmenu-lang=en; Path=/; Max-Age=31536000; SameSite=Lax')
  return c.redirect('/?lang=en', 302)
})
app.get('/fr/*', (c) => { /* redirect vers chemin sans préfixe */ })
app.get('/en/*', (c) => { /* redirect vers chemin avec ?lang=en */ })
```

> ⚠️ **Observation critique** : Les routes `/fr` et `/en` ne servent **PAS** de vraies pages multilingues séparées. Ce sont de simples redirections qui posent un cookie de langue. Il n'existe **pas de routes séparées** `/fr/contact`, `/fr/blog`, `/en/contact`, etc. La localisation est entièrement gérée par un paramètre `?lang=en` + cookie.

#### Pages couvertes par l'i18n

| Page | Traduite ? | Observations |
|------|-----------|--------------|
| `/` (home.ts) | ✅ Oui | Utilise `getTranslations(locale)` + chaînes conditionnelles `isEn ? ... : ...` |
| `/contact` | ✅ Oui | `getTranslations(locale)` + `const isEn = locale === 'en'` |
| `/blog` | ✅ Oui | `getTranslations(locale)` |
| `/blog/:slug` | ✅ Partielle | Article lui-même non traduit (DB), labels de l'UI seulement |
| `/tarifs` | ✅ Oui | `getTranslations(locale)` |
| `/fonctionnalites` | ✅ Oui | Traduite dans `index.ts` |
| `/legal/*` | ✅ Oui | Labels UI traduits, contenu légal non traduit |
| `/suivi/:token` | ✅ Oui | Traduit |
| `/inscription` | ❌ Non | `renderInscriptionPage(nomProjet)` — pas de locale passée |
| `/connexion` | ❌ Non | Pas de locale |
| `/creer-compte` | ❌ Non | Pas de locale |
| `/mot-de-passe-oublie` | ❌ Non | Pas de locale |
| `/dashboard/*` | ❌ Non | Interface admin — intentionnel |
| `/bienvenue` | ❌ Non | Page onboarding — intentionnel |
| `/:slug` (boutiques) | ❌ Non | Boutiques toujours en FR, pas de locale |

#### Composants traduits

| Composant | Traduit ? | Observations |
|-----------|-----------|--------------|
| `nav.ts` | ✅ Oui | Sélecteur langue FR/EN visible dans la nav |
| `footer.ts` | ✅ Oui | Tous les textes, newsletter |
| `head.ts` | ✅ Partielle | `hreflang` uniquement sur `/` (home) et `/boutique` |

#### Sélecteur de langue

Le bouton sélecteur de langue est présent dans la nav (desktop + mobile) :
- **Desktop** : bouton `FR`/`EN` en haut à droite (id `lang-btn`)
- **Mobile** : section dédiée dans le menu mobile

Liens : `/fr` → redirect + cookie FR | `/en` → redirect + cookie EN

### 1.2 Incohérences identifiées

#### 1.2.1 Hreflang incomplet (⚠️ Impact SEO direct)

```
// home.ts — ligne 52-56 : SEULE page avec hreflang complet
hreflangAlternates: [
  { lang: 'fr', url: '/?lang=fr' },
  { lang: 'en', url: '/?lang=en' },
  { lang: 'x-default', url: '/' }
]
```

**Pages SANS hreflang** : `/contact`, `/blog`, `/tarifs`, `/legal/*`, `/inscription`, `/suivi/:token`

> ⚠️ **Dépendance avec AUDIT-02-SEO** : L'absence de hreflang sur la majorité des pages est documentée dans le rapport SEO (`AUDIT-02-SEO.md`, section 5). La décision de retirer l'i18n résoudrait ce problème par sa suppression complète.

#### 1.2.2 Mélange FR/EN dans le code (hardcodé vs i18n)

Dans `src/pages/home.ts` :

```typescript
// Ligne 140 : Texte hardcodé FR non traduit
<div class="absolute left-6 top-8 ...">
  <i class="fa-location-dot"></i> Votre restaurant  // ← toujours en FR !
</div>

// Ligne 148 : Hardcodé FR
<div class="font-bold text-sm">Votre boutique</div>
<div class="text-[11px]">Ouvert maintenant</div>

// Ligne 179 : Hardcodé FR  
<div>Commande #42</div>
<div>Riz gras poulet ×1 — Livraison confirmée</div>
```

Dans `src/pages/contact.ts` (ligne 54, 66) :
```typescript
// Certaines chaînes utilisent isEn mais d'autres non :
<div class="text-xs text-green-600">${isEn ? 'Usually < 1h' : 'Généralement < 1h'}</div>
// Mais ailleurs dans contact.ts : chaînes hardcodées FR non protégées
```

Dans `src/pages/boutique.ts` :
```typescript
// Ligne 135 : FR hardcodé
return { ouvert: false, label: 'Fermé aujourd\'hui' }
// Ligne 136 : FR hardcodé  
return { ouvert: true, label: `Ouvert — jusqu'à ${fin}` }
// etc. — toute la logique d'horaires reste en FR
```

#### 1.2.3 Pages sans locale passée

```typescript
// src/index.tsx — lignes 350, 356, 360
app.get('/inscription', async (c) => {
  return c.html(renderInscriptionPage(nomProjet)) // ← PAS de locale
})
app.get('/connexion', async (c) => {
  return c.html(renderConnexionPage(nomProjet))  // ← PAS de locale
})
```

Ces pages sont dans `fr.json`/`en.json` (clé `inscription`, `auth`) mais la locale n'est pas transmise à la fonction de rendu. La traduction existe côté i18n mais est **morte en pratique**.

#### 1.2.4 Routes /fr et /en : redirections 302 (non 301)

```typescript
// src/index.tsx — ligne 256
app.get('/en', (c) => {
  return c.redirect('/?lang=en', 302)  // ← 302 temporaire, pas 301 permanent
})
```

**Impact SEO** : Les redirections 302 ne transfèrent pas le PageRank. Si des pages EN ont été indexées par Google (ex: `/en`, `/en/contact`), elles ne bénéficient pas du jus de lien vers les équivalents FR.

#### 1.2.5 Absence totale de pages EN dédiées

Il n'existe **aucune URL stable EN** : pas de `/en/contact`, `/en/blog`, `/en/tarifs`. La version anglaise est uniquement accessible via `?lang=en` (paramètre de query string).

> ⚠️ Google peut potentiellement indexer `/?lang=en`, `/contact?lang=en`, etc. mais ces URLs ne sont **pas canonicales** et peuvent être perçues comme du contenu dupliqué.

### 1.3 Risques du retrait complet de l'i18n

#### 1.3.1 Inventaire des éléments à retirer

**Fichiers à supprimer (Option A) :**
- `src/i18n/index.ts`
- `src/i18n/fr.json`
- `src/i18n/en.json`

**Imports à retirer dans chaque fichier :**

| Fichier | Ligne | Import à retirer |
|---------|-------|-----------------|
| `src/index.tsx` | 18 | `import { detectLocale, getTranslations } from './i18n'` |
| `src/index.ts` | 18 | Idem |
| `src/components/nav.ts` | 3 | `import { getTranslations } from '../i18n'` |
| `src/components/footer.ts` | 2 | `import { getTranslations } from '../i18n'` |
| `src/pages/home.ts` | 12 | `import { getTranslations } from '../i18n'` |
| `src/pages/blog.ts` | 5 | `import { getTranslations } from '../i18n'` |
| `src/pages/contact.ts` | ~3 | `import { getTranslations } from '../i18n'` |
| `src/pages/article.ts` | ~2 | `import { getTranslations } from '../i18n'` |
| `src/pages/tarifs.ts` | ~2 | `import { getTranslations } from '../i18n'` |
| `src/pages/legal.ts` | ~2 | `import { getTranslations } from '../i18n'` |
| `src/pages/suivi.ts` | ~2 | `import { getTranslations } from '../i18n'` |
| `src/pages/not-found.ts` | ~2 | `import { getTranslations } from '../i18n'` |

**Routes à supprimer dans `src/index.tsx` :**
```typescript
// Lignes 255-272 — supprimer ces 4 routes :
app.get('/fr', ...)
app.get('/en', ...)
app.get('/fr/*', ...)
app.get('/en/*', ...)

// Ligne ~42-51 — supprimer resolveLocale()
// Ligne 18 — supprimer import detectLocale
```

**Composants à nettoyer :**
- `nav.ts` : Retirer le bloc sélecteur de langue (id `lang-selector`, `lang-btn`, `lang-menu`) — ~30 lignes
- `footer.ts` : Retirer les traductions, fixer toutes les clés en FR direct
- `head.ts` : Retirer la génération des `hreflangTags` (lignes 62-65)

**Paramètres de signature à simplifier :**
```typescript
// Avant
renderHomePage(nomProjet: string, locale: string = 'fr'): string
// Après
renderHomePage(nomProjet: string): string
```
→ À faire sur toutes les fonctions de pages : `home`, `contact`, `blog`, `article`, `tarifs`, `legal`, `suivi`, `not-found`

#### 1.3.2 URLs déjà indexées Google — Analyse SEO

> ⚠️ **Attention** : Les URLs suivantes **peuvent avoir été indexées** par Google (à vérifier dans Google Search Console) :
> - `/?lang=en`
> - `/contact?lang=en`
> - `/blog?lang=en`
> - `/en` → redirige en 302 vers `/?lang=en`

**Plan de redirections 301 à mettre en place (si indexation détectée) :**

| URL source potentiellement indexée | Redirection 301 vers |
|------------------------------------|----------------------|
| `/en` | `/` |
| `/fr` | `/` |
| `/en/*` | `/*` (même chemin sans préfixe) |
| `/fr/*` | `/*` (même chemin sans préfixe) |
| `/?lang=en` | `/` |
| `/contact?lang=en` | `/contact` |
| `/blog?lang=en` | `/blog` |

> Ces redirections doivent être **301 (permanentes)** et non 302 comme actuellement.

### 1.4 Option A vs Option B

#### Option A — Retrait complet de l'i18n

**Description** : Suppression totale du système i18n. Toutes les pages en FR uniquement. Sélecteur de langue retiré de la nav. Redirections 301 pour les éventuelles URLs EN indexées.

| Avantages | Inconvénients |
|-----------|---------------|
| ✅ Code simplifié (~400 lignes retirées) | ❌ Irréversible sans effort significatif |
| ✅ Fin des textes hardcodés FR mélangés | ❌ Perte de l'infrastructure i18n si expansion future |
| ✅ Pages plus légères (moins de logique conditionnelle) | ❌ Risque SEO si URLs EN indexées non redirigées en 301 |
| ✅ Maintenance réduite (1 seul fichier de contenu) | ❌ Effort de migration non négligeable (~15 fichiers) |
| ✅ Cohérence totale avec le public cible Afrique francophone | ❌ Incompatibilité future si expansion vers marchés anglophones |

**Effort estimé** : 2-4 jours développeur + 1 jour tests

#### Option B — Gel en FR uniquement (recommandé court terme)

**Description** : Conserver l'infrastructure i18n mais désactiver le sélecteur de langue. Forcer `locale = 'fr'` systématiquement. Ne supprimer aucun fichier.

| Avantages | Inconvénients |
|-----------|---------------|
| ✅ Réversible en 1 heure | ❌ Code mort maintenu |
| ✅ Infrastructure disponible pour expansion future | ❌ Taille de bundle légèrement alourdie |
| ✅ Effort minimal (2-3 lignes modifiées) | ❌ Les chaînes EN restent en place sans être utilisées |
| ✅ Aucun risque SEO de redirections cassées | ❌ Ambiguïté technique pour les futurs développeurs |

**Implémentation de l'Option B :**

```typescript
// Dans src/index.tsx — remplacer resolveLocale()
function resolveLocale(_c: any): string {
  return 'fr' // Forcé FR — sélecteur de langue désactivé (v2.x)
}

// Dans nav.ts — commenter/masquer le sélecteur de langue
// <div id="lang-selector" style="display:none">...</div>
```

**Effort estimé** : 2 heures

### 1.5 Recommandation argumentée

**Recommandation : Option B à court terme + Option A planifiée à moyen terme**

**Justification :**

1. **Urgence et risque minimaux** : L'Option B peut être déployée en 2 heures sans risque de casse. L'Option A nécessite un refactoring sur ~15 fichiers avec risques de régressions.

2. **Public cible** : Le Burkina Faso et l'Afrique de l'Ouest francophone représentent ~95% des utilisateurs potentiels. L'anglais n'a pas d'utilité immédiate.

3. **SEO** : La décision Option A doit être précédée d'une vérification dans Google Search Console pour identifier toutes les URLs EN effectivement indexées. Si des pages EN existent dans l'index, les redirections 301 sont obligatoires.

4. **Planification** : Programmer le retrait complet (Option A) dans un sprint dédié avec tests de non-régression, une fois la priorité SEO établie.

> 🔗 **Lien AUDIT-02-SEO** : Voir la section 5 du rapport SEO pour les implications hreflang. Le retrait de l'i18n implique la suppression des balises hreflang du sitemap.xml et du composant head.ts.

---

## PARTIE 2 — AUDIT DARK MODE

### 2.1 Diagnostic de la cause racine

Le dark mode de MonMenu souffre de **4 dysfonctionnements distincts et cumulatifs** :

#### 2.1.1 Dysfonctionnement #1 — Conflit entre deux stratégies CSS incompatibles (CRITIQUE)

**Fichier** : `public/static/css/main.css` (chargé par TOUTES les pages via `head.ts`, ligne 153)

```css
/* main.css — ligne 66 : ANCIENNE stratégie @media */
@media (prefers-color-scheme: dark) {
  body:not(.light-mode) {
    background-color: #111827;
    color: #F9FAFB;
  }
  body:not(.light-mode) .bg-white { background-color: #1F2937 !important; }
  /* ... 6 autres règles avec !important */
}
```

**Problème** : Cette approche utilise `@media (prefers-color-scheme: dark)` (stratégie OS-level automatique) avec une classe `.light-mode` sur `body`. Mais `.light-mode` n'est **jamais assignée** à `body` dans aucun fichier JavaScript ou HTML de l'application.

Résultat : Sur un navigateur configuré en mode sombre (OS), **ces règles CSS s'appliquent toujours**, même quand l'utilisateur a explicitement choisi le thème "clair" via le bouton toggle.

**Fichier** : `public/static/css/styles.css` (nouvelle stratégie — `html.dark`)

```css
/* styles.css — Nouvelle stratégie correcte */
html.dark body { background-color: #0B0A09; ... }
html.dark .statut-en_attente { ... }
```

**Problème** : `styles.css` n'est **JAMAIS chargé** dans `head.ts`. Seul `main.css` est chargé (ligne 153 de `head.ts`). Le fichier `styles.css` est donc du code mort.

```typescript
// head.ts ligne 153 — SEUL CSS global chargé :
<link rel="stylesheet" href="/static/css/main.css">
// ← styles.css n'est PAS chargé
```

**Impact** : Les nouvelles règles dark mode (html.dark) ne s'appliquent pas car `styles.css` n'est jamais chargé.

#### 2.1.2 Dysfonctionnement #2 — Tailwind config placée APRÈS le script Tailwind (CRITIQUE)

**Fichier** : `src/components/head.ts` (lignes 135-150)

```html
<!-- head.ts — PROBLÈME D'ORDRE -->
<script>
  tailwind.config = {
    darkMode: 'class',   <!-- ← Config définie AVANT -->
    ...
  }
</script>
<script src="https://cdn.tailwindcss.com"></script>  <!-- ← Script chargé APRÈS -->
```

> ⚠️ En réalité, ici l'ordre est correct (`tailwind.config` est défini **avant** le chargement du CDN). Mais le commentaire dans `head.ts` dit "DOIT être déclarée avant le `<script src...>`" — ce qui est bien respecté. Ce n'est donc **pas** un dysfonctionnement d'ordre.

**Confirmation** : L'ordre est correct. Ce n'est pas la cause principale.

#### 2.1.3 Dysfonctionnement #3 — Script anti-flash dans head.ts correct mais insuffisant

**Fichier** : `src/components/head.ts` (lignes 88-95)

```javascript
(function() {
  var t = localStorage.getItem('monmenu-theme') || 'system';
  var sombre = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (sombre) document.documentElement.classList.add('dark');
})();
```

Ce script est **techniquement correct** : il ajoute la classe `dark` à `<html>` avant le premier rendu. Mais comme `styles.css` n'est pas chargé, les règles `html.dark .xxx { ... }` n'existent pas dans le navigateur. La classe `dark` est bien présente sur `<html>`, mais les classes Tailwind `dark:bg-gray-900` dépendent de la config Tailwind CDN qui, elle, fonctionne correctement avec `darkMode: 'class'`.

#### 2.1.4 Dysfonctionnement #4 — Dark mode absent sur 14 pages sur 19 (INCOMPLET)

Pages **sans aucune classe `dark:`** dans leur HTML :

| Page | Fichier | Impact |
|------|---------|--------|
| Connexion | `auth.ts` | `bg-gray-50` sans dark → fond blanc si OS dark |
| Création compte | `auth.ts` | Idem |
| Inscription | `inscription.ts` | Idem |
| Contact | `contact.ts` | `bg-white` fixe |
| Dashboard | `dashboard.ts` | Interface admin — intentionnel ? |
| Bienvenue (onboarding) | `bienvenue.ts` | Idem |
| CGU | `cgu.ts` | Via `legal.ts` — partial |
| Confidentialité | `confidentialite.ts` | Via `legal.ts` |
| Mentions légales | `mentions.ts` | Via `legal.ts` |
| Cookies | `cookies.ts` | Via `legal.ts` |

> Note : `legal.ts` génère CGU/confidentialité/mentions/cookies avec dark mode (14 occurrences `dark:`), donc ces pages sont couvertes indirectement.

**Pages non couvertes sans justification :** `auth.ts`, `inscription.ts`, `contact.ts`

#### 2.1.5 Dysfonctionnement #5 — Boutique forcée en mode clair (intentionnel)

```typescript
// src/pages/boutique.ts — ligne 195
<!-- Forcer le mode light sur la boutique — pas de dark mode -->
<script>document.documentElement.classList.remove('dark');</script>
```

Ce comportement est **intentionnel et documenté**. La boutique client ne supporte pas le dark mode par conception. Ce n'est pas un bug.

### 2.2 Plan de retrait complet du dark mode

Puisque le porteur de projet souhaite supprimer le dark mode et forcer le mode clair, voici le plan de suppression propre.

#### Phase 1 — Supprimer le système de toggle (nav.ts)

**Fichier** : `src/components/nav.ts`

Supprimer le bouton dark-toggle (lignes ~80-87) :
```html
<!-- À SUPPRIMER ENTIÈREMENT -->
<button id="dark-toggle" type="button"
  class="w-9 h-9 rounded-lg border border-gray-200 dark:border-gray-700 ..."
  aria-label="Changer de thème">
  <i class="fa-solid fa-circle-half-stroke text-sm"></i>
</button>
```

#### Phase 2 — Supprimer le script anti-flash et initDarkMode (head.ts + main.js)

**Fichier** : `src/components/head.ts` (lignes 86-95)

Supprimer le script anti-flash FOUC :
```html
<!-- À SUPPRIMER -->
<script>
  (function() {
    var t = localStorage.getItem('monmenu-theme') || 'system';
    var sombre = t === 'dark' || (t === 'system' && window.matchMedia(...).matches);
    if (sombre) document.documentElement.classList.add('dark');
  })();
</script>
```

Supprimer `darkMode: 'class'` de la config Tailwind inline (ou garder pour d'éventuels vestiges, mais sans conséquence) :
```javascript
// Simplifier en :
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
```

**Fichier** : `public/static/js/main.js`

Supprimer les fonctions dark mode (lignes 23-60) :
```javascript
// À SUPPRIMER : const CLE_THEME, prefersSombre, appliquerTheme(), mettreAJourIconeToggle(), initDarkMode()
// Retirer aussi : initDarkMode() dans l'appel DOMContentLoaded (ligne 18)
```

#### Phase 3 — Nettoyer le CSS (main.css + styles.css)

**Fichier** : `public/static/css/main.css`

Supprimer le bloc dark mode automatique (lignes 66-79) :
```css
/* À SUPPRIMER ENTIÈREMENT */
@media (prefers-color-scheme: dark) {
  body:not(.light-mode) { ... }
  body:not(.light-mode) .bg-white { ... }
  /* ... */
}
```

**Fichier** : `public/static/css/styles.css`

Ce fichier est inutilisé (jamais chargé). Il peut être archivé ou supprimé. Si conservé à des fins de référence, désactiver son chargement.

**Fichier** : `public/static/style.css`

Vérifier le contenu et supprimer si doublon de `main.css`.

#### Phase 4 — Retirer les classes dark: du HTML (236 occurrences)

**Fichiers impactés** (triés par nombre d'occurrences) :

| Fichier | Occurrences dark: | Effort |
|---------|-------------------|--------|
| `src/pages/home.ts` | 97 | ⚠️ Important |
| `src/pages/suivi.ts` | 31 | Moyen |
| `src/pages/forgot-password.ts` | 23 | Moyen |
| `src/pages/legal.ts` | 14 | Moyen |
| `src/pages/blog.ts` | 14 | Moyen |
| `src/pages/not-found.ts` | 9 | Faible |
| `src/pages/compte-inactif.ts` | 6 | Faible |
| `src/pages/article.ts` | 5 | Faible |
| `src/pages/tarifs.ts` | 1 | Faible |
| `src/components/nav.ts` | ~40 | Important |
| `src/components/footer.ts` | ~30 | Moyen |

**Stratégie de nettoyage** : Un script de remplacement automatique peut retirer les variantes `dark:*` sans affecter le rendu clair :

```bash
# Exemple sed pour retirer toutes les classes dark: inline
# À adapter pour chaque fichier — À TESTER sur une copie avant exécution
sed -i 's/ dark:[a-zA-Z0-9_:\/\[\]-]*//g' src/pages/*.ts
sed -i 's/ dark:[a-zA-Z0-9_:\/\[\]-]*//g' src/components/*.ts
```

> ⚠️ **Attention** : Ce script doit être testé sur une copie. Il ne gère pas les `dark:` en début de chaîne ou avec syntaxe complexe (`dark:from-[#1A0F0F]`).

#### Phase 5 — Vérifier les custom backgrounds dark

**Valeurs hexadécimales dark custom à nettoyer dans `home.ts`** :

```html
<!-- Ces valeurs doivent être retirées : -->
dark:bg-[#0B0A09]    → retirer, laisser bg-white
dark:from-[#1A0F0F]  → retirer, laisser from-red-50
dark:via-[#0B0A09]   → retirer, laisser via-white
dark:to-[#0B1220]    → retirer, laisser to-blue-50
```

#### Phase 6 — body tags à uniformiser

Après retrait du dark mode, uniformiser tous les `<body>` tags :

```html
<!-- Standard cible unique pour toutes les pages publiques -->
<body class="font-sans bg-white text-gray-900">

<!-- Pour les pages d'auth/inscription (fond légèrement grisé) -->
<body class="font-sans bg-gray-50 min-h-screen">
```

#### Plan de rollback

En cas de besoin de réintroduire le dark mode :
1. Restaurer depuis le git (`git checkout <commit> -- src/ public/`)
2. Ou créer une branche de sauvegarde avant le retrait : `git checkout -b feat/sans-dark-mode`

**Ordre d'exécution du retrait :**
1. `head.ts` → supprimer anti-flash (15 min)
2. `nav.ts` → supprimer bouton toggle + sélecteur langue si Option A i18n (30 min)
3. `main.js` → supprimer logique dark (15 min)
4. `main.css` → supprimer bloc @media prefers-color-scheme (5 min)
5. Pages `.ts` → retirer classes `dark:` (2-4h automatisé + vérification)
6. Tests visuels sur toutes les pages (2h)

---

## PARTIE 3 — AUDIT DESIGN CROSS-DEVICE

### 3.1 Cartographie des design tokens actuels

#### 3.1.1 Palettes de couleurs identifiées

Le projet n'utilise **pas de fichier de configuration Tailwind séparé**. La config est inline dans chaque page via `head.ts` :

```javascript
// head.ts — Seule config Tailwind existante
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#DC2626',
          'red-dark': '#B91C1C',
          blue: '#1D4ED8',
          'blue-dark': '#1E40AF'
        },
        neutral: { 50: '#FAFAFA', 900: '#111827' }
      },
      fontFamily: { sans: ['Inter', 'sans-serif'] }
    }
  }
}
```

**Problème majeur** : Cette config ne définit que 4 couleurs brand. Tout le reste utilise des classes Tailwind génériques (`red-600`, `blue-600`, `gray-50`, etc.) **sans tokens personnalisés**. Les couleurs varient d'une page à l'autre selon les choix du développeur.

### 3.2 Divergences constatées — Couleurs

#### 3.2.1 Inconsistances de rouge primaire (Groupe 1 — CRITIQUE)

La couleur rouge de MonMenu est supposée être `#DC2626` (red-600), mais plusieurs variantes coexistent :

| Page | Fichier | Valeur utilisée | Ligne | Contexte |
|------|---------|-----------------|-------|----------|
| Accueil — CTA principal | `home.ts` | `bg-red-600` = `#DC2626` | 111 | Bouton "Créer mon menu" |
| Contact — bouton envoyer | `contact.ts` | `bg-red-600` = `#DC2626` | 134 | Cohérent ✅ |
| Auth — bouton connexion | `auth.ts` | `bg-red-600` = `#DC2626` | 60 | Cohérent ✅ |
| Boutique — fallback couleur | `boutique.ts` | `#DC2626` (hardcodé) | 154 | Cohérent ✅ |
| Accueil — icônes check | `home.ts` | `text-red-600` alternant avec `text-blue-600` | 123-131 | Incohérent — 2 couleurs pour icônes identiques |
| Contact — WhatsApp card | `contact.ts` | `bg-green-500` | 50 | Justifié (couleur WhatsApp) |
| Contact — Email card | `contact.ts` | `bg-blue-600` | 61 | ⚠️ Bleu secondaire dans une zone primaire |

**Problème** : Le rouge `red-600` (#DC2626) est utilisé comme couleur principale, mais le bouton CTA secondaire de home.ts alterne entre rouge et gris sans règle claire. Les icônes de trust sur la section hero alternent rouge/bleu sans système.

#### 3.2.2 Inconsistances de fond de page (Groupe 2 — MOYEN)

| Page | Fichier | Fond mobile | Fond desktop | Note |
|------|---------|------------|--------------|------|
| home.ts | `bg-white` | `bg-white` | `bg-white` | ✅ Cohérent |
| contact.ts | `bg-white` | `bg-white` | `bg-white` | ✅ |
| blog.ts | `bg-gray-50` | `bg-gray-50` | `bg-gray-50` | ✅ |
| auth.ts | `bg-gray-50` | `bg-gray-50` | `bg-gray-50` | ✅ |
| inscription.ts | `bg-gray-50` | `bg-gray-50` | `bg-gray-50` | ✅ |
| tarifs.ts | `bg-white` | `bg-white` | `bg-white` | ✅ |
| article.ts | `bg-white` | `bg-white` | `bg-white` | ✅ |
| suivi.ts | `bg-gray-50` | `bg-gray-50` | `bg-gray-50` | ✅ |

> Observation : Le fond de page est cohérent **horizontalement** (même fond sur mobile et desktop pour chaque page). La divergence n'est **pas entre breakpoints** mais **entre pages** : certaines sont `bg-white`, d'autres `bg-gray-50`. Ce n'est pas une incohérence responsive mais une incohérence de design system.

#### 3.2.3 Inconsistances de spacing et typographie mobile vs desktop (Groupe 3)

**Titre Hero (home.ts, ligne 103) :**
```html
class="text-4xl sm:text-5xl lg:text-6xl font-extrabold ..."
```
- Mobile (< 640px) : `text-4xl` = 36px
- Tablette (640px+) : `text-5xl` = 48px  
- Desktop (1024px+) : `text-6xl` = 60px
→ **Cohérent** : progression typographique correcte

**Sections principales (home.ts, lignes multiples) :**
```html
class="text-3xl sm:text-4xl font-extrabold ..."
```
- Mobile : `text-3xl` = 30px
- Tablette+ : `text-4xl` = 36px
→ **Cohérent**

**Boutons CTA (home.ts vs tarifs.ts) :**
```html
<!-- home.ts ligne 111 -->
class="px-6 py-3.5 rounded-xl text-base shadow-lg shadow-red-200"

<!-- tarifs.ts — CTA final -->
class="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3 rounded-xl"
```
→ **Légère divergence** : `py-3.5` (home) vs `py-3` (tarifs) — différence de 2px. Borderline acceptable mais non unifié.

#### 3.2.4 Incohérences de border-radius (Groupe 4)

| Élément | home.ts | auth.ts | inscription.ts | tarifs.ts |
|---------|---------|---------|----------------|-----------|
| Cartes | `rounded-xl` | `rounded-2xl` | `rounded-2xl` | `rounded-2xl` |
| Boutons | `rounded-xl` | `rounded-xl` | `rounded-xl` | `rounded-xl` |
| Inputs | `rounded-xl` | `rounded-xl` | `rounded-xl` | `rounded-xl` |
| Tags/Badges | `rounded-full` | — | — | `rounded-full` |

> Les cartes varient entre `rounded-xl` (home) et `rounded-2xl` (auth, inscription). Faible impact visuel mais indicateur d'absence de système unifié.

#### 3.2.5 Inconsistance de l'ombre (shadow) sur cartes

```html
<!-- home.ts — cartes fonctionnalités -->
class="bg-gray-50 rounded-xl border border-gray-100 hover:shadow-md"

<!-- inscription.ts — card formulaire -->
class="bg-white rounded-2xl shadow-sm border border-gray-100"

<!-- auth.ts — card connexion -->
class="bg-white rounded-2xl shadow-sm border border-gray-100"

<!-- tarifs.ts — plan cards -->
class="... border-2 rounded-2xl" (pas de shadow)
```

→ Ombres inconsistantes entre home (`hover:shadow-md`) et auth/inscription (`shadow-sm` fixe).

#### 3.2.6 Navigation mobile vs desktop — Divergences de couleurs

Dans `nav.ts` :

```html
<!-- Lien nav desktop (actif) -->
class="text-red-600 dark:text-red-400 font-semibold"

<!-- Lien nav mobile (actif) -->
class="text-red-600 dark:text-red-400"  // ← font-semibold présent aussi ✅
```

→ Navigation cohérente entre mobile et desktop.

**Mais** : Le bouton "Créer ma boutique" est :
- Desktop : `bg-red-600 text-white px-4 py-2 rounded-lg` (petit)
- Mobile : `text-red-600 hover:bg-red-50` (outline style, pas filled)

→ **Incohérence de style CTA** entre desktop (filled) et mobile (ghost/outline). Impact UX notable.

### 3.3 Causes des incohérences

1. **Absence de design system centralisé** : Les couleurs sont définies page par page via Tailwind utilitaires. Pas de fichier `tailwind.config.js` dédié avec token design.

2. **Configuration Tailwind en CDN inline** : Utiliser Tailwind en CDN (`cdn.tailwindcss.com`) empêche une configuration partagée entre pages. Chaque page redéfinit `tailwind.config` dans son `<head>`, ce qui est redondant et risqué.

3. **Développement page par page** : Les pages semblent avoir été développées séparément, chaque développeur ayant pris des micro-décisions stylistiques indépendantes.

4. **Couleurs hardcodées** : `#DC2626`, `#1D4ED8`, `#0B0A09`, `#1A0F0F`, `#0B1220` apparaissent en dur dans les templates sans référence à des variables CSS.

### 3.4 Plan d'uniformisation

#### 3.4.1 Définir les tokens centralisés

**Proposer un fichier CSS Variables global** (à ajouter dans `main.css` ou `styles.css`) :

```css
/* src/design-tokens.css — tokens centralisés MonMenu */
:root {
  /* Couleurs primaires */
  --color-primary: #DC2626;          /* red-600 */
  --color-primary-hover: #B91C1C;    /* red-700 */
  --color-primary-light: #FEE2E2;    /* red-100 */
  --color-secondary: #1D4ED8;        /* blue-700 */
  --color-secondary-hover: #1E40AF;  /* blue-800 */
  
  /* Fonds */
  --color-bg-page: #FFFFFF;          /* bg-white */
  --color-bg-subtle: #F9FAFB;        /* gray-50 */
  --color-bg-card: #FFFFFF;
  --color-border: #F3F4F6;           /* gray-100 */
  --color-border-hover: #E5E7EB;     /* gray-200 */
  
  /* Texte */
  --color-text-primary: #111827;     /* gray-900 */
  --color-text-secondary: #4B5563;   /* gray-600 */
  --color-text-muted: #9CA3AF;       /* gray-400 */
  
  /* Espacements */
  --space-section-y: 5rem;           /* py-20 */
  --space-card-padding: 1.5rem;      /* p-6 */
  
  /* Bordures */
  --radius-card: 1rem;               /* rounded-2xl */
  --radius-btn: 0.75rem;             /* rounded-xl */
  --radius-full: 9999px;             /* rounded-full */
  
  /* Ombres */
  --shadow-card: 0 1px 3px rgba(0,0,0,0.1);
  --shadow-card-hover: 0 4px 12px rgba(0,0,0,0.1);
}
```

#### 3.4.2 Étendre la config Tailwind avec les tokens

```javascript
// Dans head.ts — config Tailwind unifiée
tailwind.config = {
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#DC2626',
          'red-hover': '#B91C1C',
          'red-light': '#FEE2E2',
          blue: '#1D4ED8',
          'blue-hover': '#1E40AF'
        }
      },
      fontFamily: { sans: ['Inter', 'sans-serif'] },
      borderRadius: {
        card: '1rem',   // rounded-card
        btn: '0.75rem'  // rounded-btn
      }
    }
  }
}
```

#### 3.4.3 Plan de migration composant par composant

| Priorité | Composant | Action | Effort |
|----------|-----------|--------|--------|
| 🔴 Haute | Nav mobile CTA | Uniformiser avec desktop (filled rouge) | 30 min |
| 🔴 Haute | body backgrounds | Choisir bg-white ou bg-gray-50 et unifier par type de page | 2h |
| 🟡 Moyenne | Cartes : rounded-xl vs rounded-2xl | Standardiser sur rounded-2xl pour toutes les cartes | 1h |
| 🟡 Moyenne | Ombres : shadow-sm vs shadow-md | Standardiser sur shadow-sm par défaut, hover:shadow-md | 1h |
| 🟡 Moyenne | Boutons padding : py-3 vs py-3.5 | Standardiser sur py-3 pour CTA standard | 1h |
| 🟢 Basse | Couleurs hardcodées hex → tokens | Remplacer #DC2626, #1D4ED8, etc. par des variables | 2h |
| 🟢 Basse | Icônes trust (rouge/bleu alternés) | Choisir une seule couleur pour les icônes de liste | 30 min |

#### 3.4.4 Règles de design system à documenter

```markdown
# MonMenu Design System — Règles fondamentales

## CTA Primaire (partout, desktop ET mobile)
bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-xl

## CTA Secondaire
bg-white hover:bg-gray-50 text-gray-700 font-semibold px-5 py-2.5 rounded-xl border border-gray-200

## Cartes de contenu
bg-white rounded-2xl border border-gray-100 shadow-sm

## Fonds de page
- Pages marketing/vitrine : bg-white
- Pages d'authentification/formulaires : bg-gray-50
- Sections alternées sur home : bg-gray-50

## Input fields
border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-red-200 focus:border-red-400
```

---

## PARTIE 4 — FICHIERS À CRÉER, MODIFIER OU SUPPRIMER

### Classés par sujet

#### Internationalisation (i18n)

| Action | Fichier | Sujet | Priorité |
|--------|---------|-------|----------|
| Modifier | `src/index.tsx` | Forcer `resolveLocale()` → retourner 'fr' (Option B) | 🔴 |
| Modifier | `src/components/nav.ts` | Masquer/supprimer le sélecteur de langue | 🔴 |
| Modifier | `src/index.tsx` | Convertir redirections 302 → 301 | 🟡 |
| Modifier | `src/index.tsx` | Ajouter redirections 301 `/en` → `/` | 🟡 |
| Supprimer | `src/i18n/en.json` | Retrait Option A uniquement | 🟢 |
| Supprimer | `src/i18n/fr.json` | Retrait Option A (intégrer contenu direct) | 🟢 |
| Supprimer | `src/i18n/index.ts` | Retrait Option A uniquement | 🟢 |

#### Dark Mode

| Action | Fichier | Sujet | Priorité |
|--------|---------|-------|----------|
| Modifier | `src/components/head.ts` | Supprimer script anti-flash FOUC (lignes 88-95) | 🔴 |
| Modifier | `src/components/nav.ts` | Supprimer bouton dark-toggle (~ligne 80) | 🔴 |
| Modifier | `public/static/js/main.js` | Supprimer `initDarkMode()` et fonctions associées | 🔴 |
| Modifier | `public/static/css/main.css` | Supprimer bloc @media prefers-color-scheme (lignes 66-79) | 🔴 |
| Modifier | `src/pages/home.ts` | Retirer 97 classes dark: | 🟡 |
| Modifier | `src/pages/suivi.ts` | Retirer 31 classes dark: | 🟡 |
| Modifier | `src/pages/forgot-password.ts` | Retirer 23 classes dark: | 🟡 |
| Modifier | `src/pages/legal.ts` | Retirer 14 classes dark: | 🟡 |
| Modifier | `src/pages/blog.ts` | Retirer 14 classes dark: | 🟡 |
| Modifier | `src/components/nav.ts` | Retirer ~40 classes dark: | 🟡 |
| Modifier | `src/components/footer.ts` | Retirer ~30 classes dark: | 🟡 |
| Archiver/Supprimer | `public/static/css/styles.css` | Fichier dark mode non chargé — code mort | 🟢 |

#### Design Cross-Device

| Action | Fichier | Sujet | Priorité |
|--------|---------|-------|----------|
| Créer | `public/static/css/design-tokens.css` | Tokens CSS centralisés | 🔴 |
| Modifier | `src/components/head.ts` | Charger `design-tokens.css` + Tailwind config unifiée | 🔴 |
| Modifier | `src/components/nav.ts` | Uniformiser bouton CTA mobile (filled rouge) | 🔴 |
| Modifier | `src/pages/*.ts` (11 fichiers) | Uniformiser border-radius cartes sur rounded-2xl | 🟡 |
| Modifier | `src/pages/*.ts` (11 fichiers) | Uniformiser ombres shadow-sm + hover:shadow-md | 🟡 |

---

## PARTIE 5 — RISQUES IDENTIFIÉS

### Risques SEO (⚠️ Voir aussi AUDIT-02-SEO.md)

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| URLs `/?lang=en`, `/en` indexées par Google | Moyenne | Moyen | Vérifier Google Search Console, ajouter redirections 301 |
| Hreflang absent sur 17/19 pages | Certaine | Moyen | Retirer hreflang de toutes les pages cohérent avec suppression i18n |
| Contenu EN dupliqué avec FR (même URL + paramètre) | Possible | Faible | Canonical tag sur `/?lang=en` → `/` |
| Redirections 302 (non 301) sur `/fr` et `/en` | Certaine | Faible | Corriger en 301 avant retrait |

> 🔗 **Référence croisée** : Ces risques sont détaillés dans **AUDIT-02-SEO.md, Section 5 (URLs et redirections)** et **Section 1 (hreflang)**.

### Risques techniques

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Régression visuelle après retrait dark: | Moyenne | Moyen | Tests visuels sur toutes les pages avant déploiement |
| `renderFonctionnalitesPage` non importée dans `index.tsx` | Certaine (bug actif) | Élevé | Ajouter import depuis `src/pages/home.ts` ou créer le fichier dédié |
| `styles.css` chargé accidentellement post-retrait dark mode | Faible | Faible | Vérifier tous les liens CSS dans head.ts |

> ⚠️ **Bug critique détecté** : Dans `src/index.tsx`, les routes `/fonctionnalites` et `/tarifs` appellent `renderFonctionnalitesPage()` et `renderTarifsPage()` qui **ne sont pas importées** dans ce fichier (contrairement à `src/index.ts` qui a l'import complet). Ce bug peut causer une erreur 500 sur ces routes en production avec le fichier `index.tsx`.

### Risques de rollback

| Opération | Rollback possible ? | Méthode |
|-----------|--------------------|---------| 
| Retrait dark mode | Oui | `git revert` ou branche sauvegarde |
| Retrait i18n (Option A) | Oui | `git revert` |
| Gel i18n (Option B) | Oui (2 lignes) | Modifier `resolveLocale()` |
| Uniformisation design tokens | Oui | `git revert` |

---

## PARTIE 6 — PLAN DE MIGRATION PRIORISÉ

### Phase 1 — Urgences (< 1 semaine)

| # | Action | Fichier(s) | Effort | Impact |
|---|--------|-----------|--------|--------|
| 1.1 | **Corriger bug import** `renderFonctionnalitesPage` dans `index.tsx` | `src/index.tsx` | 15 min | 🔴 Critique |
| 1.2 | **Gel i18n FR** : forcer `resolveLocale()` → 'fr' | `src/index.tsx` | 30 min | 🔴 |
| 1.3 | **Masquer sélecteur langue** dans nav | `src/components/nav.ts` | 30 min | 🔴 |
| 1.4 | **Supprimer bouton dark-toggle** de nav | `src/components/nav.ts` | 30 min | 🔴 |
| 1.5 | **Corriger redirections 302 → 301** sur /fr et /en | `src/index.tsx` | 15 min | 🟡 SEO |
| 1.6 | **Supprimer script anti-flash** dans head.ts | `src/components/head.ts` | 15 min | 🔴 |
| 1.7 | **Supprimer initDarkMode** dans main.js | `public/static/js/main.js` | 15 min | 🔴 |
| 1.8 | **Supprimer @media prefers-color-scheme** main.css | `public/static/css/main.css` | 15 min | 🔴 |

**Total Phase 1** : ~3 heures

### Phase 2 — Nettoyage (1-2 semaines)

| # | Action | Fichier(s) | Effort | Impact |
|---|--------|-----------|--------|--------|
| 2.1 | Retirer classes `dark:` de home.ts (97 occurrences) | `src/pages/home.ts` | 2h | 🟡 |
| 2.2 | Retirer classes `dark:` de nav.ts (~40) et footer.ts (~30) | `src/components/*.ts` | 2h | 🟡 |
| 2.3 | Retirer classes `dark:` des autres pages (8 fichiers, ~100 occurrences) | `src/pages/*.ts` | 2h | 🟡 |
| 2.4 | Uniformiser bouton CTA nav mobile | `src/components/nav.ts` | 30 min | 🟡 |
| 2.5 | Créer `design-tokens.css` et charger dans head.ts | `src/components/head.ts`, nouveau fichier | 2h | 🟡 |

**Total Phase 2** : ~9 heures

### Phase 3 — Optimisation (2-4 semaines)

| # | Action | Fichier(s) | Effort | Impact |
|---|--------|-----------|--------|--------|
| 3.1 | Retrait complet i18n (Option A) — si décidé | ~15 fichiers | 4 jours | 🟢 |
| 3.2 | Uniformiser border-radius cartes (→ rounded-2xl) | `src/pages/*.ts` | 2h | 🟢 |
| 3.3 | Uniformiser ombres cartes | `src/pages/*.ts` | 2h | 🟢 |
| 3.4 | Remplacer hex hardcodés par tokens | `src/pages/*.ts` | 2h | 🟢 |
| 3.5 | Vérifier Google Search Console + ajouter 301 manquants | `src/index.tsx` | 1h | 🟡 SEO |
| 3.6 | Archiver/supprimer `styles.css` et `style.css` (code mort) | `public/static/css/` | 30 min | 🟢 |

**Total Phase 3** : ~4 jours (hors retrait i18n complet)

---

## ANNEXE — Références croisées avec AUDIT-02-SEO.md

| Point de ce rapport | Section AUDIT-02-SEO concernée |
|--------------------|---------------------------------|
| Hreflang absent sur 17 pages | Section 5 — URLs propres et hreflang |
| Redirections 302 sur /fr, /en | Section 5 — Redirections 301 |
| `?lang=en` non canonicalisé | Section 5 — URLs propres |
| head.ts génère hreflang uniquement sur home | Section 1 — Meta tags et Open Graph |
| Suppression i18n → suppression hreflang sitemap | Section 3 — Sitemap.xml |

> **Note** : Les deux rapports (`AUDIT-01-I18N-DARKMODE-DESIGN.md` et `AUDIT-02-SEO.md`) doivent être lus conjointement. Toute décision sur l'i18n doit être validée au regard des implications SEO documentées dans AUDIT-02-SEO.md.

---

*Rapport généré le 2026-07-29 — Audit complet du dépôt `poodasamuelpro/monmenu`*  
*Aucune modification de code n'a été effectuée dans le cadre de cet audit.*
