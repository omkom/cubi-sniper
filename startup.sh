#!/bin/bash
# Script pour démarrer les stacks Cubi-sniper en séquence

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

# Vérifier Docker
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

# Déterminer quelle commande docker compose utiliser
get_compose_command() {
  if command -v docker-compose &> /dev/null; then
    echo "docker-compose"
  else
    echo "docker compose"
  fi
}

# Démarrer la partie 1 du stack
start_part1() {
  log "Démarrage de la Partie 1: Redis + Market Watcher + AI Model + UI"
  
  COMPOSE=$(get_compose_command)
  
  # Vérifier si le fichier docker-compose-part1.yml existe
  if [ ! -f "docker-compose-part1.yml" ]; then
    log_error "Fichier docker-compose-part1.yml introuvable!"
    exit 1
  fi
  
  # Démarrer les services
  $COMPOSE -f docker-compose-part1.yml up -d
  
  # Vérifier que Redis est démarré correctement
  MAX_RETRIES=30
  RETRY=0
  while [ $RETRY -lt $MAX_RETRIES ]; do
    if docker exec -i redis redis-cli ping | grep -q "PONG"; then
      log_success "Redis démarré avec succès"
      break
    fi
    RETRY=$((RETRY+1))
    log_warning "Attente de Redis... ($RETRY/$MAX_RETRIES)"
    sleep 1
  done
  
  if [ $RETRY -eq $MAX_RETRIES ]; then
    log_error "Redis n'a pas démarré correctement"
    # On continue quand même pour voir si les autres services démarrent
  fi
  
  log_success "Partie 1 démarrée! Vérifiez les logs avec: $COMPOSE -f docker-compose-part1.yml logs -f"
}

# Démarrer la partie 2 du stack
start_part2() {
  log "Démarrage de la Partie 2: Postgres + Backend + OCaml + Services supplémentaires"
  
  COMPOSE=$(get_compose_command)
  
  # Vérifier si le fichier docker-compose-part2.yml existe
  if [ ! -f "docker-compose-part2.yml" ]; then
    log_error "Fichier docker-compose-part2.yml introuvable!"
    exit 1
  fi
  
  # Démarrer les services
  $COMPOSE -f docker-compose-part2.yml up -d
  
  log_success "Partie 2 démarrée! Vérifiez les logs avec: $COMPOSE -f docker-compose-part2.yml logs -f"
}

# Démarrer Solana Agent séparément (nécessite des fixes)
start_solana_agent() {
  log "Démarrage de Solana Agent (avec correction des erreurs TypeScript)"
  
  # Vérifier si le fichier solana-agent-fix.ts existe
  if [ ! -f "solana_agent/src/agent.ts.fixed" ] && [ -f "solana-agent-fix.ts" ]; then
    log "Backup du fichier agent.ts original"
    cp solana_agent/src/agent.ts solana_agent/src/agent.ts.backup
    
    log "Copie du fichier corrigé"
    cp solana-agent-fix.ts solana_agent/src/agent.ts
  fi
  
  # Démarrer dans un conteneur
  docker run -d --name solana_agent \
    --network part1_network \
    -v $(pwd)/solana_agent:/app \
    -v $(pwd)/wallet:/app/wallet:ro \
    -e REDIS_URL=redis://redis:6379 \
    -e AI_MODEL_URL=http://ai_model:8000 \
    -e EXIT_MODEL_URL=http://ai_model:8000/exit \
    -e OCAML_API_URL=http://ocaml_engine:8080/score \
    -e LIVE_MODE=false \
    -e WALLET_KEYPAIR_PATH=/app/wallet/test_keypair.json \
    -e API_BASE_URL=http://backend:4000 \
    -e CREATOR_WALLET=${CREATOR_WALLET:-3X9TrYG66K3DV4FA8TVJnzpQErEFRc8zQk8CbvbZBJ4h} \
    -e SOLANA_RPC_URL=${SOLANA_RPC_URL:-https://api.mainnet-beta.solana.com} \
    -e DOCKER_CONTAINER=true \
    node:20-alpine sh -c "cd /app && npx ts-node src/agent.ts"
  
  if [ $? -eq 0 ]; then
    log_success "Solana Agent démarré! Vérifiez les logs avec: docker logs solana_agent -f"
  else
    log_error "Échec du démarrage de Solana Agent"
  fi
}

# Correction de market-watcher
fix_market_watcher() {
  log "Application du fix pour Market Watcher"
  
  # Vérifier si le fichier market-watcher-fix.ts existe
  if [ ! -f "market_watcher/src/marketWatcher.ts.fixed" ] && [ -f "market-watcher-fix.ts" ]; then
    log "Backup du fichier marketWatcher.ts original"
    cp market_watcher/src/marketWatcher.ts market_watcher/src/marketWatcher.ts.backup
    
    log "Copie du fichier corrigé"
    cp market-watcher-fix.ts market_watcher/src/marketWatcher.ts
    
    # Marquer comme fixé
    touch market_watcher/src/marketWatcher.ts.fixed
    
    # Redémarrer market_watcher
    COMPOSE=$(get_compose_command)
    $COMPOSE -f docker-compose-part1.yml restart market_watcher
    
    log_success "Market Watcher corrigé et redémarré"
  else
    log "Market Watcher déjà corrigé ou fichier de correction manquant"
  fi
}

# Correction de l'erreur data_collector
fix_data_collector() {
  log "Application du fix pour Data Collector"
  
  # Remplacer la commande dans docker-compose-part2.yml
  if grep -q "python data_collector.py python" docker-compose-part2.yml; then
    sed -i'.bak' 's/command: python data_collector.py python data_collector.py/command: python data_collector.py --schedule hourly --mode full/g' docker-compose-part2.yml
    
    # Redémarrer data_collector si nécessaire
    COMPOSE=$(get_compose_command)
    if docker ps | grep -q "data_collector"; then
      $COMPOSE -f docker-compose-part2.yml restart data_collector
      log_success "Data Collector corrigé et redémarré"
    else
      log "Data Collector corrigé (sera appliqué au prochain démarrage)"
    fi
  else
    log "Data Collector déjà corrigé ou format différent"
  fi
}

# Menu principal
main() {
  check_docker
  
  # Menu
  echo -e "\n${GREEN}=== Cubi-sniper Stack Manager ===${NC}"
  echo -e "1) Démarrer Partie 1 (Redis + Market Watcher + AI Model + UI)"
  echo -e "2) Démarrer Partie 2 (Postgres + Backend + Services supplémentaires)"
  echo -e "3) Démarrer les deux parties"
  echo -e "4) Appliquer les corrections (Market Watcher, Data Collector)"
  echo -e "5) Démarrer Solana Agent (avec fix)"
  echo -e "0) Quitter"
  
  read -p "Votre choix: " choice
  
  case $choice in
    1)
      start_part1
      ;;
    2)
      start_part2
      ;;
    3)
      start_part1
      sleep 5
      start_part2
      ;;
    4)
      fix_market_watcher
      fix_data_collector
      ;;
    5)
      start_solana_agent
      ;;
    0)
      log "Au revoir!"
      exit 0
      ;;
    *)
      log_error "Choix invalide"
      ;;
  esac
}

# Exécuter le menu principal
main