'use strict';
const $ = id => document.getElementById(id);
const GOOGLE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const BAZE_URL = 'https://factchat-cloud.mindlogic.ai/v1/gateway';
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

/* ---------- 4단계 모델 등급 분류 및 가중치 ---------- */
const MODEL_TIERS = {
  flash: {
    grade: 1,
    prefix: '[🟢추천]',
    shortBadge: '🟢 추천',
    badge: '🟢 저비용 모델 · 추천',
    badgeColor: '#10b981',
    tooltip: '경량 모델입니다. 속도가 빠르고 소모되는 크레딧이 적습니다.',
    creditPer1kInput: 0.4,
    creditPer1kOutput: 1.2,
    secPerPage: 4.2,
    warn: false
  },
  standard: {
    grade: 2,
    prefix: '[🔵표준]',
    shortBadge: '🔵 표준',
    badge: '🔵 표준 모델',
    badgeColor: '#3b82f6',
    tooltip: '적당한 성능과 비용을 갖춘 밸런스가 뛰어난 모델입니다.',
    creditPer1kInput: 2.0,
    creditPer1kOutput: 6.0,
    secPerPage: 6.0,
    warn: false
  },
  high: {
    grade: 3,
    prefix: '[🟠고비용]',
    shortBadge: '🟠 고비용',
    badge: '🟠 고비용 모델',
    badgeColor: '#f59e0b',
    tooltip: '고비용 모델입니다. 저비용 모델보다 약 8~10배 많은 크레딧이 차감됩니다.',
    creditPer1kInput: 6.0,
    creditPer1kOutput: 18.0,
    secPerPage: 8.5,
    warn: true,
    warnText: '⚠️ 고비용 모델 주의! 저비용 모델보다 약 8~10배 많은 크레딧이 차감됩니다.'
  },
  ultra: {
    grade: 4,
    prefix: '[🔴초고비용]',
    shortBadge: '🔴 초고비용',
    badge: '🔴 초고비용 모델',
    badgeColor: '#ef4444',
    tooltip: '초고비용 모델입니다. 과도하게 많은 크레딧이 소모될 수 있어 사용을 권장하지 않습니다.',
    creditPer1kInput: 15.0,
    creditPer1kOutput: 45.0,
    secPerPage: 12.0,
    warn: true,
    warnText: '🚨 초고비용 모델 주의! 과도하게 많은 크레딧이 소모될 수 있어 사용을 권장하지 않습니다.'
  }
};

const GOOGLE_ROLE_META = {
  gen4_ultra:     { badge: '✦ Gemini 4 · 최상위 추론', badgeColor: '#8b5cf6', tooltip: '심층 추론과 고난도 수식·구조 복원에 최적화된 최상위 Gemini 4 모델입니다.' },
  gen4_high:      { badge: '✦ Gemini 4 · 고성능 균형',  badgeColor: '#6366f1', tooltip: '긴 문맥과 복잡한 기술 문서 OCR에 강한 고성능 Gemini 4 모델입니다.' },
  gen4_workhorse: { badge: '⚡ Gemini 4 · 고속 범용',   badgeColor: '#3b82f6', tooltip: '빠른 응답 속도와 높은 정확도를 겸비한 Gemini 4 범용 모델입니다.' },
  pro:            { badge: '◆ Gemini Pro · 고정밀',     badgeColor: '#3b82f6', tooltip: '복잡한 표·다단 레이아웃·수식 복원에 강점이 있는 정밀 Gemini Pro 모델입니다.' },
  flash:          { badge: '⚡ Gemini Flash · 고속 추천', badgeColor: '#10b981', tooltip: '대량 문서 OCR 변환에 최적화된 빠르고 효율적인 Gemini 경량 모델입니다.' },
  gemma:          { badge: '💎 Gemma · 오픈 멀티모달',   badgeColor: '#14b8a6', tooltip: 'Google AI Studio에서 제공하는 경량 오픈 멀티모달 모델입니다.' },
  default:        { badge: '✦ Google AI Studio',       badgeColor: '#3b82f6', tooltip: 'Google AI Studio Gemini API 모델입니다.' }
};

const SEC_PER_PAGE = m => getModelMeta(m).secPerPage;
const fmtInt = n => Math.round(n).toLocaleString('en-US');
const estimateTokens = t => { const cjk = (t.match(/[\u3040-\u30ff\u3131-\u318e\u4e00-\u9fff\uac00-\ud7a3]/g)||[]).length;
  return Math.ceil(cjk/1.5 + (t.length-cjk)/4); };

function estimateCredit(pages, model) {
  const meta = getModelMeta(model);
  const cost = Math.round(((pages * 0.65 * meta.creditPer1kInput) + (pages * 1.1 * meta.creditPer1kOutput)) * 10) / 10;
  return { cost, meta };
}

function updateModelBadgeAndTooltip(model) {
  const hasModel = Boolean(model);
  const meta = getModelMeta(model || DEFAULT_MODEL);
  const isGoogle = activeProvider === 'google';
  const uiMeta = isGoogle ? getGoogleDisplayMeta(model || DEFAULT_MODEL) : meta;

  const badge = $('modelBadge');
  if (badge) {
    if (!hasModel) {
      badge.textContent = '● 모델 선택';
      badge.style.background = '';
      badge.style.color = '';
      badge.style.border = '';
    } else {
      badge.textContent = uiMeta.badge;
      badge.style.background = uiMeta.badgeColor + '22';
      badge.style.color = uiMeta.badgeColor;
      badge.style.border = `1px solid ${uiMeta.badgeColor}`;
    }
  }
  const ttId = $('ttId');
  if (ttId) {
    if (hasModel) {
      ttId.textContent = `API: ${model}`;
      ttId.classList.remove('hidden');
    } else {
      ttId.textContent = '';
      ttId.classList.add('hidden');
    }
  }
  const ttDesc = $('ttDesc');
  const ttCost = $('ttCost');
  if (ttDesc) ttDesc.textContent = hasModel ? uiMeta.tooltip : 'API 키를 입력하면 사용 가능한 모델이 자동으로 불러와집니다.';
  if (ttCost) {
    if (!hasModel) {
      ttCost.textContent = '';
    } else if (isGoogle) {
      ttCost.textContent = `⚡ 페이지당 약 ${meta.secPerPage}초 · 토큰 기반 변환`;
    } else {
      const estPerPage = Math.round((0.65 * meta.creditPer1kInput + 1.1 * meta.creditPer1kOutput) * 10) / 10;
      ttCost.textContent = `⚡ 페이지당 약 ${estPerPage} 크레딧 차감 (1k토큰당 입: ${meta.creditPer1kInput} / 출: ${meta.creditPer1kOutput})`;
    }
  }

  const warn = $('costWarn');
  if (warn) {
    if (hasModel && meta.warn && !isGoogle) {
      warn.textContent = meta.warnText;
      warn.classList.remove('hidden');
    } else {
      warn.classList.add('hidden');
    }
  }
}

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
if (typeof mermaid !== 'undefined') mermaid.initialize({ startOnLoad:false, securityLevel:'loose', theme:'default' });

/* ---------- 설정 저장 (localStorage) ---------- */
const APP_DOC_TITLE = document.title;
const LS = 'pdfvec.settings.v2';
const state = { key:'', model:DEFAULT_MODEL, conc:'4', pgNum:'off', pgHeader:false, pgFooter:false, skin:'default', pvMode:'single', convMode:'standard' };
try { Object.assign(state, JSON.parse(localStorage.getItem(LS)||'{}')); } catch(e){}
const save = () => localStorage.setItem(LS, JSON.stringify(state));

/* ---------- 통합 모델 메타·토큰 파서 & 제공사별 분류 ---------- */
const modelRecordMap = new Map();

const VENDOR_CATALOG = [
  { key: 'openai',    label: 'OpenAI · GPT' },
  { key: 'anthropic', label: 'Anthropic · Claude' },
  { key: 'google',    label: 'Google · Gemini & Gemma' },
  { key: 'xai',       label: 'xAI · Grok' },
  { key: 'deepseek',  label: 'DeepSeek' },
  { key: 'alibaba',   label: 'Alibaba · Qwen' },
  { key: 'meta',      label: 'Meta · Llama' },
  { key: 'mistral',   label: 'Mistral' },
  { key: 'other',     label: '기타 모델' }
];
const VENDOR_RANK = Object.fromEntries(VENDOR_CATALOG.map((v, i) => [v.key, i]));
const VENDOR_LABEL = Object.fromEntries(VENDOR_CATALOG.map(v => [v.key, v.label]));

/* 제조사·패밀리 정적 SVG 브랜드 로고 (외부 입력 미삽입 · defs ID 미사용) */
const VENDOR_LOGOS = {
  openai: '<svg viewBox="0 0 24 24" fill="#10a37f" fill-rule="evenodd"><path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z"/></svg>',
  anthropic: '<svg viewBox="0 0 24 24" fill="none" stroke="#d97757" stroke-width="2" stroke-linecap="round"><path d="M12 3.2v17.6M3.2 12h17.6M5.8 5.8l12.4 12.4M18.2 5.8L5.8 18.2"/><circle cx="12" cy="12" r="2.3" fill="#d97757" stroke="none"/></svg>',
  gemini: '<svg viewBox="0 0 24 24" fill="none"><path d="M11.5 2.5C11.5 7.7 15.8 12 21 12C15.8 12 11.5 16.3 11.5 21.5C11.5 16.3 7.2 12 2 12C7.2 12 11.5 7.7 11.5 2.5Z" fill="#60a5fa"/><path d="M18.5 2.5C18.5 4.4 20 5.9 21.8 5.9C20 5.9 18.5 7.4 18.5 9.3C18.5 7.4 17 5.9 15.2 5.9C17 5.9 18.5 4.4 18.5 2.5Z" fill="#a78bfa"/></svg>',
  gemma: '<svg viewBox="0 0 24 24" fill="#2E96FF" fill-rule="evenodd"><path d="M12.34 5.953a8.233 8.233 0 01-.247-1.125V3.72a8.25 8.25 0 015.562 2.232H12.34zm-.69 0c.113-.373.199-.755.257-1.145V3.72a8.25 8.25 0 00-5.562 2.232h5.304zm-5.433.187h5.373a7.98 7.98 0 01-.267.696 8.41 8.41 0 01-1.76 2.65L6.216 6.14zm-.264-.187H2.977v.187h2.915a8.436 8.436 0 00-2.357 5.767H0v.186h3.535a8.436 8.436 0 002.357 5.767H2.977v.186h2.976v2.977h.187v-2.915a8.436 8.436 0 005.767 2.357V24h.186v-3.535a8.436 8.436 0 005.767-2.357v2.915h.186v-2.977h2.977v-.186h-2.915a8.436 8.436 0 002.357-5.767H24v-.186h-3.535a8.436 8.436 0 00-2.357-5.767h2.915v-.187h-2.977V2.977h-.186v2.915a8.436 8.436 0 00-5.767-2.357V0h-.186v3.535A8.436 8.436 0 006.14 5.892V2.977h-.187v2.976zm6.14 14.326a8.25 8.25 0 005.562-2.233H12.34c-.108.367-.19.743-.247 1.126v1.107zm-.186-1.087a8.015 8.015 0 00-.258-1.146H6.345a8.25 8.25 0 005.562 2.233v-1.087zm-8.186-7.285h1.107a8.23 8.23 0 001.125-.247V6.345a8.25 8.25 0 00-2.232 5.562zm1.087.186H3.72a8.25 8.25 0 002.232 5.562v-5.304a8.012 8.012 0 00-1.145-.258zm15.47-.186a8.25 8.25 0 00-2.232-5.562v5.315c.367.108.743.19 1.126.247h1.107zm-1.086.186c-.39.058-.772.144-1.146.258v5.304a8.25 8.25 0 002.233-5.562h-1.087zm-1.332 5.69V12.41a7.97 7.97 0 00-.696.267 8.409 8.409 0 00-2.65 1.76l3.346 3.346zm0-6.18v-5.45l-.012-.013h-5.451c.076.235.162.468.26.696a8.698 8.698 0 001.819 2.688 8.698 8.698 0 002.688 1.82c.228.097.46.183.696.259zM6.14 17.848V12.41c.235.078.468.167.696.267a8.403 8.403 0 012.688 1.799 8.404 8.404 0 011.799 2.688c.1.228.19.46.267.696H6.152l-.012-.012zm0-6.245V6.326l3.29 3.29a8.716 8.716 0 01-2.594 1.728 8.14 8.14 0 01-.696.259zm6.257 6.257h5.277l-3.29-3.29a8.716 8.716 0 00-1.728 2.594 8.135 8.135 0 00-.259.696zm-2.347-7.81a9.435 9.435 0 01-2.88 1.96 9.14 9.14 0 012.88 1.94 9.14 9.14 0 011.94 2.88 9.435 9.435 0 011.96-2.88 9.14 9.14 0 012.88-1.94 9.435 9.435 0 01-2.88-1.96 9.434 9.434 0 01-1.96-2.88 9.14 9.14 0 01-1.94 2.88z"/></svg>',
  google: '<svg viewBox="0 0 24 24" fill="none"><path d="M11.5 2.5C11.5 7.7 15.8 12 21 12C15.8 12 11.5 16.3 11.5 21.5C11.5 16.3 7.2 12 2 12C7.2 12 11.5 7.7 11.5 2.5Z" fill="#60a5fa"/><path d="M18.5 2.5C18.5 4.4 20 5.9 21.8 5.9C20 5.9 18.5 7.4 18.5 9.3C18.5 7.4 17 5.9 15.2 5.9C17 5.9 18.5 4.4 18.5 2.5Z" fill="#a78bfa"/></svg>',
  xai: '<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd"><path d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815"/></svg>',
  deepseek: '<svg viewBox="0 0 24 24" fill="#4D6BFE"><path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z"/></svg>',
  alibaba: '<svg viewBox="0 0 24 24" fill="#615CED" fill-rule="evenodd"><path d="M19.713 2.825h-5.907c0-.251-.066-.503-.196-.728L12.819.728A1.46 1.46 0 0 0 11.559 0h-1.58c-.52 0-1 .275-1.26.728l-2.42 4.19a1.45 1.45 0 0 0 0 1.453l.791 1.37c.26.448.74.727 1.26.727h11.36c.52 0 1-.275 1.26-.728l.79-1.37a1.45 1.45 0 0 0 0-1.451l-.79-1.37a1.46 1.46 0 0 0-1.26-.728zM.195 9.905l2.951 5.115a1.46 1.46 0 0 0-.531.531l-.791 1.37a1.45 1.45 0 0 0 0 1.452l.79 1.37c.26.448.74.727 1.26.727h4.84c.52 0 1-.275 1.26-.728l.79-1.37a1.45 1.45 0 0 0 0-1.451L5.086 7.083a1.46 1.46 0 0 0-1.26-.728h-1.58c-.52 0-1 .276-1.26.728l-.79 1.37a1.45 1.45 0 0 0 0 1.452m15.888 13.367 2.951-5.115c.217.125.469.196.728.196h1.582c.52 0 1-.275 1.26-.728l.79-1.37a1.45 1.45 0 0 0 0-1.451l-2.42-4.191a1.46 1.46 0 0 0-1.259-.728h-1.582c-.52 0-1 .276-1.259.728l-5.678 9.838a1.45 1.45 0 0 0 0 1.452l.79 1.37c.26.448.74.727 1.26.727h1.582c.52 0 1-.275 1.26-.728z"/></svg>',
  meta: '<svg viewBox="0 0 24 24" fill="#0082FB" fill-rule="evenodd"><path d="M6.897 4c1.915 0 3.516.932 5.43 3.376l.282-.373c.19-.246.383-.484.58-.71l.313-.35C14.588 4.788 15.792 4 17.225 4c1.273 0 2.469.557 3.491 1.516l.218.213c1.73 1.765 2.917 4.71 3.053 8.026l.011.392.002.25c0 1.501-.28 2.759-.818 3.7l-.14.23-.108.153c-.301.42-.664.758-1.086 1.009l-.265.142-.087.04a3.493 3.493 0 01-.302.118 4.117 4.117 0 01-1.33.208c-.524 0-.996-.067-1.438-.215-.614-.204-1.163-.56-1.726-1.116l-.227-.235c-.753-.812-1.534-1.976-2.493-3.586l-1.43-2.41-.544-.895-1.766 3.13-.343.592C7.597 19.156 6.227 20 4.356 20c-1.21 0-2.205-.42-2.936-1.182l-.168-.184c-.484-.573-.837-1.311-1.043-2.189l-.067-.32a8.69 8.69 0 01-.136-1.288L0 14.468c.002-.745.06-1.49.174-2.23l.1-.573c.298-1.53.828-2.958 1.536-4.157l.209-.34c1.177-1.83 2.789-3.053 4.615-3.16L6.897 4zm-.033 2.615l-.201.01c-.83.083-1.606.673-2.252 1.577l-.138.199-.01.018c-.67 1.017-1.185 2.378-1.456 3.845l-.004.022a12.591 12.591 0 00-.207 2.254l.002.188c.004.18.017.36.04.54l.043.291c.092.503.257.908.486 1.208l.117.137c.303.323.698.492 1.17.492 1.1 0 1.796-.676 3.696-3.641l2.175-3.4.454-.701-.139-.198C9.11 7.3 8.084 6.616 6.864 6.616zm10.196-.552l-.176.007c-.635.048-1.223.359-1.82.933l-.196.198c-.439.462-.887 1.064-1.367 1.807l.266.398c.18.274.362.56.55.858l.293.475 1.396 2.335.695 1.114c.583.926 1.03 1.6 1.408 2.082l.213.262c.282.326.529.54.777.673l.102.05c.227.1.457.138.718.138.176.002.35-.023.518-.073.338-.104.61-.32.813-.637l.095-.163.077-.162c.194-.459.29-1.06.29-1.785l-.006-.449c-.08-2.871-.938-5.372-2.2-6.798l-.176-.189c-.67-.683-1.444-1.074-2.27-1.074z"/></svg>',
  mistral: '<svg viewBox="0 0 24 24"><path d="M3.428 3.4h3.429v3.428H3.428V3.4zm13.714 0h3.43v3.428h-3.43V3.4z" fill="#FFD800"/><path d="M3.428 6.828h6.857v3.429H3.429V6.828zm10.286 0h6.857v3.429h-6.857V6.828z" fill="#FFAF00"/><path d="M3.428 10.258h17.144v3.428H3.428v-3.428z" fill="#FF8205"/><path d="M3.428 13.686h3.429v3.428H3.428v-3.428zm6.858 0h3.429v3.428h-3.429v-3.428zm6.856 0h3.43v3.428h-3.43v-3.428z" fill="#FA500F"/><path d="M0 17.114h10.286v3.429H0v-3.429zm13.714 0H24v3.429H13.714v-3.429z" fill="#E10500"/></svg>',
  other: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><polygon points="12 3 20 7.5 20 16.5 12 21 4 16.5 4 7.5"/><circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none"/></svg>'
};

const UNUSABLE_TOKENS = new Set([
  'tts', 'whisper', 'stt', 'audio', 'voice', 'live', 'realtime', 'dialog',
  'music', 'imagen', 'flux', 'midjourney', 'diffusion', 'sdxl', 'ideogram',
  'recraft', 'firefly', 'sora', 'veo', 'kling', 'runway', 'luma', 'pika',
  'hailuo', 'seedance', 'seedream', 'suno', 'udio', 'lyria', 'wan',
  'moderation', 'robotics', 'customtools', 'cyber', 'aqa', 'learnlm',
  'shieldgemma', 'codegemma', 'recurrentgemma', 'paligemma', 'pt',
  'image', 'video', 'banana',
  // 의미 없는 비-OCR 파생·전용 엔드포인트 토큰
  'decision', 'decisions', 'search', 'research', 'transcribe', 'translate',
  'codex', 'codestral', 'devstral', 'coder',
  'guard', 'shield', 'safeguard', 'reward', 'eval', 'judge', 'classifier',
  'batch', 'flex', 'priority', 'cached', 'computer', 'operator', 'cua',
  'babbage', 'davinci', 'curie', 'ada', 'exp', 'experimental', 'thinking'
]);
const UNUSABLE_COMPOUND_RE = /embed|rerank|transcri|dall[-_]?e|gpt-image|stable-?image|native-audio|computer-use|deep-research|nano-banana|omni-moderation|text-moderation|realtime-preview|turbo-instruct|code-search/;
const GOOGLE_NOISE_TOKENS = new Set([
  'latest', 'exp', 'experimental', 'thinking', 'tuning', 'tuned',
  'search', 'research', 'translate', 'antigravity'
]);

const normalizeModelId = input => {
  const rawId = typeof input === 'string' ? input : (input?.id || input?.name || '');
  return String(rawId).replace(/^models\//, '').trim();
};

function resolveVendor(ownedBy, namespace, shortId, tokenSet, wordSet) {
  const words = wordSet || tokenSet;
  // 1순위: 모델 ID 선두 패밀리명 (가장 확실한 제조사 판별)
  if (/^claude/.test(shortId)) return 'anthropic';
  if (/^(gemini|gemma|imagen|veo|learnlm|aqa)/.test(shortId)) return 'google';
  if (/^(gpt|chatgpt|sora|dall|whisper|o[1345](?:$|-|\.))/.test(shortId)) return 'openai';
  if (/^grok/.test(shortId)) return 'xai';
  if (/^deepseek/.test(shortId)) return 'deepseek';
  if (/^qwen/.test(shortId)) return 'alibaba';
  if (/^llama/.test(shortId)) return 'meta';
  if (/^(mistral|mixtral|pixtral|codestral|ministral)/.test(shortId)) return 'mistral';

  // 2순위: 리전·리셀러 접두사가 붙은 ID 내부의 브랜드 토큰 (예: us.deepseek.r1, vertex-deepseek)
  if (words.has('claude')) return 'anthropic';
  if (words.has('gemini') || words.has('gemma')) return 'google';
  if (words.has('gpt') || words.has('chatgpt')) return 'openai';
  if (words.has('grok')) return 'xai';
  if (words.has('deepseek')) return 'deepseek';
  if (words.has('qwen')) return 'alibaba';
  if (words.has('llama')) return 'meta';
  if (words.has('mistral') || words.has('mixtral') || words.has('pixtral') || words.has('codestral') || words.has('ministral')) return 'mistral';

  // 3순위: 제조사명이 생략된 고유 티어 코드명만 남았을 때 (flash 같은 범용 티어명은 Google 추론에서 제외)
  if (words.has('haiku') || words.has('sonnet') || words.has('opus') || words.has('fable')) return 'anthropic';
  if (words.has('argon') || words.has('carbon') || words.has('hydrogen')) return 'google';
  if (words.has('luna') || words.has('terra') || words.has('sol') || words.has('astra')) return 'openai';

  // 4순위: 네임스페이스·소유자 메타 힌트
  const hint = `${namespace} ${ownedBy}`;
  if (/anthropic/.test(hint)) return 'anthropic';
  if (/google|deepmind/.test(hint)) return 'google';
  if (/xai|x-ai/.test(hint)) return 'xai';
  if (/deepseek/.test(hint)) return 'deepseek';
  if (/alibaba|qwen/.test(hint)) return 'alibaba';
  if (/meta/.test(hint)) return 'meta';
  if (/mistral/.test(hint)) return 'mistral';
  if (/\bopenai\b/.test(hint) && !/mindlogic|system/.test(hint)) return 'openai';
  return 'other';
}

function resolveFamily(shortId, vendorKey) {
  if (/^gemini/.test(shortId)) return 'gemini';
  if (/^gemma/.test(shortId)) return 'gemma';
  if (/^claude/.test(shortId) || vendorKey === 'anthropic') return 'claude';
  if (/^o[1345](?:$|-)/.test(shortId)) return 'o-series';
  if (/^(gpt|chatgpt)/.test(shortId) || vendorKey === 'openai') return 'gpt';
  if (/^grok/.test(shortId) || vendorKey === 'xai') return 'grok';
  if (/^deepseek/.test(shortId) || vendorKey === 'deepseek') return 'deepseek';
  if (/^qwen/.test(shortId) || vendorKey === 'alibaba') return 'qwen';
  if (/^llama/.test(shortId) || vendorKey === 'meta') return 'llama';
  if (/^(mistral|mixtral|pixtral|ministral)/.test(shortId) || vendorKey === 'mistral') return 'mistral';
  return 'other';
}

function extractVersionAndParams(shortId, tokens) {
  let paramB = 0;
  let dateScore = 0;
  let major = 0, minor = 0, foundVer = false;

  const dm = shortId.match(/(?:^|-)((?:20\d{2})-?\d{2}-?\d{2}|20\d{6})(?:-|$)/);
  if (dm) dateScore = parseInt(dm[1].replace(/-/g, ''), 10) || 0;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const pm = t.match(/^e?(\d+(?:\.\d+)?)([bm])$/);
    if (pm) {
      const val = parseFloat(pm[1]) * (pm[2] === 'm' ? 0.001 : 1);
      if (val > paramB) paramB = val;
      continue;
    }
    if (/^20\d{6}$/.test(t) || /^20\d{2}$/.test(t)) continue;
    if (foundVer) continue;

    if (t === '4o') {
      major = 4; minor = 0.5; foundVer = true;
    } else if (/^o(\d+)(?:\.(\d+))?$/.test(t)) {
      const om = t.match(/^o(\d+)(?:\.(\d+))?$/);
      major = parseInt(om[1], 10);
      minor = parseInt(om[2] || '0', 10);
      foundVer = true;
    } else if (/^(?:qwen|llama|grok|mistral|pixtral|ministral|magistral|mixtral|deepseek|gemma|gemini)?v?(\d+)(?:\.(\d+))?n?$/.test(t)) {
      const vm = t.match(/^(?:qwen|llama|grok|mistral|pixtral|ministral|magistral|mixtral|deepseek|gemma|gemini)?v?(\d+)(?:\.(\d+))?n?$/);
      const n1 = parseInt(vm[1], 10);
      if (n1 >= 20) continue;
      major = n1;
      if (vm[2] != null) {
        minor = parseInt(vm[2], 10);
      } else if (tokens[i + 1] && /^\d{1,2}$/.test(tokens[i + 1]) && parseInt(tokens[i + 1], 10) < 20) {
        minor = parseInt(tokens[i + 1], 10);
      }
      foundVer = true;
    }
  }

  return { major, minor, score: major * 100 + minor, paramB, dateScore };
}

function parseModelRecord(input) {
  const id = normalizeModelId(input);
  const raw = (input && typeof input === 'object' && input.raw)
    ? input.raw
    : ((input && typeof input === 'object' && ('id' in input || 'name' in input)) ? input : (modelRecordMap.get(id) || {}));
  const ownedBy = String(raw.owned_by || raw.owner || '').toLowerCase();
  const slashIdx = id.lastIndexOf('/');
  const namespace = slashIdx > 0 ? id.slice(0, slashIdx).toLowerCase() : '';
  const shortId = (slashIdx > 0 ? id.slice(slashIdx + 1) : id).toLowerCase();
  const tokens = shortId.replace(/\.([a-z])/g, '-$1').split(/[-_/:@]+/).filter(Boolean);
  const tokenSet = new Set(tokens);
  const wordSet = new Set(shortId.split(/[-_/:@.]+/).filter(Boolean));
  const vendorKey = resolveVendor(ownedBy, namespace, shortId, tokenSet, wordSet);
  const family = resolveFamily(shortId, vendorKey);
  const { major, minor, score, paramB, dateScore } = extractVersionAndParams(shortId, tokens);

  return {
    id,
    raw,
    ownedBy,
    namespace,
    shortId,
    tokens,
    tokenSet,
    vendorKey,
    vendorLabel: VENDOR_LABEL[vendorKey] || '기타 모델',
    vendorRank: VENDOR_RANK[vendorKey] ?? VENDOR_RANK.other,
    family,
    major,
    minor,
    versionScore: score,
    paramB,
    dateScore
  };
}

