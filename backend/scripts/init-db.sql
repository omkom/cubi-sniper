-- Initialize PostgreSQL database schema for Cubi-sniper

-- Create schema
CREATE SCHEMA IF NOT EXISTS cubi;

-- Create token data table
CREATE TABLE IF NOT EXISTS cubi.token_data (
    id SERIAL PRIMARY KEY,
    mint VARCHAR(44) NOT NULL,
    symbol VARCHAR(32),
    liquidity DOUBLE PRECISION DEFAULT 0,
    volume DOUBLE PRECISION DEFAULT 0,
    price DOUBLE PRECISION DEFAULT 0,
    holder_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    raw_data JSONB
);

-- Create trade data table
CREATE TABLE IF NOT EXISTS cubi.trade_data (
    id SERIAL PRIMARY KEY,
    token_mint VARCHAR(44) NOT NULL,
    strategy_id VARCHAR(128),
    entry_price DOUBLE PRECISION,
    exit_price DOUBLE PRECISION,
    roi DOUBLE PRECISION,
    roi_per_sec DOUBLE PRECISION,
    time_held DOUBLE PRECISION,
    entry_time TIMESTAMP WITH TIME ZONE,
    exit_time TIMESTAMP WITH TIME ZONE,
    features JSONB,
    exit_reason VARCHAR(64)
);

-- Create backtesting results table
CREATE TABLE IF NOT EXISTS cubi.backtest_results (
    id SERIAL PRIMARY KEY,
    strategy_id VARCHAR(128),
    token_mint VARCHAR(44),
    roi DOUBLE PRECISION,
    roi_per_sec DOUBLE PRECISION,
    win BOOLEAN,
    exit_reason VARCHAR(64),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indices for better performance
CREATE INDEX IF NOT EXISTS idx_token_mint ON cubi.token_data(mint);
CREATE INDEX IF NOT EXISTS idx_trade_token_mint ON cubi.trade_data(token_mint);
CREATE INDEX IF NOT EXISTS idx_trade_strategy ON cubi.trade_data(strategy_id);
CREATE INDEX IF NOT EXISTS idx_trade_exit_time ON cubi.trade_data(exit_time);
CREATE INDEX IF NOT EXISTS idx_backtest_strategy ON cubi.backtest_results(strategy_id);

-- Create views for data analysis
CREATE OR REPLACE VIEW cubi.strategy_performance AS
SELECT 
    strategy_id,
    COUNT(*) as total_trades,
    AVG(roi) as avg_roi,
    AVG(roi_per_sec) as avg_roi_per_sec,
    STDDEV(roi) as roi_stddev,
    COUNT(*) FILTER (WHERE roi > 0) as wins,
    COUNT(*) FILTER (WHERE roi < 0) as losses,
    MAX(roi) as best_roi,
    MIN(roi) as worst_roi,
    DATE_TRUNC('day', exit_time) as trade_date
FROM cubi.trade_data
GROUP BY strategy_id, DATE_TRUNC('day', exit_time);

CREATE OR REPLACE VIEW cubi.token_performance AS
SELECT 
    t.token_mint,
    t.symbol,
    COUNT(*) as trade_count,
    AVG(t.roi) as avg_roi,
    MAX(t.roi) as max_roi,
    AVG(td.liquidity) as avg_liquidity,
    AVG(td.volume) as avg_volume
FROM cubi.trade_data t
JOIN cubi.token_data td ON t.token_mint = td.mint
GROUP BY t.token_mint, t.symbol;

-- Create materialized view for faster aggregations
CREATE MATERIALIZED VIEW IF NOT EXISTS cubi.daily_stats AS
SELECT 
    DATE_TRUNC('day', exit_time) as date,
    COUNT(*) as total_trades,
    SUM(CASE WHEN roi > 0 THEN 1 ELSE 0 END) as winning_trades,
    AVG(roi) as avg_roi,
    SUM(roi) as total_roi,
    AVG(time_held) as avg_hold_time,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY roi) as median_roi
FROM cubi.trade_data
GROUP BY DATE_TRUNC('day', exit_time);

-- Create function to refresh materialized view daily
CREATE OR REPLACE FUNCTION cubi.refresh_daily_stats() RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW cubi.daily_stats;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to cleanup old data (keep 90 days)
CREATE OR REPLACE FUNCTION cubi.cleanup_old_data() RETURNS void AS $$
BEGIN
    DELETE FROM cubi.token_data 
    WHERE created_at < NOW() - INTERVAL '90 days';
    
    DELETE FROM cubi.trade_data 
    WHERE exit_time < NOW() - INTERVAL '90 days';
    
    DELETE FROM cubi.backtest_results 
    WHERE timestamp < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Create scheduled job for daily cleanup (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-old-data', '0 0 * * *', $$SELECT cubi.cleanup_old_data()$$);
-- SELECT cron.schedule('refresh-daily-stats', '0 1 * * *', $$SELECT cubi.refresh_daily_stats()$$);