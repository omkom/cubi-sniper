// Charge dynamiquement les stratégies depuis le dossier manual/
import fs from 'fs';
import path from 'path';

interface Strategy {
  id: string;
  label: string;
  weight: number;
  condition: (features: any) => boolean | Promise<boolean>;
}

const strategiesDir = path.join(__dirname, '../strategies/manual');
const weightsPath = path.join(strategiesDir, 'weights.json');

const loadStrategies = (): Strategy[] => {
  try {
    // Charger les poids
    const weights = JSON.parse(fs.readFileSync(weightsPath, 'utf-8'));
    
    // Lire tous les fichiers de stratégie
    const files = fs.readdirSync(strategiesDir).filter(file => file.endsWith('.ts'));
    
    return files.map(file => {
      const fullPath = path.join(strategiesDir, file);
      const strategyModule = require(fullPath);
      const strategyName = path.basename(file, '.ts');
      
      // S'assurer que la stratégie a l'interface correcte
      const strategy = strategyModule.default || strategyModule[strategyName] || strategyModule;
      
      return {
        id: strategy.id || strategyName,
        label: strategy.label || strategyName,
        condition: strategy.condition || strategy.execute || (() => false),
        weight: weights[strategyName] || weights['default'] || 1.0
      };
    });
  } catch (error) {
    console.error('Error loading strategies:', error);
    return [];
  }
};

export default loadStrategies;