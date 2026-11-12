# 📄 PDF Vectorizer 컨텍스트 가이드 (CONTEXT.md)

이 문서는 프로젝트의 **공용 기록 보관소(공유 두뇌)** 입니다. 아키텍처, 파일 역할, 핵심 함수 위치, 절대 훼손되면 안 되는 **불변 규칙**, 배포/테스트 방법, 결정 이력과 알려진 한계를 담습니다.
코드를 바꾸면 이 문서의 관련 절도 **같은 작업 안에서** 함께 고치세요. (마지막 전면 검토: 2026-11-12, 코드와 대조 완료)

---

## 0. 프로젝트 목적 (모든 판단의 기준)

> **사진/스캔으로 된 책을 인식해서, 디자인 요소는 일부 버리더라도 _내용을 완전히 보존_한 채 새 문서로 만들어 용량을 줄이고 가독성을 높인다.**

- 핵심 문제는 **① 내용이 바뀌는 것(요약·의역·누락·오탈자 "교정"), ② 텍스트 서식(제목/굵게/수식/표)이 깨져 알아보기 힘들어지는 것** 두 가지입니다. 기능 추가나 UI 개선이 이 둘과 충돌하면 항상 이 둘이 우선합니다.
- 100% 브라우저(Client-Side) 동작. 서버·빌드 없이 GitHub Pages에서 정적으로 제공됩니다.

---

## 1. 프로젝트 아키텍처 & 파일 구성

```
pdf-vectorizer/
├── index.html        # HTML 마크업 + 외부 CDN 라이브러리 링크 (스크립트/스타일은 외부 파일 연결)
├── style.css         # 다크 테마 전역 스타일, 비주얼 스킨(사이버펑크/제미나이), 정보 카드, 오로라 카드, 모달
├── app.js            # 전체 비즈니스 로직 (모델 감지·필터, 변환 파이프라인, 분할, 내보내기, 스킨 전환)
├── CONTEXT.md        # 본 문서 (프로젝트 두뇌)
└── legacy/           # (과거 로컬/레거시 파일 모음 - 웹 배포본과 무관)
    ├── app.py            # 로컬 서빙/CORS 프록시 백엔드 (구버전)
    ├── gui_launcher.py   # 로컬 GUI 런처 (구버전)
    ├── run_server.bat/.sh, launcher.sh  # 로컬 실행 보조 스크립트
    ├── index.backup.html # 단일 파일 시절(구버전) 백업
    ├── server.log, .env_key, temp_workspace/, venv/ (.gitignore 대상)
    └── README.md         # legacy 디렉토리 안내문
```

- 과거에는 `index.html` **단일 파일**이었으나 커밋 `9390a68`에서 HTML/CSS/JS 3파일로 분리되었습니다. **배포 시 세 파일(`index.html`, `style.css`, `app.js`)이 모두 올라가야 합니다.**
- 현재는 100% Client-Side 웹 애플리케이션으로 동작하며, 과거 로컬 런처/서버 관련 파일은 `legacy/` 하위로 완전 격리 분류되었습니다.

### 각 파일의 역할
1. **`index.html`**: UI 마크업(API 키 입력 `#apiKeyInput`, 상태 배지 `#apiStatusBadge`, 모델 드롭다운 `#modelSelect`, 병렬 배수 `#concurrencySelect`, 쪽 번호 및 머리글/바닥글 옵션 `#optPgNum`/`#optPgHeader`/`#optPgFooter`, 드롭존, 4칸 정보 박스, 진행 카드, 결과/내보내기 카드, 숨겨진 스킨 스위처 버튼 `#skinSecretBtn`, 스킨 선택 모달 `#skinModal`). CDN 로드: PDF.js 3.11.174, Marked, Mermaid 10, KaTeX 0.16, html2canvas, jsPDF, JSZip.
2. **`style.css`**: 컬러 변수(`:root`), 기본 옵시디언 다크 테마, 사이버펑크 2077 네온 펑크 테마(`[data-theme="cyberpunk"]`), Google AI Studio 코스믹 플로우 테마(`[data-theme="gemini"]`), 트와일라잇 뉴모피즘 테마(`[data-theme="twilight"]`), 베타 킨츠기 잉크(`[data-theme="kintsugi"]`), 베타 스텔라 리베리(`[data-theme="stellar"]`), `.grid4`/`.box`, `.gemini-wave-card`, `.badge`, `.custom-tooltip`, 스킨 모달 팝업.
3. **`app.js`**: 아래 2절 표 참고.

---

## 2. `app.js` 주요 함수 및 구조

