# Legacy / Archive Files

이 디렉토리는 과거 로컬 실행 환경(Flask 백엔드, PyWebView GUI 런처, 로컬 스크립트) 및 구버전 백업 파일들을 모아둔 보관소입니다.

## 파일 구성 안내
- **`app.py`**: 과거 로컬 CORS 프록시 및 Flask 백엔드 (현재는 100% 브라우저 클라이언트 사이드로 동작하므로 미사용)
- **`gui_launcher.py`**: 과거 PyWebView 데스크톱 런처 (메모리 누수 및 브라우저 성능 이슈로 미사용)
- **`run_server.bat` / `run_server.sh` / `launcher.sh`**: 과거 로컬 백엔드/런처 구동용 셸 스크립트
- **`index.backup.html`**: HTML/CSS/JS 분리 이전의 과거 단일 파일 버전 백업
- **`.env_key`**: 과거 로컬 백엔드용 API 키 파일 (gitignore 처리됨)
- **`server.log`**: 과거 로컬 서버 실행 로그 (gitignore 처리됨)
- **`temp_workspace/`**: 과거 로컬 서버 임시 파일 디렉토리 (gitignore 처리됨)
- **`venv/`, `__pycache__/`**: 과거 로컬 파이썬 가상환경 및 캐시 (gitignore 처리됨)

> 💡 **현재 웹 배포(`main`) 및 실행에 필요한 파일은 오직 루트의 `index.html`, `style.css`, `app.js`입니다.**
