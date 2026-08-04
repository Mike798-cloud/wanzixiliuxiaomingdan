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
  hintClicks: {},
  timeInChapter: {},
  choices: {},
  logicAnswers: {},
  ending: null,
  currentPage: 'page-home',
  forumUsersFound: {},
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
function saveGame(showMessage = false) {
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
    hintClicks: GameState.hintClicks,
    choices: GameState.choices,
    logicAnswers: GameState.logicAnswers,
    ending: GameState.ending,
    currentPage: GameState.currentPage,
    forumUsersFound: GameState.forumUsersFound,
    timestamp: Date.now()
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    GameState._lastSave = Date.now();
    if (showMessage) showToast('进度已保存');
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
    GameState.hintClicks = data.hintClicks || {};
    GameState.choices = data.choices || {};
    GameState.logicAnswers = data.logicAnswers || {};
    GameState.ending = data.ending || null;
    GameState.currentPage = data.currentPage || '';
    GameState.forumUsersFound = data.forumUsersFound || {};
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
    saveGame(false);
  }
}, 30000);
// ========== 页面切换系统 ==========
// 需要门控的页面及其访问条件
const PAGE_GATES = {
  'page-ch5-truth': () => GameState.puzzlesSolved['logic-verify'] === true,
  'page-ch5-logic': () => Object.keys(GameState.puzzlesSolved).length >= 4,
  'page-ch5-puzzle': () => GameState.cluesFound.size >= 5
};

function requiredChapterForPage(pageId) {
  const match = String(pageId || '').match(/^page-ch(\d+)/);
  return match ? Number(match[1]) : 0;
}

