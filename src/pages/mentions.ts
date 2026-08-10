export function getMentionsContent(nomProjet: string, year: number) {
  return `
<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Éditeur du site</h2>
<p><strong>${nomProjet}</strong><br>
Plateforme de services numériques pour la restauration<br>
Siège social : Ouagadougou, Burkina Faso<br>
Contact : <a href="mailto:contact.monmenu@gmail.com" class="text-red-600 hover:underline">contact.monmenu@gmail.com</a></p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Hébergement et Infrastructure</h2>
<p>La plateforme est hébergée sur des infrastructures cloud de premier plan, garantissant une haute disponibilité et une sécurité optimale des données, avec des serveurs situés dans des centres de données sécurisés.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Propriété intellectuelle</h2>
<p>L'ensemble du contenu de ce site (textes, architecture, design, logos) est protégé par les lois sur la propriété intellectuelle. Toute reproduction ou exploitation non autorisée est strictement interdite.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Données personnelles</h2>
<p>Pour plus d'informations sur la gestion de vos données, veuillez consulter notre <a href="/legal/confidentialite" class="text-red-600 hover:underline">Politique de Confidentialité</a>.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Cookies</h2>
<p>La gestion des traceurs est détaillée dans notre <a href="/legal/cookies" class="text-red-600 hover:underline">Politique de Cookies</a>.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Limitation de responsabilité</h2>
<p>${nomProjet} s'efforce de fournir des informations exactes et un service continu. Toutefois, nous ne saurions être tenus responsables en cas d'interruptions indépendantes de notre volonté ou d'erreurs mineures dans les contenus publiés.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Droit applicable</h2>
<p>Le présent site est régi par le droit burkinabè. Tout différend sera porté devant les juridictions compétentes de Ouagadougou.</p>
<p class="mt-4 text-sm text-gray-400">Dernière mise à jour : juillet ${year}</p>`;
}
