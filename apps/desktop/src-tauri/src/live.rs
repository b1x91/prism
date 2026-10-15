//! 게임 중 Riot 라이브 클라이언트 데이터 (CLAUDE.md v3.46, 사용자 결정).
//! 롤 게임이 켜져 있는 동안 게임 클라이언트가 내 PC 안(127.0.0.1:2999)에 직접 열어 두는 읽기 전용 정보다.
//! 게임 메모리·입력·롤 클라이언트(LCU)는 건드리지 않는다. 읽은 값은 화면(게임 위 작은 창)에만 쓰고 저장·전송하지 않는다.
//! 10명의 챔프·팀·현재 아이템·킬/데스/어시스트 = 게임 안 Tab 점수판과 같은 범위.
use serde_json::{json, Value};
use std::sync::OnceLock;
use std::time::Duration;

const URL: &str = "https://127.0.0.1:2999/liveclientdata/allgamedata";

fn client() -> &'static reqwest::Client {
    static C: OnceLock<reqwest::Client> = OnceLock::new();
    C.get_or_init(|| {
        reqwest::Client::builder()
            // 게임 클라이언트가 스스로 만든 인증서라 검증할 수 없다 (내 PC 안 주소만 부른다)
            .danger_accept_invalid_certs(true)
            .no_proxy()
            .timeout(Duration::from_millis(1500))
            .build()
            .expect("live client")
    })
}

/// 필요한 것만 추려서: 나(이름), 10명(챔프·팀·아이템·점수, 그 밖의 칸은 그대로 — 증강 칸이 있는지 화면이 본다), 모드
pub async fn snapshot() -> Result<Value, String> {
    let v: Value = client().get(URL).send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
    let me = v["activePlayer"]["riotId"].as_str().or_else(|| v["activePlayer"]["summonerName"].as_str()).unwrap_or("").to_string();
    Ok(json!({
        "me": me,
        "mode": v["gameData"]["gameMode"].clone(),
        "time": v["gameData"]["gameTime"].clone(),
        "players": v["allPlayers"].clone(),
    }))
}
