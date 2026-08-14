-- Migration 015 — Harmonisation limite_pdv = 1 pour tous les plans
-- Session 3 — Correction #3
--
-- Contexte : le plan Pro avait limite_pdv = 3 et Premium = 10.
-- La fonctionnalité multi-PDV n'étant pas prévue, on aligne tous les plans
-- sur limite_pdv = 1. Aucun code n'applique cette limite en runtime (pas
-- de vérification bloquante), donc cette migration ne casse rien pour les
-- tenants existants qui auraient créé plusieurs PDV.
-- La valeur est corrigée pour cohérence des données uniquement.

UPDATE plans SET limite_pdv = 1 WHERE limite_pdv != 1;
