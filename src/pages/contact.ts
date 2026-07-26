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
    `Contactez l'équipe ${nomProjet}. Support réactif par WhatsApp ou email.`,
    nomProjet
  )}
<body class="font-sans bg-white text-gray-900">
  ${renderNav(nomProjet, 'contact')}

  <main class="max-w-4xl mx-auto px-4 py-20">
    <div class="text-center mb-16">
      <h1 class="text-4xl font-extrabold text-gray-900 mb-4">Contactez-nous</h1>
      <p class="text-gray-500 text-lg max-w-xl mx-auto">
        Une question ou besoin d'assistance ? Notre équipe vous répond rapidement du lundi au samedi.
      </p>
    </div>

    <div class="grid md:grid-cols-2 gap-12">
      <!-- Informations de contact -->
      <div class="space-y-8">
        <div>
          <h2 class="text-sm font-bold text-red-600 uppercase tracking-widest mb-4">Canaux directs</h2>
          <div class="space-y-4">
            <a href="${waLink}" target="_blank" class="flex items-center gap-4 p-4 rounded-2xl bg-green-50 border border-green-100 hover:border-green-300 transition-colors group">
              <div class="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center text-white shadow-sm">
                <i class="fa-brands fa-whatsapp text-2xl"></i>
              </div>
              <div>
                <div class="font-bold text-gray-900">WhatsApp Support</div>
                <div class="text-sm text-green-700">Réponse en moins d'une heure</div>
              </div>
            </a>
            <a href="mailto:support@monmenu.app" class="flex items-center gap-4 p-4 rounded-2xl bg-blue-50 border border-blue-100 hover:border-blue-300 transition-colors group">
              <div class="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-sm">
                <i class="fa-regular fa-envelope text-xl"></i>
              </div>
              <div>
                <div class="font-bold text-gray-900">Email</div>
                <div class="text-sm text-blue-700">support@monmenu.app</div>
              </div>
            </a>
          </div>
        </div>

        <div>
          <h2 class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Disponibilité</h2>
          <div class="flex items-center gap-3 text-gray-600">
            <i class="fa-solid fa-clock text-gray-300"></i>
            <span class="text-sm">Lundi au Samedi : 08h00 — 20h00 (GMT)</span>
          </div>
        </div>
      </div>

      <!-- Formulaire simplifié -->
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
