import os
import io
import re
import uuid
import json
import time
import shutil
import asyncio
from pathlib import Path
from PIL import Image
import fitz  # PyMuPDF
import google.generativeai as genai
from google.api_core import exceptions as google_exceptions
from pydantic import BaseModel
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.responses import HTMLResponse, FileResponse, StreamingResponse
from playwright.async_api import async_playwright

ENV_KEY_FILE = Path(".env_key")
if not os.getenv("GEMINI_API_KEY") and ENV_KEY_FILE.exists():
    try:
        content = ENV_KEY_FILE.read_text(encoding="utf-8").strip()
        m = re.search(r'(?:export\s+)?GEMINI_API_KEY=["\']?([^"\'\r\n]+)["\']?', content)
        if m:
            os.environ["GEMINI_API_KEY"] = m.group(1).strip()
        elif content and not content.startswith("#"):
            os.environ["GEMINI_API_KEY"] = content
    except Exception:
        pass

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
if GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
    except Exception:
        pass

app = FastAPI(title="Scanned PDF to Vector PDF Converter")

WORKSPACE = Path("./temp_workspace")
WORKSPACE.mkdir(exist_ok=True)

JOBS = {}

# 동시 병렬 API 호출 수 (4개 페이지 동시 처리)
CONCURRENCY_LIMIT = 4
# 병렬 처리 기준 페이지당 평균 예상 시간 (초)
ESTIMATED_SEC_PER_PAGE = 3.5

SYSTEM_PROMPT = """당신은 문서 구조 복원 및 OCR 전문가입니다.
제공된 스캔 문서 이미지를 분석하여 완벽한 구조의 Markdown 텍스트로 변환하세요.

[변환 규칙]
1. 본문 텍스트: 오탈자 없이 원본의 문단 구조, 제목 계층(#, ##, ###), 리스트를 정확히 보존하세요.
2. 표(Table): 이미지 내의 모든 표는 표준 Markdown Table 문법으로 정확히 변환하세요.
3. 다이어그램/순서도/차트: 이미지 내에 플로우차트, 아키텍처 다이어그램, 마인드맵 등이 있다면 반드시 ```mermaid 코드 블록을 사용하여 Mermaid.js 문법으로 시각화하세요.
4. 수식: 수식이 포함된 경우 표준 텍스트나 유니코드 기호로 읽기 쉽게 정리하세요.
5. 출력 형식: 인사말이나 부연 설명, 전체를 감싸는 ```markdown 코드 펜스 없이 오직 순수 Markdown 본문 내용만 출력하세요."""


def strip_outer_markdown_fence(text: str) -> str:
    text = text.strip()
    pattern = r"^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$"
    match = re.match(pattern, text)
    if match:
        return match.group(1).strip()
    return text


def render_page_to_jpeg_bytes(pdf_path: Path, page_idx: int, dpi: int = 180) -> bytes:
    """PyMuPDF로 페이지를 렌더링하고 네트워크 전송 속도를 극대화하기 위해 JPEG 바이트로 즉시 압축"""
    with fitz.open(pdf_path) as doc:
        page = doc.load_page(page_idx)
        pix = page.get_pixmap(dpi=dpi, alpha=False)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85, optimize=True)
        return buf.getvalue()


