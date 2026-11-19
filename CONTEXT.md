# 📄 PDF Vectorizer 컨텍스트 가이드 (CONTEXT.md)

이 문서는 프로젝트의 **공용 기록 보관소(공유 두뇌)** 입니다. 아키텍처, 파일 역할, 핵심 함수 위치, 절대 훼손되면 안 되는 **불변 규칙**, 배포/테스트 방법, 결정 이력과 알려진 한계를 담습니다.
코드를 바꾸면 이 문서의 관련 절도 **같은 작업 안에서** 함께 고치세요. (마지막 전면 검토: 2026-11-19, 코드와 대조 완료)

---

## 0. 프로젝트 목적 (모든 판단의 기준)

> **사진/스캔으로 된 책을 인식해서, 디자인 요소는 일부 버리더라도 _내용을 완전히 보존_한 채 새 문서로 만들어 용량을 줄이고 가독성을 높인다.**

- 핵심 문제는 **① 내용이 바뀌는 것(요약·의역·누락·오탈자 "교정"), ② 텍스트 서식(제목/굵게/수식/표)이 깨져 알아보기 힘들어지는 것** 두 가지입니다. 기능 추가나 UI 개선이 이 둘과 충돌하면 항상 이 둘이 우선합니다.
- 100% 브라우저(Client-Side) 동작. 서버·빌드 없이 GitHub Pages에서 정적으로 제공됩니다.

---

## 1. 프로젝트 아키텍처 & 파일 구성

```
pdf-vectorizer/
├── index.html        # HTML 마크업 + 외부 CDN 라이브러리 링크 (<head>에 KaTeX/Marked/Mermaid 로드, precision.js 선행 로드)
├── style.css         # 다크/라이트 6종 스킨, 정보/미리보기 카드(.preview-document), 출판·인쇄 조판 스타일(.book-box/.book-callout/.book-diagram)
├── precision.js      # 범용 단일 호출 정밀 복원 모듈 (`window.PrecisionModule`: Placeholder 격리 파싱, SVG 2단계 검증 복구, Mermaid·KaTeX 비동기 안전 렌더링)
├── app.js            # 전체 비즈니스 로직 (모델 감지·필터, 표준/정밀 변환 파이프라인, 분할, 미리보기, 벡터 인쇄, 내보내기, 스킨 전환)
├── CONTEXT.md        # 본 문서 (프로젝트 두뇌)
└── legacy/           # (과거 로컬/레거시 파일 모음 - 웹 배포본과 무관)
    ├── app.py            # 로컬 서빙/CORS 프록시 백엔드 (구버전)
    ├── gui_launcher.py   # 로컬 GUI 런처 (구버전)
    ├── run_server.bat/.sh, launcher.sh  # 로컬 실행 보조 스크립트
    ├── index.backup.html # 단일 파일 시절(구버전) 백업
    ├── server.log, .env_key, temp_workspace/, venv/ (.gitignore 대상)
    └── README.md         # legacy 디렉토리 안내문
```

- 과거에는 `index.html` **단일 파일**이었으나 커밋 `9390a68`에서 HTML/CSS/JS 3파일로 분리되었고 이후 정밀 복원 모듈(`precision.js`)이 추가되었습니다. **배포 시 `index.html`, `style.css`, `precision.js`, `app.js`가 모두 올라가야 합니다.**
- 현재는 100% Client-Side 웹 애플리케이션으로 동작하며, 과거 로컬 런처/서버 관련 파일은 `legacy/` 하위로 완전 격리 분류되었습니다.

### 각 파일의 역할
1. **`index.html`**: UI 마크업(앱명 `Vectorizer`, API 키 입력 `#apiKeyInput`, 상태 배지 `#apiStatusBadge`, 숨겨진 상태용 네이티브 `<select id="modelSelect" class="sr-only-select">` + 접근성 커스텀 모델 피커 `#modelPicker`/`#modelPickerBtn` + 플로팅 메뉴 포탈 `#modelPickerMenu`, 툴팁 원본 ID 라인 `#ttId`, 병렬 배수 `#concurrencySelect`, 페이지 번호 설정 및 머리글/바닥글 옵션 `#optPgNum`/`#optPgHeader`/`#optPgFooter`, 드롭존, 4칸 정보 박스, 변환 방식 토글 `.mode-toggle`(`#modeStandardBtn` `텍스트` / `#modePrecisionBtn` `벡터`) + 시작 버튼 `#startBtn`(`변환`), 진행 카드, 결과/내보내기 카드 `#resultCard`(`#outName`·`#outMeta`·`#printBtn` `PDF(텍스트)`·`#dlPdf` `PDF(이미지)`·`#dlPng` `PNG 한 장`·`#dlPngZip` `PNG 묶음`·`#dlHtml`·`#dlMd`), 변환 결과 미리보기 `#previewCard`/`#previewContainer`(`한 페이지`/`두 페이지` 연속 스크롤 레이아웃 전환, 스크롤 연동 페이지 표시 및 이전/다음 페이지 점프, `#pvExpandBtn` `넓게 보기`, `#previewToggleBtn` 접기), 숨겨진 스킨 스위처 버튼 `#skinSecretBtn`, 스킨 선택 모달 `#skinModal`, 우측 하단 버전 표기 `.app-version` `v2.0.0`). `<head>`에서 KaTeX 0.16·Marked 12·Mermaid 10 로드, `<body>` 끝에서 PDF.js 3.11.174·html2canvas·jsPDF·JSZip 및 `precision.js` → `app.js` 순 로드(`?v=2.0.0`).
2. **`style.css`**: 컬러 변수(`:root`), 6종 스킨(`default`/`cyberpunk`/`gemini`/`twilight`/`kintsugi`/`stellar`), 커스텀 모델 피커(`.model-picker` 등), `.grid4`/`.box`, `.gemini-wave-card`, `.badge`, `.custom-tooltip`, 스킨 모달 팝업, 변환 방식 세그먼트 토글(`.mode-toggle`/`.mode-opt`), 결과 내보내기 그리드(`.result-top`/`.export-actions`/`.export-btn`), 출판 조판/인쇄 스타일(`.book-box`, `.book-callout`, `.book-diagram`, `.mermaid-fallback-code` + `print-color-adjust: exact`), 2모드 연속 스크롤 미리보기 뷰어 스타일(`.preview-document.view-single`·`view-spread`·`#previewCard.is-expanded`) 및 우측 하단 버전 표기(`.app-version`, 인쇄 시 숨김).
3. **`app.js`**: 아래 2절 표 참고.
4. **`precision.js`**: 벡터 변환 모드(`#modePrecisionBtn` 선택 시 `currentConversionMode === 'precision'`) 전용 무오류 렌더링/생성 모듈 (`window.PrecisionModule`).
   - `getPrompt()`: 기존 표준 프롬프트와 병합되지 않는 독립 완결형 출판·벡터 복원 프롬프트(장식 제외, 코드/텍스트 추출, Mermaid 큰따옴표 문법, `<!-- LAYOUT: ... -->` 사전 좌표 설계 포함 `<svg>` 규격).
   - `renderMarkdown(rawMarkdown)`: `marked.parse()` 실행 전 Mermaid·`<svg>`·코드 블록·LaTeX 수식을 Placeholder로 격리하고, `validateAndNormalizeSvg`로 단독 `&` 이스케이프·`xmlns`/`viewBox` 보정·루트 고정 크기 제거·per-SVG `id` 스코핑(`psvgN_`)·XML/HTML5 2단계 복구를 수행하며, `sanitizeMermaidCode`로 기존 따옴표를 마스킹해 보호한 뒤 미인용 라벨을 자동 교정.
   - `hydrateDiagrams(rootElement)`: 멱등성이 보장된 비동기 하이드레이션. 각 `.book-mermaid-slot`을 개별 `try/catch`로 `mermaid.render()` 실행 후 실패/에러 SVG 시 `document.body` 잔여 에러 노드를 즉시 정리하고 `.mermaid-fallback-code`로 폴백하며, `renderMathInElement`에 `ignoredTags: ['script','noscript','style','textarea','pre','code','svg','annotation','annotation-xml']`와 `throwOnError: false`를 적용.

---

## 2. `app.js` 주요 함수 및 구조

