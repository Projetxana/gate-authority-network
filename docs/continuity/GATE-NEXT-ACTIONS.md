# GATE — prochaines actions du pilotage unifié

Référence : [état courant](GATE-CURRENT-STATE.md). Priorité propriétaire : utilisateurs indépendants et premiers clients réellement payants avant le 19 janvier 2027. Ne pas abaisser les gates pour atteindre cette date.

| Priorité | Action autorisée / résultat attendu | Dépendance |
|---|---|---|
| 1 | Faire relire et fusionner la PR de gouvernance ; conserver la preuve Mission 012 | Fusion validée par le propriétaire |
| 2 | Préparer un essai à froid du guide pour un développeur indépendant ; consigner erreurs, premier ALLOW, révocation, retour J7 | Participant indépendant à identifier ; aucun message externe envoyé sans instruction |
| 3 | Corriger les erreurs réellement observées et valider la correction par tests/PR | Besoin utilisateur vérifié ; sécurité soumise au propriétaire |
| 4 | Réconcilier la documentation npm/Glama et l'écart main/archive, sans nouvelle publication implicite | Nouvelle version/publication ou réglage de distribution : validation propriétaire |
| 5 | Réexaminer les gates P0-A à P0-F à partir des preuves récentes ; ne pas transformer QA interne en P0-F | Revue sécurité/runtime et essai indépendant encore nécessaires |
| 6 | Collecter 3–5 confirmations crédibles, trois essais indépendants puis une intégration tierce via #10 | Preuves assainies dans GATE-ADOPTION.md |
| 7 | Préparer une offre limitée conforme à la Developer Preview et obtenir un paiement réel externe | Gates applicables, validation des opérations sensibles et volonté du client |

Ne pas ajouter de fonctionnalité ni stage spéculatif. La PR #16 demeure expérimentale avec son interdiction de fusion ; ne pas déployer ses brouillons SQL. Aucun paiement QA, étoile, téléchargement ou score Glama ne remplace un utilisateur indépendant ou un client.

## Current execution result

The next prioritized onboarding correction is now implemented and tested locally: English no-clone trial, pinned public packages, explicit project-creation opt-in, and sanitized feedback. See GATE-CURRENT-STATE.md and the preflight evidence. Publishing this documentation to GitHub is blocked by the existing automatic Preview trigger pending owner authorization; no new npm release or runtime feature is needed for this correction. An invitation can be prepared but not sent without explicit audience authorization.
