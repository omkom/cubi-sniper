# Service Flask pour exposer les modèles IA
from flask import Flask, jsonify, request
import joblib
import numpy as np
import os
from pathlib import Path

app = Flask(__name__)

# Chargement des modèles
MODEL_DIR = Path("models") if os.path.exists("models") else Path(".")
ROI_MODEL = joblib.load(MODEL_DIR / "roi_model.joblib") if os.path.exists(MODEL_DIR / "roi_model.joblib") else None
EXIT_MODEL = joblib.load(MODEL_DIR / "exit_model.joblib") if os.path.exists(MODEL_DIR / "exit_model.joblib") else None

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "healthy",
        "roi_model": ROI_MODEL is not None,
        "exit_model": EXIT_MODEL is not None
    })

@app.route('/predict', methods=['POST'])
def predict_roi():
    if ROI_MODEL is None:
        return jsonify({"error": "ROI model not loaded"}), 500
    
    try:
        data = request.json
        features = data.get('features', [])
        
        # Format: [time_since_launch, holders, volatility, creator_score]
        if len(features) != 4:
            return jsonify({"error": "Invalid features. Expected 4 values."}), 400
        
        prediction = ROI_MODEL.predict([features])[0]
        
        return jsonify({
            "roi_per_sec": float(prediction),
            "features": {
                "time_since_launch": features[0],
                "holders": features[1],
                "volatility": features[2],
                "creator_score": features[3]
            }
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/exit', methods=['POST'])
def predict_exit():
    if EXIT_MODEL is None:
        return jsonify({"error": "Exit model not loaded"}), 500
    
    try:
        data = request.json
        features = data.get('features', [])
        
        # Format: [time_since_buy, roi, roi_per_sec, creator_score]
        if len(features) != 4:
            return jsonify({"error": "Invalid features. Expected 4 values."}), 400
        
        # Prédiction de probabilité (classification)
        prediction_proba = EXIT_MODEL.predict_proba([features])[0][1]
        should_exit = prediction_proba > 0.5
        
        return jsonify({
            "should_exit": bool(should_exit),
            "exit_probability": float(prediction_proba),
            "features": {
                "time_since_buy": features[0],
                "roi": features[1],
                "roi_per_sec": features[2],
                "creator_score": features[3]
            }
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/batch_predict', methods=['POST'])
def batch_predict():
    if ROI_MODEL is None:
        return jsonify({"error": "ROI model not loaded"}), 500
    
    try:
        data = request.json
        feature_list = data.get('features', [])
        
        predictions = []
        for features in feature_list:
            if len(features) != 4:
                predictions.append({"error": "Invalid features"})
                continue
                
            prediction = ROI_MODEL.predict([features])[0]
            predictions.append({"roi_per_sec": float(prediction)})
        
        return jsonify({"predictions": predictions})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/retrain', methods=['POST'])
def retrain_models():
    """Endpoint pour réentraîner les modèles avec de nouvelles données"""
    try:
        import subprocess
        
        # Exécuter le script d'entraînement
        result = subprocess.run(['./train.sh'], capture_output=True, text=True)
        
        if result.returncode == 0:
            # Recharger les modèles
            global ROI_MODEL, EXIT_MODEL
            ROI_MODEL = joblib.load(MODEL_DIR / "roi_model.joblib")
            EXIT_MODEL = joblib.load(MODEL_DIR / "exit_model.joblib")
            
            return jsonify({
                "status": "success",
                "message": "Models retrained successfully",
                "output": result.stdout
            })
        else:
            return jsonify({
                "status": "error",
                "message": "Training failed",
                "error": result.stderr
            }), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('AI_PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=True)