| 영역 / 기능 | 주요 함수 / 식별자 | 설명 |
| :--- | :--- | :--- |
| **4단계 등급 & 가중치** | `MODEL_TIERS`, `GOOGLE_ROLE_META`, `classifyModelTier(parsed)`, `getModelMeta(id, raw)`, `getGoogleDisplayMeta(id)` | API 가격 메타데이터 + 제조사별 토큰 경계 판정으로 BAZE 4단계(`flash`/`standard`/`high`/`ultra` + 우측 균일 배지 `shortBadge`) 및 Google 역할 배지 판정 |
| **크레딧 & 툴팁** | `estimateCredit(pages, model)`, `updateModelBadgeAndTooltip(model)` | 예상 크레딧 계산, 프로바이더별 배지/툴팁(`#ttId`에 실제 API 모델 코드 병기, Google은 세대·역할 중심, BAZE는 4단계 비용 등급+`#costWarn` 경고 배너) 동기화 |
| **모델 파싱·분류·그룹핑** | `parseModelRecord(input)`, `VENDOR_CATALOG`, `VENDOR_LOGOS`, `isNonTextMeta(o)`, `isUnusableOcrModel(p)`, `formatModelDisplayName(id, raw)`, `buildUniqueDisplayMap(ids)`, `parseGoogleCanonical(p)`, `buildGoogleModelGroups(recs)`, `buildBazeModelGroups(recs)`, `organizeModels(items, p)`, `filterValidModels(items, p)` | `/models` 메타 보존, 비-OCR/비-비전(`decision`/`search`/`codex`/구세대 GPT<4·Claude<3·Gemma<3 등) 제외, 깔끔한 표시명 정제 + 동명이종 구분, Google(세대·성능순) / BAZE(벤더·제조사 SVG 로고 + 저비용→초고비용 순) 분리 파이프라인 |
| **커스텀 모델 피커 UI** | `initModelPicker()`, `renderModelPickerMenu()`, `syncModelPicker(rebuild)`, `openModelMenu()`, `closeModelMenu()`, `positionModelMenu()`, `selectModelFromPicker(id)`, `renderBrandIcon(el, key)`, `resetModelSelectPlaceholder(txt)` | `body` 포탈 기반 플로팅 메뉴(스킨 `clip-path`/`overflow:hidden` 회피), 제조사 인라인 SVG 로고, 모델명 좌측 수직 정렬 + 우측 고정폭 등급 알약(`.mp-pill`), 키보드 네비게이션 및 숨겨진 `#modelSelect` 양방향 동기화 |
| **엔드포인트 자동 감지** | `autoDetectAndLoadModels(key)`, `fetchModelRecords(base, key)`, `fetchModelIds(...)`, `probeModel(...)`, `setModels(...)`, `pickDefaultModel(...)`, `PROVIDERS`, `modelRecordMap` | Google AI Studio / BAZE 자동 프로빙, 메타데이터 캐싱, 그룹핑 렌더링 및 단일 모델 키 고정 |
| **프로바이더 UI 분기** | `updateProviderCardUi()` | BAZE(`#costBox`) vs Google(`#geminiWaveBox`) 4번째 카드 전환 |
| **Gemini 오로라 웨이브** | `startGeminiWave()`, `updateGeminiWaveState(mode, prog)`, `stopGeminiWave()` | 3중 사인파 캔버스 (진행도에 비례해 역동성 증폭) |
| **파일 분석 & ETA** | `analyze(fileList)`, `updateEta()`, `SEC_PER_PAGE`, `renderPageJpeg(n, mode)`, `renderImageFileJpeg(file, mode)`, `sig(mode)`, `hasCachedPage(c,n)`, `countCachedPages(c)` | PDF/이미지 파싱, 배속별 예상 시간, 모드별 해상도·품질(표준 0.85 / 정밀 최소 scale 2.0·품질 0.94) JPEG 변환, 모드별(`standard`/`precision`) `sessionStorage` 캐시 격리 및 이어하기 감지 |
| **OCR 프롬프트** | `PROMPT` (상수) / `PrecisionModule.getPrompt()` | 표준 모드 책 디지타이저 전사 규칙 vs 정밀 복원 모드 독립 완결형 출판·벡터 재구축 프롬프트 |
| **API 통신 & 즉각 중단** | `callApi(dataUrl, cfg, mode)`, `unwrapOuterMarkdownFence(text)`, `sleep(ms, signal)`, `abortCtrl` | 408/429/5xx 백오프, `temperature:0` 미지원 폴백, JSON `error`/빈 응답 재시도, 외곽 펜스 안전 제거, 즉시 중단, 선택 모델 페이지당 단일 호출 |
| **절전 방지** | `startKeepAlive()`, `stopKeepAlive()` | Wake Lock + 무음 Web Audio 루프 |
| **변환 파이프라인** | `convert(resume)`, `worker()`, `currentConversionMode`, `setConversionMode(mode, persist)`, `updateResumeButton(mode)` | `텍스트`/`벡터` 토글 선택(`state.convMode` 영구 유지) 후 `#startBtn`(`변환`) 실행, 병렬 워커 풀, 진행률/ETA/누적 토큰·크레딧, 모드별 캐시 분리 저장 및 이어하기 라벨 동기화 |
| **페이지 서식(쪽 번호·머리글/바닥글)** | `splitPageMeta(md)`, `stripFurniture(body, meta, rep)`, `preparePages(cache)`, `isBlockMarkdownLine(s)`, `pageDeco(info, idx, seqNo)`, `drawDeco(...)`, `decorateCanvas(cv, d)`, `initPageOptions()`, `rebuildFromCache()` | 응답 끝 `<!--PAGE {...}-->` 파싱(JSON 실패 시 정규식 폴백), 본문 내 머리글/바닥글/쪽 번호 제거(`**굵은 머리글**` 포함 반복 줄 감지·고립 쪽 번호 복원), 사용자 옵션에 따라 기록 |
| **Markdown → HTML** | `mdToHtml(md)`, `fixKoreanBold(text)`, `normalizeLatexForKatex(tex, display)`, `replaceInlineDollarOnLine(line, put)`, `sanitizeMermaidCode(code)`, `renderPagesHtml(bodies)`, `fitWideMath(root)` | 표준 모드 전용 마크다운·수식·Mermaid 파이프라인 (정밀 복원 모드는 `PrecisionModule.renderMarkdown` + `hydrateDiagrams` 사용) |
| **A4 분할 · 미리보기 · 인쇄** | `buildAndPrint(cache, mode)`, `makeOutputsFromPages(pagesHtml, infos, mode)`, `computePageCuts(stage, Hpx)`, `renderPreviewState(preserveAnchor)`, `syncPreviewIndicator()`, `setPreviewMode(mode)`, `stepPreviewPage(delta)`, `scrollToPreviewPage(container, pageEl, smooth)`, `updatePreviewNavUi(idx, total)`, `setPreviewExpanded(expanded)`, `printViaIframe()`, `outPdfPages`, `APP_DOC_TITLE` | 모드별 HTML 생성 후 `#previewContainer` 연속 스크롤 미리보기(`한 페이지` 1단 / `두 페이지` 2단 펼침 보기, 스크롤 위치 동기화, 이전/다음 페이지 부드러운 스크롤 점프, 넓게 보기) 반영, 수식·표·`.book-diagram`·연속 제목 보호 경계 계산, 포맷별 Blob 생성, `iframe` 기반 전체 페이지 비동기 대기 벡터 인쇄(`#printBtn`: `#outName`으로 `document.title` 및 `<title>` 임시 동기화) |
| **다운로드** | `download(kind, ext)`, `getSafeExportName()`, `updateExportUI()` | 파일명 정제 및 `#printBtn` (`PDF 텍스트`) / `PDF 이미지` / `PNG 한 장` / `PNG 묶음` / `HTML` / `Markdown` 직접 버튼 크기 표시·저장 |
| **비주얼 스킨 & 테마** | `VALID_SKINS`, `applyTheme(skin)`, `initSkinSwitcher()`, `initSkinInteractiveBridge()`, `triggerThemeImpulse(...)`, `startBgEffect(skin)`, `stopBgEffects()`, `startGeminiBgFlow()`, `stopGeminiBgFlow()`, `startKintsugiBg()`, `startStellarBg()`, `createUrushiPattern(...)`, `buildKintsugiFractures(...)`, `drawFourPointStar(...)` | 6종 스킨 전환(`default`/`cyberpunk`/`gemini`/`twilight`/`kintsugi`/`stellar`) 및 `localStorage` 영구 유지. 테마별 배경 캔버스(`#kintsugiBgCanvas`, `#stellarBgCanvas`, `#geminiFlowCanvasLeft/Right`), 커서 기반 카드 반사광/임펄스 브리지, `geminiWaveCanvas` 전용 파형 자동 전환 |

