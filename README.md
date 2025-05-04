# README principal du projet cubi-sniper
# cubi-sniper — Le bot de sniping Solana le plus avancé au monde

**Cubi-sniper** est un bot de sniping IA entièrement autonome, capable d’analyser, acheter, scorer et revendre les memecoins Solana dans des temps record.

Propulsé par OCaml, entraîné par IA, orchestré en Docker, et contrôlé par interface.

---

## Fonctionnalités

- Sniping auto sur les nouveaux tokens (Jupiter Aggregator v6)
- Stratégies manuelles, IA (PyTorch) et OCaml (TokenDB)
- Backtester massif pour entraîner dynamiquement les modèles
- Sortie intelligente : ROI/sec, stagnation, pic, comportement fondateur
- Taxe automatique 3 % si wallet ≠ créateur
- Interface `/god`, `/train`, `/account`, `/landing`, `/checkout`
- Simulation complète sans prise de risque
- Sécurité d’accès par paiement Stripe ou Phantom
- UI live avec heatmaps, leaderboard, logs, A/B tests

---

## Stack technique

- **Node.js + TypeScript** : moteur principal + sniping + stratégie
- **OCaml** : scorings personnalisés ultra rapides
- **Python (PyTorch)** : IA roi/sec + prédicteur de sortie
- **Redis** : buffer d’événements, suivi, heatmaps
- **Vue 3 + Tailwind CSS** : UI complète live & analyse
- **Express.js** : API REST & sécurité
- **Docker Compose** : orchestration full stack

---

## Démarrage

```bash
git clone https://github.com/cubilizer/cubi-sniper.git
cd cubi-sniper
cp .env.example .env
# configure ton WALLET et LIVE_MODE
make build
make deploy:alpha
````

--- 

## Interfaces
- /god : logs en live, heatmap, leaderboard des stratégies
- /train : IA tuner, histogramme ROI/sec, supervision du modèle
- /account : statut d’activation
- /landing : présentation du bot
- /checkout : paiement carte ou SOL
- /admin : liste des utilisateurs validés

## Paiement
Stripe (CB) → accès activé automatiquement

Phantom Wallet (Solana) → déclenche validation d’accès

Endpoint sécurisé /api/validate-access

Sécurité
Lancement bloqué si wallet non activé (licenseChecker.ts)

Aucune transaction en LIVE_MODE sans vérification

Mode simulation 100 % identique au mode réel

Créateur reçoit automatiquement 3 % de commission

Déploiement alpha
bash
Copier
Modifier
make deploy:alpha
Créé avec amour par @cubilizer
Ce bot est fourni à des fins éducatives. Aucun conseil en investissement.
Utilisation à tes risques et périls. Les performances passées ne préjugent pas du futur.

yaml
Copier
Modifier

---