| 영역 / 기능 | 주요 함수 / 식별자 | 설명 |
| :--- | :--- | :--- |
| **4단계 등급 & 가중치** | `MODEL_TIERS`, `getModelMeta(id)` | 모델 ID 키워드로 4단계(`flash`/`standard`/`high`/`ultra`) 판정. 단가·페이지당 초·배지·툴팁·경고문 포함 |
| **크레딧 & 툴팁** | `estimateCredit(pages, model)`, `updateModelBadgeAndTooltip(model)` | 예상 크레딧 계산, 배지/툴팁/고비용 경고 배너(`#costWarn`) 동기화 |
| **모델 필터링 & 정렬** | `isExcludedModel(id)`, `isNonTextId`, `NON_TEXT_RE`, `isNonTextMeta(obj)`, `filterValidModels(ids, p)`, `sortModelsByTier(ids)`, `PINNED_MODELS` | 비텍스트/파생 모델 제외, 등급순(추천 상단) 정렬 |
| **엔드포인트 자동 감지** | `autoDetectAndLoadModels(key)`, `fetchModelIds(...)`, `probeModel(...)`, `PROVIDERS` | Google AI Studio / FactChat 자동 프로빙, 단일 모델 키 고정 |
| **프로바이더 UI 분기** | `updateProviderCardUi()` | FactChat(`#costBox`) vs Google(`#geminiWaveBox`) 4번째 카드 전환 |
| **Gemini 오로라 웨이브** | `startGeminiWave()`, `updateGeminiWaveState(mode, prog)`, `stopGeminiWave()` | 3중 사인파 캔버스 (진행도에 비례해 역동성 증폭) |
| **파일 분석 & ETA** | `analyze(fileList)`, `updateEta()`, `SEC_PER_PAGE`, `renderPageJpeg(n)`, `renderImageFileJpeg(file)` | PDF/이미지 파싱, 배속별 예상 시간, 페이지→JPEG 변환 |
| **OCR 프롬프트** | `PROMPT` (상수) | 책 디지타이저 전사 규칙 (4절 참고) |
| **API 통신 & 즉각 중단** | `callApi(dataUrl, cfg)`, `sleep(ms, signal)`, `abortCtrl` | 429/5xx 지수 백오프, AbortController 즉시 중단, `usage` 실측(없으면 글자 수 역산) |
| **절전 방지** | `startKeepAlive()`, `stopKeepAlive()` | Wake Lock + 무음 Web Audio 루프 |
| **변환 파이프라인** | `convert(resume)`, `worker()` | 병렬 워커 풀, 진행률/ETA/누적 토큰·크레딧 |
| **페이지 서식(쪽 번호·머리글/바닥글)** | `splitPageMeta(md)`, `stripFurniture(body, meta, rep)`, `preparePages(cache)`, `pageDeco(info, idx, seqNo)`, `drawDeco(...)`, `decorateCanvas(cv, d)`, `initPageOptions()`, `rebuildFromCache()` | 응답 끝의 `<!--PAGE {...}-->` 분리, 본문에 섞인 머리글/바닥글/쪽 번호 제거(+여러 쪽 반복 줄 감지), 사용자 옵션(`state.pgNum/pgHeader/pgFooter`)에 따라 PDF/PNG/HTML/MD에 기록 |
| **Markdown → HTML** | `mdToHtml(md)`, `renderPagesHtml(bodies)`, `fitWideMath(root)` | 수식 보호(`@@MATH n@@`) → marked(`breaks:true`) → KaTeX 치환, Mermaid→SVG, 본문보다 넓은 블록 수식은 글자 축소 |
| **A4 분할 & 결과 생성** | `buildAndPrint(cache)`, `computePageCuts(stage, Hpx)`, `makeOutputsFromPages(pagesHtml, infos)` | 페이지 경계 계산, 5종 포맷 Blob 생성 (이름은 레거시, **인쇄 창은 띄우지 않음**). PDF는 A4 캔버스에 본문 조각+머리글/바닥글을 합성 |
| **다운로드** | `download(kind, ext)`, `updateExportFormatUI()` | PDF / PNG / PNG-ZIP / HTML / MD |
| **비주얼 스킨 & 테마** | `VALID_SKINS`, `applyTheme(skin)`, `initSkinSwitcher()`, `startBgEffect(skin)`, `stopBgEffects()`, `startGeminiBgFlow()`, `stopGeminiBgFlow()`, `startKintsugiBg()`, `startStellarBg()` | 6종 스킨 전환(`default`/`cyberpunk`/`gemini`/`twilight`/`kintsugi`/`stellar`) 및 `localStorage` 영구 유지. 테마별 배경 캔버스(`#kintsugiBgCanvas`, `#stellarBgCanvas`, `#geminiFlowCanvasLeft/Right`) 및 `geminiWaveCanvas` 전용 파형 자동 전환 |

