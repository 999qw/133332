// 赵元贞集 · 应用逻辑
// 从 index.html 内联脚本抽出，以便启用严格 CSP (script-src 'self')
// ===== DATA LAYER =====
let allData = {};
let currentBook = '';
let currentIdx = 0;
let listScrollY = 0;
let lastBook = '';
let pageWheel = null;      // 首页阻尼句柄
let readingWheel = null;   // 阅读层阻尼句柄
const VIEW_TRANSITION_MS = 320;

// ===== COMMENTS: TWIKOO =====
// 评论系统 = Twikoo（自建云函数 + MongoDB）。访客只需填昵称即可评论，无需注册任何账号。
//   后端：Netlify 云函数 https://zhaoyuan.netlify.app/.netlify/functions/twikoo
//   数据：MongoDB Atlas 免费集群
//   前端：twikoo.min.js 与本文件同源自托管，不依赖任何 CDN
// 管理后台：打开任一文章评论区 → 点右下角「小齿轮」图标 → 设置管理员密码
// 数据备份：在 MongoDB Atlas 对 twikoo 库做导出即可
const TWIKOO_CONFIG = {
  envId: 'https://zhaoyuan.netlify.app/.netlify/functions/twikoo',
  lang: 'zh-CN'
};

function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function splitEmbeddedArticle(list, id, marker, meta) {
  const item = list.find(article => article.id === id);
  if (!item || !item.content) return;
  const match = item.content.match(marker);
  if (!match) return;
  const start = match.index;
  const embeddedContent = item.content.slice(start + match[0].length).trim();
  item.content = item.content.slice(0, start).trim();
  list.splice(list.indexOf(item) + 1, 0, {
    ...meta,
    content: embeddedContent,
    content_mode: meta.content_mode || 'prose',
    id: `${id}-split`
  });
}

function repairEmbeddedArticles(list) {
  splitEmbeddedArticle(list, '未分类-37', /\n形策论文\n2024\n年\n5\n月\n26\n日\n\|\n字\n+/, {
    title: '形策论文', date: '2024年5月26日', content_mode: 'prose'
  });
  splitEmbeddedArticle(list, '未分类-52', /\n标题\n2023\n年\n9\n月\n22\n日\n\|\s*939\n字\n+/, {
    title: '标题', date: '2023年9月22日 | 939字', content_mode: 'prose'
  });
  splitEmbeddedArticle(list, '未分类-53', /\n灞水\n2023\n年\n9\n月\n22\n日\n\|\s*622\n字\n+/, {
    title: '灞水', date: '2023年9月22日 | 622字', content_mode: 'prose'
  });
  splitEmbeddedArticle(list, '未分类-74', /\n标题\n2023\n年\n4\n月\n20\n日\n\|\s*391\n字\n+/, {
    title: '标题', date: '2023年4月20日 | 391字', content_mode: 'prose'
  });
  const poem = list.find(article => article.id === '未分类-52');
  if (poem) poem.content_mode = 'poetry';
}

function repairEmbeddedJinshangArticles(list) {
  splitEmbeddedArticle(list, '今上实录-67', /\n拾遗·述志\n2024\n年\n9\n月\n20\n日\n21\n：\n59\s*\|\s*56\n字\n+/, {
    title: '拾遗·述志', date: '2024年9月20日 21:59 | 56字', content_mode: 'poetry'
  });
  splitEmbeddedArticle(list, '今上实录-68', /\n拾遗·作于长春\n2024\n年\n9\n月\n20\n日\n不详\n:\n不详\n\|\s*126\n字\n+/, {
    title: '拾遗·作于长春', date: '2024年9月20日 | 126字', content_mode: 'poetry'
  });
}

function initData() {
  const jinshangData = window.JINSHANG_DATA || {};
  const suibiData = window.SUIBI_DATA || {};

  const jinshangFlat = [];
  for (const [section, articles] of Object.entries(jinshangData)) {
    if (Array.isArray(articles)) {
      articles.forEach(a => jinshangFlat.push({ ...a, section }));
    }
  }
  allData['今上实录'] = jinshangFlat;
  repairEmbeddedJinshangArticles(jinshangFlat);

  let suibiList = [];
  let weifenleiList = [];
  if (Array.isArray(suibiData['随笔']) && Array.isArray(suibiData['未分类'])) {
    suibiList = suibiData['随笔'];
    weifenleiList = suibiData['未分类'];
  } else {
    for (const [, arr] of Object.entries(suibiData)) {
      if (!Array.isArray(arr)) continue;
      arr.forEach(a => {
        if (a && a.id && String(a.id).startsWith('未分类')) weifenleiList.push(a);
        else suibiList.push(a);
      });
    }
  }
  allData['随笔'] = suibiList;
  allData['未分类'] = weifenleiList;
  repairEmbeddedArticles(weifenleiList);

  console.log('Data loaded:', {
    今上实录: jinshangFlat.length,
    随笔: suibiList.length,
    未分类: weifenleiList.length
  });
}

