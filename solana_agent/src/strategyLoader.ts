// Charge dynamiquement les stratégies depuis le dossier manual/
// Charge dynamiquement les stratégies depuis le dossier manual/
import fs from 'fs';
import path from 'path';

interface Strategy {
  name: string;
  execute: () => void;
  weight: number;
}

const strategiesDir = path.join(__dirname, '../strategies/manual');
const weightsPath = path.join(strategiesDir, 'weights.json');

const loadStrategies = (): Strategy[] => {
  const weights = JSON.parse(fs.readFileSync(weightsPath, 'utf-8'));
  const files = fs.readdirSync(strategiesDir).filter(file => file.endsWith('.ts'));

  return files.map(file => {
    const strategyModule = require(path.join(strategiesDir, file));
    const strategyName = path.basename(file, '.ts');
    return {
      name: strategyName,
      execute: strategyModule.execute,
      weight: weights[strategyName] || weights['default'] || 1.0
    };
  });
};

export default loadStrategies;
