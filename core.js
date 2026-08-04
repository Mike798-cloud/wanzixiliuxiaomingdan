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
  symbolAttempts: {},
  symbolSystemVersion: 2,
  symbolAnswer: '',
  puzzlesSolved: {},
  puzzleAttempts: {},
  hintLevel: 0,
  hintClicks: {},
  timeInChapter: {},
  choices: {},
  logicAnswers: {},
  ending: null,
  _lastSave: 0
};

let currentChapterHint = 'ch1';

// 存档密钥
const SAVE_KEY = 'yuhua_nightstudy_v2';
const SUPPORT_PROMPT_KEY = 'nightstudy_support_prompted_v1';

function showSupportPaywall() {
  if (window.Paywall) {
    Paywall.show({
      title: '支持《晚自习留校名单》',
      price: '1元',
      studio: 'abc studio',
      qrCode: 'paycode.png'
    });
  } else {
    showToast('支持组件尚未加载，请刷新页面后重试');
  }
}

function maybeShowSupportPaywall() {
  if (localStorage.getItem(SUPPORT_PROMPT_KEY)) return;
  localStorage.setItem(SUPPORT_PROMPT_KEY, '1');
  setTimeout(showSupportPaywall, 900);
}

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
    symbolAttempts: GameState.symbolAttempts,
    symbolSystemVersion: 2,
    puzzlesSolved: GameState.puzzlesSolved,
    puzzleAttempts: GameState.puzzleAttempts,
    hintLevel: GameState.hintLevel,
    hintClicks: GameState.hintClicks,
    choices: GameState.choices,
    logicAnswers: GameState.logicAnswers,
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
    GameState.symbolAttempts = data.symbolAttempts || {};
    GameState.symbolSystemVersion = Number(data.symbolSystemVersion || 1);
    GameState.puzzlesSolved = data.puzzlesSolved || {};
    GameState.puzzleAttempts = data.puzzleAttempts || {};

    // 旧版点击符号会直接解锁拼音。未通关的旧存档迁移到新版时，
    // 仅重置符号译读与三个符号谜题，保留已经找到的原始符号旁注和其他章节进度。
    if (GameState.symbolSystemVersion < 2 && !data.ending) {
      GameState.symbolProgress = {};
      GameState.symbolAttempts = {};
      ['ch1', 'puzzle1', 'puzzle2', 'puzzle3'].forEach(id => delete GameState.puzzlesSolved[id]);
      ['ch1-puzzle-solved', 'ch5-puzzle1', 'ch5-puzzle2', 'ch5-puzzle3'].forEach(id => {
        GameState.cluesFound.delete(id);
        delete GameState.cluesMarked[id];
      });
    }
    GameState.symbolSystemVersion = 2;
    GameState.hintLevel = data.hintLevel || 0;
    GameState.hintClicks = data.hintClicks || {};
    GameState.choices = data.choices || {};
    GameState.logicAnswers = data.logicAnswers || {};
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
// 需要门控的页面及其访问条件
const PAGE_GATES = {
  'page-ch5-truth': () => GameState.puzzlesSolved['logic-verify'] === true,
  'page-ch5-logic': () => ['puzzle1','puzzle2','puzzle3'].every(id => GameState.puzzlesSolved[id] === true),
  'page-ch5-puzzle': () => GameState.cluesFound.size >= 5
};

function showPage(pageId, options = {}) {
  // 检查页面门控
  const gate = PAGE_GATES[pageId];
  if (gate && !gate()) {
    if (pageId === 'page-ch5-truth') {
      showToast('需要通过逻辑验证才能查看真相档案');
    } else if (pageId === 'page-ch5-logic') {
      showToast('需要破解更多谜题才能进入逻辑验证');
    } else if (pageId === 'page-ch5-puzzle') {
      showToast('需要收集更多线索才能进入最终谜题');
    } else {
      showToast('此页面尚未解锁');
    }
    return;
  }

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

    // 根据页面自动更新当前章节提示上下文
    const chapterMatch = pageId.match(/^page-ch(\d+)/);
    if (chapterMatch) {
      currentChapterHint = 'ch' + chapterMatch[1];
    }

    if (pageId === 'page-ch5-review') {
      updateCompletionDisplay();
      updateTimelineReveal();
    }
    // 切换页面时更新提示按钮状态
    updateHintButtonState(currentChapterHint);
  }
}

// 根据玩家已找到的线索逐步揭示复盘页的时间线
function updateTimelineReveal() {
  const timelineContainer = document.getElementById('ch5-review-timeline');
  if (!timelineContainer) return;
  const items = timelineContainer.querySelectorAll('.timeline-item');
  if (items.length === 0) return;

  // 每条时间线项对应的关键线索ID
  const timelineClues = [
    'ch1-name',           // 18:00 林知夏签到
    'ch2-real1',          // 19:45 匿名同学B看到女生
    'ch2-contra-b',       // 21:15 李婷离开
    'ch3-monitor-log',    // 21:30 值班老师巡查
    'ch3-sensor',         // 21:45 监控中断+传感器
    'ch1-backup',         // 22:00 教室清空
    'ch2-contra-c',       // 22:15 班长提交名单（fake）
    'ch2-user-ban'        // 次日 班长数据清理（fake）
  ];

  let revealedCount = 0;
  timelineClues.forEach((clueId, idx) => {
    if (GameState.cluesFound.has(clueId)) {
      revealedCount++;
      if (items[idx]) {
        items[idx].style.display = '';
        items[idx].classList.add('timeline-revealed');
      }
    } else {
      if (items[idx]) {
        items[idx].style.display = 'none';
      }
    }
  });

  // 如果没有任何线索，显示提示
  const placeholder = document.getElementById('timeline-placeholder');
  if (placeholder) {
    placeholder.style.display = revealedCount === 0 ? 'block' : 'none';
  }
}

