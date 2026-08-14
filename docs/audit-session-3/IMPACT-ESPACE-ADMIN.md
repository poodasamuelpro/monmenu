# Impact Espace Admin — Session-3

## Nouvelles routes admin (X-Admin-Secret requis)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/v1/admin/paiements/suppressions` | Liste des suppressions programmées (non deleted_at, suppression_prevue_le non null) |
| POST | `/api/v1/admin/paiements/suppressions/:tenant_id/executer` | Exécute la suppression (soft-delete + deleteUser Auth). Condition : suppression_prevue_le passée. |

## Comportement modifié
- **GET /api/v1/admin/paiements** : enrichissement `plan_nom` plus rapide (1 requête `.in()` au lieu de N appels)
