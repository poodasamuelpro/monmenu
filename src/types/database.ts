// Types TypeScript alignés sur le schéma Supabase
// Régénérer avec : supabase gen types typescript
//
// AJOUT 2026-07-29 : types mis à jour pour le module paiement manuel
// - Tenant : ajout statut 'en_attente_confirmation' (indirect via abonnement), paiement_en_attente_depuis
// - Abonnement : ajout de tous les champs paiement manuel (migration 007)
// - NotificationRestaurant : nouvelle table (migration 008)
//
// AJOUT — module FCM (push notifications mobile) : 3 nouvelles variables
// d'environnement Cloudflare Workers dans Env (FCM_PROJECT_ID,
// FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY), utilisées par src/lib/fcm.ts.
// Toutes optionnelles : si absentes, sendFcmNotification/sendFcmToTenant
// (lib/fcm.ts) se désactivent silencieusement sans jamais faire échouer
// une route (voir fcmConfigure() dans lib/fcm.ts).

export interface Pays {
  id: string
  code_iso: string
  nom: string
  devise: string
  symbole_devise: string
  indicatif_tel: string
  langue_defaut: string
  actif: boolean
  created_at: string
}

export interface Plan {
  id: string
  nom: string
  prix_mensuel: number
  prix_annuel: number
  devise: string
  commandes_incluses: number
  frais_par_commande: number
  limite_pdv: number
  fonctionnalites: Record<string, boolean | number | string>
  actif: boolean
  ordre_affichage: number
  created_at: string
  updated_at: string
}

