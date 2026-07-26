// Types TypeScript alignés sur le schéma Supabase
// Régénérer avec : supabase gen types typescript

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
  statut: 'actif' | 'inactif' | 'suspendu' | 'essai'
  plan_id: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  deleted_at: string | null
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
  ca_total: number
  produit_top_id: string | null
  taux_annulation: number
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
}

export interface ConfigGlobale {
  cle: string
  valeur: string
}

export interface AuditLog {
  id: string
  table_cible: string
  ligne_id: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  ancien_valeur: Record<string, unknown> | null
  nouvelle_valeur: Record<string, unknown> | null
  auteur_id: string | null
  timestamp: string
}

// Contexte Cloudflare Workers
// ARCHITECTURE BASE DE DONNÉES :
//   DB (D1)    → SITE WEB UNIQUEMENT : config_globale, pays, plans
//   Supabase   → APPLICATION : tenants, commandes, menu, livreurs, codes_promo, etc.
export type Env = {
  // ---- D1 Cloudflare : SITE WEB uniquement ----
  DB: D1Database                // Tables: config_globale, pays, plans UNIQUEMENT
  KV_CACHE?: KVNamespace        // Cache optionnel
  R2_MEDIA?: R2Bucket           // Stockage médias (logos, photos plats)
  ASSETS?: Fetcher              // Assets statiques (Workers assets binding)
  // ---- Supabase : APPLICATION (tenants, commandes, menu...) ----
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY?: string  // Pour opérations admin côté serveur
  // ---- Services tiers ----
  WHATSAPP_API_TOKEN?: string
  WHATSAPP_PHONE_ID?: string
  BREVO_API_KEY_1?: string
  BREVO_API_KEY_2?: string
  BREVO_API_KEY_3?: string
  MAPBOX_TOKEN?: string
  OPENWEATHER_API_KEY?: string
  ENVIRONMENT?: 'development' | 'production'
}

// Panier côté client (stocké en localStorage)
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