function showPage(pageId, options = {}) {
  const requiredChapter = requiredChapterForPage(pageId);
  if (!options.bypassChapterGate && requiredChapter > GameState.currentChapter) {
    const chapterNames = ['一', '二', '三', '四', '五'];
    if (requiredChapter === 1) {
      showToast('请先点击首页的“开始调查”进入第一章');
    } else {
      const previous = requiredChapter - 1;
      showToast(`请先完成第${chapterNames[previous - 1]}章，再进入第${chapterNames[requiredChapter - 1]}章`);
    }
    return false;
  }
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
    return false;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(pageId);
  if (target) {
    target.classList.add('active');
    window.scrollTo(0, 0);
    GameState.unlockedPages.add(pageId);
    GameState.currentPage = pageId;
    updateNavState();
    if (typeof updateNavHighlight === 'function') updateNavHighlight(pageId);
    if (options.hint) showHint(options.hint);
    if (!options.skipSave) saveGame(false);
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
    return true;
  }
  return false;
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

  document.querySelectorAll('.header-nav a[data-nav]').forEach(a => {
    const target = a.getAttribute('data-nav');
    const required = requiredChapterForPage(target);
    const accessible = !required || required <= GameState.currentChapter;
    a.classList.toggle('locked', !accessible);
    a.setAttribute('aria-disabled', accessible ? 'false' : 'true');
    a.style.pointerEvents = accessible ? '' : 'none';
    a.style.opacity = accessible ? '' : '0.42';
    if (!accessible) a.title = `完成前一章节后解锁`;
    else a.removeAttribute('title');
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
    GameState.currentChapter = 1;
    showPage('page-ch1-main', { bypassChapterGate: true });
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
    GameState.currentChapter = chapter;
    showPage(pageMap[chapter], { bypassChapterGate: true });
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
      { id: 'ch1-puzzle-solved', name: '符号谜题', hint1: '页面上有一个符号谜题等待破解', hint2: '需要找到木、水、月三个符号对应的拼音线索，然后组合输入', hint3: '木=lin，水=zhi，月=xia，组合输入linzhixia即可破解' }
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
      { id: 'ch3-sensor-decode', name: '传感器解码', hint1: '传感器数据被加密了', hint2: '这是凯撒密码，需要找到正确的偏移量', hint3: '凯撒密码偏移量为3，解码后为THE LOG WAS ALTERED' }
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
      { id: 'ch5-puzzle1', name: '符号谜题一', hint1: '第一个符号谜题还没解开', hint2: '用之前找到的符号拼音拼合：木+水+月', hint3: '答案是linzhixia（林知夏）' },
      { id: 'ch5-puzzle2', name: '符号谜题二', hint1: '第二个符号谜题还没解开', hint2: '用日+目的拼音拼合', hint3: '答案是zhenxiang（真相）' },
      { id: 'ch5-puzzle3', name: '符号谜题三', hint1: '第三个符号谜题还没解开', hint2: '用目+火+山的拼音拼合', hint3: '答案是xiangyangai（向阳爱）' },
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
  const levelText = `[提示 ${currentLevel + 1}/${maxLevel} · ${levelLabel}] `;

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
    timeline: `[时间线整理]\n18:00 - \n19:30 - \n21:00 - \n21:30 - \n21:45 - \n22:00 - \n\n待验证：\n`,
    clues: `[线索清单]\n\n真实线索：\n1. \n2. \n\n虚假线索：\n1. \n2. \n\n存疑：\n1. \n`,
    suspects: `[嫌疑人分析]\n\n班长：\n- 动机：\n- 疑点：\n\n陈雪：\n- 动机：\n- 疑点：\n\n其他人：\n`,
    symbols: `[符号线索记录]\n\n[木] 木 = ?\n[水] 水 = ?\n[月] 月 = ?\n[日] 日 = ?\n[目] 目 = ?\n[火] 火 = ?\n[山] 山 = ?\n[口] 口 = ?\n[心] 心 = ?\n[本] 本 = ?\n[刀] 刀 = ?\n[锁] 锁 = ?\n`,
    evidence: `[证据链整理]\n\n直接证据：\n1. \n\n间接证据：\n1. \n\n矛盾点：\n1. \n`
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
  'sym-tree': { letters: 'lin', hint: '一棵树，独自立在旷野上。', name: '木' },
  'sym-water': { letters: 'zhi', hint: '水，至柔至静。', name: '水' },
  'sym-moon': { letters: 'xia', hint: '月光下的夏夜。', name: '月' },
  'sym-sun': { letters: 'zhen', hint: '日光所及之处。', name: '日' },
  'sym-eye': { letters: 'xiang', hint: '目之所见。', name: '目' },
  'sym-fire': { letters: 'yan', hint: '火焰，吞噬一切。', name: '火' },
  'sym-mountain': { letters: 'gai', hint: '山，遮住了视线。', name: '山' },
  'sym-mouth': { letters: 'kou', hint: '口，言语之门。', name: '口' },
  'sym-heart': { letters: 'xin', hint: '心，跳动不止。', name: '心' },
  'sym-book': { letters: 'ben', hint: '书卷，承载一切。', name: '本' },
  'sym-knife': { letters: 'dao', hint: '刀，划开伪装。', name: '刀' },
  'sym-lock': { letters: 'suo', hint: '锁，封住了什么。', name: '锁' }
};
const PUZZLE_ANSWERS = {
  'puzzle1': 'linzhixia',
  'puzzle2': 'zhenxiang',
  'puzzle3': 'xiangyangai'
};

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
function onSymbolClick(symId) {
  const info = SYMBOL_MAP[symId];
  if (!info) return;

  const clueId = SYMBOL_CLUE_MAP[symId] || ('sym-clue-' + symId.replace('sym-', ''));
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
    // 恢复已解谜题的禁用状态
    if (GameState.puzzlesSolved[puzzle.id]) {
      const input = document.getElementById(`${puzzle.id}-answer`);
      if (input) {
        input.value = PUZZLE_ANSWERS[puzzle.id];
        input.disabled = true;
        input.style.borderColor = 'var(--success)';
      }
    }
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
    input.disabled = true;
    showToast('谜题破解成功！', 3000);
    // 记录线索，便于完成度统计
    const puzzleClues = {
      'puzzle1': ['ch5-puzzle1', '符号谜题一：被抹去的名字', '通过符号组合破解出被抹去的名字：林知夏', 'real'],
      'puzzle2': ['ch5-puzzle2', '符号谜题二：隐藏的真相', '符号组合揭示了事件本质：真相', 'real'],
      'puzzle3': ['ch5-puzzle3', '符号谜题三：被掩盖的事实', '符号组合描述了最可怕的一面：向阳爱', 'real']
    };
    if (puzzleClues[puzzleId]) {
      findClue(...puzzleClues[puzzleId]);
    } else {
      saveGame();
    }
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
    if (user.found || GameState.forumUsersFound[val]) {
      showToast('该用户的内容已经查看过了');
      return;
    }
    user.found = true;
    GameState.forumUsersFound[val] = true;
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
    if (FORUM_USERS['banzhang0310'].found && FORUM_USERS['linzhixia0333'].found) {
      setTimeout(() => {
        showToast('对比官方离校口径与本人记录，发现了关键矛盾！', 4000);
        findClue('ch2-time-contra','离校说法矛盾：21:00前 vs 21:40','班长要求统一口径称林知夏21:00前已经离校，但她在21:40仍通过校园内网发帖；两条说法不能同时成立。','real');
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
  const cipherText = 'QEB ILD TXP XIQBOBA';

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
        <strong>分析：</strong>"THE LOG WAS ALTERED"（日志已被修改）。<br>
        这是一条明确的系统状态提示，与21:45后的监控缺帧和临时账号操作日志相互印证。<br>
        它证明记录发生过人为改动，但仍需结合账号与权限证据判断操作者。
      </div>
    `;
    AudioSys.playUnlock();
    showToast('传感器数据解码成功！', 3000);
    findClue('ch3-sensor-decode','传感器解码完成','凯撒密码解出“THE LOG WAS ALTERED”，明确表明日志被修改；该结果需与临时账号和监控缺帧共同使用。','real');
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
  const solved = Object.keys(GameState.puzzlesSolved).length;
  if (solved < 4) {
    showToast('还需要破解更多谜题才能进入最终验证');
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
  enhanceHeaderActions();
  patchAudioToggleLabel();
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

  // 恢复隐藏账号已查看状态，避免刷新后重复触发发现动画与线索。
  if (typeof FORUM_USERS !== 'undefined') {
    const legacyForumClues = {
      linzhixia0333: 'ch2-user-lin',
      banzhang0310: 'ch2-user-ban',
      chenxue0315: 'ch2-user-chen'
    };
    Object.entries(legacyForumClues).forEach(([username, clueId]) => {
      if (GameState.cluesFound.has(clueId)) GameState.forumUsersFound[username] = true;
    });
    Object.keys(GameState.forumUsersFound || {}).forEach(username => {
      if (FORUM_USERS[username]) FORUM_USERS[username].found = true;
    });
  }

  // 恢复玩家退出前所在页面；旧存档没有页面字段时回到对应章节主页。
  if (hasSave && GameState.currentChapter > 0) {
    const fallbackPages = {
      1: 'page-ch1-main',
      2: 'page-ch2-forum',
      3: 'page-ch3-monitor',
      4: 'page-ch4-social',
      5: 'page-ch5-review'
    };
    const fallbackPage = fallbackPages[GameState.currentChapter];
    const savedPage = GameState.currentPage && document.getElementById(GameState.currentPage)
      ? GameState.currentPage
      : fallbackPage;
    const restored = savedPage
      ? showPage(savedPage, { bypassChapterGate: true, skipSave: true })
      : false;
    if (!restored && fallbackPage && fallbackPage !== savedPage) {
      showPage(fallbackPage, { bypassChapterGate: true, skipSave: true });
    }
  }

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
        saveGame(true);
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


/* ============================================================
 * 剧情修订补丁 v2.0.0（已直接并入 core.js）
 * 原独立文件：story-patch.js
 * ============================================================ */


// ========== 可用性与文本安全修复（2026-08） ==========
function enhanceHeaderActions() {
  const actions = document.querySelector('.header-actions');
  if (!actions) return;

  let style = document.getElementById('header-actions-clarity-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'header-actions-clarity-style';
    style.textContent = `
      .header-actions { gap: 7px !important; }
      .header-actions .header-action-labeled,
      .header-actions .notepad-link,
      .header-actions .support-chip {
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-height: 36px;
        padding: 6px 10px !important;
        border-radius: 7px;
        white-space: nowrap;
        font-size: 0.78rem;
        font-weight: 600;
        line-height: 1;
      }
      .header-actions .header-action-labeled .btn-icon { width: 16px !important; height: 16px !important; }
      .header-actions .support-chip { border: 1px solid rgba(255,255,255,.28); }
      @media (max-width: 1100px) {
        .header-actions .action-label { display: none; }
        .header-actions .header-action-labeled { width: 38px; padding: 6px !important; }
        .header-actions .notepad-link { padding: 6px 8px !important; }
      }
      @media (max-width: 768px) {
        .header-actions { width: 100%; order: 2; justify-content: flex-end; flex-wrap: wrap; }
        .header-actions .action-label { display: inline; }
        .header-actions .header-action-labeled { width: auto; padding: 6px 9px !important; }
      }
    `;
    document.head.appendChild(style);
  }

  const notepad = actions.querySelector('.notepad-link');
  if (notepad) {
    notepad.innerHTML = '<span aria-hidden="true">📝</span><span>便笺</span>';
    notepad.title = '打开调查便笺（快捷键 N）';
    notepad.setAttribute('aria-label', '打开调查便笺');
  }

  const audio = document.getElementById('audio-toggle');
  if (audio) {
    audio.classList.add('header-action-labeled');
    audio.title = '开启或关闭音效（快捷键 M）';
    audio.setAttribute('aria-label', '切换音效');
  }

  const save = Array.from(actions.querySelectorAll('button')).find(btn => {
    const onclick = btn.getAttribute('onclick') || '';
    return onclick.includes('saveGame');
  });
  if (save) {
    save.classList.add('header-action-labeled');
    save.setAttribute('onclick', 'saveGame(true)');
    save.innerHTML = '<img src="icon-save.svg" class="icon-img btn-icon" alt="" aria-hidden="true"><span class="action-label">存档</span>';
    save.title = '手动保存当前进度（快捷键 S）';
    save.setAttribute('aria-label', '手动保存当前进度');
  }

  const support = actions.querySelector('.support-chip');
  if (support) {
    support.textContent = '¥1 打赏';
    support.title = '自愿支付1元支持作者，不影响完整游戏内容';
    support.setAttribute('aria-label', '自愿支付1元支持作者');
  }

  renderAudioActionLabel();
}

function renderAudioActionLabel() {
  const audio = document.getElementById('audio-toggle');
  if (!audio || typeof AudioSys === 'undefined') return;
  const enabled = AudioSys.enabled !== false;
  audio.innerHTML = `<img src="${enabled ? 'icon-audio.svg' : 'icon-audio-off.svg'}" class="icon-img btn-icon" alt="" aria-hidden="true"><span class="action-label">音效${enabled ? '开' : '关'}</span>`;
  audio.setAttribute('aria-pressed', enabled ? 'true' : 'false');
}

function patchAudioToggleLabel() {
  if (typeof AudioSys === 'undefined' || AudioSys.__clarityPatched) return;
  const originalToggle = AudioSys.toggle.bind(AudioSys);
  AudioSys.toggle = function patchedAudioToggle() {
    const result = originalToggle();
    renderAudioActionLabel();
    return result;
  };
  AudioSys.__clarityPatched = true;
}

function removeVictimBlamingLanguage() {
  const root = document.getElementById('page-ch5-truth') || document.body;
  if (!root) return;
  const replacements = [
    ['林知夏是受害者，却也选择了沉默，她的隐忍让真相更难浮出水面。', '林知夏没有义务为他人的伤害承担“没有及时说出”的责任。她的沉默是长期孤立和权力不对等下的自我保护。'],
    ['她的隐忍让真相更难浮出水面', '她的沉默反映了长期孤立和权力不对等'],
    ['受害者也选择了沉默', '受害者在压力下采取了自我保护']
  ];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => {
    let text = node.nodeValue;
    replacements.forEach(([from, to]) => { text = text.split(from).join(to); });
    node.nodeValue = text;
  });
}

/**
 * 剧情修订补丁
 * 目标：保留原五章结构与主要谜题，调整揭密节奏、时间线、权限逻辑、人物动机与结局选择。
 */
const StoryRevisionPatch = (() => {
  const PATCH_VERSION = '2.0.0';

  function el(id) {
    return document.getElementById(id);
  }

  function bodyOf(pageId) {
    return el(pageId)?.querySelector('.site-body') || null;
  }

  function cards(pageId) {
    return Array.from(el(pageId)?.querySelectorAll('.card') || []);
  }

  function cardByTitle(pageId, keyword) {
    return cards(pageId).find(card => card.querySelector('.card-title')?.textContent.includes(keyword)) || null;
  }

  function replaceText(root, replacements) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      let value = node.nodeValue;
      replacements.forEach(([from, to]) => {
        value = value.split(from).join(to);
      });
      node.nodeValue = value;
    });
  }

  function replaceAttributes(root, replacements) {
    if (!root) return;
    root.querySelectorAll('*').forEach(node => {
      Array.from(node.attributes).forEach(attr => {
        let value = attr.value;
        replacements.forEach(([from, to]) => {
          value = value.split(from).join(to);
        });
        if (value !== attr.value) node.setAttribute(attr.name, value);
      });
    });
  }

  function setCard(card, title, content, footer = '') {
    if (!card) return;
    card.innerHTML = `
      <div class="card-title">${title}</div>
      ${content}
      ${footer}`;
  }

  function clueFooter(id, title, description, status = 'real', color = 'var(--accent-blue)') {
    const safeTitle = title.replace(/'/g, '\\&#39;');
    const safeDescription = description.replace(/'/g, '\\&#39;');
    return `
      <div style="margin-top:12px;padding:10px;background:rgba(58,90,124,0.06);border-radius:6px;font-size:0.8rem;color:var(--text-secondary);">
        <span style="cursor:pointer;color:${color};" onclick="findClue('${id}','${safeTitle}','${safeDescription}','${status}')">[记录线索]</span>
      </div>`;
  }

  function insertAfter(reference, node) {
    if (!reference?.parentNode) return;
    reference.parentNode.insertBefore(node, reference.nextSibling);
  }

  function makeCard(id, style, html) {
    const card = document.createElement('div');
    card.className = 'card';
    if (id) card.id = id;
    if (style) card.style.cssText = style;
    card.innerHTML = html;
    return card;
  }

  function patchDateAndPremise() {
    const date = el('top-bar-date');
    if (date) date.textContent = '2025年10月20日 星期一';

    const about = el('page-home')?.querySelector('.about-text');
    if (about) {
      const paragraphs = about.querySelectorAll('p');
      if (paragraphs[0]) {
        paragraphs[0].textContent = '你是一名刚转入育华中学的学生。10月20日晚，你在整理校园公示资料时，发现10月15日的一份留校名单存在无法解释的第十行。';
      }
      if (paragraphs[1]) {
        paragraphs[1].textContent = '调查目标不是先入为主地寻找“凶手”，而是确认谁被删掉、当晚发生了什么，以及哪些记录能够相互验证。';
      }
    }
  }

  function patchChapter1() {
    const main = el('page-ch1-main');
    const archive = el('page-ch1-archive');
    const history = el('page-ch1-history');

    const noticeCard = cardByTitle('page-ch1-main', '教务处内部通知');
    setCard(
      noticeCard,
      '<img src="icon-warning.svg" class="icon-img title-icon" alt="" aria-hidden="true"> 教务处内部通知',
      `<div class="memo-paper">
        <div class="memo-text">
          10月15日高三（7）班留校名单已完成初审。<br><br>
          原始文件包含<strong>10条学生记录</strong>，其中第10条因考勤状态异常，暂缓计入公示人数。<br><br>
          根据隐私规则，该条记录的姓名与完整学号暂不对外显示；请在完成原始台账核验前，不要据此判断学生身份或离校情况。<br><br>
          <span style="color:#999;font-size:0.8rem;">——教务处系统备注 · 10月16日 09:05</span>
        </div>
      </div>`,
      clueFooter('ch1-contra-time', '被暂缓计入的记录', '内部通知只确认原始文件有10条记录，但姓名和离校情况尚未核实。', 'real')
    );

    const discoveryCard = cardByTitle('page-ch1-main', '意外发现');
    setCard(
      discoveryCard,
      '<img src="icon-search.svg" class="icon-img title-icon" alt="" aria-hidden="true"> 意外发现：被删除的留言',
      `<p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.9;">
        页面缓存中残留了一条被管理员删除的留言：
      </p>
      <div class="memo-paper" style="margin-top:12px;">
        <div class="memo-text" style="font-style:italic;">
          “我是第10位同学的同桌。21:15离开时，后排靠窗的人还在写东西。公示里写的‘提前离校’，和我看到的不一样。”
        </div>
      </div>`,
      clueFooter('ch1-witness', '缓存中的同桌留言', '留言只能证明第10位学生21:15仍在教室，暂时不能确认姓名。', 'real')
    );

    if (main) {
      replaceText(main, [
        ['公示名单第10行的人名被刻意擦除，只留下了学号：20220333', '公示名单第10行的身份字段被擦除，学号也只保留了部分缓存。'],
        ['20220333', '2022****'],
        ['被抹去的名字', '身份字段缺失'],
        ['共计 9人 实际留校', '公示统计为 9人，但原始文件行数为10']
      ]);
      replaceAttributes(main, [
        ['20220333', '2022****'],
        ['被抹去的名字', '身份字段缺失'],
        ['公示名单第10行的人名被刻意擦除，只留下了学号：20220333', '公示名单第10行的身份字段被擦除，完整学号尚未恢复。']
      ]);
    }

    if (archive) {
      replaceText(archive, [
        ['林知夏', '身份字段损坏'],
        ['20220333', '2022****'],
        ['内网-班长终端', '内网终端-07（账号字段缺失）'],
        ['被抹去的名字', '身份字段缺失']
      ]);
      replaceAttributes(archive, [
        ['林知夏', '身份字段损坏'],
        ['20220333', '2022****'],
        ['内网-班长终端', '内网终端-07（账号字段缺失）'],
        ['被抹去的名字', '身份字段缺失']
      ]);
    }

    if (history) {
      replaceText(history, [
        ['林知夏同学于21:30后仍未离校，值班老师巡查时未找到该生。22:00再次确认时，该生座位已空，但未签退。', '第10位学生21:30后仍未离校。22:00再次确认时，后排靠窗座位已空，但该条记录没有签退时间。'],
        ['第10条记录（林知夏，学号20220333）', '第10条记录（身份字段损坏，学号2022****）'],
        ['林知夏', '身份字段损坏'],
        ['20220333', '2022****'],
        ['内网-班长终端', '内网终端-07（账号字段缺失）'],
        ['被抹去的名字', '身份字段缺失']
      ]);
      replaceAttributes(history, [
        ['林知夏', '身份字段损坏'],
        ['20220333', '2022****'],
        ['内网-班长终端', '内网终端-07（账号字段缺失）'],
        ['被抹去的名字', '身份字段缺失']
      ]);
    }

    const puzzleCard = cards('page-ch1-history').find(card => card.querySelector('#ch1-puzzle-answer'));
    if (puzzleCard) {
      const title = puzzleCard.querySelector('.card-title');
      const description = puzzleCard.querySelector('p');
      const input = puzzleCard.querySelector('#ch1-puzzle-answer');
      if (title) title.innerHTML = '<img src="icon-puzzle-piece.svg" class="icon-img title-icon" alt="" aria-hidden="true"> 记录校验：第十人';
      if (description) description.textContent = '三个符号对应三个拼音片段。它们不会给出姓名，只会告诉你这条异常记录代表什么。';
      if (input) input.placeholder = '输入“第十人”的拼音...';
    }

    const ch1Symbols = Array.from(el('ch1-symbol-row')?.querySelectorAll('.symbol-item') || []);
    const ch1Defs = [
      { key: 'di', name: '第', clue: 'sym-clue-1' },
      { key: 'shi', name: '十', clue: 'sym-clue-2' },
      { key: 'ren', name: '人', clue: 'sym-clue-3' }
    ];
    ch1Symbols.forEach((node, index) => {
      node.removeAttribute('data-symbol');
      node.setAttribute('data-ch1-symbol', String(index));
      node.setAttribute('onclick', `onChapter1SymbolClick(${index})`);
      node.removeAttribute('data-letter');
      node.title = '点击核验符号';
    });

    window.onChapter1SymbolClick = function onChapter1SymbolClick(index) {
      const def = ch1Defs[index];
      const node = el('ch1-symbol-row')?.querySelector(`[data-ch1-symbol="${index}"]`);
      if (!def || !node) return;
      if (typeof GameState !== 'undefined' && !GameState.cluesFound.has(def.clue)) {
        window.showToast?.('你还没有找到解释这个符号的线索。');
        return;
      }
      node.classList.remove('locked');
      node.classList.add('solved');
      node.setAttribute('data-letter', def.key);
      node.title = `${def.name} = ${def.key}`;
      window.showToast?.(`符号校验：${def.name} = ${def.key}`);
    };

    window.checkChapter1Puzzle = function checkChapter1PuzzlePatched() {
      const input = el('ch1-puzzle-answer');
      const answer = (input?.value || '').trim().toLowerCase().replace(/\s+/g, '');
      if (!answer) {
        window.showToast?.('请输入拼音答案');
        return;
      }
      if (answer !== 'dishiren') {
        window.AudioSys?.playWrong?.();
        window.showToast?.('答案不正确。三个符号表达的是名单中的异常身份。');
        return;
      }
      window.AudioSys?.playCorrect?.();
      if (typeof GameState !== 'undefined') {
        GameState.puzzlesSolved.ch1 = true;
        GameState.unlockedPages.add('page-ch2-forum');
      }
      window.findClue?.('ch1-puzzle-solved', '第十人的存在', '符号与原始行数共同证明：名单确实曾有第十位学生，但身份仍需继续调查。', 'real');
      window.showToast?.('校验成功：你确认了原始记录中确实存在第十人。');
      window.saveGame?.();
    };
  }

  function patchChapter2() {
    const draft = cardByTitle('page-ch2-testimony-c', '班长的另一份记录');
    setCard(
      draft,
      '<img src="icon-theater.svg" class="icon-img title-icon" alt="" aria-hidden="true"> 意外发现：班长的未完成草稿',
      `<p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.9;">
        在课桌夹层中，你找到一张被反复涂改的草稿：
      </p>
      <div class="memo-paper" style="margin-top:12px;">
        <div class="memo-text" style="font-style:italic;color:var(--text-muted);">
          “我错了。我不该把那条记录改掉……<br><br>
          只要它留下来，之前的事也会被翻出来。老师说这次检查不能再出任何问题。<br><br>
          可这不是我一个人的决定。真正动过系统的人也不是只有……”<br><br>
          <span style="color:#999;">（后半页被撕掉）</span>
        </div>
      </div>`,
      clueFooter('ch2-draft', '未完成的检讨草稿', '草稿说明记录被改过，并暗示多人参与；具体动机和操作者仍未确定。', 'real', 'var(--danger)')
    );

    const privateBody = bodyOf('page-ch2-private');
    if (privateBody && !el('story-identity-card')) {
      const identityCard = makeCard(
        'story-identity-card',
        'border-left:4px solid var(--accent-blue);background:linear-gradient(135deg,#f4f7fb,#eef3f8);',
        `<div class="card-title"><img src="icon-search.svg" class="icon-img title-icon" alt="" aria-hidden="true"> 缓存账号映射恢复</div>
        <div class="card-subtitle">恢复来源：班级内网账号索引 · 10月17日备份</div>
        <div style="font-size:0.88rem;color:var(--text-secondary);line-height:2;">
          <p><strong>缓存账号：</strong>student_20220333</p>
          <p><strong>姓名字段：</strong><span class="evidence-highlight">林知夏</span></p>
          <p><strong>座位：</strong>后排靠窗</p>
          <p><strong>状态：</strong>账号仍在使用，未办理转学或退学手续</p>
        </div>
        ${clueFooter('ch2-identity', '身份字段恢复', '账号索引把第十条记录、学号20220333和林知夏对应起来；第二章至此才确认身份。', 'real')}`
      );
      insertAfter(privateBody.querySelector('.notice-banner'), identityCard);
    }

    const privatePage = el('page-ch2-private');
    if (privatePage) {
      const firstTitle = privatePage.querySelector('.site-header .sub');
      if (firstTitle) firstTitle.innerHTML = '<img src="icon-warning.svg" class="icon-img inline-icon" alt="" aria-hidden="true"> 系统备份 · 身份恢复后可进行证词交叉验证';
    }
  }

  function patchChapter3() {
    const monitorBody = bodyOf('page-ch3-monitor');
    if (monitorBody && !el('story-permission-card')) {
      const card = makeCard(
        'story-permission-card',
        'border-left:4px solid var(--warning);background:linear-gradient(135deg,#fffaf0,#fff6e6);',
        `<div class="card-title"><img src="icon-lock-closed.svg" class="icon-img title-icon" alt="" aria-hidden="true"> 临时权限申请单</div>
        <div class="card-subtitle">申请时间：2025-10-15 17:40 · 有效期至10月16日10:00</div>
        <table class="data-table">
          <tbody>
            <tr><th>临时账号</th><td>eval_c7_temp</td></tr>
            <tr><th>申请用途</th><td>整理文明班级评审材料、导出活动视频</td></tr>
            <tr><th>申请人</th><td>高三（7）班班长</td></tr>
            <tr><th>技术协助</th><td>张浩（信息社成员）</td></tr>
            <tr><th>权限范围</th><td>名单草稿、视频导出缓存；不含正式删除权限</td></tr>
          </tbody>
        </table>
        <p style="font-size:0.8rem;color:var(--text-muted);margin-top:12px;">异常点：正式删除权限本不应开放，但系统日志显示该账号在凌晨调用了覆盖接口。</p>
        ${clueFooter('ch3-permission', '临时权限申请单', '班长取得评审材料临时账号，张浩具备技术能力，解释了学生为何可能接触后台，但仍不能单凭申请单断定谁实际操作。', 'real', 'var(--warning)')}`
      );
      insertAfter(monitorBody.querySelector('.notice-banner'), card);
    }

    const classroomBody = bodyOf('page-ch3-classroom');
    if (classroomBody && !el('story-lin-draft-card')) {
      const card = makeCard(
        'story-lin-draft-card',
        'border-left:4px solid var(--success);background:linear-gradient(135deg,#f3faf5,#eef7f1);',
        `<div class="card-title"><img src="icon-memo.svg" class="icon-img title-icon" alt="" aria-hidden="true"> 林知夏留下的申请陈述草稿</div>
        <div class="memo-paper">
          <div class="memo-text">
            “家里晚上很吵，只有教室能让我把申请材料安静地写完。<br><br>
            大家总说我不适合集体活动，可我还是想申请大学的奖学金项目。我不想再因为别人怎么看我，就放弃自己真正想做的事。<br><br>
            今天把最后一段改完，<strong>21:50前离开</strong>。”
          </div>
        </div>
        <p style="font-size:0.8rem;color:var(--text-muted);margin-top:12px;">草稿最后一次自动保存：10月15日21:42。</p>
        ${clueFooter('ch3-diary', '林知夏的申请草稿', '草稿说明她留校有明确目的，并计划21:50前离开；她不是“忘记时间”的空白受害者。', 'real', 'var(--success)')}`
      );
      const firstCard = classroomBody.querySelector('.card');
      if (firstCard) classroomBody.insertBefore(card, firstCard);
      else classroomBody.appendChild(card);
    }

    const backup = el('page-ch3-backup');
    if (backup) {
      replaceText(backup, [
        ['班长终端执行数据清理', '临时账号 eval_c7_temp 调用数据覆盖接口'],
        ['内网-班长终端', '临时账号 eval_c7_temp'],
        ['系统管理员于02:35执行了批量数据清理操作', '临时账号于02:33调用覆盖接口，02:35完成批量数据清理']
      ]);
      replaceAttributes(backup, [
        ['班长终端', '临时账号 eval_c7_temp'],
        ['系统管理员于02:35执行了批量数据清理操作', '临时账号于02:33调用覆盖接口，02:35完成批量数据清理']
      ]);
    }
  }

  function patchChapter4() {
    const social = el('page-ch4-social');
    if (social) {
      const posts = social.querySelectorAll('.forum-post');
      posts.forEach(post => {
        const clue = post.getAttribute('data-clue');
        if (clue === 'ch4-fake2') {
          const time = post.querySelector('.time');
          const content = post.querySelector('.content');
          if (time) time.textContent = '10-16 22:15';
          if (content) content.textContent = '听说7班晚自习名单少了一个女生，有人说她“失踪”了。消息来源不明，名字也没人说得清。';
          post.setAttribute('onclick', "findClue('ch4-fake2','留言：失踪传闻','事件发生后才出现的二手传闻，没有证据支持“失踪”说法。','fake')");
        }
        if (clue === 'ch4-half1') {
          const time = post.querySelector('.time');
          const content = post.querySelector('.content');
          if (time) time.textContent = '10-17 08:00';
          if (content) content.textContent = '【公告】近日出现关于我校学生的网络传言。经初步核查，暂未发现学生失联情况。相关考勤记录正在复核，请勿传播未经证实的信息。';
          post.setAttribute('onclick', "findClue('ch4-half1','留言：校方公告','公告否认“失联”，但承认考勤仍在复核，不能据此排除记录被修改。','half')");
        }
      });
    }

    const chats = el('page-ch4-chats');
    if (chats) {
      replaceText(chats, [['时间：10-14 至 10-16', '时间：10-16 至 10-19']]);

      const groupCard = cardByTitle('page-ch4-chats', '7班小群');
      if (groupCard) {
        const sub = groupCard.querySelector('.card-subtitle');
        if (sub) sub.textContent = '群成员：陈雪、张浩、赵伟、刘洋 | 时间：10-16 00:15 至 10-16 00:28';
      }

      const teacherCard = cardByTitle('page-ch4-chats', '班长私信');
      setCard(
        teacherCard,
        '聊天记录 #2：班长与教务处张老师',
        `<div class="card-subtitle">参与人：班长、教务处张老师 | 时间：10-16 09:00</div>
        <div class="chat-record">
          <div class="chat-msg self"><div class="chat-avatar">班</div><div class="chat-bubble" style="background:var(--accent-blue);">张老师，昨天的留校名单我重新提交了，第10条是误录。</div></div>
          <div class="chat-msg"><div class="chat-avatar">师</div><div class="chat-bubble">为什么原始表、签到表和现在的版本不一致？</div></div>
          <div class="chat-msg self"><div class="chat-avatar">班</div><div class="chat-bubble" style="background:var(--accent-blue);">她临时请假，签到也是登记错了。我已经把附件改好。</div></div>
          <div class="chat-msg"><div class="chat-avatar">师</div><div class="chat-bubble">评审材料今天要交，先按你更新的版本通过。原始签到我之后再看。</div></div>
          <div class="chat-msg self"><div class="chat-avatar">班</div><div class="chat-bubble" style="background:var(--accent-blue);">好，谢谢老师。</div></div>
        </div>
        <p style="font-size:0.8rem;color:var(--text-muted);margin-top:12px;">张老师没有参与凌晨操作，但在未核验原始签到的情况下批准了修改。</p>`,
        clueFooter('ch4-chat2', '未经核验的审批', '教务老师为赶评审材料先批准修改，构成制度性失察，但聊天不足以证明其参与删除。', 'real', 'var(--danger)')
      );
    }

    const leakBody = bodyOf('page-ch4-leak');
    const leak1 = cardByTitle('page-ch4-leak', '爆料 #1');
    setCard(
      leak1,
      '爆料 #1：三件能被核验的事',
      `<div class="card-subtitle">投稿时间：10-18 23:45 | 可信度：待交叉验证</div>
      <div class="memo-paper" style="background:linear-gradient(135deg,#fff8f0,#fff0e0);">
        <div class="memo-text">
          “我是7班学生。我只敢说三件事：<br><br>
          第一，她10月15日晚确实来过；第二，16日凌晨名单突然少了一条；第三，小群里有人让我们不要谈21:45。<br><br>
          至于谁删了监控、为什么要改，我没有亲眼看到，也不想把猜测写成事实。”
        </div>
      </div>`,
      clueFooter('ch4-leak1', '可核验的匿名投稿', '匿名投稿只提供三个待核验事实，没有直接指定主谋；其价值取决于能否与台账和群聊互证。', 'half', 'var(--warning)')
    );

    const leak2 = cardByTitle('page-ch4-leak', '爆料 #2');
    setCard(
      leak2,
      '爆料 #2：评审压力与旧问题',
      `<div class="card-subtitle">投稿时间：10-19 01:20 | 可信度：待交叉验证</div>
      <div class="memo-paper" style="background:linear-gradient(135deg,#fff8f0,#fff0e0);">
        <div class="memo-text">
          “16日上午，7班要提交文明班级评审材料。班长最近反复说‘这次不能再被扣分’。<br><br>
          有人担心，只要学校认真查15日晚的事，就会连带翻出班里以前对林知夏的排挤。<br><br>
          我不知道谁实际操作了系统，也不知道评优是不是唯一动机。”
        </div>
      </div>`,
      clueFooter('ch4-leak2', '动机方向而非结论', '爆料提供“评审压力”和“担心旧事被翻出”两个方向，但没有证明具体责任人。', 'half', 'var(--warning)')
    );

    if (leakBody && !el('story-exclusion-card')) {
      const exclusionCard = makeCard(
        'story-exclusion-card',
        'border-left:4px solid var(--danger);background:linear-gradient(135deg,#fff5f5,#fff0f0);',
        `<div class="card-title"><img src="icon-list.svg" class="icon-img title-icon" alt="" aria-hidden="true"> 长期痕迹：三份互不相干的记录</div>
        <div style="font-size:0.86rem;color:var(--text-secondary);line-height:2;">
          <p><strong>9月22日 · 小组作业名单：</strong>学号0333被单独写在页脚，旁注“她自己做”。</p>
          <p><strong>10月3日 · 班级合影通知：</strong>群管理员留言“后排那位不用等，先拍”。</p>
          <p><strong>10月12日 · 班级群缓存：</strong>林知夏询问实验分组，43人已读、无人回复；同一分钟群内仍在连续发送表情。</p>
        </div>
        <p style="font-size:0.8rem;color:var(--text-muted);margin-top:12px;">单条记录都可能被解释为疏忽，三条长期、不同来源的痕迹共同出现，才构成持续排斥的模式。</p>
        ${clueFooter('ch4-exclusion-pattern', '长期排斥模式', '小组名单、合影通知和群聊缓存共同显示林知夏长期被排除在集体之外。', 'real', 'var(--danger)')}`
      );
      const shredCard = cardByTitle('page-ch4-leak', '碎纸重组');
      if (shredCard) leakBody.insertBefore(exclusionCard, shredCard);
      else leakBody.appendChild(exclusionCard);
    }
  }

  function patchReviewTimeline() {
    const timeline = el('ch5-review-timeline');
    if (!timeline) return;
    const data = [
      ['18:10', '林知夏以学号20220333签到。她计划完成奖学金申请陈述后于21:50前离开。', 'real'],
      ['21:15', '李婷离开时确认后排靠窗仍有女生，证明“提前离校”说法不成立。', 'real'],
      ['21:30', '值班巡查记录教室仍有人；随后监控画面开始异常。', 'real'],
      ['21:45', '电子门发生短时外部锁定；视频缺失，但人体传感器与恢复帧证明室内仍有人。', 'real'],
      ['21:56', '门锁解除，后侧通道传感器触发；林知夏离开但没有完成签退。', 'real'],
      ['22:15', '班长提交含10条记录的初始版本；该版本进入自动备份。', 'real'],
      ['次日 00:15', '7班小群出现“统一口径”要求，陈雪随后修改签到附件。', 'fake'],
      ['次日 02:33—09:00', '临时账号覆盖视频与名单；09:00教务老师未核验原始记录便批准新版本。', 'fake']
    ];
    const items = timeline.querySelectorAll('.timeline-item');
    items.forEach((item, index) => {
      if (!data[index]) return;
      item.classList.remove('real', 'fake', 'half');
      item.classList.add(data[index][2]);
      const time = item.querySelector('.timeline-time');
      const content = item.querySelector('.timeline-content');
      if (time) time.textContent = data[index][0];
      if (content) content.textContent = data[index][1];
    });
  }

  function patchFinalDecision() {
    const review = el('page-ch5-review');
    const finalCard = cardByTitle('page-ch5-review', '终极问题');
    if (finalCard) {
      setCard(
        finalCard,
        '<img src="icon-question.svg" class="icon-img title-icon" alt="" aria-hidden="true"> 最终决定：怎样使用真相？',
        `<p style="font-size:0.9rem;color:#c0c8d0;line-height:1.9;margin-bottom:16px;">
          你已经掌握了一条较完整的责任链。但调查材料包含学生姓名、私密聊天和受害者个人申请。你准备怎样提交证据？
        </p>
        <div class="choice-group">
          <div class="choice-btn" onclick="selectAnswer('q1','a',event)"><strong>A.</strong> 把全部原始截图、姓名和私密材料发布到公开平台，让舆论迫使学校回应。</div>
          <div class="choice-btn" onclick="selectAnswer('q1','b',event)"><strong>B.</strong> 整理可验证证据，隐去受害者隐私，匿名提交学校与教育主管部门，并保留原始备份。</div>
          <div class="choice-btn" onclick="selectAnswer('q1','c',event)"><strong>C.</strong> 只公开班长姓名，把事件归结为一个人的道德问题，避免牵连其他人。</div>
        </div>`
      );
    }

    window.checkFinalAnswer = function checkFinalAnswerPatched() {
      const answer = typeof GameState !== 'undefined' ? GameState.choices?.q1 : null;
      if (!answer) {
        window.showToast?.('请先选择一种处理方式');
        return;
      }

      const completion = typeof window.getCompletionScore === 'function'
        ? window.getCompletionScore()
        : { keyClues: 0, totalKeyClues: 1, puzzles: 0, totalClues: 0 };
      const completionPercent = Math.round((completion.keyClues || 0) / Math.max(1, completion.totalKeyClues || 1) * 100);
      const clueCount = typeof GameState !== 'undefined' ? GameState.cluesFound.size : 0;
      const puzzleCount = typeof GameState !== 'undefined' ? Object.values(GameState.puzzlesSolved || {}).filter(Boolean).length : 0;
      const sufficientlyInvestigated = clueCount >= 12 && puzzleCount >= 5;

      let ending = 'incomplete';
      let pageId = 'page-ending-incomplete';
      if (answer === 'a') {
        ending = 'bad';
        pageId = 'page-ending-bad';
      } else if (answer === 'b' && sufficientlyInvestigated) {
        ending = 'good';
        pageId = 'page-ending-good';
      }

      if (typeof GameState !== 'undefined') GameState.ending = ending;
      window.saveGame?.();
      window.AudioSys?.playCorrect?.();
      window.showPage?.(pageId);

      const statsId = ending === 'good' ? 'good-stats' : ending === 'bad' ? 'bad-stats' : 'incomplete-stats';
      const stats = el(statsId);
      if (stats) {
        stats.innerHTML = `<p style="margin-top:14px;font-size:0.8rem;opacity:0.65;">调查完成度：${completionPercent}% · 已发现线索：${clueCount} · 已完成谜题：${puzzleCount}</p>`;
      }
    };

    if (review) {
      const display = el('completion-display');
      if (display) display.insertAdjacentHTML('beforeend', '<p style="margin-top:8px;font-size:0.78rem;color:#8fa2b3;">修订版结局同时考察证据完整度与公开方式，找到真相不等于可以无差别曝光隐私。</p>');
    }
  }

  function patchLogicQuestions() {
    const page = el('page-ch5-logic');
    if (!page) return;
    const questionCards = Array.from(page.querySelectorAll('.card')).filter(card => card.querySelector('.choice-group'));
    const questions = [
      {
        title: '问题一：21:45后是否仍有人',
        prompt: '哪组证据的交叉验证最能证明21:45之后教室内仍有人？',
        choices: [
          ['a', '一条匿名留言与“失踪”传闻'],
          ['b', '人体传感器、恢复帧与空缺的签退记录'],
          ['c', '班长的个人陈述与公示统计']
        ]
      },
      {
        title: '问题二：后台权限从何而来',
        prompt: '学生能够接触名单与视频缓存，最符合证据的解释是什么？',
        choices: [
          ['a', '所有学生默认拥有系统管理员权限'],
          ['b', '学校服务器完全没有账号验证'],
          ['c', '班长申请了评审材料临时账号，张浩又具备信息社技术能力']
        ]
      },
      {
        title: '问题三：责任链',
        prompt: '哪一种责任划分最符合现有日志、聊天与附件修改记录？',
        choices: [
          ['a', '班长组织口径；张浩执行技术覆盖；陈雪修改签到；老师未核验便审批'],
          ['b', '全部操作都由班长一人完成，其他人完全不知情'],
          ['c', '教务老师策划全过程，学生只是被动执行']
        ]
      },
      {
        title: '问题四：如何理解林知夏的沉默',
        prompt: '对林知夏事后没有立即公开指控，哪种理解更合理？',
        choices: [
          ['a', '她默认了记录修改，因此与其他人承担同等责任'],
          ['b', '她没有受伤，所以事件并不严重'],
          ['c', '长期孤立与权力不对等使沉默成为自我保护，而非同谋']
        ]
      }
    ];

    questionCards.forEach((card, index) => {
      const q = questions[index];
      if (!q) return;
      const title = card.querySelector('.card-title');
      const p = card.querySelector('p');
      const group = card.querySelector('.choice-group');
      if (title) title.textContent = q.title;
      if (p) p.textContent = q.prompt;
      if (group) {
        group.innerHTML = q.choices.map(([value, text], choiceIndex) => {
          const label = String.fromCharCode(65 + choiceIndex);
          return `<div class="choice-btn" onclick="selectLogicAnswer('q${index + 1}','${value}')"><strong>${label}.</strong> ${text}</div>`;
        }).join('');
      }
    });

    window.checkLogicAnswers = function checkLogicAnswersPatched() {
      const correct = { q1: 'b', q2: 'c', q3: 'a', q4: 'c' };
      const answers = typeof GameState !== 'undefined' ? (GameState.logicAnswers || {}) : {};
      const missing = Object.keys(correct).some(key => !answers[key]);
      const result = el('logic-result');
      if (missing) {
        if (result) {
          result.style.display = 'block';
          result.style.background = 'rgba(201,162,39,0.12)';
          result.style.color = 'var(--warning)';
          result.textContent = '请先完成全部四个问题。';
        }
        return;
      }

      const wrong = Object.keys(correct).filter(key => answers[key] !== correct[key]);
      if (wrong.length) {
        window.AudioSys?.playWrong?.();
        if (result) {
          result.style.display = 'block';
          result.style.background = 'rgba(160,80,80,0.14)';
          result.style.color = 'var(--danger)';
          result.textContent = `仍有${wrong.length}处推理不成立。注意区分“可核验证据”“匿名猜测”和“责任层级”。`;
        }
        return;
      }

      window.AudioSys?.playCorrect?.();
      if (typeof GameState !== 'undefined') {
        GameState.puzzlesSolved['logic-verify'] = true;
        GameState.unlockedPages.add('page-ch5-truth');
      }
      window.findClue?.('ch5-logic-pass', '完整责任链', '证据支持多人分工和制度失察，而不是把全部责任简化为一个“幕后主谋”。', 'real');
      window.saveGame?.();
      if (result) {
        result.style.display = 'block';
        result.style.background = 'rgba(74,124,89,0.16)';
        result.style.color = 'var(--success)';
        result.textContent = '验证通过：真相档案已解锁。';
      }
      setTimeout(() => window.showPage?.('page-ch5-truth'), 700);
    };
  }

  function patchTruthArchive() {
    const body = bodyOf('page-ch5-truth');
    if (!body) return;
    body.innerHTML = `
      <div class="truth-archive">
        <h2>被保护的真相</h2>
        <div class="quote">
          “调查不是把一个名字换成另一个名字贴在‘罪人’的位置上。<br><br>
          真相需要证据，也需要边界：让责任被看见，同时不让受害者再一次成为供人围观的材料。”
        </div>
      </div>
      <div class="card" style="background:#1e2128;border-color:#3a3d45;">
        <div class="card-title" style="color:#fff;"><img src="icon-list.svg" class="icon-img title-icon" alt="" aria-hidden="true"> 证据能够确认的事实</div>
        <div style="font-size:0.9rem;color:#c0c8d0;line-height:2;">
          <p>1. 林知夏是10月15日留校名单中的第十位学生，21:30以后仍在教室。</p>
          <p>2. 21:45前后电子门被短时从外部锁定；监控视频缺失，但人体传感器、恢复帧和后侧通道记录证明室内有人。</p>
          <p>3. 班长为提交文明班级评审材料申请了临时账号；张浩作为信息社成员提供技术协助。凌晨覆盖日志来自该临时账号，而非普通学生账号。</p>
          <p>4. 陈雪修改了签到附件，班长要求同学统一说法；教务处张老师未核验原始台账便批准了修改。</p>
          <p>5. 多份独立记录显示，林知夏在事件前已长期遭受忽视、排除和集体冷处理。</p>
        </div>
      </div>
      <div class="card" style="background:#1e2128;border-color:#3a3d45;">
        <div class="card-title" style="color:#fff;"><img src="icon-clock.svg" class="icon-img title-icon" alt="" aria-hidden="true"> 最可信的事件还原</div>
        <div style="font-size:0.9rem;color:#c0c8d0;line-height:2;">
          <p>林知夏留校完成奖学金申请陈述，并计划在21:50前离开。班长在评审材料提交前返回教室，要求她立即离开。争执中，班长使用临时门禁卡从外部关闭电子门，试图逼她服从。</p>
          <p>电子门约五分钟后解除。林知夏从后侧通道离开，没有完成签退。现有证据支持这是一次危险的强制与恐吓行为，而不是预谋“失踪”。</p>
          <p>事后，班长担心调查会影响班级评审，并翻出此前对林知夏的长期排挤，于是要求统一口径。张浩利用临时账号覆盖视频缓存，陈雪修改签到附件，班长提交删减后的名单。教务老师为赶材料，在没有核验原始记录的情况下批准了修改。</p>
        </div>
      </div>
      <div class="card" style="background:#1e2128;border-color:#3a3d45;">
        <div class="card-title" style="color:#fff;"><img src="icon-list.svg" class="icon-img title-icon" alt="" aria-hidden="true"> 责任并不等量</div>
        <div style="font-size:0.88rem;color:#c0c8d0;line-height:2;">
          <p><strong style="color:var(--danger);">班长：</strong>实施门禁强制、组织统一口径并提交虚假版本，承担主要责任。评审压力可以解释选择，不能构成免责理由。</p>
          <p><strong style="color:var(--warning);">张浩：</strong>执行视频缓存覆盖，承担直接技术责任。</p>
          <p><strong style="color:var(--warning);">陈雪：</strong>修改签到附件并参与隐瞒，承担协助责任；其后悔不抵消已经造成的结果。</p>
          <p><strong style="color:#aab3bd;">教务老师与制度：</strong>临时权限边界失控、审核流于形式，使学生有机会篡改正式记录。</p>
          <p><strong style="color:#aab3bd;">旁观同学：</strong>责任程度各不相同，但集体沉默让谎言获得了持续时间。</p>
          <p><strong style="color:var(--success);">林知夏：</strong>没有义务为他人的伤害承担“没有及时说出”的责任。她的沉默是长期孤立和权力不对等下的自我保护。</p>
        </div>
      </div>
      <div class="card" style="background:linear-gradient(135deg,#1a2520,#1d3025);border-color:#355342;">
        <div class="card-title" style="color:var(--success);"><img src="icon-thought.svg" class="icon-img title-icon" alt="" aria-hidden="true"> 真正需要追问的问题</div>
        <div style="font-size:0.9rem;color:#c0c8d0;line-height:2;">
          <p>不是“她为什么不早点说”，而是：</p>
          <p style="font-size:1rem;color:#fff;">为什么她会认为，说出来也不会有人相信？</p>
          <p>保护受害者隐私、保留原始证据、追查权限与审核漏洞，才是让真相产生改变的方式。</p>
        </div>
      </div>`;
  }

  function patchEndings() {
    const bad = el('page-ending-bad');
    if (bad) {
      const h1 = bad.querySelector('h1');
      const text = bad.querySelector('.ending-text');
      if (h1) h1.textContent = '真相的二次伤害';
      if (text) text.innerHTML = `
        <p>你把全部聊天截图、姓名和林知夏的私人申请材料原样发布到了公开平台。</p>
        <p>学校被迫回应，但网络开始猜测她的家庭、性格和“为什么不反抗”。未经核实的传闻与真实证据混在一起扩散。</p>
        <p>责任人可能受到调查，林知夏却再一次失去了对自己经历的决定权。</p>
        <p style="margin-top:20px;color:#c09a9a;">揭露真相不能以再次消费受害者为代价。</p>
        <div id="bad-stats"></div>`;
    }

    const incomplete = el('page-ending-incomplete');
    if (incomplete) {
      const h1 = incomplete.querySelector('h1');
      const text = incomplete.querySelector('.ending-text');
      if (h1) h1.textContent = '片面的答案';
      if (text) text.innerHTML = `
        <p>你只公开了班长的名字，把全部问题归结为一个人的品行。</p>
        <p>班长受到处分，但视频覆盖者、签到修改、临时权限漏洞和教务审核失察没有进入正式调查。</p>
        <p>旧的评审流程继续运行，下一份“看起来完整”的记录仍可能掩盖同样的问题。</p>
        <p style="margin-top:20px;color:#c8b878;">找到主要责任人，不等于看见完整责任链。</p>
        <div id="incomplete-stats"></div>`;
    }

    const good = el('page-ending-good');
    if (good) {
      const h1 = good.querySelector('h1');
      const text = good.querySelector('.ending-text');
      const quote = good.querySelector('.truth-archive .quote');
      if (h1) h1.textContent = '被保护的真相';
      if (text) text.innerHTML = `
        <p>你把传感器、门禁、备份版本和临时账号日志整理成可复核的证据链，并隐去了林知夏的私人材料。</p>
        <p>材料被匿名提交至学校与教育主管部门，原始备份保存在独立位置，避免再次被覆盖。</p>
        <p>正式调查不只处理班长，也追查技术操作、附件修改、审核失察与长期排斥。</p>
        <p>林知夏可以在不被公开围观的前提下，决定是否以及何时讲述自己的经历。</p>
        <p style="margin-top:20px;color:#a0c8a0;">真相被看见，受害者也被当作一个有选择权的人。</p>
        <div id="good-stats"></div>`;
      if (quote) quote.innerHTML = '保留原始证据。<br>区分事实、推断与传闻。<br>追查完整责任链。<br>不以公开隐私换取正义。';
    }
  }

  function patchHints() {
    try {
      if (typeof CHAPTER_PROGRESS !== 'undefined') {
        const findProgress = (chapter, id) => CHAPTER_PROGRESS[chapter]?.clues?.find(item => item.id === id);
        const ch1Anomaly = findProgress('ch1', 'ch1-name');
        if (ch1Anomaly) {
          ch1Anomaly.hint2 = '对比公示人数、表格行数和历史版本，先确认是否存在第十条记录。';
          ch1Anomaly.hint3 = '第一章只能确认第十人存在，身份要到第二章通过账号索引恢复。';
        }
        const ch1Puzzle = findProgress('ch1', 'ch1-puzzle-solved');
        if (ch1Puzzle) {
          ch1Puzzle.hint2 = '三个符号分别表达“第”“十”“人”的拼音。';
          ch1Puzzle.hint3 = '答案是dishiren（第十人），不是具体姓名。';
        }
        const logic = findProgress('ch5', 'ch5-logic-pass');
        if (logic) {
          logic.hint2 = '分别判断在场证据、权限来源、责任链和受害者沉默。';
          logic.hint3 = '答案依次为B、C、A、C。';
        }
      }
      if (typeof HINTS !== 'undefined') {
        HINTS.ch1 = [
          '先确认原始文件是否真的存在第十条记录，不要急着寻找姓名。',
          '比较公示人数、表格行数、缓存留言和备份版本。',
          '三个符号表达“第十人”，拼音答案是 dishiren。'
        ];
        HINTS.ch2 = [
          '证词能帮助恢复身份，但不能直接证明谁修改了系统。',
          '把“看到她在场”“知道她是谁”“知道谁改记录”分成三个问题。',
          '账号索引恢复后，第十位学生才被确认是林知夏。'
        ];
        HINTS.ch3 = [
          '把权限申请、人体传感器、门禁和操作日志分别查看。',
          '临时账号解释了接触后台的可能性，但实际操作人仍需其他证据。',
          '21:45后仍有人；门锁与视频覆盖是两项不同的行为。'
        ];
        HINTS.ch4 = [
          '匿名爆料不是答案，只有能被其他记录验证的部分才是证据。',
          '寻找长期排斥的独立痕迹，以及多人分工的责任链。',
          '评审压力是动机方向，不是免责理由，也不证明所有操作由一人完成。'
        ];
        HINTS.ch5 = [
          '最终选择不仅关乎是否公开，也关乎怎样避免二次伤害。',
          '完整证据链应同时包含在场证明、权限来源、操作分工和审核失察。',
          '最佳处理是隐去受害者隐私、提交可验证材料并保留原始备份。'
        ];
      }
    } catch (error) {
      console.warn('[StoryPatch] 提示文本未能覆盖：', error);
    }
  }

  function apply() {
    if (document.documentElement.dataset.storyPatchVersion === PATCH_VERSION) return;
    document.documentElement.dataset.storyPatchVersion = PATCH_VERSION;

    try {
      patchDateAndPremise();
      patchChapter1();
      patchChapter2();
      patchChapter3();
      patchChapter4();
      patchReviewTimeline();
      patchFinalDecision();
      patchLogicQuestions();
      patchTruthArchive();
      patchEndings();
      patchHints();
      removeVictimBlamingLanguage();
      enhanceHeaderActions();
      patchAudioToggleLabel();
      console.info(`[StoryPatch] 《晚自习留校名单》剧情修订补丁 v${PATCH_VERSION} 已加载。`);
    } catch (error) {
      console.error('[StoryPatch] 应用补丁时出现异常：', error);
    }
  }

  return { apply, version: PATCH_VERSION };
})();

window.StoryRevisionPatch = StoryRevisionPatch;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => StoryRevisionPatch.apply(), { once: true });
} else {
  setTimeout(() => StoryRevisionPatch.apply(), 0);
}

/* ============================================================
 * 提示与自愿支持入口清晰化补丁 v3.1.0
 * 目标：提示完全免费、分级明确；1元支持完全自愿且不影响游戏。
 * ============================================================ */
(function applyHintAndSupportClarityPatch() {
  const PATCH_VERSION = '3.1.0';
  const ROOT_FLAG = 'hintSupportClarityVersion';

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function chapterName(chapter) {
    const map = { ch1: '第一章', ch2: '第二章', ch3: '第三章', ch4: '第四章', ch5: '第五章' };
    return map[chapter] || '当前章节';
  }

  function installClarityStyles() {
    if (document.getElementById('hint-support-clarity-style')) return;
    const style = document.createElement('style');
    style.id = 'hint-support-clarity-style';
    style.textContent = `
      #hint-btn.hint-action-clear {
        width: auto !important;
        min-width: 118px;
        padding: 6px 10px !important;
        border: 1px solid rgba(226, 188, 92, .78) !important;
        background: linear-gradient(180deg, rgba(255,248,219,.98), rgba(242,223,164,.94)) !important;
        color: #5d4714 !important;
        box-shadow: 0 2px 9px rgba(94,70,18,.14);
        gap: 6px !important;
        position: relative;
      }
      #hint-btn.hint-action-clear:hover {
        transform: translateY(-1px);
        background: linear-gradient(180deg, #fff9df, #ead392) !important;
        box-shadow: 0 5px 14px rgba(94,70,18,.20);
      }
      #hint-btn.hint-action-clear .btn-icon {
        width: 17px !important;
        height: 17px !important;
        filter: sepia(.25) saturate(1.2);
      }
      #hint-btn .hint-action-label {
        display: inline !important;
        font-weight: 800;
        letter-spacing: .02em;
      }
      #hint-btn .hint-count-clear {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 30px;
        height: 20px;
        padding: 0 5px;
        border-radius: 999px;
        background: rgba(91,67,13,.12);
        border: 1px solid rgba(91,67,13,.16);
        font-size: .67rem;
        font-weight: 800;
        color: #6c5112;
      }
      #hint-btn.hint-level-1,
      #hint-btn.hint-level-2,
      #hint-btn.hint-level-3 {
        color: #5d4714 !important;
      }
      #hint-btn .hint-badge { display: none !important; }

      .support-chip.support-action-clear {
        min-height: 36px !important;
        padding: 6px 11px !important;
        border: 1px solid rgba(190,105,113,.55) !important;
        background: linear-gradient(180deg, #fff5f5, #f4d8da) !important;
        color: #7f3038 !important;
        box-shadow: 0 2px 9px rgba(111,40,47,.12);
        font-weight: 800 !important;
      }
      .support-chip.support-action-clear:hover {
        transform: translateY(-1px);
        background: linear-gradient(180deg, #fff8f8, #ecc8cc) !important;
        box-shadow: 0 5px 14px rgba(111,40,47,.18);
      }
      .support-chip .support-price-clear {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: 4px;
        padding: 2px 6px;
        border-radius: 999px;
        background: rgba(127,48,56,.12);
        font-size: .68rem;
      }

      #hint-panel.hint-panel-clear {
        width: min(430px, calc(100vw - 24px));
      }
      .hint-free-banner {
        padding: 12px 14px;
        margin-bottom: 14px;
        border: 1px solid rgba(74,132,86,.25);
        border-radius: 10px;
        background: rgba(229,246,232,.72);
        color: #315b39;
        font-size: .8rem;
        line-height: 1.7;
      }
      .hint-free-banner strong { font-weight: 800; }
      .hint-level-guide {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        margin-bottom: 14px;
      }
      .hint-level-guide span {
        display: block;
        padding: 8px 5px;
        border-radius: 8px;
        text-align: center;
        background: rgba(0,0,0,.035);
        border: 1px solid rgba(0,0,0,.065);
        color: var(--text-secondary);
        font-size: .72rem;
        line-height: 1.35;
      }
      .hint-level-guide span.active {
        background: rgba(201,162,39,.14);
        border-color: rgba(201,162,39,.35);
        color: #806615;
        font-weight: 700;
      }
      .hint-empty-clear {
        padding: 18px 12px;
        text-align: center;
        color: var(--text-muted);
        font-size: .82rem;
        line-height: 1.75;
        border: 1px dashed rgba(0,0,0,.12);
        border-radius: 9px;
      }
      .hint-panel-item-clear {
        padding: 12px 14px;
        margin-bottom: 10px;
        border-radius: 0 8px 8px 0;
        background: rgba(0,0,0,.03);
      }
      .hint-panel-item-clear .hint-item-title {
        margin-bottom: 5px;
        font-size: .75rem;
        font-weight: 800;
      }
      .hint-panel-item-clear .hint-item-body {
        color: var(--text-secondary);
        font-size: .86rem;
        line-height: 1.75;
        white-space: pre-line;
      }
      #hint-next-btn.hint-next-clear {
        width: 100%;
        min-height: 42px;
        border-radius: 9px;
        font-weight: 800;
      }
      #hint-next-btn.hint-answer-warning {
        background: #8b5e21 !important;
        border-color: #8b5e21 !important;
      }
      .hint-panel-title .hint-title-count {
        display: inline-flex;
        margin-left: 6px;
        padding: 2px 7px;
        border-radius: 999px;
        background: rgba(255,255,255,.13);
        font-size: .68rem;
        vertical-align: 1px;
      }

      @media (max-width: 1100px) {
        #hint-btn.hint-action-clear {
          width: auto !important;
          min-width: 108px;
          padding: 6px 9px !important;
        }
        #hint-btn.hint-action-clear .hint-action-label { display: inline !important; }
      }
      @media (max-width: 760px) {
        #hint-btn.hint-action-clear { min-width: 104px; }
        .support-chip.support-action-clear { min-width: 112px; }
      }
      @media (max-width: 430px) {
        #hint-btn.hint-action-clear { min-width: 98px; padding: 6px 8px !important; }
        #hint-btn .hint-count-clear { min-width: 26px; padding: 0 4px; }
        .support-chip.support-action-clear { min-width: 105px; padding: 6px 8px !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function updateSupportButton() {
    const support = document.querySelector('.header-actions .support-chip');
    if (!support) return;
    const supported = !!(window.Paywall && typeof Paywall.hasPaid === 'function' && Paywall.hasPaid());
    support.classList.add('support-action-clear');
    support.innerHTML = supported
      ? '<span>已支持作者</span><span class="support-price-clear">感谢</span>'
      : '<span>自愿支持</span><span class="support-price-clear">¥1</span>';
    support.title = supported
      ? '你已在本机记录支持状态，点击可查看感谢信息'
      : '完全自愿支持作者；不购买提示、不解锁剧情，不影响完整游玩';
    support.setAttribute('aria-label', supported ? '已支持作者，查看感谢信息' : '自愿支付一元支持作者');
  }

  function updateHintHeaderState(chapter) {
    const btn = document.getElementById('hint-btn');
    if (!btn) return;
    const current = chapter || currentChapterHint || 'ch1';
    const used = Math.min(3, (GameState.hintClicks && GameState.hintClicks[current]) || 0);
    btn.classList.add('header-action-labeled', 'hint-action-clear');
    btn.classList.remove('hint-level-1', 'hint-level-2', 'hint-level-3');
    if (used > 0) btn.classList.add(`hint-level-${used}`);
    btn.innerHTML = `
      <img src="icon-bulb.svg" class="icon-img btn-icon" alt="" aria-hidden="true">
      <span class="hint-action-label">${used ? '查看提示' : '获取提示'}</span>
      <span class="hint-count-clear">${used}/3</span>
    `;
    btn.title = `免费分级提示：方向、具体指引、接近答案。当前已获取 ${used}/3，使用提示不影响结局。`;
    btn.setAttribute('aria-label', `${chapterName(current)}免费提示，已获取${used}级，共3级`);
  }

  function renderClearHintPanel() {
    const panel = document.getElementById('hint-panel');
    const body = document.getElementById('hint-panel-body');
    const nextBtn = document.getElementById('hint-next-btn');
    const title = panel && panel.querySelector('.hint-panel-title');
    if (!body) return;

    if (panel) panel.classList.add('hint-panel-clear');
    const chapter = currentChapterHint || 'ch1';
    if (!GameState.hintClicks) GameState.hintClicks = {};
    const used = Math.min(3, GameState.hintClicks[chapter] || 0);
    const labels = ['方向提示', '具体指引', '接近答案'];
    const colors = ['#4f8558', '#a78313', '#8b5e21'];

    if (title) {
      title.innerHTML = `<img src="icon-bulb.svg" class="icon-img inline-icon" alt="" style="width:18px;height:18px;vertical-align:middle;"> ${chapterName(chapter)}提示 <span class="hint-title-count">${used}/3</span>`;
    }

    let html = `
      <div class="hint-free-banner">
        <strong>提示完全免费</strong>，不需要支付，也不会影响结局或调查进度。建议按需逐级查看，第三等级会接近完整答案。
      </div>
      <div class="hint-level-guide">
        ${labels.map((label, index) => `<span class="${index < used ? 'active' : ''}">${index + 1}. ${label}</span>`).join('')}
      </div>
    `;

    if (used === 0) {
      html += '<div class="hint-empty-clear">尚未使用本章提示。点击下方按钮先获取不剧透的“方向提示”。</div>';
    } else {
      for (let i = 0; i < used; i++) {
        const rawHint = getContextualHint(chapter, i) || (HINTS[chapter] || ['保持冷静，仔细梳理已有信息。'])[0];
        html += `
          <div class="hint-panel-item-clear" style="border-left:3px solid ${colors[i]};">
            <div class="hint-item-title" style="color:${colors[i]};">${i + 1}/3 · ${labels[i]}</div>
            <div class="hint-item-body">${escapeHTML(rawHint)}</div>
          </div>
        `;
      }
    }
    body.innerHTML = html;

    if (nextBtn) {
      nextBtn.classList.add('hint-next-clear');
      nextBtn.classList.remove('hint-answer-warning');
      if (used >= 3) {
        nextBtn.textContent = '本章3级提示已全部获取，可在上方反复查看';
        nextBtn.disabled = true;
        nextBtn.style.opacity = '.62';
        nextBtn.style.cursor = 'not-allowed';
      } else {
        nextBtn.disabled = false;
        nextBtn.style.opacity = '';
        nextBtn.style.cursor = '';
        nextBtn.textContent = used === 0
          ? '免费获取：方向提示（1/3）'
          : used === 1
            ? '继续获取：具体指引（2/3）'
            : '查看接近答案的提示（3/3）';
        if (used === 2) nextBtn.classList.add('hint-answer-warning');
      }
    }
    updateHintHeaderState(chapter);
  }

  function getClearHint(chapter) {
    const targetChapter = chapter || currentChapterHint || 'ch1';
    if (!GameState.hintClicks) GameState.hintClicks = {};
    const currentLevel = Math.min(3, GameState.hintClicks[targetChapter] || 0);
    if (currentLevel >= 3) {
      toggleHintPanel(true);
      renderClearHintPanel();
      return;
    }

    GameState.hintClicks[targetChapter] = currentLevel + 1;
    const label = ['方向提示', '具体指引', '接近答案'][currentLevel];
    const hint = getContextualHint(targetChapter, currentLevel)
      || (HINTS[targetChapter] || ['保持冷静，仔细梳理已有信息。'])[0];
    showHint(`[免费提示 ${currentLevel + 1}/3 · ${label}]\n${hint}`, 5600);
    saveGame(false);
    toggleHintPanel(true);
    renderClearHintPanel();
  }

  function openHintPanelWithoutConsuming() {
    const panel = document.getElementById('hint-panel');
    if (panel && panel.classList.contains('open')) {
      toggleHintPanel(false);
      return;
    }
    toggleHintPanel(true);
    renderClearHintPanel();
  }

  function showClearSupportPaywall() {
    if (!window.Paywall) {
      showToast('支持组件尚未加载，请刷新页面后重试');
      return;
    }
    Paywall.show({
      title: '自愿支持《晚自习留校名单》',
      price: '¥1',
      studio: 'abc studio',
      qrCode: 'paycode.png',
      paymentName: '支付宝'
    });
  }

  function replaceAutomaticPaywallWithNotice() {
    window.maybeShowSupportPaywall = maybeShowSupportPaywall = function maybeShowSupportNotice() {
      const clarityNoticeKey = 'nightstudy_support_clarity_notice_v2';
      if (localStorage.getItem(clarityNoticeKey)) return;
      localStorage.setItem(clarityNoticeKey, '1');
      setTimeout(() => {
        showToast('右上角“获取提示”完全免费；“自愿支持 ¥1”仅用于支持作者，不影响剧情、提示和结局。', 6800);
      }, 1400);
    };
  }

  function install() {
    if (document.documentElement.dataset[ROOT_FLAG] === PATCH_VERSION) return;
    document.documentElement.dataset[ROOT_FLAG] = PATCH_VERSION;
    installClarityStyles();
    replaceAutomaticPaywallWithNotice();

    window.showSupportPaywall = showSupportPaywall = showClearSupportPaywall;
    window.renderHintPanel = renderHintPanel = renderClearHintPanel;
    window.getHint = getHint = getClearHint;
    window.onHintButtonClick = onHintButtonClick = openHintPanelWithoutConsuming;
    window.updateHintButtonState = updateHintButtonState = updateHintHeaderState;

    const nextBtn = document.getElementById('hint-next-btn');
    if (nextBtn) nextBtn.setAttribute('onclick', 'getHint(currentChapterHint)');
    const hintBtn = document.getElementById('hint-btn');
    if (hintBtn) hintBtn.setAttribute('onclick', 'onHintButtonClick()');

    updateHintHeaderState(currentChapterHint || 'ch1');
    updateSupportButton();

    document.addEventListener('paywall:supported', updateSupportButton);
    console.info(`[UXPatch] 提示与自愿支持入口清晰化补丁 v${PATCH_VERSION} 已加载。`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    setTimeout(install, 0);
  }
})();
