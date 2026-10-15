//! 게임 중 증강 자동 인식과 게임 위 작은 창 (CLAUDE.md v3.5 사용자 결정, Windows 전용).
//!
//! 지키는 것
//! - 게임 창이 맨 앞에 있을 때만 화면 가운데 일부를 복사해 Windows 내장 문자 인식으로 읽는다
//! - 캡처한 그림은 메모리에서만 쓰고 저장·전송하지 않는다
//! - 게임 프로세스·메모리·입력은 건드리지 않는다. 롤에 요청도 하지 않는다
//! - 작은 창은 클릭이 통과하고, 포커스를 가져가지 않으며, 화면 녹화·캡처에도 찍히지 않는다

use crate::matcher::{Matcher, Slots, Word};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

const AUGMENTS_JSON: &str = include_str!("../../../../packages/core/data/mayhem-augments.json");
const EVERY: Duration = Duration::from_millis(600);
/// 카드가 보이는 동안: 새로고침을 바로 따라가도록 자주, 제목 줄만 좁게 읽는다
const FAST: Duration = Duration::from_millis(350);
const IDLE: Duration = Duration::from_secs(4);
/// 카드가 안 읽혀도 작은 창을 그대로 두는 시간. 새로고침 애니메이션 동안 제목이 잠깐 사라져도 창은 깜빡이지 않는다.
/// 이만큼 계속 안 보이면 다 고른 것으로 보고 닫는다
const HOLD: Duration = Duration::from_millis(3000);
/// 게임 창이 잠깐 뒤로 가도(알림·포커스 튐) 바로 닫지 않는다
const AWAY: Duration = Duration::from_millis(1500);

#[derive(Serialize, Deserialize, Clone)]
pub struct Settings {
    pub enabled: bool,
    /// 작은 창 위치: "right" (오른쪽 가운데) | "top" (위 가운데)
    pub position: String,
}
impl Default for Settings {
    fn default() -> Self {
        Self { enabled: true, position: "right".into() }
    }
}

#[derive(Serialize, Clone, Default)]
pub struct Seen {
    pub ids: Vec<u32>,
    pub at: u64,
}

#[derive(Serialize, Clone, Default)]
pub struct Report {
    /// 인식기 상태: "ok" | "no-korean" (한국어 인식 없음) | "unsupported" (윈도우가 아님)
    pub engine: String,
    pub last_text: String,
    pub last_ids: Vec<u32>,
    pub last_at: u64,
    /// 지금 어디까지 왔는지 (설정·게임 화면에 그대로 보여 준다)
    /// "off" 꺼짐 | "wait" 동의 전 | "no-game" 게임 창 없음 | "back" 게임 창이 뒤에 있음 | "capture" 화면 복사 실패
    /// | "reading" 읽었지만 증강 2개 이상을 못 찾음 | "found" 찾음
    pub stage: String,
    pub stage_at: u64,
    /// 마지막으로 읽은 화면에서 찾은 증강 수
    pub hits: u32,
    /// 한 번 읽는 데 걸린 시간 (복사 + 문자 인식)
    pub read_ms: u32,
    /// 게임 창을 찾은 방법: "class" | "process" | ""
    pub window: String,
}