function isNonTextMeta(o) {
  if (!o || typeof o !== 'object') return false;
  if (Array.isArray(o.supportedGenerationMethods) && o.supportedGenerationMethods.length &&
      !o.supportedGenerationMethods.includes('generateContent')) return true;
  const kind = String(o.type || o.mode || o.category || o.object_type || '').toLowerCase();
  if (kind && /image|video|audio|speech|embed|rerank|moderation|tts|transcri/.test(kind)) return true;
  const outs = o.output_modalities || o.architecture?.output_modalities || o.modalities?.output;
  if (Array.isArray(outs) && outs.length && !outs.map(x => String(x).toLowerCase()).includes('text')) return true;
  const cap = o.capabilities;
  if (cap && typeof cap === 'object' && !Array.isArray(cap) && ('chat' in cap || 'text' in cap) && !cap.chat && !cap.text) return true;
  return false;
}

function isUnusableOcrModel(parsed) {
  if (isNonTextMeta(parsed.raw)) return true;
  if (UNUSABLE_COMPOUND_RE.test(parsed.shortId)) return true;
  for (const t of parsed.tokens) {
    if (UNUSABLE_TOKENS.has(t)) return true;
  }
  // 이미지 입력이 불가능한 구세대 채팅 계열 제외 (GPT <4, Claude <3, Gemma <3)
  if (parsed.family === 'gpt' && parsed.major > 0 && parsed.major < 4) return true;
  if (parsed.family === 'claude' && parsed.major > 0 && parsed.major < 3) return true;
  if (parsed.family === 'gemma' && parsed.major > 0 && parsed.major < 3) return true;
  return false;
}

function joinDigitMinorTokens(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^\d{1,2}$/.test(t) && i + 1 < tokens.length && /^\d{1,2}$/.test(tokens[i + 1])) {
      const nextNum = parseInt(tokens[i + 1], 10);
      if (parseInt(t, 10) < 20 && nextNum < 20) {
        out.push(`${t}.${tokens[i + 1]}`);
        i++;
        continue;
      }
    }
    out.push(t);
  }
  return out;
}

const DISPLAY_WORD_MAP = {
  gpt: 'GPT', chatgpt: 'ChatGPT', gemini: 'Gemini', gemma: 'Gemma',
  claude: 'Claude', grok: 'Grok', deepseek: 'DeepSeek', qwen: 'Qwen',
  llama: 'Llama', mistral: 'Mistral', mixtral: 'Mixtral', pixtral: 'Pixtral',
  sonnet: 'Sonnet', haiku: 'Haiku', opus: 'Opus', fable: 'Fable',
  luna: 'Luna', terra: 'Terra', sol: 'Sol', astra: 'Astra',
  carbon: 'Carbon', argon: 'Argon', hydrogen: 'Hydrogen',
  pro: 'Pro', flash: 'Flash', lite: 'Lite', mini: 'Mini', nano: 'Nano',
  ultra: 'Ultra', max: 'Max', plus: 'Plus', heavy: 'Heavy', fast: 'Fast',
  turbo: 'Turbo', chat: 'Chat', reasoner: 'Reasoner', vision: 'Vision',
  large: 'Large', medium: 'Medium', small: 'Small', maverick: 'Maverick',
  scout: 'Scout', vl: 'VL', omni: 'Omni', ai: 'AI', hd: 'HD'
};

function formatDisplayToken(t) {
  const low = t.toLowerCase();
  if (DISPLAY_WORD_MAP[low]) return DISPLAY_WORD_MAP[low];
  if (/^gpt4o$/.test(low)) return 'GPT-4o';
  if (/^o\d/.test(low)) return low;
  if (/^(?:e?\d+(?:\.\d+)?[bm]|a\d+(?:\.\d+)?b|\d+e)$/.test(low)) return low.toUpperCase();
  if (/^v\d/.test(low)) return low.toUpperCase();
  if (/^r\d+$/.test(low)) return low.toUpperCase();
  if (/^\d+(?:\.\d+)?[a-z]?$/.test(low)) return low;
  if (/^[a-z]/.test(low)) return low[0].toUpperCase() + low.slice(1);
  return t;
}

/** API 모델 ID를 사용자 친화적 깔끔한 표시 이름과 메타(Preview/로고 키)로 변환 */
function formatModelDisplayName(modelId, rawRecord) {
  const parsed = parseModelRecord(rawRecord ? { id: modelId, raw: rawRecord } : modelId);
  let working = parsed.shortId;
  let isPreview = false;
  let compactDate = '';

  const dateMatch = working.match(/(?:-|@)((20\d{2})-?(\d{2})(?:-?\d{2})?)(?=$|-)/);
  if (dateMatch) {
    compactDate = `${dateMatch[2]}-${dateMatch[3]}`;
    working = working.replace(dateMatch[0], '');
  }
  if (/(?:^|-)preview(?=$|-)/i.test(working)) {
    isPreview = true;
    working = working.replace(/-preview(?=$|-)/gi, '');
  }
  working = working
    .replace(/-chat-latest$/i, '')
    .replace(/-latest$/i, '')
    .replace(/-instruct$/i, '')
    .replace(/-it$/i, '');

  const rawTokens = working.split(/[-_]+/).filter(Boolean);
  let label = '';

  if (parsed.family === 'gemini') {
    const toks = joinDigitMinorTokens(rawTokens.slice(1));
    const joined = toks.map(formatDisplayToken).join(' ').replace(/\bFlash Lite\b/g, 'Flash-Lite');
    label = `Gemini ${joined}`.trim();
  } else if (parsed.family === 'gemma') {
    const toks = joinDigitMinorTokens(rawTokens.slice(1));
    const verPart = [];
    const specPart = [];
    for (const t of toks) {
      if (!specPart.length && /^\d+(?:\.\d+)?[a-z]?$/i.test(t) && !/[bm]$/i.test(t)) verPart.push(t);
      else specPart.push(formatDisplayToken(t));
    }
    const verStr = verPart.length ? `Gemma ${verPart.join(' ')}` : 'Gemma';
    label = specPart.length ? `${verStr} · ${specPart.join(' ')}` : verStr;
  } else if (parsed.family === 'claude') {
    const rest = joinDigitMinorTokens(rawTokens.slice(1));
    const tierToks = [];
    const verToks = [];
    const otherToks = [];
    for (const t of rest) {
      if (/^(sonnet|haiku|opus|fable)$/i.test(t)) tierToks.push(formatDisplayToken(t));
      else if (/^\d+(?:\.\d+)?$/.test(t)) verToks.push(t);
      else otherToks.push(formatDisplayToken(t));
    }
    const majNum = parseFloat(verToks[0] || '0') || parsed.major || 0;
    const head = (tierToks.length && verToks.length)
      ? (majNum >= 4 ? `Claude ${tierToks.join(' ')} ${verToks.join('.')}` : `Claude ${verToks.join('.')} ${tierToks.join(' ')}`)
      : `Claude ${rest.map(formatDisplayToken).join(' ')}`;
    label = [head, ...otherToks].filter(Boolean).join(' ').trim();
  } else if (parsed.family === 'gpt' || parsed.family === 'o-series') {
    if (rawTokens[0] === 'gpt' && rawTokens.length > 1) {
      const rest = joinDigitMinorTokens(rawTokens.slice(1));
      const ver = formatDisplayToken(rest[0]);
      const tail = rest.slice(1).map(formatDisplayToken).join(' ');
      label = tail ? `GPT-${ver} ${tail}` : `GPT-${ver}`;
    } else if (rawTokens[0] === 'chatgpt' && rawTokens.length > 1) {
      const rest = joinDigitMinorTokens(rawTokens.slice(1));
      label = `ChatGPT-${rest.map(formatDisplayToken).join(' ')}`;
    } else if (/^o\d/.test(rawTokens[0])) {
      const tail = rawTokens.slice(1).map(formatDisplayToken).join(' ');
      label = tail ? `${rawTokens[0]} ${tail}` : rawTokens[0];
    }
  }

  if (!label) {
    const expanded = [];
    for (const t of joinDigitMinorTokens(rawTokens)) {
      const qm = t.match(/^(qwen|llama|grok|deepseek)(\d+(?:\.\d+)?)$/i);
      if (qm) { expanded.push(qm[1], qm[2]); continue; }
      expanded.push(t);
    }
    const fmtParts = [];
    const paramParts = [];
    for (const t of expanded) {
      if (/^(?:e?\d+(?:\.\d+)?[bm]|a\d+(?:\.\d+)?b|\d+e)$/i.test(t)) paramParts.push(formatDisplayToken(t));
      else fmtParts.push(formatDisplayToken(t));
    }
    const base = fmtParts.join(' ').trim();
    label = paramParts.length && base ? `${base} · ${paramParts.join(' ')}` : (base || paramParts.join(' '));
  }

  if (!label) label = String(parsed.raw?.display_name || parsed.raw?.displayName || modelId);

  const iconKey = parsed.family === 'gemma' ? 'gemma'
    : (parsed.family === 'gemini' && activeProvider === 'google' ? 'gemini' : parsed.vendorKey);

  return { id: modelId, label, isPreview, compactDate, iconKey };
}

