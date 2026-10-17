//! 증강 카드를 아이콘 그림으로 알아본다 (v3.66). 플랫폼과 무관한 순수 로직.
//!
//! 제목·설명 글자를 못 읽은 카드(두 장만 뜨던 판)를 마지막으로 그림으로 찾는다.
//! - 증강 아이콘(packages/assets/public/img/aug)의 밝기를 24×24 로 줄인 특징값(scripts/aug-icons.py → aug-icons.bin)과
//!   카드 윗부분에서 잘라 낸 그림을 정규화 상관으로 비교한다. 아이콘 크기·위치는 카드 폭에 비례해 몇 가지로 맞춰 본다
//! - 한 번에 뜨는 카드는 등급(실버·골드·프리즘)이 같다 → 이미 읽은 칸과 같은 등급만 후보 (모르면 세 카드 점수 합이 가장 큰 등급)
//! - 그림이 같은 증강이 있다(예: 대마법사·유레카) → 같은 그림끼리는 묶어서 비교하고, 고르는 건 글자로 (못 가르면 None)
//! - 스킬 증강은 게임에서 챔프 스킬 그림이 떠서 빼 둔다 (공용 그림 Generic…)
//! - 1등 점수가 충분히 높고 다른 그림과 차이가 날 때만 (헷갈리면 None)

use serde::Deserialize;

const S: usize = 24;
const N: usize = S * S;
/// 받아들이는 최소 점수, 다른 그림보다 앞서야 하는 차이. QA 카드 266장(가상 화면 4벌)의 점수 분포로 정했다:
/// 0.80 / 0.03 에서 정답 채택 100%, 오답 채택 0 (사용자 사진 6장은 0.83~0.92). 0.75 는 스킬 증강(챔프 스킬 그림)을 잡은 적이 있다
/// (apps/desktop/qa, 기준을 바꾸면 QA 를 다시 돌린다)
const MIN_SCORE: f32 = 0.80;
const MIN_GAP: f32 = 0.03;
/// 밝은 부분을 자르는 높이 (99% 밝기의 이 비율). 게임은 아이콘 둘레 무늬를 연보라로 밝게 칠하고 데이터는 어두운 회색이라,
/// 낮게 잘라 둘레·가운데 모두 '켜진 모양'으로 본다 (0.5 → 0.3: 사용자 사진 궁극의 각성 0.57 → 0.83)
const CLIP: f32 = 0.3;
/// 이만큼 닮은 아이콘은 같은 그림으로 묶는다
const SAME_ICON: f32 = 0.90;

#[derive(Deserialize)]
struct RawAug {
    id: u32,
    #[serde(default)]
    rarity: String,
    #[serde(default)]
    icon: String,
    #[serde(default)]
    disabled: bool,
    #[serde(default)]
    ability: bool,
}
#[derive(Deserialize)]
struct RawData {
    augments: Vec<RawAug>,
}

pub struct IconBank {
    /// 모든 증강의 등급 (그림으로 찾지 않는 스킬 증강까지 — 이미 읽은 칸의 등급을 알려고)
    all_rarity: Vec<(u32, u8)>,
    ids: Vec<u32>,
    rarity: Vec<u8>,
    /// 같은 그림 묶음 번호 (아이콘 파일 경로가 같으면 같은 묶음)
    group: Vec<u32>,
    /// 평균을 빼고 길이 1로 맞춘 특징값
    sig: Vec<[f32; N]>,
}

/// 평균을 빼고 길이 1로 (밝기·대비가 달라도 모양만 비교하게)
fn normalize(v: &mut [f32; N]) -> bool {
    let m = v.iter().sum::<f32>() / N as f32;
    let mut n = 0.0;
    for x in v.iter_mut() {
        *x -= m;
        n += *x * *x;
    }
    let n = n.sqrt();
    if n < 1e-3 {
        return false;
    }
    for x in v.iter_mut() {
        *x /= n;
    }
    true
}

/// 특징값: 밝은 부분을 눌러(그림 안 밝기 99% 지점의 CLIP 배에서 자름) 가운데 밝은 무늬와 둘레의 어두운 무늬를 같은 무게로 본다.
/// 게임 아이콘은 가운데 무늬(냄비·별·검)가 같고 둘레 무늬만 다른 것이 많아, 밝기 그대로면 서로 다른 증강을 같은 그림으로 본다 (QA 에서 찾음)
fn feature(v: &mut [f32; N]) -> bool {
    let mut s = *v;
    s.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let cap = s[N * 99 / 100] * CLIP;
    for x in v.iter_mut() {
        *x = x.min(cap);
    }
    normalize(v)
}

fn dot(a: &[f32; N], b: &[f32; N]) -> f32 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

