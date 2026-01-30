import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Card,
  Form,
  Input,
  Select,
  DatePicker,
  Button,
  Progress,
  Typography,
  Row,
  Col,
  Space,
  message,
} from "antd";
import {
  PlayCircleOutlined,
  FolderOpenOutlined,
  SettingOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

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
  const [form] = Form.useForm();
  const [cnRange, setCnRange] = useState("YDL0001-YDL0010");
  const [subjectTemplate, setSubjectTemplate] = useState(
    "CN=[{CN}]; O=[TrustAsia Technologies\\\\, Inc.]; OU=[部门1]"
  );
  const [keyType, setKeyType] = useState("RSA_2048");
  const [signHashAlg, setSignHashAlg] = useState("SHA256");
  const [notBefore, setNotBefore] = useState(dayjs());
  const [notAfter, setNotAfter] = useState(dayjs().add(10, 'year'));
  const [uniqueId, setUniqueId] = useState("");
  const [sans, setSans] = useState("");
  const [outputDir, setOutputDir] = useState("");

  // UI状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("就绪");
  const [statusText, setStatusText] = useState('请输入参数后点击"开始生成CSV"');

  // 日志区域引用
  const logAreaRef = useRef<HTMLDivElement>(null);

  /*// 格式化日期时间为本地输入格式
  function formatDateTimeLocal(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }*/

  /*// 格式化日期时间为ISO8601格式
  function formatISO8601(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toISOString();
  }*/

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

  // 浏览输出目录
  async function browseOutputDir() {
    try {
      const dirPath = await openDialog({
        directory: true,
        multiple: false,
      });
      if (dirPath) {
        setOutputDir(dirPath as string);
        // 同时更新表单字段的值
        form.setFieldsValue({ outputDir: dirPath as string });
      }
    } catch (error) {
      console.error("选择目录失败:", error);
    }
  }

  // 开始生成
  async function startGeneration() {
    try {
      // 使用 Ant Design 表单验证
      await form.validateFields();
    } catch (error) {
      message.error("请检查表单输入！");
      return;
    }

    // 验证输入
    if (!cnRange.trim()) {
      message.error("请输入通用名称范围！");
      return;
    }
    if (!subjectTemplate.trim()) {
      message.error("请输入Subject主题模板！");
      return;
    }
    if (notBefore.isAfter(notAfter)) {
      message.error("有效期开始时间不能晚于结束时间！");
      return;
    }
    if (!outputDir.trim()) {
      message.error("请选择输出目录！");
      return;
    }

    // 在选定目录中生成带时间戳的CSV文件
    const timestamp = getFileTimestamp();
    const fileName = `csr_batch_${timestamp}.csv`;
    const finalOutputPath = `${outputDir}/${fileName}`;

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
    addLog(`notBefore: ${notBefore.format('YYYY-MM-DDTHH:mm:ss+08:00')}`);
    addLog(`notAfter: ${notAfter.format('YYYY-MM-DDTHH:mm:ss+08:00')}`);
    if (uniqueId) addLog(`uniqueId: ${uniqueId}`);
    if (sans) addLog(`sans: ${sans}`);
    addLog(`输出文件: ${finalOutputPath}`);
    addLog("");

    // 使用 setTimeout 让UI有时间更新，避免卡顿
    setTimeout(async () => {
      try {
        // 调用Rust后端生成CSR
        const params: GenerateParams = {
          cn_range: cnRange.trim(),
          subject_template: subjectTemplate.trim(),
          key_type: keyType,
          sign_hash_alg: signHashAlg,
          not_before: notBefore.format('YYYY-MM-DDTHH:mm:ss+08:00'),
          not_after: notAfter.format('YYYY-MM-DDTHH:mm:ss+08:00'),
          unique_id: uniqueId.trim(),
          sans: sans.trim(),
          output_path: finalOutputPath,
        };

        // 解析CN范围以计算总数
        /*const cnRangeMatch = cnRange.match(/(\w+)(\d+)-(\w+)(\d+)/);
        if (cnRangeMatch) {
          const startNum = parseInt(cnRangeMatch[2]);
          const endNum = parseInt(cnRangeMatch[4]);
        }*/

        // 启动进度模拟
        let currentProgress = 5; // 从5%开始
        setProgress(5);
        setProgressText("初始化...");
        
        const progressInterval = setInterval(() => {
          currentProgress += Math.random() * 5 + 3; // 每次增加3-8%
          if (currentProgress >= 90) {
            currentProgress = 90; // 在90%停止，等待实际完成
            clearInterval(progressInterval);
            setProgressText("即将完成...");
          }
          
          const roundedProgress = Math.floor(currentProgress);
          setProgress(roundedProgress);
          
          // 更新进度文本
          if (currentProgress < 25) {
            setProgressText("初始化...");
          } else if (currentProgress < 50) {
            setProgressText("生成密钥对...");
          } else if (currentProgress < 75) {
            setProgressText("生成CSR...");
          } else if (currentProgress < 90) {
            setProgressText("保存文件...");
          } else {
            setProgressText("即将完成...");
          }
          
          console.log(`进度更新: ${roundedProgress}%`); // 调试日志
        }, 500);

        // 监听进度事件
        const unlisten = await invoke<GenerateResult>("generate_csr_batch", { params });

        // 清除进度模拟
        clearInterval(progressInterval);

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

          // 显示生成完成消息
          message.success(`CSR生成完成！共生成 ${unlisten.total} 个，文件已保存到：${unlisten.output_path}`);
        } else {
          throw new Error(unlisten.message);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        addLog(`发生错误: ${errorMsg}`, "error");
        setProgress(0);
        setProgressText("错误");
        setStatusText("生成失败");
        message.error(`生成过程中发生错误: ${errorMsg}`);
      } finally {
        setIsGenerating(false);
      }
    }, 100); // 100ms 延迟让UI有时间更新
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Typography.Title level={1} style={{ textAlign: 'center', marginBottom: '32px' }}>
        <SettingOutlined style={{ marginRight: '12px' }} />
        批量CSR生成器 v1.0
      </Typography.Title>

      {/* 参数设置卡片 */}
      <Card 
        title={
          <Space>
            <SettingOutlined />
            参数设置
          </Space>
        }
        style={{ marginBottom: '24px' }}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            cnRange,
            subjectTemplate,
            keyType,
            signHashAlg,
            notBefore,
            notAfter,
            uniqueId,
            sans,
            outputDir,
          }}
        >
          {/* 通用名称范围 */}
          <Form.Item
            label="通用名称(CN)范围"
            name="cnRange"
            rules={[{ required: true, message: '请输入通用名称范围!' }]}
            help="格式示例: YDL0001-YDL0010"
          >
            <Input
              value={cnRange}
              onChange={(e) => setCnRange(e.target.value)}
              placeholder="格式示例: YDL0001-YDL0010"
              disabled={isGenerating}
            />
          </Form.Item>

          {/* Subject主题模板 */}
          <Form.Item
            label="Subject主题模板"
            name="subjectTemplate"
            rules={[{ required: true, message: '请输入Subject主题模板!' }]}
            help='使用{CN}作为通用名称占位符，多值用逗号分隔，值中逗号用\,转义'
          >
            <Input
              value={subjectTemplate}
              onChange={(e) => setSubjectTemplate(e.target.value)}
              placeholder="使用{CN}作为通用名称占位符"
              disabled={isGenerating}
            />
          </Form.Item>

          {/* 密钥类型和签名哈希算法 */}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="密钥类型"
                name="keyType"
                rules={[{ required: true, message: '请选择密钥类型!' }]}
              >
                <Select
                  value={keyType}
                  onChange={setKeyType}
                  disabled={isGenerating}
                >
                  {KEY_TYPES.map((type) => (
                    <Select.Option key={type.value} value={type.value}>
                      {type.label}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="签名哈希算法"
                name="signHashAlg"
                rules={[{ required: true, message: '请选择签名哈希算法!' }]}
              >
                <Select
                  value={signHashAlg}
                  onChange={setSignHashAlg}
                  disabled={isGenerating}
                >
                  {SIGN_HASH_ALGORITHMS.map((alg) => (
                    <Select.Option key={alg} value={alg}>
                      {alg}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {/* 有效期 */}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="notBefore(有效期开始)"
                name="notBefore"
                rules={[{ required: true, message: '请选择有效期开始时间!' }]}
              >
                <DatePicker
                  showTime
                  value={notBefore}
                  onChange={(date) => setNotBefore(date || dayjs())}
                  disabled={isGenerating}
                  style={{ width: '100%' }}
                  format="YYYY-MM-DD HH:mm:ss"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="notAfter(有效期结束)"
                name="notAfter"
                rules={[{ required: true, message: '请选择有效期结束时间!' }]}
              >
                <DatePicker
                  showTime
                  value={notAfter}
                  onChange={(date) => setNotAfter(date || dayjs().add(10, 'year'))}
                  disabled={isGenerating}
                  style={{ width: '100%' }}
                  format="YYYY-MM-DD HH:mm:ss"
                />
              </Form.Item>
            </Col>
          </Row>

          {/* uniqueId */}
          <Form.Item
            label="uniqueId(可选)"
            name="uniqueId"
            help="可选，下载证书时以该id作为文件夹名称，否则以证书序列号作为文件夹名称"
          >
            <Input
              value={uniqueId}
              onChange={(e) => setUniqueId(e.target.value)}
              placeholder="可选，下载证书时以该id作为文件夹名称"
              disabled={isGenerating}
            />
          </Form.Item>

          {/* sans备用名称 */}
          <Form.Item
            label="sans备用名称(可选)"
            name="sans"
            help="格式如: dNSName=[domain.com,domain1.com];iPAddress=[127.0.0.1]"
          >
            <Input
              value={sans}
              onChange={(e) => setSans(e.target.value)}
              placeholder="格式如: dNSName=[domain.com,domain1.com];iPAddress=[127.0.0.1]"
              disabled={isGenerating}
            />
          </Form.Item>

          {/* 输出目录 */}
          <Form.Item
            label="输出目录"
            name="outputDir"
            rules={[{ required: true, message: '请选择输出目录!' }]}
          >
            <Input.Group compact>
              <Input
                style={{ width: 'calc(100% - 100px)' }}
                value={outputDir}
                onChange={(e) => setOutputDir(e.target.value)}
                disabled={isGenerating}
                placeholder="请选择CSV文件输出目录"
              />
              <Button
                style={{ width: '100px' }}
                icon={<FolderOpenOutlined />}
                onClick={browseOutputDir}
                disabled={isGenerating}
              >
                浏览
              </Button>
            </Input.Group>
          </Form.Item>

          {/* 生成按钮 */}
          <Form.Item style={{ textAlign: 'center', marginTop: '32px', marginBottom: '16px' }}>
            <Button
              type="primary"
              size="large"
              icon={<PlayCircleOutlined />}
              onClick={startGeneration}
              disabled={isGenerating}
              loading={isGenerating}
              style={{ minWidth: '200px', height: '48px', fontSize: '16px' }}
            >
              {isGenerating ? "生成中..." : "开始生成CSV"}
            </Button>
          </Form.Item>

          {/* 进度条 */}
          {(isGenerating || progress > 0) && (
            <Form.Item style={{ marginBottom: '24px' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography.Text strong>进度状态: {progressText}</Typography.Text>
                  <Typography.Text>{progress}%</Typography.Text>
                </div>
                <Progress 
                  percent={progress} 
                  status={progress === 100 ? 'success' : progress === 0 && progressText === '错误' ? 'exception' : 'active'}
                  strokeColor={progress === 100 ? '#52c41a' : undefined}
                />
                <Typography.Text type="secondary">{statusText}</Typography.Text>
              </Space>
            </Form.Item>
          )}
        </Form>
      </Card>

      {/* 生成日志卡片 */}
      <Card 
        title={
          <Space>
            <FileTextOutlined />
            生成日志
          </Space>
        }
      >
        <div 
          ref={logAreaRef}
          style={{
            height: '300px',
            overflow: 'auto',
            backgroundColor: '#f5f5f5',
            padding: '12px',
            borderRadius: '6px',
            fontFamily: 'monospace',
            fontSize: '13px',
            lineHeight: '1.4',
            marginBottom: '16px',
            border: '1px solid #d9d9d9'
          }}
        >
          {logs.map((log, index) => (
            <div key={index} style={{ marginBottom: '2px' }}>
              {log}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default App;