function buildUniqueDisplayMap(modelIds) {
  const map = new Map();
  const counts = new Map();
  const entries = modelIds.map(id => formatModelDisplayName(id));

  for (const e of entries) {
    const key = `${e.label}|${e.isPreview ? 1 : 0}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const secondCounts = new Map();
  for (const e of entries) {
    const key = `${e.label}|${e.isPreview ? 1 : 0}`;
    if (counts.get(key) > 1 && e.compactDate) {
      e.label = `${e.label} (${e.compactDate})`;
    }
    const k2 = `${e.label}|${e.isPreview ? 1 : 0}`;
    secondCounts.set(k2, (secondCounts.get(k2) || 0) + 1);
  }
  for (const e of entries) {
    const k2 = `${e.label}|${e.isPreview ? 1 : 0}`;
    if (secondCounts.get(k2) > 1) {
      const shortRaw = e.id.includes('/') ? e.id.split('/').pop() : e.id;
      e.label = `${e.label} (${shortRaw})`;
    }
    map.set(e.id, e);
  }
  return map;
}

function inferTierFromPricing(raw) {
  const p = raw?.pricing || raw?.cost;
  if (!p || typeof p !== 'object') return null;
  const outRaw = Number(p.completion ?? p.output ?? p.output_per_1m ?? p.output_cost);
  if (!(outRaw > 0)) return null;
  const outPer1M = outRaw < 0.01 ? outRaw * 1e6 : outRaw;
  if (outPer1M >= 25) return 'ultra';
  if (outPer1M >= 10) return 'high';
  if (outPer1M >= 4)  return 'standard';
  return 'flash';
}

function classifyModelTier(parsed) {
  const { vendorKey, family, tokenSet, paramB, raw } = parsed;
  let tierKey = 'standard';
  let subRank = 5;

  if (vendorKey === 'openai') {
    if (tokenSet.has('astra')) { tierKey = 'ultra'; subRank = 10; }
    else if (tokenSet.has('pro')) { tierKey = 'ultra'; subRank = 9; }
    else if (tokenSet.has('max')) { tierKey = 'ultra'; subRank = 8; }
    else if (tokenSet.has('sol')) { tierKey = 'high'; subRank = 7; }
    else if (family === 'o-series') { tierKey = 'high'; subRank = 6; }
    else if (tokenSet.has('terra')) { tierKey = 'standard'; subRank = 5; }
    else if (tokenSet.has('flash') || tokenSet.has('lite')) { tierKey = 'flash'; subRank = 4; }
    else if (tokenSet.has('mini')) { tierKey = 'flash'; subRank = 3; }
    else if (tokenSet.has('luna')) { tierKey = 'flash'; subRank = 2; }
    else if (tokenSet.has('nano')) { tierKey = 'flash'; subRank = 1; }
    else { tierKey = 'standard'; subRank = 6; }
  } else if (vendorKey === 'anthropic') {
    if (tokenSet.has('fable')) { tierKey = 'ultra'; subRank = 4; }
    else if (tokenSet.has('opus')) { tierKey = 'high'; subRank = 3; }
    else if (tokenSet.has('haiku')) { tierKey = 'flash'; subRank = 1; }
    else { tierKey = 'standard'; subRank = 2; }
  } else if (vendorKey === 'google') {
    if (tokenSet.has('carbon') || tokenSet.has('ultra')) { tierKey = 'ultra'; subRank = 6; }
    else if (tokenSet.has('argon')) { tierKey = 'high'; subRank = 5; }
    else if (tokenSet.has('pro')) { tierKey = 'standard'; subRank = 4; }
    else if (tokenSet.has('hydrogen')) { tierKey = 'standard'; subRank = 3; }
    else if (tokenSet.has('lite') || tokenSet.has('nano')) { tierKey = 'flash'; subRank = 1; }
    else if (tokenSet.has('flash')) { tierKey = 'flash'; subRank = 2; }
    else if (family === 'gemma') { tierKey = 'flash'; subRank = 3; }
    else { tierKey = 'standard'; subRank = 4; }
  } else {
    if (tokenSet.has('ultra') || tokenSet.has('heavy')) { tierKey = 'ultra'; subRank = 1; }
    else if (tokenSet.has('opus') || tokenSet.has('argon') || tokenSet.has('sol') || tokenSet.has('405b')) { tierKey = 'high'; subRank = 1; }
    else if (tokenSet.has('lite') || tokenSet.has('nano')) { tierKey = 'flash'; subRank = 1; }
    else if (tokenSet.has('flash') || tokenSet.has('mini') || tokenSet.has('fast') || tokenSet.has('haiku') || tokenSet.has('small')) { tierKey = 'flash'; subRank = 2; }
    else if (family === 'deepseek' && tokenSet.has('chat') && !tokenSet.has('pro')) { tierKey = 'flash'; subRank = 3; }
    else if (paramB > 0 && paramB <= 14) { tierKey = 'flash'; subRank = 4; }
    else { tierKey = 'standard'; subRank = 2; }
  }

  // API 가격 정보가 있더라도 동일 등급 내부 정렬을 위한 role 기반 subRank는 보존
  const finalTierKey = inferTierFromPricing(raw) || tierKey;
  return { tierKey: finalTierKey, meta: MODEL_TIERS[finalTierKey], subRank };
}

function getModelMeta(modelId, rawRecord) {
  const parsed = parseModelRecord(rawRecord ? { id: modelId, raw: rawRecord } : modelId);
  return classifyModelTier(parsed).meta;
}

function getGoogleDisplayMeta(modelId) {
  const { family, major, tokenSet } = parseModelRecord(modelId);
  if (family === 'gemma') return GOOGLE_ROLE_META.gemma;
  if (major >= 4) {
    if (tokenSet.has('carbon') || tokenSet.has('ultra')) return GOOGLE_ROLE_META.gen4_ultra;
    if (tokenSet.has('argon')) return GOOGLE_ROLE_META.gen4_high;
    if (tokenSet.has('hydrogen') || tokenSet.has('flash')) return GOOGLE_ROLE_META.gen4_workhorse;
  }
  if (tokenSet.has('flash') || tokenSet.has('lite')) return GOOGLE_ROLE_META.flash;
  if (tokenSet.has('pro')) return GOOGLE_ROLE_META.pro;
  return GOOGLE_ROLE_META.default;
}

function parseGoogleCanonical(parsed) {
  const { shortId, family, tokens, paramB } = parsed;
  if (family !== 'gemini' && family !== 'gemma') return null;
  if (isUnusableOcrModel(parsed)) return null;
  for (const t of tokens) {
    if (GOOGLE_NOISE_TOKENS.has(t)) return null;
  }
  if (/\b20\d{2}\b|-\d{2}-\d{4}(?:-|$)|-\d{3}$/.test(shortId)) return null;

  if (family === 'gemma') {
    const gm = shortId.match(/^gemma-(\d+(?:\.\d+)?)[a-z]?-([a-z0-9-]+)-it$/);
    if (!gm) return null;
    const major = parseFloat(gm[1]);
    if (major < 3) return null;
    const minParamB = major >= 4 ? 2 : 4;
    if (paramB > 0 && paramB < minParamB) return null;
    return {
      parsed,
      canonicalKey: shortId,
      family: 'gemma',
      major: Math.floor(major),
      minor: 0,
      role: 'gemma',
      perfRank: paramB || 10,
      isPreview: false
    };
  }

  // Gemini 표준 티어형: gemini-<ver>-(pro|flash-lite|flash)[-preview]
  const tm = shortId.match(/^gemini-(\d+(?:\.\d+)?)-(pro|flash-lite|flash)(?:-(preview))?$/);
  if (tm) {
    const ver = parseFloat(tm[1]);
    if (ver < 2.5) return null;
    const [majS, minS] = tm[1].split('.');
    const role = tm[2];
    const roleRank = role === 'pro' ? 3 : (role === 'flash' ? 2 : 1);
    return {
      parsed,
      canonicalKey: `gemini-${tm[1]}-${role}`,
      family: 'gemini',
      major: parseInt(majS, 10),
      minor: parseInt(minS || '0', 10),
      role,
      perfRank: roleRank,
      isPreview: Boolean(tm[3])
    };
  }

  // Gemini 4+ 원소형: gemini-4-(carbon|argon|hydrogen)[-preview]
  const em = shortId.match(/^gemini-(\d+(?:\.\d+)?)-([a-z]+)(?:-(preview))?$/);
  if (em) {
    const ver = parseFloat(em[1]);
    if (ver < 4) return null;
    const elem = em[2];
    if (UNUSABLE_TOKENS.has(elem) || GOOGLE_NOISE_TOKENS.has(elem) || elem === 'preview') return null;
    const [majS, minS] = em[1].split('.');
    const elemPerf = { carbon: 3, argon: 2, hydrogen: 1 };
    return {
      parsed,
      canonicalKey: `gemini-${em[1]}-${elem}`,
      family: 'gemini',
      major: parseInt(majS, 10),
      minor: parseInt(minS || '0', 10),
      role: elem,
      perfRank: elemPerf[elem] ?? 2,
      isPreview: Boolean(em[3])
    };
  }

  return null;
}

function buildGoogleModelGroups(records) {
  const seen = new Set();
  const candidates = [];
  for (const rec of records) {
    const p = parseModelRecord(rec);
    if (!p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    const canon = parseGoogleCanonical(p);
    if (canon) candidates.push(canon);
  }

  // 정식 모델이 함께 존재하면 -preview 중복 제거 (정식 없는 경우엔 preview 유지)
  const stableKeys = new Set(candidates.filter(c => !c.isPreview).map(c => c.canonicalKey));
  const deduped = candidates.filter(c => !c.isPreview || !stableKeys.has(c.canonicalKey));

  // Gemini 3.x 세대교체 구간 정리: 동일 role(pro/flash/flash-lite) 중 최신 minor만 유지
  const maxMinorByRole = new Map();
  for (const c of deduped) {
    if (c.family === 'gemini' && c.major === 3) {
      const prev = maxMinorByRole.get(c.role) ?? -1;
      if (c.minor > prev) maxMinorByRole.set(c.role, c.minor);
    }
  }
  const cleanList = deduped.filter(c => {
    if (c.family === 'gemini' && c.major === 3) {
      return c.minor === maxMinorByRole.get(c.role);
    }
    return true;
  });

  // 세대·성능 순 그룹화 (비용 등급 표기 없이)
  const bucketMap = new Map();
  for (const c of cleanList) {
    let gKey, gLabel, gOrder;
    if (c.family === 'gemma') {
      gKey = 'gemma';
      gLabel = 'Gemma (오픈 멀티모달)';
      gOrder = 100;
    } else {
      const verLabel = c.major >= 4 ? `Gemini ${c.major} (최신 세대)`
        : (c.major === 2 && c.minor === 5 ? 'Gemini 2.5 (안정 세대)' : `Gemini ${c.major}`);
      gKey = `gemini-${c.major}-${c.major === 2 ? c.minor : 0}`;
      gLabel = verLabel;
      gOrder = -(c.major * 100 + (c.major === 2 ? c.minor : 0));
    }
    if (!bucketMap.has(gKey)) bucketMap.set(gKey, { key: gKey, label: gLabel, order: gOrder, items: [] });
    bucketMap.get(gKey).items.push(c);
  }

  const groups = [...bucketMap.values()]
    .sort((a, b) => a.order - b.order)
    .map(g => {
      g.items.sort((a, b) => {
        if (b.major !== a.major) return b.major - a.major;
        if (b.perfRank !== a.perfRank) return b.perfRank - a.perfRank;
        if (b.parsed.versionScore !== a.parsed.versionScore) return b.parsed.versionScore - a.parsed.versionScore;
        return a.parsed.id.localeCompare(b.parsed.id);
      });
      return {
        label: g.label,
        iconKey: g.key === 'gemma' ? 'gemma' : 'gemini',
        models: g.items.map(c => c.parsed.id)
      };
    });

  return { groups, flatIds: groups.flatMap(g => g.models) };
}

const COHORT_MIN_CUTOFF = {
  'openai:gpt': 5,
  'anthropic:claude': 4,
  'google:gemma': 3,
  'xai:grok': 3,
  'deepseek:v': 3,
  'alibaba:qwen': 3,
  'meta:llama': 3
};

const PARAM_PRESERVE_COHORTS = new Set([
  'google:gemma', 'alibaba:qwen', 'meta:llama', 'deepseek:v', 'deepseek:r'
]);

function extractBazeLineage(parsed) {
  const { vendorKey, family, shortId, tokens, paramB, dateScore } = parsed;
  let { major, minor, versionScore } = parsed;
  const isPreview = /(?:^|[-_.])(?:preview|beta)(?:$|[-_.])/.test(shortId);

  let cohort = `${vendorKey}:other`;
  if (vendorKey === 'openai') {
    cohort = family === 'o-series' ? 'openai:o' : 'openai:gpt';
  } else if (vendorKey === 'anthropic') {
    cohort = 'anthropic:claude';
  } else if (vendorKey === 'google') {
    cohort = family === 'gemma' ? 'google:gemma' : 'google:gemini';
  } else if (vendorKey === 'xai') {
    cohort = 'xai:grok';
  } else if (vendorKey === 'deepseek') {
    const rm = shortId.match(/(?:^|[./:-])deepseek[-.]r(\d+)(?:\.(\d+))?/);
    if (rm) {
      cohort = 'deepseek:r';
      if (major === 0) {
        major = parseInt(rm[1], 10);
        minor = parseInt(rm[2] || '0', 10);
        versionScore = major * 100 + minor;
      }
    } else if (/(?:^|[./:-])deepseek[-.]v\d+/.test(shortId)) {
      cohort = 'deepseek:v';
    } else {
      cohort = 'deepseek:alias';
    }
  } else if (vendorKey === 'alibaba') {
    cohort = /^qwq/.test(shortId) ? 'alibaba:qwq' : 'alibaba:qwen';
  } else if (vendorKey === 'meta') {
    cohort = 'meta:llama';
  } else if (vendorKey === 'mistral') {
    const mm = shortId.match(/^(ministral|mixtral|pixtral|magistral|mistral)/);
    cohort = `mistral:${mm ? mm[1] : 'other'}`;
  }

  // 세대/날짜/프리뷰 토큰만 걷어내 동일 역할(roleKey) 추출
  const keepParams = PARAM_PRESERVE_COHORTS.has(cohort) || vendorKey === 'mistral';
  const roleParts = [];
  let verConsumed = 0;
  for (const t of tokens) {
    if (/^(gpt|chatgpt|claude|gemini|gemma|grok|deepseek|qwen|qwq|llama|mistral|mixtral|ministral|pixtral|magistral)$/.test(t)) continue;
    if (/^(preview|latest|chat|instruct|it|beta|free)$/.test(t) && tokens.length > 2) {
      if (!(vendorKey === 'deepseek' && t === 'chat')) continue;
    }
    if (/^20\d{6}$/.test(t) || /^\d{4}-\d{2}-\d{2}$/.test(t)) continue;
    if (!keepParams && /^e?\d+(?:\.\d+)?[bm]$/.test(t)) continue;
    if (major > 0 && verConsumed === 0 && (t === String(major) || t === `v${major}` || t === `r${major}`
      || t === `${major}n` || t === '4o' || new RegExp(`^(?:qwen|llama|grok|mistral|pixtral|ministral|magistral|mixtral|deepseek|gemma|gemini)?v?${major}(?:\\.${minor})?n?$`).test(t))) {
      verConsumed = 1;
      continue;
    }
    if (major > 0 && minor > 0 && verConsumed === 1 && t === String(minor)) {
      verConsumed = 2;
      continue;
    }
    roleParts.push(t);
  }
  const roleKey = roleParts.join('-') || 'base';

  let majorScope = String(major);
  if (cohort === 'google:gemini' && major === 2 && minor === 5) majorScope = '2.5';
  else if (vendorKey === 'mistral') majorScope = 'all';

  return { parsed, cohort, major, minor, versionScore, dateScore, paramB, isPreview, roleKey, majorScope };
}

function pruneBazeLineage(cleanList) {
  const entries = cleanList.map(extractBazeLineage);
  const maxMajorByCohort = new Map();
  let hasGemini25Plus = false;

  for (const e of entries) {
    if (e.major > 0) {
      const prev = maxMajorByCohort.get(e.cohort) ?? 0;
      if (e.major > prev) maxMajorByCohort.set(e.cohort, e.major);
    }
    if (e.cohort === 'google:gemini' && (e.major >= 3 || (e.major === 2 && e.minor >= 5))) {
      hasGemini25Plus = true;
    }
  }

  const maxGptMajor = maxMajorByCohort.get('openai:gpt') || 0;
  const maxGemmaMajor = maxMajorByCohort.get('google:gemma') || 0;

  const currentGen = entries.filter(e => {
    const maxM = maxMajorByCohort.get(e.cohort) || 0;
    if (e.cohort === 'openai:o') {
      if (maxGptMajor >= 6) return false;
      return !(e.major > 0 && e.major < maxM);
    }
    if (e.cohort === 'google:gemini') {
      if (hasGemini25Plus && e.major > 0 && (e.major < 2 || (e.major === 2 && e.minor < 5))) return false;
      return true;
    }
    if (e.cohort === 'google:gemma') {
      if (maxGemmaMajor >= 3 && e.major > 0 && e.major < 3) return false;
      if (e.major === 3 && e.paramB > 0 && e.paramB < 4) return false;
      if (e.major >= 4 && e.paramB > 0 && e.paramB < 2) return false;
      return true;
    }
    const cutoff = COHORT_MIN_CUTOFF[e.cohort];
    if (cutoff && maxM >= cutoff && e.major > 0 && e.major < maxM) return false;
    return true;
  });

  // 동일 (세대 라인, majorScope, 역할) 내 구형 마이너·-preview 중복 제거
  const bestBySlot = new Map();
  for (const e of currentGen) {
    const slot = `${e.cohort}:${e.majorScope}:${e.roleKey}`;
    const prev = bestBySlot.get(slot);
    if (!prev) {
      bestBySlot.set(slot, e);
      continue;
    }
    const better =
      (e.isPreview !== prev.isPreview ? !e.isPreview
        : e.versionScore !== prev.versionScore ? e.versionScore > prev.versionScore
        : e.dateScore !== prev.dateScore ? e.dateScore > prev.dateScore
        : e.parsed.shortId.length < prev.parsed.shortId.length);
    if (better) bestBySlot.set(slot, e);
  }
  const winners = new Set(bestBySlot.values());
  return entries.filter(e => winners.has(e)).map(e => e.parsed);
}

function compareBazeModels(a, b, vendorKey) {
  if (vendorKey === 'google') {
    const famA = a.parsed.family === 'gemini' ? 0 : (a.parsed.family === 'gemma' ? 1 : 2);
    const famB = b.parsed.family === 'gemini' ? 0 : (b.parsed.family === 'gemma' ? 1 : 2);
    if (famA !== famB) return famA - famB;

    const genA = a.parsed.family === 'gemini' && a.parsed.major === 2 ? 250 : a.parsed.major * 100;
    const genB = b.parsed.family === 'gemini' && b.parsed.major === 2 ? 250 : b.parsed.major * 100;

    if (famA === 1) {
      if (genB !== genA) return genB - genA;
      if (b.parsed.paramB !== a.parsed.paramB) return b.parsed.paramB - a.parsed.paramB;
      if (b.parsed.versionScore !== a.parsed.versionScore) return b.parsed.versionScore - a.parsed.versionScore;
      return a.parsed.id.localeCompare(b.parsed.id);
    }
    // BAZE Gemini는 경량/저비용 -> 플래그십/고비용 오름차순(3.5 flash-lite -> 3.8 flash -> 4 hydrogen -> 4 argon -> 4 carbon)
    if (genA !== genB) return genA - genB;
  } else {
    if (b.parsed.major !== a.parsed.major) return b.parsed.major - a.parsed.major;
  }

  if (a.meta.grade !== b.meta.grade) return a.meta.grade - b.meta.grade;
  if (a.subRank !== b.subRank) return a.subRank - b.subRank;
  if (b.parsed.versionScore !== a.parsed.versionScore) return b.parsed.versionScore - a.parsed.versionScore;
  if (b.parsed.dateScore !== a.parsed.dateScore) return b.parsed.dateScore - a.parsed.dateScore;
  return a.parsed.id.localeCompare(b.parsed.id);
}

function buildBazeModelGroups(records) {
  const seen = new Set();
  const parsedList = [];
  for (const rec of records) {
    const p = parseModelRecord(rec);
    if (!p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    if (isUnusableOcrModel(p)) continue;
    parsedList.push(p);
  }

  // 날짜 스냅샷(-YYYYMMDD / -YYYY-MM-DD), -latest, -preview는 대응하는 기본 ID가 같이 있을 때만 병합
  const allIds = new Set(parsedList.map(p => p.id));
  const cleanList = parsedList.filter(p => {
    const stripped = p.id.replace(/(?:-\d{8}|-\d{4}-\d{2}-\d{2}|-chat-latest|-latest|-preview)$/, '');
    if (stripped !== p.id && allIds.has(stripped)) return false;
    if (/^chatgpt-/.test(p.id)) {
      const gptAlias = stripped.replace(/^chatgpt-/, 'gpt-');
      if (allIds.has(gptAlias)) return false;
    }
    return true;
  });

  const prunedList = pruneBazeLineage(cleanList);

  const bucketMap = new Map();
  for (const p of prunedList) {
    const { meta, subRank } = classifyModelTier(p);
    if (!bucketMap.has(p.vendorKey)) {
      bucketMap.set(p.vendorKey, { vendorKey: p.vendorKey, label: p.vendorLabel, iconKey: p.vendorKey, rank: p.vendorRank, items: [] });
    }
    bucketMap.get(p.vendorKey).items.push({ parsed: p, meta, subRank });
  }

  const groups = [...bucketMap.values()]
    .sort((a, b) => a.rank - b.rank)
    .map(g => {
      g.items.sort((a, b) => compareBazeModels(a, b, g.vendorKey));
      return { label: g.label, iconKey: g.iconKey, models: g.items.map(x => x.parsed.id) };
    });

  return { groups, flatIds: groups.flatMap(g => g.models) };
}

function organizeModels(items, provider) {
  return provider === 'google'
    ? buildGoogleModelGroups(items)
    : buildBazeModelGroups(items);
}

function filterValidModels(idsOrRecords, provider) {
  return organizeModels(idsOrRecords, provider).flatIds;
}

/* ---------- 자동 감지 ---------- */
const PROVIDERS = {
  google: { name:'Google AI Studio', url: GOOGLE_URL },
  baze:   { name:'BAZE',             url: BAZE_URL }
};
let activeBaseUrl = '', activeProvider = '', detectSeq = 0;

/* ---------- 테마 비주얼 공용 그래픽·포인터 브리지 ---------- */
const skinPtr = { x: 0.5, y: 0.35, sx: 0.5, sy: 0.35, active: false, lastMoved: 0 };
const kintsugiImpulses = [];
const stellarImpulses = [];
const prefersReducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const smoothstep = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0 || 1)));
  return t * t * (3 - 2 * t);
};
function createSeededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 4각 오목 회절 성광(Optical diffraction star flare) 렌더러 */
function drawFourPointStar(ctx, x, y, outerR, innerRatio, alpha, rgb) {
  if (alpha <= 0.01) return;
  const r = outerR;
  const c = r * innerRatio;
  if (r >= 2.6) {
    const aura = ctx.createRadialGradient(x, y, 0, x, y, r * 1.45);
    aura.addColorStop(0, `rgba(${rgb}, ${(alpha * 0.42).toFixed(3)})`);
    aura.addColorStop(0.45, `rgba(${rgb}, ${(alpha * 0.12).toFixed(3)})`);
    aura.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = `rgba(${rgb}, ${Math.min(1, alpha).toFixed(3)})`;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + c, y - c, x + r, y);
  ctx.quadraticCurveTo(x + c, y + c, x, y + r);
  ctx.quadraticCurveTo(x - c, y + c, x - r, y);
  ctx.quadraticCurveTo(x - c, y - c, x, y - r);
  ctx.closePath();
  ctx.fill();
}
function triggerThemeImpulse(clientX, clientY) {
  if (prefersReducedMotion()) return;
  const w = Math.max(1, window.innerWidth || 1280);
  const h = Math.max(1, window.innerHeight || 800);
  const nx = clientX != null ? Math.max(0, Math.min(1, clientX / w)) : 0.5;
  const ny = clientY != null ? Math.max(0, Math.min(1, clientY / h)) : 0.42;
  const item = { nx, ny, birth: performance.now() };
  if (state.skin === 'kintsugi') {
    kintsugiImpulses.push(item);
    if (kintsugiImpulses.length > 6) kintsugiImpulses.shift();
  } else if (state.skin === 'stellar') {
    stellarImpulses.push(item);
    if (stellarImpulses.length > 6) stellarImpulses.shift();
  }
}

/* ---------- Gemini 오로라 웨이브 애니메이션 ---------- */
let geminiAnimId = null;
let geminiIntensity = 0.12;       // 0.12 (idle/done) ~ 1.0 (busy max)
let geminiTargetIntensity = 0.12;
let geminiPhase = 0;

function updateGeminiWaveState(mode, progress = 0) {
  if (mode === 'busy') {
    const p = Math.min(Math.max(progress, 0), 1);
    geminiTargetIntensity = 0.35 + 0.65 * p;
  } else {
    geminiTargetIntensity = 0.12;
  }
}

function startGeminiWave() {
  if (geminiAnimId) return;
  const canvas = $('geminiWaveCanvas');
  if (!canvas) return;

  function render() {
    geminiAnimId = requestAnimationFrame(render);
    if (document.hidden || !canvas.offsetParent) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w <= 0 || h <= 0) return;

    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    const ctx = canvas.getContext('2d');
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    geminiIntensity += (geminiTargetIntensity - geminiIntensity) * 0.05;
    const speed = 0.015 + geminiIntensity * 0.035;
    geminiPhase += speed;

    const cy = h * 0.52;

    if (state.skin === 'cyberpunk') {
      // ===== 사이버펑크 2077 네온 오실로스코프 파형 모드 =====
      ctx.save();
      
      // 1. 미세 테크니컬 오실로스코프 그리드
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
      ctx.lineWidth = 1;
      const step = 18;
      for (let gx = 0; gx <= w; gx += step) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
      }
      for (let gy = 0; gy <= h; gy += step) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
      }
      
      // 2. 중심 오실레이터 기준선
      ctx.strokeStyle = 'rgba(252, 238, 10, 0.25)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
      ctx.setLineDash([]);

      ctx.globalCompositeOperation = 'screen';

      // 3. 네온 핑크 & 시안 하단 디지털 필터 영역
      ctx.beginPath();
      ctx.moveTo(0, cy);
      for (let x = 0; x <= w; x += 4) {
        const p = geminiPhase * 1.5;
        const rawSin = Math.sin(x * 0.02 + p);
        const stepSin = Math.sign(rawSin) * Math.pow(Math.abs(rawSin), 0.6);
        const y = cy + stepSin * (4 + geminiIntensity * 16);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      const cpFill = ctx.createLinearGradient(0, cy, 0, h);
      cpFill.addColorStop(0, 'rgba(255, 0, 85, 0.25)');
      cpFill.addColorStop(1, 'rgba(0, 240, 255, 0.02)');
      ctx.fillStyle = cpFill;
      ctx.fill();

      // 4. 네온 시안 오실로스코프 메인 펄스 (날카로운 디지털 파형)
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const p = geminiPhase * 2.0;
        const q = Math.sin(x * 0.035 + p) * Math.cos(x * 0.015 - p * 0.5);
        const spike = (x % 48 === 0) ? (Math.sin(p * 3 + x) * 9 * geminiIntensity) : 0;
        const y = cy + q * (5 + geminiIntensity * 20) + spike;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.8 + geminiIntensity * 1.5;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 12;
      ctx.stroke();

      // 5. 사이버 옐로우 전자기 스파이크 빔
      ctx.beginPath();
      for (let x = 0; x <= w; x += 5) {
        const p = geminiPhase * 2.8;
        const saw = ((x * 0.025 + p) % 1) - 0.5;
        const y = cy + saw * (6 + geminiIntensity * 22);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#fcee0a';
      ctx.lineWidth = 1.2;
      ctx.shadowColor = '#fcee0a';
      ctx.shadowBlur = 10;
      ctx.stroke();

      ctx.restore();
      return;
    }

    if (state.skin === 'twilight') {
      // ===== 트와일라잇(Twilight) 애플 뉴모피즘 블루-바이올렛 실크 파형 모드 =====
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';

      const twLayers = [
        {
          c1: 'rgba(84, 104, 231, 0.24)',
          c2: 'rgba(124, 99, 230, 0.16)',
          freq: 0.014,
          mul: 0.9,
          amp: 4 + geminiIntensity * 18,
          offset: 0
        },
        {
          c1: 'rgba(124, 99, 230, 0.20)',
          c2: 'rgba(162, 136, 244, 0.14)',
          freq: 0.020,
          mul: 1.15,
          amp: 3 + geminiIntensity * 14,
          offset: 2.2
        },
        {
          c1: 'rgba(74, 108, 247, 0.16)',
          c2: 'rgba(104, 109, 224, 0.12)',
          freq: 0.025,
          mul: 0.75,
          amp: 3 + geminiIntensity * 12,
          offset: 4.1
        }
      ];

      twLayers.forEach(layer => {
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 4) {
          const p1 = geminiPhase * layer.mul + layer.offset;
          const s1 = Math.sin(x * layer.freq + p1);
          const s2 = Math.sin(x * (layer.freq * 1.5) - p1 * 0.5);
          const y = cy + (s1 * 0.75 + s2 * 0.25) * layer.amp;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, cy - layer.amp, w, cy + layer.amp);
        grad.addColorStop(0, layer.c1);
        grad.addColorStop(1, layer.c2);
        ctx.fillStyle = grad;
        ctx.fill();
      });

      // 우아한 바이올렛-블루 실크 스트림 라인
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const p = geminiPhase * 1.05;
        const y = cy + Math.sin(x * 0.017 + p) * (3 + geminiIntensity * 12)
                      + Math.cos(x * 0.028 - p * 0.65) * (1.5 + geminiIntensity * 6);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      const twLine = ctx.createLinearGradient(0, 0, w, 0);
      twLine.addColorStop(0, 'rgba(84, 104, 231, 0.2)');
      twLine.addColorStop(0.3, 'rgba(84, 104, 231, 0.75)');
      twLine.addColorStop(0.7, 'rgba(124, 99, 230, 0.8)');
      twLine.addColorStop(1, 'rgba(155, 114, 207, 0.2)');
      ctx.strokeStyle = twLine;
      ctx.lineWidth = 1.4 + geminiIntensity * 1.4;
      ctx.stroke();

      ctx.restore();
      return;
    }

    if (state.skin === 'kintsugi') {
      ctx.save();

      // 1. 미세 한지(Washi) 수평 안내 실선
      ctx.strokeStyle = 'rgba(219, 179, 98, 0.12)';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(w, cy);
      ctx.stroke();

      // 2. 수묵 비백(飛白) 먹물 농담 레이어
      const inkWaves = [
        { color: 'rgba(56, 44, 28, 0.44)', freq: 0.011, amp: 5 + geminiIntensity * 13, speed: 0.65, offset: 0 },
        { color: 'rgba(24, 19, 14, 0.60)', freq: 0.018, amp: 4 + geminiIntensity * 9, speed: 0.92, offset: 2.1 },
      ];
      inkWaves.forEach(iw => {
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 6) {
          const y = cy + 4 + Math.sin(x * iw.freq + geminiPhase * iw.speed + iw.offset) * iw.amp
                           + Math.cos(x * iw.freq * 1.85 - geminiPhase * 0.5) * (iw.amp * 0.42);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = iw.color;
        ctx.fill();
      });

      // 3. 용융 순금 킨츠기 맥락 (자연 균열 미세 굴절 + 활성 시 지맥 분기)
      const veinY = x => {
        const p = geminiPhase * 0.88;
        const crack = Math.sin(x * 0.088 + 1.3) * Math.cos(x * 0.037) * (0.8 + geminiIntensity * 1.6);
        return cy + Math.sin(x * 0.016 + p) * (2.5 + geminiIntensity * 12)
                  + Math.sin(x * 0.041 - p * 1.25) * (1.1 + geminiIntensity * 3.8)
                  + crack;
      };

      if (geminiIntensity > 0.22) {
        ctx.strokeStyle = `rgba(229, 190, 110, ${(0.22 + geminiIntensity * 0.35).toFixed(2)})`;
        ctx.lineWidth = 0.85;
        for (let b = 0; b < 2; b++) {
          const anchorX = w * (0.28 + b * 0.44) + Math.sin(geminiPhase * 0.4 + b * 2) * (w * 0.08);
          const ay = veinY(anchorX);
          const dir = b === 0 ? -1 : 1;
          ctx.beginPath();
          ctx.moveTo(anchorX, ay);
          ctx.lineTo(anchorX + 16, ay + dir * (4 + geminiIntensity * 7));
          ctx.lineTo(anchorX + 34, ay + dir * (2 + geminiIntensity * 5));
          ctx.stroke();
        }
      }

      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const y = veinY(x);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      const goldGrad = ctx.createLinearGradient(0, 0, w, 0);
      goldGrad.addColorStop(0, 'rgba(181, 133, 49, 0.2)');
      goldGrad.addColorStop(0.24, '#f2cf78');
      goldGrad.addColorStop(0.54, '#fff4cf');
      goldGrad.addColorStop(0.82, '#d8a648');
      goldGrad.addColorStop(1, 'rgba(181, 133, 49, 0.2)');
      ctx.strokeStyle = goldGrad;
      ctx.lineWidth = 1.45 + geminiIntensity * 1.65;
      ctx.shadowColor = 'rgba(244, 211, 126, 0.72)';
      ctx.shadowBlur = 8;
      ctx.stroke();

      // 4. 비등방성 회전 금박 편(Kinpaku flakes)
      ctx.shadowBlur = 0;
      for (let i = 0; i < 14; i++) {
        const px = ((i * 73.7 + geminiPhase * (16 + (i % 4) * 4.5)) % (w + 20)) - 10;
        const py = cy + Math.sin(geminiPhase * 0.78 + i * 1.7) * (h * 0.34);
        const tilt = Math.cos(geminiPhase * 1.9 + i * 1.3);
        const alpha = 0.2 + 0.65 * Math.abs(tilt);
        const sz = 1.2 + (i % 3) * 0.45;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(geminiPhase * 0.6 + i);
        ctx.scale(Math.max(0.18, Math.abs(tilt)), 1);
        ctx.fillStyle = `rgba(255, 232, 168, ${alpha.toFixed(2)})`;
        ctx.fillRect(-sz, -sz * 0.6, sz * 2, sz * 1.2);
        ctx.restore();
      }

      ctx.restore();
      return;
    }

    if (state.skin === 'stellar') {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      // 1. 스펙트럼 미세 별빛 + 4각 회절 성광
      for (let i = 0; i < 18; i++) {
        const sx = ((i * 61.7) % w);
        const sy = 5 + ((i * 29.3) % Math.max(12, h - 10));
        const twinkle = 0.2 + 0.72 * (0.5 + 0.5 * Math.sin(geminiPhase * 2.4 + i * 1.9));
        const rgb = i % 3 === 0 ? '246,207,164' : i % 3 === 1 ? '232,169,198' : '197,182,255';
        if (i < 4) {
          drawFourPointStar(ctx, sx, sy, 3.0 + twinkle * 2.0, 0.22, twinkle * 0.9, rgb);
        } else {
          ctx.fillStyle = `rgba(${rgb}, ${twinkle.toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(sx, sy, 0.7 + (i % 3) * 0.35, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 2. 진주광택 오팔 성운 리본
      const ribbons = [
        { c1: 'rgba(245, 207, 168, 0.30)', c2: 'rgba(231, 164, 196, 0.24)', freq: 0.014, mul: 0.95, amp: 4 + geminiIntensity * 16, offset: 0 },
        { c1: 'rgba(184, 158, 248, 0.32)', c2: 'rgba(151, 236, 208, 0.20)', freq: 0.020, mul: -0.78, amp: 3 + geminiIntensity * 13, offset: 2.3 },
      ];
      ribbons.forEach(r => {
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, 'transparent');
        g.addColorStop(0.25, r.c1);
        g.addColorStop(0.75, r.c2);
        g.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 4) {
          const p = geminiPhase * r.mul;
          const y = cy + Math.sin(x * r.freq + p + r.offset) * r.amp
                       + Math.cos(x * r.freq * 0.55 - p * 0.7) * (r.amp * 0.4);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = g;
        ctx.fill();
      });

      // 3. 교차 공전 하모닉 궤도 실선 + 문스톤 코어 파동
      ctx.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const y = cy + Math.cos(x * 0.015 - geminiPhase * 0.75) * (2.5 + geminiIntensity * 10);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(202, 188, 255, 0.42)';
      ctx.lineWidth = 0.9;
      ctx.stroke();

      const stellarCoreY = x => cy + Math.sin(x * 0.017 + geminiPhase * 1.05) * (3 + geminiIntensity * 12.5)
                                   + Math.cos(x * 0.029 - geminiPhase * 0.8) * (1.3 + geminiIntensity * 4.8);
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const y = stellarCoreY(x);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      const coreGrad = ctx.createLinearGradient(0, 0, w, 0);
      coreGrad.addColorStop(0, 'rgba(245, 207, 168, 0.22)');
      coreGrad.addColorStop(0.35, 'rgba(255, 248, 240, 0.94)');
      coreGrad.addColorStop(0.7, 'rgba(232, 169, 198, 0.88)');
      coreGrad.addColorStop(1, 'rgba(184, 158, 248, 0.22)');
      ctx.strokeStyle = coreGrad;
      ctx.lineWidth = 1.45 + geminiIntensity * 1.4;
      ctx.shadowColor = 'rgba(242, 195, 224, 0.72)';
      ctx.shadowBlur = 9;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 파동 능선을 따라 흐르는 성광 다이아몬드 입자
      for (let k = 0; k < 3; k++) {
        const kx = ((geminiPhase * (22 + k * 9) + k * w * 0.34) % (w + 16)) - 8;
        drawFourPointStar(ctx, kx, stellarCoreY(kx), 2.8 + geminiIntensity * 1.8, 0.22, 0.85, '255,244,234');
      }

      ctx.restore();
      return;
    }

    const layers = [
      {
        c1: 'rgba(66, 133, 244, 0.45)', // Gemini Blue
        c2: 'rgba(155, 114, 207, 0.32)', // Purple
        freq: 0.015,
        mul: 1.0,
        amp: 4 + geminiIntensity * 22,
        offset: 0
      },
      {
        c1: 'rgba(155, 114, 207, 0.40)', // Purple / Violet
        c2: 'rgba(244, 143, 177, 0.32)', // Coral Pink
        freq: 0.022,
        mul: 1.3,
        amp: 3 + geminiIntensity * 18,
        offset: 2.1
      },
      {
        c1: 'rgba(0, 229, 255, 0.30)',  // Cyan Accent
        c2: 'rgba(66, 133, 244, 0.40)', // Electric Blue
        freq: 0.028,
        mul: 0.8,
        amp: 3 + geminiIntensity * 14,
        offset: 4.2
      }
    ];

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // 1. 유체 오로라 웨이브 레이어
    layers.forEach(layer => {
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 4) {
        const p1 = geminiPhase * layer.mul + layer.offset;
        const s1 = Math.sin(x * layer.freq + p1);
        const s2 = Math.sin(x * (layer.freq * 1.7) - p1 * 0.6);
        const y = cy + (s1 * 0.72 + s2 * 0.28) * layer.amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, cy - layer.amp, w, cy + layer.amp);
      grad.addColorStop(0, layer.c1);
      grad.addColorStop(1, layer.c2);
      ctx.fillStyle = grad;
      ctx.fill();
    });

    // 2. 상단 네온 광선 빔 (한 줄기의 날카롭고 유려한 빛 스트림)
    ctx.beginPath();
    for (let x = 0; x <= w; x += 3) {
      const p = geminiPhase * 1.15;
      const y = cy + Math.sin(x * 0.018 + p) * (3 + geminiIntensity * 14)
                    + Math.cos(x * 0.032 - p * 0.75) * (2 + geminiIntensity * 7);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const lineGrad = ctx.createLinearGradient(0, 0, w, 0);
    lineGrad.addColorStop(0, 'rgba(66, 133, 244, 0.15)');
    lineGrad.addColorStop(0.25, 'rgba(0, 229, 255, 0.75)');
    lineGrad.addColorStop(0.65, 'rgba(155, 114, 207, 0.85)');
    lineGrad.addColorStop(0.9, 'rgba(244, 143, 177, 0.8)');
    lineGrad.addColorStop(1, 'rgba(66, 133, 244, 0.2)');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 1.2 + geminiIntensity * 1.8;
    ctx.stroke();

    ctx.restore();
  }

  geminiAnimId = requestAnimationFrame(render);
}

function stopGeminiWave() {
  if (geminiAnimId) {
    cancelAnimationFrame(geminiAnimId);
    geminiAnimId = null;
  }
}

function updateProviderCardUi() {
  const isGoogle = activeProvider === 'google';
  const costBox = $('costBox');
  const waveBox = $('geminiWaveBox');
  if (costBox && waveBox) {
    if (isGoogle) {
      costBox.classList.add('hidden');
      waveBox.classList.remove('hidden');
      startGeminiWave();
      if (!running) updateGeminiWaveState('idle');
    } else {
      waveBox.classList.add('hidden');
      costBox.classList.remove('hidden');
      stopGeminiWave();
    }
  }
}

function setBadge(text, cls){ const b=$('apiStatusBadge'); b.textContent = text; b.className = 'badge '+cls; }
function msg(t, err){ const m=$('modelMsg'); m.textContent=t; m.classList.toggle('err', !!err); }
function pickDefaultModel(flatIds, provider) {
  if (!flatIds.length) return '';
  if (state.model && flatIds.includes(state.model)) return state.model;
  const preferred = [
    DEFAULT_MODEL, 'gemini-3.8-flash', 'gemini-4-hydrogen',
    'gpt-6-luna', 'gemini-2.5-flash', 'claude-haiku-5-5', 'claude-haiku-4-5'
  ];
  for (const cand of preferred) {
    if (flatIds.includes(cand)) return cand;
  }
  if (provider === 'google') {
    const fast = flatIds.find(m => /flash|hydrogen/.test(m.toLowerCase()));
    if (fast) return fast;
  } else {
    const cheap = flatIds.find(m => getModelMeta(m).grade === 1)
               || flatIds.find(m => getModelMeta(m).grade === 2);
    if (cheap) return cheap;
  }
  return flatIds[0];
}

let modelPickerGroups = null;
let modelPickerProvider = '';
let modelDisplayMap = new Map();
let mpFocusedIdx = -1;

function renderBrandIcon(el, iconKey) {
  if (!el) return;
  const svg = Object.prototype.hasOwnProperty.call(VENDOR_LOGOS, iconKey)
    ? VENDOR_LOGOS[iconKey]
    : VENDOR_LOGOS.other;
  el.innerHTML = svg;
}

const isModelMenuOpen = () => {
  const menu = $('modelPickerMenu');
  return Boolean(menu && !menu.classList.contains('hidden'));
};

function positionModelMenu() {
  const btn = $('modelPickerBtn');
  const menu = $('modelPickerMenu');
  if (!btn || !menu || menu.classList.contains('hidden')) return;

  const rect = btn.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.max(rect.width, Math.min(390, vw - 20));
  const left = Math.max(10, Math.min(rect.left, vw - width - 10));

  const spaceBelow = vh - rect.bottom - 12;
  const spaceAbove = rect.top - 12;
  const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
  const avail = openUp ? spaceAbove : spaceBelow;
  const maxH = Math.min(360, Math.max(140, avail));

  menu.style.left = `${Math.round(left)}px`;
  menu.style.width = `${Math.round(width)}px`;
  menu.style.maxHeight = `${Math.round(maxH)}px`;

  const measuredH = Math.min(menu.scrollHeight, maxH);
  const top = openUp
    ? Math.max(10, rect.top - measuredH - 6)
    : Math.min(vh - measuredH - 10, rect.bottom + 6);
  menu.style.top = `${Math.round(top)}px`;
}

function setMpFocusedIndex(idx) {
  const menu = $('modelPickerMenu');
  if (!menu) return;
  const opts = [...menu.querySelectorAll('.mp-option')];
  opts.forEach(o => o.classList.remove('is-focus'));
  if (!opts.length) { mpFocusedIdx = -1; return; }
  mpFocusedIdx = ((idx % opts.length) + opts.length) % opts.length;
  const cur = opts[mpFocusedIdx];
  cur.classList.add('is-focus');
  cur.scrollIntoView({ block: 'nearest' });
}

function openModelMenu() {
  const btn = $('modelPickerBtn');
  const menu = $('modelPickerMenu');
  if (!btn || !menu || btn.disabled) return;
  if (!menu.querySelector('.mp-option')) return;
  hideTooltip();
  menu.classList.remove('hidden');
  btn.setAttribute('aria-expanded', 'true');
  positionModelMenu();

  const opts = [...menu.querySelectorAll('.mp-option')];
  const selIdx = opts.findIndex(o => o.dataset.value === currentModel());
  setMpFocusedIndex(selIdx >= 0 ? selIdx : 0);
}

function closeModelMenu(returnFocus) {
  const btn = $('modelPickerBtn');
  const menu = $('modelPickerMenu');
  if (menu) menu.classList.add('hidden');
  if (btn) {
    btn.setAttribute('aria-expanded', 'false');
    if (returnFocus) btn.focus();
  }
  mpFocusedIdx = -1;
}

function selectModelFromPicker(id) {
  const sel = $('modelSelect');
  if (!sel || sel.disabled) return;
  if (sel.value !== id) {
    sel.value = id;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    syncModelPicker(false);
  }
  closeModelMenu(true);
}

function createModelOptionButton(id) {
  const disp = modelDisplayMap.get(id) || formatModelDisplayName(id);
  const isGoogle = modelPickerProvider === 'google';
  const meta = getModelMeta(id);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mp-option';
  btn.setAttribute('role', 'option');
  btn.dataset.value = id;

  const main = document.createElement('span');
  main.className = 'mp-opt-main';

  const nameEl = document.createElement('span');
  nameEl.className = 'mp-opt-name';
  nameEl.textContent = disp.label;
  main.appendChild(nameEl);

  if (disp.isPreview) {
    const pTag = document.createElement('span');
    pTag.className = 'mp-preview-tag';
    pTag.textContent = 'Preview';
    main.appendChild(pTag);
  }

  const side = document.createElement('span');
  side.className = 'mp-opt-side';

  if (!isGoogle) {
    const pill = document.createElement('span');
    pill.className = 'mp-pill';
    pill.textContent = meta.shortBadge;
    pill.style.background = meta.badgeColor + '20';
    pill.style.color = meta.badgeColor;
    pill.style.border = `1px solid ${meta.badgeColor}66`;
    side.appendChild(pill);
  }

  const check = document.createElement('span');
  check.className = 'mp-check';
  check.setAttribute('aria-hidden', 'true');
  check.textContent = '✓';
  side.appendChild(check);

  btn.appendChild(main);
  btn.appendChild(side);
  btn.addEventListener('click', () => selectModelFromPicker(id));
  return btn;
}

function renderModelPickerMenu() {
  const menu = $('modelPickerMenu');
  const sel = $('modelSelect');
  if (!menu || !sel) return;
  menu.textContent = '';

  const validOpts = [...sel.options].filter(o => Boolean(o.value));
  if (!validOpts.length) return;

  if (modelPickerGroups && modelPickerGroups.length) {
    for (const g of modelPickerGroups) {
      if (!g.models || !g.models.length) continue;
      const grpEl = document.createElement('div');
      grpEl.className = 'mp-group';
      grpEl.setAttribute('role', 'group');

      const hdr = document.createElement('div');
      hdr.className = 'mp-group-hdr';

      const ico = document.createElement('span');
      ico.className = 'mp-icon';
      ico.setAttribute('aria-hidden', 'true');
      renderBrandIcon(ico, g.iconKey || 'other');

      const title = document.createElement('span');
      title.textContent = g.label;

      hdr.appendChild(ico);
      hdr.appendChild(title);
      grpEl.appendChild(hdr);

      for (const id of g.models) grpEl.appendChild(createModelOptionButton(id));
      menu.appendChild(grpEl);
    }
  } else {
    const grpEl = document.createElement('div');
    grpEl.className = 'mp-group';
    for (const o of validOpts) grpEl.appendChild(createModelOptionButton(o.value));
    menu.appendChild(grpEl);
  }
}

function syncModelPicker(rebuildMenu = false) {
  const sel = $('modelSelect');
  const btn = $('modelPickerBtn');
  const iconEl = $('mpTriggerIcon');
  const labelEl = $('mpTriggerLabel');
  const pillEl = $('mpTriggerPill');
  const menu = $('modelPickerMenu');
  if (!sel || !btn) return;

  if (rebuildMenu) {
    closeModelMenu(false);
    renderModelPickerMenu();
  }

  const val = sel.value;
  btn.disabled = sel.disabled;

  if (!val) {
    const placeholder = sel.options[0]?.textContent || '(모델 선택)';
    if (iconEl) { iconEl.textContent = ''; iconEl.classList.add('hidden'); }
    if (labelEl) labelEl.textContent = placeholder;
    if (pillEl) { pillEl.textContent = ''; pillEl.classList.add('hidden'); }
  } else {
    const disp = modelDisplayMap.get(val) || formatModelDisplayName(val);
    if (iconEl) {
      iconEl.classList.remove('hidden');
      renderBrandIcon(iconEl, disp.iconKey);
    }
    if (labelEl) {
      labelEl.textContent = disp.isPreview ? `${disp.label} · Preview` : disp.label;
    }
    if (pillEl) {
      if (modelPickerProvider === 'google' || activeProvider === 'google') {
        pillEl.textContent = '';
        pillEl.classList.add('hidden');
      } else {
        const meta = getModelMeta(val);
        pillEl.textContent = meta.shortBadge;
        pillEl.style.background = meta.badgeColor + '20';
        pillEl.style.color = meta.badgeColor;
        pillEl.style.border = `1px solid ${meta.badgeColor}66`;
        pillEl.classList.remove('hidden');
      }
    }
  }

  if (menu) {
    for (const optBtn of menu.querySelectorAll('.mp-option')) {
      optBtn.setAttribute('aria-selected', optBtn.dataset.value === val ? 'true' : 'false');
    }
  }
}

function resetModelSelectPlaceholder(text) {
  const sel = $('modelSelect');
  if (sel) {
    sel.innerHTML = '';
    sel.appendChild(new Option(text, ''));
    sel.disabled = true;
  }
  modelPickerGroups = null;
  modelPickerProvider = '';
  modelDisplayMap.clear();
  syncModelPicker(true);
  updateModelBadgeAndTooltip('');
}

function initModelPicker() {
  const btn = $('modelPickerBtn');
  const menu = $('modelPickerMenu');
  if (!btn || !menu) return;

  btn.addEventListener('click', () => {
    if (isModelMenuOpen()) closeModelMenu(false);
    else openModelMenu();
  });

  btn.addEventListener('keydown', e => {
    if (btn.disabled) return;
    const opts = [...menu.querySelectorAll('.mp-option')];
    if (!opts.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isModelMenuOpen()) openModelMenu();
      else setMpFocusedIndex(mpFocusedIdx + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isModelMenuOpen()) openModelMenu();
      else setMpFocusedIndex(mpFocusedIdx - 1);
    } else if (e.key === 'Home' && isModelMenuOpen()) {
      e.preventDefault();
      setMpFocusedIndex(0);
    } else if (e.key === 'End' && isModelMenuOpen()) {
      e.preventDefault();
      setMpFocusedIndex(opts.length - 1);
    } else if ((e.key === 'Enter' || e.key === ' ') && isModelMenuOpen()) {
      e.preventDefault();
      const targetOpt = opts[mpFocusedIdx >= 0 ? mpFocusedIdx : 0];
      if (targetOpt) selectModelFromPicker(targetOpt.dataset.value);
    } else if (e.key === 'Escape' && isModelMenuOpen()) {
      e.preventDefault();
      closeModelMenu(true);
    }
  });

  document.addEventListener('pointerdown', e => {
    if (!isModelMenuOpen()) return;
    if (!btn.contains(e.target) && !menu.contains(e.target)) closeModelMenu(false);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isModelMenuOpen()) {
      e.preventDefault();
      closeModelMenu(true);
    }
  });

  window.addEventListener('resize', () => { if (isModelMenuOpen()) positionModelMenu(); });
  window.addEventListener('scroll', e => {
    if (isModelMenuOpen() && !menu.contains(e.target)) positionModelMenu();
  }, true);
}

