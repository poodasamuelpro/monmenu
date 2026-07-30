// src/pages/suivi.ts — FR uniquement, sans dark mode
import { renderHead } from '../components/head'

export function renderSuiviPage(token: string, nomProjet: string, tenantSlug?: string): string {

  return `${renderHead(
    `Suivi de commande — ${nomProjet}`,
    `Suivi de commande ${nomProjet}.`,
    nomProjet
  )}
<body class="font-sans bg-gray-50 min-h-screen">
  <header class="bg-white border-b border-gray-100 px-4 py-4">
    <div class="max-w-lg mx-auto flex items-center justify-between">
      <a href="/" class="flex items-center gap-2 text-red-600 font-bold text-lg hover:text-red-700 transition-colors">
        <i class="fa-solid fa-utensils"></i>
        <span>${nomProjet}</span>
      </a>
      <span class="text-xs text-gray-400 font-mono">Suivi commande</span>
    </div>
  </header>

  <main class="max-w-lg mx-auto px-4 py-8">
    <!-- Bouton retour boutique -->
    <a id="retour-boutique-btn"
       href="${tenantSlug ? '/' + tenantSlug : '/'}"
       class="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-red-600 transition-colors mb-4">
      <i class="fa-solid fa-arrow-left"></i>
      <span>Retour à la boutique</span>
    </a>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
      <div class="flex items-center gap-3 mb-2">
        <div class="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
          <i class="fa-solid fa-magnifying-glass text-red-600"></i>
        </div>
        <div>
          <h1 class="text-xl font-bold text-gray-900">Suivi de commande</h1>
          <p class="text-xs text-gray-400 font-mono">Token : ${token}</p>
        </div>
      </div>
    </div>

    <!-- Contenu dynamique -->
    <div id="suivi-content">
      <div class="animate-pulse space-y-3">
        <div class="h-16 bg-gray-200 rounded-2xl"></div>
        <div class="h-32 bg-gray-200 rounded-2xl"></div>
        <div class="h-24 bg-gray-200 rounded-2xl"></div>
      </div>
    </div>

    <!-- Aide -->
    <div class="mt-6 bg-white border border-gray-100 rounded-2xl p-4 text-center">
      <p class="text-xs text-gray-500">
        Un problème avec votre commande ?
        <a href="/contact" class="text-red-600 hover:underline font-medium">Contactez-nous</a>
      </p>
    </div>
  </main>

  <script>
    const TRACKING_TOKEN = '${token}';
    const TENANT_SLUG_INITIAL = ${tenantSlug ? `'${tenantSlug}'` : 'null'};
    const STATUTS = {
      'en_attente':     { label: 'Commande reçue',   icon: 'fa-clock',          color: 'text-yellow-600', bg: 'bg-yellow-50' },
      'confirmee':      { label: 'Confirmée',         icon: 'fa-circle-check',   color: 'text-blue-600',   bg: 'bg-blue-50' },
      'en_preparation': { label: 'En préparation',    icon: 'fa-fire-burner',    color: 'text-orange-600', bg: 'bg-orange-50' },
      'en_livraison':   { label: 'En livraison',      icon: 'fa-motorcycle',     color: 'text-purple-600', bg: 'bg-purple-50' },
      'livree':         { label: 'Livrée ✓',          icon: 'fa-check-double',   color: 'text-green-600',  bg: 'bg-green-50' },
      'annulee':        { label: 'Annulée',            icon: 'fa-xmark',          color: 'text-red-600',    bg: 'bg-red-50' }
    };

    async function chargerSuivi() {
      try {
        const res = await fetch('/api/v1/commandes/suivi/' + TRACKING_TOKEN);
        if (!res.ok) {
          document.getElementById('suivi-content').innerHTML = \`
            <div class="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
              <i class="fa-solid fa-circle-exclamation text-red-500 text-2xl mb-2 block"></i>
              <p class="text-gray-700 font-semibold">Commande introuvable</p>
              <p class="text-sm text-gray-500 mt-1">Vérifiez le lien reçu par WhatsApp.</p>
            </div>
          \`;
          return;
        }
        const data = await res.json();
        const c = data.commande;
        const statut = STATUTS[c.statut] || { label: c.statut, icon: 'fa-circle', color: 'text-gray-600', bg: 'bg-gray-50' };

        if (!TENANT_SLUG_INITIAL) {
          const slugTrouve = c.restaurant_slug || null;
          if (slugTrouve) {
            const btnRetour = document.getElementById('retour-boutique-btn');
            if (btnRetour) btnRetour.setAttribute('href', '/' + slugTrouve);
          }
        }

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
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
            <div class="flex items-center justify-between mb-6">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl \${statut.bg} flex items-center justify-center">
                  <i class="fa-solid \${statut.icon} \${statut.color}"></i>
                </div>
                <div>
                  <div class="font-bold text-gray-900">\${statut.label}</div>
                  <div class="text-xs text-gray-500">
                    Commande du \${new Date(c.created_at).toLocaleDateString('fr-FR', {day:'numeric', month:'long', hour:'2-digit', minute:'2-digit'})}
                  </div>
                </div>
              </div>
            </div>
            <div class="flex items-center justify-between mb-6">\${etapesHtml}</div>

            <div class="text-sm font-bold text-gray-900 mb-3">Détail de la commande</div>
        \`;

        const items = typeof c.items_json === 'string' ? JSON.parse(c.items_json) : (c.items_json || []);
        html += '<div class="space-y-2 mb-4">';
        html += items.map(i => \`
          <div class="flex justify-between text-sm">
            <span class="text-gray-700">\${i.nom} × \${i.quantite}</span>
            <span class="font-semibold">\${(i.sous_total || 0).toLocaleString('fr-FR')} FCFA</span>
          </div>
        \`).join('');
        html += '</div>';
        html += \`
          <div class="border-t border-gray-100 pt-3 flex justify-between font-bold">
            <span>Total</span>
            <span class="text-red-600">\${(c.montant_total || 0).toLocaleString('fr-FR')} FCFA</span>
          </div>
        </div>\`;

        if (data.historique && data.historique.length) {
          html += \`
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div class="font-bold text-gray-900 mb-4">Historique</div>
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
                  <div class="text-sm font-semibold text-gray-900">\${s.label}</div>
                  <div class="text-xs text-gray-500">\${new Date(h.timestamp).toLocaleString('fr-FR')}</div>
                  \${h.note ? \`<div class="text-xs text-gray-600 mt-0.5">\${h.note}</div>\` : ''}
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
          <div class="bg-yellow-50 border border-yellow-100 rounded-2xl p-6 text-center">
            <i class="fa-solid fa-triangle-exclamation text-yellow-500 text-2xl mb-2 block"></i>
            <p class="text-gray-700 font-semibold">Erreur de chargement</p>
            <p class="text-sm text-gray-500 mt-1">Réessayez dans quelques instants.</p>
            <button onclick="chargerSuivi()" class="mt-3 text-xs font-semibold text-red-600 hover:underline">Réessayer</button>
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
