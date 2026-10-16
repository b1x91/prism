//! 문자 인식 결과(줄·단어·위치)에서 아수라장 증강 이름을 찾는다. 플랫폼과 무관한 순수 로직 (리눅스에서도 테스트).
//!
//! 규칙
//! - 공백·기호를 뺀 글자끼리 비교한다 (인식기가 띄어쓰기를 틀리는 경우가 많다)
//! - 4글자 이상 이름은 한 글자 틀려도 같은 것으로 본다
//! - 3글자 이상 이름은 한글을 자모로 풀어 비교해, 받침·모음 몇 개 틀리거나 글자 하나 빠지고 더해져도 찾는다
//!   ("날쌘걸음"을 "날쎈겉음"으로 읽어도). 단어째 읽힌 구간만, 글자 빠짐은 5글자 이상 이름만. 비슷한 후보가 여럿이면 덜 틀린 쪽
//! - 2글자 이하 이름("흡수", "범람", "꽝")은 단어 하나가 통째로 같을 때만 (설명 속 "흡수량"을 이름으로 착각하지 않게)
//! - 게임 화면 글자가 데이터와 다른 증강은 별칭으로도 찾는다 (ALIASES)
//! - 한 줄에서 겹치는 후보는 긴 이름을 먼저 고른다 ("거인" < "거인 학살자")
//! - 카드는 가로로 놓이므로 x 위치로 묶고, 묶음마다 가장 위(제목)에 있는 것 하나만 쓴다

use serde::Deserialize;

pub struct Word {
    pub text: String,
    pub x: f32,
    pub y: f32,
    /// 단어 폭 (제목 가운데를 구하려고. 이름 길이와 상관없이 카드 위치가 같게 나온다)
    pub w: f32,
}

#[derive(Deserialize)]
struct RawAug {
    id: u32,
    name: String,
    #[serde(default)]
    desc: String,
    #[serde(default)]
    note: String,
    #[serde(default)]
    disabled: bool,
}
#[derive(Deserialize)]
struct RawData {
    augments: Vec<RawAug>,
}

/// 설명으로 찾을 때: 읽은 묶음의 이만큼이 설명에 들어 있어야 하고, 2등보다 이만큼 앞서야 한다
const DESC_MIN: f32 = 0.5;
const DESC_GAP: f32 = 0.15;

/// 게임 화면에 실제로 쓰인 이름이 데이터(CommunityDragon)와 다른 증강: (ID, 화면 이름)
const ALIASES: &[(u32, &str)] = &[(2111, "꽝!")]; // 데이터는 "꽁!"

pub struct Matcher {
    names: Vec<(u32, Vec<char>)>,
    /// 이름마다 자모로 푼 것 (names 와 같은 순서)
    jamo: Vec<Vec<u32>>,
    /// 증강마다 설명(이름·설명·메모)의 두 글자 묶음 — 제목을 못 읽은 카드를 설명 문장으로 알아보려고
    descs: Vec<(u32, std::collections::HashSet<(char, char)>)>,
}

/// 한글·숫자만 남긴 두 글자 묶음 (띄어쓰기·기호·색 글자 차이에 흔들리지 않게)
fn bigrams(s: &str) -> std::collections::HashSet<(char, char)> {
    let cs: Vec<char> = s.chars().filter(|c| ('\u{AC00}'..='\u{D7A3}').contains(c) || c.is_ascii_digit()).collect();
    cs.windows(2).map(|w| (w[0], w[1])).collect()
}

/// 한글 음절을 초성·중성·종성으로 푼다 (그 밖의 글자는 그대로)
fn jamo_of(cs: &[char]) -> Vec<u32> {
    let mut out = Vec::with_capacity(cs.len() * 3);
    for &c in cs {
        let u = c as u32;
        if (0xAC00..=0xD7A3).contains(&u) {
            let i = u - 0xAC00;
            out.push(0x1_0000 + i / 588);
            out.push(0x2_0000 + (i % 588) / 28);
            if i % 28 > 0 {
                out.push(0x3_0000 + i % 28);
            }
        } else {
            out.push(u);
        }
    }
    out
}

