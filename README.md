# 批量CSR生成器

基于 **Tauri + React + Rust** 实现的批量CSR（证书签名请求）生成工具。

## 功能特性

- 根据通用名称(CN)范围批量生成CSR
- 支持多种密钥类型：RSA_2048/3072/4096, EC_P-256/384/521
- 支持多种签名哈希算法：SHA256, SHA384, SHA512, SHA1
- 自定义Subject主题模板
- 设置证书有效期（notBefore/notAfter）
- 可选设置uniqueId和SANs备用名称
- 导出为CSV文件，包含CSR和私钥

## 系统要求

### 开发环境

- **Node.js** >= 18.0
- **Rust** >= 1.70
- **npm** >= 9.0

### 运行环境

- **Windows**: Windows 10/11 (x64)
- **macOS**: macOS 10.13+ (Intel/Apple Silicon)

## 快速开始

### 1. 安装依赖

```bash
# 进入项目目录
cd batch-csr-generator

# 安装前端依赖
npm install
```

### 2. 开发模式运行

```bash
npm run tauri dev
```

### 3. 构建生产版本

```bash
npm run tauri build
```

## 打包说明

### macOS 打包

#### 前置条件

1. 安装 Xcode Command Line Tools:
```bash
xcode-select --install
```

2. 安装 Rust:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

#### 打包步骤

```bash
# 1. 安装依赖
npm install

# 2. 构建应用
npm run tauri build

# 3. 构建产物位置
# - DMG安装包: src-tauri/target/release/bundle/dmg/
# - App应用: src-tauri/target/release/bundle/macos/
```

#### 生成应用图标 (可选)

如果需要自定义图标，准备一个 1024x1024 的 PNG 图片，然后：

```bash
# 使用 tauri 图标生成工具
npm run tauri icon /path/to/your/icon.png
```

### Windows 打包

#### 前置条件

1. 安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   - 选择 "Desktop development with C++"

2. 安装 [Rust](https://www.rust-lang.org/tools/install)
   - 下载并运行 rustup-init.exe

3. 安装 [Node.js](https://nodejs.org/)

#### 打包步骤

```powershell
# 1. 安装依赖
npm install

# 2. 构建应用
npm run tauri build

# 3. 构建产物位置
# - MSI安装包: src-tauri\target\release\bundle\msi\
# - NSIS安装包: src-tauri\target\release\bundle\nsis\
# - 可执行文件: src-tauri\target\release\批量CSR生成器.exe
```

### 跨平台构建

#### 在 macOS 上构建 Windows 版本

需要安装交叉编译工具链：

```bash
# 安装 Windows 目标
rustup target add x86_64-pc-windows-msvc

# 注意：完整的 Windows 构建通常需要在 Windows 上进行
# 或使用 CI/CD 服务（如 GitHub Actions）
```

#### 使用 GitHub Actions 自动构建

创建 `.github/workflows/build.yml`:

```yaml
name: Build

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-latest
            target: universal-apple-darwin
          - os: windows-latest
            target: x86_64-pc-windows-msvc

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install Rust
        uses: dtolnay/rust-action@stable

      - name: Install dependencies
        run: npm install

      - name: Build
        run: npm run tauri build

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.os }}-build
          path: |
            src-tauri/target/release/bundle/
```

## 项目结构

```
batch-csr-generator/
├── src/                    # React 前端源码
│   ├── App.tsx            # 主应用组件
│   ├── main.tsx           # 入口文件
│   └── styles.css         # 样式文件
├── src-tauri/             # Rust 后端源码
│   ├── src/
│   │   ├── main.rs        # Rust 入口
│   │   ├── lib.rs         # Tauri 命令注册
│   │   └── csr_generator.rs # CSR 生成逻辑
│   ├── Cargo.toml         # Rust 依赖配置
│   ├── tauri.conf.json    # Tauri 配置
│   └── icons/             # 应用图标
├── package.json           # 前端依赖配置
└── README.md              # 说明文档
```

## 使用说明

1. **通用名称范围**: 输入格式如 `YDL0001-YDL0010`，会生成 YDL0001 到 YDL0010 共10个CSR

2. **Subject主题模板**: 使用 `{CN}` 作为占位符，例如：
   ```
   CN=[{CN}]; O=[TrustAsia Technologies\\, Inc.]; OU=[部门1]
   ```

3. **密钥类型**: 支持 RSA 和 EC 椭圆曲线算法

4. **有效期**: 设置证书的 notBefore 和 notAfter 时间

5. **输出文件**: CSV 格式，包含以下字段：
   - subject: 完整的Subject DN
   - signHashAlg: 签名哈希算法
   - notBefore: 有效期开始时间
   - notAfter: 有效期结束时间
   - uniqueId: 唯一标识（可选）
   - sans: 备用名称（可选）
   - csr: CSR的PEM格式
   - keyPairType: 密钥类型
   - privateKey: 私钥的PEM格式

## 常见问题

### Q: macOS 提示"无法打开，因为无法验证开发者"

A: 右键点击应用，选择"打开"，然后在弹出的对话框中点击"打开"。或者在系统偏好设置 > 安全性与隐私中允许运行。

### Q: Windows 提示"Windows 已保护你的电脑"

A: 点击"更多信息"，然后点击"仍要运行"。

### Q: 构建时 Rust 编译失败

A: 确保已安装所有必要的构建工具：
- macOS: `xcode-select --install`
- Windows: Visual Studio Build Tools with C++ workload

## 许可证

MIT License
