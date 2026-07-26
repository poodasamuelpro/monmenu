export function getCGUContent(nomProjet: string, year: number) {
  return `
<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">1. Objet</h2>
<p>Les présentes Conditions Générales d'Utilisation (CGU) régissent l'utilisation de la plateforme <strong>${nomProjet}</strong>, accessible à l'adresse monmenu.app, opérée par l'équipe ${nomProjet}.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">2. Services proposés</h2>
<p>${nomProjet} est une plateforme de services permettant aux restaurants et établissements de restauration d'Afrique de l'Ouest et Centrale de :</p>
<ul class="list-disc pl-6 mt-2 space-y-1">
  <li>Créer une boutique de commande en ligne accessible sans inscription pour leurs clients</li>
  <li>Recevoir des notifications de commandes via des services de messagerie instantanée</li>
  <li>Gérer leur menu, leurs commandes et leurs statistiques via un tableau de bord sécurisé</li>
  <li>Générer des outils de communication pour faciliter l'accès à leur boutique</li>
</ul>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">3. Accès au service</h2>
<p>L'inscription est réservée aux professionnels de la restauration. Les clients finaux commandent sans créer de compte. Le restaurant s'engage à fournir des informations exactes lors de l'inscription.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">4. Responsabilités</h2>
<p>Le restaurant est responsable :</p>
<ul class="list-disc pl-6 mt-2 space-y-1">
  <li>De l'exactitude des informations de son menu (prix, disponibilité)</li>
  <li>De la traçabilité et du traitement des commandes reçues</li>
  <li>Du respect des obligations légales locales (hygiène, fiscalité, etc.)</li>
  <li>De la confidentialité de ses identifiants de connexion</li>
</ul>
<p class="mt-3">${nomProjet} est responsable de :</p>
<ul class="list-disc pl-6 mt-2 space-y-1">
  <li>La disponibilité de la plateforme (objectif de continuité de service de 99,5%)</li>
  <li>La sécurité et la protection des données stockées</li>
  <li>Le bon acheminement des notifications de commande</li>
</ul>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">5. Tarification</h2>
<p>Les tarifs sont ceux affichés sur la page dédiée au moment de l'inscription. Sauf mention contraire, l'abonnement est mensuel et sans engagement de durée.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">6. Modalités financières</h2>
<p>${nomProjet} ne prélève aucune commission sur les ventes réalisées par les restaurants. Seul un abonnement fixe est facturé. Des frais peuvent s'appliquer selon le volume d'activité conformément au plan souscrit.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">7. Résiliation</h2>
<p>Le restaurant peut mettre fin à son abonnement à tout moment depuis son espace de gestion. Les données sont conservées pour une durée limitée avant suppression définitive conformément à notre politique de confidentialité.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">8. Propriété intellectuelle</h2>
<p>L'ensemble des éléments constituant la plateforme ${nomProjet} est la propriété exclusive de ses éditeurs. Le restaurant conserve l'entière propriété de ses propres contenus (images, descriptifs, menus).</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">9. Droit applicable</h2>
<p>Les présentes CGU sont soumises au droit burkinabè. Tout litige relatif à leur interprétation ou exécution sera soumis aux tribunaux compétents de Ouagadougou.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">10. Modification</h2>
<p>Les présentes conditions peuvent être mises à jour. Les utilisateurs seront informés de toute modification substantielle par les canaux de communication habituels.</p>
<p class="mt-4 text-sm text-gray-400">Dernière mise à jour : juillet ${year}</p>`;
}