/// 편집 거리 (넣기·빼기·바꾸기 한 번씩 1). limit 를 넘으면 limit+1
fn edit(a: &[u32], b: &[u32], limit: usize) -> usize {
    if a.len().abs_diff(b.len()) > limit {
        return limit + 1;
    }
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut cur = vec![0; b.len() + 1];
    for i in 1..=a.len() {
        cur[0] = i;
        let mut row_min = cur[0];
        for j in 1..=b.len() {
            cur[j] = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + usize::from(a[i - 1] != b[j - 1]));
            row_min = row_min.min(cur[j]);
        }
        if row_min > limit {
            return limit + 1;
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    prev[b.len()]
}

/// 자모 몇 개까지 틀려도 되나 (이름 자모 수의 1/5, 3글자 이상만)
fn jamo_allow(n_chars: usize, n_jamo: usize) -> usize {
    if n_chars < 3 { 0 } else { (n_jamo / 5).max(1) }
}

fn norm(s: &str) -> Vec<char> {
    s.chars().filter(|c| c.is_alphanumeric()).flat_map(|c| c.to_lowercase()).collect()
}

struct Hit {
    id: u32,
    start: usize,
    len: usize,
    /// 틀린 정도 (0 = 똑같음)
    dist: usize,
    x: f32,
    y: f32,
}

impl Matcher {
    /// 앱에 묶인 증강 데이터(packages/core/data/mayhem-augments.json)에서 이름표를 만든다
    pub fn from_json(json: &str) -> Self {
        let d: RawData = serde_json::from_str(json).unwrap_or(RawData { augments: vec![] });
        let live: Vec<RawAug> = d.augments.into_iter().filter(|a| !a.disabled).collect();
        let descs = live.iter().map(|a| (a.id, bigrams(&format!("{} {} {}", a.name, a.desc, a.note)))).collect();
        let mut names: Vec<(u32, Vec<char>)> = live.iter().map(|a| (a.id, norm(&a.name))).filter(|(_, n)| !n.is_empty()).collect();
        let known: Vec<u32> = names.iter().map(|n| n.0).collect();
        names.extend(ALIASES.iter().filter(|(id, _)| known.contains(id)).map(|(id, n)| (*id, norm(n))));
        let jamo = names.iter().map(|(_, n)| jamo_of(n)).collect();
        Self { names, jamo, descs }
    }

    /// 카드 한 장의 글자 전체(제목을 못 읽었을 때)로 증강 찾기: 읽은 두 글자 묶음이 설명에 얼마나 들어 있나.
    /// 게임 화면의 설명은 데이터와 조금 다를 수 있으므로, 1등이 충분히 높고 2등과 차이가 클 때만 (헷갈리면 None)
    #[allow(dead_code)]
    pub fn match_desc(&self, text: &str) -> Option<u32> {
        self.match_desc_except(text, &[])
    }

    /// 설명으로 찾기 — 이미 다른 칸에 있는 증강은 후보에서 뺀다 (빈 칸을 옆 칸 증강으로 잘못 잡아 버리지 않게)
    pub fn match_desc_except(&self, text: &str, except: &[u32]) -> Option<u32> {
        let q = bigrams(text);
        if q.len() < 8 {
            return None;
        }
        let mut sc: Vec<(f32, u32)> = self.descs.iter().filter(|(id, _)| !except.contains(id)).map(|(id, d)| (q.iter().filter(|b| d.contains(b)).count() as f32 / q.len() as f32, *id)).collect();
        sc.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        let (best, second) = (sc.first()?, sc.get(1).map_or(0.0, |s| s.0));
        (best.0 >= DESC_MIN && best.0 - second >= DESC_GAP).then_some(best.1)
    }

    /// 한 줄(단어 목록)에서 이름 후보 찾기
    fn line_hits(&self, words: &[Word]) -> Vec<Hit> {
        // 줄 글자와 각 글자의 위치(그 글자가 속한 단어의 위치)
        let mut chars = Vec::new();
        let mut pos = Vec::new();
        // 글자마다 단어 번호 (짧은 이름은 단어 하나와 통째로 같아야 한다)
        let mut wid = Vec::new();
        for (i, w) in words.iter().enumerate() {
            for c in norm(&w.text) {
                chars.push(c);
                pos.push((w.x, w.y, w.x + w.w));
                wid.push(i);
            }
        }
        // 단어 경계에 딱 맞는 구간인가 (자모 비교는 제목처럼 단어째 읽힌 것만 — 설명 속 "궁극기를"을 "궁극기 봇"으로 잡지 않게)
        let bound = |s: usize, n: usize| (s == 0 || wid[s - 1] != wid[s]) && (s + n == wid.len() || wid[s + n] != wid[s + n - 1]);
        let whole = |s: usize, n: usize| (s == 0 || wid[s - 1] != wid[s]) && (s + n == wid.len() || wid[s + n] != wid[s + n - 1]) && wid[s] == wid[s + n - 1];
        let mut hits = Vec::new();
        let center = |s: usize, n: usize| (pos[s].0 + pos[s + n - 1].2) / 2.0;
        for (k, (id, name)) in self.names.iter().enumerate() {
            let n = name.len();
            // 1) 글자 단위: 같은 길이에서 4글자 이상은 한 글자까지
            if n <= chars.len() {
                let allow = if n >= 4 { 1 } else { 0 };
                for s in 0..=chars.len() - n {
                    let diff = chars[s..s + n].iter().zip(name).filter(|(a, b)| a != b).count();
                    if diff <= allow && (n > 2 || whole(s, n)) {
                        hits.push(Hit { id: *id, start: s, len: n, dist: diff * 3, x: center(s, n), y: pos[s].1 });
                    }
                }
            }
            // 2) 자모 단위: 받침·모음이 조금 틀리거나 글자 하나 빠지고 더해져도 (3글자 이상)
            let nj = &self.jamo[k];
            let allow = jamo_allow(n, nj.len());
            if allow == 0 {
                continue;
            }
            // 글자 하나 빠진 구간은 5글자 이상 이름만 (짧은 이름은 설명 속 "소환사"를 "소환술사"로 잡게 된다)
            let shortest = if n >= 5 { n - 1 } else { n };
            for len in shortest..=n + 1 {
                if len > chars.len() {
                    continue;
                }
                for s in 0..=chars.len() - len {
                    if !bound(s, len) {
                        continue;
                    }
                    let win = &chars[s..s + len];
                    // 빠른 거르기: 이름의 글자 중 절반 이상이 그대로 들어 있어야 자모를 비교한다
                    let same = name.iter().filter(|c| win.contains(c)).count();
                    if same * 2 < n {
                        continue;
                    }
                    let d = edit(&jamo_of(win), nj, allow);
                    // 5글자 이상은 글자 하나가 통째로 빠지거나 더해져도
                    let cd = if n >= 5 { edit(&win.iter().map(|&c| c as u32).collect::<Vec<_>>(), &name.iter().map(|&c| c as u32).collect::<Vec<_>>(), 1) } else { 9 };
                    if d <= allow || cd <= 1 {
                        hits.push(Hit { id: *id, start: s, len, dist: d.min(cd * 3), x: center(s, len), y: pos[s].1 });
                    }
                }
            }
        }
        // 더 길게 맞는 것 → 덜 틀린 것 우선, 겹치면 버림
        // ("삼급 조준경 부착"을 똑같이 맞는 짧은 "조준경 부착"이 아니라 "상급 조준경 부착"으로)
        hits.sort_by(|a, b| b.len.cmp(&a.len).then(a.dist.cmp(&b.dist)));
        let mut taken: Vec<(usize, usize)> = Vec::new();
        hits.into_iter()
            .filter(|h| {
                let free = taken.iter().all(|(s, e)| h.start + h.len <= *s || h.start >= *e);
                if free {
                    taken.push((h.start, h.start + h.len));
                }
                free
            })
            .collect()
    }

    /// 화면 전체(여러 줄)에서 카드별 증강 ID 를 왼쪽부터 최대 3개. width 는 캡처한 그림 폭
    pub fn find(&self, lines: &[Vec<Word>], width: f32) -> Vec<u32> {
        self.find_at(lines, width).into_iter().map(|f| f.0).collect()
    }

    /// find 와 같고, 각 제목의 위치(가운데 x, y)도 함께 (다음 확인 때 제목 줄만 읽기 위해)
    pub fn find_at(&self, lines: &[Vec<Word>], width: f32) -> Vec<(u32, f32, f32)> {
        let mut all: Vec<Hit> = lines.iter().flat_map(|l| self.line_hits(l)).collect();
        all.sort_by(|a, b| a.x.partial_cmp(&b.x).unwrap_or(std::cmp::Ordering::Equal));
        // x 로 묶기 (같은 카드 안의 설명 글자는 제목과 x 가 가깝다)
        let gap = (width * 0.12).max(40.0);
        let mut groups: Vec<Vec<Hit>> = Vec::new();
        for h in all {
            match groups.last_mut() {
                Some(g) if h.x - g[0].x < gap => g.push(h),
                _ => groups.push(vec![h]),
            }
        }
        let mut out: Vec<(u32, f32, f32)> = Vec::new();
        for g in groups {
            // 묶음에서 가장 위(제목), 같은 높이면 긴 이름
            if let Some(top) = g.iter().min_by(|a, b| a.y.partial_cmp(&b.y).unwrap_or(std::cmp::Ordering::Equal).then(b.len.cmp(&a.len))) {
                if !out.iter().any(|o| o.0 == top.id) {
                    out.push((top.id, top.x, top.y));
                }
            }
            if out.len() == 3 {
                break;
            }
        }
        out
    }
}

/// 카드 세 칸을 위치(가운데 x)로 기억한다. 한 장을 새로고침하는 동안 그 칸 제목이 잠깐 안 읽혀도
/// 다른 칸은 그대로 두고, 새 이름이 읽히면 그 칸만 바꾼다 (예전에는 2개만 읽힌 순간 추천에서 하나가 사라졌다)
#[derive(Default)]
pub struct Slots {
    s: Vec<(f32, u32)>,
}

impl Slots {
    pub fn clear(&mut self) {
        self.s.clear();
    }
    pub fn is_empty(&self) -> bool {
        self.s.is_empty()
    }
    pub fn len(&self) -> usize {
        self.s.len()
    }
    pub fn contains(&self, id: u32) -> bool {
        self.s.iter().any(|s| s.1 == id)
    }
    pub fn ids(&self) -> Vec<u32> {
        self.s.iter().map(|s| s.1).collect()
    }
    /// 아직 못 읽은 칸의 가운데 x (찾는 영역 기준). 카드 세 장은 게임 화면 가운데를 중심으로 같은 간격이고,
    /// 찾는 영역도 화면 가운데를 중심으로 잡으므로 가운데 = width/2. 읽은 칸들로 간격을 재서 빈 칸을 짐작한다
    pub fn missing(&self, width: f32) -> Vec<f32> {
        let mid = width / 2.0;
        let side: Vec<f32> = self.s.iter().map(|s| (s.0 - mid).abs()).filter(|d| *d > width * 0.06).collect();
        if side.is_empty() || self.s.len() >= 3 {
            return vec![];
        }
        let pitch = side.iter().sum::<f32>() / side.len() as f32;
        if pitch < width * 0.1 || pitch > width * 0.45 {
            return vec![];
        }
        [mid - pitch, mid, mid + pitch].into_iter().filter(|c| self.s.iter().all(|s| (s.0 - c).abs() > pitch * 0.35)).collect()
    }
    /// 카드 간격 (빈 칸을 잘라 읽을 폭)
    pub fn pitch(&self, width: f32) -> Option<f32> {
        let mid = width / 2.0;
        let side: Vec<f32> = self.s.iter().map(|s| (s.0 - mid).abs()).filter(|d| *d > width * 0.06).collect();
        (!side.is_empty()).then(|| side.iter().sum::<f32>() / side.len() as f32)
    }
    /// 읽은 제목들(ID, 가운데 x, y) 반영 → 왼쪽부터 칸별 ID
    pub fn update(&mut self, hits: &[(u32, f32, f32)], width: f32) -> Vec<u32> {
        let tol = (width * 0.08).max(40.0);
        for &(id, x, _) in hits {
            let near = self.s.iter().enumerate().map(|(i, s)| (i, (s.0 - x).abs())).min_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
            match near {
                Some((i, d)) if d < tol || self.s.len() >= 3 => self.s[i] = (x, id),
                _ => self.s.push((x, id)),
            }
            // 같은 증강이 다른 칸에 남아 있으면 (옛 위치) 지운다
            let keep = self.s.iter().position(|s| s.1 == id && (s.0 - x).abs() < f32::EPSILON);
            let mut i = 0;
            self.s.retain(|s| { let k = s.1 != id || Some(i) == keep; i += 1; k });
        }
        self.s.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
        self.s.iter().map(|s| s.1).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const DATA: &str = include_str!("../../../../packages/core/data/mayhem-augments.json");
    fn w(t: &str, x: f32, y: f32) -> Word {
        Word { text: t.into(), x, y, w: 36.0 * t.chars().count() as f32 }
    }
    fn id_of(name: &str) -> u32 {
        let d: serde_json::Value = serde_json::from_str(DATA).unwrap();
        d["augments"].as_array().unwrap().iter().find(|a| a["name"] == name).unwrap()["id"].as_u64().unwrap() as u32
    }

    #[test]
    fn 카드_세장_제목을_왼쪽부터() {
        let m = Matcher::from_json(DATA);
        let lines = vec![
            vec![w("거인", 100.0, 50.0), w("학살자", 160.0, 50.0)],
            vec![w("크기가", 100.0, 120.0), w("작아져", 160.0, 120.0)],
            vec![w("빠른", 600.0, 52.0), w("발놀림", 650.0, 52.0)],
            vec![w("최상급", 1100.0, 50.0), w("조준경", 1170.0, 50.0), w("부착", 1240.0, 50.0)],
        ];
        let found = m.find(&lines, 1600.0);
        assert_eq!(found[0], id_of("거인 학살자"));
        assert_eq!(*found.last().unwrap(), id_of("최상급 조준경 부착"));
    }

    #[test]
    fn 설명으로_찾기() {
        let m = Matcher::from_json(DATA);
        // 실제 게임 화면 설명 (데이터 문장과 조금 다르다)
        assert_eq!(m.match_desc("처치 관여 시 크기가 작아지고 스킬 가속 및 이동 속도를 얻습니다. 사망 시 중첩을 65% 잃습니다."), Some(id_of("축소 엔진")));
        assert_eq!(m.match_desc("여진과 빙결 강화 핵심 룬을 얻습니다."), Some(id_of("넘을 수 없는 벽")));
        // 너무 짧거나 흔한 문장은 고르지 않는다
        assert_eq!(m.match_desc("피해량"), None);
    }

    #[test]
    fn 빈_칸_짐작() {
        let mut s = Slots::default();
        s.update(&[(1, 300.0, 0.0), (2, 800.0, 0.0)], 1600.0);
        let miss = s.missing(1600.0);
        assert_eq!(miss.len(), 1);
        assert!((miss[0] - 1300.0).abs() < 1.0);
    }

    #[test]
    fn 제목_높이가_달라도_세장() {
        // 실제 화면 (0.9.34): 점멸 난사 / 신성한 중재 / 축소 엔진, 설명에 "점멸 사용 가능 횟수"
        let m = Matcher::from_json(DATA);
        let lines = vec![
            vec![w("축소", 1300.0, 60.0), w("엔진", 1370.0, 60.0)],
            vec![w("신성한", 780.0, 78.0), w("중재", 860.0, 78.0)],
            vec![w("점멸", 250.0, 100.0), w("난사", 320.0, 100.0)],
            vec![w("점멸", 150.0, 180.0), w("사용", 210.0, 180.0), w("가능", 270.0, 180.0)],
        ];
        assert_eq!(m.find(&lines, 1600.0), vec![id_of("점멸 난사"), id_of("신성한 중재"), id_of("축소 엔진")]);
    }

    #[test]
    fn 띄어쓰기_틀려도_한글자_틀려도() {
        let m = Matcher::from_json(DATA);
        let lines = vec![vec![w("최상급조준경", 100.0, 10.0), w("부차", 200.0, 10.0)]];
        assert_eq!(m.find(&lines, 1600.0), vec![id_of("최상급 조준경 부착")]);
    }

    #[test]
    fn 짧은_이름은_설명_속에서_찾지_않는다() {
        // 실제 화면: 꽝! / 범람 / 점멸 난사, 설명에 "보호막 흡수량"
        let m = Matcher::from_json(DATA);
        let lines = vec![
            vec![w("꽝!", 700.0, 345.0)],
            vec![w("범람", 990.0, 345.0)],
            vec![w("점멸", 1270.0, 345.0), w("난사", 1310.0, 345.0)],
            vec![w("강철", 640.0, 400.0), w("주먹", 680.0, 400.0), w("효과로", 720.0, 400.0)],
            vec![w("스킬의", 920.0, 425.0), w("체력", 960.0, 425.0), w("회복량,", 1000.0, 425.0), w("보호막", 1040.0, 425.0), w("흡수량", 1080.0, 425.0)],
        ];
        assert_eq!(m.find(&lines, 2000.0), vec![2111, id_of("범람"), id_of("점멸 난사")]);
        // 제목이 안 읽혀도 설명 속 "흡수량"을 흡수로 잡지 않는다
        let only_desc = vec![vec![w("보호막", 1040.0, 425.0), w("흡수량", 1080.0, 425.0)]];
        assert!(m.find(&only_desc, 2000.0).is_empty());
    }

    #[test]
    fn 한_장을_새로고침해도_나머지는_그대로() {
        let mut s = Slots::default();
        assert_eq!(s.update(&[(1, 700.0, 0.0), (2, 1000.0, 0.0), (3, 1290.0, 0.0)], 2000.0), vec![1, 2, 3]);
        // 가운데 카드가 바뀌는 중: 양쪽 둘만 읽힘 → 세 칸 그대로
        assert_eq!(s.update(&[(1, 702.0, 0.0), (3, 1288.0, 0.0)], 2000.0), vec![1, 2, 3]);
        // 새 이름이 읽히면 그 칸만
        assert_eq!(s.update(&[(9, 995.0, 0.0)], 2000.0), vec![1, 9, 3]);
        // 이름 길이가 달라 가운데가 조금 달라도 같은 칸
        assert_eq!(s.update(&[(7, 1330.0, 0.0)], 2000.0), vec![1, 9, 7]);
    }

    #[test]
    fn 자모가_조금_틀려도_세장_모두() {
        // 실제 화면: 위력 추구 / 날쌘걸음 / 신난다! — 가운데를 여러 모양으로 잘못 읽어도 찾는다
        let m = Matcher::from_json(DATA);
        for mid in ["날쎈겉음", "날쌘 걸음", "날쌘걸음.", "날썬걸음", "닐쌘걸음", "날쌘걸음:"] {
            let lines = vec![
                vec![w("위력", 380.0, 300.0), w("추구", 440.0, 300.0)],
                vec![w(mid, 700.0, 296.0)],
                vec![w("신난다!", 1000.0, 290.0)],
            ];
            assert_eq!(m.find(&lines, 1800.0), vec![id_of("위력 추구"), id_of("날쌘걸음"), id_of("신난다!")], "{mid}");
        }
    }

    #[test]
    fn 긴_이름을_짧은_이름보다_먼저() {
        let m = Matcher::from_json(DATA);
        for t in [["상급", "조준경", "부착"], ["삼급", "조준경", "부착"], ["상급", "조준경", "부칙"]] {
            let line: Vec<Word> = t.iter().enumerate().map(|(i, x)| w(x, 170.0 + i as f32 * 70.0, 300.0)).collect();
            assert_eq!(m.find(&[line], 1800.0), vec![id_of("상급 조준경 부착")], "{t:?}");
        }
        let line = vec![w("최상급", 170.0, 300.0), w("조준경", 260.0, 300.0), w("부착", 330.0, 300.0)];
        assert_eq!(m.find(&[line], 1800.0), vec![id_of("최상급 조준경 부착")]);
        let line = vec![w("조준경", 260.0, 300.0), w("부착", 330.0, 300.0)];
        assert_eq!(m.find(&[line], 1800.0), vec![id_of("조준경 부착")]);
    }

    #[test]
    fn 설명_문장을_이름으로_잡지_않는다() {
        // 카드 설명 몇 줄 (이름은 안 읽힘) → 아무것도, 또는 엉뚱한 증강이 나오면 안 된다
        let m = Matcher::from_json(DATA);
        let lines = vec![
            vec![w("처치", 900.0, 400.0), w("관여", 940.0, 400.0), w("시", 980.0, 400.0), w("4초", 1000.0, 400.0), w("동안", 1040.0, 400.0), w("이동", 1080.0, 400.0), w("속도", 1120.0, 400.0)],
            vec![w("최후의", 300.0, 420.0), w("의식", 360.0, 420.0), w("사용", 400.0, 420.0), w("시", 440.0, 420.0), w("커서", 460.0, 420.0), w("방향으로", 500.0, 420.0)],
        ];
        let found = m.find(&lines, 1800.0);
        assert!(found.is_empty(), "{found:?}");
    }

    #[test]
    fn 아무것도_없으면_빈칸() {
        let m = Matcher::from_json(DATA);
        let lines = vec![vec![w("상점", 10.0, 10.0), w("골드", 60.0, 10.0)]];
        assert!(m.find(&lines, 1600.0).len() <= 1);
    }
}
