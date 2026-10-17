//! QA 기준 정하기용: 모든 카드의 (정답 묶음 점수, 오답 중 최고 점수)를 찍는다. QA_STATS=1 일 때만
use prism_vision_qa::{icons::IconBank, load_bgra, matcher, AUGMENTS_JSON, AUG_ICONS};
#[test]
fn 점수_분포() {
    let (Ok(_), Ok(dirs)) = (std::env::var("QA_STATS"), std::env::var("QA_DIRS")) else { return };
    let b = IconBank::new(AUG_ICONS, AUGMENTS_JSON);
    for d in dirs.split(',') {
        let d = std::path::PathBuf::from(d);
        let cases: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(d.join("cases.json")).unwrap()).unwrap();
        for c in cases.as_array().unwrap() {
            let (img, iw, _) = load_bgra(&d.join(c["file"].as_str().unwrap()));
            let (x, y, w, h) = matcher::region_of(c["w"].as_i64().unwrap() as i32, c["h"].as_i64().unwrap() as i32, true);
            let buf = prism_vision_qa::crop(&img, iw, x as usize, y as usize, w as usize, h as usize);
            let cards = matcher::find_cards(&buf, w as usize, h as usize);
            for (k, card) in c["cards"].as_array().unwrap().iter().enumerate() {
                let Some(found) = cards.get(k) else { continue };
                if card["ability"].as_bool().unwrap() || cards.len() != 3 { continue }
                if let Some((r, wr)) = b.qa_scores(&buf, w as usize, h as usize, *found, card["id"].as_u64().unwrap() as u32) {
                    println!("STAT {r:.3} {wr:.3}");
                }
            }
        }
    }
}
