#!/bin/bash
# Script de démarrage optimisé pour Cubi-sniper avec vérification de persistance des données

set -e  # Arrêt en cas d'erreur

# Configuration
REDIS_HOST="redis"
REDIS_PORT="6379"
POSTGRES_HOST="postgres"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-cubi}"
TRAINING_DATA_PATH="/app/training_data/training_data.jsonl"
MODELS_DIR="/app/models"
LOG_DIR="logs"

# Création du répertoire de logs
mkdir -p $LOG_DIR

# Fonction de log
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_DIR/startup_$(date +%Y%m%d).log"
}

# Fonction pour vérifier l'état de Redis
check_redis() {
  log "Vérification de l'état Redis..."
  
  if redis-cli -h $REDIS_HOST -p $REDIS_PORT PING | grep -q "PONG"; then
    log "✅ Redis OK"
    
    # Vérifier les données essentielles
    POOLS_COUNT=$(redis-cli -h $REDIS_HOST -p $REDIS_PORT ZCARD pools)
    TOKENS_COUNT=$(redis-cli -h $REDIS_HOST -p $REDIS_PORT --scan --pattern "token:*" | wc -l)
    
    log "📊 Statistiques Redis: $POOLS_COUNT pools, $TOKENS_COUNT tokens"
    
    if [ "$POOLS_COUNT" -eq "0" ] && [ "$TOKENS_COUNT" -eq "0" ]; then
      log "⚠️ Aucune donnée token/pool trouvée dans Redis"
      return 1
    fi
    
    return 0
  else
    log "❌ Redis non disponible"
    return 1
  fi
}

# Fonction pour vérifier l'état de PostgreSQL
check_postgres() {
  log "Vérification de l'état PostgreSQL..."
  
  if pg_isready -h $POSTGRES_HOST -U $POSTGRES_USER; then
    log "✅ PostgreSQL OK"
    
    # Vérifier les tables essentielles
    TOKEN_COUNT=$(psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB -t -c "SELECT COUNT(*) FROM cubi.token_data;")
    TRADE_COUNT=$(psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB -t -c "SELECT COUNT(*) FROM cubi.trade_data;")
    
    log "📊 Statistiques PostgreSQL: $TOKEN_COUNT tokens, $TRADE_COUNT trades"
    
    return 0
  else
    log "❌ PostgreSQL non disponible"
    return 1
  fi
}

# Fonction pour vérifier les modèles et données d'entraînement
check_models() {
  log "Vérification des modèles IA..."
  
  if [ -f "$MODELS_DIR/roi_model.joblib" ] && [ -f "$MODELS_DIR/exit_model.joblib" ]; then
    log "✅ Modèles AI OK"
    
    # Vérifier l'âge des modèles
    ROI_AGE=$(find "$MODELS_DIR/roi_model.joblib" -type f -mtime +30 | wc -l)
    if [ "$ROI_AGE" -ne "0" ]; then
      log "⚠️ Les modèles ROI sont âgés de plus de 30 jours - réentraînement recommandé"
    fi
    
    return 0
  else
    log "❌ Modèles AI non trouvés"
    return 1
  fi
}

# Fonction pour vérifier les données d'entraînement
check_training_data() {
  log "Vérification des données d'entraînement..."
  
  if [ -f "$TRAINING_DATA_PATH" ]; then
    LINES=$(wc -l < "$TRAINING_DATA_PATH")
    log "✅ Données d'entraînement OK ($LINES échantillons)"
    
    if [ "$LINES" -lt "100" ]; then
      log "⚠️ Peu de données d'entraînement ($LINES échantillons) - collecte recommandée"
    fi
    
    return 0
  else
    log "❌ Données d'entraînement non trouvées"
    return 1
  fi
}

