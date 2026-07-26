export function getCookiesContent(nomProjet: string, year: number) {
  return `
<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Qu'est-ce qu'un cookie ?</h2>
<p>Un cookie est un petit fichier déposé sur votre appareil lors de la navigation sur un site internet, permettant d'améliorer votre expérience utilisateur.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Utilisation des traceurs par ${nomProjet}</h2>
<h3 class="font-semibold text-gray-800 mt-5 mb-2">Traceurs strictement nécessaires</h3>
<div class="overflow-x-auto">
  <table class="w-full text-sm border border-gray-100 rounded-xl overflow-hidden">
    <thead class="bg-gray-50">
      <tr>
        <th class="text-left px-4 py-2 font-semibold text-gray-700">Fonction</th>
        <th class="text-left px-4 py-2 font-semibold text-gray-700">Finalité</th>
        <th class="text-left px-4 py-2 font-semibold text-gray-700">Durée</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-gray-50">
      <tr>
        <td class="px-4 py-2">Consentement</td>
        <td class="px-4 py-2 text-gray-600">Mémorisation de vos choix en matière de cookies</td>
        <td class="px-4 py-2 text-gray-500">12 mois</td>
      </tr>
      <tr>
        <td class="px-4 py-2">Session</td>
        <td class="px-4 py-2 text-gray-600">Maintien de la connexion sécurisée à votre espace de gestion</td>
        <td class="px-4 py-2 text-gray-500">Session</td>
      </tr>
      <tr>
        <td class="px-4 py-2">Panier</td>
        <td class="px-4 py-2 text-gray-600">Conservation temporaire des articles sélectionnés pour la commande</td>
        <td class="px-4 py-2 text-gray-500">24 heures</td>
      </tr>
    </tbody>
  </table>
</div>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Traceurs de services tiers</h2>
<p>Certaines fonctionnalités de notre plateforme font appel à des services externes qui peuvent déposer des traceurs pour assurer leur bon fonctionnement :</p>
<ul class="list-disc pl-6 mt-2 space-y-1">
  <li>Services de cartographie pour la localisation des livraisons</li>
  <li>Systèmes de protection contre les accès automatisés malveillants</li>
</ul>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Gérer vos préférences</h2>
<p>Vous pouvez modifier vos choix à tout moment via le bandeau de gestion des cookies ou en configurant les paramètres de votre navigateur internet.</p>
<div class="flex gap-3 mt-6">
  <button onclick="acceptCookies(); window.location.reload();"
    class="bg-red-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-red-700 transition-colors">
    Accepter les cookies
  </button>
  <button onclick="rejectCookies(); window.location.reload();"
    class="border border-gray-300 text-gray-700 font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">
    Refuser les cookies non essentiels
  </button>
</div>
<p class="mt-4 text-sm text-gray-400">Dernière mise à jour : juillet ${year}</p>`;
}
