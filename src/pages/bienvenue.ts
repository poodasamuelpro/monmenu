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
import { renderHead } from '../components/head'

export function renderBienvenuePage(nomProjet: string): string {
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
          <button onclick="goStep(2)"
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
          <button onclick="goStep(1)"
            class="border border-gray-200 text-gray-700 font-semibold px-6 py-3 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2">
            <i class="fa-solid fa-arrow-left"></i> Retour
          </button>
          <div class="flex gap-3">
            <button onclick="goStep(3)"
              class="text-gray-400 hover:text-gray-600 text-sm font-medium px-4 py-3 transition-colors">
              Passer
            </button>
            <button onclick="goStep(3)"
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
              <input id="inp-logo" type="file" accept="image/*" class="hidden" onchange="previewImage(this,'logo')">
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
              <input id="inp-banniere" type="file" accept="image/*" class="hidden" onchange="previewImage(this,'banniere')">
            </div>
            <p id="banniere-existant-note" class="hidden text-xs text-gray-400 mt-2">
              <i class="fa-solid fa-circle-info mr-1"></i>Bannière déjà enregistrée. Choisissez un fichier pour la remplacer.
            </p>
          </div>
        </div>
        <div class="flex justify-between mt-8">
          <button onclick="goStep(2)"
            class="border border-gray-200 text-gray-700 font-semibold px-6 py-3 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2">
            <i class="fa-solid fa-arrow-left"></i> Retour
          </button>
          <div class="flex gap-3">
            <button onclick="goStep(4)"
              class="text-gray-400 hover:text-gray-600 text-sm font-medium px-4 py-3 transition-colors">
              Passer
            </button>
            <button onclick="goStep(4)"
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
          <button onclick="goStep(3)"
            class="border border-gray-200 text-gray-700 font-semibold px-6 py-3 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2">
            <i class="fa-solid fa-arrow-left"></i> Retour
          </button>
          <button id="btn-submit-setup" onclick="soumettreBienvenue()"
            class="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3 rounded-xl transition-colors flex items-center gap-2">
            <i class="fa-solid fa-check"></i> Valider et accéder au tableau de bord
          </button>
        </div>
      </div>

    </div>

    <!-- Lien de passage direct -->
    <p class="text-center text-xs text-gray-400 mt-6">
      Vous pourrez modifier ces informations à tout moment dans le tableau de bord.
      <a href="/dashboard/home" class="text-red-600 hover:underline font-medium ml-1">Passer la configuration →</a>
    </p>
  </main>

  <script>
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
    // Génération du formulaire horaires (étape 2)
    // ═══════════════════════════════════════════
    function initHoraires(horairesExistants) {
      const container = document.getElementById('horaires-container');
      container.innerHTML = jours.map(jour => \`
        <div class="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
          <div class="w-24 text-sm font-medium text-gray-700 flex-shrink-0">\${joursLabels[jour]}</div>
          <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input type="checkbox" id="h-\${jour}-ouvert" class="sr-only peer" checked
              onchange="toggleHoraire('\${jour}')">
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
          msg.textContent = '✓ Restaurant configuré ! Redirection vers votre tableau de bord...';
          msg.classList.remove('hidden');
          setTimeout(() => { window.location.href = '/dashboard/home'; }, 2000);
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
  </script>
</body>
</html>`
}
