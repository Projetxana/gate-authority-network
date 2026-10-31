# GATE — reprise d’une nouvelle conversation

1. Lire `AGENTS.md`, puis `docs/continuity/GATE-CURRENT-STATE.md`, `GATE-DECISIONS.md` et `GATE-NEXT-ACTIONS.md`. Consulter `GATE-ARCHITECTURE.md` et ses sources pour toute question technique.
2. Vérifier sur GitHub le SHA actuel de main et l’état des PR, en particulier #16 et la PR documentaire. Ne pas prendre cet instantané pour l’état courant.
3. Identifier le dépôt, le dossier, la branche et le worktree avec `pwd`, `git remote -v`, `git worktree list --porcelain`, `git status --short` et `git rev-parse HEAD`. Ne pas publier de credentials présents dans une URL distante. Ne pas utiliser ni modifier un worktree contenant des changements locaux non commités ; privilégier le dossier isolé propre approprié.
4. Comparer les changements avec l’inventaire CURRENT-STATE. Conserver tous les fichiers non commités ; ne pas stash, nettoyer, restaurer ou copier ces fichiers sans instruction explicite.
5. Exposer les faits vérifiés, les preuves historiques et les inconnues. Si main a avancé, relire les sources touchées avant de proposer une suite.
6. Proposer la prochaine action ciblée au pilote ChatGPT principal, avec portée et validation attendue. L’exécutant attend une instruction explicite ; aucune nouvelle architecture, fusion, migration ou mise en production implicite.

La continuité repose sur ces fichiers versionnés et une revérification à chaque reprise. Elle ne suppose ni mémoire automatique entre conversations ni surveillance permanente. Après chaque mission autorisée, actualiser les faits pertinents et faire relire la documentation selon le même circuit de branche/PR.
