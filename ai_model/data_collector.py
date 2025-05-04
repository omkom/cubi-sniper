# Script de collecte des données historiques
import json
import requests
import time
from datetime import datetime, timedelta
import aiohttp
import asyncio
import pandas as pd
from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

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
        self.jupiter_api = os.getenv('JUPITER_API_URL', 'https://quote-api.jup.ag/v6')
        self.db_url = os.getenv('POSTGRES_URL', 'postgresql://postgres:postgres@postgres:5432/cubi')
        self.engine = create_engine(self.db_url)
        Base.metadata.create_all(self.engine)
        Session = sessionmaker(bind=self.engine)
        self.session = Session()
        
    async def collect_historical_data(self, start_date=None, end_date=None):
        """Collecte des données historiques depuis Jupiter"""
        if not start_date:
            start_date = datetime.now() - timedelta(days=30)
        if not end_date:
            end_date = datetime.now()
            
        pools_url = f"{self.jupiter_api}/pools"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(pools_url) as response:
                pools_data = await response.json()
                
                for pool in pools_data:
                    if self._is_valid_pool(pool):
                        token_data = TokenData(
                            mint=pool.get('inputMint'),
                            symbol=pool.get('inputSymbol'),
                            liquidity=pool.get('liquidity', 0.0),
                            volume=pool.get('volume', 0.0),
                            price=pool.get('price', 0.0),
                            holder_count=0,  # A enrichir avec d'autres sources
                            created_at=datetime.now(),
                            raw_data=pool
                        )
                        self.session.add(token_data)
                
                self.session.commit()
    
    def collect_trade_results(self, redis_client):
        """Collecte les résultats de trades depuis Redis"""
        # Récupérer les 1000 derniers trades
        trade_ids = redis_client.sort('exits', 'DESC', 'LIMIT', 0, 1000)
        
        for trade_id in trade_ids:
            trade_data = redis_client.json.get(trade_id, '$')[0]
            
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
        
        self.session.commit()
    
    def export_training_data(self, output_file='training_data.jsonl'):
        """Exporte les données d'entraînement"""
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
        ORDER BY tr.exit_time DESC
        """
        
        df = pd.read_sql_query(query, self.engine)
        
        # Transformer en format requis pour l'entraînement
        training_data = []
        for _, row in df.iterrows():
            entry = {
                "mint": row['mint'],
                "symbol": row['symbol'],
                "roi": row['roi'],
                "roi_per_sec": row['roi_per_sec'],
                "time_held": row['time_held'],
                "time_since_launch": row['features'].get('time_since_launch', 0),
                "holders": row['holder_count'],
                "volatility": row['features'].get('volatility', 0),
                "creator_score": row['features'].get('creator_score', 0.5),
                "exit_now": 1 if row['exit_reason'] in ['peak', 'roi_target'] else 0,
                "exit_label": row['exit_reason']
            }
            training_data.append(entry)
        
        # Sauvegarder en JSONL
        with open(output_file, 'w') as f:
            for entry in training_data:
                f.write(json.dumps(entry) + '\n')
                
        print(f"Exported {len(training_data)} training samples to {output_file}")
        return output_file
    
    def _is_valid_pool(self, pool):
        """Vérifie si le pool est valide pour l'entraînement"""
        return (
            pool.get('liquidity', 0) > 1.0 and
            pool.get('volume', 0) > 0 and
            pool.get('inputMint') is not None
        )

if __name__ == "__main__":
    import redis
    redis_client = redis.Redis(host='redis', port=6379)
    
    collector = DataCollector()
    
    # Collecter les données historiques
    asyncio.run(collector.collect_historical_data())
    
    # Collecter les résultats de trades
    collector.collect_trade_results(redis_client)
    
    # Exporter pour l'entraînement
    collector.export_training_data()