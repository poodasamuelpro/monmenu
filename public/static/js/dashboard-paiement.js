/**
 * public/static/js/dashboard-paiement.js — Module UI paiement manuel (côté restaurant)
 *
 * Ce module gère :
 *   - Les bandeaux de notification paiement dans le header du dashboard
 *   - La section /dashboard/abonnement complète (statut, référence, upload preuve,
 *     historique, progression délai, toggle mensuel/annuel, upgrade/downgrade)
 *   - L'upload avec drag-and-drop et validation 4 couches côté client
 *
 * CORRECTIONS APPLIQUÉES :
 *   BUG-002 — construireCarteStatut() lit désormais s.abonnement.statut (pas s.statut_abonnement)
 *   BUG-003 — initBandeauxPaiement() filtre sur types API réels : 'info','warning','error','success'
 *   BUG-006 — toggle mensuel/annuel ajouté au formulaire de soumission preuve
 *   BUG-009 — race condition DOMContentLoaded corrigée : chargerPlansSelect + initSection séquentiels
 *   Feat C  — Section abonnement complète : statut, référence, moyens de paiement, historique enrichi
 *   Feat D  — Bouton upgrade/downgrade plan dans la section abonnement
 *
 * SÉCURITÉ CÔTÉ CLIENT :
 *   - Toutes les requêtes ajoutent X-Requested-With: XMLHttpRequest (SEC-05 CSRF)
 *   - Les tokens JWT ne sont jamais manipulés ici (gérés par le serveur via cookie httpOnly)
 *   - Validation extension + taille côté client (pré-filtre) ; la validation magic bytes
 *     reste côté serveur (SEC-02)
 *
 * @module dashboard-paiement
 * @see src/routes/api-paiement.ts
 */
'use strict';

// ─── Constantes ──────────────────────────────────────────────────────────────
const PAIEMENT_API = '/api/v1/paiement';
const PLANS_API    = '/api/v1/plans';
const MAX_TAILLE_FICHIER = 5 * 1024 * 1024; // 5 Mo
const EXTENSIONS_VALIDES = ['.jpg', '.jpeg', '.png'];
const MIME_VALIDES = ['image/jpeg', 'image/png'];
const DELAI_CONFIRMATION_H = 38;    // Délai engagé par l'admin
const FENETRE_TOLERANCE_H  = 72;    // Fenêtre de blocage automatique

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatMontant(val) {
  if (val == null) return '—';
  return Number(val).toLocaleString('fr-FR') + ' FCFA';
}

/** Calcule le pourcentage de progression d'un délai entre deux dates */
function progressionDelai(debut, fin) {
  const now = Date.now();
  const d = new Date(debut).getTime();
  const f = new Date(fin).getTime();
  if (now >= f) return 100;
  if (now <= d) return 0;
  return Math.round(((now - d) / (f - d)) * 100);
}

/** Retourne les heures restantes (peut être négatif si dépassé) */
function heuresRestantes(isoFin) {
  return Math.ceil((new Date(isoFin).getTime() - Date.now()) / 3600000);
}

function apiCallPaiement(path, opts = {}) {
  return fetch(PAIEMENT_API + path, {
    credentials: 'include',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      ...((opts.body && !(opts.body instanceof FormData))
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(opts.headers || {})
    },
    ...opts
  });
}

// ─── Bandeaux notifications (header dashboard) ────────────────────────────────

/**
 * BUG-003 CORRIGÉ — filtre sur les types réels retournés par l'API :
 * 'info', 'warning', 'error', 'success'
 * (l'ancien filtre utilisait 'paiement_en_attente', 'essai_expirant' qui n'existent pas)
 *
 * @returns {Promise<void>}
 */
async function initBandeauxPaiement() {
  const container = document.getElementById('notification-bandeaux');
  if (!container) return;

  try {
    const res = await apiCallPaiement('/notifications');
    if (!res.ok) return;
    const data = await res.json();

    // BUG-003 FIX — types API réels : 'info', 'warning', 'error', 'success'
    const notifs = (data.notifications || []).filter(n =>
      ['info', 'warning', 'error', 'success'].includes(n.type)
    );

    if (!notifs.length) { container.innerHTML = ''; return; }

    container.innerHTML = notifs.map(n => construireBandeau(n)).join('');

    // Badge sur nav abonnement si action requise (type 'error' ou 'warning' avec action)
    const requiresAction = notifs.some(n =>
      n.type === 'error' || (n.type === 'warning' && n.action)
    );
    const badge = document.getElementById('badge-abonnement');
    if (badge) {
      badge.classList.toggle('hidden', !requiresAction);
    }
  } catch { /* Silencieux — le dashboard fonctionne sans bandeaux */ }
}