fn rarity_code(r: &str) -> u8 {
    match r {
        "silver" => 1,
        "gold" => 2,
        "prismatic" => 3,
        _ => 0,
    }
}

impl IconBank {
    pub fn new(bin: &[u8], json: &str) -> Self {
        let d: RawData = serde_json::from_str(json).unwrap_or(RawData { augments: vec![] });
        let mut paths: Vec<String> = Vec::new();
        let mut bank = Self { all_rarity: d.augments.iter().map(|a| (a.id, rarity_code(&a.rarity))).collect(), ids: vec![], rarity: vec![], group: vec![], sig: vec![] };
        for rec in bin.chunks_exact(4 + N) {
            let id = u32::from_le_bytes([rec[0], rec[1], rec[2], rec[3]]);
            // 스킬 증강(3연발·메아리 시전·재장전 …)은 게임에서 내 챔프 스킬 그림이 뜬다 — 데이터의 그림으로는 찾지 않는다
            let Some(a) = d.augments.iter().find(|a| a.id == id && !a.disabled && !a.ability && !a.icon.contains("Generic")) else { continue };
            let mut v = [0f32; N];
            for (o, b) in v.iter_mut().zip(&rec[4..]) {
                *o = *b as f32;
            }
            if !feature(&mut v) {
                continue;
            }
            let g = paths.iter().position(|p| *p == a.icon).unwrap_or_else(|| {
                paths.push(a.icon.clone());
                paths.len() - 1
            });
            bank.ids.push(id);
            bank.rarity.push(rarity_code(&a.rarity));
            bank.group.push(g as u32);
            bank.sig.push(v);
        }
        // 파일은 달라도 눈으로 같은 그림(게임이 같은 무늬를 여러 증강에 쓴다)은 한 묶음으로 — 고르는 건 글자로
        let n = bank.ids.len();
        for i in 0..n {
            for j in i + 1..n {
                if bank.group[i] != bank.group[j] && dot(&bank.sig[i], &bank.sig[j]) >= SAME_ICON {
                    let (from, to) = (bank.group[j], bank.group[i]);
                    for g in bank.group.iter_mut() {
                        if *g == from {
                            *g = to;
                        }
                    }
                }
            }
        }
        bank
    }

    #[allow(dead_code)]
    /// QA: 카드 한 장에서 정답 묶음의 점수와, 정답이 아닌 묶음 중 가장 높은 점수 (기준을 분포로 정하려고)
    pub fn qa_scores(&self, bgra: &[u8], w: usize, h: usize, card: (usize, usize, usize, usize), answer: u32) -> Option<(f32, f32)> {
        let base: Vec<usize> = (0..self.ids.len()).collect();
        let k = self.ids.iter().position(|i| *i == answer)?;
        let g = self.group[k];
        let sc = self.scores(bgra, w, h, card, &base);
        let right = base.iter().zip(&sc).filter(|(i, _)| self.group[**i] == g).map(|(_, s)| *s).fold(-1f32, f32::max);
        let wrong = base.iter().zip(&sc).filter(|(i, _)| self.group[**i] != g).map(|(_, s)| *s).fold(-1f32, f32::max);
        Some((right, wrong))
    }

    /// 그 등급의 모든 증강 (스킬 증강 포함)
    pub fn ids_of_rarity(&self, r: u8) -> Vec<u32> {
        self.all_rarity.iter().filter(|x| x.1 == r).map(|x| x.0).collect()
    }

    pub fn rarity_of(&self, id: u32) -> u8 {
        self.all_rarity.iter().find(|r| r.0 == id).map_or(0, |r| r.1)
    }

