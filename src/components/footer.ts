// src/components/footer.ts — Pied de page principal (i18n FR/EN)
import { getTranslations } from '../i18n'

export function renderFooter(nomProjet: string, locale: string = 'fr'): string {
  const t = getTranslations(locale)
  const year = new Date().getFullYear()

  // Variables injectées dans le JS inline via template literals
  const nlSending  = t.footer.newsletter_sending
  const nlSuccess  = t.footer.newsletter_success
  const nlError    = t.footer.newsletter_error
  const nlBtn      = t.footer.newsletter_btn

  return `
<footer class="bg-gray-900 dark:bg-black text-gray-300 transition-colors" id="main-footer" aria-label="Pied de page">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-10">

      <!-- Colonne 1 : Logo + description + réseaux sociaux -->
      <div class="col-span-2 md:col-span-1">
        <a href="/" class="flex items-center gap-2 text-white font-bold text-lg mb-3" aria-label="${nomProjet} — Retour à l'accueil">
          <i class="fa-solid fa-utensils text-red-500" aria-hidden="true"></i>
          <span>${nomProjet}</span>
        </a>
        <p class="text-sm text-gray-400 leading-relaxed mb-5">
          ${t.footer.description}
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
          <a href="https://wa.me/22600000000?text=Bonjour%20MonMenu"
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
        <h3 class="text-white font-semibold text-sm mb-4 uppercase tracking-wide">${t.footer.product_title}</h3>
        <ul class="space-y-2.5 text-sm">
          <li><a href="/#fonctionnalites" class="hover:text-white transition-colors">${t.footer.features}</a></li>
          <li><a href="/#tarifs" class="hover:text-white transition-colors">${t.footer.pricing}</a></li>
          <li><a href="/inscription" class="hover:text-white transition-colors">${t.footer.create_shop}</a></li>
          <li><a href="/connexion" class="hover:text-white transition-colors">${t.footer.login}</a></li>
          <li><a href="/blog" class="hover:text-white transition-colors">${t.footer.blog}</a></li>
          <li><a href="/contact?sujet=partenariat" class="hover:text-white transition-colors">${t.footer.partner}</a></li>
        </ul>
      </nav>

      <!-- Colonne 3 : Support -->
      <nav aria-label="Support et Aide">
        <h3 class="text-white font-semibold text-sm mb-4 uppercase tracking-wide">${t.footer.help_title}</h3>
        <ul class="space-y-2.5 text-sm">
          <li><a href="/contact" class="hover:text-white transition-colors">${t.footer.contact}</a></li>
          <li><a href="/#faq" class="hover:text-white transition-colors">${t.footer.faq}</a></li>
          <li><a href="mailto:support@monmenu.app" class="hover:text-white transition-colors">${t.footer.support}</a></li>
        </ul>
      </nav>

      <!-- Colonne 4 : Légal -->
      <nav aria-label="Liens légaux">
        <h3 class="text-white font-semibold text-sm mb-4 uppercase tracking-wide">${t.footer.legal_title}</h3>
        <ul class="space-y-2.5 text-sm">
          <li><a href="/legal/cgu" class="hover:text-white transition-colors">${t.footer.cgu}</a></li>
          <li><a href="/legal/confidentialite" class="hover:text-white transition-colors">${t.footer.privacy}</a></li>
          <li><a href="/legal/mentions" class="hover:text-white transition-colors">${t.footer.mentions}</a></li>
          <li><a href="/legal/cookies" class="hover:text-white transition-colors">${t.footer.cookies_policy}</a></li>
        </ul>
      </nav>
    </div>

    <!-- Newsletter -->
    <div class="border-t border-gray-800 mt-12 pt-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
      <div>
        <h3 class="text-white font-semibold text-sm mb-1">${t.footer.newsletter_title}</h3>
        <p class="text-sm text-gray-500">${t.footer.newsletter_desc}</p>
      </div>
      <form id="newsletter-form" class="flex w-full md:w-auto gap-2" onsubmit="submitNewsletterFooter(event)">
        <input type="email" id="newsletter-email" required placeholder="${t.footer.newsletter_placeholder}"
          class="flex-1 md:w-64 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500 transition-colors">
        <button type="submit" id="newsletter-btn"
          class="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors whitespace-nowrap">
          ${t.footer.newsletter_btn}
        </button>
      </form>
    </div>
    <p id="newsletter-feedback" class="hidden text-xs mt-3"></p>

    <!-- Barre de bas de footer -->
    <div class="border-t border-gray-800 mt-8 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
      <p class="text-xs text-gray-500">
        &copy; ${year} ${nomProjet}. ${t.footer.rights}
      </p>
    </div>
  </div>
</footer>

<!-- Bannière cookies -->
<div id="cookie-banner" class="hidden fixed bottom-0 inset-x-0 z-[60] bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-2xl">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center gap-4">
    <p class="text-sm text-gray-600 dark:text-gray-300 flex-1">
      ${t.footer.cookie_text}
      <a href="/legal/cookies" class="text-red-600 dark:text-red-400 hover:underline">${t.footer.cookie_link}</a>.
    </p>
    <div class="flex items-center gap-2 flex-shrink-0">
      <button onclick="rejectCookies()"
        class="text-sm font-semibold px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
        ${t.footer.cookie_reject}
      </button>
      <button onclick="acceptCookies()"
        class="text-sm font-semibold px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors">
        ${t.footer.cookie_accept}
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
    btn.textContent = '${nlSending}';

    try {
      const res = await fetch('/api/v1/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();

      if (res.ok) {
        feedback.textContent = '✓ ${nlSuccess}';
        feedback.className = 'text-xs mt-3 text-green-400';
        emailInput.value = '';
      } else {
        feedback.textContent = data.error || '${nlError}';
        feedback.className = 'text-xs mt-3 text-red-400';
      }
    } catch (err) {
      feedback.textContent = '${nlError}';
      feedback.className = 'text-xs mt-3 text-red-400';
    }

    feedback.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = '${nlBtn}';
  }
</script>`
}
