// =============================================================
// PAGE CONTACT — Épurée et Professionnelle
// =============================================================
import { renderHead } from '../components/head'
import { renderNav } from '../components/nav'
import { renderFooter } from '../components/footer'

export function renderContactPage(nomProjet: string, whatsappSupport: string = ''): string {
  const waNumber = whatsappSupport.replace(/[^0-9]/g, '')
  const waLink = waNumber
    ? `https://wa.me/${waNumber}?text=Bonjour%20${encodeURIComponent(nomProjet)}`
    : 'https://wa.me/22600000000'

  return `${renderHead(
    `Contact — ${nomProjet}`,
    `Contactez l'équipe ${nomProjet} par WhatsApp, email ou via le formulaire.`,
    nomProjet
  )}
<body class="font-sans bg-white text-gray-900">
  ${renderNav(nomProjet, 'contact')}

  <main class="max-w-3xl mx-auto px-4 py-20">
    <div class="text-center mb-14">
      <h1 class="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Contactez-nous</h1>
      <p class="text-gray-500 max-w-lg mx-auto">
        Une question ? Notre équipe vous répond du lundi au samedi, 08h00 — 20h00.
      </p>
    </div>

    <div class="grid sm:grid-cols-2 gap-4 mb-12">
      <a href="${waLink}" target="_blank" rel="noopener noreferrer"
        class="flex items-center gap-4 p-5 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors">
        <div class="w-11 h-11 bg-gray-900 rounded-lg flex items-center justify-center text-white flex-shrink-0">
          <i class="fa-brands fa-whatsapp text-lg" aria-hidden="true"></i>
        </div>
        <div>
          <div class="font-semibold text-gray-900 text-sm">WhatsApp</div>
          <div class="text-xs text-gray-500">Réponse sous une heure</div>
        </div>
      </a>
      <a href="mailto:support@monmenu.app"
        class="flex items-center gap-4 p-5 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors">
        <div class="w-11 h-11 bg-gray-900 rounded-lg flex items-center justify-center text-white flex-shrink-0">
          <i class="fa-regular fa-envelope text-base" aria-hidden="true"></i>
        </div>
        <div>
          <div class="font-semibold text-gray-900 text-sm">Email</div>
          <div class="text-xs text-gray-500">support@monmenu.app</div>
        </div>
      </a>
    </div>

    <!-- Formulaire -->
    <div class="border border-gray-200 rounded-2xl p-8">
      <form id="contact-form" class="space-y-5" onsubmit="submitContact(event)">
        <div class="grid sm:grid-cols-2 gap-5">
          <div>
            <label for="contact-nom" class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Nom complet</label>
            <input type="text" id="contact-nom" required
              class="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors"
              placeholder="Votre nom">
          </div>
          <div>
            <label for="contact-email" class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Email ou téléphone</label>
            <input type="text" id="contact-email" required
              class="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors"
              placeholder="votre@email.com">
          </div>
        </div>
        <div>
          <label for="contact-message" class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Message</label>
          <textarea id="contact-message" required rows="5"
            class="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-colors resize-none"
            placeholder="Comment pouvons-nous vous aider ?"></textarea>
        </div>
        <button type="submit" id="contact-btn"
          class="w-full bg-gray-900 hover:bg-black text-white font-semibold py-3 rounded-lg transition-colors">
          Envoyer le message
        </button>
        <div id="contact-feedback" class="hidden text-center text-sm font-medium"></div>
      </form>
    </div>
  </main>

  ${renderFooter(nomProjet)}
  <script>
    async function submitContact(e) {
      e.preventDefault();
      const btn = document.getElementById('contact-btn');
      const feedback = document.getElementById('contact-feedback');
      btn.disabled = true;
      btn.innerText = 'Envoi...';

      // Simulation
      await new Promise(r => setTimeout(r, 1000));

      feedback.innerText = '✓ Message envoyé. Nous vous répondrons très bientôt.';
      feedback.className = 'text-green-600 text-sm font-medium text-center mt-2';
      feedback.classList.remove('hidden');
      e.target.reset();
      btn.disabled = false;
      btn.innerText = 'Envoyer le message';
    }
  </script>
</body>
</html>`
}