function setModels(modelsOrResult, lock, providerOverride) {
  const provider = providerOverride || activeProvider;
  const sel = $('modelSelect');
  sel.innerHTML = '';

  const isGrouped = modelsOrResult && !Array.isArray(modelsOrResult) && Array.isArray(modelsOrResult.groups);
  const groups = isGrouped ? modelsOrResult.groups : null;
  const flatIds = isGrouped ? (modelsOrResult.flatIds || []) : (modelsOrResult || []);
  modelDisplayMap = buildUniqueDisplayMap(flatIds);
  modelPickerProvider = provider;
  modelPickerGroups = (groups && !lock && groups.length)
    ? groups.filter(g => g.models && g.models.length)
    : null;

  const makeOpt = m => {
    const disp = modelDisplayMap.get(m) || formatModelDisplayName(m);
    const label = disp.isPreview ? `${disp.label} (Preview)` : disp.label;
    return new Option(label, m);
  };

  if (modelPickerGroups && modelPickerGroups.length) {
    for (const g of modelPickerGroups) {
      const og = document.createElement('optgroup');
      og.label = g.label;
      for (const m of g.models) og.appendChild(makeOpt(m));
      sel.appendChild(og);
    }
  } else {
    for (const m of flatIds) sel.appendChild(makeOpt(m));
  }

  sel.value = pickDefaultModel(flatIds, provider);
  sel.disabled = !!lock;
  state.model = sel.value; save();
  syncModelPicker(true);
  updateModelBadgeAndTooltip(state.model);
  updateEta();
}
const currentModel = () => $('modelSelect').value;

async function fetchModelRecords(base, key) {
  const r = await fetch(base + '/models', { headers: { Authorization: 'Bearer ' + key } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  const rawList = j.data || j.models || [];
  const items = rawList.length > 1 ? rawList.filter(m => !isNonTextMeta(m)) : rawList;
  const records = [];
  for (const item of items) {
    const id = normalizeModelId(item);
    if (!id) continue;
    if (item && typeof item === 'object') modelRecordMap.set(id, item);
    records.push({ id, raw: (item && typeof item === 'object') ? item : {} });
  }
  return { rawCount: rawList.length, records };
}

async function fetchModelIds(base, key) {
  const { records } = await fetchModelRecords(base, key);
  return records.map(r => r.id);
}

/* /models 조회가 막힌 키: 대표 모델로 1토큰 호출 */
async function probeModel(base, key) {
  for (const model of [DEFAULT_MODEL, 'gemini-3.8-flash', 'gemini-4-hydrogen', 'gemini-2.5-flash']) {
    try {
      const r = await fetch(base + '/chat/completions', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }) });
      if (r.ok) return model;
    } catch (e) {}
  }
  return null;
}

let lastSucceededKey = '';
let pendingDetectKey = '';

async function autoDetectAndLoadModels(apiKey) {
  const key = (apiKey || '').trim(), seq = ++detectSeq;
  activeBaseUrl = ''; activeProvider = '';
  pendingDetectKey = key;
  lastSucceededKey = '';
  modelRecordMap.clear();
  if (!key) {
    pendingDetectKey = '';
    setBadge('● 키 입력 대기', 'idle');
    resetModelSelectPlaceholder('(키 입력 후 자동 로드)');
    msg('');
    updateProviderCardUi();
    updateEta();
    return;
  }
  setBadge('● 감지 중…', 'busy'); msg('');
  const order = key.startsWith('AIza') ? ['google', 'baze'] : ['baze', 'google'];

  // 2차: /models 프로빙
  for (const id of order) {
    const p = PROVIDERS[id];
    try {
      const { rawCount, records } = await fetchModelRecords(p.url, key);
      if (seq !== detectSeq) return;
      activeBaseUrl = p.url; activeProvider = id;
      updateProviderCardUi();
      if (rawCount === 1 && records.length === 1) {   // 모델 전용 키: 필터 예외, 자동 고정
        lastSucceededKey = key; pendingDetectKey = '';
        setModels([records[0].id], true, id);
        setBadge(`● ${p.name} 연결됨 (단일 모델 자동 고정)`, 'ok');
        msg(`단일 모델 키: ${records[0].id}`); return;
      }
      const organized = organizeModels(records, id);
      if (organized.flatIds.length) {
        lastSucceededKey = key; pendingDetectKey = '';
        setModels(organized, false, id);
        setBadge(`● ${p.name} 연결됨`, 'ok');
        msg(`사용 가능 모델 ${organized.flatIds.length}개 (원본 ${rawCount}개 중 정리됨)`); return;
      }
      const m = await probeModel(p.url, key);   // 연결은 됐지만 허용 모델 없음 → 대표 모델 시도
      if (seq !== detectSeq) return;
      if (m) {
        lastSucceededKey = key; pendingDetectKey = '';
        setModels([m], true, id);
        setBadge(`● ${p.name} 연결됨 (단일 모델 자동 고정)`, 'ok');
        msg('필터 통과 모델이 없어 대표 모델로 고정'); return;
      }
      pendingDetectKey = '';
      setBadge(`● ${p.name} 연결됨 – 사용 가능 모델 없음`, 'err');
      resetModelSelectPlaceholder('(사용 가능 모델 없음)'); return;
    } catch (e) { /* 다음 후보 */ }
  }

  // /models 실패 → 1토큰 테스트 호출
  for (const id of order) {
    const p = PROVIDERS[id];
    const m = await probeModel(p.url, key);
    if (seq !== detectSeq) return;
    if (m) {
      lastSucceededKey = key; pendingDetectKey = '';
      activeBaseUrl = p.url; activeProvider = id;
      updateProviderCardUi();
      setModels([m], true, id);
      setBadge(`● ${p.name} 연결됨 (단일 모델 자동 고정)`, 'ok');
      msg('/models 조회 권한 없음 → 1토큰 테스트로 모델 고정'); return;
    }
  }
  if (seq !== detectSeq) return;
  pendingDetectKey = '';
  lastSucceededKey = '';
  setBadge('● 연결 실패', 'err');
  activeProvider = '';
  updateProviderCardUi();
  msg('키가 유효하지 않거나 네트워크/CORS 문제로 두 엔드포인트 모두 연결하지 못했습니다.', true);
  resetModelSelectPlaceholder('(연결 실패)');
}

/* ---------- 설정 이벤트 ---------- */
let typeTimer;
$('apiKeyInput').addEventListener('input', () => { clearTimeout(typeTimer);
  typeTimer = setTimeout(() => { state.key = $('apiKeyInput').value.trim(); save(); autoDetectAndLoadModels(state.key); }, 500); });
$('apiKeyInput').addEventListener('change', () => {
  clearTimeout(typeTimer);
  const k = $('apiKeyInput').value.trim();
  if (k === state.key && ((k && k === pendingDetectKey) || (k && k === lastSucceededKey && activeProvider))) return;
  if (!k && !state.key && !activeProvider && $('apiStatusBadge')?.classList.contains('idle')) return;
  state.key = k; save(); autoDetectAndLoadModels(state.key);
});
$('modelSelect').onchange = () => {
  state.model = $('modelSelect').value;
  save();
  syncModelPicker(false);
  updateModelBadgeAndTooltip(state.model);
  updateEta();
};
$('concurrencySelect').onchange = () => { state.conc = $('concurrencySelect').value; save(); updateEta(); };

function showTooltip(){ if (!isModelMenuOpen()) $('modelTooltip')?.classList.remove('hidden'); }
function hideTooltip(){ $('modelTooltip')?.classList.add('hidden'); }
[$('modelSelect'), $('modelPickerBtn'), $('modelBadge'), $('tooltipWrap')].forEach(el => {
  if (el){
    el.addEventListener('mouseenter', showTooltip);
    el.addEventListener('mouseleave', hideTooltip);
  }
});

function init(){
  $('concurrencySelect').value = state.conc;
  $('apiKeyInput').value = state.key;
  setConversionMode(currentConversionMode, false);
  initPageOptions();
  initSkinSwitcher();
  initModelPicker();
  updateProviderCardUi();
  autoDetectAndLoadModels(state.key);
}

/* ---------- 예상 시간 및 차감 크레딧 ---------- */
let pdfDoc = null, pdfFile = null, imageFiles = [], inputMode = 'pdf', totalPages = 0;
const fmt = s => { s = Math.max(0, Math.round(s)); const m = Math.floor(s/60); return m ? `${m}분 ${s%60}초` : `${s}초`; };
const estimate = (pages, conc, model) => Math.ceil(pages/conc)*SEC_PER_PAGE(model) + pages*0.3 + 3;
function updateEta(){
  updateProviderCardUi();
  if (!totalPages) return;
  const conc = +$('concurrencySelect').value, model = currentModel();
  const meta = getModelMeta(model);
  $('iEta').textContent = '약 ' + fmt(estimate(totalPages, conc, model));
  $('formulaNote').textContent = `⌈${totalPages}/${conc}⌉ × ${meta.secPerPage}초 + ${totalPages}×0.3 + 3초`;
  
  if (activeProvider !== 'google') {
    const est = estimateCredit(totalPages, model);
    $('iCost').textContent = `약 ${est.cost.toFixed(1)} 크레딧`;
    const perPageEst = Math.round((0.65 * meta.creditPer1kInput + 1.1 * meta.creditPer1kOutput) * 10) / 10;
    $('costNote').textContent = `${meta.badge} · 페이지당 약 ${perPageEst} 크레딧`;
  } else {
    if (!running) updateGeminiWaveState('idle');
  }

  updateModelBadgeAndTooltip(model);
}

/* ---------- 파일 선택 / 분석 ---------- */
const drop = $('drop');
drop.onclick = () => $('fileInput').click();
['dragenter','dragover'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('over'); }));
['dragleave','drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', ev => { const files = ev.dataTransfer.files; if (files && files.length) analyze(files); });
$('fileInput').onchange = ev => { const files = ev.target.files; if (files && files.length) analyze(files); };

const isPdfFile = f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isImageFile = f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name);

let currentConversionMode = state.convMode === 'precision' ? 'precision' : 'standard';
const legacySig = () => {
  if (inputMode === 'images' && imageFiles.length) {
    return 'pdfvec:imgs:' + imageFiles.map(f => `${f.name}:${f.size}:${f.lastModified}`).join('|');
  }
  if (pdfFile) return `pdfvec:${pdfFile.name}:${pdfFile.size}:${pdfFile.lastModified}`;
  return 'pdfvec:empty';
};
const sig = (mode = currentConversionMode) => {
  const m = mode === 'precision' ? 'precision' : 'standard';
  if (inputMode === 'images' && imageFiles.length) {
    return `pdfvec:${m}:imgs:` + imageFiles.map(f => `${f.name}:${f.size}:${f.lastModified}`).join('|');
  }
  if (pdfFile) return `pdfvec:${m}:${pdfFile.name}:${pdfFile.size}:${pdfFile.lastModified}`;
  return `pdfvec:${m}:empty`;
};
const loadCache = (mode = currentConversionMode) => { try { return JSON.parse(sessionStorage.getItem(sig(mode))||'{}'); } catch(e){ return {}; } };
const saveCache = (c, mode = currentConversionMode) => { try { sessionStorage.setItem(sig(mode), JSON.stringify(c)); } catch(e){ log('⚠ sessionStorage 용량 초과 – 이어하기 캐시 일부 저장 불가'); } };
const hasCachedPage = (cache, pageNo) => typeof cache?.[pageNo] === 'string' && cache[pageNo].length > 0;
const countCachedPages = cache => {
  let c = 0;
  for (let i = 1; i <= totalPages; i++) if (hasCachedPage(cache, i)) c++;
  return c;
};
function updateResumeButton(mode = currentConversionMode) {
  const btn = $('resumeBtn');
  if (!btn || !totalPages) return;
  const done = countCachedPages(loadCache(mode));
  btn.classList.toggle('hidden', !(done > 0 && done < totalPages));
  btn.textContent = mode === 'precision'
    ? `이어하기 (벡터 ${done}/${totalPages})`
    : `이어하기 (${done}/${totalPages})`;
}
function setConversionMode(mode, persist = true) {
  const normalized = mode === 'precision' ? 'precision' : 'standard';
  currentConversionMode = normalized;
  if (persist) {
    state.convMode = normalized;
    save();
  }
  document.querySelectorAll('[data-conv-mode]').forEach(btn => {
    const active = btn.dataset.convMode === normalized;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  if (totalPages > 0 && !running) updateResumeButton(normalized);
}

async function analyze(fileList){
  const files = Array.from(fileList);
  const pdfs = files.filter(isPdfFile);
  const imgs = files.filter(isImageFile);

  if (pdfs.length > 0 && imgs.length > 0) {
    return alert('PDF 파일과 이미지 파일은 동시에 혼합하여 업로드할 수 없습니다. 한 종류만 선택해 주세요.');
  }
  if (pdfs.length > 1) {
    return alert('PDF 파일은 한 번에 1개만 업로드할 수 있습니다.');
  }
  if (pdfs.length === 0 && imgs.length === 0) {
    return alert('지원하지 않는 파일 형식입니다. PDF 또는 이미지 파일(PNG, JPG, WEBP 등)을 선택해 주세요.');
  }

  if (pdfs.length === 1) {
    const file = pdfs[0];
    try {
      inputMode = 'pdf';
      pdfFile = file;
      imageFiles = [];
      pdfDoc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    } catch(e){ return alert('PDF 분석 실패: '+e.message); }
    totalPages = pdfDoc.numPages;
    $('iName').textContent = file.name;
    $('iSize').textContent = (file.size/1048576).toFixed(2)+' MB';
    $('iPages').textContent = totalPages+' 페이지';
  } else {
    inputMode = 'images';
    pdfDoc = null;
    pdfFile = null;
    // 파일 이름 자연 정렬 (예: page_1.png, page_2.png, page_10.png)
    imageFiles = imgs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    totalPages = imageFiles.length;
    const totalBytes = imageFiles.reduce((acc, f) => acc + f.size, 0);
    $('iName').textContent = imageFiles.length === 1 ? imageFiles[0].name : `${imageFiles[0].name} 외 ${imageFiles.length - 1}장`;
    $('iSize').textContent = (totalBytes/1048576).toFixed(2)+' MB';
    $('iPages').textContent = `${totalPages}장 (이미지)`;
  }

  $('analysisPanel').classList.remove('hidden');
  let done = countCachedPages(loadCache(currentConversionMode));
  if (!(done > 0 && done < totalPages)) {
    const altMode = currentConversionMode === 'precision' ? 'standard' : 'precision';
    const altDone = countCachedPages(loadCache(altMode));
    if (altDone > 0 && altDone < totalPages) {
      setConversionMode(altMode, false);
    }
  }
  updateResumeButton(currentConversionMode);
  updateEta();
  const dr = $('drop')?.getBoundingClientRect();
  if (dr) triggerThemeImpulse(dr.left + dr.width * 0.5, dr.top + dr.height * 0.5);
}
$('clearBtn').onclick = () => {
  if (pdfFile || imageFiles.length) {
    sessionStorage.removeItem(sig('standard'));
    sessionStorage.removeItem(sig('precision'));
    sessionStorage.removeItem(legacySig());
    $('resumeBtn').classList.add('hidden');
    log('캐시 삭제됨');
  }
};

/* ---------- 변환 파이프라인 ---------- */
let running = false, aborted = false;
const log = t => { const l=$('log'); l.textContent += t+'\n'; l.scrollTop = l.scrollHeight; };

const PROMPT = `You are a meticulous book digitizer. Transcribe this scanned book page into Markdown. The ONLY goal is a faithful, complete, readable text version: NEVER summarize, paraphrase, translate, correct, reorder or omit any content. Visual design may be discarded; content and text formatting must be preserved exactly.

TEXT & FORMATTING (be explicit, this matters most):
- Keep the original language and exact wording, spelling, punctuation, numbers and units. Do not "fix" typos. If a character is truly illegible write [?] instead of guessing.
- Headings: judge by relative font size/weight/position. Use "# " for the book/part/chapter title, "## " for sections, "### " for subsections, "#### " for smaller headings. Keep numbering like "제1장", "2.3" inside the heading text. Never make a heading from ordinary bold body text.
- Bold text => **bold**. Italic text => *italic*. Bold+italic => ***text***. Underlined or emphasized words (dots, boxes) => **text**. Apply it only to the exact words that are styled, not whole sentences by default.
- Superscript/subscript in normal text: <sup>2</sup> / <sub>2</sub>. Strikethrough => ~~text~~.
- Lists: keep the original markers and numbering ("1.", "(1)", "-", "•" => "-"), keep nesting with 2-space indentation.
- Paragraphs: join lines within a normal running paragraph into one line (remove hard line breaks and fix hyphenation caused by line wrapping only); separate paragraphs with a blank line. Do NOT join lines that are separate on purpose: poems, lyrics, dialogue, addresses, answer keys, vocabulary/term lists, short one-item-per-line arrangements, vertical calculations. Keep those line by line (one source line = one output line).
- Alignment: centered text => <p align="center">text</p>, right-aligned text => <p align="right">text</p>. Keep deliberate indentation of a first line only if it marks a new paragraph (just start a new paragraph). Keep a sentence that is cut off by the page edge exactly as cut; never complete it or merge it with other pages.
- Block quotes, examples, definitions, boxed notes: use "> " for the box content and keep their titles in **bold**.
- Footnotes/endnotes: keep them at the end of the page, as "[^n]: text" with the matching [^n] marker in the body, or as plain small lines if no marker.
- PAGE FURNITURE (critical): page numbers, running headers (book/chapter title strip at the top margin), running footers, and decorative page templates (watermarks, scanner marks, shadows, stamps, crop marks, binding shadows) are NOT body text. NEVER write them inside the Markdown body, not at the start, not in the middle, not at the end. Footnotes and margin notes that carry real content are NOT furniture and must be kept.
- Instead, put the furniture on the very last line of the output as exactly one HTML comment: <!--PAGE {"num":"printed page number or empty","header":"running header text or empty","footer":"running footer text or empty"}-->  (valid JSON, escape double quotes inside values with a backslash). Always output this line, with empty strings when nothing exists.
- Reading order: follow the natural order; for multi-column pages read column by column. Finish a running sentence or paragraph completely before transcribing an adjacent sidebar, callout box, table, or figure caption so sentences are never split mid-thought.

MATH (never output broken or code-formatted math):
- Inline math => $...$ (no spaces right inside the $ delimiters, e.g. $x+1$); displayed/standalone equations => $$...$$ on their own lines. Use valid KaTeX/LaTeX only (\\frac, \\sqrt, \\sum, \\int, \\alpha, \\mathbf, \\begin{aligned}...\\end{aligned}, \\begin{pmatrix}... etc.).
- Chemical formulas and units may use math too, e.g. $\\mathrm{H_2O}$.
- NEVER put math inside backticks or code fences. NEVER escape the dollar signs. A currency "$" in running text must be written as \\$ .

MATH (multi-line equations & tables inside math):
- Multi-line equations (aligned steps, systems, cases, derivations): keep them in ONE $$...$$ block using \\begin{aligned}...\\end{aligned} / \\begin{cases}...\\end{cases}, one source line per row separated by \\\\ , aligned at the original "=" signs with &. Never split one derivation into separate paragraphs. Equation numbers like (3.1) => \\tag{3.1}. Numbered problems with equations keep the number as text before the math.
- Inside table cells never use a bare | in math (write \\vert or \\mid for single vertical bars; use \\| only for double-bar norms).

TABLES & ARRANGEMENTS (layout fidelity matters):
- Convert every ruled table to a GitHub Markdown table (header row + separator row). Keep every cell's text exactly; use <br> for line breaks inside a cell; math inside cells uses $...$. Preserve the exact number of rows and columns; empty cells stay empty (never shift text into a neighbor cell). Merged cells: leave the covered cells empty and put the text in the first cell.
- Use the separator row to keep alignment: |:---| left, |:---:| centered, |---:| right (numbers and amounts are usually right-aligned or centered as in the original).
- Borderless arrangements that visually form columns or a grid (simple word lists in columns, answer grids, schedules, term/definition pairs, aligned numbers, vertical arithmetic) are ALSO tables: output a Markdown table in the original row/column order. If there is no header row, use an empty header row (| | | |) followed by the separator. Do not flatten them into one running paragraph.
- Multiple-choice options (①②③④⑤) keep their markers and order; put each option on its own line unless they clearly sit on the same line in the original.

FIGURES: flowcharts/diagrams/graphs with structure => a fenced \`\`\`mermaid block using flowchart TD or flowchart LR, wrapping every node label in double quotes like A["Label (note)"] to prevent syntax errors, and keeping all labels exactly. Charts, photos, illustrations => one line "*[그림: short description in the page's language, include caption text exactly]*". Always keep figure captions as text.

OUTPUT: only the Markdown of this page. No commentary, no explanations, no surrounding code fence.`;

async function renderImageFileJpeg(file, mode = currentConversionMode){
  const isPrecision = mode === 'precision';
  const bmp = await createImageBitmap(file);
  const maxDim = isPrecision ? 2800 : 2400;
  let w = bmp.width, h = bmp.height;
  if (w > maxDim || h > maxDim){
    const ratio = Math.min(maxDim / w, maxDim / h);
    w = Math.max(1, Math.round(w * ratio));
    h = Math.max(1, Math.round(h * ratio));
  }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const data = c.toDataURL('image/jpeg', isPrecision ? 0.94 : 0.85);
  c.width = c.height = 0;
  return data;
}

async function renderPageJpeg(n, mode = currentConversionMode){
  if (inputMode === 'images') {
    return await renderImageFileJpeg(imageFiles[n - 1], mode);
  }
  const isPrecision = mode === 'precision';
  const page = await pdfDoc.getPage(n);
  const vp1 = page.getViewport({ scale: 1.0 });
  const maxDim1x = Math.max(vp1.width, vp1.height);
  let scale = 2.0;
  if (isPrecision) {
    if (maxDim1x > 0 && maxDim1x * scale < 2000) {
      scale = Math.min(3.2, 2000 / maxDim1x);
    }
    scale = Math.max(2.0, scale);
  } else if (maxDim1x > 0) {
    if (maxDim1x * scale < 1800) scale = Math.min(3.2, 1800 / maxDim1x);
    if (maxDim1x * scale > 2500) scale = Math.max(0.25, 2500 / maxDim1x);
  }
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(vp.width));
  c.height = Math.max(1, Math.ceil(vp.height));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp, background: 'rgb(255,255,255)' }).promise;
  const data = c.toDataURL('image/jpeg', isPrecision ? 0.94 : 0.85);
  c.width = c.height = 0; page.cleanup();
  return data;
}

