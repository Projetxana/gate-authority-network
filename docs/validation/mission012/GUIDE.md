# Mission 012 — Parcours GATE Free réel depuis npm

Ce guide et son exécutable compagnon `validate-free.mjs` suffisent ; aucun clone GATE ni archive npm locale n'est nécessaire. Le kit contient aussi le manifeste npm, son lockfile et le rapport de la première exécution. Ne pas utiliser le rapport fourni comme preuve de votre propre exécution.

## Résultat réellement obtenu

Exécution le 2 novembre 2026, de 21:26:36 à 21:26:40 America/Toronto (horodatages UTC dans `report.json`). Node v24.21.0, npm 11.21.0. Installation depuis registry.npmjs.org : MCP 0.1.0-dev.9 et SDK 0.1.0-dev.4. Installation et validation : codes de sortie 0.

| Étape | Résultat | Effets locaux cumulés |
|---|---|---:|
| Nouveau projet Free, aucun émetteur actif | PASS | 0 |
| Vrai MCP tools/call, avant grant, réseau hébergé | INVALID / DENY — PASS | 0 |
| Enregistrement de la JWK publique ES256, grant ACTIVE signé accepté | PASS | 0 |
| Vrai MCP tools/call, réseau hébergé, bounded | VALID / ALLOW — PASS | 1 |
| Révocation REVOKED signée acceptée | PASS | 1 |
| Vrai MCP tools/call après révocation | INVALID / DENY — PASS | 1 |
| Compteur de décisions hébergées | total 3, allow 1, deny 2 — PASS | 1 |
| Révocation de la confiance de l'émetteur et GET /v1/project | activeIssuers = 0 — PASS | 1 |

Cinq contrôles additionnels passent, chacun via un vrai `tools/call`, avec zéro effet : UNKNOWN/DENY synthétique ; HTTP 503 local ; déconnexion locale ; expiration du délai SDK ; JSON malformé local. Les quatre cas réseau font chacun une requête HTTP réelle sur 127.0.0.1. Ils ne sont pas des erreurs provoquées sur le service GATE hébergé. UNKNOWN est injecté dans une fixture locale ; cette exécution n'établit pas la production d'UNKNOWN par le réseau hébergé. Pour les erreurs de transport, le handler MCP applique le refus et retourne UNKNOWN/DENY ; le SDK lève une erreur plutôt que de fabriquer une décision serveur.

L'empreinte anonymisée du projet de cette exécution est `1f8fa40ca802d969`. Le fichier `disposable-effect.log` contient exactement une ligne. Les compteurs de décisions du guard ne sont pas un compteur de mutations exécutées : le nombre de lignes du marqueur est vérifié séparément.

## Prérequis et portée de l'autorisation

- Node.js 20+ et npm, réseau HTTPS vers npm et l'endpoint officiel GATE, possibilité de lancer un serveur local sur 127.0.0.1.
- Autorisation de créer UN nouveau projet de test Free jetable, d'y enregistrer une clé publique, de soumettre deux événements signés puis de révoquer cet émetteur. Le script ne lit ni ne réutilise une clé de projet existant.
- Ce parcours consomme des vérifications Free et une inscription de projet limitée par IP. Aucun paiement ni checkout. Ne pas lancer des boucles de création.
- Le projet est jetable mais pas supprimé : les enregistrements, la clé de projet émise côté service et l'usage peuvent rester. Le nettoyage vérifié concerne la confiance de l'émetteur. Aucun endpoint de suppression de projet n'est supposé.

## Démarrage depuis une installation vierge

Décompresser le kit dans un dossier, ouvrir un terminal dans ce dossier, puis :

```sh
node --version
npm --version
GATE_MISSION012_KIT="$PWD"
GATE_MISSION012_RUN="$(mktemp -d /tmp/gate-free-mission012.XXXXXX)"
cp "$GATE_MISSION012_KIT/package.json" "$GATE_MISSION012_KIT/package-lock.json" "$GATE_MISSION012_KIT/validate-free.mjs" "$GATE_MISSION012_RUN/"
cd "$GATE_MISSION012_RUN"
umask 077
touch empty-user.npmrc empty-global.npmrc
npm ci --ignore-scripts --no-audit --no-fund \
  --registry https://registry.npmjs.org/ \
  --userconfig ./empty-user.npmrc --globalconfig ./empty-global.npmrc \
  --cache "$GATE_MISSION012_RUN/npm-cache"
node --check validate-free.mjs
node validate-free.mjs --create-disposable-project
```

