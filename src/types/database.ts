// Types TypeScript alignés sur le schéma Supabase
// Régénérer avec : supabase gen types typescript
//
// MIGRATION PLANS — Supabase `plans` est désormais l'unique source de
// vérité (nom, prix, fonctionnalités). D1 n'est plus consulté pour les
// plans nulle part dans le code. tenants.plan_id, tenants.plan_initial_id
// et abonnements.plan_id contiennent tous le MÊME UUID Supabase natif —
// plus de résolution d1_plan_id ↔ UUID nécessaire dans le code applicatif.
//
// AJOUT — Suppléments (migration 014) : un produit peut avoir des
// suppléments configurables (nom + prix), activables/désactivables par
// le restaurant, proposés au client à l'ajout au panier. Le prix des
// suppléments est TOUJOURS recalculé côté serveur à la commande — jamais
// fait confiance au prix envoyé par le client (même logique que le code
// promo existant).
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

// MIGRATION — Plan vit désormais exclusivement dans Supabase. La colonne
// `id` est l'UUID Supabase natif, utilisé PARTOUT (tenants.plan_id,
// tenants.plan_initial_id, abonnements.plan_id). `d1_plan_id` est
// conservée en base pour référence historique mais n'est plus lue par
// aucun code applicatif après cette migration.
export interface Plan {
  id: string
  nom: string
  description?: string | null
  prix_mensuel: number
  prix_annuel: number
  devise: string
  commandes_incluses: number
  frais_par_commande: number
  limite_pdv: number
  fonctionnalites: Record<string, boolean | number | string>
  actif: boolean
  ordre_affichage: number
  d1_plan_id?: string | null
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
  /** @deprecated Fonctionnalité supprimée [session-3] — colonne DB conservée inerte */
  domaine_perso: string | null
  statut: 'actif' | 'inactif' | 'suspendu' | 'essai' | 'en_attente_paiement_initial'
  essai_expire_le: string | null
  // MIGRATION — UUID Supabase natif de la table `plans` (plus de résolution D1)
  plan_id: string | null
  plan_initial_id?: string | null
  paiement_en_attente_depuis: string | null
  reference_paiement_active: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Abonnement {
  id: string
  tenant_id: string
  // MIGRATION — UUID Supabase natif du plan (table `plans`), plus jamais
  // un slug D1 (ex: "plan_faso"). Stocké tel quel depuis /soumettre.
  plan_id: string
  statut: 'actif' | 'expire' | 'annule' | 'en_retard' | 'en_attente_confirmation'
  date_debut: string
  date_fin: string | null
  periodicite?: 'mensuel' | null
  montant_paye?: number | null
  devise?: string | null
  methode_paiement?: string | null
  reference_paiement?: string | null
  preuve_paiement_url?: string | null
  soumis_le?: string | null
  delai_confirmation_expire_le?: string | null
  confirme_par?: string | null
  confirme_le?: string | null
  rejete_par?: string | null
  rejete_le?: string | null
  motif_rejet?: string | null
  created_at: string
  updated_at?: string | null
}

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

// AJOUT — Supplément d'un produit (migration 014). Configuré par le
// restaurant dans le dashboard (section Menu → bouton Suppléments d'un
// produit), activable/désactivable indépendamment, proposé au client au
// moment de l'ajout au panier sur la boutique publique.
export interface Supplement {
  id: string
  tenant_id: string
  produit_id: string
  nom: string
  prix: number
  actif: boolean
  ordre_affichage: number
  created_at: string
  updated_at: string
  deleted_at: string | null
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
  supplements?: Supplement[]
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

// AJOUT — Supplément sélectionné sur une ligne de commande (snapshot au
// moment de la commande — nom/prix figés même si le supplément change
// ou est désactivé ensuite côté dashboard).
export interface SupplementCommandeJson {
  supplement_id: string
  nom: string
  prix: number
}

export interface ItemCommandeJson {
  produit_id: string
  nom: string
  prix_unitaire: number
  quantite: number
  variante_id?: string
  variante_nom?: string
  prix_supplement?: number
  supplements?: SupplementCommandeJson[]
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
  ca_total: number
  produit_top_id: string | null
  taux_annulation: number
  chiffre_affaires: number
  frais_livraison_total: number
  top_produits: Array<{ produit_id: string; nom: string; quantite: number }>
  nb_commandes_livrees: number
  nb_commandes_annulees: number
  updated_at?: string | null
}

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
  PUBLIC_BASE_URL?: string
  THUMIO_API_KEY?: string
  ADMIN_BASE_URL?: string
  ADMIN_WEBHOOK_SECRET?: string
  ADMIN_TASK_SECRET?: string
  FCM_PROJECT_ID?: string
  FCM_CLIENT_EMAIL?: string
  FCM_PRIVATE_KEY?: string
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
  supplements?: SupplementCommandeJson[]
}

export interface Cart {
  tenant_id: string
  slug: string
  items: CartItem[]
  updated_at: string
}