let abortCtrl = null;
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (aborted || signal?.aborted) return reject(new Error('aborted'));
  let timer;
  const onAbort = () => {
    clearTimeout(timer);
    reject(new Error('aborted'));
  };
  timer = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, ms);
  signal?.addEventListener('abort', onAbort, { once: true });
});

/* 모델이 응답 전체를 ```markdown ... ``` 으로 감싸고 끝에 <!--PAGE ...-->를 붙인 경우 외곽 펜스만 안전하게 제거 */
function unwrapOuterMarkdownFence(text) {
  let raw = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!raw) return '';
  let pageTail = '';
  const tailMatch = raw.match(/(\n?[ \t]*<!--\s*PAGE\s*\{[\s\S]*?\}\s*-->\s*)$/i);
  if (tailMatch) {
    pageTail = tailMatch[1].trim();
    raw = raw.slice(0, raw.length - tailMatch[1].length).trim();
  }

  for (let pass = 0; pass < 2; pass++) {
    const lines = raw.split(/\r?\n/);
    if (lines.length < 2) break;
    const openM = lines[0].match(/^\s*(`{3,}|~{3,})([a-zA-Z0-9_-]*)\s*$/);
    if (!openM) break;
    const fenceChar = openM[1][0];
    const fenceLen = openM[1].length;
    const info = openM[2].toLowerCase();
    if (info && info !== 'markdown' && info !== 'md') break;

    const closeRe = new RegExp(`^\\s*${fenceChar}{${fenceLen},}\\s*$`);
    let lastIdx = lines.length - 1;
    while (lastIdx > 0 && !lines[lastIdx].trim()) lastIdx--;
    if (lastIdx <= 0 || !closeRe.test(lines[lastIdx])) break;

    const inner = lines.slice(1, lastIdx);
    let inNested = null;
    let earlyClose = false;
    let sawOuterClose = false;
    let twoMdBlocks = false;

    for (const ln of inner) {
      const fm = ln.match(/^\s*(`{3,}|~{3,})([^\s]*)\s*$/);
      if (!fm) continue;
      const ch = fm[1][0], len = fm[1].length, tag = (fm[2] || '').toLowerCase();
      if (inNested) {
        if (ch === inNested.ch && len >= inNested.len && !tag) inNested = null;
        continue;
      }
      if (tag) {
        if (sawOuterClose && (tag === 'markdown' || tag === 'md')) { twoMdBlocks = true; break; }
        inNested = { ch, len };
      } else if (ch === fenceChar && len >= fenceLen) {
        if (info === '') { earlyClose = true; break; }
        sawOuterClose = true;
      }
    }

    if ((info === '' && (earlyClose || inNested)) || twoMdBlocks) break;
    raw = inner.join('\n').trim();
  }

  return pageTail ? (raw ? raw + '\n' + pageTail : pageTail) : raw;
}

async function callApi(dataUrl, cfg, mode = currentConversionMode){
  const activePrompt = (mode === 'precision' && window.PrecisionModule)
    ? window.PrecisionModule.getPrompt()
    : PROMPT;
  const makeBody = useTemp => JSON.stringify({
    model: cfg.model,
    ...(useTemp ? { temperature: 0 } : {}),
    messages: [{ role: 'user', content: [
      { type: 'text', text: activePrompt },
      { type: 'image_url', image_url: { url: dataUrl } }
    ]}]
  });
  let useTemp = true;
  let body = makeBody(true);
  const MAX = 6;
  for (let a = 0; a <= MAX; a++){
    if (aborted || abortCtrl?.signal?.aborted) throw new Error('aborted');
    let r, j;
    try {
      r = await fetch(cfg.base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
        body,
        signal: abortCtrl?.signal
      });
      if (r.ok) {
        j = await r.json();
      }
    } catch(e){
      if (aborted || abortCtrl?.signal?.aborted || e.name === 'AbortError') throw new Error('aborted');
      if (a === MAX) throw e;
      const wait = Math.min(1000 * 2**a, 30000) + Math.random() * 500;
      log(`  ↻ 네트워크/응답 파싱 오류 (${e.message}) – ${(wait/1000).toFixed(1)}초 후 재시도 (${a+1}/${MAX})`);
      await sleep(wait, abortCtrl?.signal);
      continue;
    }
    if (r.ok){
      if (j?.error) {
        const errCode = Number(j.error.code || j.error.status || 0);
        const errMsg = String(j.error.message || JSON.stringify(j.error)).slice(0, 200);
        if (useTemp && /temperature/i.test(errMsg) && a < MAX) {
          useTemp = false; body = makeBody(false);
          log('  ℹ 모델이 temperature=0을 지원하지 않아 기본 설정으로 재시도합니다.');
          continue;
        }
        const retryableErr = errCode === 408 || errCode === 429 || errCode >= 500
          || /rate.?limit|overloaded|timeout|temporarily|unavailable|capacity|busy|try again/i.test(errMsg + ' ' + String(j.error.code || '') + ' ' + String(j.error.type || ''));
        if (retryableErr && a < MAX) {
          const wait = Math.min(1000 * 2**a, 30000) + Math.random() * 500;
          log(`  ↻ API 오류 응답 (${errMsg}) – ${(wait/1000).toFixed(1)}초 후 재시도 (${a+1}/${MAX})`);
          await sleep(wait, abortCtrl?.signal);
          continue;
        }
        throw new Error('API 오류: ' + errMsg);
      }
      const choice = j?.choices?.[0];
      const finish = choice?.finish_reason;
      if (finish === 'length') log('  ⚠ 응답이 길이 제한으로 잘렸을 수 있습니다 (해당 페이지 확인 필요)');
      else if (finish === 'content_filter' || finish === 'safety') log('  ⚠ 안전/콘텐츠 필터로 일부 내용이 제한되었을 수 있습니다');

      let t = choice?.message?.content ?? '';
      if (Array.isArray(t)) t = t.map(x => typeof x === 'string' ? x : (x?.text || '')).join('');
      t = unwrapOuterMarkdownFence(t).trim();
      if (!t) {
        if (a < MAX) {
          const wait = Math.min(1000 * 2**a, 30000) + Math.random() * 500;
          log(`  ↻ 빈 응답 수신 (finish=${finish || 'unknown'}) – ${(wait/1000).toFixed(1)}초 후 재시도 (${a+1}/${MAX})`);
          await sleep(wait, abortCtrl?.signal);
          continue;
        }
        throw new Error(`빈 응답 반환 (finish_reason=${finish || 'none'})`);
      }
      const u = j.usage || {};
      let inT = Number(u.prompt_tokens), outT = Number(u.completion_tokens), est = false;
      if (u.prompt_tokens == null || !(inT > 0)){ inT = Math.ceil(activePrompt.length/4) + 800; est = true; }   // 이미지 토큰 포함 역산
      if (u.completion_tokens == null || !(outT >= 0)){ outT = estimateTokens(t); est = true; }
      return { text: t, usage: { input: inT, output: outT, estimated: est } };
    }
    const errText = (await r.text().catch(() => '')).slice(0, 300);
    if (r.status === 400 && useTemp && /temperature/i.test(errText) && a < MAX) {
      useTemp = false;
      body = makeBody(false);
      log('  ℹ 모델이 temperature=0을 지원하지 않아 기본 설정으로 재시도합니다.');
      continue;
    }
    if ((r.status === 408 || r.status === 429 || r.status >= 500) && a < MAX){
      if (aborted || abortCtrl?.signal?.aborted) throw new Error('aborted');
      const ra = parseFloat(r.headers.get('retry-after'));
      const wait = (Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 60000) : Math.min(1000 * 2**a, 30000)) + Math.random() * 500;
      log(`  ↻ HTTP ${r.status} (요청 제한/대기) – ${(wait/1000).toFixed(1)}초 후 재시도 (${a+1}/${MAX})`);
      await sleep(wait, abortCtrl?.signal);
      continue;
    }
    throw new Error('HTTP ' + r.status + ' ' + errText.slice(0, 200));
  }
}

/* ---------- 백그라운드 탭 절전/스로틀링 방지 (Keep-Alive) ---------- */
let keepAliveCtx = null;
let keepAliveNode = null;
let wakeLock = null;

async function startKeepAlive(){
  // 1. 화면 및 시스템 절전 방지 (Wake Lock API)
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch(e){}

  // 2. 브라우저 백그라운드 탭 CPU 스로틀링/Freezing 방지 (무음 Web Audio)
  // 크롬/엣지는 소리가 재생 중인 미디어 탭을 백그라운드에서도 절대 절전/동결하지 않는 정책을 활용
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx && !keepAliveCtx) {
      keepAliveCtx = new AudioCtx();
      if (keepAliveCtx.state === 'suspended') {
        await keepAliveCtx.resume();
      }
      const buffer = keepAliveCtx.createBuffer(1, keepAliveCtx.sampleRate, keepAliveCtx.sampleRate);
      keepAliveNode = keepAliveCtx.createBufferSource();
      keepAliveNode.buffer = buffer;
      keepAliveNode.loop = true;
      const gain = keepAliveCtx.createGain();
      gain.gain.value = 0.0001;
      keepAliveNode.connect(gain);
      gain.connect(keepAliveCtx.destination);
      keepAliveNode.start();
    }
  } catch(e){}
}

function stopKeepAlive(){
  try {
    if (wakeLock) { wakeLock.release(); wakeLock = null; }
  } catch(e){}
  try {
    if (keepAliveNode) { keepAliveNode.stop(); keepAliveNode.disconnect(); keepAliveNode = null; }
    if (keepAliveCtx) { keepAliveCtx.close(); keepAliveCtx = null; }
  } catch(e){}
}

document.addEventListener('visibilitychange', async () => {
  if (running && document.visibilityState === 'visible' && 'wakeLock' in navigator && !wakeLock) {
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch(e){}
  }
});

async function convert(resume){
  if (running || (!pdfDoc && !imageFiles.length)) return;
  const model = currentModel(), key = state.key;
  if (!key) return alert('API 키를 입력하세요.');
  if (!model || model.startsWith('(')) return alert('모델을 지정하세요.');
  if (!activeBaseUrl) return alert('API 키가 아직 연결되지 않았습니다.');
  const mode = currentConversionMode === 'precision' ? 'precision' : 'standard';
  const cfg = { base: activeBaseUrl, key, model };
  const conc = +$('concurrencySelect').value;
  const cache = resume ? loadCache(mode) : {};
  if (!resume) sessionStorage.removeItem(sig(mode));

  const pending = [];
  for (let i=1;i<=totalPages;i++) if (!hasCachedPage(cache, i)) pending.push(i);
  running = true; aborted = false;
  abortCtrl = new AbortController();
  ['startBtn','resumeBtn','modeStandardBtn','modePrecisionBtn'].forEach(i => { if ($(i)) $(i).disabled = true; });
  $('stopBtn').classList.remove('hidden');
  $('progCard').classList.remove('hidden');
  $('resultCard').classList.add('hidden');
  setPreviewExpanded(false);
  if ($('previewCard')) $('previewCard').classList.add('hidden');
  if ($('previewContainer')) $('previewContainer').innerHTML = '';
  $('pTotal').textContent = totalPages;
  $('log').textContent = '';
  const meta = getModelMeta(model);
  let sIn = 0, sOut = 0, sCredit = 0;
  let done = totalPages - pending.length;
  const isGoogle = activeProvider === 'google';
  if (isGoogle) {
    updateGeminiWaveState('busy', done / totalPages);
    $('pMeter').textContent = `실시간 처리: ${done} / ${totalPages} 페이지 (총 0 토큰 사용)`;
  } else {
    $('pMeter').textContent = '실시간 누적 차감: 0.0 크레딧 (총 0 토큰 사용)';
  }
  const t0 = performance.now(), startDone = done, failed = [];
  const upd = () => {
    $('pDone').textContent = done;
    $('bar').style.width = (done/totalPages*100)+'%';
    const made = done - startDone;
    const rate = made ? (performance.now()-t0)/1000/made : null;
    const remain = totalPages - done;
    $('pEta').textContent = remain===0 ? '완료' : fmt(rate ? rate*remain : estimate(remain, conc, model));
  };
  upd(); $('pStatus').textContent = `${model} · ${conc}배속`;
  log(`시작: ${pending.length}페이지 처리 (캐시 ${done}페이지)`);

  let idx = 0;
  const worker = async () => {
    while (!aborted){
      const n = pending[idx++]; if (n === undefined) return;
      try {
        const { text: rawMd, usage } = await callApi(await renderPageJpeg(n, mode), cfg, mode);
        cache[n] = rawMd; saveCache(cache, mode); done++;
        const pageCredit = (usage.input / 1000) * meta.creditPer1kInput + (usage.output / 1000) * meta.creditPer1kOutput;
        sIn += usage.input; sOut += usage.output; sCredit += pageCredit;
        const totalTokens = sIn + sOut;
        if (isGoogle) {
          updateGeminiWaveState('busy', done / totalPages);
          $('pMeter').textContent = `실시간 처리: ${done} / ${totalPages} 페이지 (총 ${fmtInt(totalTokens)} 토큰 사용)`;
          log(`✓ p.${n} · 입력 ${fmtInt(usage.input)} + 출력 ${fmtInt(usage.output)} 토큰${usage.estimated?'(추정)':''} · 누적: 총 ${fmtInt(totalTokens)} 토큰`);
        } else {
          $('pMeter').textContent = `실시간 누적 차감: ${sCredit.toFixed(1)} 크레딧 (총 ${fmtInt(totalTokens)} 토큰 사용)`;
          log(`✓ p.${n} · 입력 ${fmtInt(usage.input)} + 출력 ${fmtInt(usage.output)} 토큰${usage.estimated?'(추정)':''} · 차감: ${pageCredit.toFixed(1)} 크레딧 | 누적: ${sCredit.toFixed(1)} 크레딧 (총 ${fmtInt(totalTokens)} 토큰)`);
        }
      } catch(e){
        if (aborted) return;
        failed.push(n); log(`✗ p.${n} 실패: ${e.message}`);
      }
      upd();
    }
  };
  try {
    await startKeepAlive();
    await Promise.all(Array.from({length: Math.min(conc, pending.length)}, worker));
    const cnt = countCachedPages(cache);
    updateResumeButton(mode);
    if (aborted){
      if (isGoogle) updateGeminiWaveState('idle', 0);
      log('⏸ 중단됨 – [이어하기]로 계속할 수 있습니다.');
      return;
    }
    if (cnt < totalPages){ log(`⚠ ${failed.length}페이지 실패 – [이어하기]로 재시도하세요.`); return; }
    if (isGoogle) updateGeminiWaveState('done', 1.0);
    triggerThemeImpulse(window.innerWidth * 0.5, window.innerHeight * 0.36);
    log('모든 페이지 완료 → 벡터 PDF 생성 중…');
    await buildAndPrint(cache, mode);
  } finally {
    stopKeepAlive();
    running = false;
    $('stopBtn').classList.add('hidden');
    ['startBtn','resumeBtn','modeStandardBtn','modePrecisionBtn'].forEach(i => { if ($(i)) $(i).disabled = false; });
  }
}
document.querySelectorAll('[data-conv-mode]').forEach(btn => {
  btn.onclick = () => { if (!running) setConversionMode(btn.dataset.convMode, true); };
});
$('startBtn').onclick = () => convert(false);
$('resumeBtn').onclick = () => convert(true);
$('stopBtn').onclick = () => {
  aborted = true;
  if (abortCtrl) {
    try { abortCtrl.abort(); } catch(e){}
  }
  if (activeProvider === 'google') {
    updateGeminiWaveState('idle', 0);
  }
  log('🛑 [중단] 모든 재시도 대기와 네트워크 통신을 즉시 중단했습니다.');
};

/* ---------- 결과 파일 생성 / 다운로드 ---------- */
const PRINT_CSS = `
@page{size:A4;margin:16mm 14mm}
html,body{margin:0;padding:0;background:#fff;color:#111;font:11pt/1.6 "Malgun Gothic","Noto Sans KR",system-ui,sans-serif}
.page{break-after:page;page-break-after:always}
.page:last-child{break-after:auto;page-break-after:auto}
h1,h2,h3,h4{break-after:avoid;line-height:1.3;font-weight:800;margin:1.1em 0 .4em}
h1{font-size:22pt;border-bottom:2.5pt solid #111;padding-bottom:4pt}
h2{font-size:17pt;border-bottom:1pt solid #999;padding-bottom:2pt}
h3{font-size:13.5pt}
h4{font-size:11.5pt}
strong,b{font-weight:800}
.katex-display{margin:.8em 0}
table{border-collapse:collapse;width:100%;margin:8px 0;break-inside:avoid;font-size:10pt}
th,td{border:1px solid #888;padding:4px 7px;vertical-align:top}
th{background:#eee}
pre,code{font-family:Consolas,monospace;font-size:9.5pt}
pre{background:#f5f5f5;padding:8px;white-space:pre-wrap;break-inside:avoid}
img,svg{max-width:100%;height:auto}
.mermaid-svg{text-align:center;margin:10px 0;break-inside:avoid}
.mermaid-svg svg{max-width:100%;height:auto}
blockquote{border-left:3px solid #bbb;margin:8px 0;padding-left:10px;color:#444}
.katex-display{overflow-x:auto;overflow-y:hidden}
td,th{overflow-wrap:anywhere;line-height:1.5}
sup,sub{font-size:.75em;line-height:0}
hr{border:0;border-top:1pt solid #bbb;margin:10pt 0}
del{text-decoration:line-through;color:#555}
.fn-ref{font-size:.75em;color:#333;margin-left:1px}
.footnotes{margin-top:12pt;font-size:9.2pt;line-height:1.45;color:#333}
.fn-sep{border:0;border-top:.6pt solid #bbb;width:32%;margin:0 0 6pt 0}
.fn-item{display:flex;gap:5px;margin:2pt 0}
.fn-id{font-weight:700;flex-shrink:0}
.pg-h{text-align:center;color:#666;font-size:9pt;border-bottom:.5pt solid #ccc;padding-bottom:3pt;margin-bottom:10pt}
.pg-f{display:flex;justify-content:space-between;color:#666;font-size:9pt;border-top:.5pt solid #ccc;padding-top:3pt;margin-top:12pt}
.book-box{border:1.5px solid #334155;border-radius:8px;padding:14px 18px;margin:16px 0;background-color:#f8fafc;page-break-inside:avoid;break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.book-callout{border-left:4px solid #2563eb;border-radius:0 6px 6px 0;background-color:#eff6ff;padding:12px 16px;margin:16px 0;page-break-inside:avoid;break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.book-diagram{display:flex;justify-content:center;align-items:center;margin:1.6em auto;padding:16px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;max-width:92%;page-break-inside:avoid;break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.book-diagram svg{width:100%;max-width:600px;height:auto;max-height:400px;overflow:visible;display:block}
.mermaid-fallback-code{width:100%;margin:0;padding:12px;background:#f8fafc;border-radius:6px;font-size:0.85rem;white-space:pre-wrap;overflow-x:auto}
`;
/* 화면 밖 렌더링용(PDF/PNG 캔버스 캡처) 스타일 – 폭 700px ≒ A4 본문폭 */
const STAGE_CSS = `
#stage{position:fixed;left:-10000px;top:0;width:700px;padding:32px 36px;background:#fff;color:#111;font:15px/1.65 "Malgun Gothic","Noto Sans KR",system-ui,sans-serif;box-sizing:border-box}
#stage h1,#stage h2,#stage h3,#stage h4{line-height:1.3;font-weight:800;margin:1.1em 0 .4em}
#stage h1{font-size:30px;border-bottom:3px solid #111;padding-bottom:6px}
#stage h2{font-size:24px;border-bottom:1px solid #999;padding-bottom:3px}
#stage h3{font-size:19px}
#stage h4{font-size:16px}
#stage strong,#stage b{font-weight:800}
#stage em{font-style:italic}
#stage p{margin:.5em 0}
#stage sup,#stage sub{font-size:.75em;line-height:0}
#stage hr{border:0;border-top:1px solid #bbb;margin:14px 0}
#stage del{text-decoration:line-through;color:#555}
#stage .katex-display{margin:.8em 0}
#stage table{border-collapse:collapse;width:100%;margin:8px 0;font-size:14px}
#stage th,#stage td{border:1px solid #888;padding:4px 7px;vertical-align:top}
#stage th{background:#eee}
#stage td,#stage th{overflow-wrap:anywhere;line-height:1.5}
#stage ul,#stage ol{margin:.5em 0;padding-left:1.6em}
#stage li>p{margin:.2em 0}
#stage pre,#stage code{font-family:Consolas,monospace;font-size:13px}
#stage pre{background:#f5f5f5;padding:8px;white-space:pre-wrap}
#stage img,#stage svg{max-width:100%;max-height:960px;height:auto}
#stage .mermaid-svg{text-align:center;margin:10px 0}
#stage .mermaid-svg svg{max-width:100%;height:auto}
#stage .book-box{border:1.5px solid #334155;border-radius:8px;padding:14px 18px;margin:16px 0;background-color:#f8fafc;page-break-inside:avoid;break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}
#stage .book-callout{border-left:4px solid #2563eb;border-radius:0 6px 6px 0;background-color:#eff6ff;padding:12px 16px;margin:16px 0;page-break-inside:avoid;break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}
#stage .book-diagram{display:flex;justify-content:center;align-items:center;margin:1.6em auto;padding:16px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;max-width:92%;page-break-inside:avoid;break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}
#stage .book-diagram svg{width:100%;max-width:600px;height:auto;max-height:400px;overflow:visible;display:block}
#stage .mermaid-fallback-code{width:100%;margin:0;padding:12px;background:#f8fafc;border-radius:6px;font-size:0.85rem;white-space:pre-wrap;overflow-x:auto}
#stage blockquote{border-left:3px solid #bbb;margin:8px 0;padding-left:10px;color:#444}
#stage .fn-ref{font-size:.75em;color:#333;margin-left:1px}
#stage .footnotes{margin-top:16px;font-size:12.5px;line-height:1.45;color:#333}
#stage .fn-sep{border:0;border-top:1px solid #bbb;width:32%;margin:0 0 8px 0}
#stage .fn-item{display:flex;gap:6px;margin:3px 0}
#stage .fn-id{font-weight:700;flex-shrink:0}
`;
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: STAGE_CSS }));

let outUrls = {}, outBlobs = {}, outPdfPages = 0, lastPagesHtml = [];
const baseName = () => {
  if (inputMode === 'images' && imageFiles.length) {
    return imageFiles[0].name.replace(/\.(png|jpe?g|webp|gif|bmp)$/i, '');
  }
  return (pdfFile?.name || 'document').replace(/\.pdf$/i, '');
};
const fmtSize = b => b > 1048576 ? (b/1048576).toFixed(2)+' MB' : Math.max(1,Math.round(b/1024))+' KB';

