# GATE — reprise du pilotage unifié

1. Lire AGENTS.md puis GATE-CURRENT-STATE.md, GATE-DECISIONS.md, GATE-NEXT-ACTIONS.md et GATE-ADOPTION.md. La directive propriétaire du 2 novembre remplace le modèle pilote ailleurs / exécutant local.
2. Identifier checkout, branche, HEAD, remote, worktrees et statut avant écriture. Préserver les changements d'autrui ; ne pas stash, restaurer, nettoyer ni supprimer un travail existant. Réutiliser un checkout propre approprié ou créer un clone isolé.
3. Revérifier main distant, PR, CI, versions/intégrités npm et Glama si pertinent. Distinguer source main, archive publiée, dist-tag, schéma indexé et version déployée. Ne pas publier pour les rendre artificiellement identiques.
4. Lire le guide et la preuve Mission 012 : interne, émetteur contrôlé. Ne pas recréer de projets pour rafraîchir un rapport sans besoin de validation précis et autorisation.
5. Avancer sur les tâches techniques autorisées ; le propriétaire valide publication, fusion, déploiement, secrets et changements de sécurité. CI verte ne vaut pas approbation. Aucun transfert routinier de commandes entre conversations.
6. Prioriser difficultés des utilisateurs indépendants, registre d'adoption et ticket #10. Aucun nouveau stage/fonctionnalité sans besoin vérifié ; garder PR #16 distincte du produit disponible.
7. Enregistrer résultats et décisions durables par branche/PR GitHub avec source, commit, date et limites. Jamais de secret, JWS complet ou données client privées. La fusion reste au propriétaire.

Architecture : GATE-ARCHITECTURE.md et sources, en tenant compte de leur date historique. Vérifier cette PR de gouvernance avant de supposer les changements intégrés à main. Aucun réveil automatique ou travail hors session configuré par ces documents.