function updateCompletionDisplay() {
  const display = document.getElementById('completion-display');
  if (!display) return;
  const c = getCompletionScore();
  const percent = Math.round(c.keyClues / c.totalKeyClues * 100);
  const puzzleCount = c.puzzles;
  let status = '';
  let color = 'var(--warning)';
  if (percent >= 80 && puzzleCount >= 5) {
    status = '调查接近完整，可以进入最终验证';
    color = 'var(--success)';
  } else if (percent >= 50) {
    status = '已找到部分关键线索，但可能还有遗漏';
    color = 'var(--warning)';
  } else {
    status = '关键线索不足，建议返回之前的章节仔细探索';
    color = 'var(--danger)';
  }
  display.innerHTML = `
    <div style="font-size:0.9rem;color:#c0c8d0;line-height:1.8;">
      <strong style="color:${color};">调查进度</strong><br>
      <div style="background:rgba(0,0,0,0.2);border-radius:4px;height:8px;margin:8px 0;overflow:hidden;">
        <div style="width:${percent}%;height:100%;background:${color};transition:width 0.5s;"></div>
      </div>
      关键线索：${c.keyClues} / ${c.totalKeyClues}（${percent}%）｜ 谜题破解：${puzzleCount}<br>
      <span style="color:${color};font-size:0.8rem;">${status}</span>
    </div>
  `;
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
    maybeShowSupportPaywall();
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

// ========== 渐进式上下文感知提示系统（3级） ==========
// 提示内容根据玩家在各章节的完成情况动态生成
// Level 1: 方向性引导（只指出还缺什么，不透露具体内容）
// Level 2: 具体指引（告诉玩家该看什么/做什么，针对未完成部分）
// Level 3: 近似完整答案（给出解题方法，针对未完成部分）

// 每章节的关键进度检查点
const CHAPTER_PROGRESS = {
  ch1: {
    clues: [
      { id: 'ch1-name', name: '公示名单中的异常', hint1: '公示名单上有不对劲的地方', hint2: '对比公示名单和存档记录，有人被从名单上抹去了', hint3: '林知夏的名字在存档中存在但在公示名单上被删除了' },
      { id: 'ch1-backup', name: '存档记录', hint1: '存档记录里有重要信息', hint2: '搜索日期2025-10-15可以调出存档记录', hint3: '在存档搜索框输入2025-10-15，可以看到原始名单记录' },
      { id: 'ch1-puzzle-solved', name: '符号谜题', hint1: '先找到三个符号旁边的取字句，再逐个译读', hint2: '符号图案只是定位标记；从旁注中找被要求提取的汉字，再输入该字拼音', hint3: '双木成“林”、知者乐“水”取前字“知”、“夏”夜望月取句首，组合为linzhixia' }
    ]
  },
  ch2: {
    clues: [
      { id: 'ch2-contra-a', name: '证词A', hint1: '留言板上有同学的证词', hint2: '仔细阅读留言板上的三条证词，找出时间矛盾', hint3: '证词A声称21:30全员离开，但与其他证词矛盾' },
      { id: 'ch2-contra-b', name: '证词B', hint1: '不同同学的证词之间有出入', hint2: '对比三条证词的具体时间，谁说的对不上', hint3: '证词B提到21:45还有人，与证词A矛盾' },
      { id: 'ch2-user-lin', name: '林知夏的隐藏帖子', hint1: '留言板有个搜索功能没试过', hint2: '用「姓名拼音+学号后四位」搜索用户', hint3: '搜索linzhixia0333可以找到林知夏的隐藏帖子' },
      { id: 'ch2-user-ban', name: '班长的操控记录', hint1: '不止一个用户的隐藏记录可以搜索', hint2: '试试搜索班长的用户名，格式同样是姓名拼音+学号后四位', hint3: '搜索banzhang0310可以找到班长要求统一口径的记录' },
      { id: 'ch2-time-contra', name: '时间矛盾', hint1: '两个人发帖的时间有问题', hint2: '对比林知夏和班长的发帖时间', hint3: '林知夏21:40还在发帖，但班长声称22:30才处理完，时间矛盾' }
    ]
  },
  ch3: {
    clues: [
      { id: 'ch3-timeline-puzzle', name: '时间线重建', hint1: '有个时间线谜题需要排列', hint2: '按事件发生的时间顺序排列5个事件卡片', hint3: '正确顺序是B→D→A→C→E' },
      { id: 'ch3-diary', name: '档案柜密码', hint1: '档案柜需要密码才能打开', hint2: '密码是某人的学号后四位，这个人在名单上被删除了', hint3: '密码是0333，林知夏学号20220333的后四位' },
      { id: 'ch3-morse', name: '摩斯密码', hint1: '有段摩斯密码等待解码', hint2: '解码后是一个中文词语的拼音', hint3: '摩斯密码解码为BANZHANG（班长）' },
      { id: 'ch3-sensor-decode', name: '传感器解码', hint1: '传感器数据被加密了', hint2: '这是凯撒密码，需要找到正确的偏移量', hint3: '凯撒密码偏移量为3，解码后为THE QUICK BROKEN FOR' }
    ]
  },
  ch4: {
    clues: [
      { id: 'ch4-apology', name: '碎纸重组', hint1: '有被撕碎的纸片需要重组', hint2: '按道歉信的逻辑顺序排列碎片，从姓氏开始', hint3: '正确排列后是一封写给林知夏的道歉信：林知夏同学对不起那晚的事情是我们错了' },
      { id: 'ch4-hidden-note', name: '隐藏密码本', hint1: '有个密码本需要输入密码', hint2: '密码是一个英文单词，意思是「沉默」', hint3: '密码是SILENCE，打开后记录了林知夏被故意锁在教室的事实' }
    ]
  },
  ch5: {
    clues: [
      { id: 'ch5-puzzle1', name: '符号谜题一', hint1: '先在符号手册中完成木、水、月的译读', hint2: '按画面顺序拼接三个已验证音节', hint3: '林+知+夏，对应linzhixia' },
      { id: 'ch5-puzzle2', name: '符号谜题二', hint1: '先完成日、目两个符号的译读', hint2: '旁注分别引向“真”和“相”', hint3: '真+相，对应zhenxiang' },
      { id: 'ch5-puzzle3', name: '符号谜题三', hint1: '第三题由四个已经出现过的符号组成', hint2: '按火、山、日、目的顺序拼接译读结果', hint3: '掩+盖+真+相，对应yangaizhenxiang' },
      { id: 'ch5-logic-pass', name: '逻辑验证', hint1: '逻辑验证题还没全部答对', hint2: '回顾已收集的证据，回答关于案件真相的4个问题', hint3: '答案：q1=c（林知夏），q2=b（人为篡改），q3=b（班长），q4=b（为评优）' }
    ]
  }
};

// 根据玩家进度动态生成上下文感知提示
function getContextualHint(chapter, level) {
  const progress = CHAPTER_PROGRESS[chapter];
  if (!progress) return null;

  // 找出当前章节中尚未完成的项目
  const missingItems = progress.clues.filter(item => {
    if (chapter === 'ch5') {
      // 第五章特殊处理：检查谜题是否已解
      if (item.id === 'ch5-puzzle1') return !GameState.puzzlesSolved['puzzle1'];
      if (item.id === 'ch5-puzzle2') return !GameState.puzzlesSolved['puzzle2'];
      if (item.id === 'ch5-puzzle3') return !GameState.puzzlesSolved['puzzle3'];
      if (item.id === 'ch5-logic-pass') return !GameState.puzzlesSolved['logic-verify'];
    }
    return !GameState.cluesFound.has(item.id);
  });

  // 如果所有项目都已完成
  if (missingItems.length === 0) {
    const completion = getCompletionScore();
    if (chapter === 'ch5') {
      if (completion.keyClues >= 12 && completion.puzzles >= 5) {
        return '本章所有谜题已破解，调查接近完整。前往调查复盘页面提交最终答案吧。';
      } else {
        return `当前进度：关键线索 ${completion.keyClues}/${completion.totalKeyClues}，谜题 ${completion.puzzles}个。建议返回之前的章节寻找遗漏的线索。`;
      }
    }
    return '本章的关键线索和谜题均已发现。如果还没推进到下一章，检查一下是否有遗漏的页面。';
  }

  // 根据级别生成提示
  const levelFields = ['hint1', 'hint2', 'hint3'];
  const field = levelFields[level] || 'hint1';

  if (missingItems.length === 1) {
    // 只剩一个未完成项，直接提示
    return missingItems[0][field];
  } else {
    // 多个未完成项
    if (level === 0) {
      // Level 1: 只说还缺几个，不给具体内容
      const names = missingItems.map(i => i.name).join('、');
      return `当前还有 ${missingItems.length} 项未完成：${names}。逐一探索这些方向。`;
    } else if (level === 1) {
      // Level 2: 给出每个未完成项的具体指引
      return missingItems.map(i => `• ${i.name}：${i.hint2}`).join('\n');
    } else {
      // Level 3: 给出每个未完成项的答案
      return missingItems.map(i => `• ${i.name}：${i.hint3}`).join('\n');
    }
  }
}

// 静态提示作为后备
const HINTS = {
  ch1: ['公示网和存档之间，或许有些东西不一样。'],
  ch2: ['三个人的说法，总有一个对不上。'],
  ch3: ['碎片拼在一起，才能看到全貌。'],
  ch4: ['沉默，有时候也是一种回答。'],
  ch5: ['回头看看走过的路。']
};

function showHint(text, duration = 4000) {
  const bubble = document.getElementById('hint-bubble');
  if (!bubble) return;
  bubble.textContent = text;
  bubble.classList.add('show');
  // 动态调整显示时长：文本越长，显示越久
  const autoDuration = Math.max(duration, Math.min(text.length * 80, 12000));
  if (bubble._hintTimer) clearTimeout(bubble._hintTimer);
  bubble._hintTimer = setTimeout(() => bubble.classList.remove('show'), autoDuration);
}

// ========== 提示面板系统（可反复查看已解锁的各级提示） ==========
function toggleHintPanel(open) {
  const panel = document.getElementById('hint-panel');
  const overlay = document.getElementById('hint-panel-overlay');
  if (!panel) return;

  const shouldOpen = open !== undefined ? open : !panel.classList.contains('open');

  if (shouldOpen) {
    renderHintPanel();
    panel.classList.add('open');
    if (overlay) overlay.classList.add('show');
  } else {
    panel.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
  }
}

// 渲染提示面板内容（显示所有已解锁的提示 + 获取下一级按钮）
function renderHintPanel() {
  const body = document.getElementById('hint-panel-body');
  const nextBtn = document.getElementById('hint-next-btn');
  if (!body) return;

  const chapter = currentChapterHint;
  if (!GameState.hintClicks) GameState.hintClicks = {};
  const used = GameState.hintClicks[chapter] || 0;
  const maxLevel = 3;
  const levelLabels = ['方向', '指引', '答案'];

  if (used === 0) {
    body.innerHTML = `<p style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:20px 0;">点击下方按钮获取提示。每章最多${maxLevel}级，越往后越详细。已获取的提示可随时在此回顾。</p>`;
  } else {
    let html = '';
    for (let i = 0; i < used; i++) {
      const contextualHint = getContextualHint(chapter, i);
      const hint = contextualHint || (HINTS[chapter] || ['保持冷静，仔细梳理已有信息。'])[0];
      const levelLabel = levelLabels[i] || `第${i + 1}级`;
      const levelColors = ['#5a8a5a', '#c9a227', '#c8b878'];
      const color = levelColors[i] || '#888';
      html += `
        <div class="hint-panel-item" style="border-left:3px solid ${color};padding:10px 14px;margin-bottom:10px;background:rgba(0,0,0,0.03);border-radius:0 6px 6px 0;">
          <div style="font-size:0.75rem;color:${color};font-weight:600;margin-bottom:4px;">提示 ${i + 1}/${maxLevel} · ${levelLabel}</div>
          <div style="font-size:0.85rem;line-height:1.7;color:var(--text-secondary);white-space:pre-line;">${hint}</div>
        </div>
      `;
    }
    body.innerHTML = html;
  }

  // 更新"获取下一级提示"按钮
  if (nextBtn) {
    if (used >= maxLevel) {
      nextBtn.textContent = '本章提示已全部获取';
      nextBtn.disabled = true;
      nextBtn.style.opacity = '0.5';
      nextBtn.style.cursor = 'not-allowed';
    } else {
      const nextLabel = levelLabels[used] || `第${used + 1}级`;
      nextBtn.textContent = `获取第${used + 1}级提示（${nextLabel}）`;
      nextBtn.disabled = false;
      nextBtn.style.opacity = '';
      nextBtn.style.cursor = '';
    }
  }
}

function getHint(chapter) {
  if (!GameState.hintClicks) GameState.hintClicks = {};
  const currentLevel = GameState.hintClicks[chapter] || 0;
  const maxLevel = 3;

  // 如果已用完所有提示级别
  if (currentLevel >= maxLevel) {
    // 打开面板让玩家回顾已有提示
    toggleHintPanel(true);
    return;
  }

  // 获取上下文感知提示
  const contextualHint = getContextualHint(chapter, currentLevel);

  // 如果上下文提示为空，使用静态后备提示
  const hint = contextualHint || (HINTS[chapter] || ['保持冷静，仔细梳理已有信息。'])[0];

  const levelLabels = ['方向', '指引', '答案'];
  const levelLabel = levelLabels[currentLevel] || `第${currentLevel + 1}级`;
  const levelText = `【提示 ${currentLevel + 1}/${maxLevel} · ${levelLabel}】`;

  // 增加提示点击次数
  GameState.hintClicks[chapter] = currentLevel + 1;

  // 同时显示气泡通知和打开面板
  showHint(`${levelText}\n${hint}`, 5000);

  // 更新提示按钮视觉状态
  updateHintButtonState(chapter);

  // 打开/刷新提示面板，让玩家可以反复查看
  toggleHintPanel(true);

  saveGame();
}

// 提示按钮点击逻辑：如果面板已打开则关闭，否则获取下一级提示或打开面板回顾
function onHintButtonClick() {
  const panel = document.getElementById('hint-panel');
  if (panel && panel.classList.contains('open')) {
    toggleHintPanel(false);
    return;
  }
  getHint(currentChapterHint);
}

// 更新提示按钮的视觉状态（显示已用提示级别）
function updateHintButtonState(chapter) {
  const btn = document.getElementById('hint-btn');
  if (!btn) return;
  const used = (GameState.hintClicks && GameState.hintClicks[chapter]) || 0;
  const total = 3;

  // 移除旧的徽章
  const oldBadge = btn.querySelector('.hint-badge');
  if (oldBadge) oldBadge.remove();

  if (used > 0) {
    // 添加徽章显示已用提示数
    const badge = document.createElement('span');
    badge.className = 'hint-badge';
    badge.textContent = `${used}/${total}`;
    if (used >= total) {
      badge.classList.add('hint-badge-max');
    }
    btn.appendChild(badge);

    // 根据提示级别改变按钮颜色
    btn.classList.remove('hint-level-1', 'hint-level-2', 'hint-level-3');
    btn.classList.add(`hint-level-${Math.min(used, 3)}`);
  } else {
    btn.classList.remove('hint-level-1', 'hint-level-2', 'hint-level-3');
  }
}

// 卡关兜底提示（5分钟）——提醒玩家可以使用提示按钮
const chapterTimers = {};
function startChapterTimer(chapter) {
  if (chapterTimers[chapter]) clearTimeout(chapterTimers[chapter]);
  chapterTimers[chapter] = setTimeout(() => {
    if (!GameState.hintClicks || !GameState.hintClicks[chapter]) {
      showHint('卡住了？点击右上角的灯泡图标可以获取分级提示（最多3级，可随时打开面板回顾）。', 6000);
    }
  }, 300000);
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
  if (String(clueId).startsWith('sym-clue-')) {
    const symId = Object.keys(SYMBOL_CLUE_MAP).find(key => SYMBOL_CLUE_MAP[key] === clueId);
    if (symId) setSymbolVisualState(symId);
    updateSymbolCluesSummary();
  }
  // 如果复盘页时间线正在显示，更新揭示状态
  updateTimelineReveal();
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
  if (hasClue('ch3-timeline-puzzle')) {
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
  const toggle = document.getElementById('notepad-toggle');
  if (!panel) return;

  const isOpen = panel.classList.toggle('open');

  if (toggle) {
    toggle.style.display = isOpen ? 'none' : 'flex';
  }

  if (isOpen) {
    updateNotepadWordcount();
  }
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

// ========== 特殊符号解谜系统 v2 ==========
// 图案只负责定位旁注；玩家需要从旁注中找出目标汉字，再输入该字拼音。
const SYMBOL_MAP = {
  'sym-tree': {
    letters: 'lin', name: '木', target: '林',
    clue: '“双木并立，方可成林。”取最后一个字的读音。',
    hint2: '两个“木”合在一起形成一个新的汉字。', hint3: '目标字是“林”，拼音有3个字母。'
  },
  'sym-water': {
    letters: 'zhi', name: '水', target: '知',
    clue: '“知者乐水，取水前一字。”',
    hint2: '不要读图案“水”，要取句中“水”前面的字。', hint3: '目标字是“知”，拼音有3个字母。'
  },
  'sym-moon': {
    letters: 'xia', name: '月', target: '夏',
    clue: '“夏夜望月，取句首一字。”',
    hint2: '取整句话最前面的汉字。', hint3: '目标字是“夏”，拼音有3个字母。'
  },
  'sym-sun': {
    letters: 'zhen', name: '日', target: '真',
    clue: '“真相终会见日，取句首一字。”',
    hint2: '取整句话最前面的汉字。', hint3: '目标字是“真”，拼音有4个字母。'
  },
  'sym-eye': {
    letters: 'xiang', name: '目', target: '相',
    clue: '“目之所见未必是真相，取‘真相’后一字。”',
    hint2: '从“真相”二字中取第二个字。', hint3: '目标字是“相”，拼音有5个字母。'
  },
  'sym-fire': {
    letters: 'yan', name: '火', target: '掩',
    clue: '“怒火中烧，掩盖真相。取‘掩’的读音。”',
    hint2: '旁注明确要求取“掩”，不要读“火”。', hint3: '目标字是“掩”，拼音有3个字母。'
  },
  'sym-mountain': {
    letters: 'gai', name: '山', target: '盖',
    clue: '“山高遮目，盖棺定论。取‘盖’的读音。”',
    hint2: '旁注明确要求取“盖”，不要读“山”。', hint3: '目标字是“盖”，拼音有3个字母。'
  },
  'sym-mouth': {
    letters: 'kou', name: '口', target: '口',
    clue: '“有口难言，取句中表示器官的字。”',
    hint2: '句中表示说话器官的字就是目标。', hint3: '目标字是“口”，拼音有3个字母。'
  },
  'sym-book': {
    letters: 'ben', name: '书', target: '本',
    clue: '“书本无声，取末尾一字。”',
    hint2: '取“书本”这个词的第二个字。', hint3: '目标字是“本”，拼音有3个字母。'
  },
  'sym-heart': { letters: 'xin', name: '心', target: '心', clue: '“心事难明，取句首一字。”', hint2: '取句首字。', hint3: '目标字是“心”。' },
  'sym-knife': { letters: 'dao', name: '刀', target: '刀', clue: '“刀锋划开伪装，取句首一字。”', hint2: '取句首字。', hint3: '目标字是“刀”。' },
  'sym-lock': { letters: 'suo', name: '锁', target: '锁', clue: '“锁住秘密，取句首一字。”', hint2: '取句首字。', hint3: '目标字是“锁”。' }
};

const SYMBOL_PUZZLES = {
  puzzle1: { symbols: ['sym-tree', 'sym-water', 'sym-moon'], answer: 'linzhixia', label: '林知夏' },
  puzzle2: { symbols: ['sym-sun', 'sym-eye'], answer: 'zhenxiang', label: '真相' },
  puzzle3: { symbols: ['sym-fire', 'sym-mountain', 'sym-sun', 'sym-eye'], answer: 'yangaizhenxiang', label: '掩盖真相' }
};

const PUZZLE_ANSWERS = Object.fromEntries(
  Object.entries(SYMBOL_PUZZLES).map(([id, p]) => [id, p.answer])
);

// 符号symId到HTML中findClue注册的clueId映射
const SYMBOL_CLUE_MAP = {
  'sym-tree': 'sym-clue-1',
  'sym-water': 'sym-clue-2',
  'sym-moon': 'sym-clue-3',
  'sym-sun': 'sym-clue-4',
  'sym-book': 'sym-clue-5',
  'sym-eye': 'sym-clue-6',
  'sym-mouth': 'sym-clue-7',
  'sym-fire': 'sym-clue-8',
  'sym-mountain': 'sym-clue-9'
};

function normalizePinyin(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ü/g, 'v')
    .replace(/[^a-z]/g, '');
}

function getSymbolClueId(symId) {
  return SYMBOL_CLUE_MAP[symId] || ('sym-clue-' + String(symId).replace('sym-', ''));
}

function hasSymbolClue(symId) {
  return GameState.cluesFound.has(getSymbolClueId(symId));
}

function setSymbolVisualState(symId) {
  const info = SYMBOL_MAP[symId];
  document.querySelectorAll(`[data-symbol="${symId}"]`).forEach(el => {
    const discovered = hasSymbolClue(symId);
    const solved = GameState.symbolProgress[symId] === true;
    el.classList.toggle('locked', !discovered);
    el.classList.toggle('discovered', discovered && !solved);
    el.classList.toggle('solved', solved);
    if (solved && info) {
      el.setAttribute('data-letter', info.letters);
      el.title = `${info.name}形符号：已译读为 ${info.target} / ${info.letters}`;
      el.setAttribute('aria-label', `${info.name}形符号，已译读为${info.target}`);
    } else if (discovered) {
      el.removeAttribute('data-letter');
      el.title = `${info ? info.name : ''}形符号：打开译读卡`;
      el.setAttribute('aria-label', `${info ? info.name : ''}形符号，待译读`);
    } else {
      el.removeAttribute('data-letter');
      el.title = '尚未找到这个符号的旁注';
      el.setAttribute('aria-label', '尚未找到旁注的符号');
    }
  });
}

function onSymbolClick(symId) {
  const info = SYMBOL_MAP[symId];
  if (!info) return;

  if (!hasSymbolClue(symId)) {
    showToast('这个符号只有图案，还缺少对应旁注。继续调查页面角落。');
    AudioSys.playError();
    return;
  }

  openSymbolDecoder(symId);
}

function openSymbolDecoder(symId) {
  const info = SYMBOL_MAP[symId];
  if (!info || !hasSymbolClue(symId)) return;

  const solved = GameState.symbolProgress[symId] === true;
  const attempts = Number(GameState.symbolAttempts[symId] || 0);
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  if (!title || !body) return;

  title.textContent = `符号译读：${info.name}形符号`;
  body.innerHTML = `
    <div class="symbol-decoder" data-symbol-id="${symId}">
      <div class="symbol-decoder-rule">
        <strong>译读规则</strong>
        <span>图案只是旁注的位置标记，不要直接读图案名称。先按取字提示找到汉字，再输入该字拼音（不带声调）。</span>
      </div>
      <div class="symbol-decoder-clue">
        <div class="symbol-decoder-clue-label">已收录旁注</div>
        <blockquote>${info.clue}</blockquote>
      </div>
      ${solved ? `
        <div class="symbol-decoder-solved" role="status">
          <span>✓ 已完成译读</span>
          <strong>${info.target} → ${info.letters.toUpperCase()}</strong>
        </div>
        <div class="symbol-decoder-actions"><button class="btn btn-primary" onclick="closeModal('modal-generic')">返回调查</button></div>
      ` : `
        <label class="symbol-decoder-input-label" for="symbol-decoder-input">推断出的拼音</label>
        <div class="symbol-decoder-input-row">
          <input id="symbol-decoder-input" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="10" placeholder="例如：lin" aria-describedby="symbol-decoder-feedback">
          <button class="btn btn-primary" onclick="verifySymbolSyllable('${symId}')">验证音节</button>
        </div>
        <div id="symbol-decoder-feedback" class="symbol-decoder-feedback" aria-live="polite">${attempts > 0 ? getSymbolAttemptHint(symId, attempts) : '先找出旁注要求提取的汉字。'}</div>
        <div class="symbol-decoder-actions">
          <button class="btn btn-ghost" onclick="showSymbolDecodeHint('${symId}')">逐步提示</button>
          <button class="btn btn-ghost" onclick="closeModal('modal-generic')">稍后再解</button>
        </div>
      `}
    </div>
  `;
  openModal('modal-generic');

  const input = document.getElementById('symbol-decoder-input');
  if (input) {
    setTimeout(() => input.focus(), 30);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        verifySymbolSyllable(symId);
      }
    });
  }
}

