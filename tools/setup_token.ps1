# 首次配置 ngrok authtoken：掩码读取 → 写入项目根 .ngrok_token（已被 .gitignore 忽略）
# 安全说明：token 通过 Read-Host -AsSecureString 掩码采集，不回显、不打印明文、不经任何日志。
# 注意：本文件必须保存为「带 BOM 的 UTF-8」，否则 Windows PowerShell 5.1 会按 GBK 读取导致中文注释破坏语法。
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tokenFile = Join-Path $root '.ngrok_token'

Write-Host ''
Write-Host '  获取方式：登录 https://dashboard.ngrok.com/get-started/your-authtoken' -ForegroundColor DarkGray
Write-Host '  复制后回到这里，右键粘贴，再按回车。' -ForegroundColor DarkGray
Write-Host ''

# 掩码读取一行（不区分控制台 host 是否支持 Read-Host -AsSecureString）
try {
    $sec = Read-Host '  请粘贴 authtoken（输入不回显）' -AsSecureString
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    $token = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr).Trim()
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
} catch {
    # 某些宿主（如 VSCode 集成终端）不支持 -AsSecureString，退回普通读取
    $token = (Read-Host '  请粘贴 authtoken').Trim()
}

if ([string]::IsNullOrWhiteSpace($token) -or $token.Length -lt 10) {
    Write-Host '  [取消] 输入为空或过短，未保存。' -ForegroundColor Yellow
    exit 1
}

# 只保留纯 token 文本（防粘贴带引号/空格）
$token = $token.Trim('"', "'").Trim()
Set-Content -LiteralPath $tokenFile -Value $token -Encoding ascii -NoNewline
Write-Host ''
Write-Host ("  [OK] 已保存到 .ngrok_token（长度 {0}，不回显内容）。" -f $token.Length) -ForegroundColor Green
Write-Host '  该文件已在 .gitignore 中，不会被提交或分享。' -ForegroundColor DarkGray
exit 0