export interface Tenant {
  id: string
  pays_id: string
  nom: string
  slug: string
  logo_url: string | null
  banniere_url: string | null
  couleur_primaire: string
  couleur_secondaire: string
  whatsapp_number: string
  domaine_perso: string | null
  // CYCLE-3 : ajout statut 'en_attente_paiement_initial' (tenant plan payant, preuve non soumise)
  statut: 'actif' | 'inactif' | 'suspendu' | 'essai' | 'en_attente_paiement_initial'
  essai_expire_le: string | null
  plan_id: string | null
  // CYCLE-3 : plan choisi à l'inscription avant confirmation paiement
  plan_initial_id?: string | null
  // AJOUT migration 007 — suivi paiement en attente
  paiement_en_attente_depuis: string | null
  reference_paiement_active: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// Historique de paiement / abonnement — utilisé par le cron (api-cron.ts)
// pour vérifier qu'un tenant en essai expiré n'a pas déjà un abonnement
// payé avant de le faire passer à 'inactif'.
//
// AJOUT migration 007 — champs complets du flux paiement manuel
export interface Abonnement {
  id: string
  tenant_id: string
  plan_id: string
  // AJOUT : 'en_retard' et 'en_attente_confirmation' (migration 007)
  statut: 'actif' | 'expire' | 'annule' | 'en_retard' | 'en_attente_confirmation'
  date_debut: string
  date_fin: string | null
  // CYCLE-3 : periodicite exclusivement mensuel
  periodicite?: 'mensuel' | null
  // Champs paiement manuel
  montant_paye?: number | null
  devise?: string | null
  methode_paiement?: string | null
  // Référence de rapprochement (SEC-10 : n'autorise rien seule)
  reference_paiement?: string | null
  // Clé R2 de la preuve (jamais l'URL publique — cf. SEC-06)
  preuve_paiement_url?: string | null
  // Fenêtre 72h
  soumis_le?: string | null
  delai_confirmation_expire_le?: string | null
  // Audit trail confirmation (SEC-04)
  confirme_par?: string | null
  confirme_le?: string | null
  // Audit trail rejet
  rejete_par?: string | null
  rejete_le?: string | null
  motif_rejet?: string | null
  created_at: string
  updated_at?: string | null
}

// Notification in-app restaurant — migration 008
export interface NotificationRestaurant {
  id: string
  tenant_id: string
  type: 'info' | 'warning' | 'success' | 'error'
  titre: string
  message: string
  lue: boolean
  lien: string | null
  payload?: Record<string, unknown> | null
  created_at: string
}

export interface UtilisateurTenant {
  id: string
  tenant_id: string
  auth_user_id: string
  role: 'proprietaire' | 'gestionnaire' | 'employe'
  nom: string
  telephone: string | null
  created_at: string
}

export interface PointDeVente {
  id: string
  tenant_id: string
  nom: string
  adresse: string
  latitude: number | null
  longitude: number | null
  zone_livraison_geojson: Record<string, unknown> | null
  horaires: Record<string, unknown> | null
  actif: boolean
  created_at: string
  updated_at: string
}

export interface CategorieMenu {
  id: string
  tenant_id: string
  nom: string
  description: string | null
  ordre_affichage: number
  actif: boolean
  created_at: string
}

export interface VarianteProduit {
  id: string
  produit_id: string
  nom: string
  prix_supplement: number
}

export interface Produit {
  id: string
  tenant_id: string
  categorie_id: string
  nom: string
  description: string | null
  prix: number
  photo_url: string | null
  disponible: boolean
  ordre_affichage: number
  metadata: Record<string, unknown>
  variantes?: VarianteProduit[]
  created_at: string
  updated_at: string
}

export interface Livreur {
  id: string
  tenant_id: string
  nom: string
  whatsapp_number: string
  actif: boolean
  created_at: string
}

export interface ItemCommandeJson {
  produit_id: string
  nom: string
  prix_unitaire: number
  quantite: number
  variante_id?: string
  variante_nom?: string
  prix_supplement?: number
  sous_total: number
}

export type StatutCommande =
  | 'en_attente'
  | 'confirmee'
  | 'en_preparation'
  | 'en_livraison'
  | 'livree'
  | 'annulee'
  | 'remboursee'

export type ModePaiement = 'especes_livraison' | 'mobile_money' | 'carte_bancaire'

export interface Commande {
  id: string
  tenant_id: string
  point_de_vente_id: string
  client_nom: string
  client_telephone: string
  client_adresse: string | null
  client_latitude: number | null
  client_longitude: number | null
  items_json: ItemCommandeJson[]
  montant_total: number
  frais_livraison: number
  mode_paiement: ModePaiement
  statut: StatutCommande
  livreur_id: string | null
  token_suivi: string
  idempotency_key: string
  notes: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CommandeHistorique {
  id: string
  commande_id: string
  ancien_statut: StatutCommande
  nouveau_statut: StatutCommande
  timestamp: string
  source: 'restaurant' | 'livreur' | 'systeme' | 'client'
  note: string | null
}

export interface StatsJournalieres {
  id: string
  tenant_id: string
  date: string
  nb_commandes: number
  // Colonnes originales (migration 001)
  ca_total: number
  produit_top_id: string | null
  taux_annulation: number
  // Colonnes ajoutées par migration 010 — utilisées par api-cron.ts
  chiffre_affaires: number            // Alias actif de ca_total côté cron
  frais_livraison_total: number       // Total frais de livraison
  top_produits: Array<{ produit_id: string; nom: string; quantite: number }>
  nb_commandes_livrees: number
  nb_commandes_annulees: number
  updated_at?: string | null
}

// Type interface pour les moyens de paiement (migration 012)
export interface MoyenPaiement {
  id: string
  code: string
  nom: string
  description: string
  instructions: string
  numero: string | null
  nom_compte: string | null
  logo_url: string | null
  actif: boolean
  ordre_affichage: number
  created_at: string
  updated_at: string
}

export interface CodePromo {
  id: string
  tenant_id: string
  code: string
  type: 'pourcentage' | 'montant_fixe' | 'livraison_gratuite'
  valeur: number
  date_debut: string
  date_fin: string | null
  usage_max: number | null
  usage_actuel: number
  actif: boolean
  created_at: string
  updated_at: string
}

export interface ConfigGlobale {
  cle: string
  valeur: string
}

export interface AuditLog {
  id: string
  tenant_id: string | null
  table_name: string
  record_id: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  changes: {
    avant?: Record<string, unknown>
    apres?: Record<string, unknown>
    data?: Record<string, unknown>
  } | null
  created_at: string
}

export interface Article {
  id: string
  slug: string
  titre: string
  extrait: string
  contenu: string
  categorie: string
  temps_lecture: string | null
  image_url: string | null
  statut: 'brouillon' | 'publie'
  auteur: string | null
  date_publication: string | null
  created_at: string
  updated_at: string
}

export interface NewsletterSubscriber {
  id: string
  email: string
  statut: 'actif' | 'desinscrit'
  source: string | null
  created_at: string
}

// AJOUT — Token FCM d'un device (app mobile) — migration 013
export interface FcmToken {
  id: string
  tenant_id: string
  token: string
  platform: 'android' | 'ios' | 'web'
  created_at: string
  updated_at: string
}

// Contexte Cloudflare Workers
export type Env = {
  DB: D1Database
  KV_CACHE?: KVNamespace
  R2_MEDIA?: R2Bucket
  ASSETS?: Fetcher
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  WHATSAPP_API_TOKEN?: string
  WHATSAPP_PHONE_ID?: string
  BREVO_API_KEY_1?: string
  BREVO_API_KEY_2?: string
  BREVO_API_KEY_3?: string
  MAPBOX_TOKEN?: string
  OPENWEATHER_API_KEY?: string
  ENVIRONMENT?: 'development' | 'production'
  // AJOUT — capture d'écran boutique (voir lib/screenshot.ts, api-cron.ts)
  PUBLIC_BASE_URL?: string   // origine publique utilisée par le cron (var, pas secret)
  THUMIO_API_KEY?: string    // optionnel — clé thum.io pour plus de quota/fiabilité (secret)
  // AJOUT module paiement — URL de base du dashboard admin (pour appels inter-services)
  ADMIN_BASE_URL?: string    // ex: https://admin.monmenu.app
  ADMIN_WEBHOOK_SECRET?: string // secret partagé pour appels admin → web
  // BUG-012 CORRIGÉ — ADMIN_TASK_SECRET pour les tâches cron manuelles (api-admin-tasks.ts)
  ADMIN_TASK_SECRET?: string // secret transmis dans header X-Admin-Task-Secret
  // AJOUT module FCM — Push notifications mobile (voir lib/fcm.ts).
  // Toutes optionnelles : si absentes, lib/fcm.ts se désactive en silence
  // (aucune route existante n'échoue si FCM n'est pas encore configuré).
  FCM_PROJECT_ID?: string     // ex: 'monmenumanager' (google-services.json → project_id) — Text
  FCM_CLIENT_EMAIL?: string   // JSON compte de service Firebase Admin → client_email — Secret
  FCM_PRIVATE_KEY?: string    // JSON compte de service Firebase Admin → private_key (avec \n) — Secret
}

export interface CartItem {
  produit_id: string
  nom: string
  prix: number
  quantite: number
  photo_url?: string | null
  variante_id?: string
  variante_nom?: string
  prix_supplement?: number
}

export interface Cart {
  tenant_id: string
  slug: string
  items: CartItem[]
  updated_at: string
}