# Vérifier et réparer les données si nécessaire
restore_data_if_needed() {
  REDIS_OK=$(check_redis; echo $?)
  POSTGRES_OK=$(check_postgres; echo $?)
  MODELS_OK=$(check_models; echo $?)
  TRAINING_OK=$(check_training_data; echo $?)
  
  if [ "$REDIS_OK" -eq "0" ] && [ "$POSTGRES_OK" -eq "0" ] && [ "$MODELS_OK" -eq "0" ] && [ "$TRAINING_OK" -eq "0" ]; then
    log "✅ Toutes les vérifications ont réussi - Le système est prêt"
    return 0
  fi
  
  log "⚠️ Certaines vérifications ont échoué - Tentative de restauration des données"
  
  # Vérifier les backups disponibles
  BACKUP_DIR="/backup"
  LATEST_BACKUP=$(find $BACKUP_DIR -name "backup_*.tar.gz" -type f | sort -r | head -n 1)
  
  if [ -n "$LATEST_BACKUP" ]; then
    log "📦 Backup trouvé: $LATEST_BACKUP"
    
    # Extraire le backup
    TEMP_DIR=$(mktemp -d)
    log "Extraction du backup vers $TEMP_DIR..."
    tar -xzf $LATEST_BACKUP -C $TEMP_DIR
    
    # Restauration Redis si nécessaire
    if [ "$REDIS_OK" -ne "0" ]; then
      REDIS_BACKUP=$(find $TEMP_DIR -name "redis_*.rdb" -type f | sort -r | head -n 1)
      if [ -n "$REDIS_BACKUP" ]; then
        log "🔄 Restauration Redis depuis $REDIS_BACKUP..."
        redis-cli -h $REDIS_HOST -p $REDIS_PORT SHUTDOWN SAVE
        cp $REDIS_BACKUP /data/redis/dump.rdb
        log "✅ Restauration Redis terminée"
      fi
    fi
    
    # Restauration PostgreSQL si nécessaire
    if [ "$POSTGRES_OK" -ne "0" ]; then
      PG_BACKUP=$(find $TEMP_DIR -name "postgres_*.dump" -type f | sort -r | head -n 1)
      if [ -n "$PG_BACKUP" ]; then
        log "🔄 Restauration PostgreSQL depuis $PG_BACKUP..."
        pg_restore -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB -c $PG_BACKUP
        log "✅ Restauration PostgreSQL terminée"
      fi
    fi
    
    # Restauration des modèles si nécessaire
    if [ "$MODELS_OK" -ne "0" ]; then
      if [ -d "$TEMP_DIR/models" ]; then
        log "🔄 Restauration des modèles..."
        cp -r $TEMP_DIR/models/* $MODELS_DIR/
        log "✅ Restauration des modèles terminée"
      fi
    fi
    
    # Restauration des données d'entraînement si nécessaire
    if [ "$TRAINING_OK" -ne "0" ]; then
      if [ -d "$TEMP_DIR/training" ]; then
        log "🔄 Restauration des données d'entraînement..."
        mkdir -p $(dirname $TRAINING_DATA_PATH)
        cp -r $TEMP_DIR/training/* $(dirname $TRAINING_DATA_PATH)/
        log "✅ Restauration des données d'entraînement terminée"
      fi
    fi
    
    # Nettoyage
    rm -rf $TEMP_DIR
    log "🧹 Nettoyage terminé"
    
    # Vérifier à nouveau après restauration
    log "🔍 Vérification après restauration..."
    REDIS_OK=$(check_redis; echo $?)
    POSTGRES_OK=$(check_postgres; echo $?)
    MODELS_OK=$(check_models; echo $?)
    TRAINING_OK=$(check_training_data; echo $?)
    
    if [ "$REDIS_OK" -eq "0" ] && [ "$POSTGRES_OK" -eq "0" ] && [ "$MODELS_OK" -eq "0" ] && [ "$TRAINING_OK" -eq "0" ]; then
      log "✅ Restauration réussie - Le système est prêt"
      return 0
    else
      log "⚠️ La restauration n'a pas résolu tous les problèmes"
    fi
  else
    log "❌ Aucun backup trouvé pour la restauration"
  fi
  
  # Génération de nouvelles données si pas de backup
  log "🔄 Génération de nouvelles données..."
  
  # Modèles par défaut si nécessaire
  if [ "$MODELS_OK" -ne "0" ]; then
    log "🧠 Génération de modèles par défaut..."
    python /app/train_model.py
    python /app/exit_predictor.py
  fi
  
  # Données d'entraînement par défaut si nécessaire
  if [ "$TRAINING_OK" -ne "0" ]; then
    log "📊 Génération de données d'entraînement par défaut..."
    python /app/data_collector.py --mode export
  fi
  
  log "✅ Initialisation terminée"
  return 0
}

# Exécution principale
log "🚀 Démarrage du script d'initialisation Cubi-sniper"
restore_data_if_needed

log "✅ Système prêt pour le démarrage des services"
exit 0