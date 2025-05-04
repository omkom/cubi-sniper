import { Strategy, TokenData, TradeResult } from '../types';

export async function runStrategySimulation(
  tokenData: TokenData,
  strategy: Strategy
): Promise<TradeResult[]> {
  const results: TradeResult[] = [];
  
  // Simuler l'exécution de la stratégie sur l'historique des prix
  const { mint, priceHistory } = tokenData;
  let inPosition = false;
  let entryPrice = 0;
  let entryTime = 0;
  
  // Simuler features à partir des données
  const features = {
    liquidity: 10.0,
    holders: 50,
    volatility: 0.2,
    ai_score: 0.8,
    buy_sell_ratio: 1.5
  };
  
  for (let i = 0; i < priceHistory.length; i++) {
    const currentPrice = priceHistory[i];
    const currentTime = tokenData.launchTime + i;
    
    // Mettre à jour features simulées
    features.liquidity = features.liquidity * (1 + Math.random() * 0.1 - 0.05);
    features.holders = Math.max(features.holders + Math.floor(Math.random() * 5 - 2), 10);
    features.volatility = Math.min(Math.abs(currentPrice - (priceHistory[i-1] || currentPrice)) / currentPrice, 1.0);
    
    // Vérifier condition d'entrée
    if (!inPosition) {
      const shouldEnter = await strategy.condition(features);
      if (shouldEnter) {
        inPosition = true;
        entryPrice = currentPrice;
        entryTime = currentTime;
      }
    } else {
      // Conditions de sortie simulées
      const timeHeld = currentTime - entryTime;
      const roi = (currentPrice - entryPrice) / entryPrice;
      const roiPerSec = roi / timeHeld;
      
      // Sortie basique : ROI > 50% ou timeHeld > 300sec ou ROI < -20%
      let exitReason = '';
      if (roi > 0.5) exitReason = 'profit_target';
      else if (timeHeld > 300) exitReason = 'time_limit';
      else if (roi < -0.2) exitReason = 'stop_loss';
      
      if (exitReason) {
        inPosition = false;
        results.push({
          id: `${mint}-${entryTime}`,
          token: mint,
          strategy: strategy.id,
          roi,
          roi_per_sec: roiPerSec,
          time_held: timeHeld,
          exit_reason: exitReason,
          buy_time: entryTime,
          sell_time: currentTime,
          buy_price: entryPrice,
          sell_price: currentPrice,
          amount_sol: 0.1
        });
      }
    }
  }
  
  return results;
}