/**
 * 앱(Node)용: 데이터 파일을 읽어 두고 궁합을 계산한다. 계산은 synergy-core.ts.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guideOf, type ChampionProfile, type MayhemAugment } from './synergy-core.js';

export type { ChampionProfile, MayhemAugment } from './synergy-core.js';

const DATA = join(dirname(fileURLToPath(import.meta.url)), 'data');

export const mayhem: { version: string; augments: MayhemAugment[]; champions: Record<number, ChampionProfile> } = { version: '', augments: [], champions: {} };

export async function loadMayhem() {
  try {
    const a = JSON.parse(await readFile(join(DATA, 'mayhem-augments.json'), 'utf8'));
    const c = JSON.parse(await readFile(join(DATA, 'mayhem-champions.json'), 'utf8'));
    mayhem.version = a.version;
    mayhem.augments = a.augments;
    mayhem.champions = c.champions;
  } catch (e) {
    console.error('[아수라장 데이터]', e instanceof Error ? e.message : e);
  }
}

export const guideFor = (championId: number) => guideOf(mayhem, championId);
