// src/pages/bienvenue.ts — Page d'onboarding post-inscription
// ⚠️ PAGE PRIVÉE — PAS de traduction (FR uniquement, pas d'i18n)
// Accessible après inscription réussie, protégée par auth JWT
//
// FIX (CSRF) — soumettreBienvenue() ajoute désormais le header
// X-Requested-With: XMLHttpRequest, requis par le middleware CSRF de
// api-dashboard.ts sur toutes les routes d'écriture (POST/PATCH/PUT/DELETE).
// Sans ce header, la requête était refusée avec un 403 CSRF_PROTECTION.
//
// FIX (pré-remplissage) — Au chargement, la page appelle désormais
// GET /api/v1/dashboard/profil pour pré-remplir les champs déjà saisis
// à l'inscription (nom, téléphone, adresse, couleurs, logo/bannière),
// afin que l'utilisateur n'ait pas à ressaisir des informations connues.
//
// FIX (2026-07-31) — Bug "Suivant" bloqué : goStep() était déclarée deux
// fois (déclaration function classique, hoistée). La deuxième déclaration
// wrappait `_goStepOriginal = goStep`, mais à cause du hoisting JS,
// `goStep` pointait déjà vers la 2e déclaration au moment de l'affectation
// → `_goStepOriginal` référençait la fonction elle-même → boucle infinie
// (stack overflow silencieux) dès le premier clic sur "Suivant".
// Fix : suppression du monkey-patch, appel de chargerPlans() intégré
// directement dans la fonction goStep d'origine.
import { renderHead } from '../components/head'