저장소 키: `localStorage['pdfvec.settings.v2']`(키·모델·병렬 배수·`pgNum`/`pgHeader`/`pgFooter` 페이지 서식 옵션, `skin` 테마, `pvMode` 미리보기 보기 방식, `convMode` 변환 방식), `sessionStorage['pdfvec:<standard|precision>:<파일명>:<크기>:<수정시각>']`(모드별 페이지 마크다운 캐시 = 이어하기).

---

## 3. 절대 깨지면 안 되는 핵심 불변 규칙 (Golden Rules)

### ① API 엔드포인트 자동 감지 & 키 격리
- 키가 `AIza`로 시작하면 `google` → `baze` 순, 그 외는 `baze` → `google` 순으로 `${base}/models`를 `Authorization: Bearer`로 프로빙.
  - Google: `https://generativelanguage.googleapis.com/v1beta/openai` / BAZE: `https://factchat-cloud.mindlogic.ai/v1/gateway`
- `/models`가 **정확히 1개**만 반환(`rawCount === 1`) → 필터 예외로 그 모델 1개만 넣고 드롭다운 `disabled`(단일 모델 자동 고정).
- `/models` 실패(권한 없음) → 대표 모델(`gemini-3.5-flash-lite`, `gemini-3.8-flash`, `gemini-4-hydrogen`, `gemini-2.5-flash`)로 `max_tokens:1` 테스트 호출해 되는 모델로 고정.
- API 키는 `localStorage`에만 저장하며 **해당 API 엔드포인트 외 어떤 서버로도 전송 금지**. UI에 프로바이더/URL 수동 선택칸을 되살리지 않습니다(사용자 요구: 키 입력칸 하나로 완전 자동).

### ② 4단계 모델 등급 분류 체계 (`classifyModelTier` / `getModelMeta` · 제조사별 분리)
순서: API `pricing`/`cost` 메타데이터 우선 → 제조사 스코프(`openai`/`anthropic`/`google`/기타) + 토큰 경계(`tokenSet`) 판정(부분문자열 `.includes()` 충돌 배제).

| 등급 | BAZE 프리픽스 | 대표 모델 / 토큰 | 단가(1k토큰당 입/출) | 페이지당 초 | 페이지당 예상 크레딧 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 🟢 저비용·추천 | `[🟢추천]` | OpenAI `luna`/`mini`/`nano`, Claude `haiku`, Google `flash-lite`/`flash`/`gemma`, 경량 모델 | 0.4 / 1.2 | 4.2 | 약 1.6 |
| 🔵 표준 모델 | `[🔵표준]` | OpenAI `terra`/기본 GPT, Claude `sonnet`, Google `pro`/`hydrogen` (+매칭 없음 기본값) | 2.0 / 6.0 | 6.0 | 약 7.9 |
| 🟠 고비용 모델 | `[🟠고비용]` | OpenAI `sol`/`o1`/`o3`, Claude `opus`, Google `argon` | 6.0 / 18.0 | 8.5 | 약 23.7 |
| 🔴 초고비용 모델 | `[🔴초고비용]` | OpenAI `astra`/OpenAI `-pro`/`-max`, Claude `fable`, Google `carbon`/`ultra` | 15.0 / 45.0 | 12.0 | 약 59.3 |

- 페이지당 예상 토큰은 **입력 650 / 출력 1,100** 가정 (`pages*0.65*in + pages*1.1*out`). 단가는 **프로젝트 내부 추정 가중치**이며 BAZE 실제 차감과 다를 수 있습니다.
- **프로바이더별 UI 분기**:
  - **BAZE**: 커스텀 드롭다운 좌측에 깔끔한 모델명(수직 직선 정렬) + 우측 고정폭 알약 배지(`🟢 추천`~`🔴 초고비용`), 제조사 카테고리 헤더(`VENDOR_LOGOS` SVG 아이콘 포함: OpenAI · GPT 최상단 → Anthropic → Google → xAI → DeepSeek → Alibaba → Meta → Mistral → 기타) + 각 그룹 내부 저비용(`Luna` 등) → 초고비용(`Astra` 등) 순 정렬. 🟠/🔴 선택 시 `#costWarn` 경고 배너 표시.
  - **Google AI Studio**: 드롭다운 비용 등급 알약 생략(세대·성능 순 및 `Preview` 태그만 표기), 세대별 그룹(`Gemini 4` → `Gemini 3` → `Gemini 2.5` → `Gemma`, 각 헤더에 `gemini`/`gemma` SVG 로고 표기), `#modelBadge`는 비용 경고 대신 `GOOGLE_ROLE_META`(세대·역할) 표기, `#ttId`에 원본 API ID 병기 및 `#costWarn` 숨김.
- **안전 기본 선택(`pickDefaultModel`)**: 저장된 모델(`state.model`)이 없으면 표시 순서와 무관하게 경량 추천 모델(`gemini-3.5-flash-lite` / `gemini-3.8-flash` / `gemini-4-hydrogen` / `gpt-6-luna` 등)을 우선 자동 선택.

### ③ 프로바이더별 모델 필터링 규칙 (`organizeModels` → `buildGoogleModelGroups` / `buildBazeModelGroups`)
- **공통 메타 & 비-OCR 제외 (`isNonTextMeta`, `isUnusableOcrModel`)**: `/models` 원본 메타(`supportedGenerationMethods`, `type`/`mode`, `output_modalities`, `capabilities`) + 토큰 경계 비텍스트/비전/특수 목적 모델(`tts`/`whisper`/`stt`/`audio`/`voice`/`live`/`realtime`/`imagen`/`dall-e`/`gpt-image`/`flux`/`veo`/`sora`/`video`/`image`/`banana`/`music`/`suno`/`lyria`/`embed`/`rerank`/`moderation`/`decision`/`decisions`/`search`/`research`/`codex`/`codestral`/`devstral`/`coder`/`guard`/`shield`/`safeguard`/`reward`/`eval`/`judge`/`batch`/`flex`/`priority`/`babbage`/`davinci`/`exp`/`experimental`/`thinking`/`computer-use`/`robotics`/`deep-research`/`customtools`/`cyber`/`shieldgemma`/`codegemma` 등) + 구세대 비-멀티모달(`GPT <4`, `Claude <3`, `Gemma <3`) 제외. 단 오픈웨이트 `-instruct`(`Qwen2.5-VL-72B-Instruct` 등)는 허용(`turbo-instruct`만 예외 차단). 부분문자열 오탐(예: `sol` vs `solar`, `mini` vs `gemini`) 차단.
- **Google AI Studio (`buildGoogleModelGroups` · `parseGoogleCanonical`)**:
  - `gemini-<ver>-(pro|flash-lite|flash)[-preview]`(2.5 이상) 및 `gemini-4+-(carbon|argon|hydrogen|...)[-preview]`, 멀티모달 `gemma-(3|4)-...-it` 만 정식 허용 → `-customtools`/`-cyber`/`-09-2025`/`-001`/`-latest`/`exp`/`thinking` 등 `-xxxx` 파생 접미사와 2.0 이하/소형 텍스트 Gemma(`1b`, `270m`, `gemma-2`) 깔끔히 배제.
  - 정식 모델과 `-preview` 공존 시 `-preview` 자동 병합 제거(정식 없는 `gemini-3.1-pro-preview` 등은 유지하고 표시 UI에 `Preview` 배지 부착).
  - Gemini 3.x 세대교체 구간은 동일 역할(`pro`/`flash`/`flash-lite`) 내 최신 minor만 유지(예: `3.6`/`3.7`/`3.1-flash-lite` 자동 정리 → `3.1-pro`·`3.8-flash`·`3.5-flash-lite`).
