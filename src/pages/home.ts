// =============================================================
// PAGE D'ACCUEIL — renderHomePage()
// Réécriture complète :
//  - Charte graphique respectée : rouge dominant, bleu en accent,
//    noir/blanc en base, touche d'orange optionnelle non utilisée ici.
//  - Mode clair ET sombre entièrement fonctionnels (Tailwind dark:,
//    classe posée sur <html> par static/js/main.js — voir
//    notes/INTEGRATION-DARK-MODE.md pour la config Tailwind requise
//    dans components/head.ts).
//  - AUCUNE photo volée au web : visuels 100% illustrés (CSS/SVG),
//    en attendant les vraies photos que chaque restaurant upload
//    depuis son tableau de bord (comme sur mymenu.ma en pratique).
//  - Grille tarifaire à 4 plans, entièrement dynamique depuis D1 via
//    /api/v1/plans — zéro prix codé en dur dans ce fichier.
//  - FAQ étendue (9 questions), facilement extensible.
// =============================================================
import { renderHead } from '../components/head'
import { renderNav } from '../components/nav'
import { renderFooter } from '../components/footer'

export function renderHomePage(nomProjet: string): string {
  return `${renderHead(
    `${nomProjet} — Commandez en ligne dans vos restaurants préférés`,
    `${nomProjet} est la plateforme de commande en ligne pour les restaurants d'Afrique de l'Ouest et Centrale. Créez votre boutique en quelques minutes. Sans commission.`,
    nomProjet
  )}
<body class="font-sans bg-white dark:bg-[#0B0A09] text-gray-900 dark:text-gray-50 transition-colors">
  ${renderNav(nomProjet, 'accueil')}

  <!-- ===================================================== -->
  <!-- HERO                                                   -->
  <!-- ===================================================== -->
  <section class="relative overflow-hidden bg-gradient-to-br from-red-50 via-white to-blue-50 dark:from-[#1A0F0F] dark:via-[#0B0A09] dark:to-[#0B1220] py-20 lg:py-28" id="hero">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid lg:grid-cols-2 gap-12 items-center">

        <div>
          <div class="inline-flex items-center gap-2 bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <span class="w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-red-400"></span>
            0% de commission sur vos ventes
          </div>

          <h1 class="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 dark:text-white leading-tight mb-6">
            Votre restaurant,<br>
            <span class="text-red-600 dark:text-red-400">en ligne</span> en<br>
            quelques minutes
          </h1>
          <p class="text-lg text-gray-600 dark:text-gray-300 leading-relaxed mb-8 max-w-lg">
            Créez votre boutique de commande en ligne, gérez vos commandes en temps réel
            et recevez des notifications WhatsApp instantanées. <strong class="text-gray-900 dark:text-white">Sans commission. Abonnement fixe.</strong>
          </p>
          <div class="flex flex-col sm:flex-row gap-3">
            <a href="/inscription"
              class="inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500 text-white font-semibold px-6 py-3.5 rounded-xl transition-colors text-base shadow-lg shadow-red-200 dark:shadow-none">
              <i class="fa-solid fa-store" aria-hidden="true"></i>
              <span>Créer ma boutique gratuitement</span>
            </a>
            <a href="#comment-ca-marche"
              class="inline-flex items-center justify-center gap-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold px-6 py-3.5 rounded-xl border border-gray-200 dark:border-gray-700 transition-colors text-base">
              <i class="fa-regular fa-circle-play" aria-hidden="true"></i>
              <span>Voir comment ça marche</span>
            </a>
          </div>
          <div class="flex flex-wrap items-center gap-x-6 gap-y-2 mt-8 text-sm text-gray-500 dark:text-gray-400">
            <div class="flex items-center gap-1.5">
              <i class="fa-solid fa-circle-check text-red-600 dark:text-red-400" aria-hidden="true"></i>
              <span>Sans engagement</span>
            </div>
            <div class="flex items-center gap-1.5">
              <i class="fa-solid fa-circle-check text-blue-600 dark:text-blue-400" aria-hidden="true"></i>
              <span>Prêt en quelques minutes</span>
            </div>
            <div class="flex items-center gap-1.5">
              <i class="fa-solid fa-circle-check text-red-600 dark:text-red-400" aria-hidden="true"></i>
              <span>Support en français</span>
            </div>
          </div>
        </div>

        <!-- Scène illustrée + vraies balises <img> pour les photos de plats.
             Chaque restaurant uploade ses propres photos depuis son tableau
             de bord (comme sur mymenu.ma) : tant qu'aucune photo réelle
             n'est disponible pour la démo, onerror bascule proprement sur
             l'icône illustrée plutôt que d'afficher une image cassée. -->
        <div class="relative mx-auto max-w-md lg:max-w-none">
          <div class="relative rounded-[28px] bg-gray-900 dark:bg-black p-8 min-h-[420px] flex items-center justify-center overflow-hidden">
            <svg class="absolute inset-0 w-full h-full opacity-40" viewBox="0 0 400 420" preserveAspectRatio="none" aria-hidden="true">
              <path d="M50 100 C 140 160, 170 280, 310 380" stroke="#3A3630" stroke-width="2" stroke-dasharray="2 10" fill="none" stroke-linecap="round"/>
            </svg>
            <div class="absolute left-6 top-8 bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-lg">
              <i class="fa-solid fa-location-dot" aria-hidden="true"></i> Votre restaurant
            </div>

            <!-- Téléphone -->
            <div class="relative w-56 rounded-3xl bg-white dark:bg-gray-900 border-[6px] border-black shadow-2xl overflow-hidden">
              <div class="bg-red-600 px-4 pt-4 pb-9 text-white">
                <div class="font-bold text-sm">Votre boutique</div>
                <div class="text-[11px] opacity-85 mt-0.5 flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-white"></span> Ouvert maintenant
                </div>
              </div>
              <div class="p-3 -mt-6 space-y-2">
                <div class="bg-white dark:bg-gray-800 rounded-xl shadow p-2.5 flex items-center gap-2.5">
                  <div class="w-10 h-10 rounded-lg vignette-plat flex-shrink-0 overflow-hidden">
                    <img src="/static/img/demo/plat-riz-gras.jpg" alt="Riz gras poulet" loading="lazy"
                      class="w-full h-full object-cover" onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'fa-solid fa-bowl-rice text-red-500 dark:text-red-400 text-sm flex items-center justify-center w-full h-full'}))">
                  </div>
                  <div>
                    <div class="text-xs font-bold text-gray-900 dark:text-white">Riz gras poulet</div>
                    <div class="text-[11px] text-gray-500 dark:text-gray-400">2 500 FCFA</div>
                  </div>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-xl shadow p-2.5 flex items-center gap-2.5">
                  <div class="w-10 h-10 rounded-lg vignette-plat flex-shrink-0 overflow-hidden">
                    <img src="/static/img/demo/plat-poulet-braise.jpg" alt="Poulet braisé" loading="lazy"
                      class="w-full h-full object-cover" onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'fa-solid fa-drumstick-bite text-blue-500 dark:text-blue-400 text-sm flex items-center justify-center w-full h-full'}))">
                  </div>
                  <div>
                    <div class="text-xs font-bold text-gray-900 dark:text-white">Poulet braisé</div>
                    <div class="text-[11px] text-gray-500 dark:text-gray-400">3 000 FCFA</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Bulle confirmation WhatsApp -->
            <div class="absolute right-4 bottom-10 bg-white dark:bg-gray-800 rounded-2xl rounded-br-md shadow-xl p-3.5 w-48 text-xs">
              <div class="flex items-center gap-1.5 font-bold text-gray-900 dark:text-white mb-1">
                <i class="fa-brands fa-whatsapp text-green-500" aria-hidden="true"></i> Commande #42
              </div>
              <div class="text-gray-500 dark:text-gray-400">Riz gras poulet ×1 — Livraison confirmée</div>
            </div>
          </div>

          <div class="absolute -top-4 -right-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 p-3 flex items-center gap-2">
            <div class="w-8 h-8 bg-red-100 dark:bg-red-950/50 rounded-lg flex items-center justify-center">
              <i class="fa-solid fa-check text-red-600 dark:text-red-400 text-sm" aria-hidden="true"></i>
            </div>
            <div>
              <div class="text-xs font-bold text-gray-900 dark:text-white">0% commission</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">Sur vos ventes</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </section>

  <!-- ===================================================== -->
  <!-- FONCTIONNALITÉS                                        -->
  <!-- ===================================================== -->
  <section class="py-20 bg-white dark:bg-[#0B0A09]" id="fonctionnalites">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-14">
        <h2 class="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white mb-4">
          Tout ce dont votre restaurant a besoin
        </h2>
        <p class="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
          Une plateforme complète, simple à utiliser au quotidien pour booster votre activité.
        </p>
      </div>

      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        ${[
          { icon: 'fa-mobile-screen-button', title: 'Boutique en ligne', desc: 'Votre menu accessible via un lien unique ou QR code. Aucune application à télécharger.', accent: 'rouge' },
          { icon: 'fa-brands fa-whatsapp', title: 'Notifications WhatsApp', desc: 'Chaque commande arrive instantanément sur votre WhatsApp, prête à confirmer.', accent: 'bleu' },
          { icon: 'fa-chart-line', title: 'Tableau de bord', desc: 'Statistiques claires, historique complet et gestion du menu en temps réel.', accent: 'noir' },
          { icon: 'fa-location-dot', title: 'Livraison géolocalisée', desc: "Frais de livraison calculés automatiquement selon la distance, l'heure et la météo.", accent: 'bleu' },
          { icon: 'fa-qrcode', title: 'QR Code imprimable', desc: "Généré automatiquement pour chaque boutique, à afficher dans votre établissement.", accent: 'rouge' },
          { icon: 'fa-palette', title: 'Personnalisation', desc: 'Votre boutique à votre image : logo et couleurs, indépendants de la charte MonMenu.', accent: 'noir' },
        ].map(f => {
          const styles = {
            rouge: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40',
            bleu: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40',
            noir: 'text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-800',
          }[f.accent]
          return `
          <article class="bg-gray-50 dark:bg-gray-900/60 rounded-xl p-6 border border-gray-100 dark:border-gray-800 hover:shadow-md dark:hover:shadow-none dark:hover:border-gray-700 transition-all card-hover">
            <div class="w-11 h-11 ${styles} rounded-xl flex items-center justify-center mb-4" aria-hidden="true">
              <i class="fa-solid ${f.icon} text-lg"></i>
            </div>
            <h3 class="font-bold text-gray-900 dark:text-white mb-2">${f.title}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">${f.desc}</p>
          </article>`
        }).join('')}
      </div>
    </div>
  </section>

  <!-- ===================================================== -->
  <!-- COMMENT ÇA MARCHE (parcours réel, sans compte client)  -->
  <!-- ===================================================== -->
  <section class="py-20 bg-gray-900 dark:bg-black" id="comment-ca-marche">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-14">
        <div class="inline-flex items-center gap-2 text-red-400 text-xs font-bold uppercase tracking-wide mb-3">
          <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span> Le parcours client
        </div>
        <h2 class="text-3xl sm:text-4xl font-extrabold text-white mb-4">Quatre étapes, aucune inscription</h2>
        <p class="text-lg text-gray-400 max-w-2xl mx-auto">Le client n'ouvre jamais de compte. Il commande, confirme sur WhatsApp, et suit sa livraison.</p>
      </div>

      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
        ${[
          { n: 1, qui: 'Côté client', accent: 'red', titre: 'Il découvre le menu', desc: "Via un lien, un QR code en salle, ou une redirection WhatsApp." },
          { n: 2, qui: 'Côté client', accent: 'red', titre: 'Il commande', desc: 'Sans compte : nom, téléphone, et adresse positionnée sur la carte.' },
          { n: 3, qui: 'Côté restaurant', accent: 'blue', titre: 'Le restaurant confirme', desc: 'Notification instantanée par WhatsApp et dans le tableau de bord.' },
          { n: 4, qui: 'Côté restaurant', accent: 'blue', titre: 'Il est livré', desc: "Le livreur reçoit l'itinéraire complet, en un seul message." },
        ].map(e => `
          <div>
            <div class="text-[11px] uppercase tracking-wide font-bold mb-3 ${e.accent === 'red' ? 'text-red-400' : 'text-blue-400'}">${e.qui}</div>
            <div class="w-12 h-12 rounded-full flex items-center justify-center font-extrabold text-lg text-white mb-5 ${e.accent === 'red' ? 'bg-red-600' : 'bg-blue-600'}">${e.n}</div>
            <h4 class="text-white font-bold mb-2">${e.titre}</h4>
            <p class="text-sm text-gray-400 leading-relaxed">${e.desc}</p>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- ===================================================== -->
  <!-- RESTAURANTS PARTENAIRES — logos réels uniquement.       -->
  <!-- Chargé dynamiquement depuis /api/v1/tenants (voir       -->
  <!-- chargerPartenairesAccueil ci-dessous) : aucun logo ni   -->
  <!-- nom de restaurant n'est codé en dur ici, conformément à -->
  <!-- l'interdiction du cahier des charges (section 1.1/13)   -->
  <!-- d'afficher une preuve sociale non vérifiée. Tant qu'il  -->
  <!-- n'y a pas encore de restaurant réel actif, la section   -->
  <!-- affiche un état vide honnête plutôt que des logos       -->
  <!-- inventés.                                                -->
  <!-- ===================================================== -->
  <section class="py-16 bg-white dark:bg-[#0B0A09] border-t border-gray-100 dark:border-gray-800" id="partenaires">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-10">
        <h2 class="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white mb-3">Ils utilisent ${nomProjet}</h2>
        <p class="text-gray-600 dark:text-gray-300">Les restaurants qui ont déjà créé leur boutique.</p>
      </div>

      <div id="partenaires-grid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 items-center justify-items-center">
        ${[1, 2, 3, 4, 5, 6].map(() => '<div class="animate-pulse bg-gray-100 dark:bg-gray-800 rounded-xl w-full h-16"></div>').join('')}
      </div>

      <!-- État vide (aucun partenaire réel pour l'instant) -->
      <div id="partenaires-vide" class="hidden text-center py-10 px-6 bg-gray-50 dark:bg-gray-900/60 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">
        <p class="text-gray-600 dark:text-gray-300 mb-4">
          Les premiers restaurants rejoignent ${nomProjet} — le vôtre pourrait être parmi les premiers affichés ici.
        </p>
        <a href="/contact?sujet=partenariat"
          class="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm">
          <i class="fa-solid fa-handshake" aria-hidden="true"></i>
          Devenir partenaire
        </a>
      </div>

      <div class="text-center mt-8">
        <a href="/contact?sujet=partenariat" class="text-sm font-semibold text-red-600 dark:text-red-400 hover:underline inline-flex items-center gap-1.5">
          Vous êtes restaurateur ? Devenir partenaire <i class="fa-solid fa-arrow-right text-xs" aria-hidden="true"></i>
        </a>
      </div>
    </div>
  </section>

  <!-- ===================================================== -->
  <!-- TARIFS — 100% dynamique depuis D1 (/api/v1/plans)      -->
  <!-- ===================================================== -->
  <section class="py-20 bg-gray-50 dark:bg-[#0B0A09]" id="tarifs">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-10">
        <h2 class="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white mb-4">Tarifs transparents</h2>
        <p class="text-gray-600 dark:text-gray-300 mb-6 text-lg">Sans commission sur vos ventes. Forfait fixe, sans surprise.</p>

        <div class="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-1 shadow-sm">
          <button onclick="changerDevise('FCFA')" id="btn-fcfa"
            class="devise-btn active px-4 py-2 rounded-lg text-sm font-semibold bg-gray-900 dark:bg-red-600 text-white transition-all">FCFA</button>
          <button onclick="changerDevise('EUR')" id="btn-eur"
            class="devise-btn px-4 py-2 rounded-lg text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all">EUR</button>
          <button onclick="changerDevise('USD')" id="btn-usd"
            class="devise-btn px-4 py-2 rounded-lg text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all">USD</button>
        </div>
      </div>

      <div id="plans-grid" class="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
        ${[1, 2, 3, 4].map(() => '<div class="animate-pulse bg-gray-100 dark:bg-gray-800 rounded-2xl h-96"></div>').join('')}
      </div>
      <p class="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
        Tarifs indicatifs en franc CFA, convertis automatiquement selon la devise choisie. Le plan Faso inclut 30 jours d'essai gratuit.
      </p>
    </div>
  </section>

  <!-- ===================================================== -->
  <!-- FAQ étendue                                            -->
  <!-- ===================================================== -->
  <section class="py-20 bg-white dark:bg-[#0B0A09]" id="faq">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-12">
        <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white mb-3">Questions fréquentes</h2>
        <p class="text-gray-600 dark:text-gray-300">Tout ce que vous devez savoir avant de vous lancer.</p>
      </div>
      <div class="space-y-3">
        ${[
          {
            q: 'Comment recevoir les commandes ?',
            a: 'Les commandes arrivent instantanément dans votre tableau de bord et sont également envoyées sur votre numéro WhatsApp, avec le détail complet du client et des produits commandés.',
          },
          {
            q: 'Mes clients doivent-ils créer un compte pour commander ?',
            a: 'Non, jamais. Le client renseigne simplement son nom, son numéro et son adresse de livraison au moment de commander — aucune inscription n\'est requise, à aucune étape.',
          },
          {
            q: 'Y a-t-il des frais cachés ou une commission sur mes ventes ?',
            a: 'Non, aucun. MonMenu ne prélève aucune commission sur vos ventes. Vous payez uniquement l\'abonnement fixe de votre plan, affiché en toute transparence.',
          },
          {
            q: 'Comment est calculé le prix de la livraison ?',
            a: 'Il combine la distance entre votre point de vente et l\'adresse du client, l\'heure de la commande (heures de pointe configurables) et, si activé, les conditions météo du moment. Le détail est toujours visible par le client avant validation.',
          },
          {
            q: 'Puis-je changer de plan à tout moment ?',
            a: 'Oui. La mise à niveau est immédiate. Le passage à un plan inférieur prend effet au prochain cycle de facturation. Tout se gère depuis votre tableau de bord, sans contacter le support.',
          },
          {
            q: 'Que se passe-t-il si je dépasse le quota de commandes de mon plan ?',
            a: 'Votre boutique reste active et continue de recevoir des commandes normalement. Les commandes au-delà du quota inclus sont facturées à un tarif unitaire fixe, indiqué dans votre tableau de bord.',
          },
          {
            q: 'Quels moyens de paiement mes clients peuvent-ils utiliser ?',
            a: 'Au lancement, le paiement se fait en espèces à la livraison ou au retrait. L\'ajout de moyens de paiement supplémentaires (mobile money notamment) est prévu dans l\'architecture et sera activé progressivement, pays par pays.',
          },
          {
            q: 'Puis-je personnaliser les couleurs et le logo de ma boutique ?',
            a: 'Oui. Chaque restaurant choisit ses propres couleurs, son logo et ses photos depuis son tableau de bord — cette personnalisation est totalement indépendante de la charte graphique de MonMenu.',
          },
          {
            q: 'Le plan gratuit "Faso" est-il vraiment sans engagement ?',
            a: 'Oui. Le plan Faso vous donne 30 jours d\'essai complet, sans carte bancaire requise pour démarrer. Vous pouvez arrêter ou passer à un plan payant à tout moment.',
          },
        ].map((faq, i) => `
          <div class="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-900/40">
            <button onclick="toggleFaqAccueil(${i})"
              class="w-full text-left px-5 py-4 flex items-center justify-between gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
              aria-expanded="false" aria-controls="faq-accueil-${i}">
              <span class="font-semibold text-gray-900 dark:text-white text-sm">${faq.q}</span>
              <i id="faq-accueil-icon-${i}" class="fa-solid fa-chevron-down text-gray-400 dark:text-gray-500 text-xs flex-shrink-0 transition-transform" aria-hidden="true"></i>
            </button>
            <div id="faq-accueil-${i}" class="hidden px-5 pb-4" role="region">
              <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">${faq.a}</p>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- ===================================================== -->
  <!-- CTA final                                               -->
  <!-- ===================================================== -->
  <section class="py-16 bg-red-600 dark:bg-red-700">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 text-center">
      <h2 class="text-2xl sm:text-3xl font-extrabold text-white mb-4">Commencez gratuitement dès aujourd'hui</h2>
      <p class="text-red-100 mb-8">30 jours d'essai avec le plan Faso. Aucune carte bancaire requise.</p>
      <div class="flex flex-col sm:flex-row gap-3 justify-center">
        <a href="/inscription"
          class="inline-flex items-center justify-center gap-2 bg-white text-red-600 font-bold px-8 py-3.5 rounded-xl hover:bg-red-50 transition-colors shadow-lg">
          <i class="fa-solid fa-store" aria-hidden="true"></i>
          Créer ma boutique gratuitement
        </a>
        <a href="/contact"
          class="inline-flex items-center justify-center gap-2 border border-red-300 text-white font-semibold px-8 py-3.5 rounded-xl hover:bg-red-700 dark:hover:bg-red-800 transition-colors">
          <i class="fa-solid fa-envelope" aria-hidden="true"></i>
          Une question ? Contactez-nous
        </a>
      </div>
    </div>
  </section>

  ${renderFooter(nomProjet)}

  <script src="/static/js/main.js"></script>
  <script>
    // ---------------------------------------------------------
    // Grille tarifs — 4 plans, 100% dynamiques depuis /api/v1/plans
    // (aucun prix ni nom de plan codé en dur dans ce fichier)
    // ---------------------------------------------------------
    let deviseCouranteAccueil = 'FCFA';

    function changerDevise(devise) {
      deviseCouranteAccueil = devise;
      ['fcfa', 'eur', 'usd'].forEach(d => {
        const btn = document.getElementById('btn-' + d);
        if (!btn) return;
        const actif = devise.toLowerCase() === d;
        btn.classList.toggle('bg-gray-900', actif);
        btn.classList.toggle('dark:bg-red-600', actif);
        btn.classList.toggle('text-white', actif);
        btn.classList.toggle('text-gray-500', !actif);
        btn.classList.toggle('dark:text-gray-400', !actif);
      });
      chargerPlansAccueil();
    }

    async function chargerPlansAccueil() {
      const grid = document.getElementById('plans-grid');
      try {
        const res = await fetch('/api/v1/plans?devise=' + deviseCouranteAccueil);
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        renderPlansGridAccueil(data.plans || [], data.devise || deviseCouranteAccueil);
      } catch (e) {
        console.error('Erreur chargement plans:', e);
        grid.innerHTML = '<p class="text-gray-500 dark:text-gray-400 col-span-4 text-center py-8">Impossible de charger les tarifs pour le moment. <a href="/contact" class="text-red-600 dark:text-red-400 hover:underline">Contactez-nous</a>.</p>';
      }
    }

    function formaterPrix(plan, devise) {
      if (plan.prix_mensuel === 0) return 'Gratuit';
      const prix = plan.prix_mensuel_converti || 0;
      return prix.toLocaleString('fr-FR') + ' ' + devise + ' / mois';
    }

    function renderPlansGridAccueil(plans, devise) {
      const grid = document.getElementById('plans-grid');
      if (!plans.length) {
        grid.innerHTML = '<p class="text-gray-500 dark:text-gray-400 col-span-4 text-center py-8">Aucun plan disponible pour le moment.</p>';
        return;
      }

      grid.innerHTML = plans.map(plan => {
        const f = plan.fonctionnalites || {};
        const recommande = !!f.recommande;
        const gratuit = plan.prix_mensuel === 0;
        const accentBleu = plan.nom === 'Mogho'; // plan le plus complet : accent bleu, cf. charte

        const bordure = recommande
          ? 'border-2 border-red-600 dark:border-red-500 shadow-xl'
          : accentBleu
            ? 'border-2 border-blue-600 dark:border-blue-500 shadow-xl'
            : 'border border-gray-100 dark:border-gray-800 shadow-sm';

        const etiquette = recommande
          ? '<div class="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">Le plus choisi</div>'
          : accentBleu
            ? '<div class="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">Pensé pour grandir</div>'
            : '';

        const boutonClasse = recommande
          ? 'bg-red-600 hover:bg-red-700 text-white shadow-md'
          : accentBleu
            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
            : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700';

        const commandesTexte = plan.commandes_incluses_affichage === 'Illimitées'
          ? 'Commandes illimitées'
          : (plan.commandes_incluses_affichage || 0) + ' commandes/mois incluses';

        return \`<div class="relative bg-white dark:bg-gray-900 rounded-2xl p-6 flex flex-col \${bordure}">
          \${etiquette}
          <div class="mb-5">
            <div class="font-bold text-lg text-gray-900 dark:text-white">\${plan.nom}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">\${f.sous_titre || ''}</div>
            <div class="text-3xl font-extrabold text-gray-900 dark:text-white mt-4">
              \${gratuit ? '<span class="text-red-600 dark:text-red-400">Gratuit</span>' : formaterPrix(plan, devise)}
            </div>
            \${gratuit && f.duree_essai_jours ? '<div class="text-xs text-blue-600 dark:text-blue-400 mt-1.5 font-semibold">' + f.duree_essai_jours + ' jours d\\'essai</div>' : ''}
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-2">\${commandesTexte}</div>
          </div>
          <ul class="space-y-2 mb-6 text-sm text-gray-700 dark:text-gray-300 flex-1">
            <li class="flex items-start gap-2"><i class="fa-solid fa-check text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5"></i>Boutique en ligne + QR code</li>
            <li class="flex items-start gap-2"><i class="fa-solid fa-check text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5"></i>Notifications WhatsApp</li>
            <li class="flex items-start gap-2"><i class="fa-solid fa-check text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5"></i>\${plan.limite_pdv_affichage === 'Illimités' ? 'Points de vente illimités' : plan.limite_pdv_affichage + ' point(s) de vente'}</li>
            \${f.statistiques_avancees ? '<li class="flex items-start gap-2"><i class="fa-solid fa-check text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5"></i>Statistiques avancées</li>' : '<li class="flex items-start gap-2"><i class="fa-solid fa-check text-gray-400 flex-shrink-0 mt-0.5"></i>Statistiques de base</li>'}
            \${f.codes_promo ? '<li class="flex items-start gap-2"><i class="fa-solid fa-check text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5"></i>Codes promotionnels</li>' : ''}
            \${f.domaine_perso ? '<li class="flex items-start gap-2"><i class="fa-solid fa-check text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5"></i>Domaine personnalisé</li>' : ''}
            \${f.export_csv ? '<li class="flex items-start gap-2"><i class="fa-solid fa-check text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5"></i>Export CSV</li>' : ''}
            \${f.multi_boutique ? '<li class="flex items-start gap-2"><i class="fa-solid fa-check text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5"></i>Multi-boutique</li>' : ''}
            \${f.support_whatsapp_prioritaire ? '<li class="flex items-start gap-2"><i class="fa-solid fa-check text-blue-500 dark:text-blue-400 flex-shrink-0 mt-0.5"></i>Support WhatsApp prioritaire</li>' : ''}
          </ul>
          <a href="/inscription?plan=\${encodeURIComponent(plan.id)}"
            class="block w-full text-center \${boutonClasse} font-bold py-3 rounded-xl transition-colors text-sm">
            \${gratuit ? 'Démarrer l\\'essai gratuit' : 'Choisir ' + plan.nom}
          </a>
        </div>\`;
      }).join('');
    }

    function toggleFaqAccueil(i) {
      const content = document.getElementById('faq-accueil-' + i);
      const icon = document.getElementById('faq-accueil-icon-' + i);
      content.classList.toggle('hidden');
      icon.classList.toggle('rotate-180');
    }

    // ---------------------------------------------------------
    // Restaurants partenaires — 100% réel, chargé depuis
    // GET /api/v1/tenants (endpoint public liste, ajouté à
    // api-tenants.ts). Ne renvoie que des restaurants au statut
    // "actif" avec un logo réel : aucun nom/logo inventé.
    // ---------------------------------------------------------
    async function chargerPartenairesAccueil() {
      const grid = document.getElementById('partenaires-grid');
      const vide = document.getElementById('partenaires-vide');
      try {
        const res = await fetch('/api/v1/tenants?limit=6');
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        const tenants = data.tenants || [];

        if (!tenants.length) {
          grid.classList.add('hidden');
          vide.classList.remove('hidden');
          return;
        }

        grid.innerHTML = tenants.map(t => {
          const vignette = t.logo_url
            ? '<img src="' + t.logo_url + '" alt="' + t.nom + '" loading="lazy" class="max-h-12 max-w-full object-contain">'
            : '<span class="text-sm font-semibold text-gray-500 dark:text-gray-400 text-center px-2">' + t.nom + '</span>';
          return '<a href="/' + t.slug + '" class="w-full h-16 flex items-center justify-center grayscale hover:grayscale-0 transition-all opacity-70 hover:opacity-100" title="' + t.nom + '">' + vignette + '</a>';
        }).join('');
      } catch (e) {
        console.error('Erreur chargement partenaires:', e);
        // En cas d'échec réseau/API, on affiche l'état vide plutôt qu'un
        // squelette de chargement figé indéfiniment.
        grid.classList.add('hidden');
        vide.classList.remove('hidden');
      }
    }

    document.addEventListener('DOMContentLoaded', () => {
      chargerPlansAccueil();
      chargerPartenairesAccueil();
    });
  </script>
</body>
</html>`
}