export function renderBienvenuePage(nomProjet: string, nonce: string = ''): string {
  return `${renderHead(
    `Bienvenue sur ${nomProjet} — Configurez votre restaurant`,
    `Configurez votre restaurant en quelques minutes sur ${nomProjet}.`,
    nomProjet
  )}
<body class="font-sans bg-gray-50 min-h-screen">

  <!-- Header minimal -->
  <header class="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-30">
    <div class="max-w-2xl mx-auto flex items-center justify-between">
      <a href="/" class="flex items-center gap-2 text-red-600 font-bold text-lg">
        <i class="fa-solid fa-utensils"></i>
        <span>${nomProjet}</span>
      </a>
      <span class="text-xs text-gray-400 bg-green-50 text-green-600 font-semibold px-3 py-1 rounded-full">
        <i class="fa-solid fa-circle-check mr-1"></i> Compte créé
      </span>
    </div>
  </header>

  <main class="max-w-2xl mx-auto px-4 py-10">
    <!-- En-tête de bienvenue -->
    <div class="text-center mb-10">
      <div class="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <i class="fa-solid fa-utensils text-red-600 text-2xl"></i>
      </div>
      <h1 class="text-3xl font-extrabold text-gray-900 mb-2">Bienvenue sur ${nomProjet} !</h1>
      <p class="text-gray-500">Configurez votre restaurant en quelques minutes</p>
    </div>

    <!-- Indicateur d'étapes -->
    <div class="flex items-center justify-center gap-2 mb-10" id="steps-indicator">
      <div class="flex items-center gap-2">
        <div class="step-dot w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all bg-red-600 text-white" data-step="1">1</div>
        <span class="text-xs font-semibold text-red-600 hidden sm:inline">Infos</span>
      </div>
      <div class="h-px w-8 bg-gray-200" id="line-1-2"></div>
      <div class="flex items-center gap-2">
        <div class="step-dot w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all bg-gray-200 text-gray-500" data-step="2">2</div>
        <span class="text-xs font-medium text-gray-400 hidden sm:inline">Horaires</span>
      </div>
      <div class="h-px w-8 bg-gray-200" id="line-2-3"></div>
      <div class="flex items-center gap-2">
        <div class="step-dot w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all bg-gray-200 text-gray-500" data-step="3">3</div>
        <span class="text-xs font-medium text-gray-400 hidden sm:inline">Visuels</span>
      </div>
      <div class="h-px w-8 bg-gray-200" id="line-3-4"></div>
      <div class="flex items-center gap-2">
        <div class="step-dot w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all bg-gray-200 text-gray-500" data-step="4">4</div>
        <span class="text-xs font-medium text-gray-400 hidden sm:inline">Couleurs</span>
      </div>
      <div class="h-px w-8 bg-gray-200" id="line-4-5"></div>
      <div class="flex items-center gap-2">
        <div class="step-dot w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all bg-gray-200 text-gray-500" data-step="5">5</div>
        <span class="text-xs font-medium text-gray-400 hidden sm:inline">Abonnement</span>
      </div>
    </div>

    <!-- Formulaire multi-étapes -->
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

      <!-- ═══ ÉTAPE 1 : Informations de base ═══ -->
      <div id="step-1" class="step-panel p-8">
        <h2 class="text-xl font-bold text-gray-900 mb-6">
          <i class="fa-solid fa-store mr-2 text-red-500"></i>Informations du restaurant
        </h2>
        <div class="space-y-5">
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">
              Nom du restaurant <span class="text-red-500">*</span>
            </label>
            <input id="inp-nom" type="text" required minlength="2" maxlength="100"
              class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 placeholder-gray-400"
              placeholder="Chez Fatou">
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">
              Adresse du restaurant
            </label>
            <input id="inp-adresse" type="text" maxlength="255"
              class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 placeholder-gray-400"
              placeholder="Rue, quartier, ville...">

            <!-- Géolocalisation (§ localisation carte) -->
            <input type="hidden" id="inp-latitude" value="">
            <input type="hidden" id="inp-longitude" value="">
            <button type="button" id="btn-localiser"
              class="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-red-600 hover:text-red-700 transition-colors">
              <i class="fa-solid fa-location-crosshairs"></i>
              <span id="btn-localiser-label">Localiser mon restaurant sur la carte</span>
            </button>
            <p id="localisation-status" class="hidden text-xs text-green-600 mt-1">
              <i class="fa-solid fa-circle-check mr-1"></i>Position enregistrée
            </p>
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">
              Téléphone / WhatsApp <span class="text-xs text-gray-400 font-normal">(optionnel)</span>
            </label>
            <input id="inp-telephone" type="tel" maxlength="30"
              class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 placeholder-gray-400"
              placeholder="+226 70 00 00 00">
          </div>
        </div>
        <div class="flex justify-end mt-8">
          <button id="btn-step1-next"
            class="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3 rounded-xl transition-colors flex items-center gap-2">
            Suivant <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>

      <!-- ═══ ÉTAPE 2 : Horaires ═══ -->
      <div id="step-2" class="step-panel p-8 hidden">
        <h2 class="text-xl font-bold text-gray-900 mb-6">
          <i class="fa-regular fa-clock mr-2 text-red-500"></i>Horaires d'ouverture
        </h2>
        <div class="space-y-3" id="horaires-container">
          <!-- Généré par JS -->
        </div>
        <div class="flex justify-between mt-8">
          <button id="btn-step2-back"
            class="border border-gray-200 text-gray-700 font-semibold px-6 py-3 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2">
            <i class="fa-solid fa-arrow-left"></i> Retour
          </button>
          <div class="flex gap-3">
            <button id="btn-step2-skip"
              class="text-gray-400 hover:text-gray-600 text-sm font-medium px-4 py-3 transition-colors">
              Passer
            </button>
            <button id="btn-step2-next"
              class="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3 rounded-xl transition-colors flex items-center gap-2">
              Suivant <i class="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- ═══ ÉTAPE 3 : Visuels (logo + bannière) ═══ -->
      <div id="step-3" class="step-panel p-8 hidden">
        <h2 class="text-xl font-bold text-gray-900 mb-6">
          <i class="fa-solid fa-image mr-2 text-red-500"></i>Visuels de votre boutique
        </h2>
        <div class="space-y-6">
          <!-- Logo -->
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">Logo du restaurant</label>
            <p class="text-xs text-gray-400 mb-3">Format recommandé : carré, min 200×200px (JPG, PNG)</p>
            <div class="relative">
              <label for="inp-logo"
                class="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:border-red-300 hover:bg-red-50/30 transition-colors group">
                <div id="logo-preview-container" class="hidden w-24 h-24 rounded-xl overflow-hidden">
                  <img id="logo-preview-img" src="" alt="Logo" class="w-full h-full object-cover">
                </div>
                <div id="logo-placeholder" class="text-center">
                  <i class="fa-solid fa-cloud-arrow-up text-2xl text-gray-300 group-hover:text-red-400 mb-2 block transition-colors"></i>
                  <span class="text-sm text-gray-400 group-hover:text-red-500 transition-colors">Cliquer pour choisir un logo</span>
                </div>
              </label>
              <input id="inp-logo" type="file" accept="image/*" class="hidden">
            </div>
            <p id="logo-existant-note" class="hidden text-xs text-gray-400 mt-2">
              <i class="fa-solid fa-circle-info mr-1"></i>Logo déjà enregistré. Choisissez un fichier pour le remplacer.
            </p>
          </div>

          <!-- Bannière -->
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1.5">Bannière</label>
            <p class="text-xs text-gray-400 mb-3">Format recommandé : 1200×400px (JPG, PNG)</p>
            <div class="relative">
              <label for="inp-banniere"
                class="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:border-red-300 hover:bg-red-50/30 transition-colors group overflow-hidden">
                <div id="banniere-preview-container" class="hidden w-full h-full">
                  <img id="banniere-preview-img" src="" alt="Bannière" class="w-full h-full object-cover">
                </div>
                <div id="banniere-placeholder" class="text-center">
                  <i class="fa-solid fa-panorama text-2xl text-gray-300 group-hover:text-red-400 mb-2 block transition-colors"></i>
                  <span class="text-sm text-gray-400 group-hover:text-red-500 transition-colors">Cliquer pour choisir une bannière</span>
                </div>
              </label>
              <input id="inp-banniere" type="file" accept="image/*" class="hidden">
            </div>
            <p id="banniere-existant-note" class="hidden text-xs text-gray-400 mt-2">
              <i class="fa-solid fa-circle-info mr-1"></i>Bannière déjà enregistrée. Choisissez un fichier pour la remplacer.
            </p>
          </div>
        </div>
        <div class="flex justify-between mt-8">
          <button id="btn-step3-back"
            class="border border-gray-200 text-gray-700 font-semibold px-6 py-3 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2">
            <i class="fa-solid fa-arrow-left"></i> Retour
          </button>
          <div class="flex gap-3">
            <button id="btn-step3-skip"
              class="text-gray-400 hover:text-gray-600 text-sm font-medium px-4 py-3 transition-colors">
              Passer
            </button>
            <button id="btn-step3-next"
              class="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3 rounded-xl transition-colors flex items-center gap-2">
              Suivant <i class="fa-solid fa-arrow-right"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- ═══ ÉTAPE 4 : Couleurs ═══ -->
      <div id="step-4" class="step-panel p-8 hidden">
        <h2 class="text-xl font-bold text-gray-900 mb-6">
          <i class="fa-solid fa-palette mr-2 text-red-500"></i>Couleurs de votre boutique
        </h2>
        <div class="space-y-6">
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">Couleur principale</label>
            <p class="text-xs text-gray-400 mb-3">Utilisée pour les boutons et accents</p>
            <div class="flex items-center gap-4">
              <input id="inp-couleur-primaire" type="color" value="#DC2626"
                class="w-14 h-14 rounded-xl border border-gray-200 cursor-pointer p-1">
              <div id="color-primary-preview"
                class="flex-1 h-14 rounded-xl flex items-center justify-center text-white font-semibold transition-colors"
                style="background-color:#DC2626">
                Bouton principal
              </div>
            </div>
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">Couleur secondaire</label>
            <p class="text-xs text-gray-400 mb-3">Utilisée pour les éléments secondaires</p>
            <div class="flex items-center gap-4">
              <input id="inp-couleur-secondaire" type="color" value="#1D4ED8"
                class="w-14 h-14 rounded-xl border border-gray-200 cursor-pointer p-1">
              <div id="color-secondary-preview"
                class="flex-1 h-14 rounded-xl flex items-center justify-center text-white font-semibold transition-colors"
                style="background-color:#1D4ED8">
                Élément secondaire
              </div>
            </div>
          </div>
        </div>

        <!-- Message d'erreur/succès -->
        <div id="setup-message" class="hidden mt-6 p-4 rounded-xl text-sm font-medium"></div>

        <div class="flex justify-between mt-8">
          <button id="btn-step4-back"
            class="border border-gray-200 text-gray-700 font-semibold px-6 py-3 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2">
            <i class="fa-solid fa-arrow-left"></i> Retour
          </button>
          <button id="btn-submit-setup"
            class="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3 rounded-xl transition-colors flex items-center gap-2">
            Suivant <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>

      <!-- ═══ ÉTAPE 5 : Abonnement & Paiement ═══ -->
      <div id="step-5" class="step-panel p-8 hidden">
        <h2 class="text-xl font-bold text-gray-900 mb-2">
          <i class="fa-solid fa-credit-card mr-2 text-red-500"></i>Abonnement & Paiement
        </h2>
        <p class="text-sm text-gray-500 mb-6">
          Choisissez votre plan et effectuez votre paiement par Mobile Money pour activer votre restaurant.
          Votre période d'essai reste active pendant le traitement.
        </p>

        <!-- Chargement des plans -->
        <div id="plans-loading" class="text-center py-8 text-gray-400">
          <i class="fa-solid fa-circle-notch fa-spin text-2xl mb-2 block"></i>
          <p class="text-sm">Chargement des plans...</p>
        </div>

        <!-- Grille des plans -->
        <div id="plans-grid" class="hidden grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <!-- Généré par JS -->
        </div>

        <!-- Référence de paiement -->
        <div id="reference-paiement-block" class="hidden mt-6 bg-blue-50 border border-blue-200 rounded-2xl p-6">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <i class="fa-solid fa-file-invoice text-blue-600"></i>
            </div>
            <div class="flex-1">
              <h3 class="font-bold text-gray-900 mb-1">Votre référence de paiement</h3>
              <p class="text-xs text-gray-500 mb-3">
                Mentionnez cette référence dans votre virement ou capture d'écran pour faciliter l'identification.
              </p>
              <div class="bg-white border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <code id="reference-paiement-value" class="text-lg font-mono font-bold text-blue-700 tracking-wider">—</code>
                <button id="btn-copier-ref"
                  class="ml-3 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                  <i class="fa-solid fa-copy"></i> Copier
                </button>
              </div>
              <p class="text-xs text-gray-400 mt-2">
                <i class="fa-solid fa-circle-info mr-1"></i>
                Plan sélectionné : <strong id="plan-selectionne-nom">—</strong> —
                Montant : <strong id="plan-selectionne-prix">—</strong> FCFA/mois
              </p>
            </div>
          </div>
        </div>

        <!-- Instructions de paiement -->
        <div id="instructions-paiement" class="hidden mt-4 bg-green-50 border border-green-200 rounded-2xl p-5">
          <h4 class="font-semibold text-green-800 mb-3 text-sm">
            <i class="fa-solid fa-mobile-screen-button mr-1.5"></i>Comment effectuer votre paiement
          </h4>
          <ol class="text-sm text-green-700 space-y-2">
            <li class="flex items-start gap-2">
              <span class="font-bold w-5 text-center flex-shrink-0">1.</span>
              Effectuez votre paiement via Mobile Money aux numéros affichés ci-dessous :
              <div id="numeros-paiement" class="mt-1.5 space-y-1.5"></div>
              <noscript>au numéro communiqué par notre équipe.</noscript>
            </li>
            <li class="flex items-start gap-2">
              <span class="font-bold w-5 text-center flex-shrink-0">2.</span>
              Notez ou copiez votre référence de paiement ci-dessus.
            </li>
            <li class="flex items-start gap-2">
              <span class="font-bold w-5 text-center flex-shrink-0">3.</span>
              Une fois le paiement effectué, accédez à votre tableau de bord et déclarez votre paiement dans la section <strong>Abonnement</strong>.
            </li>
            <li class="flex items-start gap-2">
              <span class="font-bold w-5 text-center flex-shrink-0">4.</span>
              Notre équipe confirme votre paiement sous <span class="duree-sla"></span>h maximum. Vous recevrez une notification.
            </li>
          </ol>
        </div>

        <div class="flex justify-between mt-8">
          <button id="btn-step5-back"
            class="border border-gray-200 text-gray-700 font-semibold px-6 py-3 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2">
            <i class="fa-solid fa-arrow-left"></i> Retour
          </button>
          <a href="/dashboard/commandes"
            class="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3 rounded-xl transition-colors flex items-center gap-2">
            <i class="fa-solid fa-gauge-high"></i> Accéder au tableau de bord
          </a>
        </div>
      </div>

    </div>

    <!-- Lien de passage direct -->
    <p class="text-center text-xs text-gray-400 mt-6">
      Vous pourrez modifier ces informations à tout moment dans le tableau de bord.
      <a href="/dashboard/home" class="text-red-600 hover:underline font-medium ml-1">Passer la configuration →</a>
    </p>
  </main>

  <script nonce="${nonce}">
    // ═══════════════════════════════════════════
    // Données du formulaire (state global)
    // ═══════════════════════════════════════════
    let logoFile = null;
    let banniereFile = null;
    const jours = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
    const joursLabels = {
      lundi:'Lundi', mardi:'Mardi', mercredi:'Mercredi', jeudi:'Jeudi',
      vendredi:'Vendredi', samedi:'Samedi', dimanche:'Dimanche'
    };

    // ═══════════════════════════════════════════
    // Navigation entre étapes
    // FIX (2026-07-31) : plus de monkey-patch de goStep en fin de fichier.
    // L'appel à chargerPlans() à l'étape 5 est intégré ici directement.
    // ═══════════════════════════════════════════
    let currentStep = 1;

    function goStep(n) {
      if (n === 2 && !validerStep1()) return;
      document.querySelectorAll('.step-panel').forEach(p => p.classList.add('hidden'));
      document.getElementById('step-' + n).classList.remove('hidden');

      document.querySelectorAll('.step-dot').forEach(dot => {
        const s = parseInt(dot.dataset.step);
        if (s < n) {
          dot.className = 'step-dot w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all bg-green-500 text-white';
          dot.innerHTML = '<i class="fa-solid fa-check text-xs"></i>';
        } else if (s === n) {
          dot.className = 'step-dot w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all bg-red-600 text-white';
          dot.textContent = s;
        } else {
          dot.className = 'step-dot w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all bg-gray-200 text-gray-500';
          dot.textContent = s;
        }
      });
      currentStep = n;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (n === 5) chargerPlans();
    }

    // ═══════════════════════════════════════════
    // Validation étape 1
    // ═══════════════════════════════════════════
    function validerStep1() {
      const nom = document.getElementById('inp-nom').value.trim();
      if (!nom || nom.length < 2) {
        document.getElementById('inp-nom').focus();
        document.getElementById('inp-nom').classList.add('border-red-400');
        return false;
      }
      document.getElementById('inp-nom').classList.remove('border-red-400');
      return true;
    }

    // ═══════════════════════════════════════════
    // Géolocalisation du restaurant (étape 1)
    // Demande le consentement navigateur, comme le flux de géolocalisation
    // déjà en place ailleurs dans l'application.
    // ═══════════════════════════════════════════
    function localiserRestaurant() {
      const btn = document.getElementById('btn-localiser');
      const label = document.getElementById('btn-localiser-label');
      const status = document.getElementById('localisation-status');

      if (!navigator.geolocation) {
        label.textContent = 'Géolocalisation non disponible sur cet appareil';
        return;
      }

      label.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Localisation en cours...';
      btn.disabled = true;

      navigator.geolocation.getCurrentPosition(
        (position) => {
          document.getElementById('inp-latitude').value = position.coords.latitude;
          document.getElementById('inp-longitude').value = position.coords.longitude;
          label.textContent = 'Localiser mon restaurant sur la carte';
          status.classList.remove('hidden');
          btn.disabled = false;
        },
        (err) => {
          label.textContent = 'Localisation refusée ou indisponible. Réessayer';
          btn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }

    // ═══════════════════════════════════════════
    // Génération du formulaire horaires (étape 2)
    // ═══════════════════════════════════════════
    function initHoraires(horairesExistants) {
      const container = document.getElementById('horaires-container');
      container.innerHTML = jours.map(jour => \`
        <div class="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
          <div class="w-24 text-sm font-medium text-gray-700 flex-shrink-0">\${joursLabels[jour]}</div>
          <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input type="checkbox" id="h-\${jour}-ouvert" class="sr-only peer" checked
              data-action-change="toggleHoraire" data-jour="\${jour}">
            <div class="w-10 h-5 bg-gray-200 peer-focus:ring-2 peer-focus:ring-red-300 rounded-full peer peer-checked:bg-red-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5"></div>
          </label>
          <div id="h-\${jour}-times" class="flex items-center gap-2 flex-1">
            <input type="time" id="h-\${jour}-debut" value="08:00"
              class="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-red-300">
            <span class="text-gray-400 text-xs">–</span>
            <input type="time" id="h-\${jour}-fin" value="22:00"
              class="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-red-300">
          </div>
          <span id="h-\${jour}-closed" class="hidden text-xs text-gray-400 italic">Fermé ce jour</span>
        </div>
      \`).join('');

      // Applique les horaires existants (venant du profil) si fournis
      if (horairesExistants) {
        jours.forEach(jour => {
          const h = horairesExistants[jour];
          if (!h) return;
          const checkbox = document.getElementById('h-' + jour + '-ouvert');
          if (h.ouvert === false) {
            checkbox.checked = false;
            toggleHoraire(jour);
          } else {
            if (h.debut) document.getElementById('h-' + jour + '-debut').value = h.debut;
            if (h.fin) document.getElementById('h-' + jour + '-fin').value = h.fin;
          }
        });
      }
    }

    function toggleHoraire(jour) {
      const checked = document.getElementById('h-' + jour + '-ouvert').checked;
      document.getElementById('h-' + jour + '-times').classList.toggle('hidden', !checked);
      document.getElementById('h-' + jour + '-closed').classList.toggle('hidden', checked);
    }

    function collecterHoraires() {
      const horaires = {};
      jours.forEach(jour => {
        const ouvert = document.getElementById('h-' + jour + '-ouvert').checked;
        horaires[jour] = {
          ouvert,
          debut: ouvert ? document.getElementById('h-' + jour + '-debut').value : null,
          fin: ouvert ? document.getElementById('h-' + jour + '-fin').value : null
        };
      });
      return horaires;
    }

    // ═══════════════════════════════════════════
    // Preview image
    // ═══════════════════════════════════════════
    function previewImage(input, type) {
      const file = input.files[0];
      if (!file) return;
      if (type === 'logo') logoFile = file;
      else banniereFile = file;

      const reader = new FileReader();
      reader.onload = (e) => {
        const container = document.getElementById(type + '-preview-container');
        const img = document.getElementById(type + '-preview-img');
        const placeholder = document.getElementById(type + '-placeholder');
        img.src = e.target.result;
        container.classList.remove('hidden');
        placeholder.classList.add('hidden');
      };
      reader.readAsDataURL(file);
    }

    // ═══════════════════════════════════════════
    // Pré-remplissage avec les données déjà saisies à l'inscription
    // (ou lors d'une session de configuration précédente)
    // ═══════════════════════════════════════════
    async function preremplirFormulaire() {
      try {
        const res = await fetch('/api/v1/dashboard/profil');
        if (!res.ok) return;
        const data = await res.json();

        if (data.nom) document.getElementById('inp-nom').value = data.nom;
        if (data.whatsapp_number) document.getElementById('inp-telephone').value = data.whatsapp_number;
        if (data.pdv_adresse) document.getElementById('inp-adresse').value = data.pdv_adresse;

        if (data.pdv_latitude !== null && data.pdv_latitude !== undefined &&
            data.pdv_longitude !== null && data.pdv_longitude !== undefined) {
          document.getElementById('inp-latitude').value = data.pdv_latitude;
          document.getElementById('inp-longitude').value = data.pdv_longitude;
          document.getElementById('localisation-status').classList.remove('hidden');
        }

        if (data.couleur_primaire) {
          document.getElementById('inp-couleur-primaire').value = data.couleur_primaire;
          document.getElementById('color-primary-preview').style.backgroundColor = data.couleur_primaire;
        }
        if (data.couleur_secondaire) {
          document.getElementById('inp-couleur-secondaire').value = data.couleur_secondaire;
          document.getElementById('color-secondary-preview').style.backgroundColor = data.couleur_secondaire;
        }

        // Aperçu logo/bannière déjà existants (impossible d'injecter un fichier
        // dans un <input type="file"> par sécurité navigateur : on affiche
        // seulement l'aperçu, l'utilisateur n'a pas besoin de re-uploader
        // sauf s'il souhaite remplacer le visuel).
        if (data.logo_url) {
          document.getElementById('logo-preview-img').src = data.logo_url;
          document.getElementById('logo-preview-container').classList.remove('hidden');
          document.getElementById('logo-placeholder').classList.add('hidden');
          document.getElementById('logo-existant-note').classList.remove('hidden');
        }
        if (data.banniere_url) {
          document.getElementById('banniere-preview-img').src = data.banniere_url;
          document.getElementById('banniere-preview-container').classList.remove('hidden');
          document.getElementById('banniere-placeholder').classList.add('hidden');
          document.getElementById('banniere-existant-note').classList.remove('hidden');
        }

        // Horaires : ré-initialise le bloc horaires avec les valeurs existantes si présentes
        initHoraires(data.horaires || null);
      } catch (err) {
        console.error('Erreur pré-remplissage:', err);
        // Silencieux : l'utilisateur peut toujours remplir manuellement
        initHoraires(null);
      }
    }

    // ═══════════════════════════════════════════
    // Aperçu couleurs en temps réel + init page
    // ═══════════════════════════════════════════
    document.addEventListener('DOMContentLoaded', async () => {
      const primary = document.getElementById('inp-couleur-primaire');
      const secondary = document.getElementById('inp-couleur-secondaire');

      primary.addEventListener('input', () => {
        document.getElementById('color-primary-preview').style.backgroundColor = primary.value;
      });
      secondary.addEventListener('input', () => {
        document.getElementById('color-secondary-preview').style.backgroundColor = secondary.value;
      });

      await preremplirFormulaire();
    });

    // ═══════════════════════════════════════════
    // Soumission du formulaire complet
    // ═══════════════════════════════════════════
    async function soumettreBienvenue() {
      const btn = document.getElementById('btn-submit-setup');
      const msg = document.getElementById('setup-message');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Enregistrement...';

      try {
        const formData = new FormData();

        // Infos de base (étape 1)
        const nom = document.getElementById('inp-nom').value.trim();
        const adresse = document.getElementById('inp-adresse').value.trim();
        const telephone = document.getElementById('inp-telephone').value.trim();
        if (nom) formData.append('nom', nom);
        if (adresse) formData.append('adresse', adresse);
        if (telephone) formData.append('telephone', telephone);

        // Horaires (étape 2)
        formData.append('horaires', JSON.stringify(collecterHoraires()));

        // Localisation (étape 1)
        const lat = document.getElementById('inp-latitude').value;
        const lng = document.getElementById('inp-longitude').value;
        if (lat) formData.append('latitude', lat);
        if (lng) formData.append('longitude', lng);

        // Visuels (étape 3)
        if (logoFile) formData.append('logo', logoFile);
        if (banniereFile) formData.append('banniere', banniereFile);

        // Couleurs (étape 4)
        formData.append('couleur_primaire', document.getElementById('inp-couleur-primaire').value);
        formData.append('couleur_secondaire', document.getElementById('inp-couleur-secondaire').value);

        // FIX CSRF — header requis par le middleware d'écriture de
        // api-dashboard.ts (dashboardRouter.use('*', ...)). Sans lui,
        // la requête est refusée avec 403 CSRF_PROTECTION.
        const res = await fetch('/api/v1/dashboard/setup-restaurant', {
          method: 'POST',
          headers: {
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: formData
        });

        const data = await res.json();

        if (res.ok) {
          msg.className = 'mt-6 p-4 rounded-xl text-sm font-medium bg-green-50 text-green-700 border border-green-200';
          msg.textContent = '✓ Restaurant configuré ! Chargement de votre plan...';
          msg.classList.remove('hidden');
          // Passer à l'étape 5 (choix de plan + référence paiement)
          setTimeout(() => goStep(5), 1000);
        } else {
          msg.className = 'mt-6 p-4 rounded-xl text-sm font-medium bg-red-50 text-red-700 border border-red-200';
          msg.textContent = data.error || 'Une erreur est survenue. Réessayez.';
          msg.classList.remove('hidden');
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-check mr-2"></i>Valider et accéder au tableau de bord';
        }
      } catch (err) {
        msg.className = 'mt-6 p-4 rounded-xl text-sm font-medium bg-red-50 text-red-700 border border-red-200';
        msg.textContent = 'Erreur de connexion. Réessayez.';
        msg.classList.remove('hidden');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check mr-2"></i>Valider et accéder au tableau de bord';
      }
    }

    // ═══════════════════════════════════════════
    // ÉTAPE 5 — Choix de plan & référence paiement
    // ═══════════════════════════════════════════

    let planSelectionneId = null;
    let planSelectionneNom = '';
    let planSelectionnePrix = 0;
    let referenceGeneree = null;

    /**
     * Charge et affiche les plans disponibles depuis l'API.
     * Appelée à l'entrée de l'étape 5 via goStep(5).
     */
    async function chargerPlans() {
      const loading = document.getElementById('plans-loading');
      const grid = document.getElementById('plans-grid');
      if (!loading || !grid) return;

      loading.classList.remove('hidden');
      grid.classList.add('hidden');

      try {
        const res = await fetch('/api/v1/plans', { credentials: 'include' });
        if (!res.ok) throw new Error('Erreur chargement plans');
        const data = await res.json();

        const plans = (data.plans || []).filter(p => p.actif && p.prix_mensuel > 0);

        if (!plans.length) {
          loading.innerHTML = '<p class="text-sm text-gray-400">Plans non disponibles. Contactez le support.</p>';
          return;
        }

        grid.innerHTML = plans.map(p => \`
          <div class="plan-card border-2 border-gray-200 rounded-2xl p-5 cursor-pointer transition-all hover:border-red-300 hover:shadow-md"
               data-action="selectionnerPlan" data-plan-id="\${p.id}" data-plan-nom="\${escHtml(p.nom)}" data-plan-prix="\${p.prix_mensuel}">
            <div class="flex items-start justify-between mb-3">
              <div>
                <h3 class="font-bold text-gray-900 text-sm">\${escHtml(p.nom)}</h3>
                <p class="text-xs text-gray-400 mt-0.5">\${escHtml(p.description || '')}</p>
              </div>
              <div class="text-right">
                <div class="font-extrabold text-gray-900 text-lg">\${p.prix_mensuel.toLocaleString('fr-FR')}</div>
                <div class="text-xs text-gray-400">FCFA/mois</div>
              </div>
            </div>
            <div class="h-0.5 bg-gray-100 my-3"></div>
            <div class="text-xs text-gray-500">
              \${p.prix_annuel ? \`<span class="text-green-600 font-semibold">\${p.prix_annuel.toLocaleString('fr-FR')} FCFA/an</span> — économisez 2 mois\` : ''}
            </div>
            <div class="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-400 select-indicator hidden">
              <i class="fa-solid fa-circle-check text-red-500"></i> Sélectionné
            </div>
          </div>
        \`).join('');

        loading.classList.add('hidden');
        grid.classList.remove('hidden');

        // Remettre la classe grid au div (Tailwind purgé → inline)
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(220px, 1fr))';
        grid.style.gap = '1rem';

      } catch (e) {
        loading.innerHTML = '<p class="text-sm text-red-400">Impossible de charger les plans. Réessayez.</p>';
      }
    }

    function escHtml(str) {
      return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    /**
     * Charge les numéros de paiement depuis la table moyens_paiement
     * (API publique /api/v1/moyens-paiement — lecture directe Supabase, actifs uniquement).
     * SEC : aucune entrée utilisateur — tout le contenu vient de la base et est
     * échappé via escHtml(). En cas d'échec ou de liste vide, comportement
     * d'origine préservé (aucun affichage, texte de repli disponible).
     */
    async function chargerNumerosPaiement() {
      const container = document.getElementById('numeros-paiement');
      if (!container) return;
      try {
        const res = await fetch('/api/v1/moyens-paiement');
        if (!res.ok) return;
        const data = await res.json();
        const moyens = Array.isArray(data?.moyens) ? data.moyens : [];
        if (!moyens.length) return;
        container.innerHTML = moyens.map(m => \`
          <div class="bg-white border border-green-200 rounded-lg px-3 py-2 flex items-center justify-between">
            <span class="font-bold">\${escHtml(m.nom)}</span>
            <code class="font-mono font-bold text-green-800">\${escHtml(m.numero || '')}</code>
          </div>\`).join('');
      } catch (e) {
        // Silencieux : la liste reste vide, le texte de repli s'applique
      }
    }

    /**
     * Sélectionne un plan et génère la référence de paiement via l'API.
     * SEC-10 : la référence ne crée aucun abonnement, elle est juste un aide-mémoire.
     */
    async function selectionnerPlan(planId, planNom, planPrix) {
      // Mettre en évidence la carte sélectionnée
      document.querySelectorAll('.plan-card').forEach(card => {
        card.classList.remove('border-red-500', 'bg-red-50/30');
        card.querySelector('.select-indicator')?.classList.add('hidden');
      });
      const card = document.querySelector(\`[data-plan-id="\${planId}"]\`);
      if (card) {
        card.classList.add('border-red-500', 'bg-red-50/30');
        card.querySelector('.select-indicator')?.classList.remove('hidden');
      }

      planSelectionneId = planId;
      planSelectionneNom = planNom;
      planSelectionnePrix = planPrix;

      // Charger ou réutiliser la référence existante
      await chargerOuGenererReference(planId);
    }

    async function chargerOuGenererReference(planId) {
      const block = document.getElementById('reference-paiement-block');
      const instructions = document.getElementById('instructions-paiement');
      const refVal = document.getElementById('reference-paiement-value');
      const nomEl = document.getElementById('plan-selectionne-nom');
      const prixEl = document.getElementById('plan-selectionne-prix');

      try {
        const res = await fetch('/api/v1/paiement/reference', {
          credentials: 'include',
          headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        if (!res.ok) throw new Error('Erreur référence');
        const data = await res.json();

        referenceGeneree = data.reference;
        refVal.textContent = data.reference;
        nomEl.textContent = planSelectionneNom;
        prixEl.textContent = planSelectionnePrix.toLocaleString('fr-FR');

        block.classList.remove('hidden');
        instructions.classList.remove('hidden');
      } catch (e) {
        // Silencieux — l'utilisateur peut accéder au dashboard et déclarer depuis là
        block.classList.add('hidden');
      }
    }

    function copierReference() {
      const ref = document.getElementById('reference-paiement-value')?.textContent;
      if (!ref || ref === '—') return;
      navigator.clipboard?.writeText(ref).then(() => {
        const btn = document.getElementById('btn-copier-ref');
        if (btn) {
          btn.innerHTML = '<i class="fa-solid fa-check text-green-600"></i> Copié !';
          setTimeout(() => { btn.innerHTML = '<i class="fa-solid fa-copy"></i> Copier'; }, 2000);
        }
      });
    }

    // ═══════════════════════════════════════════
    // CSP-FIX (session 16) — Event delegation
    // Remplace tous les onclick=/onchange= inline
    // ═══════════════════════════════════════════
    document.addEventListener('DOMContentLoaded', function() {
      // Boutons de navigation statiques
      var _ev = [
        ['btn-localiser',   function() { localiserRestaurant(); }],
        ['btn-step1-next',  function() { goStep(2); }],
        ['btn-step2-back',  function() { goStep(1); }],
        ['btn-step2-skip',  function() { goStep(3); }],
        ['btn-step2-next',  function() { goStep(3); }],
        ['btn-step3-back',  function() { goStep(2); }],
        ['btn-step3-skip',  function() { goStep(4); }],
        ['btn-step3-next',  function() { goStep(4); }],
        ['btn-step4-back',  function() { goStep(3); }],
        ['btn-submit-setup',function() { soumettreBienvenue(); }],
        ['btn-copier-ref',  function() { copierReference(); }],
        ['btn-step5-back',  function() { goStep(4); }],
        ['inp-logo',        null],   // change, voir ci-dessous
        ['inp-banniere',    null]    // change, voir ci-dessous
      ];
      _ev.forEach(function(pair) {
        var el = document.getElementById(pair[0]);
        if (el && pair[1]) el.addEventListener('click', pair[1]);
      });

      // input file → change
      var inpLogo = document.getElementById('inp-logo');
      if (inpLogo) inpLogo.addEventListener('change', function() { previewImage(this, 'logo'); });
      var inpBanniere = document.getElementById('inp-banniere');
      if (inpBanniere) inpBanniere.addEventListener('change', function() { previewImage(this, 'banniere'); });

      // Délais officiels (source unique : src/lib/paiement.ts)
      // SLA annoncé au client : 48h — fenêtre technique : 72h
      var SLA_ADMIN_HEURES = 48;
      var dureeSla = document.querySelector('.duree-sla');
      if (dureeSla) dureeSla.textContent = SLA_ADMIN_HEURES;

      // Numéros de paiement depuis la table moyens_paiement (actifs uniquement)
      chargerNumerosPaiement();
    });

    // Délégation pour les éléments générés dynamiquement
    // (plan-cards dans chargerPlans() + horaires dans initHoraires())
    document.addEventListener('click', function(e) {
      var el = e.target.closest('[data-action]');
      if (!el) return;
      switch (el.dataset.action) {
        case 'selectionnerPlan':
          selectionnerPlan(el.dataset.planId, el.dataset.planNom, parseFloat(el.dataset.planPrix));
          break;
      }
    });

    document.addEventListener('change', function(e) {
      var el = e.target.closest('[data-action-change]');
      if (!el) return;
      if (el.dataset.actionChange === 'toggleHoraire') toggleHoraire(el.dataset.jour);
    });
  </script>
</body>
</html>`
}
