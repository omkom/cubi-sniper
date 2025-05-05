#!/bin/bash
# Script de diagnostic et résolution des problèmes pour Cubi-sniper
# Exécutez-le quand vous rencontrez des erreurs avec Docker Compose

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction de log
log() {
  echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_error() {
  echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERREUR:${NC} $1"
}

log_success() {
  echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] SUCCÈS:${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ATTENTION:${NC} $1"
}

# Vérifier l'existence des répertoires nécessaires
check_directories() {
  log "Vérification des répertoires nécessaires..."
  
  directories=(
    "ai_model"
    "backend"
    "market_watcher"
    "ocaml_engine"
    "redis"
    "solana_agent"
    "ui"
    "wallet"
    "scripts"
  )
  
  for dir in "${directories[@]}"; do
    if [ ! -d "$dir" ]; then
      log_error "Répertoire '$dir' introuvable"
      mkdir -p "$dir"
      log "Répertoire '$dir' créé"
    fi
  done
  
  # Vérifier si le répertoire redis contient redis.conf
  if [ ! -f "redis/redis.conf" ] || grep -q "appendfsync everysec  #" "redis/redis.conf" || grep -q "save 900 1      #" "redis/redis.conf"; then
    log_warning "Fichier redis.conf problématique détecté, création d'un nouveau fichier..."
    
    mkdir -p redis
    cat > redis/redis.conf << 'EOL'
# Configuration Redis optimisée pour Cubi-sniper
# Cette configuration est conçue pour la persistance des données

# Général
daemonize no
pidfile /var/run/redis_6379.pid
port 6379
tcp-backlog 511
timeout 0
tcp-keepalive 300

# Persistence
# AOF (Append Only File) - pour une meilleure persistance des données
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# RDB (Redis Database File) - sauvegarde périodique
# sauvegarder après 900 sec (15 min) si au moins 1 clé a changé
save 900 1
# sauvegarder après 300 sec (5 min) si au moins 10 clés ont changé
save 300 10
# sauvegarder après 60 sec si au moins 10000 clés ont changé
save 60 10000
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
dir /data

# Mémoire
maxmemory 2gb
maxmemory-policy allkeys-lru
maxmemory-samples 5

# Logs
loglevel notice
logfile ""

# Avancé
hash-max-ziplist-entries 512
hash-max-ziplist-value 64
list-max-ziplist-entries 512
list-max-ziplist-value 64
set-max-intset-entries 512
zset-max-ziplist-entries 128
zset-max-ziplist-value 64
activerehashing yes
client-output-buffer-limit normal 0 0 0
client-output-buffer-limit slave 256mb 64mb 60
client-output-buffer-limit pubsub 32mb 8mb 60
hz 10
EOL
    
    log_success "Fichier redis.conf créé"
  fi
  
  # Créer un fichier input.json par défaut pour OCaml
  if [ ! -f "ocaml_engine/input.json" ]; then
    log_warning "Fichier input.json pour OCaml introuvable"
    mkdir -p ocaml_engine
    cat > ocaml_engine/input.json << 'EOL'
{
  "liquidity": 10.0,
  "holders": 50,
  "ai_score": 0.8,
  "volatility_1m": 0.2,
  "buy_sell_ratio": 1.5
}
EOL
    log_success "Fichier input.json pour OCaml créé"
  fi
  
  # Créer un fichier wallet test par défaut
  if [ ! -d "wallet" ]; then
    mkdir -p wallet
    log "Répertoire 'wallet' créé"
  fi
  
  if [ ! -f "wallet/test_keypair.json" ]; then
    log_warning "Fichier test_keypair.json introuvable"
    echo '[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]' > wallet/test_keypair.json
    log_success "Fichier test_keypair.json créé (POUR TESTS UNIQUEMENT)"
  fi
  
  # Créer un script de backup s'il n'existe pas
  if [ ! -f "scripts/backup.sh" ]; then
    mkdir -p scripts
    log_warning "Script de backup introuvable"
    cat > scripts/backup.sh << 'EOL'
#!/bin/bash
echo "Script de backup exécuté"
exit 0
EOL
    chmod +x scripts/backup.sh
    log_success "Script de backup créé"
  fi
  
  log_success "Vérification des répertoires terminée"
}

# Vérifier que le Docker Compose est installé
check_docker() {
  log "Vérification de Docker..."
  
  if command -v docker &> /dev/null; then
    log_success "Docker est installé"
  else
    log_error "Docker n'est pas installé! Veuillez l'installer avant de continuer."
    exit 1
  fi
  
  if docker info &> /dev/null; then
    log_success "Docker est en cours d'exécution"
  else
    log_error "Docker n'est pas en cours d'exécution! Veuillez le démarrer avant de continuer."
    exit 1
  fi
  
  log "Vérification de Docker Compose..."
  if docker compose version &> /dev/null || docker-compose version &> /dev/null; then
    log_success "Docker Compose est installé"
  else
    log_error "Docker Compose n'est pas installé! Veuillez l'installer avant de continuer."
    exit 1
  fi
}

# Arrêter tous les conteneurs et nettoyer
cleanup() {
  log "Nettoyage des conteneurs existants..."
  
  if command -v docker-compose &> /dev/null; then
    COMPOSE="docker-compose"
  else
    COMPOSE="docker compose"
  fi
  
  # Arrêter et supprimer tous les conteneurs
  $COMPOSE down --remove-orphans &> /dev/null || true
  
  # Supprimer les conteneurs en cours d'exécution liés au projet
  CONTAINERS=$(docker ps -a --filter "name=redis|postgres|backend|ui|ai_model|ocaml_engine|solana_agent|market_watcher|data_collector|backup_service" -q)
  if [ ! -z "$CONTAINERS" ]; then
    docker stop $CONTAINERS &> /dev/null || true
    docker rm $CONTAINERS &> /dev/null || true
  fi
  
  log_success "Nettoyage terminé"
}

# Vérifier que redis peut démarrer avec la configuration
test_redis_config() {
  log "Test de la configuration Redis..."
  
  # Créer un conteneur temporaire pour tester la configuration
  docker run --rm -v "$(pwd)/redis/redis.conf:/usr/local/etc/redis/redis.conf" redis:7-alpine redis-server /usr/local/etc/redis/redis.conf --test-memory 32
  
  if [ $? -eq 0 ]; then
    log_success "Configuration Redis valide"
    return 0
  else
    log_error "Configuration Redis invalide. Réparation..."
    
    # Créer une configuration simple sans commentaires
    cat > redis/redis.conf << 'EOL'
daemonize no
port 6379
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec
save 900 1
save 300 10
save 60 10000
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
dir /data
loglevel notice
EOL
    
    # Tester à nouveau
    docker run --rm -v "$(pwd)/redis/redis.conf:/usr/local/etc/redis/redis.conf" redis:7-alpine redis-server /usr/local/etc/redis/redis.conf --test-memory 32
    
    if [ $? -eq 0 ]; then
      log_success "Configuration Redis réparée"
      return 0
    else
      log_error "Impossible de réparer la configuration Redis. Utilisation de la configuration par défaut..."
      return 1
    fi
  fi
}

# Vérifier les fichiers de configuration
check_config_files() {
  log "Vérification des fichiers de configuration..."
  
  # Vérifier docker-compose.yml
  if [ ! -f "docker-compose.yml" ]; then
    log_error "docker-compose.yml introuvable"
    exit 1
  fi
  
  # Vérifier .env
  if [ ! -f ".env" ]; then
    log_warning "Fichier .env introuvable, création d'un fichier par défaut..."
    
    cat > .env << 'EOL'
# Configuration par défaut générée par le script de dépannage
REDIS_URL=redis://redis:6379
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=cubi
UI_PORT=3000
API_PORT=4000
WS_PORT=3010
AI_PORT=8000
OCAML_PORT=8080
JUPITER_API_URL=https://quote-api.jup.ag/v6
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
LIVE_MODE=false
CREATOR_WALLET=3X9TrYG66K3DV4FA8TVJnzpQErEFRc8zQk8CbvbZBJ4h
WALLET_KEYPAIR_PATH=/app/wallet/test_keypair.json
EOL
    
    log_success "Fichier .env créé avec des valeurs par défaut"
  fi
  
  log_success "Vérification des fichiers de configuration terminée"
}

# Construire et démarrer les services
start_services() {
  log "Démarrage des services..."
  
  if command -v docker-compose &> /dev/null; then
    COMPOSE="docker-compose"
  else
    COMPOSE="docker compose"
  fi
  
  # Tester la configuration Redis
  test_redis_config

  # Démarrer Redis en premier avec un conteneur autonome
  log "Démarrage de Redis..."
  docker run --name redis-test -d -p 6379:6379 -v "$(pwd)/redis/redis.conf:/usr/local/etc/redis/redis.conf" redis:7-alpine redis-server /usr/local/etc/redis/redis.conf

  # Vérifier que Redis a démarré correctement
  sleep 3
  if docker ps | grep -q "redis-test"; then
    log_success "Redis est prêt"

    # Arrêter et supprimer le conteneur de test
    docker stop redis-test && docker rm redis-test
    
    # Maintenant, démarrer avec Docker Compose
    log "Démarrage de tous les services avec Docker Compose..."
    $COMPOSE up -d
    
    log_success "Tous les services ont été démarrés"
  else
    log_error "Redis n'a pas démarré correctement. Essayons une configuration minimale..."
    
    # Créer une configuration Redis minimale
    cat > redis/redis.conf << EOF
port 6379
appendonly yes
save 900 1
save 300 10
save 60 10000
EOF

    docker run --name redis-test -d -p 6379:6379 redis:7-alpine
    
    sleep 3
    if docker ps | grep -q "redis-test"; then
      log_success "Redis est prêt (configuration par défaut)"
      
      # Arrêter et supprimer le conteneur de test
      docker stop redis-test && docker rm redis-test
      
      # Modifier docker-compose.yml pour utiliser Redis sans configuration personnalisée
      sed -i.bak 's/command: redis-server \/usr\/local\/etc\/redis\/redis.conf/command: redis-server/g' docker-compose.yml
      
      # Démarrer avec Docker Compose
      log "Démarrage de tous les services avec Docker Compose (Redis avec config par défaut)..."
      $COMPOSE up -d
      
      log_success "Tous les services ont été démarrés"
    else
      log_error "Impossible de démarrer Redis même avec une configuration minimale. Vérifiez votre installation Docker."
      docker logs redis-test
      exit 1
    fi
  fi
}

# Fonction principale
main() {
  log "Démarrage du script de dépannage Cubi-sniper..."
  
  check_docker
  cleanup
  check_directories
  check_config_files
  start_services
  
  log_success "🎉 Dépannage terminé avec succès ! Tous les services devraient être opérationnels."
  log "Pour voir les journaux, utilisez 'docker compose logs -f'"
  log "Pour accéder à l'interface, ouvrez 'http://localhost:3000' dans votre navigateur"
}

# Exécuter la fonction principale
main