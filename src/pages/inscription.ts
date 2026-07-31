// src/pages/inscription.ts
// §2 — Migration cookies httpOnly : fetch('/api/v1/auth/register') utilise
// désormais credentials:'include' pour accepter le cookie httpOnly posé
// par le serveur. Le token n'est plus stocké en localStorage.
// BUG-010 + Feat B — Grille plans dynamique + ?plan= pre-fill + plan_id transmis
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
    <div class="max-w-2xl mx-auto px-4">
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

      <!-- Feat B : Sélection de plan — affiché dynamiquement selon ?plan= et l'API -->
      <div id="section-plans" class="mb-8 hidden">
        <h2 class="text-lg font-bold text-gray-900 mb-1 text-center">Choisissez votre formule</h2>
        <p class="text-sm text-gray-500 text-center mb-5">Vous pouvez changer de plan à tout moment depuis votre tableau de bord.</p>
        <div id="grille-plans" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <!-- Injecté par JS -->
          <div class="col-span-full flex justify-center py-6">
            <i class="fa-solid fa-circle-notch fa-spin text-red-400 text-2xl"></i>
          </div>
        </div>
      </div>

      <!-- Badge plan sélectionné (affiché si ?plan= présent et valide) -->
      <div id="badge-plan-selectionne" class="hidden mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
        <i class="fa-solid fa-circle-check text-red-600 text-lg flex-shrink-0"></i>
        <div>
          <p class="text-sm font-semibold text-gray-900">Plan sélectionné : <span id="badge-plan-nom" class="text-red-600">—</span></p>
          <p class="text-xs text-gray-500 mt-0.5">Vous pourrez passer à un autre plan depuis votre tableau de bord.</p>
        </div>
        <button type="button" onclick="afficherGrillePlans()" class="ml-auto text-xs text-gray-400 hover:text-red-600 underline flex-shrink-0">Changer</button>
      </div>

      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <!-- Champ caché pour plan_id -->
        <input type="hidden" id="reg-plan-id" value="">

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
            class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
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
    // ─── Feat B : Gestion plans ───────────────────────────────────────────────
    // Cache plans chargés depuis l'API
    var _inscriptionPlans = []

    // Sélectionner un plan dans la grille et mettre à jour le champ caché
    function selectionnerPlan(planId, planNom) {
      document.getElementById('reg-plan-id').value = planId
      // Mettre à jour visuellement les cartes
      document.querySelectorAll('.plan-card').forEach(function(card) {
        if (card.dataset.planId === planId) {
          card.classList.add('ring-2', 'ring-red-500', 'border-red-400', 'bg-red-50')
          card.classList.remove('border-gray-200')
          card.querySelector('.plan-check').classList.remove('hidden')
        } else {
          card.classList.remove('ring-2', 'ring-red-500', 'border-red-400', 'bg-red-50')
          card.classList.add('border-gray-200')
          card.querySelector('.plan-check').classList.add('hidden')
        }
      })
      // Mettre à jour le badge
      document.getElementById('badge-plan-nom').textContent = planNom
      document.getElementById('badge-plan-selectionne').classList.remove('hidden')
      // Masquer la grille après sélection
      document.getElementById('section-plans').classList.add('hidden')
    }

    // Afficher la grille plans (bouton "Changer" dans le badge)
    function afficherGrillePlans() {
      document.getElementById('section-plans').classList.remove('hidden')
      document.getElementById('badge-plan-selectionne').classList.add('hidden')
      document.getElementById('reg-plan-id').value = ''
    }

    // Construire une carte plan
    function construireCartePlan(plan, estSelectionne) {
      var devise = plan.devise || 'FCFA'
      var prixMensuel = plan.prix_mensuel || 0
      var isGratuit = prixMensuel === 0
      var badgeGratuit = isGratuit
        ? '<span class="absolute top-3 right-3 text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Gratuit</span>'
        : ''
      var ringClasses = estSelectionne
        ? 'ring-2 ring-red-500 border-red-400 bg-red-50'
        : 'border-gray-200'
      var checkClasses = estSelectionne ? '' : 'hidden'
      var features = []
      try { features = typeof plan.fonctionnalites === 'string' ? JSON.parse(plan.fonctionnalites) : (plan.fonctionnalites || []) }
      catch { features = [] }
      var featuresHtml = features.slice(0, 4).map(function(f) {
        return '<li class="flex items-center gap-1.5 text-xs text-gray-600"><i class="fa-solid fa-check text-green-500 text-xs flex-shrink-0"></i>' + String(f).replace(/</g,'&lt;') + '</li>'
      }).join('')
      if (features.length > 4) {
        featuresHtml += '<li class="text-xs text-gray-400">+' + (features.length - 4) + ' autres...</li>'
      }
      return '<div class="plan-card relative border rounded-xl p-5 cursor-pointer transition-all ' + ringClasses + '" data-plan-id="' + plan.id + '" onclick="selectionnerPlan(' + "'" + plan.id + "'" + ', ' + "'" + (plan.nom || '').replace(/'/g,"\\'") + "'" + ')">' +
        badgeGratuit +
        '<i class="plan-check fa-solid fa-circle-check text-red-600 absolute top-3 left-3 ' + checkClasses + '"></i>' +
        '<h3 class="font-bold text-gray-900 text-base mb-1 mt-1">' + (plan.nom || '').replace(/</g,'&lt;') + '</h3>' +
        '<div class="text-2xl font-extrabold text-red-600 mb-3">' +
          (isGratuit ? 'Gratuit' : prixMensuel.toLocaleString() + ' <span class="text-sm font-semibold text-gray-500">' + devise + '/mois</span>') +
        '</div>' +
        (featuresHtml ? '<ul class="space-y-1.5">' + featuresHtml + '</ul>' : '') +
        '</div>'
    }

    // Charger les plans depuis l'API et afficher la grille
    async function chargerEtAfficherPlans(planIdPreselect) {
      try {
        var res = await fetch('/api/v1/plans', {
          headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        if (!res.ok) throw new Error('API plans indisponible')
        var data = await res.json()
        _inscriptionPlans = data.plans || []
        var grille = document.getElementById('grille-plans')
        if (!_inscriptionPlans.length) {
          grille.innerHTML = '<p class="col-span-full text-center text-sm text-gray-400">Aucun plan disponible.</p>'
          return
        }
        grille.innerHTML = _inscriptionPlans.map(function(plan) {
          return construireCartePlan(plan, plan.id === planIdPreselect)
        }).join('')

        // Si un plan était présélectionné et trouvé → auto-sélection silencieuse
        if (planIdPreselect) {
          var planTrouve = _inscriptionPlans.find(function(p) { return p.id === planIdPreselect })
          if (planTrouve) {
            document.getElementById('reg-plan-id').value = planTrouve.id
            document.getElementById('badge-plan-nom').textContent = planTrouve.nom
            document.getElementById('badge-plan-selectionne').classList.remove('hidden')
            document.getElementById('section-plans').classList.add('hidden')
            return
          }
        }
        // Pas de présélection → afficher la grille
        document.getElementById('section-plans').classList.remove('hidden')
      } catch(err) {
        // En cas d'erreur API plans : on continue sans grille (plan Gratuit par défaut côté serveur)
        console.warn('[inscription] Plans indisponibles:', err.message)
      }
    }

    // ─── Initialisation au chargement ────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function() {
      var params = new URLSearchParams(window.location.search)
      var planIdFromUrl = params.get('plan') || ''
      // Toujours charger les plans pour permettre la sélection ou la confirmation
      chargerEtAfficherPlans(planIdFromUrl)
    })

    // ─── Utilitaires formulaire ───────────────────────────────────────────────
    function updateSlugPreview() {
      var nom = document.getElementById('reg-nom-restaurant').value;
      var slug = nom
        .toLowerCase()
        .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
        .replace(/[^a-z0-9\\s-]/g, '')
        .replace(/\\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/, '')
        || 'votre-restaurant';
      document.getElementById('slug-preview').textContent = slug;
    }

    function togglePwd() {
      var input = document.getElementById('reg-password');
      var icon = document.getElementById('reg-eye');
      input.type = input.type === 'password' ? 'text' : 'password';
      icon.className = input.type === 'password' ? 'fa-regular fa-eye text-sm' : 'fa-regular fa-eye-slash text-sm';
    }

    async function handleInscription(e) {
      e.preventDefault();
      var btn = document.getElementById('reg-btn');
      var errEl = document.getElementById('reg-error');
      var successEl = document.getElementById('reg-success');
      errEl.classList.add('hidden');
      successEl.classList.add('hidden');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i><span>Création en cours...</span>';

      // BUG-010 FIX — plan_id lu depuis le champ caché (renseigné par selectionnerPlan())
      var planId = document.getElementById('reg-plan-id').value.trim()

      var payload = {
        nom_restaurant: document.getElementById('reg-nom-restaurant').value.trim(),
        nom_gerant: document.getElementById('reg-nom-gerant').value.trim(),
        whatsapp_number: document.getElementById('reg-whatsapp').value.trim(),
        email: document.getElementById('reg-email').value.trim(),
        password: document.getElementById('reg-password').value
      };

      // Ajouter plan_id au payload uniquement s'il est renseigné
      if (planId) {
        payload.plan_id = planId
      }

      try {
        // §2 — credentials:'include' pour accepter le cookie httpOnly
        // posé par le serveur si la session est créée immédiatement.
        var res = await fetch('/api/v1/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
        var data = await res.json();
        if (res.ok && data.success) {
          if (data.tenant) {
            localStorage.setItem('monmenu_tenant', JSON.stringify(data.tenant));
            successEl.textContent = data.message || 'Compte créé ! Redirection vers votre tableau de bord...';
            successEl.classList.remove('hidden');
            e.target.reset();
            setTimeout(function() { window.location.href = '/bienvenue'; }, 2000);
          } else {
            successEl.textContent = 'Compte créé ! Vérifiez votre email pour confirmer, puis connectez-vous.';
            successEl.classList.remove('hidden');
            e.target.reset();
            setTimeout(function() { window.location.href = '/dashboard'; }, 3000);
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
