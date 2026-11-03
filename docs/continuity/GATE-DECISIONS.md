# GATE — décisions confirmées et sources

Les entrées suivantes consignent des règles déjà écrites ou des fusions observées. Elles ne valident pas leur déploiement actuel.

| Décision / règle confirmée | Source | Commit de référence |
| --- | --- | --- |
| Vérificateur d’état d’autorité protocole neutre ; politique métier hors du cœur | docs/ARCHITECTURE.md, docs/RELEASE-BOUNDARY.md | 00f426c8d13a4a595dc3fd72790eb85c30aa649b |
| Distinguer les trois horloges, séquences contiguës, chemins indépendants et UNKNOWN | docs/ARCHITECTURE.md, src/verify-live-authority.mjs | 00f426c8d13a4a595dc3fd72790eb85c30aa649b |
| Ne pas prétendre observer l’état privé non reçu ; limites publiques v7 et promotion RC1 | docs/RELEASE-BOUNDARY.md, docs/SOURCE-FRESHNESS-CONTRACT.md | fichiers présents dans main bf0468ef2f88c8244b3a24a1d6f424a0756695df |
| HOLD expert integration pitch et paid production claims ; gates externes avant GO | docs/PILOT-READINESS-GATES.md | intégration PR #20, 667a14286c9c5ff130bbc34c19ade78100ec7623 |
| Protection des identités confiées au guard MCP et refus des résultats contradictoires | packages/mcp/src/effect-boundary.mjs | main bf0468ef2f88c8244b3a24a1d6f424a0756695df (référence de contenu) |
| Mise à niveau x402/Zod fusionnée | package-lock.json, PR #21 | bf0468ef2f88c8244b3a24a1d6f424a0756695df |
| Stage18 reste en brouillon, sans merge avant validation de sécurité et intégration de production | descriptif PR #16 | tête 28781473dd5c323b11bdb5a10b9001505a4bbbb7, non fusionnée |

Les SHA indiqués comme références de contenu ne sont pas nécessairement les commits d’introduction du fichier. Les fusions #17 à #21 sont détaillées dans CURRENT-STATE.

## Gouvernance historique — remplacée le 2 novembre 2026

Le modèle MISSION 003 (pilote ChatGPT / exécutant local) est historique et remplacé par la directive propriétaire ci-dessous.

## Non-décisions

Aucune décision nouvelle de migration, de déploiement, de changement de sécurité ou de fusion Stage18. La présence d’un prototype, un test vert historique ou un objectif commercial ne constitue pas une approbation. Les niveaux de fraîcheur réellement déployés, la readiness production et l’adoption indépendante exigent encore des preuves.

## Décisions durables — directive propriétaire du 2 novembre 2026

- Cet environnement devient le point principal de développement et pilotage GATE : analyse, code, tests, préparation des PR, validation des packages et suivi des corrections autonomes dans le périmètre autorisé.
- Le propriétaire conserve la validation de toute publication, fusion, déploiement, modification de secret et changement de sécurité. Pas d'approbation déduite d'un test vert.
- Fin du transfert systématique de commandes/résultats entre conversations. Le contexte durable est enregistré dans GitHub par branche/PR ; chaque nouvelle session relit le dossier continuity et revérifie les faits.
- État unique dans GATE-CURRENT-STATE.md ; preuve détaillée par référence. Distinguer disponible, expérimental, rapporté, exécuté et adoption externe.
- Aucun nouveau stage ni fonctionnalité sans besoin utilisateur vérifié. Objectif prioritaire : utilisateurs indépendants et premiers clients payants avant le 19 janvier 2027, sans maquiller les gates.
- Mission 012 établit un parcours interne réel via npm/tools/call/Free/bounded avec émetteur local ; ce n'est pas un utilisateur indépendant ou une source tierce. Le registre GATE-ADOPTION.md conserve cette distinction.

Source de gouvernance : directive propriétaire « Pilotage unifié GATE » dans cette conversation, 2 novembre 2026. La PR conserve ces décisions ; elles ne constituent pas une nouvelle architecture ni une autorisation de publier/fusionner/déployer.