function getSymbolAttemptHint(symId, attempts) {
  const info = SYMBOL_MAP[symId];
  if (!info) return '';
  if (attempts >= 3) return info.hint3;
  if (attempts >= 2) return info.hint2;
  return '答案不在图案名称里，请重新检查旁注的取字要求。';
}

function showSymbolDecodeHint(symId) {
  const info = SYMBOL_MAP[symId];
  if (!info) return;
  const current = Number(GameState.symbolAttempts[symId] || 0);
  GameState.symbolAttempts[symId] = Math.min(current + 1, 3);
  const feedback = document.getElementById('symbol-decoder-feedback');
  if (feedback) {
    feedback.textContent = getSymbolAttemptHint(symId, GameState.symbolAttempts[symId]);
    feedback.className = 'symbol-decoder-feedback hint';
  }
  saveGame();
}

function verifySymbolSyllable(symId) {
  const info = SYMBOL_MAP[symId];
  const input = document.getElementById('symbol-decoder-input');
  const feedback = document.getElementById('symbol-decoder-feedback');
  if (!info || !input || !feedback) return;

  const value = normalizePinyin(input.value);
  if (!value) {
    feedback.textContent = '请先输入你推断出的拼音。';
    feedback.className = 'symbol-decoder-feedback error';
    input.focus();
    return;
  }

  if (value === info.letters) {
    GameState.symbolProgress[symId] = true;
    GameState.symbolAttempts[symId] = Number(GameState.symbolAttempts[symId] || 0);
    setSymbolVisualState(symId);
    updatePuzzleInputs();
    updateSymbolCluesSummary();
    saveGame();
    AudioSys.playUnlock();
    feedback.innerHTML = `✓ 译读正确：<strong>${info.target} → ${info.letters.toUpperCase()}</strong>`;
    feedback.className = 'symbol-decoder-feedback success';
    input.disabled = true;
    const verifyBtn = input.parentElement ? input.parentElement.querySelector('button') : null;
    if (verifyBtn) verifyBtn.disabled = true;
    showToast(`符号译读完成：${info.target} → ${info.letters.toUpperCase()}`, 3000);
    setTimeout(() => closeModal('modal-generic'), 850);
    return;
  }

  GameState.symbolAttempts[symId] = Math.min(Number(GameState.symbolAttempts[symId] || 0) + 1, 3);
  feedback.textContent = getSymbolAttemptHint(symId, GameState.symbolAttempts[symId]);
  feedback.className = 'symbol-decoder-feedback error';
  input.classList.remove('symbol-input-shake');
  void input.offsetWidth;
  input.classList.add('symbol-input-shake');
  AudioSys.playError();
  saveGame();
}

