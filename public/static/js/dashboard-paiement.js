/**
 * public/static/js/dashboard-paiement.js — Module UI paiement manuel (côté restaurant)
 *
 * Ce module gère :
 *   - Les bandeaux de notification paiement dans le header du dashboard
 *   - La section /dashboard/abonnement complète (statut, référence, upload preuve,
 *     historique, progression délai)
 *   - L'upload avec drag-and-drop et validation 4 couches côté client
 *
 * SÉCURITÉ CÔTÉ CLIENT :
 *   - Toutes les requêtes ajoutent X-Requested-With: XMLHttpRequest (SEC-05 CSRF)
 *   - Les tokens JWT ne sont jamais manipulés ici (gérés par le serveur via cookie httpOnly)
 *   - Validation extension + taille côté client (pré-filtre) ; la validation magic bytes
 *     reste côté serveur (SEC-02)
 *
 * @module dashboard-paiement
 * @see src/routes/api-paiement.ts
 * @see audits/paiement/04-plan-implementation.md §B
 */
'use strict';

// ─── Constantes ──────────────────────────────────────────────────────────────
const PAIEMENT_API = '/api/v1/paiement';
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
 * Charge et affiche les bandeaux de notification paiement dans
 * #notification-bandeaux. Appelée au chargement de chaque page dashboard.
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

    const notifs = (data.notifications || []).filter(n =>
      ['paiement_en_attente', 'essai_expirant', 'essai_expire', 'abonnement_confirme', 'abonnement_rejete'].includes(n.type)
    );

    if (!notifs.length) { container.innerHTML = ''; return; }

    container.innerHTML = notifs.map(n => construireBandeau(n)).join('');

    // Badge sur nav abonnement si action requise
    const requiresAction = notifs.some(n =>
      ['essai_expirant', 'essai_expire', 'paiement_rejete'].includes(n.type)
    );
    const badge = document.getElementById('badge-abonnement');
    if (badge) {
      badge.classList.toggle('hidden', !requiresAction);
    }
  } catch { /* Silencieux — le dashboard fonctionne sans bandeaux */ }
}

function construireBandeau(notif) {
  const colorMap = {
    paiement_en_attente: 'bg-blue-50 border-blue-200 text-blue-800',
    essai_expirant:      'bg-yellow-50 border-yellow-200 text-yellow-800',
    essai_expire:        'bg-red-50 border-red-200 text-red-800',
    abonnement_confirme: 'bg-green-50 border-green-200 text-green-800',
    abonnement_rejete:   'bg-red-50 border-red-200 text-red-800',
  };
  const iconMap = {
    paiement_en_attente: 'fa-clock text-blue-500',
    essai_expirant:      'fa-triangle-exclamation text-yellow-500',
    essai_expire:        'fa-circle-xmark text-red-500',
    abonnement_confirme: 'fa-circle-check text-green-500',
    abonnement_rejete:   'fa-circle-xmark text-red-500',
  };

  const couleur = colorMap[notif.type] || 'bg-gray-50 border-gray-200 text-gray-800';
  const icone   = iconMap[notif.type]  || 'fa-info-circle text-gray-500';

  return `
    <div class="border-b ${couleur} px-4 py-3 flex items-center gap-3 text-sm" role="alert">
      <i class="fa-solid ${icone} flex-shrink-0 text-base"></i>
      <span class="flex-1">${esc(notif.message)}</span>
      ${notif.lien ? `<a href="${esc(notif.lien)}" class="font-semibold underline hover:no-underline whitespace-nowrap ml-2">${esc(notif.lien_label || 'Voir')}</a>` : ''}
    </div>
  `;
}

// ─── Section Abonnement (/dashboard/abonnement) ───────────────────────────────

