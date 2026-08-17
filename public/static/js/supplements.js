// MonMenu — Dashboard Suppléments généraux (supplements.js)
// AJOUT — Page dédiée à la gestion des suppléments généraux par restaurant.
// Chargée après auth-fetch.js. Jamais fusionnée dans dashboard.js.
//
// Fonctionnalités :
//   - Liste des suppléments (nom, prix, photo, statut actif/inactif)
//   - Création d'un supplément (nom + prix requis, photo optionnelle)
//   - Édition inline (nom, prix, activation/désactivation)
//   - Upload/remplacement image avec preview
//   - Soft-delete avec confirmation
//   - Badge limite plan (si actif côté plan)
//
// Sécurité :
//   - dashFetch() — credentials: 'include' + X-CSRF-Token (pattern dashboard)
//   - escHtml() — tout texte affiché dynamiquement est échappé
//   - Aucun prix client — les prix sont saisie dashboard, recalculés serveur
//
// Compatibilité CSP :
//   - Aucun handler inline (onclick=, onsubmit=) : tout passe par
//     data-action= + le dispatcher global de dashboard.js ou le
//     dispatcher local ci-dessous.
'use strict';

// ── État local ────────────────────────────────────────────────────────────────
let _supplementsData = [];
let _supplementsLimite = null;
let _supplementsContainer = null;

// ── Dispatcher local CSP-safe ─────────────────────────────────────────────────
// Gère les actions propres à la page Suppléments.
// Monté UNE SEULE FOIS à l'init (évite les doublons si renavigation).
let _supplementsDispatcherAttache = false;
function _attacherDispatcherSupplements() {
  if (_supplementsDispatcherAttache) return;
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-sup-action]');
    if (!btn) return;
    const action = btn.dataset.supAction;
    const id = btn.dataset.supId;
    switch (action) {
      case 'toggleActif':     _toggleActifSupplement(id, btn.dataset.supActif === '1'); break;
      case 'supprimer':       _supprimerSupplement(id); break;
      case 'ouvrir-edit':     _ouvrirEditSupplement(id); break;
      case 'fermer-edit':     _fermerEditSupplement(id); break;
      case 'sauvegarder':     _sauvegarderSupplement(id); break;
      case 'choisir-image':   _choisirImageSupplement(id); break;
      case 'ajouter-form':    _toggleFormulaireAjout(); break;
      case 'annuler-ajout':   _fermerFormulaireAjout(); break;
      case 'soumettre-ajout': _soumettreNouveauSupplement(); break;
      case 'retirer-image':   _retirerImageSupplement(id); break;
    }
  });
  _supplementsDispatcherAttache = true;
}

// ── Point d'entrée public ─────────────────────────────────────────────────────
// Appelé par navigateTo('supplements') dans dashboard.js.
async function loadSupplements() {
  const content = document.getElementById('dashboard-content');
  if (!content) return;

  content.innerHTML = `
    <div id="supplements-page" class="max-w-2xl">
      <div class="flex items-center justify-between mb-5">
        <div>
          <h2 class="font-bold text-gray-900 text-lg">Suppléments</h2>
          <p class="text-xs text-gray-500 mt-0.5">Options proposées aux clients sur toute commande.</p>
        </div>
        <button data-sup-action="ajouter-form"
          class="flex items-center gap-2 bg-red-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-red-700 transition-colors">
          <i class="fa-solid fa-plus"></i> Ajouter
        </button>
      </div>

      <!-- Badge limite plan -->
      <div id="supplements-limite-badge" class="hidden mb-4"></div>

      <!-- Formulaire ajout (masqué par défaut) -->
      <div id="form-ajout-supplement" class="hidden bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-5">
        <h3 class="font-semibold text-gray-900 mb-4">Nouveau supplément</h3>
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Nom <span class="text-red-600">*</span></label>
            <input id="sup-nouveau-nom" type="text" maxlength="100" placeholder="ex: Sauce piment"
              class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300">
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Prix (FCFA) <span class="text-red-600">*</span></label>
            <input id="sup-nouveau-prix" type="number" min="0" max="999999" step="1" placeholder="ex: 200"
              class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300">
          </div>
        </div>
        <div class="mb-4">
          <label class="block text-xs font-medium text-gray-600 mb-1">Image (optionnel, JPEG/PNG/WebP/GIF, max 5 Mo)</label>
          <div class="flex items-center gap-3">
            <div id="sup-nouveau-preview" class="w-16 h-16 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
              <i class="fa-solid fa-image text-xl text-gray-300"></i>
            </div>
            <label class="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium px-3 py-2 rounded-xl transition-colors">
              Choisir une image
              <input id="sup-nouveau-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="sr-only">
            </label>
          </div>
        </div>
        <div id="sup-nouveau-erreur" class="hidden text-xs text-red-600 mb-3"></div>
        <div class="flex gap-3">
          <button data-sup-action="annuler-ajout"
            class="flex-1 border border-gray-200 text-gray-700 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button data-sup-action="soumettre-ajout"
            class="flex-1 bg-red-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-red-700 transition-colors">
            Créer
          </button>
        </div>
      </div>

      <!-- Liste suppléments -->
      <div id="supplements-list" class="space-y-3">
        <div class="text-center py-12 text-gray-400">
          <i class="fa-solid fa-circle-notch fa-spin text-2xl mb-3 block"></i>
          <p class="text-sm">Chargement...</p>
        </div>
      </div>
    </div>`;

  _supplementsContainer = document.getElementById('supplements-list');
  _attacherDispatcherSupplements();
  _attacherInputImageNouveauSupplement();

  // Charger données en parallèle
  await Promise.all([
    _chargerSupplements(),
    _chargerLimite()
  ]);
}