function ensurePuzzleBoxCount(puzzleId, count) {
  const area = document.getElementById(`${puzzleId}-input`);
  if (!area) return;
  while (area.children.length < count) {
    const box = document.createElement('div');
    box.className = 'symbol-input-box';
    box.dataset.idx = String(area.children.length);
    area.appendChild(box);
  }
  while (area.children.length > count) {
    area.removeChild(area.lastElementChild);
  }
}

function updatePuzzleInputs() {
  Object.entries(SYMBOL_PUZZLES).forEach(([puzzleId, puzzle]) => {
    ensurePuzzleBoxCount(puzzleId, puzzle.answer.length);
    const inputArea = document.getElementById(`${puzzleId}-input`);
    if (!inputArea) return;

    let letters = '';
    puzzle.symbols.forEach(sym => {
      if (GameState.symbolProgress[sym]) letters += SYMBOL_MAP[sym].letters;
    });

    inputArea.querySelectorAll('.symbol-input-box').forEach((box, index) => {
      box.textContent = index < letters.length ? letters[index] : '';
      box.classList.toggle('correct', index < letters.length);
    });

    const input = document.getElementById(`${puzzleId}-answer`);
    if (input && GameState.puzzlesSolved[puzzleId]) {
      input.value = puzzle.answer;
      input.disabled = true;
      input.style.borderColor = 'var(--success)';
      const btn = input.parentElement ? input.parentElement.querySelector('button') : null;
      if (btn) btn.disabled = true;
    }
  });
}

