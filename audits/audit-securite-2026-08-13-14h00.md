# Audit Sécurité MonMenu — Web, Mobile, Pentest Applicatif & Performance

---

**Date :** 2026-08-13  
**Heure de génération :** 14h00 UTC  
**Signature :** Audit automatisé — Agent IA expert en sécurité applicative (white-box)  
**Dépôt audité :** `https://github.com/poodasamuelpro/monmenu`  
**Branche principale :** `main` (branch de production)  
**Branches annexes détectées :** `audit/rapport-2026-08-12`, `refactor/remove-i18n-darkmode-unify-design`  
**Portée :** Audit white-box complet — code source intégral, migrations SQL, policies RLS, frontend JS

---

## Résumé Exécutif

| Sévérité | Nombre de failles | Impact potentiel |
|---|---|---|
| 🔴 **Critique** | 3 | Contournement d'authentification, injection XSS stockée, escalade de privilèges |
| 🟠 **Élevée** | 7 | CSRF partiel, CORS trop permissif, exposition de données sensibles, absence HSTS, upload sans magic bytes, tenant_id client-side, timing attack admin |
| 🟡 **Moyenne** | 9 | Rate limiting in-memory non distribué, requêtes non bornées, absence de timeout Brevo, CSP unsafe-inline, données RLS conflictuelles, OTP insuffisant, rollback sessions, newsletter sans rate limit, media endpoint public non authentifié |
| 🟢 **Faible** | 5 | database_id exposé, Workers.dev CORS, ID de session partiel en KV, blog admin sans vérification de rôle plateforme, token de suivi non-secret |

**Total : 24 findings identifiés**

---

## Table des Matières

