# GATE — prochaines actions proposées au pilotage

Priorité imposée par la mission 003 : adoption, validations indépendantes, pilotes, puis premiers clients réellement payants avant le **19 janvier 2027**. C’est un objectif, pas une promesse de disponibilité ou une autorisation de contourner les gates.

1. Faire vérifier l’état des gates P0-A à P0-F dans `docs/PILOT-READINESS-GATES.md`. Les fusions #20/#21 ne ferment pas automatiquement ces gates. Confirmer onboarding, versions publiées, sécurité, runtime/confiance et supply chain avec preuves datées.
2. Obtenir un essai à froid sans aide privée par un développeur indépendant : installation, temps au premier ALLOW, vrai effet MCP protégé, révocation puis absence de second effet, UNKNOWN bloqué. Séparer les émetteurs de fixture, contrôlés et indépendants.
3. Recueillir 3–5 confirmations techniques externes du problème, selon `docs/PUBLIC-VALIDATION-PLAN.md`, puis les trois premiers pilotes selon `docs/LAUNCH-PILOT-PLAN.md`. Documenter objections, latence observée et retour à J7 ; ne pas compter l’usage interne comme adoption.
4. Après validation des gates applicables, faire piloter une offre payante explicite, avec preuve de paiement réel volontaire rattaché à un projet externe et continuité des droits/métriques vérifiée. Aucun auto-paiement QA compté comme revenu client. Viser les premiers clients payants avant le 19 janvier 2027 ; maintenir HOLD des promesses de production tant que les preuves manquent.

Les prises de contact, paiements, changements de sécurité et déploiements ne sont pas autorisés par cette liste. Proposer une action concrète au pilote de la conversation principale avant exécution.

## Voie expérimentale séparée — Stage18

PR #16 / `feat/oauth-bounded-work-probe-v1` reste non fusionnée. Les probes, vérificateurs locaux, ébauches SQL et permits de bounded work ne doivent pas bloquer ni être confondus avec les preuves d’adoption du Developer Preview existant. Toute suite exige instruction explicite, revue de sécurité et preuves de bout en bout. Ne pas appliquer les brouillons SQL, ne pas transférer les fichiers non suivis et ne pas promouvoir la PR automatiquement.
