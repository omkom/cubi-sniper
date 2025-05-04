import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

// Configuration des chemins pour Docker
const DOCKER_PROJECT_ROOT = '/app/ocaml_engine';
const OCAML_INPUT = path.join(DOCKER_PROJECT_ROOT, 'input.json');
const OCAML_EXEC = path.join(DOCKER_PROJECT_ROOT, '_build/default/TokenDB.exe');

export async function getOcamlScore(features: Record<string, number>): Promise<number> {
  try {
    // Créer le dossier d'input si nécessaire
    const inputDir = path.dirname(OCAML_INPUT);
    if (!fs.existsSync(inputDir)) {
      fs.mkdirSync(inputDir, { recursive: true });
    }

    // Écrire les features dans un fichier JSON
    fs.writeFileSync(OCAML_INPUT, JSON.stringify(features, null, 2));

    try {
      // Exécuter le binaire OCaml via Docker exec si on est dans un conteneur
      let output: string;
      
      if (process.env.DOCKER_CONTAINER === 'true') {
        // Utiliser Docker exec pour exécuter la commande dans le conteneur OCaml
        const command = `docker exec ocaml_engine dune exec ${OCAML_EXEC}`;
        output = execSync(command, {
          encoding: 'utf-8',
          cwd: DOCKER_PROJECT_ROOT
        });
      } else {
        // Exécution locale
        output = execSync(`dune exec ${OCAML_EXEC}`, {
          cwd: DOCKER_PROJECT_ROOT,
          encoding: 'utf-8'
        });
      }

      const match = output.match(/"score"\s*:\s*(\d+(\.\d+)?)/);
      if (!match) throw new Error('Score OCaml introuvable');

      return parseFloat(match[1]);
    } catch (execError) {
      console.error('Erreur exécution OCaml:', execError);
      // Fallback à l'API si disponible
      return await fetchOcamlScoreFromApi(features);
    }
  } catch (err) {
    console.error('Erreur OCaml bridge:', err);
    return 0.0;
  }
}

// Fallback method using the OCaml API
async function fetchOcamlScoreFromApi(features: Record<string, number>): Promise<number> {
  try {
    const apiUrl = process.env.OCAML_API_URL || 'http://ocaml_engine:8080/score';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(features)
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.score || 0.0;
  } catch (error) {
    console.error('Error fetching OCaml score from API:', error);
    return 0.0;
  }
}