// src/pages/legal.ts
import { renderHead } from '../components/head'
import { renderNav } from '../components/nav'
import { renderFooter } from '../components/footer'

export function renderLegalPage(type: 'cgu' | 'confidentialite' | 'mentions' | 'cookies', nomProjet: string): string {
  const year = new Date().getFullYear()

  const contents: Record<string, { title: string; body: string }> = {
    cgu: {
      title: 'Conditions Générales d\'Utilisation',
      body: `
<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">1. Objet</h2>
<p>Les présentes Conditions Générales d'Utilisation (CGU) régissent l'utilisation de la plateforme <strong>${nomProjet}</strong>, accessible à l'adresse monmenu.app, opérée par l'équipe ${nomProjet}.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">2. Services proposés</h2>
<p>${nomProjet} est une plateforme SaaS permettant aux restaurants et établissements de restauration d'Afrique de l'Ouest et Centrale de :</p>
<ul class="list-disc pl-6 mt-2 space-y-1">
  <li>Créer une boutique de commande en ligne accessible sans inscription pour leurs clients</li>
  <li>Recevoir des notifications de commandes via WhatsApp</li>
  <li>Gérer leur menu, leurs commandes et leurs statistiques via un tableau de bord</li>
  <li>Générer des QR codes pour faciliter l'accès à leur boutique</li>
</ul>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">3. Accès au service</h2>
<p>L'inscription est réservée aux professionnels de la restauration. Les clients finaux commandent sans créer de compte. Le restaurant s'engage à fournir des informations exactes lors de l'inscription.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">4. Responsabilités</h2>
<p>Le restaurant est responsable :</p>
<ul class="list-disc pl-6 mt-2 space-y-1">
  <li>De l'exactitude des informations de son menu (prix, disponibilité)</li>
  <li>De la traçabilité et du traitement des commandes reçues</li>
  <li>Du respect des obligations légales locales (hygiène, TVA, etc.)</li>
  <li>De la confidentialité de ses identifiants de connexion</li>
</ul>
<p class="mt-3">${nomProjet} est responsable de :</p>
<ul class="list-disc pl-6 mt-2 space-y-1">
  <li>La disponibilité de la plateforme (objectif SLA 99,5%)</li>
  <li>La sécurité des données stockées</li>
  <li>L'acheminement des notifications WhatsApp</li>
</ul>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">5. Tarification</h2>
<p>Les tarifs sont ceux affichés sur la page <a href="/tarifs" class="text-red-600 hover:underline">Tarifs</a> au moment de l'inscription. Le premier mois est offert. L'abonnement est mensuel sans engagement, sauf mention contraire.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">6. Commission</h2>
<p>${nomProjet} ne prélève aucune commission sur les ventes. Seul un abonnement mensuel fixe est facturé. Des frais fixes peuvent s'appliquer au-delà du quota de commandes incluses selon le plan souscrit.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">7. Résiliation</h2>
<p>Le restaurant peut résilier son abonnement à tout moment depuis son tableau de bord ou en contactant le support. Les données sont conservées 30 jours après résiliation puis supprimées définitivement.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">8. Propriété intellectuelle</h2>
<p>Le code, les designs et la marque ${nomProjet} sont la propriété exclusive de leurs auteurs. Le restaurant conserve la propriété de son contenu (menu, photos, informations).</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">9. Droit applicable</h2>
<p>Les présentes CGU sont soumises au droit burkinabè. Tout litige sera soumis aux tribunaux compétents de Ouagadougou, Burkina Faso.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">10. Modification</h2>
<p>Ces CGU peuvent être modifiées. Les utilisateurs seront informés par email au moins 15 jours avant toute modification substantielle.</p>
<p class="mt-4 text-sm text-gray-400">Dernière mise à jour : juillet ${year}</p>`
    },
    confidentialite: {
      title: 'Politique de Confidentialité',
      body: `
<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">1. Responsable du traitement</h2>
<p>Le responsable du traitement des données est l'équipe <strong>${nomProjet}</strong>, joignable à l'adresse <a href="mailto:support@monmenu.app" class="text-red-600 hover:underline">support@monmenu.app</a>.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">2. Données collectées</h2>
<h3 class="font-semibold text-gray-800 mt-4 mb-2">Données des restaurants (tenants)</h3>
<ul class="list-disc pl-6 space-y-1">
  <li>Email et mot de passe (authentification Supabase Auth — haché)</li>
  <li>Nom du restaurant, numéro WhatsApp, couleurs de boutique</li>
  <li>Informations du menu (catégories, produits, prix)</li>
</ul>
<h3 class="font-semibold text-gray-800 mt-4 mb-2">Données des clients finaux (commandes)</h3>
<ul class="list-disc pl-6 space-y-1">
  <li>Prénom et nom (saisi librement)</li>
  <li>Numéro de téléphone</li>
  <li>Adresse de livraison et coordonnées GPS (si géolocalisation acceptée)</li>
  <li>Contenu et montant de la commande</li>
</ul>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">3. Finalités du traitement</h2>
<ul class="list-disc pl-6 space-y-1">
  <li>Fournir le service de commande en ligne</li>
  <li>Envoyer les notifications WhatsApp et email de commande</li>
  <li>Calculer les frais de livraison (coordonnées GPS)</li>
  <li>Permettre le suivi de commande</li>
  <li>Établir des statistiques agrégées (non nominatives)</li>
</ul>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">4. Base légale</h2>
<p>Les traitements reposent sur : l'exécution du contrat de service (restaurant), le consentement (géolocalisation), et l'intérêt légitime (sécurité, prévention de la fraude).</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">5. Durée de conservation</h2>
<ul class="list-disc pl-6 space-y-1">
  <li>Données de commande : 24 mois</li>
  <li>Données de compte restaurant : durée de l'abonnement + 30 jours</li>
  <li>Logs de sécurité : 12 mois</li>
</ul>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">6. Sous-traitants</h2>
<ul class="list-disc pl-6 space-y-1">
  <li><strong>Cloudflare</strong> (hébergement, CDN, base de données D1, KV, R2) — USA/EU</li>
  <li><strong>Supabase</strong> (authentification, base PostgreSQL) — EU</li>
  <li><strong>Meta/WhatsApp</strong> (notifications) — USA</li>
  <li><strong>Brevo</strong> (emails transactionnels) — France/EU</li>
  <li><strong>Mapbox</strong> (cartographie livraison) — USA</li>
</ul>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">7. Sécurité</h2>
<p>Les données sont chiffrées en transit (TLS 1.3) et au repos. Les mots de passe sont hachés par Supabase Auth (bcrypt). L'isolation multi-tenant est assurée par des politiques RLS sur toutes les tables. Aucune donnée d'un restaurant n'est accessible par un autre.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">8. Vos droits</h2>
<p>Vous disposez des droits d'accès, rectification, effacement, portabilité et opposition. Pour exercer ces droits : <a href="mailto:support@monmenu.app" class="text-red-600 hover:underline">support@monmenu.app</a>.</p>
<p class="mt-4 text-sm text-gray-400">Dernière mise à jour : juillet ${year}</p>`
    },
    mentions: {
      title: 'Mentions Légales',
      body: `
<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Éditeur du site</h2>
<p><strong>${nomProjet}</strong><br>
Plateforme de commande en ligne pour restaurants d'Afrique de l'Ouest et Centrale<br>
Siège social : Ouagadougou, Burkina Faso<br>
Email : <a href="mailto:contact@monmenu.app" class="text-red-600 hover:underline">contact@monmenu.app</a></p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Hébergement</h2>
<p><strong>Cloudflare, Inc.</strong><br>
101 Townsend St, San Francisco, CA 94107, États-Unis<br>
Déploiement via Cloudflare Workers (edge computing mondial).<br>
Base de données D1 (SQLite distribuée), KV Store, R2 Object Storage.</p>
<p class="mt-4"><strong>Supabase</strong><br>
Authentification et base de données PostgreSQL hébergées sur serveurs EU.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Propriété intellectuelle</h2>
<p>L'ensemble du contenu de ce site (textes, code source, design, logo, iconographie) est protégé par le droit d'auteur. Toute reproduction, même partielle, sans autorisation écrite est interdite.</p>
<p class="mt-3">Les icônes utilisées proviennent de <a href="https://fontawesome.com" target="_blank" rel="noopener" class="text-red-600 hover:underline">Font Awesome</a> (licence Free).</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Données personnelles</h2>
<p>Voir notre <a href="/legal/confidentialite" class="text-red-600 hover:underline">Politique de Confidentialité</a>.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Cookies</h2>
<p>Voir notre <a href="/legal/cookies" class="text-red-600 hover:underline">Politique de Cookies</a>.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Limitation de responsabilité</h2>
<p>${nomProjet} s'efforce d'assurer la disponibilité et l'exactitude des informations publiées. Cependant, la responsabilité de ${nomProjet} ne saurait être engagée en cas d'erreur, d'omission ou d'interruption de service.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Droit applicable</h2>
<p>Le présent site est soumis au droit burkinabè. Tout litige sera soumis à la juridiction compétente de Ouagadougou.</p>
<p class="mt-4 text-sm text-gray-400">Dernière mise à jour : juillet ${year}</p>`
    },
    cookies: {
      title: 'Politique de Cookies',
      body: `
<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Qu'est-ce qu'un cookie ?</h2>
<p>Un cookie est un petit fichier texte déposé sur votre terminal (ordinateur, tablette, smartphone) lors de la visite d'un site web.</p>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Cookies utilisés par ${nomProjet}</h2>
<h3 class="font-semibold text-gray-800 mt-5 mb-2">Cookies strictement nécessaires</h3>
<div class="overflow-x-auto">
  <table class="w-full text-sm border border-gray-100 rounded-xl overflow-hidden">
    <thead class="bg-gray-50">
      <tr>
        <th class="text-left px-4 py-2 font-semibold text-gray-700">Nom</th>
        <th class="text-left px-4 py-2 font-semibold text-gray-700">Finalité</th>
        <th class="text-left px-4 py-2 font-semibold text-gray-700">Durée</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-gray-50">
      <tr>
        <td class="px-4 py-2 font-mono text-xs">monmenu_cookies</td>
        <td class="px-4 py-2 text-gray-600">Mémoriser votre consentement cookies</td>
        <td class="px-4 py-2 text-gray-500">12 mois</td>
      </tr>
    </tbody>
  </table>
</div>

<h3 class="font-semibold text-gray-800 mt-5 mb-2">Stockage local (localStorage) — pas des cookies</h3>
<div class="overflow-x-auto">
  <table class="w-full text-sm border border-gray-100 rounded-xl overflow-hidden">
    <thead class="bg-gray-50">
      <tr>
        <th class="text-left px-4 py-2 font-semibold text-gray-700">Clé</th>
        <th class="text-left px-4 py-2 font-semibold text-gray-700">Finalité</th>
        <th class="text-left px-4 py-2 font-semibold text-gray-700">Durée</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-gray-50">
      <tr>
        <td class="px-4 py-2 font-mono text-xs">monmenu_cart_[slug]</td>
        <td class="px-4 py-2 text-gray-600">Persistance du panier d'achat (côté client uniquement)</td>
        <td class="px-4 py-2 text-gray-500">24 heures</td>
      </tr>
      <tr>
        <td class="px-4 py-2 font-mono text-xs">monmenu_auth_token</td>
        <td class="px-4 py-2 text-gray-600">Session du tableau de bord restaurant</td>
        <td class="px-4 py-2 text-gray-500">1 heure</td>
      </tr>
    </tbody>
  </table>
</div>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Cookies tiers</h2>
<p>Des scripts tiers peuvent déposer leurs propres cookies :</p>
<ul class="list-disc pl-6 mt-2 space-y-1">
  <li><strong>Mapbox</strong> : cartographie lors de la saisie d'adresse de livraison</li>
  <li><strong>Cloudflare</strong> : protection anti-bot (cf_clearance)</li>
</ul>

<h2 class="text-xl font-bold text-gray-900 mt-8 mb-3">Gérer vos préférences</h2>
<p>Vous pouvez à tout moment modifier vos préférences en utilisant le bandeau cookies en bas de page, ou en paramétrant votre navigateur pour refuser les cookies.</p>
<div class="flex gap-3 mt-6">
  <button onclick="acceptCookies(); window.location.reload();"
    class="bg-red-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-red-700 transition-colors">
    Accepter les cookies
  </button>
  <button onclick="rejectCookies(); window.location.reload();"
    class="border border-gray-300 text-gray-700 font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">
    Refuser les cookies non essentiels
  </button>
</div>
<p class="mt-4 text-sm text-gray-400">Dernière mise à jour : juillet ${year}</p>`
    }
  }

  const content = contents[type]

  return `${renderHead(
    `${content.title} — ${nomProjet}`,
    `${content.title} de ${nomProjet}. Information sur vos droits et nos obligations.`,
    nomProjet
  )}
<body class="font-sans bg-white text-gray-900">
  ${renderNav(nomProjet, '')}
  <main class="max-w-3xl mx-auto px-4 sm:px-6 py-16">
    <nav class="text-xs text-gray-400 mb-8 flex items-center gap-2">
      <a href="/" class="hover:text-gray-600 transition-colors">Accueil</a>
      <i class="fa-solid fa-chevron-right text-gray-300"></i>
      <span class="text-gray-600">${content.title}</span>
    </nav>
    <article class="prose prose-sm max-w-none text-gray-700 leading-relaxed">
      <h1 class="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-2">${content.title}</h1>
      <p class="text-gray-400 text-sm mb-8">En vigueur à compter de juillet ${year}</p>
      ${content.body}
    </article>

    <!-- Navigation entre pages légales -->
    <nav class="mt-12 pt-8 border-t border-gray-100 grid grid-cols-2 gap-4">
      <a href="/legal/cgu" class="p-4 border border-gray-100 rounded-xl hover:border-red-200 hover:bg-red-50 transition-colors group">
        <div class="text-xs text-gray-400 mb-0.5 group-hover:text-red-400">Conditions</div>
        <div class="text-sm font-semibold text-gray-900 group-hover:text-red-700">CGU</div>
      </a>
      <a href="/legal/confidentialite" class="p-4 border border-gray-100 rounded-xl hover:border-red-200 hover:bg-red-50 transition-colors group">
        <div class="text-xs text-gray-400 mb-0.5 group-hover:text-red-400">Protection</div>
        <div class="text-sm font-semibold text-gray-900 group-hover:text-red-700">Confidentialité</div>
      </a>
      <a href="/legal/mentions" class="p-4 border border-gray-100 rounded-xl hover:border-red-200 hover:bg-red-50 transition-colors group">
        <div class="text-xs text-gray-400 mb-0.5 group-hover:text-red-400">Information</div>
        <div class="text-sm font-semibold text-gray-900 group-hover:text-red-700">Mentions légales</div>
      </a>
      <a href="/legal/cookies" class="p-4 border border-gray-100 rounded-xl hover:border-red-200 hover:bg-red-50 transition-colors group">
        <div class="text-xs text-gray-400 mb-0.5 group-hover:text-red-400">Données locales</div>
        <div class="text-sm font-semibold text-gray-900 group-hover:text-red-700">Politique cookies</div>
      </a>
    </nav>
  </main>
  ${renderFooter(nomProjet)}
  <script src="/static/js/main.js"></script>
</body>
</html>`
}
