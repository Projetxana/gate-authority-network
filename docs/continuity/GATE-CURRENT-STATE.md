# GATE — état unique de pilotage

Instantané vérifié le **2 novembre 2026**, America/Toronto. Lire ce fichier avant les rapports historiques. Les liens détaillent les preuves ; ce ne sont pas des états concurrents. Revérifier les services distants à chaque reprise.

## Produit disponible

| Surface | État vérifié | Preuve et limite |
|---|---|---|
| GitHub main | `8eaf31454c2811f4f3dc4350e59f1a78e28d901f` au contrôle | git ls-remote et clone neuf ; [CI](https://github.com/Projetxana/gate-authority-network/actions/runs/41534275815) Node 20, Node 22, Stage 16 : success |
| MCP npm | `@gate-avn/mcp@0.1.0-dev.9` ; dev = dev.9 ; latest = dev.2 | npm view revérifié ; intégrité ci-dessous ; latest ne cible pas la version de cet essai |
| SDK npm | `@gate-avn/sdk@0.1.0-dev.4` | Installé depuis npm en Missions 011 et 012 |
| Free hébergé | DENY → grant signé → ALLOW + 1 effet local → révocation signée → DENY sans nouvel effet | Mission 012, vrai tools/call, bounded, projet neuf, ES256 contrôlé localement ; pas une adoption indépendante |
| Glama | [Fiche publique](https://glama.ai/mcp/servers/Projetxana/gate-authority-network), HTTP 200 ; gate_verify et gate_status ; schéma dev.9 visible | TDQS affichés 4.6 et 4.7/5. README repris encore en dev.8. Score de découverte global et Auto-Release actuels non confirmés |
| Offre | Developer Preview, pas enterprise GA | Politique action/ressource dans l'application ; pas de SLA de fraîcheur amont, multi-région ou atomicité vérification/effet établis |

Intégrité MCP publiée revérifiée :

```text
sha512-sch/WMrOXqlMcUfVxIQHhryvwCvUtrHDn26Ylm8nMBK3tgf/f7O5W60OBQxwjiuFYzv4MkG9rPSNFTzOZ32fJQ==
```

## Travaux et écarts

- Cette PR unifie gouvernance, continuité, preuve Mission 012 et suivi d'adoption, sans modifier le runtime ni publier.
- **Main / npm diffèrent** : dev.9 publiée correspond au candidat fusionné dans `699b4702c98dac8815256b91a2231f2312bd6d52` (PR #23). La PR #24 fusionnée dans main `8eaf314` change les descriptions/schémas de `packages/mcp/bin/gate-mcp.mjs` (40 ajouts / 8 suppressions), sans changer le numéro dev.9. Ne pas assimiler main et archive publiée. Toute nouvelle distribution exige une nouvelle version, ses validations et l'accord propriétaire ; ne pas écraser dev.9.
- glama.json absent de main. Le contrôle actuel ne démontre pas sa nécessité pour un besoin utilisateur ; ne pas modifier automatiquement pour poursuivre un score.
- [PR #16](https://github.com/Projetxana/gate-authority-network/pull/16) : seule PR ouverte au contrôle, brouillon expérimental bounded-work. Interdiction de fusion avant validation de sécurité et intégration de production conservée.
- Réutiliser [#10](https://github.com/Projetxana/gate-authority-network/issues/10) pour adoption/revenus, sans nouveau stage. [#1](https://github.com/Projetxana/gate-authority-network/issues/1) porte l'hypothèse/problème. Aucun commentaire sur ces deux tickets au contrôle. Les anciennes mentions de réplicas dans #1 ne prouvent pas un déploiement.

## Preuves et blocages

- Mission 010 : 137 tests, syntaxe, 34 tests archive consommateur PASS ; deux archives identiques. npm whoami était E401 ; ce blocage historique ne démontre pas l'état actuel des droits. Publication dev.9 désormais constatée, pas exécutée par cette reprise.
- Mission 011 : installation publique isolée, SHA-512 MCP/SDK recalculés, archive MCP identique au candidat, 34 tests PASS, version CLI et démo MCP PASS. Ces résultats historiques sont rapportés depuis cette conversation ; les journaux restent locaux.
- [Mission 012 : guide et preuves versionnées](../validation/mission012/GUIDE.md) : exécution interne PASS le 2 novembre 21:26 America/Toronto. Compteur hébergé total 3 / allow 1 / deny 2 ; marqueur 0 → 1 → 1 ; nettoyage activeIssuers=0. UNKNOWN, HTTP 503, déconnexion, timeout et JSON malformé : fixtures locales via tools/call, zéro effet, pas un UNKNOWN hébergé. Projet et usage restent présents ; clés API/privée non conservées.
- [Gates existantes](../PILOT-READINESS-GATES.md) : HOLD pour promesses de production payante et pitch d'intégration experte. Les preuves récentes complètent les évaluations, sans cocher automatiquement les critères sécurité/runtime/supply-chain et essai indépendant.
- **Blocage prioritaire : aucune preuve d'essai indépendant à froid, d'intégration tierce ou de paiement client dans les éléments examinés.** Cela ne prouve pas une absence universelle d'utilisateurs.

## Prochaines actions et adoption

1. Faire exécuter le guide par un développeur non impliqué dans GATE, sans assistance privée étape par étape. Recueillir erreurs, temps au premier ALLOW et absence de second effet après révocation ; corriger les difficultés observées.
2. Consigner les preuves dans le [registre d'adoption](GATE-ADOPTION.md), relié à #10 : trois essais indépendants, une intégration tierce et 3–5 confirmations crédibles du problème. Une publication ou visite n'est pas une adoption.
3. Clarifier main/npm/Glama avant toute proposition de nouvelle distribution. Aucun changement de tag, publication ou Auto-Release sans validation.
4. Après revue des gates applicables, préparer une offre honnête et obtenir un premier paiement volontaire externe avant le **19 janvier 2027**. Ne compter ni paiement QA ni promesse de readiness production.

Pas d'envoi de contacts externes sans instruction explicite. Le travail technique et son suivi continuent ici sans transfert obligatoire entre conversations. Détails : [actions](GATE-NEXT-ACTIONS.md), [décisions](GATE-DECISIONS.md), [reprise](GATE-HANDOFF.md). L'[inventaire du 30 octobre](GATE-CURRENT-STATE-20261030.md) est historique ; aucun ancien worktree n'a été modifié par cette reprise.
