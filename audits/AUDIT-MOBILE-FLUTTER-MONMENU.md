# Audit Mobile Flutter — MonMenu
## Rapport complet · Cahier des charges de développement mobile

**Version :** 1.0  
**Date :** 2025-07-29  
**Auditeur :** Expert Flutter / Sécurité Mobile  
**Dépôt web audité :** `https://github.com/poodasamuelpro/monmenu`  
**Dépôt mobile Flutter :** Non fourni (URL placeholder `[URL_REPO_MOBILE_FLUTTER]`)  
**Token utilisé :** `[EXPURGÉ — token GitHub non stocké dans le dépôt]`

> ⚠️ **Note importante :** L'URL du dépôt mobile Flutter n'a pas été fournie dans le prompt (l'emplacement `[URL_REPO_MOBILE_FLUTTER]` est resté vide). Cet audit couvre donc intégralement le dépôt web MonMenu et constitue le cahier des charges complet pour l'application mobile. Les conclusions sur "l'état du dépôt mobile existant" sont marquées explicitement comme nécessitant une URL valide pour compléter l'audit.

---

## Table des matières

1. [Résumé exécutif et recommandation](#1-résumé-exécutif-et-recommandation)
2. [Audit de sécurité mobile détaillé](#2-audit-de-sécurité-mobile-détaillé)
3. [Audit des API web consommables par le mobile](#3-audit-des-api-web-consommables-par-le-mobile)
4. [Cahier des charges fonctionnel de l'application mobile](#4-cahier-des-charges-fonctionnel-de-lapplication-mobile)
5. [Spécification des notifications push et in-app](#5-spécification-des-notifications-push-et-in-app)
6. [Adaptation aux forfaits et au statut de paiement](#6-adaptation-aux-forfaits-et-au-statut-de-paiement)
7. [Documentation du design system](#7-documentation-du-design-system)
8. [Audit de performance](#8-audit-de-performance)
9. [Fichiers à créer ou modifier par dépôt](#9-fichiers-à-créer-ou-modifier-par-dépôt)
10. [Risques de sécurité identifiés et mesures de mitigation](#10-risques-de-sécurité-identifiés-et-mesures-de-mitigation)
11. [Recommandations priorisées](#11-recommandations-priorisées)

---

## 1. Résumé exécutif et recommandation

### 1.1 Contexte technique du projet web audité

Le dépôt web MonMenu est une application **Cloudflare Workers** (runtime edge) basée sur :
- **Backend :** Hono.js (TypeScript) — API REST structurée, robuste
- **Base de données applicative :** Supabase/PostgreSQL (tenants, commandes, menu, livreurs)
- **Base de données site web :** Cloudflare D1 (plans, pays, config_globale)
- **Stockage fichiers :** Cloudflare R2 (logos, bannières, produits)
- **Cache distribué :** Cloudflare KV
- **Authentification :** Supabase Auth (JWT, cookies httpOnly)

### 1.2 État du dépôt web

| Critère | Évaluation |
|---|---|
| Architecture API | ✅ Excellente — REST bien structurée, multi-tenant sécurisé |
| Sécurité (rate limiting, CSRF, headers) | ✅ Bonne — plusieurs couches de protection |
| Schéma base de données | ✅ Complet — 15+ tables, migrations ordonnées |
| Compatibilité client mobile | ✅ Conçue pour (Bearer token explicitement documenté) |
| Logique forfaits/paiement | ✅ Présente côté web, à reproduire fidèlement côté mobile |
| Temps réel commandes | ⚠️ Supabase Realtime disponible (anon key injectée en page), mais non exposé via API dédiée mobile |
| Notifications push | ❌ Absentes — uniquement WhatsApp et email actuellement |
| Endpoint stats journalières | ⚠️ Partiellement disponible (GET /stats-journalieres) |

### 1.3 Recommandation principale

> **✅ RECOMMANDATION : POURSUIVRE le développement de l'application mobile**, sous réserve des conditions suivantes :

**Arguments EN FAVEUR :**
1. **API backend complète et sécurisée** — toutes les routes dashboard sont prêtes pour un client mobile Bearer token, sans modification nécessaire côté backend.
2. **Supabase Realtime disponible** — la synchronisation temps réel commandes/menu est architecturalement possible sans nouveau backend.
3. **Logique multi-tenant solide** — chaque restaurant est isolé, la sécurité est vérifiée à chaque appel.
4. **Double authentification (cookie + Bearer)** — le backend est explicitement conçu pour servir des clients mobiles (Bearer token, rétrocompatibilité documentée dans le code).

**Conditions à respecter :**
1. ⚠️ **Ne PAS dupliquer la logique métier forfaits/paiement** — la consommer depuis l'API web uniquement.
2. ⚠️ **Implémenter le stockage sécurisé des tokens** (flutter_secure_storage, jamais SharedPreferences plain text).
3. ⚠️ **Implémenter Firebase Cloud Messaging** pour les notifications push (absent côté web actuellement).
4. ⚠️ **Reproduire le design fidèlement** sans dériver (voir section 7).
5. ⚠️ **Fournir l'URL du dépôt mobile** pour compléter l'audit du code Flutter existant.

---

## 2. Audit de sécurité mobile détaillé

> **Note :** En l'absence du dépôt mobile Flutter, cette section spécifie les exigences de sécurité obligatoires à vérifier/implémenter, déduites de l'analyse du backend web.

### 2.1 Authentification et stockage des tokens

#### 2.1.1 Ce que le backend attend

Le backend web accepte deux modes d'authentification (code `src/middleware/auth.ts`) :
```
1. Cookie httpOnly "sb-access-token" → flux navigateur
2. Header "Authorization: Bearer <token>" → clients API / app mobile
```

L'application mobile **doit utiliser le mode Bearer token exclusivement** (pas de cookies httpOnly en Flutter natif).

#### 2.1.2 Exigences de sécurité pour le stockage des tokens

| Élément | Exigence | Implémentation Flutter recommandée |
|---|---|---|
| Access token Supabase | Stockage chiffré obligatoire | `flutter_secure_storage` (AES-256 Android Keystore / iOS Keychain) |
| Refresh token Supabase | Stockage chiffré obligatoire | `flutter_secure_storage` |
| Durée access token | 1 heure (imposée par Supabase) | Implémenter auto-refresh avant expiration |
| Durée refresh token | 30 jours | Stocker, utiliser `POST /api/v1/auth/refresh` |
| Déconnexion | Effacer les deux tokens | `flutter_secure_storage.deleteAll()` + appel `POST /api/v1/auth/logout` |

#### 2.1.3 Risques à éviter absolument

```dart
// ❌ INTERDIT — tokens en clair
SharedPreferences prefs = await SharedPreferences.getInstance();
prefs.setString('access_token', token); // Lisible par toute app sur Android non chiffré

// ❌ INTERDIT — hardcoder des secrets
const String SUPABASE_URL = 'https://xxx.supabase.co'; // Visible dans APK décompilé
const String SERVICE_ROLE_KEY = 'eyJhb...'; // CATASTROPHIQUE

// ✅ CORRECT
final storage = FlutterSecureStorage();
await storage.write(key: 'access_token', value: token);

// ✅ CORRECT — variables d'environnement build-time
const String supabaseUrl = String.fromEnvironment('SUPABASE_URL');
```

#### 2.1.4 Cycle de vie de session — diagramme

```
Connexion → Access Token (1h) + Refresh Token (30j)
    ↓
Requête API → [Access token valide ?]
    → OUI : requête normalement
    → NON (401) : POST /api/v1/auth/refresh avec refresh_token
        → Nouveau access token → relancer la requête
        → 401 sur refresh → déconnecter, rediriger vers login
```

### 2.2 Sécurisation des appels API

#### 2.2.1 Transport (HTTPS)

- **Toutes les URLs** du backend Cloudflare Workers sont en HTTPS par défaut.
- Flutter doit bloquer les connexions HTTP non sécurisées :

```dart
// android/app/src/main/res/xml/network_security_config.xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system"/>
        </trust-anchors>
    </base-config>
</network-security-config>
```

#### 2.2.2 Headers obligatoires pour les requêtes mobiles

```dart
// Chaque requête authentifiée doit inclure :
headers: {
  'Authorization': 'Bearer $accessToken',
  'Content-Type': 'application/json',
  // X-Requested-With requis pour les opérations d'écriture
  // (POST/PATCH/DELETE), car le middleware CSRF le vérifie
  // SAUF si le Bearer token est présent (ce qui est notre cas).
  // → Le Bearer token EXEMPTE du CSRF (confirmé dans api-dashboard.ts ligne 40)
}
```

**Note critique (CSRF) :** Le backend vérifie `X-Requested-With: XMLHttpRequest` sur les opérations d'écriture, **mais uniquement si le Bearer token est absent**. Le client mobile avec Bearer token est donc exempté du CSRF — comportement documenté dans le code source.

#### 2.2.3 Gestion des erreurs API

```dart
// Pattern obligatoire pour chaque appel API
Future<T> apiCall<T>(Future<http.Response> Function() request) async {
  try {
    final response = await request();
    switch (response.statusCode) {
      case 200: case 201: return parseResponse(response);
      case 401: await _handleUnauthorized(); rethrow;
      case 403: throw ForbiddenException(response.body);
      case 422: throw ValidationException(response.body);
      case 429: throw RateLimitException(response.body);
      default: throw ApiException('Erreur serveur: ${response.statusCode}');
    }
  } on SocketException {
    throw NetworkException('Pas de connexion réseau');
  }
}
```

### 2.3 Stockage local

#### 2.3.1 Données sensibles

| Donnée | Stockage autorisé | Stockage interdit |
|---|---|---|
| Tokens Supabase | `flutter_secure_storage` uniquement | SharedPreferences, fichiers, Hive non chiffré |
| Email utilisateur | SharedPreferences (OK, non sensible) | — |
| Données commandes (cache) | Hive avec chiffrement | SQLite non chiffré |
| Clés API/URLs backend | `--dart-define` (build time) | Code source, assets |

#### 2.3.2 Recommandation stockage local

```yaml
# pubspec.yaml
dependencies:
  flutter_secure_storage: ^9.2.4  # Tokens JWT
  hive: ^2.2.3                    # Cache données (commandes, menu)
  hive_flutter: ^1.1.0            # Intégration Flutter
```

### 2.4 Absence de secrets dans le code source

**Vérification obligatoire sur le dépôt mobile :**

```bash
# Rechercher des secrets potentiels
grep -r "eyJhbG" lib/          # JWT hardcodés
grep -r "supabase\.co" lib/    # URLs Supabase
grep -r "service_role" lib/    # Clés admin (CATASTROPHIQUE si présentes)
grep -r "SUPABASE_KEY" lib/    # Variables d'environnement
```

**Architecture recommandée pour les URLs/clés :**
```dart
// lib/config/app_config.dart
class AppConfig {
  static const String supabaseUrl = 
    String.fromEnvironment('SUPABASE_URL', defaultValue: '');
  static const String supabaseAnonKey = 
    String.fromEnvironment('SUPABASE_ANON_KEY', defaultValue: '');
  static const String apiBaseUrl = 
    String.fromEnvironment('API_BASE_URL', defaultValue: 'https://monmenu.app');
}
```

```bash
# Commande de build sécurisée
flutter build apk --release \
  --dart-define=SUPABASE_URL=https://xxx.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=eyJhbGci... \
  --dart-define=API_BASE_URL=https://monmenu.app
```

---

## 3. Audit des API web consommables par le mobile

### 3.1 Inventaire complet des endpoints existants

#### 3.1.1 Authentification — `POST /api/v1/auth/*`

| Endpoint | Méthode | Auth requise | Compatible mobile | Notes |
|---|---|---|---|---|
| `/api/v1/auth/login` | POST | Non | ✅ Oui | Renvoie access_token + refresh_token en JSON |
| `/api/v1/auth/register` | POST | Non | ✅ Oui | Crée compte + tenant, renvoie tokens si session immédiate |
| `/api/v1/auth/logout` | POST | Bearer/Cookie | ✅ Oui | Exempté du CSRF avec Bearer token |
| `/api/v1/auth/refresh` | POST | Bearer/Cookie | ✅ Oui | Body JSON `{refresh_token}` accepté |
| `/api/v1/auth/forgot-password` | POST | Non | ✅ Oui | Envoie OTP 6 chiffres par email |
| `/api/v1/auth/verify-otp` | POST | Non | ✅ Oui | Renvoie session si OTP valide |
| `/api/v1/auth/reset-password` | POST | Bearer | ✅ Oui | Accepte Bearer token du verify-otp |

**Corps de réponse login (exemple) :**
```json
{
  "success": true,
  "access_token": "eyJhbG...",
  "refresh_token": "...",
  "tenant": {
    "id": "uuid",
    "nom": "Restaurant Alpha",
    "slug": "restaurant-alpha",
    "statut": "actif",
    "couleur_primaire": "#DC2626"
  }
}
```

#### 3.1.2 Dashboard restaurant — `GET|POST|PATCH|DELETE /api/v1/dashboard/*`

| Endpoint | Méthode | Description | Mobile |
|---|---|---|---|
| `/api/v1/dashboard/commandes` | GET | Liste commandes (pagination, filtre statut) | ✅ |
| `/api/v1/dashboard/commandes/:id/statut` | PATCH | Changer statut commande | ✅ |
| `/api/v1/dashboard/commandes/export-csv` | GET | Export CSV (non pertinent mobile) | ⚠️ |
| `/api/v1/dashboard/stats` | GET | Stats globales + graphe 30j | ✅ |
| `/api/v1/dashboard/stats-journalieres` | GET | Stats par jour (N derniers) | ✅ |
| `/api/v1/dashboard/menu` | GET | Menu complet (catégories + produits) | ✅ |
| `/api/v1/dashboard/categories` | POST | Créer catégorie | ✅ |
| `/api/v1/dashboard/categories/:id` | PATCH | Modifier catégorie | ✅ |
| `/api/v1/dashboard/categories/:id` | DELETE | Supprimer catégorie | ✅ |
| `/api/v1/dashboard/produits` | POST | Créer produit | ✅ |
| `/api/v1/dashboard/produits/:id` | PATCH | Modifier produit (dispo, prix, photo) | ✅ |
| `/api/v1/dashboard/produits/:id` | DELETE | Suppression douce produit | ✅ |
| `/api/v1/dashboard/livreurs` | GET | Liste livreurs | ✅ |
| `/api/v1/dashboard/livreurs` | POST | Créer livreur | ✅ |
| `/api/v1/dashboard/livreurs/:id` | DELETE | Supprimer livreur | ✅ |
| `/api/v1/dashboard/livreurs/:id` | PATCH | Activer/désactiver livreur | ✅ |
| `/api/v1/dashboard/pdv` | GET | Infos point de vente | ✅ |
| `/api/v1/dashboard/pdv` | PATCH | Modifier PDV (adresse, horaires, tarifs) | ✅ |
| `/api/v1/dashboard/apparence` | PATCH | Modifier couleurs, logo, bannière | ✅ |
| `/api/v1/dashboard/parametres` | PATCH | Modifier nom, WhatsApp, domaine | ✅ |
| `/api/v1/dashboard/profil` | GET | Profil complet + plan + PDV | ✅ |
| `/api/v1/dashboard/profil/change-password` | POST | Changer mot de passe | ✅ |
| `/api/v1/dashboard/codes-promo` | GET | Liste codes promo | ✅ |
| `/api/v1/dashboard/codes-promo` | POST | Créer code promo | ✅ |
| `/api/v1/dashboard/codes-promo/generate` | POST | Générer code automatique | ✅ |
| `/api/v1/dashboard/codes-promo/:id` | DELETE | Supprimer code promo | ✅ |
| `/api/v1/dashboard/upload-image` | POST | Upload image vers R2 | ✅ (multipart) |
| `/api/v1/dashboard/media/:key` | GET | Servir image depuis R2 | ✅ |
| `/api/v1/dashboard/qrcode` | GET | URLs QR code boutique | ✅ |
| `/api/v1/dashboard/setup-restaurant` | POST | Onboarding initial (multipart) | ✅ |

#### 3.1.3 Plans/Forfaits — `GET /api/v1/plans/*`

| Endpoint | Méthode | Description | Mobile |
|---|---|---|---|
| `/api/v1/plans` | GET | Liste plans actifs (avec conversion devise) | ✅ |

#### 3.1.4 Tenants/Boutique publique — `GET /api/v1/tenants/*`

| Endpoint | Méthode | Description | Mobile |
|---|---|---|---|
| `/api/v1/tenants` | GET | Liste publique restaurants | ✅ |
| `/api/v1/tenants/:slug` | GET | Infos boutique publique | ✅ |
| `/api/v1/tenants/:slug/menu` | GET | Menu public complet | ✅ |
| `/api/v1/tenants/:slug/qrcode` | GET | Info QR code public | ✅ |

### 3.2 Endpoints manquants à créer côté web pour le mobile

| Endpoint à créer | Priorité | Justification |
|---|---|---|
| `GET /api/v1/dashboard/commandes/:id` | 🔴 Haute | Détail complet d'une commande — absent, le mobile doit retrouver la commande dans la liste paginée |
| `POST /api/v1/dashboard/fcm-token` | 🔴 Haute | Enregistrer le FCM token push de l'appareil mobile |
| `DELETE /api/v1/dashboard/fcm-token` | 🔴 Haute | Désabonner à la déconnexion |
| `GET /api/v1/dashboard/notifications` | 🟡 Moyenne | Historique des notifications in-app |
| `PATCH /api/v1/dashboard/notifications/:id/read` | 🟡 Moyenne | Marquer notification comme lue |
| `GET /api/v1/dashboard/commandes/count-pending` | 🟡 Moyenne | Badge notifications (nb commandes en attente) |
| `GET /api/v1/dashboard/abonnement` | 🟡 Moyenne | Détail abonnement en cours + date d'expiration |
| `POST /api/v1/dashboard/produits/:id/disponible` | 🟢 Basse | Basculer disponibilité rapidement (UI mobile) |

### 3.3 Compatibilité mobile des réponses existantes

#### 3.3.1 Points positifs confirmés

- ✅ **Tokens renvoyés en JSON** sur login/register/refresh (corps JSON, pas seulement cookies).
- ✅ **Bearer token exempté du CSRF** sur toutes les routes d'écriture (code confirmé).
- ✅ **Pas de dépendance à session navigateur** — aucun usage de cookie impératif côté mobile.
- ✅ **Pagination sur `/commandes`** — `page`, `limit`, `total` disponibles.
- ✅ **Filtre par statut** — `?statut=en_attente` disponible.
- ✅ **URLs médias R2** — accessibles depuis mobile via `GET /api/v1/dashboard/media/:key`.

#### 3.3.2 Points à adapter

- ⚠️ **Endpoint commandes** — Pas de route `GET /api/v1/dashboard/commandes/:id` pour récupérer une seule commande. À créer (voir 3.2).
- ⚠️ **Upload image** — Format `multipart/form-data` (non JSON) — à tester sur Flutter avec `http.MultipartRequest` ou `dio`.
- ⚠️ **Stats journalières** — Utilise une table `stats_journalieres` alimentée par un cron nocturne. Le mobile ne verra pas les stats du jour courant dans cet endpoint ; utiliser `GET /api/v1/dashboard/stats` pour les données temps réel du jour.

### 3.4 Supabase Realtime pour la synchronisation en temps réel

Le dashboard web injecte `window.__SUPABASE_URL__` et `window.__SUPABASE_ANON_KEY__` (clé `anon` uniquement, jamais `service_role`) pour activer Supabase Realtime dans le navigateur.

**Implémentation mobile recommandée :**

```dart
// lib/services/realtime_service.dart
import 'package:supabase_flutter/supabase_flutter.dart';

class RealtimeService {
  late RealtimeChannel _commandesChannel;
  
  void subscribeToCommandes(String tenantId, Function(Map<String, dynamic>) onNewCommande) {
    _commandesChannel = Supabase.instance.client
      .channel('commandes:$tenantId')
      .onPostgresChanges(
        event: PostgresChangeEvent.insert,
        schema: 'public',
        table: 'commandes',
        filter: PostgresChangeFilter(
          type: FilterType.eq,
          column: 'tenant_id',
          value: tenantId,
        ),
        callback: (payload) {
          onNewCommande(payload.newRecord);
        },
      )
      .subscribe();
  }
  
  void unsubscribe() {
    Supabase.instance.client.removeChannel(_commandesChannel);
  }
}
```

**ATTENTION :** Utiliser exclusivement la clé `anon` pour Supabase Realtime côté mobile. Les RLS (Row Level Security) de Supabase protègent les données selon le tenant.

---

## 4. Cahier des charges fonctionnel de l'application mobile

### 4.1 Périmètre de l'application

L'application mobile est **réservée aux gérants/propriétaires de restaurants** uniquement (pas aux clients finaux).

### 4.2 Écrans et fonctionnalités

#### 4.2.1 Authentification (Écrans 1-4)

**Écran 1 — Connexion**
- Champs : Email, Mot de passe
- Bouton "Se connecter"
- Lien "Mot de passe oublié ?"
- Lien "Créer un compte"
- Appel : `POST /api/v1/auth/login`
- En cas de succès : stocker tokens dans `flutter_secure_storage`, naviguer vers Dashboard

**Écran 2 — Inscription restaurant**
- Champs : Email, Mot de passe (≥8 car), Nom du restaurant, Nom du gérant, Numéro WhatsApp
- Validation temps réel (format email, longueur mdp, format tel)
- Appel : `POST /api/v1/auth/register`
- En cas de succès : naviguer vers Dashboard ou page de bienvenue

**Écran 3 — Mot de passe oublié**
- Étape 1 : Saisie email → `POST /api/v1/auth/forgot-password`
- Étape 2 : Saisie OTP 6 chiffres reçu par email → `POST /api/v1/auth/verify-otp`
- Étape 3 : Nouveau mot de passe (≥8 car) → `POST /api/v1/auth/reset-password` (Bearer token du verify-otp)

**Écran 4 — Onboarding initial (si nouveau compte)**
- Optionnel : Nom du restaurant, Adresse, Logo (upload), Bannière, Couleur primaire, Horaires
- Appel : `POST /api/v1/dashboard/setup-restaurant` (multipart/form-data)

#### 4.2.2 Dashboard principal (Écran 5)

**Affiche (appel parallèle) :**
- Nombre de commandes en attente (badge rouge)
- CA du jour (`stats.ca_today`)
- CA du mois (`stats.ca_month`)
- Nombre de commandes du jour (`stats.today`)
- Graphe mini 7 jours (commandes)
- Lien rapide vers "Commandes en attente"
- Indicateur statut du compte (essai, actif, inactif)

**Appels :** `GET /api/v1/dashboard/stats` + `GET /api/v1/dashboard/profil`

#### 4.2.3 Commandes (Écran 6-7)

**Liste des commandes (Écran 6)**
- Onglets par statut : En attente | Confirmée | En préparation | En livraison | Livrée | Annulée
- Chaque commande affiche : Nom client, Montant, Heure, Statut (badge coloré)
- Pagination infinie (scroll)
- **Rafraîchissement temps réel** via Supabase Realtime (nouvelles commandes)
- Badge sonore/vibration sur nouvelle commande en attente
- Pull-to-refresh
- Appel : `GET /api/v1/dashboard/commandes?statut=X&page=Y`

**Détail commande (Écran 7)**
- Nom client, Téléphone, Adresse de livraison
- Liste des articles (nom, quantité, prix unitaire, sous-total)
- Montant total, Frais livraison, Mode de paiement
- Historique des changements de statut
- **Actions rapides** selon statut actuel :
  - `en_attente` → Confirmer | Annuler
  - `confirmee` → Mettre en préparation
  - `en_preparation` → En livraison (avec sélection livreur si disponible)
  - `en_livraison` → Marquer livré
- Appel : `PATCH /api/v1/dashboard/commandes/:id/statut`

#### 4.2.4 Menu (Écran 8-11)

**Écran Menu principal (Écran 8)**
- Liste des catégories avec nombre de produits
- Bouton "Ajouter catégorie"
- Tap sur catégorie → liste produits
- Appel : `GET /api/v1/dashboard/menu`

**Gestion produits par catégorie (Écran 9)**
- Liste produits avec photo, nom, prix, disponibilité (switch)
- Bouton "Ajouter produit"
- Swipe-to-delete (confirmation)
- Switch disponibilité : `PATCH /api/v1/dashboard/produits/:id` `{disponible: bool}`

**Création/Modification produit (Écran 10)**
- Nom, Description, Prix, Photo (upload depuis galerie/appareil)
- Sélecteur de catégorie
- Switch disponibilité
- Upload image : `POST /api/v1/dashboard/upload-image` (multipart)
- Appels : `POST /api/v1/dashboard/produits` ou `PATCH /api/v1/dashboard/produits/:id`

**Création catégorie (Écran 11 — modal/bottom sheet)**
- Champs : Nom, Description (optionnel)
- Appel : `POST /api/v1/dashboard/categories`

#### 4.2.5 Mon Restaurant (Écran 12-13)

**Infos restaurant (Écran 12)**
- Nom, Adresse, Numéro WhatsApp, Horaires d'ouverture
- Tarif livraison de base + tarif par km
- Bouton géolocalisation
- Appel GET : `GET /api/v1/dashboard/pdv`
- Appel PATCH : `PATCH /api/v1/dashboard/pdv`

**Apparence (Écran 13)**
- Upload logo (avec prévisualisation)
- Upload bannière
- Color picker couleur primaire
- Color picker couleur secondaire
- Appel : `PATCH /api/v1/dashboard/apparence`

#### 4.2.6 Statistiques (Écran 14)

- CA du jour / du mois
- Taux de livraison / annulation
- Graphe barres ou lignes (30 derniers jours — commandes et CA)
- Top produits du mois
- Appel : `GET /api/v1/dashboard/stats`

#### 4.2.7 Paramètres (Écran 15)

- Modifier nom du restaurant
- Modifier numéro WhatsApp
- Modifier domaine personnalisé (si plan Mogho)
- Changer mot de passe
- Informations forfait actuel (nom, fonctionnalités, date expiration)
- Déconnexion
- Appels : `GET /api/v1/dashboard/profil`, `PATCH /api/v1/dashboard/parametres`, `POST /api/v1/dashboard/profil/change-password`, `POST /api/v1/auth/logout`

#### 4.2.8 Livreurs (Écran 16 — selon forfait)

- Liste des livreurs actifs/inactifs
- Ajouter livreur (nom + WhatsApp)
- Activer/désactiver livreur
- Supprimer livreur
- Appels : `GET/POST/PATCH/DELETE /api/v1/dashboard/livreurs`
- **Condition d'accès :** Vérifier `plan_features.livreurs === true`

#### 4.2.9 Codes promo (Écran 17 — selon forfait)

- Liste des codes promo avec statut (actif/expiré/épuisé)
- Créer code (type, valeur, limite usage, expiration)
- Générer code automatique
- Supprimer code
- Appels : `GET/POST/DELETE /api/v1/dashboard/codes-promo`
- **Condition d'accès :** Vérifier `plan_features.codes_promo === true`

#### 4.2.10 QR Code (Écran 18)

- Affichage du QR code boutique (URL API QR server)
- Bouton partager (native share Flutter)
- Lien boutique
- Appel : `GET /api/v1/dashboard/qrcode`

### 4.3 Navigation recommandée

```
Bottom Navigation Bar (5 onglets) :
  📊 Dashboard     → Écran 5
  📋 Commandes     → Écran 6
  🍽️ Menu         → Écran 8
  🏪 Restaurant    → Écran 12
  ⚙️ Paramètres   → Écran 15

Routes supplémentaires (push) :
  Détail commande         → Écran 7
  Détail menu catégorie   → Écran 9
  Créer/modifier produit  → Écran 10
  Créer catégorie         → Écran 11 (bottom sheet)
  Apparence               → Écran 13
  Statistiques            → Écran 14
  Livreurs                → Écran 16
  Codes promo             → Écran 17
  QR Code                 → Écran 18
  Connexion               → Écran 1
  Inscription             → Écran 2
  Mot de passe oublié     → Écran 3
  Onboarding              → Écran 4
```

### 4.4 Synchronisation temps réel

#### 4.4.1 Architecture recommandée

| Mécanisme | Données | Fréquence |
|---|---|---|
| Supabase Realtime | Nouvelles commandes | Temps réel (WebSocket) |
| Pull-to-refresh | Liste commandes | Sur action utilisateur |
| Polling léger (30s) | Statut commandes actives | Fond d'écran commandes |
| Sur action | Menu, profil, stats | À chaque ouverture d'écran |

#### 4.4.2 Cas d'usage Realtime

**Nouvelle commande reçue :**
1. Supabase Realtime envoie événement `INSERT` sur `commandes`
2. Flutter affiche une notification in-app (SnackBar ou dialog)
3. Vibration + son (si permissions accordées)
4. Le badge du tab Commandes s'incrémente
5. Si FCM configuré : notification push même app fermée

---

## 5. Spécification des notifications push et in-app

### 5.1 Architecture recommandée

```
Restaurant Mobile (Flutter)
        ↓ s'enregistre
Firebase Cloud Messaging (FCM) → Token FCM
        ↓ stocké dans Supabase
Backend Web (Cloudflare Workers)
        ↓ envoie via FCM HTTP v1 API
Restaurant Mobile (Flutter) ← Notification push
```

### 5.2 Notifications push (Firebase Cloud Messaging)

#### 5.2.1 Côté mobile Flutter — setup requis

```yaml
# pubspec.yaml
dependencies:
  firebase_core: ^3.6.0
  firebase_messaging: ^15.1.3
```

```dart
// lib/services/push_notification_service.dart
class PushNotificationService {
  static Future<void> initialize() async {
    await Firebase.initializeApp();
    final messaging = FirebaseMessaging.instance;
    
    // Demander les permissions
    await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    
    // Récupérer le token FCM
    final fcmToken = await messaging.getToken();
    if (fcmToken != null) {
      await _registerTokenOnBackend(fcmToken);
    }
    
    // Écouter les messages en foreground
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
    
    // Écouter les taps sur notifications (app en arrière-plan)
    FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);
  }
  
  static Future<void> _registerTokenOnBackend(String token) async {
    // Appel POST /api/v1/dashboard/fcm-token (endpoint à créer)
    await ApiService.post('/api/v1/dashboard/fcm-token', {'token': token});
  }
}
```

#### 5.2.2 Côté web backend — endpoints à créer

**Table Supabase à ajouter :**
```sql
CREATE TABLE fcm_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  auth_user_id UUID NOT NULL,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fcm_tokens_tenant ON fcm_tokens(tenant_id);
```

**Endpoint à créer :** `POST /api/v1/dashboard/fcm-token`
```typescript
dashboardRouter.post('/fcm-token', async (c) => {
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)
  
  const { token, platform } = await c.req.json()
  
  await supabase.from('fcm_tokens').upsert({
    tenant_id: auth.tenant_id,
    auth_user_id: auth.user_id,
    token,
    platform: platform ?? 'android',
    updated_at: new Date().toISOString()
  }, { onConflict: 'token' })
  
  return c.json({ success: true })
})
```

**Déclenchement de notification (quand une commande arrive) :**
```typescript
// Dans api-commandes.ts — après création commande réussie
// Récupérer les FCM tokens du tenant et envoyer via FCM HTTP v1
async function notifierRestaurant(tenantId: string, commande: any, env: Env) {
  const { data: tokens } = await adminClient
    .from('fcm_tokens')
    .select('token')
    .eq('tenant_id', tenantId)
  
  if (!tokens?.length) return
  
  const fcmPayload = {
    notification: {
      title: '🛎️ Nouvelle commande !',
      body: `${commande.client_nom} — ${commande.montant_total} FCFA`
    },
    data: {
      commande_id: commande.id,
      type: 'nouvelle_commande'
    }
  }
  
  // Envoyer à chaque token via FCM HTTP v1 API
  for (const { token } of tokens) {
    await sendFCMNotification(token, fcmPayload, env.FCM_SERVER_KEY)
  }
}
```

### 5.3 Notifications in-app

#### 5.3.1 Types de notifications in-app

| Type | Déclencheur | Affichage |
|---|---|---|
| Nouvelle commande | Supabase Realtime insert | Banner coloré + son + vibration |
| Changement statut commande | Supabase Realtime update | Toast discret |
| Essai expirant bientôt | Vérifié au démarrage (profil) | Banner persistant |
| Compte inactif | Réponse 403 sur login | Écran bloquant avec CTA |
| Erreur réseau | Exception réseau | SnackBar rouge |

#### 5.3.2 Implémentation Flutter

```dart
// lib/widgets/notification_banner.dart
class NewOrderBanner extends StatelessWidget {
  final Map<String, dynamic> commande;
  
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Color(0xFFDC2626), // rouge MonMenu
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(Icons.receipt, color: Colors.white),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Nouvelle commande !', 
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                Text('${commande['client_nom']} — ${commande['montant_total']} FCFA',
                  style: TextStyle(color: Colors.white70)),
              ],
            ),
          ),
          TextButton(
            onPressed: () => context.push('/commandes/${commande['id']}'),
            child: Text('Voir', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }
}
```

---

## 6. Adaptation aux forfaits et au statut de paiement

### 6.1 Modèle de données forfaits (extrait du schéma web)

**Plans disponibles (depuis `/api/v1/plans`) :**

| Plan | Prix mensuel | Commandes incluses | Fonctionnalités clés |
|---|---|---|---|
| Gratuit | 0 FCFA | 30 | boutique, WhatsApp, QR, stats basiques |
| Starter | 9 500 FCFA | 200 | + support email, livreurs |
| Pro | 19 500 FCFA | 1 000 | + codes promo, export CSV, domaine perso |
| Premium | 39 500 FCFA | 5 000 | + API access, webhooks, support prioritaire |
| Mogho | Non documenté | ? | + domaine personnalisé avancé |

### 6.2 Statuts de compte tenant

| Statut | Signification | Accès dashboard |
|---|---|---|
| `essai` | Période d'essai (14 jours, cf. `ESSAI_DUREE_JOURS`) | ✅ Oui |
| `actif` | Abonnement payé à jour | ✅ Oui |
| `inactif` | Essai expiré ou paiement non renouvelé | ❌ Non (bloqué API) |
| `suspendu` | Suspendu par l'admin | ❌ Non (bloqué dès login) |

**Vérification backend (API dashboard)** — code confirmé dans `api-dashboard.ts` :
```typescript
// Le backend bloque explicitement inactif + suspendu
.in('tenants.statut', ['actif', 'essai'])
```

### 6.3 Implémentation mobile de la gestion des forfaits

#### 6.3.1 Récupération du profil avec plan

```dart
// lib/models/profil_model.dart
class ProfilRestaurant {
  final String id;
  final String nom;
  final String statut; // essai, actif, inactif, suspendu
  final String? planNom;
  final Map<String, dynamic>? planFeatures;
  final int? commandesIncluses;
  final double? prixMensuel;
  
  bool get peutUtiliserLivreurs => 
    planFeatures?['livreurs'] == true;
  
  bool get peutUtiliserCodesPromo => 
    planFeatures?['codes_promo'] == true;
  
  bool get peutExporterCsv => 
    planFeatures?['export_csv'] == true;
  
  bool get peutUtiliserDomainPerso =>
    planFeatures?['domaine_perso'] == true;
  
  bool get estEnEssai => statut == 'essai';
  bool get estActif => statut == 'actif';
  bool get estBloque => statut == 'inactif' || statut == 'suspendu';
}
```

#### 6.3.2 Gestion des cas de blocage côté mobile

```dart
// lib/services/auth_service.dart
class AuthService {
  Future<void> checkAccountStatus() async {
    final profil = await apiService.getProfil();
    
    if (profil.statut == 'suspendu') {
      // Déconnecter et afficher écran bloquant
      await logout();
      navigatorKey.currentState?.pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => CompteBloquePage(
          message: 'Votre compte est suspendu. Contactez le support.',
          showContactButton: true,
        )),
        (route) => false,
      );
      return;
    }
    
    if (profil.statut == 'inactif') {
      // Afficher écran de renouvellement
      navigatorKey.currentState?.pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => CompteInactifPage(
          dateExpiration: profil.essaiExpireLe,
        )),
        (route) => false,
      );
      return;
    }
    
    if (profil.estEnEssai) {
      // Afficher banner non-bloquant "X jours d'essai restants"
      final joursRestants = _calculerJoursRestants(profil.essaiExpireLe);
      if (joursRestants <= 3) {
        showEssaiExpirationBanner(joursRestants);
      }
    }
  }
}
```

#### 6.3.3 Masquage des fonctionnalités selon forfait

```dart
// Exemple d'utilisation dans la navigation
Widget _buildNavigation(ProfilRestaurant profil) {
  return Scaffold(
    bottomNavigationBar: BottomNavigationBar(
      items: [
        BottomNavigationBarItem(icon: Icon(Icons.dashboard), label: 'Dashboard'),
        BottomNavigationBarItem(icon: Icon(Icons.receipt), label: 'Commandes'),
        BottomNavigationBarItem(icon: Icon(Icons.restaurant_menu), label: 'Menu'),
        BottomNavigationBarItem(icon: Icon(Icons.store), label: 'Restaurant'),
        BottomNavigationBarItem(icon: Icon(Icons.settings), label: 'Paramètres'),
      ],
    ),
    // Dans le menu paramètres — items conditionnels :
    // Livreurs : visible si profil.peutUtiliserLivreurs
    // Codes promo : visible si profil.peutUtiliserCodesPromo
  );
}

// Widget conditionnel de feature
Widget featureWidget({
  required bool available,
  required Widget child,
  required String featureName,
  required String requiredPlan,
}) {
  if (available) return child;
  return Opacity(
    opacity: 0.5,
    child: Stack(
      children: [
        child,
        Positioned.fill(
          child: GestureDetector(
            onTap: () => showUpgradeDialog(featureName, requiredPlan),
            child: Container(color: Colors.transparent),
          ),
        ),
      ],
    ),
  );
}
```

### 6.4 Règle impérative — NE PAS dupliquer la logique métier

> **Règle absolue :** L'application mobile ne doit **jamais** implémenter sa propre logique de forfait, de quota de commandes, ou de vérification de statut. Ces vérifications doivent être faites **côté backend web uniquement**.

**Ce que l'API fait déjà (et que le mobile ne doit pas refaire) :**
- Vérification statut `actif`/`essai` à chaque requête dashboard
- Vérification `plan_id` pour les fonctionnalités premium (ex: domaine perso)
- Comptage des commandes incluses (à enrichir côté backend)
- Passage automatique `essai → inactif` (cron Cloudflare)

**Ce que le mobile doit faire :**
- Afficher les informations de forfait récupérées via `GET /api/v1/dashboard/profil`
- Masquer/désactiver les UI selon `plan_features`
- Gérer les écrans de blocage en cas de 403 (statut inactif/suspendu)
- Proposer un lien vers la page de tarification web pour upgrades

---

## 7. Documentation du design system

### 7.1 Couleurs

#### 7.1.1 Couleurs primaires de la plateforme

| Variable | Valeur Hex | Usage |
|---|---|---|
| Couleur primaire | `#DC2626` | Rouge — boutons principaux, badges, éléments actifs |
| Couleur secondaire | `#1D4ED8` | Bleu — boutons secondaires, liens |
| Couleur sidebar | `#111827` (gray-900) | Fond sidebar dashboard |
| Fond application | `#F9FAFB` (gray-50) | Fond général |
| Fond cartes | `#FFFFFF` | Cartes, modals |
| Bordures | `#F3F4F6` (gray-100) | Séparateurs, bordures légères |
| Texte principal | `#111827` (gray-900) | Titres, textes importants |
| Texte secondaire | `#6B7280` (gray-500) | Labels, descriptions |
| Texte désactivé | `#9CA3AF` (gray-400) | Éléments désactivés |

**Note :** Chaque restaurant peut avoir ses propres couleurs primaire/secondaire (champs `couleur_primaire`, `couleur_secondaire` dans `tenants`). Le dashboard mobile doit donc adapter son UI à ces couleurs personnalisées pour la page apparence et prévisualisation boutique, mais conserver les couleurs de la plateforme pour l'interface de gestion.

#### 7.1.2 Couleurs de statut commandes

| Statut | Couleur badge | Code Hex |
|---|---|---|
| `en_attente` | Jaune/Amber | `#F59E0B` |
| `confirmee` | Bleu | `#3B82F6` |
| `en_preparation` | Orange | `#F97316` |
| `en_livraison` | Violet | `#8B5CF6` |
| `livree` | Vert | `#10B981` |
| `annulee` | Gris | `#6B7280` |

#### 7.1.3 Couleurs d'état

| État | Couleur | Code Hex |
|---|---|---|
| Succès | Vert | `#10B981` |
| Erreur | Rouge | `#EF4444` |
| Avertissement | Jaune | `#F59E0B` |
| Info | Bleu | `#3B82F6` |

### 7.2 Typographie

Le dashboard web utilise **Tailwind CSS** avec la classe `font-sans` qui correspond à la stack système :
```
System-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif
```

**Équivalent Flutter recommandé :**

```dart
// lib/theme/app_theme.dart
class AppTheme {
  static TextTheme get textTheme => TextTheme(
    // Titres
    displayLarge: TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: Color(0xFF111827)),
    titleLarge: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: Color(0xFF111827)),
    titleMedium: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Color(0xFF111827)),
    // Corps
    bodyLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w400, color: Color(0xFF374151)),
    bodyMedium: TextStyle(fontSize: 14, fontWeight: FontWeight.w400, color: Color(0xFF374151)),
    bodySmall: TextStyle(fontSize: 12, fontWeight: FontWeight.w400, color: Color(0xFF6B7280)),
    // Labels
    labelLarge: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
    labelSmall: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.5),
  );
}
```

**Police recommandée :** Utiliser la police système par défaut sur chaque plateforme (Roboto sur Android, SF Pro sur iOS) — cohérent avec l'approche Tailwind `font-sans`.

Si une police custom est souhaitée : **Inter** ou **Plus Jakarta Sans** (proches de l'esthétique Tailwind/web moderne).

### 7.3 Composants UI

#### 7.3.1 Boutons

```dart
// Bouton primaire (rouge #DC2626)
ElevatedButton(
  style: ElevatedButton.styleFrom(
    backgroundColor: Color(0xFFDC2626),
    foregroundColor: Colors.white,
    padding: EdgeInsets.symmetric(horizontal: 24, vertical: 14),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    elevation: 0,
  ),
  child: Text('Confirmer', style: TextStyle(fontWeight: FontWeight.w600)),
  onPressed: () {},
)

// Bouton secondaire (bordure)
OutlinedButton(
  style: OutlinedButton.styleFrom(
    foregroundColor: Color(0xFF374151),
    side: BorderSide(color: Color(0xFFE5E7EB)),
    padding: EdgeInsets.symmetric(horizontal: 24, vertical: 14),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
  ),
  child: Text('Annuler'),
  onPressed: () {},
)
```

#### 7.3.2 Cartes

```dart
// Carte commande
Container(
  padding: EdgeInsets.all(16),
  decoration: BoxDecoration(
    color: Colors.white,
    borderRadius: BorderRadius.circular(16),
    border: Border.all(color: Color(0xFFF3F4F6)),
    boxShadow: [
      BoxShadow(
        color: Colors.black.withValues(alpha: 0.04),
        blurRadius: 8,
        offset: Offset(0, 2),
      )
    ],
  ),
  child: // contenu
)
```

#### 7.3.3 Badges de statut

```dart
// Badge statut commande
Widget buildStatutBadge(String statut) {
  final config = {
    'en_attente': {'color': Color(0xFFFFF3CD), 'textColor': Color(0xFF92400E), 'label': 'En attente'},
    'confirmee': {'color': Color(0xFFDBEAFE), 'textColor': Color(0xFF1E40AF), 'label': 'Confirmée'},
    'en_preparation': {'color': Color(0xFFFFEDD5), 'textColor': Color(0xFF9A3412), 'label': 'En préparation'},
    'en_livraison': {'color': Color(0xFFEDE9FE), 'textColor': Color(0xFF5B21B6), 'label': 'En livraison'},
    'livree': {'color': Color(0xFFD1FAE5), 'textColor': Color(0xFF065F46), 'label': 'Livrée'},
    'annulee': {'color': Color(0xFFF3F4F6), 'textColor': Color(0xFF374151), 'label': 'Annulée'},
  };
  final c = config[statut] ?? config['en_attente']!;
  return Container(
    padding: EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(
      color: c['color'] as Color,
      borderRadius: BorderRadius.circular(8),
    ),
    child: Text(c['label'] as String, 
      style: TextStyle(color: c['textColor'] as Color, fontSize: 12, fontWeight: FontWeight.w600)),
  );
}
```

#### 7.3.4 Navigation sidebar (équivalent mobile)

Le web utilise une sidebar fixe à gauche (`bg-gray-900` / `#111827`). Sur mobile, l'équivalent est une **BottomNavigationBar** avec les 5 sections principales.

```dart
// lib/theme/app_theme.dart
static BottomNavigationBarThemeData get bottomNavTheme => BottomNavigationBarThemeData(
  backgroundColor: Colors.white,
  selectedItemColor: Color(0xFFDC2626),
  unselectedItemColor: Color(0xFF9CA3AF),
  type: BottomNavigationBarType.fixed,
  elevation: 8,
);
```

#### 7.3.5 Inputs / Champs de formulaire

```dart
// Style InputDecoration uniforme
InputDecoration get inputDecoration => InputDecoration(
  filled: true,
  fillColor: Color(0xFFF9FAFB),
  border: OutlineInputBorder(
    borderRadius: BorderRadius.circular(12),
    borderSide: BorderSide(color: Color(0xFFE5E7EB)),
  ),
  focusedBorder: OutlineInputBorder(
    borderRadius: BorderRadius.circular(12),
    borderSide: BorderSide(color: Color(0xFFDC2626), width: 2),
  ),
  contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 14),
);
```

### 7.4 Icônes

Le web utilise **Font Awesome 6** (ex: `fa-solid fa-receipt`, `fa-solid fa-book-open`). Flutter doit utiliser **Material Icons** (intégré) ou **Font Awesome Flutter** :

| Web (FA) | Mobile Flutter (Material Icons) |
|---|---|
| `fa-receipt` | `Icons.receipt` |
| `fa-book-open` | `Icons.menu_book` |
| `fa-chart-bar` | `Icons.bar_chart` |
| `fa-motorcycle` | `Icons.delivery_dining` |
| `fa-qrcode` | `Icons.qr_code_2` |
| `fa-ticket` | `Icons.confirmation_number` |
| `fa-map-location-dot` | `Icons.store` |
| `fa-palette` | `Icons.palette` |
| `fa-gear` | `Icons.settings` |
| `fa-utensils` | `Icons.restaurant` |

---

## 8. Audit de performance

### 8.1 Problèmes de performance identifiés (backend web)

#### 8.1.1 Requêtes N+1 potentielles

**`GET /api/v1/dashboard/stats`** — Exécute 5 requêtes Supabase en parallèle (`Promise.all`) pour calculer les stats. C'est correct pour le web, mais le mobile doit consommer cet endpoint directement plutôt que de recalculer côté app.

**`GET /api/v1/dashboard/profil`** — Exécute 3 requêtes séquentielles (tenant, plan D1, PDV). Performant car le plan est en D1 (lecture locale Cloudflare) et le PDV est petit.

#### 8.1.2 Cache KV utilisé efficacement

- Menu par slug : `menu:{slug}` — TTL 120s ✅
- Tenant par slug : `tenant:{slug}` — TTL 300s ✅
- Plans par devise : `plans:{devise}` — TTL 600s ✅
- Invalidation sur modification : correctement implémentée ✅

### 8.2 Recommandations de performance côté mobile Flutter

#### 8.2.1 Gestion d'état

**Recommandé : Riverpod ou Provider**

```dart
// lib/providers/commandes_provider.dart
// Utiliser AsyncNotifier pour la gestion loading/error/data
class CommandesNotifier extends AsyncNotifier<List<Commande>> {
  @override
  Future<List<Commande>> build() async {
    return await ref.read(apiServiceProvider).getCommandes();
  }
  
  Future<void> changerStatut(String commandeId, String nouveauStatut) async {
    // Optimistic update
    state = AsyncData(state.value!.map((c) => 
      c.id == commandeId ? c.copyWith(statut: nouveauStatut) : c
    ).toList());
    
    try {
      await ref.read(apiServiceProvider).patchCommandeStatut(commandeId, nouveauStatut);
    } catch (e) {
      // Rollback
      ref.invalidateSelf();
    }
  }
}
```

#### 8.2.2 Chargement des images

```dart
// Utiliser cached_network_image pour les photos produits
CachedNetworkImage(
  imageUrl: produit.photoUrl ?? '',
  placeholder: (context, url) => CircularProgressIndicator(),
  errorWidget: (context, url, error) => Icon(Icons.restaurant, color: Colors.grey),
  fit: BoxFit.cover,
)
```

#### 8.2.3 Pagination liste commandes

```dart
// lib/widgets/commandes_list.dart
// Implémentation scroll infini
NotificationListener<ScrollNotification>(
  onNotification: (scroll) {
    if (scroll.metrics.pixels >= scroll.metrics.maxScrollExtent - 200) {
      ref.read(commandesProvider.notifier).loadMore();
    }
    return false;
  },
  child: ListView.builder(
    itemCount: commandes.length + (isLoading ? 1 : 0),
    itemBuilder: (context, index) {
      if (index == commandes.length) return CupertinoActivityIndicator();
      return CommandeCard(commande: commandes[index]);
    },
  ),
)
```

#### 8.2.4 Rebuilds inutiles à éviter

```dart
// ❌ MAUVAIS — Widget trop large reconstruit entièrement
class CommandesPage extends StatefulWidget {
  // Tout l'écran se rebuild quand une commande change
}

// ✅ BON — Granularité fine avec Riverpod
class CommandeCard extends ConsumerWidget {
  final String commandeId;
  
  Widget build(BuildContext context, WidgetRef ref) {
    // Seule cette carte se rebuild quand SA commande change
    final commande = ref.watch(commandeByIdProvider(commandeId));
    return /* ... */;
  }
}
```

#### 8.2.5 Taille du bundle APK

- Éviter d'inclure des assets inutiles
- Utiliser `flutter build apk --split-per-abi` pour réduire la taille
- Activer `--obfuscate --split-debug-info` en release
- Cibler Android API 21+ minimum (supporte 99%+ des appareils actuels)

---

## 9. Fichiers à créer ou modifier par dépôt

### 9.1 Dépôt web — fichiers à créer

| Fichier | Type | Priorité | Description |
|---|---|---|---|
| `src/routes/api-notifications.ts` | Nouveau | 🔴 Haute | Endpoints FCM token + historique notifications |
| Modification `src/routes/api-dashboard.ts` | Modification | 🔴 Haute | Ajouter `GET /api/v1/dashboard/commandes/:id` |
| Modification `src/routes/api-commandes.ts` | Modification | 🔴 Haute | Déclencher notification FCM à la création commande |
| `supabase/migrations/007_fcm_tokens.sql` | Nouveau | 🔴 Haute | Table `fcm_tokens` |
| `supabase/migrations/008_notifications.sql` | Nouveau | 🟡 Moyenne | Table `notifications_inapp` |
| Modification `src/types/database.ts` | Modification | 🔴 Haute | Types FCM + Notification |
| `audits/AUDIT-MOBILE-FLUTTER-MONMENU.md` | Nouveau | ✅ Fait | Ce rapport |

### 9.2 Dépôt web — modifications à apporter aux routes existantes

```typescript
// --- À AJOUTER dans api-dashboard.ts ---

// GET /api/v1/dashboard/commandes/:id — Détail d'une commande
dashboardRouter.get('/commandes/:id', async (c) => {
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)
  
  const commandeId = c.req.param('id')
  const supabase = createSupabaseClientWithToken(c.env, auth.token)
  
  const { data: commande, error } = await supabase
    .from('commandes')
    .select(`
      id, client_nom, client_telephone, client_adresse,
      client_latitude, client_longitude, items_json,
      montant_total, frais_livraison, mode_paiement,
      statut, token_suivi, notes, livreur_id, created_at, updated_at,
      commandes_historique(ancien_statut, nouveau_statut, timestamp, source, note)
    `)
    .eq('id', commandeId)
    .eq('tenant_id', auth.tenant_id)
    .is('deleted_at', null)
    .single()
  
  if (error || !commande) return c.json({ error: 'Commande introuvable.' }, 404)
  
  return c.json({ commande })
})

// GET /api/v1/dashboard/commandes/count-pending
dashboardRouter.get('/commandes/count-pending', async (c) => {
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)
  
  const supabase = createSupabaseClientWithToken(c.env, auth.token)
  const { count } = await supabase
    .from('commandes')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', auth.tenant_id)
    .eq('statut', 'en_attente')
    .is('deleted_at', null)
  
  return c.json({ count: count ?? 0 })
})

// GET /api/v1/dashboard/abonnement
dashboardRouter.get('/abonnement', async (c) => {
  const auth = await verifyAuth(c)
  if (!auth) return c.json({ error: 'Non authentifié.' }, 401)
  
  const supabase = createSupabaseClientWithToken(c.env, auth.token)
  const { data } = await supabase
    .from('abonnements')
    .select('id, plan_id, date_debut, date_fin, statut, montant_paye, devise')
    .eq('tenant_id', auth.tenant_id)
    .eq('statut', 'actif')
    .order('date_debut', { ascending: false })
    .limit(1)
    .maybeSingle()
  
  return c.json({ abonnement: data ?? null })
})
```

### 9.3 Dépôt mobile Flutter — structure recommandée

```
lib/
├── config/
│   └── app_config.dart          # URLs, clés (dart-define)
├── models/
│   ├── commande_model.dart      
│   ├── produit_model.dart       
│   ├── categorie_model.dart     
│   ├── profil_model.dart        
│   ├── plan_model.dart          
│   └── livreur_model.dart       
├── services/
│   ├── api_service.dart         # HTTP client avec intercepteur auth
│   ├── auth_service.dart        # Login/logout/refresh token
│   ├── realtime_service.dart    # Supabase Realtime
│   └── push_notification_service.dart  # FCM
├── providers/                   # Riverpod providers
│   ├── auth_provider.dart       
│   ├── commandes_provider.dart  
│   ├── menu_provider.dart       
│   └── profil_provider.dart     
├── screens/
│   ├── auth/
│   │   ├── login_screen.dart    
│   │   ├── register_screen.dart 
│   │   └── forgot_password_screen.dart
│   ├── dashboard/
│   │   └── dashboard_screen.dart
│   ├── commandes/
│   │   ├── commandes_list_screen.dart
│   │   └── commande_detail_screen.dart
│   ├── menu/
│   │   ├── menu_screen.dart     
│   │   ├── produits_screen.dart 
│   │   └── produit_form_screen.dart
│   ├── restaurant/
│   │   ├── restaurant_screen.dart
│   │   └── apparence_screen.dart
│   └── settings/
│       └── settings_screen.dart 
├── widgets/
│   ├── statut_badge.dart        
│   ├── commande_card.dart       
│   ├── produit_card.dart        
│   └── plan_feature_gate.dart   
├── theme/
│   └── app_theme.dart           
└── main.dart                    
```

### 9.4 Dépôt mobile Flutter — fichiers clés à créer/vérifier

| Fichier | Priorité | Description |
|---|---|---|
| `lib/services/api_service.dart` | 🔴 Haute | Intercepteur Bearer token + auto-refresh 401 |
| `lib/services/auth_service.dart` | 🔴 Haute | Stockage sécurisé tokens (flutter_secure_storage) |
| `lib/services/realtime_service.dart` | 🔴 Haute | Supabase Realtime WebSocket |
| `lib/services/push_notification_service.dart` | 🟡 Moyenne | FCM setup + enregistrement token |
| `lib/widgets/plan_feature_gate.dart` | 🟡 Moyenne | Widget conditionnel selon plan |
| `android/app/src/main/res/xml/network_security_config.xml` | 🔴 Haute | Bloquer HTTP plain (HTTPS only) |
| `pubspec.yaml` | 🔴 Haute | Dépendances correctes et versionnées |

---

## 10. Risques de sécurité identifiés et mesures de mitigation

### 10.1 Risques côté backend web (référence)

| Risque | Niveau | Statut | Mitigation en place |
|---|---|---|---|
| Brute force login | 🔴 Élevé | ✅ Mitigé | Rate limiting 5 tentatives/15min par IP (KV distribué) |
| CSRF sur opérations d'écriture | 🔴 Élevé | ✅ Mitigé | Middleware CSRF (exemption Bearer token documentée) |
| Injection SQL | 🟡 Moyen | ✅ Mitigé | ORM Supabase (requêtes paramétrées) |
| XSS dans les réponses HTML | 🟡 Moyen | ✅ Mitigé | CSP stricte, nonce, sanitisation |
| Accès inter-tenants | 🔴 Élevé | ✅ Mitigé | Filtre `.eq('tenant_id', auth.tenant_id)` sur chaque requête |
| Secrets exposés | 🔴 Élevé | ✅ Mitigé | Variables d'env Cloudflare, jamais dans le code |
| Upload fichiers malicieux | 🟡 Moyen | ✅ Mitigé | Validation MIME + taille max 5MB |
| Token service_role exposé | 🔴 Critique | ⚠️ À vérifier | Seul l'anon key est injecté côté client dashboard |

### 10.2 Risques côté mobile Flutter (à traiter)

| Risque | Niveau | Mesure requise |
|---|---|---|
| Tokens stockés en clair | 🔴 Critique | Utiliser `flutter_secure_storage` obligatoirement |
| Secrets dans le code source | 🔴 Critique | Utiliser `--dart-define`, jamais de const hardcodé |
| Trafic non chiffré | 🔴 Élevé | Configurer `network_security_config.xml` (Android) |
| Certificat pinning absent | 🟡 Moyen | Optionnel pour V1, recommandé en V2 |
| Décompilation APK | 🟡 Moyen | Activer obfuscation (`--obfuscate --split-debug-info`) |
| Pas de vérification intégrité | 🟡 Moyen | Implémenter Play Integrity API (V2) |
| Logs de debug en production | 🟡 Moyen | Vérifier `if (kDebugMode)` sur tous les `debugPrint` |
| Backup Android non chiffré | 🟡 Moyen | `android:allowBackup="false"` dans AndroidManifest |
| Session non invalidée côté serveur au logout | 🟡 Moyen | Appeler `POST /api/v1/auth/logout` EN PLUS de l'effacement local |

### 10.3 Risque spécifique : double vérification statut

> **Risque :** Un client mobile malveillant pourrait contourner la vérification de statut faite en local (profil_model.dart) et appeler directement les API.

**Mitigation :** Ce n'est pas un risque réel car la vérification côté backend est systématique (`.in('tenants.statut', ['actif', 'essai'])`). La vérification côté mobile est uniquement pour l'UX (afficher le bon écran), pas pour la sécurité.

---

## 11. Recommandations priorisées

### Priorité 1 — Bloquants (à résoudre avant tout développement mobile)

| # | Action | Dépôt | Effort |
|---|---|---|---|
| 1.1 | **Fournir l'URL du dépôt mobile Flutter** pour compléter l'audit du code existant | — | 5 min |
| 1.2 | Vérifier qu'aucun `service_role` Supabase n'est exposé dans le frontend web | Web | 30 min |
| 1.3 | Créer la table `fcm_tokens` (migration SQL Supabase) | Web | 1h |
| 1.4 | Créer les endpoints `POST/DELETE /api/v1/dashboard/fcm-token` | Web | 2h |
| 1.5 | Créer l'endpoint `GET /api/v1/dashboard/commandes/:id` | Web | 1h |

### Priorité 2 — Essentiels (sprint 1)

| # | Action | Dépôt | Effort |
|---|---|---|---|
| 2.1 | Implémenter `flutter_secure_storage` pour les tokens | Mobile | 2h |
| 2.2 | Implémenter le intercepteur HTTP auto-refresh (401 → refresh → retry) | Mobile | 3h |
| 2.3 | Implémenter les écrans auth (Login, Register, Forgot password) | Mobile | 2j |
| 2.4 | Implémenter Dashboard + liste Commandes avec Supabase Realtime | Mobile | 3j |
| 2.5 | Implémenter gestion statut commandes (PATCH) | Mobile | 1j |
| 2.6 | Configurer `network_security_config.xml` (HTTPS only Android) | Mobile | 30 min |
| 2.7 | Configurer FCM (Firebase project, `google-services.json`) | Mobile | 2h |

### Priorité 3 — Importants (sprint 2)

| # | Action | Dépôt | Effort |
|---|---|---|---|
| 3.1 | Écrans Menu (liste catégories + produits + CRUD) | Mobile | 3j |
| 3.2 | Écran Mon Restaurant (PDV + Apparence) | Mobile | 2j |
| 3.3 | Écran Statistiques (graphe 30j) | Mobile | 1.5j |
| 3.4 | Écran Paramètres + gestion forfait | Mobile | 1.5j |
| 3.5 | Upload image (logo, bannière, photos produits) | Mobile | 1j |
| 3.6 | Notifications push FCM (enregistrement token + réception) | Mobile | 1.5j |

### Priorité 4 — Améliorations (sprint 3+)

| # | Action | Dépôt | Effort |
|---|---|---|---|
| 4.1 | Écrans Livreurs + Codes promo (conditionnels au plan) | Mobile | 2j |
| 4.2 | QR Code (affichage + partage natif) | Mobile | 0.5j |
| 4.3 | Mode hors ligne (Hive cache) | Mobile | 3j |
| 4.4 | Obfuscation + Split debug info en release | Mobile | 1h |
| 4.5 | Tests unitaires API service + auth | Mobile | 2j |
| 4.6 | Tests d'intégration écrans principaux | Mobile | 3j |
| 4.7 | Endpoint `GET /api/v1/dashboard/abonnement` | Web | 1h |
| 4.8 | Endpoint `GET /api/v1/dashboard/commandes/count-pending` | Web | 30 min |

### Estimation globale de développement

| Phase | Durée estimée | Livrable |
|---|---|---|
| Préparation (backend web modifications) | 1 semaine | Endpoints manquants + FCM support |
| Sprint 1 — Auth + Commandes | 2 semaines | App utilisable pour gestion commandes |
| Sprint 2 — Menu + Restaurant + Stats | 2 semaines | Dashboard complet |
| Sprint 3 — Notifications + Features avancées | 1.5 semaines | App complète |
| QA + Tests + Store | 1 semaine | Publication Google Play |
| **Total** | **~7.5 semaines** | Application mobile production-ready |

---

## Annexe A — Stack technique recommandée

```yaml
# pubspec.yaml
name: monmenu_restaurant
description: Application mobile restaurant MonMenu

environment:
  sdk: '>=3.0.0 <4.0.0'
  flutter: '>=3.24.0'

dependencies:
  flutter:
    sdk: flutter
  
  # Authentification Supabase
  supabase_flutter: ^2.8.0
  flutter_secure_storage: ^9.2.4
  
  # HTTP
  http: ^1.2.2
  
  # État
  flutter_riverpod: ^2.5.1
  riverpod_annotation: ^2.3.5
  
  # Stockage local
  hive: ^2.2.3
  hive_flutter: ^1.1.0
  
  # Images
  cached_network_image: ^3.4.1
  image_picker: ^1.1.2
  
  # Push notifications
  firebase_core: ^3.6.0
  firebase_messaging: ^15.1.3
  flutter_local_notifications: ^17.2.3
  
  # Navigation
  go_router: ^14.4.1
  
  # UI
  fl_chart: ^0.69.0          # Graphiques stats
  
dev_dependencies:
  flutter_test:
    sdk: flutter
  build_runner: ^2.4.14
  riverpod_generator: ^2.4.3
  flutter_lints: ^5.0.0
```

---

## Annexe B — Variables d'environnement requises

```bash
# Variables à passer via --dart-define au build

SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
API_BASE_URL=https://monmenu.app   # ou URL Cloudflare Workers

# Variables Firebase (dans google-services.json — pas en dart-define)
# google-services.json → android/app/google-services.json
# GoogleService-Info.plist → ios/Runner/GoogleService-Info.plist
```

---

*Rapport généré le 2025-07-29 — MonMenu Audit Mobile Flutter v1.0*  
*Ce document constitue le cahier des charges complet pour le développement de l'application mobile restaurant MonMenu.*  
*Pour compléter l'audit du code Flutter existant, fournir l'URL du dépôt mobile et relancer l'analyse avec accès au code source.*