저장소 키: `localStorage['pdfvec.settings.v2']`(키·모델·병렬 배수·`pgNum`/`pgHeader`/`pgFooter` 페이지 서식 옵션, `skin` 테마), `sessionStorage['pdfvec:<파일명>:<크기>:<수정시각>']`(페이지별 마크다운 캐시 = 이어하기).

---

## 3. 절대 깨지면 안 되는 핵심 불변 규칙 (Golden Rules)

### ① API 엔드포인트 자동 감지 & 키 격리
- 키가 `AIza`로 시작하면 `google` → `factchat` 순, 그 외는 `factchat` → `google` 순으로 `${base}/models`를 `Authorization: Bearer`로 프로빙.
  - Google: `https://generativelanguage.googleapis.com/v1beta/openai` / FactChat: `https://factchat-cloud.mindlogic.ai/v1/gateway`
- `/models`가 **정확히 1개**만 반환 → 필터 예외로 그 모델 1개만 넣고 드롭다운 `disabled`(단일 모델 자동 고정).
- `/models` 실패(권한 없음) → 대표 모델(`gemini-3.5-flash-lite`, `gemini-3.8-flash`)로 `max_tokens:1` 테스트 호출해 되는 모델로 고정.
- API 키는 `localStorage`에만 저장하며 **해당 API 엔드포인트 외 어떤 서버로도 전송 금지**. UI에 프로바이더/URL 수동 선택칸을 되살리지 않습니다(사용자 요구: 키 입력칸 하나로 완전 자동).

### ② 4단계 모델 등급 분류 체계 (`getModelMeta`의 검사 순서가 곧 우선순위)
순서: ultra → high → standard → flash → (그 외) standard.

| 등급 | 키워드 | 단가(1k토큰당 입/출) | 페이지당 초 | 페이지당 예상 크레딧 |
| :--- | :--- | :--- | :--- | :--- |
| 🟢 저비용·추천 | `flash`, `haiku`, `luna`, `gemma` | 0.4 / 1.2 | 4.2 | 약 1.6 |
| 🔵 표준 모델 | `sonnet`, `terra`, `pro` (+매칭 없음 기본값) | 2.0 / 6.0 | 6.0 | 약 7.9 |
| 🟠 고비용 주의 | `sol`, `opus`, `argon` | 6.0 / 18.0 | 8.5 | 약 23.7 |
| 🔴 초고비용 경고 | `astra`, `fable`, `carbon` | 15.0 / 45.0 | 12.0 | 약 59.3 |

- 페이지당 예상 토큰은 **입력 650 / 출력 1,100** 가정 (`pages*0.65*in + pages*1.1*out`). 단가는 **프로젝트 내부 추정 가중치**이며 FactChat 실제 차감과 다를 수 있습니다.
- 🟠/🔴 선택 시 시작 버튼 위 경고 배너 표시(FactChat 한정, Google에서는 숨김).
- **정렬**: `PINNED_MODELS`(`gemini-3.5-flash-lite`, `gemini-3.8-flash`) 최상단 → 등급(grade) 오름차순 → gemini 우선 → `perfScore`(등급/버전/날짜) 내림차순 → 이름순. 기본 선택은 `gemini-3.5-flash-lite`.

### ③ 모델 필터링 규칙 (`isExcludedModel` → `filterValidModels`)
- **공통 제외(비텍스트·특수)**: `NON_TEXT_RE`(embed/rerank/moderation/image/imagen/dall/flux/midjourney/diffusion/video/veo/sora/kling/runway/luma/pika/hailuo/seedance/seedream/banana/music/suno/lyria/tts/whisper/stt/transcri/speech/audio/voice/realtime/aqa/learnlm/robotics …) + `EXCLUDE_KEYWORDS`(`nano`, `1.0`, `1.5`, `2.0`, `exp`, `preview`, `live`, `thinking`, `omni`, `latest`, `translate`, `research`, `antigravity`, `customtools`, `computer-use` …).
- **예외 필수**
  - ID에 `3.1-pro`가 있으면(예: `gemini-3.1-pro-preview`) `preview` 키워드가 있어도 **정규 프로 모델로 허용**. 단, `customtools`/`image`가 붙으면 제외.
  - `mini` 제외는 **반드시 단어 경계 정규식** `/(^|[-_/.])mini([-_/.]|$)/` 사용 (`gemini`를 오인 제외하면 안 됨).
  - 중간 체크포인트 `3.1`/`3.6`/`3.7` 버전(경계 일치 시)은 제외 (단 위 `3.1-pro` 예외가 먼저 적용).
- **Google 모드**: `gemini` 또는 `gemma` 포함 모델만. **FactChat 모드**: 제미나이 제한 해제(GPT/Claude/Gemini 등), 4단계 키워드(`FOUR_TIER_KEYWORDS`) 해당 모델을 우선 노출하고 해당이 하나도 없으면 공통 필터를 통과한 전체를 노출.
- `/models` 응답에 메타(`type`/`output_modalities`/`capabilities`)가 있으면 `isNonTextMeta`로도 제외(모델이 2개 이상일 때만).

