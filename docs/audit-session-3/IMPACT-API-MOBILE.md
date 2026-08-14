# Impact API Mobile — Session-3

## Nouvelles routes (à intégrer dans le client mobile)

### Dashboard — Suppression de compte
| Méthode | Route | Auth | Notes |
|---------|-------|------|-------|
| POST | `/api/v1/dashboard/compte/demander-suppression` | Bearer | Rate-limit 3/24h. Envoie email confirmation. |
| GET | `/api/v1/dashboard/compte/confirmer-suppression?token=...` | — | Lien email, retourne HTML |
| POST | `/api/v1/dashboard/compte/annuler-suppression` | Bearer | Annule la demande en cours |

### Changement comportement existant
- **POST /upload-image** : accepte maintenant un champ form optionnel `ancienne_cle` (string) pour supprimer l'ancien fichier R2 après upload
- **GET /stats** : le champ `statuts` ne contient plus que `{livree: N, annulee: N}` (plus de map complète — suppression fetch mémoire)
- **GET /:slug et GET /:slug/menu** : les restaurants en statut `inactif` sont désormais retournés (grace period)

## Aucune régression sur les routes existantes
Toutes les signatures de réponse sont inchangées sauf mention ci-dessus.
