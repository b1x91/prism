//! 앱 안 업데이트 (CLAUDE.md v3.33).
//!
//! 흐름: 새 버전이 보이면 **뒤에서 미리 받아 두고**(크기·실행 파일 머리·SHA-256 확인), 사용자가 '적용'을 누르거나
//! 앱이 쉬고 있을 때(창이 트레이에 있고 롤이 꺼짐) 또는 트레이에서 '끝내기'를 할 때
//! **설치 프로그램을 창 없이**(`/S /UPDATE`) 돌린다. 다시 켜야 하면 `/R`(필요하면 `/ARGS --background` 로 트레이만).
//! 그래서 설치 창이 뜨지 않고, 몇 초 뒤 새 버전이 그대로 다시 켜진다.
//!
//! Microsoft Store 판(빌드 때 `PRISM_CHANNEL=store`)은 스토어가 업데이트를 맡으므로 여기서는 아무것도 하지 않는다.
//! 받는 곳은 Prism 서버의 /app/download/ (서버 주소가 없는 개발 빌드만 이 저장소의 Release) 로만 한정한다.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use crate::server::server_url;

const REPO: &str = "b1x91/prism";
const ASSET: &str = "Prism-Setup.exe";
pub const CURRENT: &str = env!("CARGO_PKG_VERSION");
/// 배포 경로: 'direct'(Prism 서버에서 받는 설치판) · 'store'(Microsoft Store 가 업데이트)
pub const CHANNEL: &str = match option_env!("PRISM_CHANNEL") {
    Some(c) => c,
    None => "direct",
};
pub fn managed() -> bool {
    CHANNEL == "store"
}

#[derive(Serialize, Clone)]
pub struct Info {
    current: String,
    latest: String,
    available: bool,
    notes: String,
    /// 새 버전을 받아 두어 바로 적용할 수 있다
    ready: bool,
    /// 스토어가 업데이트를 맡는 판
    managed: bool,
    #[serde(skip)]
    url: String,
    #[serde(skip)]
    size: u64,
    #[serde(skip)]
    sha256: String,
}

/// 받아 두고 확인까지 끝난 설치 파일
#[derive(Clone)]
struct Ready {
    version: String,
    path: PathBuf,
}
static READY: Mutex<Option<Ready>> = Mutex::new(None);
/// 같은 파일을 두 번 받지 않게
static FETCHING: Mutex<bool> = Mutex::new(false);

fn client(secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(format!("Prism/{CURRENT}"))
        .timeout(Duration::from_secs(secs))
        .build()
        .map_err(|e| e.to_string())
}

/// "0.5.10" → [0, 5, 10]. 숫자가 아니면 0
fn ver(s: &str) -> Vec<u64> {
    s.trim_start_matches("app-v").trim_start_matches('v').split('.').map(|p| p.parse().unwrap_or(0)).collect()
}

/// 받아 둔 설치 파일을 두는 곳: %LOCALAPPDATA%\Prism\updates (없으면 임시 폴더)
fn dir() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    base.join("Prism").join("updates")
}
fn file_for(version: &str) -> PathBuf {
    dir().join(format!("Prism-Setup-{version}.exe"))
}

fn is_ready(latest: &str) -> bool {
    READY.lock().unwrap().as_ref().is_some_and(|r| r.version == latest)
}

pub async fn check() -> Result<Info, String> {
    if managed() {
        return Ok(Info {
            current: CURRENT.into(), latest: CURRENT.into(), available: false, notes: String::new(),
            ready: false, managed: true, url: String::new(), size: 0, sha256: String::new(),
        });
    }
    let mut info = match server_url() {
        Some(base) => check_server(base).await?,
        None => check_github().await?,
    };
    info.ready = info.available && is_ready(&info.latest);
    Ok(info)
}

/// Prism 서버: { version, notes, size, sha256, url }
async fn check_server(base: &str) -> Result<Info, String> {
    let r = client(20)?
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
        ready: false,
        managed: false,
        url,
        size: d["size"].as_u64().unwrap_or(0),
        sha256: d["sha256"].as_str().unwrap_or("").to_ascii_lowercase(),
    })
}

/// 서버 주소가 없는 빌드 (개발용): GitHub Release 를 직접
async fn check_github() -> Result<Info, String> {
    let r = client(20)?
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
    let sha256 = asset.and_then(|a| a["digest"].as_str()).unwrap_or("").trim_start_matches("sha256:").to_ascii_lowercase();
    let latest = tag.trim_start_matches("app-v").to_string();
    Ok(Info {
        current: CURRENT.into(),
        available: !url.is_empty() && ver(&latest) > ver(CURRENT),
        latest,
        notes: d["body"].as_str().unwrap_or("").chars().take(600).collect(),
        ready: false,
        managed: false,
        url,
        size,
        sha256,
    })
}

/// 받아도 되는 주소: Prism 서버의 /app/download/ 또는 이 저장소의 Release
fn allowed(url: &str) -> bool {
    match server_url() {
        Some(base) => url.starts_with(&format!("{base}/app/download/")),
        None => url.starts_with(&format!("https://github.com/{REPO}/releases/download/")),
    }
}

/// 받은 파일 확인: 크기 · 실행 파일 머리(MZ) · SHA-256 (서버가 알려 준 값이 있을 때)
fn verify(bytes: &[u8], info: &Info) -> bool {
    if !bytes.starts_with(b"MZ") || (info.size > 0 && bytes.len() as u64 != info.size) {
        return false;
    }
    if info.sha256.len() == 64 {
        let got = Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect::<String>();
        return got == info.sha256;
    }
    true
}