### ④ 프로바이더별 크레딧 vs 토큰 분기 표시
- **FactChat**: 4번째 카드 `#costBox`. 페이지당 예상 크레딧 + 실시간 누적 차감 크레딧(`XX.X 크레딧`).
- **Google AI Studio**: 4번째 카드 `#geminiWaveBox`. **크레딧 문구 전면 배제**, 진행률 바 위/로그에는 **순수 토큰 사용량(`총 XX,XXX 토큰`)과 처리 페이지 수**만.

### ⑤ Gemini 오로라 웨이브 순수성
- `#geminiWaveBox` 캔버스 위에 "Gemini Neural Wave", "실시간 신경망 가속", "대기/완료" 같은 **작위적 텍스트를 띄우지 않음**.
- 대기/완료: 잔잔한 한 줄기 오로라(`intensity = 0.12`), 변환 중: `done/totalPages`에 비례해 진폭·속도 증폭.

### ⑥ 네트워크 통신 & 중단(Stop) 즉각 반응
- 429/500/503: 지수 백오프(`1000*2^a` 또는 `Retry-After`, 최대 30초, 최대 6회 재시도).
- **[중단]** 클릭 시 429 대기 타이머(`sleep`)와 진행 중 `fetch`가 `AbortController`로 **즉시** 취소(0.01초 내).

### ⑦ 백그라운드 탭 절전/동결 방지
- 변환 중 `navigator.wakeLock` + 무음 `Web Audio` 루프를 유지해 탭 전환 시에도 타이머가 멈추지 않게 함. 종료/중단 시 반드시 `stopKeepAlive()`.

### ⑧ 내용 보존 우선 (OCR 계약) — 가장 중요한 품질 규칙
- `PROMPT`(app.js)는 **요약·의역·번역·교정·순서변경·생략 금지**를 명시하고, 읽을 수 없는 글자는 추측 대신 `[?]`로 표기. 요청 시 `temperature: 0`. 응답 `finish_reason === 'length'`면 로그 경고.
- 서식 규칙: 제목은 글자 크기/굵기 기준 `#`~`####`(본문 굵은 글씨를 제목으로 만들지 않음), 굵게 `**`, 기울임 `*`, 첨자 `<sup>/<sub>`, 취소선 `~~`, 목록 번호/들여쓰기 유지, 문단 줄바꿈 정리(문단 내 하드 줄바꿈 제거), 인용/박스 `>`, 각주 `[^n]`.
- **수식**: 인라인 `$…$`, 블록 `$$…$$`, 유효한 KaTeX/LaTeX만. **코드 서식/백틱 안에 수식 금지**. 통화 `$`는 `\$`.
- 표 → GitHub Markdown 표(셀 내 줄바꿈 `<br>`), 구조 있는 다이어그램 → ```mermaid, 사진/차트 → `*[그림: 설명 + 캡션 원문]*`.
- **페이지 서식(쪽 번호, 반복 머리글/바닥글, 워터마크 등)은 본문에 쓰지 않는다.** 대신 응답 마지막 줄에 `<!--PAGE {"num":"","header":"","footer":""}-->`로만 출력시키고(`PROMPT`의 "PAGE FURNITURE" 항목), 앱이 분리해 사용자 옵션(쪽 번호: 끔/원본/순번, 머리글, 바닥글 체크)에 따라서만 결과물에 기록한다. 기본값은 모두 끔. 이 줄은 `sessionStorage` 캐시에 원문 그대로 저장되므로 옵션 변경 시 API 재호출 없이 재생성(`rebuildFromCache`).
- **배치 규칙**: 줄 단위 의미가 있는 글(시·대화·주소·목록)은 줄을 합치지 않고, 중앙/우측 정렬은 `<p align>`, 괘선 없는 열 나열(단어표·정답표·세로 계산)도 마크다운 표(헤더 없으면 빈 헤더 행)와 정렬 행(`:---:`)으로, 여러 줄 수식은 하나의 `$$\begin{aligned}…$$` 블록(번호는 `\tag`)으로 출력. 표 셀 안 수식의 `|`는 `\vert`.
- 이미지 입력: 페이지 렌더 PDF는 Scale 2.0 + JPEG 0.85, 이미지 파일은 최대 변 2400px로 축소 후 JPEG 0.85.

---

## 4. 렌더링 · 내보내기 파이프라인 (상세)

1. **Markdown → HTML (`mdToHtml`)**: `marked`가 수식의 `_`, `*`를 서식으로 먹어 깨뜨리므로, `$$…$$`, `\[…\]`, `\(…\)`, `$…$`를 먼저 `@@MATH n@@`로 치환(코드 블록/인라인 코드 구간은 제외, `$5 and $6` 같은 금액은 수식으로 오인하지 않는 정규식) → `marked.parse` → `katex.renderToString(throwOnError:false)`로 복원. 실패 시 `<code>` 폴백.
2. **Mermaid**: ` ```mermaid ` 블록을 `mermaid.render`로 SVG 치환. 실패하면 코드 블록 유지 + 로그 경고.
3. **화면 밖 스테이지(`#stage`)** 에 페이지 HTML을 렌더 → `computePageCuts(stage, Hpx)`로 A4 경계 계산 → `html2canvas(scale 2)` 캡처 → 경계별 슬라이스를 A4 크기 캔버스(여백 12mm)에 올리고 옵션에 따라 머리글/바닥글/쪽 번호를 그려 JPEG(0.92)로 jsPDF에 추가. 메모리 보호를 위해 페이지 단위로 처리하고 즉시 해제. `Hpx = stage.offsetWidth * H / W` (본문 186×273mm, 여백 12mm).
4. **`computePageCuts` 규칙**
   - 표: 한 페이지에 들어가면 **경계에 걸릴 때 통째로 다음 페이지로 이동**. 한 페이지보다 긴 표는 **행 경계에서 끊고 `<thead>`를 복제해 다음 페이지 머리글로 반복**(`cloneNode`로 표 분할). 한 행이 페이지보다 크면 그 행에서만 강제 절단.
   - 제목: 페이지 맨 아래에 홀로 남지 않도록 다음 내용과 함께 이동(`bottom+70 > limit`).
   - 코드블록/그림/Mermaid/수식 블록/짧은 문단·목록(≈110px 이하): 쪼개지 않고 이동.
   - 긴 문단/목록: 텍스트 줄·이미지 `getClientRects`를 피해 **글줄 사이**에서만 절단(`safeCut`, 못 찾으면 강제).
   - 표가 통째로 넘어가면 앞 페이지 하단에 **여백이 생기는 것은 의도된 동작**.
