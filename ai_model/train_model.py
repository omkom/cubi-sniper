# Entraîne le modèle principal de prédiction ROI/sec
import json
import pandas as pd
from sklearn.linear_model import Ridge
from joblib import dump

def load_data(path="training_data.jsonl"):
    rows = []
    with open(path) as f:
        for line in f:
            rows.append(json.loads(line))
    return pd.DataFrame(rows)

def train():
    df = load_data()
    features = ["time_since_launch", "holders", "volatility", "creator_score"]
    target = "roi_per_sec"
    X = df[features]
    y = df[target]
    model = Ridge(alpha=0.5)
    model.fit(X, y)
    dump(model, "roi_model.joblib")
    print("✅ Modèle ROI/sec entraîné et sauvegardé.")

if __name__ == "__main__":
    train()
