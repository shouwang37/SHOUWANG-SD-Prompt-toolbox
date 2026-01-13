@echo off
chcp 65001
echo 正在启动 守望影神图集案器...
echo 请勿关闭此窗口

:: 启动浏览器 (延迟 2 秒，确保服务器已准备好)
start "" mshta vbscript:CreateObject("WScript.Shell").Run("powershell -command ""Start-Sleep -s 2; Start-Process 'http://127.0.0.1:5000'""",0,false)(window.close)

:: 启动 Flask 应用 (使用便携版 Python)
".\python-portable\python.exe" app.py

pause
