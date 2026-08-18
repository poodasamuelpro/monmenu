# Rapport — Colonne email tenant (notifications email admin)

**Date** : 2026-08-18 · **Solution appliquée** : option 1 (colonne dédiée `tenants.email`) · **Périmètre** : repo web (monmenu) + lecture admin (monmenu-admin)

---

## 1. Objectif

Rendre fonctionnel le canal **email** des notifications envoyées par le dashboard admin aux restaurants (Brevo). Jusqu'ici ce canal échouait systématiquement (`pas_d_email_tenant`) car aucune adresse email n'était jamais stockée dans la table `tenants` — l'email existait uniquement dans `auth.users` (compte Supabase), inaccessible en lecture directe par la logique applicative.

## 2. Méthodologie — 5 passes d'audit avant toute modification

| Passe | Objet | Résultat |
| --- | --- | --- |
| 1. Individuelle | Structure `tenants` (001), RLS (002), register (api-auth.ts), paramètres/profil (api-dashboard.ts), lecture admin (notifications.ts), frontend (inscription.ts, dashboard.ts) | 0 conflit de colonne, email déjà saisi à l'inscription côté UI |
| 2. Groupe | Chaîne complète de la donnée (inscription → stockage → lecture → notification), matrice des 7 risques globaux avec mitigations | 1 risque HAUT identifié (migration absente → erreur runtime) → ordre strict documenté |
| 3. Implémentation | 5 fichiers modifiés/créés (détail §3) | Typecheck 0 erreur, build OK |
| 4. Croisée (individuelle + groupe) | Vérification des regex identiques, trims cohérents, selects synchronisés, rollback register préservé, RLS inchangé | 6 fichiers rapports supprimés par erreur dans le working tree **restaurés** (aucune perte) |
| 5. Validation production | `tsc --noEmit` × 2 repos + `pnpm run build` × 2 repos | 0 erreur, builds identiques en taille de modules (149 transformés) |

## 3. Modifications appliquées

| Fichier | Type | Modification |
| --- | --- | --- |
| `supabase/migrations/023_email_tenant.sql` | **Création** | Colonne `email TEXT` (nullable) sur `tenants` + rattrapage des tenants existants depuis `auth.users` via `utilisateurs_tenant` (premier utilisateur, `ORDER BY created_at ASC LIMIT 1`, idempotent) + commentaire documenté |
| `src/routes/api-auth.ts` (register) | Modification | `email: email.trim()` ajouté à l'insert `tenants` — l'email est **déjà validé** par la regex existante en amont (ligne 301) |
| `src/routes/api-dashboard.ts` (PATCH /parametres) | Modification | Champ `email?` dans le body whitelisté, validation regex identique au register, mise à jour conditionnelle `updateData.email` (trim, ou `null` si vide = suppression volontaire) |
| `src/routes/api-dashboard.ts` (GET /profil) | Modification | Colonne `email` ajoutée aux **deux** select (client token + fallback admin) et exposée dans la réponse |
| `src/routes/notifications.ts` (admin) | Modification | Lecture prioritaire de `tenants.email` avec **fallback** `metadata.email` (JSONB legacy) pendant la transition |

**Frontend : aucun changement.** Le champ email existe déjà sur la page d'inscription (`inscription.ts`). La page `/dashboard/parametres` du lien sidebar n'est pas active dans le SPA actuel — la modification de l'email via API reste disponible pour une future UI sans toucher au code.

## 4. Comportements garantis

**Zéro régression pendant la transition** : avant application de la migration, la colonne n'existe pas et la lecture admin retombe sur `metadata.email` (comportement actuel inchangé). Après migration + rattrapage, tous les tenants existants reçoivent leur email depuis Auth. Le registre des échecs email (`pas_d_email_tenant`, `brevo_non_configuré`) est conservé dans le rapport d'état multi-canal.

**Sécurité** : la colonne est protégée par les policies RLS existantes de `tenants` (lecture/modification par le tenant connecté uniquement — inchangé). Le PATCH reste soumis au client scopé au token (RLS actif), le GET /profil exige un token valide. L'email est trimmé partout, jamais injecté en HTML brut (la lecture admin est côté serveur). Le rollback register (échec PDV/utilisateurs_tenant → soft-delete + deleteUser Auth) s'applique aussi à la nouvelle colonne, aucune donnée orpheline possible.

**Compromis documenté (limination connue)** : l'email des notifications (`tenants.email`) et l'email de connexion (`auth.users.email`) sont deux sources distinctes. Si le propriétaire change son email de connexion via « mot de passe oublié », les notifications continueront vers l'adresse enregistrée dans paramètres. C'est le comportement le plus sûr (jamais d'envoi involontaire vers une adresse mal tapée), et une UI de synchronisation pourra être ajoutée plus tard si vous le souhaitez.

## 5. Ordre d'application STRICT (manuel)

1. **D'abord** : appliquer `supabase/migrations/023_email_tenant.sql` sur la base Supabase (Supabase Dashboard → SQL Editor, copier-coller du fichier)
2. **Ensuite** : déployer le repo web (`pnpm run build` + `npx wrangler deploy` ou re-trigger du déploiement automatique)
3. **Enfin** : déployer le repo admin (lecture avec fallback — fonctionne dans les deux sens)

La migration est idempotente (`ADD COLUMN IF NOT EXISTS`, `WHERE email IS NULL`) : elle peut être ré-exécutée sans effet de bord.

## 6. Vérifications finales

| Contrôle | Repo web | Repo admin |
| --- | --- | --- |
| Typecheck `tsc --noEmit` | 0 erreur | 0 erreur |
| Build production | OK (721 kB) | OK (207 kB) |
| Fichiers suivis du repo préservés | 6 rapports restaurés, aucune perte | — |
