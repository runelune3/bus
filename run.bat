@echo off
chcp 65001 > nul
echo ========================================================
echo   광주광역시 버스 노선도 (OpenStreetMap) 실행기
echo ========================================================
echo.
echo 웹 서버를 시작하고 기본 웹 브라우저에서 실행합니다...
echo 브라우저가 자동으로 열립니다. (포트: 8080)
echo 종료하려면 이 창에서 Ctrl + C 를 누르세요.
echo.

start "" "http://localhost:8080"
python -m http.server 8080