/**
 * Initialise la section Abonnement complète du dashboard.
 * Charge : statut actuel, référence, historique.
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
    const [statutRes, historiqueRes] = await Promise.all([
      apiCallPaiement('/statut'),
      apiCallPaiement('/historique')
    ]);

    const statut    = statutRes.ok    ? await statutRes.json()    : null;
    const historique = historiqueRes.ok ? await historiqueRes.json() : null;

    container.innerHTML = '';

    if (statut) {
      container.appendChild(construireCarteStatut(statut));
    }

    if (historique?.abonnements?.length) {
      container.appendChild(construireHistorique(historique.abonnements));
    }

    if (!statut && !historique?.abonnements?.length) {
      container.innerHTML = `
        <div class="text-center py-12 text-gray-400">
          <i class="fa-solid fa-credit-card text-4xl mb-3 block"></i>
          <p class="text-sm">Aucun abonnement trouvé.</p>
          <a href="/tarifs" class="mt-4 inline-block text-red-600 hover:underline text-sm font-medium">Voir les plans disponibles →</a>
        </div>
      `;
    }
  } catch (err) {
    container.innerHTML = `<div class="p-4 text-red-600 text-sm">Erreur de chargement. Réessayez.</div>`;
  }
}

function construireCarteStatut(s) {
  const div = document.createElement('div');

  // ── Affichage selon le statut ──
  let statutHtml = '';
  let actionHtml = '';

  if (s.statut_abonnement === 'actif') {
    statutHtml = `
      <div class="bg-green-50 border border-green-200 rounded-2xl p-5 mb-6">
        <div class="flex items-center gap-3 mb-2">
          <i class="fa-solid fa-circle-check text-green-500 text-xl"></i>
          <span class="font-bold text-green-800">Abonnement actif</span>
        </div>
        <p class="text-sm text-green-700">Plan : <strong>${esc(s.plan_nom || '—')}</strong></p>
        <p class="text-sm text-green-700">Expire le : <strong>${formatDate(s.date_fin)}</strong></p>
      </div>
    `;
  } else if (s.statut_abonnement === 'en_attente_confirmation') {
    const hR  = heuresRestantes(s.deadline_confirmation);
    const pct = progressionDelai(s.soumis_le, s.deadline_confirmation);
    const urgent = hR < 12;

    statutHtml = `
      <div class="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-6">
        <div class="flex items-center gap-3 mb-3">
          <i class="fa-solid fa-clock text-blue-500 text-xl"></i>
          <div>
            <span class="font-bold text-blue-800">Paiement en cours de vérification</span>
            <p class="text-xs text-blue-600 mt-0.5">Soumis le ${formatDate(s.soumis_le)}</p>
          </div>
        </div>
        <div class="mb-3">
          <div class="flex items-center justify-between text-xs text-blue-600 mb-1">
            <span>Délai de confirmation (${DELAI_CONFIRMATION_H}h max)</span>
            <span class="${urgent ? 'text-orange-600 font-bold' : ''}">${hR > 0 ? `${hR}h restantes` : 'Délai dépassé'}</span>
          </div>
          <div class="h-2 bg-blue-100 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all ${pct > 80 ? 'bg-orange-500' : 'bg-blue-500'}" style="width: ${pct}%"></div>
          </div>
        </div>
        <p class="text-xs text-blue-600">
          <i class="fa-solid fa-circle-info mr-1"></i>
          Votre accès est maintenu pendant les 72h suivant la soumission.
          Notre équipe confirme sous ${DELAI_CONFIRMATION_H}h.
        </p>
      </div>
    `;
  } else if (s.statut_abonnement === 'en_retard' || !s.abonnement_actif) {
    statutHtml = `
      <div class="bg-orange-50 border border-orange-200 rounded-2xl p-5 mb-6">
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
      <div class="bg-white border border-gray-200 rounded-2xl p-5 mb-6">
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
  if (s.statut_abonnement !== 'en_attente_confirmation') {
    actionHtml = `
      <div class="bg-white border border-gray-200 rounded-2xl p-5 mb-6" id="bloc-soumettre-preuve">
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
      <label class="block text-xs font-semibold text-gray-600 mb-1.5">Montant payé (FCFA) *</label>
      <input id="inp-montant-preuve" type="number" min="0" max="9999999"
        class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
        placeholder="Ex: 9500">
    </div>
    <div class="mt-3">
      <label class="block text-xs font-semibold text-gray-600 mb-1.5">Plan souhaité *</label>
      <select id="inp-plan-preuve" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400">
        <option value="">Sélectionner un plan...</option>
      </select>
    </div>
    <div class="mt-3">
      <label class="block text-xs font-semibold text-gray-600 mb-1.5">Méthode de paiement *</label>
      <select id="inp-methode-preuve" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400">
        <option value="">Sélectionner...</option>
        <option value="orange_money">Orange Money</option>
        <option value="moov_money">Moov Money</option>
        <option value="mtn_money">MTN Mobile Money</option>
        <option value="virement">Virement bancaire</option>
        <option value="especes">Espèces</option>
        <option value="autre">Autre</option>
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
    // Simulation de sélection de fichier via DataTransfer
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

  // Validation côté client : extension + taille (magic bytes validés côté serveur)
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

  // Aperçu image
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('upload-preview-img').src = e.target.result;
    // Nom de fichier intentionnellement masqué (SEC-09) — on affiche juste le type + taille
    document.getElementById('upload-preview-name').textContent =
      `Image ${ext.toUpperCase().replace('.', '')} — ${(file.size/1024).toFixed(0)} Ko`;
    document.getElementById('upload-placeholder').classList.add('hidden');
    document.getElementById('upload-preview').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

// ─── Chargement des plans pour le select ─────────────────────────────────────

async function chargerPlansSelect(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  try {
    const res = await fetch('/api/v1/plans', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    const plans = (data.plans || []).filter(p => p.actif && p.prix_mensuel > 0);
    sel.innerHTML = '<option value="">Sélectionner un plan...</option>' +
      plans.map(p => `<option value="${p.id}">${esc(p.nom)} — ${Number(p.prix_mensuel).toLocaleString('fr-FR')} FCFA/mois</option>`).join('');
  } catch {}
}

// ─── Soumission de la preuve ──────────────────────────────────────────────────

/**
 * Soumet la preuve de paiement (capture d'écran) au serveur.
 * Le serveur effectue la validation complète : magic bytes, taille, MIME,
 * idempotence (SEC-01/02/08).
 *
 * @returns {Promise<void>}
 */
