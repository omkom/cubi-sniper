# Script de collecte des données historiques
import json
import requests
import time
from datetime import datetime, timedelta
import asyncio
import pandas as pd
from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
import sys
import argparse
import redis
import logging

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('data_collector.log')
    ]
)
logger = logging.getLogger('data_collector')

Base = declarative_base()

class TokenData(Base):
    __tablename__ = 'token_data'
    
    id = Column(Integer, primary_key=True)
    mint = Column(String, index=True)
    symbol = Column(String)
    liquidity = Column(Float)
    volume = Column(Float)
    price = Column(Float)
    holder_count = Column(Integer)
    created_at = Column(DateTime)
    raw_data = Column(JSON)

class TradeData(Base):
    __tablename__ = 'trade_data'
    
    id = Column(Integer, primary_key=True)
    token_mint = Column(String, index=True)
    strategy_id = Column(String)
    entry_price = Column(Float)
    exit_price = Column(Float)
    roi = Column(Float)
    roi_per_sec = Column(Float)
    time_held = Column(Float)
    entry_time = Column(DateTime)
    exit_time = Column(DateTime)
    features = Column(JSON)
    exit_reason = Column(String)

class DataCollector:
    def __init__(self):
        # URLs des API
        self.jupiter_api = os.getenv('JUPITER_API_URL', 'https://quote-api.jup.ag/v4')
        
        # Connexion à PostgreSQL
        self.db_url = os.getenv('POSTGRES_URL', 'postgresql://postgres:postgres@postgres:5432/cubi')
        
        # Configuration Redis
        self.redis_url = os.getenv('REDIS_URL', 'redis://redis:6379/0')
        
        # Fichier de sortie pour l'entraînement
        self.output_file = os.getenv('TRAINING_DATA_PATH', 'training_data.jsonl')
        
        # Données persistantes (initialiser une fois)
        self.engine = None
        self.session = None
        self.redis_client = None
        
        # S'assurer que le répertoire de sortie existe
        os.makedirs(os.path.dirname(os.path.abspath(self.output_file)), exist_ok=True)
    
    def connect_db(self):
        """Établit les connexions aux bases de données"""
        try:
            # Connexion PostgreSQL
            if not self.engine:
                logger.info(f"Connexion à PostgreSQL: {self.db_url}")
                self.engine = create_engine(self.db_url)
                # Création des tables si nécessaire
                Base.metadata.create_all(self.engine)
                Session = sessionmaker(bind=self.engine)
                self.session = Session()
                logger.info("Connexion PostgreSQL établie")
            
            # Connexion Redis
            if not self.redis_client:
                logger.info(f"Connexion à Redis: {self.redis_url}")
                self.redis_client = redis.from_url(self.redis_url)
                # Test de la connexion
                self.redis_client.ping()
                logger.info("Connexion Redis établie")
                
            return True
        except Exception as e:
            logger.error(f"Erreur de connexion aux bases de données: {e}")
            return False
    
    async def collect_historical_data(self, start_date=None, end_date=None):
        """Collecte des données historiques depuis Jupiter"""
        if not self.connect_db():
            return False
            
        if not start_date:
            start_date = datetime.now() - timedelta(days=30)
        if not end_date:
            end_date = datetime.now()
            
        # Token SOL
        base_token = "So11111111111111111111111111111111111111112"
        
        # Tokens populaires
        popular_tokens = [
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",  # USDC
            "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",   # mSOL
            "7i5KKsX2wMndYStRmVMGtNmp7hLvnypWxGofLiBwWnZ9",  # GMT
            "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",  # BONK
            "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",  # SAMO
        ]
        
        logger.info(f"Collecte de données pour {len(popular_tokens)} tokens populaires")
        
        # Utilisation de aiohttp pour des requêtes asynchrones
        import aiohttp
        
        async with aiohttp.ClientSession() as session:
            for token_mint in popular_tokens:
                try:
                    # Endpoint de quote
                    quote_url = f"{self.jupiter_api}/quote?inputMint={base_token}&outputMint={token_mint}&amount=1000000000&slippage=1"
                    
                    async with session.get(quote_url) as response:
                        if response.status != 200:
                            logger.warning(f"Erreur {response.status} pour {token_mint}")
                            continue
                            
                        data = await response.json()
                        
                        if not data:
                            logger.warning(f"Pas de données pour {token_mint}")
                            continue
                        
                        # Extraire les infos pertinentes
                        token_data = TokenData(
                            mint=token_mint,
                            symbol=token_mint[:6],  # Simplifié
                            liquidity=data.get('inAmount', 0) / 1000000000,  # Convertir en SOL
                            volume=data.get('outAmount', 0) / 1000000000,
                            price=data.get('outAmount', 0) / data.get('inAmount', 1) if data.get('inAmount', 0) > 0 else 0,
                            holder_count=0,  # Pas disponible
                            created_at=datetime.now(),
                            raw_data=data
                        )
                        
                        self.session.add(token_data)
                        logger.info(f"Ajout des données pour {token_mint}")
                        
                except Exception as e:
                    logger.error(f"Erreur pour {token_mint}: {e}")
                    
                # Pause pour éviter les rate limits
                await asyncio.sleep(1)
                
            self.session.commit()
            logger.info("Collecte de données terminée")
            return True
    
    def collect_trade_results(self):
        """Collecte les résultats de trades depuis Redis"""
        if not self.connect_db():
            return False
            
        try:
            # Récupérer les derniers trades
            trade_ids = self.redis_client.zrange('exits', 0, 999, desc=True)
            
            logger.info(f"Récupération de {len(trade_ids)} trades depuis Redis")
            
            count = 0
            for trade_id in trade_ids:
                # Support du format string (Redis standard) ou JSON (ReJSON)
                try:
                    # Cas 1: Redis normal avec chaînes JSON
                    trade_data_json = self.redis_client.get(trade_id)
                    if not trade_data_json:
                        # Cas 2: ReJSON
                        try:
                            trade_data_json = self.redis_client.execute_command('JSON.GET', trade_id, '$')
                        except:
                            continue
                    
                    if not trade_data_json:
                        continue
                        
                    # Parse JSON
                    if isinstance(trade_data_json, bytes):
                        trade_data_json = trade_data_json.decode('utf-8')
                    
                    trade_data = json.loads(trade_data_json)
                    
                    # Convertir en objet Trade
                    trade_entry = TradeData(
                        token_mint=trade_data.get('token'),
                        strategy_id=trade_data.get('strategy'),
                        entry_price=trade_data.get('buy_price'),
                        exit_price=trade_data.get('sell_price'),
                        roi=trade_data.get('roi'),
                        roi_per_sec=trade_data.get('roi_per_sec'),
                        time_held=trade_data.get('time_held'),
                        entry_time=datetime.fromtimestamp(trade_data.get('buy_time', 0)),
                        exit_time=datetime.fromtimestamp(trade_data.get('sell_time', 0)),
                        features=trade_data.get('features'),
                        exit_reason=trade_data.get('exit_reason')
                    )
                    
                    self.session.add(trade_entry)
                    count += 1
                    
                except Exception as e:
                    logger.error(f"Erreur traitement trade {trade_id}: {e}")
            
            self.session.commit()
            logger.info(f"Collecte terminée: {count} trades importés")
            return True
            
        except Exception as e:
            logger.error(f"Erreur générale collecte: {e}")
            return False
    
    def export_training_data(self):
        """Exporte les données d'entraînement pour l'IA"""
        if not self.connect_db():
            return None
            
        try:
            # Requête SQL combinant les données token et trade
            query = """
            SELECT 
                t.mint,
                t.symbol,
                t.liquidity,
                t.volume,
                t.price,
                t.holder_count,
                tr.roi,
                tr.roi_per_sec,
                tr.time_held,
                tr.exit_reason,
                tr.features
            FROM token_data t
            JOIN trade_data tr ON t.mint = tr.token_mint
            WHERE tr.roi IS NOT NULL
            ORDER BY tr.exit_time DESC
            LIMIT 10000
            """
            
            df = pd.read_sql_query(query, self.engine)
            
            # Si pas assez de données, essayer de récupérer directement depuis Redis
            if len(df) < 100:
                logger.info("Pas assez de données dans PostgreSQL, interrogation Redis...")
                trading_data = []
                
                # Récupérer les derniers trades depuis Redis
                trade_ids = self.redis_client.zrange('exits', 0, 999, desc=True)
                
                for trade_id in trade_ids:
                    try:
                        # Support des formats Redis standard et ReJSON
                        try:
                            trade_data_json = self.redis_client.get(trade_id)
                            if not trade_data_json:
                                trade_data_json = self.redis_client.execute_command('JSON.GET', trade_id, '$')
                        except:
                            continue
                        
                        if not trade_data_json:
                            continue
                            
                        # Parse JSON
                        if isinstance(trade_data_json, bytes):
                            trade_data_json = trade_data_json.decode('utf-8')
                            
                        trade_data = json.loads(trade_data_json)
                        
                        # Récupérer les infos token
                        token_key = f"token:{trade_data.get('token')}"
                        try:
                            token_data_json = self.redis_client.get(token_key)
                            if not token_data_json:
                                token_data_json = self.redis_client.execute_command('JSON.GET', token_key, '$')
                                
                            if isinstance(token_data_json, bytes):
                                token_data_json = token_data_json.decode('utf-8')
                                
                            token_data = json.loads(token_data_json)
                        except:
                            token_data = {}
                            
                        # Combiner les données
                        trading_data.append({
                            "mint": trade_data.get('token'),
                            "symbol": token_data.get('symbol', ''),
                            "roi": trade_data.get('roi'),
                            "roi_per_sec": trade_data.get('roi_per_sec'),
                            "time_held": trade_data.get('time_held'),
                            "liquidity": token_data.get('liquidity', 0),
                            "volume": token_data.get('volume', 0),
                            "price": token_data.get('price', 0),
                            "holder_count": token_data.get('holder_count', 0),
                            "exit_reason": trade_data.get('exit_reason'),
                            "features": trade_data.get('features', {})
                        })
                    except Exception as e:
                        logger.error(f"Erreur récupération Redis {trade_id}: {e}")
                
                # Convertir en DataFrame
                if trading_data:
                    df = pd.DataFrame(trading_data)
            
            # Transformer pour l'entraînement
            training_data = []
            for _, row in df.iterrows():
                features = row['features'] if isinstance(row['features'], dict) else {}
                
                entry = {
                    "mint": row['mint'],
                    "symbol": row.get('symbol', ''),
                    "roi": row.get('roi', 0),
                    "roi_per_sec": row.get('roi_per_sec', 0),
                    "time_held": row.get('time_held', 0),
                    "time_since_launch": features.get('time_since_launch', 60),
                    "holders": row.get('holder_count', 50),
                    "volatility": features.get('volatility', 0.2),
                    "creator_score": features.get('creator_score', 0.5),
                    "exit_now": 1 if row.get('exit_reason') in ['peak', 'roi_target'] else 0,
                    "exit_label": row.get('exit_reason')
                }
                training_data.append(entry)
            
            # Générer des données synthétiques si pas assez de vraies données
            if len(training_data) < 100:
                logger.warning("Pas assez de données, génération de données synthétiques")
                training_data.extend(self._generate_synthetic_data(100 - len(training_data)))
            
            # Sauvegarder en JSONL
            with open(self.output_file, 'w') as f:
                for entry in training_data:
                    f.write(json.dumps(entry) + '\n')
                    
            logger.info(f"Exportation de {len(training_data)} échantillons vers {self.output_file}")
            return self.output_file
            
        except Exception as e:
            logger.error(f"Erreur exportation: {e}")
            return None
    
    def _generate_synthetic_data(self, count=100):
        """Génère des données synthétiques pour l'entraînement"""
        import random
        
        synthetic_data = []
        for i in range(count):
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
            
            time_held = random.uniform(20, 200)
            roi = roi_per_sec * time_held
            
            # Déterminer si c'est un point de sortie
            exit_now = 1 if random.random() > 0.7 else 0
            exit_reasons = ['peak', 'roi_target', 'stagnation', 'stop_loss']
            
            data = {
                "mint": f"synthetic_{i}",
                "symbol": f"SYN_{i}",
                "time_since_launch": time_since_launch,
                "holders": holders,
                "volatility": volatility,
                "creator_score": creator_score,
                "roi_per_sec": roi_per_sec,
                "roi": roi,
                "time_held": time_held,
                "exit_now": exit_now,
                "exit_label": random.choice(exit_reasons)
            }
            
            synthetic_data.append(data)
        
        logger.info(f"Génération de {count} données synthétiques")
        return synthetic_data
            
    def run(self, mode='full'):
        """Exécute le collecteur de données selon le mode choisi"""
        if mode == 'historical' or mode == 'full':
            asyncio.run(self.collect_historical_data())
            
        if mode == 'trades' or mode == 'full':
            self.collect_trade_results()
            
        if mode == 'export' or mode == 'full':
            self.export_training_data()
            
        return True