pub struct Vision {
    path: PathBuf,
    pub settings: Mutex<Settings>,
    pub report: Mutex<Report>,
    pub matcher: Matcher,
    shown: AtomicBool,
    /// 로그인 + 수집 동의를 마쳤는지 (첫 화면을 끝내기 전에는 인식하지 않는다)
    pub allowed: AtomicBool,
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

impl Vision {
    pub fn new(dir: PathBuf) -> Arc<Self> {
        let path = dir.join("vision.json");
        let settings = std::fs::read_to_string(&path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
        Arc::new(Self { path, settings: Mutex::new(settings), report: Mutex::new(Report::default()), matcher: Matcher::from_json(AUGMENTS_JSON), shown: AtomicBool::new(false), allowed: AtomicBool::new(false) })
    }

    pub fn set(&self, s: Settings) {
        if let Ok(j) = serde_json::to_string(&s) {
            let _ = std::fs::write(&self.path, j);
        }
        *self.settings.lock().unwrap() = s;
    }

    fn stage(&self, stage: &str, hits: u32, window: &str) {
        let mut r = self.report.lock().unwrap();
        if r.stage != stage { r.stage_at = now(); }
        r.stage = stage.into();
        r.hits = hits;
        r.window = window.into();
    }

    fn publish(&self, app: &AppHandle, ids: Vec<u32>, text: String) {
        let mut r = self.report.lock().unwrap();
        r.last_text = text.chars().take(400).collect();
        if !ids.is_empty() {
            r.last_ids = ids.clone();
            r.last_at = now();
        }
        drop(r);
        let _ = app.emit("augments", Seen { ids, at: now() });
    }

    /// 백그라운드 확인 루프 (앱이 켜져 있는 동안)
    pub fn start(self: Arc<Self>, app: AppHandle) {
        std::thread::spawn(move || imp::run(self, app));
    }

    pub fn hide(&self, app: &AppHandle) {
        if self.shown.swap(false, Ordering::SeqCst) {
            imp::hide_overlay(app);
        }
    }
}

/// 작은 창 만들기 (처음엔 숨김). 클릭 통과·포커스 안 가져감·캡처 제외는 윈도우 쪽에서 설정
pub fn create_overlay(app: &tauri::App) -> tauri::Result<()> {
    let w = tauri::WebviewWindowBuilder::new(app, "overlay", tauri::WebviewUrl::App("overlay.html".into()))
        .title("Prism")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false)
        .inner_size(420.0, 540.0)
        .build()?;
    let _ = w.set_ignore_cursor_events(true);
    imp::prepare_overlay(&w);
    // 오른쪽 위 구석의 작은 프리즘: 자동 인식이 이 게임 화면을 보고 있다는 표시 (게임 창이 맨 앞일 때만)
    let b = tauri::WebviewWindowBuilder::new(app, "badge", tauri::WebviewUrl::App("badge.html".into()))
        .title("Prism")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false)
        .inner_size(BADGE, BADGE)
        .build()?;
    let _ = b.set_ignore_cursor_events(true);
    imp::prepare_overlay(&b);
    Ok(())
}

/// 구석 표시 크기 (논리 픽셀)
const BADGE: f64 = 20.0;

