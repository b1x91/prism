//! Prism 서버 중계와 로그인. 로그인 토큰은 이 파일만 알고, 앱 화면(웹뷰)에는 내보내지 않는다.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

/// 서버 주소: 빌드할 때 PRISM_SERVER 로 넣는다 (없으면 모임 기능 꺼짐)
pub const SERVER: Option<&str> = option_env!("PRISM_SERVER");

#[derive(Default, Serialize, Deserialize)]
struct Config {
    token: Option<String>,
}

pub struct Server {
    path: PathBuf,
    http: reqwest::Client,
}

impl Server {
    pub fn new(dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&dir);
        let http = reqwest::Client::builder().timeout(Duration::from_secs(15)).build().expect("http client");
        Self { path: dir.join("config.json"), http }
    }

    fn load(&self) -> Config {
        std::fs::read_to_string(&self.path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
    }

    fn save(&self, c: &Config) {
        if let Ok(s) = serde_json::to_string(c) {
            let _ = std::fs::write(&self.path, s);
        }
    }

    pub fn logged_in(&self) -> bool {
        SERVER.is_some() && self.load().token.is_some()
    }

    /// 서버 호출. 401 이면 저장된 토큰을 지운다
    pub async fn call(&self, method: &str, path: &str, body: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
        let base = SERVER.ok_or("Prism 모임 기능은 곧 열립니다.")?;
        if !path.starts_with('/') {
            return Err("잘못된 경로".into());
        }
        let m = match method {
            "GET" => reqwest::Method::GET,
            "POST" => reqwest::Method::POST,
            "DELETE" => reqwest::Method::DELETE,
            _ => return Err("지원하지 않는 요청".into()),
        };
        let mut req = self.http.request(m, format!("{base}{path}"));
        if let Some(t) = self.load().token {
            req = req.bearer_auth(t);
        }
        if let Some(b) = body {
            req = req.json(&b);
        }
        let mut last = String::new();
        for attempt in 0..2 {
            match req.try_clone().ok_or("요청 복제 실패")?.send().await {
                Ok(r) => {
                    let status = r.status();
                    let v: serde_json::Value = r.json().await.unwrap_or(serde_json::json!({}));
                    if status.as_u16() == 401 {
                        self.save(&Config { token: None });
                    }
                    if !status.is_success() {
                        return Err(v.get("error").and_then(|e| e.as_str()).map(String::from).unwrap_or(format!("서버 오류 ({})", status.as_u16())));
                    }
                    return Ok(v);
                }
                Err(e) => {
                    last = e.to_string();
                    if attempt == 0 {
                        tokio::time::sleep(Duration::from_secs(1)).await;
                    }
                }
            }
        }
        Err(format!("서버 연결 실패: {last}"))
    }

    /// 디스코드 로그인: 내 PC 의 임시 주소(127.0.0.1)로 1회용 code 를 받아 토큰으로 바꾼다
    pub async fn login(&self, open: impl Fn(String)) -> Result<(), String> {
        let base = SERVER.ok_or("Prism 모임 기능은 곧 열립니다.")?;
        let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|e| e.to_string())?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let back = format!("http://127.0.0.1:{port}/done");
        let start = if option_env!("PRISM_DEV_LOGIN") == Some("1") {
            format!("{base}/auth/dev?id=me1&name=%ED%95%98%EC%A0%9C&redirect={}", url::form_urlencoded::byte_serialize(back.as_bytes()).collect::<String>())
        } else {
            format!("{base}/auth/discord/start?redirect={}", url::form_urlencoded::byte_serialize(back.as_bytes()).collect::<String>())
        };
        open(start);
        let code = tokio::time::timeout(Duration::from_secs(300), async {
            loop {
                let (mut sock, _) = listener.accept().await.map_err(|e| e.to_string())?;
                let mut buf = vec![0u8; 4096];
                let n = sock.read(&mut buf).await.unwrap_or(0);
                let req = String::from_utf8_lossy(&buf[..n]).to_string();
                let line = req.lines().next().unwrap_or("");
                let target = line.split_whitespace().nth(1).unwrap_or("");
                let u = url::Url::parse(&format!("http://127.0.0.1{target}")).map_err(|e| e.to_string())?;
                if u.path() != "/done" {
                    let _ = sock.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n").await;
                    continue;
                }
                let code = u.query_pairs().find(|(k, _)| k == "code").map(|(_, v)| v.to_string());
                let html = "<!doctype html><meta charset=utf-8><title>Prism</title><body style=\"font-family:system-ui;background:#07090f;color:#eef1f8;display:grid;place-items:center;height:100vh;margin:0\"><div style=\"text-align:center\"><h2>로그인됐어요</h2><p>이 창을 닫고 Prism 앱으로 돌아가세요.</p></div>";
                let _ = sock.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{html}", html.len()).as_bytes()).await;
                return code.ok_or_else(|| "로그인 정보가 없습니다.".to_string());
            }
        })
        .await
        .map_err(|_| "로그인 시간이 지났습니다. 다시 시도해주세요.".to_string())??;
        let v = self.call("POST", "/api/app/token", Some(serde_json::json!({ "code": code }))).await?;
        let token = v.get("token").and_then(|t| t.as_str()).ok_or("토큰을 받지 못했습니다.")?;
        self.save(&Config { token: Some(token.to_string()) });
        Ok(())
    }

    pub async fn logout(&self) {
        let _ = self.call("POST", "/api/logout", Some(serde_json::json!({}))).await;
        self.save(&Config { token: None });
    }
}
