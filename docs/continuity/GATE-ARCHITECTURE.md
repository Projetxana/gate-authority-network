# GATE — synthèse d’architecture documentée

Référence de lecture : main `bf0468ef2f88c8244b3a24a1d6f424a0756695df`. Synthèse du code et des documents existants, sans nouvelle décision.

## Contrat et effet protégé

`docs/ARCHITECTURE.md`, `docs/EFFECT-BOUNDARY-CONTRACT-V1.md` et `docs/RELEASE-BOUNDARY.md` définissent `gate.verify({principal, actor, action, consistency, maxStalenessMs})`. GATE résout un état d’autorité déléguée ; la politique métier et les permissions action/ressource appartiennent à l’application. Le contrat d’effet est un draft d’intégration, pas une preuve de déploiement universel.

`src/verify-live-authority.mjs` parcourt les chemins principal → acteur (profondeur par défaut 12), rejette les chemins révoqués ou expirés, conserve un chemin valide indépendant et distingue `INVALID / DENY` de `UNKNOWN / DENY`. Le cas principal égal acteur retourne directement ALLOW ; la fraîcheur source est optionnelle (`requireFreshSources=false` par défaut). Ne pas assimiler tout appel à une preuve de fraîcheur amont.

`packages/mcp/src/effect-boundary.mjs` appelle la vérification avant le callback d’effet. Il exige `VALID / ALLOW`, rejette les substitutions d’identités configurées, les résolveurs configurés sans valeur, la dégradation strict → bounded et le relâchement d’un budget de fraîcheur configuré. Sans identité configurée, le serveur doit valider indépendamment les identités de requête. Les erreurs empêchent d’atteindre le callback. La couverture de tous les chemins d’effet et l’absence de course entre vérification et effet restent non vérifiées ici.

## Révocation et fraîcheur

Le modèle RC1 sépare durée de délégation (`not_after`), preuve source (checkpoint signé + séquence contiguë) et fraîcheur de réplica GATE. Le contrôle de cycle de vie des clés est distinct de la validité cryptographique d’une signature. Une source périmée affecte ses chemins ; un chemin indépendant frais peut subsister. Sources : `docs/SOURCE-FRESHNESS-CONTRACT.md`, `docs/SIGNING-KEY-LIFECYCLE.md`, `src/source-freshness.mjs`.

Le plan de contrôle documenté accepte les événements signés et checkpoints, vérifie la confiance et la continuité, met à jour le graphe et produit les bundles de réplication. Le plan de données distingue bounded et strict. Toutefois `docs/RELEASE-BOUNDARY.md` précise que strict sur le réseau public v7 est une lecture du primaire GATE, sans preuve synchrone de fraîcheur externe. La promotion des garanties RC1 hébergées reste soumise aux validations décrites dans ce document.

Un changement privé non transmis par l’émetteur est inobservable ; `issuerCurrentStateIncluded=false` et le reçu v2 ne doivent pas être présentés comme une preuve portable signée ou une connaissance de cet état privé.

## Frontières non vérifiées

`docs/PILOT-READINESS-GATES.md` conserve HOLD pour les sollicitations d’intégration experte et les promesses de production payante. Les preuves hébergées y sont historiques et avec émetteur contrôlé. Aucun SLA de fraîcheur externe, audit indépendant ou enforcement universel n’est établi ici.

La PR #16 est expérimentale : isolation de bounded work, vérification locale et ébauches de stockage/permits. Son descriptif dit que l’autorité de governing work n’est pas encore liée de bout en bout au service hébergé. Ne pas présenter ces travaux non fusionnés comme architecture de production.