5. **5종 내보내기** (`#exportFormat`, 이름 입력칸에서 파일명 지정 후 다운로드):
   1. **PDF (`.pdf`)**: 페이지를 **이미지로 캡처해 만든 래스터 PDF**(글자 선택/확대 품질은 벡터보다 낮음). *벡터가 아님에 유의.*
   2. **PNG 합치기 (`.png`)**: 세로로 병합(캔버스 최대 높이 30,000px 초과 시 비율 축소).
   3. **PNG ZIP (`.zip`)**: 페이지별 PNG (JSZip).
   4. **HTML (`.html`)**: KaTeX CSS 링크 + 인쇄 CSS 포함 독립 HTML. Mermaid는 SVG라 **진짜 벡터** — 벡터 PDF가 필요하면 이 파일을 열어 인쇄(PDF로 저장).
   5. **Markdown (`.md`)**: 페이지를 `---`로 이어 붙인 원문.
6. 변환이 끝나면 **인쇄 창을 띄우지 않고** 결과 카드에 파일 크기/페이지 수와 다운로드 버튼을 표시합니다 (사용자 요청).

---

## 5. 구현 완료 기능 요약

- 입력: PDF 단일 파일 + 다중 이미지(PNG/JPG/WEBP/GIF/BMP, 자연 정렬). 드롭 즉시 변환하지 않고 용량/페이지 수/예상 시간/예상 소모량을 먼저 표시.
- 병렬 배수 `#concurrencySelect`: 1/2/4(기본)/8/12배속. ETA는 초기 공식 `Math.ceil(총페이지/병렬배수)*모델초 + 총페이지*0.3 + 3`, 진행 중에는 **실측 평균**으로 갱신.
- `sessionStorage` 캐시 + **[이어하기]**(중단/실패 후 이어서), 잔액 소진 등으로 중단 가능.
- 응답 `usage`(prompt/completion tokens) 기반 실측 집계. 없으면 글자 수로 역산하고 로그에 `(추정)` 표기.
- 429 백오프, 즉각 중단, 절전 방지, 지능형 분할, 5종 내보내기, 등급 배지/툴팁.
- **비주얼 스킨 시스템**: 헤더 우측 숨겨진 버튼(`✦`, `#skinSecretBtn`)으로만 토글되는 비밀 테마 스위처(2열 그리드 모달). 기본 옵시디언 다크, 사이버펑크 2077 네온 펑크(`cyberpunk`), Google AI Studio 코스믹 플로우(`gemini`), 트와일라잇 뉴모피즘(`twilight`), 베타 킨츠기 잉크(`kintsugi`), 베타 스텔라 리베리(`stellar`) 6종 스킨 지원 및 `localStorage` 영구 보존.
- **아키텍처 경량화 (v1.5.3)**: 웹 배포에 불필요한 과거 로컬 백엔드/런처/스크립트를 `legacy/` 디렉토리로 완전 분리.

