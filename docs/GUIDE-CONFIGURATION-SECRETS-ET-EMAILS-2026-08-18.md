# Guide de configuration — Secrets Cloudflare, FCM, Emails (MonMenu)

**Date :** 18 août 2026 · **Auteur :** Manus AI · **Version :** 1.1

Ce document recense l'intégralité de la configuration restante pour rendre opérationnels les deux Workers MonMenu : secrets Cloudflare (FCM, Brevo, emails admins), données `config_globale` dans la base, et le point sur le webhook SSL. Chaque valeur a été vérifiée dans le code source des deux repos.

> **Règle absolue :** aucune valeur secrète réelle (clé privée FCM, clé API Brevo, webhook secrets) n'est écrite dans ce document ni dans les repos GitHub. GitHub Push Protection bloque automatiquement les commits contenant des secrets — c'est un garde-fou supplémentaire qui protège vos credentials. Les valeurs se saisissent uniquement dans l'interface Cloudflare, depuis un gestionnaire de mots de passe.

---

## 1. Secrets Firebase Cloud Messaging (FCM) — les deux Workers

Les trois secrets FCM doivent être configurés **sur les deux Workers** (`monmenu` ET `monmenu-admin`), car ce sont deux expéditeurs différents : le web envoie les push automatiques (paiement confirmé, commandes), l'admin envoie les notifications manuelles multi-canal rédigées depuis le dashboard.

