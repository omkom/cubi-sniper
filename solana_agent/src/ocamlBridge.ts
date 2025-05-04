import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const OCAML_INPUT = '/tmp/token_input.json';
const OCAML_EXEC = '/home/opam/app/_build/default/TokenDB.exe';

export async function getOcamlScore(features: Record<string, number>): Promise<number> {
  // Écrire les features dans un fichier JSON
  fs.writeFileSync(OCAML_INPUT, JSON.stringify(features, null, 2));

  try {
    const output = execSync(`${OCAML_EXEC}`, {
      cwd: '/home/opam/app',
      encoding: 'utf-8'
    });

    const match = output.match(/"score"\s*:\s*(\d+(\.\d+)?)/);
    if (!match) throw new Error('Score OCaml introuvable');

    return parseFloat(match[1]);
  } catch (err) {
    console.error('Erreur OCaml bridge :', err);
    return 0.0;
  }
}
