#!/bin/bash
cd "$(dirname "$0")"
ENV_FILE=".env_key"
[ -f "$ENV_FILE" ] && source "$ENV_FILE"

get_pid() {
    lsof -ti:8000 2>/dev/null || fuser 8000/tcp 2>/dev/null | awk '{print $1}'
}

open_browser() {
    if command -v wslview >/dev/null 2>&1; then
        wslview "http://localhost:8000" >/dev/null 2>&1 &
    elif command -v explorer.exe >/dev/null 2>&1; then
        explorer.exe "http://localhost:8000" >/dev/null 2>&1 &
    fi
}

while true; do
    clear
    PID=$(get_pid)
    echo "========================================================"
    echo "       PDF Vectorizer 로컬 서버 매니저 (Port: 8000)      "
    echo "========================================================"
    if [ -n "$PID" ]; then
        echo -e " 현재 서버 상태 : \033[1;32m● 실행 중 (PID: $PID)\033[0m"
    else
        echo -e " 현재 서버 상태 : \033[1;31m○ 정지됨\033[0m"
    fi

    if [ -n "$GEMINI_API_KEY" ]; then
        echo -e " API 키 상태    : \033[1;32m설정됨 (${GEMINI_API_KEY:0:8}...)\033[0m"
    else
        echo -e " API 키 상태    : \033[1;33m미설정 (4번을 눌러 등록하세요)\033[0m"
    fi
    echo "========================================================"
    echo "  [1] 서버 시작 및 웹 브라우저 자동 열기 (재시작 포함)"
    echo "  [2] 서버 즉시 강제 종료 (대기 시간 0초)"
    echo "  [3] 웹 브라우저만 다시 열기 (http://localhost:8000)"
    echo "  [4] Gemini API 키 등록 / 변경 (영구 저장)"
    echo "  [0] 매니저 나가기"
    echo "========================================================"
    read -p " 원하는 작업 번호를 입력하세요: " choice

    case $choice in
        1)
            if [ -z "$GEMINI_API_KEY" ]; then
                read -p " GEMINI_API_KEY가 없습니다. 여기에 붙여넣으세요: " input_key
                export GEMINI_API_KEY="$input_key"
                echo "export GEMINI_API_KEY=\"$input_key\"" > "$ENV_FILE"
            fi
            echo " 기존 포트 정리 및 서버 구동 중..."
            fuser -k -9 8000/tcp >/dev/null 2>&1
            source venv/bin/activate
            nohup uvicorn app:app --host 0.0.0.0 --port 8000 --timeout-graceful-shutdown 1 > server.log 2>&1 &
            sleep 1.5
            open_browser
            ;;
        2)
            echo " 서버 프로세스를 즉시 종료합니다..."
            fuser -k -9 8000/tcp >/dev/null 2>&1
            sleep 0.5
            ;;
        3)
            open_browser
            ;;
        4)
            read -p " 새로운 GEMINI_API_KEY를 입력하세요: " input_key
            export GEMINI_API_KEY="$input_key"
            echo "export GEMINI_API_KEY=\"$input_key\"" > "$ENV_FILE"
            ;;
        0)
            echo " 매니저를 종료합니다."
            exit 0
            ;;
        *)
            ;;
    esac
done