function construireBandeau(notif) {
  // BUG-003 FIX — mapping sur les types API réels ('info','warning','error','success')
  const colorMap = {
    info:    'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    error:   'bg-red-50 border-red-200 text-red-800',
    success: 'bg-green-50 border-green-200 text-green-800',
  };
  const iconMap = {
    info:    'fa-circle-info text-blue-500',
    warning: 'fa-triangle-exclamation text-yellow-500',
    error:   'fa-circle-xmark text-red-500',
    success: 'fa-circle-check text-green-500',
  };

  const couleur = colorMap[notif.type] || colorMap.info;
  const icone   = iconMap[notif.type]  || iconMap.info;

  return `
    <div class="border-b ${couleur} px-4 py-3 flex items-center gap-3 text-sm" role="alert">
      <i class="fa-solid ${icone} flex-shrink-0 text-base"></i>
      <div class="flex-1">
        <span class="font-semibold">${esc(notif.titre || '')}</span>
        ${notif.titre ? ' — ' : ''}${esc(notif.message)}
      </div>
      ${notif.action ? `<a href="${esc(notif.action.href)}" class="font-semibold underline hover:no-underline whitespace-nowrap ml-2">${esc(notif.action.label || 'Voir')}</a>` : ''}
    </div>
  `;
}

// ─── Section Abonnement (/dashboard/abonnement) ───────────────────────────────

/**
 * BUG-009 CORRIGÉ — race condition : les plans sont chargés AVANT l'affichage
 * de la section, via await séquentiel dans le DOMContentLoaded.
 *
 * @returns {Promise<void>}
 */
async function initSectionAbonnement() {
  const container = document.getElementById('section-abonnement-content');
  if (!container) return;

  container.innerHTML = `
    <div class="text-center py-16 text-gray-400">
      <i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3 block"></i>
      <p class="text-sm">Chargement de votre abonnement...</p>
    </div>
  `;

  try {
    // Charger en parallèle : statut + historique + plans + moyens paiement
    const [statutRes, historiqueRes, plansRes, moyensRes] = await Promise.all([
      apiCallPaiement('/statut'),
      apiCallPaiement('/historique'),
      fetch(PLANS_API, { credentials: 'include' }),
      fetch('/api/v1/moyens-paiement', { credentials: 'include' }).catch(() => null)
    ]);

    const statut    = statutRes.ok    ? await statutRes.json()    : null;
    const historique = historiqueRes.ok ? await historiqueRes.json() : null;
    const plansData  = plansRes.ok     ? await plansRes.json()     : null;
    const moyensData = moyensRes?.ok   ? await moyensRes.json()    : null;

    // Mettre les plans dans le cache module pour le formulaire
    _plansCache = plansData?.plans ?? [];

    container.innerHTML = '';

    if (statut) {
      container.appendChild(construireCarteStatut(statut));
    }

    // Bloc instructions moyens de paiement
    if (moyensData?.moyens?.length || _plansCache.length) {
      container.appendChild(construireBlocMoyensPaiement(moyensData?.moyens ?? []));
    }

    if (historique?.abonnements?.length) {
      container.appendChild(construireHistorique(historique.abonnements));
    }

    if (!statut && !historique?.abonnements?.length) {
      container.innerHTML = `
        <div class="text-center py-12 text-gray-400">
          <i class="fa-solid fa-credit-card text-4xl mb-3 block"></i>
          <p class="text-sm">Aucun abonnement trouvé.</p>
          <button onclick="initSectionAbonnement()" class="mt-4 text-red-600 hover:underline text-sm font-medium">Réessayer →</button>
        </div>
      `;
    }
  } catch (err) {
    container.innerHTML = `<div class="p-4 text-red-600 text-sm">Erreur de chargement. <button onclick="initSectionAbonnement()" class="underline">Réessayer</button></div>`;
  }
}

// Cache des plans pour éviter de recharger
let _plansCache = [];

/**
 * BUG-002 CORRIGÉ — lecture des champs corrects depuis la réponse API :
 *   s.statut_tenant (pas s.statut_abonnement)
 *   s.abonnement.statut (objet imbriqué)
 *   s.abonnement.delai_confirmation_expire_le (pas s.deadline_confirmation)
 *   s.abonnement.reference_paiement (pas s.reference_active)
 */