- **BAZE (`buildBazeModelGroups` · `pruneBazeLineage` · `compareBazeModels`)**:
  - 키워드 화이트리스트(`FOUR_TIER_KEYWORDS`) 제한 폐기 → 비-OCR/특수 API(`-decision`, `-search-preview`, `-codex`, `-guard`, `-batch`, `-flex` 등)·구세대를 전 벤더 단위로 정리: `GPT-5.x`/`4.x`/`o-series`(`GPT-6+` 존재 시), `Claude 4.x/3.x`(`Claude 5+` 존재 시), `Gemini <2.5`, `Gemma <3`, `Grok <최신세대`, `Qwen <3`, `Llama <4`, `DeepSeek V-라인 구형`을 자동 pruning하고 동일 세대·역할 내 구형 마이너 및 중복 `-preview`/`-YYYYMMDD`/`-latest` 병합.
  - `classifyModelTier`는 API 가격 메타가 있더라도 동일 등급 내부 정렬용 역할 순위(`subRank`)를 유지하며, BAZE `google` 카테고리는 `Gemini` 전체(저비용·경량→고비용·플래그십 순: `2.5` → `3.5 flash-lite` → `3.8 flash` → `3.1 pro` → `4 hydrogen` → `4 argon` → `4 carbon`)를 상단에, `Gemma` 전체(`4 → 3` 세대 내림차순, 파라미터 크기 내림차순)를 하단에 연속 배치해 `Gemma 4`/`Gemma 3` 분리를 원천 차단.

### ④ 프로바이더별 크레딧 vs 토큰 분기 표시
- **BAZE**: 4번째 카드 `#costBox`. 페이지당 예상 크레딧 + 실시간 누적 차감 크레딧(`XX.X 크레딧`).
- **Google AI Studio**: 4번째 카드 `#geminiWaveBox`. **크레딧 문구 전면 배제**, 진행률 바 위/로그에는 **순수 토큰 사용량(`총 XX,XXX 토큰`)과 처리 페이지 수**만.

### ⑤ Gemini 오로라 웨이브 순수성
- `#geminiWaveBox` 캔버스 위에 "Gemini Neural Wave", "실시간 신경망 가속", "대기/완료" 같은 **작위적 텍스트를 띄우지 않음**.
- 대기/완료: 잔잔한 한 줄기 오로라(`intensity = 0.12`), 변환 중: `done/totalPages`에 비례해 진폭·속도 증폭.

### ⑥ 네트워크 통신 & 중단(Stop) 즉각 반응
- 408/429/5xx 및 HTTP 200 내 일시적 `error`·빈 응답: 지수 백오프(`1000*2^a` 또는 `Retry-After`, 최대 30초, 최대 6회 재시도). `temperature: 0` 미지원 모델(HTTP 400)은 `temperature` 생략 자동 폴백.
- **[중단]** 클릭 시 대기 타이머(`sleep`)와 진행 중 `fetch`가 `AbortController`로 **즉시** 취소(0.01초 내).

### ⑦ 백그라운드 탭 절전/동결 방지
- 변환 중 `navigator.wakeLock` + 무음 `Web Audio` 루프를 유지해 탭 전환 시에도 타이머가 멈추지 않게 함. 종료/중단 시 반드시 `stopKeepAlive()`.

### ⑧ 내용 보존 우선 (OCR 계약) — 가장 중요한 품질 규칙
- `PROMPT`(app.js)는 **요약·의역·번역·교정·순서변경·생략 금지**를 명시하고, 읽을 수 없는 글자는 추측 대신 `[?]`로 표기. 요청 시 `temperature: 0`(미지원 시 자동 폴백). 응답 `finish_reason === 'length'`·`content_filter`면 로그 경고.
- 서식 규칙: 제목은 글자 크기/굵기 기준 `#`~`####`(본문 굵은 글씨를 제목으로 만들지 않음), 굵게 `**`, 기울임 `*`, 첨자 `<sup>/<sub>`, 취소선 `~~`, 목록 번호/들여쓰기 유지, 문단 줄바꿈 정리(문단 내 하드 줄바꿈 제거), 인용/박스 `>`, 각주 `[^n]`. 문장 중간에 인접 사이드바·그림 캡션이 끼어들지 않게 문장을 먼저 완결한 뒤 부가 요소를 배치.
- **수식**: 인라인 `$…$`(구분자 내측 여백 없음), 블록 `$$…$$`, 유효한 KaTeX/LaTeX만. **코드 서식/백틱 안에 수식 금지**. 통화 `$`는 `\$`.
- 표 → GitHub Markdown 표(셀 내 줄바꿈 `<br>`), 구조 있는 다이어그램 → ```mermaid(`flowchart TD`/`LR`, 노드 라벨 큰따옴표 감싸기), 사진/차트 → `*[그림: 설명 + 캡션 원문]*`.
- **페이지 서식(쪽 번호, 반복 머리글/바닥글, 워터마크 등)은 본문에 쓰지 않는다.** 대신 응답 마지막 줄에 `<!--PAGE {"num":"","header":"","footer":""}-->`로만 출력시키고(`PROMPT`의 "PAGE FURNITURE" 항목), 앱이 분리해 사용자 옵션(쪽 번호: 끔/원본/순번, 머리글, 바닥글 체크)에 따라서만 결과물에 기록한다. 기본값은 모두 끔. 이 줄은 `sessionStorage` 캐시에 원문 그대로 저장되므로 옵션 변경 시 API 재호출 없이 재생성(`rebuildFromCache`).
- **배치 규칙**: 줄 단위 의미가 있는 글(시·대화·주소·목록)은 줄을 합치지 않고, 중앙/우측 정렬은 `<p align>`, 괘선 없는 열 나열(단어표·정답표·세로 계산)도 마크다운 표(헤더 없으면 빈 헤더 행)와 정렬 행(`:---:`)으로, 여러 줄 수식은 하나의 `$$\begin{aligned}…$$` 블록(번호는 `\tag`)으로 출력. 표 셀 안 수식의 단일 세로선은 `\vert`/`\mid`(노름만 `\|`).
- 이미지 입력: PDF는 기본 Scale 2.0을 기준으로 긴 변 1800px~2500px(최대 3.2배율) 적응형 스케일 + 흰색 배경 채움 후 JPEG 0.85, 이미지 파일은 최대 변 2400px 고품질 리사이즈 후 JPEG 0.85.

---

## 4. 렌더링 · 내보내기 파이프라인 (상세)

1. **Markdown → HTML (`mdToHtml`)**:
   - 코드 펜스 밖에서 실수로 백틱에 감싸진 수식을 복원한 뒤, 코드 블록/인라인 코드를 제외한 구간에서 수식(`$$…$$`, `\[…\]`, `\(…\)`, `$…$`, 단독 `\begin{equation|align|aligned|gather|gathered|multline|eqnarray}`)을 `@@MATH n@@`로 보호(`replaceInlineDollarOnLine`으로 표 셀 경계 `|`와 통화 `$숫자` 오매칭 방지, 인용문 `>` 접두사와 표 행 내부 문맥 유지).
   - 한국어·문장부호 인접 `***…***`/`**…**` CommonMark 누락 보정(`fixKoreanBold`) → 각주(`[^n]: …` / `[^n]`) 및 `<p align>` 분리 파싱(`marked.parseInline`) → `marked.parse({ gfm:true, breaks:true })` → `normalizeLatexForKatex`(`eqnarray`→`aligned`, `\bold`→`\mathbf` 등) 적용 후 KaTeX 치환.
2. **Mermaid & 표 정리 (`renderPagesHtml`)**: `<thead>`의 모든 셀이 비어 있는 괘선 없는 열 나열 표는 빈 회색 `<thead>`를 제거. ` ```mermaid ` 블록을 `mermaid.render`로 SVG 치환하고, 1차 실패 시 `sanitizeMermaidCode`로 노드/엣지 라벨 큰따옴표 보정 후 1회 재시도(여전히 실패하면 코드 블록 유지 + 로그 경고).
3. **화면 밖 스테이지(`#stage`)** 에 페이지 HTML을 렌더 → 폰트·이미지 로드 대기 후 `fitWideMath(stage)` 실행(`.katex-display > .katex`를 `inline-block` 실측해 넓은 디스플레이/인라인 수식 및 초과 폭 표의 글자·패딩을 비례 축소) → `computePageCuts(stage, Hpx)`로 A4 경계 계산 → `html2canvas(scale 2)` 캡처 → 경계별 슬라이스(`maxSliceH` 초과 행 분할 포함)를 A4 캔버스(여백 12mm)에 올리고 머리글/바닥글/쪽 번호 합성 후 JPEG(0.92)로 jsPDF에 추가. `Hpx = stage.offsetWidth * H / W` (본문 186×273mm, 여백 12mm).
4. **`computePageCuts` 규칙**
   - 표: 한 페이지에 들어가면 **경계에 걸릴 때 통째로 다음 페이지로 이동**. 한 페이지보다 긴 표는 **행 경계에서 끊고 `<thead>`를 복제해 다음 페이지 머리글로 반복**(`cloneNode`로 표 분할, 분할 지점 상하 여백 정리). 한 행이 페이지보다 크면 그 행에서만 강제 절단(PDF 출력 시 `maxSliceH` 단위로 이어서 슬라이스).
   - 제목: 연속 제목 체인 및 바로 다음 블록(표/그림 등)이 다음 페이지로 넘어가는 경우까지 함께 검사해 제목만 홀로 남지 않도록 동반 이동(`shouldKeepHeadingWithNext`).
   - 코드블록/그림/Mermaid/수식 블록(`.katex-display` 포함)/짧은 문단·목록(≈110px 이하): 쪼개지 않고 이동.
   - 긴 문단/목록: `.katex` 내부 조각 텍스트를 건너뛰고 `.katex-display`/`.katex`/`img`/`svg`/`pre`/`tr`를 원자 블록으로 보호한 `lineRects`를 피해 **글줄·수식 사이**에서만 절단(`safeCut`, 못 찾으면 강제).
   - 표가 통째로 넘어가면 앞 페이지 하단에 **여백이 생기는 것은 의도된 동작**.
