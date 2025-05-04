# Modèle IA pour prédiction du point de sortie optimal
import json
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
from joblib import dump
import os
from pathlib import Path

def load_data(path=None):
    """Charge les données d'entraînement depuis un fichier JSONL"""
    if path is None:
        path = os.getenv('TRAINING_DATA_PATH', 'training_data.jsonl')
    
    if not os.path.exists(path):
        create_example_data(path)
    
    rows = []
    with open(path) as f:
        for line in f:
            if line.strip():
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    print(f"Warning: Skipping invalid JSON line")
                    continue
    
    return pd.DataFrame(rows)

def create_example_data(path):
    """Crée des données d'exemple pour l'entraînement de la sortie"""
    import random
    
    print(f"Creating example exit training data at {path}")
    
    with open(path, 'w') as f:
        for i in range(1000):
            # Générer des données réalistes
            time_since_buy = random.uniform(10, 500)
            roi = random.uniform(-0.5, 5.0)
            roi_per_sec = roi / time_since_buy if time_since_buy > 0 else 0
            creator_score = random.uniform(0.7, 1.0)
            
            # Déterminer si c'est le point de sortie optimal
            # Basé sur des règles simples pour l'exemple
            roi_max_future = roi + random.uniform(-0.1, 0.5)
            exit_now = 1 if roi >= roi_max_future * 0.9 else 0
            
            data = {
                "time_since_buy": time_since_buy,
                "roi": roi,
                "roi_per_sec": roi_per_sec,
                "creator_score": creator_score,
                "exit_now": exit_now,
                "roi_max_future": roi_max_future
            }
            
            f.write(json.dumps(data) + '\n')

def train():
    """Entraîne le modèle de prédiction de sortie"""
    # Charger les données
    df = load_data()
    
    if len(df) < 10:
        print("Warning: Not enough data for training. Generated example data.")
        df = load_data()
    
    # Préparer les données
    if 'exit_now' not in df.columns:
        # Créer la colonne cible si elle n'existe pas
        if 'roi_max_future' in df.columns:
            df["exit_now"] = (df["roi"] == df["roi_max_future"]).astype(int)
        else:
            # Approximation : sortir si le ROI/sec diminue
            df["exit_now"] = (df["roi_per_sec"] < df["roi_per_sec"].shift(1)).astype(int)
    
    # Définir les features et target
    features = ["time_since_buy", "roi", "roi_per_sec", "creator_score"]
    target = "exit_now"
    
    # Vérifier que toutes les features existent
    missing_features = [f for f in features if f not in df.columns]
    if missing_features:
        raise ValueError(f"Missing required features: {missing_features}")
    
    X = df[features]
    y = df[target]
    
    # Diviser en train/test
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Entraîner le modèle
    model = GradientBoostingClassifier(n_estimators=200, learning_rate=0.1, max_depth=3)
    model.fit(X_train, y_train)
    
    # Évaluer
    y_pred = model.predict(X_test)
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred))
    
    # Sauvegarder le modèle
    model_path = Path("models") if os.path.exists("models") else Path(".")
    dump(model, model_path / "exit_model.joblib")
    
    print(f"✅ Modèle de sortie entraîné et sauvegardé dans {model_path}")
    
    return model

if __name__ == "__main__":
    train()