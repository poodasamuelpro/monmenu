/**
 * public/static/js/auth-fetch.js — Wrapper fetch avec rafraîchissement
 * automatique de session.
 *
 * BUG CORRIGÉ : le cookie httpOnly sb-access-token expire au bout de 1h
 * (ACCESS_TOKEN_MAX_AGE dans src/routes/api-auth.ts). L'endpoint
 * POST /api/v1/auth/refresh existe pour le renouveler via le refresh_token
 * (valide 30 jours), mais AUCUN fichier front-end ne l'appelait jamais.
 * Résultat : toute session dashboard expirait après 1h d'usage, avec un
 * message "session expirée" même pour un utilisateur légitime toujours
 * connecté — obligeant une reconnexion manuelle très fréquente.
 *
 * Ce module doit être chargé AVANT dashboard.js, dashboard-paiement.js et
 * notifications.js (voir src/pages/dashboard.ts).
 *
 * Usage : remplacer `fetch(url, opts)` par `window.fetchAvecSession(url, opts)`
 * pour tout appel qui nécessite l'authentification (cookie sb-access-token).
 * Ne PAS l'utiliser pour les endpoints publics (/api/v1/plans,
 * /api/v1/moyens-paiement) — un refresh inutile dessus ne casse rien mais
 * n'a aucun intérêt.
 */
'use strict';

// Évite plusieurs refresh en parallèle si plusieurs requêtes 401 arrivent
// en même temps (ex: /statut et /historique lancés simultanément).
let _refreshEnCours = null;

async function _tenterRefresh() {
  if (_refreshEnCours) return _refreshEnCours;

  _refreshEnCours = fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  })
    .then(res => res.ok)
    .catch(() => false)
    .finally(() => { _refreshEnCours = null; });

  return _refreshEnCours;
}

/**
 * fetch() avec retry automatique après refresh de session en cas de 401.
 * Si le refresh échoue aussi (refresh_token expiré ou absent), redirige
 * vers /connexion après un court délai (laisse le temps à l'appelant de
 * gérer lui-même la réponse 401 s'il le souhaite).
 */
async function fetchAvecSession(url, opts = {}) {
  const optsAvecCredentials = { credentials: 'include', ...opts };
  let res = await fetch(url, optsAvecCredentials);

  if (res.status === 401) {
    const refreshOk = await _tenterRefresh();
    if (refreshOk) {
      res = await fetch(url, optsAvecCredentials);
    } else {
      // Session définitivement expirée (refresh_token aussi invalide).
      // On laisse quand même la réponse 401 remonter à l'appelant pour
      // qu'il affiche son propre message ; on ne force pas de redirection
      // brutale pour ne pas interrompre une saisie en cours ailleurs sur
      // la page.
      console.warn('[auth-fetch] Session expirée, refresh impossible.');
    }
  }

  return res;
}

window.fetchAvecSession = fetchAvecSession;

