// 赵元贞集 · 应用逻辑
// 从 index.html 内联脚本抽出，以便启用严格 CSP (script-src 'self')
// ===== DATA LAYER =====
let allData = {};
let currentBook = '';
let currentIdx = 0;
let listScrollY = 0;
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
  if (localStorage.getItem('reader-theme') === 'paper') {
    document.body.classList.add('reader-paper');
    const button = document.getElementById('themeToggle');
    if (button) button.textContent = '暗色';
  }
}

function navigateArticle(delta) {
  const items = allData[currentBook] || [];
  const nextIdx = currentIdx + delta;
  if (items[nextIdx]) showArticle(currentBook, nextIdx);
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
  const postscript = body.search(/\n后记(?=\s*(?:【|$))/);
  if (postscript > -1) {
    parts.unshift(body.slice(postscript).trim());
    body = body.slice(0, postscript).trim();
  }
  if (/^后记/.test(title)) {
    if (/海子/.test(title)) {
      const firstQuote = body.search(/[“‘]/);
      if (firstQuote > -1) {
        parts.unshift(body.slice(firstQuote).trim());
        body = body.slice(0, firstQuote).trim();
      }
    } else {
      parts.unshift(body.trim());
      body = '';
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
  if (!bar || !view || view.style.display === 'none') {
    if (bar) bar.style.width = '0%';
    return;
  }
  const max = document.documentElement.scrollHeight - window.innerHeight;
  bar.style.width = `${max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0}%`;
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
    return `<button class="search-result" onclick="closeSearch(); openBook('${escapeHtml(book)}'); setTimeout(() => showArticle('${escapeHtml(book)}', ${idx}), 180)"><strong>${title}</strong><small>${escapeHtml(book)} · ${escapeHtml(item.date || '')}</small><span>${snippet}${raw.length > start + 56 ? '…' : ''}</span></button>`;
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

// ===== BOOK NAVIGATION =====
function openBook(bookName) {
  const items = allData[bookName];
  if (!items || items.length === 0) {
    document.getElementById('articleListItems').innerHTML =
      '<p style="color:var(--gold-dim);text-align:center;padding:40px;">暂无内容</p>';
    return;
  }

  document.getElementById('listTitle').textContent = bookName;
  const listEl = document.getElementById('articleListItems');
  const articleList = document.getElementById('articleList');
  const articleView = document.getElementById('articleView');
  listEl.innerHTML = '';

  items.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'article-list-item';
    let displayTitle = item.title || '标题';
    const MAX_TITLE = 60;
    if (displayTitle.length > MAX_TITLE) {
      const m = displayTitle.match(/^(标题\s+\d{4}\s*年.*?字\s+)/);
      if (m) displayTitle = m[1] + '…';
      else displayTitle = displayTitle.substring(0, MAX_TITLE) + '…';
    }
    div.innerHTML = `
      <span class="item-title">${escapeHtml(displayTitle)}</span>
      <span class="item-meta">${escapeHtml(item.date || '')}</span>
    `;
    div.addEventListener('click', () => showArticle(bookName, idx));
    listEl.appendChild(div);
  });

  document.getElementById('reading').classList.add('active');
  articleList.classList.remove('fade-out');
  articleView.classList.remove('fade-out');
  articleList.style.display = 'block';
  articleList.style.opacity = '1';
  articleList.style.transform = 'translateY(0)';
  articleView.style.display = 'none';
  updateReadingContext();
  updateReadingProgress();

  document.getElementById('reading').scrollIntoView({ behavior: 'smooth' });
}

function closeBook() {
  document.getElementById('reading').classList.remove('active');
  document.getElementById('reading').scrollIntoView({ behavior: 'smooth' });
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
      window.scrollTo({ top: listScrollY, behavior: 'smooth' });
    });
  }, VIEW_TRANSITION_MS);
}

