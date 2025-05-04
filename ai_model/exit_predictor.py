# Modèle IA pour prédiction du point de sortie optimal
import json
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from joblib import dump

def load_data(path="training_data.jsonl"):
    rows = []
    with open(path) as f:
        for line in f:
            rows.append(json.loads(line))
    return pd.DataFrame(rows)

def train():
    df = load_data()
    df["exit_now"] = (df["roi"] == df["roi_max_future"]).astype(int)
    features = ["time_since_buy", "roi", "roi_per_sec", "creator_score"]
    target = "exit_now"
    X = df[features]
    y = df[target]
    model = GradientBoostingClassifier(n_estimators=200)
    model.fit(X, y)
    dump(model, "exit_model.joblib")
    print("✅ Modèle de sortie entraîné.")

if __name__ == "__main__":
    train()
