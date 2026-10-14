//! 디스코드 주소를 디스코드 앱으로 연다.
//! discord.gg/코드 · discord.com/invite/코드 → discord://-/invite/코드
//! discord.com/channels/서버/채널          → discord://-/channels/서버/채널
//! 디스코드 앱이 깔려 있지 않으면(주소 처리기가 등록 안 됨) 원래 https 주소를 그대로 쓴다.

/// 디스코드 앱 주소로 바꿀 수 있으면 바꾼 주소를 돌려준다
pub fn app_url(url: &str) -> Option<String> {
    let u = url::Url::parse(url).ok()?;
    let host = u.host_str()?.trim_start_matches("www.");
    let path = u.path().trim_matches('/');
    let ok = |s: &str| !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    let target = match host {
        "discord.gg" if ok(path) => format!("invite/{path}"),
        "discord.com" | "discordapp.com" => {
            let parts: Vec<&str> = path.split('/').collect();
            match parts.as_slice() {
                ["invite", code] if ok(code) => format!("invite/{code}"),
                ["channels", rest @ ..] if !rest.is_empty() && rest.len() <= 3 && rest.iter().all(|p| ok(p) || *p == "@me") => format!("channels/{}", rest.join("/")),
                _ => return None,
            }
        }
        _ => return None,
    };
    installed().then(|| format!("discord://-/{target}"))
}

/// 디스코드 앱이 discord:// 주소를 받도록 등록돼 있는지 (Windows 레지스트리)
#[cfg(windows)]
fn installed() -> bool {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    std::process::Command::new("reg")
        .args(["query", r"HKCU\Software\Classes\discord"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
        || std::process::Command::new("reg")
            .args(["query", r"HKCR\discord"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
}

#[cfg(not(windows))]
fn installed() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn 바꾸지_않는_주소() {
        assert_eq!(app_url("https://przm.web.app/"), None);
        assert_eq!(app_url("https://discord.com/api/x"), None);
        assert_eq!(app_url("https://discord.gg/a/b"), None);
    }
}