// ===== ARTICLE VIEW =====
function showArticle(bookName, idx) {
  currentBook = bookName;
  currentIdx = idx;
  const items = allData[bookName];
  if (!items || !items[idx]) return;

  const item = items[idx];
  const listEl = document.getElementById('articleList');
  const viewEl = document.getElementById('articleView');
  listScrollY = window.scrollY;

  const title = item.title || '标题';
  const raw = item.content || '';
  const mode = item.content_mode || 'prose';

  document.getElementById('articleTitle').textContent = title;
  document.getElementById('articleMeta').textContent = item.date || '';
  updateReadingContext();
  history.replaceState(null, '', `#article=${encodeURIComponent(bookName)}&index=${idx}`);

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

  listEl.classList.add('fade-out');
  setTimeout(() => {
    listEl.style.display = 'none';
    listEl.classList.remove('fade-out');
    viewEl.style.display = 'block';
    viewEl.classList.remove('fade-out');
    viewEl.style.opacity = '0';
    viewEl.style.transform = 'translateY(12px)';
    void viewEl.offsetWidth;
    viewEl.style.opacity = '1';
    viewEl.style.transform = 'translateY(0)';
    initComments(bookName, idx);
    document.getElementById('articleTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
    updateReadingProgress();
  }, VIEW_TRANSITION_MS);
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

function initComments(bookName, idx) {
  const container = document.getElementById('twikoo-container');
  if (!container) return;
  if (typeof twikoo === 'undefined') {
    container.textContent = '评论组件加载失败，请刷新页面重试。';
    return;
  }
  // 换文章时清空容器并重新 init，避免残留上一篇文章的评论
  container.innerHTML = '';
  applyTwikooTheme();
  twikoo.init({
    envId: TWIKOO_CONFIG.envId,
    el: '#twikoo-container',
    path: `${bookName}-${idx}`,
    lang: TWIKOO_CONFIG.lang
  }).then(applyTwikooTheme).catch(() => applyTwikooTheme());
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
let hi = Math.floor(Math.random() * heroQuotes.length);
heroEl.textContent = heroQuotes[hi];
setInterval(() => {
  hi = (hi + 1) % heroQuotes.length;
  heroEl.style.opacity = '0';
  setTimeout(() => {
    heroEl.textContent = heroQuotes[hi];
    heroEl.style.opacity = '1';
  }, 400);
}, 3000);

// ===== QUOTES: SEPARATOR =====
const sepQuotes = [
  "对我而言，诗是高度概括，纯粹哲理，是可以不用转换而浑然天成的直接可感受体。",
  "散文也是凝一的，所以不能如叙事一般发散，只能追求意和而神近。",
  "我主观的分开了\u2018真文学\u2019与\u2018假文学\u2019，\u2018真文学\u2019应当是于国于民有实利的文字，\u2018假文学\u2019要么是有阶级性的，要么就是于国家民族无用的废品。然而……应该引出一个新概念，那就是\u2018纯粹文学\u2019，即以文字的力量为主要的一种文学。"
];
const sepEl = document.getElementById('sepQuote');
let si = 0;
sepEl.textContent = '\u201C' + sepQuotes[0] + '\u201D';
setInterval(() => {
  si = (si + 1) % sepQuotes.length;
  sepEl.style.opacity = '0';
  setTimeout(() => {
    sepEl.textContent = '\u201C' + sepQuotes[si] + '\u201D';
    sepEl.style.opacity = '1';
  }, 500);
}, 4000);

// ===== NAV SCROLL =====
window.addEventListener('scroll', () => {
  document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 80);
  updateReadingProgress();
}, { passive: true });

// ===== SCROLL REVEAL =====
const observer = new IntersectionObserver(
  entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
  { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
);
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// ===== PARALLAX =====
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  document.querySelectorAll('.hero-bg img, .separator img').forEach(img => {
    img.style.transform = `translateY(${y * 0.3}px)`;
  });
}, { passive: true });

// ===== NAV SCROLL HELPER =====
function scrollToSection(id) {
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
