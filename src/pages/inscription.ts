// src/pages/inscription.ts
import { renderHead } from '../components/head'
import { renderNav } from '../components/nav'
import { renderFooter } from '../components/footer'

export function renderInscriptionPage(nomProjet: string): string {
  return `${renderHead(
    `Créer ma boutique gratuite — ${nomProjet}`,
    `Inscrivez votre restaurant sur ${nomProjet} et commencez à recevoir des commandes en ligne. Gratuit, sans engagement, prêt en 5 minutes.`,
    nomProjet,
    `<meta name="robots" content="index, follow">`
  )}
<body class="font-sans bg-gray-50 min-h-screen">
  ${renderNav(nomProjet, '')}

  <section class="py-16">
    <div class="max-w-lg mx-auto px-4">
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-14 h-14 bg-red-100 rounded-2xl mb-4">
          <i class="fa-solid fa-store text-red-600 text-2xl"></i>
        </div>
        <h1 class="text-3xl font-extrabold text-gray-900 mb-2">Créez votre boutique</h1>
        <p class="text-gray-600">Gratuit le premier mois. Aucune carte bancaire requise.</p>
      </div>

      <!-- Étapes -->
      <div class="flex items-center justify-center gap-2 mb-8">
        <div class="flex items-center gap-1.5 text-xs">
          <span class="step-indicator w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-xs">1</span>
          <span class="font-semibold text-gray-900">Informations</span>
        </div>
        <div class="h-px w-8 bg-gray-300"></div>
        <div class="flex items-center gap-1.5 text-xs">
          <span class="w-6 h-6 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center font-bold text-xs">2</span>
          <span class="text-gray-400">Confirmation</span>
        </div>
        <div class="h-px w-8 bg-gray-300"></div>
        <div class="flex items-center gap-1.5 text-xs">
          <span class="w-6 h-6 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center font-bold text-xs">3</span>
          <span class="text-gray-400">Dashboard</span>
        </div>
      </div>

      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <form id="inscription-form" class="space-y-5" onsubmit="handleInscription(event)">
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">
              Nom du restaurant <span class="text-red-500">*</span>
            </label>
            <input id="reg-nom-restaurant" type="text" required minlength="2" maxlength="100"
              class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition-colors"
              placeholder="Chez Fatou, La Bonne Table..."
              oninput="updateSlugPreview()">
          </div>

          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">
              Votre prénom et nom <span class="text-red-500">*</span>
            </label>
            <input id="reg-nom-gerant" type="text" required minlength="2" maxlength="100"
              class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition-colors"
              placeholder="Fatou Traoré">
          </div>

          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">
              Numéro WhatsApp du restaurant <span class="text-red-500">*</span>
            </label>
            <input id="reg-whatsapp" type="tel" required
              class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition-colors"
              placeholder="+226 70 00 00 00">
            <p class="text-xs text-gray-400 mt-1">Les commandes arriveront sur ce numéro WhatsApp.</p>
          </div>

          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">
              Email professionnel <span class="text-red-500">*</span>
            </label>
            <input id="reg-email" type="email" required
              class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition-colors"
              placeholder="contact@monrestaurant.com">
          </div>

          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">
              Mot de passe <span class="text-red-500">*</span>
            </label>
            <div class="relative">
              <input id="reg-password" type="password" required minlength="8"
                class="w-full border border-gray-200 rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition-colors"
                placeholder="8 caractères minimum">
              <button type="button" onclick="togglePwd()" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <i id="reg-eye" class="fa-regular fa-eye text-sm"></i>
              </button>
            </div>
          </div>

          <!-- URL de la boutique preview -->
          <div class="bg-gray-50 border border-gray-100 rounded-xl p-4">
            <div class="text-xs font-semibold text-gray-500 mb-1">
              <i class="fa-solid fa-link text-gray-400 mr-1"></i>
              Votre URL de boutique
            </div>
            <div class="text-sm font-bold text-gray-900">
              monmenu.app/<span id="slug-preview" class="text-red-600">votre-restaurant</span>
            </div>
          </div>

          <div class="flex items-start gap-3">
            <input id="reg-cgu" type="checkbox" required
              class="mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-200">
            <label for="reg-cgu" class="text-xs text-gray-600">
              J'accepte les <a href="/legal/cgu" target="_blank" class="text-red-600 hover:underline">Conditions Générales d'Utilisation</a>
              et la <a href="/legal/confidentialite" target="_blank" class="text-red-600 hover:underline">Politique de confidentialité</a>.
            </label>
          </div>

          <p id="reg-error" class="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 hidden"></p>
          <p id="reg-success" class="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2 hidden"></p>

          <button type="submit" id="reg-btn"
            class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2">
            <i class="fa-solid fa-store"></i>
            <span>Créer ma boutique gratuitement</span>
          </button>
        </form>

        <div class="mt-6 pt-6 border-t border-gray-100 text-center">
          <p class="text-sm text-gray-600">
            Déjà un compte ?
            <a href="/dashboard" class="text-red-600 font-semibold hover:underline">Se connecter</a>
          </p>
        </div>
      </div>

      <!-- Garanties -->
      <div class="grid grid-cols-3 gap-4 mt-6 text-center">
        <div class="text-xs text-gray-500">
          <i class="fa-solid fa-lock text-gray-400 text-base block mb-1"></i>
          Données sécurisées
        </div>
        <div class="text-xs text-gray-500">
          <i class="fa-solid fa-credit-card-alt text-gray-400 text-base block mb-1"></i>
          Sans carte bancaire
        </div>
        <div class="text-xs text-gray-500">
          <i class="fa-solid fa-rotate-left text-gray-400 text-base block mb-1"></i>
          Sans engagement
        </div>
      </div>
    </div>
  </section>

  ${renderFooter(nomProjet)}
  <script src="/static/js/main.js"></script>
  <script>
    function updateSlugPreview() {
      const nom = document.getElementById('reg-nom-restaurant').value;
      const slug = nom
        .toLowerCase()
        .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
        .replace(/[^a-z0-9\\s-]/g, '')
        .replace(/\\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'votre-restaurant';
      document.getElementById('slug-preview').textContent = slug;
    }

    function togglePwd() {
      const input = document.getElementById('reg-password');
      const icon = document.getElementById('reg-eye');
      input.type = input.type === 'password' ? 'text' : 'password';
      icon.className = input.type === 'password' ? 'fa-regular fa-eye text-sm' : 'fa-regular fa-eye-slash text-sm';
    }

    async function handleInscription(e) {
      e.preventDefault();
      const btn = document.getElementById('reg-btn');
      const errEl = document.getElementById('reg-error');
      const successEl = document.getElementById('reg-success');
      errEl.classList.add('hidden');
      successEl.classList.add('hidden');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i><span>Création en cours...</span>';

      const payload = {
        nom_restaurant: document.getElementById('reg-nom-restaurant').value.trim(),
        nom_gerant: document.getElementById('reg-nom-gerant').value.trim(),
        whatsapp_number: document.getElementById('reg-whatsapp').value.trim(),
        email: document.getElementById('reg-email').value.trim(),
        password: document.getElementById('reg-password').value
      };

      try {
        const res = await fetch('/api/v1/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
          if (data.access_token) {
            localStorage.setItem('monmenu_auth_token', data.access_token);
            if (data.refresh_token) localStorage.setItem('monmenu_refresh_token', data.refresh_token);
            if (data.tenant) localStorage.setItem('monmenu_tenant', JSON.stringify(data.tenant));
            successEl.textContent = data.message || 'Compte créé ! Redirection vers votre tableau de bord...';
            successEl.classList.remove('hidden');
            e.target.reset();
            setTimeout(() => { window.location.href = '/dashboard/commandes'; }, 2000);
          } else {
            successEl.textContent = 'Compte créé ! Vérifiez votre email pour confirmer, puis connectez-vous.';
            successEl.classList.remove('hidden');
            e.target.reset();
            setTimeout(() => { window.location.href = '/dashboard'; }, 3000);
          }
        } else {
          errEl.textContent = data.error || 'Erreur lors de la création du compte.';
          errEl.classList.remove('hidden');
        }
      } catch {
        errEl.textContent = 'Erreur de connexion. Réessayez.';
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-store"></i><span>Créer ma boutique gratuitement</span>';
      }
    }
  </script>
</body>
</html>`
}
