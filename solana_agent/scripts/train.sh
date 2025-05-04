#!/bin/bash

# Lance l'entraînement IA complet
echo "🚀 Entraînement des modèles IA via le service dédié..."

# Utiliser l'API du service IA au lieu d'exécuter localement
API_URL="${AI_MODEL_URL:-http://localhost:8000}"

echo "📡 Appel à ${API_URL}/retrain"

curl -X POST ${API_URL}/retrain -H "Content-Type: application/json" | json_pp

echo "✅ Entraînement terminé"