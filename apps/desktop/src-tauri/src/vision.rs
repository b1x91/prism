//! 게임 중 증강 자동 인식과 게임 위 작은 창 (CLAUDE.md v3.5 사용자 결정, Windows 전용).
//!
//! 지키는 것
//! - 게임 창이 화면에 떠 있으면(최소화 아님) 화면 가운데 일부를 복사해 Windows 내장 문자 인식으로 읽는다
//!   (게임이 막 시작돼 포커스가 다른 창에 있어도 읽는다 — 예전엔 게임 화면을 한 번 눌러야 떴다)
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
/// 증강 아이콘 특징값 (scripts/aug-icons.py) — 글자를 못 읽은 카드를 그림으로 찾는다
const AUG_ICONS: &[u8] = include_bytes!("../../../../packages/core/data/aug-icons.bin");
/// 카드가 안 보일 때. 화면 복사·문자 인식이 창 모드 게임과 GPU·CPU 를 나눠 쓰므로 너무 잦지 않게 (v3.61, 0.6 → 0.9초)
const EVERY: Duration = Duration::from_millis(900);
/// 카드가 보이는 동안: 새로고침을 바로 따라가도록 자주, 제목 줄만 좁게 읽는다
const FAST: Duration = Duration::from_millis(350);
const IDLE: Duration = Duration::from_secs(4);
/// 카드가 안 읽혀도 작은 창을 그대로 두는 시간. 새로고침 애니메이션 동안 제목이 잠깐 사라져도 창은 깜빡이지 않는다.
/// 이만큼 계속 안 보이면 다 고른 것으로 보고 닫는다
const HOLD: Duration = Duration::from_millis(3000);

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

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
    /// 최근 인식 과정 (최대 40줄): 카드 화면을 알아본 순간의 증강, 빈 칸을 잘라 읽은 결과와 읽은 글자.
    /// 설정 → 문의하기로 복사된다 (게임 화면의 글자만, 그림은 남기지 않는다)
    #[serde(default)]
    pub trace: Vec<String>,
}

/// 한 판 동안의 인식 집계 (v3.64 자동 진단). 작은 창이 한 번도 안 뜬 판이면 끝날 때 서버로 보낸다
#[derive(Serialize, Clone, Default)]
pub struct GameDiag {
    pub started: u64,
    /// 단계별 횟수 (found·reading·back·capture …)
    pub stages: std::collections::BTreeMap<String, u32>,
    pub shown: u32,
    pub raised: u32,
    pub capture_fails: u32,
    pub ocr_errors: u32,
    pub max_hits: u32,
    pub front: u32,
    pub not_front: u32,
    /// 마지막 게임 화면·배율·읽는 곳·모니터 수
    pub game_rect: [i32; 4],
    pub scale: f64,
    pub region: [i32; 4],
    pub monitors: i32,
    pub how: String,
    /// 증강 고르기 횟수, 그중 세 칸을 다 못 채운 횟수, 그림으로 찾은 카드 수
    pub offers: u32,
    pub partial: u32,
    pub by_icon: u32,
    /// 세 칸을 못 채운 고르기가 끝난 순간의 인식 기록 (최근 3번, 각 20줄 — 판이 끝날 때까지 다른 기록에 밀리지 않게)
    pub partial_trace: Vec<Vec<String>>,
}

