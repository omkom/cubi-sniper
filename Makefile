UI_DIR=ui
BACKEND_DIR=backend
AI_DIR=ai_model
COMPOSE=docker-compose

help:
	@echo "💡 Commandes disponibles :"
	@echo "  make install        → installe les dépendances Node.js & Python"
	@echo "  make ui             → lance le frontend Vite"
	@echo "  make backend        → lance le backend Express"
	@echo "  make train          → entraîne les modèles IA"
	@echo "  make dev            → UI + backend"
	@echo "  make simulate       → lance le bot en mode simulation"
	@echo "  make live           → lance le bot en mode live (si licence active)"
	@echo "  make deploy:alpha   → build docker-compose (alpha)"

install:
	cd $(UI_DIR) && npm install
	cd $(BACKEND_DIR) && npm install
	pip install -r $(AI_DIR)/requirements.txt

ui:
	cd $(UI_DIR) && npm run dev

backend:
	cd $(BACKEND_DIR) && npm run dev

train:
	bash $(AI_DIR)/train.sh

dev:
	$(MAKE) -j2 ui backend

simulate:
	node solana_agent/src/marketWatcher.ts

live:
	LIVE_MODE=true node solana_agent/src/marketWatcher.ts

deploy-alpha:
	$(COMPOSE) up --build -d

.PHONY: help install ui backend train dev simulate live deploy-alpha