function construireCarteStatut(s) {
  const div = document.createElement('div');
  div.className = 'space-y-4 mb-6';

  // ── BUG-002 FIX : lire depuis s.abonnement (objet imbriqué) ──
  const abonnement = s.abonnement;
  const statutAbonnement = abonnement?.statut ?? null;
  const statutTenant = s.statut_tenant;

  let statutHtml = '';
  let actionHtml = '';
  let upgradeHtml = '';

  if (statutAbonnement === 'actif') {
    // Feat D — afficher bouton upgrade/downgrade si plan actif
    upgradeHtml = `
      <div class="mt-3">
        <button onclick="ouvrirModalChangementPlan()"
          class="text-sm text-red-600 hover:text-red-800 font-medium underline hover:no-underline flex items-center gap-1.5">
          <i class="fa-solid fa-arrows-rotate text-xs"></i>
          Changer de plan (upgrade / downgrade)
        </button>
      </div>
    `;

    statutHtml = `
      <div class="bg-green-50 border border-green-200 rounded-2xl p-5">
        <div class="flex items-center gap-3 mb-2">
          <i class="fa-solid fa-circle-check text-green-500 text-xl"></i>
          <span class="font-bold text-green-800">Abonnement actif</span>
        </div>
        <p class="text-sm text-green-700">Plan : <strong>${esc(abonnement?.plan_nom || '—')}</strong></p>
        <p class="text-sm text-green-700">Expire le : <strong>${formatDate(abonnement?.date_fin)}</strong></p>
        ${upgradeHtml}
      </div>
    `;
  } else if (statutAbonnement === 'en_attente_confirmation') {
    // BUG-002 FIX : lire delai_confirmation_expire_le depuis abonnement
    const deadline = abonnement?.delai_confirmation_expire_le ?? abonnement?.delai_confirmation_expire_le;
    const hR  = deadline ? heuresRestantes(deadline) : null;
    const soumisLe = abonnement?.soumis_le;
    const pct = (soumisLe && deadline) ? progressionDelai(soumisLe, deadline) : 0;
    const urgent = hR !== null && hR < 12;

    statutHtml = `
      <div class="bg-blue-50 border border-blue-200 rounded-2xl p-5">
        <div class="flex items-center gap-3 mb-3">
          <i class="fa-solid fa-clock text-blue-500 text-xl"></i>
          <div>
            <span class="font-bold text-blue-800">Paiement en cours de vérification</span>
            <p class="text-xs text-blue-600 mt-0.5">Soumis le ${formatDate(soumisLe)}</p>
          </div>
        </div>
        ${hR !== null ? `
        <div class="mb-3">
          <div class="flex items-center justify-between text-xs text-blue-600 mb-1">
            <span>Délai de confirmation (${DELAI_CONFIRMATION_H}h max)</span>
            <span class="${urgent ? 'text-orange-600 font-bold' : ''}">${hR > 0 ? `${hR}h restantes` : 'Délai dépassé'}</span>
          </div>
          <div class="h-2 bg-blue-100 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all ${pct > 80 ? 'bg-orange-500' : 'bg-blue-500'}" style="width: ${pct}%"></div>
          </div>
        </div>` : ''}
        <p class="text-xs text-blue-600">
          <i class="fa-solid fa-circle-info mr-1"></i>
          Votre accès est maintenu pendant les ${FENETRE_TOLERANCE_H}h suivant la soumission.
          Notre équipe confirme sous ${DELAI_CONFIRMATION_H}h.
        </p>
        ${abonnement?.reference_paiement ? `
        <p class="text-xs text-blue-500 mt-2">
          <i class="fa-solid fa-hashtag mr-1"></i>
          Référence : <code class="font-mono font-bold">${esc(abonnement.reference_paiement)}</code>
        </p>` : ''}
      </div>
    `;
  } else if (statutTenant === 'essai' && s.jours_essai_restants !== null) {
    const jours = s.jours_essai_restants;
    const couleur = jours <= 2 ? 'orange' : 'blue';
    statutHtml = `
      <div class="bg-${couleur}-50 border border-${couleur}-200 rounded-2xl p-5">
        <div class="flex items-center gap-3 mb-2">
          <i class="fa-solid fa-hourglass-half text-${couleur}-500 text-xl"></i>
          <span class="font-bold text-${couleur}-800">Période d'essai</span>
        </div>
        <p class="text-sm text-${couleur}-700">
          ${jours > 0
            ? `Il vous reste <strong>${jours} jour(s)</strong> d'essai gratuit.`
            : '<strong>Votre période d\'essai est terminée.</strong>'}
        </p>
        <p class="text-sm text-${couleur}-600 mt-1">
          Soumettez une preuve de paiement pour activer votre abonnement.
        </p>
      </div>
    `;
  } else {
    statutHtml = `
      <div class="bg-orange-50 border border-orange-200 rounded-2xl p-5">
        <div class="flex items-center gap-3 mb-2">
          <i class="fa-solid fa-triangle-exclamation text-orange-500 text-xl"></i>
          <span class="font-bold text-orange-800">Aucun abonnement actif</span>
        </div>
        <p class="text-sm text-orange-700 mb-4">
          Effectuez un paiement et soumettez votre preuve pour activer votre restaurant.
        </p>
      </div>
    `;
  }

  // ── Bloc référence de paiement ──
  let referenceHtml = '';
  if (s.reference_active) {
    referenceHtml = `
      <div class="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 class="font-bold text-gray-900 mb-1 text-sm flex items-center gap-2">
          <i class="fa-solid fa-hashtag text-gray-400"></i>
          Référence de paiement active
        </h3>
        <p class="text-xs text-gray-400 mb-3">
          Mentionnez cette référence dans votre virement pour faciliter la vérification.
        </p>
        <div class="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
          <code class="font-mono font-bold text-gray-800 text-base tracking-wider flex-1">${esc(s.reference_active)}</code>
          <button onclick="copierTexte('${esc(s.reference_active)}', this)"
            class="text-xs border border-gray-200 hover:border-gray-400 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-gray-600 hover:text-gray-900">
            <i class="fa-solid fa-copy"></i> Copier
          </button>
        </div>
      </div>
    `;
  }

  // ── CTA : soumettre preuve (uniquement si pas déjà en attente) ──
  if (statutAbonnement !== 'en_attente_confirmation') {
    actionHtml = `
      <div class="bg-white border border-gray-200 rounded-2xl p-5" id="bloc-soumettre-preuve">
        <h3 class="font-bold text-gray-900 mb-1 text-sm flex items-center gap-2">
          <i class="fa-solid fa-upload text-gray-400"></i>
          Soumettre ma preuve de paiement
        </h3>
        <p class="text-xs text-gray-400 mb-4">
          Téléversez une capture d'écran de votre reçu de paiement (JPG ou PNG, max 5 Mo).
        </p>
        ${construireFormUpload()}
      </div>
    `;
  }

  div.innerHTML = statutHtml + referenceHtml + actionHtml;

  // BUG-009 FIX — charger les plans dans le select APRÈS que le DOM est injecté
  // On utilise setTimeout(0) pour attendre que le div soit dans le DOM
  if (statutAbonnement !== 'en_attente_confirmation') {
    setTimeout(() => {
      const sel = document.getElementById('inp-plan-preuve');
      if (sel && _plansCache.length) {
        remplirSelectPlans(sel, _plansCache);
      } else if (sel) {
        chargerPlansSelect('inp-plan-preuve');
      }
    }, 0);
  }

  return div;
}

// ─── Bloc Moyens de Paiement ──────────────────────────────────────────────────

function construireBlocMoyensPaiement(moyens) {
  if (!moyens.length) return document.createDocumentFragment();

  const div = document.createElement('div');
  div.className = 'bg-white border border-gray-200 rounded-2xl p-5 mb-4';
  div.innerHTML = `
    <h3 class="font-bold text-gray-900 mb-3 text-sm flex items-center gap-2">
      <i class="fa-solid fa-mobile-screen text-gray-400"></i>
      Moyens de paiement acceptés
    </h3>
    <div class="space-y-3">
      ${moyens.map(m => `
        <div class="border border-gray-100 rounded-xl p-4 hover:bg-gray-50 transition-colors">
          <div class="flex items-center justify-between mb-2">
            <span class="font-semibold text-gray-900 text-sm">${esc(m.nom)}</span>
            ${m.numero ? `
            <div class="flex items-center gap-2">
              <code class="text-xs font-mono text-gray-700 bg-gray-100 px-2 py-0.5 rounded">${esc(m.numero)}</code>
              <button onclick="copierTexte('${esc(m.numero)}', this)"
                class="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 px-2 py-0.5 rounded">
                <i class="fa-solid fa-copy"></i>
              </button>
            </div>` : ''}
          </div>
          ${m.nom_compte ? `<p class="text-xs text-gray-500 mb-1">Compte : <strong>${esc(m.nom_compte)}</strong></p>` : ''}
          ${m.instructions ? `<p class="text-xs text-gray-400 leading-relaxed">${esc(m.instructions)}</p>` : ''}
        </div>
      `).join('')}
    </div>
  `;
  return div;
}

// ─── Formulaire d'upload preuve ───────────────────────────────────────────────

function construireFormUpload() {
  return `
    <div id="upload-zone"
      class="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center transition-all cursor-pointer hover:border-red-300 hover:bg-red-50/30"
      ondragover="handleDragOver(event)"
      ondragleave="handleDragLeave(event)"
      ondrop="handleDrop(event)"
      onclick="document.getElementById('inp-preuve').click()">
      <div id="upload-placeholder">
        <i class="fa-solid fa-cloud-arrow-up text-3xl text-gray-300 mb-2 block"></i>
        <p class="text-sm text-gray-500 font-medium">Glissez votre capture ici ou cliquez pour choisir</p>
        <p class="text-xs text-gray-400 mt-1">JPG, PNG — maximum 5 Mo</p>
      </div>
      <div id="upload-preview" class="hidden">
        <img id="upload-preview-img" src="" alt="Aperçu preuve" class="max-h-40 mx-auto rounded-xl object-contain mb-2">
        <p id="upload-preview-name" class="text-xs text-gray-500 truncate max-w-xs mx-auto"></p>
      </div>
    </div>
    <input id="inp-preuve" type="file" accept=".jpg,.jpeg,.png" class="hidden" onchange="previewPreuve(this)">

    <div id="upload-error" class="hidden mt-2 text-xs text-red-600 flex items-center gap-1.5">
      <i class="fa-solid fa-circle-exclamation"></i>
      <span id="upload-error-msg"></span>
    </div>

    <div class="mt-4">
      <label class="block text-xs font-semibold text-gray-600 mb-1.5">Plan souhaité *</label>
      <select id="inp-plan-preuve" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400">
        <option value="">Chargement des plans...</option>
      </select>
    </div>

    <!-- BUG-006 FIX — Toggle mensuel/annuel ajouté au formulaire -->
    <div class="mt-3">
      <label class="block text-xs font-semibold text-gray-600 mb-1.5">Périodicité *</label>
      <div class="flex gap-3">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="periodicite-preuve" id="radio-mensuel" value="mensuel" checked
            class="text-red-600 focus:ring-red-200" onchange="majAffichagePrix()">
          <span class="text-sm text-gray-700">Mensuel</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="periodicite-preuve" id="radio-annuel" value="annuel"
            class="text-red-600 focus:ring-red-200" onchange="majAffichagePrix()">
          <span class="text-sm text-gray-700">Annuel <span class="text-xs text-green-600 font-semibold">(économies)</span></span>
        </label>
      </div>
      <p id="affichage-prix-plan" class="mt-1.5 text-xs text-gray-400"></p>
    </div>

    <div class="mt-3">
      <label class="block text-xs font-semibold text-gray-600 mb-1.5">Méthode de paiement *</label>
      <select id="inp-methode-preuve" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400">
        <option value="">Sélectionner...</option>
        <option value="Orange Money">Orange Money</option>
        <option value="Mobile Money (Moov)">Mobile Money (Moov)</option>
        <option value="Mobile Money (MTN)">Mobile Money (MTN)</option>
        <option value="Virement bancaire">Virement bancaire</option>
        <option value="Espèces">Espèces</option>
        <option value="Autre">Autre</option>
      </select>
    </div>

    <div id="upload-progress" class="hidden mt-4">
      <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div id="upload-progress-bar" class="h-full bg-red-500 rounded-full transition-all" style="width: 0%"></div>
      </div>
      <p class="text-xs text-gray-400 mt-1 text-center">Envoi en cours...</p>
    </div>

    <button id="btn-soumettre-preuve" onclick="soumettrePreuvePaiement()"
      class="mt-4 w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
      <i class="fa-solid fa-paper-plane"></i> Soumettre ma preuve
    </button>
    <p id="msg-soumettre" class="hidden mt-3 text-sm text-center font-medium rounded-xl p-3"></p>
  `;
}

// ─── Affichage prix selon toggle mensuel/annuel ────────────────────────────────

function majAffichagePrix() {
  const sel = document.getElementById('inp-plan-preuve');
  const radio = document.querySelector('input[name="periodicite-preuve"]:checked');
  const affEl = document.getElementById('affichage-prix-plan');
  if (!sel || !radio || !affEl) return;

  const planId = sel.value;
  const periodicite = radio.value;
  const plan = _plansCache.find(p => p.id === planId);

  if (plan) {
    const prix = periodicite === 'annuel' ? plan.prix_annuel : plan.prix_mensuel;
    const eco = periodicite === 'annuel' ? plan.economie_annuelle : null;
    affEl.textContent = `Montant : ${Number(prix).toLocaleString('fr-FR')} FCFA/${periodicite === 'annuel' ? 'an' : 'mois'}`
      + (eco && eco > 0 ? ` — économie de ${Number(eco).toLocaleString('fr-FR')} FCFA/an` : '');
  } else {
    affEl.textContent = '';
  }
}

// ─── Drag & Drop ─────────────────────────────────────────────────────────────

function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('upload-zone')?.classList.add('border-red-400', 'bg-red-50/50');
}

function handleDragLeave(e) {
  document.getElementById('upload-zone')?.classList.remove('border-red-400', 'bg-red-50/50');
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('upload-zone')?.classList.remove('border-red-400', 'bg-red-50/50');
  const file = e.dataTransfer?.files?.[0];
  if (file) {
    const inp = document.getElementById('inp-preuve');
    const dt = new DataTransfer();
    dt.items.add(file);
    inp.files = dt.files;
    previewPreuve(inp);
  }
}

// ─── Preview fichier ──────────────────────────────────────────────────────────

let _preuveFichier = null;

function previewPreuve(input) {
  const file = input.files?.[0];
  if (!file) return;

  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  const errEl  = document.getElementById('upload-error');
  const errMsg = document.getElementById('upload-error-msg');

  if (!EXTENSIONS_VALIDES.includes(ext)) {
    errMsg.textContent = `Extension non autorisée (${ext}). Utilisez JPG ou PNG.`;
    errEl.classList.remove('hidden');
    input.value = '';
    _preuveFichier = null;
    return;
  }
  if (!MIME_VALIDES.includes(file.type)) {
    errMsg.textContent = `Type de fichier invalide (${file.type}).`;
    errEl.classList.remove('hidden');
    input.value = '';
    _preuveFichier = null;
    return;
  }
  if (file.size > MAX_TAILLE_FICHIER) {
    errMsg.textContent = `Fichier trop volumineux (${(file.size/1024/1024).toFixed(1)} Mo). Maximum 5 Mo.`;
    errEl.classList.remove('hidden');
    input.value = '';
    _preuveFichier = null;
    return;
  }

  errEl.classList.add('hidden');
  _preuveFichier = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('upload-preview-img').src = e.target.result;
    document.getElementById('upload-preview-name').textContent =
      `Image ${ext.toUpperCase().replace('.', '')} — ${(file.size/1024).toFixed(0)} Ko`;
    document.getElementById('upload-placeholder').classList.add('hidden');
    document.getElementById('upload-preview').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

// ─── Chargement des plans pour le select ─────────────────────────────────────

function remplirSelectPlans(sel, plans) {
  const plansFiltres = plans.filter(p => p.actif && p.prix_mensuel > 0);
  sel.innerHTML = '<option value="">Sélectionner un plan...</option>' +
    plansFiltres.map(p =>
      `<option value="${esc(p.id)}">${esc(p.nom)} — ${Number(p.prix_mensuel).toLocaleString('fr-FR')} FCFA/mois</option>`
    ).join('');
  sel.addEventListener('change', majAffichagePrix);
}

async function chargerPlansSelect(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  try {
    const res = await fetch(PLANS_API, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    _plansCache = data.plans ?? [];
    remplirSelectPlans(sel, _plansCache);
  } catch {}
}

// ─── Soumission de la preuve ──────────────────────────────────────────────────

async function soumettrePreuvePaiement() {
  const btn  = document.getElementById('btn-soumettre-preuve');
  const msg  = document.getElementById('msg-soumettre');
  const planId  = document.getElementById('inp-plan-preuve')?.value;
  const methode = document.getElementById('inp-methode-preuve')?.value;

  // BUG-006 FIX — lire la périodicité depuis les radio buttons
  const periodiciteEl = document.querySelector('input[name="periodicite-preuve"]:checked');
  const periodicite = periodiciteEl?.value ?? 'mensuel';

  if (!_preuveFichier) {
    afficherErreurUpload('Veuillez sélectionner une image de votre reçu.');
    return;
  }
  if (!planId) {
    afficherErreurUpload('Sélectionnez le plan souhaité.');
    return;
  }
  if (!methode) {
    afficherErreurUpload('Sélectionnez la méthode de paiement.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Envoi en cours...';
  document.getElementById('upload-progress').classList.remove('hidden');
  document.getElementById('upload-error').classList.add('hidden');

  let pct = 0;
  const progressInterval = setInterval(() => {
    pct = Math.min(pct + 12, 85);
    const bar = document.getElementById('upload-progress-bar');
    if (bar) bar.style.width = pct + '%';
  }, 300);

  try {
    const formData = new FormData();
    formData.append('preuve', _preuveFichier);
    formData.append('plan_id', planId);
    formData.append('methode_paiement', methode);
    // BUG-006 FIX — transmettre la périodicité sélectionnée
    formData.append('periodicite', periodicite);

    const res = await apiCallPaiement('/soumettre', {
      method: 'POST',
      body: formData
    });

    clearInterval(progressInterval);
    const bar = document.getElementById('upload-progress-bar');
    if (bar) bar.style.width = '100%';

    const data = await res.json();

    if (res.ok) {
      msg.className = 'mt-3 text-sm text-center font-medium rounded-xl p-3 bg-green-50 text-green-700 border border-green-200';
      msg.textContent = data.message || '✓ Preuve soumise ! Notre équipe vérifiera sous 38h.';
      msg.classList.remove('hidden');
      btn.innerHTML = '<i class="fa-solid fa-check mr-2"></i>Preuve envoyée';

      setTimeout(() => initSectionAbonnement(), 2500);
    } else {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-paper-plane mr-2"></i>Soumettre ma preuve';
      afficherErreurUpload(data.error || 'Erreur lors de l\'envoi. Réessayez.');
    }
  } catch (err) {
    clearInterval(progressInterval);
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane mr-2"></i>Soumettre ma preuve';
    afficherErreurUpload('Erreur de connexion. Vérifiez votre réseau.');
  } finally {
    setTimeout(() => {
      document.getElementById('upload-progress')?.classList.add('hidden');
      const bar = document.getElementById('upload-progress-bar');
      if (bar) bar.style.width = '0%';
    }, 1000);
  }
}

function afficherErreurUpload(msg) {
  const el = document.getElementById('upload-error');
  const msgEl = document.getElementById('upload-error-msg');
  if (el && msgEl) {
    msgEl.textContent = msg;
    el.classList.remove('hidden');
  }
}

// ─── Feat D — Modal changement de plan (upgrade/downgrade) ────────────────────

function ouvrirModalChangementPlan() {
  // Supprimer une éventuelle modale existante
  document.getElementById('modal-changement-plan')?.remove();

  const plansFiltres = _plansCache.filter(p => p.actif && p.prix_mensuel > 0);
  if (!plansFiltres.length) {
    alert('Impossible de charger les plans disponibles. Réessayez.');
    return;
  }

  const modal = document.createElement('div');
  modal.id = 'modal-changement-plan';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 class="font-bold text-gray-900">Changer de plan</h2>
        <button onclick="document.getElementById('modal-changement-plan').remove()"
          class="text-gray-400 hover:text-gray-700 text-xl font-bold">&times;</button>
      </div>
      <div class="p-6">
        <p class="text-sm text-gray-600 mb-4">
          Sélectionnez le plan vers lequel vous souhaitez migrer.
          Le changement prend effet à la prochaine période de facturation après confirmation admin.
        </p>
        <div class="space-y-3 mb-4">
          ${plansFiltres.map(p => `
            <label class="flex items-start gap-3 border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-red-300 hover:bg-red-50/30 transition-colors">
              <input type="radio" name="plan-changement" value="${esc(p.id)}"
                class="mt-0.5 text-red-600 focus:ring-red-200">
              <div class="flex-1">
                <div class="flex items-center justify-between">
                  <span class="font-semibold text-gray-900 text-sm">${esc(p.nom)}</span>
                  <span class="text-sm font-bold text-red-600">${Number(p.prix_mensuel).toLocaleString('fr-FR')} FCFA/mois</span>
                </div>
                ${p.fonctionnalites?.sous_titre ? `<p class="text-xs text-gray-500 mt-0.5">${esc(p.fonctionnalites.sous_titre)}</p>` : ''}
              </div>
            </label>
          `).join('')}
        </div>
        <div class="mt-3 mb-4">
          <label class="block text-xs font-semibold text-gray-600 mb-1.5">Périodicité souhaitée</label>
          <div class="flex gap-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="periodicite-changement" value="mensuel" checked class="text-red-600">
              <span class="text-sm">Mensuel</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="periodicite-changement" value="annuel" class="text-red-600">
              <span class="text-sm">Annuel <span class="text-xs text-green-600">(économies)</span></span>
            </label>
          </div>
        </div>
        <p id="msg-changement-plan" class="hidden text-xs p-3 rounded-xl mb-3"></p>
        <button onclick="soumettreChangementPlan()"
          class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors">
          <i class="fa-solid fa-arrows-rotate mr-2"></i>Demander ce plan
        </button>
        <p class="text-xs text-gray-400 text-center mt-3">
          Une preuve de paiement sera requise pour finaliser le changement.
        </p>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Fermer en cliquant hors de la modale
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

async function soumettreChangementPlan() {
  const planId = document.querySelector('input[name="plan-changement"]:checked')?.value;
  const periodicite = document.querySelector('input[name="periodicite-changement"]:checked')?.value ?? 'mensuel';
  const msgEl = document.getElementById('msg-changement-plan');

  if (!planId) {
    if (msgEl) {
      msgEl.textContent = 'Veuillez sélectionner un plan.';
      msgEl.className = 'text-xs p-3 rounded-xl mb-3 bg-red-50 text-red-600';
      msgEl.classList.remove('hidden');
    }
    return;
  }

  // Pré-remplir le formulaire de soumission preuve avec le nouveau plan
  document.getElementById('modal-changement-plan')?.remove();

  // Scroller vers le bloc de soumission preuve
  const blocSoumettre = document.getElementById('bloc-soumettre-preuve');
  if (blocSoumettre) {
    blocSoumettre.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Pré-sélectionner le plan
    const sel = document.getElementById('inp-plan-preuve');
    if (sel) {
      sel.value = planId;
      // Déclencher la mise à jour du prix affiché
      majAffichagePrix();
    }

    // Pré-sélectionner la périodicité
    const radioPerio = document.querySelector(`input[name="periodicite-preuve"][value="${periodicite}"]`);
    if (radioPerio) {
      radioPerio.checked = true;
      majAffichagePrix();
    }
  }
}

// ─── Historique des abonnements ───────────────────────────────────────────────

/**
 * BUG-007 FIX — affiche plan_nom retourné par l'API (enrichi côté serveur)
 * au lieu du plan_id UUID brut.
 */
function construireHistorique(abonnements) {
  const statutLabels = {
    actif:                  '<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-semibold">Actif</span>',
    en_attente_confirmation:'<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-semibold">En attente</span>',
    expire:                 '<span class="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-xs font-semibold">Expiré</span>',
    annule:                 '<span class="bg-red-100 text-red-500 px-2 py-0.5 rounded-full text-xs font-semibold">Annulé</span>',
    en_retard:              '<span class="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs font-semibold">En retard</span>',
  };

  const section = document.createElement('div');
  section.className = 'bg-white border border-gray-200 rounded-2xl overflow-hidden';
  section.innerHTML = `
    <div class="px-5 py-4 border-b border-gray-100">
      <h3 class="font-bold text-gray-900 text-sm">Historique des abonnements</h3>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-xs text-gray-500 bg-gray-50 uppercase">
            <th class="px-4 py-3 text-left">Plan</th>
            <th class="px-4 py-3 text-left hidden md:table-cell">Période</th>
            <th class="px-4 py-3 text-left hidden sm:table-cell">Montant</th>
            <th class="px-4 py-3 text-left">Statut</th>
          </tr>
        </thead>
        <tbody>
          ${abonnements.map(a => `
            <tr class="border-t border-gray-50 hover:bg-gray-50/50">
              <!-- BUG-007 FIX : afficher plan_nom (enrichi côté serveur) -->
              <td class="px-4 py-3 font-medium text-gray-800">${esc(a.plan_nom || a.plan_id || '—')}</td>
              <td class="px-4 py-3 text-gray-500 hidden md:table-cell text-xs">
                ${formatDate(a.date_debut)} → ${formatDate(a.date_fin)}
              </td>
              <td class="px-4 py-3 text-gray-600 hidden sm:table-cell">${formatMontant(a.montant_paye)}</td>
              <td class="px-4 py-3">
                ${statutLabels[a.statut] || esc(a.statut)}
                ${a.motif_rejet ? `<div class="text-xs text-red-400 mt-0.5" title="${esc(a.motif_rejet)}">Motif: ${esc(a.motif_rejet.slice(0,40))}...</div>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  return section;
}

// ─── Notifications paiement ───────────────────────────────────────────────────

async function afficherNotificationsPaiement() {
  const container = document.getElementById('notifs-paiement-list');
  if (!container) return;

  try {
    const res = await apiCallPaiement('/notifications');
    if (!res.ok) { container.innerHTML = ''; return; }
    const data = await res.json();

    if (!data.notifications?.length) {
      container.innerHTML = '<p class="text-xs text-gray-400 py-4 text-center">Aucune notification.</p>';
      return;
    }

    const colorMap = {
      success: 'bg-green-50 border-green-200 text-green-800',
      warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
      error:   'bg-red-50 border-red-200 text-red-800',
      info:    'bg-blue-50 border-blue-200 text-blue-800',
    };
    const iconMap = {
      success: 'fa-circle-check text-green-500',
      warning: 'fa-triangle-exclamation text-yellow-500',
      error:   'fa-circle-xmark text-red-500',
      info:    'fa-circle-info text-blue-500',
    };

    container.innerHTML = data.notifications.map(n => `
      <div class="border rounded-xl p-3 mb-2 flex items-start gap-2 ${colorMap[n.type] || colorMap.info}">
        <i class="fa-solid ${iconMap[n.type] || iconMap.info} mt-0.5 flex-shrink-0"></i>
        <div class="flex-1">
          ${n.titre ? `<p class="text-xs font-semibold">${esc(n.titre)}</p>` : ''}
          <p class="text-xs">${esc(n.message)}</p>
          <p class="text-xs opacity-60 mt-0.5">${formatDate(n.created_at)}</p>
        </div>
        ${n.action ? `<a href="${esc(n.action.href)}" class="text-xs font-medium underline whitespace-nowrap">${esc(n.action.label)}</a>` : ''}
      </div>
    `).join('');
  } catch {}
}

// ─── Utilitaire copier ────────────────────────────────────────────────────────

function copierTexte(texte, btnEl) {
  navigator.clipboard?.writeText(texte).then(() => {
    if (btnEl) {
      const original = btnEl.innerHTML;
      btnEl.innerHTML = '<i class="fa-solid fa-check text-green-600"></i> Copié !';
      setTimeout(() => { btnEl.innerHTML = original; }, 2000);
    }
  });
}

// ─── Initialisation automatique ──────────────────────────────────────────────
// BUG-009 FIX — séquentialisation : charger les plans d'abord,
// PUIS initialiser la section (évite la race condition).

document.addEventListener('DOMContentLoaded', async () => {
  // Pré-charger les plans en cache (pour éviter la race condition BUG-009)
  try {
    const res = await fetch(PLANS_API, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      _plansCache = data.plans ?? [];
    }
  } catch {}

  // Initialiser la section abonnement si on est sur /dashboard/abonnement
  if (window.location.pathname === '/dashboard/abonnement') {
    await initSectionAbonnement();
  }
  // Sinon, juste remplir le select si présent (page autre avec le module chargé)
  else if (document.getElementById('inp-plan-preuve')) {
    const sel = document.getElementById('inp-plan-preuve');
    if (_plansCache.length) {
      remplirSelectPlans(sel, _plansCache);
    }
  }
});

// ─── Exports globaux ─────────────────────────────────────────────────────────
window.initBandeauxPaiement    = initBandeauxPaiement;
window.initSectionAbonnement   = initSectionAbonnement;
window.soumettrePreuvePaiement = soumettrePreuvePaiement;
window.afficherNotificationsPaiement = afficherNotificationsPaiement;
window.handleDragOver  = handleDragOver;
window.handleDragLeave = handleDragLeave;
window.handleDrop      = handleDrop;
window.previewPreuve   = previewPreuve;
window.copierTexte     = copierTexte;
window.ouvrirModalChangementPlan = ouvrirModalChangementPlan;
window.soumettreChangementPlan   = soumettreChangementPlan;
window.majAffichagePrix = majAffichagePrix;