pub struct Vision {
    path: PathBuf,
    pub diag: Mutex<Option<GameDiag>>,
    pub settings: Mutex<Settings>,
    pub report: Mutex<Report>,
    pub matcher: Matcher,
    pub icons: crate::icons::IconBank,
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
        Arc::new(Self { path, diag: Mutex::new(None), settings: Mutex::new(settings), report: Mutex::new(Report::default()), matcher: Matcher::from_json(AUGMENTS_JSON), icons: crate::icons::IconBank::new(AUG_ICONS, AUGMENTS_JSON), shown: AtomicBool::new(false), allowed: AtomicBool::new(false) })
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
        drop(r);
        if let Some(d) = self.diag.lock().unwrap().as_mut() {
            *d.stages.entry(stage.to_string()).or_default() += 1;
            d.max_hits = d.max_hits.max(hits);
        }
    }

    fn diag(&self, f: impl FnOnce(&mut GameDiag)) {
        if let Some(d) = self.diag.lock().unwrap().as_mut() {
            f(d);
        }
    }

    fn trace(&self, line: String) {
        let mut r = self.report.lock().unwrap();
        r.trace.push(format!("{} {}", now_ms() % 100_000_000, line));
        let n = r.trace.len();
        if n > 40 {
            r.trace.drain(..n - 40);
        }
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

    /// 읽을 자리(가운데 줄의 세 점)에 보이는 창이 모두 게임 창인가
    fn uncovered(h: HWND, x: i32, y: i32, w: i32, hh: i32) -> bool {
        [1, 2, 3].iter().all(|k| {
            let at = unsafe { WindowFromPoint(POINT { x: x + w * k / 4, y: y + hh / 2 }) };
            !at.is_invalid() && unsafe { GetAncestor(at, GA_ROOT) } == h
        })
    }

    /// 두 창이 같은 프로세스의 창인가
    fn same_process(a: HWND, b: HWND) -> bool {
        if a.is_invalid() || b.is_invalid() {
            return false;
        }
        let (mut pa, mut pb) = (0u32, 0u32);
        unsafe {
            let _ = GetWindowThreadProcessId(a, Some(&mut pa as *mut u32));
            let _ = GetWindowThreadProcessId(b, Some(&mut pb as *mut u32));
        }
        pa != 0 && pa == pb
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
        // 인식기가 받는 그림 크기에는 한도가 있다 (보통 한 변 2600). 큰 모니터(4K 등)의 넓은 띠는 넘어서 늘 실패했다 →
        // 정수 배로 줄여 읽고 글자 위치는 원래 크기로 되돌린다
        let max = OcrEngine::MaxImageDimension().unwrap_or(2600) as i32;
        if max > 0 && (w > max || h > max) {
            let k = ((w.max(h) + max - 1) / max).max(2);
            let (dw2, dh2) = (w / k, h / k);
            let mut small = vec![0u8; (dw2 * dh2 * 4) as usize];
            for yy in 0..dh2 {
                for xx in 0..dw2 {
                    let si = (((yy * k) * w + xx * k) * 4) as usize;
                    let di = ((yy * dw2 + xx) * 4) as usize;
                    small[di..di + 4].copy_from_slice(&bgra[si..si + 4]);
                }
            }
            let (mut lines, text) = recognize(engine, &small, dw2, dh2)?;
            let kf = k as f32;
            for l in lines.iter_mut() { for wd in l.iter_mut() { wd.x *= kf; wd.y *= kf; wd.w *= kf; } }
            return Ok((lines, text));
        }
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

    /// 카드 한 장만 잘라 읽기: 두 배로 키워(작은 설명 글자까지) 문자 인식 → 제목(가장 위 이름) → 못 읽으면 설명 문장으로
    /// 결과: (찾은 증강, 어떻게 찾았나, 읽은 글자)
    fn read_card(engine: &OcrEngine, x: i32, y: i32, w: i32, h: i32, m: &Matcher, except: &[u32]) -> (Option<u32>, &'static str, String) {
        let Some(buf) = grab(x, y, w, h) else { return (None, "capture", String::new()) };
        // 이미 다른 칸에 있는 증강은 빼고 고른다 — 잘라 읽은 칸에 옆 카드 글자가 걸쳐도 그쪽으로 잡지 않게
        let title = |lines: &[Vec<Word>], iw: i32| m.find_at(lines, iw as f32).into_iter().filter(|h| !except.contains(&h.0)).min_by(|a, b| a.2.partial_cmp(&b.2).unwrap_or(std::cmp::Ordering::Equal)).map(|h| h.0);
        // 1) 원래 크기 (제목은 큰 글자라 이대로가 잘 읽힌다)
        let (l1, t1) = recognize(engine, &buf, w, h).unwrap_or_default();
        if let Some(id) = title(&l1, w) {
            return (Some(id), "title", t1);
        }
        // 2) 두 배로 키워서 (작은 설명 글자까지)
        let max = OcrEngine::MaxImageDimension().unwrap_or(0) as i32;
        let (l2, t2) = if w * 2 <= max && h * 2 <= max { recognize(engine, &upscale2(&buf, w, h), w * 2, h * 2).unwrap_or_default() } else { (vec![], String::new()) };
        if let Some(id) = title(&l2, w * 2) {
            return (Some(id), "title-2x", t2);
        }
        // 3) 설명 문장으로
        let all = format!("{t1}\n{t2}");
        match m.match_desc_except(&all, except) {
            Some(id) => (Some(id), "desc", all),
            None => (None, "none", all),
        }
    }

    /// 두 배 키우기 (가장 가까운 점). 인식기가 작은 글자를 더 잘 읽는다
    fn upscale2(src: &[u8], w: i32, h: i32) -> Vec<u8> {
        let (w2, h2) = (w * 2, h * 2);
        let mut out = vec![0u8; (w2 * h2 * 4) as usize];
        for yy in 0..h2 {
            let row = ((yy / 2) * w) as usize;
            for xx in 0..w2 {
                let si = (row + (xx / 2) as usize) * 4;
                let di = ((yy * w2 + xx) * 4) as usize;
                out[di..di + 4].copy_from_slice(&src[si..si + 4]);
            }
        }
        out
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
        let mut pids: (Vec<u32>, Option<std::time::Instant>) = (Vec::new(), None);
        // 한 번 찾은 게임 창 (창 종류 이름으로 못 찾는 경우, 포커스가 다른 데 가도 놓치지 않게)
        let mut known: Option<HWND> = None;
        // 제목 줄만 읽는 동안 몇 번에 한 번은 띠 전체를 다시 본다 (늦게 뜬 카드·높이가 다른 카드를 놓치지 않게)
        let mut tick: u32 = 0;
        // 인식이 동작할 수 없는 PC 에 한 번 알린다 (오른쪽 아래 알림). 구석 표시·작은 창이 왜 안 뜨는지 사용자가 알 수 있게
        let mut warned_engine = false;
        let mut warned_capture = false;
        let mut capture_fails = 0u32;
        // 띠 읽기에서 증강 이름이 한 장이라도 보였나 (카드 화면 낌새 → 카드 자리 찾기)
        let mut hint = false;
        loop {
            let s = v.settings.lock().unwrap().clone();
            let allowed = v.allowed.load(Ordering::SeqCst);
            let mut game = if s.enabled && allowed { game_window(&mut pids) } else { None };
            if game.is_some() {
                known = game.map(|g| g.0);
            } else if s.enabled && allowed && !pids.0.is_empty() {
                game = known.filter(|h| unsafe { IsWindow(Some(*h)) }.as_bool()).map(|h| (h, "process"));
            } else {
                known = None;
            }
            // 최소화만 아니면 읽는다 (맨 앞이 아니어도)
            let game = game.filter(|(h, _)| !unsafe { IsIconic(*h) }.as_bool());
            // 맨 앞 = 맨 앞 창이 게임 창이거나 같은 게임 프로세스의 창 (전체 화면 모드에서는 포커스를 가진 창이 그림 창과 다를 수 있다)
            let front = game.is_some_and(|(h, _)| { let fg = unsafe { GetForegroundWindow() }; fg == h || same_process(fg, h) });
            let how = game.map(|g| g.1).unwrap_or("");
            if game.is_some() && eng.is_none() && !warned_engine {
                warned_engine = true;
                crate::toast::show(&app, "증강 자동 인식을 쓸 수 없어요", "이 PC에 한국어 문자 인식이 없어요. Windows 설정 → 시간 및 언어 → 언어에서 '한국어'를 추가해 주세요.", "warn", 9000);
            }
            if game.is_none() {
                warned_capture = false;
                capture_fails = 0;
            }
            // 판의 시작·끝 (게임 창 또는 게임 프로세스가 있는 동안 = 한 판). 끝나면 작은 창이 한 번도 안 떴는지 보고 진단을 보낸다
            let alive = s.enabled && allowed && (unsafe { FindWindowW(windows::core::w!("RiotWindowClass"), PCWSTR::null()) }.is_ok_and(|w| !w.is_invalid()) || !pids.0.is_empty());
            let ended = {
                let mut g = v.diag.lock().unwrap();
                if alive && g.is_none() { *g = Some(GameDiag { started: now(), ..Default::default() }); }
                if alive { None } else { g.take() }
            };
            if let Some(d) = ended { end_game(&app, &v, d); }
            let (Some((h, _)), Some(eng)) = (game, eng.as_ref()) else {
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
            // 작은 창이 떠 있는 동안 게임 창이 그 위로 올라오면(다른 모니터를 눌렀다가 게임으로 돌아오는 순간 등 — 게임 창도 맨 위 창이라
            // 활성화될 때 우리 창 위로 올라간다) 다시 맨 위로. 무조건 올리지 않고 실제로 깔렸을 때만 (창 순서를 자꾸 바꾸면 끊김)
            if v.shown.load(Ordering::SeqCst) && overlay_buried(&app, h) {
                raise_overlay(&app);
                v.diag(|d| d.raised += 1);
                v.trace(format!("작은 창이 게임 밑에 깔려 다시 맨 위로 (맨앞={front})"));
            }
            // 게임 창이 있는 모니터의 배율 (모니터마다 배율이 다를 수 있다)
            let scale = monitor_scale(h);
            // 제목 줄을 아직 모르면: 보통은 좁은 띠, 네 번에 한 번은 넓게
            // 제목 줄을 찾았으면 그 줄을 찾은 범위 그대로 (좁은 띠 / 넓게 기준이 다르다)
            let wide = if band.is_some() { band_wide } else { misses % 4 == 3 };
            let (x, y, w, hh) = if wide { region_wide(&rc) } else { region(&rc) };
            if w < 200 || hh < 100 { std::thread::sleep(EVERY); continue; }
            v.diag(|d| {
                if front { d.front += 1 } else { d.not_front += 1 }
                d.game_rect = [rc.left, rc.top, rc.right - rc.left, rc.bottom - rc.top];
                d.scale = scale;
                d.region = [x, y, w, hh];
                d.monitors = unsafe { GetSystemMetrics(SM_CMONITORS) };
                d.how = how.to_string();
            });
            // 맨 앞이 아닐 때는 다른 창이 읽을 자리를 가리고 있으면 읽지 않는다 (Prism 창의 증강 이름을 카드로 착각하지 않게).
            // 띄워 둔 작은 창은 그대로 둔다
            if !front && !uncovered(h, x, y, w, hh) {
                v.stage("back", 0, how);
                std::thread::sleep(if v.shown.load(Ordering::SeqCst) { FAST } else { EVERY });
                continue;
            }
            // 칸 위치는 게임 화면 기준 x 로 기억한다 (좁은 띠·넓게 읽기의 시작점이 달라도 같은 칸이 같은 값)
            let gw = (rc.right - rc.left) as f32;
            let off = (x - rc.left) as f32;
            // 카드 자리를 그림에서 바로 찾아 카드마다 따로 읽는다 (v3.66, 근본 대책). 카드는 속이 검은 큰 직사각형이라
            // 화면 비율·UI 크기·모니터와 상관없이 정확한 자리를 안다. 카드 화면이라는 낌새(이름 한 장 이상)가 있고 세 칸이 안 찼으면 매번
            if slots.len() < 3 && (!slots.is_empty() || hint) {
                let (wx, wy, ww, wh) = region_wide(&rc);
                let buf = grab(wx, wy, ww, wh);
                let cards = buf.as_deref().map(|b| crate::matcher::find_cards(b, ww as usize, wh as usize)).unwrap_or_default();
                if let (true, Some(buf)) = (cards.len() >= 2, buf) {
                    let t0 = std::time::Instant::now();
                    let mut changed = false;
                    // 글자로 못 읽은 카드: (카드 순번, 가운데 x, 읽은 글자)
                    let mut unread: Vec<(usize, f32, String)> = Vec::new();
                    for (k, &(a, b, y0, y1)) in cards.iter().enumerate() {
                        let cx = (wx - rc.left) as f32 + (a + b) as f32 / 2.0;
                        if slots.near(cx, (b - a) as f32 / 2.0) {
                            continue;
                        }
                        let (got, how_found, text) = read_card(eng, wx + a as i32, wy + y0 as i32, (b - a) as i32, (y1 - y0) as i32, &v.matcher, &slots.ids());
                        v.trace(format!("카드 자리 x={cx:.0} 폭={} {how_found} {:?} | {}", b - a, got, text.replace('\n', " / ").chars().take(100).collect::<String>()));
                        match got {
                            Some(id) => {
                                slots.update(&[(id, cx, 0.0)], gw);
                                changed = true;
                            }
                            None => unread.push((k, cx, text)),
                        }
                    }
                    // 그래도 못 읽은 카드는 아이콘 그림으로 (v3.66). 이미 읽은 칸과 같은 등급만, 그림이 같은 증강은 글자로 가른다
                    if !unread.is_empty() {
                        let idx: Vec<usize> = unread.iter().map(|u| u.0).collect();
                        let found = v.icons.identify(&buf, ww as usize, wh as usize, &cards, &idx, &slots.ids());
                        for ((_, cx, text), r) in unread.iter().zip(found) {
                            let pick = r.as_ref().and_then(|(ids, _, _)| v.matcher.pick_by_text(text, ids)).filter(|id| !slots.contains(*id));
                            v.trace(format!("그림 x={cx:.0} {:?} → {:?}", r.as_ref().map(|(ids, sc, gap)| (ids.clone(), (sc * 100.0).round() / 100.0, (gap * 100.0).round() / 100.0)), pick));
                            if let Some(id) = pick {
                                slots.update(&[(id, *cx, 0.0)], gw);
                                changed = true;
                                v.diag(|d| d.by_icon += 1);
                            }
                        }
                    }
                    v.report.lock().unwrap().read_ms = t0.elapsed().as_millis() as u32;
                    hint = false;
                    if changed || !slots.is_empty() {
                        seen_at = Some(std::time::Instant::now());
                        let ids = slots.ids_sorted();
                        if ids != last || !v.shown.load(Ordering::SeqCst) {
                            last = ids.clone();
                            v.publish(&app, ids, String::new());
                            show_overlay(&app, &rc, &s.position, scale);
                            v.shown.store(true, Ordering::SeqCst);
                            v.diag(|d| d.shown += 1);
                        }
                    }
                    std::thread::sleep(FAST.max(t0.elapsed()));
                    continue;
                }
            }
            // 세 칸을 다 못 채웠으면 두 번에 한 번은 빈 칸 하나만 잘라 크게 읽는다 (v3.45).
            // 가로 띠 전체를 한 번에 읽으면 인식기가 한 장의 제목을 놓치는 일이 잦았다 — 그 카드만 따로, 키워서 다시 본다
            tick = tick.wrapping_add(1);
            if let Some((by0, _)) = band.filter(|_| slots.len() < 3 && tick % 2 == 0) {
                let miss = slots.missing(gw);
                if let (false, Some(p)) = (miss.is_empty(), slots.pitch(gw)) {
                    let c = miss[(tick / 2) as usize % miss.len()];
                    let half = (p * 0.48) as i32;
                    let cx = (rc.left + c as i32 - half).max(rc.left);
                    let cw = (half * 2).min(rc.right - cx);
                    let (cy, ch) = (y + by0, hh - by0);
                    if cw > 80 && ch > 60 {
                        let t0 = std::time::Instant::now();
                        let (got, how_found, text) = read_card(eng, cx, cy, cw, ch, &v.matcher, &slots.ids());
                        v.report.lock().unwrap().read_ms = t0.elapsed().as_millis() as u32;
                        let dup = got.is_some_and(|id| slots.contains(id));
                        v.trace(format!("빈칸 x={c:.0} 폭={cw} {how_found}{} {:?} | {}", if dup { "(이미 있음)" } else { "" }, got, text.replace('\n', " / ").chars().take(120).collect::<String>()));
                        let id = got.filter(|_| !dup);
                        if let Some(id) = id {
                            seen_at = Some(std::time::Instant::now());
                            let ids = slots.update(&[(id, c, 0.0)], gw);
                            if ids != last {
                                last = ids.clone();
                                v.publish(&app, ids, String::new());
                                show_overlay(&app, &rc, &s.position, scale);
                                v.shown.store(true, Ordering::SeqCst);
                                v.diag(|d| d.shown += 1);
                            }
                        }
                        std::thread::sleep(FAST.max(t0.elapsed() * 2));
                        continue;
                    }
                }
            }
            // 카드가 떠 있으면 제목 줄만, 아니면 넓게
            let (by, bh) = band.unwrap_or((0, hh));
            let t0 = std::time::Instant::now();
            let found = match grab(x, y + by, w, bh) {
                None => { v.diag(|d| d.capture_fails += 1); if capture_fails == 0 { v.trace(format!("복사 실패(검은 화면) 게임={},{} {}x{} 읽는곳={x},{} {w}x{bh}", rc.left, rc.top, rc.right - rc.left, rc.bottom - rc.top, y + by)); } None }
                Some(buf) => match recognize(eng, &buf, w, bh) {
                    Ok(r) => Some(r),
                    Err(e) => { v.diag(|d| d.ocr_errors += 1); if capture_fails == 0 { v.trace(format!("인식 오류 {w}x{bh}: {e}")); } None }
                },
            };
            v.report.lock().unwrap().read_ms = t0.elapsed().as_millis() as u32;
            let shown = v.shown.load(Ordering::SeqCst);
            match found {
                Some((lines, text)) => {
                    capture_fails = 0;
                    let hits = v.matcher.find_at(&lines, w as f32);
                    hint = !hits.is_empty();
                    // 처음엔 2장 이상 보여야 카드 화면으로 보고, 그 뒤로는 한 장만 읽혀도 그 칸을 갱신한다
                    let seen = hits.len() >= 2 || (!slots.is_empty() && !hits.is_empty());
                    v.stage(if seen { "found" } else { "reading" }, hits.len() as u32, how);
                    if seen {
                        misses = 0;
                        seen_at = Some(std::time::Instant::now());
                        if band.is_none() {
                            v.trace(format!("카드 화면 {} {:?} x={:?} | {}", if wide { "넓게" } else { "띠" }, hits.iter().map(|h| h.0).collect::<Vec<_>>(), hits.iter().map(|h| (h.1 + off) as i32).collect::<Vec<_>>(), text.replace('\n', " / ").chars().take(160).collect::<String>()));
                            // 제목 줄 위아래로 여유를 두고 기억
                            let top = hits.iter().map(|h| h.2).fold(f32::MAX, f32::min) as i32;
                            let bottom = hits.iter().map(|h| h.2).fold(0.0, f32::max) as i32;
                            let m = (hh * 6 / 100).max(24);
                            let y0 = (top - m).max(0);
                            band = Some((y0, (bottom - y0 + m * 2).min(hh - y0)));
                            band_wide = wide;
                        }
                        let gh: Vec<(u32, f32, f32)> = hits.iter().map(|h| (h.0, h.1 + off, h.2)).collect();
                        let ids = slots.update(&gh, gw);
                        if ids != last || !shown {
                            last = ids.clone();
                            v.publish(&app, ids, text);
                            show_overlay(&app, &rc, &s.position, scale);
                            v.shown.store(true, Ordering::SeqCst);
                            v.diag(|d| d.shown += 1);
                        }
                    } else {
                        misses += 1;
                        v.report.lock().unwrap().last_text = text.chars().take(400).collect();
                        if !front {
                            // 게임 창이 뒤로 갔을 때(다른 창이 가림)는 안 보인다고 닫지 않는다 — 돌아와서 다시 본다
                            misses = 0;
                        } else if band.is_some() && misses >= 2 {
                            // 제목 줄에서 못 찾으면 넓게 다시 (창 크기가 바뀌었을 수도)
                            band = None;
                        } else if shown && seen_at.map_or(true, |t| t.elapsed() > HOLD) {
                            // 한동안 카드가 안 보임 = 다 고름. 세 칸을 다 못 채운 고르기는 진단으로 남긴다 (끝날 때 서버로)
                            let n = slots.len();
                            v.diag(|d| { d.offers += 1; if n < 3 { d.partial += 1; } });
                            if n < 3 {
                                v.trace(format!("고르기 끝: {n}칸만 찾음 {:?}", slots.ids_sorted()));
                                let t = v.report.lock().unwrap().trace.clone();
                                let tail = t[t.len().saturating_sub(20)..].to_vec();
                                v.diag(|d| if d.partial_trace.len() < 3 { d.partial_trace.push(tail) });
                            }
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
                    misses += 1;
                    // 맨 앞인데 계속 검게 복사되면 '전체 화면' 모드 — 이때는 작은 창·구석 표시도 게임 위에 뜨지 못한다
                    capture_fails += 1;
                    if front && capture_fails >= 4 && !warned_capture {
                        warned_capture = true;
                        crate::toast::show(&app, "게임 화면을 읽지 못하고 있어요", "롤 설정 → 비디오 → 창 모드를 '테두리 없음'으로 바꿔 주세요. 전체 화면에서는 Prism 표시가 게임 위에 뜨지 않아요.", "warn", 9000);
                    }
                }
            }
            // 한 번 읽는 데 오래 걸리는 PC 일수록 쉬는 시간을 늘린다 (읽는 시간이 전체의 20%(카드가 보일 때 35%)를 넘지 않게).
            // 화면 복사·문자 인식이 게임과 GPU·CPU 를 계속 다투지 않도록 (v3.61)
            let cost = t0.elapsed();
            std::thread::sleep(if v.shown.load(Ordering::SeqCst) { FAST.max(cost * 2) } else { EVERY.max(cost * 4) });
        }
    }

    /// 판이 끝났을 때: 작은 창이 한 번도 안 떴고 충분히 오래 본 판이면 진단을 화면으로 넘긴다 (화면이 서버로 보낸다, 토큰은 Rust 에만)
    fn end_game(app: &AppHandle, v: &Vision, d: GameDiag) {
        let looked: u32 = d.stages.iter().filter(|(k, _)| k.as_str() != "no-game" && k.as_str() != "off" && k.as_str() != "wait").map(|(_, n)| *n).sum();
        // 작은 창이 한 번도 안 뜬 판, 또는 세 칸을 다 못 채운 고르기가 있던 판
        let never = d.shown == 0 && looked >= 40;
        if !never && d.partial == 0 {
            return;
        }
        let r = v.report.lock().unwrap().clone();
        let body = serde_json::json!({
            "kind": if never { "overlay-never-shown" } else { "partial" },
            "version": app.package_info().version.to_string(),
            "position": v.settings.lock().unwrap().position.clone(),
            "engine": r.engine,
            "diag": d,
            "lastText": r.last_text.chars().take(300).collect::<String>(),
            "trace": r.trace,
        });
        use tauri::Emitter;
        let _ = app.emit("vision-diag", body);
    }

    /// 작은 창이 게임 창(또는 같은 게임 프로세스의 창) 밑에 깔렸나: 작은 창보다 위에 있는 창들을 훑는다
    fn overlay_buried(app: &AppHandle, game: HWND) -> bool {
        let Some(o) = hwnd_of(app) else { return false };
        let mut w = unsafe { GetWindow(o, GW_HWNDPREV) }.unwrap_or_default();
        for _ in 0..256 {
            if w.is_invalid() { return false; }
            if w == game || same_process(w, game) { return true; }
            w = unsafe { GetWindow(w, GW_HWNDPREV) }.unwrap_or_default();
        }
        false
    }

    /// 작은 창을 자리·크기 그대로 맨 위로
    fn raise_overlay(app: &AppHandle) {
        if let Some(h) = hwnd_of(app) {
            unsafe {
                let _ = SetWindowPos(h, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
            }
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
        let (ow, oh) = ((420.0 * scale) as i32, (620.0 * scale) as i32);
        let m = (24.0 * scale) as i32;
        let (gw, gh) = (rc.right - rc.left, rc.bottom - rc.top);
        // 오른쪽: 게임 화면 오른쪽 끝에 딱 붙인다 (화면 안의 패널이 오른쪽에서 밀려 들어온다)
        let (x, y) = if position == "top" { (rc.left + (gw - ow) / 2, rc.top + m) } else { (rc.right - ow, rc.top + gh * 30 / 100) };
        unsafe {
            let _ = SetWindowPos(h, Some(HWND_TOPMOST), x, y, ow, oh, SWP_NOACTIVATE | SWP_SHOWWINDOW);
            // 배율이 다른 모니터로 옮기면 Windows 가 창 크기·위치를 다시 잡는다(WM_DPICHANGED) → 실제 자리를 보고 다르면 한 번 더
            let mut got = RECT::default();
            if GetWindowRect(h, &mut got).is_ok() && ((got.left - x).abs() > 4 || (got.top - y).abs() > 4 || (got.right - got.left - ow).abs() > 4) {
                let _ = SetWindowPos(h, Some(HWND_TOPMOST), x, y, ow, oh, SWP_NOACTIVATE | SWP_SHOWWINDOW);
            }
            let mut fin = RECT::default();
            let _ = GetWindowRect(h, &mut fin);
            let vis = IsWindowVisible(h).as_bool();
            if let Some(a) = app.try_state::<std::sync::Arc<crate::App>>() {
                a.vision.trace(format!("작은 창 게임={},{} {}x{} 배율={scale:.2} 목표={x},{} {ow}x{oh} 실제={},{} {}x{} 보임={vis} 모니터={}", rc.left, rc.top, gw, gh, y, fin.left, fin.top, fin.right - fin.left, fin.bottom - fin.top, GetSystemMetrics(SM_CMONITORS)));
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
