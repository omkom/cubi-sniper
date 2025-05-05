#!/usr/bin/env python3

import redis
import psycopg2
import json
import time
import logging
import os
from datetime import datetime, timedelta
import argparse

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(f'logs/migration_{datetime.now().strftime("%Y%m%d")}.log')
    ]
)
logger = logging.getLogger('redis_to_postgres')

class DataMigrator:
    def __init__(self):
        # Configuration Redis
        self.redis_host = os.getenv('REDIS_HOST', 'redis')
        self.redis_port = int(os.getenv('REDIS_PORT', '6379'))
        self.redis_db = int(os.getenv('REDIS_DB', '0'))
        self.redis_password = os.getenv('REDIS_PASSWORD', None)
        
        # Configuration PostgreSQL
        self.pg_host = os.getenv('POSTGRES_HOST', 'postgres')
        self.pg_port = int(os.getenv('POSTGRES_PORT', '5432'))
        self.pg_user = os.getenv('POSTGRES_USER', 'postgres')
        self.pg_password = os.getenv('POSTGRES_PASSWORD', 'postgres')
        self.pg_db = os.getenv('POSTGRES_DB', 'cubi')
        
        # Intervalle de migration en secondes
        self.migration_interval = int(os.getenv('MIGRATION_INTERVAL', '3600'))  # 1 heure par défaut
        
        # Dernière migration
        self.last_migration = None
        
        # Statistiques
        self.stats = {
            'tokens_migrated': 0,
            'trades_migrated': 0,
            'strategies_migrated': 0,
            'errors': 0
        }
        
        # Connexions
        self.redis_client = None
        self.pg_conn = None
        self.pg_cursor = None
    
    def connect(self):
        """Établit les connexions aux bases de données"""
        try:
            # Connexion Redis
            logger.info(f"Connexion à Redis: {self.redis_host}:{self.redis_port}")
            self.redis_client = redis.Redis(
                host=self.redis_host,
                port=self.redis_port,
                db=self.redis_db,
                password=self.redis_password,
                decode_responses=True
            )
            self.redis_client.ping()  # Vérifier la connexion
            
            # Connexion PostgreSQL
            logger.info(f"Connexion à PostgreSQL: {self.pg_host}:{self.pg_port}")
            self.pg_conn = psycopg2.connect(
                host=self.pg_host,
                port=self.pg_port,
                user=self.pg_user,
                password=self.pg_password,
                dbname=self.pg_db
            )
            self.pg_cursor = self.pg_conn.cursor()
            logger.info("Connexions établies")
            return True
        except Exception as e:
            logger.error(f"Erreur de connexion: {e}")
            return False
    
    def disconnect(self):
        """Ferme les connexions aux bases de données"""
        try:
            if self.pg_cursor:
                self.pg_cursor.close()
            if self.pg_conn:
                self.pg_conn.close()
            if self.redis_client:
                self.redis_client.close()
            logger.info("Connexions fermées")
        except Exception as e:
            logger.error(f"Erreur lors de la fermeture des connexions: {e}")
    
    def migrate_tokens(self):
        """Migre les données des tokens depuis Redis vers PostgreSQL"""
        try:
            # Récupérer la liste des tokens
            token_keys = self.redis_client.keys('token:*')
            logger.info(f"Trouvé {len(token_keys)} tokens à migrer")
            
            for key in token_keys:
                try:
                    # Récupérer les données du token
                    token_data_json = self.redis_client.get(key)
                    if not token_data_json:
                        continue
                    
                    # Parser le JSON
                    token_data = json.loads(token_data_json)
                    mint = token_data.get('mint')
                    
                    if not mint:
                        continue
                    
                    # Vérifier si le token existe déjà
                    self.pg_cursor.execute(
                        "SELECT id FROM cubi.token_data WHERE mint = %s",
                        (mint,)
                    )
                    result = self.pg_cursor.fetchone()
                    
                    if result:
                        # Mettre à jour le token existant
                        self.pg_cursor.execute(
                            """
                            UPDATE cubi.token_data SET
                                symbol = %s,
                                liquidity = %s,
                                volume = %s,
                                price = %s,
                                raw_data = %s
                            WHERE mint = %s
                            """,
                            (
                                token_data.get('symbol', ''),
                                float(token_data.get('liquidity', 0)),
                                float(token_data.get('volume', 0)),
                                float(token_data.get('price', 0)) if 'price' in token_data else None,
                                json.dumps(token_data),
                                mint
                            )
                        )
                    else:
                        # Insérer un nouveau token
                        self.pg_cursor.execute(
                            """
                            INSERT INTO cubi.token_data (
                                mint, symbol, liquidity, volume, price, holder_count, created_at, raw_data
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                            """,
                            (
                                mint,
                                token_data.get('symbol', ''),
                                float(token_data.get('liquidity', 0)),
                                float(token_data.get('volume', 0)),
                                float(token_data.get('price', 0)) if 'price' in token_data else None,
                                int(token_data.get('holders', 0)),
                                datetime.fromtimestamp(token_data.get('detected_at', time.time()) / 1000) if 'detected_at' in token_data else datetime.now(),
                                json.dumps(token_data)
                            )
                        )
                    
                    self.stats['tokens_migrated'] += 1
                    
                except Exception as e:
                    logger.error(f"Erreur lors de la migration du token {key}: {e}")
                    self.stats['errors'] += 1
            
            # Valider les modifications
            self.pg_conn.commit()
            logger.info(f"Migration des tokens terminée: {self.stats['tokens_migrated']} tokens migrés")
            
        except Exception as e:
            logger.error(f"Erreur lors de la migration des tokens: {e}")
            self.pg_conn.rollback()
            self.stats['errors'] += 1
    
    def migrate_trades(self):
        """Migre les données des trades depuis Redis vers PostgreSQL"""
        try:
            # Récupérer la liste des trades
            trade_ids = self.redis_client.zrange('exits', 0, -1)
            logger.info(f"Trouvé {len(trade_ids)} trades à migrer")
            
            for trade_id in trade_ids:
                try:
                    # Récupérer les données du trade
                    trade_data_json = self.redis_client.get(trade_id)
                    if not trade_data_json:
                        continue
                    
                    # Parser le JSON
                    trade_data = json.loads(trade_data_json)
                    
                    # Vérifier si le trade existe déjà
                    self.pg_cursor.execute(
                        "SELECT id FROM cubi.trade_data WHERE token_mint = %s AND exit_time = %s",
                        (
                            trade_data.get('token'),
                            datetime.fromtimestamp(trade_data.get('sell_time', 0))
                        )
                    )
                    result = self.pg_cursor.fetchone()
                    
                    if result:
                        # Le trade existe déjà, sauter
                        continue
                    
                    # Insérer un nouveau trade
                    self.pg_cursor.execute(
                        """
                        INSERT INTO cubi.trade_data (
                            token_mint, strategy_id, entry_price, exit_price, roi, roi_per_sec,
                            time_held, entry_time, exit_time, features, exit_reason
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            trade_data.get('token'),
                            trade_data.get('strategy'),
                            float(trade_data.get('buy_price', 0)),
                            float(trade_data.get('sell_price', 0)),
                            float(trade_data.get('roi', 0)),
                            float(trade_data.get('roi_per_sec', 0)),
                            float(trade_data.get('time_held', 0)),
                            datetime.fromtimestamp(trade_data.get('buy_time', 0)),
                            datetime.fromtimestamp(trade_data.get('sell_time', 0)),
                            json.dumps(trade_data.get('features', {})),
                            trade_data.get('exit_reason', '')
                        )
                    )
                    
                    self.stats['trades_migrated'] += 1
                    
                except Exception as e:
                    logger.error(f"Erreur lors de la migration du trade {trade_id}: {e}")
                    self.stats['errors'] += 1
            
            # Valider les modifications
            self.pg_conn.commit()
            logger.info(f"Migration des trades terminée: {self.stats['trades_migrated']} trades migrés")
            
        except Exception as e:
            logger.error(f"Erreur lors de la migration des trades: {e}")
            self.pg_conn.rollback()
            self.stats['errors'] += 1
    
    def migrate_strategies(self):
        """Migre les statistiques des stratégies depuis Redis vers PostgreSQL"""
        try:
            # Récupérer la liste des stratégies
            strategy_keys = self.redis_client.keys('strategy:*')
            logger.info(f"Trouvé {len(strategy_keys)} stratégies à migrer")
            
            for key in strategy_keys:
                try:
                    # Récupérer les données de la stratégie
                    strategy_data = self.redis_client.hgetall(key)
                    if not strategy_data:
                        continue
                    
                    strategy_id = key.split(':')[1]
                    
                    # Valeurs par défaut
                    roi_sum = float(strategy_data.get('roi_sum', 0))
                    roi_sec_sum = float(strategy_data.get('roi_sec_sum', 0))
                    trades = int(strategy_data.get('trades', 0))
                    wins = int(strategy_data.get('wins', 0))
                    draws = float(strategy_data.get('drawdowns', 0))
                    
                    # Insérer dans la table de statistiques
                    self.pg_cursor.execute(
                        """
                        INSERT INTO cubi.backtest_results (
                            strategy_id, roi, roi_per_sec, win, timestamp
                        ) VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (strategy_id, timestamp) DO UPDATE SET
                            roi = EXCLUDED.roi,
                            roi_per_sec = EXCLUDED.roi_per_sec,
                            win = EXCLUDED.win
                        """,
                        (
                            strategy_id,
                            roi_sum / max(trades, 1),
                            roi_sec_sum / max(trades, 1),
                            wins > trades / 2,
                            datetime.now()
                        )
                    )
                    
                    self.stats['strategies_migrated'] += 1
                    
                except Exception as e:
                    logger.error(f"Erreur lors de la migration de la stratégie {key}: {e}")
                    self.stats['errors'] += 1
            
            # Valider les modifications
            self.pg_conn.commit()
            logger.info(f"Migration des stratégies terminée: {self.stats['strategies_migrated']} stratégies migrées")
            
        except Exception as e:
            logger.error(f"Erreur lors de la migration des stratégies: {e}")
            self.pg_conn.rollback()
            self.stats['errors'] += 1
    
    def refresh_materialized_views(self):
        """Rafraîchit les vues matérialisées"""
        try:
            self.pg_cursor.execute("REFRESH MATERIALIZED VIEW cubi.daily_stats")
            self.pg_conn.commit()
            logger.info("Vues matérialisées rafraîchies")
        except Exception as e:
            logger.error(f"Erreur lors du rafraîchissement des vues matérialisées: {e}")
            self.pg_conn.rollback()
    
    def run_migration(self):
        """Exécute la migration complète"""
        if not self.connect():
            return False
        
        try:
            # Réinitialiser les statistiques
            self.stats = {
                'tokens_migrated': 0,
                'trades_migrated': 0,
                'strategies_migrated': 0,
                'errors': 0
            }
            
            # Migrer les données
            self.migrate_tokens()
            self.migrate_trades()
            self.migrate_strategies()
            
            # Rafraîchir les vues matérialisées
            self.refresh_materialized_views()
            
            # Mettre à jour la dernière migration
            self.last_migration = datetime.now()
            
            logger.info(f"Migration terminée: {self.stats}")
            return True
            
        except Exception as e:
            logger.error(f"Erreur lors de la migration: {e}")
            return False
        finally:
            self.disconnect()
    
    def run_continuous(self):
        """Exécute la migration en continu selon l'intervalle défini"""
        logger.info(f"Démarrage du service de migration (intervalle: {self.migration_interval}s)")
        
        while True:
            try:
                # Exécuter la migration
                self.run_migration()
                
                # Attendre l'intervalle
                logger.info(f"Prochaine migration dans {self.migration_interval / 60:.1f} minutes")
                time.sleep(self.migration_interval)
                
            except KeyboardInterrupt:
                logger.info("Arrêt du service de migration")
                break
            except Exception as e:
                logger.error(f"Erreur inattendue: {e}")
                time.sleep(60)  # Attendre 1 minute en cas d'erreur

if __name__ == "__main__":
    # Créer le répertoire de logs
    os.makedirs('logs', exist_ok=True)
    
    # Parser les arguments
    parser = argparse.ArgumentParser(description='Migration Redis vers PostgreSQL pour Cubi-sniper')
    parser.add_argument('--once', action='store_true', help='Exécuter une seule migration')
    parser.add_argument('--interval', type=int, default=0, help='Intervalle de migration en secondes')
    args = parser.parse_args()
    
    # Créer le migrateur
    migrator = DataMigrator()
    
    # Exécuter en fonction des arguments
    if args.once:
        logger.info("Exécution d'une migration unique")
        migrator.run_migration()
    else:
        # Utiliser l'intervalle spécifié en argument ou celui de l'environnement
        if args.interval > 0:
            migrator.migration_interval = args.interval
        
        logger.info(f"Démarrage du service continu (intervalle: {migrator.migration_interval} secondes)")
        migrator.run_continuous()