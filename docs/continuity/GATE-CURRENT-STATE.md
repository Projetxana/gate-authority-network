# GATE — état unique de pilotage

Référence actualisée le **5 novembre 2026**. Objectif : premier essai Free indépendant, intégration tierce réelle puis premier paiement volontaire avant le **19 janvier 2027**. Aucune surveillance hors session.

## Produit disponible

Main distant utilisé : `7835dceb6ac3b70c02b4398941000464e4f545ae`, fusion PR #27 sur accord explicite du propriétaire. [Production](https://gate-phi-eosin.vercel.app/) et page Free, guide et feedback HTTP 200 au contrôle ; le lien principal mène au guide sans clone. La session précédente a vérifié CI post-fusion Node20/22/Stage16 et production conforme au merge. Aucune nouvelle fusion ou production autorisée par la présente reprise.

npm confirmé en lecture seule : MCP dev.9 (dev=dev.9, latest=dev.2), SDK dev.4 (dev=dev.4, latest=dev.1). Installation vierge depuis le registre avec lockfile immuable et scripts désactivés : PASS ; CLI dev.9. Ne pas assimiler main, versions publiées, tags et schéma indexé. Les archives ne sont pas republiées.

Santé publique HTTP 200 : maximum de bail actif 900 secondes, 500 inscriptions globales/jour, 3/client/jour. UI/source Free : 50 000 vérifications/mois, un issuer, bounded. Aucun projet neuf créé pour revérifier ses droits. Le parcours hébergé signé DENY → grant → ALLOW/1 → revoke → DENY/1 reste la preuve interne historique [Mission 012](../validation/mission012/GUIDE.md), pas un nouvel essai indépendant.

## Chantier actif : lever les obstacles au premier essai

Branche locale `fix/free-trial-support`, créée depuis ce main ; anciens travaux conservés. Aide courte pour installation, 401/403/429, UNKNOWN/DENY et récupération, liée depuis la page Free et le guide. Elle distingue le refus attendu sans opt-in, les erreurs de transport et les décisions, et avertit qu'une inscription peut réussir malgré une réponse perdue. Aucune boucle d'inscription ou nouvelle clé pour contourner un échec.

[Preuve de session](../validation/FREE-SUPPORT-20261105.json) : trois empreintes du harness vérifiées, installation vierge npm PASS, cinq contrôles réels MCP locaux zéro effet et arrêt sans opt-in code 1 attendu. Onze diagnostics sur SDK/guard publiés contre HTTP loopback PASS, six tests marketing PASS, syntaxe et diff PASS. Les fixtures 401/403/429 testent le comportement client, pas les quotas hébergés. Aucun changement runtime, sécurité, architecture, secrets, prix ou packages. Aide préparée localement, pas publiée ; son lien GitHub main ne sera accessible qu'après fusion approuvée.

## Adoption et revenu

Recherche Gmail ciblée des trois invités : seulement deux messages d'Arjun déjà traités, aucun nouveau résultat, aucune pagination restante. [Ticket adoption #10](https://github.com/Projetxana/gate-authority-network/issues/10) sans commentaire au contrôle. Trois invitations initiales, une revue indépendante offline, **zéro nouvel essai Free indépendant, intégration tierce Free ou paiement client documenté**. Cela ne prouve pas l'absence universelle d'utilisateurs. Reproductions historiques d'interopérabilité distinctes ; tests opérateur, téléchargements et décisions ALLOW ne sont pas adoption.

Offre pilote interne affinée hors Git : un outil non critique, un environnement test appartenant au participant, responsabilités et critères d'arrêt explicites. Le compteur `verified_effects` existant enregistre des décisions avant le callback ; les effets terminés doivent être confirmés et dédupliqués par l'application tierce. Aucun prix, engagement ou facture créé. HOLD pour intégration critique/promesse payante de production ; [gates](../PILOT-READINESS-GATES.md) inchangées.

