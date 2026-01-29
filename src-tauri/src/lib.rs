//! 批量CSR生成器 - Rust后端
//! 功能：根据用户输入的通用名称范围批量生成CSR，并输出到CSV文件
//! 支持多种密钥类型：RSA_2048/3072/4096, EC_P-256/384/521

mod csr_generator;

use csr_generator::{generate_csr_batch_internal, GenerateParams, GenerateResult};

/// 批量生成CSR的Tauri命令
#[tauri::command]
fn generate_csr_batch(params: GenerateParams) -> Result<GenerateResult, String> {
    generate_csr_batch_internal(params).map_err(|e| e.to_string())
}

/// 运行Tauri应用
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![generate_csr_batch])
        .run(tauri::generate_context!())
        .expect("运行Tauri应用时发生错误");
}
