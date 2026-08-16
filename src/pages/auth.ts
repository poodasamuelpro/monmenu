// src/pages/auth.ts — Connexion + Création de compte (pages séparées)
// §2 — Migration cookies httpOnly : les fetch() vers /api/v1/auth/*
// utilisent désormais credentials:'include' pour que le navigateur envoie
// et accepte le cookie httpOnly posé par le serveur. Le token n'est plus
// stocké dans localStorage (il n'est de toute façon plus lisible en JS
// puisqu'il est httpOnly) — seules les infos non sensibles du tenant
// (nom, slug, couleur) restent en localStorage pour un affichage rapide.
import { renderHead } from '../components/head'

// ==============================
// PAGE CONNEXION
// ==============================
export function renderConnexionPage(nomProjet: string, nonce: string = ''): string {
  return `${renderHead(
    `Connexion — ${nomProjet}`,
    `Accédez à votre tableau de bord restaurant ${nomProjet}.`,
    nomProjet,
    `<meta name="robots" content="noindex, nofollow">`
  )}
<body class="font-sans bg-gray-50 min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-md">
    <!-- Logo -->
    <div class="text-center mb-8">
      <a href="/" class="inline-flex items-center gap-2 text-red-600 font-bold text-2xl hover:text-red-700 transition-colors">
        <i class="fa-solid fa-utensils"></i>
        <span>${nomProjet}</span>
      </a>
      <p class="text-gray-500 mt-2 text-sm">Espace restaurant</p>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <h1 class="text-xl font-bold text-gray-900 mb-2">Connexion</h1>
      <p class="text-sm text-gray-500 mb-6">Accédez à votre tableau de bord.</p>

      <form id="login-form" class="space-y-4">
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
          <input id="login-email" type="email" required autocomplete="email"
            class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition-colors"
            placeholder="contact@monrestaurant.com">
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">Mot de passe</label>
          <div class="relative">
            <input id="login-password" type="password" required autocomplete="current-password"
              class="w-full border border-gray-200 rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition-colors"
              placeholder="••••••••">
            <button type="button" id="toggle-pwd-btn" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <i id="pwd-icon" class="fa-regular fa-eye text-sm"></i>
            </button>
          </div>
          <div class="text-right mt-1">
            <a href="/mot-de-passe-oublie" class="text-xs text-red-600 hover:underline">Mot de passe oublié ?</a>
          </div>
        </div>

        <p id="login-error" class="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 hidden"></p>

        <button type="submit" id="login-btn"
          class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
          <i class="fa-solid fa-right-to-bracket"></i>
          <span>Se connecter</span>
        </button>
      </form>

      <div class="mt-6 pt-6 border-t border-gray-100 text-center space-y-2">
        <p class="text-sm text-gray-600">Pas encore de compte ?</p>
        <a href="/inscription"
          class="inline-flex items-center gap-2 border border-red-200 text-red-600 font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-red-50 transition-colors">
          <i class="fa-solid fa-store text-xs"></i>
          Créer ma boutique gratuitement
        </a>
      </div>
    </div>

    <p class="text-center text-xs text-gray-400 mt-6">
      <a href="/" class="hover:underline">← Retour au site</a>
    </p>
  </div>

  <script nonce="${nonce}">
    document.addEventListener('DOMContentLoaded', function() {
      var toggleBtn = document.getElementById('toggle-pwd-btn');
      if (toggleBtn) toggleBtn.addEventListener('click', function() {
        var input = document.getElementById('login-password');
        var icon = document.getElementById('pwd-icon');
        input.type = input.type === 'password' ? 'text' : 'password';
        icon.className = input.type === 'password' ? 'fa-regular fa-eye text-sm' : 'fa-regular fa-eye-slash text-sm';
      });
      var loginForm = document.getElementById('login-form');
      if (loginForm) loginForm.addEventListener('submit', handleLogin);
    });

    async function handleLogin(e) {
      e.preventDefault();
      const btn = document.getElementById('login-btn');
      const errEl = document.getElementById('login-error');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i><span>Connexion...</span>';
      errEl.classList.add('hidden');

      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;

      try {
        // §2 — credentials:'include' permet au navigateur d'accepter le
        // cookie httpOnly posé par le serveur (Set-Cookie sur la réponse).
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          // Le token vit désormais dans un cookie httpOnly — plus besoin
          // (et plus possible) de le stocker en JS. On garde uniquement
          // les infos d'affichage non sensibles du tenant.
          if (data.tenant) localStorage.setItem('monmenu_tenant', JSON.stringify(data.tenant));
          window.location.href = '/dashboard/commandes';
        } else {
          errEl.textContent = data.error || 'Identifiants incorrects.';
          errEl.classList.remove('hidden');
        }
      } catch {
        errEl.textContent = 'Erreur de connexion. Réessayez.';
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i><span>Se connecter</span>';
      }
    }
  </script>
</body>
</html>`
}

