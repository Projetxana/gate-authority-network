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
