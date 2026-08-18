-- Migration 024 — Numéros de paiement réels (MonMenu)
-- But : remplacer les numéros de démonstration (+226 70/71 00 00 00)
-- par les vrais numéros de réception MonMenu.
--
-- Impact si non faite : les restaurants voient des faux numéros
-- sur la page paiement (une fois l'affichage bienvenue.ts corrigé).
-- Risque : faible — UPDATE ciblé sur code UNIQUE, aucune structure changée.
--
-- Auteur : 2026-08-18

-- Orange Money (code 'orange_money')
UPDATE moyens_paiement
SET
  numero = '+226 77 98 02 64',
  nom_compte = 'MonMenu Burkina',
  updated_at = NOW()
WHERE code = 'orange_money';

-- Moov Money (code 'mobile_money')
UPDATE moyens_paiement
SET
  numero = '+226 52 00 37 62',
  nom_compte = 'MonMenu Burkina',
  updated_at = NOW()
WHERE code = 'mobile_money';