function updateSymbolCluesSummary() {
  const summary = document.getElementById('symbol-clues-summary');
  if (!summary) return;

  const discovered = Object.keys(SYMBOL_CLUE_MAP).filter(hasSymbolClue);
  if (discovered.length === 0) {
    summary.innerHTML = '<p>你在调查过程中发现的符号旁注会收录在这里。</p><p style="opacity:0.5;">（目前还没有收录旁注）</p>';
    return;
  }

  let html = '<p>符号图案只是定位标记。请根据旁注取字，再输入拼音完成译读：</p><div class="symbol-summary-list">';
  discovered.forEach(symId => {
    const info = SYMBOL_MAP[symId];
    const solved = GameState.symbolProgress[symId] === true;
    html += `
      <button class="symbol-summary-item ${solved ? 'solved' : 'pending'}" onclick="openSymbolDecoder('${symId}')">
        <span class="symbol-summary-name">${info.name}形符号</span>
        <span class="symbol-summary-clue">${info.clue}</span>
        <span class="symbol-summary-status">${solved ? `✓ ${info.target} / ${info.letters.toUpperCase()}` : '待译读'}</span>
      </button>
    `;
  });
  summary.innerHTML = html + '</div>';
}

function getMissingPuzzleSymbols(puzzleId) {
  const puzzle = SYMBOL_PUZZLES[puzzleId];
  if (!puzzle) return [];
  return puzzle.symbols.filter(symId => GameState.symbolProgress[symId] !== true);
}

function checkPuzzle(puzzleId) {
  const puzzle = SYMBOL_PUZZLES[puzzleId];
  const input = document.getElementById(`${puzzleId}-answer`);
  if (!puzzle || !input || GameState.puzzlesSolved[puzzleId]) return;

  const missing = getMissingPuzzleSymbols(puzzleId);
  if (missing.length) {
    const labels = missing.map(symId => SYMBOL_MAP[symId].name).join('、');
    showToast(`先完成这些符号的译读：${labels}`, 3500);
    const firstDiscovered = missing.find(hasSymbolClue);
    if (firstDiscovered) openSymbolDecoder(firstDiscovered);
    else AudioSys.playError();
    return;
  }

  const value = normalizePinyin(input.value);
  if (value === puzzle.answer) {
    GameState.puzzlesSolved[puzzleId] = true;
    input.value = puzzle.answer;
    input.style.borderColor = 'var(--success)';
    input.disabled = true;
    const btn = input.parentElement ? input.parentElement.querySelector('button') : null;
    if (btn) btn.disabled = true;
    AudioSys.playUnlock();
    showToast(`谜题破解成功：${puzzle.label}`, 3000);

    const puzzleClues = {
      puzzle1: ['ch5-puzzle1', '符号谜题一：被抹去的名字', '通过取字旁注与拼音译读，确认被抹去的名字是林知夏', 'real'],
      puzzle2: ['ch5-puzzle2', '符号谜题二：隐藏的真相', '日与目的旁注组合成“真相”', 'real'],
      puzzle3: ['ch5-puzzle3', '符号谜题三：被掩盖的事实', '火、山、日、目的旁注依次组合成“掩盖真相”', 'real']
    };
    const clue = puzzleClues[puzzleId];
    if (clue && !GameState.cluesFound.has(clue[0])) findClue(...clue);
    else saveGame();
    return;
  }

  GameState.puzzleAttempts[puzzleId] = Number(GameState.puzzleAttempts[puzzleId] || 0) + 1;
  input.style.borderColor = 'var(--danger)';
  input.classList.remove('symbol-input-shake');
  void input.offsetWidth;
  input.classList.add('symbol-input-shake');
  AudioSys.playError();
  if (GameState.puzzleAttempts[puzzleId] >= 2) {
    showToast('音节都已译读正确；请按画面中的符号顺序连续拼接，不加空格或声调。', 4000);
  } else {
    showToast('组合不正确。检查符号顺序，以及是否漏写了某个音节。', 3500);
  }
  setTimeout(() => { input.style.borderColor = ''; }, 650);
  saveGame();
}

