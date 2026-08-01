/**
 * public/static/js/dashboard-paiement.js — Module UI paiement manuel (côté restaurant)
 *
 * CORRECTIONS CYCLE-4 :
 *   FIX-1 — Messages harmonisés : SLA admin annoncé = 48h (avant : "38h",
 *           incohérent avec la deadline technique réelle de 72h côté
 *           serveur). La fenêtre technique de coupure reste 72h, mais est
 *           désormais clairement présentée comme distincte du SLA.
 *   FIX-2 — Classes Tailwind dynamiques (`bg-${couleur}-50`, etc.)
 *           remplacées par un mapping explicite de classes complètes :
 *           Tailwind JIT ne détecte pas les classes construites par
 *           concaténation de variable → le bandeau "essai" n'avait aucun
 *           fond coloré en production.
 *   FIX-3 — Comparaison "Votre plan" corrigée : comparait
 *           s.plan_initial_id (UUID Supabase) à p.id (id D1) → ne
 *           matchait jamais. Utilise désormais s.plan_initial_id_d1
 *           (renvoyé par /api/v1/paiement/statut après correction
 *           serveur, voir src/routes/api-paiement.ts).
 *   FIX-4 — Si /statut échoue (401) mais que moyens/plans sont dispo, on
 *           affiche désormais un bandeau "reconnectez-vous" au lieu de ne
 *           rien afficher à la place de la carte de statut.
 *
 * Ce module gère :
 *   - Les bandeaux de notification paiement dans le header du dashboard
 *   - La section /dashboard/abonnement complète (statut, référence, upload preuve,
 *     historique, progression délai, upgrade/downgrade)
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
 */
'use strict';