// ── Chargement liste ──────────────────────────────────────────────────────────
async function _chargerSupplements() {
  try {
    const res = await dashFetch('/api/v1/dashboard/supplements');
    if (res.status === 401) { if (typeof showAuthError === 'function') showAuthError(); return; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    _supplementsData = data.supplements || [];
    _renderListeSupplements();
  } catch (err) {
    if (_supplementsContainer) {
      _supplementsContainer.innerHTML = `
        <div class="bg-red-50 border border-red-100 rounded-xl p-4 text-center text-sm text-red-600">
          <i class="fa-solid fa-circle-exclamation mr-1"></i> Erreur de chargement.
          <button data-sup-action="recharger" class="underline ml-1" onclick="loadSupplements()">Réessayer</button>
        </div>`;
    }
  }
}

// ── Chargement limite plan ────────────────────────────────────────────────────
async function _chargerLimite() {
  try {
    const res = await dashFetch('/api/v1/dashboard/supplements/limite');
    if (!res.ok) return;
    _supplementsLimite = await res.json();
    _renderBadgeLimite();
  } catch { /* non bloquant */ }
}

// ── Rendu liste ───────────────────────────────────────────────────────────────
function _renderListeSupplements() {
  if (!_supplementsContainer) return;

  if (!_supplementsData.length) {
    _supplementsContainer.innerHTML = `
      <div class="text-center py-16 text-gray-400">
        <i class="fa-solid fa-pepper-hot text-4xl mb-3 block opacity-30"></i>
        <p class="text-sm font-medium text-gray-600 mb-1">Aucun supplément pour le moment.</p>
        <p class="text-xs">Cliquez sur « Ajouter » pour créer votre premier supplément.</p>
      </div>`;
    return;
  }

  _supplementsContainer.innerHTML = _supplementsData.map(s => _renderCarteSupplement(s)).join('');
}

function _renderBadgeLimite() {
  const badge = document.getElementById('supplements-limite-badge');
  if (!badge || !_supplementsLimite) return;

  const { actif, limite, utilises } = _supplementsLimite;
  if (!actif || limite === null) {
    badge.classList.add('hidden');
    return;
  }

  const depasse = utilises >= limite;
  badge.classList.remove('hidden');
  badge.innerHTML = `
    <div class="bg-${depasse ? 'red' : 'orange'}-50 border border-${depasse ? 'red' : 'orange'}-100 rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm">
      <i class="fa-solid fa-circle-info text-${depasse ? 'red' : 'orange'}-500"></i>
      <span class="text-${depasse ? 'red' : 'orange'}-700">
        ${utilises} / ${limite} supplément${limite > 1 ? 's' : ''} utilisé${utilises > 1 ? 's' : ''}
        ${depasse ? ' — limite atteinte' : ''}.
      </span>
    </div>`;
}

function _renderCarteSupplement(s) {
  const actif = s.actif;
  const photoHtml = s.photo_url
    ? `<img src="${escHtml(s.photo_url)}" alt="${escHtml(s.nom)}" class="w-12 h-12 rounded-lg object-cover">`
    : `<div class="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center"><i class="fa-solid fa-utensils text-gray-300"></i></div>`;

  return `
    <div id="sup-card-${escHtml(s.id)}" class="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
      <!-- Vue normale -->
      <div id="sup-view-${escHtml(s.id)}" class="p-4 flex items-center gap-4">
        ${photoHtml}
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-gray-900 text-sm truncate">${escHtml(s.nom)}</div>
          <div class="text-xs text-gray-500 mt-0.5">${(s.prix || 0).toLocaleString('fr-FR')} FCFA</div>
        </div>
        <div class="flex items-center gap-2">
          <!-- Toggle actif/inactif -->
          <button
            data-sup-action="toggleActif"
            data-sup-id="${escHtml(s.id)}"
            data-sup-actif="${actif ? '1' : '0'}"
            class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${actif ? 'bg-green-500' : 'bg-gray-300'}"
            aria-label="${actif ? 'Désactiver' : 'Activer'} ce supplément"
            title="${actif ? 'Actif — cliquez pour désactiver' : 'Inactif — cliquez pour activer'}">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${actif ? 'translate-x-6' : 'translate-x-1'}"></span>
          </button>
          <!-- Modifier -->
          <button
            data-sup-action="ouvrir-edit"
            data-sup-id="${escHtml(s.id)}"
            class="p-2 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
            aria-label="Modifier ce supplément">
            <i class="fa-solid fa-pen-to-square text-sm"></i>
          </button>
          <!-- Supprimer -->
          <button
            data-sup-action="supprimer"
            data-sup-id="${escHtml(s.id)}"
            class="p-2 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
            aria-label="Supprimer ce supplément">
            <i class="fa-solid fa-trash text-sm"></i>
          </button>
        </div>
      </div>

      <!-- Formulaire d'édition inline (masqué par défaut) -->
      <div id="sup-edit-${escHtml(s.id)}" class="hidden px-4 pb-4 border-t border-gray-100 pt-4">
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Nom</label>
            <input
              id="sup-edit-nom-${escHtml(s.id)}"
              type="text" maxlength="100"
              value="${escHtml(s.nom)}"
              class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300">
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Prix (FCFA)</label>
            <input
              id="sup-edit-prix-${escHtml(s.id)}"
              type="number" min="0" max="999999" step="1"
              value="${s.prix || 0}"
              class="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300">
          </div>
        </div>
        <!-- Image -->
        <div class="mb-3">
          <label class="block text-xs font-medium text-gray-600 mb-1">Image</label>
          <div class="flex items-center gap-3">
            <div id="sup-edit-preview-${escHtml(s.id)}" class="w-12 h-12 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
              ${s.photo_url
                ? `<img src="${escHtml(s.photo_url)}" alt="" class="w-full h-full object-cover">`
                : `<i class="fa-solid fa-image text-base text-gray-300"></i>`}
            </div>
            <label class="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-xl transition-colors">
              Changer
              <input
                id="sup-edit-file-${escHtml(s.id)}"
                type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                class="sr-only"
                data-sup-id="${escHtml(s.id)}">
            </label>
            ${s.photo_url ? `<button data-sup-action="retirer-image" data-sup-id="${escHtml(s.id)}" class="text-xs text-red-500 hover:text-red-700">Retirer</button>` : ''}
          </div>
        </div>
        <div id="sup-edit-erreur-${escHtml(s.id)}" class="hidden text-xs text-red-600 mb-2"></div>
        <div class="flex gap-2">
          <button
            data-sup-action="fermer-edit"
            data-sup-id="${escHtml(s.id)}"
            class="flex-1 border border-gray-200 text-gray-700 text-xs font-medium py-2 rounded-xl hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button
            data-sup-action="sauvegarder"
            data-sup-id="${escHtml(s.id)}"
            class="flex-1 bg-red-600 text-white text-xs font-semibold py-2 rounded-xl hover:bg-red-700 transition-colors">
            Sauvegarder
          </button>
        </div>
      </div>
    </div>`;
}

// ── Toggle actif/inactif ──────────────────────────────────────────────────────
async function _toggleActifSupplement(id, estActif) {
  try {
    const res = await dashFetch('/api/v1/dashboard/supplements/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ actif: !estActif })
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error || 'Erreur lors de la mise à jour.');
      return;
    }
    // Mettre à jour l'état local sans recharger toute la liste
    const sup = _supplementsData.find(s => s.id === id);
    if (sup) {
      sup.actif = !estActif;
      _renderListeSupplements();
      _renderBadgeLimite();
    }
  } catch {
    alert('Erreur réseau. Réessayez.');
  }
}

