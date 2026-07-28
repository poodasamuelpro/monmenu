// =============================================================
// PAGE TARIFS — avec données dynamiques depuis D1
// =============================================================
import { renderHead } from '../components/head'
import { renderNav } from '../components/nav'
import { renderFooter } from '../components/footer'
import { getTranslations } from '../i18n'

export function renderTarifsPage(nomProjet: string, locale: string = 'fr'): string {
  const t = getTranslations(locale)
  return `${renderHead(
    `${t.tarifs.meta_title} — ${nomProjet}`,
    t.tarifs.meta_desc,
    nomProjet
  )}
<body class="font-sans bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors">
  ${renderNav(nomProjet, 'tarifs', locale)}

  <!-- Hero tarifs -->
  <section class="py-16 bg-gradient-to-b from-gray-50 to-white" aria-labelledby="pricing-hero-heading">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 text-center">
      <h1 id="pricing-hero-heading" class="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-4">
        Tarifs simples et transparents
      </h1>
      <p class="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
        <strong>Aucune commission sur vos ventes.</strong> Forfait fixe mensuel ou annuel (2 mois offerts).
      </p>

      <!-- Sélecteur devise + période -->
      <div class="flex flex-col sm:flex-row gap-4 justify-center items-center mb-4">
        <div class="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-1 shadow-sm">
          <button onclick="changerDevise('FCFA')" id="btn-fcfa"
            class="devise-btn active px-4 py-2 rounded-lg text-sm font-semibold bg-white shadow-sm text-gray-900 transition-all">FCFA</button>
          <button onclick="changerDevise('EUR')" id="btn-eur"
            class="devise-btn px-4 py-2 rounded-lg text-sm font-semibold text-gray-500 hover:text-gray-900 transition-all">EUR</button>
          <button onclick="changerDevise('USD')" id="btn-usd"
            class="devise-btn px-4 py-2 rounded-lg text-sm font-semibold text-gray-500 hover:text-gray-900 transition-all">USD</button>
        </div>

        <div class="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-1 shadow-sm">
          <button onclick="changerPeriode('mensuel')" id="btn-mensuel"
            class="periode-btn active px-4 py-2 rounded-lg text-sm font-semibold bg-white shadow-sm text-gray-900 transition-all">Mensuel</button>
          <button onclick="changerPeriode('annuel')" id="btn-annuel"
            class="periode-btn px-4 py-2 rounded-lg text-sm font-semibold text-gray-500 hover:text-gray-900 transition-all flex items-center gap-1.5">
            Annuel
            <span class="bg-green-100 text-green-700 text-xs font-bold px-1.5 py-0.5 rounded-full">-17%</span>
          </button>
        </div>
      </div>
      <p class="text-sm text-gray-400">Premier mois offert · Aucune carte bancaire requise pour démarrer</p>
    </div>
  </section>

  <!-- Grille des plans -->
  <section class="pb-20 px-4" aria-labelledby="plans-heading">
    <div class="max-w-5xl mx-auto">
      <div class="sr-only" id="plans-heading">Plans tarifaires</div>
      <div id="plans-grid" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- Chargé dynamiquement depuis /api/v1/plans -->
        ${[1,2,3].map(() => '<div class="animate-pulse bg-gray-100 rounded-xl h-80"></div>').join('')}
      </div>

      <!-- Plan Enterprise -->
      <div class="mt-8 bg-gray-900 text-white rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Pour les grandes enseignes</div>
          <h3 class="text-2xl font-bold mb-2">Enterprise</h3>
          <p class="text-gray-400 max-w-lg">Volume illimité, SLA garanti, onboarding dédié, support prioritaire, formation équipe, API complète et intégrations sur mesure.</p>
        </div>
        <div class="flex-shrink-0">
          <a href="/contact?sujet=enterprise"
            class="inline-flex items-center gap-2 bg-white text-gray-900 font-bold px-6 py-3 rounded-xl hover:bg-gray-100 transition-colors whitespace-nowrap">
            <i class="fa-solid fa-phone" aria-hidden="true"></i>
            Nous contacter
          </a>
        </div>
      </div>
    </div>
  </section>

  <!-- Tableau comparatif complet -->
  <section class="py-16 bg-gray-50" aria-labelledby="comparison-heading">
    <div class="max-w-5xl mx-auto px-4 sm:px-6">
      <div class="text-center mb-10">
        <h2 id="comparison-heading" class="text-2xl font-extrabold text-gray-900 mb-2">
          Comparaison détaillée des fonctionnalités
        </h2>
        <p class="text-gray-600">Tout est inclus dans chaque plan. Voici les différences.</p>
      </div>

      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full" role="table" aria-label="Tableau comparatif des fonctionnalités">
            <thead>
              <tr class="border-b border-gray-100">
                <th class="text-left px-6 py-5 text-sm font-semibold text-gray-500" scope="col">Fonctionnalité</th>
                <th class="text-center px-5 py-5 text-sm font-bold text-gray-900" scope="col">
                  <div>Gratuit</div>
                  <div class="text-green-600 font-bold text-lg">0 FCFA</div>
                </th>
                <th class="text-center px-5 py-5 text-sm font-bold text-gray-900 bg-red-50" scope="col">
                  <div>Starter</div>
                  <div class="text-gray-900 font-bold text-lg">5 000 <span class="text-xs font-normal text-gray-500">FCFA/mois</span></div>
                </th>
                <th class="text-center px-5 py-5 text-sm font-bold text-red-600" scope="col">
                  <div>Pro</div>
                  <div class="text-gray-900 font-bold text-lg">15 000 <span class="text-xs font-normal text-gray-500">FCFA/mois</span></div>
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50 text-sm">
              ${[
                { cat: 'Commandes', rows: [
                  ['Commandes incluses/mois', '50', '200', '1 000'],
                  ['Commandes au-delà du quota', 'Non disponible', 'Tarif à l\'unité', 'Tarif à l\'unité'],
                ]},
                { cat: 'Boutique', rows: [
                  ['Boutique en ligne', '✅', '✅', '✅'],
                  ['Produits au menu', '20 max', '100 max', 'Illimités'],
                  ['Catégories de menu', '5 max', '20 max', 'Illimitées'],
                  ['Photos des plats', '✅', '✅', '✅'],
                  ['Personnalisation logo/couleurs', '✅', '✅', '✅'],
                  ['Domaine personnalisé', '—', '—', '✅'],
                ]},
                { cat: 'Commandes & livraison', rows: [
                  ['Géolocalisation livraison', '✅', '✅', '✅'],
                  ['QR Code téléchargeable', '✅', '✅', '✅'],
                  ['Codes promotionnels', '—', '✅', '✅'],
                  ['Livreurs gérés', '1', '3', 'Illimités'],
                ]},
                { cat: 'Analytics & Export', rows: [
                  ['Statistiques de base', '✅', '✅', '✅'],
                  ['Statistiques avancées', '—', '✅', '✅'],
                  ['Export CSV', '—', '—', '✅'],
                  ['Accès API REST', '—', '—', '✅'],
                ]},
                { cat: 'Support', rows: [
                  ['Documentation en ligne', '✅', '✅', '✅'],
                  ['Support par email', '—', '✅', '✅'],
                  ['Support WhatsApp prioritaire', '—', '—', '✅'],
                  ['Onboarding dédié', '—', '—', 'Enterprise'],
                ]},
              ].map(section => [
                `<tr class="bg-gray-50">
                  <td colspan="4" class="px-6 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide">${section.cat}</td>
                </tr>`,
                ...section.rows.map(row => `
                  <tr class="hover:bg-gray-50 transition-colors">
                    <td class="px-6 py-3 text-gray-700">${row[0]}</td>
                    <td class="text-center px-5 py-3 text-gray-600">${row[1]}</td>
                    <td class="text-center px-5 py-3 text-gray-600 bg-red-50/50">${row[2]}</td>
                    <td class="text-center px-5 py-3 text-gray-600">${row[3]}</td>
                  </tr>
                `)
              ].flat()).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>

  <!-- FAQ Tarifs -->
  <section class="py-16 bg-white" aria-labelledby="faq-tarifs-heading">
    <div class="max-w-3xl mx-auto px-4 sm:px-6">
      <div class="text-center mb-10">
        <h2 id="faq-tarifs-heading" class="text-2xl font-extrabold text-gray-900 mb-2">Questions sur les tarifs</h2>
      </div>
      <div class="space-y-3">
        ${[
          {
            q: 'Puis-je changer de plan à tout moment ?',
            a: 'Oui, l\'upgrade est immédiat. Le downgrade prend effet au prochain cycle de facturation. Tout se gère depuis votre tableau de bord sans contact avec le support.'
          },
          {
            q: 'Que se passe-t-il si je dépasse mon quota de commandes ?',
            a: 'Votre boutique reste active et continue de recevoir des commandes. Les commandes supplémentaires sont facturées à un tarif unitaire fixe, affiché dans votre tableau de bord. Vous pouvez aussi upgrader votre plan pour un meilleur tarif.'
          },
          {
            q: 'Le plan gratuit est-il vraiment gratuit pour toujours ?',
            a: 'Oui, le plan Gratuit reste gratuit sans limite de temps, tant que vous restez dans les 50 commandes mensuelles incluses. Aucune carte bancaire n\'est requise pour démarrer.'
          },
          {
            q: 'Comment fonctionne la facturation annuelle ?',
            a: 'Vous payez 10 mois au lieu de 12, soit une économie de 2 mois (environ 17%). Le paiement est prélevé en une fois pour l\'année. Vous pouvez revenir en mensuel à l\'échéance.'
          },
          {
            q: 'Quels moyens de paiement acceptez-vous ?',
            a: 'Mobile Money (Orange Money, Wave, Airtel Money), virement bancaire. Carte bancaire disponible prochainement. Contactez-nous pour d\'autres arrangements (paiement en espèces via agent disponible au Burkina Faso).'
          },
        ].map((faq, i) => `
          <div class="border border-gray-100 rounded-xl overflow-hidden">
            <button onclick="toggleTariffsFaq(${i})"
              class="w-full text-left px-5 py-4 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
              aria-expanded="false" aria-controls="tariffs-faq-${i}">
              <span class="font-semibold text-gray-900 text-sm">${faq.q}</span>
              <i id="tariffs-faq-icon-${i}" class="fa-solid fa-chevron-down text-gray-400 text-xs flex-shrink-0 transition-transform" aria-hidden="true"></i>
            </button>
            <div id="tariffs-faq-${i}" class="hidden px-5 pb-4" role="region">
              <p class="text-sm text-gray-600 leading-relaxed">${faq.a}</p>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="bg-red-600 py-14">
    <div class="max-w-3xl mx-auto px-4 text-center">
      <h2 class="text-2xl sm:text-3xl font-extrabold text-white mb-4">Commencez gratuitement</h2>
      <p class="text-red-100 mb-8">Plan Gratuit disponible immédiatement. Pas de carte bancaire requise.</p>
      <div class="flex flex-col sm:flex-row gap-3 justify-center">
        <a href="/inscription"
          class="inline-flex items-center justify-center gap-2 bg-white text-red-600 font-bold px-8 py-3.5 rounded-xl hover:bg-red-50 transition-colors shadow-lg">
          <i class="fa-solid fa-store" aria-hidden="true"></i>
          Créer ma boutique gratuitement
        </a>
        <a href="/contact"
          class="inline-flex items-center justify-center gap-2 border border-red-400 text-white font-semibold px-8 py-3.5 rounded-xl hover:bg-red-700 transition-colors">
          <i class="fa-solid fa-envelope" aria-hidden="true"></i>
          Une question ? Contactez-nous
        </a>
      </div>
    </div>
  </section>

  ${renderFooter(nomProjet, locale)}
  <script src="/static/js/main.js"></script>
  <script>
    let deviseCourante = 'FCFA';
    let periodeCourante = 'mensuel';

    function changerDevise(devise) {
      deviseCourante = devise;
      ['fcfa','eur','usd'].forEach(d => {
        const btn = document.getElementById('btn-' + d);
        if (btn) {
          btn.classList.toggle('active', devise.toLowerCase() === d);
          btn.classList.toggle('bg-white', devise.toLowerCase() === d);
          btn.classList.toggle('shadow-sm', devise.toLowerCase() === d);
          btn.classList.toggle('text-gray-900', devise.toLowerCase() === d);
          btn.classList.toggle('text-gray-500', devise.toLowerCase() !== d);
        }
      });
      chargerPlans();
    }

    function changerPeriode(periode) {
      periodeCourante = periode;
      ['mensuel','annuel'].forEach(p => {
        const btn = document.getElementById('btn-' + p);
        if (btn) {
          btn.classList.toggle('active', p === periode);
          btn.classList.toggle('bg-white', p === periode);
          btn.classList.toggle('shadow-sm', p === periode);
          btn.classList.toggle('text-gray-900', p === periode);
          btn.classList.toggle('text-gray-500', p !== periode);
        }
      });
      chargerPlans();
    }

    async function chargerPlans() {
      try {
        const res = await fetch('/api/v1/plans?devise=' + deviseCourante);
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        renderPlansGrid(data.plans, data.devise || deviseCourante);
      } catch(e) {
        console.error('Erreur plans:', e);
        document.getElementById('plans-grid').innerHTML = '<p class="text-gray-500 col-span-3 text-center py-8">Impossible de charger les tarifs. <a href="/contact" class="text-red-600 hover:underline">Contactez-nous</a>.</p>';
      }
    }

    function renderPlansGrid(plans, devise) {
      if (!plans || !plans.length) return;
      const grid = document.getElementById('plans-grid');
      grid.innerHTML = plans.filter(p => p.nom !== 'Enterprise').map(plan => {
        const isPro = plan.nom && plan.nom.toLowerCase().includes('pro');
        const prix = periodeCourante === 'annuel' && plan.prix_annuel_converti
          ? plan.prix_annuel_converti
          : (plan.prix_mensuel_converti || 0);
        const prixFormate = plan.prix_mensuel === 0 ? 'Gratuit' : prix.toLocaleString('fr-FR') + ' ' + devise + (periodeCourante === 'mensuel' ? '/mois' : '/an');
        const features = plan.fonctionnalites ? (typeof plan.fonctionnalites === 'string' ? JSON.parse(plan.fonctionnalites) : plan.fonctionnalites) : {};

        return \`<div class="bg-white rounded-xl border \${isPro ? 'border-red-500 shadow-xl ring-1 ring-red-200' : 'border-gray-100 shadow-sm'} p-7 relative flex flex-col">
          \${isPro ? '<div class=\\"absolute -top-3.5 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap\\">⭐ Recommandé</div>' : ''}
          <div class="mb-6">
            <div class="font-bold text-xl text-gray-900 mb-3">\${plan.nom}</div>
            <div class="text-4xl font-extrabold text-gray-900">
              \${plan.prix_mensuel === 0 ? '<span class=\\"text-green-600\\">Gratuit</span>' : prixFormate}
            </div>
            \${periodeCourante === 'annuel' && plan.prix_annuel > 0 ? '<div class=\\"text-xs text-green-600 mt-1.5 font-semibold\\">✓ 2 mois offerts vs mensuel</div>' : ''}
            <div class="text-sm text-gray-500 mt-2">\${plan.commandes_incluses === -1 ? 'Commandes illimitées' : (plan.commandes_incluses || 0) + ' commandes/mois incluses'}</div>
          </div>
          <ul class="space-y-2.5 mb-7 text-sm text-gray-700 flex-1">
            \${features.stats_avancees ? '<li class=\\"flex items-start gap-2\\"><i class=\\"fa-solid fa-check text-green-500 flex-shrink-0 mt-0.5\\"></i>Statistiques avancées</li>' : '<li class=\\"flex items-start gap-2\\"><i class=\\"fa-solid fa-check text-green-500 flex-shrink-0 mt-0.5\\"></i>Statistiques de base</li>'}
            <li class="flex items-start gap-2"><i class="fa-solid fa-check text-green-500 flex-shrink-0 mt-0.5"></i>Boutique en ligne + QR Code</li>
            <li class="flex items-start gap-2"><i class="fa-solid fa-check text-green-500 flex-shrink-0 mt-0.5"></i>Notifications WhatsApp</li>
            \${features.codes_promo ? '<li class=\\"flex items-start gap-2\\"><i class=\\"fa-solid fa-check text-green-500 flex-shrink-0 mt-0.5\\"></i>Codes promotionnels</li>' : ''}
            \${features.domaine_perso ? '<li class=\\"flex items-start gap-2\\"><i class=\\"fa-solid fa-check text-green-500 flex-shrink-0 mt-0.5\\"></i>Domaine personnalisé</li>' : ''}
            \${features.export_csv ? '<li class=\\"flex items-start gap-2\\"><i class=\\"fa-solid fa-check text-green-500 flex-shrink-0 mt-0.5\\"></i>Export CSV</li>' : ''}
            \${features.support_whatsapp ? '<li class=\\"flex items-start gap-2\\"><i class=\\"fa-solid fa-check text-green-500 flex-shrink-0 mt-0.5\\"></i>Support WhatsApp prioritaire</li>' : ''}
          </ul>
          <a href="/inscription"
            class="block w-full text-center \${isPro ? 'bg-red-600 hover:bg-red-700 text-white shadow-md' : 'bg-gray-50 hover:bg-gray-100 text-gray-900 border border-gray-200'} font-bold py-3.5 rounded-xl transition-colors text-sm">
            \${plan.prix_mensuel === 0 ? 'Commencer gratuitement' : 'Choisir ' + plan.nom}
          </a>
        </div>\`;
      }).join('');
    }

    function toggleTariffsFaq(i) {
      const content = document.getElementById('tariffs-faq-' + i);
      const icon = document.getElementById('tariffs-faq-icon-' + i);
      content.classList.toggle('hidden');
      icon.classList.toggle('rotate-180');
    }

    document.addEventListener('DOMContentLoaded', () => chargerPlans());
  </script>
</body>
</html>`
}
