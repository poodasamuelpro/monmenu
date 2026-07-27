// src/pages/forgot-password.ts — Page de récupération de mot de passe par OTP (§1.7)
import { renderHead } from '../components/head'

export function renderForgotPasswordPage(nomProjet: string): string {
  return `${renderHead(
    `Mot de passe oublié — ${nomProjet}`,
    `Récupérez l'accès à votre tableau de bord ${nomProjet} via un code OTP envoyé par email.`,
    nomProjet,
    '',
    'https://monmenu.app/mot-de-passe-oublie'
  )}
<body class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4 transition-colors">
  <div class="w-full max-w-md">

    <!-- Logo -->
    <div class="text-center mb-8">
      <a href="/" class="inline-flex items-center gap-2 text-red-600 font-bold text-2xl">
        <i class="fa-solid fa-utensils"></i>
        <span>${nomProjet}</span>
      </a>
    </div>

    <!-- Étape 1 : Saisie email -->
    <div id="step-email" class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-8">
      <h1 class="text-xl font-bold text-gray-900 dark:text-white mb-1">Mot de passe oublié</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Entrez votre adresse email. Nous vous enverrons un code OTP à 6 chiffres.
      </p>
      <form id="form-email" onsubmit="sendOtp(event)" class="space-y-4">
        <div>
          <label class="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
            Adresse email
          </label>
          <input id="input-email" type="email" required autocomplete="email"
            class="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 placeholder-gray-400 dark:placeholder-gray-500"
            placeholder="vous@restaurant.com">
        </div>
        <p id="email-error" class="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 hidden"></p>
        <button type="submit" id="btn-send-otp"
          class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
          <i class="fa-solid fa-paper-plane"></i>
          <span>Envoyer le code OTP</span>
        </button>
      </form>
      <div class="mt-4 text-center">
        <a href="/dashboard" class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">
          <i class="fa-solid fa-arrow-left mr-1"></i> Retour à la connexion
        </a>
      </div>
    </div>

    <!-- Étape 2 : Saisie OTP -->
    <div id="step-otp" class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 hidden">
      <h1 class="text-xl font-bold text-gray-900 dark:text-white mb-1">Entrez votre code</h1>
      <p id="otp-hint" class="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Code OTP envoyé à votre adresse.
      </p>
      <form id="form-otp" onsubmit="verifyOtp(event)" class="space-y-4">
        <div>
          <label class="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
            Code OTP à 6 chiffres
          </label>
          <input id="input-otp" type="text" required pattern="[0-9]{6}" maxlength="6" inputmode="numeric" autocomplete="one-time-code"
            class="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
            placeholder="000000">
        </div>
        <p id="otp-error" class="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 hidden"></p>
        <button type="submit" id="btn-verify-otp"
          class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
          <i class="fa-solid fa-check"></i>
          <span>Vérifier le code</span>
        </button>
      </form>
      <button onclick="goBack('step-email')" class="mt-4 w-full text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 transition-colors">
        <i class="fa-solid fa-arrow-left mr-1"></i> Changer d'adresse
      </button>
    </div>

    <!-- Étape 3 : Nouveau mot de passe -->
    <div id="step-password" class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 hidden">
      <h1 class="text-xl font-bold text-gray-900 dark:text-white mb-1">Nouveau mot de passe</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">Choisissez un mot de passe sécurisé (8 caractères minimum).</p>
      <form id="form-password" onsubmit="resetPassword(event)" class="space-y-4">
        <div>
          <label class="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
            Nouveau mot de passe
          </label>
          <div class="relative">
            <input id="input-password" type="password" required minlength="8" autocomplete="new-password"
              class="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 placeholder-gray-400 dark:placeholder-gray-500"
              placeholder="Minimum 8 caractères">
            <button type="button" onclick="togglePwd()" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <i id="pwd-icon" class="fa-regular fa-eye text-sm"></i>
            </button>
          </div>
        </div>
        <p id="pwd-error" class="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 hidden"></p>
        <button type="submit" id="btn-reset-pwd"
          class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
          <i class="fa-solid fa-lock"></i>
          <span>Enregistrer le nouveau mot de passe</span>
        </button>
      </form>
    </div>

    <!-- Étape 4 : Succès -->
    <div id="step-success" class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 text-center hidden">
      <div class="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
        <i class="fa-solid fa-check text-green-600 dark:text-green-400 text-2xl"></i>
      </div>
      <h1 class="text-xl font-bold text-gray-900 dark:text-white mb-2">Mot de passe mis à jour</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Votre mot de passe a bien été modifié. Vous pouvez maintenant vous connecter.
      </p>
      <a href="/dashboard"
        class="inline-block bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-3 rounded-xl transition-colors">
        <i class="fa-solid fa-right-to-bracket mr-2"></i>Se connecter
      </a>
    </div>

  </div>

  <script src="/static/js/main.js"></script>
  <script>
    let otpEmail = ''
    let otpAccessToken = ''

    function showStep(id) {
      ['step-email','step-otp','step-password','step-success'].forEach(s => {
        document.getElementById(s).classList.add('hidden')
      })
      document.getElementById(id).classList.remove('hidden')
    }

    function goBack(step) { showStep(step) }

    function showError(elId, msg) {
      const el = document.getElementById(elId)
      if (el) { el.textContent = msg; el.classList.remove('hidden') }
    }
    function hideError(elId) {
      const el = document.getElementById(elId)
      if (el) el.classList.add('hidden')
    }

    function setLoading(btnId, loading) {
      const btn = document.getElementById(btnId)
      if (!btn) return
      btn.disabled = loading
      btn.style.opacity = loading ? '0.6' : '1'
    }

    async function sendOtp(e) {
      e.preventDefault()
      hideError('email-error')
      otpEmail = document.getElementById('input-email').value.trim()
      setLoading('btn-send-otp', true)
      try {
        const r = await fetch('/api/v1/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: otpEmail })
        })
        // Toujours afficher step-otp (message générique)
        document.getElementById('otp-hint').textContent =
          'Code OTP envoyé à ' + otpEmail + '. Vérifiez vos spams si besoin.'
        showStep('step-otp')
        document.getElementById('input-otp').focus()
      } catch {
        showError('email-error', 'Erreur réseau. Réessayez.')
      } finally {
        setLoading('btn-send-otp', false)
      }
    }

    async function verifyOtp(e) {
      e.preventDefault()
      hideError('otp-error')
      const token = document.getElementById('input-otp').value.trim()
      setLoading('btn-verify-otp', true)
      try {
        const r = await fetch('/api/v1/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: otpEmail, token })
        })
        const data = await r.json()
        if (!r.ok) { showError('otp-error', data.error || 'Code invalide.'); return }
        otpAccessToken = data.access_token
        showStep('step-password')
        document.getElementById('input-password').focus()
      } catch {
        showError('otp-error', 'Erreur réseau. Réessayez.')
      } finally {
        setLoading('btn-verify-otp', false)
      }
    }

    async function resetPassword(e) {
      e.preventDefault()
      hideError('pwd-error')
      const password = document.getElementById('input-password').value
      if (password.length < 8) { showError('pwd-error', 'Minimum 8 caractères.'); return }
      setLoading('btn-reset-pwd', true)
      try {
        const r = await fetch('/api/v1/auth/reset-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + otpAccessToken
          },
          body: JSON.stringify({ password })
        })
        const data = await r.json()
        if (!r.ok) { showError('pwd-error', data.error || 'Erreur.'); return }
        showStep('step-success')
      } catch {
        showError('pwd-error', 'Erreur réseau. Réessayez.')
      } finally {
        setLoading('btn-reset-pwd', false)
      }
    }

    function togglePwd() {
      const inp = document.getElementById('input-password')
      const ico = document.getElementById('pwd-icon')
      inp.type = inp.type === 'password' ? 'text' : 'password'
      ico.className = inp.type === 'password' ? 'fa-regular fa-eye text-sm' : 'fa-regular fa-eye-slash text-sm'
    }
  </script>
</body>
</html>`
}
