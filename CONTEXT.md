# 📄 PDF Vectorizer 컨텍스트 가이드 (CONTEXT.md)

이 문서는 프로젝트의 전체 아키텍처, 파일 역할 분담, 핵심 함수 위치, 그리고 향후 개발 시 **절대 훼손되어서는 안 되는 불변 규칙**들을 정리한 공유 컨텍스트 문서입니다.

---

## 1. 프로젝트 아키텍처 & 파일 구성

본 프로젝트는 외부 서버 없이 브라우저 단독(Client-Side 100%)으로 동작하며, GitHub Pages 및 정적 웹 호스팅 환경에 최적화되어 있습니다. 유지보수와 컨텍스트 절약을 위해 코드가 3개의 파일로 분리되어 관리됩니다.

```
pdf-vectorizer/
├── index.html        # 순수 HTML 마크업 구조 및 외부 CDN 라이브러리 링크
├── style.css         # 다크 테마 기반 전역 스타일, 반응형 그리드, 캔버스 카드 스타일
├── app.js            # 전체 프론트엔드 비즈니스 로직 및 변환 파이프라인
├── CONTEXT.md        # 프로젝트 공유 컨텍스트 및 불변 규칙 가이드 (본 파일)
├── app.py            # (선택) 로컬 서빙 및 CORS 프록시 지원용 백엔드
└── gui_launcher.py   # (선택) 원클릭 로컬 GUI 런처
```

### 각 파일의 역할
1. **`index.html`**:
   - UI 마크업(API 키 입력창, 모델 드롭다운, 드롭존, 4개 정보 박스, 진행 상태창, 내보내기 결과창).
   - 외부 의존 라이브러리 CDN 로드 (PDF.js, Marked, Mermaid, KaTeX, Html2Canvas, jsPDF, JSZip).
   - 분리된 `style.css`와 `app.js`를 연결.
2. **`style.css`**:
   - 다크 테마 컬러 변수(`:root`).
   - 파일 분석 정보 카드(`.grid4`, `.box`) 및 Gemini 오로라 웨이브 캔버스 카드(`.gemini-wave-card`).
   - 등급 배지(`.badge`), 마우스 오버 커스텀 말풍선 툴팁(`.custom-tooltip`).
3. **`app.js`**:
   - 모델 감지, 4단계 분류, 실시간 캔버스 오로라 웨이브, 백그라운드 절전 방지, API 통신(즉각 중단 지원), Markdown 파싱, 지능형 A4 분할 및 5종 포맷 내보내기.

---

## 2. `app.js` 주요 함수 및 구조

`app.js`의 주요 로직은 기능별로 명확하게 모듈화되어 있습니다.

| 영역 / 기능 | 주요 함수 / 식별자 | 설명 |
| :--- | :--- | :--- |
| **4단계 등급 & 가중치** | `MODEL_TIERS`, `getModelMeta(id)` | 모델 ID에 따라 4단계 등급(`flash`, `standard`, `high`, `ultra`) 및 가중치 매핑 |
| **크레딧 & 툴팁 계산** | `estimateCredit(pages, model)`, `updateModelBadgeAndTooltip(model)` | 페이지당/총 예상 차감량 계산 및 마우스 오버 툴팁 안내 동기화 |
| **모델 필터링 & 정렬** | `isExcludedModel(id)`, `filterValidModels(ids, p)`, `sortModelsByTier(ids)` | 비텍스트/파생 모델 제외 및 4단계 등급순(추천 상단) 정렬 |
| **엔드포인트 자동 감지** | `autoDetectAndLoadModels(key)`, `fetchModelIds(...)`, `probeModel(...)` | Google AI Studio와 FactChat 자동 프로빙 및 단일 모델 키 처리 |
| **프로바이더 UI 분기** | `updateProviderCardUi()` | FactChat(크레딧 카드) vs AI Studio(Gemini 웨이브 캔버스) 동적 전환 |
| **Gemini 오로라 웨이브** | `startGeminiWave()`, `updateGeminiWaveState(mode, prog)`, `stopGeminiWave()` | 브랜드 컬러 기반 3중 사인파 캔버스 렌더러 (작업 진행도에 비례해 역동성 증폭) |
| **파일 분석 & ETA** | `analyze(files)`, `updateEta()`, `renderPageJpeg(n)`, `renderImageFileJpeg(file)` | PDF/이미지 파일 파싱, 배속별 예상 소요 시간 계산, 고해상도 Canvas 렌더링 |
| **API 통신 & 즉각 중단** | `callApi(dataUrl, cfg)`, `sleep(ms, signal)`, `abortCtrl` | 429 지수 백오프 재시도 및 AbortController 연동 즉각 중단(0.01초 내 반응) |
| **백그라운드 절전 방지** | `startKeepAlive()`, `stopKeepAlive()` | Wake Lock API + 무음 Web Audio Context 루프로 백그라운드 탭 동결 방지 |
| **변환 파이프라인** | `convert(resume)`, `worker()` | 병렬 작업 큐 분배, 페이지별 변환, 실시간 진행률 및 누적 토큰/크레딧 집계 |
| **A4 분할 & 결과 생성** | `buildAndPrint(cache)`, `computePageCuts(el)`, `makeOutputsFromPages(...)` | KaTeX/Mermaid 렌더링, 지능형 본문 분할 절단선 계산, 5개 포맷 Blob 생성 |
| **파일 다운로드** | `download(kind, ext)`, `updateExportFormatUI()` | PDF / PNG(단일) / PNG(ZIP) / HTML(벡터) / MD 다운로드 트리거 |

