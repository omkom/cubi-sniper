#!/bin/bash
# Script de sauvegarde automatique pour Cubi-sniper
# Sauvegarde PostgreSQL, Redis et les données d'entraînement

set -e  # Arrêt en cas d'erreur

# Configuration
BACKUP_DIR="/backup"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PG_HOST="postgres"
PG_USER="${POSTGRES_USER:-postgres}"
PG_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
PG_DB="${POSTGRES_DB:-cubi}"
REDIS_HOST="redis"
REDIS_PORT="6379"
BACKUP_INTERVAL="${BACKUP_INTERVAL:-86400}"  # 24 heures par défaut
MAX_BACKUPS=7  # Conserver 7 jours de sauvegardes

# Fonction de log
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Création des répertoires de sauvegarde
mkdir -p $BACKUP_DIR/postgres
mkdir -p $BACKUP_DIR/redis
mkdir -p $BACKUP_DIR/training
mkdir -p $BACKUP_DIR/models

# Fonction de sauvegarde
do_backup() {
  local CURRENT_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  log "Démarrage de la sauvegarde..."

  # 1. Sauvegarde PostgreSQL
  log "Sauvegarde PostgreSQL..."
  export PGPASSWORD="$PG_PASSWORD"
  pg_dump -h $PG_HOST -U $PG_USER $PG_DB -F c -f $BACKUP_DIR/postgres/postgres_${CURRENT_TIMESTAMP}.dump
  
  # 2. Sauvegarde Redis
  log "Sauvegarde Redis..."
  redis-cli -h $REDIS_HOST -p $REDIS_PORT SAVE
  cp /data/redis/dump.rdb $BACKUP_DIR/redis/redis_${CURRENT_TIMESTAMP}.rdb
  
  # 3. Sauvegarde des données d'entraînement
  log "Sauvegarde des données d'entraînement..."
  cp -r /data/training/* $BACKUP_DIR/training/
  
  # 4. Sauvegarde des modèles
  log "Sauvegarde des modèles..."
  cp -r /data/models/* $BACKUP_DIR/models/
  
  # 5. Création d'une archive complète
  log "Création de l'archive complète..."
  tar -czf $BACKUP_DIR/backup_${CURRENT_TIMESTAMP}.tar.gz \
    $BACKUP_DIR/postgres/postgres_${CURRENT_TIMESTAMP}.dump \
    $BACKUP_DIR/redis/redis_${CURRENT_TIMESTAMP}.rdb \
    $BACKUP_DIR/training \
    $BACKUP_DIR/models
  
  # 6. Nettoyage des anciennes sauvegardes
  log "Nettoyage des anciennes sauvegardes..."
  find $BACKUP_DIR/postgres -name "*.dump" -type f -mtime +$MAX_BACKUPS -delete
  find $BACKUP_DIR/redis -name "*.rdb" -type f -mtime +$MAX_BACKUPS -delete
  find $BACKUP_DIR -name "backup_*.tar.gz" -type f -mtime +$MAX_BACKUPS -delete
  
  log "Sauvegarde terminée avec succès!"
}

# Fonction de rotation des logs
rotate_logs() {
  if [ -f "$BACKUP_DIR/backup.log" ]; then
    mv $BACKUP_DIR/backup.log $BACKUP_DIR/backup.log.1
  fi
  
  # Limiter le nombre de logs
  find $BACKUP_DIR -name "backup.log.*" -type f -mtime +30 -delete
}

# Boucle principale
run_backup_loop() {
  while true; do
    rotate_logs
    do_backup >> $BACKUP_DIR/backup.log 2>&1
    log "Prochaine sauvegarde dans $(($BACKUP_INTERVAL / 3600)) heures"
    sleep $BACKUP_INTERVAL
  done
}

# Démarrage
log "Démarrage du service de sauvegarde"
run_backup_loop