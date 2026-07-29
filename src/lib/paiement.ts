/**
 * src/lib/paiement.ts — Utilitaires du module paiement manuel MonMenu
 *
 * Ce module regroupe les fonctions pures utilisées par :
 *   - src/routes/api-paiement.ts (génération référence, upload preuve)
 *   - src/routes/api-cron.ts (vérification deadline 72h)
 *
 * SÉCURITÉ :
 *   - SEC-01 : le statut n'est jamais fourni par le client, toujours hardcodé
 *   - SEC-02 : validation MIME réelle par magic bytes (pas seulement l'extension)
 *   - SEC-09 : aucune donnée sensible loggée (nom de fichier, référence brute)
 *
 * @module paiement
 */

// -----------------------------------------------------------------------
// 1. Génération de la référence de paiement unique
// -----------------------------------------------------------------------

/**
 * Génère une référence de paiement unique pour un tenant.
 *
 * Format : MM-{SLUG6}-{YYYYMM}-{HEX6}
 * Exemple : MM-CHEZFT-202607-A3F9B2
 *
 * Cette référence est un AIDE-MÉMOIRE de rapprochement bancaire.
 * Elle n'autorise RIEN seule (SEC-10) — seul l'admin confirmant via
 * /api/admin/paiements/confirmer active l'abonnement.
 *
 * @param tenantSlug - Slug du tenant (ex: "chez-fatou")
 * @returns Référence formatée (ex: "MM-CHEZFT-202607-A3F9B2")
 */
export function genererReferencePaiement(tenantSlug: string): string {
  const date = new Date()
  const ym = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`

  // 3 bytes aléatoires cryptographiquement sûrs → 6 caractères hex
  const bytes = new Uint8Array(3)
  crypto.getRandomValues(bytes)
  const suffix = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase()

  // Slug nettoyé : suppression tirets, 6 premiers caractères, majuscules
  const slug = tenantSlug.replace(/-/g, '').replace(/_/g, '').slice(0, 6).toUpperCase()

  return `MM-${slug}-${ym}-${suffix}`
}

// -----------------------------------------------------------------------
// 2. Calcul de la deadline de confirmation (72h)
// -----------------------------------------------------------------------

/**
 * Calcule la deadline de confirmation à partir du moment de soumission.
 *
 * L'admin dispose de 38h (délai engagé) mais la fenêtre de tolérance
 * est de 72h avant blocage automatique du tenant par le cron.
 *
 * @param soumisLe - Date/heure de soumission de la preuve
 * @returns Date/heure limite de confirmation (soumisLe + 72h)
 */
export function calculerDeadlineConfirmation(soumisLe: Date): Date {
  return new Date(soumisLe.getTime() + 72 * 3600 * 1000)
}

/**
 * Retourne le nombre d'heures restantes avant la deadline.
 * Retourne 0 si la deadline est déjà dépassée.
 *
 * @param deadline - Date/heure limite de confirmation
 * @returns Heures restantes (entier, minimum 0)
 */
export function heuresRestantesAvantDeadline(deadline: Date): number {
  return Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 3600000))
}

/**
 * Vérifie si une deadline de confirmation est dépassée.
 *
 * @param deadline - Date/heure limite
 * @returns true si la deadline est passée et le blocage doit être appliqué
 */
export function estDeadlineDepassee(deadline: Date | string): boolean {
  const d = typeof deadline === 'string' ? new Date(deadline) : deadline
  return d.getTime() < Date.now()
}

// -----------------------------------------------------------------------
// 3. Validation MIME des fichiers uploadés (SEC-02)
// -----------------------------------------------------------------------

/**
 * Valide le type réel d'un fichier par inspection des magic bytes.
 *
 * Validations effectuées dans l'ordre (cf. SEC-02) :
 *   - Couche 3 (magic bytes) : seule validation non falsifiable
 *   - JPEG : FF D8 FF (premiers 3 octets)
 *   - PNG  : 89 50 4E 47 (premiers 4 octets)
 *
 * @param buffer - Contenu du fichier (ArrayBuffer)
 * @returns Objet avec { valide: boolean, type: 'jpeg' | 'png' | null }
 */
export async function validerMimeImage(
  buffer: ArrayBuffer
): Promise<{ valide: boolean; type: 'jpeg' | 'png' | null }> {
  if (buffer.byteLength < 4) {
    return { valide: false, type: null }
  }

  const bytes = new Uint8Array(buffer.slice(0, 4))

  // JPEG : FF D8 FF
  const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF

  // PNG : 89 50 4E 47
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47

  if (isJpeg) return { valide: true, type: 'jpeg' }
  if (isPng) return { valide: true, type: 'png' }
  return { valide: false, type: null }
}

/**
 * Valide l'extension d'un fichier image (filtre préalable, couche 1).
 *
 * @param filename - Nom du fichier fourni par le client
 * @returns true si l'extension est jpg, jpeg ou png (insensible à la casse)
 */
export function validerExtensionImage(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase()
  return ['jpg', 'jpeg', 'png'].includes(ext ?? '')
}

/**
 * Valide le Content-Type déclaré du fichier (couche 2).
 *
 * @param contentType - Content-Type déclaré dans le multipart/form-data
 * @returns true si le MIME déclaré est image/jpeg ou image/png
 */
export function validerContentTypeImage(contentType: string | null): boolean {
  return ['image/jpeg', 'image/png'].includes(contentType ?? '')
}

// -----------------------------------------------------------------------
// 4. Construction de la clé R2 pour les preuves de paiement
// -----------------------------------------------------------------------

/**
 * Construit la clé de stockage R2 pour une preuve de paiement.
 *
 * La clé est construite CÔTÉ SERVEUR uniquement (jamais dépendante
 * du nom fourni par l'utilisateur) — cf. SEC-02, SEC-09.
 *
 * @param tenantId - UUID du tenant
 * @param imageType - Type d'image ('jpeg' | 'png')
 * @returns Clé R2 au format "paiements/{tenantId}/{uuid}.{ext}"
 */
export function construireCleR2Preuve(tenantId: string, imageType: 'jpeg' | 'png'): string {
  const ext = imageType === 'png' ? 'png' : 'jpg'
  // Utilise crypto.randomUUID() — disponible dans Cloudflare Workers
  return `paiements/${tenantId}/${crypto.randomUUID()}.${ext}`
}

// -----------------------------------------------------------------------
// 5. Formatage des messages de notification
// -----------------------------------------------------------------------

/**
 * Formate une date en format humain français court.
 *
 * @param dateIso - Date ISO 8601
 * @returns Ex: "15 juillet 2026"
 */
export function formaterDate(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

/**
 * Formate un montant avec devise.
 *
 * @param montant - Montant numérique
 * @param devise - Code devise (défaut: FCFA)
 * @returns Ex: "18 000 FCFA"
 */
export function formaterMontant(montant: number, devise = 'FCFA'): string {
  return `${montant.toLocaleString('fr-FR')} ${devise}`
}
