//! 증강 카드 인식 QA (v3.67) — 문자 인식 없이 확인할 수 있는 단계 전부:
//! ① 카드 자리 찾기(find_cards)가 세 장을 정확한 자리에서 찾는가
//! ② 글자를 하나도 못 읽었다고 치고, 아이콘 그림만으로 세 장을 맞히는가 (스킬 증강은 '모름'이어야 한다 — 틀린 답 금지)
//! ③ 두 장을 이미 읽었을 때 남은 한 장을 그림으로 맞히는가 (두 칸만 뜨던 판을 고치는 바로 그 경로)
//! 가상 화면(make_frames.py, QA_FRAMES) + 사용자가 보낸 실제 게임 화면 사진(fixtures/)
use prism_vision_qa::{icons::IconBank, load_bgra, matcher, AUGMENTS_JSON, AUG_ICONS};
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Deserialize)]
struct Card {
    id: u32,
    name: String,
    ability: bool,
    rect: [i32; 4],
}
#[derive(Deserialize)]
struct Case {
    file: String,
    w: i32,
    h: i32,
    layout: String,
    cards: Vec<Card>,
}

fn bank() -> IconBank {
    IconBank::new(AUG_ICONS, AUGMENTS_JSON)
}

/// 한 화면 검사. buf 는 읽는 곳(넓게) 전체, off 는 그 곳의 게임 화면 기준 시작점. 실패 이유를 모아 돌려준다
fn check(b: &IconBank, label: &str, buf: &[u8], w: usize, h: usize, off: (i32, i32), want: &[(u32, bool, Option<[i32; 4]>)]) -> Vec<String> {
    let mut fails = Vec::new();
    let cards = matcher::find_cards(buf, w, h);
    if cards.len() != want.len() {
        fails.push(format!("{label}: 카드 {}장 찾음 (기대 {}) {:?}", cards.len(), want.len(), cards));
        return fails;
    }
    // ① 자리: 찾은 카드 가운데가 실제 카드 안에 있어야 한다
    for (k, (_, _, rect)) in want.iter().enumerate() {
        if let Some(r) = rect {
            let cx = off.0 + ((cards[k].0 + cards[k].1) / 2) as i32;
            if cx < r[0] || cx > r[1] {
                fails.push(format!("{label}: {}번째 카드 자리 x={cx} 가 실제 {}..{} 밖", k + 1, r[0], r[1]));
            }
        }
    }
    let ok = |got: &Option<(Vec<u32>, f32, f32)>, id: u32, ability: bool, known: &[u32]| -> Result<(), String> {
        match (got, ability) {
            (None, true) => Ok(()),
            // 이미 읽은 증강만 든 묶음이면 앱은 고르지 않는다 (read_cards: 남는 후보가 없다)
            (Some((ids, _, _)), true) if ids.iter().all(|i| known.contains(i)) => Ok(()),
            (Some((ids, sc, _)), true) => Err(format!("스킬 증강인데 그림으로 {ids:?}({sc:.2})라고 답함")),
            (Some((ids, _, _)), false) if ids.contains(&id) => Ok(()),
            (Some((ids, sc, gap)), false) => Err(format!("틀림 {ids:?} 점수 {sc:.2} 차이 {gap:.2}")),
            (None, false) => Err("모름".into()),
        }
    };
    // ② 글자 없이 그림만으로 세 장
    let all = b.identify(buf, w, h, &cards, &(0..cards.len()).collect::<Vec<_>>(), &[]);
    let raw = b.identify_with(buf, w, h, &cards, &(0..cards.len()).collect::<Vec<_>>(), &[], -1.0, -1.0);
    for (k, ((id, ability, _), got)) in want.iter().zip(&all).enumerate() {
        if let Err(e) = ok(got, *id, *ability, &[]) {
            let r = raw[k].as_ref().map(|(ids, sc, gap)| format!("{ids:?} {sc:.2}/{gap:.2}")).unwrap_or_default();
            fails.push(format!("{label}: {}번째({id}) 그림만으로 — {e} (기준 없이: {r}, 카드 {:?})", k + 1, cards[k]));
        }
    }
    // ③ 두 장을 읽었을 때 남은 한 장 (카드마다)
    for k in 0..want.len() {
        let known: Vec<u32> = want.iter().enumerate().filter(|(j, _)| *j != k).map(|(_, w)| w.0).collect();
        let got = b.identify(buf, w, h, &cards, &[k], &known);
        if let Err(e) = ok(&got[0], want[k].0, want[k].1, &known) {
            fails.push(format!("{label}: 두 장을 안 뒤 {}번째({}) — {e}", k + 1, want[k].0));
        }
    }
    fails
}

