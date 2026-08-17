# API Suppléments Généraux — Guide d'intégration Flutter/Dart

> **Version** : 1.0 — 2026-08-17  
> **Commit** : `a93f158`  
> **Base URL** : `https://monmenu.app/api/v1`

---

## Table des matières

1. [Concept](#1-concept)
2. [Récupérer le menu avec suppléments généraux](#2-récupérer-le-menu-avec-suppléments-généraux)
3. [Modèles Dart](#3-modèles-dart)
4. [Passer une commande avec suppléments généraux](#4-passer-une-commande-avec-suppléments-généraux)
5. [Afficher l'écran de sélection](#5-afficher-lécran-de-sélection)
6. [Gestion de la rétrocompatibilité](#6-gestion-de-la-rétrocompatibilité)
7. [Exemples complets](#7-exemples-complets)

---

## 1. Concept

### Avant (ancien modèle)
Chaque supplément était obligatoirement lié à **un seul produit** (`produit_id NOT NULL`). L'app Flutter devait ouvrir une modal par produit pour proposer ses suppléments.

### Après (nouveau modèle)
Un supplément général appartient au **restaurant entier** (`produit_id = null`). Il peut être proposé sur **n'importe quelle commande**, indépendamment des produits commandés.

### Coexistence des deux modèles
- Les anciens suppléments produit-liés restent dans `produit.supplements[]` (inchangé — rétrocompatibilité totale).
- Les suppléments généraux sont dans `menuData.supplements[]` (nouveau champ additif à la racine).

---

## 2. Récupérer le menu avec suppléments généraux

### Endpoint
```
GET /tenants/{slug}/menu
```

### Réponse JSON (structure)
```json
{
  "categories": [
    {
      "id": "cat-uuid",
      "nom": "Burgers",
      "produits": [
        {
          "id": "prod-uuid",
          "nom": "Classic Burger",
          "prix": 3500,
          "supplements": [
            {
              "id": "sup-uuid-1",
              "nom": "Fromage supplémentaire",
              "prix": 500
            }
          ]
        }
      ]
    }
  ],
  "supplements": [
    {
      "id": "sup-gen-uuid-1",
      "nom": "Sauce piquante",
      "prix": 300,
      "photo_url": "https://monmenu.app/api/v1/dashboard/media/..."
    },
    {
      "id": "sup-gen-uuid-2",
      "nom": "Portion de frites",
      "prix": 800,
      "photo_url": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "count": 3,
    "has_more": false
  }
}
```

> **Note** : Le champ `supplements` à la racine est un **champ additif**. Les clients qui ne le connaissent pas l'ignorent — aucune régression.

---

## 3. Modèles Dart

### `SupplementGeneral`
```dart
class SupplementGeneral {
  final String id;
  final String nom;
  final double prix;
  final String? photoUrl;

  const SupplementGeneral({
    required this.id,
    required this.nom,
    required this.prix,
    this.photoUrl,
  });

  factory SupplementGeneral.fromJson(Map<String, dynamic> json) {
    return SupplementGeneral(
      id: json['id'] as String,
      nom: json['nom'] as String,
      prix: (json['prix'] as num).toDouble(),
      photoUrl: json['photo_url'] as String?,
    );
  }
}
```

### `SupplementProduit` (ancien modèle — inchangé)
```dart
class SupplementProduit {
  final String id;
  final String nom;
  final double prix;

  const SupplementProduit({
    required this.id,
    required this.nom,
    required this.prix,
  });

  factory SupplementProduit.fromJson(Map<String, dynamic> json) {
    return SupplementProduit(
      id: json['id'] as String,
      nom: json['nom'] as String,
      prix: (json['prix'] as num).toDouble(),
    );
  }
}
```

### `MenuData` — parseur complet
```dart
class MenuData {
  final List<Categorie> categories;
  final List<SupplementGeneral> supplements; // NOUVEAU

  const MenuData({
    required this.categories,
    required this.supplements,
  });

  factory MenuData.fromJson(Map<String, dynamic> json) {
    return MenuData(
      categories: (json['categories'] as List<dynamic>? ?? [])
          .map((c) => Categorie.fromJson(c as Map<String, dynamic>))
          .toList(),
      // Champ additif — rétrocompat si absent (ancienne API)
      supplements: (json['supplements'] as List<dynamic>? ?? [])
          .map((s) => SupplementGeneral.fromJson(s as Map<String, dynamic>))
          .toList(),
    );
  }
}
```

---

## 4. Passer une commande avec suppléments généraux

### Endpoint
```
POST /commandes
Content-Type: application/json
```

### Corps de la requête
```json
{
  "tenant_id": "tenant-uuid",
  "point_de_vente_id": "pdv-uuid",
  "client_nom": "Jean Dupont",
  "client_telephone": "+22370000000",
  "mode_paiement": "especes_livraison",
  "mode_livraison": "livraison",
  "idempotency_key": "unique-uuid-par-commande",
  "items": [
    {
      "produit_id": "prod-uuid",
      "quantite": 2,
      "supplement_ids": [
        "sup-gen-uuid-1",
        "sup-gen-uuid-2"
      ]
    }
  ]
}
```

### ⚠️ Règles critiques

| Règle | Détail |
|---|---|
| **supplement_ids uniquement** | N'envoyez **jamais** le prix des suppléments. Le serveur le recalcule depuis la base. |
| **IDs valides** | N'incluez que des IDs de suppléments appartenant au tenant et actifs. |
| **Suppléments généraux ou produit-liés** | Les deux types sont acceptés dans `supplement_ids`. |
| **Max 10 IDs par item** | Limite Zod côté serveur. |

### Modèle Dart pour l'item de commande
```dart
class ItemCommande {
  final String produitId;
  final int quantite;
  final String? varianteId;
  final List<String> supplementIds; // IDs seulement — jamais les prix

  const ItemCommande({
    required this.produitId,
    required this.quantite,
    this.varianteId,
    this.supplementIds = const [],
  });

  Map<String, dynamic> toJson() => {
    'produit_id': produitId,
    'quantite': quantite,
    if (varianteId != null) 'variante_id': varianteId,
    if (supplementIds.isNotEmpty) 'supplement_ids': supplementIds,
  };
}
```

---

## 5. Afficher l'écran de sélection

### Logique recommandée (écran groupé)

L'écran groupé est proposé **avant le checkout**, une seule fois pour toute la commande (vs une modal par produit dans l'ancien modèle).

```dart
/// Vérifie s'il faut proposer l'écran des suppléments généraux
bool doitAfficherEcranSupplements(
  List<SupplementGeneral> supplementsGeneraux,
  List<ItemCommande> panierItems,
) {
  if (supplementsGeneraux.isEmpty) return false;
  
  // Proposer si au moins un item n'a pas encore de supplément général sélectionné
  final itemsSansSupp = panierItems.where((i) => i.supplementIds.isEmpty).length;
  return itemsSansSupp > 0;
}
```

### Widget de sélection (exemple)
```dart
class EcranSupplementsGeneraux extends StatefulWidget {
  final List<SupplementGeneral> supplements;
  final Function(List<String> selectedIds) onConfirm;
  final VoidCallback onSkip;

  const EcranSupplementsGeneraux({
    super.key,
    required this.supplements,
    required this.onConfirm,
    required this.onSkip,
  });

  @override
  State<EcranSupplementsGeneraux> createState() =>
      _EcranSupplementsGenerauxState();
}

class _EcranSupplementsGenerauxState
    extends State<EcranSupplementsGeneraux> {
  final Set<String> _selected = {};

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ajouter des suppléments ?')),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              itemCount: widget.supplements.length,
              itemBuilder: (ctx, i) {
                final sup = widget.supplements[i];
                return CheckboxListTile(
                  value: _selected.contains(sup.id),
                  onChanged: (checked) {
                    setState(() {
                      if (checked == true) {
                        _selected.add(sup.id);
                      } else {
                        _selected.remove(sup.id);
                      }
                    });
                  },
                  title: Text(sup.nom),
                  subtitle: Text('+${sup.prix.toStringAsFixed(0)} FCFA'),
                  secondary: sup.photoUrl != null
                      ? Image.network(
                          sup.photoUrl!,
                          width: 48,
                          height: 48,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) =>
                              const Icon(Icons.fastfood),
                        )
                      : const Icon(Icons.fastfood),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                ElevatedButton(
                  onPressed: () => widget.onConfirm(_selected.toList()),
                  child: const Text('Confirmer et passer la commande'),
                ),
                TextButton(
                  onPressed: widget.onSkip,
                  child: const Text('Passer sans supplément'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
```

---

## 6. Gestion de la rétrocompatibilité

### Scénario 1 — App existante sans mise à jour Flutter

L'app ignore le nouveau champ `menuData.supplements` (Dart ignore les champs JSON inconnus). Aucun crash. Les commandes continuent à fonctionner normalement avec les suppléments produit-liés existants.

### Scénario 2 — App mise à jour avec le nouveau modèle

L'app parse `menuData.supplements` et propose l'écran groupé. Les suppléments produit-liés continuent de fonctionner via `produit.supplements[]`.

### Tableau de compatibilité

| Situation | Ancien Flutter | Nouveau Flutter |
|---|---|---|
| `menuData.supplements` absent (ancienne API) | ✅ Ignore | ✅ `[]` par défaut (`?? []`) |
| `menuData.supplements` présent (nouvelle API) | ✅ Ignore | ✅ Parse et propose écran groupé |
| `produit.supplements[]` | ✅ Fonctionne | ✅ Fonctionne (inchangé) |
| `supplement_ids` dans commande (anciens IDs produit) | ✅ Acceptés | ✅ Acceptés |
| `supplement_ids` dans commande (nouveaux IDs généraux) | N/A (pas connu) | ✅ Acceptés |

---

## 7. Exemples complets

### Exemple A — Commande sans suppléments (comportement inchangé)
```dart
final commande = CommandeRequest(
  tenantId: tenantId,
  pointDeVenteId: pdvId,
  clientNom: 'Marie',
  clientTelephone: '+22370000000',
  modePaiement: 'especes_livraison',
  modeLivraison: 'livraison',
  idempotencyKey: const Uuid().v4(),
  items: [
    ItemCommande(
      produitId: 'prod-uuid',
      quantite: 1,
      // supplementIds vide = aucun supplément
    ),
  ],
);
```

### Exemple B — Commande avec suppléments généraux sélectionnés
```dart
final commande = CommandeRequest(
  tenantId: tenantId,
  pointDeVenteId: pdvId,
  clientNom: 'Paul',
  clientTelephone: '+22370000000',
  modePaiement: 'especes_livraison',
  modeLivraison: 'emporter',
  idempotencyKey: const Uuid().v4(),
  items: [
    ItemCommande(
      produitId: 'prod-uuid',
      quantite: 2,
      supplementIds: [
        'sup-gen-uuid-sauce-piquante',
        'sup-gen-uuid-frites',
      ],
    ),
  ],
);
```

### Exemple C — Flux complet avec écran groupé
```dart
Future<void> passerCommandeAvecSupplements(BuildContext context) async {
  // 1. Charger le menu
  final menuData = await menuRepository.getMenu(tenantSlug);
  
  // 2. Construire le panier
  final panier = cart.items.map((i) => ItemCommande(
    produitId: i.produitId,
    quantite: i.quantite,
    supplementIds: i.supplementIds,
  )).toList();
  
  // 3. Proposer l'écran groupé si nécessaire
  if (doitAfficherEcranSupplements(menuData.supplements, panier)) {
    final selectedIds = await showModalBottomSheet<List<String>>(
      context: context,
      builder: (_) => EcranSupplementsGeneraux(
        supplements: menuData.supplements,
        onConfirm: (ids) => Navigator.pop(context, ids),
        onSkip: () => Navigator.pop(context, <String>[]),
      ),
    );
    
    // Appliquer les suppléments sélectionnés à tous les items sans supp
    if (selectedIds != null && selectedIds.isNotEmpty) {
      for (final item in panier.where((i) => i.supplementIds.isEmpty)) {
        // Logique métier : ajouter les suppléments généraux aux items
        item.supplementIds.addAll(selectedIds);
      }
    }
  }
  
  // 4. Soumettre la commande
  final response = await commandeRepository.creerCommande(panier);
  // ...
}
```

---

## Changelog

| Version | Date | Changement |
|---|---|---|
| 1.0 | 2026-08-17 | Création — suppléments généraux, modèles Dart, écran groupé |

---

*Documentation générée à partir du commit `a93f158` — branche `main`*