function updateReadingContext() {
  const items = allData[currentBook] || [];
  const context = document.getElementById('readingContext');
  if (context) context.textContent = currentBook ? `${currentBook} · ${currentIdx + 1} / ${items.length}` : '选择一卷开始阅读';
  const prev = document.getElementById('prevArticle');
  const next = document.getElementById('nextArticle');
  if (!prev || !next) return;
  const setButton = (button, item, label) => {
    button.disabled = !item;
    button.querySelector('small').textContent = label;
    button.querySelector('span').textContent = item ? (item.title || '标题') : '没有了';
  };
  setButton(prev, items[currentIdx - 1], '上一篇');
  setButton(next, items[currentIdx + 1], '下一篇');
}

function adjustReadingSize(delta) {
  const root = document.documentElement;
  const current = parseFloat(getComputedStyle(root).getPropertyValue('--reader-size')) || 1.05;
  const next = Math.min(1.35, Math.max(0.9, Number((current + delta).toFixed(2))));
  root.style.setProperty('--reader-size', `${next}em`);
  localStorage.setItem('reader-size', String(next));
  const label = document.getElementById('readingSizeLabel');
  if (label) label.textContent = next === 1.05 ? '标准' : `${Math.round(next / 1.05 * 100)}%`;
}

function toggleReaderTheme() {
  const paper = document.body.classList.toggle('reader-paper');
  localStorage.setItem('reader-theme', paper ? 'paper' : 'dark');
  const button = document.getElementById('themeToggle');
  if (button) button.textContent = paper ? '暗色' : '暖纸';
  syncTwikooTheme();
}

function initReaderSettings() {
  const savedSize = parseFloat(localStorage.getItem('reader-size'));
  if (Number.isFinite(savedSize)) {
    document.documentElement.style.setProperty('--reader-size', `${Math.min(1.35, Math.max(0.9, savedSize))}em`);
    const label = document.getElementById('readingSizeLabel');
    if (label) label.textContent = savedSize === 1.05 ? '标准' : `${Math.round(savedSize / 1.05 * 100)}%`;
  }
}

function navigateArticle(delta) {
  const items = allData[currentBook] || [];
  const nextIdx = currentIdx + delta;
  if (items[nextIdx]) showArticle(currentBook, nextIdx, delta < 0 ? 'prev' : 'next');
}

function splitAnnotationEntries(annotation) {
  const normalized = annotation.replace(/\s+/g, ' ').trim().replace(/包邮/g, '抱有');
  if (!normalized) return [];
  const speakerParts = normalized.split(/(?=(?:老师|元贞)：)/).map(text => text.trim()).filter(Boolean);
  const entries = [];
  speakerParts.forEach(segment => {
    const quoted = segment.match(/[“‘][\s\S]*?[”’]/g);
    if (quoted && quoted.length) {
      quoted.forEach(text => entries.push(text.trim()));
      const remainder = segment.replace(/[“‘][\s\S]*?[”’]/g, '').trim();
      if (remainder && !/^后记/.test(remainder)) entries.unshift(remainder);
    } else {
      entries.push(segment);
    }
  });
  return entries;
}

function splitArticleContent(raw, title) {
  let parts = raw.split('||');
  let body = parts.shift() || '';
  // 后记内容一律算正文（不再塞进注释框）。
  // 唯一例外：单独一行的「后记【N】」小标签仍放注释里当标记。
  const postscript = body.search(/\n后记(?=\s*(?:【|$))/);
  if (postscript > -1) {
    const tail = body.slice(postscript).trim();
    if (/^后记【?\d*】?[^\n]{0,2}$/.test(tail)) {
      parts.unshift(tail);
      body = body.slice(0, postscript).trim();
    }
  }
  return { body: body.replace(/\n11\.16\s*$/, '').trim(), annotations: parts.filter(Boolean) };
}

function splitPoetryLines(body, item) {
  const lines = body.split('\n').map(line => line.trim()).filter(Boolean);
  if (body.startsWith('论语·公冶长篇')) {
    return lines.flatMap(line => line.match(/[^。！？；]+[。！？；]?/g) || [line]);
  }
  return lines;
}

function updateReadingProgress() {
  const bar = document.querySelector('#readingProgress span');
  const view = document.getElementById('articleView');
  const scroller = document.getElementById('reading');
  if (!bar || !view || !scroller || view.style.display === 'none') {
    if (bar) bar.style.width = '0%';
    return;
  }
  // 阅读区现在是独立滚动的容器，进度按容器自身的滚动量计算
  const max = scroller.scrollHeight - scroller.clientHeight;
  bar.style.width = `${max > 0 ? Math.min(100, (scroller.scrollTop / max) * 100) : 0}%`;
}

