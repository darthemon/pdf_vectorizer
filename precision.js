window.PrecisionModule = (function () {
  let mermaidInitialized = false;
  let renderSeq = 0;

  function ensureMermaidInit() {
    if (mermaidInitialized || typeof window.mermaid === 'undefined') return;
    try {
      window.mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        securityLevel: 'loose',
        suppressErrorRendering: true,
        themeVariables: {
          primaryColor: '#f8fafc',
          primaryTextColor: '#0f172a',
          primaryBorderColor: '#334155',
          lineColor: '#334155',
          secondaryColor: '#eff6ff',
          tertiaryColor: '#ffffff',
          fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        },
        flowchart: {
          htmlLabels: true,
          curve: 'basis',
          useMaxWidth: true
        }
      });
      mermaidInitialized = true;
    } catch (e) {
      console.warn('[PrecisionModule] Mermaid init skipped:', e);
    }
  }

  // 기존 표준 프롬프트와 병합하지 않는 독립 완결형 프롬프트 (규칙 충돌 및 그림 누락 원천 차단)
  function getPrompt() {
    const fence = '```';
    return [
      '당신은 원본 문서를 전공 서적 수준의 디지털 출판물로 재구축하는 수석 조판 및 기술 일러스트 엔지니어입니다.',
      '페이지의 모든 텍스트, 소스 코드, 표, 수식, 그리고 학습에 필수적인 시각 자료(도식·도형·그래프)를 누락 없이 정확하게 변환하세요.',
      '',
      '[1. 시각 요소 판별 기준 (정확성 및 깔끔함 최우선)]',
      '- 완전 제외(장식): 기관 로고/엠블럼, 페이지 번호, 머리글/바닥글 장식, 학습 내용과 무관한 단순 마스코트·캐릭터 클립아트는 출력하지 마세요.',
      '- 코드/텍스트 추출: 포스트잇, 말풍선, 색상 상자, 터미널 창 모양의 그래픽 안에 적힌 소스 코드나 텍스트는 그림이 아닙니다. 반드시 표준 마크다운 코드 블록(' + fence + 'python 등)이나 본문으로 추출하세요.',
      '- 필수 벡터 복원: 위 항목을 제외한 모든 정보성 시각 자료(데이터 흐름도, 알고리즘 구조도, 화살표 매핑, 기하학 도형, 수학/통계 그래프, 메모리/아키텍처 도판)는 절대 생략하거나 크롭 태그를 쓰지 말고 아래 [2] 또는 [3] 방식으로 완벽히 새로 그리세요.',
      '',
      '[2. 논리 흐름도 및 화살표 관계도 -> Mermaid 작성]',
      '- 상자·노드와 화살표로 구성된 흐름도, 단계별 처리, 분기 구조, 함수/매개변수 연결 매핑은 ' + fence + 'mermaid 코드 블록(flowchart LR 또는 flowchart TD)으로 작성하세요.',
      '- [오류 방지 필수 문법]: 모든 노드 텍스트와 화살표 라벨은 특수문자(괄호, 대괄호, 등호, 콜론, 쉼표 등) 충돌을 막기 위해 반드시 큰따옴표("")로 감싸고, 라벨 내부에는 큰따옴표 대신 작은따옴표(\'\')만 사용하세요.',
      '  예시: A["x = [1, 2, 3]"] -- "iter()" --> B["iterator"]',
      '- 노드 ID는 반드시 영문자와 숫자만 사용하세요(예: N1, N2).',
      '',
      '[3. 기하학 도형, 분할 도표, 좌표 평면 그래프, 특수 도판 -> 정밀 <svg> 작성]',
      '- Mermaid로 표현할 수 없는 도형(나선/사각형 분할, 함수 곡선, 좌표축 그래프, 벤다이어그램, 계층/메모리 레이아웃 등)은 <svg viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg">...</svg>로 끝까지 완성하여 그리세요.',
      '- [좌표 정밀도 확보 규칙]: <svg>를 시작하기 직전 줄에 HTML 주석 딱 1줄로 주요 도형 요소의 픽셀 배치 좌표(x, y, w, h)와 여백을 먼저 설계한 뒤, 그 수치에 맞춰 도형이 겹치거나 잘리지 않게 그리세요.',
      '  예시: <!-- LAYOUT: boxA(x:40,y:40,w:200,h:200), boxB(x:240,y:40,w:320,h:320), curve(arc from 40,240 to 560,360) -->',
      '- [출판 디자인 규격]:',
      '  * 캔버스 가장자리에서 최소 24px 이상 안전 여백을 두고, 모든 요소가 viewBox 안에 온전히 들어가게 하세요.',
      '  * 배경색 #ffffff 또는 연한 강조면 #f8fafc / #eff6ff, 기본 외곽선 #1e293b(stroke-width="2"), 강조 곡선·화살표 #0284c7 또는 #dc2626(stroke-width="2.5").',
      '  * 화살표가 필요하면 <defs><marker id="arrow" ...>를 정의해 깔끔하게 연결하세요.',
      '  * 모든 텍스트(<text>)는 font-family="sans-serif" font-size="14" font-weight="600" fill="#0f172a" text-anchor="middle" dominant-baseline="central"을 적용해 선과 겹치지 않게 정중앙에 배치하세요.',
      '  * XML 오류 방지를 위해 <text> 내부의 & 기호는 반드시 &amp;로, < 는 &lt;로, > 는 &gt;로 표기하세요.',
      '',
      '[4. 코드·수식·표·조판 박스 규칙]',
      '- 프로그래밍 코드(변수 할당, 함수 호출, 메서드명 등)에는 절대 LaTeX 기호($)를 붙이지 마세요. 순수 수학·통계 수식에만 $인라인$, $$블록$$을 사용하세요.',
      '- 비교표나 상태 아이콘(✅, ❌)이 포함된 표는 누락 없이 표준 마크다운 표(| ... |)로 작성하세요.',
      '- 개념 정의나 예제 강조 박스는 <div class="book-box">...</div>, 핵심 요약·주의 박스는 <div class="book-callout">...</div>로 감싸고 태그 위아래에는 반드시 빈 줄을 두세요.'
    ].join('\n');
  }

  // 한 문서 내 여러 SVG의 내부 ID(예: marker id="arrow") 충돌 방지용 고유 접두사 스코핑
  function scopeSvgIds(svgEl) {
    if (!svgEl || typeof svgEl.querySelectorAll !== 'function') return;
    const prefix = `psvg${++renderSeq}_`;
    const idMap = new Map();

    svgEl.querySelectorAll('[id]').forEach((el) => {
      const oldId = el.getAttribute('id');
      if (!oldId) return;
      if (!idMap.has(oldId)) {
        idMap.set(oldId, prefix + oldId);
      }
      el.setAttribute('id', idMap.get(oldId));
    });

    if (!idMap.size) return;

    const rewriteAttrValue = (val) => {
      if (!val || typeof val !== 'string') return val;
      return val.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g, (m, q, refId) => {
        return idMap.has(refId) ? `url(${q}#${idMap.get(refId)}${q})` : m;
      });
    };

    const allNodes = [svgEl, ...svgEl.querySelectorAll('*')];
    for (const node of allNodes) {
      if (node.attributes) {
        for (let i = 0; i < node.attributes.length; i++) {
          const attr = node.attributes[i];
          const name = attr.name;
          const val = attr.value;
          if (!val) continue;
          if ((name === 'href' || name === 'xlink:href') && val.startsWith('#')) {
            const refId = val.slice(1);
            if (idMap.has(refId)) {
              node.setAttribute(name, '#' + idMap.get(refId));
            }
          } else if (val.includes('url(')) {
            const updated = rewriteAttrValue(val);
            if (updated !== val) node.setAttribute(name, updated);
          }
        }
      }
      if (node.tagName && node.tagName.toLowerCase() === 'style' && node.textContent) {
        const updatedCss = rewriteAttrValue(node.textContent);
        if (updatedCss !== node.textContent) node.textContent = updatedCss;
      }
    }
  }

  // XML 엔티티 및 <svg> 속성 정규화 + 2단계 검증 복구
  function validateAndNormalizeSvg(rawSvg) {
    if (!rawSvg || typeof rawSvg !== 'string') return '';

    let svg = rawSvg.trim();

    // 1. 잘못된 단독 & 문자 자동 이스케이프 (XML 파싱 에러 주원인 차단)
    svg = svg.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');

    // 2. 루트 <svg> 태그 xmlns 누락 보정
    if (!/<svg\b[^>]*\bxmlns\s*=/i.test(svg)) {
      svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    // 3. 루트 <svg> 태그 viewBox 누락 보정 (기존 width/height 추출 후 반응형 스케일링 보장)
    if (!/<svg\b[^>]*\bviewBox\s*=/i.test(svg)) {
      const wMatch = svg.match(/<svg\b[^>]*\bwidth\s*=\s*["'](\d+(?:\.\d+)?)(?:px)?["']/i);
      const hMatch = svg.match(/<svg\b[^>]*\bheight\s*=\s*["'](\d+(?:\.\d+)?)(?:px)?["']/i);
      const w = wMatch ? wMatch[1] : '640';
      const h = hMatch ? hMatch[1] : '400';
      svg = svg.replace(/<svg\b/i, `<svg viewBox="0 0 ${w} ${h}"`);
    }

    // 4. 루트 <svg>의 고정 픽셀 width/height 제거 (CSS 반응형 제어 및 인쇄 잘림 방지)
    svg = svg.replace(/<svg\b([^>]*)>/i, (full, attrs) => {
      const cleanedAttrs = attrs
        .replace(/\s+\bwidth\s*=\s*["'][^"']*["']/gi, '')
        .replace(/\s+\bheight\s*=\s*["'][^"']*["']/gi, '');
      return `<svg${cleanedAttrs}>`;
    });

    // 5. 1차 엄격한 XML 검증
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(svg, 'image/svg+xml');
      const parseError = xmlDoc.querySelector('parsererror');
      if (!parseError && xmlDoc.documentElement && xmlDoc.documentElement.tagName.toLowerCase() === 'svg') {
        xmlDoc.querySelectorAll('script, foreignObject').forEach((el) => el.remove());
        scopeSvgIds(xmlDoc.documentElement);
        return new XMLSerializer().serializeToString(xmlDoc.documentElement);
      }
    } catch (e) {}

    // 6. 2차 관대한 HTML5 DOM 자동 복구 (닫힘 태그 미세 누락 등 구제)
    try {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = svg;
      const recovered = wrapper.querySelector('svg');
      if (recovered && recovered.querySelector('path, rect, circle, ellipse, line, polyline, polygon, text, g')) {
        recovered.querySelectorAll('script, foreignObject').forEach((el) => el.remove());
        scopeSvgIds(recovered);
        return recovered.outerHTML;
      }
    } catch (e) {}

    // 복구 불가능한 손상 태그는 빈 문자열 반환하여 문서 레이아웃 보호
    return '';
  }

  // Mermaid 문법 에러 자동 교정 (기존 따옴표 보호 후 미인용 라벨만 안전 교정)
  function sanitizeMermaidCode(code) {
    if (!code) return '';
    let cleaned = String(code)
      .replace(/\r\n?/g, '\n')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/^\s*```mermaid\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    // 헤더 누락 시 기본 flowchart TD 보정
    if (!/^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|stateDiagram-v2|erDiagram|gantt|pie|mindmap)\b/i.test(cleaned)) {
      cleaned = 'flowchart TD\n' + cleaned;
    }
    cleaned = cleaned.replace(/^(flowchart|graph)[ \t]*(?=\n|$)/i, '$1 TD');

    if (!/^\s*(?:flowchart|graph)\b/i.test(cleaned)) {
      return cleaned;
    }

    const lines = cleaned.split('\n');
    const fixedLines = lines.map((line, lineIdx) => {
      if (lineIdx === 0 || /^\s*(?:%%|style\b|classDef\b|click\b|linkStyle\b)/i.test(line)) {
        return line;
      }

      // 이미 큰따옴표로 감싸진 문자열을 마스킹해 내부 대괄호/괄호 오손 방지
      const quotes = [];
      let masked = line.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (m) => {
        const idx = quotes.length;
        quotes.push(m);
        return `@@Q${idx}@@`;
      });
      const unmask = (s) => s.replace(/@@Q(\d+)@@/g, (m, i) => quotes[Number(i)] ?? m);
      const isSingleQuoteToken = (s) => /^@@Q\d+@@$/.test(s.trim());

      // 사각형 노드 A[라벨] (1단계 중첩 대괄호 포함) 자동 따옴표 감싸기
      masked = masked.replace(/(\b[A-Za-z0-9_.-]+)\s*\[((?:[^\[\]\n]|\[[^\[\]\n]*\])+)\]/g, (m, id, label) => {
        const trimmed = label.trim();
        if (isSingleQuoteToken(trimmed)) return m;
        if (/^(?:\([^()]*\)|\[[^\[\]]*\]|\/[^\/\\]*\/|\\[^\/\\]*\\|\/[^\/\\]*\\|\\[^\/\\]*\/)$/.test(trimmed)) return m;
        const rawLabel = unmask(trimmed).replace(/"/g, "'").trim();
        return `${id}["${rawLabel}"]`;
      });

      // 둥근 노드 A(라벨)에 특수문자가 있는데 따옴표가 없는 경우 보정
      masked = masked.replace(/(\b[A-Za-z0-9_.-]+)\s*(?<!\()\(((?:[^()\n]|\([^()\n]*\))+)\)(?!\))/g, (m, id, label) => {
        const trimmed = label.trim();
        if (isSingleQuoteToken(trimmed)) return m;
        if (/^(?:\(.*\)|\[.*\])$/.test(trimmed)) return m;
        const rawLabel = unmask(trimmed);
        if (!/[=:,\[\]<>;&{}()]/.test(rawLabel)) return m;
        return `${id}("${rawLabel.replace(/"/g, "'").trim()}")`;
      });

      // 화살표 라벨 -->|라벨| 에 따옴표가 없는 경우 보정
      masked = masked.replace(/(-->|-\.->|==>|---)\|([^|\n]+)\|/g, (m, arrow, label) => {
        const trimmed = label.trim();
        if (isSingleQuoteToken(trimmed)) return m;
        const rawLabel = unmask(trimmed).replace(/"/g, "'").trim();
        return `${arrow}|"${rawLabel}"|`;
      });

      return unmask(masked);
    });

    return fixedLines.join('\n');
  }

  function mapOutsideInlineCode(text, fn) {
    return text.split(/(`[^`\n]*`)/).map((seg, i) => (i % 2 ? seg : fn(seg))).join('');
  }

  function replaceInlineDollarOnLine(line, put) {
    const isTableLine = /^\s*\|/.test(line);
    let out = '';
    let i = 0;
    while (i < line.length) {
      const idx = line.indexOf('$', i);
      if (idx < 0) { out += line.slice(i); break; }
      let bs = 0;
      for (let k = idx - 1; k >= 0 && line[k] === '\\'; k--) bs++;
      if (bs % 2 === 1 || line[idx + 1] === '$') {
        const step = line[idx + 1] === '$' ? 2 : 1;
        out += line.slice(i, idx + step);
        i = idx + step;
        continue;
      }

      let close = -1;
      for (let j = idx + 1; j < line.length; j++) {
        if (line[j] !== '$') continue;
        let jbs = 0;
        for (let k = j - 1; k >= 0 && line[k] === '\\'; k--) jbs++;
        if (jbs % 2 === 1) continue;
        if (line[j + 1] === '$') { j++; continue; }
        close = j;
        break;
      }
      if (close < 0) { out += line.slice(i); break; }

      const rawInner = line.slice(idx + 1, close);
      const prevCh = idx > 0 ? line[idx - 1] : '';
      const nextAfterClose = close + 1 < line.length ? line[close + 1] : '';
      const hasMathSignal = /\\[a-zA-Z]+|[_^{}=<>+\-*/]/.test(rawInner);
      const hasEdgeSpace = /^\s|\s$/.test(rawInner);
      let barePipes = 0;
      if (isTableLine) {
        for (let p = 0; p < rawInner.length; p++) {
          if (rawInner[p] === '|' && (p === 0 || rawInner[p - 1] !== '\\')) barePipes++;
        }
      }
      const tableCrossed = isTableLine && (barePipes % 2 === 1 || /\s\|\s/.test(rawInner) || /^\d[\d,.]*\s*\|/.test(rawInner));
      const looksLikeCurrency =
        tableCrossed
        || /^\d[\d,.]*(?:\s*[KMBTkmb원달러불])?\s*[(\[]$/.test(rawInner)
        || (/^\d[\d,.]*\s*(?:[a-zA-Z]{2,}|[\u3131-\uD7A3]+)/.test(rawInner) && !hasMathSignal);

      const valid = rawInner.trim().length > 0
        && !/\d/.test(prevCh)
        && !looksLikeCurrency
        && (!hasEdgeSpace || hasMathSignal)
        && !(/^\s*\d/.test(rawInner) && /\d/.test(nextAfterClose))
        && !(/\d/.test(nextAfterClose) && hasEdgeSpace);

      if (!valid) {
        out += line.slice(i, idx + 1);
        i = idx + 1;
        continue;
      }

      out += line.slice(i, idx) + put(line.slice(idx, close + 1));
      i = close + 1;
    }
    return out;
  }

  /**
   * 안전한 마크다운 -> HTML 변환 (SVG, Mermaid, 코드 블록, 수식을 Placeholder로 격리 후 복원)
   * app.js에서 정밀 복원 모드의 마크다운 렌더링 시 호출한다.
   */
  function renderMarkdown(rawMarkdown) {
    if (!rawMarkdown) return '';
    let text = String(rawMarkdown).replace(/\r\n?/g, '\n');

    // 1. 펜스 코드 블록 분류: Mermaid 격리, SVG-only 펜스 해제, 일반 코드 블록은 임시 마스킹
    const mermaidBlocks = [];
    const codeBlocks = [];
    const fenceRegex = /`{3}([^\n\s`]*)[ \t]*(?:\r?\n)?([\s\S]*?)`{3}/g;
    text = text.replace(fenceRegex, (full, langRaw, body) => {
      const lang = (langRaw || '').trim().toLowerCase();
      if (lang === 'mermaid') {
        const idx = mermaidBlocks.length;
        mermaidBlocks.push(sanitizeMermaidCode(body));
        return `\n\n<div data-precision-mermaid="${idx}"></div>\n\n`;
      }
      if ((lang === '' || lang === 'svg' || lang === 'xml' || lang === 'html')
        && /^\s*(?:<div[^>]*>\s*)?<svg[\s\S]*?<\/svg>\s*(?:<\/div>\s*)?$/i.test(body)) {
        return `\n\n${body.trim()}\n\n`;
      }
      const idx = codeBlocks.length;
      codeBlocks.push(full);
      return `\n\n@@PRECCODE_${idx}@@\n\n`;
    });

    // 2. 설계용 HTML 주석 제거 (코드 블록·인라인 코드 제외)
    text = mapOutsideInlineCode(text, (seg) => seg.replace(/<!--[\s\S]*?-->\s*/g, ''));

    // 3. <svg> 블록 추출 및 격리 (marked.js의 <p> 태그 삽입 오염 원천 차단)
    const svgBlocks = [];
    text = mapOutsideInlineCode(text, (seg) =>
      seg.replace(/<svg[\s\S]*?<\/svg>/gi, (svgStr) => {
        const idx = svgBlocks.length;
        svgBlocks.push(validateAndNormalizeSvg(svgStr));
        return `\n\n<div data-precision-svg="${idx}"></div>\n\n`;
      })
    );

    // 4. book-box / book-callout 컨테이너 위아래 빈 줄 보정 (내부 마크다운 파싱 보장)
    text = mapOutsideInlineCode(text, (seg) =>
      seg
        .replace(/(<div\s+class=["'](?:book-box|book-callout)["'][^>]*>)/gi, '\n\n$1\n\n')
        .replace(/(<div\s+data-precision-(?:svg|mermaid)="\d+"><\/div>)|(<\/div>)/gi, (m, slotDiv) => {
          return slotDiv ? slotDiv : '\n\n</div>\n\n';
        })
    );

    // 5. LaTeX 수식을 marked.parse() 파싱(언더스코어 <em> 변환, < 태그 오인)으로부터 격리 보호
    const mathBlocks = [];
    const putMath = (rawDelims) => {
      const idx = mathBlocks.length;
      mathBlocks.push(rawDelims);
      return `@@PRECMATH_${idx}@@`;
    };
    text = mapOutsideInlineCode(text, (seg) => {
      let s = seg
        .replace(/\$\$([\s\S]+?)\$\$/g, (m) => putMath(m))
        .replace(/\\\[([\s\S]+?)\\\]/g, (m) => putMath(m))
        .replace(/\\\(([\s\S]+?)\\\)/g, (m) => putMath(m));
      return s.split('\n').map((ln) => replaceInlineDollarOnLine(ln, putMath)).join('\n');
    });

    // 6. 일반 코드 블록 복원 (marked가 <pre><code>로 정상 렌더링하도록)
    text = text.replace(/@@PRECCODE_(\d+)@@/g, (m, idxStr) => codeBlocks[Number(idxStr)] ?? m);

    // 7. 안전한 마크다운 파싱
    let html = '';
    try {
      if (typeof window.marked !== 'undefined') {
        html = typeof window.marked.parse === 'function'
          ? window.marked.parse(text, { gfm: true, breaks: true })
          : window.marked(text);
      } else {
        html = text.replace(/\n/g, '<br>');
      }
    } catch (e) {
      console.error('[PrecisionModule] marked parse error:', e);
      html = `<pre>${text.replace(/</g, '&lt;')}</pre>`;
    }

    // 8. 격리했던 수식 원문 복원 (HTML 특수문자 이스케이프해 innerHTML 텍스트 노드 보존)
    html = html.replace(/@@PRECMATH_(\d+)@@/g, (m, idxStr) => {
      const raw = mathBlocks[Number(idxStr)];
      if (raw == null) return m;
      return raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    });

    // 9. 검증된 SVG 복원
    html = html.replace(/(?:<p>\s*)?<div data-precision-svg="(\d+)"><\/div>(?:\s*<\/p>)?/g, (m, idxStr) => {
      const svgHtml = svgBlocks[Number(idxStr)] || '';
      if (!svgHtml) return '';
      return `<div class="book-diagram book-svg-diagram">${svgHtml}</div>`;
    });

    // 10. Mermaid 슬롯 복원 (data 속성에 안전하게 인코딩해 저장)
    html = html.replace(/(?:<p>\s*)?<div data-precision-mermaid="(\d+)"><\/div>(?:\s*<\/p>)?/g, (m, idxStr) => {
      const code = mermaidBlocks[Number(idxStr)] || '';
      if (!code) return '';
      return `<div class="book-diagram book-mermaid-slot" data-mermaid="${encodeURIComponent(code)}"></div>`;
    });

    // 11. 중복 래퍼 제거
    html = html.replace(/<div class="book-diagram">\s*(<div class="book-diagram[^>]*>[\s\S]*?<\/div>)\s*<\/div>/gi, '$1');

    return html;
  }

  /**
   * DOM에 삽입된 HTML 내부의 Mermaid와 KaTeX를 에러 없이 비동기 완료까지 렌더링 (멱등성 보장)
   * 인쇄(window.print) 호출 전에 반드시 await hydrateDiagrams(container)를 실행할 것
   */
  async function hydrateDiagrams(rootElement) {
    if (!rootElement) return;
    ensureMermaidInit();

    // 1. Mermaid 개별 격리 렌더링 (하나가 실패해도 나머지 다이어그램과 문서는 100% 정상 출력)
    const slots = rootElement.querySelectorAll('.book-mermaid-slot');
    for (const slot of slots) {
      if (slot.classList.contains('mermaid-rendered') || slot.classList.contains('book-diagram-fallback')) {
        continue;
      }
      const encoded = slot.getAttribute('data-mermaid');
      if (!encoded) continue;
      const code = decodeURIComponent(encoded);
      const uniqueId = `prec-mmd-${Date.now()}-${++renderSeq}`;

      if (typeof window.mermaid !== 'undefined' && typeof window.mermaid.render === 'function') {
        try {
          const result = await window.mermaid.render(uniqueId, code);
          const svgOutput = typeof result === 'string' ? result : (result && result.svg ? result.svg : '');
          if (svgOutput && !/class=["'][^"']*error-icon|Syntax error in text/i.test(svgOutput)) {
            slot.innerHTML = svgOutput;
            slot.classList.add('mermaid-rendered');
            continue;
          }
        } catch (err) {
          console.warn('[PrecisionModule] Mermaid render fallback:', err);
        }
        // Mermaid 실패 또는 에러 SVG 생성 시 body에 남는 임시 요소 즉시 청소
        const orphanErr = document.getElementById(uniqueId) || document.getElementById('d' + uniqueId);
        if (orphanErr) orphanErr.remove();
        document.querySelectorAll('body > [id^="dprec-mmd-"], body > [id^="prec-mmd-"]').forEach((el) => el.remove());
      }

      // 최후 폴백: 깨진 빨간 에러 아이콘 대신 깔끔한 구조 텍스트 박스로 표시
      slot.classList.add('book-diagram-fallback');
      slot.innerHTML = `<pre class="mermaid-fallback-code"><code>${code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
    }

    // 2. KaTeX 수식 안전 렌더링 (코드 블록 및 SVG 내부 제외)
    if (typeof window.renderMathInElement === 'function') {
      try {
        window.renderMathInElement(rootElement, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
          ],
          ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'svg', 'annotation', 'annotation-xml'],
          throwOnError: false,
          strict: false
        });
      } catch (e) {
        console.warn('[PrecisionModule] KaTeX render error:', e);
      }
    }
  }

  return {
    getPrompt,
    renderMarkdown,
    hydrateDiagrams
  };
})();
