@echo off
chcp 65001 > nul
title 守望影神图集案器 - 启动器

:: 切换到批处理文件所在目录
cd /d "%~dp0"

echo 正在启动 守望影神图集案器...
echo 请勿关闭此窗口
echo.

:: 启动默认浏览器 (假设Web应用运行在http://127.0.0.1:5000)
start "" http://127.0.0.1:5000

:: 使用便携版Python运行app.py
.\python-portable\python.exe app.py