---

## 6. 배포 · 개발 · 테스트 작업 방식

### 배포 (GitHub Pages)
- 저장소: `https://github.com/darthemon/pdf_vectorizer` (브랜치 `main`, `origin`)
- 사이트: `https://darthemon.github.io/pdf_vectorizer/` (Settings → Pages → Deploy from a branch → `main` / `(root)`). `main`에 푸시하면 1~2분 내 자동 반영, 안 바뀌면 `Ctrl+Shift+R`. Actions 탭의 `pages build and deployment`로 상태 확인.
- **웹 배포에 필요한 파일은 `index.html`, `style.css`, `app.js`뿐**입니다. `app.py`, `gui_launcher.py`, `run_server.*`, `index.backup.html`, `.env_key`는 올리지 않습니다(`.env_key`는 `.gitignore` 대상). 커밋 시 `git add`로 필요한 파일만 지정하세요.
- 주소를 단순화하려면: ① 저장소 이름 변경(예: `pdf-ocr`, 또는 `darthemon.github.io` 이름이면 루트 주소) — 변경 후 `git remote set-url origin …`, ② 커스텀 도메인 + `CNAME`. 주소(origin)가 바뀌면 `localStorage`의 키/설정은 새로 입력해야 합니다.

### 로컬 검증 (이 PC 환경)
- Node.js 설치됨(`v26.x`). PowerShell 실행 정책 때문에 `npm`은 막히므로 **`npm.cmd` / `npx.cmd`** 사용 (정책 변경 금지).
- 문법 검사: `app.js`(또는 인라인 스크립트)를 `new Function(...)`/`node --check`로 파싱.
- 브라우저 테스트: Playwright(Chromium)를 **저장소 밖 임시 폴더**에 설치해 사용. CDN 로드 때문에 테스트는 네트워크 필요. 과거 검증 결과(분할 로직): 표 행/글줄을 가로지르는 절단 0건, 긴 표 분할 시 머리글 반복, 조각 높이 ≤ Hpx(반올림 1px), 5페이지 PDF/PNG 생성, 콘솔 오류 0.
- 에이전트 샌드박스에서는 `.git` 쓰기(`index.lock`)와 네트워크 푸시가 막히므로 `git add/commit/push`는 샌드박스 밖(승인)에서 실행.

---

## 7. 결정 이력 (요약)

