# Planificateur d'entraînement intelligent
import schedule
import time
import subprocess
import os
import json
from datetime import datetime
import redis
from sqlalchemy import create_engine
import pandas as pd

class TrainingScheduler:
    def __init__(self):
        self.redis_url = os.getenv('REDIS_URL', 'redis://redis:6379')
        self.postgres_url = os.getenv('POSTGRES_URL', 'postgresql://postgres:postgres@postgres:5432/cubi')
        self.redis = redis.Redis.from_url(self.redis_url)
        self.engine = create_engine(self.postgres_url)
        
        # Seuils de déclenchement
        self.min_new_trades = 1000  # Minimum de nouveaux trades pour réentraîner
        self.min_accuracy = 0.80    # Seuil de performance minimale
        self.last_training = None
        
    def check_data_freshness(self):
        """Vérifie si assez de nouvelles données sont disponibles"""
        trades_count = self.redis.zcard('exits')
        last_count = self.redis.get('last_train_trades')
        
        if last_count is None:
            return True
            
        new_trades = trades_count - int(last_count)
        print(f"Nouveaux trades depuis dernier entraînement: {new_trades}")
        
        return new_trades >= self.min_new_trades
    
    def check_model_performance(self):
        """Vérifie les métriques de performance actuelles"""
        try:
            # Charger les métriques depuis le dernier entraînement
            metrics_file = 'models/metrics.json'
            if os.path.exists(metrics_file):
                with open(metrics_file, 'r') as f:
                    metrics = json.load(f)
                    
                accuracy = metrics.get('accuracy', 1.0)
                print(f"Performance actuelle: {accuracy}")
                
                return accuracy < self.min_accuracy
            return True
        except Exception as e:
            print(f"Erreur lecture métriques: {e}")
            return True
    
    def run_training(self):
        """Lance le processus d'entraînement"""
        print(f"[{datetime.now()}] Début de l'entraînement...")
        
        try:
            # 1. Collecter les nouvelles données
            print("Collecte des données...")
            collection_cmd = ["python", "data_collector.py"]
            subprocess.run(collection_cmd, check=True)
            
            # 2. Lancer l'entraînement
            print("Entraînement des modèles...")
            training_cmd = ["bash", "train.sh"]
            subprocess.run(training_cmd, check=True)
            
            # 3. Valider les nouveaux modèles
            print("Validation des modèles...")
            validation_cmd = ["python", "validate_models.py"]
            subprocess.run(validation_cmd, check=True)
            
            # 4. Mettre à jour Redis
            trades_count = self.redis.zcard('exits')
            self.redis.set('last_train_trades', trades_count)
            self.redis.set('last_train_time', datetime.now().timestamp())
            
            print(f"[{datetime.now()}] Entraînement terminé avec succès!")
            
        except subprocess.CalledProcessError as e:
            print(f"Erreur pendant l'entraînement: {e}")
        except Exception as e:
            print(f"Erreur inattendue: {e}")
    
    def should_train(self):
        """Détermine si un entraînement est nécessaire"""
        # Entraînement quotidien
        if not self.last_training or \
           (datetime.now() - self.last_training).days >= 1:
            return True
            
        # Entraînement basé sur les données
        if self.check_data_freshness():
            return True
            
        # Entraînement basé sur la performance
        if self.check_model_performance():
            return True
            
        return False
    
    def run_smart_scheduler(self):
        """Exécute le planificateur intelligent"""
        
        # Tâche quotidienne fixe
        schedule.every().day.at("03:00").do(self.run_training)
        
        # Vérification dynamique toutes les heures
        def check_and_train():
            if self.should_train():
                self.run_training()
                self.last_training = datetime.now()
        
        schedule.every().hour.do(check_and_train)
        
        print(f"Planificateur démarré. Prochaine vérification: {schedule.idle_seconds()}s")
        
        while True:
            schedule.run_pending()
            time.sleep(60)

if __name__ == "__main__":
    scheduler = TrainingScheduler()
    scheduler.run_smart_scheduler()