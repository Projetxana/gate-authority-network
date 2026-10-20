# GATE — Consolidation du Stage 18

**Date : 19 octobre 2026**  
**Statut : spécification de reprise / non fusionnée / non déployée**  
**Base de référence :** [`Projetxana/gate-authority-network` `main` `bf61d2c636`](https://github.com/Projetxana/gate-authority-network/commit/bf61d2c63648c86b0a630ade2eb3b16b0a46d6aa)  
**Contrat commercial :** [Stage 18 — Adoption & Revenue Proof (#10)](https://github.com/Projetxana/gate-authority-network/issues/10)

## Décision de direction

**Conserver Stage 18.** La veille du 18 octobre apporte une priorité de sécurité *dans* le Stage 18, et ne justifie pas un Stage 19 ni une réécriture de GATE. Priorité : prouver qu'une autorisation gouvernant Work B ne peut pas autoriser un effet demandé pour Work A après révocation de ce dernier. Ensuite seulement, rendre l'intégration reproductible, la distribution cohérente et l'adoption mesurable.

Les correctifs préparés les 15, 16 et 19 octobre ne doivent pas être considérés comme fusionnés : l'état public de `main` n'a pas changé depuis le 14 octobre.

## 1. Relecture des parutions du 17 octobre 2026

| Source primaire | Niveau de maturité | Ce que GATE doit en déduire |
|---|---|---|
| [OAuth 2.0 Bounded Work Authorization -00](https://datatracker.ietf.org/doc/draft-liu-mcguinness-oauth-bounded-work/) | Internet-Draft individuel, daté 2026-10-17, **sans wire format normatif** | Associer l'effet à l'autorisation gouvernant **ce travail précis**, à ses limites et à son état courant ; l'approbation passée ne vaut pas autorité présente. |
| [ZTIP — Zero Trust Intelligence Protocol -01](https://datatracker.ietf.org/doc/draft-mccormack-ztip/01/) | Internet-Draft individuel, daté 2026-10-17 | Séparer autorisation, effet rapporté et exécution **indépendamment vérifiée** ; ne pas présenter une simple attestation de l'exécutant comme une confirmation indépendante. |
| [Agent-initiated payment gating -01](https://datatracker.ietf.org/doc/draft-king-yew-choo-agentic-payments/01/) | Internet-Draft individuel, octobre 2026 | Composer autorité de dépense, HTTP 402, preuve de paiement et exécution sans confondre ces différentes décisions. |
| [MCP 2026-07-28 — Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) | Spécification publiée | Éviter de traiter un token MCP ou une session comme preuve d'autorité déléguée courante. Mettre le contrôle au serveur d'outils / passerelle, juste avant l'effet. |

**Précaution :** ni l'adoption par l'IETF de ces Internet-Drafts, ni la conformité de GATE à leurs formats ne sont démontrées. L'identifiant `oauth-bounded-work` ci-dessous serait une convention expérimentale GATE, pas un champ OAuth standard.

## 2. Constat technique sur la branche publique

Inspection en lecture seule des fichiers suivants :

- `packages/sdk/src/index.ts` : `VerifyRequest` contient `principal`, `actor`, `action`, `consistency`, `maxStalenessMs`, mais **pas `authorityContext`**.
- `supabase/functions/gate-network/index.ts` : la vérification traverse les chemins `principal → actor` et sélectionne un chemin actif ; le contexte du **travail gouvernant** n'entre pas dans `verifyGraph`. La fonction d'ingestion d'événements signés ne transmet pas de liaison de travail au RPC.
- `src/verify-live-authority.mjs` : la référence locale applique également un parcours de graphe générique. Le raccourci `principal === actor` nécessite un contrôle supplémentaire dès qu'un travail précis est demandé.
- `src/authority-receipt.mjs` : le receipt v2 enregistre chemins et fraîcheur, pas la liaison avec une autorisation gouvernante de travail.
- `packages/mcp/src/effect-boundary.mjs` : le garde MCP doit transporter et imposer cette liaison à la frontière d'effet réelle.

Il s'agit d'un **écart statique confirmé de capacité et d'assurance**, non d'une preuve qu'une collision Work A / Work B s'est effectivement produite en production. La preuve live doit encore être capturée.

## 3. P0 — Probe de collision OAuth Bounded Work

Travaux décidés à la suite de la veille, mais non présents dans le `main` public examiné :

- `docs/OAUTH-BOUNDED-WORK-INTEROP.md`
- `scripts/run-live-oauth-bounded-work-collision.mjs`
- `npm run smoke:oauth:bounded-work-collision`

**Fixture :** deux autorisations distinctes, A et B, pour le même principal, le même agent, et le même effet cible. Les deux sont initialement actives ; A est révoquée, B reste valide.

1. Vérifier A avant révocation → autorisation possible uniquement si A est active et dans sa portée.
2. Vérifier A après révocation tandis que B reste active → **INVALID / DENY** si la révocation est attestée et reçue.
3. Vérifier B après révocation de A → **VALID / ALLOW**, si B reste suffisamment fraîche et dans la portée.
4. Source de A inaccessible / evidence stale → **UNKNOWN / DENY**, même si B est active.
5. Deux chemins alternatifs indépendants pour **A** → un chemin A frais et valide peut préserver ALLOW, sauf révocation de l'autorisation gouvernante A elle-même.
6. Résultat `DENY` → **zéro effet protégé**, et aucun incrément de compteur d'effets confirmés.

Exécuter d'abord un fixture local puis un smoke test en réseau réel avec projet Free jetable et source signée contrôlée, sans paiement ni effet irréversible. Enregistrer commit, environnement, requête, décision, provenance et horodatage exact ; ne pas appeler « interopérabilité tierce » un test avec notre propre source.

## 4. P0 — Correction du contrat d'autorité

Structure de requête candidate (GATE expérimentale) :

```json
{
  "principal": "user:alice",
  "actor": "agent:worker",
  "action": {
    "protocol": "mcp",
    "name": "tools/call",
    "resource": "resource:invoice"
  },
  "authorityContext": {
    "kind": "oauth-bounded-work",
    "id": "opaque-governing-authorization-id"
  }
}
```

**Chaîne obligatoire :** SDK → événement de source d'autorité **signé** → ingestion et validation → persistance canonique / migrations → résolveur → garde d'effet HTTP/MCP → reçu et provenance.

Exigences de sécurité :

- `id` doit être résolu dans un espace tenant + issuer fiable, lié à une autorisation gouvernante **authentifiée**, avec principal, acteur, opération, cible, contraintes, expiration et statut de révocation. Le simple paramètre fourni par le client ne prouve rien.
- L'événement signé doit attester explicitement l'association work/source/portée. Validation de signature, audience, issuer de confiance, séquence et fraîcheur ; refus de replay, spoofing et substitution de work ID.
- Le filtrage par **même travail demandé** doit précéder la sélection de chemins alternatifs. Work B ne peut jamais sauver Work A révoqué.
- Une autorisation gouvernante A révoquée annule **tous ses chemins**, même si certaines arêtes restent actives ; un chemin alternatif d'A n'est valable que si A demeure gouvernante active.
- Le mode legacy sans `authorityContext` doit rester explicitement limité à une vérification de **chemin générique**, jamais présenté comme une autorisation de travail précise.
- Rejeter les décalages de portée (action, ressource, montant, devise si paiement). La portée n'est pas contrôlée seulement dans le front-end ou le SDK.
- **INVALID / DENY** pour une révocation connue ; **UNKNOWN / DENY** pour preuve absente, périmée ou non vérifiable ; **VALID / ALLOW** seulement après vérification positive et suffisamment fraîche.
- Aucune promesse d'immédiateté globale sans budget de fraîcheur externe prouvé. Examiner la fenêtre `verify → effect` (TOCTOU), le point de contrôle effectif et l'idempotence.
- Contrôle explicite du cas `principal === actor` en mode travail gouvernant pour interdire un faux ALLOW automatique.
- Receipt : porter l'identifiant contextualisé fiable, sa provenance, les contrôles réellement effectués et les limites de fraîcheur ; ne pas prétendre connaître l'état distant non observé.

**Gate de publication :** la sémantique work-scoped ne sera annoncée qu'une fois tests négatifs et positifs, migrations, smoke réel et vérification des reçus concluants. Aucun changement silencieux en production.

## 5. P0 — La veille du 15 octobre reste prioritaire

Livrables identifiés comme **préparés hors production** :

- `GATE-Day1-2026-10-15.patch` : parcours réel source signée → effet contrôlé → révocation visible + instrumentation.
- `GATE-Adoption-2026-10-16-refunds.patch` : événements Stripe `payment_refunded` dédupliqués ; revenu net.
- `GATE-Adoption-2026-10-19-distribution-guard.patch` : vérifications `distribution:check` et `distribution:check:live` sur npm, MCP Registry, docs et versions.

Ces patchs doivent être **inspectés, réconciliés, testés et fusionnés**, pas réappliqués aveuglément. Côté distribution lors du dernier contrôle : SDK npm `0.1.0-dev.3` versus repo `0.1.0-dev.4` ; MCP npm/registre `0.1.0-dev.5` versus repo `0.1.0-dev.8`. Ne promettre aucune API de `dev.8` comme installable depuis npm tant que la release réelle n'est pas publiée et vérifiée.

**Premier parcours produit à livrer :** package réellement publié → projet Free live → source tierce signée → premier `ALLOW` contrôlé → effet protégé → révocation visible avec statut et fraîcheur honnêtes → réutilisation J7. C'est le pont entre validation technique et adoption.

Le Supabase GATE précédemment observé comme inactif rendait la télémétrie de production inaccessible. **Inconnu n'est pas zéro.** Aucune mesure de revenus/activation ne peut être affirmée sans données fiables.

## 6. P1 — ZTIP et HTTP 402, sans dispersion

**ZTIP :** faire évoluer nos rapports pour séparer `authorized`, `effect_reported`, `effect_independently_confirmed`, et `verification_unavailable_or_failed`. Le receipt d'autorité ne devient pas magiquement une preuve d'effet. Implémenter un vrai vérificateur indépendant seulement lorsqu'un premier client/use case le justifie. Aucune revendication de conformité ZTIP.

**HTTP 402 :** conserver l'idée `gate.enforcePayment()` comme façade **future** et indépendante des rails. Chaîne de décisions : autorité déléguée/mandat valide → challenge 402 → preuve de paiement valide → **revalidation du travail avant effet** → effet idempotent → confirmation / remboursement si nécessaire. Éviter doubles débits en retry. Priorité après la correction Bounded Work et le premier vrai parcours client.

**MCP/A2A/AP2/AuthZEN/WIMSE/CAEP :** maintenir les adaptateurs existants et continuer les veilles ; ne pas créer de nouveaux connecteurs avant demande observable. GATE ne remplace ni IdP, ni OAuth, ni policy engine, ni passerelle ; il fournit de l'état d'autorité courant aux points d'application.

## 7. Critères Stage 18 intacts

Conformément à [l'issue #10](https://github.com/Projetxana/gate-authority-network/issues/10) :

- [ ] Trois développeurs **indépendants** terminent l'onboarding sans accompagnement pas à pas.
- [ ] Une intégration tierce appelle `gate.verify()` au véritable point d'effet.
- [ ] Une source d'autorité tierce indépendante émet de l'état live vers GATE.
- [ ] Une transaction payante GATE volontaire, réelle et confirmée.
- [ ] `Verified Effects/day` est instrumenté, avec séparation tentatives, décisions, effets rapportés et effets confirmés.

Cible additionnelle du challenge au **19 janvier 2027** : trois clients payants. Cible, pas constat. Mesurer aussi activation, rétention J7/J30, remboursements, coût marginal et revenu net.

## 8. Ordre d'exécution proposé

| Priorité | Travail | Condition de passage |
|---|---|---|
| P0-A | Écrire le fixture de collision Work A/B et capturer le comportement actuel | Reproductible, preuve et environnement archivés |
| P0-B | Revoir le schéma de provenance et coder le contrat de work binding avec tests | A révoqué ⇒ A DENY, B reste possible ; variantes UNKNOWN et fraude passent |
| P0-C | Réconcilier les patchs d'adoption et publication préparés | Tests CI + packaging + versions npm/MCP identiques aux promesses publiques |
| P0-D | Smoke live non destructif : vraie source signée, effet, révocation, métrique | Aucun ALLOW trompeur ni faux effet confirmé ; rollback établi |
| P0-E | Tester l'acquisition indépendante et une transaction réellement payante | Critères objectifs Stage 18, chiffres vérifiables |
| P1 | Rapport d'effet indépendant puis façade paiement selon demande | Cas d'usage commercial identifié ; zéro promesse prématurée |

**Règle de coaching :** toute nouveauté issue d'une veille reçoit un classement `bloque sécurité / débloque adoption / validé par un client / à surveiller`. Seuls les deux premiers sont automatiquement candidats au sprint en cours.

## Ce qui est fait / pas fait

**Fait :** relecture des parutions officielles ci-dessus ; inspection statique des fichiers publics ; diagnostic du gap de work binding ; plan et tests d'acceptation documentés.  
**Non fait :** probe live, patch de production, migrations, CI locale du nouveau correctif, publication npm/MCP, fusion des correctifs d'adoption, réactivation de Supabase, preuve d'adoption indépendante ou paiement réel.  
**Blocage dépôt :** la connexion GitHub permet la lecture mais la tentative de création d'une branche a répondu `403 Resource not accessible by integration`. Ce document est donc livré hors dépôt pour revue et intégration.
