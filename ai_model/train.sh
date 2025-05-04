#!/bin/bash

echo "🚀 Entraînement IA pour cubi-sniper..."

# Créer le dossier models s'il n'existe pas
mkdir -p models

# Configuration des variables d'environnement
export TRAINING_DATA_PATH=${TRAINING_DATA_PATH:-"training_data.jsonl"}

# Vérifier que Python est installé
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 n'est pas installé"
    exit 1
fi

# Vérifier que les dépendances sont installées
echo "📦 Vérification des dépendances..."
python3 -c "import pandas; import sklearn; import joblib" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️ Installation des dépendances manquantes..."
    pip install -r requirements.txt
fi

echo "🧠 Entraînement du modèle ROI/sec"
python3 train_model.py

echo "🧠 Entraînement du modèle de sortie"
python3 exit_predictor.py

# Vérifier que les modèles ont été créés
if [ -f "models/roi_model.joblib" ] && [ -f "models/exit_model.joblib" ]; then
    echo "✅ Tous les modèles ont été entraînés avec succès!"
    echo "📊 Statistiques:"
    echo "   - ROI model: $(du -h models/roi_model.joblib | cut -f1)"
    echo "   - Exit model: $(du -h models/exit_model.joblib | cut -f1)"
else
    echo "❌ Erreur: Certains modèles n'ont pas été créés"
    exit 1
fi