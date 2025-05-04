#!/bin/bash

echo "🚀 Entraînement IA pour cubi-sniper..."

echo "🧠 Entraînement du modèle ROI/sec"
python3 ai_model/train_model.py

echo "🧠 Entraînement du modèle de sortie"
python3 ai_model/exit_predictor.py

echo "✅ Tous les modèles ont été entraînés."
