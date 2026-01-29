//! CSR生成器模块
//! 实现密钥对生成、CSR创建和CSV导出功能

use anyhow::{anyhow, Result};
use csv::Writer;
use openssl::ec::{EcGroup, EcKey};
use openssl::hash::MessageDigest;
use openssl::nid::Nid;
use openssl::pkey::PKey;
use openssl::rsa::Rsa;
use openssl::x509::{X509NameBuilder, X509ReqBuilder};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs::File;

/// 生成参数结构体
#[derive(Debug, Deserialize)]
pub struct GenerateParams {
    /// 通用名称范围，格式如: YDL0001-YDL0010
    pub cn_range: String,
    /// Subject主题模板，使用{CN}作为占位符
    pub subject_template: String,
    /// 密钥类型: RSA_2048, RSA_3072, RSA_4096, EC_P256, EC_P384, EC_P521
    pub key_type: String,
    /// 签名哈希算法: SHA256, SHA384, SHA512, SHA1, MatchIssuer
    pub sign_hash_alg: String,
    /// 有效期开始时间 (ISO8601格式)
    pub not_before: String,
    /// 有效期结束时间 (ISO8601格式)
    pub not_after: String,
    /// 唯一ID (可选)
    pub unique_id: String,
    /// 备用名称 (可选)
    pub sans: String,
    /// 输出文件路径
    pub output_path: String,
}

/// 生成结果结构体
#[derive(Debug, Serialize)]
pub struct GenerateResult {
    /// 是否成功
    pub success: bool,
    /// 消息
    pub message: String,
    /// 生成的CSR总数
    pub total: usize,
    /// 输出文件路径
    pub output_path: String,
}

/// CSR生成结果
#[allow(dead_code)]
struct CsrResult {
    /// 通用名称
    cn: String,
    /// 完整Subject
    subject: String,
    /// 签名哈希算法
    sign_hash_alg: String,
    /// 有效期开始
    not_before: String,
    /// 有效期结束
    not_after: String,
    /// 唯一ID
    unique_id: String,
    /// 备用名称
    sans: String,
    /// CSR PEM格式
    csr_pem: String,
    /// 密钥类型
    key_pair_type: String,
    /// 私钥PEM格式
    private_key_pem: String,
}

/// 密钥类型枚举
#[derive(Debug, Clone, Copy)]
enum KeyType {
    Rsa2048,
    Rsa3072,
    Rsa4096,
    EcP256,
    EcP384,
    EcP521,
}

impl KeyType {
    /// 从字符串解析密钥类型
    fn from_str(s: &str) -> Result<Self> {
        match s {
            "RSA_2048" => Ok(KeyType::Rsa2048),
            "RSA_3072" => Ok(KeyType::Rsa3072),
            "RSA_4096" => Ok(KeyType::Rsa4096),
            "EC_P256" => Ok(KeyType::EcP256),
            "EC_P384" => Ok(KeyType::EcP384),
            "EC_P521" => Ok(KeyType::EcP521),
            _ => Err(anyhow!("不支持的密钥类型: {}", s)),
        }
    }

    /// 获取显示名称
    fn display_name(&self) -> &'static str {
        match self {
            KeyType::Rsa2048 => "RSA_2048",
            KeyType::Rsa3072 => "RSA_3072",
            KeyType::Rsa4096 => "RSA_4096",
            KeyType::EcP256 => "EC_P-256",
            KeyType::EcP384 => "EC_P-384",
            KeyType::EcP521 => "EC_P-521",
        }
    }

    /// 获取RSA密钥大小
    fn rsa_bits(&self) -> usize {
        match self {
            KeyType::Rsa2048 => 2048,
            KeyType::Rsa3072 => 3072,
            KeyType::Rsa4096 => 4096,
            _ => 0,
        }
    }
}

/// 解析通用名称范围
/// 支持格式: PREFIX0001-PREFIX0010
fn parse_cn_range(range: &str) -> Result<Vec<String>> {
    let re = Regex::new(r"^([A-Za-z]+)(\d+)-([A-Za-z]+)(\d+)$")?;

    let caps = re
        .captures(range)
        .ok_or_else(|| anyhow!("无法解析通用名称范围，正确格式示例: YDL0001-YDL0010"))?;

    let prefix1 = caps.get(1).unwrap().as_str();
    let num_str1 = caps.get(2).unwrap().as_str();
    let _prefix2 = caps.get(3).unwrap().as_str();
    let num_str2 = caps.get(4).unwrap().as_str();

    let start: u32 = num_str1.parse()?;
    let end: u32 = num_str2.parse()?;
    let num_length = num_str1.len();

    let (start, end) = if start > end {
        (end, start)
    } else {
        (start, end)
    };

    let mut result = Vec::new();
    for i in start..=end {
        let cn = format!("{}{:0width$}", prefix1, i, width = num_length);
        result.push(cn);
    }

    Ok(result)
}