/* ---------- 쪽 번호 / 머리글·바닥글(페이지 서식) ---------- */
const PAGE_META_RE = /<!--\s*PAGE\s*(\{[\s\S]*?\})\s*-->/gi;
const mdPlain = s => String(s||'').replace(/<[^>]+>/g,'').replace(/[*_`~#>]/g,'').trim();
const furnKey = s => mdPlain(s).replace(/[\s\d\u00a0|·•\-–—~./()\[\]:]+/g,' ').trim().toLowerCase();
const isPageNumLine = s => /^[-–—\s]*(?:p\.?\s*)?\d{1,4}(?:\s*(?:\/|of)\s*\d{1,4})?[-–—\s]*$/i.test(mdPlain(s));
const isBlockMarkdownLine = s => /^\s*(?:[#>|$]|[-*+]\s|\d+[.)]\s)/.test(s);

function splitPageMeta(md){
  const meta = { num:'', header:'', footer:'' };
  const body = String(md||'').replace(/\r\n?/g, '\n').replace(PAGE_META_RE, (m, j) => {
    try {
      const o = JSON.parse(j);
      for (const k of ['num','header','footer']) if (o[k] != null) meta[k] = String(o[k]).trim();
    } catch(e) {
      for (const k of ['num','header','footer']) {
        const km = j.match(new RegExp(`"${k}"\\s*:\\s*"([\\s\\S]*?)"(?=\\s*(?:,\\s*"(?:num|header|footer)"\\s*:|\\}))`, 'i'));
        if (km) meta[k] = km[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
      }
      if (!meta.num) {
        const nm = j.match(/"num"\s*:\s*(\d+)/i);
        if (nm) meta.num = nm[1];
      }
    }
    return '';
  }).replace(/<!--\s*PAGE[\s\S]*?-->/gi,'').trim();
  return { body, meta };
}

/* 본문 맨 위/아래 2줄에서 머리글·바닥글·쪽 번호가 섞여 들어온 줄을 제거 */
function stripFurniture(body, meta, rep){
  const lines = body.split('\n');
  const known = new Set([furnKey(meta.header), furnKey(meta.footer)].filter(k => k.length >= 2));
  const nonEmptyCount = lines.filter(l => l.trim()).length;
  const isFurn = (ln, idx, side) => {
    const t = ln.trim();
    if (!t || t.length > 120) return null;
    const k = furnKey(t);
    if (isPageNumLine(t)) {
      if (meta.num && mdPlain(t).replace(/\D/g,'') === meta.num.replace(/\D/g,'')) return 'num';
      if (!meta.num && nonEmptyCount > 1) {
        const plain = mdPlain(t);
        const decorated = /(?:^[-–—]+\s*\d|\d\s*[-–—]+$|^\s*p\.?\s*\d|\d\s*(?:\/|of)\s*\d)/i.test(plain);
        const neighborBlank = side === 'top' ? (lines[idx + 1] !== undefined && !lines[idx + 1].trim())
          : (idx > 0 && !lines[idx - 1].trim());
        if (decorated || neighborBlank) return 'num';
      }
    }
    if (k.length >= 2 && known.has(k)) return 'known';
    if (k.length >= 4 && rep.has(k) && !isBlockMarkdownLine(t)) return 'rep';
    return null;
  };
  const got = { num:'', header:'', footer:'' };
  for (const side of ['top','bottom']){
    for (let n=0; n<2; n++){
      const idx = side === 'top' ? lines.findIndex(l => l.trim()) : (() => { for (let i=lines.length-1;i>=0;i--) if (lines[i].trim()) return i; return -1; })();
      if (idx < 0) break;
      const kind = isFurn(lines[idx], idx, side);
      if (!kind) break;
      if (kind === 'num' && !got.num) got.num = mdPlain(lines[idx]).replace(/^[-–—\s]*(?:p\.?\s*)?/i, '').replace(/[-–—\s]+$/,'').trim();
      if (kind === 'rep') got[side === 'top' ? 'header' : 'footer'] ||= mdPlain(lines[idx]);
      lines.splice(idx, 1);
    }
  }
  return { body: lines.join('\n').trim(), num: got.num, header: got.header, footer: got.footer };
}

/* 캐시 → 페이지별 {body,num,header,footer}. 여러 페이지에 반복되는 짧은 맨 위/아래 줄도 머리글/바닥글로 간주 */
function preparePages(cache){
  const raw = Array.from({length: totalPages}, (_, i) => splitPageMeta(cache[i+1] || ''));
  const rep = new Set();
  if (totalPages >= 4){
    const cnt = new Map();
    raw.forEach(({ body }) => {
      const ls = body.split('\n').map(l => l.trim()).filter(Boolean);
      const keys = new Set([...ls.slice(0,2), ...ls.slice(-2)].filter(l => l.length <= 100 && !isBlockMarkdownLine(l)).map(furnKey).filter(k => k.length >= 4));
      keys.forEach(k => cnt.set(k, (cnt.get(k)||0) + 1));
    });
    const need = Math.max(3, Math.ceil(totalPages * 0.4));
    cnt.forEach((c, k) => { if (c >= need) rep.add(k); });
  }
  return raw.map(({ body, meta }) => {
    const s = stripFurniture(body, meta, rep);
    return { body: s.body, num: meta.num || s.num, header: meta.header || s.header, footer: meta.footer || s.footer };
  });
}

/* 사용자 옵션에 따른 페이지 표시 문구. seqNo: 출력 페이지 순번 */
function pageDeco(info, idx, seqNo){
  let num = '';
  if (state.pgNum === 'orig') num = info.num || String(idx + 1);
  else if (state.pgNum === 'seq') num = String(seqNo != null ? seqNo : idx + 1);
  return { header: state.pgHeader ? (info.header||'') : '', footer: state.pgFooter ? (info.footer||'') : '', num };
}
const hasDeco = d => !!(d.header || d.footer || d.num);

function drawDeco(ctx, cw, mx, yHead, yFoot, fontPx, d){
  ctx.save();
  ctx.fillStyle = '#555'; ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(fontPx)}px "Malgun Gothic","Noto Sans KR",system-ui,sans-serif`;
  const maxW = cw - 2*mx;
  const clip = (t, w) => { t = String(t); if (ctx.measureText(t).width <= w) return t; while (t.length > 1 && ctx.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; };
  if (d.header){ ctx.textAlign = 'center'; ctx.fillText(clip(d.header, maxW), cw/2, yHead); }
  if (d.footer){ ctx.textAlign = 'left'; ctx.fillText(clip(d.footer, maxW * (d.num ? 0.82 : 1)), mx, yFoot); }
  if (d.num){ ctx.textAlign = d.footer ? 'right' : 'center'; ctx.fillText(d.num, d.footer ? cw - mx : cw/2, yFoot); }
  ctx.restore();
}

/* 원본 한 페이지 캔버스에 머리글/바닥글 띠를 덧붙여 PNG용 캔버스 생성 */
function decorateCanvas(cv, d){
  if (!hasDeco(d)) return cv;
  const pxmm = cv.width / 186, band = Math.round(9 * pxmm);
  const out = document.createElement('canvas');
  out.width = cv.width; out.height = cv.height + band*2;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(cv, 0, band);
  drawDeco(ctx, out.width, 12*pxmm/2, band/2, out.height - band/2, 2.9*pxmm, d);
  cv.width = cv.height = 0;
  return out;
}

/* 수식·표가 본문 폭보다 넓으면 글자 크기를 줄여 잘림 방지 */
function fitWideMath(root){
  const cs = getComputedStyle(root);
  const maxW = root.clientWidth - (parseFloat(cs.paddingLeft)||0) - (parseFloat(cs.paddingRight)||0);
  if (!(maxW > 0)) return;
  root.querySelectorAll('.katex-display > .katex').forEach(k => {
    const prevDisp = k.style.display;
    k.style.display = 'inline-block';
    const inner = k.querySelector('.katex-html') || k;
    const w = Math.max(k.getBoundingClientRect().width, inner.getBoundingClientRect().width, k.scrollWidth, inner.scrollWidth);
    k.style.display = prevDisp;
    if (w > maxW) {
      k.style.fontSize = Math.max(0.55, 1.21 * (maxW / w) * 0.97).toFixed(3) + 'em';
    }
  });
  root.querySelectorAll('.katex').forEach(k => {
    if (k.closest('.katex-display')) return;
    const w = Math.max(k.getBoundingClientRect().width, k.scrollWidth);
    if (w > maxW) {
      k.style.fontSize = Math.max(0.6, (maxW / w) * 0.96).toFixed(3) + 'em';
    }
  });
  root.querySelectorAll('table').forEach(tbl => {
    const w = Math.max(tbl.getBoundingClientRect().width, tbl.scrollWidth);
    if (w > maxW + 1) {
      const ratio = Math.max(0.58, (maxW / w) * 0.98);
      tbl.style.fontSize = (14 * ratio).toFixed(1) + 'px';
      tbl.querySelectorAll('th,td').forEach(cell => {
        cell.style.padding = `${Math.max(2, Math.round(4 * ratio))}px ${Math.max(3, Math.round(6 * ratio))}px`;
      });
    }
  });
}

/* ---------- 페이지 서식 옵션 동기화 및 이벤트 ---------- */
function initPageOptions(){
  const selNum = $('optPgNum');
  const chkHeader = $('optPgHeader');
  const chkFooter = $('optPgFooter');
  if (!selNum || !chkHeader || !chkFooter) return;

  selNum.value = state.pgNum || 'off';
  chkHeader.checked = !!state.pgHeader;
  chkFooter.checked = !!state.pgFooter;

  let t;
  const onChange = () => {
    state.pgNum = selNum.value;
    state.pgHeader = chkHeader.checked;
    state.pgFooter = chkFooter.checked;
    save();
    clearTimeout(t);
    t = setTimeout(rebuildFromCache, 300);
  };
  [selNum, chkHeader, chkFooter].forEach(el => el.addEventListener('change', onChange));
}

/* ---------- 비주얼 스킨 / 테마 관리 ---------- */
const VALID_SKINS = ['default', 'cyberpunk', 'gemini', 'twilight', 'kintsugi', 'stellar'];

/* ---------- 테마별 전담 배경 캔버스 애니메이션 (Gemini / Kintsugi / Stellar) ---------- */
let geminiFlowAnimId = null;
let geminiFlowPhase = 0;
let kintsugiAnimId = null;
let stellarAnimId = null;

function stopGeminiBgFlow(){
  if (geminiFlowAnimId){
    cancelAnimationFrame(geminiFlowAnimId);
    geminiFlowAnimId = null;
  }
}

function stopBgEffects(){
  stopGeminiBgFlow();
  if (kintsugiAnimId){
    cancelAnimationFrame(kintsugiAnimId);
    kintsugiAnimId = null;
  }
  if (stellarAnimId){
    cancelAnimationFrame(stellarAnimId);
    stellarAnimId = null;
  }
  kintsugiImpulses.length = 0;
  stellarImpulses.length = 0;
}

function startGeminiBgFlow(){
  if (geminiFlowAnimId) return;
  const cvLeft = $('geminiFlowCanvasLeft');
  const cvRight = $('geminiFlowCanvasRight');
  if (!cvLeft || !cvRight) return;

  function renderFlow(){
    if (state.skin !== 'gemini'){
      stopGeminiBgFlow();
      return;
    }
    geminiFlowAnimId = requestAnimationFrame(renderFlow);

    const W = 240;
    const H = window.innerHeight || 800;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    geminiFlowPhase += 0.008 + geminiIntensity * 0.015;

    [cvLeft, cvRight].forEach((cv, idx) => {
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)){
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      const ctx = cv.getContext('2d');
      ctx.resetTransform();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);

      const phase = geminiFlowPhase + (idx === 1 ? 3.14 : 0);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      // 3개의 유체 오로라 리본 밴드 (부드럽고 우아한 톤온톤)
      const bands = [
        {
          grad: ['rgba(26, 115, 232, 0.55)', 'rgba(124, 77, 255, 0.40)', 'rgba(138, 180, 248, 0.15)'],
          freq: 0.0035,
          amp: 36 + geminiIntensity * 35,
          baseX: 55,
          speedMul: 0.8
        },
        {
          grad: ['rgba(124, 77, 255, 0.50)', 'rgba(157, 104, 255, 0.40)', 'rgba(26, 115, 232, 0.15)'],
          freq: 0.005,
          amp: 28 + geminiIntensity * 28,
          baseX: 85,
          speedMul: 1.0
        },
        {
          grad: ['rgba(138, 180, 248, 0.40)', 'rgba(66, 133, 244, 0.45)', 'rgba(124, 77, 255, 0.15)'],
          freq: 0.007,
          amp: 20 + geminiIntensity * 22,
          baseX: 115,
          speedMul: 0.7
        }
      ];

      bands.forEach(b => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (let y = 0; y <= H; y += 12){
          const p = phase * b.speedMul;
          const x = b.baseX + Math.sin(y * b.freq + p) * b.amp
                            + Math.cos(y * (b.freq * 2.2) - p * 0.7) * (b.amp * 0.4);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(0, H);
        ctx.closePath();

        const lg = ctx.createLinearGradient(0, 0, W, H);
        lg.addColorStop(0, b.grad[0]);
        lg.addColorStop(0.5, b.grad[1]);
        lg.addColorStop(1, b.grad[2]);
        ctx.fillStyle = lg;
        ctx.filter = 'blur(16px)';
        ctx.fill();
        ctx.filter = 'none';
      });

      // 가장자리 샤프한 오로라 라이트 엣지 빔 (부드러운 아이스 블루 & 바이올렛)
      ctx.beginPath();
      for (let y = 0; y <= H; y += 8){
        const p = phase * 0.9;
        const x = 70 + Math.sin(y * 0.004 + p) * (26 + geminiIntensity * 24);
        if (y === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      const edgeGrad = ctx.createLinearGradient(0, 0, 0, H);
      edgeGrad.addColorStop(0, 'rgba(138, 180, 248, 0.7)');
      edgeGrad.addColorStop(0.5, 'rgba(124, 77, 255, 0.75)');
      edgeGrad.addColorStop(1, 'rgba(100, 210, 255, 0.6)');
      ctx.strokeStyle = edgeGrad;
      ctx.lineWidth = 1.6 + geminiIntensity * 1.5;
      ctx.shadowColor = 'rgba(138, 180, 248, 0.6)';
      ctx.shadowBlur = 10;
      ctx.stroke();

      ctx.restore();
    });
  }

  geminiFlowAnimId = requestAnimationFrame(renderFlow);
}

/** 킨츠기 잉크: 우루시 미세 칠기 결 타일 생성 (1회 오프스크린 캐시) */
function createUrushiPattern(ctx){
  const tile = document.createElement('canvas');
  tile.width = 160;
  tile.height = 160;
  const tctx = tile.getContext('2d');
  const rng = createSeededRng(7719);

  tctx.fillStyle = '#080706';
  tctx.fillRect(0, 0, 160, 160);

  // 수평/사선 미세 칠기 붓결
  for (let i = 0; i < 420; i++){
    const x = rng() * 160;
    const y = rng() * 160;
    const len = 10 + rng() * 28;
    tctx.strokeStyle = rng() > 0.45
      ? `rgba(255, 240, 200, ${(0.008 + rng() * 0.014).toFixed(4)})`
      : `rgba(0, 0, 0, ${(0.18 + rng() * 0.22).toFixed(3)})`;
    tctx.lineWidth = 0.6 + rng() * 0.6;
    tctx.beginPath();
    tctx.moveTo(x, y);
    tctx.lineTo(x + len, y + (rng() - 0.5) * 2.2);
    tctx.stroke();
  }
  // 미세 금분/광물 입자
  for (let i = 0; i < 65; i++){
    tctx.fillStyle = `rgba(229, 190, 110, ${(0.015 + rng() * 0.028).toFixed(4)})`;
    tctx.fillRect(rng() * 160, rng() * 160, 1, 1);
  }
  return ctx.createPattern(tile, 'repeat');
}

/** 킨츠기 잉크: 결정론적 프랙탈 균열망(Root + Daughter Cracks) 생성 */
function buildKintsugiFractures(W, H){
  const rng = createSeededRng(20261113);
  const minDim = Math.min(W, H);
  const roots = [
    { x: -6, y: H * 0.16, angle: 0.24, len: Math.min(W * 0.36, 360), width: 1.75 },
    { x: -6, y: H * 0.78, angle: -0.38, len: Math.min(W * 0.40, 400), width: 1.9 },
    { x: W + 6, y: H * 0.20, angle: Math.PI - 0.30, len: Math.min(W * 0.36, 360), width: 1.75 },
    { x: W + 6, y: H * 0.84, angle: Math.PI + 0.26, len: Math.min(W * 0.38, 390), width: 1.85 },
    { x: W * 0.64, y: H + 6, angle: -Math.PI * 0.57, len: Math.min(minDim * 0.34, 250), width: 1.45 },
  ];

  function grow(x, y, angle, lenRemain, width, depth, dFromRoot, segs){
    const step = 16;
    let cx = x, cy = y, ca = angle, rem = lenRemain, dist = dFromRoot;
    while (rem > step && segs.length < 95){
      const kink = rng() < 0.18 ? (rng() - 0.5) * 0.46 : 0;
      ca += (rng() - 0.5) * 0.22 + kink;
      const nx = cx + Math.cos(ca) * step;
      const ny = cy + Math.sin(ca) * step;
      segs.push({
        x1: cx, y1: cy, x2: nx, y2: ny,
        mx: (cx + nx) * 0.5, my: (cy + ny) * 0.5,
        w: Math.max(0.55, width * (0.45 + 0.55 * (rem / lenRemain))),
        d0: dist, d1: dist + step,
      });
      if (depth < 2 && rem > step * 3.5 && rng() < (depth === 0 ? 0.14 : 0.08)){
        const dir = rng() < 0.5 ? 1 : -1;
        grow(nx, ny, ca + dir * (0.42 + rng() * 0.44), rem * 0.58, width * 0.65, depth + 1, dist + step, segs);
      }
      cx = nx; cy = ny; rem -= step; dist += step;
    }
  }

  return roots.map((r, id) => {
    const segs = [];
    grow(r.x, r.y, r.angle, r.len, r.width, 0, 0, segs);
    const maxDist = segs.reduce((m, s) => Math.max(m, s.d1), 1);
    return { id, segs, maxDist };
  });
}

function startKintsugiBg(){
  if (kintsugiAnimId) return;
  const cv = $('kintsugiBgCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  kintsugiImpulses.length = 0;

  const urushiPattern = createUrushiPattern(ctx);
  const inkPlumes = Array.from({ length: 5 }, (_, i) => ({
    bx: [0.12, 0.88, 0.18, 0.84, 0.50][i],
    by: [0.18, 0.24, 0.82, 0.78, 0.52][i],
    rFrac: 0.22 + (i % 3) * 0.07,
    speedX: 0.12 + (i % 2) * 0.06,
    speedY: 0.09 + (i % 3) * 0.04,
    phase: i * 1.45,
    tint: i % 2 === 0 ? 'rgba(64, 50, 31, 0.24)' : 'rgba(24, 29, 36, 0.30)',
  }));

  const rng = createSeededRng(4207);
  const goldShards = Array.from({ length: 34 }, () => ({
    x: rng(), y: rng(),
    vy: 0.00014 + rng() * 0.00022,
    vx: (rng() - 0.5) * 0.00012,
    size: 1.2 + rng() * 1.7,
    rot: rng() * Math.PI * 2,
    vrot: (rng() - 0.5) * 0.015,
    tilt: rng() * Math.PI * 2,
    vtilt: 0.014 + rng() * 0.025,
    phase: rng() * Math.PI * 2,
  }));

  const pulses = [];
  const ripples = [];
  let fractures = [];
  let lastW = 0, lastH = 0;
  let t = 0;
  let nextAutoPulse = 140;
  const reduced = prefersReducedMotion();

  function launchVeinPulse(px, py){
    if (!fractures.length) return;
    let bestRoot = 0, bestOrigin = 0, bestDist2 = Infinity;
    for (const root of fractures){
      for (const s of root.segs){
        const dx = s.mx - px, dy = s.my - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist2){
          bestDist2 = d2;
          bestRoot = root.id;
          bestOrigin = s.d0;
        }
      }
    }
    const maxDist = fractures[bestRoot]?.maxDist || 360;
    pulses.push({ rootId: bestRoot, origin: bestOrigin, travel: 0, maxTravel: maxDist + 90, speed: 4.8 });
    if (pulses.length > 8) pulses.shift();
  }

  function render(){
    if (state.skin !== 'kintsugi'){
      stopBgEffects();
      return;
    }
    if (!reduced) kintsugiAnimId = requestAnimationFrame(render);
    if (document.hidden && !reduced) return;

    const W = window.innerWidth || 1280;
    const H = window.innerHeight || 800;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)){
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    if (!fractures.length || Math.abs(W - lastW) > 36 || Math.abs(H - lastH) > 36){
      fractures = buildKintsugiFractures(W, H);
      lastW = W; lastH = H;
    }

    t += 0.008;
    const ptrFresh = skinPtr.active && (performance.now() - skinPtr.lastMoved < 6000);
    const targetX = ptrFresh ? skinPtr.x : 0.5 + Math.sin(t * 0.28) * 0.30;
    const targetY = ptrFresh ? skinPtr.y : 0.46 + Math.cos(t * 0.21) * 0.24;
    skinPtr.sx += (targetX - skinPtr.sx) * 0.08;
    skinPtr.sy += (targetY - skinPtr.sy) * 0.08;
    const lx = skinPtr.sx * W;
    const ly = skinPtr.sy * H;

    // 클릭/드롭 임펄스 소비
    while (kintsugiImpulses.length){
      const imp = kintsugiImpulses.shift();
      const ix = imp.nx * W, iy = imp.ny * H;
      ripples.push({ x: ix, y: iy, r: 6, maxR: 155, life: 0, maxLife: 62 });
      if (ripples.length > 6) ripples.shift();
      launchVeinPulse(ix, iy);
    }

    if (!reduced){
      nextAutoPulse -= 1;
      if (nextAutoPulse <= 0 && fractures.length){
        const rIdx = Math.floor(t * 17) % fractures.length;
        pulses.push({ rootId: rIdx, origin: 0, travel: 0, maxTravel: fractures[rIdx].maxDist + 80, speed: 3.1 });
        nextAutoPulse = 380;
      }
    }

    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    // 1. 우루시 칠기 브러시 결 코트
    if (urushiPattern){
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = urushiPattern;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // 2. 다중 엽상 수묵(Sumi-e) 농담 번짐
    ctx.save();
    const baseDim = Math.max(W, H);
    inkPlumes.forEach((b, i) => {
      const cx = (b.bx + Math.sin(t * b.speedX + b.phase) * 0.07) * W;
      const cy = (b.by + Math.cos(t * b.speedY + b.phase * 1.15) * 0.06) * H;
      const rad = b.rFrac * baseDim * (0.94 + 0.07 * Math.sin(t * 0.65 + b.phase));
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      rg.addColorStop(0, b.tint);
      rg.addColorStop(0.52, 'rgba(26, 21, 15, 0.13)');
      rg.addColorStop(1, 'rgba(8, 7, 6, 0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();

      // 보조 수묵 번짐 엽
      const ox = cx + Math.cos(t * 0.3 + i) * rad * 0.24;
      const oy = cy + Math.sin(t * 0.25 + i) * rad * 0.18;
      const rg2 = ctx.createRadialGradient(ox, oy, 0, ox, oy, rad * 0.62);
      rg2.addColorStop(0, 'rgba(42, 34, 24, 0.14)');
      rg2.addColorStop(1, 'rgba(8, 7, 6, 0)');
      ctx.fillStyle = rg2;
      ctx.beginPath();
      ctx.arc(ox, oy, rad * 0.62, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // 펄스 진행 갱신
    for (let i = pulses.length - 1; i >= 0; i--){
      pulses[i].travel += pulses[i].speed;
      if (pulses[i].travel > pulses[i].maxTravel) pulses.splice(i, 1);
    }

    // 3. 킨츠기 프랙탈 균열망 (음각 홈 → 벵가라 칠 → 앤티크 골드 → 스페큘러 용융 금맥)
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const litSegs = [];

    for (const root of fractures){
      for (const s of root.segs){
        // 음각 홈 + 벵가라 + 기본 금계
        ctx.strokeStyle = 'rgba(3, 2, 2, 0.80)';
        ctx.lineWidth = s.w + 2.0;
        ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();

        ctx.strokeStyle = 'rgba(118, 46, 24, 0.24)';
        ctx.lineWidth = s.w + 0.8;
        ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();

        ctx.strokeStyle = 'rgba(212, 166, 74, 0.29)';
        ctx.lineWidth = s.w;
        ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();

        if (s.w > 1.25){
          ctx.strokeStyle = 'rgba(255, 240, 194, 0.14)';
          ctx.lineWidth = 0.55;
          ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
        }

        // 촛불 스페큘러 반사 + 용융 펄스 거리 계산
        const dCursor = Math.hypot(s.mx - lx, s.my - ly);
        let glow = smoothstep(235, 25, dCursor) * 0.68;
        for (const p of pulses){
          if (p.rootId !== root.id) continue;
          const distFromWave = Math.abs(Math.abs(s.d0 - p.origin) - p.travel);
          if (distFromWave < 88){
            const pGlow = (1 - distFromWave / 88);
            glow = Math.max(glow, pGlow * pGlow * 0.98);
          }
        }
        if (glow > 0.04) litSegs.push({ s, glow });
      }
    }

    for (const { s, glow } of litSegs){
      ctx.strokeStyle = `rgba(244, 206, 114, ${(glow * 0.42).toFixed(3)})`;
      ctx.lineWidth = s.w + 2.6;
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();

      ctx.strokeStyle = `rgba(255, 247, 214, ${(glow * 0.92).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.65, s.w * 0.85);
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    }
    ctx.restore();

    // 4. 클릭/드롭 수묵·순금 파문
    ctx.save();
    for (let i = ripples.length - 1; i >= 0; i--){
      const rp = ripples[i];
      rp.life += 1;
      if (rp.life >= rp.maxLife){ ripples.splice(i, 1); continue; }
      const prog = rp.life / rp.maxLife;
      const ease = 1 - Math.pow(1 - prog, 3);
      const rad = rp.r + (rp.maxR - rp.r) * ease;
      const fade = (1 - prog) * 0.55;

      ctx.strokeStyle = `rgba(246, 217, 138, ${fade.toFixed(3)})`;
      ctx.lineWidth = 1.15 * (1 - prog * 0.6);
      ctx.beginPath(); ctx.arc(rp.x, rp.y, rad, 0, Math.PI * 2); ctx.stroke();

      ctx.strokeStyle = `rgba(18, 15, 11, ${(fade * 0.7).toFixed(3)})`;
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, rad * 0.78, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    // 5. 비등방성 회전 금박 편(Kinpaku)
    ctx.save();
    goldShards.forEach(f => {
      if (!reduced){
        f.y -= f.vy;
        f.x += f.vx + Math.sin(t + f.phase) * 0.00006;
        f.rot += f.vrot;
        f.tilt += f.vtilt;
        if (f.y < -0.02) f.y = 1.02;
        if (f.x < 0) f.x = 1;
        if (f.x > 1) f.x = 0;
      }
      const tiltScale = Math.cos(f.tilt);
      const gleam = 0.16 + 0.68 * Math.pow(Math.abs(tiltScale), 1.4);
      ctx.save();
      ctx.translate(f.x * W, f.y * H);
      ctx.rotate(f.rot);
      ctx.scale(Math.max(0.16, Math.abs(tiltScale)), 1);
      ctx.fillStyle = `rgba(248, 221, 146, ${gleam.toFixed(2)})`;
      if (f.size > 2.2){
        ctx.shadowColor = 'rgba(246, 217, 138, 0.45)';
        ctx.shadowBlur = 5;
      }
      ctx.beginPath();
      ctx.moveTo(-f.size, -f.size * 0.45);
      ctx.lineTo(f.size * 0.85, -f.size * 0.65);
      ctx.lineTo(f.size, f.size * 0.5);
      ctx.lineTo(-f.size * 0.75, f.size * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
    ctx.restore();
  }

  kintsugiAnimId = requestAnimationFrame(render);
}

function startStellarBg(){
  if (stellarAnimId) return;
  const cv = $('stellarBgCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  stellarImpulses.length = 0;

  const rng = createSeededRng(20261113);
  const hues = ['255,250,245', '246,207,164', '238,182,212', '198,184,255', '176,232,218'];

  // 층위별 시차 별자리 데이터 (먼 별가루 / 중간 스펙트럼 별 / 7x4 격자 분산 성좌 앵커 별)
  const dustStars = Array.from({ length: 84 }, (_, i) => ({
    x: rng(), y: rng(),
    r: 0.45 + rng() * 0.65,
    phase: rng() * Math.PI * 2,
    speed: 0.7 + rng() * 1.4,
    drift: 0.000018 + rng() * 0.000032,
    par: 5,
    rgb: hues[i % hues.length],
  }));

  const midStars = Array.from({ length: 44 }, (_, i) => ({
    x: rng(), y: rng(),
    r: 0.9 + rng() * 0.75,
    phase: rng() * Math.PI * 2,
    speed: 1.0 + rng() * 1.7,
    drift: 0.000028 + rng() * 0.00004,
    par: 11,
    rgb: hues[(i + 1) % hues.length],
  }));

  const anchorStars = [];
  const cols = 7, rows = 4;
  for (let r = 0; r < rows; r++){
    for (let c = 0; c < cols; c++){
      anchorStars.push({
        bx: (c + 0.16 + rng() * 0.68) / cols,
        by: (r + 0.16 + rng() * 0.68) / rows,
        r: 2.8 + rng() * 1.8,
        phase: rng() * Math.PI * 2,
        speed: 0.9 + rng() * 1.5,
        par: 18,
        rgb: hues[(r * cols + c) % 4],
      });
    }
  }

  const shootingStars = [];
  const dustWake = [];
  const starRipples = [];

  function spawnMeteor(custom){
    const sx = custom ? Math.min(0.95, custom.nx + 0.16) : (0.28 + Math.random() * 0.68);
    const sy = custom ? Math.max(0.03, custom.ny - 0.14) : (0.04 + Math.random() * 0.34);
    shootingStars.push({
      x: sx, y: sy,
      vx: -(0.0042 + Math.random() * 0.0028),
      vy: 0.0022 + Math.random() * 0.0018,
      curve: 0.000042,
      life: 0,
      maxLife: 54 + Math.random() * 30,
      len: 105 + Math.random() * 80,
      rgb: Math.random() > 0.45 ? '255,235,215' : '226,198,255',
    });
  }
  if (!prefersReducedMotion()) spawnMeteor();

  let t = 0;
  let meteorCooldown = 135;
  const reduced = prefersReducedMotion();

  function render(){
    if (state.skin !== 'stellar'){
      stopBgEffects();
      return;
    }
    if (!reduced) stellarAnimId = requestAnimationFrame(render);
    if (document.hidden && !reduced) return;
    t += 0.016;

    const W = window.innerWidth || 1280;
    const H = window.innerHeight || 800;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)){
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }

    const ptrFresh = skinPtr.active && (performance.now() - skinPtr.lastMoved < 6000);
    const targetX = ptrFresh ? skinPtr.x : 0.5 + Math.sin(t * 0.22) * 0.28;
    const targetY = ptrFresh ? skinPtr.y : 0.42 + Math.cos(t * 0.17) * 0.22;
    skinPtr.sx += (targetX - skinPtr.sx) * 0.07;
    skinPtr.sy += (targetY - skinPtr.sy) * 0.07;
    const px = (skinPtr.sx - 0.5) * 2; // -1 .. 1 parallax vector
    const py = (skinPtr.sy - 0.5) * 2;
    const mx = skinPtr.sx * W;
    const my = skinPtr.sy * H;

    while (stellarImpulses.length){
      const imp = stellarImpulses.shift();
      starRipples.push({ x: imp.nx * W, y: imp.ny * H, r: 8, maxR: 130, life: 0, maxLife: 56 });
      if (starRipples.length > 6) starRipples.shift();
      spawnMeteor(imp);
    }

    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    // 1. 천구 성도(Astrolabe) 초박형 공전 궤도 호 & 눈금
    ctx.save();
    const astCx = W * 0.5 + px * 8;
    const astCy = H * 0.44 + py * 8;
    const baseR = Math.min(W, H);
    [baseR * 0.40, baseR * 0.62].forEach((rad, idx) => {
      const rot = t * (idx === 0 ? 0.018 : -0.012);
      ctx.save();
      ctx.translate(astCx, astCy);
      ctx.rotate(rot);
      ctx.strokeStyle = 'rgba(232, 214, 252, 0.068)';
      ctx.lineWidth = 0.75;
      ctx.setLineDash(idx === 0 ? [3, 9] : [18, 12, 2, 12]);
      ctx.beginPath();
      ctx.arc(0, 0, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (idx === 0){
        ctx.strokeStyle = 'rgba(246, 207, 164, 0.095)';
        for (let a = 0; a < 24; a++){
          const th = (a / 24) * Math.PI * 2;
          const r1 = rad - 3, r2 = rad + (a % 3 === 0 ? 6 : 3);
          ctx.beginPath();
          ctx.moveTo(Math.cos(th) * r1, Math.sin(th) * r1);
          ctx.lineTo(Math.cos(th) * r2, Math.sin(th) * r2);
          ctx.stroke();
        }
      }
      ctx.restore();
    });
    ctx.restore();

    // 2. 원경 · 중경 시차 별빛
    ctx.save();
    const renderStarLayer = list => {
      for (const s of list){
        if (!reduced){
          s.y -= s.drift;
          if (s.y < -0.02) s.y = 1.02;
        }
        const sx = s.x * W + px * s.par;
        const sy = s.y * H + py * s.par;
        const alpha = 0.22 + 0.66 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
        ctx.fillStyle = `rgba(${s.rgb}, ${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    renderStarLayer(dustStars);
    renderStarLayer(midStars);
    ctx.restore();

    // 3. 성좌 앵커 별 & 커서 기반 성좌 필라멘트 직조(Constellation Weaver)
    ctx.save();
    const activeFactor = ptrFresh ? 1.0 : 0.42;
    const anchorPts = anchorStars.map(s => {
      const sx = (s.bx + Math.sin(t * 0.16 + s.phase) * 0.004) * W + px * s.par;
      const sy = (s.by + Math.cos(t * 0.14 + s.phase) * 0.004) * H + py * s.par;
      const dist = Math.hypot(sx - mx, sy - my);
      const awaken = smoothstep(285, 36, dist) * activeFactor;
      const twinkle = 0.35 + 0.62 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
      return { s, sx, sy, dist, awaken, twinkle };
    });

    for (let i = 0; i < anchorPts.length; i++){
      const a = anchorPts[i];
      if (a.awaken <= 0.06) continue;
      for (let j = i + 1; j < anchorPts.length; j++){
        const b = anchorPts[j];
        if (b.awaken <= 0.06) continue;
        const d = Math.hypot(a.sx - b.sx, a.sy - b.sy);
        if (d < 255){
          const linkAlpha = Math.min(a.awaken, b.awaken) * (1 - d / 255) * 0.68;
          const lg = ctx.createLinearGradient(a.sx, a.sy, b.sx, b.sy);
          lg.addColorStop(0, `rgba(246, 207, 164, ${linkAlpha.toFixed(3)})`);
          lg.addColorStop(1, `rgba(198, 184, 255, ${linkAlpha.toFixed(3)})`);
          ctx.strokeStyle = lg;
          ctx.lineWidth = 0.72;
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy);
          ctx.lineTo(b.sx, b.sy);
          ctx.stroke();
        }
      }
    }

    let nearest = null;
    for (const p of anchorPts){
      if (ptrFresh && p.dist < 135 && (!nearest || p.dist < nearest.dist)) nearest = p;
      const alpha = Math.min(1, p.twinkle * 0.72 + p.awaken * 0.45);
      const flareR = p.s.r * (0.9 + p.twinkle * 0.55 + p.awaken * 0.65);
      drawFourPointStar(ctx, p.sx, p.sy, flareR, 0.21, alpha, p.s.rgb);
    }

    if (nearest){
      const retAlpha = smoothstep(135, 25, nearest.dist) * 0.36;
      ctx.save();
      ctx.translate(nearest.sx, nearest.sy);
      ctx.rotate(t * 0.35);
      ctx.strokeStyle = `rgba(246, 212, 174, ${retAlpha.toFixed(3)})`;
      ctx.lineWidth = 0.75;
      for (let q = 0; q < 4; q++){
        const a0 = q * Math.PI * 0.5 + 0.18;
        const a1 = a0 + Math.PI * 0.32;
        ctx.beginPath();
        ctx.arc(0, 0, 11, a0, a1);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();

    // 4. 클릭/드롭 진주빛 오팔 파문
    ctx.save();
    for (let i = starRipples.length - 1; i >= 0; i--){
      const rp = starRipples[i];
      rp.life += 1;
      if (rp.life >= rp.maxLife){ starRipples.splice(i, 1); continue; }
      const prog = rp.life / rp.maxLife;
      const rad = rp.r + (rp.maxR - rp.r) * (1 - Math.pow(1 - prog, 3));
      const fade = (1 - prog) * 0.45;
      ctx.strokeStyle = `rgba(242, 198, 228, ${fade.toFixed(3)})`;
      ctx.lineWidth = 1.05;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, rad, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    // 5. 곡선 궤도 유성우 & 이온화 별가루 잔상
    if (!reduced){
      meteorCooldown -= 1;
      if (meteorCooldown <= 0){
        spawnMeteor();
        meteorCooldown = 125 + Math.floor(Math.random() * 120);
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = shootingStars.length - 1; i >= 0; i--){
      const m = shootingStars[i];
      m.x += m.vx;
      m.y += m.vy;
      m.vy += m.curve;
      m.life += 1;
      if (m.life >= m.maxLife){ shootingStars.splice(i, 1); continue; }
      if (m.life % 4 === 0 && dustWake.length < 40){
        dustWake.push({ x: m.x, y: m.y, life: 0, maxLife: 24, rgb: m.rgb });
      }
      const prog = m.life / m.maxLife;
      const fade = prog < 0.2 ? prog / 0.2 : Math.max(0, 1 - (prog - 0.2) / 0.8);
      const hx = m.x * W;
      const hy = m.y * H;
      const norm = Math.hypot(m.vx * W, m.vy * H) || 1;
      const tx = hx - (m.vx * W / norm) * m.len;
      const ty = hy - (m.vy * H / norm) * m.len;

      const mg = ctx.createLinearGradient(hx, hy, tx, ty);
      mg.addColorStop(0, `rgba(255, 250, 245, ${(fade * 0.92).toFixed(2)})`);
      mg.addColorStop(0.35, `rgba(${m.rgb}, ${(fade * 0.52).toFixed(2)})`);
      mg.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.strokeStyle = mg;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      drawFourPointStar(ctx, hx, hy, 4.4, 0.24, fade * 0.95, '255,250,244');
    }

    for (let i = dustWake.length - 1; i >= 0; i--){
      const d = dustWake[i];
      d.life += 1;
      if (d.life >= d.maxLife){ dustWake.splice(i, 1); continue; }
      const fade = (1 - d.life / d.maxLife) * 0.55;
      ctx.fillStyle = `rgba(${d.rgb}, ${fade.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(d.x * W, d.y * H, 1.0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  stellarAnimId = requestAnimationFrame(render);
}

let skinBridgeReady = false;
function initSkinInteractiveBridge(){
  if (skinBridgeReady) return;
  skinBridgeReady = true;

  let activeEls = [];
  const clearSheen = () => {
    for (const el of activeEls) el.style.setProperty('--card-op', '0');
    activeEls = [];
  };

  window.addEventListener('pointermove', e => {
    if (state.skin !== 'kintsugi' && state.skin !== 'stellar'){
      if (activeEls.length) clearSheen();
      return;
    }
    const w = Math.max(1, window.innerWidth || 1280);
    const h = Math.max(1, window.innerHeight || 800);
    skinPtr.x = Math.max(0, Math.min(1, e.clientX / w));
    skinPtr.y = Math.max(0, Math.min(1, e.clientY / h));
    skinPtr.active = true;
    skinPtr.lastMoved = performance.now();

    const target = e.target;
    const nextEls = [];
    if (target && typeof target.closest === 'function'){
      const card = target.closest('.card');
      const dropEl = target.closest('#drop');
      if (card) nextEls.push(card);
      if (dropEl) nextEls.push(dropEl);
    }
    for (const prev of activeEls){
      if (!nextEls.includes(prev)) prev.style.setProperty('--card-op', '0');
    }
    for (const el of nextEls){
      const r = el.getBoundingClientRect();
      el.style.setProperty('--card-mx', `${Math.round(e.clientX - r.left)}px`);
      el.style.setProperty('--card-my', `${Math.round(e.clientY - r.top)}px`);
      el.style.setProperty('--card-op', '1');
    }
    activeEls = nextEls;
  }, { passive: true });

  window.addEventListener('pointerdown', e => {
    if (state.skin === 'kintsugi' || state.skin === 'stellar'){
      triggerThemeImpulse(e.clientX, e.clientY);
    }
  }, { passive: true });

  window.addEventListener('pointerleave', clearSheen, { passive: true });
  window.addEventListener('blur', clearSheen, { passive: true });
}

function startBgEffect(skin){
  stopBgEffects();
  if (skin === 'gemini') startGeminiBgFlow();
  else if (skin === 'kintsugi') startKintsugiBg();
  else if (skin === 'stellar') startStellarBg();
}

function applyTheme(skinName){
  const skin = VALID_SKINS.includes(skinName) ? skinName : 'default';
  state.skin = skin;
  if (skin === 'default') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', skin);
  }
  if (skin !== 'kintsugi' && skin !== 'stellar'){
    document.querySelectorAll('.card, #drop').forEach(el => el.style.removeProperty('--card-op'));
  }
  startBgEffect(skin);
  document.querySelectorAll('.skin-option-card').forEach(card => {
    card.classList.toggle('active', card.dataset.skin === skin);
  });
  save();
}

function initSkinSwitcher(){
  initSkinInteractiveBridge();
  const modal = $('skinModal');
  const btnSecret = $('skinSecretBtn');
  const btnClose = $('skinModalClose');
  const backdrop = $('skinModalBackdrop');
  if (!modal) return;

  const openModal = () => {
    modal.classList.remove('hidden');
    const activeCard = modal.querySelector(`.skin-option-card[data-skin="${state.skin || 'default'}"]`);
    if (activeCard) activeCard.focus();
  };
  const closeModal = () => modal.classList.add('hidden');
  const toggleModal = () => modal.classList.contains('hidden') ? openModal() : closeModal();

  if (btnSecret) btnSecret.onclick = toggleModal;
  if (btnClose) btnClose.onclick = closeModal;
  if (backdrop) backdrop.onclick = closeModal;

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });

  const cards = modal.querySelectorAll('.skin-option-card');
  cards.forEach(card => {
    const pick = () => {
      const skin = card.dataset.skin;
      applyTheme(skin);
      setTimeout(closeModal, 200);
    };
    card.onclick = pick;
    card.onkeydown = e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick();
      }
    };
  });

  // 초기 저장된 스킨 적용
  applyTheme(state.skin || 'default');
}
let building = false, rebuildQueued = false;
async function rebuildFromCache(){
  if (running || !totalPages || $('resultCard').classList.contains('hidden')) return;
  if (building){ rebuildQueued = true; return; }
  const mode = currentConversionMode === 'precision' ? 'precision' : 'standard';
  const cache = loadCache(mode);
  if (countCachedPages(cache) < totalPages) return;
  log('↻ 페이지 서식 옵션 적용 – 결과 파일 다시 생성');
  await buildAndPrint(cache, mode);
}

const escHtml = s => String(s || '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const isWordChar = ch => Boolean(ch && /[\p{L}\p{N}]/u.test(ch));
const isPunctChar = ch => Boolean(ch && /[\p{P}\p{S}]/u.test(ch));

function fixKoreanBold(text){
  text = text.replace(/(?<!\*)\*\*\*(?=\S)([^*\n]*?\S)\*\*\*(?!\*)/g, (m, inner, off, full) => {
    const prev = off > 0 ? full[off - 1] : '';
    const next = off + m.length < full.length ? full[off + m.length] : '';
    if ((isWordChar(prev) && isPunctChar(inner[0])) || (isPunctChar(inner[inner.length - 1]) && isWordChar(next))) {
      return `<strong><em>${inner}</em></strong>`;
    }
    return m;
  });
  return text.replace(/(?<!\*)\*\*(?=\S)((?:[^*\n]|\\\*|\*(?!\*))*?\S)(?<!\\)\*\*(?!\*)/g, (m, inner, off, full) => {
    const prev = off > 0 ? full[off - 1] : '';
    const next = off + m.length < full.length ? full[off + m.length] : '';
    if ((isWordChar(prev) && isPunctChar(inner[0])) || (isPunctChar(inner[inner.length - 1]) && isWordChar(next))) {
      return `<strong>${inner}</strong>`;
    }
    return m;
  });
}

function normalizeLatexForKatex(tex, display){
  let s = String(tex || '').trim().replace(/&amp;/g, '&');
  s = s.replace(/\\begin\{eqnarray\*?\}/g, '\\begin{aligned}')
       .replace(/\\end\{eqnarray\*?\}/g, '\\end{aligned}')
       .replace(/&\s*([=<>≤≥≠≈~]+)\s*&[ \t]*/g, '&$1 ')
       .replace(/\\bold\{/g, '\\mathbf{');
  if (!display) {
    s = s.replace(/\\begin\{align\*?\}/g, '\\begin{aligned}')
         .replace(/\\end\{align\*?\}/g, '\\end{aligned}')
         .replace(/\\begin\{gather\*?\}/g, '\\begin{gathered}')
         .replace(/\\end\{gather\*?\}/g, '\\end{gathered}')
         .replace(/\\begin\{multline\*?\}/g, '\\begin{aligned}')
         .replace(/\\end\{multline\*?\}/g, '\\end{aligned}')
         .replace(/\\begin\{equation\*?\}/g, '')
         .replace(/\\end\{equation\*?\}/g, '');
  }
  return s.trim();
}

function replaceInlineDollarOnLine(line, put){
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

    out += line.slice(i, idx) + put(rawInner, false);
    i = close + 1;
  }
  return out;
}

/* 마크다운 → HTML (수식은 marked가 건드리지 못하게 보호했다가 KaTeX로 렌더) */
function mdToHtml(md){
  const store = [];
  const put = (tex, display) => { store.push({ tex: String(tex || '').trim(), display }); return `@@MATH${store.length-1}@@`; };

  // 0. 코드 펜스 밖에서 실수로 백틱에 감싸진 수식 복원
  md = String(md || '').replace(/\r\n?/g, '\n').split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/).map((seg, i) => {
    if (i % 2) return seg;
    return seg
      .replace(/`(\$\$[\s\S]+?\$\$)`/g, '$1')
      .replace(/`(\\\[[\s\S]+?\\\])`/g, '$1')
      .replace(/`(\\\([\s\S]+?\\\))`/g, '$1')
      .replace(/`(\$(?!\s)([^\n`$]+?)(?<!\s)\$)`/g, (m, full, inner) => {
        if (/^\d[\d,.]*$/.test(inner.trim())) return m;
        return /[\\^_{}=+\-*/<>|()]|^[a-zA-Z]$/.test(inner.trim()) ? full : m;
      });
  }).join('');

  // 블록 수식 치환 시 인용문(>)·표(|) 문맥 보존
  const placeDisplayMath = (tex, offset, fullStr) => {
    const lineStart = fullStr.lastIndexOf('\n', offset - 1) + 1;
    const linePrefix = fullStr.slice(lineStart, offset);
    const bqMatch = linePrefix.match(/^([ \t]*(?:>[ \t]?)+)/);
    if (bqMatch) {
      const bq = bqMatch[1].trimEnd() + ' ';
      const cleaned = tex.replace(/^[ \t]*(?:>[ \t]?)+/gm, '');
      const ph = put(cleaned, true);
      const onlyBqBefore = linePrefix.trim() === bqMatch[1].trim();
      return onlyBqBefore ? `\n${bq}\n${bq}${ph}\n${bq}\n` : `\n${bq}\n${bq}${ph}\n${bq}`;
    }
    const lineEnd = fullStr.indexOf('\n', offset);
    const lineText = fullStr.slice(lineStart, lineEnd < 0 ? fullStr.length : lineEnd);
    if (/^\s*\|/.test(lineText) || /^\s*(?:[-*+]|\d+[.)])\s/.test(lineText)) {
      return put(tex, true);
    }
    return '\n\n' + put(tex, true) + '\n\n';
  };

  // 1. 코드 블록/인라인 코드/SVG/HTML 주석을 제외한 구간에서 수식 추출 및 한국어 굵게 보정
  md = md.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|<svg[\s\S]*?<\/svg>|<!--[\s\S]*?-->)/).map((seg, i) => {
    if (i % 2) return seg;
    seg = seg
      .replace(/\$\$([\s\S]+?)\$\$/g, (m, t, off, full) => placeDisplayMath(t, off, full))
      .replace(/\\\[([\s\S]+?)\\\]/g, (m, t, off, full) => placeDisplayMath(t, off, full))
      .replace(/\\\(([\s\S]+?)\\\)/g, (m, t) => put(t.replace(/^[ \t]*(?:>[ \t]?)+/gm, ''), false));
    seg = seg.split('\n').map(ln => replaceInlineDollarOnLine(ln, put)).join('\n');
    seg = seg.replace(/\\begin\{((?:equation|align|aligned|gather|gathered|multline|eqnarray)\*?)\}([\s\S]*?)\\end\{\1\}/g,
      (m, env, inner, off, full) => placeDisplayMath(m, off, full));
    return fixKoreanBold(seg);
  }).join('');

  // 2. 펜스 코드 블록 밖에서 각주([^n]: ...) 및 정렬 단락(<p align="...">) 추출
  const footnotes = [];
  const fnIndex = new Map();
  const definedIds = new Set();
  const alignBlocks = [];

  const chunks = md.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/);
  for (let i = 0; i < chunks.length; i += 2) {
    const lines = chunks[i].split('\n');
    const kept = [];
    for (let li = 0; li < lines.length; li++) {
      const fm = lines[li].match(/^\s*\[\^([^\]]+)\]:[ \t]*(.*)$/);
      if (fm) {
        const id = fm[1].trim();
        const parts = [fm[2]];
        while (li + 1 < lines.length && /^(?:[ \t]{2,}|\t)\S/.test(lines[li + 1])) {
          parts.push(lines[++li].trim());
        }
        const text = parts.join(' ').trim();
        definedIds.add(id);
        if (fnIndex.has(id)) {
          footnotes[fnIndex.get(id)].text += ' ' + text;
        } else {
          fnIndex.set(id, footnotes.length);
          footnotes.push({ id, text });
        }
        continue;
      }
      kept.push(lines[li]);
    }
    chunks[i] = kept.join('\n');
  }

  for (let i = 0; i < chunks.length; i += 2) {
    // 인라인 코드 구간을 제외한 영역에서 각주 참조 [^n] 치환
    let chunk = chunks[i].split(/(`[^`\n]*`)/).map((sub, j) => {
      if (j % 2) return sub;
      return sub.replace(/\[\^([^\]]+)\](?!:)/g, (m, id) => {
        const key = id.trim();
        if (definedIds.has(key) || /^(?:\d{1,3}|[*†‡§¶]+|[a-z])$/i.test(key)) {
          return `<sup class="fn-ref">[${escHtml(key)}]</sup>`;
        }
        return m;
      });
    }).join('');

    // <p align="center|right|left"> 내부 마크다운이 HTML 블록 취급으로 무시되지 않도록 분리 처리
    chunks[i] = chunk.replace(/<p\s+align=["']?(center|right|left)["']?\s*>([\s\S]*?)<\/p>/gi, (m, align, inner) => {
      const idx = alignBlocks.length;
      alignBlocks.push({ align: align.toLowerCase(), inner: inner.trim() });
      return `\n\n@@ALIGN_${idx}@@\n\n`;
    });
  }
  md = chunks.join('');

  let html = marked.parse(md, { gfm:true, breaks:true });

  if (alignBlocks.length) {
    html = html.replace(/(?:<p>\s*)?@@ALIGN_(\d+)@@(?:\s*<\/p>)?/g, (m, idx) => {
      const blk = alignBlocks[+idx];
      if (!blk) return '';
      return `<p align="${blk.align}">${marked.parseInline(blk.inner, { gfm: true, breaks: true })}</p>`;
    });
  }

  if (footnotes.length) {
    const fnHtml = footnotes.map(f => {
      const rendered = marked.parseInline(f.text, { gfm: true, breaks: true });
      return `<div class="fn-item"><span class="fn-id">[${escHtml(f.id)}]</span><div>${rendered}</div></div>`;
    }).join('');
    html += `\n<div class="footnotes"><hr class="fn-sep">${fnHtml}</div>`;
  }

  return html.replace(/@@MATH(\d+)@@/g, (m, i) => {
    const item = store[+i];
    if (!item) return m;
    const { tex, display } = item;
    try {
      return katex.renderToString(normalizeLatexForKatex(tex, display), {
        displayMode: display, throwOnError: false, output: 'html', strict: 'ignore'
      });
    } catch(e){
      return `<code>${escHtml(tex)}</code>`;
    }
  });
}

function sanitizeMermaidCode(code){
  let s = String(code || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
  if (/^(?:flowchart|graph)\s*(?:\n|$)/i.test(s)) {
    s = s.replace(/^(flowchart|graph)\s*(?=\n|$)/i, '$1 TD');
  }
  const quoteLabel = txt => txt.replace(/"/g, '#quot;').trim();
  if (/^\s*(?:flowchart|graph)\b/i.test(s)) {
    s = s.split('\n').map((ln, idx) => {
      if (idx === 0 || /^\s*%%/.test(ln)) return ln;
      ln = ln.replace(/(\b[A-Za-z0-9_.-]+)\s*\[([^"\[\]\n][^\]\n]*?)\]/g, (m, id, lbl) => {
        if (/^\[.*\]$/.test(lbl) || /^\(.*\)$/.test(lbl) || /^\/.*\/$/.test(lbl)) return m;
        return /[():/<>;&{}]/.test(lbl) ? `${id}["${quoteLabel(lbl)}"]` : m;
      });
      ln = ln.replace(/(\b[A-Za-z0-9_.-]+)\s*(?<!\()\(([^"()\n\[][^()\n]*?)\)(?!\))/g, (m, id, lbl) => {
        return /[/:<>;&\[\]{}]/.test(lbl) ? `${id}("${quoteLabel(lbl)}")` : m;
      });
      ln = ln.replace(/(\b[A-Za-z0-9_.-]+)\s*(?<!\{)\{([^"{}\n][^}\n]*?)\}(?!\})/g, (m, id, lbl) => {
        return /[():/<>;&\[\]]/.test(lbl) ? `${id}{"${quoteLabel(lbl)}"}` : m;
      });
      ln = ln.replace(/\|([^"|\n]+)\|/g, (m, lbl) => {
        return /[():<>;&\[\]{}]/.test(lbl) ? `|"${quoteLabel(lbl)}"|` : m;
      });
      return ln;
    }).join('\n');
  }
  return s;
}

/* 마크다운 → 페이지별 HTML (Mermaid는 SVG로 치환, 빈 헤더 표 정리) */
async function renderPagesHtml(bodies){
  const pages = []; let mid = 0;
  for (let n=1;n<=totalPages;n++){
    const div = document.createElement('div');
    div.innerHTML = mdToHtml(bodies[n-1] || '');
    div.querySelectorAll('table > thead').forEach(thead => {
      const ths = [...thead.querySelectorAll('th')];
      if (ths.length && ths.every(th => !th.textContent.trim() && !th.querySelector('img,svg,.katex'))) {
        thead.remove();
      }
    });
    for (const code of div.querySelectorAll('pre > code.language-mermaid')){
      const pre = code.parentElement, id = 'mm'+(mid++), rawSrc = code.textContent;
      try {
        const { svg } = await mermaid.render(id, rawSrc);
        const w = document.createElement('div'); w.className = 'mermaid-svg'; w.innerHTML = svg;
        pre.replaceWith(w);
      } catch(e){
        document.getElementById('d'+id)?.remove();
        const fixed = sanitizeMermaidCode(rawSrc);
        try {
          const { svg } = await mermaid.render(id + '_r', fixed);
          const w = document.createElement('div'); w.className = 'mermaid-svg'; w.innerHTML = svg;
          pre.replaceWith(w);
        } catch(e2){
          log(`  ⚠ p.${n} Mermaid 렌더 실패 – 코드 블록으로 유지`);
          document.getElementById('d'+id+'_r')?.remove();
        }
      }
    }
    pages.push(div.innerHTML);
  }
  return pages;
}

const canvasToBlob = (cv, type='image/png', quality) => new Promise(res => cv.toBlob(res, type, quality));

/* A4 페이지 경계 계산: 표/제목/그림/수식은 쪼개지 않고, 긴 표는 행 단위로 끊어 머리글을 반복하며, 문단은 줄 사이에서만 자른다 */
function computePageCuts(stage, Hpx){
  const px = v => parseFloat(v) || 0;
  const y0 = () => stage.getBoundingClientRect().top;
  const box = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el), t0 = y0();
    return { top: r.top - t0 - px(cs.marginTop), bottom: r.bottom - t0 + px(cs.marginBottom), rb: r.bottom - t0 }; };
  const lineRects = el => {
    const out = [], t0 = y0();
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode()); ){
      if (!n.nodeValue.trim()) continue;
      if (n.parentElement?.closest('.katex, svg, canvas')) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.height > 0) out.push({ t: r.top - t0, b: r.bottom - t0 });
    }
    el.querySelectorAll('.katex-display, .katex, img, svg, canvas, .mermaid-svg, .book-diagram, pre, figure, tr').forEach(e => {
      if (e.matches('.katex') && e.closest('.katex-display')) return;
      if (e.matches('img,svg,canvas') && e.closest('.mermaid-svg,.book-diagram,.katex')) return;
      const r = e.getBoundingClientRect();
      if (r.height > 0) out.push({ t: r.top - t0, b: r.bottom - t0 });
    });
    return out;
  };
  const safeCut = (el, pageStart, limit) => {          // 글줄/그림/수식을 가로지르지 않는 가장 아래 위치
    const rects = lineRects(el), minCut = pageStart + (limit - pageStart) * 0.4;
    let c = limit;
    for (let it = 0; it < 500; it++){
      const hit = rects.find(r => r.t + 1 < c && r.b - 1 > c);
      if (!hit) return c;
      c = hit.t - 1;
      if (c < minCut) return limit;                     // 안전한 위치가 없으면 강제 절단
    }
    return c;
  };
  const isHeading = el => /^H[1-6]$/.test(el.tagName);
  const isPushable = (el, h) => {
    const tag = el.tagName;
    if (isHeading(el)) return true;
    if (/^(PRE|IMG|HR|FIGURE|DIV|SVG)$/i.test(tag) || el.querySelector('svg,img,.katex-display')) return h <= Hpx;
    return h <= 110;                                                  // 짧은 문단/목록은 쪼개지 않음
  };
  const shouldKeepHeadingWithNext = (hNode, hBox, limit) => {
    if (!hNode.nextElementSibling) return false;
    if (hBox.bottom + 70 > limit) return true;
    let nxt = hNode.nextElementSibling;
    while (nxt && isHeading(nxt)) {
      if (box(nxt).bottom + 70 > limit) return true;
      if (!nxt.nextElementSibling) return false;
      nxt = nxt.nextElementSibling;
    }
    const nb = box(nxt), nh = nb.bottom - nb.top;
    if (nb.top >= limit - 0.5) return true;
    if (nb.bottom <= limit + 0.5) return false;
    if (nxt.tagName === 'TABLE') {
      const firstRow = nxt.tBodies[0]?.rows?.[0];
      return nh <= Hpx || (firstRow && box(firstRow).rb > limit + 0.5);
    }
    return isPushable(nxt, nh);
  };
  const cuts = [0]; let pageStart = 0, node = stage.firstElementChild, guard = 0;
  const cutAt = y => { y = Math.max(y, pageStart + 1); cuts.push(y); pageStart = y; };

  while (node && guard++ < 5000){
    const b = box(node), limit = pageStart + Hpx, h = b.bottom - b.top;
    const atTop = b.top <= pageStart + 2;
    if (isHeading(node) && !atTop && shouldKeepHeadingWithNext(node, b, limit)){ cutAt(b.top); continue; }  // 제목만 홀로 남지 않게
    if (b.bottom <= limit + 0.5){ node = node.nextElementSibling; continue; }
    if (b.top >= limit - 0.5){ cutAt(b.top); continue; }

    if (node.tagName === 'TABLE'){
      const rows = [...(node.tBodies[0]?.rows || [])];
      let k = rows.findIndex(r => box(r).rb > limit + 0.5);   // 경계에 걸치는 첫 행
      if (k === -1){ node = node.nextElementSibling; continue; }
      if (!atTop && (h <= Hpx || k === 0)){ cutAt(b.top); continue; }   // 한 페이지에 들어가는 표 → 통째로 다음 페이지로
      if (k === 0) k = 1;                                          // 페이지 맨 위인데 첫 행도 넘침 → 최소 1행은 남김
      if (k >= rows.length){ cutAt(limit); continue; }
      node.style.marginBottom = '0';
      const t2 = node.cloneNode(false);                            // 긴 표 → 행 단위로 끊고 머리글 반복
      t2.style.marginTop = '0';
      if (node.tHead) t2.appendChild(node.tHead.cloneNode(true));
      const tb = document.createElement('tbody');
      rows.slice(k).forEach(r => tb.appendChild(r));
      t2.appendChild(tb);
      node.after(t2);
      cutAt(box(t2).top); node = t2; continue;
    }

    if (isPushable(node, h) && !atTop){ cutAt(b.top); continue; }
    cutAt(safeCut(node, pageStart, limit));
  }
  return cuts;
}

/* 페이지 단위로 캡처 → PDF / PNG / ZIP 생성 */
async function makeOutputsFromPages(pagesHtml, infos, mode = currentConversionMode){
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit:'mm', format:'a4', compress:true });
  const M = 12, W = 210-2*M, H = 297-2*M;
  const stage = document.createElement('div'); stage.id = 'stage'; document.body.appendChild(stage);
  let first = true, pdfNo = 0;
  const pageCanvases = [];
  const pagePngBlobs = [];

  try {
    if (document.fonts?.ready) await document.fonts.ready;
    for (let i=0;i<pagesHtml.length;i++){
      $('pStatus').textContent = `렌더링 및 변환 중 ${i+1}/${pagesHtml.length}`;
      stage.innerHTML = pagesHtml[i] || '&nbsp;';
      if (mode === 'precision' && window.PrecisionModule) {
        await window.PrecisionModule.hydrateDiagrams(stage);
      } else if (window.renderMathInElement) {
        renderMathInElement(stage, {
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
      }
      const imgs = [...stage.querySelectorAll('img')].filter(im => !im.complete);
      if (imgs.length) {
        await Promise.all(imgs.map(im => new Promise(res => {
          im.addEventListener('load', res, { once: true });
          im.addEventListener('error', res, { once: true });
        })));
      }
      await sleep(0);
      fitWideMath(stage);
      stage.querySelectorAll('svg').forEach(svg => {
        if (svg.closest('.katex')) return;
        if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        const rect = svg.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          svg.setAttribute('width', String(Math.round(rect.width)));
          svg.setAttribute('height', String(Math.round(rect.height)));
        }
      });
      const Hpx = stage.offsetWidth * H / W;
      const bounds = [...computePageCuts(stage, Hpx), stage.offsetHeight];
      const cv = await html2canvas(stage, { scale:2, backgroundColor:'#fff', logging:false });
      const info = infos?.[i] || {};

      const kx = cv.width / stage.offsetWidth;
      const pxmm = cv.width / W;
      const maxSliceH = Math.round(H * pxmm);
      for (let bi=0; bi<bounds.length-1; bi++){
        const y = Math.round(bounds[bi]*kx), yEnd = Math.min(cv.height, Math.round(bounds[bi+1]*kx));
        if (yEnd - y <= 2) continue;
        for (let sy = y; sy < yEnd; sy += maxSliceH) {
          const sh = Math.min(maxSliceH, yEnd - sy);
          if (sh <= 2) continue;
          pdfNo++;
          const deco = pageDeco(info, i, pdfNo);
          // A4 한 장 크기의 캔버스에 본문 조각 + 머리글/바닥글을 함께 그림
          const full = document.createElement('canvas');
          full.width = Math.round(210*pxmm); full.height = Math.round(297*pxmm);
          const ctx = full.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,full.width,full.height);
          ctx.drawImage(cv, 0, sy, cv.width, sh, Math.round(M*pxmm), Math.round(M*pxmm), cv.width, sh);
          if (hasDeco(deco)) drawDeco(ctx, full.width, M*pxmm, 6.5*pxmm, full.height - 6.5*pxmm, 2.9*pxmm, deco);
          if (!first) pdf.addPage(); first = false;
          pdf.addImage(full.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
          full.width = full.height = 0;
        }
      }

      const outCv = decorateCanvas(cv, pageDeco(info, i, i+1));
      pageCanvases.push(outCv);
      const pBlob = await canvasToBlob(outCv, 'image/png');
      if (pBlob) pagePngBlobs.push(pBlob);
      await sleep(0);
    }

    // 1장의 PNG 생성 (1페이지면 그대로, 여러 페이지면 세로 병합; 캔버스 최대 높이 제한 고려)
    let pngBlob = null;
    if (pageCanvases.length === 1) {
      pngBlob = pagePngBlobs[0];
    } else if (pageCanvases.length > 1) {
      const gap = 24;
      const maxW = Math.max(...pageCanvases.map(c => c.width));
      const rawTotalH = pageCanvases.reduce((acc, c) => acc + c.height, 0) + gap * (pageCanvases.length - 1);
      const MAX_CANVAS_H = 30000;
      const scale = rawTotalH > MAX_CANVAS_H ? (MAX_CANVAS_H / rawTotalH) : 1;
      const tall = document.createElement('canvas');
      tall.width = Math.round(maxW * scale);
      tall.height = Math.round(rawTotalH * scale);
      const tctx = tall.getContext('2d');
      tctx.fillStyle = '#f1f5f9';
      tctx.fillRect(0, 0, tall.width, tall.height);
      let curY = 0;
      for (const c of pageCanvases) {
        const dw = Math.round(c.width * scale);
        const dh = Math.round(c.height * scale);
        tctx.fillStyle = '#fff';
        tctx.fillRect(0, curY, tall.width, dh);
        tctx.drawImage(c, 0, curY, dw, dh);
        curY += dh + Math.round(gap * scale);
      }
      pngBlob = await canvasToBlob(tall, 'image/png');
      tall.width = tall.height = 0;
    }

    // 다중 페이지일 때 개별 PNG ZIP 압축 생성
    let zipBlob = null;
    if (pagePngBlobs.length > 1 && window.JSZip) {
      const zip = new JSZip();
      const bName = baseName().replace(/[\\/:*?"<>|]+/g,'_');
      pagePngBlobs.forEach((b, idx) => {
        const pNum = String(idx + 1).padStart(String(pagePngBlobs.length).length, '0');
        zip.file(`${bName}_p${pNum}.png`, b);
      });
      zipBlob = await zip.generateAsync({ type: 'blob' });
    }

    for (const c of pageCanvases) { c.width = c.height = 0; }
    return { pdfBlob: pdf.output('blob'), pngBlob, zipBlob, pdfPageCount: pdfNo };
  } finally { stage.remove(); }
}

function getSafeExportName() {
  const raw = ($('outName')?.value.trim() || baseName() || 'document')
    .replace(/\.(?:pdf|png|zip|html?|md)$/i, '')
    .trim() || 'document';
  return raw.replace(/[\\/:*?"<>|]+/g, '_');
}

function updateExportUI(){
  const metaEl = $('outMeta');
  if (metaEl) {
    metaEl.textContent = (outPdfPages && outPdfPages !== totalPages)
      ? `원본 ${totalPages}쪽 · PDF ${outPdfPages}쪽`
      : `총 ${totalPages}쪽`;
  }
  if ($('szPdf')) $('szPdf').textContent = outBlobs.pdf ? `이미지 · ${fmtSize(outBlobs.pdf.size)}` : '이미지';
  if ($('lblPng')) $('lblPng').textContent = totalPages > 1 ? 'PNG 한 장' : 'PNG';
  if ($('szPng')) $('szPng').textContent = outBlobs.png ? `한 개의 이미지 · ${fmtSize(outBlobs.png.size)}` : '한 개의 이미지';
  if ($('dlPngZip')) {
    const hasZip = totalPages > 1 && !!outBlobs.png_zip;
    $('dlPngZip').classList.toggle('hidden', !hasZip);
    if (hasZip && $('szPngZip')) {
      $('szPngZip').textContent = `${totalPages}장 .zip · ${fmtSize(outBlobs.png_zip.size)}`;
    }
  }
  if ($('szHtml')) $('szHtml').textContent = outBlobs.html ? `벡터 원본 · ${fmtSize(outBlobs.html.size)}` : '벡터 원본';
  if ($('szMd')) $('szMd').textContent = outBlobs.md ? `원문 · ${fmtSize(outBlobs.md.size)}` : '원문';
}

const VALID_PV_MODES = ['single', 'spread'];
let previewViewMode = VALID_PV_MODES.includes(state.pvMode) ? state.pvMode : 'single';
let previewPageIdx = 0;
let previewExpanded = false;
let previewJumpUntil = 0;

function updatePreviewNavUi(idx, total) {
  const pageLabel = $('pvPageLabel');
  const prevBtn = $('pvPrevBtn');
  const nextBtn = $('pvNextBtn');
  if (!total) {
    if (pageLabel) pageLabel.textContent = '0 / 0';
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }
  if (previewViewMode === 'spread') {
    const pairStart = Math.floor(idx / 2) * 2;
    const pairEnd = Math.min(total - 1, pairStart + 1);
    if (pageLabel) {
      pageLabel.textContent = pairStart === pairEnd
        ? `${pairStart + 1} / ${total}`
        : `${pairStart + 1}-${pairEnd + 1} / ${total}`;
    }
    if (prevBtn) prevBtn.disabled = pairStart <= 0;
    if (nextBtn) nextBtn.disabled = pairEnd >= total - 1;
  } else {
    if (pageLabel) pageLabel.textContent = `${idx + 1} / ${total}`;
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx >= total - 1;
  }
}

function scrollToPreviewPage(container, pageEl, smooth = false) {
  if (!container || !pageEl || typeof container.scrollTo !== 'function') return;
  const cRect = typeof container.getBoundingClientRect === 'function' ? container.getBoundingClientRect() : null;
  const pRect = typeof pageEl.getBoundingClientRect === 'function' ? pageEl.getBoundingClientRect() : null;
  if (!cRect || !pRect) return;
  const padTop = typeof getComputedStyle === 'function' ? (parseFloat(getComputedStyle(container).paddingTop) || 16) : 16;
  const targetTop = Math.max(0, container.scrollTop + (pRect.top - cRect.top) - padTop);
  container.scrollTo({ top: targetTop, behavior: smooth ? 'smooth' : 'auto' });
}

function syncPreviewIndicator() {
  const container = $('previewContainer');
  if (!container) return;
  const pages = [...container.querySelectorAll('.page')];
  const total = pages.length;
  if (!total) {
    previewPageIdx = 0;
    updatePreviewNavUi(0, 0);
    return;
  }

  let activeIdx = previewPageIdx;
  const cRect = typeof container.getBoundingClientRect === 'function' ? container.getBoundingClientRect() : null;
  if (cRect && cRect.height > 0) {
    const threshold = cRect.top + 40;
    const found = pages.findIndex(p => {
      const r = typeof p.getBoundingClientRect === 'function' ? p.getBoundingClientRect() : null;
      return r && r.height > 0 && r.bottom > threshold;
    });
    if (found >= 0) activeIdx = found;
  }
  previewPageIdx = Math.max(0, Math.min(activeIdx, total - 1));
  updatePreviewNavUi(previewPageIdx, total);
}

function renderPreviewState(preserveAnchor = false) {
  const container = $('previewContainer');
  if (!container) return;
  const pages = [...container.querySelectorAll('.page')];
  const total = pages.length;

  if (!VALID_PV_MODES.includes(previewViewMode)) previewViewMode = 'single';
  container.classList.remove('view-single', 'view-spread', 'is-single-sheet');
  container.classList.add(`view-${previewViewMode}`);
  if (previewViewMode === 'spread' && total === 1) {
    container.classList.add('is-single-sheet');
  }

  document.querySelectorAll('[data-pv-mode]').forEach(btn => {
    const active = btn.dataset.pvMode === previewViewMode;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  const nav = $('previewNav');
  const metaEl = $('previewMeta');
  if (metaEl) metaEl.textContent = total ? `총 ${total}쪽` : '';
  if (nav) nav.classList.toggle('hidden', total <= 1);

  if (preserveAnchor && total && pages[previewPageIdx]) {
    scrollToPreviewPage(container, pages[previewPageIdx], false);
  } else if (!preserveAnchor && total) {
    container.scrollTop = 0;
  }
  syncPreviewIndicator();
}

function setPreviewMode(mode) {
  if (!VALID_PV_MODES.includes(mode)) return;
  previewViewMode = mode;
  state.pvMode = mode;
  save();
  const container = $('previewContainer');
  if (container && container.classList.contains('hidden')) {
    container.classList.remove('hidden');
    if ($('previewToggleBtn')) $('previewToggleBtn').textContent = '접기';
  }
  renderPreviewState(true);
}

function stepPreviewPage(delta) {
  const container = $('previewContainer');
  if (!container) return;
  const pages = [...container.querySelectorAll('.page')];
  const total = pages.length;
  if (total <= 1) return;

  let targetIdx;
  if (previewViewMode === 'spread') {
    const curPairStart = Math.floor(previewPageIdx / 2) * 2;
    targetIdx = Math.max(0, Math.min(total - 1, curPairStart + delta * 2));
    if (targetIdx === curPairStart) return;
  } else {
    targetIdx = Math.max(0, Math.min(total - 1, previewPageIdx + delta));
    if (targetIdx === previewPageIdx) return;
  }

  previewPageIdx = targetIdx;
  previewJumpUntil = Date.now() + 450;
  scrollToPreviewPage(container, pages[targetIdx], true);
  updatePreviewNavUi(targetIdx, total);
}

function setPreviewExpanded(expanded) {
  const card = $('previewCard');
  const container = $('previewContainer');
  const expandBtn = $('pvExpandBtn');
  previewExpanded = Boolean(expanded && card && !card.classList.contains('hidden'));
  if (card) card.classList.toggle('is-expanded', previewExpanded);
  document.body.classList.toggle('preview-expanded-lock', previewExpanded);
  if (previewExpanded && container && container.classList.contains('hidden')) {
    container.classList.remove('hidden');
    if ($('previewToggleBtn')) $('previewToggleBtn').textContent = '접기';
  }
  if (expandBtn) expandBtn.textContent = previewExpanded ? '원래 크기' : '넓게 보기';
}

async function buildAndPrint(cache, mode = currentConversionMode){   // (이름 유지) 인쇄 창 없이 파일 생성 + 미리보기 반영
  building = true;
  const activeMode = mode === 'precision' ? 'precision' : 'standard';
  try {
    const infos = preparePages(cache);
    const decos = infos.map((p, i) => pageDeco(p, i, i + 1));
    const previewContainer = $('previewContainer');
    let pagesHtml;

    if (activeMode === 'precision' && window.PrecisionModule) {
      const renderedBodies = infos.map(p => window.PrecisionModule.renderMarkdown(p.body || ''));
      const tempHost = previewContainer || document.createElement('div');
      tempHost.innerHTML = renderedBodies.map((h, i) => {
        const d = decos[i];
        const hd = d.header ? `<div class="pg-h">${escHtml(d.header)}</div>` : '';
        const ft = (d.footer || d.num) ? `<div class="pg-f"><span>${escHtml(d.footer)}</span><span>${escHtml(d.num)}</span></div>` : '';
        return `<section class="page">${hd}<div class="page-body">${h}</div>${ft}</section>`;
      }).join('');
      tempHost.querySelectorAll('table > thead').forEach(thead => {
        const ths = [...thead.querySelectorAll('th')];
        if (ths.length && ths.every(th => !th.textContent.trim() && !th.querySelector('img,svg,.katex'))) {
          thead.remove();
        }
      });
      await window.PrecisionModule.hydrateDiagrams(tempHost);
      pagesHtml = [...tempHost.querySelectorAll('.page-body')].map(el => el.innerHTML);
    } else {
      pagesHtml = await renderPagesHtml(infos.map(p => p.body));
      if (previewContainer) {
        previewContainer.innerHTML = pagesHtml.map((h, i) => {
          const d = decos[i];
          const hd = d.header ? `<div class="pg-h">${escHtml(d.header)}</div>` : '';
          const ft = (d.footer || d.num) ? `<div class="pg-f"><span>${escHtml(d.footer)}</span><span>${escHtml(d.num)}</span></div>` : '';
          return `<section class="page">${hd}<div class="page-body">${h}</div>${ft}</section>`;
        }).join('');
      }
    }

    lastPagesHtml = pagesHtml;
    const mdAll = infos.map((p, i) => {
      const d = decos[i];
      const head = d.header ? `*${d.header}*\n\n` : '';
      const foot = [d.footer ? `*${d.footer}*` : '', d.num ? `— ${d.num} —` : ''].filter(Boolean).join(' · ');
      return head + p.body + (foot ? `\n\n${foot}` : '');
    }).join('\n\n---\n\n');
    const title = baseName().replace(/[<>&]/g,'');
    const sections = pagesHtml.map((h, i) => {
      const d = decos[i];
      const hd = d.header ? `<div class="pg-h">${escHtml(d.header)}</div>` : '';
      const ft = (d.footer || d.num) ? `<div class="pg-f"><span>${escHtml(d.footer)}</span><span>${escHtml(d.num)}</span></div>` : '';
      return `<section class="page">${hd}${h}${ft}</section>`;
    }).join('');
    const htmlDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"><style>${PRINT_CSS}</style></head><body>${sections}</body></html>`;
    const { pdfBlob, pngBlob, zipBlob, pdfPageCount } = await makeOutputsFromPages(pagesHtml, infos, activeMode);
    outPdfPages = pdfPageCount || totalPages;
    const mdBlob = new Blob([mdAll], { type:'text/markdown;charset=utf-8' });
    const htmlBlob = new Blob([htmlDoc], { type:'text/html;charset=utf-8' });

    Object.values(outUrls).forEach(u => u && URL.revokeObjectURL(u));
    outBlobs = {
      pdf: pdfBlob,
      png: pngBlob,
      png_zip: zipBlob || null,
      md: mdBlob,
      html: htmlBlob
    };
    outUrls = {
      pdf:     pdfBlob ? URL.createObjectURL(pdfBlob) : '',
      png:     pngBlob ? URL.createObjectURL(pngBlob) : '',
      png_zip: zipBlob ? URL.createObjectURL(zipBlob) : '',
      md:      URL.createObjectURL(mdBlob),
      html:    URL.createObjectURL(htmlBlob)
    };

    $('outName').value = baseName() + '_변환';
    updateExportUI();
    $('resultCard').classList.remove('hidden');
    if ($('previewCard') && previewContainer) {
      previewContainer.classList.remove('hidden');
      if ($('previewToggleBtn')) $('previewToggleBtn').textContent = '접기';
      $('previewCard').classList.remove('hidden');
      previewPageIdx = 0;
      renderPreviewState();
    }
    $('pStatus').textContent = '완료';
    log('✓ 변환 완료 – 원하는 형식으로 저장하거나 인쇄할 수 있습니다.');
    $('resultCard').scrollIntoView({ behavior:'smooth', block:'nearest' });
  } catch(e){ log('✗ 파일 생성 실패: '+e.message); }
  finally {
    building = false;
    if (rebuildQueued){ rebuildQueued = false; rebuildFromCache(); }
  }
}

async function printViaIframe() {
  const previewContainer = $('previewContainer');
  if (!previewContainer || !previewContainer.innerHTML.trim()) {
    return alert('인쇄할 변환 결과가 없습니다.');
  }

  if (currentConversionMode === 'precision' && window.PrecisionModule) {
    await window.PrecisionModule.hydrateDiagrams(previewContainer);
  }

  const existing = document.getElementById('precisionPrintFrame');
  if (existing) existing.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'precisionPrintFrame';
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:210mm;height:0;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(iframe);

  const iframeWin = iframe.contentWindow;
  const iframeDoc = iframe.contentDocument || iframeWin?.document;
  if (!iframeWin || !iframeDoc) {
    iframe.remove();
    return alert('인쇄 프레임을 초기화할 수 없습니다.');
  }

  const fileTitle = getSafeExportName();
  const printableHtml = previewContainer.innerHTML;
  const katexHref = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${escHtml(fileTitle)}</title><link id="printKatexCss" rel="stylesheet" href="${katexHref}"><style>${PRINT_CSS}</style></head><body>${printableHtml}</body></html>`;

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  const withTimeout = (promise, ms) => Promise.race([promise, new Promise(res => setTimeout(res, ms))]);

  const katexLink = iframeDoc.getElementById('printKatexCss');
  if (katexLink && !katexLink.sheet) {
    await withTimeout(new Promise(res => {
      katexLink.addEventListener('load', res, { once: true });
      katexLink.addEventListener('error', res, { once: true });
    }), 3000);
  }

  const imgs = [...iframeDoc.querySelectorAll('img')].filter(im => !im.complete);
  if (imgs.length) {
    await withTimeout(Promise.all(imgs.map(im => new Promise(res => {
      im.addEventListener('load', res, { once: true });
      im.addEventListener('error', res, { once: true });
    }))), 3000);
  }

  if (iframeWin.document.fonts?.ready) {
    await withTimeout(iframeWin.document.fonts.ready.catch(() => {}), 3000);
  }

  await new Promise(res => iframeWin.requestAnimationFrame(() => iframeWin.requestAnimationFrame(res)));

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.title = APP_DOC_TITLE;
    iframeWin.removeEventListener('afterprint', cleanup);
    window.removeEventListener('afterprint', cleanup);
    setTimeout(() => { if (iframe.parentNode) iframe.remove(); }, 250);
  };
  iframeWin.addEventListener('afterprint', cleanup, { once: true });
  window.addEventListener('afterprint', cleanup, { once: true });
  setTimeout(cleanup, 60000);

  document.title = fileTitle;
  iframeWin.focus();
  iframeWin.print();
}

function download(kind, ext){
  if (!outUrls[kind]) return;
  const a = document.createElement('a');
  a.href = outUrls[kind];
  a.download = getSafeExportName() + '.' + ext;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
$('dlPdf').onclick = () => download('pdf', 'pdf');
$('dlPng').onclick = () => download('png', 'png');
if ($('dlPngZip')) $('dlPngZip').onclick = () => download('png_zip', 'zip');
$('dlMd').onclick = () => download('md', 'md');
$('dlHtml').onclick = () => download('html', 'html');
if ($('printBtn')) $('printBtn').onclick = printViaIframe;

document.querySelectorAll('[data-pv-mode]').forEach(btn => {
  btn.onclick = () => setPreviewMode(btn.dataset.pvMode);
});
if ($('pvPrevBtn')) $('pvPrevBtn').onclick = () => stepPreviewPage(-1);
if ($('pvNextBtn')) $('pvNextBtn').onclick = () => stepPreviewPage(1);
if ($('pvExpandBtn')) $('pvExpandBtn').onclick = () => setPreviewExpanded(!previewExpanded);
if ($('previewToggleBtn') && $('previewContainer')) {
  $('previewToggleBtn').onclick = () => {
    const collapsed = $('previewContainer').classList.toggle('hidden');
    $('previewToggleBtn').textContent = collapsed ? '펼치기' : '접기';
    if (collapsed && previewExpanded) setPreviewExpanded(false);
  };
}
if ($('previewContainer')) {
  let pvScrollRaf = null;
  $('previewContainer').addEventListener('scroll', () => {
    if (pvScrollRaf) return;
    pvScrollRaf = requestAnimationFrame(() => {
      pvScrollRaf = null;
      if (Date.now() >= previewJumpUntil) syncPreviewIndicator();
    });
  }, { passive: true });
}
document.addEventListener('keydown', e => {
  const card = $('previewCard');
  if (!card || card.classList.contains('hidden')) return;
  if (e.key === 'Escape' && previewExpanded) {
    e.preventDefault();
    setPreviewExpanded(false);
  }
});
init();
