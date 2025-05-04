// solana_agent/types.ts
export interface TokenData {
    mint: string;
    launchTime: number;
    priceHistory: number[];
  }
  
  export interface TokenFeatures {
    mint: string;
    symbol: string;
    liquidity: number;
    volume: number;
    swapFee: number;
    txRate: number;
    impact: number;
    detected_at: number;
    holders?: number;
    ai_score?: number;
    volatility_1m?: number;
    buy_sell_ratio?: number;
    time_to_pool?: number;
    liquidity_speed?: number;
    holder_concentration?: number;
    creator_score?: number;
    ai_score_delta?: number;
    tx_volume_delta?: number;
    liq_volume_ratio?: number;
    price_impact_1sol?: number;
  }
  
  export interface Strategy {
    id: string;
    label: string;
    weight: number;
    condition: (features: TokenFeatures) => boolean | Promise<boolean>;
  }
  
  export interface TradeResult {
    id: string;
    token: string;
    strategy: string;
    roi: number;
    roi_per_sec: number;
    time_held: number;
    exit_reason: string;
    buy_time: number;
    sell_time: number;
    buy_price: number;
    sell_price: number;
    amount_sol: number;
    exit_label?: boolean;
    roi_max_future?: number;
  }
  
  export interface SimulationResult {
    tokenData: TokenData;
    strategy: Strategy;
    results: TradeResult[];
  }
  
  export interface StrategyPerformance {
    roi_sum: number;
    roi_sec_sum: number;
    trades: number;
    wins: number;
    drawdowns: number;
    roi_avg?: number;
    roi_sec_avg?: number;
    win_rate?: number;
  }