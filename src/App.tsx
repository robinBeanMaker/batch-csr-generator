import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { open } from "@tauri-apps/plugin-shell";

// 密钥类型枚举
const KEY_TYPES = [
  { value: "RSA_2048", label: "RSA_2048" },
  { value: "RSA_3072", label: "RSA_3072" },
  { value: "RSA_4096", label: "RSA_4096" },
  { value: "EC_P256", label: "EC_P-256" },
  { value: "EC_P384", label: "EC_P-384" },
  { value: "EC_P521", label: "EC_P-521" },
];

// 签名哈希算法
const SIGN_HASH_ALGORITHMS = ["SHA256", "SHA384", "SHA512", "SHA1", "MatchIssuer"];

// 生成参数接口
interface GenerateParams {
  cn_range: string;
  subject_template: string;
  key_type: string;
  sign_hash_alg: string;
  not_before: string;
  not_after: string;
  unique_id: string;
  sans: string;
  output_path: string;
}

// 生成结果接口
interface GenerateResult {
  success: boolean;
  message: string;
  total: number;
  output_path: string;
}


function App() {
  // 表单状态
  const [cnRange, setCnRange] = useState("YDL0001-YDL0010");
  const [subjectTemplate, setSubjectTemplate] = useState(
    "CN=[{CN}]; O=[TrustAsia Technologies\\\\, Inc.]; OU=[部门1]"
  );
  const [keyType, setKeyType] = useState("RSA_2048");
  const [signHashAlg, setSignHashAlg] = useState("SHA256");
  const [notBefore, setNotBefore] = useState(formatDateTimeLocal(new Date()));
  const [notAfter, setNotAfter] = useState(
    formatDateTimeLocal(new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000))
  );
  const [uniqueId, setUniqueId] = useState("");
  const [sans, setSans] = useState("");
  const [outputPath, setOutputPath] = useState("output.csv");

  // UI状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("就绪");
  const [statusText, setStatusText] = useState('请输入参数后点击"开始生成CSV"');

  // 日志区域引用
  const logAreaRef = useRef<HTMLDivElement>(null);

  // 格式化日期时间为本地输入格式
  function formatDateTimeLocal(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }

  // 格式化日期时间为ISO8601格式
  function formatISO8601(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toISOString();
  }

  // 获取文件名时间戳
  function getFileTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
  }

  // 添加日志
  function addLog(message: string, type: "info" | "success" | "error" | "warning" = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === "info" ? "" : type === "success" ? "✓ " : type === "error" ? "✗ " : "⚠ ";
    setLogs((prev) => [...prev, `[${timestamp}] ${prefix}${message}`]);
  }

  // 自动滚动日志到底部
  useEffect(() => {
    if (logAreaRef.current) {
      logAreaRef.current.scrollTop = logAreaRef.current.scrollHeight;
    }
  }, [logs]);

  // 浏览输出文件
  async function browseOutputFile() {
    try {
      const filePath = await save({
        defaultPath: "output.csv",
        filters: [{ name: "CSV文件", extensions: ["csv"] }],
      });
      if (filePath) {
        setOutputPath(filePath);
      }
    } catch (error) {
      console.error("选择文件失败:", error);
    }
  }

  // 开始生成
  async function startGeneration() {
    // 验证输入
    if (!cnRange.trim()) {
      alert("请输入通用名称范围！");
      return;
    }
    if (!subjectTemplate.trim()) {
      alert("请输入Subject主题模板！");
      return;
    }
    if (new Date(notBefore) > new Date(notAfter)) {
      alert("有效期开始时间不能晚于结束时间！");
      return;
    }
    if (!outputPath.trim()) {
      alert("请指定输出文件路径！");
      return;
    }

    // 为文件名添加时间戳
    let finalOutputPath = outputPath;
    const timestamp = getFileTimestamp();
    // 移除已有的时间戳格式
    let basePath = finalOutputPath.replace(/_\d{8}_\d{6}(\.csv)?$/i, "");
    if (basePath.toLowerCase().endsWith(".csv")) {
      basePath = basePath.slice(0, -4);
    }
    finalOutputPath = `${basePath}_${timestamp}.csv`;
    setOutputPath(finalOutputPath);

    // 开始生成
    setIsGenerating(true);
    setLogs([]);
    setProgress(0);
    setProgressText("生成中...");
    setStatusText("正在生成CSR，请稍候...");

    addLog("========================================");
    addLog("开始批量生成CSR");
    addLog("========================================");
    addLog(`通用名称范围: ${cnRange}`);
    addLog(`密钥类型: ${keyType}`);
    addLog(`签名哈希算法: ${signHashAlg}`);
    addLog(`Subject模板: ${subjectTemplate}`);
    addLog(`notBefore: ${notBefore}`);
    addLog(`notAfter: ${notAfter}`);
    if (uniqueId) addLog(`uniqueId: ${uniqueId}`);
    if (sans) addLog(`sans: ${sans}`);
    addLog(`输出文件: ${finalOutputPath}`);
    addLog("");

    try {
      // 调用Rust后端生成CSR
      const params: GenerateParams = {
        cn_range: cnRange.trim(),
        subject_template: subjectTemplate.trim(),
        key_type: keyType,
        sign_hash_alg: signHashAlg,
        not_before: formatISO8601(notBefore),
        not_after: formatISO8601(notAfter),
        unique_id: uniqueId.trim(),
        sans: sans.trim(),
        output_path: finalOutputPath,
      };

      // 监听进度事件
      const unlisten = await invoke<GenerateResult>("generate_csr_batch", { params });

      // 处理结果
      if (unlisten.success) {
        addLog("");
        addLog("========================================", "success");
        addLog("生成完成！", "success");
        addLog(`共生成 ${unlisten.total} 个CSR`, "success");
        addLog(`输出文件: ${unlisten.output_path}`, "success");
        addLog("========================================", "success");

        setProgress(100);
        setProgressText("完成");
        setStatusText(`生成完成！共 ${unlisten.total} 个CSR`);

        // 询问是否打开文件所在目录
        const openDir = confirm(
          `CSR生成完成！共生成 ${unlisten.total} 个。\n是否打开输出文件所在目录？`
        );
        if (openDir) {
          // 获取文件所在目录
          const dirPath = unlisten.output_path.substring(
            0,
            unlisten.output_path.lastIndexOf("/")
          ) || unlisten.output_path.substring(
            0,
            unlisten.output_path.lastIndexOf("\\")
          );
          if (dirPath) {
            await open(dirPath);
          }
        }
      } else {
        throw new Error(unlisten.message);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addLog(`发生错误: ${errorMsg}`, "error");
      setProgress(0);
      setProgressText("错误");
      setStatusText("生成失败");
      alert(`生成过程中发生错误: ${errorMsg}`);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="container">
      <h1 className="app-title">批量CSR生成器 v1.0</h1>

      {/* 参数设置卡片 */}
      <div className="card">
        <h2 className="card-title">参数设置</h2>

        {/* 通用名称范围 */}
        <div className="form-group">
          <label className="form-label">通用名称(CN)范围:</label>
          <input
            type="text"
            className="form-input"
            value={cnRange}
            onChange={(e) => setCnRange(e.target.value)}
            placeholder="格式示例: YDL0001-YDL0010"
            disabled={isGenerating}
          />
          <div className="hint-text">格式示例: YDL0001-YDL0010</div>
        </div>

        {/* Subject主题模板 */}
        <div className="form-group">
          <label className="form-label">Subject主题模板:</label>
          <input
            type="text"
            className="form-input"
            value={subjectTemplate}
            onChange={(e) => setSubjectTemplate(e.target.value)}
            placeholder="使用{CN}作为通用名称占位符"
            disabled={isGenerating}
          />
          <div className="hint-text">使用{"{CN}"}作为通用名称占位符，多值用逗号分隔，值中逗号用\,转义</div>
        </div>

        {/* 密钥类型和签名哈希算法 */}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">密钥类型:</label>
            <select
              className="form-select"
              value={keyType}
              onChange={(e) => setKeyType(e.target.value)}
              disabled={isGenerating}
            >
              {KEY_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">签名哈希算法:</label>
            <select
              className="form-select"
              value={signHashAlg}
              onChange={(e) => setSignHashAlg(e.target.value)}
              disabled={isGenerating}
            >
              {SIGN_HASH_ALGORITHMS.map((alg) => (
                <option key={alg} value={alg}>
                  {alg}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 有效期 */}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">notBefore(有效期开始):</label>
            <input
              type="datetime-local"
              className="form-input"
              value={notBefore}
              onChange={(e) => setNotBefore(e.target.value)}
              disabled={isGenerating}
              step="1"
            />
          </div>
          <div className="form-group">
            <label className="form-label">notAfter(有效期结束):</label>
            <input
              type="datetime-local"
              className="form-input"
              value={notAfter}
              onChange={(e) => setNotAfter(e.target.value)}
              disabled={isGenerating}
              step="1"
            />
          </div>
        </div>

        {/* uniqueId */}
        <div className="form-group">
          <label className="form-label">uniqueId(可选):</label>
          <input
            type="text"
            className="form-input"
            value={uniqueId}
            onChange={(e) => setUniqueId(e.target.value)}
            placeholder="可选，下载证书时以该id作为文件夹名称"
            disabled={isGenerating}
          />
          <div className="hint-text">可选，下载证书时以该id作为文件夹名称，否则以证书序列号作为文件夹名称</div>
        </div>

        {/* sans备用名称 */}
        <div className="form-group">
          <label className="form-label">sans备用名称(可选):</label>
          <input
            type="text"
            className="form-input"
            value={sans}
            onChange={(e) => setSans(e.target.value)}
            placeholder="格式如: dNSName=[domain.com,domain1.com];iPAddress=[127.0.0.1]"
            disabled={isGenerating}
          />
          <div className="hint-text">格式如: dNSName=[domain.com,domain1.com];iPAddress=[127.0.0.1]</div>
        </div>

        {/* 输出文件路径 */}
        <div className="form-group">
          <label className="form-label">输出CSV文件:</label>
          <div className="file-input-wrapper">
            <input
              type="text"
              className="form-input"
              value={outputPath}
              onChange={(e) => setOutputPath(e.target.value)}
              disabled={isGenerating}
            />
            <button
              className="btn btn-secondary"
              onClick={browseOutputFile}
              disabled={isGenerating}
            >
              浏览...
            </button>
          </div>
        </div>

        {/* 生成按钮 */}
        <div className="generate-btn-container">
          <button
            className={`btn btn-primary btn-large ${isGenerating ? "generating" : ""}`}
            onClick={startGeneration}
            disabled={isGenerating}
          >
            {isGenerating ? "生成中..." : "开始生成CSV"}
          </button>
        </div>
      </div>

      {/* 生成日志卡片 */}
      <div className="card">
        <h2 className="card-title">生成日志</h2>
        <div className="log-area" ref={logAreaRef}>
          {logs.map((log, index) => (
            <div key={index}>{log}</div>
          ))}
        </div>

        {/* 进度条 */}
        <div className="progress-container">
          <div className="progress-bar-wrapper">
            <div className="progress-bar" style={{ width: `${progress}%` }}></div>
            <span className="progress-text">{progressText}</span>
          </div>
          <div className="status-label">{statusText}</div>
        </div>
      </div>
    </div>
  );
}

export default App;
