//! Prism 데스크톱 앱. Rust 는 얇게: 롤 클라이언트 읽기, 서버 중계, 로그인, 트레이·자동 실행.
//! 화면과 흐름(확인 간격, 업로드, 회원 대신 수집)은 공용 TS 가 맡는다.

mod discord;
mod lcu;
mod matcher;
mod server;
mod update;
mod vision;
mod winstate;

use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::Emitter;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, State, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_opener::OpenerExt;

struct App {
    lcu: lcu::Lcu,
    server: server::Server,
    vision: Arc<vision::Vision>,
}

#[tauri::command]
fn lcu_status(app: State<'_, Arc<App>>) -> lcu::Status {
    app.lcu.status()
}

#[tauri::command]
fn discord_running() -> bool {
    lcu::discord_running()
}

#[tauri::command]
async fn lcu_get(app: State<'_, Arc<App>>, path: String) -> Result<serde_json::Value, String> {
    app.lcu.get(&path).await
}

#[tauri::command]
async fn api(app: State<'_, Arc<App>>, method: String, path: String, body: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    app.server.call(&method, &path, body).await
}

#[tauri::command]
fn session(app: State<'_, Arc<App>>) -> serde_json::Value {
    serde_json::json!({ "configured": server::server_url().is_some(), "loggedIn": app.server.logged_in() })
}

#[tauri::command]
async fn login(handle: tauri::AppHandle, app: State<'_, Arc<App>>) -> Result<(), String> {
    let h = handle.clone();
    app.server.login(move |url| { let _ = h.opener().open_url(url, None::<&str>); }).await
}

#[tauri::command]
async fn logout(app: State<'_, Arc<App>>) -> Result<(), String> {
    app.server.logout().await;
    Ok(())
}

