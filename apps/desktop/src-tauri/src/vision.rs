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
    Ok(())
}

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
            for px in buf.chunks_exact_mut(4) {
                px[3] = 255;
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
    fn region(rc: &RECT) -> (i32, i32, i32, i32) {
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
        let mut last: Vec<u32> = Vec::new();
        let mut slots = Slots::default();
        let mut pids: (Vec<u32>, Option<std::time::Instant>) = (Vec::new(), None);
        loop {
            let s = v.settings.lock().unwrap().clone();
            let allowed = v.allowed.load(Ordering::SeqCst);
            let game = if s.enabled && allowed { game_window(&mut pids) } else { None };
            let front = game.filter(|(h, _)| unsafe { GetForegroundWindow() } == *h);
            let how = game.map(|g| g.1).unwrap_or("");
            let (Some((h, _)), Some(eng)) = (front, eng.as_ref()) else {
                v.stage(if !s.enabled { "off" } else if !allowed { "wait" } else if game.is_none() { "no-game" } else { "back" }, 0, how);
                v.hide(&app);
                band = None;
                last.clear();
                slots.clear();
                std::thread::sleep(if game.is_some() { EVERY } else { IDLE });
                continue;
            };
            let Some(rc) = client_rect(h) else { std::thread::sleep(EVERY); continue };
            let (x, y, w, hh) = region(&rc);
            if w < 200 || hh < 100 { std::thread::sleep(EVERY); continue; }
            // 카드가 떠 있으면 제목 줄만, 아니면 넓게
            let (by, bh) = band.unwrap_or((0, hh));
            let found = grab(x, y + by, w, bh).and_then(|buf| recognize(eng, &buf, w, bh).ok());
            let shown = v.shown.load(Ordering::SeqCst);
            match found {
                Some((lines, text)) => {
                    let hits = v.matcher.find_at(&lines, w as f32);
                    // 처음엔 2장 이상 보여야 카드 화면으로 보고, 그 뒤로는 한 장만 읽혀도 그 칸을 갱신한다
                    let seen = hits.len() >= 2 || (!slots.is_empty() && !hits.is_empty());
                    v.stage(if seen { "found" } else { "reading" }, hits.len() as u32, how);
                    if seen {
                        misses = 0;
                        if band.is_none() {
                            // 제목 줄 위아래로 여유를 두고 기억
                            let top = hits.iter().map(|h| h.2).fold(f32::MAX, f32::min) as i32;
                            let bottom = hits.iter().map(|h| h.2).fold(0.0, f32::max) as i32;
                            let m = (hh * 6 / 100).max(24);
                            let y0 = (top - m).max(0);
                            band = Some((y0, (bottom - y0 + m * 2).min(hh - y0)));
                        }
                        let ids = slots.update(&hits, w as f32);
                        if ids != last || !shown {
                            last = ids.clone();
                            v.publish(&app, ids, text);
                            show_overlay(&app, &rc, &s.position);
                            v.shown.store(true, Ordering::SeqCst);
                        }
                    } else {
                        misses += 1;
                        v.report.lock().unwrap().last_text = text.chars().take(400).collect();
                        if band.is_some() && misses >= 2 {
                            // 제목 줄에서 못 찾으면 넓게 다시 (창 크기가 바뀌었을 수도)
                            band = None;
                        } else if band.is_none() && misses >= 3 && shown {
                            // 고른 뒤 카드가 사라짐
                            last.clear();
                            slots.clear();
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
        let w = app.get_webview_window("overlay")?;
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

    pub fn show_overlay(app: &AppHandle, rc: &RECT, position: &str) {
        let Some(h) = hwnd_of(app) else { return };
        let scale = app.get_webview_window("overlay").and_then(|w| w.scale_factor().ok()).unwrap_or(1.0);
        let (ow, oh) = ((420.0 * scale) as i32, (540.0 * scale) as i32);
        let m = (24.0 * scale) as i32;
        let (gw, gh) = (rc.right - rc.left, rc.bottom - rc.top);
        let (x, y) = if position == "top" { (rc.left + (gw - ow) / 2, rc.top + m) } else { (rc.right - ow - m, rc.top + gh * 30 / 100) };
        unsafe {
            let _ = SetWindowPos(h, Some(HWND_TOPMOST), x, y, ow, oh, SWP_NOACTIVATE | SWP_SHOWWINDOW);
        }
    }

    pub fn hide_overlay(app: &AppHandle) {
        if let Some(h) = hwnd_of(app) {
            unsafe {
                let _ = ShowWindow(h, SW_HIDE);
            }
        }
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
