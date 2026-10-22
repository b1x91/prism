fn main() {
    // 배포 경로(스토어 판)가 바뀌면 다시 빌드 (update.rs CHANNEL)
    println!("cargo:rerun-if-env-changed=PRISM_CHANNEL");
    tauri_build::build()
}