    /// 카드 한 장의 증강마다 가장 잘 맞은 점수 (후보 = idx). card = 그림 안의 카드 자리 (x0, x1, y0, y1)
    fn scores(&self, bgra: &[u8], w: usize, h: usize, card: (usize, usize, usize, usize), idx: &[usize]) -> Vec<f32> {
        let mut best = vec![-1f32; idx.len()];
        let (x0, x1, y0, y1) = card;
        if x1 <= x0 + 20 || y1 <= y0 + 20 || bgra.len() < w * h * 4 || idx.is_empty() {
            return best;
        }
        let cw = (x1 - x0) as f32;
        let ch = (y1 - y0) as f32;
        // 밝기 누적표 (카드 둘레를 조금 넉넉히): 칸마다 평균을 네 번 읽어 구한다
        let ax = (x0 as f32 - cw * 0.2).max(0.0) as usize;
        let bx = ((x1 as f32 + cw * 0.2) as usize).min(w);
        // 위로도 넉넉히: 카드 자리를 찾을 때 아이콘 둘레의 빛 때문에 검은 면의 위쪽 끝이 아이콘 아래로 잡힐 수 있다 (QA 사진)
        let (ay, by) = ((y0 as f32 - cw * 0.5).max(0.0) as usize, y1.min(h));
        let (iw, ih) = (bx - ax, by - ay);
        let mut sum = vec![0u64; (iw + 1) * (ih + 1)];
        for yy in 0..ih {
            let mut row = 0u64;
            for xx in 0..iw {
                let i = ((ay + yy) * w + ax + xx) * 4;
                // BGRA → 밝기 (ITU-R 601, 아이콘 특징값과 같은 식). 가장 밝은 색 성분·둘의 평균도 재 봤으나 실제 게임 화면 사진에서 이 식이 가장 잘 맞았다
                let l = (bgra[i + 2] as u64 * 299 + bgra[i + 1] as u64 * 587 + bgra[i] as u64 * 114) / 1000;
                row += l;
                sum[(yy + 1) * (iw + 1) + xx + 1] = sum[yy * (iw + 1) + xx + 1] + row;
            }
        }
        let rect = |x: usize, y: usize, x2: usize, y2: usize| -> f32 {
            let a = sum[y * (iw + 1) + x] + sum[y2 * (iw + 1) + x2];
            let b = sum[y * (iw + 1) + x2] + sum[y2 * (iw + 1) + x];
            (a - b) as f32 / ((x2 - x) * (y2 - y)).max(1) as f32
        };
        // (아이콘 크기 = 카드 폭 비율, 아이콘 위 = 카드 높이 비율, 가로 어긋남 = 카드 폭 비율) 한 자리를 비교
        let mut patch = [0f32; N];
        let mut try_at = |frac: f32, top: f32, dx: f32, best: &mut [f32]| -> f32 {
            let s = cw * frac;
            if s < S as f32 {
                return -1.0;
            }
            let px = x0 as f32 + cw / 2.0 + dx * cw - s / 2.0 - ax as f32;
            let py = (y0 - ay) as f32 + top * ch;
            if px < 0.0 || py < 0.0 || px + s > iw as f32 || py + s > ih as f32 {
                return -1.0;
            }
            for j in 0..S {
                let ya = (py + s * j as f32 / S as f32) as usize;
                let yb = ((py + s * (j + 1) as f32 / S as f32) as usize).max(ya + 1).min(ih);
                for i in 0..S {
                    let xa = (px + s * i as f32 / S as f32) as usize;
                    let xb = ((px + s * (i + 1) as f32 / S as f32) as usize).max(xa + 1).min(iw);
                    patch[j * S + i] = rect(xa, ya, xb, yb);
                }
            }
            if !feature(&mut patch) {
                return -1.0;
            }
            let mut top_score = -1f32;
            for (k, &ix) in idx.iter().enumerate() {
                let sc: f32 = self.sig[ix].iter().zip(patch.iter()).map(|(a, b)| a * b).sum();
                if sc > best[k] {
                    best[k] = sc;
                }
                top_score = top_score.max(sc);
            }
            top_score
        };
        // 1) 성기게 훑고 2) 잘 맞은 자리 셋 둘레를 촘촘히
        let mut coarse: Vec<(f32, f32, f32, f32)> = Vec::new();
        for fi in 0..9 {
            let frac = 0.40 + 0.06 * fi as f32;
            for ti in 0..18 {
                let top = -0.24 + 0.04 * ti as f32;
                for di in 0..5 {
                    let dx = -0.10 + 0.05 * di as f32;
                    let sc = try_at(frac, top, dx, &mut best);
                    coarse.push((sc, frac, top, dx));
                }
            }
        }
        coarse.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        for &(_, f, t, d) in coarse.iter().take(3) {
            for a in -2..=2 {
                for b in -2..=2 {
                    for c in -2..=2 {
                        try_at(f + 0.015 * a as f32, t + 0.01 * b as f32, d + 0.0125 * c as f32, &mut best);
                    }
                }
            }
        }
        best
    }

    /// 한 판의 카드들 중 아직 모르는 카드(unknown 의 순번)를 그림으로 찾는다.
    /// known = 이미 다른 칸에서 읽은 증강 (등급을 정하고, 후보에서 뺀다).
    /// 결과: 카드마다 (같은 그림 증강들, 점수, 다른 그림과 차이) — 확신이 없으면 None
    pub fn identify(&self, bgra: &[u8], w: usize, h: usize, cards: &[(usize, usize, usize, usize)], unknown: &[usize], known: &[u32]) -> Vec<Option<(Vec<u32>, f32, f32)>> {
        self.identify_with(bgra, w, h, cards, unknown, known, MIN_SCORE, MIN_GAP)
    }

