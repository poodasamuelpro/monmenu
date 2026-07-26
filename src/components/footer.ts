// =============================================================
// COMPOSANT FOOTER — Pied de page principal
// Affiché sur toutes les pages publiques du site
// =============================================================

export function renderFooter(nomProjet: string): string {
  const year = new Date().getFullYear()

  return `
<footer class="bg-gray-900 text-gray-300" id="main-footer" aria-label="Pied de page">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-10">

      <!-- Colonne 1 : Logo + description + réseaux sociaux -->
      <div class="col-span-2 md:col-span-1">
        <a href="/" class="flex items-center gap-2 text-white font-bold text-lg mb-3" aria-label="${nomProjet} — Retour à l'accueil">
          <i class="fa-solid fa-utensils text-red-500" aria-hidden="true"></i>
          <span>${nomProjet}</span>
        </a>
        <p class="text-sm text-gray-400 leading-relaxed mb-5">
          La plateforme de commande en ligne pour les restaurants d'Afrique de l'Ouest et Centrale. Sans commission sur vos ventes.
        </p>

        <!-- Réseaux sociaux -->
        <div class="flex gap-3" aria-label="Suivez-nous sur les réseaux sociaux">
          <a href="https://facebook.com/monmenuapp"
            target="_blank" rel="noopener noreferrer"
            aria-label="Facebook MonMenu"
            class="w-9 h-9 bg-gray-800 hover:bg-blue-600 rounded-lg flex items-center justify-center transition-colors">
            <i class="fa-brands fa-facebook-f text-xs" aria-hidden="true"></i>
          </a>
          <a href="https://instagram.com/monmenuapp"
            target="_blank" rel="noopener noreferrer"
            aria-label="Instagram MonMenu"
            class="w-9 h-9 bg-gray-800 hover:bg-pink-600 rounded-lg flex items-center justify-center transition-colors">
            <i class="fa-brands fa-instagram text-xs" aria-hidden="true"></i>
          </a>
          <a href="https://wa.me/22600000000?text=Bonjour%20MonMenu"
            target="_blank" rel="noopener noreferrer"
            aria-label="WhatsApp MonMenu"
            class="w-9 h-9 bg-gray-800 hover:bg-green-600 rounded-lg flex items-center justify-center transition-colors">
            <i class="fa-brands fa-whatsapp text-xs" aria-hidden="true"></i>
          </a>
          <a href="https://linkedin.com/company/monmenuapp"
            target="_blank" rel="noopener noreferrer"
            aria-label="LinkedIn MonMenu"
            class="w-9 h-9 bg-gray-800 hover:bg-blue-700 rounded-lg flex items-center justify-center transition-colors">
            <i class="fa-brands fa-linkedin-in text-xs" aria-hidden="true"></i>
          </a>
        </div>
      </div>

      <!-- Colonne 2 : Produit -->
      <nav aria-label="Liens produit">
        <h3 class="text-white font-semibold text-sm mb-4 uppercase tracking-wide">Produit</h3>
        <ul class="space-y-2.5 text-sm">
          <li><a href="/fonctionnalites" class="hover:text-white transition-colors">Fonctionnalités</a></li>
          <li><a href="/tarifs" class="hover:text-white transition-colors">Tarifs</a></li>
          <li><a href="/inscription" class="hover:text-white transition-colors">Créer ma boutique</a></li>
          <li><a href="/dashboard" class="hover:text-white transition-colors">Se connecter</a></li>
          <li><a href="/blog" class="hover:text-white transition-colors">Blog</a></li>
        </ul>
      </nav>

      <!-- Colonne 3 : Pays couverts -->
      <nav aria-label="Pays couverts">
        <h3 class="text-white font-semibold text-sm mb-4 uppercase tracking-wide">Pays</h3>
        <ul class="space-y-2.5 text-sm">
          <li><span class="text-gray-400 flex items-center gap-1.5"><i class="fa-solid fa-circle text-green-500 text-xs" aria-hidden="true"></i> Burkina Faso</span></li>
          <li><span class="text-gray-500 flex items-center gap-1.5"><i class="fa-solid fa-circle text-yellow-500 text-xs" aria-hidden="true"></i> Côte d'Ivoire <span class="text-xs text-gray-600 ml-1">(bientôt)</span></span></li>
          <li><span class="text-gray-500 flex items-center gap-1.5"><i class="fa-solid fa-circle text-yellow-500 text-xs" aria-hidden="true"></i> Cameroun <span class="text-xs text-gray-600 ml-1">(bientôt)</span></span></li>
          <li><span class="text-gray-500 flex items-center gap-1.5"><i class="fa-solid fa-circle text-yellow-500 text-xs" aria-hidden="true"></i> Sénégal <span class="text-xs text-gray-600 ml-1">(bientôt)</span></span></li>
          <li><a href="/contact" class="text-red-400 hover:text-red-300 transition-colors text-xs flex items-center gap-1 mt-2"><i class="fa-solid fa-plus text-xs" aria-hidden="true"></i> Votre pays bientôt</a></li>
        </ul>
      </nav>

      <!-- Colonne 4 : Légal + Contact -->
      <nav aria-label="Liens légaux">
        <h3 class="text-white font-semibold text-sm mb-4 uppercase tracking-wide">Légal</h3>
        <ul class="space-y-2.5 text-sm">
          <li><a href="/legal/cgu" class="hover:text-white transition-colors">CGU</a></li>
          <li><a href="/legal/confidentialite" class="hover:text-white transition-colors">Confidentialité</a></li>
          <li><a href="/legal/mentions" class="hover:text-white transition-colors">Mentions légales</a></li>
          <li><a href="/legal/cookies" class="hover:text-white transition-colors">Politique cookies</a></li>
          <li class="pt-2 border-t border-gray-800 mt-1">
            <a href="/contact" class="hover:text-white transition-colors">Contact support</a>
          </li>
          <li>
            <a href="mailto:support@monmenu.app" class="hover:text-white transition-colors text-xs">
              support@monmenu.app
            </a>
          </li>
        </ul>
      </nav>
    </div>

    <!-- Barre de bas de footer -->
    <div class="border-t border-gray-800 mt-12 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
      <p class="text-xs text-gray-500">
        &copy; ${year} ${nomProjet}. Tous droits réservés.
      </p>
      <div class="flex items-center gap-4 text-xs text-gray-500">
        <span class="flex items-center gap-1.5">
          <i class="fa-solid fa-heart text-red-500 text-xs" aria-hidden="true"></i>
          Fait avec rigueur pour l'Afrique
        </span>
        <span class="hidden sm:inline">·</span>
        <span class="hidden sm:inline">v2.0</span>
      </div>
    </div>
  </div>
</footer>`
}