function openSearch() {
  const panel = document.getElementById('searchPanel');
  const input = document.getElementById('searchInput');
  if (!panel) return;
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  renderSearchResults('');
  requestAnimationFrame(() => input && input.focus());
}

function closeSearch() {
  const panel = document.getElementById('searchPanel');
  if (!panel) return;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
}

function renderSearchResults(query) {
  const results = document.getElementById('searchResults');
  if (!results) return;
  const needle = String(query || '').trim().toLowerCase();
  if (needle.length < 2) {
    results.innerHTML = '<div class="search-empty">输入至少两个字，搜索标题或正文</div>';
    return;
  }
  const matches = [];
  Object.entries(allData).forEach(([book, items]) => items.forEach((item, idx) => {
    const haystack = `${item.title || '标题'} ${item.content || ''}`.toLowerCase();
    if (haystack.includes(needle)) matches.push({ book, item, idx });
  }));
  if (!matches.length) {
    results.innerHTML = '<div class="search-empty">没有找到相应文字</div>';
    return;
  }
  results.innerHTML = matches.slice(0, 40).map(({ book, item, idx }) => {
    const title = escapeHtml(item.title || '标题');
    const raw = String(item.content || '').replace(/\s+/g, ' ');
    const pos = raw.toLowerCase().indexOf(needle);
    const start = Math.max(0, pos - 24);
    const snippet = escapeHtml(raw.slice(start, start + 56));
    return `<button class="search-result" onclick="closeSearch(); openBook('${escapeHtml(book)}'); setTimeout(() => showArticle('${escapeHtml(book)}', ${idx}, 'next'), 950)"><strong>${title}</strong><small>${escapeHtml(book)} · ${escapeHtml(item.date || '')}</small><span>${snippet}${raw.length > start + 56 ? '…' : ''}</span></button>`;
  }).join('');
}

function debouncedSearch(query) {
  clearTimeout(window._searchTimer);
  window._searchTimer = setTimeout(() => renderSearchResults(query), 150);
}

function restoreArticleFromHash() {
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const book = params.get('article');
  const idx = Number(params.get('index'));
  const VALID_BOOKS = ['今上实录', '随笔', '未分类'];
  if (book && VALID_BOOKS.includes(book) && Number.isInteger(idx) && allData[book] && allData[book][idx]) {
    openBook(book);
    setTimeout(() => showArticle(book, idx), 80);
  }
}

// ===== 翻页（翻书）动画 =====
// 竖条不是各自平移的独立方块 —— 那样速度不同必然撕出缝隙。这里把整幅帘子切成
// 8 段，每段由左右两条「缝」界定；缝按各自的缓动指数推进，段宽随之伸缩。
//   · 指数 k 各不相同            -> 速度肉眼可见地不一
//   · k 全都 > 1                 -> 起步慢，走起来稳
//   · 指数越大进度越小且恒成立    -> 缝的先后顺序永不颠倒，相邻缝间距恒 >= 12.5vw
//                                   => 全程严丝合缝，既不重叠也不露白
// 入/出两段共用一条不中断的时间轴，缓动 p^k 与 1-(1-p)^k 在接缝处速度恰好相等
// （都等于 k），所以动作一口气贯通，中途不会刹停。
const FLIP_N = 8;
const FLIP_PITCH = 100 / FLIP_N;                                              // 每段基准宽 12.5vw
const FLIP_PHASE_MS = 580;                                                    // 单程时长
const FLIP_TOTAL_MS = FLIP_PHASE_MS * 2;
// 两套色板，索引 0 = 帘子最左端，索引 7 = 最右端（全程成立，帘子走到哪都一致）。
//
// 甲、书卡 -> 列表：维持原样（左暗金、右深棕，统一 70% 不透明度）。
const FLIP_PALETTE_LIST = [
  'rgba(201,169,110,0.70)',   // 最左：暗金
  'rgba(182,153,99,0.70)',
  'rgba(164,136,89,0.70)',
  'rgba(145,120,78,0.70)',
  'rgba(126,103,68,0.70)',
  'rgba(107,87,57,0.70)',
  'rgba(89,70,47,0.70)',
  'rgba(70,54,36,0.70)'       // 最右：深棕
];
//
// 乙、上一篇 / 下一篇：左侧金黄，越往右颜色越淡、同时越透明。
// 平均不透明度 0.55（甲为 0.70），所以整体更暗；但最右一档仍落在褐色区间，
// 叠在页面底色上是 rgb(41,32,24) 量级的深褐，不会压成纯黑。
const FLIP_PALETTE_ARTICLE = [
  'rgba(214,176,92,0.88)',    // 最左：金黄
  'rgba(199,163,86,0.80)',
  'rgba(180,147,80,0.71)',
  'rgba(158,129,73,0.61)',
  'rgba(134,110,66,0.50)',
  'rgba(114,93,58,0.39)',
  'rgba(102,81,53,0.29)',
  'rgba(96,76,50,0.22)'       // 最右：褐色（极淡，但非纯黑）
];
const FLIP_COLORS_COUNT = 8;   // 帘子的竖条数（与色板长度一致）
const FLIP_K = Array.from({ length: FLIP_N + 1 }, (_, i) => 1.5 + 0.16 * i);
let flipBusy = false;

