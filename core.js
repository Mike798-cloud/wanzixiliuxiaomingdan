/** 晚自习留校名单 - 核心游戏引擎 **/

// ========== 游戏状态管理 ==========
const GameState = {
  currentChapter: 0,
  unlockedPages: new Set(['page-home']),
  cluesFound: new Set(),
  cluesMarked: {},
  logicProgress: 0,
  notepadContent: '',
  notepadTheme: 'theme-yellow',
  symbolProgress: {},
  symbolAnswer: '',
  puzzlesSolved: {},
  hintLevel: 0,
  timeInChapter: {},
  choices: {},
  ending: null,
  _lastSave: 0
};

let currentChapterHint = 'ch1';

// 存档密钥
const SAVE_KEY = 'yuhua_nightstudy_v2';

function saveGame() {
  const data = {
    currentChapter: GameState.currentChapter,
    unlockedPages: Array.from(GameState.unlockedPages),
    cluesFound: Array.from(GameState.cluesFound),
    cluesMarked: GameState.cluesMarked,
    logicProgress: GameState.logicProgress,
    notepadContent: GameState.notepadContent,
    notepadTheme: GameState.notepadTheme,
    symbolProgress: GameState.symbolProgress,
    puzzlesSolved: GameState.puzzlesSolved,
    hintLevel: GameState.hintLevel,
    choices: GameState.choices,
    ending: GameState.ending,
    timestamp: Date.now()
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    GameState._lastSave = Date.now();
    showToast('进度已保存');
  } catch(e) {
    console.warn('存档失败', e);
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    GameState.currentChapter = data.currentChapter || 0;
    GameState.unlockedPages = new Set(data.unlockedPages || ['page-home']);
    GameState.cluesFound = new Set(data.cluesFound || []);
    GameState.cluesMarked = data.cluesMarked || {};
    GameState.logicProgress = data.logicProgress || 0;
    GameState.notepadContent = data.notepadContent || '';
    GameState.notepadTheme = data.notepadTheme || 'theme-yellow';
    GameState.symbolProgress = data.symbolProgress || {};
    GameState.puzzlesSolved = data.puzzlesSolved || {};
    GameState.hintLevel = data.hintLevel || 0;
    GameState.choices = data.choices || {};
    GameState.ending = data.ending || null;

    const np = document.getElementById('notepad-text');
    if (np) np.value = GameState.notepadContent;
    updateNotepadWordcount();
    return true;
  } catch(e) {
    console.warn('读档失败', e);
    return false;
  }
}

function resetGame() {
  if (!confirm('确定要重置所有进度吗？此操作不可撤销。')) return;
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}

// 自动存档
setInterval(() => {
  if (Date.now() - GameState._lastSave > 30000) {
    saveGame();
  }
}, 30000);

// ========== 页面切换系统 ==========
function showPage(pageId, options = {}) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(pageId);
  if (target) {
    target.classList.add('active');
    window.scrollTo(0, 0);
    GameState.unlockedPages.add(pageId);
    updateNavState();
    if (typeof updateNavHighlight === 'function') updateNavHighlight(pageId);
    if (options.hint) showHint(options.hint);
    saveGame();
    updateSymbolCluesSummary();
  }
}

function updateNavState() {
  document.querySelectorAll('.site-nav a[data-target]').forEach(a => {
    const target = a.getAttribute('data-target');
    if (target && GameState.unlockedPages.has(target)) {
      a.classList.remove('locked');
      a.style.pointerEvents = '';
      a.style.opacity = '';
    } else if (target) {
      a.classList.add('locked');
      a.style.pointerEvents = 'none';
      a.style.opacity = '0.4';
    }
  });
}

// ========== 章节导航 ==========
function startGame() {
  AudioSys.ensureInit();
  AudioSys.startWind();
  AudioSys.startHum();
  const headerProgress = document.getElementById('header-progress');
  if (headerProgress) headerProgress.style.display = 'flex';
  showChapterTransition(1, '异常公示', '一切看起来都很正常，除了那些被精心掩盖的细节。', () => {
    showPage('page-ch1-main');
    GameState.currentChapter = 1;
    currentChapterHint = 'ch1';
    const indicator = document.getElementById('chapter-indicator');
    if (indicator) indicator.textContent = '第一章';
    showToast('点击 <便笺> 可随时记录推理笔记', 4000);
    startChapterTimer('ch1');
    saveGame();
  });
}

function goToChapter(chapter) {
  const titles = {
    2: ['多页证词博弈', '三个人的证词，三种说法。谁在说谎？'],
    3: ['跨页监控溯源', '监控、台账、天气、教室。四页联动，真相隐藏在数据的夹缝中。'],
    4: ['社交谣言溯源', '谣言、跟风、沉默。社交媒体上的每一句留言，都是真相的碎片。'],
    5: ['全员谎言终局', '所有的线索汇聚于此。是时候揭开最后的面纱了。']
  };
  const t = titles[chapter];
  if (!t) return;
  showChapterTransition(chapter, t[0], t[1], () => {
    const pageMap = { 2: 'page-ch2-forum', 3: 'page-ch3-monitor', 4: 'page-ch4-social', 5: 'page-ch5-review' };
    showPage(pageMap[chapter]);
    GameState.currentChapter = chapter;
    currentChapterHint = 'ch' + chapter;
    const ci = document.getElementById('chapter-indicator');
    if (ci) ci.textContent = '第' + ['一','二','三','四','五'][chapter-1] + '章';
    startChapterTimer('ch' + chapter);
    saveGame();
  });
}

// ========== 章节过渡动画 ==========
function showChapterTransition(chapterNum, title, subtitle, callback) {
  const trans = document.getElementById('chapter-transition');
  if (!trans) { if (callback) callback(); return; }
  trans.querySelector('.ch-num').textContent = `CHAPTER 0${chapterNum}`;
  trans.querySelector('.ch-title').textContent = title;
  trans.querySelector('.ch-sub').textContent = subtitle;
  trans.classList.add('active');

  const onClick = () => {
    trans.classList.remove('active');
    trans.removeEventListener('click', onClick);
    if (callback) callback();
  };
  setTimeout(() => trans.addEventListener('click', onClick), 800);
}

// ========== 提示系统 ==========
const HINTS = {
  ch1: [
    '提示：仔细对比公示网和班级存档，注意人数和备注的差异。',
    '提示：页面底部的元数据隐藏着重要信息。',
    '提示："已删除"的名字需要找到历史存档才能看到。'
  ],
  ch2: [
    '提示：三位同学的证词和留言板信息存在矛盾，交叉比对是关键。',
    '提示：班长的证词过于"完美"，完美本身就是一种破绽。',
    '提示：私密聊天记录需要完成逻辑判断后才能解锁。'
  ],
  ch3: [
    '提示：四页数据必须整合分析，单页信息都是碎片。',
    '提示：21:45的监控"信号中断"是最大疑点。',
    '提示：天气数据中的薄雾与监控模糊之间存在微妙关联。',
    '提示：传感器数据和签到记录的矛盾是突破口。'
  ],
  ch4: [
    '提示：社交墙上的匿名爆料往往比官方声明更真实。',
    '提示：群聊中的"统一口径"是集体谎言的直接证据。',
    '提示：班长的私信记录暴露了欺骗老师的行为。'
  ],
  ch5: [
    '提示：回顾所有章节，标记所有证据的真伪。',
    '提示：时间线闭环是解锁真相的关键。',
    '提示：符号谜题的答案藏在之前收集的线索中。'
  ]
};