/// 生成CSR和私钥 (使用OpenSSL)
fn generate_csr(cn: &str, key_type: KeyType, sign_hash_alg: &str) -> Result<(String, String)> {
    // 获取签名哈希算法
    let digest = match sign_hash_alg {
        "SHA384" => MessageDigest::sha384(),
        "SHA512" => MessageDigest::sha512(),
        "SHA1" => MessageDigest::sha1(),
        _ => MessageDigest::sha256(),
    };

    // 根据密钥类型生成密钥对
    let pkey = match key_type {
        KeyType::Rsa2048 => {
            let rsa = Rsa::generate(2048)?;
            PKey::from_rsa(rsa)?
        }
        KeyType::Rsa3072 => {
            let rsa = Rsa::generate(3072)?;
            PKey::from_rsa(rsa)?
        }
        KeyType::Rsa4096 => {
            let rsa = Rsa::generate(4096)?;
            PKey::from_rsa(rsa)?
        }
        KeyType::EcP256 => {
            let group = EcGroup::from_curve_name(Nid::X9_62_PRIME256V1)?;
            let ec_key = EcKey::generate(&group)?;
            PKey::from_ec_key(ec_key)?
        }
        KeyType::EcP384 => {
            let group = EcGroup::from_curve_name(Nid::SECP384R1)?;
            let ec_key = EcKey::generate(&group)?;
            PKey::from_ec_key(ec_key)?
        }
        KeyType::EcP521 => {
            let group = EcGroup::from_curve_name(Nid::SECP521R1)?;
            let ec_key = EcKey::generate(&group)?;
            PKey::from_ec_key(ec_key)?
        }
    };

    // 构建X509名称 (只使用CN)
    let mut name_builder = X509NameBuilder::new()?;
    name_builder.append_entry_by_text("CN", cn)?;
    let name = name_builder.build();

    // 创建CSR请求
    let mut req_builder = X509ReqBuilder::new()?;
    req_builder.set_subject_name(&name)?;
    req_builder.set_pubkey(&pkey)?;
    req_builder.sign(&pkey, digest)?;
    let req = req_builder.build();

    // 转换为PEM格式
    let csr_pem = String::from_utf8(req.to_pem()?)?;
    let private_key_pem = String::from_utf8(pkey.private_key_to_pem_pkcs8()?)?;

    Ok((csr_pem, private_key_pem))
}

/// 将结果写入CSV文件
fn write_to_csv(results: &[CsrResult], output_path: &str) -> Result<()> {
    let file = File::create(output_path)?;
    let mut writer = Writer::from_writer(file);

    // 检查是否有uniqueId和sans数据
    let has_unique_id = results.iter().any(|r| !r.unique_id.is_empty());
    let has_sans = results.iter().any(|r| !r.sans.is_empty());

    // 写入表头
    let mut headers = vec![
        "subject",
        "signHashAlg",
        "notBefore",
        "notAfter",
    ];
    if has_unique_id {
        headers.push("uniqueId");
    }
    if has_sans {
        headers.push("sans");
    }
    headers.push("csr");
    headers.push("keyPairType");
    headers.push("privateKey");

    writer.write_record(&headers)?;

    // 写入数据
    for result in results {
        let mut record = vec![
            result.subject.clone(),
            result.sign_hash_alg.clone(),
            result.not_before.clone(),
            result.not_after.clone(),
        ];
        if has_unique_id {
            record.push(result.unique_id.clone());
        }
        if has_sans {
            record.push(result.sans.clone());
        }
        record.push(result.csr_pem.clone());
        record.push(result.key_pair_type.clone());
        record.push(result.private_key_pem.clone());

        writer.write_record(&record)?;
    }

    writer.flush()?;
    Ok(())
}

/// 批量生成CSR的内部实现
pub fn generate_csr_batch_internal(params: GenerateParams) -> Result<GenerateResult> {
    // 解析密钥类型
    let key_type = KeyType::from_str(&params.key_type)?;

    // 解析通用名称范围
    let cn_list = parse_cn_range(&params.cn_range)?;
    if cn_list.is_empty() {
        return Err(anyhow!("无法解析通用名称范围"));
    }

    // 处理签名哈希算法
    let sign_hash_alg = if params.sign_hash_alg == "MatchIssuer" {
        "SHA256"
    } else {
        &params.sign_hash_alg
    };

    let mut results = Vec::new();

    // 批量生成CSR
    for cn in &cn_list {
        // 构建Subject字符串（替换{CN}占位符）
        let subject_str = params.subject_template.replace("{CN}", cn);

        // 生成密钥对和CSR
        let (csr_pem, private_key_pem) = generate_csr(cn, key_type, sign_hash_alg)?;

        results.push(CsrResult {
            cn: cn.clone(),
            subject: subject_str,
            sign_hash_alg: params.sign_hash_alg.clone(),
            not_before: params.not_before.clone(),
            not_after: params.not_after.clone(),
            unique_id: params.unique_id.clone(),
            sans: params.sans.clone(),
            csr_pem,
            key_pair_type: key_type.display_name().to_string(),
            private_key_pem,
        });
    }

    // 写入CSV文件
    write_to_csv(&results, &params.output_path)?;

    Ok(GenerateResult {
        success: true,
        message: format!("成功生成 {} 个CSR", results.len()),
        total: results.len(),
        output_path: params.output_path,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_cn_range() {
        let result = parse_cn_range("YDL0001-YDL0010").unwrap();
        assert_eq!(result.len(), 10);
        assert_eq!(result[0], "YDL0001");
        assert_eq!(result[9], "YDL0010");
    }

    #[test]
    fn test_key_type_from_str() {
        assert!(KeyType::from_str("RSA_2048").is_ok());
        assert!(KeyType::from_str("EC_P256").is_ok());
        assert!(KeyType::from_str("INVALID").is_err());
    }
}