1. 단일 `index.html`로 시작 → Google/FactChat 수동 선택 UI → **키 하나로 자동 감지**로 변경(수동 선택 UI 금지).
2. 모델 필터: 초기엔 Gemini 한정+고비용 차단 → FactChat은 **전 모델 허용**(비텍스트만 제외) → 이미지/영상/음성 모델이 남는다는 피드백으로 `NON_TEXT_RE` 대폭 확장 + 메타데이터 판별 추가 → 현재는 **4단계 등급제**(고비용 모델은 숨기지 않고 등급·경고로 안내).
3. 모델 정렬: 회사별 optgroup + 성능순 시도 → 현재는 등급 우선 정렬(`sortModelsByTier`). (`vendorOf`, `VENDORS`, `perfScore`는 보조 점수로 남아 있음.)
4. 크레딧: USD 단가표·로컬 차감 지갑(`MODEL_PRICING`, `scanCredits`, 잔액 조회) 설계 → **현재 코드에는 없음**. 프로젝트 내부 크레딧 가중치(4단계)와 FactChat 전용 `#costBox` 방식으로 대체됨. 되살릴 경우 별도 설계 필요(FactChat 잔액 조회 엔드포인트는 미확인).
5. 출력: 인쇄 창(`iframe.print()`) 방식 → **인쇄 창 없이 파일 생성 + 결과 카드 다운로드**로 변경(PDF는 래스터, 벡터는 HTML로 제공).
6. 분할: 고정 높이 슬라이스(표/글줄 잘림) → **`computePageCuts`** 로 표·제목·그림 보호.
7. OCR: 서식(제목/굵게)과 수식(LaTeX) 보존 강화 — 프롬프트 개편 + 수식 보호 파이프라인.
8. 코드 3파일 분리(`9390a68`), `convert()`의 `done` TDZ 오류 수정(`eb2288a`).
9. (2026-11-10) 머리글/쪽 번호가 본문 중간에섞이거나 배치·표·수식이 깨지는 문제 대응: 쪽 번호/머리글/바닥글을 본문과 분리(`PAGE` 메타 줄 + 후처리)하고 사용자 옵션으로 기록, 프롬프트에 줄바꿈·정렬·열 나열 표·여러 줄 수식 규칙 추가. 기존 "쪽 번호 생략" 규칙은 "옵션에 따라 기록"으로 대체. 옵션 UI는 `index.html` 상단 설정 카드에 `#optPgNum`, `#optPgHeader`, `#optPgFooter`로 정식 마크업되어 페이지 접속 즉시 설정 가능.
10. (2026-11-11, v1.5.0~v1.5.3) 파일 구조 정리 & 비주얼 스킨 시스템 구축:
    - 과거 로컬 Flask 서버(`app.py`)/PyWebView GUI 런처(`gui_launcher.py`)/로컬 셸 스크립트/백업 등 불필요한 레거시 파일들을 `legacy/` 디렉토리로 격리 분류하여 웹 배포 루트를 `index.html`, `style.css`, `app.js` 중심으로 경량화 및 청정화.
    - 숨겨진 트리거(헤더 우측 `✦` 버튼 `#skinSecretBtn` — v1.5.0 초기엔 로고 클릭·`Alt+S` 포함이었으나 v1.5.5에서 비밀성 유지를 위해 제거)로 활성화되는 스킨 변경 모달 UI(`#skinModal`) 구현 및 `localStorage` 영구 보존.
    - **사이버펑크 2077 테마 (`data-theme="cyberpunk"`)**:
      - 3D 원근 신스웨이브 격자 바닥 스크롤 애니메이션 + 나이트 시티 마천루 건물 실루엣 + 네온 선셋 태양.
      - 45도 챔퍼(chamfered) 커팅 카드 + `// SYSTEM_NET // V.2077` 테크 라벨 + 사이버 옐로우(`#fcee0a`)/시안(`#00f0ff`)/마젠타(`#ff0055`) 시그니처 배색.
      - (v1.5.3 개선) 좌상단 로고의 번잡한 RGB 번짐과 꼬리표를 제거하고 선명한 일렉트릭 화이트/시안의 정돈된 모던 테크 타이포그래피로 자연스럽게 정돈.
      - 4번째 정보 카드(`geminiWaveCanvas`)가 사이버펑크 전용 네온 디지털 오실로스코프 파형으로 완전 변신(스퀘어/톱니파/스파이크 글리치).
    - **Google Gemini / AI Studio 테마 (`data-theme="gemini"`)**:
      - 화면 좌우 대형 유체 오로라 리본 캔버스 애니메이션 (`geminiFlowCanvasLeft`/`Right`) 탑재.
      - (v1.5.3 개선) 튀는 형광 네온과 빠른 색상 회전을 전면 배제하고, Deep Royal Blue ➔ Cosmic Indigo ➔ Sky Ice ➔ Soft Violet의 우아한 톤온톤 조율.
      - 둥근 18px 곡면의 심화 울트라 글래스모피즘(`backdrop-filter: blur(28px)`) + 상단 1.5px의 부드러운 오로라 실크 빔.
      - 딥 코스믹 사파이어 글래스모피즘 캡슐 버튼(0.35 반사광 림) + 부드러운 오로라 에너지 포털 드롭존.
11. (2026-11-12) 세 번째 커스텀 스킨 **트와일라잇(Twilight)** 신설 (`data-theme="twilight"`):
    - 화이트(하이라이트), 쿨 그레이(매트 베이스 `#e6e9f0` & 음영), 차콜 블랙(타이포그래피 `#16181d`) 모노크롬 중심의 정교한 양각/음각 뉴모피즘(Soft UI / Tactile Depth).
    - 애플 디자인 룩의 유려한 곡선(`border-radius: 24px` 스쿼클 카드, 14~20px 둥근 컨트롤)과 이질감 없이 자연스럽게 연결되는 표면 설계.
    - 강조 버튼, 진행률 바, 드롭존 활성, 정보 수치 등은 블루-바이올렛 스펙트럼(`#4f6ef7` ➔ `#7a61e6`)으로 회색 음각 구간을 부드럽게 채우며, 4번째 웨이브 캔버스(`geminiWaveCanvas`)도 트와일라잇 전용 블루-바이올렛 실크 파형으로 자동 전환.
