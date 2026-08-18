# Fiche d'identité visuelle — Logo mon.menu

**Date :** 18 août 2026 · **Auteur :** Manus AI
**Projet :** [MonMenu](https://github.com/poodasamuelpro/monmenu) — plateforme de commande en ligne pour les restaurants du Burkina Faso (et à terme l'Afrique de l'Ouest et Centrale).
**Statut :** v1.0 — proposition validable par un designer humain ; toutes les spécifications sont redessinables à la main à partir de ce document.

---

## 1. Ce que dit la marque (fondation du logo)

MonMenu est une plateforme qui digitalise les menus et la prise de commande des restaurants burkinabè : un restaurateur de Ouagadougou crée sa boutique en cinq étapes, un client commande depuis son téléphone et paie par Orange Money ou Moov Money. La marque doit donc transmettre trois valeurs en un regard : **la chaleur de la restauration africaine** (plat servi, vapeur), **la simplicité digitale** (géométrie propre, pas de décor) et **la proximité burkinabè** (accessibilité, franchise, fiabilité du paiement local).

L'audit du code des deux repos a confirmé la charte déjà en production, que le logo prolonge plutôt qu'il ne crée une nouvelle identité.

## 2. Charte graphique extraite du code (source de vérité)

| Élément | Valeur | Origine | Usage |
|---|---|---|---|
| Rouge primaire | **#DC2626** (hover #B91C1C) | `public/static/css/design-tokens.css` — `--color-primary` | Couleur de marque, CTA, symbole du logo |
| Noir texte | **#111827** (gray-900) | design-tokens — `--color-text-primary` | Wordmark « .menu », textes |
| Bleu secondaire | #1D4ED8 | design-tokens — `--color-secondary` | Liens, éléments secondaires (jamais dans le logo) |
| Vert succès | #059669 / #065F46 | main.css | Prix, statuts, FCFA (jamais dans le logo) |
| Fond page | #FFFFFF / #F9FAFB | design-tokens | Fonds neutres |
| Typographie | **Inter** (Google Fonts), weight 600–800 | main.css, pages TS | Wordmark et toute la communication |
| Mode | Clair forcé, mobile-first | home.ts (dark mode retiré) | Le logo est pensé pour fonds clairs, avec version inversée |
| Marché | Droit burkinabè, FCFA, Orange/Moov Money | CGU (tribunaux de Ouagadougou), paiement | Ancrage local |

## 3. Concept du logo : le « M plat chaud »

Le symbole est un **monogramme M** construit sur des traits épais aux terminaisons arrondies. Ses deux jambages intérieurs s'élèvent au-dessus de la silhouette principale pour former **deux volutes de vapeur**, évoquant un plat chaud servi — la promesse centrale de la plateforme : de la cuisine chaude, commandée en un geste.

Le concept volontairement évite tout cliché géographique (pas de carte d'Afrique, pas de drapeau) : l'ancrage burkinabè s'exprime par la chaleur du rouge, la générosité de la forme et l'usage réel (boutiques de maquis, notifications push à Ouagadougou), ce qui laisse la marque extensible vers l'Afrique de l'Ouest et Centrale sans redessin.

### Construction (pour le designer)

La construction est reproductible sur une grille de 8 unités : le M s'inscrit dans un carré de 8 × 8, chaque jambage extérieur a une épaisseur de 1 unité avec des extrémités arrondies (rayon = demi-épaisseur), le V central a un angle de 60°, et les deux volutes de vapeur sont des courbes de bézier partant à 1/3 et 2/3 du sommet intérieur, de hauteur 1,5 unité, épaisseur dégressive vers le haut. L'ensemble conserve une zone de protection équivalente à la hauteur du M sur les quatre côtés.

| Paramètre | Valeur |
|---|---|
| Rapport symbole | 1:1 (icône) — wordmark horizontal hauteur symbole = x, largeur totale ≈ 3,2x |
| Épaisseur des traits | ≈ 12,5 % de la hauteur (grille 8) |
| Arrondi des terminaisons | Rayon = demi-épaisseur du trait |
| Angle du V central | 60° |
| Volutes de vapeur | 2, hauteur ≈ 30 % de la hauteur du M |
| Zone de protection | 1 hauteur de symbole sur chaque côté |

### Wordmark

« **mon.menu** » en Inter Bold (fallback : Poppins SemiBold) : « mon » en #DC2626, « .menu » en #111827, le point médian reste en #DC2626. En minuscules uniquement — jamais en majuscules. Taille minimale : 90 px en web, 12 mm en impression ; le symbole seul descend jusqu'à 16 px (favicon 32 px recommandé).

## 4. Déclinaisons livrées

| Fichier | Usage |
|---|---|
| `logo-principal-horizontal.png` | Version principale : en-têtes de site, emails, signatures |
| `logo-icone-seule.png` | Favicon, avatar de notification push, icône d'app mobile |
| `logo-empile.png` | Version verticale : splash screen mobile, affiches, cartes |
| `logo-monochrome-noir.png` | Documents officiels, impressions 1 couleur, fax |
| `logo-clair-fond-rouge.png` | Bandeaux, footers sombres, badges sur fond rouge |

## 5. Règles d'usage

Le logo ne s'utilise **jamais** dans les cas suivants : sur fond vert ou bleu (réservés aux statuts et liens), avec un contour fin ou une ombre, en dégradé, incliné, avec un tagline accolé en dessous de 32 px de hauteur, ou redessiné avec des proportions modifiées (vapeur trop haute = symbole « brûlé », vapeurs trop basses = perte du sens). Sur photo ou motif chargé, utiliser systématiquement la version claire sur aplat rouge ou blanc. Le rouge #DC2626 est la seule couleur symbolique autorisée ; le bleu #1D4ED8 et le vert #059669 restent réservés à l'interface.

## 6. Intégration technique proposée (si vous validez le logo)

L'intégration dans le code demande une modification uniquement **de contenu statique** (aucune logique modifiée) : favicon dans `index.html` des deux repos, `<img >` dans les composants `nav.ts` et `footer.ts` (web) et le header du dashboard admin, et `apple-touch-icon` pour l'app mobile. L'asset serait versionné dans `public/static/images/logo/` des deux repos. Je n'ai rien modifié dans les repos : les fichiers image sont joints, et l'intégration se fera sur votre autorisation.

## 7. Références visuelles

![Logo principal horizontal](/home/ubuntu/logo/logo-principal-horizontal.png)

![Icône seule](/home/ubuntu/logo/logo-icone-seule.png)

![Version empilée](/home/ubuntu/logo/logo-empile.png)

![Version monochrome noire](/home/ubuntu/logo/logo-monochrome-noir.png)

![Version claire sur fond rouge](/home/ubuntu/logo/logo-clair-fond-rouge.png)
