# 🚀 cubi-sniper — Le Bot de Sniping Solana Ultime

**Cubi-sniper** est un bot de sniping IA entièrement autonome, capable d'analyser, acheter, scorer et revendre les memecoins Solana dans des temps record.

Propulsé par OCaml, entraîné par IA, orchestré en Docker, et contrôlé par interface.

---

## ✨ Fonctionnalités

- **Sniping automatique** sur les nouveaux tokens (Jupiter Aggregator v6)
- **Stratégies hybrides** : Manuelles, IA (PyTorch) et OCaml ultra-rapide
- **Backtester massif** pour entraîner dynamiquement les modèles
- **Sortie intelligente** : ROI/sec, stagnation, pic, comportement fondateur
- **Taxe automatique** : 3% si wallet ≠ créateur
- **Interface complète** : `/god`, `/train`, `/account`, `/landing`, `/checkout`
- **Simulation sécurisée** : Mode simulation 100% sans risque
- **Accès sécurisé** : Paiement Stripe ou Phantom Wallet
- **Interface live** : Heatmaps, leaderboard, logs, tests A/B

---

## 🛠️ Stack Technique

- **Node.js + TypeScript** : Moteur principal (sniping, stratégie)
- **OCaml** : Scorings personnalisés ultra-rapides  
- **Python + PyTorch** : IA ROI/sec + prédicteur de sortie
- **Redis** : Buffer d'événements, suivi, heatmaps
- **Vue 3 + Tailwind** : Interface live complète
- **Express.js** : API REST sécurisée
- **Docker** : Orchestration full-stack

---

## 🚀 Installation & Démarrage

### Prérequis

- Docker et Docker Compose installés
- Node.js 20+ (pour le développement local)
- Python 3.11+ (pour l'IA)
- Un wallet Solana activé

### Installation rapide

```bash
# Cloner le repo
git clone https://github.com/cubilizer/cubi-sniper.git
cd cubi-sniper

# Configuration
cp .env.example .env
# Éditer .env avec vos paramètres

# Démarrage rapide (développement)
make install
make dev
```

### Déploiement production

```bash
# Build et déploiement
make deploy:alpha

# Avec SSL (requis en production)
docker-compose -f docker-compose.prod.yml up -d
```

### Variables d'environnement requises

```env
# Obligatoires
CREATOR_WALLET=VotreAdresseSOL
WALLET_KEYPAIR_PATH=./wallet/wallet.json
LIVE_MODE=false  # true pour les trades réels

# Optionnelles
REDIS_URL=redis://redis:6379
UI_PORT=3000
API_PORT=4000
AI_PORT=8000
```

---

## 🧭 Navigation

### Interfaces principales

- **`/god`** : Dashboard dieu - logs, heatmaps, leaderboard
- **`/train`** : Supervision IA, tuning, histogrammes
- **`/account`** : Statut d'activation et informations
- **`/landing`** : Page de présentation et tarifs
- **`/checkout`** : Paiement et activation d'accès

### API Endpoints

```
GET /api/stats          # Statistiques globales
GET /api/strategies     # Performance des stratégies
GET /api/trades/recent  # Derniers trades
GET /api/health         # État du système
POST /api/set-mode      # Basculer live/simulation
```

---

## 💳 Système de Paiement

### Méthodes acceptées

1. **Stripe (Carte bancaire)**
   - Validation instantanée
   - Webhook automatisé

2. **Phantom Wallet (Solana)**
   - Transaction directe SOL
   - Vérification on-chain

### Activation

Après paiement validé :
1. Votre wallet est automatiquement activé
2. Accès instantané à toutes les fonctionnalités
3. Commission automatique 3% sur profits

---

## 🔒 Sécurité

### Protection des données

- Clés privées jamais exposées
- Redis avec authentification
- HTTPS requis en production
- Utilisateurs non-root dans Docker

### Conformité

- RGPD compliant
- Données anonymisées dans les logs
- Droit à la suppression
- Audit trail complet

Voir [SECURITY.md](docs/SECURITY.md) pour les détails.

---

## 🤖 Entraînement IA

### Données utilisées

- Historique des trades
- Données Jupiter (pools, liquidité)
- Métriques extraites (volatilité, holders, etc.)

### Modèles

1. **ROI/sec** : Prédit le rendement par seconde
2. **Exit Predictor** : Moment optimal de sortie
3. **OCaml Scorer** : Scoring rapide et contrôlable

### Commandes

```bash
# Lancer l'entraînement
make train

# Backtesting spécifique
ts-node scripts/backtester.ts

# Monitorer l'entraînement
http://localhost:3000/train
```

Voir [TRAINING.md](docs/TRAINING.md) pour la documentation complète.

---

## 📈 Performance & Monitoring

### Métriques clés

- **ROI moyen** : Mesuré par stratégie et global
- **Win rate** : Taux de victoire par stratégie
- **Temps de hold** : Durée optimale de détention
- **ROI/sec** : Rendement par seconde

### Monitoring

Accès temps réel via `/god` :
- Logs de trading live
- Alertes créateur (rug pulls)
- Heatmaps de performance
- Leaderboard des stratégies

---

## 🛠️ Développement

### Architecture

```
cubi-sniper/
├── ai_model/           # Services IA
├── backend/            # API Express
├── ocaml_engine/       # Scoring OCaml
├── solana_agent/       # Bot principal
├── ui/                 # Interface Vue.js
├── docs/               # Documentation
└── docker-compose.yml  # Orchestration
```

### Contribuer

1. Fork le projet
2. Créer une branche (`git checkout -b feature/AmazingFeature`)
3. Commit (`git commit -m 'Add AmazingFeature'`)
4. Push (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

---

## 📄 Licence

Ce logiciel est sous licence propriétaire. Voir [LICENSE](LICENSE) pour les détails.

---

## ⚠️ Disclaimer

**Cubi-sniper est fourni à des fins éducatives uniquement.**

- Aucun conseil en investissement
- Pas de garantie de profit
- Utilisation à vos risques et périls
- Les performances passées ne préjugent pas du futur

---

## 🤝 Support

- **Email** : support@cubilizer.com
- **Discord** : [Rejoindre notre serveur](https://discord.gg/cubi-sniper)
- **Documentation** : [wiki.cubilizer.com](https://wiki.cubilizer.com)

---

**Créé avec ❤️ par @cubilizer**