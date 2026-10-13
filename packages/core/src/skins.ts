/**
 * 스킨 목록 (npm run data:skins). 400KB 라서 처음 화면에는 넣지 않고 필요할 때 따로 불러온다.
 */
import { cdragon } from './assets';

export type Skin = { id: number; championId: number; name: string; tier: number; tile: string; splash: string };
type Raw = { version: string; skins: Record<string, [string, number, string, string]> };

let cache: Promise<Record<number, Skin>> | null = null;

export function loadSkins(): Promise<Record<number, Skin>> {
  cache ??= import('../data/skins.json').then((m) => {
    const raw = (m.default ?? m) as unknown as Raw;
    const out: Record<number, Skin> = {};
    for (const [id, [name, tier, tile, splash]] of Object.entries(raw.skins)) {
      out[Number(id)] = { id: Number(id), championId: Math.floor(Number(id) / 1000), name, tier, tile: cdragon(tile), splash: cdragon(splash) };
    }
    return out;
  });
  return cache;
}

/** 챔피언 기본 스킨 ID */
export const baseSkin = (championId: number) => championId * 1000;