5. **직접 내보내기 버튼 및 벡터 인쇄** (`#resultCard`, `#outName`에서 파일 이름 지정 후 원클릭 저장):
   1. **PDF · 텍스트 (`#printBtn`)**: `printViaIframe()`이 전체 페이지 벡터 DOM·`PRINT_CSS`·KaTeX CSS를 오프스크린 `iframe`에 복제하고, `#outName`의 정제된 파일명(`getSafeExportName()`)으로 `iframe` `<title>`과 `document.title`을 임시 동기화한 뒤 CSS/이미지/`fonts.ready` 완료를 기다려 `print()`를 호출(대화상자 기본 파일명 제안, `afterprint` 시 원복).
   2. **PDF · 이미지 (`.pdf`, `#dlPdf`)**: 페이지를 **이미지로 캡처해 만든 래스터 PDF**(글자 선택/확대 품질은 벡터보다 낮음). *벡터가 아님에 유의.*
   3. **PNG 한 장 / PNG 묶음 (`.png` / `.zip`, `#dlPng` / `#dlPngZip`)**: 세로 병합 1장 PNG(캔버스 최대 높이 30,000px 초과 시 비율 축소) 및 다중 페이지일 때만 노출되는 페이지별 PNG ZIP(JSZip).
   4. **HTML (`.html`, `#dlHtml`)**: KaTeX CSS 링크 + 인쇄 CSS 포함 독립 HTML(벡터).
   5. **Markdown (`.md`, `#dlMd`)**: 페이지를 `---`로 이어 붙인 원문.
6. 변환이 끝나면 **인쇄 창을 띄우지 않고** 결과 카드(`#resultCard`)와 출판 미리보기 뷰어(`#previewCard` / `#previewContainer`)를 표시합니다. 미리보기는 항상 모든 페이지를 연속 스크롤로 유지하며 `한 페이지`(1단 세로 스크롤)·`두 페이지`(2단 펼침 스크롤) 레이아웃 전환(`state.pvMode` 저장), 스크롤 연동 현재 페이지 표시 및 `이전`/`다음` 부드러운 스크롤 점프, `#pvExpandBtn`(`넓게 보기`/`원래 크기`) 전체 화면 보기를 지원합니다.
7. **정밀 복원 모드 렌더링 분기 (`activeMode === 'precision'`)**:
   - `PrecisionModule.renderMarkdown`으로 `<svg>`·Mermaid·코드 블록·수식을 플레이스홀더로 격리해 `marked.parse` 파손을 차단하고(`validateAndNormalizeSvg`로 XML/HTML5 2단계 복구 및 per-SVG `id` 스코핑, `sanitizeMermaidCode`로 기존 따옴표 보호 후 미인용 라벨 교정), `#previewContainer` 삽입 직후 `await PrecisionModule.hydrateDiagrams(previewContainer)`로 Mermaid(개별 `try/catch` 격리 + 에러 DOM 정리 + 코드 폴백)와 KaTeX(`pre`/`code`/`svg`/`script`/`style` 제외)를 완성합니다.

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
- **웹 배포에 필요한 파일은 `index.html`, `style.css`, `precision.js`, `app.js`뿐**입니다. `app.py`, `gui_launcher.py`, `run_server.*`, `index.backup.html`, `.env_key`는 올리지 않습니다(`.env_key`는 `.gitignore` 대상). 커밋 시 `git add`로 필요한 파일만 지정하세요.
- 주소를 단순화하려면: ① 저장소 이름 변경(예: `pdf-ocr`, 또는 `darthemon.github.io` 이름이면 루트 주소) — 변경 후 `git remote set-url origin …`, ② 커스텀 도메인 + `CNAME`. 주소(origin)가 바뀌면 `localStorage`의 키/설정은 새로 입력해야 합니다.

### 로컬 검증 (이 PC 환경)
- Node.js 설치됨(`v26.x`). PowerShell 실행 정책 때문에 `npm`은 막히므로 **`npm.cmd` / `npx.cmd`** 사용 (정책 변경 금지).
- 문법 검사: `app.js`(또는 인라인 스크립트)를 `new Function(...)`/`node --check`로 파싱.
- 브라우저 테스트: Playwright(Chromium)를 **저장소 밖 임시 폴더**에 설치해 사용. CDN 로드 때문에 테스트는 네트워크 필요. 과거 검증 결과(분할 로직): 표 행/글줄을 가로지르는 절단 0건, 긴 표 분할 시 머리글 반복, 조각 높이 ≤ Hpx(반올림 1px), 5페이지 PDF/PNG 생성, 콘솔 오류 0.
- 에이전트 샌드박스에서는 `.git` 쓰기(`index.lock`)와 네트워크 푸시가 막히므로 `git add/commit/push`는 샌드박스 밖(승인)에서 실행.

---

## 7. 결정 이력 (요약)