def build_html_document(markdown_content: str) -> str:
    escaped_md = json.dumps(markdown_content)
    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <style>
        @page {{ size: A4; margin: 18mm 15mm; }}
        body {{
            font-family: 'Noto Sans CJK KR', 'Malgun Gothic', -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 10.5pt;
            line-height: 1.65;
            color: #111827;
            margin: 0;
            padding: 0;
        }}
        h1, h2, h3, h4 {{ color: #0f172a; margin-top: 1.4em; margin-bottom: 0.6em; page-break-after: avoid; }}
        h1 {{ font-size: 18pt; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 6px; }}
        h2 {{ font-size: 14pt; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }}
        h3 {{ font-size: 12pt; }}
        p, li {{ orphans: 3; widows: 3; }}
        table {{ width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 9.5pt; page-break-inside: avoid; }}
        th, td {{ border: 1px solid #94a3b8; padding: 7px 10px; text-align: left; vertical-align: top; }}
        th {{ background-color: #f1f5f9; font-weight: 700; }}
        tr:nth-child(even) td {{ background-color: #f8fafc; }}
        pre {{ background: #f1f5f9; padding: 10px; border-radius: 6px; overflow-x: auto; font-size: 9pt; page-break-inside: avoid; }}
        blockquote {{ border-left: 4px solid #64748b; margin: 10px 0; padding: 4px 12px; color: #334155; background: #f8fafc; }}
        .mermaid {{ display: flex; justify-content: center; margin: 18px 0; page-break-inside: avoid; }}
        .page-divider {{ page-break-before: always; height: 0; margin: 0; border: none; }}
    </style>
</head>
<body>
    <div id="content"></div>
    <script>
        window.renderComplete = false;
        const rawMarkdown = {escaped_md};

        async function renderDocument() {{
            try {{
                mermaid.initialize({{ startOnLoad: false, theme: 'default', securityLevel: 'loose' }});
                const renderer = new marked.Renderer();
                const defaultCodeRenderer = renderer.code.bind(renderer);

                renderer.code = function(code, infostring, escaped) {{
                    let codeText = typeof code === 'object' ? code.text : code;
                    let lang = typeof code === 'object' ? code.lang : infostring;
                    if (lang === 'mermaid') {{
                        return `<div class="mermaid">${{codeText}}</div>`;
                    }}
                    return defaultCodeRenderer(code, infostring, escaped);
                }};

                marked.setOptions({{ renderer: renderer, gfm: true, breaks: true }});
                document.getElementById('content').innerHTML = marked.parse(rawMarkdown);

                const mermaidNodes = document.querySelectorAll('.mermaid');
                if (mermaidNodes.length > 0) {{
                    await mermaid.run({{ nodes: mermaidNodes }});
                }}
            }} catch (err) {{
                console.error("Rendering error:", err);
            }} finally {{
                window.renderComplete = true;
            }}
        }}
        window.addEventListener('DOMContentLoaded', renderDocument);
    </script>
</body>
</html>"""


async def extract_markdown_with_retry(model, jpeg_bytes: bytes, page_num: int, max_retries: int = 4) -> str:
    base_delay = 2
    image_blob = {"mime_type": "image/jpeg", "data": jpeg_bytes}
    for attempt in range(1, max_retries + 1):
        try:
            response = await asyncio.to_thread(
                model.generate_content,
                [SYSTEM_PROMPT, image_blob],
                generation_config={"temperature": 0.1}
            )
            if response and response.text:
                return strip_outer_markdown_fence(response.text)
            return f"<!-- {page_num}페이지: 추출된 텍스트 없음 -->"
        except google_exceptions.ResourceExhausted:
            wait_time = base_delay * (2 ** (attempt - 1))
            if attempt == max_retries:
                raise RuntimeError(f"{page_num}페이지 Rate Limit 초과 (최대 재시도 실패)")
            await asyncio.sleep(wait_time)
        except Exception as e:
            if attempt == max_retries:
                raise RuntimeError(f"{page_num}페이지 Gemini API 오류: {str(e)}")
            await asyncio.sleep(base_delay)


@app.get("/", response_class=HTMLResponse)
async def serve_ui():
    return Path("index.html").read_text(encoding="utf-8")


class ApiKeyConfig(BaseModel):
    api_key: str


@app.post("/api/config/apikey")
async def update_api_key(config: ApiKeyConfig):
    api_key = config.api_key.strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="유효한 API 키를 입력하세요.")

    os.environ["GEMINI_API_KEY"] = api_key
    try:
        genai.configure(api_key=api_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini API 설정 실패: {str(e)}")

    try:
        ENV_KEY_FILE.write_text(f'export GEMINI_API_KEY="{api_key}"\n', encoding="utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f".env_key 파일 저장 실패: {str(e)}")

    return {"status": "success", "message": "API 키가 성공적으로 설정 및 저장되었습니다."}


@app.get("/api/models")
async def get_available_models():
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return {"models": []}
    try:
        genai.configure(api_key=api_key)
        models = []
        for m in genai.list_models():
            if "generateContent" in m.supported_generation_methods:
                name = m.name.replace("models/", "")
                models.append(name)
        models.sort(reverse=True)
        return {"models": models}
    except Exception as e:
        return {"models": [], "error": str(e)}


@app.post("/api/analyze")
async def analyze_pdf(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드 가능합니다.")

    job_id = str(uuid.uuid4())
    job_dir = WORKSPACE / job_id
    cache_dir = job_dir / "pages_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)

    input_pdf_path = job_dir / "input.pdf"
    with input_pdf_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    file_size_bytes = input_pdf_path.stat().st_size
    file_size_mb = round(file_size_bytes / (1024 * 1024), 2)

    try:
        doc = fitz.open(input_pdf_path)
        page_count = len(doc)
        first_page_rect = doc[0].rect if page_count > 0 else None
        dimensions = f"{int(first_page_rect.width)} x {int(first_page_rect.height)} pt" if first_page_rect else "N/A"
        doc.close()
    except Exception as e:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail=f"유효하지 않거나 손상된 PDF입니다: {str(e)}")

    if page_count == 0:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="페이지가 없는 빈 PDF 파일입니다.")

    # 병렬 처리를 반영한 현실적인 예상 시간 산출
    estimated_seconds = int((page_count * ESTIMATED_SEC_PER_PAGE) + 4)

    JOBS[job_id] = {
        "job_id": job_id,
        "original_name": Path(file.filename).stem,
        "input_path": input_pdf_path,
        "cache_dir": cache_dir,
        "output_path": job_dir / "output_vector.pdf",
        "page_count": page_count,
        "file_size_mb": file_size_mb,
        "status": "analyzed"
    }

    return {
        "job_id": job_id,
        "filename": file.filename,
        "file_size_mb": file_size_mb,
        "page_count": page_count,
        "dimensions": dimensions,
        "estimated_seconds": estimated_seconds
    }


@app.get("/api/process/{job_id}")
async def process_pdf_stream(
    job_id: str,
    model_name: str = Query("gemini-3.5-flash-lite"),
    concurrency: int = Query(4, ge=1, le=16)
):
    if job_id not in JOBS:
        raise HTTPException(status_code=404, detail="유효하지 않은 작업 ID입니다.")

    job = JOBS[job_id]

    async def event_generator():
        def sse_pack(payload: dict) -> str:
            return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

        try:
            api_key = os.getenv("GEMINI_API_KEY", "")
            if not api_key:
                raise RuntimeError("GEMINI_API_KEY 환경변수가 설정되지 않았습니다. 런처에서 API 키를 확인하세요.")
            genai.configure(api_key=api_key)

            total_pages = job["page_count"]
            model = genai.GenerativeModel(model_name)
            extracted_pages = [None] * total_pages
            semaphore = asyncio.Semaphore(concurrency)
            queue = asyncio.Queue()
            start_time = time.time()
            completed_count = 0
            page_durations = []

            model_base_map = {
                "gemini-3.5-flash-lite": 4.0,
                "gemini-3.8-flash": 5.5
            }
            base_sec = model_base_map.get(model_name, 7.0)
            initial_batch_count = (total_pages + concurrency - 1) // concurrency
            initial_eta = int((initial_batch_count * base_sec) + (total_pages * 0.4) + 4)

            yield sse_pack({
                "status": "processing",
                "progress": 3,
                "eta_seconds": initial_eta,
                "message": f"총 {total_pages}페이지 [{concurrency}개 동시 병렬 + 180 DPI JPEG 압축] 파이프라인 가동..."
            })

            async def worker(idx: int):
                page_num = idx + 1
                cache_file = job["cache_dir"] / f"page_{page_num:04d}.md"

                # 인터넷 끊김 후 재시도 시 이미 완료된 페이지는 디스크 캐시에서 즉시 로드
                if cache_file.exists():
                    md_text = cache_file.read_text(encoding="utf-8")
                    extracted_pages[idx] = md_text
                    await queue.put({"type": "done", "page": page_num, "chars": len(md_text), "cached": True})
                    return

                async with semaphore:
                    await queue.put({"type": "start", "page": page_num})
                    t0 = time.time()
                    jpeg_bytes = await asyncio.to_thread(render_page_to_jpeg_bytes, job["input_path"], idx, 180)
                    md_text = await extract_markdown_with_retry(model, jpeg_bytes, page_num)
                    
                    # 추출 즉시 로컬 디스크에 캐싱 (네트워크 단절 시 데이터 보존)
                    cache_file.write_text(md_text, encoding="utf-8")
                    extracted_pages[idx] = md_text
                    elapsed_page = round(time.time() - t0, 1)
                    await queue.put({
                        "type": "done",
                        "page": page_num,
                        "chars": len(md_text),
                        "sec": elapsed_page,
                        "cached": False
                    })

            tasks = [asyncio.create_task(worker(i)) for i in range(total_pages)]

            while completed_count < total_pages:
                done_tasks = [t for t in tasks if t.done() and t.exception() is not None]
                if done_tasks:
                    for t in tasks:
                        t.cancel()
                    raise done_tasks[0].exception()

                try:
                    event = await asyncio.wait_for(queue.get(), timeout=0.5)
                except asyncio.TimeoutError:
                    continue

                if event["type"] == "start":
                    yield sse_pack({
                        "status": "processing",
                        "progress": int((completed_count / total_pages) * 85) + 3,
                        "message": f"[{event['page']}/{total_pages} 페이지] JPEG 압축 및 {model_name} 병렬 요청 전송..."
                    })
                elif event["type"] == "done":
                    completed_count += 1
                    if not event.get("cached", False) and "sec" in event:
                        page_durations.append(event["sec"])

                    remaining_pages = total_pages - completed_count
                    if page_durations:
                        avg_single_page_sec = sum(page_durations) / len(page_durations)
                    else:
                        avg_single_page_sec = base_sec

                    # (남은 페이지 수 / concurrency) * 단일 페이지 평균 처리 시간
                    if remaining_pages > 0:
                        eta_sec = int((remaining_pages / concurrency) * avg_single_page_sec) + 4
                    else:
                        eta_sec = 3

                    progress_pct = int((completed_count / total_pages) * 85) + 5
                    tag = "(캐시 복원)" if event["cached"] else f"({event['sec']}초 소요)"
                    yield sse_pack({
                        "status": "processing",
                        "progress": progress_pct,
                        "eta_seconds": eta_sec,
                        "message": f"✔ [{event['page']}/{total_pages} 페이지] 완료 {tag} - {event['chars']:,}자 추출 (진행: {completed_count}/{total_pages})"
                    })

            await asyncio.gather(*tasks)

            combined_md = "\n\n<hr class='page-divider'>\n\n".join(extracted_pages)
            html_content = build_html_document(combined_md)
            html_path = WORKSPACE / job_id / "rendered.html"
            html_path.write_text(html_content, encoding="utf-8")

            yield sse_pack({
                "status": "processing",
                "progress": 92,
                "eta_seconds": 3,
                "message": "Playwright 헤드리스 브라우저 기동 및 벡터 PDF 렌더링 중..."
            })

            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context_page = await browser.new_page()
                await context_page.goto(f"file://{html_path.resolve()}", wait_until="networkidle")
                await context_page.wait_for_function("window.renderComplete === true", timeout=30000)
                await context_page.pdf(
                    path=str(job["output_path"]),
                    format="A4",
                    print_background=True,
                    margin={"top": "18mm", "bottom": "18mm", "left": "15mm", "right": "15mm"}
                )
                await browser.close()

            total_elapsed = round(time.time() - start_time, 1)
            out_size_kb = round(job["output_path"].stat().st_size / 1024, 1)
            job["status"] = "completed"

            yield sse_pack({
                "status": "completed",
                "progress": 100,
                "eta_seconds": 0,
                "message": f"벡터 PDF 생성 완료! (총 {total_elapsed}초 소요 / 용량: {out_size_kb} KB) 자동 다운로드합니다.",
                "download_url": f"/api/download/{job_id}"
            })

        except Exception as e:
            job["status"] = "error"
            yield sse_pack({
                "status": "error",
                "progress": 0,
                "message": f"파이프라인 중단됨: {str(e)} (재시작 버튼을 누르면 완료된 페이지부터 이어서 진행합니다)"
            })

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/api/download/{job_id}")
async def download_result(job_id: str):
    if job_id not in JOBS:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")

    job = JOBS[job_id]
    output_path = job["output_path"]
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="생성된 PDF 파일이 존재하지 않습니다.")

    download_filename = f"{job['original_name']}_vectorized.pdf"
    return FileResponse(path=output_path, media_type="application/pdf", filename=download_filename)


@app.post("/api/server/shutdown")
async def shutdown_server():
    asyncio.get_event_loop().call_later(0.1, lambda: os._exit(0))
    return {"status": "shutting_down"}
