import os
import sys
import re
import time
import socket
import shutil
import threading
import subprocess
import webbrowser
import json
import urllib.request
from pathlib import Path
import tkinter as tk
from tkinter import messagebox

BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env_key"

server_process = None


def is_wsl_environment() -> bool:
    if "WSL_DISTRO_NAME" in os.environ:
        return True
    if os.path.exists("/proc/version"):
        try:
            with open("/proc/version", "r", encoding="utf-8") as f:
                if "microsoft" in f.read().lower():
                    return True
        except Exception:
            pass
    return False


def open_web_browser(url: str = "http://localhost:8000"):
    if is_wsl_environment():
        if shutil.which("wslview"):
            subprocess.Popen(["wslview", url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return
        elif shutil.which("explorer.exe"):
            subprocess.Popen(["explorer.exe", url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return

    if sys.platform == "win32":
        try:
            os.startfile(url)
            return
        except Exception:
            pass

    webbrowser.open(url)


def check_port_8000() -> bool:
    for target_host in ("127.0.0.1", "localhost"):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.35)
                if s.connect_ex((target_host, 8000)) == 0:
                    return True
        except Exception:
            pass
    return False


def kill_port_8000():
    if sys.platform == "win32":
        try:
            output = subprocess.check_output(
                'netstat -ano -p tcp | findstr :8000',
                shell=True, text=True, stderr=subprocess.DEVNULL
            )
            pids = set()
            for line in output.splitlines():
                parts = line.strip().split()
                if len(parts) >= 5 and ":8000" in parts[1] and parts[3] == "LISTENING":
                    pids.add(parts[4])
            for pid in pids:
                if pid and pid != "0":
                    subprocess.run(["taskkill", "/F", "/PID", pid], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass

        if shutil.which("wsl"):
            try:
                subprocess.run(["wsl", "fuser", "-k", "-9", "8000/tcp"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                pass
    else:
        try:
            subprocess.run(["fuser", "-k", "-9", "8000/tcp"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
        try:
            out = subprocess.check_output("lsof -ti:8000", shell=True, text=True, stderr=subprocess.DEVNULL).strip()
            if out:
                for pid in out.splitlines():
                    subprocess.run(f"kill -9 {pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass


def load_api_key_from_env() -> str:
    if not ENV_FILE.exists():
        return os.environ.get("GEMINI_API_KEY", "")
    try:
        content = ENV_FILE.read_text(encoding="utf-8").strip()
        m = re.search(r'(?:export\s+)?GEMINI_API_KEY=["\']?([^"\'\r\n]+)["\']?', content)
        if m:
            return m.group(1).strip()
        if content and not content.startswith("#"):
            return content
    except Exception:
        pass
    return os.environ.get("GEMINI_API_KEY", "")


def save_api_key_to_file(key: str):
    key = key.strip()
    os.environ["GEMINI_API_KEY"] = key
    try:
        ENV_FILE.write_text(f'export GEMINI_API_KEY="{key}"\n', encoding="utf-8")
    except Exception:
        pass

    if check_port_8000():
        def _post_key():
            try:
                req = urllib.request.Request(
                    "http://127.0.0.1:8000/api/config/apikey",
                    data=json.dumps({"api_key": key}).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=1.0) as _:
                    pass
            except Exception:
                pass
        threading.Thread(target=_post_key, daemon=True).start()


def get_log_tail(lines: int = 15) -> str:
    log_path = BASE_DIR / "server.log"
    if not log_path.exists():
        return "server.log 파일이 아직 생성되지 않았습니다."
    try:
        content = log_path.read_text(encoding="utf-8", errors="replace").strip().splitlines()
        tail = content[-lines:] if len(content) > lines else content
        return "\n".join(tail)
    except Exception as e:
        return f"로그 파일 확인 실패: {str(e)}"


def build_server_command(key: str):
    win_python = BASE_DIR / "venv" / "Scripts" / "python.exe"

    if sys.platform == "win32":
        # 1. Windows 네이티브 가상환경이 존재하는 경우
        if win_python.exists():
            return [str(win_python), "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "1"]

        # 2. WSL 환경 실행: --cd 로 작업 디렉토리를 프로젝트 폴더로 정확히 지정
        if shutil.which("wsl"):
            return ["wsl", "--cd", str(BASE_DIR), "bash", "run_server.sh", key]

        # 3. 폴백: 시스템 파이썬
        return [sys.executable, "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "1"]

    else:
        # Linux 또는 WSL 네이티브 환경
        return ["bash", "run_server.sh", key]


class DarkLauncherApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("PDF Vectorizer Manager")
        self.root.geometry("380x280")
        self.root.resizable(False, False)
        self.root.configure(bg="#111827")

        self.is_starting = False

        self.setup_ui()
        self.setup_events()

        self.root.after(100, self.update_port_status)

    def setup_ui(self):
        container = tk.Frame(self.root, bg="#111827", padx=16, pady=12)
        container.pack(fill=tk.BOTH, expand=True)

        # 1. 상단 실시간 서버 상태 인디케이터
        self.status_frame = tk.Frame(container, bg="#1F2937", bd=0, padx=10, pady=8)
        self.status_frame.pack(fill=tk.X, pady=(0, 10))

        self.status_label = tk.Label(
            self.status_frame,
            text="○ 서버 정지됨",
            bg="#1F2937",
            fg="#EF4444",
            font=("Malgun Gothic", 10, "bold")
        )
        self.status_label.pack(anchor="center")

        # 2. 중단 Gemini API 키 입력 영역
        key_section = tk.Frame(container, bg="#111827")
        key_section.pack(fill=tk.X, pady=(0, 12))

        key_label = tk.Label(
            key_section,
            text="Gemini API 키 (필수)",
            bg="#111827",
            fg="#9CA3AF",
            font=("Malgun Gothic", 8, "bold")
        )
        key_label.pack(anchor="w", pady=(0, 3))

        key_input_frame = tk.Frame(key_section, bg="#111827")
        key_input_frame.pack(fill=tk.X)

        self.key_entry = tk.Entry(
            key_input_frame,
            bg="#1F2937",
            fg="#F3F4F6",
            insertbackground="#60A5FA",
            relief="flat",
            highlightthickness=1,
            highlightbackground="#374151",
            highlightcolor="#3B82F6",
            font=("Consolas", 9)
        )
        self.key_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=4, padx=(0, 6))

        initial_key = load_api_key_from_env()
        if initial_key:
            self.key_entry.insert(0, initial_key)

        self.save_btn = tk.Button(
            key_input_frame,
            text="키 저장",
            bg="#374151",
            fg="#F9FAFB",
            activebackground="#4B5563",
            activeforeground="#FFFFFF",
            relief="flat",
            cursor="hand2",
            font=("Malgun Gothic", 8, "bold"),
            padx=10,
            command=self.on_save_key
        )
        self.save_btn.pack(side=tk.RIGHT, ipady=3)

        # 3. 하단 3개 버튼
        btn_section = tk.Frame(container, bg="#111827")
        btn_section.pack(fill=tk.X)

        # 버튼 1: [▶ 서버 시작]
        self.start_btn = tk.Button(
            btn_section,
            text="▶ 서버 시작",
            bg="#2563EB",
            fg="#FFFFFF",
            activebackground="#1D4ED8",
            activeforeground="#FFFFFF",
            relief="flat",
            cursor="hand2",
            font=("Malgun Gothic", 9, "bold"),
            command=self.on_start_server
        )
        self.start_btn.pack(fill=tk.X, ipady=4, pady=(0, 6))

        # 가로 분할 영역: [🌐 브라우저 열기] & [■ 서버 강제 종료]
        sub_btn_frame = tk.Frame(btn_section, bg="#111827")
        sub_btn_frame.pack(fill=tk.X)

        # 버튼 2: [🌐 브라우저 열기]
        self.browser_btn = tk.Button(
            sub_btn_frame,
            text="🌐 브라우저 열기",
            bg="#1F2937",
            fg="#9CA3AF",
            activebackground="#374151",
            activeforeground="#FFFFFF",
            relief="flat",
            cursor="hand2",
            font=("Malgun Gothic", 8, "bold"),
            command=self.on_open_browser
        )
        self.browser_btn.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=4, padx=(0, 4))

        # 버튼 3: [■ 서버 강제 종료]
        self.stop_btn = tk.Button(
            sub_btn_frame,
            text="■ 서버 강제 종료",
            bg="#DC2626",
            fg="#FFFFFF",
            activebackground="#B91C1C",
            activeforeground="#FFFFFF",
            relief="flat",
            cursor="hand2",
            font=("Malgun Gothic", 8, "bold"),
            command=self.on_stop_server
        )
        self.stop_btn.pack(side=tk.RIGHT, fill=tk.X, expand=True, ipady=4, padx=(4, 0))

    def setup_events(self):
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)

    def on_save_key(self):
        key = self.key_entry.get().strip()
        if not key:
            messagebox.showwarning("입력 필요", "저장할 Gemini API 키를 입력해주세요.")
            self.key_entry.focus_set()
            return
        save_api_key_to_file(key)
        self.save_btn.config(text="저장됨 ✔", bg="#059669")
        self.root.after(1500, lambda: self.save_btn.config(text="키 저장", bg="#374151"))

    def update_port_status(self):
        is_running = check_port_8000()
        if is_running:
            self.is_starting = False
            self.status_label.config(
                text="● 서버 실행 중 (Port: 8000)",
                fg="#10B981"
            )
            self.start_btn.config(
                state=tk.NORMAL,
                text="▶ 서버 재시작",
                bg="#2563EB"
            )
            self.browser_btn.config(
                bg="#059669",
                fg="#FFFFFF"
            )
        else:
            if not self.is_starting:
                self.status_label.config(
                    text="○ 서버 정지됨",
                    fg="#EF4444"
                )
                self.start_btn.config(
                    state=tk.NORMAL,
                    text="▶ 서버 시작",
                    bg="#2563EB"
                )
                self.browser_btn.config(
                    bg="#1F2937",
                    fg="#9CA3AF"
                )
        self.root.after(1000, self.update_port_status)

    def on_start_server(self):
        global server_process

        key = self.key_entry.get().strip()
        if not key:
            key = load_api_key_from_env()

        if not key:
            messagebox.showwarning(
                "API 키 필요",
                "Gemini API 키가 입력되지 않았습니다.\n\n상단 API 키 입력칸에 키를 입력하고 [키 저장]을 먼저 진행해주세요."
            )
            self.key_entry.focus_set()
            return

        save_api_key_to_file(key)

        # 이미 8000번 포트가 열려 있다면 즉시 인디케이터만 반영
        if check_port_8000():
            self.update_port_status()
            return

        self.is_starting = True
        self.start_btn.config(state=tk.DISABLED, text="⏳ 서버 구동 중...", bg="#4B5563")
        self.status_label.config(text="⏳ 서버 시작 중...", fg="#F59E0B")

        kill_port_8000()
        time.sleep(0.3)

        cmd = build_server_command(key)
        env = os.environ.copy()
        env["GEMINI_API_KEY"] = key

        try:
            # 새 세션 시작 마커 기록
            with open(BASE_DIR / "server.log", "a", encoding="utf-8") as f:
                f.write(f"\n===== [SERVER START AT {time.strftime('%Y-%m-%d %H:%M:%S')}] =====\n")
                f.flush()

            log_file = open(BASE_DIR / "server.log", "a", encoding="utf-8")
            if sys.platform == "win32":
                server_process = subprocess.Popen(
                    cmd,
                    cwd=str(BASE_DIR),
                    env=env,
                    stdout=log_file,
                    stderr=subprocess.STDOUT
                )
            else:
                server_process = subprocess.Popen(
                    cmd,
                    cwd=str(BASE_DIR),
                    env=env,
                    stdout=log_file,
                    stderr=subprocess.STDOUT,
                    start_new_session=True
                )
        except Exception as e:
            self.is_starting = False
            self.start_btn.config(state=tk.NORMAL, text="▶ 서버 시작", bg="#2563EB")
            self.status_label.config(text="○ 서버 시작 실패", fg="#EF4444")
            messagebox.showerror("서버 구동 오류", f"명령어 실행 중 시스템 오류가 발생했습니다:\n{str(e)}")
            return

        threading.Thread(target=self.wait_for_server_ready, daemon=True).start()

    def wait_for_server_ready(self):
        # 0.5초 간격으로 최대 24회 (12초) 동안 실제 포트 8000 오픈 여부만 확인
        for _ in range(24):
            time.sleep(0.5)
            if check_port_8000():
                self.root.after(0, self.on_start_success)
                return

        self.root.after(0, self.on_start_failed)

    def on_start_success(self):
        # 성공 시 사용자 방해 Alert 없이 실시간 인디케이터만 깔끔하게 전환
        self.is_starting = False
        self.status_label.config(text="● 서버 실행 중 (Port: 8000)", fg="#10B981")
        self.start_btn.config(state=tk.NORMAL, text="▶ 서버 재시작", bg="#2563EB")
        self.browser_btn.config(bg="#059669", fg="#FFFFFF")

    def on_start_failed(self):
        # 최종 확인: 만약 포트가 열려 있다면 성공으로 처리
        if check_port_8000():
            self.on_start_success()
            return

        self.is_starting = False
        self.status_label.config(text="○ 서버 시작 실패", fg="#EF4444")
        self.start_btn.config(state=tk.NORMAL, text="▶ 서버 시작", bg="#2563EB")
        self.browser_btn.config(bg="#1F2937", fg="#9CA3AF")

        log_tail = get_log_tail(12)
        messagebox.showerror(
            "서버 구동 실패",
            f"서버 포트(8000)가 열리지 않았습니다.\n\n[최근 서버 로그 요약]\n{log_tail}\n\nWSL 가상환경 또는 패키지 상태를 확인해주세요."
        )

    def on_open_browser(self):
        if not check_port_8000():
            messagebox.showwarning(
                "서버 미실행",
                "FastAPI 서버가 아직 실행되지 않았습니다.\n\n먼저 [▶ 서버 시작] 버튼을 눌러 서버를 구동해주세요."
            )
            return
        open_web_browser("http://localhost:8000")

    def on_stop_server(self):
        global server_process
        if server_process is not None:
            try:
                server_process.kill()
            except Exception:
                pass
            server_process = None

        kill_port_8000()
        time.sleep(0.3)

        # 종료 시에도 불필요한 Alert 팝업 없이 인디케이터만 반영
        self.is_starting = False
        self.status_label.config(text="○ 서버 정지됨", fg="#EF4444")
        self.start_btn.config(state=tk.NORMAL, text="▶ 서버 시작", bg="#2563EB")
        self.browser_btn.config(bg="#1F2937", fg="#9CA3AF")

    def on_closing(self):
        global server_process
        if server_process is not None:
            try:
                server_process.kill()
            except Exception:
                pass
            server_process = None
        kill_port_8000()
        self.root.destroy()
        sys.exit(0)


def main():
    root = tk.Tk()
    DarkLauncherApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