1. 단일 `index.html`로 시작 → Google/BAZE 수동 선택 UI → **키 하나로 자동 감지**로 변경(수동 선택 UI 금지).
2. 모델 필터: 초기엔 Gemini 한정+고비용 차단 → BAZE는 **전 모델 허용**(비텍스트만 제외) → 이미지/영상/음성 모델이 남는다는 피드백으로 `NON_TEXT_RE` 대폭 확장 + 메타데이터 판별 추가 → 현재는 **4단계 등급제**(고비용 모델은 숨기지 않고 등급·경고로 안내).
3. 모델 정렬: 회사별 optgroup + 성능순 시도 → 현재는 등급 우선 정렬(`sortModelsByTier`). (`vendorOf`, `VENDORS`, `perfScore`는 보조 점수로 남아 있음.)
4. 크레딧: USD 단가표·로컬 차감 지갑(`MODEL_PRICING`, `scanCredits`, 잔액 조회) 설계 → **현재 코드에는 없음**. 프로젝트 내부 크레딧 가중치(4단계)와 BAZE 전용 `#costBox` 방식으로 대체됨. 되살릴 경우 별도 설계 필요(BAZE 잔액 조회 엔드포인트는 미확인).
5. 출력: 인쇄 창(`iframe.print()`) 방식 → **인쇄 창 없이 파일 생성 + 결과 카드 다운로드**로 변경(PDF는 래스터, 벡터는 HTML로 제공).
6. 분할: 고정 높이 슬라이스(표/글줄 잘림) → **`computePageCuts`** 로 표·제목·그림 보호.
7. OCR: 서식(제목/굵게)과 수식(LaTeX) 보존 강화 — 프롬프트 개편 + 수식 보호 파이프라인.
8. 코드 3파일 분리(`9390a68`), `convert()`의 `done` TDZ 오류 수정(`eb2288a`).
9. (2026-11-10) 머리글/쪽 번호가 본문 중간에섞이거나 배치·표·수식이 깨지는 문제 대응: 쪽 번호/머리글/바닥글을 본문과 분리(`PAGE` 메타 줄 + 후처리)하고 사용자 옵션으로 기록, 프롬프트에 줄바꿈·정렬·열 나열 표·여러 줄 수식 규칙 추가. 기존 "쪽 번호 생략" 규칙은 "옵션에 따라 기록"으로 대체. 옵션 UI는 `index.html` 상단 설정 카드에 `#optPgNum`, `#optPgHeader`, `#optPgFooter`로 정식 마크업되어 페이지 접속 즉시 설정 가능.
10. (2026-11-11, v1.5.0~v1.5.3) 파일 구조 정리 & 비주얼 스킨 시스템 구축:
    - 과거 로컬 Flask 서버(`app.py`)/PyWebView GUI 런처(`gui_launcher.py`)/로컬 셸 스크립트/백업 등 불필요한 레거시 파일들을 `legacy/` 디렉토리로 격리 분류하여 웹 배포 루트를 `index.html`, `style.css`, `app.js` 중심으로 경량화 및 청정화.
    - 숨겨진 트리거(헤더 우측 `✦` 버튼 `#skinSecretBtn` — v1.5.0 초기엔 로고 클릭·`Alt+S` 포함이었으나 v1.5.5에서 비밀성 유지를 위해 제거)로 활성화되는 스킨 변경 모달 UI(`#skinModal`) 구현 및 `localStorage` 영구 보존.
    - **사이버펑크 2077 테마 (`data-theme="cyberpunk"`)**:
      - 홀로그램 지평선 대기광 + 다층 메가스트럭처 마천루 스카이라인 + 3D 원근 텔레메트리 격자(6s 저속 스크롤)·CRT 비네팅.
      - 대각선 챔퍼 컷(`clip-path` + 코너 엣지 스트로크)·카드별 마이크로 텔레메트리 태그(`SYS.AUTH // NODE_01` 등)·키로시 옵틱스 4코너 타겟팅 레티클 드롭존(`#drop`)·크로마틱 애버레이션 CTA 호버·혼합 폰트(`--cp-font`, 영문 고정폭+한글 맑은 고딕).
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
    - **베타 1 · 킨츠기 잉크 (`kintsugi`)**: 매트 블랙 칠기 도자기 표면과 금계(Kintsugi) 맥락, 주색 낙관(`印`), 수묵/금박 캔버스 및 용융 금맥 웨이브 최초 도입.
    - **베타 2 · 스텔라 리베리 (`stellar`)**: 밤하늘 별빛·유성우·파스텔 성운 글로우(`.stellar-nebula-glow`), 오팔 글래스모피즘 및 은하수 웨이브 최초 도입.
    - 배경 캔버스 생명주기는 `startBgEffect(skin)` / `stopBgEffects()` 헬퍼로 일원화해 비활성 테마의 `requestAnimationFrame` 루프가 자동 중단되도록 구성.
13. (2026-11-12, v1.5.5) 스킨 스위처 비밀 트리거 단일화:
    - 숨겨진 스킨 변경 기능이 너무 쉽게 노출되지 않도록 `#logoTitle` 클릭 핸들러/호버 커서(`cursor:pointer`)와 `Alt+S` 키보드 단축키 및 버튼 `title` 툴팁을 전면 제거하고, 헤더 우측 `✦`(`#skinSecretBtn`) 클릭만으로 모달이 열리도록 정리(`Escape`로 닫기는 유지).
14. (2026-11-13, v1.5.6) 베타 스킨 2종 (**킨츠기 잉크** & **스텔라 리베리**) 전면 고도화:
    - **공통 인터랙티브 브리지 (`initSkinInteractiveBridge` / `triggerThemeImpulse`)**: 활성 스킨이 `kintsugi` 또는 `stellar`일 때만 커서 위치(`--card-mx`/`--card-my`/`--card-op`)로 카드 1px 마스크 보더·표면 광택을 정밀 조율하고, 클릭/파일 분석/변환 완료 시 캔버스 반응 파문을 전달(`prefers-reduced-motion` 및 백그라운드 탭 절전 대응 포함).
    - **킨츠기 잉크 (`kintsugi`) 고도화**:
      - 늘어나던 정적 카드 SVG 균열과 `.hint` 옆 낙관 텍스트를 제거하고, `.logo-title::after` 전각 주색 낙관(`印`), 우루시 칠기 브러시 결 오프스크린 타일(`createUrushiPattern`), 결정론적 프랙탈 균열망(`buildKintsugiFractures`)을 도입.
      - 커서를 따라오는 촛불 스페큘러 반사광과 균열 분기점을 타고 양방향으로 흘러 퍼지는 용융 순금 모세관 펄스, 다중 엽상 수묵 농담, 3D 회전 비등방성 금박 편(Kinpaku)을 구현하고 `#geminiWaveCanvas` 역시 한지 실선·수묵 비백·분기 금맥 파형으로 고도화.
    - **스텔라 리베리 (`stellar`) 고도화**:
      - `#stellarBgCanvas`를 성운 글로우(`.stellar-nebula-glow`) 상위 레이어(`z-index: 1`)로 정리하고, 3층 시차 별자리(7×4 격자 분산 앵커 별)·회전하는 천구 성도 아스트롤라베 호·부드러운 오목 4각 회절 성광(`drawFourPointStar`)·곡선 궤도 유성우와 이온화 별가루 잔상을 구현.
      - **성좌 필라멘트 직조(Constellation Weaver)**: 커서 주변 별들이 깨어나 샴페인-라벤더 필라멘트로 스스로 이어지고, 가장 가까운 별에 천체 레티클 호가 회전하며, 카드는 자개(Nacre) 진주광택 마스크 보더 리프랙션을 적용. `#geminiWaveCanvas`도 공전 하모닉 궤도 실선과 성광 다이아몬드 파형으로 개편.
15. (2026-11-13) Google AI Studio / BAZE 모델 목록 분류·필터링·정렬 아키텍처 전면 개편:
    - 기존의 전역 `.includes()` 키워드 매칭과 `FOUR_TIER_KEYWORDS` 강제 필터를 폐기하고, `/models` 원본 메타데이터(`fetchModelRecords` + `modelRecordMap`)를 보존한 **토큰 파서 + 제조사 스코프 규칙 + 제공사별 분리 파이프라인(`organizeModels`)** 으로 교체.
    - **BAZE**: `live`/이미지/음성 등 사용 불가 모델만 제외하고 대부분 노출, `VENDOR_CATALOG` 기반 제조사 카테고리 내 저비용→초고비용 순(`Luna → Terra → Sol → Astra`, `Haiku → Sonnet → Opus → Fable`)으로 정렬.
    - **Google AI Studio**: `parseGoogleCanonical`로 `-customtools`/`-cyber`/`-09-2025` 등 파생 접미사(`-xxxx`)와 구버전(`<=2.0`)을 배제하고 `Gemini 3.x` 세대교체 중간 체크포인트를 자동 정리(Gemini App 수준), 비용 등급 태그를 숨기고 세대·성능 순 및 `GOOGLE_ROLE_META` 역할 배지로 전환(초기 선택은 `pickDefaultModel`로 경량 모델 우선 보호).