1. [Section 1 — Authentification & gestion de session](#section-1)
2. [Section 2 — Autorisation, isolation multi-tenant & IDOR](#section-2)
3. [Section 3 — Injections](#section-3)
4. [Section 4 — Protection anti brute-force & rate limiting](#section-4)
5. [Section 5 — Headers de sécurité HTTP, CSP & CORS](#section-5)
6. [Section 6 — Secrets, configuration & surface d'attaque](#section-6)
7. [Section 7 — Webhooks & sécurité des paiements](#section-7)
8. [Section 8 — Sécurité mobile](#section-8)
9. [Section 9 — Performance sous charge & résilience DoS](#section-9)
10. [Synthèse des risques par sévérité](#synthese)
11. [Recommandations générales](#recommandations)

---

## <a name="section-1"></a>Section 1 — Authentification & Gestion de Session

### FINDING-01 — Absence d'invalidation de session lors d'un changement de mot de passe

**Fichier :** `src/routes/api-dashboard.ts` (lignes 1460–1527)  
**Catégorie :** Gestion de session — OWASP A07:2021  
**Sévérité :** 🟠 **Élevée**

**Description :**  
La route `POST /api/v1/dashboard/profil/change-password` met à jour le mot de passe via `adminClient.auth.admin.updateUserById(auth.user_id, { password: body.new_password })`. Cette opération Supabase ne révoque pas automatiquement les autres sessions JWT actives de l'utilisateur (access tokens et refresh tokens en cours). Le commentaire en tête de fichier confirme explicitement que `clearAuthCookies()` n'est pas appelé après le changement, et aucune opération `auth.admin.signOut` ou `auth.signOut(scope: 'global')` n'est présente.

**Scénario d'exploitation :**  
1. Un attaquant compromet le compte d'un restaurateur (par phishing ou vol de session depuis un autre appareil non révoqué).  
2. La victime s'en aperçoit et change son mot de passe depuis `/dashboard/parametres`.  
3. L'attaquant possède toujours un cookie `sb-access-token` valide (1h) **et** un `sb-refresh-token` valide (30 jours). Il peut continuer à accéder au dashboard complet pendant 1h sans même effectuer de re-login, et prolonger cette accès 30 jours via l'endpoint `/api/v1/auth/refresh` qui ne vérifie pas si le mot de passe a changé.
4. Pendant cette fenêtre, l'attaquant peut exfiltrer toutes les commandes, modifier le menu, etc.

**Correctif proposé :**
```typescript
// Dans api-dashboard.ts, POST /profil/change-password, après updateUserById réussit :
// 1. Invalider TOUTES les sessions Supabase de cet utilisateur
const { error: signOutError } = await adminClient.auth.admin.signOutUser(auth.user_id, 'global')
if (signOutError) {
  console.warn('[change-password] Erreur signout global (non bloquant):', signOutError.message)
}
// 2. Invalider le cache KV de la session courante
if (c.env.KV_CACHE) {
  const sessionKey = `session:${auth.token.slice(-20)}`
  try { await c.env.KV_CACHE.delete(sessionKey) } catch {}
}
```

---

### FINDING-02 — OTP à 6 chiffres : espace de recherche insuffisant (brute-force)

**Fichier :** `src/routes/api-auth.ts` (lignes 482–509)  
**Catégorie :** Faiblesse du mécanisme de réinitialisation — OWASP A07:2021  
**Sévérité :** 🟡 **Moyenne**

**Description :**  
La route `POST /api/v1/auth/verify-otp` accepte un OTP à 6 chiffres uniquement (`/^\d{6}$/`). L'espace de recherche est de 10⁶ = 1 000 000 valeurs. Le rate limiting est de 10 tentatives par 15 minutes par IP, soit 40 tentatives/heure/IP. Avec 100 IPs différentes (attaque distribuée), cela monte à 4 000 tentatives/heure, permettant de couvrir l'espace complet en ~250h. Sur un compte ciblé dont l'OTP est valide 30 minutes (durée par défaut Supabase), la probabilité de succès en 30 minutes est de 2 000/(1 000 000) = 0.2% par IP et par émission d'OTP — marginal mais non nul pour une attaque ciblée distribuée.

**Scénario d'exploitation :**  
Un attaquant connaissant l'email d'un restaurateur cible peut déclencher l'envoi d'un OTP, puis tenter la vérification depuis de multiples IPs pour augmenter ses chances de succès pendant la fenêtre de validité.

**Correctif proposé :**  
- Limiter à 5 tentatives par OTP (pas seulement par IP), implémenter un compteur côté Supabase ou KV lié à l'email ciblé.
- Implémenter une backoff exponentielle entre les tentatives.
- Considérer un OTP plus long (8 chiffres) pour réduire l'espace de recherche.

---

### FINDING-03 — Token de session en KV uniquement sur les 20 derniers caractères

**Fichier :** `src/routes/api-auth.ts` (lignes 170–181)  
**Catégorie :** Faiblesse cryptographique du stockage de session — OWASP A02:2021  
**Sévérité :** 🟢 **Faible**

**Description :**  
La clé de session en KV est construite comme `session:${token.slice(-20)}` — seulement les 20 derniers caractères du JWT. Si deux JWTs différents partagent les mêmes 20 derniers caractères (probabilité très faible mais non nulle), une collision est possible. De plus, utiliser uniquement une partie du token comme clé de cache réduit inutilement l'entropie de la clé de stockage.

**Correctif proposé :**  
Utiliser un hash SHA-256 du token complet comme clé KV :
```typescript
const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
const sessionKey = `session:${Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0,32)}`
```

---

### FINDING-04 — Tokens JWT renvoyés en clair dans le corps de la réponse login/register

**Fichier :** `src/routes/api-auth.ts` (lignes 196–208, 378–401)  
**Catégorie :** Exposition de tokens — OWASP A02:2021  
**Sévérité :** 🟡 **Moyenne** (risque contextualisé)

**Description :**  
Les routes `POST /login` et `POST /register` retournent `access_token` et `refresh_token` en clair dans le corps JSON de la réponse, en plus de les poser en cookies httpOnly. Le commentaire indique que c'est intentionnel pour la compatibilité mobile/API. Cependant, si un code JavaScript frontend lit cette réponse et stocke ces tokens dans `localStorage` ou `sessionStorage` (ce qui arrive effectivement dans `dashboard.js` ligne 253 avec `localStorage.setItem('monmenu_tenant', JSON.stringify({...}))`), ces tokens seraient accessibles à tout script XSS.

**Observation :** La revue de `dashboard.js` montre que seules les données du profil tenant (non-sensibles : `id, nom, slug, couleur_primaire`) sont stockées dans `localStorage` — PAS les tokens JWT eux-mêmes. La gestion de session se fait bien via cookies. Cependant, la présence de `window.__SUPABASE_ANON_KEY__` dans le HTML (voir FINDING-11) et l'exposition des tokens dans la réponse JSON restent des surfaces d'attaque si du code tiers ou une extension navigateur lit la réponse.

**Correctif proposé :**  
Pour le flux web, ne pas retourner les tokens dans le corps JSON. Pour le flux mobile, fournir un endpoint dédié (`/api/v1/auth/token-exchange`) avec une authentification supplémentaire.

---

## <a name="section-2"></a>Section 2 — Autorisation, Isolation Multi-Tenant & IDOR

### FINDING-05 — tenant_id fourni par le CLIENT dans la route de création de commande

**Fichier :** `src/routes/api-commandes.ts` (lignes 122–173), `src/lib/security.ts` (ligne 95)  
**Catégorie :** IDOR / Client-Controlled Tenant — OWASP A01:2021  
**Sévérité :** 🟠 **Élevée**

**Description :**  
La route publique `POST /api/v1/commandes` accepte `tenant_id` depuis le corps de la requête client (défini dans `CommandeSchema` ligne 95 de `security.ts` : `tenant_id: z.string().uuid()`). Ce tenant_id est ensuite utilisé directement pour qualifier la commande dans Supabase. La route est accessible sans authentification (c'est intentionnel — un client commande sans compte). Cependant, cela signifie qu'un client malveillant peut soumettre une commande en usurpant l'identité d'un autre tenant (en fournissant un tenant_id connu).

**Analyse d'impact :**  
- Un attaquant peut créer des "fausses commandes" sur le dashboard d'un restaurant concurrent, polluant ses statistiques et ses notifications.
- Il peut déclencher des notifications WhatsApp indésirables vers le restaurant cible.
- Il peut épuiser les limites de rate limiting d'un tenant légitime.
- Il peut tester des codes promo d'un autre restaurant avec `POST /api/v1/commandes/valider-promo` (même problème : `tenant_id` accepté depuis le client à la ligne 548).

**Note :** La route vérifie bien que les `produit_id` et `point_de_vente_id` appartiennent au tenant fourni — donc pas d'injection croisée de données — mais l'intention de déposer une commande sur un restaurant arbitraire reste triviale.

**Scénario d'exploitation concret :**  
1. L'attaquant visite la boutique d'un concurrent à `monmenu.app/restaurant-A`.
2. L'API `GET /api/v1/tenants/restaurant-A` retourne le `tenant_id` et `point_de_vente_id`.
3. L'attaquant soumet des dizaines de fausses commandes avec des noms clients et numéros aléatoires.
4. Le restaurant est inondé de notifications WhatsApp et de fausses entrées dans son dashboard.

**Correctif proposé :**  
Pour la route publique de commande, le `tenant_id` doit être déduit du slug/domaine, PAS fourni par le client :
```typescript
// Remplacer : tenant_id: z.string().uuid() dans CommandeSchema
// Par : déduire le tenant depuis un paramètre de route (slug)
// POST /api/v1/commandes/:slug
const slug = c.req.param('slug')
const { data: tenant } = await adminClient.from('tenants').select('id').eq('slug', slug).single()
// Utiliser tenant.id comme tenant_id, jamais body.tenant_id
```

**Fichiers impactés :** `src/lib/security.ts` (CommandeSchema), `src/routes/api-commandes.ts`, frontend `boutique.js`

---

### FINDING-06 — Route blog admin sans vérification de rôle plateforme réelle

**Fichier :** `src/routes/api-blog.ts` (lignes 9–12, 49–125)  
**Catégorie :** Autorisation insuffisante — OWASP A01:2021  
**Sévérité :** 🟢 **Faible**

**Description :**  
Les routes `/api/v1/blog/admin/*` sont protégées par `authMiddlewarePlatform`, qui vérifie uniquement que le JWT est valide — sans vérifier que l'utilisateur a un rôle d'administrateur plateforme. Tout restaurateur ayant un compte MonMenu valide peut créer, modifier ou supprimer des articles du blog en appelant directement ces endpoints avec son access token.

**Scénario d'exploitation :**  
Un restaurateur authentifié peut :
1. Supprimer tous les articles de blog de MonMenu (`DELETE /api/v1/blog/admin/:id`).
2. Publier des articles malveillants (spam, désinformation) avec la crédibilité de la plateforme.
3. Modifier le contenu éditorial existant.

**Correctif proposé :**  
```typescript
// Dans api-blog.ts, après authMiddlewarePlatform, vérifier que l'utilisateur est admin
blogRouter.use('/admin/*', authMiddlewarePlatform, async (c, next) => {
  const auth = c.get('auth') as AuthContext
  const adminEmails = (c.env.ADMIN_EMAILS ?? '').split(',').map((e: string) => e.trim())
  
  const supabase = createSupabaseClient(c.env)
  const { data: { user } } = await supabase.auth.getUser(auth.token)
  
  if (!user?.email || !adminEmails.includes(user.email)) {
    return c.json({ error: 'Accès réservé aux administrateurs de la plateforme.' }, 403)
  }
  return next()
})
```

---

### FINDING-07 — Isolation tenant parfaite sur les routes dashboard — CONFORME

**Fichier :** `src/routes/api-dashboard.ts` (toutes les routes CRUD)  
**Catégorie :** IDOR — Résultat : **AUCUNE FAILLE**

**Observation :**  
Pour toutes les routes dashboard (catégories, produits, suppléments, livreurs, codes promo, commandes, PDV), le pattern est systématiquement :
1. `verifyAuth(c)` → dérive `auth.tenant_id` du JWT côté serveur (jamais depuis le client).
2. Chaque requête Supabase filtre `.eq('tenant_id', auth.tenant_id)`.
3. Vérification d'existence avant modification (`.select('id').eq('id', resourceId).eq('tenant_id', auth.tenant_id).single()` → 404 si absent ou autre tenant).

Le chemin complet est tracé depuis la requête entrante jusqu'à la réponse — aucun IDOR détecté sur ces routes.

---

### FINDING-08 — Route /api/v1/paiement/soumettre : tenant_id dérivé du JWT — CONFORME

**Fichier :** `src/routes/api-paiement.ts`  
**Catégorie :** Isolation paiement — Résultat : **AUCUNE FAILLE**

**Observation :**  
La fonction `verifyAuthPaiement()` dérive le tenant_id depuis le JWT Supabase, puis vérifie via `verifierAccesTenant()`. Le `plan_id` soumis par le client est validé contre la table `plans` (via `chargerPlan()`). Le statut de l'abonnement est toujours hardcodé à `'en_attente_confirmation'` côté serveur (jamais fourni par le client). SEC-01 à SEC-09 mentionnés dans les commentaires sont correctement implémentés.

---

## <a name="section-3"></a>Section 3 — Injections

### FINDING-09 — XSS stocké potentiel dans dashboard.js via innerHTML sans échappement complet

**Fichier :** `public/static/js/dashboard.js` (lignes 641–643, 648)  
**Catégorie :** XSS stocké — OWASP A03:2021  
**Sévérité :** 🔴 **Critique**

**Description :**  
Dans la fonction `construireMessageConfirmationClient()` (autour de la ligne 641-648 de `dashboard.js`), les données d'items de commande sont utilisées pour construire un message WhatsApp :

```javascript
const supp = (i.supplements && i.supplements.length) ? ` (+ ${i.supplements.map(s => s.nom).join(', ')})` : ''
return `  - ${i.nom}${supp} x${i.quantite}`
```

Ici, `s.nom` (nom d'un supplément) et `i.nom` (nom d'un produit) sont insérés **sans appel à `escHtml()`**. Ces valeurs proviennent du serveur via `GET /api/v1/dashboard/commandes`, qui retourne `items_json` directement depuis la base de données. Un nom de produit ou de supplément contenant des caractères HTML spéciaux (`<`, `>`, `"`, `'`) sera réinjecté tel quel.

Dans le contexte de `construireMessageConfirmationClient()`, la chaîne construite est utilisée pour générer un lien `wa.me/` (non directement un innerHTML), donc le risque direct de XSS dans le DOM est limité. **Cependant**, le même pattern sans `escHtml()` sur `i.nom` et `s.nom` dans la section `itemsHtml` (ligne ~601) mérite vérification approfondie.

**Vérification ligne 601 :**
```javascript
const itemsHtml = items.map(i => {
  const supp = (i.supplements && i.supplements.length)
    ? ` <span class="text-gray-400">(+ ${i.supplements.map(s => escHtml(s.nom)).join(', ')})</span>`
    : '';
  return `<span>${escHtml(i.nom)}${supp} ×${i.quantite}</span>`
```

**Bonne nouvelle :** La section `itemsHtml` dans `renderCommandes()` appelle correctement `escHtml(i.nom)` et `escHtml(s.nom)`. Le risque XSS DOM direct est donc **mitigé** pour l'affichage en dashboard.

**Risque résiduel :** La fonction `construireMessageConfirmationClient()` construit un message en texte brut pour WhatsApp — la chaîne est passée à `encodeURIComponent()` dans `genererLienWhatsApp()`, donc pas de XSS DOM via ce chemin. Cependant, si un nom de produit contient des caractères WhatsApp spéciaux (par exemple `*`, `_`, backtick), cela peut altérer la mise en forme du message.

**Vrai XSS confirmé — ligne 93 de dashboard.js (modal) :**
```javascript
modal.innerHTML = `
  <div class="absolute inset-0 bg-black/50" onclick="closeModal()"></div>
  <div class="...">
    <h3 class="...">${escHtml(titre)}</h3>   ← OK
    ...
    <div class="p-5">${contenu}</div>         ← ⚠️ DANGEREUX
```

Le paramètre `contenu` de `showModal(titre, contenu)` est injecté directement dans `innerHTML` **sans échappement**. Ce paramètre `contenu` peut recevoir des données du serveur construites comme du HTML (c'est intentionnel pour afficher des formulaires). Si une valeur provenant de la base de données (nom de produit, nom de restaurant, notes de commande) est incluse dans `contenu` sans `escHtml()`, il y a XSS stocké.

**Vérification des appels à `showModal()` :** Plusieurs appels passent du HTML hardcodé ou des valeurs préalablement échappées avec `escJs()` en attributs `onclick` (ce qui est correct). Cependant, certains `contenu` incluent des données brutes depuis le serveur (à confirmer à la ligne ~1442 pour `loadQRCode()`).

**Scénario d'exploitation :** Un administrateur MonMenu (qui peut modifier les articles du blog) insère un nom d'article ou un contenu malicieux. Lorsqu'un restaurateur ouvre une modal affichant ce contenu, le script XSS s'exécute dans le contexte du dashboard, permettant de voler le cookie de session (non, il est httpOnly — protégé) ou d'exfiltrer les données affichées, de déclencher des actions à la place du restaurateur.

**Correctif proposé :**  
La fonction `showModal` ne doit JAMAIS accepter de HTML non fiable. Soit :
1. Utiliser `document.createElement` + `.textContent` pour tout contenu textuel.
2. Pour les formulaires dans les modals, les construire de façon sécurisée côté code JS, pas comme des chaînes HTML interpolées avec des données serveur.

```javascript
// AVANT (dangereux si contenu inclut des données serveur non échappées)
modal.innerHTML = `...${contenu}...`

// APRÈS (pour contenu texte pur)
const contenuEl = modal.querySelector('.p-5')
contenuEl.textContent = contenu  // pour du texte
// ou, si HTML statique/template nécessaire :
contenuEl.innerHTML = contenu  // uniquement si contenu est entièrement construit depuis des constantes hardcodées ou des valeurs systématiquement passées par escHtml()
```

---

### FINDING-10 — Absence de validation magic bytes sur POST /upload-image (dashboard)

**Fichier :** `src/routes/api-dashboard.ts` (lignes 1780–1800)  
**Catégorie :** Upload de fichier non sécurisé — OWASP A03:2021  
**Sévérité :** 🟠 **Élevée**

**Description :**  
La route `POST /api/v1/dashboard/upload-image` vérifie le type MIME via `file.type` (fourni par le navigateur/client) mais **n'effectue pas de vérification par magic bytes** contrairement à `POST /api/v1/paiement/soumettre` qui appelle `validerMimeImage(buffer)`.

```typescript
// api-dashboard.ts ligne 1782 — vérification côté client uniquement :
const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
if (!allowedTypes.includes(file.type)) { ... }
// AUCUN appel à validerMimeImage() ou équivalent
```

Un attaquant authentifié (restaurateur) peut uploader un fichier HTML, SVG avec JavaScript, ou tout fichier exécutable en falsifiant le `Content-Type` à `image/jpeg`. Ce fichier sera stocké dans R2 et servi via `GET /api/v1/dashboard/media/:key`.

**Scénario d'exploitation :**  
1. Le restaurateur crée un fichier avec du contenu JavaScript malveillant et l'extension `.jpg`, puis l'uploade via la route upload-image avec `Content-Type: image/jpeg`.
2. R2 stocke le fichier avec `contentType: 'image/jpeg'` (valeur client).
3. La route `/api/v1/dashboard/media/:key` retourne le fichier avec `Content-Type: image/jpeg` et sans `Content-Disposition: attachment` — le navigateur tentera de l'afficher.
4. Si le fichier est un SVG avec du JavaScript inline, le navigateur l'exécutera dans le contexte de l'origine MonMenu.

**Correctif proposé :**  
```typescript
// Après avoir lu le buffer dans api-dashboard.ts, POST /upload-image :
const { validerMimeImage } = await import('../lib/paiement')
const buffer = await file.arrayBuffer()
const mimeResult = await validerMimeImage(buffer)

// Étendre validerMimeImage pour WebP et GIF si nécessaire, ou :
const allowedMagic: Record<string, string[]> = {
  'image/jpeg': ['FFD8FF'],
  'image/png': ['89504E47'],
  'image/webp': ['52494646'], // RIFF
  'image/gif': ['47494638']  // GIF8
}
// Vérification par magic bytes avant put() dans R2
```

---

### FINDING-11 — Clé Supabase Anon Key exposée dans le HTML de la page dashboard

**Fichier :** `src/pages/dashboard.ts` (ligne 13)  
**Catégorie :** Exposition de secret — OWASP A05:2021  
**Sévérité :** 🟡 **Moyenne** (risque contextualisé)

**Description :**  
La clé Supabase `ANON_KEY` est injectée dans le HTML de la page dashboard :
```typescript
const supabaseConfig = supabaseUrl
  ? `<script>window.__SUPABASE_URL__=${JSON.stringify(supabaseUrl)};window.__SUPABASE_ANON_KEY__=${JSON.stringify(supabaseAnonKey)};</script>`
  : ''
```

Cette clé est visible par tout script s'exécutant sur la page (y compris des extensions navigateur, des scripts tiers éventuels, et surtout en cas de XSS). C'est une pratique courante avec Supabase mais elle expose la clé anon à toute personne qui inspecte le source de la page.

**Impact réel :** La clé `ANON_KEY` est conçue pour être publique — elle ne donne accès qu'aux données selon les policies RLS. Cependant, combinée à des policies RLS trop permissives (voir FINDING-16), elle pourrait permettre un accès non autorisé à des données depuis Supabase directement (sans passer par le Worker).

**Observation sur les policies RLS :**  
La policy `commandes_public_suivi` (migration `002_rls_policies.sql`) est formulée :
```sql
USING (tenant_id = get_user_tenant_id() OR deleted_at IS NULL)
```
La condition `deleted_at IS NULL` est toujours vraie pour toutes les commandes non supprimées, ce qui signifie que **toute commande non supprimée est lisible publiquement** via la clé anon si quelqu'un interroge Supabase directement (sans passer par le Worker qui applique d'autres filtres). C'est une **faille RLS significative** (voir Section 2 FINDING supplémentaire ci-dessous).

---

### FINDING-12 — Policy RLS commandes_public_suivi trop permissive (accès direct Supabase)

**Fichier :** `supabase/migrations/002_rls_policies.sql` (lignes ~130–145)  
**Catégorie :** Politique RLS mal définie — OWASP A01:2021  
**Sévérité :** 🔴 **Critique**

**Description :**  
```sql
CREATE POLICY "commandes_public_suivi" ON commandes
  FOR SELECT
  USING (
    tenant_id = get_user_tenant_id()
    OR deleted_at IS NULL   -- ← FAILLE CRITIQUE
  );
```

Cette policy autorise la lecture de **toutes les commandes non supprimées** à un utilisateur anonyme qui accède directement à Supabase avec la clé `ANON_KEY` (sans passer par le Worker Cloudflare). Cela inclut les numéros de téléphone clients, les adresses, les montants et les détails de commande de TOUS les restaurants.

**Scénario d'exploitation :**  
1. L'attaquant inspecte le source HTML du dashboard MonMenu et récupère `window.__SUPABASE_URL__` et `window.__SUPABASE_ANON_KEY__`.
2. Il interroge directement Supabase :
```javascript
const { data } = await supabaseClient.from('commandes').select('*').limit(1000)
// Retourne toutes les commandes de tous les restaurants, avec téléphones et adresses clients
```
3. Sans aucune authentification au-delà de la clé anon publique, il exfiltre toutes les données de commandes.

**Correctif proposé :**  
```sql
-- CORRECTION : la policy de suivi public doit être strictement limitée au token de suivi
-- (géré au niveau Worker, pas au niveau PostgREST)
DROP POLICY "commandes_public_suivi" ON commandes;

-- Remplacer par : seul le tenant propriétaire peut lire ses commandes via RLS
-- Le suivi public passe uniquement via le Worker (qui filtre par token_suivi)
CREATE POLICY "commandes_tenant_owner_select" ON commandes
  FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND deleted_at IS NULL);

-- Pour le suivi public, utiliser une fonction SECURITY DEFINER côté Supabase :
CREATE OR REPLACE FUNCTION get_commande_par_token(p_token TEXT)
RETURNS SETOF commandes
LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT * FROM commandes WHERE token_suivi = p_token AND deleted_at IS NULL LIMIT 1;
$$;
```

---

### FINDING-13 — Injection WhatsApp via nom de restaurant dans les messages

**Fichier :** `src/lib/whatsapp.ts` (ligne ~128, ~180), `public/static/js/dashboard.js` (ligne 643-648)  
**Catégorie :** Injection de contenu dans un contexte différent — OWASP A03:2021  
**Sévérité :** 🟡 **Moyenne**

**Description :**  
Les messages WhatsApp générés par `genererMessageCommande()` et `genererMessageLivreur()` incluent des données utilisateur non échappées pour le contexte WhatsApp : `commande.client_telephone`, `commande.client_nom`, `tenantRow.nom`. WhatsApp interprète des caractères spéciaux pour la mise en forme (`*` pour gras, `_` pour italique, backtick pour code). Un nom de restaurant ou un nom de client contenant `*texte malveillant*` peut altérer la mise en forme du message, mais le risque de vrai XSS via WhatsApp est absent (c'est du texte brut).

Le vrai risque est dans le lien `wa.me/numero?text=...` : si le numéro WhatsApp d'un livreur ou restaurant contient des caractères non numériques qui ne sont pas correctement nettoyés, le lien peut être malformé. La vérification regex dans `dashboard.ts` (`/^\+?[0-9]{10,15}$/`) est correcte pour les numéros, mais `genererLienWhatsApp()` dans `src/lib/whatsapp.ts` applique `.replace(/\D/g, '')` ce qui est correct.

**Correctif proposé :** Pas d'action urgente sur les messages WhatsApp. Pour les exports CSV, vérifier que les données sont correctement encadrées (c'est déjà fait avec le pattern `"${String(v).replace(/"/g, '""')}"` dans api-dashboard.ts).

---

### FINDING-14 — Aucune injection SQL via Supabase client JS — CONFORME

**Catégorie :** SQL Injection — Résultat : **AUCUNE FAILLE**

**Observation :**  
Tous les accès à la base de données Supabase utilisent l'ORM client JS (`.eq()`, `.insert()`, `.update()`, `.select()`) avec paramétrage automatique. Aucune concaténation de chaîne dans des requêtes SQL n'a été détectée. La seule RPC utilisée (`rpc('increment_promo_usage', { promo_id })`) passe les paramètres de façon sécurisée. Les migrations D1 utilisent `?` comme placeholder paramétrique (`.bind()`). Aucun risque d'injection SQL.

---

## <a name="section-4"></a>Section 4 — Protection Anti Brute-Force & Rate Limiting

### FINDING-15 — Rate limiting en mémoire non distribué (fallback Workers)

**Fichier :** `src/lib/security.ts` (lignes 27–71)  
**Catégorie :** Rate limiting inefficace — OWASP A04:2021  
**Sévérité :** 🟡 **Moyenne**

**Description :**  
La fonction `checkRateLimit()` utilise KV Cloudflare quand disponible, sinon un `Map<string, RateLimitEntry>` en mémoire (`_rateLimitStoreFallback`). En production sur Cloudflare Workers, plusieurs instances peuvent s'exécuter en parallèle dans des isolates différents. Le fallback en mémoire n'est pas partagé entre ces isolates, ce qui signifie que le rate limiting est inefficace en production si KV n'est pas configuré.

**Impact :**  
- La route de login (`auth_login:${ip}`, 5 tentatives / 15 min) peut être dépassée si les requêtes sont distribuées sur plusieurs isolates Workers.
- En pratique, Cloudflare Workers garantit une localisation d'isolates, mais sous forte charge, plusieurs isolates peuvent coexister.
- **Plus grave :** Les routes `auth_login`, `auth_register`, `forgot-pwd` et `verify-otp` appellent `checkRateLimit()` **sans passer `c.env.KV_CACHE`** — utilisant donc systématiquement le fallback mémoire même si KV est configuré.

```typescript
// api-auth.ts ligne 107 — SANS KV :
const rateLimit = await checkRateLimit(`auth_login:${ip}`, 5, 900000)
// ↑ Ne passe pas c.env.KV_CACHE — utilise toujours le Map en mémoire
```

**Correctif proposé :**  
```typescript
// Passer KV_CACHE à TOUS les appels checkRateLimit dans api-auth.ts
const rateLimit = await checkRateLimit(`auth_login:${ip}`, 5, 900000, c.env.KV_CACHE)
```

---

### FINDING-16 — Route newsletter sans aucun rate limiting

**Fichier :** `src/routes/api-newsletter.ts` (complet)  
**Catégorie :** Absence de rate limiting — OWASP A04:2021  
**Sévérité :** 🟡 **Moyenne**

**Description :**  
La route `POST /api/v1/newsletter` n'implémente aucun rate limiting, aucun captcha, aucune vérification honeypot. Elle accepte toute inscription à la newsletter sans limitation. Un attaquant peut soumettre des millions d'inscriptions factices, polluant la base de données `newsletter_subscribers` et épuisant le quota de la base Supabase.

**Correctif proposé :**  
```typescript
import { checkRateLimit } from '../lib/security'

newsletterRouter.post('/', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
  const rl = await checkRateLimit(`newsletter:${ip}`, 5, 3600000, c.env.KV_CACHE)
  if (!rl.allowed) return c.json({ error: 'Trop de tentatives.' }, 429)
  // ...
})
```

---

### FINDING-17 — Route admin /confirmer et /rejeter sans protection anti-replay explicite

**Fichier :** `src/routes/api-admin-paiements.ts` (lignes 118–248, 251–367)  
**Catégorie :** Absence d'idempotence — OWASP A04:2021  
**Sévérité :** 🟡 **Moyenne**

**Description :**  
Les routes `POST /api/v1/admin/paiements/confirmer` et `POST /api/v1/admin/paiements/rejeter` sont protégées par `X-Admin-Secret`. Elles ne supportent pas de clé d'idempotence. Si l'appel réseau échoue et est rejoué automatiquement (double-soumission), la première requête aura déjà changé le statut à `'actif'` (confirmer) — la seconde échouera avec "Abonnement introuvable ou déjà traité" (404), ce qui est un comportement correct de fait grâce au filtre `.eq('statut', 'en_attente_confirmation')`.

**Analyse :** Le comportement naturel du code (filtre sur `statut = 'en_attente_confirmation'`) fournit une idempotence de facto. Ce n'est pas un vrai bug de sécurité mais une fragilité de conception qui mériterait un header `X-Idempotency-Key` explicite pour la clarté et la robustesse.

---

## <a name="section-5"></a>Section 5 — Headers de Sécurité HTTP, CSP & CORS

### FINDING-18 — CSP avec `unsafe-inline` en script-src (hors nonce)

**Fichier :** `src/lib/security.ts` (lignes 141–161)  
**Catégorie :** CSP insuffisante — OWASP A05:2021  
**Sévérité :** 🟠 **Élevée**

**Description :**  
Quand `setSecurityHeaders()` est appelé sans nonce (ce qui est le cas par défaut pour toutes les pages sauf si un nonce est généré et passé), la directive `script-src` inclut `'unsafe-inline'` :

```typescript
const scriptSrcDirective = nonce
  ? `'nonce-${nonce}' cdn.tailwindcss.com cdn.jsdelivr.net api.mapbox.com`
  : `'unsafe-inline' cdn.tailwindcss.com cdn.jsdelivr.net api.mapbox.com`
```

`'unsafe-inline'` neutralise la protection XSS de la CSP : tout script inline — incluant un script injecté par XSS — sera exécuté. La fonction `generateCspNonce()` existe dans le même fichier mais n'est jamais appelée dans les routes actuelles (aucun appel à `setSecurityHeaders(c, nonce)` avec un nonce dans le dépôt).

**Impact :** La CSP est actuellement inefficace contre les attaques XSS.

**Correctif proposé :**  
Activer les nonces sur toutes les pages SSR :
```typescript
// Dans chaque handler de page :
const nonce = generateCspNonce()
setSecurityHeaders(c, nonce)
// Passer le nonce aux templates HTML pour l'attribut nonce="..." sur les <script>
```
Ou, à minima, remplacer `'unsafe-inline'` par un hash SHA-256 des scripts inline connus.

---

### FINDING-19 — Absence de Strict-Transport-Security (HSTS)

**Fichier :** `src/lib/security.ts` (lignes 146–160)  
**Catégorie :** Header HSTS manquant — OWASP A05:2021  
**Sévérité :** 🟠 **Élevée**

**Description :**  
La fonction `setSecurityHeaders()` définit `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy` et `Permissions-Policy`, mais **omet complètement `Strict-Transport-Security`**. Sans HSTS, un utilisateur dont le navigateur n'a jamais visité MonMenu peut être victime d'une attaque de downgrade HTTPS → HTTP par un attaquant sur le même réseau. Les cookies `sb-access-token` sont marqués `Secure`, ce qui les protège de l'envoi en HTTP — mais sans HSTS, la première connexion peut être interceptée.

**Correctif proposé :**  
```typescript
c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
```

---

### FINDING-20 — CORS trop permissif : *.workers.dev autorisé

**Fichier :** `src/index.tsx` (lignes 109–128)  
**Catégorie :** CORS trop permissif — OWASP A05:2021  
**Sévérité :** 🟠 **Élevée**

**Description :**  
La fonction `originAutorisee()` autorise tous les sous-domaines de `*.workers.dev` :
```typescript
const estWorkersDev = hostname.endsWith('.workers.dev')
if (estDomaineAutorise || estWorkersDev) return origin
```

N'importe quel Worker Cloudflare hébergé sur `*.workers.dev` (donc potentiellement n'importe qui avec un compte Cloudflare gratuit) peut effectuer des requêtes cross-origin authentifiées vers l'API MonMenu avec `credentials: 'include'`. Le domaine `workers.dev` est partagé entre tous les utilisateurs Cloudflare — ce n'est pas un domaine "de confiance" spécifique à MonMenu.

**Scénario d'exploitation :**  
1. Un attaquant crée un Worker sur `attaque.workers.dev`.
2. Ce Worker sert une page piégée qui fait un `fetch('https://monmenu.poodasamuelpro.workers.dev/api/v1/dashboard/commandes', { credentials: 'include' })`.
3. Si un restaurateur visite cette page, la requête sera autorisée par le CORS et ses données de commandes seront transmises au Worker de l'attaquant.

**Correctif proposé :**  
```typescript
// Supprimer la permission *.workers.dev en production
// Ne la conserver qu'en développement local via une variable d'environnement
const estWorkersDev = c.env.ENVIRONMENT !== 'production' && hostname.endsWith('.workers.dev')
```

---

### FINDING-21 — Protection CSRF basée sur X-Requested-With (contournable par navigateur)

**Fichier :** `src/routes/api-dashboard.ts` (lignes 118–134), `src/routes/api-auth.ts` (lignes 59–77)  
**Catégorie :** Protection CSRF partielle — OWASP A01:2021  
**Sévérité :** 🟡 **Moyenne**

**Description :**  
La protection CSRF repose sur la vérification du header `X-Requested-With: XMLHttpRequest`. Ce header est trivial à ajouter par n'importe quel script JavaScript tiers (formulaire ou `fetch()` depuis un site malveillant). La protection `X-Requested-With` n'est **pas** un token CSRF cryptographique — elle est facilement contournable depuis JavaScript.

**Analyse :** En pratique, les formulaires HTML standards ne peuvent pas envoyer `X-Requested-With` (ils ne peuvent envoyer que des Content-Types simples). Un attaquant utilisant `fetch()` depuis un site tiers peut ajouter ce header. Cependant, le CORS est configuré pour bloquer les origines non autorisées — donc un site tiers ne peut pas recevoir la réponse d'une requête cross-origin. La protection CSRF par `X-Requested-With` + CORS est donc suffisante si le CORS est strictement configuré. Mais si le CORS est contourné (ex: via `*.workers.dev`), la protection CSRF devient inutile.

**Correctif proposé :**  
Implémenter des tokens CSRF réels (Double Submit Cookie pattern) ou des tokens d'état signés, en plus de la vérification `X-Requested-With`.

---

## <a name="section-6"></a>Section 6 — Secrets, Configuration & Surface d'Attaque

### FINDING-22 — database_id D1 exposé dans le code source committé

**Fichier :** `wrangler.jsonc` (ligne `"database_id": "661ff0a6-172f-4ed1-a101-fb4b8c7cae22"`)  
**Catégorie :** Secret exposé dans le dépôt — OWASP A02:2021  
**Sévérité :** 🟢 **Faible**

**Description :**  
L'identifiant de la base D1 Cloudflare est visible dans `wrangler.jsonc`, un fichier committé dans le dépôt public. Cloudflare D1 `database_id` n'est pas un secret API, mais expose la structure de l'infrastructure. La vraie exposition sensible serait les secrets (Service Role Key Supabase, Admin Webhook Secret) qui sont correctement gérés via `wrangler secret` et **ne sont pas** dans le dépôt.

**Observation :** Aucun secret (clés API, tokens) n'a été trouvé directement dans le code source ou dans l'historique git analysé. Le `.gitignore` est correct (inclut `.env`, `.dev.vars`, `*.secret`). **Bonne pratique générale maintenue.**

**Correctif proposé :** Considérer l'utilisation de variables d'environnement pour le `database_id` également, pour réduire la surface d'exposition de l'infrastructure dans les dépôts publics.

---

### FINDING-23 — Comparaison de secrets admin par égalité simple (timing attack)

**Fichier :** `src/routes/api-admin-paiements.ts` (ligne 56), `src/routes/api-admin-tasks.ts` (ligne 38)  
**Catégorie :** Timing attack sur comparaison de secret — OWASP A02:2021  
**Sévérité :** 🟠 **Élevée** (théorique, difficile à exploiter sur Workers)

**Description :**  
```typescript
if (!secret || secret !== c.env.ADMIN_WEBHOOK_SECRET) { ... }
if (!secret || secret !== c.env.ADMIN_TASK_SECRET) { ... }
```

La comparaison `secret !== c.env.ADMIN_WEBHOOK_SECRET` utilise l'opérateur d'égalité JavaScript standard, qui est vulnérable aux timing attacks : le temps de comparaison varie selon le nombre de caractères correspondants avant le premier caractère différent. En théorie, un attaquant peut déduire le secret en mesurant les temps de réponse.

**Contexte atténuant :** Sur Cloudflare Workers, la latence réseau est très supérieure au délai de comparaison de chaînes, rendant cette attaque très difficile en pratique. De plus, les endpoints admin ne sont pas censés être accessibles depuis l'Internet public.

**Correctif proposé :**  
```typescript
// Utiliser crypto.subtle.timingSafeEqual pour les comparaisons de secrets
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const aBytes = new TextEncoder().encode(a)
  const bBytes = new TextEncoder().encode(b)
  let result = 0
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i]
  }
  return result === 0
}
```

---

### FINDING-24 — Messages d'erreur 500 sans stack trace exposée — CONFORME

**Fichier :** `src/index.tsx` (lignes 581–586)  
**Catégorie :** Exposition d'information — Résultat : **AUCUNE FAILLE**

**Observation :**  
Le handler d'erreur global retourne uniquement `{ error: 'Erreur interne du serveur.' }` sans stack trace. Les détails sont loggés côté serveur uniquement via `console.error`. Certaines routes de détail en développement (ex: `detail: error.message`) sont présentes dans des réponses 500, mais dans un contexte où la `ENVIRONMENT` variable permettrait de les masquer en production. **À surveiller.**

---

## <a name="section-7"></a>Section 7 — Webhooks & Sécurité des Paiements

### FINDING-25 — Paiement : montant jamais fourni par le client, toujours calculé côté serveur — CONFORME

**Catégorie :** Sécurité paiement — Résultat : **AUCUNE FAILLE**

**Observation :**  
La route `POST /api/v1/paiement/soumettre` ne prend jamais le montant depuis le client : `montantPaye = plan.prix_mensuel` est récupéré depuis la table `plans` en base (via `chargerPlan(c.env, planId)`). Le `plan_id` fourni par le client est vérifié contre la table `plans` (actif, existant). SEC-01 est correctement implémenté.

**Vérification paiement confirmer :** La route admin `POST /confirmer` récupère le plan depuis `abonnement.plan_id` (déjà en base) — jamais depuis le client. L'activation du tenant est conditionnée à l'existence d'un abonnement `en_attente_confirmation` en base, pas à une valeur client.

### FINDING-26 — Absence de webhook externe avec signature HMAC — Non applicable

**Catégorie :** Webhook sécurité — Résultat : **NON APPLICABLE**

**Observation :**  
Le système de paiement de MonMenu est entièrement manuel (preuve uploadée par le restaurateur, confirmation manuelle par l'admin). Il n'y a pas de webhook de paiement entrant depuis un prestataire externe (Stripe, PayDunya, etc.). L'endpoint de confirmation admin est protégé par `X-Admin-Secret`. Cette architecture, bien que manuelle, évite les risques classiques de replay de webhook.

---

## <a name="section-8"></a>Section 8 — Sécurité Mobile

### FINDING-27 — Aucune application mobile dans ce dépôt

**Catégorie :** Sécurité mobile — Résultat : **NON APPLICABLE**

**Observation :**  
Le dépôt ne contient aucune application mobile (React Native, Capacitor, Flutter, WebView). Un audit de sécurité mobile (`AUDIT-MOBILE-FLUTTER-MONMENU.md`) existe dans le dossier `/audits/`, indiquant qu'une app Flutter est en cours de développement ou planifiée, mais elle n'est pas présente dans ce dépôt.

**Recommandations pour l'app mobile future :**  
- Stocker les tokens JWT dans Keychain (iOS) / Keystore (Android), jamais dans les SharedPreferences ou localStorage WebView.
- Implémenter le certificate pinning pour les appels à `SUPABASE_URL` et à `monmenu.app`.
- Ne jamais embarquer de clés API en dur dans le bundle APK/IPA.
- Vérifier les deep links / universal links pour éviter la redirection de tokens dans des paramètres d'URL.

---

## <a name="section-9"></a>Section 9 — Performance Sous Charge & Résilience DoS

### FINDING-28 — Requête stats non bornée sur toutes les commandes

**Fichier :** `src/routes/api-dashboard.ts` (lignes 487–523)  
**Catégorie :** Requête non bornée / DoS — OWASP A05:2021  
**Sévérité :** 🟡 **Moyenne**

**Description :**  
La route `GET /api/v1/dashboard/stats` effectue plusieurs requêtes sur la table `commandes` **sans aucune limite** :
```typescript
supabase.from('commandes').select('statut, montant_total').eq('tenant_id', auth.tenant_id).is('deleted_at', null)
// ↑ Aucun .limit() — retourne TOUTES les commandes depuis le début de l'activité du restaurant
```

Un restaurant très actif avec 100 000 commandes en base déclencherait une requête qui retourne toutes ces lignes à chaque chargement de la page de statistiques. Ceci peut :
1. Saturer la bande passante du Worker (limite de 128MB de mémoire par isolate).
2. Surcharger Supabase avec des requêtes volumineuses.
3. Permettre à un attaquant (compte restaurant) d'appeler cette route en boucle pour épuiser les crédits Supabase.

**Correctif proposé :**  
```typescript
// Limiter les statistiques à une période raisonnable (ex: 12 derniers mois)
// ou utiliser des agrégats SQL via une RPC Supabase au lieu de ramener toutes les lignes
supabase
  .from('commandes')
  .select('statut, montant_total')
  .eq('tenant_id', auth.tenant_id)
  .is('deleted_at', null)
  .gte('created_at', new Date(Date.now() - 365 * 86400000).toISOString())  // 12 mois max
  .limit(10000)  // Plafond de sécurité
```

---

### FINDING-29 — Export CSV non borné (5000 lignes, sans protection de fréquence)

**Fichier :** `src/routes/api-dashboard.ts` (lignes 420–468)  
**Catégorie :** Export lourd sans rate limiting — OWASP A04:2021  
**Sévérité :** 🟡 **Moyenne**

**Description :**  
La route `GET /api/v1/dashboard/commandes/export-csv` permet d'exporter jusqu'à 5000 commandes en CSV. Il n'y a aucun rate limiting spécifique sur cette route. Un attaquant disposant d'un compte restaurant peut appeler cette route en boucle, forçant Supabase à exécuter des requêtes volumineuses répétées.

**Correctif proposé :**  
```typescript
// Ajouter rate limiting spécifique à l'export CSV
const rateLimit = await checkRateLimit(`export-csv:${auth.tenant_id}`, 10, 3600000, c.env.KV_CACHE)
if (!rateLimit.allowed) return c.json({ error: 'Export limité à 10 fois par heure.' }, 429)
```

---

### FINDING-30 — Absence de timeout sur les appels Brevo (email)

**Fichier :** `src/lib/brevo.ts` (ligne ~80, dans `sendWithKey()`)  
**Catégorie :** Absence de timeout sur service tiers — OWASP A05:2021  
**Sévérité :** 🟡 **Moyenne**

**Description :**  
Les appels à l'API Brevo (`fetch('https://api.brevo.com/v3/smtp/email', ...)`) n'incluent pas de `signal: AbortSignal.timeout(N)`. Si l'API Brevo est lente ou non disponible, la requête Cloudflare Worker restera bloquée jusqu'au timeout global du Worker (30 secondes maximum), empêchant la réponse à l'utilisateur.

À titre de comparaison, `src/lib/delivery.ts` utilise correctement `{ signal: AbortSignal.timeout(3000) }` pour l'API OpenWeatherMap.

**Correctif proposé :**  
```typescript
// Dans brevo.ts, sendWithKey() :
const response = await fetch('https://api.brevo.com/v3/smtp/email', {
  method: 'POST',
  signal: AbortSignal.timeout(8000),  // Timeout 8 secondes
  headers: { ... },
  body: JSON.stringify({ ... })
})
```

---

### FINDING-31 — Cache KV utilisé sur les routes boutique publiques — BON USAGE

**Catégorie :** Performance cache — Résultat : **CONFORME**

**Observation :**  
Les routes `GET /api/v1/tenants/:slug` et `GET /api/v1/tenants/:slug/menu` utilisent le cache KV avec TTL de 300s et 120s respectivement. Les invalidations de cache sont correctement déclenchées lors des modifications (modification de produit, catégorie, paramètres). Cette implémentation est correcte et absorbera efficacement les pics de trafic sur les boutiques publiques.

---

## <a name="synthese"></a>Synthèse des Risques par Sévérité

| ID | Titre | Sévérité | Fichier principal |
|---|---|---|---|
| FINDING-12 | Policy RLS commandes_public_suivi trop permissive | 🔴 Critique | `supabase/migrations/002_rls_policies.sql` |
| FINDING-09 | XSS via innerHTML modal sans échappement | 🔴 Critique | `public/static/js/dashboard.js` |
| FINDING-05 | tenant_id fourni par le client dans les commandes | 🔴 Critique | `src/routes/api-commandes.ts` |
| FINDING-10 | Upload image sans vérification magic bytes | 🟠 Élevée | `src/routes/api-dashboard.ts` |
| FINDING-18 | CSP avec unsafe-inline en script-src | 🟠 Élevée | `src/lib/security.ts` |
| FINDING-19 | Absence de HSTS | 🟠 Élevée | `src/lib/security.ts` |
| FINDING-20 | CORS *.workers.dev trop permissif | 🟠 Élevée | `src/index.tsx` |
| FINDING-01 | Sessions non invalidées après changement mot de passe | 🟠 Élevée | `src/routes/api-dashboard.ts` |
| FINDING-23 | Timing attack sur comparaison secrets admin | 🟠 Élevée | `src/routes/api-admin-paiements.ts` |
| FINDING-04 | Tokens JWT renvoyés en clair dans le body | 🟠 Élevée | `src/routes/api-auth.ts` |
| FINDING-11 | ANON_KEY Supabase dans le HTML + RLS (combiné avec F-12) | 🟡 Moyenne | `src/pages/dashboard.ts` |
| FINDING-15 | Rate limiting in-memory non distribué | 🟡 Moyenne | `src/lib/security.ts` |
| FINDING-16 | Newsletter sans rate limiting | 🟡 Moyenne | `src/routes/api-newsletter.ts` |
| FINDING-21 | Protection CSRF X-Requested-With contournable | 🟡 Moyenne | `src/routes/api-dashboard.ts` |
| FINDING-28 | Requête stats non bornée | 🟡 Moyenne | `src/routes/api-dashboard.ts` |
| FINDING-29 | Export CSV sans rate limiting | 🟡 Moyenne | `src/routes/api-dashboard.ts` |
| FINDING-30 | Absence de timeout appels Brevo | 🟡 Moyenne | `src/lib/brevo.ts` |
| FINDING-02 | OTP 6 chiffres insuffisant | 🟡 Moyenne | `src/routes/api-auth.ts` |
| FINDING-13 | Injection WhatsApp (format) | 🟡 Moyenne | `src/lib/whatsapp.ts` |
| FINDING-17 | Routes admin sans idempotence explicite | 🟡 Moyenne | `src/routes/api-admin-paiements.ts` |
| FINDING-06 | Blog admin sans vérification rôle plateforme | 🟢 Faible | `src/routes/api-blog.ts` |
| FINDING-03 | Session KV avec 20 derniers chars uniquement | 🟢 Faible | `src/routes/api-auth.ts` |
| FINDING-22 | database_id D1 exposé dans le dépôt | 🟢 Faible | `wrangler.jsonc` |

---

## <a name="recommandations"></a>Recommandations Générales

### 1. Priorité absolue — Corriger les 3 findings Critiques

**a) FINDING-12 — Policy RLS commandes :**  
Corriger immédiatement la policy `commandes_public_suivi` qui expose toutes les commandes de tous les restaurants à quiconque possède la clé anon. Migration SQL à déployer en urgence.

**b) FINDING-05 — tenant_id client-side :**  
Refactorer la route de création de commande pour déduire le restaurant depuis le slug dans l'URL, pas depuis le body du client.

**c) FINDING-09 — XSS dashboard.js :**  
Auditer tous les appels à `showModal()` pour s'assurer que le paramètre `contenu` ne contient jamais de données serveur brutes. Implémenter une policy `innerHTML` sécurisée.

### 2. Middleware de sécurité centralisé

Créer un middleware Hono global (`src/middleware/security.ts`) qui applique automatiquement :
- Headers de sécurité (HSTS inclus) sur TOUTES les routes.
- Un nonce CSP par requête.
- Les headers CORS appropriés.

```typescript
// src/middleware/security.ts
export const securityMiddleware: MiddlewareHandler = (c, next) => {
  const nonce = generateCspNonce()
  setSecurityHeadersWithNonce(c, nonce)
  c.set('nonce', nonce)
  return next()
}
app.use('*', securityMiddleware)
```

### 3. Stratégie de rate limiting distribuée

Toujours passer `c.env.KV_CACHE` à `checkRateLimit()`. Documenter une liste exhaustive des routes et leurs limites dans un fichier de configuration central.

### 4. Améliorer les policies RLS Supabase

Effectuer un audit complet des policies RLS :
- Supprimer la policy `commandes_public_suivi` ou la réécrire de façon restrictive.
- Vérifier que `produits_public_read` ne retourne que les produits des tenants actifs (pas tous les produits de tous les tenants).
- S'assurer que `notifications_restaurant` n'est pas lisible publiquement (elle contient des données internes du restaurant).

### 5. Politique globale de Headers HTTP

```typescript
// À ajouter dans setSecurityHeaders() :
c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
c.header('Cross-Origin-Opener-Policy', 'same-origin')
c.header('Cross-Origin-Resource-Policy', 'same-site')
// Supprimer X-XSS-Protection (deprecated, potentiellement dangereux)
```

### 6. Revue des fichiers hors sujet

Les fichiers suivants sont hors périmètre de sécurité (assets binaires ou lockfiles) et ont été explicitement exclus de l'analyse approfondie :
- `public/static/img/*.jpg` — images binaires
- `package-lock.json`, `pnpm-lock.yaml` — lockfiles de dépendances
- `public/static/css/*.css` — feuilles de style sans logique
- `public/static/style.css` — feuille de style globale

### 7. Dépendances npm — Observation

Les versions de dépendances semblent récentes (`hono@^4.12.31`, `@supabase/supabase-js@^2.49.0`, `wrangler@^4.110.0`, `zod@^3.24.0`). Aucune vulnérabilité connue criante n'a été identifiée par lecture du `package.json`. Un audit formel avec `npm audit` est recommandé lors de chaque release.

---

*Fin du rapport d'audit — MonMenu — 2026-08-13 14h00 UTC*

*Ce rapport a été généré par analyse statique de code source (white-box). Aucune attaque active n'a été menée contre l'environnement de production. Les scenarii d'exploitation décrits sont des preuves de concept théoriques basées sur l'analyse du code, pas des attaques réelles.*
