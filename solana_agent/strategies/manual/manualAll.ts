// Ensemble des stratégies manuelles
import { ocamlHybrid } from './ocamlHybrid';
import { Strategy } from '../types';

export const manualStrategies: Strategy[] = [
  {
    id: 'liq_gt_10',
    label: 'Liquidity > 10 SOL',
    condition: (f) => f.liquidity > 10
  },
  {
    id: 'holders_lt_20',
    label: 'Holders < 20',
    condition: (f) => f.holders < 20
  },
  {
    id: 'buy_sell_gt_2',
    label: 'Buy/Sell > 2',
    condition: (f) => f.buy_sell_ratio > 2
  },
  {
    id: 'volatility_lt_0.2',
    label: 'Volatilité < 0.2',
    condition: (f) => f.volatility_1m < 0.2
  },
  {
    id: 'time_to_pool_lt_30',
    label: 'Création < 30s',
    condition: (f) => f.time_to_pool < 30
  },
  {
    id: 'liq_speed_gt_10',
    label: 'Liquidité rapide',
    condition: (f) => f.liquidity_speed > 10
  },
  {
    id: 'concentration_lt_0.2',
    label: 'Concentration < 20%',
    condition: (f) => f.holder_concentration < 0.2
  },
  {
    id: 'ai_score_gt_0.8',
    label: 'AI Score > 0.8',
    condition: (f) => f.ai_score > 0.8
  },
  {
    id: 'ai_score_delta_gt_0.05',
    label: 'AI en hausse',
    condition: (f) => f.ai_score_delta > 0.05
  },
  {
    id: 'creator_score_gt_0.9',
    label: 'Creator Score > 0.9',
    condition: (f) => f.creator_score > 0.9
  },
  {
    id: 'tx_delta_gt_100',
    label: 'Volume rapide',
    condition: (f) => f.tx_volume_delta > 100
  },
  {
    id: 'liq_vol_ratio_gt_1.5',
    label: 'Ratio Liq/Vol > 1.5',
    condition: (f) => f.liq_volume_ratio > 1.5
  },
  {
    id: 'creator_score_gt_0.8_and_holders_gt_30',
    label: 'Pas rugable',
    condition: (f) => f.creator_score > 0.8 && f.holders > 30
  },
  {
    id: 'buy_sell_gt_2_and_volatility_lt_0.3',
    label: 'Pump stable',
    condition: (f) => f.buy_sell_ratio > 2 && f.volatility_1m < 0.3
  },
  {
    id: 'snipe_combo_1',
    label: 'Combo Liquidity/AI',
    condition: (f) => f.liquidity > 6 && f.ai_score > 0.75 && f.buy_sell_ratio > 1.5
  },
  {
    id: 'creator_combo',
    label: 'Creator safe + AI',
    condition: (f) => f.creator_score > 0.8 && f.ai_score_delta > 0.02
  },
  {
    id: 'impact_lt_5',
    label: 'Impact faible',
    condition: (f) => f.price_impact_1sol < 5
  },
  {
    id: 'time_to_pool_gt_30_and_liq_speed_gt_5',
    label: 'Relaunch pump',
    condition: (f) => f.time_to_pool > 30 && f.liquidity_speed > 5
  },
  {
    id: 'holders_lt_15_and_ai_score_gt_0.85',
    label: 'Micro mais musclé',
    condition: (f) => f.holders < 15 && f.ai_score > 0.85
  },
  {
    id: 'moon_combo',
    label: 'Profil lune',
    condition: (f) => f.ai_score > 0.92 && f.liq_volume_ratio > 2 && f.buy_sell_ratio > 3
  },
  ocamlHybrid
];
