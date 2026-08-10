// src/components/footer.ts — Pied de page principal (FR uniquement, sans dark mode)

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
          La solution qui simplifie la commande en ligne pour les restaurants. Gagnez du temps, vendez plus, sans commission.
        </p>

        <!-- Réseaux sociaux -->
        <div class="flex gap-3" aria-label="Suivez-nous sur les réseaux sociaux">
          <a href="https://facebook.com/monmenuapp"
            target="_blank" rel="noopener noreferrer"
            aria-label="Facebook ${nomProjet}"
            class="w-9 h-9 bg-gray-800 hover:bg-blue-600 rounded-lg flex items-center justify-center transition-colors">
            <i class="fa-brands fa-facebook-f text-xs" aria-hidden="true"></i>
          </a>
          <a href="https://instagram.com/monmenuapp"
            target="_blank" rel="noopener noreferrer"
            aria-label="Instagram ${nomProjet}"
            class="w-9 h-9 bg-gray-800 hover:bg-pink-600 rounded-lg flex items-center justify-center transition-colors">
            <i class="fa-brands fa-instagram text-xs" aria-hidden="true"></i>
          </a>
          <a href="https://wa.me/22677980264?text=Bonjour%20MonMenu"
            target="_blank" rel="noopener noreferrer"
            aria-label="WhatsApp ${nomProjet}"
            class="w-9 h-9 bg-gray-800 hover:bg-green-600 rounded-lg flex items-center justify-center transition-colors">
            <i class="fa-brands fa-whatsapp text-xs" aria-hidden="true"></i>
          </a>
          <a href="https://linkedin.com/company/monmenuapp"
            target="_blank" rel="noopener noreferrer"
            aria-label="LinkedIn ${nomProjet}"
            class="w-9 h-9 bg-gray-800 hover:bg-blue-700 rounded-lg flex items-center justify-center transition-colors">
            <i class="fa-brands fa-linkedin-in text-xs" aria-hidden="true"></i>
          </a>
        </div>
      </div>

      <!-- Colonne 2 : Produit -->
      <nav aria-label="Liens produit">
        <h3 class="text-white font-semibold text-sm mb-4 uppercase tracking-wide">Produit</h3>
        <ul class="space-y-2.5 text-sm">
          <li><a href="/#fonctionnalites" class="hover:text-white transition-colors">Fonctionnalités</a></li>
          <li><a href="/#tarifs" class="hover:text-white transition-colors">Tarifs</a></li>
          <li><a href="/inscription" class="hover:text-white transition-colors">Créer ma boutique</a></li>
          <li><a href="/connexion" class="hover:text-white transition-colors">Se connecter</a></li>
          <li><a href="/blog" class="hover:text-white transition-colors">Blog</a></li>
          <li><a href="/contact?sujet=partenariat" class="hover:text-white transition-colors">Devenir partenaire</a></li>
        </ul>
      </nav>

      <!-- Colonne 3 : Support -->
      <nav aria-label="Support et Aide">
        <h3 class="text-white font-semibold text-sm mb-4 uppercase tracking-wide">Aide</h3>
        <ul class="space-y-2.5 text-sm">
          <li><a href="/contact" class="hover:text-white transition-colors">Contactez-nous</a></li>
          <li><a href="/#faq" class="hover:text-white transition-colors">FAQ</a></li>
          <li><a href="mailto:contact.monmenu@gmail.com" class="hover:text-white transition-colors">Support technique</a></li>
        </ul>
      </nav>

      <!-- Colonne 4 : Légal -->
      <nav aria-label="Liens légaux">
        <h3 class="text-white font-semibold text-sm mb-4 uppercase tracking-wide">Légal</h3>
        <ul class="space-y-2.5 text-sm">
          <li><a href="/legal/cgu" class="hover:text-white transition-colors">CGU</a></li>
          <li><a href="/legal/confidentialite" class="hover:text-white transition-colors">Confidentialité</a></li>
          <li><a href="/legal/mentions" class="hover:text-white transition-colors">Mentions légales</a></li>
          <li><a href="/legal/cookies" class="hover:text-white transition-colors">Politique cookies</a></li>
        </ul>
      </nav>
    </div>

    <!-- Newsletter -->
    <div class="border-t border-gray-800 mt-12 pt-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
      <div>
        <h3 class="text-white font-semibold text-sm mb-1">Recevez nos conseils par email</h3>
        <p class="text-sm text-gray-500">Un guide pratique de temps en temps. Pas de spam.</p>
      </div>
      <form id="newsletter-form" class="flex w-full md:w-auto gap-2" onsubmit="submitNewsletterFooter(event)">
        <input type="email" id="newsletter-email" required placeholder="votre@email.com"
          class="flex-1 md:w-64 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500 transition-colors">
        <button type="submit" id="newsletter-btn"
          class="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors whitespace-nowrap">
          S'abonner
        </button>
      </form>
    </div>
    <p id="newsletter-feedback" class="hidden text-xs mt-3"></p>

    <!-- Barre de bas de footer -->
    <div class="border-t border-gray-800 mt-8 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
      <p class="text-xs text-gray-500">
        &copy; ${year} ${nomProjet}. Tous droits réservés.
      </p>
    </div>
  </div>
</footer>

<!-- Bannière cookies -->
<div id="cookie-banner" class="hidden fixed bottom-0 inset-x-0 z-[60] bg-white border-t border-gray-200 shadow-2xl">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center gap-4">
    <p class="text-sm text-gray-600 flex-1">
      Nous utilisons des cookies essentiels au fonctionnement du site et, avec votre accord, des cookies de mesure d'audience. Voir notre
      <a href="/legal/cookies" class="text-red-600 hover:underline">politique de cookies</a>.
    </p>
    <div class="flex items-center gap-2 flex-shrink-0">
      <button onclick="rejectCookies()"
        class="text-sm font-semibold px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
        Refuser
      </button>
      <button onclick="acceptCookies()"
        class="text-sm font-semibold px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white transition-colors">
        Accepter
      </button>
    </div>
  </div>
</div>

<script>
  async function submitNewsletterFooter(e) {
    e.preventDefault();
    const btn = document.getElementById('newsletter-btn');
    const emailInput = document.getElementById('newsletter-email');
    const feedback = document.getElementById('newsletter-feedback');
    const email = emailInput.value.trim();

    btn.disabled = true;
    btn.textContent = 'Envoi...';

    try {
      const res = await fetch('/api/v1/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();

      if (res.ok) {
        feedback.textContent = '✓ Inscription réussie. Merci !';
        feedback.className = 'text-xs mt-3 text-green-400';
        emailInput.value = '';
      } else {
        feedback.textContent = data.error || 'Une erreur est survenue.';
        feedback.className = 'text-xs mt-3 text-red-400';
      }
    } catch (err) {
      feedback.textContent = 'Une erreur est survenue.';
      feedback.className = 'text-xs mt-3 text-red-400';
    }

    feedback.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = "S'abonner";
  }
</script>`
}
