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
import sys
import argparse

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
        # Using v4 instead of v6 for Jupiter API as v6 might not be available yet
        self.jupiter_api = os.getenv('JUPITER_API_URL', 'https://quote-api.jup.ag/v4')
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
            
        # Using v4 route format instead of v6
        base_token = "So11111111111111111111111111111111111111112"  # SOL
        
        # Collect some popular token data as examples
        popular_tokens = [
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",  # USDC
            "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",   # mSOL
            "7i5KKsX2wMndYStRmVMGtNmp7hLvnypWxGofLiBwWnZ9",  # GMT
            "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",  # BONK
            "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",  # SAMO
        ]
        
        print(f"Collecting data for {len(popular_tokens)} popular tokens")
        
        async with aiohttp.ClientSession() as session:
            for token_mint in popular_tokens:
                try:
                    # Using the quote endpoint to get price data
                    quote_url = f"{self.jupiter_api}/quote?inputMint={base_token}&outputMint={token_mint}&amount=1000000000&slippage=1"
                    
                    async with session.get(quote_url) as response:
                        if response.status != 200:
                            print(f"Error getting data for {token_mint}: {response.status}")
                            continue
                            
                        data = await response.json()
                        
                        if not data or 'data' not in data:
                            print(f"No data returned for {token_mint}")
                            continue
                        
                        # Extract relevant data
                        token_data = TokenData(
                            mint=token_mint,
                            symbol=token_mint[:6],  # Simplified
                            liquidity=data.get('inAmount', 0) / 1000000000,  # Convert lamports to SOL
                            volume=data.get('outAmount', 0) / 1000000000,  # Simplified volume measure
                            price=data.get('outAmount', 0) / data.get('inAmount', 1) if data.get('inAmount', 0) > 0 else 0,
                            holder_count=0,  # Not available in this API
                            created_at=datetime.now(),
                            raw_data=data
                        )
                        
                        self.session.add(token_data)
                        print(f"Added data for token: {token_mint}")
                        
                except Exception as e:
                    print(f"Error processing token {token_mint}: {e}")
                    
                # Sleep to avoid rate limiting
                await asyncio.sleep(1)
                
            self.session.commit()
            print("Token data collection completed")
    
    def collect_trade_results(self, redis_client):
        """Collecte les résultats de trades depuis Redis"""
        try:
            # Récupérer les 1000 derniers trades
            trade_ids = redis_client.zrange('exits', 0, 999, desc=True)
            
            for trade_id in trade_ids:
                # For Redis JSON commands
                trade_data_json = redis_client.call('JSON.GET', trade_id, '
)
                
                if not trade_data_json:
                    continue
                    
                trade_data = json.loads(trade_data_json)
                
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
            print(f"Collected {len(trade_ids)} trade results")
            
        except Exception as e:
            print(f"Error collecting trade results: {e}")
    
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
            features = row['features'] if isinstance(row['features'], dict) else {}
            
            entry = {
                "mint": row['mint'],
                "symbol": row['symbol'],
                "roi": row['roi'],
                "roi_per_sec": row['roi_per_sec'],
                "time_held": row['time_held'],
                "time_since_launch": features.get('time_since_launch', 0),
                "holders": row['holder_count'],
                "volatility": features.get('volatility', 0),
                "creator_score": features.get('creator_score', 0.5),
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
    
    def redis_json_set(redis_client, key, path, json_data):
        # Store JSON as a string in Redis
        json_string = json.dumps(json_data)
        return redis_client.set(key, json_string)

    def redis_json_get(redis_client, key, path='$'):
        # Retrieve JSON string from Redis
        json_string = redis_client.get(key)
        if not json_string:
            return None
        
        try:
            return json.loads(json_string)
        except json.JSONDecodeError as e:
            print(f"Error parsing JSON from Redis key {key}: {e}")
            return None

def main():
    parser = argparse.ArgumentParser(description='Data collection for Cubi-sniper')
    parser.add_argument('--schedule', choices=['hourly', 'daily', 'once'], default='once',
                      help='Schedule for data collection')
    args = parser.parse_args()
    
    try:
        import redis
        redis_client = redis.Redis.from_url(os.getenv('REDIS_URL', 'redis://redis:6379'))
        
        collector = DataCollector()
        
        # Collecter les données historiques
        asyncio.run(collector.collect_historical_data())
        
        # Collecter les résultats de trades
        collector.collect_trade_results(redis_client)
        
        # Exporter pour l'entraînement
        collector.export_training_data()
        
        # If hourly schedule, sleep and repeat
        if args.schedule == 'hourly':
            while True:
                print("Sleeping for 1 hour before next collection...")
                time.sleep(3600)
                asyncio.run(collector.collect_historical_data())
                collector.collect_trade_results(redis_client)
                
    except Exception as e:
        print(f"Fatal error in data collection: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()