// ── Ouvrir / fermer formulaire édition ───────────────────────────────────────
function _ouvrirEditSupplement(id) {
  const editEl = document.getElementById('sup-edit-' + id);
  const viewEl = document.getElementById('sup-view-' + id);
  if (editEl) editEl.classList.remove('hidden');
  if (viewEl) viewEl.classList.add('hidden');
  // Attacher event input sur le fichier image d'édition
  const fileInput = document.getElementById('sup-edit-file-' + id);
  if (fileInput && !fileInput.dataset.listenerAttache) {
    fileInput.dataset.listenerAttache = '1';
    fileInput.addEventListener('change', function() {
      _previewImageEdit(id, this.files[0]);
    });
  }
}

function _fermerEditSupplement(id) {
  const editEl = document.getElementById('sup-edit-' + id);
  const viewEl = document.getElementById('sup-view-' + id);
  if (editEl) editEl.classList.add('hidden');
  if (viewEl) viewEl.classList.remove('hidden');
  const errEl = document.getElementById('sup-edit-erreur-' + id);
  if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
}

// ── Preview image (édition) ───────────────────────────────────────────────────
function _previewImageEdit(id, file) {
  if (!file) return;
  const previewEl = document.getElementById('sup-edit-preview-' + id);
  if (!previewEl) return;
  try {
    const reader = new FileReader();
    reader.onload = function(e) {
      previewEl.innerHTML = `<img src="${e.target.result}" alt="" class="w-full h-full object-cover">`;
    };
    reader.readAsDataURL(file);
  } catch { /* non bloquant */ }
}

