// Stratégie hybride OCaml/IA
import { Strategy } from '../types';
import { getOcamlScore } from '../../src/ocamlBridge';

export const ocamlHybrid: Strategy = {
  id: 'ocaml_hybrid_1',
  label: 'Scoring OCaml > 0.75',
  async condition(features) {
    const score = await getOcamlScore(features);
    console.log(`🧠 [OCAML] Score = ${score}`);
    return score > 0.75;
  }
};
