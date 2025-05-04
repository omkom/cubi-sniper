# Validation et A/B testing des modèles
import joblib
import json
import pandas as pd
import numpy as np
from sklearn.metrics import accuracy_score, mean_squared_error
from pathlib import Path
import os
import shutil

class ModelValidator:
    def __init__(self):
        self.models_dir = Path("models")
        self.staging_dir = self.models_dir / "staging"
        self.production_dir = self.models_dir / "production"
        self.backup_dir = self.models_dir / "backup"
        
        # Créer les dossiers nécessaires
        for dir_path in [self.staging_dir, self.production_dir, self.backup_dir]:
            dir_path.mkdir(parents=True, exist_ok=True)
    
    def validate_roi_model(self, test_data_path='test_data.csv'):
        """Valide le modèle ROI/sec"""
        # Charger les modèles
        production_model = joblib.load(self.production_dir / "roi_model.joblib")
        staging_model = joblib.load(self.staging_dir / "roi_model.joblib")
        scaler = joblib.load(self.staging_dir / "roi_scaler.joblib")
        
        # Charger les données de test
        df_test = pd.read_csv(test_data_path)
        features = ["time_since_launch", "holders", "volatility", "creator_score"]
        X_test = df_test[features]
        y_test = df_test["roi_per_sec"]
        
        # Prédictions
        X_test_scaled = scaler.transform(X_test)
        prod_predictions = production_model.predict(X_test_scaled)
        staging_predictions = staging_model.predict(X_test_scaled)
        
        # Métriques
        prod_mse = mean_squared_error(y_test, prod_predictions)
        staging_mse = mean_squared_error(y_test, staging_predictions)
        
        print(f"Production MSE: {prod_mse:.6f}")
        print(f"Staging MSE: {staging_mse:.6f}")
        
        # Décision
        improvement = (prod_mse - staging_mse) / prod_mse
        print(f"Amélioration: {improvement:.2%}")
        
        return staging_mse < prod_mse, improvement
    
    def validate_exit_model(self, test_data_path='test_data.csv'):
        """Valide le modèle de sortie"""
        # Charger les modèles
        production_model = joblib.load(self.production_dir / "exit_model.joblib")
        staging_model = joblib.load(self.staging_dir / "exit_model.joblib")
        
        # Charger les données de test
        df_test = pd.read_csv(test_data_path)
        features = ["time_since_buy", "roi", "roi_per_sec", "creator_score"]
        X_test = df_test[features]
        y_test = df_test["exit_now"]
        
        # Prédictions
        prod_predictions = production_model.predict(X_test)
        staging_predictions = staging_model.predict(X_test)
        
        # Métriques
        prod_accuracy = accuracy_score(y_test, prod_predictions)
        staging_accuracy = accuracy_score(y_test, staging_predictions)
        
        print(f"Production Accuracy: {prod_accuracy:.3f}")
        print(f"Staging Accuracy: {staging_accuracy:.3f}")
        
        # Décision
        improvement = staging_accuracy - prod_accuracy
        print(f"Amélioration: {improvement:.3f}")
        
        return staging_accuracy > prod_accuracy, improvement
    
    def run_ab_test(self, duration_hours=24):
        """Exécute un test A/B en production"""
        # Préparer le test A/B
        ab_config = {
            "start_time": str(datetime.now()),
            "duration_hours": duration_hours,
            "model_a": "production",
            "model_b": "staging",
            "traffic_split": 0.5,
            "metrics": {
                "roi_accuracy": [],
                "exit_accuracy": []
            }
        }
        
        with open("ab_test_config.json", "w") as f:
            json.dump(ab_config, f)
        
        print(f"Test A/B configuré pour {duration_hours}h")
        
    def promote_models(self):
        """Promeut les modèles de staging à production"""
        # Backup des modèles de production actuels
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_subdir = self.backup_dir / f"backup_{timestamp}"
        backup_subdir.mkdir()
        
        for model_file in self.production_dir.glob("*.joblib"):
            shutil.copy2(model_file, backup_subdir / model_file.name)
        
        # Copier les modèles de staging vers production
        for model_file in self.staging_dir.glob("*.joblib"):
            shutil.copy2(model_file, self.production_dir / model_file.name)
        
        print(f"Modèles promus de staging à production. Backup sauvegardé dans {backup_subdir}")
    
    def rollback_models(self, backup_timestamp=None):
        """Restaure les modèles depuis un backup"""
        if backup_timestamp is None:
            # Trouver le backup le plus récent
            backup_dirs = sorted(self.backup_dir.glob("backup_*"), reverse=True)
            if not backup_dirs:
                print("Aucun backup disponible")
                return
            backup_subdir = backup_dirs[0]
        else:
            backup_subdir = self.backup_dir / f"backup_{backup_timestamp}"
        
        if not backup_subdir.exists():
            print(f"Backup {backup_subdir} n'existe pas")
            return
        
        # Restaurer les modèles
        for model_file in backup_subdir.glob("*.joblib"):
            shutil.copy2(model_file, self.production_dir / model_file.name)
        
        print(f"Modèles restaurés depuis {backup_subdir}")
    
    def generate_report(self):
        """Génère un rapport de validation"""
        report = {
            "timestamp": str(datetime.now()),
            "models": {},
            "validation_results": {}
        }
        
        # Liste des modèles
        for model_file in self.production_dir.glob("*.joblib"):
            model_size = model_file.stat().st_size
            report["models"][model_file.name] = {
                "size_kb": model_size / 1024,
                "modified": str(datetime.fromtimestamp(model_file.stat().st_mtime))
            }
        
        # Sauvegarder le rapport
        with open("validation_report.json", "w") as f:
            json.dump(report, f, indent=2)
        
        return report

if __name__ == "__main__":
    from datetime import datetime
    validator = ModelValidator()
    
    # Validation des modèles
    roi_ok, roi_improvement = validator.validate_roi_model()
    exit_ok, exit_improvement = validator.validate_exit_model()
    
    # Décision de promotion
    if roi_ok and exit_ok:
        print("\n✅ Validation réussie. Promotion des modèles...")
        validator.promote_models()
    else:
        print("\n❌ Validation échouée. Les modèles actuels sont conservés.")
        if not roi_ok:
            print(f"ROI/sec: Dégradation de {roi_improvement:.2%}")
        if not exit_ok:
            print(f"Exit model: Dégradation de {exit_improvement:.3f}")
    
    # Générer le rapport
    report = validator.generate_report()
    print("\n📊 Rapport de validation généré")