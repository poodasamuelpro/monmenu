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
    <div class="bg-white border border-gray-100 rounded-3xl p-8 shadow-xl shadow-gray-100/50">
      <form id="contact-form" class="space-y-4" onsubmit="submitContact(event)">
        <div>
          <label class="block text-xs font-bold text-gray-400 uppercase mb-2 ml-1">Nom complet</label>
          <input type="text" id="contact-nom" required class="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-100 transition-all" placeholder="Votre nom">
        </div>
        <div>
          <label class="block text-xs font-bold text-gray-400 uppercase mb-2 ml-1">Email ou Téléphone</label>
          <input type="text" id="contact-email" required class="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-100 transition-all" placeholder="votre@email.com">
        </div>
        <div>
          <label class="block text-xs font-bold text-gray-400 uppercase mb-2 ml-1">Message</label>
          <textarea id="contact-message" required rows="4" class="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-100 transition-all resize-none" placeholder="Comment pouvons-nous vous aider ?"></textarea>
        </div>
        <button type="submit" id="contact-btn" class="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-xl transition-all shadow-lg">
          Envoyer le message
        </button>
        <div id="contact-feedback" class="hidden text-center p-3 rounded-xl text-xs font-medium"></div>
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
      feedback.className = 'text-green-600 bg-green-50 p-3 rounded-xl text-xs font-medium mt-4';
      feedback.classList.remove('hidden');
      e.target.reset();
      btn.disabled = false;
      btn.innerText = 'Envoyer le message';
    }
  </script>
</body>
</html>`
}
