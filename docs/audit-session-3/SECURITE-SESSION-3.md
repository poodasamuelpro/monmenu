# Rapport Sécurité — Session-3

## Mesures ajoutées

### Transport
- **HSTS** : `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` sur toutes les réponses via `setSecurityHeaders()`

### Upload
- **Magic bytes** : validation des 12 premiers octets (JPEG FF D8 FF, PNG 89 50 4E 47, GIF 47 49 46 38, WebP RIFF+WEBP). Un fichier .exe renommé .jpg est rejeté.
- **R2.put try/catch** : erreur stockage retourne 502 propre au lieu d'une exception non gérée
- **Suppression ancienne clé** : vérification que `ancienne_cle.startsWith(tenant_id + '/')` avant delete R2

### Emails
- **escapeHtml** sur toutes les données utilisateur dans les templates HTML (anti-XSS)
- **URLs dynamiques** : `PUBLIC_BASE_URL` Cloudflare var, fallback `https://monmenu.com`

### Suppressions de compte
- **Token UUID** à usage unique, expiration 48h, effacé après usage
- **Rate limit** : 3 demandes / 24h par tenant
- **Condition d'exécution admin** : `suppression_prevue_le < now` strictement vérifiée
- **Isolation R2** : clé suppression vérifiée avec préfixe `tenant_id/`

### Accès tenant
- **Essai expiré real-time** : `verifierAccesTenant()` vérifie `essai_expire_le` immédiatement, sans attendre le cron