Le lockfile épingle les versions et leurs intégrités npm ; les archives sont téléchargées depuis le registre, pas depuis le kit. Aucun npm login n'est nécessaire pour ces packages publics. Les deux fichiers npmrc vides sont propres au dossier de test : ils ne modifient aucune configuration existante. Ne fournir aucun secret dans la commande. Ne pas activer de trace détaillée, de capture des échanges réseau ou de dump mémoire.

Une installation sans lockfile est également possible avec `npm install --save-exact --ignore-scripts --no-audit --no-fund @gate-avn/mcp@0.1.0-dev.9 @gate-avn/sdk@0.1.0-dev.4`, en conservant les mêmes options de registre et de configuration isolée. C'est cette installation qui a été exécutée pour le rapport fourni.

## Ce que fait le programme

1. Vérifie les versions des packages installés. Démarre un serveur MCP enfant et effectue l'initialisation JSON-RPC, puis des requêtes `tools/call` sur stdio. Les fixtures UNKNOWN et réseau sont exécutées avant toute création de projet.
2. Crée un projet exclusivement avec `POST https://ufqtoyakmrddqytrkcje.supabase.co/functions/v1/gate-network/projects/register`. Vérifie `plan: free` et `activeIssuers: 0` avec `/v1/project`.
3. Génère localement une paire P-256 ; seule la JWK publique ES256 est enregistrée. La clé privée n'est ni exportée ni écrite. La clé API reçue reste en mémoire et passe au processus MCP par un pipe privé hérité, jamais dans les arguments, variables d'environnement ou outils MCP.
4. Le serveur utilise `GateClient` du SDK npm et `createMcpEffectGuard` du MCP npm avec des identités fixées côté serveur et `consistency: bounded`. Le seul effet autorisé ajoute une ligne à un fichier local jetable.
5. Envoie des événements JWS ES256 ACTIVE puis REVOKED, avec audience de ce seul projet, séquences 1 puis 2, identifiants uniques et un grant limité à 120 secondes. Aucune clé ni JWS n'apparaît dans le rapport.
6. Vérifie les trois décisions et le marqueur : 0 → 1 → 1. Le handler bloque aussi les erreurs de vérification. Les redirections des appels avec bearer sont interdites.
7. Dans le nettoyage, révoque uniquement l'émetteur de cette exécution via `/v1/issuers/revoke`, puis contrôle `activeIssuers: 0`. Au maximum trois tentatives de nettoyage, aucune boucle de création de projet. Ferme les processus MCP et les serveurs locaux.

## Lire les preuves et traiter les échecs

`report.json` contient les vérifications horodatées, leur portée, les compteurs et l'état du nettoyage. Il ne contient pas de bearer ni de clé privée. `disposable-effect.log` contient seulement `authorized-test-effect`. Le programme termine avec code 0 uniquement si tous ses contrôles et le nettoyage passent ; sinon code 1 et motif assaini.

- HTTP 401/403 : arrêt ; ne pas utiliser une clé client pour contourner l'échec.
- HTTP 429 : arrêt ; ne pas changer d'IP, de compte ni lancer une boucle de tentatives.
- Connexion ou TLS impossible : arrêt ; ne pas désactiver TLS ni changer d'endpoint pour transmettre le bearer.
- Échec du nettoyage : statut FAIL dans le rapport, avec les seuls identifiants publics de l'émetteur. Ne pas présenter le test comme PASS ; faire traiter ce projet jetable par un opérateur autorisé. Ne pas employer un secret existant pour contourner le problème.
- Interruption brutale du processus : le nettoyage n'est pas garanti. Le grant expire au bout de 120 secondes, ce qui ne remplace pas la révocation de confiance. Ne pas interrompre volontairement la phase de nettoyage.
- Pour répéter, créer un NOUVEAU dossier temporaire ; le script refuse un marqueur préexistant. Répéter n'est pas nécessaire après un PASS.

## Limites de la preuve

PASS interne sur un vrai réseau Free, avec un émetteur de test contrôlé localement et un vrai transport MCP. Aucun émetteur tiers indépendant, effet métier, client payant, adoption externe, SLA, fraîcheur indépendante, garantie atomique entre vérification et effet, ni permit Stage 18 n'est établi. Aucun package publié, déploiement, merge ou changement de secret existant n'est effectué par ce kit.
