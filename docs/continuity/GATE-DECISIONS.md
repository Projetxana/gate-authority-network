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

## Instructions de gouvernance de cette mission

ChatGPT principal pilote ; l’exécutant agit sur instructions explicites et demande approbation pour les opérations sensibles listées dans AGENTS.md. Source : instruction utilisateur MISSION 003 ; ce ne sont pas des décisions techniques historiques déduites du code.

## Non-décisions

Aucune décision nouvelle de migration, de déploiement, de changement de sécurité ou de fusion Stage18. La présence d’un prototype, un test vert historique ou un objectif commercial ne constitue pas une approbation. Les niveaux de fraîcheur réellement déployés, la readiness production et l’adoption indépendante exigent encore des preuves.