#[test]
fn 가상_게임_화면() {
    let dir = PathBuf::from(std::env::var("QA_FRAMES").expect("QA_FRAMES 가 없습니다: python3 make_frames.py <폴더> 로 만들고 QA_FRAMES=<폴더>"));
    let cases: Vec<Case> = serde_json::from_str(&std::fs::read_to_string(dir.join("cases.json")).unwrap()).unwrap();
    assert!(cases.len() >= 20, "가상 화면이 너무 적습니다");
    let b = bank();
    let mut fails = Vec::new();
    for c in &cases {
        let (img, iw, _) = load_bgra(&dir.join(&c.file));
        let (x, y, w, h) = matcher::region_of(c.w, c.h, true);
        let buf = prism_vision_qa::crop(&img, iw, x as usize, y as usize, w as usize, h as usize);
        let want: Vec<(u32, bool, Option<[i32; 4]>)> = c.cards.iter().map(|k| (k.id, k.ability, Some(k.rect))).collect();
        let label = format!("{} {}x{} {} [{}]", c.file, c.w, c.h, c.layout, c.cards.iter().map(|k| k.name.as_str()).collect::<Vec<_>>().join(", "));
        let t = std::time::Instant::now();
        let f = check(&b, &label, &buf, w as usize, h as usize, (x, y), &want);
        println!("{} {label} ({:?})", if f.is_empty() { "통과" } else { "실패" }, t.elapsed());
        fails.extend(f);
    }
    assert!(fails.is_empty(), "\n{}\n", fails.join("\n"));
}

#[test]
fn 사용자_게임_화면_사진() {
    // 21:9 모니터, 카드가 왼쪽으로 치우친 화면 (오른쪽 '보석 건틀릿'을 놓치던 판)
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures");
    let b = bank();
    let mut fails = Vec::new();
    for (file, ids) in [("photo-ultrawide-1.png", [2087u32, 1018, 1048]), ("photo-ultrawide-2.png", [1349, 1004, 1048])] {
        let (img, w, h) = load_bgra(&base.join(file));
        let want: Vec<(u32, bool, Option<[i32; 4]>)> = ids.iter().map(|id| (*id, false, None)).collect();
        fails.extend(check(&b, file, &img, w, h, (0, 0), &want));
    }
    assert!(fails.is_empty(), "\n{}\n", fails.join("\n"));
}

/// 카드 없는 화면에서 카드 자리 찾기가 헛것을 얼마나 보는지 (v3.68: 게임 중 평소에는 이것만 돌리고, 찾았을 때만 문자 인식).
/// 헛것은 문자 인식을 한 번 더 돌릴 뿐이라 비율만 보고한다. 카드가 있는 화면을 놓치지 않는 것은 위 시험들이 본다
#[test]
fn 카드_없는_화면() {
    let Ok(empty) = std::env::var("QA_EMPTY") else { return };
    let d = PathBuf::from(empty);
    let ec: Vec<Case> = serde_json::from_str(&std::fs::read_to_string(d.join("cases.json")).unwrap()).unwrap();
    let mut fp = 0;
    for c in &ec {
        let (img, iw, _) = load_bgra(&d.join(&c.file));
        let (x, y, w, h) = matcher::region_of(c.w, c.h, true);
        let buf = prism_vision_qa::crop(&img, iw, x as usize, y as usize, w as usize, h as usize);
        if matcher::find_cards(&buf, w as usize, h as usize).len() >= 2 { fp += 1; }
    }
    println!("카드 없는 화면 {}장 중 '있다' {fp}", ec.len());
}
