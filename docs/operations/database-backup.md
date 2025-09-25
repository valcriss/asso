# Sauvegardes PostgreSQL & Procédures de Restauration

Ce document décrit la stratégie de sauvegarde et de restauration de la base de données PostgreSQL de l'application Association Management. Il couvre l'automatisation avec **pgBackRest** et **WAL-G**, la configuration du stockage S3 ainsi qu'un exercice trimestriel de restauration vers l'environnement *staging*.

## 1. Stratégie de sauvegarde

- **PITR** activé via archivage WAL (pgBackRest ou WAL-G).
- **Sauvegarde complète quotidienne** (ou différentielle/incrémentale selon le moteur) avec conservation de 30 jours.
- **Stockage S3** avec versioning et politiques de cycle de vie (90 jours en *Standard-IA*, 365 jours en *Deep Archive*).
- **Test de restauration trimestriel** obligatoire sur *staging*.

## 2. Scripts d'automatisation

Les scripts sont situés dans `ops/backups/` et sont conçus pour être invoqués depuis des jobs cron ou un orchestrateur (GitHub Actions, Jenkins, etc.).

### 2.1. Sauvegarde pgBackRest

Script : `ops/backups/pgbackrest_backup.sh`

```bash
# Export des variables de connexion PostgreSQL et S3
export PGHOST=db.internal
export PGPORT=5432
export PGUSER=postgres
export PGPASSWORD=***
export PG_BACKREST_STANZA=asso
export PG_BACKREST_CONFIG=/etc/pgbackrest/pgbackrest.conf

# Lancement de la sauvegarde (type automatique)
/opt/asso/ops/backups/pgbackrest_backup.sh
```

Configuration pgBackRest minimale pour la rétention 30 jours :

```ini
[global]
repo1-type=s3
repo1-s3-bucket=asso-prod-backups
repo1-path=/pgbackrest
repo1-retention-full-type=time
repo1-retention-full=30
repo1-retention-archive-type=time
repo1-retention-archive=30
process-max=4

[asso]
pg1-path=/var/lib/postgresql/data
```

Cron quotidien (02:15 UTC) :

```
15 2 * * * /opt/asso/ops/backups/pgbackrest_backup.sh >> /var/log/pgbackrest_cron.log 2>&1
```

### 2.2. Sauvegarde WAL-G

Script : `ops/backups/wal_g_backup.sh`

```bash
export PGHOST=db.internal
export PGPORT=5432
export PGUSER=postgres
export PGPASSWORD=***
export PGDATA=/var/lib/postgresql/data
export WALG_S3_PREFIX=s3://asso-prod-backups/postgres

/opt/asso/ops/backups/wal_g_backup.sh
```

Le script déclenche `wal-g backup-push` puis supprime les sauvegardes vieilles de plus de 30 jours (`wal-g delete before --confirm`). Planifier l'exécution quotidienne :

```
45 2 * * * /opt/asso/ops/backups/wal_g_backup.sh >> /var/log/wal_g_cron.log 2>&1
```

### 2.3. Configuration S3 (versioning + lifecycle)

Script : `ops/backups/configure_s3.sh`

```bash
export BUCKET_NAME=asso-prod-backups
export REGION=eu-west-3

/opt/asso/ops/backups/configure_s3.sh
```

Le script :

1. Crée le bucket si besoin.
2. Active le **versioning**.
3. Applique une politique de cycle de vie :
   - Passage en **STANDARD_IA** après 90 jours.
   - Passage en **DEEP_ARCHIVE** après 365 jours.
   - Versions obsolètes déplacées en **DEEP_ARCHIVE** après 90 jours.

## 3. Test de restauration trimestriel (staging)

Script : `ops/backups/quarterly_restore_test.sh`

```bash
export RESTORE_TOOL=pgbackrest
export STAGING_PGDATA=/var/lib/postgresql/staging
export STAGING_CONNECTION_URI=postgresql://staging_user:***@staging-db.internal:5432/app
export PG_BACKREST_STANZA=asso
export PG_BACKREST_CONFIG=/etc/pgbackrest/pgbackrest.conf

/opt/asso/ops/backups/quarterly_restore_test.sh
```

Par défaut le script :

1. Purge et recrée le répertoire de données staging.
2. Restaure la dernière sauvegarde (pgBackRest ou WAL-G selon `RESTORE_TOOL`).
3. Exécute une requête de *smoke test* (`SELECT count(*) FROM pg_catalog.pg_tables;`).
4. Journalise le succès dans `/var/log/asso_restore_audit.log`.

Cron trimestriel (premier dimanche des trimestres à 02:00 UTC) :

```
0 2 1 JAN,APR,JUL,OCT * /opt/asso/ops/backups/quarterly_restore_test.sh >> /var/log/asso_restore.log 2>&1
```

Après chaque restauration :

- L'équipe QA valide les fonctionnalités clés sur l'environnement *staging*.
- Les journaux `/tmp/restore_smoke.log` et `/var/log/asso_restore_audit.log` sont archivés.
- Les incidents sont consignée dans le registre qualité.

## 4. Vérifications & supervision

- Intégrer des alertes (Prometheus, Grafana) sur les métriques pgBackRest/WAL-G.
- Surveiller la taille du bucket S3 et les coûts associés.
- Activer des notifications en cas d'échec (mail, Slack, PagerDuty) depuis les jobs cron/CI.

## 5. RACI

| Tâche                                | Responsable | Support |
|-------------------------------------|-------------|---------|
| Exploitation des sauvegardes daily  | Ops         | DBA     |
| Test de restauration trimestriel    | Ops         | QA      |
| Gestion du bucket S3                | Ops         | SecOps  |
| Vérification des journaux de backup | Ops         | —       |
