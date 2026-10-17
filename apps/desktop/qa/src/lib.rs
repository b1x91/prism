//! 앱 소스를 그대로 쓴다 (복사하지 않는다) — 시험하는 코드와 배포되는 코드가 늘 같다
#[path = "../../src-tauri/src/matcher.rs"]
#[allow(dead_code)]
pub mod matcher;
#[path = "../../src-tauri/src/icons.rs"]
#[allow(dead_code)]
pub mod icons;

pub const AUGMENTS_JSON: &str = include_str!("../../../../packages/core/data/mayhem-augments.json");
pub const AUG_ICONS: &[u8] = include_bytes!("../../../../packages/core/data/aug-icons.bin");

/// PNG → BGRA (앱이 화면을 복사한 것과 같은 순서)
pub fn load_bgra(path: &std::path::Path) -> (Vec<u8>, usize, usize) {
    let dec = png::Decoder::new(std::fs::File::open(path).unwrap());
    let mut r = dec.read_info().unwrap();
    let mut buf = vec![0; r.output_buffer_size()];
    let info = r.next_frame(&mut buf).unwrap();
    let (w, h) = (info.width as usize, info.height as usize);
    let ch = info.color_type.samples();
    let mut out = vec![255u8; w * h * 4];
    for i in 0..w * h {
        let s = &buf[i * ch..i * ch + ch.min(3)];
        out[i * 4] = s[2];
        out[i * 4 + 1] = s[1];
        out[i * 4 + 2] = s[0];
    }
    (out, w, h)
}

/// 그림 일부 잘라 내기 (BGRA)
pub fn crop(src: &[u8], sw: usize, x: usize, y: usize, w: usize, h: usize) -> Vec<u8> {
    let mut out = Vec::with_capacity(w * h * 4);
    for yy in y..y + h {
        let i = (yy * sw + x) * 4;
        out.extend_from_slice(&src[i..i + w * 4]);
    }
    out
}
