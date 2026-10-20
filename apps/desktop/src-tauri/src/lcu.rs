//! 롤 클라이언트(LCU) 접근.
//!
//! 지키는 것 (CLAUDE.md v3.1-4 · v3.92):
//! - 화면이 부르는 것은 GET 뿐이고, 허용한 경로 앞부분(ALLOWED)만 읽는다.
//! - 쓰기는 딱 하나 (사용자 결정 2026-10-19): 내 아이템 세트 목록에 'Prism' 세트를 넣거나 바꾸는 것
//!   (`put_item_set`, 챔프 선택에서 사용자가 누를 때만). 경로·내용은 Rust 가 만들고 화면은 챔프·아이템 번호만 넘긴다.
//!   다른 세트는 그대로 둔다. 초대·수락·픽·설정 같은 클라이언트 조작은 하지 않는다.
//! - 게임이 실행 중이면 롤에 아무 요청도 하지 않는다 (OS 프로세스 목록으로만 판단).
//! - 게임 프로세스·메모리·인게임 API 는 건드리지 않는다.

use base64::Engine;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System, UpdateKind};

const CLIENT_PROCESS: &str = "LeagueClientUx.exe";
const GAME_PROCESS: &str = "League of Legends.exe";

/// 읽어도 되는 경로 (앞부분 일치)
const ALLOWED: &[&str] = &[
    "/lol-summoner/v1/current-summoner",
    "/lol-match-history/v1/products/lol/",
    "/lol-match-history/v1/games/",
    // 명장면: 내 쿼드라·펜타킬 판의 처치 순서 (읽기만, v3.99)
    "/lol-match-history/v1/game-timelines/",
    "/lol-champ-select/v1/session",
    "/lol-gameflow/v1/gameflow-phase",
    // 게임 시작 직전 양 팀 챔피언 (증강 우선순위의 조합 판단용). 게임이 뜨면 아래 차단 규칙으로 읽지 않는다
    "/lol-gameflow/v1/session",
];

#[derive(Clone)]
struct Creds {
    port: u16,
    token: String,
}

pub struct Lcu {
    creds: Mutex<Option<Creds>>,
    http: reqwest::Client,
}

#[derive(Serialize)]
pub struct Status {
    pub client: bool,
    #[serde(rename = "inGame")]
    pub in_game: bool,
}

fn processes() -> System {
    System::new_with_specifics(RefreshKind::nothing().with_processes(ProcessRefreshKind::nothing().with_cmd(UpdateKind::Always).with_exe(UpdateKind::Always)))
}

fn is_named(p: &sysinfo::Process, name: &str) -> bool {
    p.name().to_string_lossy().eq_ignore_ascii_case(name)
}

/// 게임(인게임) 프로세스가 떠 있는가. 챔프 선택 중에는 0.6초마다 여러 번 묻기 때문에
/// 0.25초 안의 결과는 다시 쓴다 (프로세스 목록 전체를 매번 훑지 않게)
pub fn game_running() -> bool {
    static LAST: Mutex<Option<(std::time::Instant, bool)>> = Mutex::new(None);
    if let Some((t, v)) = *LAST.lock().unwrap() {
        if t.elapsed() < Duration::from_millis(250) {
            return v;
        }
    }
    let v = scan_game();
    *LAST.lock().unwrap() = Some((std::time::Instant::now(), v));
    v
}

fn scan_game() -> bool {
    // 게임 창이 있으면 프로세스 목록을 훑지 않는다 (게임 중 3초마다 묻는다, v3.68)
    #[cfg(windows)]
    {
        use windows::Win32::UI::WindowsAndMessaging::FindWindowW;
        if unsafe { FindWindowW(windows::core::w!("RiotWindowClass"), windows::core::PCWSTR::null()) }.is_ok_and(|h| !h.is_invalid()) {
            return true;
        }
    }
    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
    sys.processes().values().any(|p| is_named(p, GAME_PROCESS))
}

