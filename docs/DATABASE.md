# Documentation Base de Données

## 🗄️ Architecture des Données

Cubi-sniper utilise une architecture hybride Redis + PostgreSQL pour optimiser performance et persistance.

### Redis (Cache & Real-time)
- **Trading en temps réel** : Décisions rapides
- **Heatmaps live** : Visualisations temps réel
- **Statuts des stratégies** : Mises à jour instantanées
- **Cache API** : Réduction de latence

### PostgreSQL (Persistance & Analytics)
- **Données historiques** : Stockage à long terme
- **Entraînement IA** : Dataset consolidé
- **Analytics** : Agrégations et reporting
- **Backup** : Persistance des données critiques

## 📊 Schéma de Base de Données

### Token Data
```sql
token_data (
    id SERIAL PRIMARY KEY,
    mint VARCHAR(44),
    symbol VARCHAR(32),
    liquidity DOUBLE PRECISION,
    volume DOUBLE PRECISION,
    holder_count INTEGER,
    created_at TIMESTAMP,
    raw_data JSONB
)
```

### Trade Data  
```sql
trade_data (
    id SERIAL PRIMARY KEY,
    token_mint VARCHAR(44),
    strategy_id VARCHAR(128),
    roi DOUBLE PRECISION,
    roi_per_sec DOUBLE PRECISION,
    time_held DOUBLE PRECISION,
    entry_time TIMESTAMP,
    exit_time TIMESTAMP,
    features JSONB,
    exit_reason VARCHAR(64)
)
```

### Backtest Results
```sql
backtest_results (
    id SERIAL PRIMARY KEY,
    strategy_id VARCHAR(128),
    token_mint VARCHAR(44),
    roi DOUBLE PRECISION,
    roi_per_sec DOUBLE PRECISION,
    win BOOLEAN,
    timestamp TIMESTAMP
)
```

## 🔄 Pipeline de Données

### 1. Collecte (data_collector.py)
- Scraping Jupiter Aggregator API
- Récupération des trades Redis
- Enrichissement des données

### 2. Stockage
- **Redis**: Stockage temporaire (TTL)
- **PostgreSQL**: Persistance à long terme
- **Volumes Docker**: Protection contre la perte

### 3. Export pour Training
```bash
# Export des données d'entraînement
python data_collector.py --export
```

### 4. Cleanup Automatique
- Rétention: 90 jours pour token_data
- Agrégations quotidiennes dans daily_stats
- Backup automatique des données critiques

## 📈 Vues et Agrégations

### strategy_performance
Analyse des performances par stratégie
```sql
SELECT * FROM cubi.strategy_performance 
WHERE trade_date > NOW() - INTERVAL '7 days'
ORDER BY avg_roi DESC;
```

### token_performance
Performance globale des tokens tradés
```sql
SELECT * FROM cubi.token_performance
WHERE trade_count > 10
ORDER BY avg_roi DESC
LIMIT 10;
```

### daily_stats (Materialized View)
Statistiques quotidiennes agrégées
```sql
SELECT * FROM cubi.daily_stats
WHERE date > NOW() - INTERVAL '30 days';
```

## 🔄 Synchronisation Redis-PostgreSQL

### Stratégie push/pull
1. **Écriture**: Redis first pour la vitesse
2. **Lecture rapide**: Redis pour le cache
3. **Persistance**: PostgreSQL asynchrone
4. **Agrégation**: PostgreSQL pour l'analyse

### Script de sync (run daily)
```bash
# Synchroniser Redis vers PostgreSQL
python scripts/sync_redis_to_postgres.py

# Vérifier l'intégrité
python scripts/verify_data_integrity.py
```

## 🚀 Performance

### Indexation
- mint, strategy_id, exit_time indexés
- JSONB avec GIN indexes pour les requêtes complexes

### Partitioning
```sql
-- Partition par mois pour trade_data
CREATE TABLE cubi.trade_data_2025_01 PARTITION OF cubi.trade_data
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

### Caching Strategy
- Redis pour données hot (< 24h)
- PostgreSQL pour données warm/cold
- Materialized views pour agrégations fréquentes

## 🔒 Sécurité

### Access Control
- Utilisateur read-only pour reporting
- Utilisateur applicatif avec privilèges limités
- Pas de superuser en production

### Backup
- Dump quotidien automatique 
- Point-in-time recovery (PITR)
- Stockage chiffré des backups

### Conformité
- Rétention RGPD (90 jours max)
- Anonymisation des données sensibles
- Logs d'audit des accès

## 🛠️ Administration

### Monitoring
```sql
-- Check database health
SELECT * FROM pg_stat_activity 
WHERE state != 'idle';

-- Monitor table sizes
SELECT 
    relname as table_name,
    pg_size_pretty(pg_relation_size(relid)) as size
FROM pg_stat_user_tables
ORDER BY pg_relation_size(relid) DESC;
```

### Maintenance Jobs
```sql
-- Vacuum et analyze quotidiens
VACUUM ANALYZE cubi.trade_data;

-- Réindexation si nécessaire
REINDEX TABLE cubi.token_data;
```

## 📦 Backups & Recovery

### Backup Strategy
```bash
# Backup complet quotidien
pg_dump -Fc -h postgres -U postgres cubi > backup_$(date +%Y%m%d).dump

# Backup incrémental avec WAL archiving
```

### Restore Procedure
```bash
# Restore depuis dump
pg_restore -h postgres -U postgres -d cubi_restore backup.dump

# Point-in-time recovery
psql -h postgres -U postgres -c "SELECT pg_create_restore_point('before_deploy')"
```

## 🚦 Troubleshooting

### Common Issues
1. **Connection timeout**: Vérifier network_mode Docker
2. **Slow queries**: Analyser EXPLAIN plans
3. **Disk full**: Vérifier retention policies
4. **Lock contention**: Monitorer pg_locks

### Debug Commands
```sql
-- Check connections
SELECT * FROM pg_stat_activity;

-- Check locks
SELECT * FROM pg_locks WHERE NOT granted;

-- Monitor replication lag
SELECT * FROM pg_stat_replication;
```

---

**Maintenu par**: Équipe Infrastructure Cubi-sniper  
**Dernière mise à jour**: 2025-05-05