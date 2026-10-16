@echo off
cd /d "%~dp0"
where py >nul 2>&1 && goto use_py
where python >nul 2>&1 && goto use_python
echo Python이 없어 온라인 사이트를 엽니다.
start "" "https://kjoo95.github.io/dom-mes-portal/"
start "" "https://kjoo95.github.io/dom-mes-portal/portal.html"
pause
exit /b 0

:use_py
start "" "http://127.0.0.1:4173/"
py -3 -m http.server 4173
exit /b 0

:use_python
start "" "http://127.0.0.1:4173/"
python -m http.server 4173
exit /b 0
