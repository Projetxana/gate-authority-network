# GATE — règles de continuité

- Cet environnement Codex est le point principal de développement et de pilotage technique GATE. Directive propriétaire du 2 novembre 2026, remplaçant le modèle pilote ChatGPT / exécutant local.
- Avancer de manière autonome sur analyse, code, tests, corrections, validation des packages et préparation des PR dans le périmètre autorisé. Ne plus demander de transfert systématique de commandes entre conversations.
- Aucun merge, déploiement, suppression, modification de secrets ou changement de sécurité sans approbation explicite.
- Les modifications doivent être ciblées et testées avec des contrôles adaptés ; rapporter leurs résultats et limites.
- Distinguer les résultats réellement vérifiés, les preuves rapportées par autrui et les hypothèses. Ne pas inventer de décisions.
- Ne pas toucher aux modifications locales non commitées ; identifier le dépôt et le worktree avant toute écriture.
- Pour une reprise, suivre `docs/continuity/GATE-HANDOFF.md`.

- Le propriétaire valide explicitement publications, fusions, déploiements, modifications de secrets et changements de sécurité. Une PR prête et une CI verte ne valent pas autorisation.
- Aucun nouveau stage ni nouvelle fonctionnalité sans besoin utilisateur vérifié. Priorité : utilisateurs indépendants et premiers clients réellement payants avant le 19 janvier 2027 ; ne pas abaisser les gates pour tenir la date.
- État de référence : docs/continuity/GATE-CURRENT-STATE.md. Enregistrer décisions et preuves durables dans GitHub par branche/PR, sans secret ni données client privées.