let currentHintIndex = {};

function showHint(text, duration = 4000) {
  const bubble = document.getElementById('hint-bubble');
  if (!bubble) return;
  bubble.textContent = text;
  bubble.classList.add('show');
  setTimeout(() => bubble.classList.remove('show'), duration);
}

function getHint(chapter) {
  const hints = HINTS[chapter] || ['提示：保持冷静，仔细梳理已有信息。'];
  const idx = currentHintIndex[chapter] || 0;
  currentHintIndex[chapter] = (idx + 1) % hints.length;
  showHint(hints[idx]);
}

// 卡关兜底提示（3分钟）
const chapterTimers = {};
function startChapterTimer(chapter) {
  if (chapterTimers[chapter]) clearTimeout(chapterTimers[chapter]);
  chapterTimers[chapter] = setTimeout(() => {
    if (GameState.hintLevel < 2) {
      GameState.hintLevel = 2;
      showHint('【系统提示】你已在当前阶段停留较久。建议：回顾已标记的线索，寻找逻辑矛盾点。', 6000);
    }
  }, 180000);
}

// ========== 线索系统 ==========
function findClue(clueId, title, desc, type = 'real') {
  if (GameState.cluesFound.has(clueId)) {
    showToast(`已发现过该线索：${title}`);
    return;
  }
  GameState.cluesFound.add(clueId);
  if (!GameState.cluesMarked[clueId]) {
    GameState.cluesMarked[clueId] = type;
  }
  AudioSys.playClue();
  showToast(`发现线索：${title}`);
  updateClueCounter();
  checkUnlocks();
  saveGame();
}

function markClue(clueId, mark) {
  GameState.cluesMarked[clueId] = mark;
  const els = document.querySelectorAll(`[data-clue="${clueId}"]`);
  els.forEach(el => {
    el.classList.remove('real', 'fake', 'useless', 'half');
    el.classList.add(mark);
  });
  checkLogicProgress();
  saveGame();
}

function updateClueCounter() {
  const counter = document.getElementById('clue-counter');
  if (counter) {
    counter.textContent = '线索收集中';
  }
}

// ========== 逻辑进度检测 ==========
function checkLogicProgress() {
  const marked = Object.values(GameState.cluesMarked);
  const realCount = marked.filter(m => m === 'real').length;
  const fakeCount = marked.filter(m => m === 'fake').length;
  const total = marked.length;
  if (total === 0) return;

  GameState.logicProgress = Math.round((realCount + fakeCount) / Math.max(total, 12) * 100);
  if (GameState.logicProgress > 100) GameState.logicProgress = 100;

  const bar = document.getElementById('logic-progress');
  if (bar) bar.style.width = `${GameState.logicProgress}%`;
  const text = document.getElementById('logic-progress-text');
  if (text) text.textContent = `逻辑进度 ${GameState.logicProgress}%`;

  // 解锁条件检查
  checkUnlocks();
}

// ========== 条件解锁系统 ==========
function checkUnlocks() {
  const hasClue = (id) => GameState.cluesFound.has(id);

  // 第一章解锁历史存档
  if (hasClue('ch1-name') && hasClue('ch1-backup')) {
    unlockPage('page-ch1-history');
  }

  // 第二章解锁私密记录
  if (hasClue('ch2-contra-a') && hasClue('ch2-contra-b') && hasClue('ch2-contra-c')) {
    unlockPage('page-ch2-private');
  }

  // 第三章解锁备份和残缺监控
  if (hasClue('ch3-monitor-gap') && hasClue('ch3-sensor')) {
    unlockPage('page-ch3-backup');
  }
  if (hasClue('ch3-timeline-complete')) {
    unlockPage('page-ch3-trace');
  }
}

function unlockPage(pageId) {
  if (GameState.unlockedPages.has(pageId)) return;
  GameState.unlockedPages.add(pageId);
  document.querySelectorAll(`a[data-target="${pageId}"]`).forEach(a => {
    a.classList.remove('locked');
    a.style.pointerEvents = '';
    a.style.opacity = '';
  });
  AudioSys.playUnlock();
  showToast('新页面已解锁');
}

// ========== 便签纸系统 ==========
function toggleNotepad() {
  const panel = document.getElementById('notepad-panel');
  if (panel) panel.classList.toggle('open');
}

function changeNotepadTheme(theme) {
  const panel = document.getElementById('notepad-panel');
  if (!panel) return;
  panel.classList.remove('theme-yellow', 'theme-blue', 'theme-pink', 'theme-dark');
  panel.classList.add(theme);
  GameState.notepadTheme = theme;

  document.querySelectorAll('.theme-dot').forEach(dot => dot.classList.remove('active'));
  const idx = ['theme-yellow', 'theme-blue', 'theme-pink', 'theme-dark'].indexOf(theme);
  const dots = document.querySelectorAll('.theme-dot');
  if (dots[idx]) dots[idx].classList.add('active');
  saveGame();
}

function updateNotepadContent() {
  const text = document.getElementById('notepad-text');
  if (text) {
    GameState.notepadContent = text.value;
    updateNotepadWordcount();
    saveGame();
  }
}

function updateNotepadWordcount() {
  const text = document.getElementById('notepad-text');
  const wc = document.getElementById('notepad-wordcount');
  if (text && wc) {
    wc.textContent = `${text.value.length} 字`;
  }
}

// ========== 便签纸增强功能 ==========
function insertNotepadTemplate(type) {
  const textarea = document.getElementById('notepad-text');
  if (!textarea) return;
  
  const templates = {
    timeline: `【时间线整理】\n18:00 - \n19:30 - \n21:00 - \n21:30 - \n21:45 - \n22:00 - \n\n待验证：\n`,
    clues: `【线索清单】\n\n真实线索：\n1. \n2. \n\n虚假线索：\n1. \n2. \n\n存疑：\n1. \n`,
    suspects: `【嫌疑人分析】\n\n班长：\n- 动机：\n- 疑点：\n\n陈雪：\n- 动机：\n- 疑点：\n\n其他人：\n`,
    symbols: `【符号线索记录】\n\n[木] 木 = ?\n[水] 水 = ?\n[月] 月 = ?\n[日] 日 = ?\n[目] 目 = ?\n[火] 火 = ?\n[山] 山 = ?\n[口] 口 = ?\n[心] 心 = ?\n[本] 本 = ?\n[刀] 刀 = ?\n[锁] 锁 = ?\n`,
    evidence: `【证据链整理】\n\n直接证据：\n1. \n\n间接证据：\n1. \n\n矛盾点：\n1. \n`
  };
  
  const template = templates[type] || '';
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  
  textarea.value = value.substring(0, start) + template + value.substring(end);
  textarea.selectionStart = textarea.selectionEnd = start + template.length;
  textarea.focus();
  
  updateNotepadContent();
  AudioSys.playClick();
}

