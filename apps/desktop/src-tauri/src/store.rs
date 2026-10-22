//! Microsoft Store 판(빌드 때 `PRISM_CHANNEL=store`, MSIX)만 쓰는 것 (CLAUDE.md v3.103).
//!
//! - 업데이트: 스토어에 새 버전이 있는지 `StoreContext` 로 확인하고, '업데이트'를 누르면 스토어의 받기·설치 창을 띄운다.
//!   설치가 시작되면 Windows 가 앱을 닫고 새 버전을 넣는다. 스토어 창을 못 띄우면 스토어의 Prism 페이지를 연다.
//! - 윈도우 시작 시 실행: MSIX 앱은 레지스트리 Run 키를 쓸 수 없어 매니페스트의 시작 작업(`PrismStartup`)을 켜고 끈다.
//!   시작 작업으로 켜졌으면 창 없이 트레이로만 (설치판의 `--background` 와 같게).
//!
//! 스토어에서 설치한 앱에서만 동작한다 (패키지 정보가 없으면 오류 → 화면은 '확인할 수 없음'으로 둔다).

/// 스토어 제품 페이지 (설치판에서는 쓰지 않는다)
pub const PDP_URL: &str = "ms-windows-store://pdp/?productid=9N36B7J6KM8R";
const TASK_ID: &str = "PrismStartup";

#[cfg(windows)]
mod imp {
    use super::TASK_ID;
    use windows::core::{Interface, HSTRING};
    use windows::ApplicationModel::Activation::ActivationKind;
    use windows::ApplicationModel::{AppInstance, StartupTask, StartupTaskState};
    use windows::Services::Store::{StoreContext, StorePackageUpdateState};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
    use windows::Win32::UI::Shell::IInitializeWithWindow;

    fn init() {
        let _ = unsafe { RoInitialize(RO_INIT_MULTITHREADED) };
    }
    fn e(x: windows::core::Error) -> String {
        x.message().to_string()
    }

    /// 스토어에 올라온 새 버전 ("1.0.1"), 없으면 None
    pub fn latest() -> Result<Option<String>, String> {
        init();
        let ctx = StoreContext::GetDefault().map_err(e)?;
        let list = ctx.GetAppAndOptionalStorePackageUpdatesAsync().map_err(e)?.get().map_err(e)?;
        if list.Size().map_err(e)? == 0 {
            return Ok(None);
        }
        let v = list.GetAt(0).and_then(|u| u.Package()).and_then(|p| p.Id()).and_then(|i| i.Version()).map_err(e)?;
        Ok(Some(format!("{}.{}.{}", v.Major, v.Minor, v.Build)))
    }

    /// 스토어의 받기·설치 창을 띄운다. 설치가 시작되면 true (곧 Windows 가 앱을 닫는다)
    pub fn install(hwnd: isize) -> Result<bool, String> {
        init();
        let ctx = StoreContext::GetDefault().map_err(e)?;
        // 데스크톱 앱은 스토어 창을 띄울 창을 알려 줘야 한다
        let iw: IInitializeWithWindow = ctx.cast().map_err(e)?;
        unsafe { iw.Initialize(HWND(hwnd as _)) }.map_err(e)?;
        let list = ctx.GetAppAndOptionalStorePackageUpdatesAsync().map_err(e)?.get().map_err(e)?;
        if list.Size().map_err(e)? == 0 {
            return Ok(false);
        }
        let r = ctx.RequestDownloadAndInstallStorePackageUpdatesAsync(&list).map_err(e)?.get().map_err(e)?;
        let s = r.OverallState().map_err(e)?;
        Ok(s == StorePackageUpdateState::Completed || s == StorePackageUpdateState::Deploying)
    }

    fn task() -> Result<StartupTask, String> {
        init();
        StartupTask::GetAsync(&HSTRING::from(TASK_ID)).map_err(e)?.get().map_err(e)
    }

    /// 윈도우 시작 시 실행: 바꾸고(enable) 지금 상태를 돌려준다. 사용자가 Windows 설정에서 끈 것은 앱이 다시 켤 수 없다
    pub fn startup(enable: Option<bool>) -> Result<bool, String> {
        let t = task()?;
        match enable {
            Some(true) => {
                let s = t.RequestEnableAsync().map_err(e)?.get().map_err(e)?;
                if s == StartupTaskState::DisabledByUser {
                    return Err("Windows 설정 → 앱 → 시작 프로그램에서 Prism을 켜 주세요.".into());
                }
            }
            Some(false) => t.Disable().map_err(e)?,
            None => {}
        }
        let s = t.State().map_err(e)?;
        Ok(s == StartupTaskState::Enabled || s == StartupTaskState::EnabledByPolicy)
    }

    /// 시작 작업(윈도우 시작 시 실행)으로 켜졌는가
    pub fn started_by_task() -> bool {
        init();
        AppInstance::GetActivatedEventArgs().and_then(|a| a.Kind()).is_ok_and(|k| k == ActivationKind::StartupTask)
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn latest() -> Result<Option<String>, String> {
        Err("Windows 전용".into())
    }
    pub fn install(_: isize) -> Result<bool, String> {
        Err("Windows 전용".into())
    }
    pub fn startup(_: Option<bool>) -> Result<bool, String> {
        Err("Windows 전용".into())
    }
    pub fn started_by_task() -> bool {
        false
    }
}

pub use imp::{install, latest, startup, started_by_task};