16. (2026-11-13) 커스텀 모델 피커·깔끔한 표시명·파생 모델 재정제·브랜드 SVG 로고 도입:
    - **파생/비-OCR 모델 추가 차단**: Decisions API(`-decision`), 검색 전용(`-search-preview`), 코드/가드/과금 변종(`-codex`, `-guard`, `-batch`, `-flex`, `-priority`, `turbo-instruct`), 구세대 비-멀티모달(`GPT <4`, `Claude <3`, `Gemma <3`), BAZE 중복 `-preview`/`-chat-latest`를 추가 배제(오픈웨이트 `-instruct` 비전·채팅 모델은 정상 유지).
    - **깔끔한 사람 친화 표시명 (`formatModelDisplayName` / `buildUniqueDisplayMap`)**: 목록과 트리거에 원시 API 코드 대신 정제된 모델명(`GPT-6 Luna`, `Gemini 3.5 Flash-Lite`, `Claude Sonnet 5.5`, `Gemini 3.1 Pro` + `Preview` 배지 등)을 표시하고, 배지 툴팁(`#ttId`)에서 정확한 API 모델 ID를 확인 가능하게 분리.
    - **정렬 불균형 해소 & 제조사 SVG 로고 (`#modelPicker` / `#modelPickerMenu` · `VENDOR_LOGOS`)**: 가변 폭 `[등급]` 프리픽스를 제거해 모든 모델명을 좌측 수직선으로 일렬 정렬하고, BAZE 비용 등급 알약(`.mp-pill`)을 우측 고정폭 열에 배치. 각 카테고리 헤더와 트리거에 제조사별 정적 인라인 SVG 로고(`openai`, `anthropic`, `gemini`, `gemma`, `xai`, `deepseek`, `alibaba`, `meta`, `mistral`, `other`)를 추가했으며 `body` 포탈 + 6종 전 스킨 스타일 오버라이드로 `gemini`/`cyberpunk` 카드 클리핑과 `twilight` 버튼 스타일 충돌까지 해결.
    - **제조사 판별 우선순위 교정 (`resolveVendor` / `parseModelRecord`)**: `flash` 같은 범용 티어 토큰이 `deepseek`/`qwen`보다 먼저 `'google'`로 납치되거나 다중 `/` 경로·`.` 구분자 ID에서 `owned_by: 'google'` 힌트에 삼켜지던 문제를 해결해 선두 패밀리명 → ID 브랜드 토큰(`lastIndexOf('/')`, `.` 포함 분리) → 고유 코드명(`flash` 제외) → `owned_by` 순으로 재정렬.
17. (2026-11-13) 전 벤더 세대 정리·내부 정렬 일원화 & 브랜드 공식 SVG 로고 전면 교체 (`VENDOR_LOGOS` · `pruneBazeLineage` · `compareBazeModels`):
    - **공식 브랜드 SVG 로고 (`VENDOR_LOGOS`)**: 임시 도형이던 `openai`, `gemma`, `xai`, `deepseek`, `alibaba`, `meta`, `mistral` SVG를 `@lobehub/icons-static-svg` 공식 경로(`currentColor`)로 교체.
    - **전 벤더 세대교체 pruning (`pruneBazeLineage`)**: `GPT-6` 존재 시 `GPT-5.x`/`4.x`/`o-series` 제거, `Claude 5.x` 존재 시 `Claude Opus 4.6` 포함 `4.x/3.x` 제거, `Grok`/`Qwen`/`Llama`/`DeepSeek` 구세대 및 동일 역할 구형 마이너(`3.6/3.7-flash` vs `3.8-flash` 등) 자동 정리.
    - **Google 내부 정렬·가격 메타 분리 (`classifyModelTier` · `compareBazeModels`)**: API `pricing`이 `subRank`를 덮어써 `Gemma 4`/`3`가 갈라지고 `Gemini` 세대가 섞이던 문제를 해결해 BAZE `google` 그룹을 `Gemini`(경량·저비용→플래그십·고비용 순: `3.5 flash-lite → 3.8 flash → 4 hydrogen → 4 argon → 4 carbon`) 상단 + `Gemma`(`4→3`, 파라미터 내림차순) 하단으로 고정 정렬.
18. (2026-11-13) UI 균형·가독성·스킨 완성도 개선 (`style.css`, `index.html`):
    - **API 상태 배지(`#apiStatusBadge`) 규격·스킨 조화**: 입력칸(`#apiKeyInput`)·모델 피커(`#modelPickerBtn`)·병렬 선택(`#concurrencySelect`)과 높이를 맞추고(`min-height: 37px`), 6종 스킨별 모서리/재질/차분한 상태 배색을 개별 적용해 이질감을 제거.
    - **킨츠기 잉크·스텔라 모델 피커 가독성 복원**: 테마별 기본 CTA `button` 규칙이 `button.mp-trigger`/`button.mp-option`을 덮어쓰던 CSS 명시도 충돌(`:not(.mp-trigger):not(.mp-option)` 누락)을 전 스킨에서 차단하고, 킨츠기 잉크(`kintsugi`) 전용 우루시 칠기 배경·금박 테두리·아이보리 텍스트 드롭다운 스타일을 명시.
    - **트와일라잇(`twilight`) 테마 고도화**: 단일 연보라-포슬린 베이스(`#e6e8f2`) 위에 4면 이색 테두리 대신 둥근 모서리를 감싸는 부드러운 광택·음영과 3단 입체 위계(부유 카드 `.card` · 음각 입력 웰 · 플랫 인레이 `.box`/`#apiStatusBadge` · 단일 인디고-라벤더 포컬 포인트)로 절제된 고급스러움을 살리고, 좌우 패딩(`14px`)·컨트롤 높이(`37px`)를 통일해 행 개행 문제를 해소.
    - **사이버펑크(`cyberpunk`) 테마 HUD·배경·타이포그래피 고도화**: 원색 신스웨이브 태양·빠른 그리드·굴림 폴백 대신 Night City 지평선 홀로그램 블룸·다층 메가빌딩 실루엣·6초 저속 원근 그리드·CRT 비네팅 스캔라인으로 배경을 다듬고, `--cp-font` 폰트 스택과 45도 모따기 대각 스트로크 카드·영역별 텔레메트리 라벨(`SYS.AUTH // NODE_01` 등)·4코너 Kiroshi 타게팅 레티클 `#drop`·색수차 CTA 호버를 적용하면서 `.card` 패딩(`14px`)과 컨트롤 높이(`37px`)를 유지.
19. (2026-11-16, v1.6.0) OCR 판독·마크다운 변환·A4 분할 파이프라인 정확도 및 안정성 고도화 (`app.js`):
    - **PDF/이미지 입력 전처리 (`renderPageJpeg`, `renderImageFileJpeg`)**: PDF 적응형 스케일(긴 변 1800~2500px, 최대 3.2배율)과 흰색 배경 채움으로 투명 배경 흑화·소형 페이지 저해상도·초고해상도 메모리 폭증을 차단하고, 이미지 리사이즈에 고품질 보간(`imageSmoothingQuality: 'high'`)을 적용.
    - **API 통신·응답 정제 (`callApi`, `unwrapOuterMarkdownFence`, `PROMPT`)**: JSON 파싱·HTTP 200 래핑 오류·빈 응답 재시도, `temperature: 0` 미지원 모델 자동 폴백, `<!--PAGE ...-->` 주석이 붙은 외곽 ```` ```markdown ```` 펜스 안전 제거(복수 코드 블록 오손 방지), 프롬프트 문장 연속성·인라인 수식 공백·Mermaid 라벨 따옴표 지침 보완.
    - **페이지 서식 & 마크다운 파서 (`splitPageMeta`, `stripFurniture`, `mdToHtml`, `renderPagesHtml`)**: `<!--PAGE-->` 따옴표 손상 시 정규식 폴백, `isBlockMarkdownLine` 교정으로 `**굵은 머리글**`·고립 쪽 번호 정상 분리, 통화 `$숫자`·표 셀 `|`와 인라인 수식 충돌 해결, 인용문(`>`)·표 내부 `$$...$$` 및 단독 `\begin{...}`·`eqnarray` 복원, 한국어·문장부호 인접 `**...**` 보정, `<p align>` 내부 마크다운·각주(`[^n]`) 정식 렌더링, 빈 `<thead>` 제거 및 Mermaid 라벨 정제 재시도.
    - **폭 축소·분할·출력 (`fitWideMath`, `computePageCuts`, `makeOutputsFromPages`, `updateExportFormatUI`)**: `.katex-display > .katex`의 `inline-block` 실측으로 무작동하던 넓은 수식·표 축소 복구, `lineRects` 수식 원자 보호 및 연속 제목·다음 블록 동반 이동으로 수식/제목 절단 방지, `maxSliceH` 초과 행 분할 보호 및 PDF 실제 분할 페이지 수 표시.
20. (2026-11-17) 전 테마 레이아웃 불변성 확보 및 동적 상태 개행·위치 밀림 수정 (`style.css`):
    - **공통 flex·배지·로그 규격 정규화**: `.f.sm`에 `min-width: 0`을 지정해 `#concurrencySelect` 및 `#resultCard` 소형 버튼들이 불필요하게 `150px`로 팽창하지 않도록 수정. `#apiStatusBadge`는 `min-width: 148px; max-width: 222px; text-overflow: ellipsis`와 고정 높이(`line-height: 23px`, 총 `37px`)로 연결 상태 텍스트 변화(`Google AI Studio 연결됨 (단일 모델 자동 고정)` 등) 시에도 상단 행 개행을 차단. `.badge`에 `border: 1px solid transparent`, `#log`에 일관된 `padding`/`border` + `:empty` 0px 접힘, `.skin-modal-close`에 `28x28` 고정 규격을 적용.
    - **테마별 치수·위치 간섭 제거 (시각 전용 오버라이드 분리)**:
      - `cyberpunk`: `button`/`button.sec`/`input`/`select`/`#apiStatusBadge`/`button.mp-trigger`에서 폭을 넓히던 `var(--cp-font)`/`letter-spacing` 제거(`#log`·`.tt-id`·배지/드롭 태그·로고에만 유지), 비대칭 `border-left`/`border-right`/`border: none`을 `1px` 테두리 + `inset box-shadow`/`background-image` 스트라이프로 대체, `#drop::before`를 흐름에서 분리(`position: absolute`)하고 `padding: 35px`로 `#drop` 높이(`93px`) 일치.
      - `gemini`·`twilight`·`kintsugi`·`stellar`: 테마별 `button`/`button.sec`/`.card`/`input`/`select`/`button.mp-trigger`/`#apiStatusBadge`/`.box`/`.bar`/`#log` 패딩·높이 오버라이드를 제거하고 `#drop` 테두리 두께 차이를 보정해 전 6종 테마에서 카드·컨트롤·버튼 행의 크기와 좌표를 픽셀 단위로 일치시킴(`#resumeBtn`/`#stopBtn` 노출 시 `#clearBtn` 개행 해소).
