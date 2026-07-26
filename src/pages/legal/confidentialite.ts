export function getConfidentialiteContent(nomProjet: string, year: number) {
  return `
<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">1. Responsable du traitement</h2>
<p>Le responsable du traitement des données est l'équipe <strong>${nomProjet}</strong>, joignable via l'adresse de support officielle de la plateforme.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">2. Données collectées</h2>
<h3 class="font-semibold text-gray-800 mt-4 mb-2">Données relatives aux établissements</h3>
<ul class="list-disc pl-6 space-y-1">
  <li>Identifiants de connexion sécurisés</li>
  <li>Informations professionnelles (nom, contact, préférences de personnalisation)</li>
  <li>Contenus des menus et catalogues produits</li>
</ul>
<h3 class="font-semibold text-gray-800 mt-4 mb-2">Données relatives aux commandes clients</h3>
<ul class="list-disc pl-6 space-y-1">
  <li>Identité du client (nom/prénom)</li>
  <li>Coordonnées de contact</li>
  <li>Informations de livraison et données de localisation (si autorisées)</li>
  <li>Détails et historique des transactions</li>
</ul>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">3. Finalités du traitement</h2>
<ul class="list-disc pl-6 space-y-1">
  <li>Assurer le service de commande et de gestion en ligne</li>
  <li>Transmettre les notifications transactionnelles nécessaires</li>
  <li>Optimiser les services de livraison et de logistique</li>
  <li>Assurer le suivi et la sécurité des opérations</li>
  <li>Réaliser des analyses statistiques anonymisées pour l'amélioration du service</li>
</ul>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">4. Base légale</h2>
<p>Les traitements sont fondés sur l'exécution contractuelle, le consentement explicite pour les données de localisation, et l'intérêt légitime lié à la sécurité de la plateforme.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">5. Durée de conservation</h2>
<ul class="list-disc pl-6 space-y-1">
  <li>Données transactionnelles : conservées pour la durée légale requise</li>
  <li>Données de compte : durée de la relation contractuelle augmentée des délais de prescription</li>
  <li>Données techniques et de sécurité : durée limitée conforme aux standards du secteur</li>
</ul>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">6. Partage des données</h2>
<p>Nous faisons appel à des prestataires de confiance pour assurer l'hébergement, la sécurité, l'envoi de communications et les services de cartographie. Ces partenaires sont sélectionnés pour leur respect des normes de protection des données en vigueur.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">7. Sécurité</h2>
<p>Nous mettons en œuvre des mesures techniques rigoureuses pour protéger vos données : chiffrement des communications, sécurisation des accès et isolation stricte des données entre les différents établissements partenaires.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">8. Vos droits</h2>
<p>Conformément à la réglementation, vous disposez de droits d'accès, de rectification, de suppression et d'opposition concernant vos données personnelles. Pour toute demande, veuillez contacter notre support technique.</p>
<p class="mt-4 text-sm text-gray-400">Dernière mise à jour : juillet ${year}</p>`;
}