// ── Sauvegarder supplément (PATCH) ────────────────────────────────────────────
async function _sauvegarderSupplement(id) {
  const nomEl = document.getElementById('sup-edit-nom-' + id);
  const prixEl = document.getElementById('sup-edit-prix-' + id);
  const fileEl = document.getElementById('sup-edit-file-' + id);
  const errEl  = document.getElementById('sup-edit-erreur-' + id);

  if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }

  const nom = nomEl ? nomEl.value.trim() : '';
  const prixRaw = prixEl ? parseFloat(prixEl.value) : NaN;

  if (!nom || nom.length > 100) {
    if (errEl) { errEl.textContent = 'Nom invalide (1 à 100 caractères).'; errEl.classList.remove('hidden'); }
    return;
  }
  if (isNaN(prixRaw) || prixRaw < 0 || prixRaw > 999999) {
    if (errEl) { errEl.textContent = 'Prix invalide (0 à 999 999 FCFA).'; errEl.classList.remove('hidden'); }
    return;
  }

  try {
    // 1) Mettre à jour nom + prix
    const resPatch = await dashFetch('/api/v1/dashboard/supplements/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ nom, prix: prixRaw })
    });
    if (!resPatch.ok) {
      const d = await resPatch.json().catch(() => ({}));
      if (errEl) { errEl.textContent = d.error || 'Erreur mise à jour.'; errEl.classList.remove('hidden'); }
      return;
    }

    // 2) Uploader l'image si un fichier a été sélectionné
    const file = fileEl ? fileEl.files[0] : null;
    if (file) {
      const uploadOk = await _uploadImageSupplement(id, file, errEl);
      if (!uploadOk) return; // erreur affichée par _uploadImageSupplement
    }

    // Recharger la liste complète
    await _chargerSupplements();
    await _chargerLimite();
  } catch {
    if (errEl) { errEl.textContent = 'Erreur réseau. Réessayez.'; errEl.classList.remove('hidden'); }
  }
}

// ── Upload image supplément ───────────────────────────────────────────────────
async function _uploadImageSupplement(supId, file, errEl) {
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await dashFetch('/api/v1/dashboard/supplements/' + supId + '/image', {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      body: formData
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      if (errEl) { errEl.textContent = d.error || 'Erreur upload image.'; errEl.classList.remove('hidden'); }
      return false;
    }
    return true;
  } catch {
    if (errEl) { errEl.textContent = 'Erreur réseau (upload image).'; errEl.classList.remove('hidden'); }
    return false;
  }
}

// ── Action "Choisir image" depuis la carte (version déclenchée par data-action) ──
function _choisirImageSupplement(id) {
  const fileEl = document.getElementById('sup-edit-file-' + id);
  if (fileEl) fileEl.click();
}

// ── Retirer image d'un supplément ────────────────────────────────────────────
async function _retirerImageSupplement(id) {
  if (!confirm('Retirer l\'image de ce supplément ?')) return;
  try {
    const res = await dashFetch('/api/v1/dashboard/supplements/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ photo_url: null, photo_r2_key: null })
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error || 'Erreur lors de la suppression de l\'image.');
      return;
    }
    await _chargerSupplements();
  } catch {
    alert('Erreur réseau. Réessayez.');
  }
}

