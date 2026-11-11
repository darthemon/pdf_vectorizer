'use strict';
const $ = id => document.getElementById(id);
const GOOGLE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const FACTCHAT_URL = 'https://factchat-cloud.mindlogic.ai/v1/gateway';
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

/* ---------- 4단계 모델 등급 분류 및 가중치 ---------- */
const MODEL_TIERS = {
  flash: {
    grade: 1,
    prefix: '[🟢추천]',
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

function getModelMeta(modelId) {
  const l = String(modelId || '').toLowerCase();
  // 1. 초고비용 (astra, fable)
  if (l.includes('astra') || l.includes('fable') || l.includes('carbon')) return MODEL_TIERS.ultra;
  // 2. 고비용 (sol, opus, argon)
  if (l.includes('sol') || l.includes('opus') || l.includes('argon')) return MODEL_TIERS.high;
  // 3. 표준 (sonnet, terra, pro, gemma)
  if (l.includes('sonnet') || l.includes('terra') || l.includes('pro')) return MODEL_TIERS.standard;
  // 4. 저비용 · 추천 (flash, haiku)
  if (l.includes('flash') || l.includes('haiku') || l.includes('luna') || l.includes('gemma')) return MODEL_TIERS.flash;
  // fallback: 표준 모델
  return MODEL_TIERS.standard;
}

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
  const meta = getModelMeta(model);
  const badge = $('modelBadge');
  if (badge) {
    badge.textContent = meta.badge;
    badge.style.background = meta.badgeColor + '22';
    badge.style.color = meta.badgeColor;
    badge.style.border = `1px solid ${meta.badgeColor}`;
  }
  const ttDesc = $('ttDesc');
  const ttCost = $('ttCost');
  if (ttDesc) ttDesc.textContent = meta.tooltip;
  if (ttCost) {
    if (activeProvider === 'google') {
      ttCost.textContent = `⚡ 초당 약 ${meta.secPerPage}초/p 고속 처리 · 토큰 기반 변환`;
    } else {
      const estPerPage = Math.round((0.65 * meta.creditPer1kInput + 1.1 * meta.creditPer1kOutput) * 10) / 10;
      ttCost.textContent = `⚡ 페이지당 약 ${estPerPage} 크레딧 차감 (1k토큰당 입: ${meta.creditPer1kInput} / 출: ${meta.creditPer1kOutput})`;
    }
  }

  const warn = $('costWarn');
  if (warn) {
    if (meta.warn && activeProvider !== 'google') {
      warn.textContent = meta.warnText;
      warn.classList.remove('hidden');
    } else {
      warn.classList.add('hidden');
    }
  }
}

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
mermaid.initialize({ startOnLoad:false, securityLevel:'loose', theme:'default' });

/* ---------- 설정 저장 (localStorage) ---------- */
const LS = 'pdfvec.settings.v2';
const state = { key:'', model:DEFAULT_MODEL, conc:'4', pgNum:'off', pgHeader:false, pgFooter:false, skin:'default' };
try { Object.assign(state, JSON.parse(localStorage.getItem(LS)||'{}')); } catch(e){}
const save = () => localStorage.setItem(LS, JSON.stringify(state));

/* ---------- 모델 필터 및 정렬 ---------- */
const VENDORS = [
  ['Anthropic (Claude)', /claude/],
  ['OpenAI (GPT)',       /gpt|chatgpt|(^|[-_/])o[134](-|$)/],
  ['Google (Gemini/Gemma)', /gemini|gemma/],
  ['xAI (Grok)',         /grok/],
  ['DeepSeek',           /deepseek/],
  ['Meta (Llama)',       /llama/],
  ['Mistral',            /mistral|mixtral|codestral/],
  ['Alibaba (Qwen)',     /qwen/]
];
const OTHER_VENDOR = '기타';
const vendorOf = id => { const l = id.toLowerCase(); const v = VENDORS.find(([,re]) => re.test(l)); return v ? v[0] : OTHER_VENDOR; };
function perfScore(id){
  const l = id.toLowerCase();
  let tier = 3;
  if (/mini|nano|lite|haiku|small|gemma|\b8b\b/.test(l)) tier = 1;
  else if (/flash|turbo/.test(l)) tier = 2;
  else if (/opus|ultra|pro|gpt-5|(^|[-_/])o[134](-|$)|large|max/.test(l)) tier = 4;
  let ver = 0;
  for (const m of l.matchAll(/(\d{1,2})(?:[.-](\d{1,2}))?(?!\d)/g)){
    const v = parseFloat(m[1] + (m[2] ? '.'+m[2] : ''));
    if (v < 20) { ver = v; break; }
  }
  const date = parseInt((l.match(/(20\d{6})/)||[])[1] || 0, 10) / 1e9;
  return tier*100 + ver + date;
}

/* 텍스트/비전 LLM이 아닌 모델 제외 및 파생 모델 필터링 */
const NON_TEXT_RE = /embed|rerank|moderation|image|imagen|dall|flux|midjourney|diffusion|sdxl|stable-?image|ideogram|recraft|firefly|banana|seedream|video|veo|sora|kling|runway|luma|pika|hailuo|seedance|(^|[-_/.])wan[-_.\d]|music|suno|udio|lyria|tts|whisper|stt|transcri|speech|audio|voice|realtime|aqa|learnlm|robotics/;
const isNonTextId = id => NON_TEXT_RE.test(String(id).toLowerCase());

const EXCLUDE_KEYWORDS = [
  'nano', 'embedding', 'imagen', 'dall-e', 'sora', 'veo',
  'tts', 'whisper', 'audio', 'moderation', '1.0', '1.5', '2.0',
  'exp', 'preview', 'live', 'thinking', 'omni', 'latest',
  'banana', 'robotics', 'computer-use', 'transcri', 'translate',
  'research', 'antigravity', 'customtools'
];

const FOUR_TIER_KEYWORDS = [
  'flash', 'haiku', 'luna', 'gemma',
  'sonnet', 'terra', 'pro',
  'sol', 'opus', 'argon',
  'astra', 'fable', 'carbon'
];

function isExcludedModel(id) {
  const l = String(id).toLowerCase();
  if (isNonTextId(id)) return true;
  // gemini-3.1-pro는 정규 프로 모델이므로 preview 키워드가 있어도 명시적 허용
  if (l.includes('3.1-pro')) {
    if (l.includes('customtools') || l.includes('image')) return true;
    return false;
  }
  // 주의: 'gemini' 브랜드명에 'mini'가 포함되므로 독립 단어/구분자(예: gpt-4o-mini, o1-mini 등)일 때만 제외
  if (/(^|[-_/.])mini([-_/.]|$)/.test(l)) return true;
  // 중간 테스트/체크포인트 버전 제외 (3.1-flash, 3.6, 3.7 등)
  if (/(^|[-_/.])3\.[167]([-_/.]|$)/.test(l)) return true;
  if (EXCLUDE_KEYWORDS.some(k => l.includes(k))) return true;
  return false;
}

function isNonTextMeta(o){
  if (!o || typeof o !== 'object') return false;
  const kind = String(o.type || o.mode || o.category || o.object_type || '').toLowerCase();
  if (kind && /image|video|audio|speech|embed|rerank|moderation|tts|transcri/.test(kind)) return true;
  const outs = o.output_modalities || o.architecture?.output_modalities || o.modalities?.output;
  if (Array.isArray(outs) && outs.length && !outs.map(x=>String(x).toLowerCase()).includes('text')) return true;
  const cap = o.capabilities;
  if (cap && typeof cap === 'object' && !Array.isArray(cap) && ('chat' in cap || 'text' in cap) && !cap.chat && !cap.text) return true;
  return false;
}

const PINNED_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];