async function soumettrePreuvePaiement() {
  const btn  = document.getElementById('btn-soumettre-preuve');
  const msg  = document.getElementById('msg-soumettre');
  const planId  = document.getElementById('inp-plan-preuve')?.value;
  const methode = document.getElementById('inp-methode-preuve')?.value;
  const montant = document.getElementById('inp-montant-preuve')?.value;

  // Validation formulaire
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

  // Animation progression (simulée — Fetch API ne fournit pas de progress nativement)
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
    if (montant) formData.append('montant_declare', montant);

    const res = await apiCallPaiement('/soumettre', {
      method: 'POST',
      body: formData
      // Content-Type omis intentionnellement (browser l'auto-détecte avec boundary)
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

      // Rafraîchir le statut après 2s
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
      document.getElementById('upload-progress').classList.add('hidden');
      if (document.getElementById('upload-progress-bar')) {
        document.getElementById('upload-progress-bar').style.width = '0%';
      }
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

// ─── Historique des abonnements ───────────────────────────────────────────────

/**
 * Construit le tableau HTML de l'historique des abonnements.
 *
 * @param {Array} abonnements - Tableau d'abonnements depuis l'API
 * @returns {HTMLElement}
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
              <td class="px-4 py-3 font-medium text-gray-800">${esc(a.plan_nom || a.plan_id || '—')}</td>
              <td class="px-4 py-3 text-gray-500 hidden md:table-cell text-xs">
                ${formatDate(a.date_debut)} → ${formatDate(a.date_fin)}
              </td>
              <td class="px-4 py-3 text-gray-600 hidden sm:table-cell">${formatMontant(a.montant_paye)}</td>
              <td class="px-4 py-3">${statutLabels[a.statut] || esc(a.statut)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  return section;
}

// ─── Afficher les notifications paiement ─────────────────────────────────────

/**
 * Affiche les notifications paiement dans un conteneur dédié.
 * (Complément des bandeaux — pour la section Abonnement)
 *
 * @returns {Promise<void>}
 */
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
      <div class="border rounded-xl p-3 mb-2 flex items-start gap-2 ${colorMap[n.niveau] || colorMap.info}">
        <i class="fa-solid ${iconMap[n.niveau] || iconMap.info} mt-0.5 flex-shrink-0"></i>
        <div class="flex-1">
          <p class="text-xs font-medium">${esc(n.message)}</p>
          <p class="text-xs opacity-60 mt-0.5">${formatDate(n.created_at)}</p>
        </div>
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

// ─── Initialisation automatique section abonnement ───────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Charger les plans pour le select de soumission (si la section est présente)
  if (document.getElementById('inp-plan-preuve')) {
    await chargerPlansSelect('inp-plan-preuve');
  }
  // Si on est sur /dashboard/abonnement
  if (window.location.pathname === '/dashboard/abonnement') {
    await initSectionAbonnement();
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