---

## 3. 절대 깨지면 안 되는 핵심 불변 규칙 (Golden Rules)

향후 수정 시 아래 규칙들은 반드시 준수되어야 합니다.

### ① API 엔드포인트 자동 감지 및 키 격리
- 입력된 API 키가 `AIza...`로 시작하면 `google` ➔ `factchat` 순서로 프로빙하고, 그 외에는 `factchat` ➔ `google` 순서로 프로빙합니다.
- 사용자의 API 키는 브라우저의 `localStorage`에만 저장되며, 어떠한 외부 서버로도 전송되지 않아야 합니다.

### ② 4단계 모델 등급 분류 체계
- 사용자가 선택하기 쉽도록 모델은 반드시 아래 4단계로 분류합니다:
  1. **🟢 저비용 · 추천 (`flash`, `haiku`)**: 입: 0.4 / 출: 1.2 (페이지당 약 1.5 크레딧)
  2. **🔵 표준 · 고정밀 (`sonnet`, `terra`, `pro`, `gemma`)**: 입: 2.0 / 출: 6.0 (페이지당 약 8 크레딧)
  3. **🟠 고비용 주의 (`sol`, `opus`, `argon`)**: 입: 6.0 / 출: 18.0 (페이지당 약 24 크레딧)
  4. **🔴 초고비용 경고 (`astra`, `fable`)**: 입: 15.0 / 출: 45.0 (페이지당 약 60 크레딧 이상)
- **예외 필수 규칙**:
  - `gemini-3.1-pro-preview`는 `preview` 제외 키워드가 있더라도 정규 프로 모델이므로 예외적으로 허용되어야 합니다.
  - `mini` 키워드로 필터링할 때는 `gemini` 브랜드명을 오인 제외하지 않도록 반드시 단어 경계 정규식(`/(^|[-_/.])mini([-_/.]|$)/`)을 사용해야 합니다.

### ③ 프로바이더별 크레딧 vs 토큰 분기 표시
- **FactChat**: 4번째 카드 자리에 `#costBox` 노출. 페이지당 예상 크레딧 및 실시간 누적 차감 크레딧(`XX.X 크레딧`) 노출.
- **Google AI Studio**: 4번째 카드 자리에 `#geminiWaveBox` 노출. 크레딧 관련 텍스트는 전면 배제하고, 진행률 바 상단과 로그에 **순수 토큰 사용량(`총 XX,XXX 토큰 사용`) 및 처리 페이지 수**만 노출.

### ④ Gemini 오로라 웨이브 순수성 유지
- `#geminiWaveBox` 캔버스 위에는 AI 스타일의 작위적인 텍스트("Gemini Neural Wave", "실시간 신경망 가속", "대기/완료" 등)를 띄우지 않습니다.
- 대기/완료 시에는 잔잔한 한 줄기의 유려한 오로라 흐름(`intensity = 0.12`), 변환 진행 시에는 진행률(`done / totalPages`)에 따라 진폭과 속도가 역동적으로 증폭되는 물리 반응을 유지합니다.

### ⑤ 네트워크 통신 및 중단(Stop) 즉각 반응
- API 호출 시 429(Rate Limit)나 500/503 오류가 발생할 경우 지수 백오프(`1000 * 2^a` 또는 `Retry-After`)로 최대 30초 대기 재시도를 수행합니다.
- 사용자가 **[중단]** 버튼을 클릭했을 때, 429 대기 타이머(`sleep`)와 fetch 요청이 `AbortController`를 통해 즉각 취소(0.01초 내 반응)되어야 합니다.

### ⑥ 백그라운드 탭 절전/동결 방지
- 변환 작업 중 사용자가 다른 탭이나 창으로 이동하더라도 브라우저의 CPU 스로틀링이나 절전 모드로 인해 타이머가 멈추지 않도록 `navigator.wakeLock`과 무음 `Web Audio Context` 루프를 실행해야 합니다.

---

## 4. 현재까지 구현 완료된 기능 요약

- **다양한 입력 지원**: PDF 단일 파일 및 다중 이미지 파일(PNG, JPG, WEBP, GIF, BMP 등 자연 정렬) 업로드 지원.
- **안정적인 세션 캐시 & 이어하기**: `sessionStorage` 기반으로 변환된 페이지를 캐싱하여 중단 후 즉시 이어하기 지원.
- **지능형 페이지 절단 (Table/Code/Math 세이프)**:
  - 수식(`KaTeX`), 표(`<table>`), 코드블록(`<pre>`), 다이어그램(`Mermaid`) 내부가 A4 경계선에서 쪼개지지 않도록 자연스러운 여백을 계산해 절단.
- **5가지 최종 내보내기 형식**:
  1. **PDF 문서 (`.pdf`)**: A4 비율 벡터 인쇄 품질 PDF.
  2. **PNG 이미지 합치기 (`.png`)**: 긴 단일 이미지로 병합.
  3. **PNG 페이지별 ZIP (`.zip`)**: 페이지별 고해상도 PNG를 ZIP 압축.
  4. **HTML 벡터 원본 (`.html`)**: KaTeX/Mermaid 원본 벡터가 포함된 반응형 독립 HTML.
  5. **Markdown 원본 (`.md`)**: 책 구조를 완벽 복원한 순수 마크다운 텍스트.