#[tauri::command]
fn open_url(handle: tauri::AppHandle, url: String) -> Result<(), String> {
    if !(url.starts_with("https://")) {
        return Err("https 주소만 열 수 있습니다.".into());
    }
    // 디스코드 주소는 디스코드 앱으로 (앱이 없거나 실패하면 브라우저)
    if let Some(app) = discord::app_url(&url) {
        if handle.opener().open_url(app, None::<&str>).is_ok() {
            return Ok(());
        }
    }
    handle.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn autostart(handle: tauri::AppHandle, enable: Option<bool>) -> Result<bool, String> {
    let a = handle.autolaunch();
    match enable {
        Some(true) => a.enable().map_err(|e| e.to_string())?,
        Some(false) => a.disable().map_err(|e| e.to_string())?,
        None => {}
    }
    a.is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn app_version() -> &'static str {
    update::CURRENT
}

#[tauri::command]
async fn update_check() -> Result<update::Info, String> {
    update::check().await
}

/// 새 버전을 뒤에서 미리 받아 둔다 (설치는 하지 않는다)
#[tauri::command]
async fn update_prepare() -> Result<update::Info, String> {
    let r = update::prepare().await;
    refresh_tray();
    r
}

/// 트레이 메뉴의 업데이트 줄: 받아 둔 새 버전이 있으면 '업데이트 적용 (v…)', 없으면 '업데이트 확인'
static TRAY_UPDATE: std::sync::OnceLock<MenuItem<tauri::Wry>> = std::sync::OnceLock::new();
fn refresh_tray() {
    if let Some(m) = TRAY_UPDATE.get() {
        let _ = m.set_text(match update::ready_version() {
            Some(v) => format!("업데이트 적용 (v{v})"),
            None => "업데이트 확인".to_string(),
        });
    }
}

/// 받아 둔 새 버전을 창 없이 설치하고 앱을 끝낸다. 설치가 끝나면 다시 켜진다 (background 면 트레이로만)
#[tauri::command]
async fn update_apply(handle: tauri::AppHandle, background: Option<bool>) -> Result<(), String> {
    update::apply(true, background.unwrap_or(false))?;
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    handle.exit(0);
    Ok(())
}

/// (예전 이름) 받고 바로 적용
#[tauri::command]
async fn update_install(handle: tauri::AppHandle) -> Result<(), String> {
    update::prepare().await?;
    update_apply(handle, Some(false)).await
}

#[tauri::command]
fn vision_get(app: State<'_, Arc<App>>) -> serde_json::Value {
    serde_json::json!({ "settings": *app.vision.settings.lock().unwrap(), "report": *app.vision.report.lock().unwrap() })
}

#[tauri::command]
fn vision_set(handle: tauri::AppHandle, app: State<'_, Arc<App>>, enabled: bool, position: String) {
    let position = if position == "top" { "top" } else { "right" }.to_string();
    app.vision.set(vision::Settings { enabled, position });
    if !enabled {
        app.vision.hide(&handle);
    }
}

/// 첫 화면(로그인·동의)을 마쳤는지 화면이 알려준다
#[tauri::command]
fn vision_allow(handle: tauri::AppHandle, app: State<'_, Arc<App>>, allowed: bool) {
    app.vision.allowed.store(allowed, std::sync::atomic::Ordering::SeqCst);
    if !allowed {
        app.vision.hide(&handle);
    }
}

/// 클립보드 그림으로 인식 시험 (증강 화면을 Win+Shift+S 로 찍은 뒤)
#[tauri::command]
async fn vision_test(app: State<'_, Arc<App>>) -> Result<serde_json::Value, String> {
    let v = app.vision.clone();
    let (ids, text) = tauri::async_runtime::spawn_blocking(move || vision::test_clipboard(&v)).await.map_err(|e| e.to_string())??;
    Ok(serde_json::json!({ "ids": ids, "text": text }))
}

fn show(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show(app)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--background"])))
        .setup(|app| {
            let dir = app.path().app_config_dir()?;
            let vision = vision::Vision::new(dir.clone());
            app.manage(Arc::new(App { lcu: lcu::Lcu::new(), server: server::Server::new(dir), vision: vision.clone() }));
            // 게임 중 증강 인식 + 게임 위 작은 창 (v3.5)
            // 지난번에 받아 둔 새 버전이 있으면 켜자마자 창 없이 적용하고 새 버전으로 다시 켠다
            update::restore();
            if update::apply_on_start(std::env::args().any(|a| a == "--background")) {
                std::process::exit(0);
            }
            vision::create_overlay(app)?;
            vision.start(app.handle().clone());
            // 창 제목에 버전: "Prism - 0.7.0". 크기·위치는 지난번 그대로 (없으면 세로로 넉넉한 기본 크기)
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_title(&format!("Prism - {}", app.package_info().version));
                if let Ok(d) = app.path().app_config_dir() {
                    winstate::restore(&w, &d);
                }
            }

            // 트레이: 창 열기 / 업데이트 확인 / 끝내기. 창을 닫으면 트레이로 숨는다 (기록·대신 수집을 계속하기 위해)
            let open = MenuItem::with_id(app, "open", "Prism 열기", true, None::<&str>)?;
            let check = MenuItem::with_id(app, "check", "업데이트 확인", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "끝내기", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &check, &quit])?;
            let _ = TRAY_UPDATE.set(check.clone());
            refresh_tray();
            TrayIconBuilder::with_id("prism")
                .icon(app.default_window_icon().cloned().ok_or("아이콘 없음")?)
                .tooltip("Prism")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id().as_ref() {
                    "open" => show(app),
                    // 받아 둔 새 버전이 있으면 바로 적용 (게임 중이면 적용하지 않고 설정 화면을 연다)
                    // 없으면 창을 열고 설정 화면에서 바로 확인한다 (결과가 보이게)
                    "check" => {
                        if update::has_ready() && lcu::game_pids().is_empty() && update::apply(true, false).is_ok() {
                            app.exit(0);
                        } else {
                            show(app);
                            let _ = app.emit("check-update", ());
                        }
                    }
                    "quit" => {
                        // 받아 둔 새 버전이 있으면 끝낼 때 조용히 적용 (다시 켜지 않는다)
                        if update::has_ready() {
                            let _ = update::apply(false, false);
                        }
                        app.exit(0)
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                        show(tray.app_handle());
                    }
                })
                .build(app)?;

            // 윈도우 시작 시 자동 실행으로 켜졌으면 창 없이 트레이로만 (창은 크기를 맞춘 뒤에 보인다 — 깜빡임 없게)
            if !std::env::args().any(|a| a == "--background") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            let keep = || {
                if let (Some(w), Ok(d)) = (window.app_handle().get_webview_window(window.label()), window.app_handle().path().app_config_dir()) {
                    if w.label() == "main" {
                        winstate::save(&w, &d);
                    }
                }
            };
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    keep();
                    api.prevent_close();
                    let _ = window.hide();
                }
                // 크기·위치를 바꾸면 기억 (다음에 켤 때·업데이트로 다시 켜질 때 그대로)
                WindowEvent::Resized(_) | WindowEvent::Moved(_) => keep(),
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![lcu_status, discord_running, lcu_get, api, session, login, logout, open_url, autostart, app_version, update_check, update_install, update_prepare, update_apply, vision_get, vision_set, vision_allow, vision_test])
        .run(tauri::generate_context!())
        .expect("Prism 앱 실행 실패");
}
