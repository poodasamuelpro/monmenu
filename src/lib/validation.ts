/**
 * src/lib/validation.ts — Fonctions de validation partagées MonMenu
 *
 * B8 — session-5 : Ce module consolide les deux implémentations divergentes
 * de `validerMimeImage()` qui existaient dans le projet :
 *
 *   • api-dashboard.ts (Corr#12) : version SYNCHRONE, retourne string|null,
 *     supporte JPEG/PNG/GIF/WebP (12 octets lus).
 *   • lib/paiement.ts : version ASYNC (retour Promise), retourne
 *     { valide: boolean; type: 'jpeg'|'png'|null }, ne supporte que JPEG/PNG
 *     (4 octets lus), pas de GIF ni de WebP.
 *
 * La version unifiée ici est la VERSION ÉTENDUE (12 octets, JPEG/PNG/GIF/WebP,
 * synchrone). Elle retourne le MIME string complet ou null (cohérent avec
 * l'usage dans api-dashboard.ts, qui est le site principal).
 *
 * MIGRATION :
 *   - api-dashboard.ts : la fonction locale `validerMimeImage` est supprimée,
 *     l'import vient de ce module.
 *   - lib/paiement.ts : la fonction `validerMimeImage` locale est conservée
 *     telle quelle pour ne pas casser l'interface existante
 *     (retour Promise<{valide, type}>). Un commentaire de dépréciation y est
 *     ajouté renvoyant vers ce module.
 *   - api-paiement.ts : utilise toujours lib/paiement.validerMimeImage (pas
 *     de changement d'appel — seul le commentaire lib/paiement.ts change).
 *
 * La convergence complète (faire migrer api-paiement.ts vers ce module)
 * est documentée comme tâche future : elle implique de changer la signature
 * de retour de l'appelant dans api-paiement.ts, hors périmètre session-5.
 *
 * @module validation
 */

// -----------------------------------------------------------------------
// 1. Validation MIME image par magic bytes (version unifiée)
// -----------------------------------------------------------------------

/**
 * Valide le type réel d'un fichier image en inspectant ses magic bytes.
 *
 * Formats reconnus :
 *   - JPEG  : FF D8 FF          (3 premiers octets)
 *   - PNG   : 89 50 4E 47       (4 premiers octets)
 *   - GIF   : 47 49 46 38       (4 premiers octets — GIF87a ou GIF89a)
 *   - WebP  : 52 49 46 46 ?? ?? ?? ?? 57 45 42 50 (octets 0-3 + 8-11)
 *
 * Cette validation est non-falsifiable par le client (contrairement à
 * file.type / Content-Type déclaré) — cf. SEC-02.
 *
 * @param buffer - Contenu du fichier (ArrayBuffer, minimum 12 octets)
 * @returns MIME string ('image/jpeg'|'image/png'|'image/gif'|'image/webp')
 *          ou null si non reconnu ou buffer trop court.
 */
export function validerMimeImageUnifie(buffer: ArrayBuffer): string | null {
  if (buffer.byteLength < 4) return null

  const bytes = new Uint8Array(buffer.slice(0, 12))

  // JPEG : FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'image/jpeg'
  }

  // PNG : 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 &&
      bytes[2] === 0x4E && bytes[3] === 0x47) {
    return 'image/png'
  }

  // GIF : 47 49 46 38 (GIF87a = 39h, GIF89a = 61h — tous deux acceptés)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 &&
      bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif'
  }

  // WebP : RIFF (52 49 46 46) + 4 octets taille + WEBP (57 45 42 50)
  // Nécessite au moins 12 octets
  if (buffer.byteLength >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 &&
      bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 &&
      bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp'
  }

  return null
}

// -----------------------------------------------------------------------
// 2. Validation UUID v4 (partagée entre plusieurs routes)
// -----------------------------------------------------------------------

/**
 * Vérifie qu'une chaîne est un UUID v4 valide.
 *
 * Pattern : xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * où x est un chiffre hexa et y est 8, 9, a ou b.
 *
 * Utilisé par : api-admin-paiements.ts (B-ADPAY-05), api-blog.ts (B-BLOG-01)
 *
 * @param str - Chaîne à valider
 * @returns true si c'est un UUID v4 valide (insensible à la casse)
 */
export function estUuidValide(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}
