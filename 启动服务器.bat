@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title 考途 · 一键启动

REM ============================================================
REM  考途一键启动：题库服务器 + 公网隧道
REM  - 首次运行会让你粘贴一次 ngrok authtoken（只在本地控制台输入、
REM    掩码不回显、保存到 .ngrok_token 并已被 .gitignore 忽略）
REM  - 之后每次双击即全自动
REM  - 不配置 token 也能用：自动降级为「本机 + 局域网」模式
REM ============================================================

where python >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 python，请先安装 Python 3.8+ 并勾选 Add to PATH。
  echo.
  pause
  exit /b 1
)

if exist ".ngrok_token" goto :run

echo.
echo ============================================================
echo   首次使用：是否配置公网隧道？
echo ============================================================
echo   [Y] 配置 ngrok authtoken —— 手机在外网也能拉题库
echo       （token 获取：https://dashboard.ngrok.com/get-started/your-authtoken）
echo   [N] 跳过 —— 仅本机/局域网使用，稍后可再配置
echo.
choice /c YN /m "  请选择 Y 或 N"
if errorlevel 2 goto :run

echo.
echo   正在打开安全输入框，请把 authtoken 粘贴进去（输入不回显）……
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\setup_token.ps1"
if errorlevel 1 (
  echo   [提示] 未保存 token，将以本机/局域网模式启动；下次双击仍可重新配置。
)

:run
python "tools\run_all.py" 8080
echo.
echo   服务器已停止。
pause
endlocal