// ==============================
// PAGE CRÉATION DE COMPTE
// ==============================
export function renderCreerComptePage(nomProjet: string, nonce: string = ''): string {
  return `${renderHead(
    `Créer un compte — ${nomProjet}`,
    `Créez votre compte restaurant sur ${nomProjet} et commencez à recevoir des commandes en ligne.`,
    nomProjet,
    `<meta name="robots" content="index, follow">`
  )}
<body class="font-sans bg-gray-50 min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-md">
    <!-- Logo -->
    <div class="text-center mb-8">
      <a href="/" class="inline-flex items-center gap-2 text-red-600 font-bold text-2xl hover:text-red-700 transition-colors">
        <i class="fa-solid fa-utensils"></i>
        <span>${nomProjet}</span>
      </a>
      <p class="text-gray-500 mt-2 text-sm">Créez votre boutique en 2 minutes</p>
    </div>

    <!-- Avantages rapides -->
    <div class="grid grid-cols-3 gap-2 mb-6">
      <div class="bg-white border border-gray-100 rounded-xl p-3 text-center">
        <div class="text-lg font-extrabold text-red-600 mb-0.5">0%</div>
        <div class="text-xs text-gray-500">Commission</div>
      </div>
      <div class="bg-white border border-gray-100 rounded-xl p-3 text-center">
        <div class="text-lg font-extrabold text-red-600 mb-0.5">5min</div>
        <div class="text-xs text-gray-500">Pour démarrer</div>
      </div>
      <div class="bg-white border border-gray-100 rounded-xl p-3 text-center">
        <div class="text-lg font-extrabold text-red-600 mb-0.5">1 mois</div>
        <div class="text-xs text-gray-500">Offert</div>
      </div>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <h1 class="text-xl font-bold text-gray-900 mb-6">Créer mon compte</h1>

      <form id="register-form" class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">Prénom <span class="text-red-500">*</span></label>
            <input id="reg-prenom" type="text" required minlength="2" maxlength="50"
              class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition-colors"
              placeholder="Fatou">
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">Nom <span class="text-red-500">*</span></label>
            <input id="reg-nom" type="text" required minlength="2" maxlength="50"
              class="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition-colors"
              placeholder="Traoré">
          </div>
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">
            Nom du restaurant <span class="text-red-500">*</span>
          </label>
          <input id="reg-restaurant" type="text" required minlength="2" maxlength="100"
            class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition-colors"
            placeholder="Chez Fatou, La Bonne Table...">
          <div class="mt-1.5 text-xs text-gray-400">
            URL : monmenu.com/<span id="slug-display" class="text-red-600 font-semibold">votre-restaurant</span>
          </div>
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">
            WhatsApp restaurant <span class="text-red-500">*</span>
          </label>
          <input id="reg-whatsapp" type="tel" required
            class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition-colors"
            placeholder="+226 70 00 00 00">
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">
            Email <span class="text-red-500">*</span>
          </label>
          <input id="reg-email" type="email" required autocomplete="email"
            class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition-colors"
            placeholder="contact@monrestaurant.com">
        </div>

        <div>
          <label class="block text-sm font-semibold text-gray-700 mb-1.5">
            Mot de passe <span class="text-red-500">*</span>
          </label>
          <div class="relative">
            <input id="reg-password" type="password" required minlength="8" autocomplete="new-password"
              class="w-full border border-gray-200 rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition-colors"
              placeholder="8 caractères minimum">
            <button type="button" id="reg-toggle-pwd" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <i id="reg-eye" class="fa-regular fa-eye text-sm"></i>
            </button>
          </div>
        </div>

        <div class="flex items-start gap-3">
          <input id="reg-cgu" type="checkbox" required class="mt-0.5 rounded border-gray-300 text-red-600">
          <label for="reg-cgu" class="text-xs text-gray-600">
            J'accepte les <a href="/legal/cgu" target="_blank" class="text-red-600 hover:underline">CGU</a>
            et la <a href="/legal/confidentialite" target="_blank" class="text-red-600 hover:underline">Politique de confidentialité</a>.
          </label>
        </div>

        <p id="reg-error" class="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 hidden"></p>
        <p id="reg-success" class="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2 hidden"></p>

        <button type="submit" id="reg-btn"
          class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
          <i class="fa-solid fa-store"></i>
          <span>Créer mon compte gratuitement</span>
        </button>
      </form>

      <div class="mt-6 pt-6 border-t border-gray-100 text-center">
        <p class="text-sm text-gray-600">
          Déjà un compte ?
          <a href="/dashboard" class="text-red-600 font-semibold hover:underline">Se connecter</a>
        </p>
      </div>
    </div>

    <p class="text-center text-xs text-gray-400 mt-6">
      <a href="/" class="hover:underline">← Retour au site</a>
    </p>
  </div>

  <script nonce="${nonce}">
    document.addEventListener('DOMContentLoaded', function() {
      var regRestaurant = document.getElementById('reg-restaurant');
      if (regRestaurant) regRestaurant.addEventListener('input', updateSlug);
      var regTogglePwd = document.getElementById('reg-toggle-pwd');
      if (regTogglePwd) regTogglePwd.addEventListener('click', togglePwd);
      var registerForm = document.getElementById('register-form');
      if (registerForm) registerForm.addEventListener('submit', handleRegister);
    });

    function updateSlug() {
      const nom = document.getElementById('reg-restaurant').value;
      const slug = nom
        .toLowerCase()
        .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
        .replace(/[^a-z0-9\\s-]/g, '')
        .replace(/\\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        || 'votre-restaurant';
      document.getElementById('slug-display').textContent = slug;
    }

    function togglePwd() {
      const icon = document.getElementById('reg-eye');
      input.type = input.type === 'password' ? 'text' : 'password';
      icon.className = input.type === 'password' ? 'fa-regular fa-eye text-sm' : 'fa-regular fa-eye-slash text-sm';
    }

    async function handleRegister(e) {
      e.preventDefault();
      const btn = document.getElementById('reg-btn');
      const errEl = document.getElementById('reg-error');
      const successEl = document.getElementById('reg-success');
      errEl.classList.add('hidden');
      successEl.classList.add('hidden');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i><span>Création en cours...</span>';

      const payload = {
        nom_restaurant: document.getElementById('reg-restaurant').value.trim(),
        nom_gerant: (document.getElementById('reg-prenom').value.trim() + ' ' + document.getElementById('reg-nom').value.trim()).trim(),
        whatsapp_number: document.getElementById('reg-whatsapp').value.trim(),
        email: document.getElementById('reg-email').value.trim(),
        password: document.getElementById('reg-password').value
      };

      try {
        // §2 — credentials:'include' pour accepter le cookie httpOnly
        // posé par le serveur si la session est créée immédiatement.
        const res = await fetch('/api/v1/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.success) {
          if (data.tenant) {
            // Session immédiate (cookie déjà posé par le serveur) : on
            // garde uniquement les infos d'affichage non sensibles.
            localStorage.setItem('monmenu_tenant', JSON.stringify(data.tenant));
            successEl.textContent = 'Compte créé ! Redirection vers votre tableau de bord...';
            successEl.classList.remove('hidden');
            setTimeout(() => { window.location.href = '/dashboard/commandes'; }, 2000);
          } else {
            successEl.textContent = 'Compte créé ! Vérifiez votre email pour confirmer, puis connectez-vous.';
            successEl.classList.remove('hidden');
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
        btn.innerHTML = '<i class="fa-solid fa-store"></i><span>Créer mon compte gratuitement</span>';
      }
    }
  </script>
</body>
</html>`
}
