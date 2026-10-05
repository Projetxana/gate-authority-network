# GATE — Adoption Dashboard

Tableau de suivi public et sans backend pour GATE.

## Données mesurées automatiquement

- Téléchargements npm du SDK sur 7 jours, 30 jours et depuis la publication.
- Téléchargements npm du MCP sur 7 jours, 30 jours et depuis la publication.
- Tendance quotidienne npm sur les 30 derniers jours.
- Statut/version dans l'Official MCP Registry.
- Stars, forks, issues et branche par défaut du dépôt GitHub.

## Ce qui n'est pas encore mesurable

Le tableau **n'invente pas** les métriques suivantes :

- installations uniques ;
- nombre de développeurs uniques ;
- premier `gate.verify()` ;
- nombre de vérifications GATE par jour ;
- clients actifs ;
- usage par client ;
- revenus.

Ces métriques nécessitent l'instrumentation du service GATE (clé/projet + compteur de vérifications).

## Lancer localement

Depuis ce dossier :

```bash
python3 -m http.server 8080
```

Puis ouvrir :

```text
http://localhost:8080
```

## Déploiement Vercel

Ce dossier est statique. Il peut être utilisé directement comme `Root Directory` d'un projet Vercel.

Aucune variable d'environnement n'est nécessaire pour la version publique du dashboard.