function sortModelsByTier(ids){
  return ids.sort((a,b) => {
    // 1순위: 추천 기본 프리셋 상단 고정
    const pinA = PINNED_MODELS.indexOf(a);
    const pinB = PINNED_MODELS.indexOf(b);
    if (pinA !== -1 && pinB !== -1) return pinA - pinB;
    if (pinA !== -1) return -1;
    if (pinB !== -1) return 1;

    // 2순위: 4단계 등급순 (🟢 추천 ➔ 🔵 표준 ➔ 🟠 고비용 ➔ 🔴 초고비용)
    const metaA = getModelMeta(a);
    const metaB = getModelMeta(b);
    if (metaA.grade !== metaB.grade) return metaA.grade - metaB.grade;

    // 3순위: gemini 우선 노출 후 gemma
    const gemA = a.toLowerCase().includes('gemini') ? 0 : 1;
    const gemB = b.toLowerCase().includes('gemini') ? 0 : 1;
    if (gemA !== gemB) return gemA - gemB;

    // 4순위: 모델 버전 점수 및 이름순
    return perfScore(b) - perfScore(a) || a.localeCompare(b);
  });
}

function filterValidModels(ids, provider){
  const clean = [...new Set(ids.map(i => String(i).replace(/^models\//,'')))].filter(id => !isExcludedModel(id));
  if (provider === 'google'){
    const googleModels = clean.filter(id => {
      const l = id.toLowerCase();
      // Google AI Studio: gemini (flash, pro, argon 등 메이저 모델) 및 gemma 모델 허용
      if (!(l.includes('gemini') || l.includes('gemma'))) return false;
      return true;
    });
    return sortModelsByTier(googleModels);
  }
  // factchat: 4단계 등급 키워드에 해당하는 모델 필터링
  const factchatModels = clean.filter(id => FOUR_TIER_KEYWORDS.some(k => id.toLowerCase().includes(k)));
  return sortModelsByTier(factchatModels.length ? factchatModels : clean);
}

/* ---------- 자동 감지 ---------- */
const PROVIDERS = {
  google:  { name:'Google AI Studio', url: GOOGLE_URL },
  factchat:{ name:'FactChat',         url: FACTCHAT_URL }
};
let activeBaseUrl = '', activeProvider = '', detectSeq = 0;

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
    if (!canvas.offsetParent) return;

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
function setModels(models, lock){
  const sel = $('modelSelect');
  sel.innerHTML = '';
  models.forEach(m => {
    const meta = getModelMeta(m);
    sel.add(new Option(`${meta.prefix} ${m}`, m));
  });
  const target = models.includes(state.model) ? state.model : (models.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : models[0]);
  sel.value = target;
  sel.disabled = !!lock;
  state.model = sel.value; save();
  updateModelBadgeAndTooltip(state.model);
  updateEta();
}
const currentModel = () => $('modelSelect').value;

async function fetchModelIds(base, key){
  const r = await fetch(base+'/models', { headers:{ Authorization:'Bearer '+key }});
  if (!r.ok) throw new Error('HTTP '+r.status);
  const j = await r.json();
  const raw = j.data||j.models||[];
  const items = raw.length > 1 ? raw.filter(m => !isNonTextMeta(m)) : raw;   // 단일 모델 키는 예외
  return items.map(m => m.id || m.name).filter(Boolean).map(i => String(i).replace(/^models\//,''));
}
/* /models 조회가 막힌 키: 대표 모델로 1토큰 호출 */
async function probeModel(base, key){
  for (const model of [DEFAULT_MODEL, 'gemini-3.8-flash']){
    try {
      const r = await fetch(base+'/chat/completions', { method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+key },
        body: JSON.stringify({ model, max_tokens:1, messages:[{ role:'user', content:'hi' }] }) });
      if (r.ok) return model;
    } catch(e){}
  }
  return null;
}

async function autoDetectAndLoadModels(apiKey){
  const key = (apiKey||'').trim(), seq = ++detectSeq;
  activeBaseUrl = ''; activeProvider = '';
  if (!key){
    setBadge('● 키 입력 대기','idle');
    setModels([DEFAULT_MODEL], true);
    $('modelSelect').innerHTML='<option value="">(키 입력 후 자동 로드)</option>';
    msg('');
    updateProviderCardUi();
    return;
  }
  setBadge('● 감지 중…','busy'); msg('');
  const order = key.startsWith('AIza') ? ['google','factchat'] : ['factchat','google'];

  // 2차: /models 프로빙
  for (const id of order){
    const p = PROVIDERS[id];
    try {
      const ids = await fetchModelIds(p.url, key);
      if (seq !== detectSeq) return;
      activeBaseUrl = p.url; activeProvider = id;
      updateProviderCardUi();
      if (ids.length === 1){               // 모델 전용 키: 필터 예외, 자동 고정
        setModels([ids[0]], true);
        setBadge(`● ${p.name} 연결됨 (단일 모델 자동 고정)`, 'ok');
        msg(`단일 모델 키: ${ids[0]}`); return;
      }
      const list = filterValidModels(ids, id);
      if (list.length){
        setModels(list, false);
        setBadge(`● ${p.name} 연결됨`, 'ok');
        msg(`사용 가능 모델 ${list.length}개 (원본 ${ids.length}개 중 필터링)`); return;
      }
      const m = await probeModel(p.url, key);   // 연결은 됐지만 허용 모델 없음 → 대표 모델 시도
      if (seq !== detectSeq) return;
      if (m){ setModels([m], true); setBadge(`● ${p.name} 연결됨 (단일 모델 자동 고정)`, 'ok'); msg('필터 통과 모델이 없어 대표 모델로 고정'); return; }
      setBadge(`● ${p.name} 연결됨 – 사용 가능 모델 없음`, 'err'); setModels([DEFAULT_MODEL], true); return;
    } catch(e){ /* 다음 후보 */ }
  }

  // /models 실패 → 1토큰 테스트 호출
  for (const id of order){
    const p = PROVIDERS[id];
    const m = await probeModel(p.url, key);
    if (seq !== detectSeq) return;
    if (m){
      activeBaseUrl = p.url; activeProvider = id;
      updateProviderCardUi();
      setModels([m], true);
      setBadge(`● ${p.name} 연결됨 (단일 모델 자동 고정)`, 'ok');
      msg('/models 조회 권한 없음 → 1토큰 테스트로 모델 고정'); return;
    }
  }
  if (seq !== detectSeq) return;
  setBadge('● 연결 실패','err');
  activeProvider = '';
  updateProviderCardUi();
  msg('키가 유효하지 않거나 네트워크/CORS 문제로 두 엔드포인트 모두 연결하지 못했습니다.', true);
  $('modelSelect').innerHTML = '<option value="">(연결 실패)</option>'; $('modelSelect').disabled = true;
}

/* ---------- 설정 이벤트 ---------- */
let typeTimer;
$('apiKeyInput').addEventListener('input', () => { clearTimeout(typeTimer);
  typeTimer = setTimeout(() => { state.key = $('apiKeyInput').value.trim(); save(); autoDetectAndLoadModels(state.key); }, 500); });
$('apiKeyInput').addEventListener('change', () => { clearTimeout(typeTimer);
  state.key = $('apiKeyInput').value.trim(); save(); autoDetectAndLoadModels(state.key); });
$('modelSelect').onchange = () => {
  state.model = $('modelSelect').value;
  save();
  updateModelBadgeAndTooltip(state.model);
  updateEta();
};
$('concurrencySelect').onchange = () => { state.conc = $('concurrencySelect').value; save(); updateEta(); };

function showTooltip(){ $('modelTooltip')?.classList.remove('hidden'); }
function hideTooltip(){ $('modelTooltip')?.classList.add('hidden'); }
[$('modelSelect'), $('modelBadge'), $('tooltipWrap')].forEach(el => {
  if (el){
    el.addEventListener('mouseenter', showTooltip);
    el.addEventListener('mouseleave', hideTooltip);
  }
});

function init(){
  $('concurrencySelect').value = state.conc;
  $('apiKeyInput').value = state.key;
  initPageOptions();
  initSkinSwitcher();
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

const sig = () => {
  if (inputMode === 'images' && imageFiles.length) {
    return 'pdfvec:imgs:' + imageFiles.map(f => `${f.name}:${f.size}:${f.lastModified}`).join('|');
  }
  if (pdfFile) return `pdfvec:${pdfFile.name}:${pdfFile.size}:${pdfFile.lastModified}`;
  return 'pdfvec:empty';
};
const loadCache = () => { try { return JSON.parse(sessionStorage.getItem(sig())||'{}'); } catch(e){ return {}; } };
const saveCache = c => { try { sessionStorage.setItem(sig(), JSON.stringify(c)); } catch(e){ log('⚠ sessionStorage 용량 초과 – 이어하기 캐시 일부 저장 불가'); } };

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
  const done = Object.keys(loadCache()).length;
  $('resumeBtn').classList.toggle('hidden', !(done>0 && done<totalPages));
  $('resumeBtn').textContent = `이어하기 (${done}/${totalPages} 완료)`;
  updateEta();
}
$('clearBtn').onclick = () => { if (pdfFile || imageFiles.length) { sessionStorage.removeItem(sig()); $('resumeBtn').classList.add('hidden'); log('캐시 삭제됨'); } };

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
- Reading order: follow the natural order; for multi-column pages read column by column.

MATH (never output broken or code-formatted math):
- Inline math => $...$ ; displayed/standalone equations => $$...$$ on their own lines. Use valid KaTeX/LaTeX only (\\frac, \\sqrt, \\sum, \\int, \\alpha, \\mathbf, \\begin{aligned}...\\end{aligned}, \\begin{pmatrix}... etc.).
- Chemical formulas and units may use math too, e.g. $\\mathrm{H_2O}$.
- NEVER put math inside backticks or code fences. NEVER escape the dollar signs. A currency "$" in running text must be written as \\$ .

MATH (multi-line equations & tables inside math):
- Multi-line equations (aligned steps, systems, cases, derivations): keep them in ONE $$...$$ block using \\begin{aligned}...\\end{aligned} / \\begin{cases}...\\end{cases}, one source line per row separated by \\\\ , aligned at the original "=" signs with &. Never split one derivation into separate paragraphs. Equation numbers like (3.1) => \\tag{3.1}. Numbered problems with equations keep the number as text before the math.
- Inside table cells never use a bare | in math (write \\vert or \\mid).

TABLES & ARRANGEMENTS (layout fidelity matters):
- Convert every ruled table to a GitHub Markdown table (header row + separator row). Keep every cell's text exactly; use <br> for line breaks inside a cell; math inside cells uses $...$. Preserve the exact number of rows and columns; empty cells stay empty (never shift text into a neighbor cell). Merged cells: leave the covered cells empty and put the text in the first cell.
- Use the separator row to keep alignment: |:---| left, |:---:| centered, |---:| right (numbers and amounts are usually right-aligned or centered as in the original).
- Borderless arrangements that visually form columns or a grid (simple word lists in columns, answer grids, schedules, term/definition pairs, aligned numbers, vertical arithmetic) are ALSO tables: output a Markdown table in the original row/column order. If there is no header row, use an empty header row (| | | |) followed by the separator. Do not flatten them into one running paragraph.
- Multiple-choice options (①②③④⑤) keep their markers and order; put each option on its own line unless they clearly sit on the same line in the original.

FIGURES: flowcharts/diagrams/graphs with structure => a fenced \`\`\`mermaid block (valid syntax, keep all labels exactly). Charts, photos, illustrations => one line "*[그림: short description in the page's language, include caption text exactly]*". Always keep figure captions as text.

OUTPUT: only the Markdown of this page. No commentary, no explanations, no surrounding code fence.`;

async function renderImageFileJpeg(file){
  const bmp = await createImageBitmap(file);
  const maxDim = 2400;
  let w = bmp.width, h = bmp.height;
  if (w > maxDim || h > maxDim){
    const ratio = Math.min(maxDim / w, maxDim / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const data = c.toDataURL('image/jpeg', 0.85);
  c.width = c.height = 0;
  return data;
}

async function renderPageJpeg(n){
  if (inputMode === 'images') {
    return await renderImageFileJpeg(imageFiles[n - 1]);
  }
  const page = await pdfDoc.getPage(n);
  const vp = page.getViewport({ scale: 2.0 });
  const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  const data = c.toDataURL('image/jpeg', 0.85);
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

async function callApi(dataUrl, cfg){
  const body = JSON.stringify({ model: cfg.model, temperature: 0, messages:[{ role:'user', content:[
    { type:'text', text: PROMPT }, { type:'image_url', image_url:{ url: dataUrl } } ]}] });
  const MAX = 6;
  for (let a=0; a<=MAX; a++){
    if (aborted || abortCtrl?.signal?.aborted) throw new Error('aborted');
    let r;
    try {
      r = await fetch(cfg.base+'/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
        body,
        signal: abortCtrl?.signal
      });
    } catch(e){
      if (aborted || abortCtrl?.signal?.aborted || e.name === 'AbortError') throw new Error('aborted');
      if (a === MAX) throw e;
      await sleep(1000 * 2**a, abortCtrl?.signal);
      continue;
    }
    if (r.ok){
      const j = await r.json();
      if (j.choices?.[0]?.finish_reason === 'length') log('  ⚠ 응답이 길이 제한으로 잘렸을 수 있습니다 (해당 페이지 확인 필요)');
      let t = j.choices?.[0]?.message?.content ?? '';
      if (Array.isArray(t)) t = t.map(x=>x.text||'').join('');
      t = t.replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i,'$1').trim();
      const u = j.usage || {};
      let inT = Number(u.prompt_tokens), outT = Number(u.completion_tokens), est = false;
      if (u.prompt_tokens == null || !(inT > 0)){ inT = Math.ceil(PROMPT.length/4) + 800; est = true; }   // 이미지 토큰 포함 역산
      if (u.completion_tokens == null || !(outT >= 0)){ outT = estimateTokens(t); est = true; }
      return { text: t, usage: { input: inT, output: outT, estimated: est } };
    }
    if ((r.status===429 || r.status>=500) && a<MAX){
      if (aborted || abortCtrl?.signal?.aborted) throw new Error('aborted');
      const ra = parseFloat(r.headers.get('retry-after'));
      const wait = (ra>0 ? ra*1000 : Math.min(1000*2**a, 30000)) + Math.random()*500;
      log(`  ↻ HTTP ${r.status} (요청 제한/대기) – ${(wait/1000).toFixed(1)}초 후 재시도 (${a+1}/${MAX})`);
      await sleep(wait, abortCtrl?.signal);
      continue;
    }
    throw new Error('HTTP '+r.status+' '+(await r.text()).slice(0,200));
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
  const cfg = { base: activeBaseUrl, key, model };
  const conc = +$('concurrencySelect').value;
  const cache = resume ? loadCache() : {};
  if (!resume) sessionStorage.removeItem(sig());

  const pending = [];
  for (let i=1;i<=totalPages;i++) if (!cache[i]) pending.push(i);
  running = true; aborted = false;
  abortCtrl = new AbortController();
  ['startBtn','resumeBtn'].forEach(i => $(i).disabled = true);
  $('stopBtn').classList.remove('hidden');
  $('progCard').classList.remove('hidden');
  $('resultCard').classList.add('hidden');
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
        const { text: md, usage } = await callApi(await renderPageJpeg(n), cfg);
        cache[n] = md; saveCache(cache); done++;
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
    const cnt = Object.keys(cache).length;
    $('resumeBtn').classList.toggle('hidden', cnt>=totalPages);
    $('resumeBtn').textContent = `이어하기 (${cnt}/${totalPages} 완료)`;
    if (aborted){
      if (isGoogle) updateGeminiWaveState('idle', 0);
      log('⏸ 중단됨 – [이어하기]로 계속할 수 있습니다.');
      return;
    }
    if (cnt < totalPages){ log(`⚠ ${failed.length}페이지 실패 – [이어하기]로 재시도하세요.`); return; }
    if (isGoogle) updateGeminiWaveState('done', 1.0);
    log('모든 페이지 완료 → 벡터 PDF 생성 중…');
    await buildAndPrint(cache);
  } finally {
    stopKeepAlive();
    running = false;
    $('stopBtn').classList.add('hidden');
    ['startBtn','resumeBtn'].forEach(i => $(i).disabled = false);
  }
}
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
blockquote{border-left:3px solid #bbb;margin:8px 0;padding-left:10px;color:#444}
.katex-display{overflow-x:auto;overflow-y:hidden}
td,th{overflow-wrap:anywhere;line-height:1.5}
.pg-h{text-align:center;color:#666;font-size:9pt;border-bottom:.5pt solid #ccc;padding-bottom:3pt;margin-bottom:10pt}
.pg-f{display:flex;justify-content:space-between;color:#666;font-size:9pt;border-top:.5pt solid #ccc;padding-top:3pt;margin-top:12pt}
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
#stage blockquote{border-left:3px solid #bbb;margin:8px 0;padding-left:10px;color:#444}
`;
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: STAGE_CSS }));

let outUrls = {}, outBlobs = {}, lastPagesHtml = [];
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

function splitPageMeta(md){
  const meta = { num:'', header:'', footer:'' };
  const body = String(md||'').replace(PAGE_META_RE, (m, j) => {
    try { const o = JSON.parse(j); for (const k of ['num','header','footer']) if (o[k] != null) meta[k] = String(o[k]).trim(); } catch(e){}
    return '';
  }).replace(/<!--\s*PAGE[\s\S]*?-->/gi,'').trim();
  return { body, meta };
}

/* 본문 맨 위/아래 2줄에서 머리글·바닥글·쪽 번호가 섞여 들어온 줄을 제거 */
function stripFurniture(body, meta, rep){
  const lines = body.split('\n');
  const known = new Set([furnKey(meta.header), furnKey(meta.footer)].filter(k => k.length >= 2));
  const isFurn = ln => {
    const t = ln.trim();
    if (!t || t.length > 120) return null;
    const k = furnKey(t);
    if (meta.num && isPageNumLine(t) && mdPlain(t).replace(/\D/g,'') === meta.num.replace(/\D/g,'')) return 'num';
    if (k.length >= 2 && known.has(k)) return 'known';
    if (k.length >= 4 && rep.has(k) && !/^\s*([#>|$\-*+]|\d+[.)]\s)/.test(t)) return 'rep';
    return null;
  };
  const got = { header:'', footer:'' };
  for (const side of ['top','bottom']){
    for (let n=0; n<2; n++){
      const idx = side === 'top' ? lines.findIndex(l => l.trim()) : (() => { for (let i=lines.length-1;i>=0;i--) if (lines[i].trim()) return i; return -1; })();
      if (idx < 0) break;
      const kind = isFurn(lines[idx]);
      if (!kind) break;
      if (kind === 'rep') got[side === 'top' ? 'header' : 'footer'] ||= mdPlain(lines[idx]);
      lines.splice(idx, 1);
    }
  }
  return { body: lines.join('\n').trim(), header: got.header, footer: got.footer };
}

/* 캐시 → 페이지별 {body,num,header,footer}. 여러 페이지에 반복되는 짧은 맨 위/아래 줄도 머리글/바닥글로 간주 */
function preparePages(cache){
  const raw = Array.from({length: totalPages}, (_, i) => splitPageMeta(cache[i+1] || ''));
  const rep = new Set();
  if (totalPages >= 4){
    const cnt = new Map();
    raw.forEach(({ body }) => {
      const ls = body.split('\n').map(l => l.trim()).filter(Boolean);
      const keys = new Set([...ls.slice(0,2), ...ls.slice(-2)].filter(l => l.length <= 100 && !/^([#>|$\-*+]|\d+[.)]\s)/.test(l)).map(furnKey).filter(k => k.length >= 4));
      keys.forEach(k => cnt.set(k, (cnt.get(k)||0) + 1));
    });
    const need = Math.max(3, Math.ceil(totalPages * 0.4));
    cnt.forEach((c, k) => { if (c >= need) rep.add(k); });
  }
  return raw.map(({ body, meta }) => {
    const s = stripFurniture(body, meta, rep);
    return { body: s.body, num: meta.num, header: meta.header || s.header, footer: meta.footer || s.footer };
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
  root.querySelectorAll('.katex-display > .katex').forEach(k => {
    const inner = k.querySelector('.katex-html') || k;
    const w = inner.getBoundingClientRect().width;
    if (w > maxW) k.style.fontSize = (1.21 * (maxW / w) * 0.98).toFixed(3) + 'em';
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
const VALID_SKINS = ['default', 'cyberpunk', 'gemini'];

/* ---------- Gemini AI Studio 좌우 유체 오로라 플로우 캔버스 애니메이션 ---------- */
let geminiFlowAnimId = null;
let geminiFlowPhase = 0;

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

function stopGeminiBgFlow(){
  if (geminiFlowAnimId){
    cancelAnimationFrame(geminiFlowAnimId);
    geminiFlowAnimId = null;
  }
}

function applyTheme(skinName){
  const skin = VALID_SKINS.includes(skinName) ? skinName : 'default';
  state.skin = skin;
  if (skin === 'default') {
    document.documentElement.removeAttribute('data-theme');
    stopGeminiBgFlow();
  } else {
    document.documentElement.setAttribute('data-theme', skin);
    if (skin === 'gemini') {
      startGeminiBgFlow();
    } else {
      stopGeminiBgFlow();
    }
  }
  document.querySelectorAll('.skin-option-card').forEach(card => {
    card.classList.toggle('active', card.dataset.skin === skin);
  });
  save();
}

function initSkinSwitcher(){
  const modal = $('skinModal');
  const btnSecret = $('skinSecretBtn');
  const logo = $('logoTitle');
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
  if (logo) logo.onclick = toggleModal;
  if (btnClose) btnClose.onclick = closeModal;
  if (backdrop) backdrop.onclick = closeModal;

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      toggleModal();
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
  const cache = loadCache();
  if (Object.keys(cache).length < totalPages) return;
  log('↻ 페이지 서식 옵션 적용 – 결과 파일 다시 생성');
  await buildAndPrint(cache);
}

/* 마크다운 → HTML (수식은 marked가 건드리지 못하게 보호했다가 KaTeX로 렌더) */
function mdToHtml(md){
  const store = [];
  const put = (tex, display) => { store.push({ tex: tex.trim(), display }); return `@@MATH${store.length-1}@@`; };
  md = String(md).split(/(```[\s\S]*?```|`[^`\n]*`)/).map((seg, i) => {
    if (i % 2) return seg;                                   // 코드 구간은 그대로
    return seg
      .replace(/\$\$([\s\S]+?)\$\$/g, (m,t) => '\n\n'+put(t,true)+'\n\n')
      .replace(/\\\[([\s\S]+?)\\\]/g, (m,t) => '\n\n'+put(t,true)+'\n\n')
      .replace(/\\\(([\s\S]+?)\\\)/g, (m,t) => put(t,false))
      .replace(/(?<![\\$\d])\$(?!\s)([^\n$]+?)(?<!\s)\$(?!\d)/g, (m,t) => put(t,false));
  }).join('');
  let html = marked.parse(md, { gfm:true, breaks:true });
  return html.replace(/@@MATH(\d+)@@/g, (m, i) => {
    const { tex, display } = store[+i];
    try { return katex.renderToString(tex, { displayMode: display, throwOnError:false, output:'html', strict:'ignore' }); }
    catch(e){ return `<code>${tex.replace(/[<>&]/g,'')}</code>`; }
  });
}

/* 마크다운 → 페이지별 HTML (Mermaid는 SVG로 치환) */
async function renderPagesHtml(bodies){
  const pages = []; let mid = 0;
  for (let n=1;n<=totalPages;n++){
    const div = document.createElement('div');
    div.innerHTML = mdToHtml(bodies[n-1] || '');
    for (const code of div.querySelectorAll('pre > code.language-mermaid')){
      const pre = code.parentElement, id = 'mm'+(mid++);
      try {
        const { svg } = await mermaid.render(id, code.textContent);
        const w = document.createElement('div'); w.className = 'mermaid-svg'; w.innerHTML = svg;
        pre.replaceWith(w);
      } catch(e){
        log(`  ⚠ p.${n} Mermaid 렌더 실패 – 코드 블록으로 유지`);
        document.getElementById('d'+id)?.remove();
      }
    }
    pages.push(div.innerHTML);
  }
  return pages;
}

const canvasToBlob = (cv, type='image/png', quality) => new Promise(res => cv.toBlob(res, type, quality));

/* A4 페이지 경계 계산: 표/제목/그림은 쪼개지 않고, 긴 표는 행 단위로 끊어 머리글을 반복하며, 문단은 줄 사이에서만 자른다 */
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
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.height > 0) out.push({ t: r.top - t0, b: r.bottom - t0 });
    }
    el.querySelectorAll('img,svg,canvas').forEach(e => { const r = e.getBoundingClientRect(); if (r.height > 0) out.push({ t: r.top - t0, b: r.bottom - t0 }); });
    return out;
  };
  const safeCut = (el, pageStart, limit) => {          // 글줄/그림을 가로지르지 않는 가장 아래 위치
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
  const cuts = [0]; let pageStart = 0, node = stage.firstElementChild, guard = 0;
  const cutAt = y => { y = Math.max(y, pageStart + 1); cuts.push(y); pageStart = y; };

  while (node && guard++ < 5000){
    const b = box(node), limit = pageStart + Hpx, h = b.bottom - b.top;
    const atTop = b.top <= pageStart + 2;
    if (isHeading(node) && !atTop && node.nextElementSibling && b.bottom + 70 > limit){ cutAt(b.top); continue; }  // 제목만 홀로 남지 않게
    if (b.bottom <= limit + 0.5){ node = node.nextElementSibling; continue; }
    if (b.top >= limit - 0.5){ cutAt(b.top); continue; }

    if (node.tagName === 'TABLE'){
      const rows = [...(node.tBodies[0]?.rows || [])];
      let k = rows.findIndex(r => box(r).rb > limit + 0.5);   // 경계에 걸치는 첫 행
      if (k === -1){ node = node.nextElementSibling; continue; }
      if (!atTop && (h <= Hpx || k === 0)){ cutAt(b.top); continue; }   // 한 페이지에 들어가는 표 → 통째로 다음 페이지로
      if (k === 0) k = 1;                                          // 페이지 맨 위인데 첫 행도 넘침 → 최소 1행은 남김
      if (k >= rows.length){ cutAt(limit); continue; }
      const t2 = node.cloneNode(false);                            // 긴 표 → 행 단위로 끊고 머리글 반복
      if (node.tHead) t2.appendChild(node.tHead.cloneNode(true));
      const tb = document.createElement('tbody');
      rows.slice(k).forEach(r => tb.appendChild(r));
      t2.appendChild(tb);
      node.after(t2);
      cutAt(box(t2).top); node = t2; continue;
    }

    const tag = node.tagName;
    const pushable = isHeading(node) ? true
      : (/^(PRE|IMG|HR|FIGURE|DIV|SVG)$/i.test(tag) || node.querySelector('svg,img')) ? h <= Hpx
      : h <= 110;                                                  // 짧은 문단/목록은 쪼개지 않음
    if (pushable && !atTop){ cutAt(b.top); continue; }
    cutAt(safeCut(node, pageStart, limit));
  }
  return cuts;
}

/* 페이지 단위로 캡처 → PDF / PNG / ZIP 생성 */
async function makeOutputsFromPages(pagesHtml, infos){
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit:'mm', format:'a4', compress:true });
  const M = 12, W = 210-2*M, H = 297-2*M;
  const stage = document.createElement('div'); stage.id = 'stage'; document.body.appendChild(stage);
  let first = true, pdfNo = 0;
  const pageCanvases = [];
  const pagePngBlobs = [];

  try {
    for (let i=0;i<pagesHtml.length;i++){
      $('pStatus').textContent = `렌더링 및 변환 중 ${i+1}/${pagesHtml.length}`;
      stage.innerHTML = pagesHtml[i] || '&nbsp;';
      if (document.fonts?.ready) await document.fonts.ready;
      await sleep(60);
      fitWideMath(stage);
      const Hpx = stage.offsetWidth * H / W;
      const bounds = [...computePageCuts(stage, Hpx), stage.offsetHeight];
      const cv = await html2canvas(stage, { scale:2, backgroundColor:'#fff', logging:false });
      const info = infos?.[i] || {};

      const kx = cv.width / stage.offsetWidth;
      const pxmm = cv.width / W;
      for (let bi=0; bi<bounds.length-1; bi++){
        const y = Math.round(bounds[bi]*kx), yEnd = Math.min(cv.height, Math.round(bounds[bi+1]*kx));
        const h = yEnd - y; if (h <= 2) continue;
        pdfNo++;
        const deco = pageDeco(info, i, pdfNo);
        // A4 한 장 크기의 캔버스에 본문 조각 + 머리글/바닥글을 함께 그림
        const full = document.createElement('canvas');
        full.width = Math.round(210*pxmm); full.height = Math.round(297*pxmm);
        const ctx = full.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,full.width,full.height);
        ctx.drawImage(cv, 0, y, cv.width, h, Math.round(M*pxmm), Math.round(M*pxmm), cv.width, h);
        if (hasDeco(deco)) drawDeco(ctx, full.width, M*pxmm, 6.5*pxmm, full.height - 6.5*pxmm, 2.9*pxmm, deco);
        if (!first) pdf.addPage(); first = false;
        pdf.addImage(full.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
        full.width = full.height = 0;
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
    return { pdfBlob: pdf.output('blob'), pngBlob, zipBlob };
  } finally { stage.remove(); }
}

function updateExportFormatUI(){
  const fmt = $('exportFormat').value;
  const extMap = { pdf: '.pdf', png: '.png', png_zip: '.zip', html: '.html', md: '.md' };
  $('outExtHint').textContent = extMap[fmt] || '.pdf';
  const b = outBlobs[fmt];
  if (b) {
    $('outSize').textContent = `${fmtSize(b.size)} · ${totalPages}페이지`;
  }
}

$('exportFormat').onchange = updateExportFormatUI;

async function buildAndPrint(cache){   // (이름 유지) 인쇄 창 없이 파일만 생성
  building = true;
  try {
    const infos = preparePages(cache);
    const pagesHtml = await renderPagesHtml(infos.map(p => p.body));
    lastPagesHtml = pagesHtml;
    const decos = infos.map((p, i) => pageDeco(p, i, i + 1));
    const mdAll = infos.map((p, i) => {
      const d = decos[i];
      const head = d.header ? `*${d.header}*\n\n` : '';
      const foot = [d.footer ? `*${d.footer}*` : '', d.num ? `— ${d.num} —` : ''].filter(Boolean).join(' · ');
      return head + p.body + (foot ? `\n\n${foot}` : '');
    }).join('\n\n---\n\n');
    const title = baseName().replace(/[<>&]/g,'');
    const esc = s => String(s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
    const sections = pagesHtml.map((h, i) => {
      const d = decos[i];
      const hd = d.header ? `<div class="pg-h">${esc(d.header)}</div>` : '';
      const ft = (d.footer || d.num) ? `<div class="pg-f"><span>${esc(d.footer)}</span><span>${esc(d.num)}</span></div>` : '';
      return `<section class="page">${hd}${h}${ft}</section>`;
    }).join('');
    const htmlDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"><style>${PRINT_CSS}</style></head><body>${sections}</body></html>`;
    const { pdfBlob, pngBlob, zipBlob } = await makeOutputsFromPages(pagesHtml, infos);
    const mdBlob = new Blob([mdAll], { type:'text/markdown;charset=utf-8' });
    const htmlBlob = new Blob([htmlDoc], { type:'text/html;charset=utf-8' });

    Object.values(outUrls).forEach(u => u && URL.revokeObjectURL(u));
    outBlobs = {
      pdf: pdfBlob,
      png: pngBlob,
      png_zip: zipBlob || pngBlob,
      md: mdBlob,
      html: htmlBlob
    };
    outUrls = {
      pdf:     pdfBlob ? URL.createObjectURL(pdfBlob) : '',
      png:     pngBlob ? URL.createObjectURL(pngBlob) : '',
      png_zip: zipBlob ? URL.createObjectURL(zipBlob) : (pngBlob ? URL.createObjectURL(pngBlob) : ''),
      md:      URL.createObjectURL(mdBlob),
      html:    URL.createObjectURL(htmlBlob)
    };

    const optZip = $('optPngZip');
    if (optZip) {
      optZip.disabled = totalPages <= 1;
      optZip.textContent = totalPages > 1 ? `PNG 이미지 - 페이지별 압축 (${totalPages}장 .zip)` : 'PNG 이미지 - 페이지별 압축 (다중 페이지만)';
      if (totalPages <= 1 && $('exportFormat').value === 'png_zip') {
        $('exportFormat').value = 'png';
      }
    }

    $('outName').value = baseName() + '_변환';
    updateExportFormatUI();
    $('resultCard').classList.remove('hidden');
    $('pStatus').textContent = '완료';
    log('✅ 파일 생성 완료 – 원하는 형식(PDF / PNG 등)을 선택해 다운로드하세요.');
    $('resultCard').scrollIntoView({ behavior:'smooth', block:'nearest' });
  } catch(e){ log('✗ 파일 생성 실패: '+e.message); }
  finally {
    building = false;
    if (rebuildQueued){ rebuildQueued = false; rebuildFromCache(); }
  }
}
function download(kind, ext){
  if (!outUrls[kind]) return;
  const name = ($('outName').value.trim() || baseName()).replace(/[\\/:*?"<>|]+/g,'_');
  const a = document.createElement('a'); a.href = outUrls[kind]; a.download = name + '.' + ext;
  document.body.appendChild(a); a.click(); a.remove();
}
$('dlMain').onclick = () => {
  const fmt = $('exportFormat').value;
  const extMap = { pdf: 'pdf', png: 'png', png_zip: totalPages > 1 ? 'zip' : 'png', html: 'html', md: 'md' };
  download(fmt, extMap[fmt] || 'pdf');
};
$('dlPdf').onclick  = () => { $('exportFormat').value = 'pdf'; updateExportFormatUI(); download('pdf','pdf'); };
$('dlPng').onclick  = () => {
  const targetFmt = ($('exportFormat').value === 'png_zip' && totalPages > 1) ? 'png_zip' : 'png';
  $('exportFormat').value = targetFmt;
  updateExportFormatUI();
  download(targetFmt, targetFmt === 'png_zip' ? 'zip' : 'png');
};
$('dlMd').onclick   = () => { $('exportFormat').value = 'md'; updateExportFormatUI(); download('md','md'); };
$('dlHtml').onclick = () => { $('exportFormat').value = 'html'; updateExportFormatUI(); download('html','html'); };
init();
