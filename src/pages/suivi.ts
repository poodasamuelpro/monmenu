// src/pages/suivi.ts
import { renderHead } from '../components/head'
import { getTranslations } from '../i18n'

export function renderSuiviPage(token: string, nomProjet: string, locale: string = 'fr'): string {
  const t = getTranslations(locale)

  return `${renderHead(
    `${t.suivi.title} — ${nomProjet}`,
    `${t.suivi.title} ${nomProjet}.`,
    nomProjet
  )}
<body class="font-sans bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors">
  <header class="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-4 py-4">
    <div class="max-w-lg mx-auto flex items-center justify-between">
      <a href="/" class="flex items-center gap-2 text-red-600 font-bold text-lg hover:text-red-700 transition-colors">
        <i class="fa-solid fa-utensils"></i>
        <span>${nomProjet}</span>
      </a>
      <span class="text-xs text-gray-400 dark:text-gray-500 font-mono">${t.suivi.header_label}</span>
    </div>
  </header>

  <main class="max-w-lg mx-auto px-4 py-8">
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 mb-4">
      <div class="flex items-center gap-3 mb-2">
        <div class="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
          <i class="fa-solid fa-magnifying-glass text-red-600"></i>
        </div>
        <div>
          <h1 class="text-xl font-bold text-gray-900 dark:text-white">${t.suivi.title}</h1>
          <p class="text-xs text-gray-400 font-mono">${t.suivi.token_label} ${token}</p>
        </div>
      </div>
    </div>

    <!-- Contenu dynamique -->
    <div id="suivi-content">
      <div class="animate-pulse space-y-3">
        <div class="h-16 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
        <div class="h-32 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
        <div class="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
      </div>
    </div>

    <!-- Aide -->
    <div class="mt-6 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-4 text-center">
      <p class="text-xs text-gray-500 dark:text-gray-400">
        ${t.suivi.problem}
        <a href="/contact" class="text-red-600 hover:underline font-medium">${t.suivi.contact_us}</a>
      </p>
    </div>
  </main>

  <script>
    const TRACKING_TOKEN = '${token}';
    const STATUTS = {
      'en_attente':     { label: '${t.suivi.status_en_attente}',     icon: 'fa-clock',          color: 'text-yellow-600', bg: 'bg-yellow-50' },
      'confirmee':      { label: '${t.suivi.status_confirmee}',      icon: 'fa-circle-check',   color: 'text-blue-600',   bg: 'bg-blue-50' },
      'en_preparation': { label: '${t.suivi.status_en_preparation}', icon: 'fa-fire-burner',    color: 'text-orange-600', bg: 'bg-orange-50' },
      'en_livraison':   { label: '${t.suivi.status_en_livraison}',   icon: 'fa-motorcycle',     color: 'text-purple-600', bg: 'bg-purple-50' },
      'livree':         { label: '${t.suivi.status_livree}',         icon: 'fa-check-double',   color: 'text-green-600',  bg: 'bg-green-50' },
      'annulee':        { label: '${t.suivi.status_annulee}',        icon: 'fa-xmark',          color: 'text-red-600',    bg: 'bg-red-50' }
    };

    async function chargerSuivi() {
      try {
        const res = await fetch('/api/v1/commandes/suivi/' + TRACKING_TOKEN);
        if (!res.ok) {
          document.getElementById('suivi-content').innerHTML = \`
            <div class="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl p-6 text-center">
              <i class="fa-solid fa-circle-exclamation text-red-500 text-2xl mb-2 block"></i>
              <p class="text-gray-700 dark:text-gray-200 font-semibold">${t.suivi.not_found}</p>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">${t.suivi.not_found_hint}</p>
            </div>
          \`;
          return;
        }
        const data = await res.json();
        const c = data.commande;
        const statut = STATUTS[c.statut] || { label: c.statut, icon: 'fa-circle', color: 'text-gray-600', bg: 'bg-gray-50' };

        // Étapes de progression
        const etapes = ['en_attente', 'confirmee', 'en_preparation', 'en_livraison', 'livree'];
        const etapeIdx = etapes.indexOf(c.statut);
        const etapesHtml = etapes.map((e, i) => {
          const s = STATUTS[e];
          const actif = i <= etapeIdx;
          return \`<div class="flex flex-col items-center gap-1">
            <div class="w-8 h-8 rounded-full flex items-center justify-center \${actif ? s.bg : 'bg-gray-100'}">
              <i class="fa-solid \${s.icon} text-xs \${actif ? s.color : 'text-gray-400'}"></i>
            </div>
            <span class="text-xs \${actif ? 'text-gray-700 font-semibold' : 'text-gray-400'} text-center leading-tight" style="max-width:56px">\${s.label}</span>
          </div>\`;
        }).join('<div class="flex-1 h-px bg-gray-200 mt-4"></div>');

        let html = \`
          <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 mb-4">
            <div class="flex items-center justify-between mb-6">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl \${statut.bg} flex items-center justify-center">
                  <i class="fa-solid \${statut.icon} \${statut.color}"></i>
                </div>
                <div>
                  <div class="font-bold text-gray-900 dark:text-white">\${statut.label}</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">
                    ${t.suivi.order_date} \${new Date(c.created_at).toLocaleDateString('${locale === 'en' ? 'en-US' : 'fr-FR'}', {day:'numeric', month:'long', hour:'2-digit', minute:'2-digit'})}
                  </div>
                </div>
              </div>
            </div>
            <!-- Barre de progression -->
            <div class="flex items-center justify-between mb-6">\${etapesHtml}</div>

            <div class="text-sm font-bold text-gray-900 dark:text-white mb-3">${t.suivi.order_detail}</div>
        \`;

        const items = typeof c.items_json === 'string' ? JSON.parse(c.items_json) : (c.items_json || []);
        html += '<div class="space-y-2 mb-4">';
        html += items.map(i => \`
          <div class="flex justify-between text-sm">
            <span class="text-gray-700 dark:text-gray-300">\${i.nom} × \${i.quantite}</span>
            <span class="font-semibold dark:text-white">\${(i.sous_total || 0).toLocaleString('fr-FR')} FCFA</span>
          </div>
        \`).join('');
        html += '</div>';
        html += \`
          <div class="border-t border-gray-100 dark:border-gray-700 pt-3 flex justify-between font-bold">
            <span class="dark:text-white">${t.suivi.total}</span>
            <span class="text-red-600">\${(c.montant_total || 0).toLocaleString('fr-FR')} FCFA</span>
          </div>
        </div>\`;

        if (data.historique && data.historique.length) {
          html += \`
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
              <div class="font-bold text-gray-900 dark:text-white mb-4">${t.suivi.history}</div>
              <div class="space-y-3">
          \`;
          html += data.historique.map(h => {
            const s = STATUTS[h.nouveau_statut] || { label: h.nouveau_statut, color: 'text-gray-600', bg: 'bg-gray-100', icon: 'fa-circle' };
            return \`
              <div class="flex items-start gap-3">
                <div class="w-7 h-7 rounded-full \${s.bg} flex items-center justify-center flex-shrink-0 mt-0.5">
                  <i class="fa-solid \${s.icon} text-xs \${s.color}"></i>
                </div>
                <div>
                  <div class="text-sm font-semibold text-gray-900 dark:text-white">\${s.label}</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">\${new Date(h.timestamp).toLocaleString('${locale === 'en' ? 'en-US' : 'fr-FR'}')}</div>
                  \${h.commentaire ? \`<div class="text-xs text-gray-600 dark:text-gray-300 mt-0.5">\${h.commentaire}</div>\` : ''}
                </div>
              </div>
            \`;
          }).join('');
          html += '</div></div>';
        }

        document.getElementById('suivi-content').innerHTML = html;
      } catch(e) {
        console.error(e);
        document.getElementById('suivi-content').innerHTML = \`
          <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-800 rounded-xl p-6 text-center">
            <i class="fa-solid fa-triangle-exclamation text-yellow-500 text-2xl mb-2 block"></i>
            <p class="text-gray-700 dark:text-gray-200 font-semibold">${t.suivi.load_error}</p>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">${t.suivi.load_error_hint}</p>
            <button onclick="chargerSuivi()" class="mt-3 text-xs font-semibold text-red-600 hover:underline">${t.suivi.retry}</button>
          </div>
        \`;
      }
    }

    chargerSuivi();
    setInterval(chargerSuivi, 30000);
  </script>
</body>
</html>`
}
