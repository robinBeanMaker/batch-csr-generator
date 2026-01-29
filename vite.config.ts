import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  // 防止 Vite 清除 Rust 错误信息
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // 告诉 Vite 忽略 src-tauri 目录
      ignored: ["**/src-tauri/**"],
    },
  },
}));
