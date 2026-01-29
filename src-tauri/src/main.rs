// 防止在Windows发布版本中显示控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    batch_csr_generator_lib::run()
}
