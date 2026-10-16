//! 화면 오른쪽 아래 작은 알림 (v3.40). 트레이 '업데이트 확인'의 결과처럼, 창을 열지 않고 알려야 할 때.
//! 우리 창(toast.html)으로 그린다 — 윈도우 알림 센터는 설치 방식에 따라 앱 이름이 달라져서 쓰지 않는다.
//! 포커스를 가져가지 않고, 누르면 닫힌다. 몇 초 뒤 저절로 사라진다.
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

#[derive(Serialize, Clone)]
pub struct Toast {
    pub title: String,
    pub body: String,
    /// 'info' | 'ok' | 'busy' | 'warn'
    pub kind: &'static str,
    pub at: u64,
}

static LAST: Mutex<Option<Toast>> = Mutex::new(None);
static GEN: AtomicU64 = AtomicU64::new(0);
const W: f64 = 360.0;
const H: f64 = 96.0;

pub fn create(app: &tauri::App) -> tauri::Result<()> {
    tauri::WebviewWindowBuilder::new(app, "toast", tauri::WebviewUrl::App("toast.html".into()))
        .title("Prism")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false)
        .inner_size(W, H)
        .build()?;
    Ok(())
}

/// 화면이 처음 열릴 때 마지막 알림을 가져간다 (켜지자마자 보낸 알림을 놓치지 않게)
pub fn last() -> Option<Toast> {
    LAST.lock().unwrap().clone()
}

/// 알림 띄우기. ms 뒤 저절로 숨긴다 (그 사이 새 알림이 오면 새 것 기준)
pub fn show(app: &AppHandle, title: &str, body: &str, kind: &'static str, ms: u64) {
    let t = Toast { title: title.into(), body: body.into(), kind, at: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0) };
    *LAST.lock().unwrap() = Some(t.clone());
    let gen = GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let Some(w) = app.get_webview_window("toast") else { return };
    // 마우스가 있는 쪽이 아니라 주 모니터의 작업 영역(작업 표시줄 제외) 오른쪽 아래
    if let Ok(Some(m)) = w.primary_monitor() {
        let s = m.scale_factor();
        let area = m.work_area();
        let (tw, th) = ((W * s) as u32, (H * s) as u32);
        let gap = (16.0 * s) as i32;
        let _ = w.set_size(PhysicalSize::new(tw, th));
        let _ = w.set_position(PhysicalPosition::new(area.position.x + area.size.width as i32 - tw as i32 - gap, area.position.y + area.size.height as i32 - th as i32 - gap));
    }
    let _ = app.emit_to("toast", "toast", t);
    let _ = w.show();
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(ms));
        if GEN.load(Ordering::SeqCst) != gen {
            return;
        }
        let _ = app.emit_to("toast", "toast-out", ());
        std::thread::sleep(std::time::Duration::from_millis(OUT_MS));
        if GEN.load(Ordering::SeqCst) == gen {
            if let Some(w) = app.get_webview_window("toast") {
                let _ = w.hide();
            }
        }
    });
}

/// 화면에서 눌러 닫기: 아래로 내려가는 움직임을 보여 준 뒤 숨긴다 (그 사이 새 알림이 오면 숨기지 않는다)
pub fn hide(app: &AppHandle) {
    let gen = GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let _ = app.emit_to("toast", "toast-out", ());
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(OUT_MS));
        if GEN.load(Ordering::SeqCst) == gen {
            if let Some(w) = app.get_webview_window("toast") {
                let _ = w.hide();
            }
        }
    });
}

/// 내려가는 시간 (overlay.css .tst.out 과 같게)
const OUT_MS: u64 = 300;
