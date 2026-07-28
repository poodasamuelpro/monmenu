// =============================================================
// PAGE CONTACT
// =============================================================
import { renderHead } from '../components/head'
import { renderNav } from '../components/nav'
import { renderFooter } from '../components/footer'
import { getTranslations } from '../i18n'

export function renderContactPage(nomProjet: string, whatsappSupport: string = '', locale: string = 'fr'): string {
  const t = getTranslations(locale)
  const isEn = locale === 'en'
  const waNumber = whatsappSupport.replace(/[^0-9]/g, '')
  const waLink = waNumber
    ? `https://wa.me/${waNumber}?text=${isEn ? 'Hello' : 'Bonjour'}%20${encodeURIComponent(nomProjet)}%2C%20${isEn ? 'I+have+a+question' : 'j%27ai+une+question'}%20:`
    : 'https://wa.me/22600000000'

  return `${renderHead(
    `${t.contact.title} — ${nomProjet}`,
    isEn
      ? `Contact the ${nomProjet} team. English & French support, fast response via WhatsApp or email. Available Monday to Saturday.`
      : `Contactez l'équipe ${nomProjet}. Support en français, réponse rapide par WhatsApp ou email. Disponible du lundi au samedi.`,
    nomProjet
  )}
<body class="font-sans bg-white text-gray-900">
  ${renderNav(nomProjet, 'contact', locale)}

  <!-- Hero -->
  <section class="py-16 bg-gradient-to-b from-gray-50 to-white" aria-labelledby="contact-hero-heading">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 text-center">
      <h1 id="contact-hero-heading" class="text-4xl font-extrabold text-gray-900 mb-4">
        ${isEn ? 'How can we help you?' : 'Comment pouvons-nous vous aider ?'}
      </h1>
      <p class="text-gray-600 text-lg max-w-xl mx-auto">
        ${isEn
          ? 'Our team responds in French and English, Monday to Saturday, 8am–8pm (GMT+0). Response within 48 hours maximum.'
          : 'Notre équipe répond en français du lundi au samedi, de 8h à 20h (GMT+0). Réponse sous 48h maximum.'}
      </p>
    </div>
  </section>

  <!-- Canaux de contact -->
  <section class="pb-12" aria-labelledby="channels-heading">
    <div class="max-w-3xl mx-auto px-4 sm:px-6">
      <div class="sr-only" id="channels-heading">Canaux de contact</div>
      <div class="grid sm:grid-cols-2 gap-4 mb-8">

        <!-- WhatsApp -->
        <a href="${waLink}" target="_blank" rel="noopener noreferrer"
          class="border border-green-200 bg-green-50 rounded-xl p-5 flex flex-col items-center text-center hover:shadow-md transition-all group hover:border-green-400">
          <div class="w-14 h-14 bg-green-500 rounded-2xl flex items-center justify-center text-white mb-3 shadow-md shadow-green-200 group-hover:scale-105 transition-transform">
            <i class="fa-brands fa-whatsapp text-3xl" aria-hidden="true"></i>
          </div>
          <div class="font-bold text-gray-900 mb-1">WhatsApp</div>
          <div class="text-sm text-gray-600 mb-2">${isEn ? 'Fastest response' : 'Réponse la plus rapide'}</div>
          <div class="text-xs text-green-600 font-semibold">${isEn ? 'Usually < 1h' : 'Généralement &lt; 1h'}</div>
        </a>

        <!-- Email -->
        <a href="mailto:support@monmenu.app"
          class="border border-blue-200 bg-blue-50 rounded-xl p-5 flex flex-col items-center text-center hover:shadow-md transition-all group hover:border-blue-400">
          <div class="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white mb-3 shadow-md shadow-blue-200 group-hover:scale-105 transition-transform">
            <i class="fa-regular fa-envelope text-2xl" aria-hidden="true"></i>
          </div>
          <div class="font-bold text-gray-900 mb-1">Email</div>
          <div class="text-sm text-gray-600 mb-2">support@monmenu.app</div>
          <div class="text-xs text-blue-600 font-semibold">${isEn ? 'Response within 24h' : 'Réponse sous 24h'}</div>
        </a>
      </div>

      <!-- Formulaire de contact -->
      <div class="bg-gray-50 rounded-2xl p-8 border border-gray-100" aria-labelledby="form-heading">
        <h2 id="form-heading" class="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <i class="fa-solid fa-paper-plane text-red-500" aria-hidden="true"></i>
          ${t.contact.send}
        </h2>

        <form id="contact-form" class="space-y-5" onsubmit="submitContact(event)" novalidate>
          <div class="grid sm:grid-cols-2 gap-4">
            <div>
              <label for="contact-nom" class="block text-sm font-semibold text-gray-700 mb-1.5">
                ${t.contact.name} <span class="text-red-500" aria-hidden="true">*</span>
              </label>
              <input id="contact-nom" name="nom" type="text" required autocomplete="name"
                class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 bg-white transition-colors"
                placeholder="${isEn ? 'Fatou Traore' : 'Fatou Traoré'}">
            </div>
            <div>
              <label for="contact-email" class="block text-sm font-semibold text-gray-700 mb-1.5">
                ${isEn ? 'Email or phone' : 'Email ou téléphone'} <span class="text-red-500" aria-hidden="true">*</span>
              </label>
              <input id="contact-email" name="email" type="text" required autocomplete="email"
                class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 bg-white transition-colors"
                placeholder="contact@myrestaurant.com">
            </div>
          </div>

          <div>
            <label for="contact-profil" class="block text-sm font-semibold text-gray-700 mb-1.5">${isEn ? 'I am' : 'Je suis'}</label>
            <select id="contact-profil" name="profil"
              class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 bg-white transition-colors">
              <option value="restaurant">${isEn ? 'A restaurant owner or manager' : 'Un restaurateur (propriétaire ou gérant)'}</option>
              <option value="client">${isEn ? 'A customer' : 'Un client final'}</option>
              <option value="partenaire">${isEn ? 'A business partner' : 'Un partenaire commercial'}</option>
              <option value="investisseur">${isEn ? 'An investor' : 'Un investisseur'}</option>
              <option value="autre">${isEn ? 'Other' : 'Autre'}</option>
            </select>
          </div>

          <div>
            <label for="contact-sujet" class="block text-sm font-semibold text-gray-700 mb-1.5">${t.contact.subject}</label>
            <select id="contact-sujet" name="sujet"
              class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 bg-white transition-colors">
              <option value="support">${isEn ? 'Technical support' : 'Support technique'}</option>
              <option value="inscription">${isEn ? 'Question about registration' : "Question sur l'inscription"}</option>
              <option value="tarifs">${isEn ? 'Question about pricing' : 'Question sur les tarifs'}</option>
              <option value="enterprise">${isEn ? 'Enterprise plan / volume' : 'Plan Enterprise / volume'}</option>
              <option value="partenariat">${isEn ? 'Partnership' : 'Partenariat'}</option>
              <option value="autre">${isEn ? 'Other' : 'Autre'}</option>
            </select>
          </div>

          <div>
            <label for="contact-message" class="block text-sm font-semibold text-gray-700 mb-1.5">
              ${t.contact.message} <span class="text-red-500" aria-hidden="true">*</span>
            </label>
            <textarea id="contact-message" name="message" required rows="5"
              class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 bg-white resize-none transition-colors"
              placeholder="${isEn ? 'Describe your question or issue...' : 'Décrivez votre question ou problème...'}"></textarea>
          </div>

          <div id="contact-feedback" class="hidden px-4 py-3 rounded-xl text-sm" role="alert"></div>

          <button type="submit" id="contact-btn"
            class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2">
            <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
            <span>${t.contact.send}</span>
          </button>

          <p class="text-xs text-gray-400 text-center">
            ${isEn ? 'Your data will not be shared. See our' : 'Vos données ne seront pas partagées. Voir notre'}
            <a href="/legal/confidentialite" class="hover:text-red-600 transition-colors underline">${isEn ? 'privacy policy' : 'politique de confidentialité'}</a>.
          </p>
        </form>
      </div>

      <!-- Blog & Guides — mention discrète -->
      <p class="text-center text-sm text-gray-500 mt-8">
        ${isEn ? 'Looking for a tutorial or advice?' : 'Vous cherchez plutôt un tutoriel ou un conseil ?'}
        <a href="/blog" class="text-red-600 font-semibold hover:underline">${isEn ? 'Visit our blog' : 'Consultez notre blog'}</a>.
      </p>
    </div>
  </section>

  ${renderFooter(nomProjet)}
  <script src="/static/js/main.js"></script>
  <script>
    async function submitContact(e) {
      e.preventDefault();
      const btn = document.getElementById('contact-btn');
      const feedback = document.getElementById('contact-feedback');

      btn.disabled = true;
      const sendingLabel = '${isEn ? 'Sending...' : 'Envoi en cours...'}';
      btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i><span>' + sendingLabel + '</span>';
      feedback.classList.add('hidden');

      const nom = document.getElementById('contact-nom').value.trim();
      const email = document.getElementById('contact-email').value.trim();
      const message = document.getElementById('contact-message').value.trim();

      if (!nom || !email || !message) {
        feedback.textContent = '${isEn ? 'Please fill in all required fields.' : 'Veuillez remplir tous les champs obligatoires.'}';
        feedback.className = 'px-4 py-3 rounded-xl text-sm bg-red-50 text-red-700 border border-red-200';
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i><span>${t.contact.send}</span>';
        return;
      }

      // Simulation envoi (à relier à une vraie API ou Brevo)
      await new Promise(r => setTimeout(r, 1500));

      feedback.textContent = '${isEn ? '✓ Message sent successfully. We will reply within 24 hours to: ' : '✓ Message envoyé avec succès. Nous vous répondrons dans les 24 heures à l\\'adresse : '}' + email;
      feedback.className = 'px-4 py-3 rounded-xl text-sm bg-green-50 text-green-700 border border-green-200';
      feedback.classList.remove('hidden');
      e.target.reset();
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i><span>${t.contact.send}</span>';
    }

    // Pré-remplir le sujet si passé en query param
    const urlParams = new URLSearchParams(window.location.search);
    const sujet = urlParams.get('sujet');
    if (sujet) {
      const select = document.getElementById('contact-sujet');
      if (select) {
        const opt = Array.from(select.options).find(o => o.value === sujet);
        if (opt) select.value = sujet;
      }
    }
  </script>
</body>
</html>`
}