| Secret | Valeur à saisir |
|---|---|
| `FCM_PROJECT_ID` | `monmenumanager` (vérifié dans `google-services.json`, projet Firebase de l'app mobile) |
| `FCM_CLIENT_EMAIL` | `firebase-adminsdk-fbsvc@monmenumanager.iam.gserviceaccount.com` (service account du projet) |
| `FCM_PRIVATE_KEY` | Le champ `private_key` du fichier service account téléchargé — valeur intégrale (voir note ci-dessous) |

**Note sur la saisie de `FCM_PRIVATE_KEY`** : la valeur est le contenu intégral du champ `private_key` du fichier service account (préfixe `-----BEGIN PRIVATE KEY-----` / suffixe `-----END PRIVATE KEY-----` inclus). Le fichier source est le JSON Admin SDK du projet `monmenumanager` (compte `firebase-adminsdk-fbsvc`). **Important :** le code (`src/lib/fcm.ts` des deux repos) transforme automatiquement les `\n` littéraux en retours à la ligne réels — saisissez donc la valeur **avec les `\n` visibles**, sans les convertir en vraies lignes. Ne pas reformater, ne pas échapper davantage.

## 2. Brevo (envoi d'emails) — clé API

Le Worker admin utilise `BREVO_API_KEY` (une clé, simple). Le Worker web utilise un système de rotation à 3 clés `BREVO_API_KEY_1`, `BREVO_API_KEY_2`, `BREVO_API_KEY_3` (`src/lib/brevo.ts` web — rotation automatique en cas d'épuisement de quota).

| Worker | Secret | Valeur |
|---|---|---|
| **Admin** | `BREVO_API_KEY` | Votre clé API SMTP v3 Brevo (Dashboard Brevo → SMTP & API → Clés API, préfixe `xkeysib-…`) |
| **Web** | `BREVO_API_KEY_1` | Même clé que l'admin |
| **Web** | `BREVO_API_KEY_2` | *(optionnel — répéter la même clé ou laisser vide)* |
| **Web** | `BREVO_API_KEY_3` | *(optionnel — répéter la même clé ou laisser vide)* |

**Vigilance Brevo** : l'expéditeur `noreply@monmenu.poodasamuel.com` ne fonctionnera que si le domaine `monmenu.poodasamuel.com` est **ajouté et vérifié dans Brevo** (Senders & IP → Senders → Add a sender → domaine + enregistrements DNS SPF/DKIM). Tant que ce n'est pas fait, le web retombe sur l'adresse de contact (fallback codé dans `getEmailExpediteur` — aucun blocage).

## 3. ADMIN_EMAILS — accès au dashboard admin

Sur le Worker **`monmenu-admin`** uniquement, le secret `ADMIN_EMAILS` doit contenir les emails autorisés à se connecter. Valeur à saisir :

```
poodasamuelpro@gmail.com
```

Sans ce secret, toute connexion au dashboard est refusée (403) — fail-closed par conception.

## 4. config_globale — INSERT à exécuter dans D1 (base web)

Les trois INSERT suivants renseignent l'emailing côté **web**. Le web lit `config_globale` dans **D1** via `src/lib/supabase.ts` (avec cache KV d'une heure) — exécutez donc l'INSERT sur la **base D1 du Worker web** (Dashboard Cloudflare → Workers & Pages → `monmenu` → D1 → table `config_globale` → Console). Syntaxe D1 compatible :

```sql
INSERT OR REPLACE INTO config_globale (cle, valeur) VALUES
  ('email_contact', 'contact.monmenu@gmail.com'),
  ('email_expediteur', 'noreply@monmenu.poodasamuel.com'),
  ('nom_expediteur', 'MonMenu');
```

**Vérification après INSERT** : `SELECT * FROM config_globale WHERE cle IN ('email_contact', 'email_expediteur', 'nom_expediteur');`

Côté **admin**, `config_globale` (Supabase) est utilisée pour les réglages IA (`ia_*`) et la configuration générale du dashboard — les migrations 021/022 déjà appliquées couvrent ces clés. Les clés email du web ne sont pas lues par l'admin : l'admin envoie ses emails directement via Brevo avec `BREVO_API_KEY`.

## 5. Point sur le « webhook SSL personnalisé »

Cloudflare chiffre nativement tous les Workers en HTTPS (TLS géré automatiquement, certificats renouvelés sans action). Il n'existe donc pas de « webhook SSL » séparé à créer : **tous les endpoints API sont déjà en SSL**. Ce qui existe déjà dans le code, et qui couvre le besoin :

| Endpoints webhook existants | Authentification | SSL |
|---|---|---|
| `POST /api/v1/admin/paiements/*` (confirmer/refuser/CRUD moyens) | `X-Admin-Secret` = `ADMIN_WEBHOOK_SECRET` (comparaison timing-safe) | HTTPS Cloudflare natif |
| `POST /api/admin/webhooks/notification` (dormant, intégré à l'avenir) | `X-Webhook-Secret` = `ADMIN_WEBHOOK_SECRET` | HTTPS Cloudflare natif |
| `POST /api/v1/admin/tasks/screenshots` (relance manuelle) | `X-Admin-Task-Secret` = `ADMIN_TASK_SECRET` | HTTPS Cloudflare natif |

Si l'objectif était un **endpoint supplémentaire avec un secret dédié**, dites-moi le cas d'usage exact et je l'implémente côté admin (uniquement) avec les mêmes garde-fous. Si l'objectif était un **certificat SSL personnalisé** (domaine custom, HSTS renforcé), cela se configure dans Cloudflare → SSL/TLS → Custom Hostnames — aucun code requis.

## 6. Récapitulatif des secrets à saisir (checklist finale)

| Worker | Secret | Statut |
|---|---|---|
| admin | `SUPABASE_URL` | Déjà présent (vérifier valeur) |
| admin | `SUPABASE_SERVICE_ROLE_KEY` | Déjà présent (vérifier valeur) |
| admin | `ADMIN_EMAILS` | **À saisir :** `poodasamuelpro@gmail.com` |
| admin | `ADMIN_WEBHOOK_SECRET` | Présent — vérifier identité avec le web |
| admin | `MONMENU_BASE_URL` | Déjà présent (vérifier valeur) |
| admin | `FCM_PROJECT_ID` | **À saisir :** `monmenumanager` |
| admin | `FCM_CLIENT_EMAIL` | **À saisir :** `firebase-adminsdk-fbsvc@monmenumanager.iam.gserviceaccount.com` |
| admin | `FCM_PRIVATE_KEY` | **À saisir :** champ `private_key` du service account JSON |
| admin | `BREVO_API_KEY` | **À saisir :** votre clé SMTP v3 Brevo |
| admin | `GEMINI_API_KEY` | À saisir (Google AI Studio) |
| web | `ADMIN_WEBHOOK_SECRET` | **Vérifier : même valeur que l'admin** |
| web | `ADMIN_TASK_SECRET` | À saisir (optionnel — bouton relance screenshots) |
| web | `BREVO_API_KEY_1` | **À saisir :** même clé SMTP v3 Brevo |
| web | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `PUBLIC_BASE_URL` | Déjà présents (vérifier) |
| D1 (web) | `config_globale` × 3 clés | **À saisir :** INSERT section 4 |

## 7. Risques et précautions

La clé privée FCM est l'élément le plus sensible de cette configuration : elle permet d'envoyer des notifications push à tous les devices enregistrés du projet. Conservez le fichier service account dans un gestionnaire de mots de passe et ne le partagez jamais en clair. La clé Brevo permet l'envoi d'emails au nom du compte Brevo — la rotation des clés reste possible dans Brevo à tout moment. Après chaque saisie de secret, le redéploiement du Worker est automatique sur Cloudflare et les valeurs prennent effet sans attendre.