// ── Supprimer supplément (soft-delete) ────────────────────────────────────────
async function _supprimerSupplement(id) {
  const sup = _supplementsData.find(s => s.id === id);
  const nom = sup ? sup.nom : 'ce supplément';
  if (!confirm(`Supprimer « ${nom} » ? Cette action est irréversible (le supplément sera masqué de la boutique).`)) return;
  try {
    const res = await dashFetch('/api/v1/dashboard/supplements/' + id, {
      method: 'DELETE',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error || 'Erreur lors de la suppression.');
      return;
    }
    // Retirer de l'état local et re-rendre sans rechargement complet
    _supplementsData = _supplementsData.filter(s => s.id !== id);
    _renderListeSupplements();
    await _chargerLimite();
  } catch {
    alert('Erreur réseau. Réessayez.');
  }
}

// ── Formulaire ajout : toggle / fermeture ─────────────────────────────────────
function _toggleFormulaireAjout() {
  const form = document.getElementById('form-ajout-supplement');
  if (!form) return;
  if (form.classList.contains('hidden')) {
    form.classList.remove('hidden');
    const nomEl = document.getElementById('sup-nouveau-nom');
    if (nomEl) nomEl.focus();
  } else {
    _fermerFormulaireAjout();
  }
}

function _fermerFormulaireAjout() {
  const form = document.getElementById('form-ajout-supplement');
  if (form) form.classList.add('hidden');
  const errEl = document.getElementById('sup-nouveau-erreur');
  if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
  const nomEl = document.getElementById('sup-nouveau-nom');
  if (nomEl) nomEl.value = '';
  const prixEl = document.getElementById('sup-nouveau-prix');
  if (prixEl) prixEl.value = '';
  const fileEl = document.getElementById('sup-nouveau-file');
  if (fileEl) fileEl.value = '';
  const preview = document.getElementById('sup-nouveau-preview');
  if (preview) preview.innerHTML = `<i class="fa-solid fa-image text-xl text-gray-300"></i>`;
}

// ── Preview image (formulaire ajout) ─────────────────────────────────────────
function _attacherInputImageNouveauSupplement() {
  const fileEl = document.getElementById('sup-nouveau-file');
  if (!fileEl) return;
  fileEl.addEventListener('change', function() {
    const file = this.files[0];
    if (!file) return;
    const preview = document.getElementById('sup-nouveau-preview');
    if (!preview) return;
    try {
      const reader = new FileReader();
      reader.onload = function(e) {
        preview.innerHTML = `<img src="${e.target.result}" alt="" class="w-full h-full object-cover">`;
      };
      reader.readAsDataURL(file);
    } catch { /* non bloquant */ }
  });
}

// ── Soumettre nouveau supplément ──────────────────────────────────────────────
async function _soumettreNouveauSupplement() {
  const nomEl  = document.getElementById('sup-nouveau-nom');
  const prixEl = document.getElementById('sup-nouveau-prix');
  const fileEl = document.getElementById('sup-nouveau-file');
  const errEl  = document.getElementById('sup-nouveau-erreur');

  if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }

  const nom = nomEl ? nomEl.value.trim() : '';
  const prixRaw = prixEl ? parseFloat(prixEl.value) : NaN;

  if (!nom || nom.length > 100) {
    if (errEl) { errEl.textContent = 'Nom invalide (1 à 100 caractères).'; errEl.classList.remove('hidden'); }
    return;
  }
  if (isNaN(prixRaw) || prixRaw < 0 || prixRaw > 999999) {
    if (errEl) { errEl.textContent = 'Prix invalide (0 à 999 999 FCFA).'; errEl.classList.remove('hidden'); }
    return;
  }

  try {
    // 1) Créer le supplément
    const resCreate = await dashFetch('/api/v1/dashboard/supplements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ nom, prix: prixRaw })
    });

    if (!resCreate.ok) {
      const d = await resCreate.json().catch(() => ({}));
      if (errEl) { errEl.textContent = d.error || 'Erreur lors de la création.'; errEl.classList.remove('hidden'); }
      return;
    }

    const created = await resCreate.json();

    // 2) Uploader l'image si fournie
    const file = fileEl ? fileEl.files[0] : null;
    if (file && created.id) {
      await _uploadImageSupplement(created.id, file, errEl);
    }

    // Fermer le formulaire et recharger
    _fermerFormulaireAjout();
    await _chargerSupplements();
    await _chargerLimite();
  } catch {
    if (errEl) { errEl.textContent = 'Erreur réseau. Réessayez.'; errEl.classList.remove('hidden'); }
  }
}

// ── Exposition globale (appelé par navigateTo dans dashboard.js) ───────────────
window.loadSupplements = loadSupplements;