Cinq nouvelles approches personnalisées préparées hors dépôt, non envoyées. Problèmes publics vérifiés, quatre adresses email publiées et un profil LinkedIn dont l'accès à la messagerie n'est pas confirmé. Pas d'intérêt client inventé. Courrier, coordonnées et brouillons privés restent hors Git.

## Arjun et sécurité

[Discussion #4](https://github.com/arjun2075/a2a-mcp-authority-conformance/issues/4) ouverte, sans nouveau commentaire au contrôle. Les vecteurs externes ont déjà été reproduits inchangés : 53 tests source et 22 cas contre npm, sans service hébergé. Preuves détaillées et profil préparatoire préservés sur la branche locale `review/arjun-vectors-reproduced` ; ce ne sont pas de nouveaux résultats de cette session. Applicabilité credential/chemin non exprimable, exact dispatch non lié et check/effect non atomique : aucune garantie nouvelle ou modification d'architecture. Aucun nouvel email/commentaire envoyé.

## Prochaine action

Faire examiner le seul lot d'aide Free avant tout push/PR/Preview, puis vérifier les liens après publication autorisée. Ne pas relancer les trois invités. Les nouveaux messages et l'offre commerciale restent des brouillons nécessitant une approbation distincte avant envoi. Les échanges techniques ne doivent pas retarder le premier essai réel.


## Conservation de continuité avant fusion de #28

Le propriétaire autorise la fusion de #28 et sa production automatique seulement après contrôle des neuf fichiers, conservation des informations nécessaires et CI verte. Cette vérification ne modifie ni runtime ni garanties. Le développement documentaire non indispensable s'arrête après ce lot ; priorité au premier essai Free indépendant.

Les références précédentes sont conservées intégralement ci-dessous, sans les présenter comme un nouveau contrôle. Cela préserve notamment l'origine du candidat npm, son intégrité, l'écart main/archive, Glama, les Missions 010/011 et les anciennes autorisations. [Version source immuable avant cette PR](https://github.com/Projetxana/gate-authority-network/blob/7835dceb6ac3b70c02b4398941000464e4f545ae/docs/continuity/GATE-CURRENT-STATE.md). Les chiffres, dates, versions de main et états de PR de l'archive sont historiques ; les résultats courants sont ceux du début de ce document et des reçus datés.

<details>
<summary>État antérieur intégral — instantané du 2 novembre, complété jusqu'à la fusion #25</summary>

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

## Local follow-up — independent-trial onboarding

The next authorized task fixes a verified acquisition obstacle: the README consumed by Glama still advertised dev.8 and a repository-dependent trial, while the real npm trial uses dev.9. The local branch `docs/free-mcp-independent-trial` adds an English [no-clone guide](../FREE-MCP-TRIAL.md), an optional sanitized [feedback form](../adoption/FREE-MCP-TRIAL-FEEDBACK.md), explicit npm pins in the repository README and a correction of the historical unpublished-candidate claim. Package files and security/runtime code are unchanged.

[Fresh internal preflight](../validation/COLD-TRIAL-PREFLIGHT-20261102.json): public immutable harness download and hashes, npm ci, CLI dev.9, five local MCP probes and 34 npm-consumer security tests PASS. Without the creation opt-in the runner refuses with exit 1, as expected; no new hosted project was created. Repository 137 tests and syntax PASS. This is operator QA, not an independent trial.

PR #25 is confirmed MERGED on 2026-11-03 at 02:47:29 UTC (November 2 America/Toronto); current remote main is e437c58f7d99a838691b842ecc8ec288bd5ef3b7. The owner explicitly authorized sending docs/free-mcp-independent-trial with its automatic Vercel Preview. This authorization does not include merging this follow-up or promoting it to production. Existing hosting settings are unchanged. A genuinely independent participant is still needed; sending an invitation requires explicit recipient/audience authorization.

</details>
