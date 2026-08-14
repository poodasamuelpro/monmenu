# Audit-3 — Vérification d'application des corrections [Session-3]

**Date** : 2026-08-14  
**Branche** : `fix/audit-session-3`  
**Commits session-3** : 8 (daff016 → d296223)

---

## Résumé des vérifications

| Correction | Fichier(s) | Commit | Vérifié |
|------------|-----------|--------|---------|
| Corr#1 rate limiting newsletter | api-newsletter.ts | daff016 | ✅ |
| Corr#2 domaine_perso supprimé (6 fichiers) | index.tsx, api-dashboard.ts, home.ts, tarifs.ts, dashboard.js, types | 5d1f682 | ✅ |
| Corr#3 migration limite_pdv=1 | 015_limite_pdv_1.sql | daff016 | ✅ |
| Corr#5+6 emails transactionnels + escapeHtml | brevo.ts + 4 routes | 4c323db | ✅ |
| Fix URLs dynamiques (PUBLIC_BASE_URL) | brevo.ts | 8799281 | ✅ 0 occurrence monmenu.app |
| HSTS | security.ts | c0a4ad0 | ✅ |
| Corr#7 crons rappels J-5/J-2 | api-cron.ts, wrangler.jsonc | 72a12c6 | ✅ |
| Corr#8a RLS bug /apparence | api-dashboard.ts | 08124c5 | ✅ adminClient + rowCount |
| Corr#8b tenants:public KV invalidation | api-admin-paiements.ts | 08124c5 | ✅ |
| Corr#8c+14.1 KV cache fetchTenantAvecPdv | index.tsx | 08124c5 | ✅ 30s TTL |
| Corr#9 pagination dashboard | api-dashboard.ts | 0656ff2 | ✅ |
| Corr#9-fin COUNT SQL stats | api-dashboard.ts | 46d909a | ✅ 3 COUNT head:true |
| Corr#10a verifierAbonnementsExpires | api-cron.ts | 72a12c6 | ✅ |
| Corr#10b essai_expire_le real-time | acces-tenant.ts | 5024e5c | ✅ |
| Corr#11 schema migration | 016_suppression_compte.sql | daff016 | ✅ |
| Corr#11 routes suppression | api-dashboard.ts, api-admin-paiements.ts | 16b4e0a | ✅ |
| Corr#12 upload magic bytes + R2 | api-dashboard.ts | 0e61cec | ✅ |
| Corr#14.2 N+1 stats cron batches | api-cron.ts | d296223 | ✅ batches 5 |
| Corr#14.2 N+1 paiements admin | api-admin-paiements.ts | d296223 | ✅ .in() groupé |
| Corr#14.3 Promise.all profil | api-dashboard.ts | 46d909a | ✅ |
| Corr#14.4 select(*) colonnes explicites | api-commandes.ts | 46d909a | ✅ |
| Corr#14.6 inactif filtre statut | api-tenants.ts | 46d909a | ✅ |

## Vérification URLs monmenu.app

```bash
grep -rn "monmenu\.app" src/  # résultat : 0 occurrences
```

Toutes les URLs utilisent désormais `PUBLIC_BASE_URL` (Cloudflare var) avec fallback `https://monmenu.com`.
