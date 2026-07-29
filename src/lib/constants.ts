// Constantes de configuration métier — valeurs stables qui ne nécessitent
// pas une base de données pour être modifiées. Un changement se fait par
// simple redéploiement (rapide et sans downtime sur Cloudflare Workers).

// Durée de la période d'essai offerte à l'inscription, en jours.
export const ESSAI_DUREE_JOURS = 14
