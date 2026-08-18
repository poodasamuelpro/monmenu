# Migrations SQL — MonMenu (base Supabase partagée)

Les deux applications (site web `monmenu` et dashboard admin `monmenu-admin`) partagent
**une seule base Supabase** (projet « monmenu »). Ce dossier rassemble l'historique complet
des migrations SQL du projet.

## Structure

```
supabase/migrations/
├── (socle web : 00-migration.sql … 024_numeros_paiement_reels.sql)
├── migration-blog-newsletter.sql
└── admin/                         ← migrations propres au dashboard admin (copiées pour référence)
    ├── 020_notifications_admin.sql   (cloche notifications du panel)
    ├── 021_assistant_ia_config.sql   (réglages assistant IA)
    └── 022_fonctionnalites_plans.sql (matrice plan × fonctionnalités)
```

## Ordre d'application

1. `00-migration.sql` … `024_numeros_paiement_reels.sql` (socle web, dans l'ordre numérique)
2. `migration-blog-newsletter.sql` (après `005b`, requiert les tables articles/newsletter)
3. `admin/020_notifications_admin.sql` (auto-réparatrice, idempotente)
4. `admin/021_assistant_ia_config.sql` (INSERT idempotents dans `config_globale`)
5. `admin/022_fonctionnalites_plans.sql` (non destructive — conserve les colonnes JSONB de `plans`)

## Conventions

- Toutes les migrations sont **idempotentes** (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING/UPDATE`).
- **Ne jamais supprimer ou renommer** une migration déjà appliquée en production.
- Une migration web qui touche le socle commun est copiée dans le repo admin (`supabase/migrations/web/`).
- Les fichiers du sous-dossier `admin/` sont des copies fidèles du repo admin : leur source de
  vérité est le repo admin (`poodasamuelpro/monmenu-admin`).

## Note sur 023 / 024

- `023_email_tenant.sql` ajoute `tenants.email` (consommé par les notifications email admin).
- `024_numeros_paiement_reels.sql` existe dans les deux repos (copie identique) : elle met à jour
  `moyens_paiement` avec les numéros réels Orange Money +226 77 98 02 64 et Moov Money +226 52 00 37 62.
