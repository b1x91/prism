//! 앱 창의 크기·위치 기억 (v3.38). 사용자가 바꾼 크기·위치를 window.json 에 남기고 다음에 켤 때(업데이트로 다시 켜질 때도) 되살린다.
//! 기록이 없으면 세로로 넉넉한 기본 크기: 폭 1280, 높이는 화면 작업 영역의 90% (최대 1080, 논리 크기).
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{LogicalSize, PhysicalPosition, PhysicalSize, WebviewWindow};

#[derive(Serialize, Deserialize, Clone, Copy)]
struct Rect {
    x: i32,
    y: i32,
    w: u32,
    h: u32,
    #[serde(default)]
    max: bool,
}

fn file(dir: &Path) -> PathBuf {
    dir.join("window.json")
}

fn read(dir: &Path) -> Option<Rect> {
    serde_json::from_str(&std::fs::read_to_string(file(dir)).ok()?).ok()
}

/// 켤 때: 기억한 크기·위치(그 자리가 지금 어느 모니터 안에 있을 때만), 없으면 기본 크기 + 가운데
pub fn restore(w: &WebviewWindow, dir: &Path) {
    if let Some(r) = read(dir) {
        let on_screen = w.available_monitors().unwrap_or_default().iter().any(|m| {
            let (p, s) = (m.position(), m.size());
            // 창 위쪽 가운데가 모니터 안에 있으면 (제목 줄을 잡을 수 있게)
            let cx = r.x + r.w as i32 / 2;
            cx >= p.x && cx < p.x + s.width as i32 && r.y >= p.y && r.y < p.y + s.height as i32 - 48
        });
        if on_screen && r.w >= 600 && r.h >= 400 {
            let _ = w.set_size(PhysicalSize::new(r.w, r.h));
            let _ = w.set_position(PhysicalPosition::new(r.x, r.y));
            if r.max {
                let _ = w.maximize();
            }
            return;
        }
    }
    if let Ok(Some(m)) = w.current_monitor().or_else(|_| w.primary_monitor()) {
        let scale = m.scale_factor();
        let work_h = m.size().height as f64 / scale;
        let h = (work_h * 0.9).min(1080.0).max(640.0);
        let _ = w.set_size(LogicalSize::new(1280.0, h));
    }
    let _ = w.center();
}

/// 크기·위치가 바뀔 때·창을 닫을(트레이로 숨길) 때 남긴다. 최소화 중이면 남기지 않고, 최대화면 그 표시만 바꾼다
pub fn save(w: &WebviewWindow, dir: &Path) {
    if w.is_minimized().unwrap_or(false) || !w.is_visible().unwrap_or(false) {
        return;
    }
    let max = w.is_maximized().unwrap_or(false);
    let r = if max {
        match read(dir) {
            Some(old) => Rect { max: true, ..old },
            None => return,
        }
    } else {
        let (Ok(p), Ok(s)) = (w.outer_position(), w.inner_size()) else { return };
        Rect { x: p.x, y: p.y, w: s.width, h: s.height, max: false }
    };
    let _ = std::fs::create_dir_all(dir);
    let _ = std::fs::write(file(dir), serde_json::to_string(&r).unwrap_or_default());
}