#[cfg(windows)]
mod imp {
    use super::*;
    use windows::core::{HSTRING, PCWSTR};
    use windows::Globalization::Language;
    use windows::Graphics::Imaging::{BitmapAlphaMode, BitmapPixelFormat, SoftwareBitmap};
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::DataWriter;
    use windows::Win32::Foundation::{HWND, POINT, RECT};
    use windows::Win32::Graphics::Gdi::*;
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
    use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};

    /// 게임 창이 있는 모니터의 실제 배율. 롤 게임 창은 배율을 따로 쓰지 않는 창이라
    /// GetDpiForWindow(게임 창)는 늘 96(100%)을 돌려준다 → 모니터 배율을 직접 묻는다.
    /// 작은 창(WebView)은 그 모니터 배율로 그려지므로 창 크기도 같은 배율로 잡아야 글자가 맞는다.
    fn monitor_scale(h: HWND) -> f64 {
        let mon = unsafe { MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST) };
        let (mut x, mut y) = (0u32, 0u32);
        match unsafe { GetDpiForMonitor(mon, MDT_EFFECTIVE_DPI, &mut x, &mut y) } {
            Ok(()) if x > 0 => x as f64 / 96.0,
            _ => 1.0,
        }
    }
    use windows::Win32::UI::WindowsAndMessaging::*;

    pub fn engine() -> Option<OcrEngine> {
        let ko = Language::CreateLanguage(&HSTRING::from("ko")).ok()?;
        OcrEngine::TryCreateFromLanguage(&ko).ok()
    }

    /// 게임 창: 창 종류 이름으로 찾고, 못 찾으면 맨 앞 창이 게임 프로세스(League of Legends.exe)의 창인지 본다
    /// (창 종류 이름이 패치로 바뀌어도 동작하도록. 롤에 요청하지 않고 OS 정보만 본다)
    fn game_window(pids: &mut (Vec<u32>, Option<std::time::Instant>)) -> Option<(HWND, &'static str)> {
        if let Ok(h) = unsafe { FindWindowW(windows::core::w!("RiotWindowClass"), PCWSTR::null()) } {
            if !h.is_invalid() { return Some((h, "class")); }
        }
        if pids.1.map_or(true, |t| t.elapsed() > Duration::from_secs(5)) {
            *pids = (crate::lcu::game_pids(), Some(std::time::Instant::now()));
        }
        if pids.0.is_empty() { return None; }
        let fg = unsafe { GetForegroundWindow() };
        if fg.is_invalid() { return None; }
        let mut pid = 0u32;
        let _ = unsafe { GetWindowThreadProcessId(fg, Some(&mut pid as *mut u32)) };
        if pids.0.contains(&pid) { Some((fg, "process")) } else { None }
    }

    /// 게임 창 화면 좌표 (클라이언트 영역)
    fn client_rect(h: HWND) -> Option<RECT> {
        let mut rc = RECT::default();
        unsafe { GetClientRect(h, &mut rc) }.ok()?;
        let mut p = POINT { x: 0, y: 0 };
        let _ = unsafe { ClientToScreen(h, &mut p) };
        Some(RECT { left: p.x, top: p.y, right: p.x + rc.right, bottom: p.y + rc.bottom })
    }

    /// 화면 일부를 BGRA 로 복사 (화면에 보이는 그대로. 게임 프로세스에는 손대지 않는다)
    fn grab(x: i32, y: i32, w: i32, h: i32) -> Option<Vec<u8>> {
        unsafe {
            let screen = GetDC(None);
            let mem = CreateCompatibleDC(Some(screen));
            let bmp = CreateCompatibleBitmap(screen, w, h);
            let old = SelectObject(mem, bmp.into());
            let ok = BitBlt(mem, 0, 0, w, h, Some(screen), x, y, SRCCOPY).is_ok();
            let mut bi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER { biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32, biWidth: w, biHeight: -h, biPlanes: 1, biBitCount: 32, biCompression: BI_RGB.0, ..Default::default() },
                ..Default::default()
            };
            let mut buf = vec![0u8; (w * h * 4) as usize];
            let lines = GetDIBits(mem, bmp, 0, h as u32, Some(buf.as_mut_ptr() as *mut _), &mut bi, DIB_RGB_COLORS);
            SelectObject(mem, old);
            let _ = DeleteObject(bmp.into());
            let _ = DeleteDC(mem);
            ReleaseDC(None, screen);
            if !ok || lines == 0 {
                return None;
            }
            let mut lit = 0usize;
            for px in buf.chunks_exact_mut(4) {
                px[3] = 255;
                if px[0] as u16 + px[1] as u16 + px[2] as u16 > 24 { lit += 1; }
            }
            // 거의 다 검으면 전체 화면(독점) 모드라 화면이 복사되지 않은 것 → '테두리 없는 창 모드' 안내
            if lit * 100 < buf.len() / 4 {
                return None;
            }
            Some(buf)
        }
    }

    /// 문자 인식 → 줄마다 단어(글자·위치)
    pub fn recognize(engine: &OcrEngine, bgra: &[u8], w: i32, h: i32) -> windows::core::Result<(Vec<Vec<Word>>, String)> {
        let dw = DataWriter::new()?;
        dw.WriteBytes(bgra)?;
        let buf = dw.DetachBuffer()?;
        let bmp = SoftwareBitmap::CreateCopyWithAlphaFromBuffer(&buf, BitmapPixelFormat::Bgra8, w, h, BitmapAlphaMode::Ignore)?;
        let res = engine.RecognizeAsync(&bmp)?.get()?;
        let mut lines = Vec::new();
        let mut text = String::new();
        for line in res.Lines()? {
            let mut words = Vec::new();
            for word in line.Words()? {
                let r = word.BoundingRect()?;
                words.push(Word { text: word.Text()?.to_string(), x: r.X, y: r.Y, w: r.Width });
            }
            text.push_str(&line.Text()?.to_string());
            text.push('\n');
            lines.push(words);
        }
        Ok((lines, text))
    }

    /// 찾는 곳: 게임 화면 가운데 (카드가 뜨는 자리). 실제 화면으로 맞춰 가며 조정한다
    /// 카드 제목이 뜨는 가로 띠 (16:9 기준 화면 높이 40% 안팎). 좁게 읽어야 빠르고, 다른 글자에 덜 흔들린다
    fn region(rc: &RECT) -> (i32, i32, i32, i32) {
        let (w, h) = (rc.right - rc.left, rc.bottom - rc.top);
        (rc.left + w * 12 / 100, rc.top + h * 26 / 100, w * 76 / 100, h * 34 / 100)
    }
    /// 넓게: 좁은 띠에서 못 찾을 때 가끔 (화면 비율·UI 크기가 다른 경우)
    fn region_wide(rc: &RECT) -> (i32, i32, i32, i32) {
        let (w, h) = (rc.right - rc.left, rc.bottom - rc.top);
        (rc.left + w * 8 / 100, rc.top + h * 10 / 100, w * 84 / 100, h * 62 / 100)
    }

    pub fn run(v: Arc<Vision>, app: AppHandle) {
        let _ = unsafe { RoInitialize(RO_INIT_MULTITHREADED) };
        let eng = engine();
        v.report.lock().unwrap().engine = if eng.is_some() { "ok".into() } else { "no-korean".into() };
        let mut misses = 0;
        // 제목 줄 (찾는 영역 안에서의 y, 높이). 카드가 보이는 동안만 쓴다
        let mut band: Option<(i32, i32)> = None;
        let mut band_wide = false;
        let mut last: Vec<u32> = Vec::new();
        let mut slots = Slots::default();
        // 마지막으로 카드를 본 때, 게임 창이 뒤로 간 때
        let mut seen_at: Option<std::time::Instant> = None;
        let mut away_at: Option<std::time::Instant> = None;
        // 구석 표시를 놓은 게임 화면 위치 (None = 숨김)
        let mut badge_at: Option<(RECT, u64)> = None;
        let mut pids: (Vec<u32>, Option<std::time::Instant>) = (Vec::new(), None);
        loop {
            let s = v.settings.lock().unwrap().clone();
            let allowed = v.allowed.load(Ordering::SeqCst);
            let game = if s.enabled && allowed { game_window(&mut pids) } else { None };
            let front = game.filter(|(h, _)| unsafe { GetForegroundWindow() } == *h);
            let how = game.map(|g| g.1).unwrap_or("");
            if front.is_some() {
                away_at = None;
            } else if game.is_some() && v.shown.load(Ordering::SeqCst) && away_at.get_or_insert_with(std::time::Instant::now).elapsed() < AWAY {
                std::thread::sleep(FAST);
                continue;
            }
            let (Some((h, _)), Some(eng)) = (front, eng.as_ref()) else {
                if badge_at.take().is_some() {
                    hide_window(&app, "badge");
                }
                v.stage(if !s.enabled { "off" } else if !allowed { "wait" } else if game.is_none() { "no-game" } else { "back" }, 0, how);
                v.hide(&app);
                band = None;
                last.clear();
                slots.clear();
                seen_at = None;
                std::thread::sleep(if game.is_some() { EVERY } else { IDLE });
                continue;
            };
            let Some(rc) = client_rect(h) else { std::thread::sleep(EVERY); continue };
            // 게임 창이 있는 모니터의 배율 (모니터마다 배율이 다를 수 있다)
            let scale = monitor_scale(h);
            if badge_at != Some((rc, scale.to_bits())) {
                show_badge(&app, &rc, scale);
                badge_at = Some((rc, scale.to_bits()));
            }
            // 제목 줄을 아직 모르면: 보통은 좁은 띠, 네 번에 한 번은 넓게
            // 제목 줄을 찾았으면 그 줄을 찾은 범위 그대로 (좁은 띠 / 넓게 기준이 다르다)
            let wide = if band.is_some() { band_wide } else { misses % 4 == 3 };
            let (x, y, w, hh) = if wide { region_wide(&rc) } else { region(&rc) };
            if w < 200 || hh < 100 { std::thread::sleep(EVERY); continue; }
            // 카드가 떠 있으면 제목 줄만, 아니면 넓게
            let (by, bh) = band.unwrap_or((0, hh));
            let t0 = std::time::Instant::now();
            let found = grab(x, y + by, w, bh).and_then(|buf| recognize(eng, &buf, w, bh).ok());
            v.report.lock().unwrap().read_ms = t0.elapsed().as_millis() as u32;
            let shown = v.shown.load(Ordering::SeqCst);
            match found {
                Some((lines, text)) => {
                    let hits = v.matcher.find_at(&lines, w as f32);
                    // 처음엔 2장 이상 보여야 카드 화면으로 보고, 그 뒤로는 한 장만 읽혀도 그 칸을 갱신한다
                    let seen = hits.len() >= 2 || (!slots.is_empty() && !hits.is_empty());
                    v.stage(if seen { "found" } else { "reading" }, hits.len() as u32, how);
                    if seen {
                        misses = 0;
                        seen_at = Some(std::time::Instant::now());
                        if band.is_none() {
                            // 제목 줄 위아래로 여유를 두고 기억
                            let top = hits.iter().map(|h| h.2).fold(f32::MAX, f32::min) as i32;
                            let bottom = hits.iter().map(|h| h.2).fold(0.0, f32::max) as i32;
                            let m = (hh * 6 / 100).max(24);
                            let y0 = (top - m).max(0);
                            band = Some((y0, (bottom - y0 + m * 2).min(hh - y0)));
                            band_wide = wide;
                        }
                        let ids = slots.update(&hits, w as f32);
                        if ids != last || !shown {
                            last = ids.clone();
                            v.publish(&app, ids, text);
                            show_overlay(&app, &rc, &s.position, scale);
                            v.shown.store(true, Ordering::SeqCst);
                        }
                    } else {
                        misses += 1;
                        v.report.lock().unwrap().last_text = text.chars().take(400).collect();
                        if band.is_some() && misses >= 2 {
                            // 제목 줄에서 못 찾으면 넓게 다시 (창 크기가 바뀌었을 수도)
                            band = None;
                        } else if shown && seen_at.map_or(true, |t| t.elapsed() > HOLD) {
                            // 한동안 카드가 안 보임 = 다 고름
                            last.clear();
                            slots.clear();
                            seen_at = None;
                            v.publish(&app, vec![], String::new());
                            v.hide(&app);
                        }
                    }
                }
                None => {
                    v.stage("capture", 0, how);
                    misses += 1
                }
            }
            std::thread::sleep(if v.shown.load(Ordering::SeqCst) { FAST } else { EVERY });
        }
    }

    fn hwnd_of(app: &AppHandle) -> Option<HWND> {
        hwnd_by(app, "overlay")
    }

    fn hwnd_by(app: &AppHandle, label: &str) -> Option<HWND> {
        let w = app.get_webview_window(label)?;
        w.hwnd().ok().map(|h| HWND(h.0 as _))
    }

    pub fn prepare_overlay(w: &tauri::WebviewWindow) {
        let Ok(h) = w.hwnd() else { return };
        let h = HWND(h.0 as _);
        unsafe {
            let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
            SetWindowLongPtrW(h, GWL_EXSTYLE, ex | (WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0 | WS_EX_TRANSPARENT.0 | WS_EX_LAYERED.0) as isize);
            // 녹화·캡처에 찍히지 않게 (우리 인식에도 섞이지 않는다)
            let _ = SetWindowDisplayAffinity(h, WDA_EXCLUDEFROMCAPTURE);
        }
    }

    /// scale: 게임 창이 있는 모니터의 배율 (작은 창이 지금 있는 모니터가 아니라)
    pub fn show_overlay(app: &AppHandle, rc: &RECT, position: &str, scale: f64) {
        let Some(h) = hwnd_of(app) else { return };
        // 다시 띄우면 대기 중인 '밀려 나가며 숨기기'를 무른다
        OV_GEN.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let (ow, oh) = ((420.0 * scale) as i32, (540.0 * scale) as i32);
        let m = (24.0 * scale) as i32;
        let (gw, gh) = (rc.right - rc.left, rc.bottom - rc.top);
        // 오른쪽: 게임 화면 오른쪽 끝에 딱 붙인다 (화면 안의 패널이 오른쪽에서 밀려 들어온다)
        let (x, y) = if position == "top" { (rc.left + (gw - ow) / 2, rc.top + m) } else { (rc.right - ow, rc.top + gh * 30 / 100) };
        unsafe {
            let _ = SetWindowPos(h, Some(HWND_TOPMOST), x, y, ow, oh, SWP_NOACTIVATE | SWP_SHOWWINDOW);
        }
    }

    /// 게임 화면 오른쪽 위 구석에 작은 프리즘
    fn show_badge(app: &AppHandle, rc: &RECT, scale: f64) {
        let Some(h) = hwnd_by(app, "badge") else { return };
        let size = (super::BADGE * scale) as i32;
        // 게임 화면 오른쪽 위 모서리에 딱 붙인다
        unsafe {
            let _ = SetWindowPos(h, Some(HWND_TOPMOST), rc.right - size, rc.top, size, size, SWP_NOACTIVATE | SWP_SHOWWINDOW);
        }
    }

    fn hide_window(app: &AppHandle, label: &str) {
        if let Some(h) = hwnd_by(app, label) {
            unsafe {
                let _ = ShowWindow(h, SW_HIDE);
            }
        }
    }

    /// 작은 창을 보였다 숨길 때마다 올리는 번호 (숨기기 전 사이에 다시 뜨면 숨기지 않는다)
    static OV_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    /// 밀려 나가는 시간 (overlay.css .ov.out 과 같게)
    const SLIDE_OUT_MS: u64 = 320;

    /// 숨기기: 화면에 '밀려 나가기'를 알리고, 끝나면 창을 숨긴다
    pub fn hide_overlay(app: &AppHandle) {
        use tauri::Emitter;
        let gen = OV_GEN.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
        let _ = app.emit_to("overlay", "overlay-out", ());
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(SLIDE_OUT_MS));
            if OV_GEN.load(std::sync::atomic::Ordering::SeqCst) != gen { return; }
            if let Some(h) = hwnd_of(&app) {
                unsafe {
                    let _ = ShowWindow(h, SW_HIDE);
                }
            }
        });
    }

    /// 인식 시험: 클립보드의 그림(Win+Shift+S 로 찍은 화면)을 같은 방식으로 읽어 본다
    pub fn test_clipboard(v: &Vision) -> Result<(Vec<u32>, String), String> {
        use windows::Win32::System::DataExchange::{CloseClipboard, GetClipboardData, OpenClipboard};
        use windows::Win32::System::Memory::{GlobalLock, GlobalUnlock};
        use windows::Win32::Foundation::HGLOBAL;
        const CF_DIB: u32 = 8;
        let _ = unsafe { RoInitialize(RO_INIT_MULTITHREADED) };
        let eng = engine().ok_or("이 PC 에서는 한국어 문자 인식을 쓸 수 없습니다. Windows 설정 → 언어에서 한국어를 추가해주세요.")?;
        let (bgra, w, h) = unsafe {
            OpenClipboard(None).map_err(|_| "클립보드를 열 수 없습니다.")?;
            let res = (|| {
                let hd = GetClipboardData(CF_DIB).map_err(|_| "클립보드에 그림이 없습니다. 증강 화면을 Win+Shift+S 로 찍은 뒤 눌러주세요.")?;
                let g = HGLOBAL(hd.0);
                let p = GlobalLock(g) as *const u8;
                if p.is_null() { return Err("클립보드를 읽지 못했습니다."); }
                let hdr = &*(p as *const BITMAPINFOHEADER);
                let (w, hgt, bpp) = (hdr.biWidth, hdr.biHeight, hdr.biBitCount);
                let top_down = hgt < 0;
                let h = hgt.abs();
                let mut off = hdr.biSize as usize;
                if hdr.biCompression == BI_BITFIELDS.0 && hdr.biSize == 40 { off += 12; }
                let stride = (((w * bpp as i32) + 31) / 32 * 4) as usize;
                let src = p.add(off);
                let mut out = vec![0u8; (w * h * 4) as usize];
                for row in 0..h as usize {
                    let sr = if top_down { row } else { h as usize - 1 - row };
                    for col in 0..w as usize {
                        let s = src.add(sr * stride + col * (bpp as usize / 8));
                        let d = (row * w as usize + col) * 4;
                        out[d] = *s; out[d + 1] = *s.add(1); out[d + 2] = *s.add(2); out[d + 3] = 255;
                    }
                }
                let _ = GlobalUnlock(g);
                if bpp != 24 && bpp != 32 { return Err("지원하지 않는 그림 형식입니다."); }
                Ok((out, w, h))
            })();
            let _ = CloseClipboard();
            res?
        };
        let (lines, text) = recognize(&eng, &bgra, w, h).map_err(|e| format!("문자 인식 실패: {e}"))?;
        Ok((v.matcher.find(&lines, w as f32), text))
    }
}

#[cfg(not(windows))]
mod imp {
    use super::*;
    pub fn run(v: Arc<Vision>, _app: AppHandle) {
        v.report.lock().unwrap().engine = "unsupported".into();
    }
    pub fn prepare_overlay(_w: &tauri::WebviewWindow) {}
    pub fn hide_overlay(_app: &AppHandle) {}
    pub fn test_clipboard(_v: &Vision) -> Result<(Vec<u32>, String), String> {
        Err("윈도우에서만 쓸 수 있습니다.".into())
    }
}

pub use imp::test_clipboard;