// ─── Constantes ──────────────────────────────────────────────────────────────
const PAIEMENT_API = '/api/v1/paiement';
const PLANS_API    = '/api/v1/plans';
const MAX_TAILLE_FICHIER = 5 * 1024 * 1024; // 5 Mo
const EXTENSIONS_VALIDES = ['.jpg', '.jpeg', '.png'];
const MIME_VALIDES = ['image/jpeg', 'image/png'];
// FIX-1 : SLA annoncé au client (48h) distinct de la fenêtre technique (72h)
const SLA_ADMIN_H = 48;
const FENETRE_TOLERANCE_H = 72;

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
  const fetchFn = window.fetchAvecSession || fetch; // fallback si auth-fetch.js absent
  return fetchFn(PAIEMENT_API + path, {
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

async function initBandeauxPaiement() {
  const container = document.getElementById('notification-bandeaux');
  if (!container) return;

  try {
    const res = await apiCallPaiement('/notifications');
    if (!res.ok) return;
    const data = await res.json();

    const notifs = (data.notifications || []).filter(n =>
      ['info', 'warning', 'error', 'success'].includes(n.type)
    );

    if (!notifs.length) { container.innerHTML = ''; return; }

    container.innerHTML = notifs.map(n => construireBandeau(n)).join('');

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
    const [statutRes, historiqueRes, plansRes, moyensRes] = await Promise.all([
      apiCallPaiement('/statut'),
      apiCallPaiement('/historique'),
      fetch(PLANS_API, {
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      }),
      fetch('/api/v1/moyens-paiement', {
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      }).catch(() => null)
    ]);

    const statut     = statutRes.ok     ? await statutRes.json()     : null;
    const historique  = historiqueRes.ok ? await historiqueRes.json() : null;
    const plansData   = plansRes.ok      ? await plansRes.json()      : null;
    const moyensData  = moyensRes?.ok    ? await moyensRes.json()     : null;

    _plansCache = plansData?.plans ?? [];

    container.innerHTML = '';

    // ── Bloc 1 : Statut courant ──
    if (statut) {
      container.appendChild(construireCarteStatut(statut));
    } else if (statutRes.status === 401) {
      // FIX-4 : le 401 est le cas le plus fréquent (session expirée) — on
      // le distingue clairement d'une vraie absence de données, au lieu de
      // simplement ne rien afficher pendant que moyens/plans s'affichent.
      const div = document.createElement('div');
      div.className = 'bg-orange-50 border border-orange-200 rounded-2xl p-5 mb-4 text-sm text-orange-700';
      div.innerHTML = `
        <i class="fa-solid fa-lock mr-1.5"></i>
        Votre session a expiré. <a href="/connexion" class="underline font-semibold">Reconnectez-vous</a> pour voir le détail de votre abonnement.
      `;
      container.appendChild(div);
    }

    // ── Bloc 2 : Moyens de paiement (affiché si données disponibles)
    const moyens = moyensData?.moyens ?? [];
    if (moyens.length > 0 || _plansCache.length > 0) {
      const blocMoyens = construireBlocMoyensPaiement(moyens);
      if (blocMoyens && blocMoyens.children?.length > 0) {
        container.appendChild(blocMoyens);
      } else if (moyens.length > 0) {
        container.appendChild(blocMoyens);
      }
    }

    // ── Bloc 3 : Historique ──
    if (historique?.abonnements?.length) {
      container.appendChild(construireHistorique(historique.abonnements));
    }

    // Cas d'erreur réelle uniquement (pas de statut ET pas d'historique ET pas de plans)
    if (!statut && !historique?.abonnements?.length && !_plansCache.length && statutRes.status !== 401) {
      container.innerHTML = `
        <div class="text-center py-12 text-gray-400">
          <i class="fa-solid fa-credit-card text-4xl mb-3 block"></i>
          <p class="text-sm font-medium text-gray-600 mb-1">Impossible de charger votre abonnement.</p>
          <p class="text-xs">Vérifiez votre connexion ou rechargez la page.</p>
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

// FIX-2 : mapping explicite de classes Tailwind complètes (les classes
// construites par concaténation `bg-${couleur}-50` ne sont PAS détectées
// par le compilateur JIT de Tailwind en production).
const PALETTE_ESSAI = {
  orange: {
    bg: 'bg-orange-50 border-orange-200',
    icone: 'text-orange-500',
    titre: 'text-orange-800',
    texte: 'text-orange-700',
    texteSecondaire: 'text-orange-600'
  },
  blue: {
    bg: 'bg-blue-50 border-blue-200',
    icone: 'text-blue-500',
    titre: 'text-blue-800',
    texte: 'text-blue-700',
    texteSecondaire: 'text-blue-600'
  }
};

function construireCarteStatut(s) {
  const div = document.createElement('div');
  div.className = 'space-y-4 mb-6';

  const abonnement = s.abonnement;
  const statutAbonnement = abonnement?.statut ?? null;
  const statutTenant = s.statut_tenant;

  let statutHtml = '';
  let actionHtml = '';
  let upgradeHtml = '';

  // ── État 'en_attente_paiement_initial' ──
  if (statutTenant === 'en_attente_paiement_initial') {
    const planNom = s.plan_initial_nom || '—';
    const planPrix = s.plan_initial_prix_mensuel;
    const planPrixStr = planPrix != null ? Number(planPrix).toLocaleString('fr-FR') + ' FCFA/mois' : '—';

    statutHtml = `
      <div class="bg-amber-50 border border-amber-200 rounded-2xl p-5">
        <div class="flex items-center gap-3 mb-3">
          <i class="fa-solid fa-clock text-amber-500 text-xl"></i>
          <div>
            <span class="font-bold text-amber-800">En attente de votre premier paiement</span>
            <p class="text-xs text-amber-600 mt-0.5">Votre compte est créé — soumettez votre preuve pour accéder au dashboard.</p>
          </div>
        </div>
        <div class="bg-white/70 rounded-xl px-4 py-3 mb-3">
          <p class="text-sm font-semibold text-gray-800 mb-1">
            <i class="fa-solid fa-tag text-amber-400 mr-1.5"></i>
            Plan choisi : <span class="text-amber-700">${esc(planNom)}</span>
          </p>
          <p class="text-sm text-gray-600">Montant mensuel : <strong>${esc(planPrixStr)}</strong></p>
        </div>
        <p class="text-xs text-amber-700">
          <i class="fa-solid fa-circle-info mr-1"></i>
          Effectuez le paiement en utilisant la référence ci-dessous et uploadez votre reçu.
          Votre accès complet sera débloqué et maintenu pendant ${FENETRE_TOLERANCE_H}h le temps de la vérification.
        </p>
      </div>
    `;
  } else if (statutAbonnement === 'actif') {
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
        <p class="text-sm text-green-700">Plan : <strong>${esc(abonnement?.plan_nom || s.plan_initial_nom || '—')}</strong></p>
        <p class="text-sm text-green-700">Expire le : <strong>${formatDate(abonnement?.date_fin)}</strong></p>
        <p class="text-xs text-green-600 mt-1">
          <i class="fa-solid fa-rotate mr-1"></i>Périodicité : mensuel
        </p>
        ${upgradeHtml}
      </div>
    `;
  } else if (statutAbonnement === 'en_attente_confirmation') {
    const deadline = abonnement?.delai_confirmation_expire_le;
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
            <span>Fenêtre d'accès (${FENETRE_TOLERANCE_H}h max)</span>
            <span class="${urgent ? 'text-orange-600 font-bold' : ''}">${hR > 0 ? `${hR}h restantes` : 'Délai dépassé'}</span>
          </div>
          <div class="h-2 bg-blue-100 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all ${pct > 80 ? 'bg-orange-500' : 'bg-blue-500'}" style="width: ${pct}%"></div>
          </div>
        </div>` : ''}
        <p class="text-xs text-blue-600">
          <i class="fa-solid fa-circle-info mr-1"></i>
          Notre équipe s'engage à confirmer votre paiement sous ${SLA_ADMIN_H}h.
          Votre accès complet reste actif pendant ${FENETRE_TOLERANCE_H}h à partir de la soumission,
          le temps que la vérification se termine.
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
    // FIX-2 : palette figée (classes Tailwind complètes), plus de concaténation dynamique
    const p = jours <= 2 ? PALETTE_ESSAI.orange : PALETTE_ESSAI.blue;
    statutHtml = `
      <div class="${p.bg} rounded-2xl p-5">
        <div class="flex items-center gap-3 mb-2">
          <i class="fa-solid fa-hourglass-half ${p.icone} text-xl"></i>
          <span class="font-bold ${p.titre}">Période d'essai</span>
        </div>
        <p class="text-sm ${p.texte}">
          ${jours > 0
            ? `Il vous reste <strong>${jours} jour(s)</strong> d'essai gratuit.`
            : '<strong>Votre période d\'essai est terminée.</strong>'}
        </p>
        <p class="text-sm ${p.texteSecondaire} mt-1">
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

  // ── Liste des offres disponibles ──
  let offresHtml = '';
  if (_plansCache.length > 0) {
    const plansPayants = _plansCache.filter(p => p.actif && p.prix_mensuel > 0);
    if (plansPayants.length > 0) {
      offresHtml = `
        <div class="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 class="font-bold text-gray-900 mb-3 text-sm flex items-center gap-2">
            <i class="fa-solid fa-list-ul text-gray-400"></i>
            Formules disponibles
          </h3>
          <div class="space-y-2">
            ${plansPayants.map(p => {
              // FIX-3 : comparaison contre l'id D1 résolu côté serveur
              // (avant : s.plan_initial_id, un UUID Supabase, ne matchait
              // jamais un id D1).
              const isActuel = abonnement?.plan_id === p.id || s.plan_initial_id_d1 === p.id;
              return `
                <div class="border ${isActuel ? 'border-red-300 bg-red-50/40' : 'border-gray-100'} rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <span class="font-semibold text-gray-900 text-sm">${esc(p.nom)}</span>
                    ${isActuel ? '<span class="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Votre plan</span>' : ''}
                    <p class="text-xs text-gray-500 mt-0.5">${Number(p.prix_mensuel).toLocaleString('fr-FR')} FCFA/mois</p>
                  </div>
                  ${!isActuel && statutAbonnement !== 'en_attente_confirmation' ? `
                  <button onclick="preselectPlan('${esc(p.id)}')"
                    class="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors font-medium">
                    Choisir
                  </button>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }
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

  div.innerHTML = statutHtml + referenceHtml + offresHtml + actionHtml;

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

// ─── Présélection d'un plan dans le formulaire ────────────────────────────────

function preselectPlan(planId) {
  const sel = document.getElementById('inp-plan-preuve');
  const bloc = document.getElementById('bloc-soumettre-preuve');
  if (sel) {
    sel.value = planId;
    majAffichagePrix();
  }
  if (bloc) {
    bloc.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
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
          ${m.description ? `<p class="text-xs text-gray-500 mb-1">${esc(m.description)}</p>` : ''}
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
      <select id="inp-plan-preuve" class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400" onchange="majAffichagePrix()">
        <option value="">Chargement des plans...</option>
      </select>
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

// ─── Affichage prix du plan sélectionné ──────────────────────────────────────

function majAffichagePrix() {
  const sel = document.getElementById('inp-plan-preuve');
  const affEl = document.getElementById('affichage-prix-plan');
  if (!sel || !affEl) return;

  const planId = sel.value;
  const plan = _plansCache.find(p => p.id === planId);

  if (plan) {
    affEl.textContent = `Montant : ${Number(plan.prix_mensuel).toLocaleString('fr-FR')} FCFA/mois`;
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
}

async function chargerPlansSelect(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  try {
    const res = await fetch(PLANS_API, {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
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
      msg.textContent = data.message || `✓ Preuve soumise ! Notre équipe vérifiera sous ${SLA_ADMIN_H}h.`;
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

// ─── Modal changement de plan (upgrade/downgrade) ────────────────────

function ouvrirModalChangementPlan() {
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
        <p class="text-xs text-gray-400 mb-4">
          <i class="fa-solid fa-circle-info mr-1"></i>Périodicité : mensuel (uniquement)
        </p>
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

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

async function soumettreChangementPlan() {
  const planId = document.querySelector('input[name="plan-changement"]:checked')?.value;
  const msgEl = document.getElementById('msg-changement-plan');

  if (!planId) {
    if (msgEl) {
      msgEl.textContent = 'Veuillez sélectionner un plan.';
      msgEl.className = 'text-xs p-3 rounded-xl mb-3 bg-red-50 text-red-600';
      msgEl.classList.remove('hidden');
    }
    return;
  }

  document.getElementById('modal-changement-plan')?.remove();

  const blocSoumettre = document.getElementById('bloc-soumettre-preuve');
  if (blocSoumettre) {
    blocSoumettre.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const sel = document.getElementById('inp-plan-preuve');
    if (sel) {
      sel.value = planId;
      majAffichagePrix();
    }
  }
}

// ─── Historique des abonnements ───────────────────────────────────────────────

function construireHistorique(abonnements) {
  const statutLabels = {
    actif:                  '<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-semibold">Actif</span>',
    en_attente_confirmation:'<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-semibold">En attente</span>',
    expire:                 '<span class="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-xs font-semibold">Expiré</span>',
    annule:                 '<span class="bg-red-100 text-red-500 px-2 py-0.5 rounded-full text-xs font-semibold">Annulé</span>',
    rejete:                 '<span class="bg-red-100 text-red-500 px-2 py-0.5 rounded-full text-xs font-semibold">Rejeté</span>',
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

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch(PLANS_API, {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (res.ok) {
      const data = await res.json();
      _plansCache = data.plans ?? [];
    }
  } catch {}

  if (window.location.pathname === '/dashboard/abonnement') {
    await initSectionAbonnement();
  }
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
window.preselectPlan    = preselectPlan;
