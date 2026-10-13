//! Prism 데스크톱 앱. Rust 는 얇게: 롤 클라이언트 읽기, 서버 중계, 로그인, 트레이·자동 실행.
//! 화면과 흐름(확인 간격, 업로드, 회원 대신 수집)은 공용 TS 가 맡는다.

mod lcu;
mod matcher;
mod server;
mod update;
mod vision;

use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
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

/// 받아서 설치 프로그램을 띄운 뒤 앱을 끝낸다 (설치가 끝나면 설치 프로그램이 다시 켠다)
#[tauri::command]
async fn update_install(handle: tauri::AppHandle) -> Result<(), String> {
    update::install().await?;
    tokio::time::sleep(std::time::Duration::from_millis(400)).await;
    handle.exit(0);
    Ok(())
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
            vision::create_overlay(app)?;
            vision.start(app.handle().clone());
            // 창 제목에 버전: "Prism (v0.6.9)"
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_title(&format!("Prism (v{})", app.package_info().version));
            }

            // 트레이: 창 열기 / 끝내기. 창을 닫으면 트레이로 숨는다 (기록·대신 수집을 계속하기 위해)
            let open = MenuItem::with_id(app, "open", "Prism 열기", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "끝내기", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            TrayIconBuilder::with_id("prism")
                .icon(app.default_window_icon().cloned().ok_or("아이콘 없음")?)
                .tooltip("Prism")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id().as_ref() {
                    "open" => show(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                        show(tray.app_handle());
                    }
                })
                .build(app)?;

            // 윈도우 시작 시 자동 실행으로 켜졌으면 창 없이 트레이로만
            if std::env::args().any(|a| a == "--background") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![lcu_status, lcu_get, api, session, login, logout, open_url, autostart, app_version, update_check, update_install, vision_get, vision_set, vision_allow, vision_test])
        .run(tauri::generate_context!())
        .expect("Prism 앱 실행 실패");
}
