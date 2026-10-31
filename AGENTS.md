# GATE — règles de continuité

- La conversation ChatGPT principale conserve le pilotage technique, les choix d’architecture et le développement.
- L’exécutant agit uniquement sur instructions explicites ; il ne décide pas de nouvelle architecture.
- Aucun merge, déploiement, suppression, modification de secrets ou changement de sécurité sans approbation explicite.
- Les modifications doivent être ciblées et testées avec des contrôles adaptés ; rapporter leurs résultats et limites.
- Distinguer les résultats réellement vérifiés, les preuves rapportées par autrui et les hypothèses. Ne pas inventer de décisions.
- Ne pas toucher aux modifications locales non commitées ; identifier le dépôt et le worktree avant toute écriture.
- Pour une reprise, suivre `docs/continuity/GATE-HANDOFF.md`.