function clearNotepad() {
  const textarea = document.getElementById('notepad-text');
  if (!textarea) return;
  if (confirm('确定要清空所有笔记吗？此操作不可撤销。')) {
    textarea.value = '';
    updateNotepadContent();
    AudioSys.playError();
  }
}

function exportNotepad() {
  const text = GameState.notepadContent;
  if (!text.trim()) {
    showToast('便签纸为空，无需导出');
    return;
  }
  
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `调查笔记_${new Date().toLocaleDateString()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  
  showToast('笔记已导出');
  AudioSys.playUnlock();
}

function insertTimestamp() {
  const textarea = document.getElementById('notepad-text');
  if (!textarea) return;
  
  const now = new Date();
  const timestamp = `[${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}] `;
  
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  
  textarea.value = value.substring(0, start) + timestamp + value.substring(end);
  textarea.selectionStart = textarea.selectionEnd = start + timestamp.length;
  textarea.focus();
  
  updateNotepadContent();
}

// ========== 特殊符号解谜系统 ==========
const SYMBOL_MAP = {
  'sym-tree': { letters: 'lin', hint: '独木不成林。那个被擦去的姓氏，拼音是...', name: '木' },
  'sym-water': { letters: 'zhi', hint: '水滴石穿，知者不言。那个名字中间的字，拼音是...', name: '水' },
  'sym-moon': { letters: 'xia', hint: '夏夜的月光下，她消失了。那个名字最后的字，拼音是...', name: '月' },
  'sym-sun': { letters: 'zhen', hint: '日光之下，真相大白。真，是揭穿谎言的第一个音节。', name: '日' },
  'sym-eye': { letters: 'xiang', hint: '相由心生，目之所及。相，与真相伴。', name: '目' },
  'sym-fire': { letters: 'yan', hint: '怒火中烧，掩盖真相。掩，是遮遮掩掩的第一个音节。', name: '火' },
  'sym-mountain': { letters: 'gai', hint: '山高遮目，盖棺定论。盖，是掩盖的最后一个音节。', name: '山' },
  'sym-mouth': { letters: 'kou', hint: '众口铄金，口口相传。口，是谣言的温床。', name: '口' },
  'sym-heart': { letters: 'xin', hint: '心痛如绞，同病相怜。心，是伤心的那个字。', name: '心' },
  'sym-book': { letters: 'ben', hint: '学籍之本，名册之根源。本，是学生的根本。', name: '本' },
  'sym-knife': { letters: 'dao', hint: '刀笔之吏，篡改记录者。刀，是操纵者的工具。', name: '刀' },
  'sym-lock': { letters: 'suo', hint: '锁住真相，锁住自由。锁，是阴谋的象征。', name: '锁' }
};

const PUZZLE_ANSWERS = {
  'puzzle1': 'linzhixia',
  'puzzle2': 'zhenxiang',
  'puzzle3': 'xiangyangai'
};

function onSymbolClick(symId) {
  const info = SYMBOL_MAP[symId];
  if (!info) return;

  const clueId = 'sym-clue-' + symId.replace('sym-', '');
  const hasClue = GameState.cluesFound.has(clueId);

  if (!hasClue) {
    showToast('你还不理解这个符号的含义。继续探索，寻找相关线索。');
    return;
  }

  if (GameState.symbolProgress[symId]) {
    showToast(`${info.name} = ${info.letters}`);
    return;
  }

  GameState.symbolProgress[symId] = true;

  // 更新符号显示
  document.querySelectorAll(`[data-symbol="${symId}"]`).forEach(el => {
    el.classList.remove('locked');
    el.classList.add('solved');
    el.setAttribute('data-letter', info.letters);
    el.title = `${info.name} = ${info.letters}`;
  });

  // 更新输入框
  updatePuzzleInputs();

  showToast(`符号破解：${info.name} = ${info.letters}`);
  updateSymbolCluesSummary();
  saveGame();
}

function updatePuzzleInputs() {
  const puzzles = [
    { id: 'puzzle1', symbols: ['sym-tree', 'sym-water', 'sym-moon'] },
    { id: 'puzzle2', symbols: ['sym-sun', 'sym-eye'] },
    { id: 'puzzle3', symbols: ['sym-eye', 'sym-fire', 'sym-mountain'] }
  ];

  puzzles.forEach(puzzle => {
    const inputArea = document.getElementById(`${puzzle.id}-input`);
    if (!inputArea) return;

    let letters = '';
    puzzle.symbols.forEach(sym => {
      if (GameState.symbolProgress[sym]) {
        letters += SYMBOL_MAP[sym].letters;
      }
    });

    const boxes = inputArea.querySelectorAll('.symbol-input-box');
    boxes.forEach((box, i) => {
      if (i < letters.length) {
        box.textContent = letters[i];
        box.classList.add('correct');
      } else {
        box.textContent = '';
        box.classList.remove('correct');
      }
    });
  });
}

function updateSymbolCluesSummary() {
  const summary = document.getElementById('symbol-clues-summary');
  if (!summary) return;

  const found = Object.keys(SYMBOL_MAP).filter(k => GameState.symbolProgress[k]);
  if (found.length === 0) return;

  let html = '<p>你在调查过程中发现了以下符号线索：</p>';
  found.forEach(sym => {
    const info = SYMBOL_MAP[sym];
    html += `<p>• ${info.name} (${sym.replace('sym-', '')}) = <strong style="color:var(--success);">${info.letters}</strong></p>`;
  });
  summary.innerHTML = html;
}

function checkPuzzle(puzzleId) {
  const answerMap = {
    'puzzle1': 'puzzle1-answer',
    'puzzle2': 'puzzle2-answer',
    'puzzle3': 'puzzle3-answer'
  };

  const inputId = answerMap[puzzleId];
  const input = document.getElementById(inputId);
  if (!input) return;

  const val = input.value.toLowerCase().replace(/\s/g, '');
  const correct = PUZZLE_ANSWERS[puzzleId];

  if (val === correct) {
    GameState.puzzlesSolved[puzzleId] = true;
    input.style.borderColor = 'var(--success)';
    showToast('谜题破解成功！', 3000);
    saveGame();
  } else {
    input.style.borderColor = 'var(--danger)';
    input.style.animation = 'shake 0.4s';
    showToast('答案不正确，再想想...');
    setTimeout(() => {
      input.style.borderColor = '';
      input.style.animation = '';
    }, 500);
  }
}

function checkChapter1Puzzle() {
  const input = document.getElementById('ch1-puzzle-answer');
  if (!input) return;
  const val = input.value.toLowerCase().replace(/\s/g, '');
  if (val === 'linzhixia') {
    showToast('你破解了被抹去的名字：林知夏！', 3000);
    GameState.puzzlesSolved['ch1'] = true;
    findClue('ch1-puzzle-solved','符号解谜完成','通过符号组合破解了被抹去的名字：林知夏','real');
    saveGame();
  } else {
    showToast('答案不正确');
    input.style.animation = 'shake 0.4s';
    setTimeout(() => input.style.animation = '', 500);
  }
}

// ========== 彩蛋触发器 ==========
let easterEggClicks = 0;
function triggerEasterEgg() {
  easterEggClicks++;
  if (easterEggClicks >= 3) {
    easterEggClicks = 0;
    AudioSys.playDramatic();
    showToast('隐藏内容已解锁！', 3000);
    showPage('page-easter-egg');
    findClue('easter-egg-found','发现隐藏彩蛋','你发现了系统调试日志页面，获得了额外的背景信息','real');
  } else {
    AudioSys.playClick();
    showToast(`再点击 ${3 - easterEggClicks} 次...`);
  }
}

// ========== 摄像头时间轴 ==========
function setCamTime(time, desc) {
  const timeEl = document.getElementById('cam-time');
  const viewEl = document.getElementById('cam-view');
  if (timeEl) timeEl.textContent = time + ':00';
  if (viewEl) {
    viewEl.innerHTML = `<div style="text-align:center;color:#888;padding:20px;"><div style="font-size:1.2rem;margin-bottom:12px;"><img src="icon-video.svg" class="icon-img inline-icon" alt="" style="width:20px;height:20px;vertical-align:middle;"> ${time}</div><div style="font-size:0.85rem;line-height:1.6;max-width:300px;">${desc}</div></div>`;
  }
}

// ========== 存档搜索 ==========
function searchArchive() {
  const input = document.getElementById('archive-search-input');
  const result = document.getElementById('archive-result');
  if (!input || !result) return;

  if (input.value.trim() === '2025-10-15') {
    result.style.display = 'block';
    AudioSys.playClick();
    showToast('查询成功');
  } else {
    result.style.display = 'none';
    AudioSys.playError();
    showToast('未找到该日期的存档记录');
  }
}

// ========== 论坛用户搜索解谜 ==========
function searchForumUser() {
  const input = document.getElementById('forum-user-search');
  const result = document.getElementById('forum-search-result');
  const hint = document.getElementById('forum-search-hint');
  if (!input) return;

  const val = input.value.trim().toLowerCase();
  if (val === 'linzhixia0333') {
    result.style.display = 'block';
    if (hint) hint.style.display = 'none';
    AudioSys.playUnlock();
    showToast('发现隐藏帖子！', 3000);
    findClue('ch2-user-search','论坛搜索解谜完成','通过姓名拼音+学号后四位组合，成功找到林知夏被隐藏的帖子','real');
  } else {
    result.style.display = 'none';
    if (hint) hint.style.display = 'block';
    AudioSys.playError();
    showToast('未找到该用户');
  }
}

// ========== 时间线重建解谜 ==========
let timelineSelection = [];

function selectTimelineCard(card) {
  if (card.classList.contains('selected')) return;
  card.classList.add('selected');
  card.style.borderColor = 'var(--accent-blue)';
  card.style.background = 'rgba(58,90,124,0.08)';
  timelineSelection.push(card.getAttribute('data-order'));
  
  const orderText = timelineSelection.map((o, i) => {
    const labels = ['A','B','C','D','E'];
    return labels[parseInt(o) - 1] || o;
  }).join(' → ');
  document.getElementById('timeline-order').textContent = orderText || '（请点击上方卡片按正确顺序排列）';
  AudioSys.playClick();
}

function resetTimelinePuzzle() {
  timelineSelection = [];
  document.querySelectorAll('.timeline-card').forEach(card => {
    card.classList.remove('selected');
    card.style.borderColor = 'var(--border)';
    card.style.background = '#fff';
  });
  document.getElementById('timeline-order').textContent = '（请点击上方卡片按正确顺序排列）';
  const result = document.getElementById('timeline-result');
  if (result) result.style.display = 'none';
}

function checkTimelineOrder() {
  const result = document.getElementById('timeline-result');
  if (timelineSelection.length !== 5) {
    if (result) {
      result.style.display = 'block';
      result.style.background = 'rgba(160,80,80,0.08)';
      result.style.color = 'var(--danger)';
      result.textContent = '请先选择所有5个事件';
    }
    AudioSys.playError();
    return;
  }
  
  const correct = ['1', '2', '3', '4', '5'];
  const isCorrect = timelineSelection.every((val, idx) => val === correct[idx]);
  
  if (isCorrect) {
    if (result) {
      result.style.display = 'block';
      result.style.background = 'rgba(74,124,89,0.08)';
      result.style.color = 'var(--success)';
      result.textContent = '时间线重建正确！事件顺序为：B→D→A→C→E';
    }
    AudioSys.playUnlock();
    showToast('时间线重建完成！', 3000);
    findClue('ch3-timeline-puzzle','时间线重建解谜完成','成功重建了当晚的事件时间线，证明林知夏在21:45监控中断后仍在教室','real');
  } else {
    if (result) {
      result.style.display = 'block';
      result.style.background = 'rgba(160,80,80,0.08)';
      result.style.color = 'var(--danger)';
      result.textContent = '顺序不正确。提示：晚自习开始 → 有人离开 → 老师巡查 → 监控中断 → 教室清空';
    }
    AudioSys.playError();
    showToast('顺序不正确，再想想...');
  }
}

// ========== 碎纸重组解谜 ==========
let shredSelection = [];

function selectShredPiece(piece) {
  if (piece.classList.contains('selected')) return;
  piece.classList.add('selected');
  piece.style.borderColor = 'var(--accent-blue)';
  piece.style.background = 'rgba(58,90,124,0.2)';
  shredSelection.push(piece.getAttribute('data-order'));
  
  const textEl = document.getElementById('shred-text');
  if (textEl) {
    const texts = [];
    document.querySelectorAll('#shred-puzzle .shred-piece.selected').forEach(p => {
      texts.push(p.querySelector('div:last-child').textContent);
    });
    textEl.textContent = texts.join('') || '（请点击碎片按正确顺序排列）';
  }
  AudioSys.playClick();
}

function resetShredPuzzle() {
  shredSelection = [];
  document.querySelectorAll('#shred-puzzle .shred-piece').forEach(piece => {
    piece.classList.remove('selected');
    piece.style.borderColor = 'rgba(192,200,208,0.2)';
    piece.style.background = 'rgba(0,0,0,0.3)';
  });
  const textEl = document.getElementById('shred-text');
  if (textEl) textEl.textContent = '（请点击碎片按正确顺序排列）';
  const result = document.getElementById('shred-result');
  if (result) result.style.display = 'none';
  AudioSys.playClick();
}

function checkShredOrder() {
  const result = document.getElementById('shred-result');
  if (shredSelection.length !== 5) {
    if (result) {
      result.style.display = 'block';
      result.style.background = 'rgba(160,80,80,0.1)';
      result.style.color = 'var(--danger)';
      result.textContent = '请先选择所有5个碎片';
    }
    AudioSys.playError();
    return;
  }
  
  const correct = ['1', '2', '3', '4', '5'];
  const isCorrect = shredSelection.every((val, idx) => val === correct[idx]);
  
  if (isCorrect) {
    if (result) {
      result.style.display = 'block';
      result.style.background = 'rgba(74,124,89,0.1)';
      result.style.color = 'var(--success)';
      result.innerHTML = `
        <div style="font-weight:600;margin-bottom:8px;"><span style="color:var(--success);font-weight:700;">✓</span> 重组成功！</div>
        <div style="line-height:1.8;">
          重组后的留言：<br>
          <span style="font-style:italic;">"林同学：知夏，对不起。那晚的事情是我们错了。"</span><br><br>
          这是一封道歉信，但被撕碎了。写信的人知道真相，却因为恐惧或压力选择了沉默。
        </div>
      `;
    }
    AudioSys.playUnlock();
    showToast('发现了被隐藏的道歉信！', 3000);
    findClue('ch4-apology','碎纸重组：道歉信','重组碎片发现一封写给林知夏的道歉信，证明有人知道真相但选择沉默','real');
    GameState.puzzlesSolved['shred-puzzle'] = true;
  } else {
    if (result) {
      result.style.display = 'block';
      result.style.background = 'rgba(160,80,80,0.1)';
      result.style.color = 'var(--danger)';
      result.textContent = '顺序不正确。提示：这是一封信的格式，应该有称呼、正文和落款。';
    }
    AudioSys.playError();
    showToast('顺序不正确，再想想...');
  }
}

// ========== 档案柜密码锁解谜 ==========
let lockDigits = [];

function enterLockDigit(digit) {
  if (lockDigits.length >= 4) return;
  lockDigits.push(digit);
  updateLockDisplay();
  AudioSys.playClick();
}

function updateLockDisplay() {
  const display = document.getElementById('lock-display');
  if (!display) return;
  let text = '';
  for (let i = 0; i < 4; i++) {
    if (i < lockDigits.length) {
      text += lockDigits[i];
    } else {
      text += '_';
    }
    if (i < 3) text += ' ';
  }
  display.textContent = text;
}

function resetLock() {
  lockDigits = [];
  updateLockDisplay();
  const result = document.getElementById('lock-result');
  if (result) result.style.display = 'none';
  AudioSys.playClick();
}

function checkLockCode() {
  const result = document.getElementById('lock-result');
  if (!result) return;
  
  if (lockDigits.length !== 4) {
    result.style.display = 'block';
    result.style.background = 'rgba(160,80,80,0.1)';
    result.style.color = 'var(--danger)';
    result.innerHTML = '请输入4位密码';
    AudioSys.playError();
    return;
  }
  
  const code = lockDigits.join('');
  
  if (code === '3333') {
    // 正确答案：林知夏的学号后四位
    result.style.display = 'block';
    result.style.background = 'rgba(74,124,89,0.1)';
    result.style.color = 'var(--success)';
    result.innerHTML = `
      <div style="font-weight:600;margin-bottom:8px;"><span style="color:var(--success);font-weight:700;">✓</span> 解锁成功！</div>
      <div style="line-height:1.8;">
        档案柜打开了。里面藏着一份被折叠的纸——是林知夏的日记残页：<br><br>
        <span style="font-style:italic;opacity:0.8;">"10月15日。今晚只有我一个人在教室了。我知道他们都不喜欢我，但我只是想安静地学习。21:45的时候，灯突然闪了一下，我听到走廊有人走来的声音..."</span><br><br>
        <strong>关键发现：</strong>林知夏在21:45时仍在教室，且听到了走廊的脚步声。
      </div>
    `;
    AudioSys.playUnlock();
    showToast('发现了林知夏的日记残页！', 3000);
    findClue('ch3-diary','日记残页：林知夏的视角','通过正确密码（3333，林知夏学号后四位）打开档案柜，发现林知夏21:45仍在教室且听到走廊脚步声','real');
    GameState.puzzlesSolved['lock-puzzle'] = true;
  } else if (code === '0328') {
    // 误导答案：吴敏的学号后四位（签退最晚）
    result.style.display = 'block';
    result.style.background = 'rgba(201,162,39,0.1)';
    result.style.color = 'var(--warning)';
    result.innerHTML = `
      <div style="font-weight:600;margin-bottom:8px;"><img src="icon-warning.svg" class="icon-img inline-icon" alt="" style="width:20px;height:20px;vertical-align:middle;"> 档案柜打开了，但是...</div>
      <div style="line-height:1.8;">
        柜子里只有一份"班级评优申请表"，看起来过于完美。<br><br>
        你注意到申请表上的时间戳是21:50——但值班老师21:30巡查时教室里还有人。<br>
        这份文件似乎是为了掩盖什么而刻意准备的。<br><br>
        <span style="opacity:0.7;">提示："最后离开的人"未必是"签退最晚的人"。</span>
      </div>
    `;
    AudioSys.playError();
    showToast('这份文件看起来太完美了...', 3000);
    findClue('ch3-fake-application','伪造的评优申请','输入0328打开柜子，发现一份过于完美的评优申请表，实则是班长的掩护','fake');
  } else {
    result.style.display = 'block';
    result.style.background = 'rgba(160,80,80,0.1)';
    result.style.color = 'var(--danger)';
    result.innerHTML = '<span style="color:var(--danger);font-weight:700;">✗</span> 密码错误。请重新思考"最后离开的人"是谁。';
    AudioSys.playError();
    lockDigits = [];
    setTimeout(updateLockDisplay, 500);
  }
  saveGame();
}

// ========== 摩斯密码解谜系统 ==========
const MORSE_CODE = {
  '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E',
  '..-.': 'F', '--.': 'G', '....': 'H', '..': 'I', '.---': 'J',
  '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O',
  '.--.': 'P', '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T',
  '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X', '-.--': 'Y',
  '--..': 'Z'
};

function decodeMorse(morseText) {
  return morseText.trim().split(/\s+/).map(code => MORSE_CODE[code] || '?').join('');
}

function checkMorsePuzzle() {
  const input = document.getElementById('morse-input');
  const result = document.getElementById('morse-result');
  if (!input || !result) return;

  const val = input.value.toUpperCase().replace(/\s/g, '');
  if (val === 'BANZHANG') {
    result.style.display = 'block';
    result.style.background = 'rgba(74,124,89,0.1)';
    result.style.color = 'var(--success)';
    result.innerHTML = `
      <div style="font-weight:600;margin-bottom:8px;"><span style="color:var(--success);font-weight:700;">✓</span> 解码成功！</div>
      <div style="line-height:1.8;">
        摩斯密码解码结果：<strong>BANZHANG</strong>（班长）<br><br>
        这是值班老师在匆忙中记录的暗号。他在巡查时发现了异常，
        但迫于某种压力，只能用这种方式留下线索...
      </div>
    `;
    AudioSys.playUnlock();
    showToast('摩斯密码破解成功！', 3000);
    findClue('ch3-morse','摩斯密码：班长的暗号','破解值班老师留下的摩斯密码，发现直指班长的暗号','real');
    GameState.puzzlesSolved['morse'] = true;
  } else {
    result.style.display = 'block';
    result.style.background = 'rgba(160,80,80,0.1)';
    result.style.color = 'var(--danger)';
    result.textContent = '解码结果不正确。提示：这是一个人物身份。';
    AudioSys.playError();
    input.style.animation = 'shake 0.4s';
    setTimeout(() => input.style.animation = '', 500);
  }
  saveGame();
}

// ========== 增强论坛搜索系统 ==========
const FORUM_USERS = {
  'linzhixia0333': {
    name: '林知夏',
    found: false,
    content: `
      <div style="border-left:3px solid var(--accent-blue);padding-left:12px;margin:8px 0;">
        <div style="font-size:0.8rem;color:#888;margin-bottom:4px;">2025-10-10 21:33</div>
        <div style="font-size:0.85rem;">今晚又要一个人留在教室了。其实没什么，反正已经习惯了。</div>
      </div>
      <div style="border-left:3px solid var(--accent-blue);padding-left:12px;margin:8px 0;">
        <div style="font-size:0.8rem;color:#888;margin-bottom:4px;">2025-10-14 22:15</div>
        <div style="font-size:0.85rem;">她们又在背后说我了。我知道的。但我不想惹事，只想安安静静地毕业。</div>
      </div>
      <div style="border-left:3px solid var(--danger);padding-left:12px;margin:8px 0;">
        <div style="font-size:0.8rem;color:#888;margin-bottom:4px;">2025-10-15 21:40</div>
        <div style="font-size:0.85rem;color:var(--danger);">灯闪了一下，走廊有脚步声。希望只是值班老师...</div>
      </div>
    `,
    clue: { id: 'ch2-user-lin', title: '林知夏的隐藏帖子', desc: '通过论坛搜索找到林知夏被隐藏的帖子，发现她在10月15日21:40发布了可疑内容', type: 'real' }
  },
  'banzhang0321': {
    name: '班长',
    found: false,
    content: `
      <div style="border-left:3px solid var(--warning);padding-left:12px;margin:8px 0;">
        <div style="font-size:0.8rem;color:#888;margin-bottom:4px;">2025-10-12 18:20</div>
        <div style="font-size:0.85rem;">评优的事情必须万无一失。任何人任何事都不能影响班级荣誉。</div>
      </div>
      <div style="border-left:3px solid var(--warning);padding-left:12px;margin:8px 0;">
        <div style="font-size:0.8rem;color:#888;margin-bottom:4px;">2025-10-15 22:30</div>
        <div style="font-size:0.85rem;">已经处理好了。名单已更新，监控也处理完毕。大家统一口径，就说她临时请假。</div>
      </div>
    `,
    clue: { id: 'ch2-user-ban', title: '班长的操控记录', desc: '班长的论坛记录暴露了他"处理"名单和监控的行为，以及要求统一口径的命令', type: 'real' }
  },
  'chenxue0315': {
    name: '陈雪',
    found: false,
    content: `
      <div style="border-left:3px solid var(--accent-cold);padding-left:12px;margin:8px 0;">
        <div style="font-size:0.8rem;color:#888;margin-bottom:4px;">2025-10-14 23:00</div>
        <div style="font-size:0.85rem;">我知道这样做不对...但我不敢反对班长。对不起，知夏。</div>
      </div>
    `,
    clue: { id: 'ch2-user-chen', title: '陈雪的忏悔', desc: '陈雪的论坛记录显示她参与了隐瞒，但内心充满愧疚', type: 'half' }
  }
};

function searchForumUser() {
  const input = document.getElementById('forum-user-search');
  const resultArea = document.getElementById('forum-search-result');
  const hintArea = document.getElementById('forum-search-hint');
  if (!input) return;

  const val = input.value.trim().toLowerCase();
  const user = FORUM_USERS[val];

  if (user) {
    if (user.found) {
      showToast('该用户的内容已经查看过了');
      return;
    }
    user.found = true;
    if (resultArea) {
      resultArea.style.display = 'block';
      resultArea.innerHTML = `
        <div style="font-weight:600;margin-bottom:12px;color:var(--success);"><span style="color:var(--success);font-weight:700;">✓</span> 发现用户：${user.name}</div>
        <div style="font-size:0.85rem;line-height:1.8;">${user.content}</div>
      `;
    }
    if (hintArea) hintArea.style.display = 'none';
    AudioSys.playUnlock();
    showToast(`发现 ${user.name} 的隐藏记录！`, 3000);
    findClue(user.clue.id, user.clue.title, user.clue.desc, user.clue.type);
    
    // 如果找到了班长和林知夏，解锁额外线索
    if (FORUM_USERS['banzhang0321'].found && FORUM_USERS['linzhixia0333'].found) {
      setTimeout(() => {
        showToast('对比两人的记录，发现了一个关键时间矛盾！', 4000);
        findClue('ch2-time-contra','时间矛盾：22:30 vs 21:40','班长声称22:30才处理完，但林知夏21:40还在教室发帖，时间线存在致命矛盾','real');
      }, 2000);
    }
  } else {
    if (resultArea) resultArea.style.display = 'none';
    if (hintArea) {
      hintArea.style.display = 'block';
      hintArea.innerHTML = `
        <div style="color:var(--danger);"><span style="color:var(--danger);font-weight:700;">✗</span> 未找到该用户</div>
        <div style="font-size:0.78rem;color:#888;margin-top:8px;">
          提示：尝试以下搜索方式<br>
          • 姓名全拼 + 学号后四位<br>
          • 例如：linzhixia0333、banzhang0321、chenxue0315
        </div>
      `;
    }
    AudioSys.playError();
    showToast('未找到该用户，尝试其他关键词');
  }
  saveGame();
}

// ========== 隐藏密码本解谜 ==========
function checkHiddenCode() {
  const input = document.getElementById('hidden-code-input');
  const result = document.getElementById('hidden-code-result');
  if (!input || !result) return;

  const val = input.value.trim().toUpperCase();
  if (val === 'SILENCE') {
    result.style.display = 'block';
    result.style.background = 'rgba(74,124,89,0.1)';
    result.style.color = 'var(--success)';
    result.innerHTML = `
      <div style="font-weight:600;margin-bottom:8px;"><span style="color:var(--success);font-weight:700;">✓</span> 密码正确！</div>
      <div style="line-height:1.8;">
        密码本打开了。里面记录着一行字：<br><br>
        <span style="font-style:italic;color:var(--danger);">"10月15日，晚自习。林知夏被锁在了教室里。是我们干的。——S"</span><br><br>
        这个"S"是谁？陈雪？还是另有其人？
      </div>
    `;
    AudioSys.playUnlock();
    showToast('发现了惊人的秘密！', 3000);
    findClue('ch4-hidden-note','隐藏密码本：锁门事件','密码本记录了林知夏被故意锁在教室的事实，签名只有一个字母"S"','real');
    GameState.puzzlesSolved['hidden-code'] = true;
  } else {
    result.style.display = 'block';
    result.style.background = 'rgba(160,80,80,0.1)';
    result.style.color = 'var(--danger)';
    result.textContent = '密码错误。提示：英文单词，与"沉默"有关。';
    AudioSys.playError();
    input.style.animation = 'shake 0.4s';
    setTimeout(() => input.style.animation = '', 500);
  }
  saveGame();
}

// ========== 传感器数据解码解谜 ==========
function decodeSensorData() {
  const shiftInput = document.getElementById('decoder-shift');
  const resultDiv = document.getElementById('decoder-result');
  if (!shiftInput || !resultDiv) return;

  const shift = parseInt(shiftInput.value) || 0;
  const cipherText = 'QEB NRFZH YOLHBK CLO';
  
  function caesarDecode(text, offset) {
    return text.split('').map(char => {
      if (char === ' ') return ' ';
      const code = char.charCodeAt(0);
      if (code >= 65 && code <= 90) {
        return String.fromCharCode(((code - 65 + offset) % 26 + 26) % 26 + 65);
      }
      if (code >= 97 && code <= 122) {
        return String.fromCharCode(((code - 97 + offset) % 26 + 26) % 26 + 97);
      }
      return char;
    }).join('');
  }

  const decoded = caesarDecode(cipherText, shift);
  
  resultDiv.style.display = 'block';
  
  if (shift === 3) {
    resultDiv.innerHTML = `
      <div style="color:var(--success);margin-bottom:8px;"><span style="color:var(--success);font-weight:700;">✓</span> 解码成功！</div>
      <div style="color:#c0c8d0;letter-spacing:2px;margin-bottom:12px;">${decoded}</div>
      <div style="font-size:0.8rem;color:#888;line-height:1.8;">
        <strong>分析：</strong>"THE QUICK BROKEN FOR" — 这段传感器数据被人为篡改过。<br>
        "BROKEN"暗示数据已被破坏，这与监控"信号中断"的时间点（21:45）完全吻合。<br>
        有人在当晚快速且系统性地销毁了证据。
      </div>
    `;
    AudioSys.playUnlock();
    showToast('传感器数据解码成功！', 3000);
    findClue('ch3-sensor-decode','传感器解码完成','通过凯撒密码解码发现传感器数据被人为篡改，"BROKEN"与监控中断时间吻合','real');
    GameState.puzzlesSolved['sensor-decode'] = true;
  } else if (shift === 0) {
    resultDiv.innerHTML = `
      <div style="color:#888;">偏移量为0，未进行解码：</div>
      <div style="color:var(--warning);letter-spacing:2px;margin-top:8px;">${decoded}</div>
      <div style="font-size:0.78rem;color:#666;margin-top:8px;">提示：尝试不同的偏移量（1-25）...</div>
    `;
    AudioSys.playError();
  } else {
    resultDiv.innerHTML = `
      <div style="color:#888;">偏移量 ${shift} 的解码结果：</div>
      <div style="color:var(--warning);letter-spacing:2px;margin-top:8px;">${decoded}</div>
      <div style="font-size:0.78rem;color:#666;margin-top:8px;">这似乎不是有意义的文本。再试试其他偏移量？</div>
    `;
    AudioSys.playClick();
  }
  saveGame();
}

// ========== 最终答案 ==========
function selectAnswer(qid, ans) {
  GameState.choices[qid] = ans;
  document.querySelectorAll('.choice-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
  event.currentTarget.classList.add('selected');
}

function checkFinalAnswer() {
  const ans = GameState.choices['q1'];
  if (!ans) {
    showToast('请先选择一个答案');
    return;
  }

  if (ans === 'c') {
    GameState.ending = 'good';
    AudioSys.playDramatic();
    showPage('page-ending-good');
  } else {
    GameState.ending = 'bad';
    AudioSys.playError();
    showPage('page-ending-bad');
  }
  saveGame();
}

function goToLogicCheck() {
  const solved = Object.keys(GameState.puzzlesSolved).length;
  if (solved < 3) {
    showToast('请先完成所有符号谜题');
    return;
  }
  showPage('page-ch5-logic');
}

function goToEnding() {
  showPage('page-ch5-review');
}

// ========== 逻辑验证系统 ==========
let logicAnswers = {};

function selectLogicAnswer(qid, ans) {
  logicAnswers[qid] = ans;
  // 清除同组其他按钮的选中状态
  const cards = document.querySelectorAll('#page-ch5-logic .card');
  cards.forEach(card => {
    const btns = card.querySelectorAll('.choice-btn');
    btns.forEach(btn => {
      if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(`'${qid}','${ans}'`)) {
        btn.classList.add('selected');
      } else if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(`'${qid}'`)) {
        btn.classList.remove('selected');
      }
    });
  });
  AudioSys.playClick();
}

function checkLogicAnswers() {
  const correct = {
    'q1': 'c',  // 林知夏，3333
    'q2': 'b',  // 人为删除/篡改
    'q3': 'b',  // 班长
    'q4': 'b'   // 为了班级评优资格和个人市三好学生评选
  };
  
  let allCorrect = true;
  let wrongQuestions = [];
  
  for (let qid in correct) {
    if (logicAnswers[qid] !== correct[qid]) {
      allCorrect = false;
      wrongQuestions.push(qid);
    }
  }
  
  const resultDiv = document.getElementById('logic-result');
  if (!resultDiv) return;
  
  if (Object.keys(logicAnswers).length < 4) {
    resultDiv.style.display = 'block';
    resultDiv.style.background = 'rgba(160,80,80,0.1)';
    resultDiv.style.color = 'var(--danger)';
    resultDiv.textContent = '请先回答所有4个问题';
    AudioSys.playError();
    return;
  }
  
  if (allCorrect) {
    resultDiv.style.display = 'block';
    resultDiv.style.background = 'rgba(74,124,89,0.1)';
    resultDiv.style.color = 'var(--success)';
    resultDiv.innerHTML = `
      <div style="font-size:1.1rem;font-weight:600;margin-bottom:8px;"><span style="color:var(--success);font-weight:700;">✓</span> 验证通过！</div>
      <div>你已经掌握了所有关键事实。真相档案已解锁。</div>
      <div style="margin-top:16px;">
        <button class="btn btn-success" onclick="showPage('page-ch5-truth')"><img src="icon-scroll.svg" class="icon-img inline-icon" alt="" style="width:18px;height:18px;vertical-align:middle;"> 查看真相档案</button>
      </div>
    `;
    AudioSys.playUnlock();
    showToast('逻辑验证通过！真相已解锁', 3000);
    findClue('ch5-logic-pass','逻辑验证通过','通过全部4道逻辑验证题，证明已掌握完整真相','real');
    GameState.puzzlesSolved['logic-verify'] = true;
  } else {
    resultDiv.style.display = 'block';
    resultDiv.style.background = 'rgba(160,80,80,0.1)';
    resultDiv.style.color = 'var(--danger)';
    const qNames = { 'q1': '一', 'q2': '二', 'q3': '三', 'q4': '四' };
    const wrongText = wrongQuestions.map(q => qNames[q]).join('、');
    resultDiv.innerHTML = `
      <div style="font-weight:600;margin-bottom:8px;"><span style="color:var(--danger);font-weight:700;">✗</span> 验证失败</div>
      <div>第 ${wrongText} 题答案不正确。请回顾已收集的证据。</div>
    `;
    AudioSys.playError();
    showToast(`第 ${wrongText} 题错误，请重新思考`);
  }
  saveGame();
}

// ========== Toast 提示 ==========
function showToast(msg, duration = 2500) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'hint-bubble';
    toast.style.bottom = '120px';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// ========== 模态框 ==========
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

// 注意：完整的 AudioSys 定义在 audio.js 中

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  const hasSave = loadGame();

  // 恢复便签纸主题
  if (GameState.notepadTheme) {
    changeNotepadTheme(GameState.notepadTheme);
  }

  // 初始化便签纸
  const npText = document.getElementById('notepad-text');
  if (npText) {
    npText.value = GameState.notepadContent;
    npText.addEventListener('input', updateNotepadContent);
  }

  // 初始化导航
  updateNavState();
  updateClueCounter();
  checkLogicProgress();
  updatePuzzleInputs();
  updateSymbolCluesSummary();

  // 恢复已解锁符号
  Object.keys(GameState.symbolProgress).forEach(sym => {
    if (GameState.symbolProgress[sym]) {
      document.querySelectorAll(`[data-symbol="${sym}"]`).forEach(el => {
        el.classList.remove('locked');
        el.classList.add('solved');
        if (SYMBOL_MAP[sym]) {
          el.setAttribute('data-letter', SYMBOL_MAP[sym].letters);
        }
      });
    }
  });

  // 显示提示
  if (hasSave) {
    const ch = GameState.currentChapter;
    if (ch > 0) {
      const hp = document.getElementById('header-progress');
      if (hp) hp.style.display = 'flex';
      const ci = document.getElementById('chapter-indicator');
      if (ci) ci.textContent = '第' + ['一','二','三','四','五'][ch-1] + '章';
      currentChapterHint = 'ch' + ch;
      AudioSys.ensureInit();
      AudioSys.startWind();
      AudioSys.startHum();
    }
    showToast('欢迎回来，进度已恢复');
  }

  // 显示快捷键提示（3秒后自动显示，5秒后自动隐藏）
  setTimeout(() => {
    const hint = document.getElementById('shortcut-hint');
    if (hint && GameState.currentChapter > 0) {
      hint.style.display = 'block';
      setTimeout(() => {
        if (hint) hint.style.display = 'none';
      }, 6000);
    }
  }, 3000);

  // 绑定全局事件
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('notepad-panel');
    const notepadLink = document.querySelector('.notepad-link');
    if (panel && panel.classList.contains('open')) {
      if (!panel.contains(e.target) && (!notepadLink || !notepadLink.contains(e.target))) {
        panel.classList.remove('open');
      }
    }
  });

  // 键盘快捷键
  document.addEventListener('keydown', (e) => {
    // N - 打开/关闭便签纸
    if (e.key === 'n' || e.key === 'N') {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        toggleNotepad();
      }
    }
    // H - 获取提示
    if (e.key === 'h' || e.key === 'H') {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        getHint(currentChapterHint);
      }
    }
    // S - 手动存档
    if (e.key === 's' || e.key === 'S') {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        saveGame();
      }
    }
    // M - 音效开关
    if (e.key === 'm' || e.key === 'M') {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        AudioSys.toggle();
      }
    }
    // ESC - 关闭便签纸
    if (e.key === 'Escape') {
      const panel = document.getElementById('notepad-panel');
      if (panel && panel.classList.contains('open')) {
        panel.classList.remove('open');
      }
    }
  });

  // 便签纸打字音效
  const npText2 = document.getElementById('notepad-text');
  if (npText2) {
    npText2.addEventListener('input', () => {
      AudioSys.playType();
    });
  }
});

// 暴露全局函数
window.showPage = showPage;
window.showChapterTransition = showChapterTransition;
window.showHint = showHint;
window.getHint = getHint;
window.findClue = findClue;
window.markClue = markClue;
window.toggleNotepad = toggleNotepad;
window.changeNotepadTheme = changeNotepadTheme;
window.insertNotepadTemplate = insertNotepadTemplate;
window.clearNotepad = clearNotepad;
window.exportNotepad = exportNotepad;
window.insertTimestamp = insertTimestamp;
window.onSymbolClick = onSymbolClick;
window.checkPuzzle = checkPuzzle;
window.checkChapter1Puzzle = checkChapter1Puzzle;
window.openModal = openModal;
window.closeModal = closeModal;
window.showToast = showToast;
window.saveGame = saveGame;
window.resetGame = resetGame;
window.startGame = startGame;
window.goToChapter = goToChapter;
window.setCamTime = setCamTime;
window.searchArchive = searchArchive;
window.searchForumUser = searchForumUser;
window.selectTimelineCard = selectTimelineCard;
window.resetTimelinePuzzle = resetTimelinePuzzle;
window.checkTimelineOrder = checkTimelineOrder;
window.decodeSensorData = decodeSensorData;
window.selectShredPiece = selectShredPiece;
window.resetShredPuzzle = resetShredPuzzle;
window.checkShredOrder = checkShredOrder;
window.enterLockDigit = enterLockDigit;
window.resetLock = resetLock;
window.checkLockCode = checkLockCode;
window.triggerEasterEgg = triggerEasterEgg;
window.selectAnswer = selectAnswer;
window.checkFinalAnswer = checkFinalAnswer;
window.goToEnding = goToEnding;
window.checkMorsePuzzle = checkMorsePuzzle;
window.checkHiddenCode = checkHiddenCode;
window.GameState = GameState;