def main():
    parser = argparse.ArgumentParser(description='Data collection for Cubi-sniper')
    parser.add_argument('--schedule', choices=['hourly', 'daily', 'once'], default='once',
                      help='Schedule for data collection')
    parser.add_argument('--mode', choices=['full', 'historical', 'trades', 'export'], default='full',
                      help='Mode of operation')
    args = parser.parse_args()
    
    collector = DataCollector()
    
    if args.schedule == 'once':
        logger.info(f"Mode unique: {args.mode}")
        collector.run(args.mode)
        
    elif args.schedule == 'hourly':
        logger.info("Mode horaire démarré")
        while True:
            try:
                collector.run(args.mode)
                logger.info("Attente de 1 heure...")
                time.sleep(3600)
            except KeyboardInterrupt:
                logger.info("Arrêt manuel du collecteur")
                break
            except Exception as e:
                logger.error(f"Erreur dans la boucle horaire: {e}")
                time.sleep(300)  # Attendre 5 minutes en cas d'erreur
                
    elif args.schedule == 'daily':
        logger.info("Mode quotidien démarré")
        while True:
            try:
                collector.run(args.mode)
                
                # Calculer l'heure du prochain run (à 3h du matin)
                now = datetime.now()
                next_run = now.replace(hour=3, minute=0, second=0, microsecond=0)
                if now.hour >= 3:
                    next_run = next_run + timedelta(days=1)
                
                sleep_seconds = (next_run - now).total_seconds()
                logger.info(f"Prochain run dans {sleep_seconds/3600:.1f} heures")
                time.sleep(sleep_seconds)
                
            except KeyboardInterrupt:
                logger.info("Arrêt manuel du collecteur")
                break
            except Exception as e:
                logger.error(f"Erreur dans la boucle quotidienne: {e}")
                time.sleep(3600)  # Attendre 1 heure en cas d'erreur

if __name__ == "__main__":
    main()