/// 디스코드가 켜져 있는지 (OS 프로세스 목록만 본다. 사이드바 내 카드 점)
pub fn discord_running() -> bool {
    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
    sys.processes().values().any(|p| ["Discord.exe", "DiscordPTB.exe", "DiscordCanary.exe"].iter().any(|n| is_named(p, n)))
}

/// 롤 화면 모드 (클라이언트 설치 폴더의 Config/game.cfg 의 WindowMode, 파일만 읽는다): 0 전체 화면 · 1 창 · 2 테두리 없음.
/// 전체 화면이면 게임 위 작은 창이 뜰 수 없어 미리 알린다 (v3.65). 값의 뜻은 [검증필요]
/// 롤 설치 폴더는 한 번 찾으면 기억한다 — 게임 중에 10초마다 모든 프로세스의 실행 경로를 훑지 않게 (v3.68)
static CLIENT_DIR: Mutex<Option<std::path::PathBuf>> = Mutex::new(None);
fn client_dir() -> Option<std::path::PathBuf> {
    if let Some(d) = CLIENT_DIR.lock().unwrap().clone() {
        return Some(d);
    }
    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_exe(UpdateKind::Always));
    let dir = sys.processes().values().find(|p| is_named(p, CLIENT_PROCESS))?.exe()?.parent()?.to_path_buf();
    *CLIENT_DIR.lock().unwrap() = Some(dir.clone());
    Some(dir)
}

pub fn window_mode() -> Option<u8> {
    let dir = client_dir()?;
    let text = std::fs::read_to_string(dir.join("Config").join("game.cfg")).ok()?;
    text.lines().find_map(|l| l.trim().strip_prefix("WindowMode=")).and_then(|v| v.trim().parse().ok())
}

/// 게임(인게임) 프로세스 번호들 (작은 창이 게임 창을 찾을 때 쓴다)
pub fn game_pids() -> Vec<u32> {
    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
    sys.processes().values().filter(|p| is_named(p, GAME_PROCESS)).map(|p| p.pid().as_u32()).collect()
}

/// 클라이언트의 포트·비밀번호 찾기: 실행 파일 옆 lockfile → 실행 인자 순서
fn discover() -> Option<Creds> {
    let mut sys = processes();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let p = sys.processes().values().find(|p| is_named(p, CLIENT_PROCESS))?;
    if let Some(dir) = p.exe().and_then(|e| e.parent()) {
        *CLIENT_DIR.lock().unwrap() = Some(dir.to_path_buf());
        if let Some(c) = read_lockfile(dir.join("lockfile")) {
            return Some(c);
        }
    }
    let args: Vec<String> = p.cmd().iter().map(|a| a.to_string_lossy().into_owned()).collect();
    let arg = |k: &str| args.iter().find_map(|a| a.strip_prefix(k).map(|v| v.trim_matches('"').to_string()));
    Some(Creds { port: arg("--app-port=")?.parse().ok()?, token: arg("--remoting-auth-token=")? })
}

/// lockfile 형식: 이름:pid:포트:비밀번호:프로토콜
fn read_lockfile(path: PathBuf) -> Option<Creds> {
    let s = std::fs::read_to_string(path).ok()?;
    let parts: Vec<&str> = s.trim().split(':').collect();
    if parts.len() < 5 {
        return None;
    }
    Some(Creds { port: parts[2].parse().ok()?, token: parts[3].to_string() })
}