12. (2026-11-12, v1.5.5) 베타 스킨 2종 (**킨츠기 잉크** & **스텔라 리베리**) 추가 (`VALID_SKINS` 6종 체제 & 2열 스킨 모달):
    - **베타 1 · 킨츠기 잉크 (`kintsugi`)**: 매트 블랙 칠기 도자기 표면 위에 깨진 틈을 액체 순금으로 잇는 금계(Kintsugi) 크랙 SVG 맥락과 주색 낙관(`印`) 포인트를 결합. `#kintsugiBgCanvas`가 살아 움직이는 수묵(먹물) 확산 구름과 부유하는 금박 입자를 렌더링하고, `#geminiWaveCanvas`도 수묵 + 용융 금맥 웨이브로 전환.
    - **베타 2 · 스텔라 리베리 (`stellar`)**: 벨벳 심야 밤하늘 위로 `#stellarBgCanvas`의 반짝이는 4각 별빛·대각선 유성우·파스텔 성운 글로우(`.stellar-nebula-glow`)가 흐르며, 반투명 진주/오팔 광택 글래스 카드와 샴페인 로즈골드-라벤더 그라데이션 UI 및 은하수 웨이브를 제공.
    - 배경 캔버스 생명주기는 `startBgEffect(skin)` / `stopBgEffects()` 헬퍼로 일원화해 비활성 테마의 `requestAnimationFrame` 루프가 자동 중단되도록 구성.
13. (2026-11-12, v1.5.5) 스킨 스위처 비밀 트리거 단일화:
    - 숨겨진 스킨 변경 기능이 너무 쉽게 노출되지 않도록 `#logoTitle` 클릭 핸들러/호버 커서(`cursor:pointer`)와 `Alt+S` 키보드 단축키 및 버튼 `title` 툴팁을 전면 제거하고, 헤더 우측 `✦`(`#skinSecretBtn`) 클릭만으로 모달이 열리도록 정리(`Escape`로 닫기는 유지).

---

## 8. 알려진 한계 / 주의

- **FactChat CORS**: 브라우저 직접 호출 허용 여부는 서버 정책에 달림. 막히면 감지가 `연결 실패`로 끝나며 프록시(`app.py`)가 필요할 수 있음.
- **API 키 노출 범위**: 같은 도메인(`darthemon.github.io`)의 다른 페이지가 `localStorage`를 읽을 수 있음.
- **크레딧 수치는 추정치**: 사전 예상(650/1,100 토큰 가정)은 실제(프롬프트 ~900토큰 + 이미지 토큰)보다 낮게 나올 수 있어 **실측 집계가 더 정확**. 단가는 내부 가중치.
- **정확도 미검증**: 현재 변환 정확도를 자동으로 측정하는 기능은 없음(아래 TODO). 흐릿한 원본은 `[?]`로 남을 수 있고, 오타 교정은 의도적으로 금지됨.
- **FactChat 모델 중 비전 미지원 모델**은 `/models`만으로 거를 수 없어 변환 시 실패할 수 있음.
- **래스터 PDF**: 텍스트 선택 불가, 한 행이 한 페이지보다 크면 행 내부 절단 가능.
- **페이지 서식 한계**: 쪽 번호/머리글 인식은 모델 출력에 의존(미검증, 브라우저 실측 테스트 전). 반복 줄 감지(4쪽 이상, 40% 이상 반복)는 휴리스틱이라 본문이 우연히 반복되면 지워질 수 있음. 옵션 도입 이전 캐시에는 `PAGE` 줄이 없어 원본 쪽 번호는 순번으로 대체됨. PDF 머리글은 한 줄로 잘라 표시(길면 `…`).
- `sessionStorage` 용량(보통 ~5MB) 초과 시 이어하기 캐시 일부가 저장되지 않음(경고 로그).
- 워커 동시 실행은 병렬 배수 상한(최대 12). 대용량 PDF에서 메모리가 부담되면 1~2배속 권장.

---

## 9. TODO / 아이디어 (미구현)

- **정확도 확인 도구**(논의됨, 미구현): ① 변환 후 이상 신호 자동 감지(`[?]` 개수, 빈/짧은 출력, 응답 잘림, KaTeX/Mermaid 렌더 오류, 표 열 불일치, `$` 짝 불일치) → "검토 필요 N페이지" 표시, ② 원본 이미지 ↔ 변환 결과 **나란히 보기**, ③ 의심 페이지만 이중 변환(다른 모델) 후 차이 비교, ④ AI 검수 패스, ⑤ PDF 내장 텍스트 레이어 대조(스캔본은 불가), ⑥ 샘플 페이지 정답 대비 모델별 오류율 측정.
- 가짜 API 응답으로 업로드→변환→다운로드 전 과정을 도는 **자동 E2E 테스트**(Playwright).
- 주소 단순화(저장소 이름 변경 또는 커스텀 도메인).
- 필요 시 USD/크레딧 실잔액 표시 재도입(엔드포인트 확인 선행).

---

## 10. 이 문서 유지 규칙

- 기능·규칙·파일 구조를 바꾸면 해당 절을 **즉시 갱신**하고, 결정 변경은 7절에 한 줄 추가.
- 함수/식별자를 바꾸면 2절 표와 대조(코드에 실제로 존재하는 이름만 기록).
- "추측"은 적지 않습니다. 확인하지 못한 것은 8절 한계/미확인으로 표기하세요.