const easeInPow  = (p, k) => Math.pow(p, k);
const easeOutPow = (p, k) => 1 - Math.pow(1 - p, k);

function ensureFlipBars() {
  const layer = document.getElementById('pageFlip');
  if (!layer) return null;
  if (!layer.childElementCount) {
    for (let i = 0; i < FLIP_COLORS_COUNT; i++) {
      const el = document.createElement('div');
      el.className = 'flip-bar';
      layer.appendChild(el);
    }
  }
  return Array.from(layer.querySelectorAll('.flip-bar'));
}

// 每次扫动按传入的色板着色 —— 两类转场因此可以用不同的色彩与透明度
function paintFlipColors(bars, palette) {
  bars.forEach((el, i) => { el.style.background = palette[i % palette.length]; });
}

function paintFlip(bars, pos) {
  for (let i = 0; i < FLIP_N; i++) {
    bars[i].style.left = pos[i] + 'vw';
    // +0.08vw 是给子像素舍入留的余量，肉眼不可见，但能防止细如发丝的白缝
    bars[i].style.width = (pos[i + 1] - pos[i] + 0.08) + 'vw';
  }
}

// direction: 'next' 帘子从右往左扫；'prev' 为完全相反的逆向
// swapFn:     在帘子铺满屏幕、旧内容完全被遮住的那一刻执行内容替换
// fadeTarget: 帘子后面要做交叉淡变的元素（旧内容淡出 -> 替换 -> 新内容淡入），
//             传了它，画面变化就是渐变而不是突变
function playPageFlip(direction, swapFn, fadeTarget, palette) {
  const layer = document.getElementById('pageFlip');
  const bars = ensureFlipBars();
  if (!layer || !bars || !bars.length || flipBusy) {
    if (swapFn) swapFn();
    return Promise.resolve();
  }
  const forward = direction !== 'prev';
  const offA  = i => (forward ? 100 : -100) + FLIP_PITCH * i;   // 起始整幅停在屏幕外
  const cover = i => FLIP_PITCH * i;                            // 铺满屏幕
  const offB  = i => (forward ? -100 : 100) + FLIP_PITCH * i;   // 收尾整幅滑出另一侧

  if (palette) paintFlipColors(bars, palette);

  flipBusy = true;
  layer.classList.add('on');
  if (fadeTarget) fadeTarget.style.transition = 'none';         // 由 rAF 逐帧驱动，禁用 CSS 过渡

  let swapped = false;
  const start = performance.now();

  return new Promise(resolve => {
    const step = now => {
      const t = now - start;

      // 替换恰好发生在帘子铺满屏幕的那一刻，时间轴本身不中断
      if (t >= FLIP_PHASE_MS && !swapped) {
        swapped = true;
        if (swapFn) swapFn();
      }

      const pos = [];
      for (let i = 0; i <= FLIP_N; i++) {
        const k = FLIP_K[i];
        if (t <= FLIP_PHASE_MS) {
          const p = Math.min(1, t / FLIP_PHASE_MS);
          pos.push(offA(i) + (cover(i) - offA(i)) * easeInPow(p, k));
        } else {
          const p = Math.min(1, (t - FLIP_PHASE_MS) / FLIP_PHASE_MS);
          pos.push(cover(i) + (offB(i) - cover(i)) * easeOutPow(p, k));
        }
      }
      paintFlip(bars, pos);

      if (fadeTarget) {
        let o;
        if (t <= FLIP_PHASE_MS) {
          // 后半程开始把旧内容淡出
          o = 1 - Math.max(0, (t / FLIP_PHASE_MS - 0.45) / 0.55);
        } else {
          // 替换完成后，新内容用前半程时间淡入
          o = Math.min(1, (t - FLIP_PHASE_MS) / (FLIP_PHASE_MS * 0.6));
        }
        fadeTarget.style.opacity = String(Math.round(o * 1000) / 1000);
      }

      if (t < FLIP_TOTAL_MS) {
        requestAnimationFrame(step);
      } else {
        layer.classList.remove('on');
        if (fadeTarget) {
          fadeTarget.style.opacity = '';
          fadeTarget.style.transition = '';
        }
        flipBusy = false;
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

// ===== BOOK NAVIGATION =====
function openBook(bookName) {
  const items = allData[bookName];
  if (!items || items.length === 0) {
    document.getElementById('articleListItems').innerHTML =
      '<p style="color:var(--gold-dim);text-align:center;padding:40px;">暂无内容</p>';
    return;
  }

  lastBook = bookName;
  document.getElementById('listTitle').textContent = bookName;
  const listEl = document.getElementById('articleListItems');
  const articleList = document.getElementById('articleList');
  const articleView = document.getElementById('articleView');
  listEl.innerHTML = '';

  // 墨线分布：隔 2 行 → 隔 3 行 → 隔 2 行 → 隔 4 行，循环。
  // 想让位置完全随机，把下面一行换成：
  //   const inkRows = new Set(items.map((_, i) => i).filter(() => Math.random() < 0.3));
  const INK_GAPS = [2, 3, 2, 4];
  const inkRows = new Set();
  for (let i = 1, g = 0; i < items.length; i += INK_GAPS[g++ % INK_GAPS.length] + 1) inkRows.add(i);

  items.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'article-list-item';
    if (inkRows.has(idx)) div.classList.add('ink-row');
    let displayTitle = item.title || '标题';
    const MAX_TITLE = 60;
    if (displayTitle.length > MAX_TITLE) {
      const m = displayTitle.match(/^(标题\s+\d{4}\s*年.*?字\s+)/);
      if (m) displayTitle = m[1] + '…';
      else displayTitle = displayTitle.substring(0, MAX_TITLE) + '…';
    }
    div.innerHTML = `
      <span class="hover-gold"></span>
      <span class="hover-ink"></span>
      <span class="item-title">${escapeHtml(displayTitle)}</span>
      <span class="item-meta">${escapeHtml(item.date || '')}</span>
    `;
    // 每个条目的墨点随机错位，避免所有条目花纹一样
    const hoverInk = div.querySelector('.hover-ink');
    if (hoverInk) {
      hoverInk.style.backgroundPosition =
        `${-Math.round(Math.random() * 620)}px ${-Math.round(Math.random() * 96)}px`;
    }
    div.addEventListener('click', () => showArticle(bookName, idx, 'next'));
    listEl.appendChild(div);
  });

  // 列表内容已经构建完毕，再用翻页动画把它「揭示」出来
  articleList.classList.remove('fade-out');
  articleView.classList.remove('fade-out');
  articleList.style.display = 'block';
  articleList.style.opacity = '1';
  articleList.style.transform = 'translateY(0)';
  articleView.style.display = 'none';
  updateReadingContext();
  updateReadingProgress();

  const readingEl = document.getElementById('reading');
  cancelDampedScroll();
  playPageFlip('next', () => {
    readingEl.classList.add('active');
    document.body.classList.add('reading-open');   // 锁定主页面滚动
    readingEl.scrollTop = 0;
  }, readingEl, FLIP_PALETTE_LIST);
}

function closeBook() {
  cancelDampedScroll();
  document.getElementById('reading').classList.remove('active');
  // 解除锁定即可回到主页面；主页面原有滚动位置保持不变
  document.body.classList.remove('reading-open');
}

function showList() {
  const listEl = document.getElementById('articleList');
  const viewEl = document.getElementById('articleView');
  viewEl.classList.add('fade-out');
  setTimeout(() => {
    viewEl.style.display = 'none';
    viewEl.classList.remove('fade-out');
    listEl.style.display = 'block';
    listEl.classList.remove('fade-out');
    listEl.style.opacity = '0';
    listEl.style.transform = 'translateY(-12px)';
    void listEl.offsetWidth;
    listEl.style.opacity = '1';
    listEl.style.transform = 'translateY(0)';
    requestAnimationFrame(() => {
      // 恢复列表页自己的滚动位置（阅读层内部滚动，不再动整个文档）
      cancelDampedScroll();
      document.getElementById('reading').scrollTo({ top: listScrollY, behavior: 'smooth' });
    });
  }, VIEW_TRANSITION_MS);
}

// ===== ARTICLE VIEW =====
function showArticle(bookName, idx, direction) {
  currentBook = bookName;
  currentIdx = idx;
  const items = allData[bookName];
  if (!items || !items[idx]) return;

  const item = items[idx];
  const listEl = document.getElementById('articleList');
  const viewEl = document.getElementById('articleView');
  listScrollY = document.getElementById('reading').scrollTop;
  cancelDampedScroll();

  const title = item.title || '标题';
  const raw = item.content || '';
  const mode = item.content_mode || 'prose';

  history.replaceState(null, '', `#article=${encodeURIComponent(bookName)}&index=${idx}`);

  // 正文只在翻页动画遮满屏幕的那一刻才真正渲染，避免提前露出下一篇的内容
  const renderBody = () => {
    const bodyEl = document.getElementById('articleBody');
    bodyEl.innerHTML = '';
    const split = splitArticleContent(raw, title);
    const body = split.body;
    const parts = split.annotations;
    const bodyParagraphs = mode === 'poetry'
      ? splitPoetryLines(body, item)
      : body.split(/\n\s*\n/).map(block => block.replace(/\n/g, '').trim()).filter(Boolean);
    bodyParagraphs.forEach(text => {
      const p = document.createElement('p');
      p.textContent = text;
      bodyEl.appendChild(p);
    });
    parts.forEach(annotation => {
      const entries = splitAnnotationEntries(annotation);
      entries.forEach(text => {
        const ann = document.createElement('p');
        ann.className = 'annotation';
        ann.textContent = text;
        bodyEl.appendChild(ann);
      });
    });
  };

  playPageFlip(direction, () => {
    document.getElementById('articleTitle').textContent = title;
    document.getElementById('articleMeta').textContent = item.date || '';
    renderBody();
    updateReadingContext();
    listEl.style.display = 'none';
    listEl.classList.remove('fade-out');
    viewEl.style.display = 'block';
    viewEl.classList.remove('fade-out');
    viewEl.style.opacity = '1';
    viewEl.style.transform = 'translateY(0)';
    initComments(bookName, idx);
    // 详情页从顶部开始展示，不会滚到列表/主页面
    cancelDampedScroll();   // 翻页动画期间可能又累积了新的阻尼目标
    document.getElementById('reading').scrollTo({ top: 0, behavior: 'auto' });
    updateReadingProgress();
  }, viewEl, FLIP_PALETTE_ARTICLE);
}

// ===== TWIKOO COMMENTS =====
// Twikoo 用 path 区分文章。本站是 hash 路由的 SPA，所有文章共用同一个 URL 路径，
// 因此必须显式传入每篇唯一的 path（如「今上实录-5」），否则所有文章的评论会串在一起。
function twikooIsDark() {
  return !document.body.classList.contains('reader-paper');
}

function applyTwikooTheme() {
  const container = document.getElementById('twikoo-container');
  if (!container) return;
  if (twikooIsDark()) {
    container.setAttribute('data-theme', 'dark');
  } else {
    container.removeAttribute('data-theme');
  }
}

// 关键：Twikoo 基于 Vue 2，其 $mount(el) 会把宿主元素「整个替换」成 <div id="twikoo" class="twikoo">。
// 也就是说 #twikoo-container 在首次挂载后就不存在了。若继续复用它，第二次 init 会因取不到元素而
// 静默失效——页面便会一直停留在第一篇文章的评论上（表现为「评论在所有文章下都看得见」）。
// 正确做法：把挂载点放在一个永不替换的固定宿主 #twikoo-host 里，每次切换文章都重建挂载点。
function initComments(bookName, idx) {
  const host = document.getElementById('twikoo-host');
  if (!host) return;
  if (typeof twikoo === 'undefined') {
    host.textContent = '评论组件加载失败，请刷新页面重试。';
    return;
  }
  const mount = document.createElement('div');
  mount.id = 'twikoo-container';
  while (host.firstChild) host.removeChild(host.firstChild);
  host.appendChild(mount);
  applyTwikooTheme();
  return twikoo.init({
    envId: TWIKOO_CONFIG.envId,
    el: '#twikoo-container',
    path: `${bookName}-${idx}`,
    lang: TWIKOO_CONFIG.lang,
    meta: ['nick']
  }).catch(() => {});
}

// 切换「暖纸 / 暗色」时同步评论区配色
function syncTwikooTheme() {
  applyTwikooTheme();
}

// ===== QUOTES: HERO =====
const heroQuotes = [
  "一切事来都相随，点点滴滴，汇成山和海。",
  "凭栏一望千城雪，杨花尽处，同是风千里。",
  "此际留花应不住，且随风去是归期。",
  "一任南北风，一去三四里。",
  "曾许星间月，自在流云时。",
  "感意长如此，水静春声远。",
  "忧来且行酒，月下江水碧。",
  "吾辈岂复欢乐如今夜？但使暮云归去换凉月！",
  "自古狂生临台多文略，安可使我无酒对金阙！",
  "高山入青云，流水觅争欢。山水交相映，万物终复始。",
  "修佛何必求佛，佛性即人性，见自己即见真佛。",
  "红叶落，秋意浓，湿雨落梅花。",
  "如一尾竞跃的鲤鱼，一头扎进春秋际会的烟波中。",
  "世界的意义，在于我能遇到你。",
  "时时无一时，处处无一处，万物归古烬，燃灯待来人。",
  "秋风明月轻瘦，泪横流，晚来长河孤影对月酬。",
  "秋雨落秋花，清风送霜华，山色徘徊老，星河醉乘槎。",
  "星星几回顾，笑看人间风物。",
  "一任春风如流水，去也无穷已。",
  "伟力天纵，可叹生不逢时，抱拙守贞，难为旧日文章。",
  "桥边卧月流水天星。除金簪尽去对风吟。",
  "人间世短，而轮回又短；人间世苦，而轮回亦苦。",
  "他们一无所有却拥有一切，我拥有一切却一无所有。",
  "唯愿，使我皇帝陛下万万年。",
  "快意拭秋风。",
  "愿你此生纯净如水。",
  "君不见，楚子方十里，乃敢分阵引弦向中国。",
  "北出阙门十余里，风止息。望骊山之高兮，临于渭。",
  "秦女当日教画舫，犹自顾秋江。",
  "醉里荡江舟，归去更无期。"
];
const heroEl = document.getElementById('heroQuote');
const heroWrap = document.getElementById('heroQuoteWrap');
const sepEl = document.getElementById('sepQuote');
const sepWrap = document.getElementById('sepQuoteWrap');

// ===== 诗句：激光扫描切换 =====
// 白线以匀速掠过诗句，扫到哪就把文字消到哪；完全消除后停顿 0.5 秒，
// 再自左向右以完全相反的动画把下一句「写」出来。
const LASER_ERASE_MS = 1150;  // 消除用时
const LASER_GAP_MS   = 500;   // 完全消除后的停顿
const LASER_WRITE_MS = 1150;  // 写回用时

const wait = ms => new Promise(r => setTimeout(r, ms));

// 白线的推进曲线：中段近似匀速，两端略微放慢（不是停住，端速约为中段的 45%）。
// 做法是把线性进度与 smoothstep 按 0.45 混合 —— 既保留中段的匀速感，
// 又让起步和收尾有缓冲。
const easeLaser = p => p + (p * p * (3 - 2 * p) - p) * 0.45;

// 硬边位置用百分比表示：0 = 文字最左端，100 = 最右端
function laserSweep(textEl, wrapEl, ms, fromPct, toPct) {
  return new Promise(resolve => {
    const laser = wrapEl.querySelector('.quote-laser');
    const start = performance.now();
    wrapEl.classList.add('lasing');
    const step = now => {
      const p = Math.min(1, (now - start) / ms);
      const edge = fromPct + (toPct - fromPct) * easeLaser(p);  // 变速：中段匀速，两端稍慢
      textEl.style.clipPath = `inset(0 ${100 - edge}% 0 0)`;   // 硬边裁切，边落在 edge 处
      if (laser) laser.style.left = `calc(${edge}% - 1px)`;    // 白线骑在硬边上
      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        wrapEl.classList.remove('lasing');
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

function startQuoteLaser(textEl, wrapEl, quotes, wrapFn, dwellMs, startIndex) {
  if (!textEl || !wrapEl) return;
  let i = ((startIndex % quotes.length) + quotes.length) % quotes.length;
  const paint = hide => {
    textEl.textContent = wrapFn(quotes[i]);
    textEl.style.clipPath = hide ? 'inset(0 100% 0 0)' : '';
  };
  paint(false);

  (async () => {
    for (;;) {
      await wait(dwellMs);
      await laserSweep(textEl, wrapEl, LASER_ERASE_MS, 100, 0);   // 自右向左：消除
      await wait(LASER_GAP_MS);                                   // 停 0.5 秒
      i = (i + 1) % quotes.length;
      paint(true);                                                // 此时文字全被裁掉，换句完全不可见
      await laserSweep(textEl, wrapEl, LASER_WRITE_MS, 0, 100);   // 自左向右：写回（逆动画）
    }
  })();
}

// ===== QUOTES: SEPARATOR =====
const sepQuotes = [
  "对我而言，诗是高度概括，纯粹哲理，是可以不用转换而浑然天成的直接可感受体。",
  "散文也是凝一的，所以不能如叙事一般发散，只能追求意和而神近。",
  "我主观的分开了\u2018真文学\u2019与\u2018假文学\u2019，\u2018真文学\u2019应当是于国于民有实利的文字，\u2018假文学\u2019要么是有阶级性的，要么就是于国家民族无用的废品。然而……应该引出一个新概念，那就是\u2018纯粹文学\u2019，即以文字的力量为主要的一种文学。"
];
// 启动两处诗句的激光轮换（引号改由 JS 补齐，好让白线能扫过引号本身）
startQuoteLaser(heroEl, heroWrap, heroQuotes,
  q => `\u201C${q}\u201D`, 4000, Math.floor(Math.random() * heroQuotes.length));
startQuoteLaser(sepEl, sepWrap, sepQuotes,
  q => `\u201C${q}\u201D`, 4500, 0);

// ===== NAV SCROLL =====
window.addEventListener('scroll', () => {
  document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 80);
  updateReadingProgress();
}, { passive: true });

// 阅读层是独立滚动容器，它自己的滚动要单独监听
const readingScroller = document.getElementById('reading');
if (readingScroller) {
  readingScroller.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', readingScroller.scrollTop > 80);
    updateReadingProgress();
  }, { passive: true });
}

// ===== 滚轮阻尼（首页 + 三个列表页）=====
// 思路：不直接把滚轮位移交给浏览器，而是记下「目标位置」，再让容器每帧朝它逼近一部分。
// 因为逼近是几何衰减的，所以停下滚轮后还会滑一小段再稳住 —— 这就是阻尼感。
// 注意首页滚的是文档、列表页滚的是阅读层容器，两者是两个不同的滚动目标，各接一套。
// 详情页刻意不接（需求只要首页与列表页）。
const WHEEL_DAMPING = 0.1;   // 每帧逼近比例：越小越黏、滑行越久；越大越跟手

function attachDampedWheel(getScroller, isEnabled) {
  let target = null;
  let rafId = null;

  const cancel = () => {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    target = null;
    const el = getScroller();
    if (el) el.style.scrollBehavior = '';
  };

  const frame = () => {
    rafId = null;
    const el = getScroller();
    // 关键门控：条件不再成立（例如已从列表页切到详情页）就必须立刻停手，
    // 否则上一页没跑完的动画会把新页面强行拽向旧位置
    if (!el || target === null || !isEnabled()) { cancel(); return; }
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    if (target > max) target = max;          // 内容变短时同步收紧目标
    const cur = el.scrollTop;
    const diff = target - cur;
    if (Math.abs(diff) < 0.5) {
      el.scrollTop = target;
      cancel();
      return;
    }
    el.scrollTop = cur + diff * WHEEL_DAMPING;
    rafId = requestAnimationFrame(frame);
  };

  window.addEventListener('wheel', event => {
    if (!isEnabled()) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;      // 横向滚动不管
    if (event.target && event.target.closest && event.target.closest('.search-panel')) return;  // 搜索面板自己滚

    const el = getScroller();
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return;

    // deltaMode: 0=像素 1=行 2=页，统一换算成像素
    let dy = event.deltaY;
    if (event.deltaMode === 1) dy *= 16;
    else if (event.deltaMode === 2) dy *= el.clientHeight;

    event.preventDefault();

    // 关掉 CSS 的 scroll-behavior:smooth，否则逐帧赋值会被浏览器再平滑一次
    el.style.scrollBehavior = 'auto';

    const base = (target === null) ? el.scrollTop : target;
    target = Math.max(0, Math.min(max, base + dy));
    if (rafId === null) rafId = requestAnimationFrame(frame);
  }, { passive: false });

  return { cancel };
}

// 首页
pageWheel = attachDampedWheel(
  () => document.scrollingElement || document.documentElement,
  () => !document.body.classList.contains('reading-open')
);

// 阅读层：只在「列表页」生效
if (readingScroller) {
  readingWheel = attachDampedWheel(
    () => readingScroller,
    () => {
      const list = document.getElementById('articleList');
      return readingScroller.classList.contains('active')
        && !!list && list.style.display !== 'none';
    }
  );
}

// 任何页面切换前都要先掐掉残留的阻尼动画
function cancelDampedScroll() {
  if (pageWheel) pageWheel.cancel();
  if (readingWheel) readingWheel.cancel();
}

// ===== SCROLL REVEAL =====
const observer = new IntersectionObserver(
  entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
  { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
);
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// ===== 照片拼贴：进入视野后一张张浮现 =====
const collageEl = document.querySelector('.photo-collage');
if (collageEl) {
  collageEl.classList.add('armed');          // 先藏起来，准备浮现
  const collageObs = new IntersectionObserver((entries, obs) => {
    entries.forEach(e => {
      if (e.isIntersecting) { collageEl.classList.add('shown'); obs.disconnect(); }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -8% 0px' });
  collageObs.observe(collageEl);
}

// ===== PARALLAX =====
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  document.querySelectorAll('.hero-bg img, .separator img').forEach(img => {
    img.style.transform = `translateY(${y * 0.3}px)`;
  });
}, { passive: true });

// ===== NAV SCROLL HELPER =====
function scrollToSection(id) {
  const readingEl = document.getElementById('reading');
  const readingOpen = !!readingEl && readingEl.classList.contains('active');

  // 「阅读」：已打开过书目就直接回到阅读层顶端；否则先去卷目录挑一本
  if (id === 'reading') {
    if (readingOpen) {
      readingEl.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (lastBook && allData[lastBook]) {
      openBook(lastBook);
    } else {
      const books = document.getElementById('books');
      if (books) books.scrollIntoView({ behavior: 'smooth' });
    }
    return;
  }

  // 「卷目」「首页」：阅读层是全屏独立层，必须先退出它，主页面才滚得动
  if (readingOpen) {
    readingEl.classList.remove('active');
    document.body.classList.remove('reading-open');
  }
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initData();
  initReaderSettings();
  restoreArticleFromHash();
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeSearch();
  });
});
