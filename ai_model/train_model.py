# Entraîne le modèle principal de prédiction ROI/sec
import json
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from joblib import dump
import os
from pathlib import Path

def load_data(path=None):
    """Charge les données d'entraînement depuis un fichier JSONL"""
    # Utiliser le chemin d'environnement ou valeur par défaut
    if path is None:
        path = os.getenv('TRAINING_DATA_PATH', 'training_data.jsonl')
    
    # Vérifier si le fichier existe
    if not os.path.exists(path):
        # Créer un fichier exemple si absent
        create_example_data(path)
    
    rows = []
    with open(path) as f:
        for line in f:
            if line.strip():  # Ignorer les lignes vides
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    print(f"Warning: Skipping invalid JSON line")
                    continue
    
    return pd.DataFrame(rows)

def create_example_data(path):
    """Crée des données d'exemple pour l'entraînement"""
    import random
    
    print(f"Creating example training data at {path}")
    
    with open(path, 'w') as f:
        for i in range(1000):
            # Générer des données réalistes
            time_since_launch = random.uniform(10, 300)
            holders = random.randint(10, 1000)
            volatility = random.uniform(0.1, 0.5)
            creator_score = random.uniform(0.7, 1.0)
            
            # Générer un ROI/sec réaliste basé sur les features
            roi_per_sec = 0.001 * (
                (1 - volatility) * 2 +
                (holders / 100) * 0.5 +
                creator_score * 3 -
                (time_since_launch / 100) * 0.5 +
                random.uniform(-0.01, 0.01)
            )
            
            data = {
                "time_since_launch": time_since_launch,
                "holders": holders,
                "volatility": volatility,
                "creator_score": creator_score,
                "roi_per_sec": roi_per_sec
            }
            
            f.write(json.dumps(data) + '\n')

def train():
    """Entraîne le modèle ROI/sec"""
    # Charger les données
    df = load_data()
    
    if len(df) < 10:
        print("Warning: Not enough data for training. Generated example data.")
        df = load_data()  # Reloader après création
    
    # Définir les features et target
    features = ["time_since_launch", "holders", "volatility", "creator_score"]
    target = "roi_per_sec"
    
    # Préparer les données
    X = df[features]
    y = df[target]
    
    # Diviser en train/test
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Standardiser les features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Entraîner le modèle
    model = Ridge(alpha=0.5)
    model.fit(X_train_scaled, y_train)
    
    # Évaluer
    score = model.score(X_test_scaled, y_test)
    print(f"R² Score: {score:.3f}")
    
    # Sauvegarder le modèle
    model_path = Path("models") if os.path.exists("models") else Path(".")
    dump(model, model_path / "roi_model.joblib")
    dump(scaler, model_path / "roi_scaler.joblib")
    
    print(f"✅ Modèle ROI/sec entraîné et sauvegardé dans {model_path}")
    
    return model, scaler

if __name__ == "__main__":
    train()