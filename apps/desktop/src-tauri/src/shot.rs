//! 놓친 증강 카드 그림 (CLAUDE.md v3.115). 세 칸을 다 못 채운 고르기에서 끝까지 못 읽은 카드 한 장만 잘라
//! 작게 줄인 JPEG 으로 만든다. 판이 끝날 때 자동 진단과 함께 서버로 가고, 관리자만 본다 (원인 확인 → QA 사진으로).
//! 카드 바깥(다른 플레이어 이름·채팅·미니맵)은 넣지 않는다.

use base64::Engine;

/// 줄인 그림의 최대 폭 (카드 제목·설명 글자를 눈으로 읽을 수 있을 만큼)
pub const MAX_W: usize = 260;
const QUALITY: u8 = 72;

/// BGRA 화면 복사본에서 카드 자리 (x0, x1, y0, y1) 만 잘라 줄이고 JPEG base64 로
pub fn card_jpeg(bgra: &[u8], w: usize, h: usize, card: (usize, usize, usize, usize)) -> Option<String> {
    let (x0, x1, y0, y1) = card;
    let (x1, y1) = (x1.min(w), y1.min(h));
    if x1 <= x0 + 8 || y1 <= y0 + 8 || bgra.len() < w * h * 4 {
        return None;
    }
    let (cw, ch) = (x1 - x0, y1 - y0);
    let k = (cw as f32 / MAX_W as f32).max(1.0);
    let (ow, oh) = (((cw as f32) / k).round().max(1.0) as usize, ((ch as f32) / k).round().max(1.0) as usize);
    // 칸마다 평균을 내어 줄인다 (글자가 깨지지 않게)
    let mut rgb = vec![0u8; ow * oh * 3];
    for oy in 0..oh {
        let sy0 = y0 + ((oy as f32) * k) as usize;
        let sy1 = (y0 + (((oy + 1) as f32) * k) as usize).clamp(sy0 + 1, y1);
        for ox in 0..ow {
            let sx0 = x0 + ((ox as f32) * k) as usize;
            let sx1 = (x0 + (((ox + 1) as f32) * k) as usize).clamp(sx0 + 1, x1);
            let (mut r, mut g, mut b, mut n) = (0u32, 0u32, 0u32, 0u32);
            for sy in sy0..sy1 {
                let row = sy * w * 4;
                for sx in sx0..sx1 {
                    let i = row + sx * 4;
                    b += bgra[i] as u32;
                    g += bgra[i + 1] as u32;
                    r += bgra[i + 2] as u32;
                    n += 1;
                }
            }
            let o = (oy * ow + ox) * 3;
            rgb[o] = (r / n) as u8;
            rgb[o + 1] = (g / n) as u8;
            rgb[o + 2] = (b / n) as u8;
        }
    }
    let mut out = Vec::new();
    let enc = jpeg_encoder::Encoder::new(&mut out, QUALITY);
    enc.encode(&rgb, ow as u16, oh as u16, jpeg_encoder::ColorType::Rgb).ok()?;
    Some(base64::engine::general_purpose::STANDARD.encode(out))
}