21. (2026-11-19) 범용 단일 호출 정밀 복원 파이프라인 전면 고도화 (`precision.js`, `index.html`, `app.js`, `style.css`):
    - **Placeholder 격리 파싱 (`PrecisionModule.renderMarkdown`)**: `marked.parse()` 전 `<svg>`·`mermaid`·코드 블록·LaTeX 수식을 플레이스홀더로 분리 격리해 `<p>` 삽입 파손 및 마크다운/수식 충돌 원천 차단.
    - **SVG 2단계 검증 복구 & ID 스코핑 (`validateAndNormalizeSvg`, `scopeSvgIds`)**: 단독 `&` 이스케이프, 누락된 `xmlns`/`viewBox` 보정, 루트 고정 `width`/`height` 제거, `<marker>` 등 내부 ID 페이지 간 충돌 방지, `DOMParser('image/svg+xml')` 실패 시 HTML5 DOM 2차 복구 및 `<script>`/`foreignObject` 제거.
    - **Mermaid·KaTeX 개별 안전 하이드레이션 (`hydrateDiagrams`, `sanitizeMermaidCode`)**: 기존 큰따옴표 마스킹 후 미인용 노드/엣지 라벨 자동 교정, 다이어그램별 `try/catch` 격리 비동기 렌더링(실패 시 `body` 고아 에러 DOM 청소 후 `.mermaid-fallback-code` 폴백), KaTeX `ignoredTags`에 `pre`/`code`/`svg`/`script`/`style` 명시 및 `throwOnError: false` 적용.
    - **모드별 캐시 격리·고해상도 입력·인쇄 전 비동기 동기화**: `sessionStorage` 키를 `pdfvec:<standard|precision>:...`로 분리해 표준/정밀 캐시 간 덮어쓰기 차단, 정밀 모드 Canvas `scale >= 2.0`·품질 `0.94`, `#previewCard`/`#previewContainer` 및 `#printBtn`(`printViaIframe` 내 `hydrateDiagrams` + KaTeX CSS/이미지/`fonts.ready` 대기 후 `print()`) 도입, `.book-box`/`.book-callout`/`.book-diagram`에 `print-color-adjust: exact` 적용.
22. (2026-11-19) 변환·내보내기·미리보기 UI 단순화 및 벡터 인쇄 파일명 제안 (`index.html`, `style.css`, `app.js`):
    - **UI 문구·버튼 정리**: 변환 버튼(`표준 변환` / `정밀 복원`), 드롭존·옵션 안내문, 결과/미리보기 카드에서 이모티콘과 장황한 설명을 제거해 간결한 텍스트로 통일.
    - **중복 내보내기 UI 제거**: 상단 형식 드롭다운(`#exportFormat`)과 `#dlMain` 버튼을 제거하고, `#printBtn`(`PDF 인쇄·저장`)·`#dlPdf`·`#dlPng`·`#dlPngZip`(다중 페이지일 때만 표시)·`#dlHtml`·`#dlMd` 직접 버튼 그리드에 파일 크기/페이지 정보를 함께 표기.
    - **벡터 인쇄 파일명 제안 (`printViaIframe`, `getSafeExportName`)**: `#outName`에 입력한 파일명으로 `iframe` `<title>`과 `document.title`을 인쇄 직전 임시 동기화하고 `afterprint` 시 `APP_DOC_TITLE`로 복구해 전체 페이지가 인쇄되도록 보장.
    - **미리보기 뷰어 편의 기능 (`renderPreviewState`, `syncPreviewIndicator`, `setPreviewMode`, `stepPreviewPage`, `setPreviewExpanded`)**: 항상 전체 페이지를 연속 스크롤로 유지한 채 `한 페이지`(1단) / `두 페이지`(2단 펼침) 레이아웃 전환(`localStorage` `pvMode` 영구 유지, 스크롤 위치 기반 현재 쪽 표시·이전/다음 스크롤 점프), `넓게 보기` 전체 화면 읽기(`Escape` 복귀) 제공.
23. (2026-11-19) 사용자 수동 카피 반영 및 변환 방식 토글(`텍스트 / 벡터` + `변환`) 통합 (`index.html`, `style.css`, `app.js`):
    - **브랜딩·카피 동기화**: 앱명(`Vectorizer`), 스킨/옵션/결과/미리보기 문구(`한 페이지`/`두 페이지`, `넓게 보기`, `PDF 텍스트`/`PDF 이미지`, `PNG 한 장`/`PNG 묶음`)와 `app.js`의 `updateExportUI()`/`setPreviewExpanded()` 동적 라벨 및 `.export-btn` 말줄임(`min-width: 0; white-space: nowrap; text-overflow: ellipsis`)을 일치시킴.
    - **변환 방식 세그먼트 토글 (`#modeStandardBtn` / `#modePrecisionBtn` + `#startBtn`)**: `텍스트` / `벡터` 선택 토글(`setConversionMode`, `state.convMode` 영구 유지, 캐시 이어하기 라벨 자동 연동)과 단일 `변환` 실행 버튼으로 정리.
24. (2026-11-19) 게이트웨이 브랜드 표기 변경 (`FactChat` → `BAZE`, `index.html`, `app.js`):
    - API 키 라벨에서 프로바이더명을 제거하고(`API 키`), 코드·UI 내 모든 `FactChat`/`factchat` 식별자와 표시명을 `BAZE`/`baze`(`BAZE_URL`, `extractBazeLineage`, `pruneBazeLineage`, `compareBazeModels`, `buildBazeModelGroups`, `PROVIDERS.baze`)로 변경(실제 게이트웨이 URL 호스트 유지).
25. (2026-11-19, v2.0.0) 정식 2.0.0 버전 지정 및 우측 하단 버전 표기(`.app-version`) 추가, 정적 에셋 쿼리(`?v=2.0.0`) 통일.

---

## 8. 알려진 한계 / 주의

- **BAZE CORS**: 브라우저 직접 호출 허용 여부는 서버 정책에 달림. 막히면 감지가 `연결 실패`로 끝나며 프록시(`app.py`)가 필요할 수 있음.
- **API 키 노출 범위**: 같은 도메인(`darthemon.github.io`)의 다른 페이지가 `localStorage`를 읽을 수 있음.
- **크레딧 수치는 추정치**: 사전 예상(650/1,100 토큰 가정)은 실제(프롬프트 ~900토큰 + 이미지 토큰)보다 낮게 나올 수 있어 **실측 집계가 더 정확**. 단가는 내부 가중치.
- **정확도 미검증**: 현재 변환 정확도를 자동으로 측정하는 기능은 없음(아래 TODO). 흐릿한 원본은 `[?]`로 남을 수 있고, 오타 교정은 의도적으로 금지됨.
- **BAZE 모델 중 비전 미지원 모델**은 `/models`만으로 거를 수 없어 변환 시 실패할 수 있음.
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