    /// 기준을 정해서 (QA 시험이 기준 없이 점수를 보려고 0 으로 부른다)
    #[allow(clippy::too_many_arguments)]
    pub fn identify_with(&self, bgra: &[u8], w: usize, h: usize, cards: &[(usize, usize, usize, usize)], unknown: &[usize], known: &[u32], min_score: f32, min_gap: f32) -> Vec<Option<(Vec<u32>, f32, f32)>> {
        // 이미 읽은 증강도 후보에 둔다: 그 카드가 사실 이미 읽은 카드라면 빼고 찾을 때 엉뚱한 2등이 답이 된다 (Windows 끝단 QA).
        // 결과 묶음에 이미 읽은 증강이 들어 있으면 부르는 쪽이 글자로 분명할 때만 고른다
        let base: Vec<usize> = (0..self.ids.len()).collect();
        let all: Vec<Vec<f32>> = unknown.iter().map(|&c| self.scores(bgra, w, h, cards[c], &base)).collect();
        // 등급: 이미 읽은 칸이 있으면 그 등급만. 모르면 등급을 가리지 않는다 — 같은 그림이 여러 등급에 쓰여
        // 그림으로 등급을 짐작하면 틀린 등급으로 좁혀 버린다 (QA 에서 찾음). 같은 그림 증강은 글자로 가른다
        let rar = known.iter().map(|id| self.rarity_of(*id)).find(|r| *r > 0).unwrap_or(0);
        all.iter()
            .map(|sc| {
                // 그림 묶음별 최고점 (같은 등급만)
                let mut groups: Vec<(u32, f32)> = Vec::new();
                for (k, s) in base.iter().zip(sc) {
                    if rar > 0 && self.rarity[*k] != rar {
                        continue;
                    }
                    let g = self.group[*k];
                    match groups.iter_mut().find(|x| x.0 == g) {
                        Some(x) => x.1 = x.1.max(*s),
                        None => groups.push((g, *s)),
                    }
                }
                groups.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
                let (g, top) = *groups.first()?;
                let gap = top - groups.get(1).map_or(0.0, |x| x.1);
                if top < min_score || gap < min_gap {
                    return None;
                }
                let members: Vec<u32> = base.iter().filter(|k| self.group[**k] == g && (rar == 0 || self.rarity[**k] == rar)).map(|k| self.ids[*k]).collect();
                Some((members, top, gap))
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const DATA: &str = include_str!("../../../../packages/core/data/mayhem-augments.json");
    const BIN: &[u8] = include_bytes!("../../../../packages/core/data/aug-icons.bin");

    #[test]
    fn 아이콘_특징값을_모두_읽는다() {
        let b = IconBank::new(BIN, DATA);
        assert!(b.ids.len() >= 180);
        // 대마법사·유레카는 같은 그림 (같은 묶음)
        let g = |id: u32| b.group[b.ids.iter().position(|i| *i == id).unwrap()];
        assert_eq!(g(2087), g(1030));
        assert_ne!(g(2087), g(1048));
        assert_eq!(b.rarity_of(1048), 3);
    }

    #[test]
    fn 카드에_아이콘을_그려_넣으면_찾는다() {
        // 검은 카드 세 장에 실제 아이콘(밝기)을 다른 크기로 그려 넣고 찾는다
        let b = IconBank::new(BIN, DATA);
        let (w, h) = (900usize, 400usize);
        let mut img = vec![0u8; w * h * 4];
        let put = |img: &mut Vec<u8>, id: u32, x0: usize, size: usize| {
            let rec = BIN.chunks_exact(4 + N).find(|r| u32::from_le_bytes([r[0], r[1], r[2], r[3]]) == id).unwrap();
            for y in 0..size {
                for x in 0..size {
                    let v = rec[4 + (y * S / size) * S + x * S / size];
                    let i = ((40 + y) * w + x0 + x) * 4;
                    img[i] = v;
                    img[i + 1] = v;
                    img[i + 2] = v;
                }
            }
        };
        // 카드 폭 200, 아이콘 120 (가운데)
        put(&mut img, 1048, 40 + 40, 120);
        put(&mut img, 1018, 340 + 40, 120);
        put(&mut img, 1349, 640 + 40, 120);
        let cards = [(40, 240, 20, 380), (340, 540, 20, 380), (640, 840, 20, 380)];
        let r = b.identify(&img, w, h, &cards, &[0, 1, 2], &[]);
        assert!(r[0].as_ref().unwrap().0.contains(&1048));
        assert!(r[1].as_ref().unwrap().0.contains(&1018));
        assert!(r[2].as_ref().unwrap().0.contains(&1349));
        // 그 카드가 이미 읽은 증강이면 다른 증강을 답하지 않는다 (묶음이 이미 읽은 것뿐 → 부르는 쪽이 고르지 않는다)
        let r = b.identify(&img, w, h, &cards, &[0], &[1048]);
        assert!(r[0].as_ref().map_or(true, |g| g.0.iter().all(|i| *i == 1048)), "{:?}", r);
    }
}
