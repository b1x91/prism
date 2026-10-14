//! 문자 인식 결과(줄·단어·위치)에서 아수라장 증강 이름을 찾는다. 플랫폼과 무관한 순수 로직 (리눅스에서도 테스트).
//!
//! 규칙
//! - 공백·기호를 뺀 글자끼리 비교한다 (인식기가 띄어쓰기를 틀리는 경우가 많다)
//! - 4글자 이상 이름은 한 글자 틀려도 같은 것으로 본다
//! - 2글자 이하 이름("흡수", "범람", "꽝")은 단어 하나가 통째로 같을 때만 (설명 속 "흡수량"을 이름으로 착각하지 않게)
//! - 게임 화면 글자가 데이터와 다른 증강은 별칭으로도 찾는다 (ALIASES)
//! - 한 줄에서 겹치는 후보는 긴 이름을 먼저 고른다 ("거인" < "거인 학살자")
//! - 카드는 가로로 놓이므로 x 위치로 묶고, 묶음마다 가장 위(제목)에 있는 것 하나만 쓴다

use serde::Deserialize;

pub struct Word {
    pub text: String,
    pub x: f32,
    pub y: f32,
}

#[derive(Deserialize)]
struct RawAug {
    id: u32,
    name: String,
    #[serde(default)]
    disabled: bool,
}
#[derive(Deserialize)]
struct RawData {
    augments: Vec<RawAug>,
}

/// 게임 화면에 실제로 쓰인 이름이 데이터(CommunityDragon)와 다른 증강: (ID, 화면 이름)
const ALIASES: &[(u32, &str)] = &[(2111, "꽝!")]; // 데이터는 "꽁!"

pub struct Matcher {
    names: Vec<(u32, Vec<char>)>,
}

fn norm(s: &str) -> Vec<char> {
    s.chars().filter(|c| c.is_alphanumeric()).flat_map(|c| c.to_lowercase()).collect()
}

struct Hit {
    id: u32,
    start: usize,
    len: usize,
    x: f32,
    y: f32,
}

impl Matcher {
    /// 앱에 묶인 증강 데이터(packages/core/data/mayhem-augments.json)에서 이름표를 만든다
    pub fn from_json(json: &str) -> Self {
        let d: RawData = serde_json::from_str(json).unwrap_or(RawData { augments: vec![] });
        let mut names: Vec<(u32, Vec<char>)> = d.augments.into_iter().filter(|a| !a.disabled).map(|a| (a.id, norm(&a.name))).filter(|(_, n)| !n.is_empty()).collect();
        let known: Vec<u32> = names.iter().map(|n| n.0).collect();
        names.extend(ALIASES.iter().filter(|(id, _)| known.contains(id)).map(|(id, n)| (*id, norm(n))));
        Self { names }
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
                pos.push((w.x, w.y));
                wid.push(i);
            }
        }
        let whole = |s: usize, n: usize| (s == 0 || wid[s - 1] != wid[s]) && (s + n == wid.len() || wid[s + n] != wid[s + n - 1]) && wid[s] == wid[s + n - 1];
        let mut hits = Vec::new();
        for (id, name) in &self.names {
            let n = name.len();
            if n > chars.len() {
                continue;
            }
            let allow = if n >= 4 { 1 } else { 0 };
            for s in 0..=chars.len() - n {
                let diff = chars[s..s + n].iter().zip(name).filter(|(a, b)| a != b).count();
                if diff <= allow && (n > 2 || whole(s, n)) {
                    hits.push(Hit { id: *id, start: s, len: n, x: pos[s].0, y: pos[s].1 });
                }
            }
        }
        // 긴 이름 우선, 겹치면 버림
        hits.sort_by(|a, b| b.len.cmp(&a.len));
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

    /// find 와 같고, 각 제목의 위치(x, y)도 함께 (다음 확인 때 제목 줄만 읽기 위해)
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

#[cfg(test)]
mod tests {
    use super::*;
    const DATA: &str = include_str!("../../../../packages/core/data/mayhem-augments.json");
    fn w(t: &str, x: f32, y: f32) -> Word {
        Word { text: t.into(), x, y }
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
    fn 아무것도_없으면_빈칸() {
        let m = Matcher::from_json(DATA);
        let lines = vec![vec![w("상점", 10.0, 10.0), w("골드", 60.0, 10.0)]];
        assert!(m.find(&lines, 1600.0).len() <= 1);
    }
}
