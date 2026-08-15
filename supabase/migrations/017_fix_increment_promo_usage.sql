-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 017 — fix: increment_promo_usage — atomicité race condition B-CMD-03
-- Session 6, C1
--
-- Problème : la définition précédente (004_audit_triggers.sql) effectuait un
-- UPDATE sans vérifier usage_actuel < usage_max à l'intérieur de la même
-- opération atomique. La vérification se faisait côté JavaScript AVANT l'appel
-- RPC, ce qui ne garantit pas l'atomicité en cas de requêtes concurrentes.
--
-- Correction : la garde usage_actuel < usage_max est intégrée dans la clause
-- WHERE du UPDATE lui-même. Si la contrainte est violée par une requête
-- concurrente entre-temps, l'UPDATE ne touche aucune ligne et la fonction
-- retourne 0 (via FOUND → RETURN 1 / RETURN 0). L'appelant JS vérifie ce
-- résultat pour annuler la réduction le cas échéant.
--
-- Type de retour : INTEGER (1 = succès, 0 = limite déjà atteinte, race condition)
-- Rétrocompatibilité : l'ancienne fonction retournait void — les appelants qui
-- ignoraient la valeur de retour continuent de fonctionner sans changement.
-- Seul api-commandes.ts est mis à jour dans ce commit pour exploiter le nouveau
-- type de retour.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_promo_usage(promo_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE codes_promo
  SET usage_actuel = COALESCE(usage_actuel, 0) + 1,
      updated_at   = NOW()
  WHERE id          = promo_id
    AND COALESCE(usage_actuel, 0) < usage_max;

  -- FOUND est TRUE si au moins une ligne a été modifiée, FALSE sinon
  IF FOUND THEN
    RETURN 1;  -- succès : incrément effectué
  ELSE
    RETURN 0;  -- échec : usage_max déjà atteint ou promo introuvable (race condition)
  END IF;
END;
$$;