function checkChapter1Puzzle() {
  const input = document.getElementById('ch1-puzzle-answer');
  if (!input || GameState.puzzlesSolved.ch1) return;
  const required = SYMBOL_PUZZLES.puzzle1.symbols;
  const missing = required.filter(symId => GameState.symbolProgress[symId] !== true);
  if (missing.length) {
    const labels = missing.map(symId => SYMBOL_MAP[symId].name).join('、');
    showToast(`请先打开符号译读卡，完成：${labels}`, 3500);
    const first = missing.find(hasSymbolClue);
    if (first) openSymbolDecoder(first);
    return;
  }

  if (normalizePinyin(input.value) === SYMBOL_PUZZLES.puzzle1.answer) {
    GameState.puzzlesSolved.ch1 = true;
    input.value = SYMBOL_PUZZLES.puzzle1.answer;
    input.disabled = true;
    input.style.borderColor = 'var(--success)';
    const btn = input.parentElement ? input.parentElement.querySelector('button') : null;
    if (btn) btn.disabled = true;
    AudioSys.playUnlock();
    showToast('你通过旁注译读确认了被抹去的名字：林知夏！', 3500);
    if (!GameState.cluesFound.has('ch1-puzzle-solved')) {
      findClue('ch1-puzzle-solved', '符号解谜完成', '通过取字旁注与拼音组合确认了名字：林知夏', 'real');
    } else saveGame();
  } else {
    AudioSys.playError();
    showToast('组合不正确。按木、水、月的画面顺序拼接三个已验证音节。', 3500);
    input.classList.remove('symbol-input-shake');
    void input.offsetWidth;
    input.classList.add('symbol-input-shake');
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

// ========== 时间线重建解谜 ==========
let timelineSelection = [];

function getTimelineLabel(order) {
  const el = document.querySelector(`.timeline-card[data-order="${order}"]`);
  if (el) {
    const m = (el.textContent || '').match(/事件([A-E])/);
    if (m) return m[1];
  }
  return order;
}

// 更新所有卡片上的序号徽标
function updateTimelineBadges() {
  document.querySelectorAll('.timeline-card').forEach(card => {
    const badge = card.querySelector('.timeline-badge');
    if (badge) badge.remove();
  });
  timelineSelection.forEach((order, idx) => {
    const card = document.querySelector(`.timeline-card[data-order="${order}"]`);
    if (card) {
      const badge = document.createElement('span');
      badge.className = 'timeline-badge';
      badge.textContent = (idx + 1);
      badge.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--accent-blue);color:#fff;font-size:0.75rem;font-weight:700;margin-right:8px;flex-shrink:0;';
      card.insertBefore(badge, card.firstChild);
    }
  });
}

function selectTimelineCard(card) {
  const order = card.getAttribute('data-order');

  if (card.classList.contains('selected')) {
    // 允许取消已选中的卡片
    card.classList.remove('selected');
    const idx = timelineSelection.indexOf(order);
    if (idx > -1) {
      timelineSelection.splice(idx, 1);
    }
  } else {
    // 选中卡片
    card.classList.add('selected');
    timelineSelection.push(order);
  }

  // 统一刷新所有卡片的视觉状态和序号徽标
  updateTimelineBadges();
  document.querySelectorAll('.timeline-card').forEach(c => {
    if (c.classList.contains('selected')) {
      c.style.borderColor = 'var(--accent-blue)';
      c.style.background = 'rgba(58,90,124,0.08)';
    } else {
      c.style.borderColor = 'var(--border)';
      c.style.background = '#fff';
    }
  });

  // 显示文本同时带序号和事件字母，如 ①B → ②D → ③A
  const circled = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];
  const orderText = timelineSelection.map((o, i) => {
    const label = getTimelineLabel(o);
    return (circled[i] || (i + 1) + '.') + label;
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
    const badge = card.querySelector('.timeline-badge');
    if (badge) badge.remove();
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
    GameState.puzzlesSolved['timeline'] = true;
    saveGame();
  } else {
    if (result) {
      result.style.display = 'block';
      result.style.background = 'rgba(160,80,80,0.08)';
      result.style.color = 'var(--danger)';
      result.textContent = '顺序不对。再想想那晚发生的事。';
    }
    AudioSys.playError();
    showToast('顺序不正确，再想想...');
  }
}

// ========== 碎纸重组解谜 ==========
let shredSelection = [];

function selectShredPiece(piece) {
  const order = piece.getAttribute('data-order');

  if (piece.classList.contains('selected')) {
    // 取消选择：移除该碎片
    piece.classList.remove('selected');
    piece.style.borderColor = 'rgba(192,200,208,0.2)';
    piece.style.background = 'rgba(0,0,0,0.3)';
    shredSelection = shredSelection.filter(o => o !== order);
  } else {
    // 选择：添加到末尾
    piece.classList.add('selected');
    piece.style.borderColor = 'var(--accent-blue)';
    piece.style.background = 'rgba(58,90,124,0.2)';
    shredSelection.push(order);
  }

  // 按点击顺序显示文本
  const textEl = document.getElementById('shred-text');
  if (textEl) {
    if (shredSelection.length === 0) {
      textEl.textContent = '（请点击碎片按正确顺序排列，再次点击可取消）';
    } else {
      const texts = [];
      shredSelection.forEach(ord => {
        const el = document.querySelector('#shred-puzzle .shred-piece[data-order="' + ord + '"]');
        if (el) {
          const contentDiv = el.querySelector('div');
          if (contentDiv) texts.push(contentDiv.textContent);
        }
      });
      textEl.textContent = texts.join('') || '（请点击碎片按正确顺序排列，再次点击可取消）';
    }
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
  if (textEl) textEl.textContent = '（请点击碎片按正确顺序排列，再次点击可取消）';
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
  
  const correct = ['7', '3', '9', '1', '5'];
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
          <span style="font-style:italic;">"林知夏同学对不起那晚的事情是我们错了"</span><br><br>
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
      result.textContent = '顺序不对。仔细看看碎片上的内容。';
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
  
  if (code === '0333') {
    // 正确答案：林知夏的学号后四位（20220333 → 0333）
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
    findClue('ch3-diary','日记残页：林知夏的视角','通过正确密码（0333，林知夏学号后四位）打开档案柜，发现林知夏21:45仍在教室且听到走廊脚步声','real');
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
        <span style="opacity:0.7;">这份文件似乎有些不对劲。</span>
      </div>
    `;
    AudioSys.playError();
    showToast('这份文件看起来太完美了...', 3000);
    findClue('ch3-fake-application','伪造的评优申请','输入0328打开柜子，发现一份过于完美的评优申请表，实则是班长的掩护','fake');
  } else {
    result.style.display = 'block';
    result.style.background = 'rgba(160,80,80,0.1)';
    result.style.color = 'var(--danger)';
    result.innerHTML = '<span style="color:var(--danger);font-weight:700;">✗</span> 密码错误。';
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
  '--..': 'Z',
  '-----': '0', '.----': '1', '..---': '2', '...--': '3', '....-': '4',
  '.....': '5', '-....': '6', '--...': '7', '---..': '8', '----.': '9'
};

const MORSE_PUZZLE_SEQUENCE = '-... .- -. --.. .... .- -. --.';
const MORSE_PUZZLE_ANSWER = 'BANZHANG';

function normalizeMorseSequence(morseText) {
  return String(morseText || '')
    .normalize('NFKC')
    .replace(/[·•]/g, '.')
    .replace(/[—–−]/g, '-')
    .replace(/\s*[/|]\s*/g, ' ')
    .trim();
}

function decodeMorse(morseText) {
  const normalized = normalizeMorseSequence(morseText);
  if (!normalized) return '';
  return normalized.split(/\s+/).map(code => MORSE_CODE[code] || '?').join('');
}

function normalizeMorseAnswer(answer) {
  return String(answer || '')
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function checkMorsePuzzle() {
  const input = document.getElementById('morse-input');
  const result = document.getElementById('morse-result');
  if (!input || !result) return;

  const decodedTarget = decodeMorse(MORSE_PUZZLE_SEQUENCE);
  const expectedAnswer = decodedTarget === MORSE_PUZZLE_ANSWER
    ? MORSE_PUZZLE_ANSWER
    : decodedTarget;
  const val = normalizeMorseAnswer(input.value);

  if (val === expectedAnswer) {
    result.style.display = 'block';
    result.style.background = 'rgba(74,124,89,0.1)';
    result.style.color = 'var(--success)';
    result.innerHTML = `
      <div style="font-weight:600;margin-bottom:8px;"><span style="color:var(--success);font-weight:700;">✓</span> 解码成功！</div>
      <div style="line-height:1.8;">
        摩斯密码解码结果：<strong>${MORSE_PUZZLE_ANSWER}</strong>（班长）<br><br>
        这是值班老师在匆忙中记录的暗号。他在巡查时发现了异常，
        但迫于某种压力，只能用这种方式留下线索...
      </div>
    `;
    input.value = MORSE_PUZZLE_ANSWER;
    input.style.borderColor = 'var(--success)';
    AudioSys.playUnlock();
    showToast('摩斯密码破解成功！', 3000);
    findClue('ch3-morse','摩斯密码：班长的暗号','破解值班老师留下的摩斯密码，发现直指班长的暗号','real');
    GameState.puzzlesSolved['morse'] = true;
  } else {
    result.style.display = 'block';
    result.style.background = 'rgba(160,80,80,0.1)';
    result.style.color = 'var(--danger)';
    result.textContent = '解码结果不对。请按密码表逐组解码，每个斜杠代表一个字母。';
    input.style.borderColor = 'var(--danger)';
    AudioSys.playError();
    input.style.animation = 'shake 0.4s';
    setTimeout(() => {
      input.style.animation = '';
      input.style.borderColor = '';
    }, 500);
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
  'banzhang0310': {
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
    const alreadyFound = GameState.cluesFound.has(user.clue.id);
    user.found = true;
    if (resultArea) {
      resultArea.style.display = 'block';
      resultArea.innerHTML = `
        <div style="font-weight:600;margin-bottom:12px;color:var(--success);"><span style="color:var(--success);font-weight:700;">✓</span> ${alreadyFound ? '重新打开' : '发现'}用户：${user.name}</div>
        <div style="font-size:0.85rem;line-height:1.8;">${user.content}</div>
      `;
    }
    if (hintArea) hintArea.style.display = 'none';
    if (alreadyFound) {
      AudioSys.playClick();
      showToast(`已重新打开 ${user.name} 的隐藏记录`);
      saveGame();
      return;
    }
    AudioSys.playUnlock();
    showToast(`发现 ${user.name} 的隐藏记录！`, 3000);
    findClue(user.clue.id, user.clue.title, user.clue.desc, user.clue.type);
    
    // 如果找到了班长和林知夏，解锁额外线索
    if (GameState.cluesFound.has(FORUM_USERS['banzhang0310'].clue.id) && GameState.cluesFound.has(FORUM_USERS['linzhixia0333'].clue.id)) {
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
    result.textContent = '密码错误。';
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
      <div style="font-size:0.78rem;color:#666;margin-top:8px;">尝试不同的偏移量...</div>
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

// ========== 完成度评估系统 ==========
const KEY_CLUES = [
  'ch1-contra-time', 'ch1-witness', 'ch1-backup', 'ch1-puzzle-solved',
  'ch2-contra-a', 'ch2-contra-b', 'ch2-contra-c', 'ch2-chat1', 'ch2-chat2', 'ch2-draft',
  'ch2-user-lin', 'ch2-user-ban', 'ch2-time-contra',
  'ch3-monitor-log', 'ch3-sensor', 'ch3-diary', 'ch3-morse', 'ch3-sensor-decode',
  'ch3-timeline-puzzle',
  'ch4-chat1', 'ch4-chat2', 'ch4-leak1', 'ch4-leak2', 'ch4-apology', 'ch4-hidden-note'
];

function getCompletionScore() {
  const keyFound = KEY_CLUES.filter(id => GameState.cluesFound.has(id)).length;
  const puzzlesSolved = Object.keys(GameState.puzzlesSolved).length;
  const totalClues = GameState.cluesFound.size;
  return {
    keyClues: keyFound,
    totalKeyClues: KEY_CLUES.length,
    puzzles: puzzlesSolved,
    totalClues: totalClues,
    score: keyFound + puzzlesSolved * 2,
    maxScore: KEY_CLUES.length + 10 * 2
  };
}

// ========== 最终答案 ==========
function selectAnswer(qid, ans, evt) {
  GameState.choices[qid] = ans;
  // 只清除当前页面内的选择按钮，避免影响其他页面的按钮状态
  const currentPage = document.querySelector('.page.active');
  if (currentPage) {
    currentPage.querySelectorAll('.choice-btn').forEach(btn => {
      btn.classList.remove('selected');
    });
  }
  if (evt && evt.currentTarget) {
    evt.currentTarget.classList.add('selected');
  }
  saveGame();
}

function checkFinalAnswer() {
  const ans = GameState.choices['q1'];
  if (!ans) {
    showToast('请先选择一个答案');
    return;
  }

  const completion = getCompletionScore();

  if (ans === 'c') {
    // 答案正确，但需要检查完成度
    if (completion.keyClues >= 12 && completion.puzzles >= 5) {
      // 完成度足够，进入好结局
      GameState.ending = 'good';
      AudioSys.playDramatic();
      showPage('page-ending-good');
      // 在好结局页面显示完成度信息
      setTimeout(() => {
        const info = document.getElementById('good-stats');
        if (info) {
          const isPerfect = completion.keyClues === completion.totalKeyClues;
          info.innerHTML = `
            <div style="margin-top:20px;padding:16px;background:rgba(74,124,89,0.08);border-radius:8px;font-size:0.85rem;line-height:1.8;">
              <strong>调查完成度</strong><br>
              关键线索：${completion.keyClues} / ${completion.totalKeyClues}<br>
              谜题破解：${completion.puzzles}<br>
              总线索发现：${completion.totalClues}${isPerfect ? '<br><br><span style="color:var(--success);">★ 完美调查 — 你发现了所有隐藏真相</span>' : '<br><br><span style="color:var(--text-muted);">还有一些线索等待发现...</span>'}
            </div>
          `;
        }
      }, 500);
    } else {
      // 答案对了但调查不充分，进入"不完整"结局
      GameState.ending = 'incomplete';
      AudioSys.playDramatic();
      showPage('page-ending-incomplete');
      // 在不完整结局页面显示完成度信息
      setTimeout(() => {
        const info = document.getElementById('incomplete-stats');
        if (info) {
          info.innerHTML = `
            <div style="margin-top:20px;padding:16px;background:rgba(201,162,39,0.08);border-radius:8px;font-size:0.85rem;line-height:1.8;">
              <strong>调查完成度</strong><br>
              关键线索：${completion.keyClues} / ${completion.totalKeyClues}<br>
              谜题破解：${completion.puzzles}<br>
              总线索发现：${completion.totalClues}<br><br>
              <span style="color:var(--text-muted);">你虽然猜对了答案，但错过了许多隐藏的真相。<br>那些未被发现的线索中，藏着更完整的故事...</span>
            </div>
          `;
        }
      }, 500);
    }
  } else {
    GameState.ending = 'bad';
    AudioSys.playError();
    showPage('page-ending-bad');
    // 在坏结局页面也显示完成度信息
    setTimeout(() => {
      const info = document.getElementById('bad-stats');
      if (info) {
        info.innerHTML = `
          <div style="margin-top:20px;padding:16px;background:rgba(160,80,80,0.08);border-radius:8px;font-size:0.85rem;line-height:1.8;">
            <strong>调查完成度</strong><br>
            关键线索：${completion.keyClues} / ${completion.totalKeyClues}<br>
            谜题破解：${completion.puzzles}<br>
            总线索发现：${completion.totalClues}<br><br>
            <span style="color:var(--text-muted);">你选择了错误的答案。重新调查，收集更多证据，也许能看到不同的结局...</span>
          </div>
        `;
      }
    }, 500);
  }
  saveGame();
}

function goToLogicCheck() {
  const missing = ['puzzle1','puzzle2','puzzle3'].filter(id => GameState.puzzlesSolved[id] !== true);
  if (missing.length) {
    showToast(`请先完成最终符号谜题：${missing.map(id => id.replace('puzzle','第') + '题').join('、')}`, 3500);
    return;
  }
  showPage('page-ch5-logic');
}

function goToEnding() {
  showPage('page-ch5-review');
}

// ========== 逻辑验证系统 ==========

function selectLogicAnswer(qid, ans) {
  if (!GameState.logicAnswers) GameState.logicAnswers = {};
  GameState.logicAnswers[qid] = ans;
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
  saveGame();
}

function checkLogicAnswers() {
  const correct = {
    'q1': 'c',  // 林知夏，学号20220333后四位为0333
    'q2': 'b',  // 人为删除/篡改
    'q3': 'b',  // 班长
    'q4': 'b'   // 为了班级评优资格和个人市三好学生评选
  };
  
  const answers = GameState.logicAnswers || {};
  let allCorrect = true;
  let wrongQuestions = [];
  
  for (let qid in correct) {
    if (answers[qid] !== correct[qid]) {
      allCorrect = false;
      wrongQuestions.push(qid);
    }
  }
  
  const resultDiv = document.getElementById('logic-result');
  if (!resultDiv) return;
  
  if (Object.keys(answers).length < 4) {
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

  // 摩斯谜题：按 Enter 直接验证
  const morseInput = document.getElementById('morse-input');
  if (morseInput) {
    morseInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        checkMorsePuzzle();
      }
    });
  }

  // 初始化导航
  updateNavState();
  updateClueCounter();
  checkLogicProgress();
  updatePuzzleInputs();
  updateSymbolCluesSummary();

  // 恢复提示按钮状态
  updateHintButtonState(currentChapterHint);

  // 恢复逻辑验证页已选答案的按钮状态
  if (GameState.logicAnswers) {
    Object.keys(GameState.logicAnswers).forEach(qid => {
      const ans = GameState.logicAnswers[qid];
      document.querySelectorAll(`#page-ch5-logic .choice-btn`).forEach(btn => {
        const onclick = btn.getAttribute('onclick') || '';
        if (onclick.includes(`'${qid}','${ans}'`)) {
          btn.classList.add('selected');
        }
      });
    });
  }

  // 恢复最终答案页已选答案的按钮状态
  if (GameState.choices && GameState.choices['q1']) {
    const ans = GameState.choices['q1'];
    document.querySelectorAll(`#page-ch5-review .choice-btn`).forEach(btn => {
      const onclick = btn.getAttribute('onclick') || '';
      if (onclick.includes(`'q1','${ans}'`)) {
        btn.classList.add('selected');
      }
    });
  }

  // 恢复符号的“未发现 / 已发现待译读 / 已译读”三种状态
  Object.keys(SYMBOL_MAP).forEach(setSymbolVisualState);

  // 符号与符号旁注支持键盘操作
  document.querySelectorAll('[data-symbol]').forEach(el => {
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        el.click();
      }
    });
  });
  document.querySelectorAll('[onclick*="findClue(\'sym-clue-"]').forEach(el => {
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        el.click();
      }
    });
  });

  // 常用输入框支持回车提交，避免手机软键盘无法继续
  const enterBindings = [
    ['archive-search-input', searchArchive],
    ['forum-user-search', searchForumUser],
    ['hidden-code-input', checkHiddenCode],
    ['ch1-puzzle-answer', checkChapter1Puzzle],
    ['puzzle1-answer', () => checkPuzzle('puzzle1')],
    ['puzzle2-answer', () => checkPuzzle('puzzle2')],
    ['puzzle3-answer', () => checkPuzzle('puzzle3')],
    ['decoder-shift', decodeSensorData]
  ];
  enterBindings.forEach(([id, handler]) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.enterBound === '1') return;
    el.dataset.enterBound = '1';
    el.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handler();
      }
    });
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
    const toggle = document.getElementById('notepad-toggle');
    const notepadLink = document.querySelector('.notepad-link');
    if (panel && panel.classList.contains('open')) {
      if (!panel.contains(e.target)
          && (!notepadLink || !notepadLink.contains(e.target))
          && (!toggle || !toggle.contains(e.target))) {
        panel.classList.remove('open');
        if (toggle) toggle.style.display = 'flex';
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
    // H - 获取提示 / 切换提示面板
    if (e.key === 'h' || e.key === 'H') {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        onHintButtonClick();
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
    // ESC - 关闭便签纸或提示面板
    if (e.key === 'Escape') {
      const panel = document.getElementById('notepad-panel');
      const toggle = document.getElementById('notepad-toggle');
      if (panel && panel.classList.contains('open')) {
        panel.classList.remove('open');
        if (toggle) toggle.style.display = 'flex';
      }
      // 关闭提示面板
      const hintPanel = document.getElementById('hint-panel');
      if (hintPanel && hintPanel.classList.contains('open')) {
        toggleHintPanel(false);
      }
      const genericModal = document.getElementById('modal-generic');
      if (genericModal && genericModal.classList.contains('active')) {
        closeModal('modal-generic');
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
window.openSymbolDecoder = openSymbolDecoder;
window.verifySymbolSyllable = verifySymbolSyllable;
window.showSymbolDecodeHint = showSymbolDecodeHint;
window.checkPuzzle = checkPuzzle;
window.checkChapter1Puzzle = checkChapter1Puzzle;
window.openModal = openModal;
window.closeModal = closeModal;
window.showToast = showToast;
window.saveGame = saveGame;
window.resetGame = resetGame;
window.showSupportPaywall = showSupportPaywall;
window.maybeShowSupportPaywall = maybeShowSupportPaywall;
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
window.getCompletionScore = getCompletionScore;
window.goToLogicCheck = goToLogicCheck;
window.selectLogicAnswer = selectLogicAnswer;
window.checkLogicAnswers = checkLogicAnswers;
window.updateHintButtonState = updateHintButtonState;
window.toggleHintPanel = toggleHintPanel;
window.onHintButtonClick = onHintButtonClick;
window.renderHintPanel = renderHintPanel;
window.updateTimelineReveal = updateTimelineReveal;
window.GameState = GameState;