/// 새 버전을 뒤에서 미리 받아 둔다. 이미 받아 두었으면 바로 끝난다
pub async fn prepare() -> Result<Info, String> {
    let mut info = check().await?;
    if !info.available || info.ready {
        return Ok(info);
    }
    if !allowed(&info.url) {
        return Err("업데이트 주소가 올바르지 않습니다.".into());
    }
    {
        let mut f = FETCHING.lock().unwrap();
        if *f {
            return Ok(info);
        }
        *f = true;
    }
    let done = fetch(&info).await;
    *FETCHING.lock().unwrap() = false;
    let path = done?;
    *READY.lock().unwrap() = Some(Ready { version: info.latest.clone(), path });
    info.ready = true;
    Ok(info)
}

async fn fetch(info: &Info) -> Result<PathBuf, String> {
    let path = file_for(&info.latest);
    std::fs::create_dir_all(dir()).map_err(|e| format!("폴더를 만들지 못했습니다: {e}"))?;
    // 지난번에 받아 둔 파일이 온전하면 그대로 쓴다
    if let Ok(old) = std::fs::read(&path) {
        if verify(&old, info) {
            return Ok(path);
        }
    }
    let bytes = client(600)?
        .get(&info.url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|_| "새 버전을 받지 못했습니다. 잠시 뒤 다시 시도할게요.".to_string())?
        .bytes()
        .await
        .map_err(|_| "새 버전을 받는 중 끊겼습니다. 잠시 뒤 다시 시도할게요.".to_string())?;
    if !verify(&bytes, info) {
        return Err("받은 파일이 올바르지 않습니다. 다시 받을게요.".into());
    }
    // 다 받은 뒤에만 제 이름으로 (중간에 끊긴 파일을 쓰지 않게)
    let tmp = path.with_extension("part");
    std::fs::write(&tmp, &bytes).map_err(|e| format!("파일을 저장하지 못했습니다: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("파일을 저장하지 못했습니다: {e}"))?;
    // 예전 버전 파일은 지운다 (시도 표시는 남긴다)
    if let Ok(rd) = std::fs::read_dir(dir()) {
        for e in rd.flatten() {
            let is_mark = e.file_name().to_str().is_some_and(|n| n.starts_with("tried-"));
            if e.path() != path && !is_mark {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
    Ok(path)
}

/// 받아 둔 새 버전을 창 없이 설치한다. 성공하면 호출한 쪽이 곧바로 앱을 끝낸다.
/// relaunch: 설치가 끝나면 다시 켠다 / background: 다시 켤 때 창 없이 트레이로만
pub fn apply(relaunch: bool, background: bool) -> Result<(), String> {
    if managed() {
        return Err("Microsoft Store 가 업데이트를 맡고 있어요.".into());
    }
    let r = READY.lock().unwrap().clone().ok_or("받아 둔 새 버전이 없어요.")?;
    if !r.path.exists() {
        *READY.lock().unwrap() = None;
        return Err("받아 둔 파일이 없어졌어요. 다시 받을게요.".into());
    }
    let mut args = vec!["/S", "/UPDATE"];
    if relaunch {
        args.push("/R");
        if background {
            args.extend(["/ARGS", "--background"]);
        }
    }
    std::process::Command::new(&r.path).args(&args).spawn().map_err(|e| format!("설치를 시작하지 못했습니다: {e}"))?;
    Ok(())
}

/// 받아 둔 새 버전이 있는지 (트레이 '끝내기' 때 조용히 적용할지)
pub fn has_ready() -> bool {
    READY.lock().unwrap().is_some()
}

/// 켤 때: 지난번에 받아 둔 새 버전(지금보다 높은 것)이 있으면 그것을 '준비됨'으로 올린다. 낮은 것은 지운다
pub fn restore() {
    if managed() {
        return;
    }
    let Ok(rd) = std::fs::read_dir(dir()) else { return };
    let mut best: Option<Ready> = None;
    for e in rd.flatten() {
        let p = e.path();
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        if let Some(v) = name.strip_prefix("tried-") {
            if ver(v) <= ver(CURRENT) {
                let _ = std::fs::remove_file(&p);
            }
            continue;
        }
        let Some(v) = name.strip_prefix("Prism-Setup-").and_then(|n| n.strip_suffix(".exe")) else {
            let _ = std::fs::remove_file(&p); // 끊긴 .part 등
            continue;
        };
        if ver(v) <= ver(CURRENT) {
            let _ = std::fs::remove_file(&p);
        } else if best.as_ref().is_none_or(|b| ver(v) > ver(&b.version)) {
            best = Some(Ready { version: v.to_string(), path: p });
        }
    }
    *READY.lock().unwrap() = best;
}

/// 켤 때 바로 적용할지: 받아 둔 새 버전이 있고, 그 버전을 켤 때 적용해 본 적이 없을 때만 (설치가 실패해도 무한 반복하지 않게)
pub fn apply_on_start(background: bool) -> bool {
    let Some(r) = READY.lock().unwrap().clone() else { return false };
    let mark = dir().join(format!("tried-{}", r.version));
    if mark.exists() {
        return false;
    }
    let _ = std::fs::write(&mark, b"");
    apply(true, background).is_ok()
}
