//! 앱 업데이트: Prism 서버(/app/latest)에서 최신판을 확인하고, 받아서 설치 프로그램을 조용히 실행한 뒤 앱을 다시 켠다.
//! 서버는 GitHub Release 를 대신 내준다 (저장소를 비공개로 돌려도 동작). 서버 주소가 없는 빌드만 GitHub 를 직접 본다.
//! 설치 프로그램(NSIS)의 /P = 진행 창만 보이는 자동 설치(실행 중인 Prism 은 설치 프로그램이 닫는다), /R = 끝나면 다시 실행.
//! 받는 곳은 Prism 서버의 /app/download/ (또는 이 저장소의 Release) 로만 한정한다.

use serde::Serialize;
use std::time::Duration;

use crate::server::server_url;

const REPO: &str = "b1x91/prism";
const ASSET: &str = "Prism-Setup.exe";
pub const CURRENT: &str = env!("CARGO_PKG_VERSION");

#[derive(Serialize, Clone)]
pub struct Info {
    current: String,
    latest: String,
    available: bool,
    notes: String,
    #[serde(skip)]
    url: String,
    #[serde(skip)]
    size: u64,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(format!("Prism/{CURRENT}"))
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
}

/// "0.5.10" → [0, 5, 10]. 숫자가 아니면 0
fn ver(s: &str) -> Vec<u64> {
    s.trim_start_matches("app-v").trim_start_matches('v').split('.').map(|p| p.parse().unwrap_or(0)).collect()
}

pub async fn check() -> Result<Info, String> {
    match server_url() {
        Some(base) => check_server(base).await,
        None => check_github().await,
    }
}

/// Prism 서버: { version, notes, size, url }
async fn check_server(base: &str) -> Result<Info, String> {
    let r = client()?
        .get(format!("{base}/app/latest"))
        .send()
        .await
        .map_err(|_| "업데이트 정보를 가져오지 못했습니다. 인터넷 연결을 확인해주세요.".to_string())?;
    if !r.status().is_success() {
        return Err(format!("업데이트 확인 실패 ({})", r.status().as_u16()));
    }
    let d: serde_json::Value = r.json().await.map_err(|e| e.to_string())?;
    let latest = d["version"].as_str().unwrap_or("").to_string();
    let url = d["url"].as_str().unwrap_or("").to_string();
    Ok(Info {
        current: CURRENT.into(),
        available: !url.is_empty() && ver(&latest) > ver(CURRENT),
        latest,
        notes: d["notes"].as_str().unwrap_or("").chars().take(600).collect(),
        url,
        size: d["size"].as_u64().unwrap_or(0),
    })
}

/// 서버 주소가 없는 빌드 (개발용): GitHub Release 를 직접
async fn check_github() -> Result<Info, String> {
    let r = client()?
        .get(format!("https://api.github.com/repos/{REPO}/releases/latest"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|_| "업데이트 정보를 가져오지 못했습니다. 인터넷 연결을 확인해주세요.".to_string())?;
    if !r.status().is_success() {
        return Err(format!("업데이트 확인 실패 ({})", r.status().as_u16()));
    }
    let d: serde_json::Value = r.json().await.map_err(|e| e.to_string())?;
    let tag = d["tag_name"].as_str().unwrap_or("");
    let asset = d["assets"].as_array().and_then(|a| a.iter().find(|x| x["name"] == ASSET));
    let url = asset.and_then(|a| a["browser_download_url"].as_str()).unwrap_or("").to_string();
    let size = asset.and_then(|a| a["size"].as_u64()).unwrap_or(0);
    let latest = tag.trim_start_matches("app-v").to_string();
    Ok(Info {
        current: CURRENT.into(),
        available: !url.is_empty() && ver(&latest) > ver(CURRENT),
        latest,
        notes: d["body"].as_str().unwrap_or("").chars().take(600).collect(),
        url,
        size,
    })
}

/// 받아도 되는 주소: Prism 서버의 /app/download/ 또는 이 저장소의 Release
fn allowed(url: &str) -> bool {
    match server_url() {
        Some(base) => url.starts_with(&format!("{base}/app/download/")),
        None => url.starts_with(&format!("https://github.com/{REPO}/releases/download/")),
    }
}

/// 새 버전을 받아 설치를 시작한다. 성공하면 호출한 쪽이 앱을 끝낸다
pub async fn install() -> Result<(), String> {
    let info = check().await?;
    if !info.available {
        return Err("이미 최신 버전입니다.".into());
    }
    if !allowed(&info.url) {
        return Err("업데이트 주소가 올바르지 않습니다.".into());
    }
    let bytes = reqwest::Client::builder()
        .user_agent(format!("Prism/{CURRENT}"))
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?
        .get(&info.url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|_| "새 버전을 받지 못했습니다. 잠시 뒤 다시 시도해주세요.".to_string())?
        .bytes()
        .await
        .map_err(|_| "새 버전을 받는 중 끊겼습니다. 다시 시도해주세요.".to_string())?;
    // 받은 파일 확인: 크기와 실행 파일 머리(MZ)
    if (info.size > 0 && bytes.len() as u64 != info.size) || !bytes.starts_with(b"MZ") {
        return Err("받은 파일이 올바르지 않습니다. 다시 시도해주세요.".into());
    }
    let path = std::env::temp_dir().join(format!("Prism-Setup-{}.exe", info.latest));
    std::fs::write(&path, &bytes).map_err(|e| format!("파일을 저장하지 못했습니다: {e}"))?;
    std::process::Command::new(&path)
        .args(["/P", "/R"])
        .spawn()
        .map_err(|e| format!("설치를 시작하지 못했습니다: {e}"))?;
    Ok(())
}