impl Lcu {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            // 클라이언트는 자체 서명 인증서를 쓴다. 이 클라이언트는 127.0.0.1 에만 쓴다
            .danger_accept_invalid_certs(true)
            .timeout(Duration::from_secs(8))
            .build()
            .expect("http client");
        Self { creds: Mutex::new(None), http }
    }

    pub fn status(&self) -> Status {
        let in_game = game_running();
        let client = if in_game { self.creds.lock().unwrap().is_some() } else { self.ensure().is_some() };
        Status { client, in_game }
    }

    fn ensure(&self) -> Option<Creds> {
        let mut g = self.creds.lock().unwrap();
        if g.is_none() {
            *g = discover();
        }
        g.clone()
    }

    /// 허용된 경로를 GET 으로 읽는다. 게임 중이면 거부
    pub async fn get(&self, path: &str) -> Result<serde_json::Value, String> {
        if !ALLOWED.iter().any(|a| path.starts_with(a)) || path.contains("..") {
            return Err(format!("허용되지 않은 경로: {path}"));
        }
        self.send(reqwest::Method::GET, path, None).await
    }

    /// 'Prism' 아이템 세트를 넣는다 (같은 챔프의 예전 Prism 세트는 바꾼다). blocks: (이름, 아이템 번호들)
    pub async fn put_item_set(&self, champion: u32, title: &str, blocks: &[(String, Vec<u32>)]) -> Result<(), String> {
        if champion == 0 || champion > 10_000 || blocks.is_empty() || blocks.len() > 6 {
            return Err("잘못된 아이템 세트입니다.".into());
        }
        let clip = |s: &str, n: usize| s.chars().filter(|c| !c.is_control()).take(n).collect::<String>();
        let mut bl = Vec::new();
        for (name, items) in blocks {
            if items.is_empty() || items.len() > 10 || items.iter().any(|&i| i == 0 || i > 999_999) {
                return Err("잘못된 아이템 번호입니다.".into());
            }
            bl.push(serde_json::json!({
                "type": clip(name.as_str(), 24),
                "items": items.iter().map(|i| serde_json::json!({ "id": i.to_string(), "count": 1 })).collect::<Vec<_>>(),
                "hideIfSummonerSpell": "", "showIfSummonerSpell": "",
            }));
        }
        let me = self.send(reqwest::Method::GET, "/lol-summoner/v1/current-summoner", None).await?;
        let sid = me.get("summonerId").and_then(|v| v.as_u64()).ok_or("소환사 정보를 읽지 못했습니다.")?;
        let path = format!("/lol-item-sets/v1/item-sets/{sid}/sets");
        let mut cur = self.send(reqwest::Method::GET, &path, None).await?;
        let uid = format!("prism-{champion}");
        let set = serde_json::json!({
            "uid": uid, "title": clip(title, 40), "type": "custom", "map": "any", "mode": "any",
            "associatedChampions": [champion], "associatedMaps": [12],
            "blocks": bl, "preferredItemSlots": [], "sortrank": 0, "startedFrom": "blank",
        });
        let sets = cur.get_mut("itemSets").and_then(|v| v.as_array_mut()).ok_or("아이템 세트 목록을 읽지 못했습니다.")?;
        sets.retain(|x| x.get("uid").and_then(|u| u.as_str()) != Some(uid.as_str()));
        sets.insert(0, set);
        self.send(reqwest::Method::PUT, &path, Some(cur)).await.map(|_| ())
    }

    async fn send(&self, method: reqwest::Method, path: &str, body: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
        if game_running() {
            return Err("게임 중에는 롤 클라이언트에 요청하지 않습니다.".into());
        }
        let c = self.ensure().ok_or("롤 클라이언트가 꺼져 있습니다.")?;
        let auth = base64::engine::general_purpose::STANDARD.encode(format!("riot:{}", c.token));
        let mut rq = self
            .http
            .request(method, format!("https://127.0.0.1:{}{}", c.port, path))
            .header("Authorization", format!("Basic {auth}"))
            .header("Accept", "application/json");
        if let Some(b) = body {
            rq = rq.json(&b);
        }
        match rq.send().await {
            Ok(r) if r.status().is_success() => {
                let t = r.text().await.map_err(|e| e.to_string())?;
                if t.trim().is_empty() { Ok(serde_json::Value::Null) } else { serde_json::from_str(&t).map_err(|e| e.to_string()) }
            }
            Ok(r) => Err(format!("클라이언트 응답 {}", r.status().as_u16())),
            Err(e) => {
                // 클라이언트를 다시 켰을 수 있다 → 다음에 다시 찾는다
                *self.creds.lock().unwrap() = None;
                Err(format!("클라이언트 연결 실패: {e}"))
            }
        }
    }
}
