(function () {
  'use strict';

  const TX = window.TX = window.TX || {};
  const U = TX.util;
  const M = TX.model = {};

  const VERSION = 2;
  const PAGE_TYPES = ['cover', 'agenda', 'problem', 'solution', 'custom'];
  const LAYOUTS = ['split', 'single', 'visual', 'figure'];
  const DB_NAME = 'tixie-studio';
  const DB_STORE = 'state';
  const DB_KEY = 'current';
  const LS_KEY = 'tixie-studio.project.v2';
  const LEGACY_LS_KEY = 'tixie-workshop-project-v1';

  const DEFAULT_META = () => ({
    conference: 'The 2026 ICPC Regional Contest Tutorials',
    coverKicker: 'CONTEST TUTORIALS',
    title: '竞赛题解',
    subtitle: '',
    authors: '',
    organizer: 'Problem Setting Group',
    logo: '',
    accent: '#1f5f8f',
    showDots: true,
    footerNote: ''
  });

  const DEFAULT_PROBLEM = (code = 'A', name = '新题目') => ({
    id: U.uid('p'),
    code,
    name,
    statement: '',
    constraints: '',
    ideaBy: '',
    preparedBy: '',
    attempted: '',
    solved: '',
    firstBlood: '',
    difficulty: '',
    judgeSolution: '',
    tags: ''
  });

  function coverPage() {
    return { id: U.uid('page'), type: 'cover' };
  }

  function problemPage(problemId) {
    return { id: U.uid('page'), type: 'problem', problemId };
  }

  function solutionPage(problemId, title = '核心观察') {
    return {
      id: U.uid('page'),
      type: 'solution',
      problemId,
      kicker: 'SOLUTION',
      title,
      layout: 'split',
      left: '',
      right: '',
      complexity: '',
      imageId: '',
      imageCaption: ''
    };
  }

  M.PAGE_TYPES = PAGE_TYPES;
  M.LAYOUTS = LAYOUTS;
  M.coverPage = coverPage;
  M.problemPage = problemPage;
  M.solutionPage = solutionPage;

  M.createProblem = (code, name) => DEFAULT_PROBLEM(code, name);

  M.emptyProject = () => {
    const problem = DEFAULT_PROBLEM('A', '新题目');
    return {
      version: VERSION,
      meta: DEFAULT_META(),
      problems: [problem],
      pages: [coverPage(), problemPage(problem.id), solutionPage(problem.id)],
      assets: []
    };
  };

  function asString(value) {
    return typeof value === 'string' ? value : String(value ?? '');
  }

  function validType(type) {
    return PAGE_TYPES.includes(type) ? type : 'custom';
  }

  function validLayout(layout) {
    return LAYOUTS.includes(layout) ? layout : 'split';
  }

  function uniqueId(raw, used, prefix) {
    let id = asString(raw).trim();
    if (!id || used.has(id)) id = U.uid(prefix);
    used.add(id);
    return id;
  }

  function ensureAssetFromData(data, assets, names) {
    const clean = asString(data);
    if (!U.isImageData(clean)) return '';
    const existing = assets.find((asset) => asset.data === clean);
    if (existing) return existing.id;
    const id = U.uid('asset');
    assets.push({
      id,
      name: names[assets.length % names.length] || `插图 ${assets.length + 1}`,
      data: clean,
      width: 0,
      height: 0,
      bytes: clean.length
    });
    return id;
  }

  function normalizeAssets(input, usedIds) {
    const result = [];
    if (!Array.isArray(input)) return result;
    for (const raw of input) {
      if (!raw || typeof raw !== 'object') continue;
      const data = asString(raw.data);
      if (!U.isImageData(data)) continue;
      const id = uniqueId(raw.id, usedIds, 'asset');
      result.push({
        id,
        name: asString(raw.name || `插图 ${result.length + 1}`).slice(0, 120),
        data,
        width: Math.max(0, Number(raw.width) || 0),
        height: Math.max(0, Number(raw.height) || 0),
        bytes: Math.max(0, Number(raw.bytes) || data.length)
      });
    }
    return result;
  }

  M.normalize = (input, fallback) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('项目 JSON 必须是一个对象。');
    }
    const base = fallback && typeof fallback === 'object' ? fallback : M.emptyProject();
    const metaIn = input.meta && typeof input.meta === 'object' ? input.meta : {};
    const meta = {
      ...DEFAULT_META(),
      ...(base.meta || {})
    };
    for (const key of Object.keys(DEFAULT_META())) {
      if (Object.prototype.hasOwnProperty.call(metaIn, key)) meta[key] = asString(metaIn[key]);
    }
    meta.showDots = metaIn.showDots === undefined ? meta.showDots !== false : Boolean(metaIn.showDots);
    meta.accent = U.isHexColor(metaIn.accent) ? asString(metaIn.accent) : (U.isHexColor(meta.accent) ? meta.accent : '#1f5f8f');
    meta.logo = U.isImageData(metaIn.logo) ? asString(metaIn.logo) : '';
    if (!Object.prototype.hasOwnProperty.call(metaIn, 'logo') && U.isImageData(meta.logo)) meta.logo = asString(meta.logo);

    const assetIds = new Set();
    let assets = normalizeAssets(input.assets, assetIds);

    const problemIds = new Set();
    let problems = [];
    if (Array.isArray(input.problems)) {
      problems = input.problems.filter((problem) => problem && typeof problem === 'object').map((problem, index) => {
        const id = uniqueId(problem.id, problemIds, 'problem');
        return {
          id,
          code: asString(problem.code || String.fromCharCode(65 + (index % 26))),
          name: asString(problem.name || `题目 ${index + 1}`),
          statement: asString(problem.statement),
          constraints: asString(problem.constraints),
          ideaBy: asString(problem.ideaBy),
          preparedBy: asString(problem.preparedBy),
          attempted: asString(problem.attempted),
          solved: asString(problem.solved),
          firstBlood: asString(problem.firstBlood),
          difficulty: asString(problem.difficulty),
          judgeSolution: asString(problem.judgeSolution),
          tags: asString(problem.tags)
        };
      });
    }
    if (!problems.length) problems = [DEFAULT_PROBLEM('A', '新题目')];
    const problemMap = new Map(problems.map((problem) => [problem.id, problem]));

    const pageIds = new Set();
    let pages = [];
    if (Array.isArray(input.pages)) {
      pages = input.pages.filter((page) => page && typeof page === 'object').map((page) => {
        const type = validType(page.type);
        const id = uniqueId(page.id, pageIds, 'page');
        if (type === 'cover') return { id, type };
        if (type === 'agenda') {
          return {
            id,
            type,
            kicker: asString(page.kicker || 'CONTEST OVERVIEW'),
            title: asString(page.title || '题目一览'),
            intro: asString(page.intro)
          };
        }
        if (type === 'problem') {
          let problemId = asString(page.problemId);
          if (!problemMap.has(problemId)) problemId = problems[0].id;
          return { id, type, problemId };
        }
        let problemId = asString(page.problemId);
        if (!problemMap.has(problemId)) problemId = problems[0].id;
        let imageId = asString(page.imageId);
        if (!assetIds.has(imageId) && !assets.some((asset) => asset.id === imageId)) imageId = '';
        if (!imageId) {
          const rawImage = asString(page.image || page.figure);
          if (U.isImageData(rawImage)) imageId = ensureAssetFromData(rawImage, assets, ['本页主图', '题解插图']);
        }
        return {
          id,
          type,
          problemId,
          kicker: asString(page.kicker || (type === 'solution' ? 'SOLUTION' : 'NOTE')),
          title: asString(page.title || (type === 'solution' ? '解法' : '说明')),
          layout: validLayout(page.layout),
          left: asString(page.left),
          right: asString(page.right),
          complexity: asString(page.complexity),
          imageId,
          imageCaption: asString(page.imageCaption)
        };
      });
    }

    // v1 compatibility: slides + one problem.
    if (!pages.length && Array.isArray(input.slides)) {
      const problem = problems[0];
      pages.push(coverPage(), problemPage(problem.id));
      input.slides.forEach((slide, index) => {
        const page = solutionPage(problem.id, asString(slide && slide.title) || `解法 ${index + 1}`);
        page.layout = validLayout(slide && slide.layout);
        page.left = asString(slide && slide.left);
        page.right = asString(slide && slide.right);
        page.complexity = asString(slide && slide.complexity);
        const figure = asString(slide && slide.figure);
        if (U.isImageData(figure)) {
          const assetId = ensureAssetFromData(figure, assets, ['题解插图']);
          page.imageId = assetId;
          page.imageCaption = asString(slide && slide.figureCaption);
          if (page.layout !== 'visual') {
            const alt = page.imageCaption || '题解插图';
            page.right = `${page.right}${page.right.trim() ? '\n\n' : ''}![${alt}](asset:${assetId})`;
          }
        }
        pages.push(page);
      });
      const sourceCode = asString(input.sourceCode);
      if (sourceCode.trim()) {
        pages.push({
          id: U.uid('page'),
          type: 'custom',
          problemId: problem.id,
          kicker: 'IMPLEMENTATION',
          title: '参考代码',
          layout: 'single',
          left: `\`\`\`cpp\n${sourceCode.replace(/```/g, '` ` `')}\n\`\`\``,
          right: '',
          complexity: '',
          imageId: '',
          imageCaption: ''
        });
      }
    }

    if (!pages.length) {
      const problem = problems[0];
      pages = [coverPage(), problemPage(problem.id), solutionPage(problem.id)];
    }

    const coverIndex = pages.findIndex((page) => page.type === 'cover');
    if (coverIndex < 0) pages.unshift(coverPage());
    else if (coverIndex > 0) pages = [pages[coverIndex], ...pages.filter((page) => page.type !== 'cover')];
    else pages = [pages[0], ...pages.slice(1).filter((page) => page.type !== 'cover')];

    if (pages.length === 1) {
      const problem = problems[0];
      pages.push(problemPage(problem.id), solutionPage(problem.id));
    }

    // Pull v1 image fields and unknown image ids into the asset library.
    for (const page of pages) {
      if (page.type !== 'solution' && page.type !== 'custom') continue;
      if (!page.imageId) {
        const rawImage = asString(page.image || page.figure);
        if (U.isImageData(rawImage)) {
          page.imageId = ensureAssetFromData(rawImage, assets, ['本页主图']);
        }
      }
      page.imageId = assetIds.has(page.imageId) || assets.some((asset) => asset.id === page.imageId) ? page.imageId : '';
    }

    return {
      version: VERSION,
      meta,
      problems,
      pages,
      assets
    };
  };

  M.migrateLegacy = (input) => {
    if (!input || typeof input !== 'object') throw new Error('旧版项目格式无法识别。');
    const metaIn = input.meta || {};
    const problemIn = input.problem || {};
    const problem = {
      id: U.uid('problem'),
      code: 'A',
      name: asString(metaIn.problemName || '题目'),
      statement: asString(problemIn.statement),
      constraints: asString(problemIn.constraints),
      ideaBy: '',
      preparedBy: '',
      attempted: asString(problemIn.attempted),
      solved: asString(problemIn.solved),
      firstBlood: asString(problemIn.firstBlood),
      difficulty: asString(problemIn.difficulty),
      judgeSolution: asString(problemIn.judgeSolution),
      tags: ''
    };
    const pages = [
      { type: 'cover' },
      { type: 'problem', problemId: problem.id },
      ...(Array.isArray(input.slides) ? input.slides.map((slide) => ({
        type: 'solution',
        problemId: problem.id,
        kicker: 'SOLUTION',
        title: slide && slide.title,
        layout: slide && slide.layout,
        left: slide && slide.left,
        right: slide && slide.right,
        complexity: slide && slide.complexity,
        imageId: '',
        imageCaption: slide && slide.figureCaption
      })) : [])
    ];
    const sourceCode = asString(input.sourceCode);
    if (sourceCode.trim()) {
      pages.push({
        type: 'custom',
        problemId: problem.id,
        kicker: 'IMPLEMENTATION',
        title: '参考代码',
        layout: 'single',
        left: `\`\`\`cpp\n${sourceCode.replace(/```/g, '` ` `')}\n\`\`\``,
        right: '',
        complexity: '',
        imageId: '',
        imageCaption: ''
      });
    }
    return M.normalize({
      meta: {
        conference: metaIn.conference,
        coverKicker: metaIn.coverKicker,
        title: metaIn.subtitle || '竞赛题解',
        subtitle: '',
        authors: metaIn.authors,
        organizer: metaIn.organizer,
        accent: '#1f5f8f',
        showDots: true
      },
      problems: [problem],
      pages,
      assets: []
    });
  };

  M.loadStored = async () => {
    const db = await openDb();
    if (db) {
      try {
        const stored = await idbGet(db);
        if (stored && stored.project) {
          return { project: M.normalize(stored.project), source: 'indexeddb', savedAt: stored.savedAt || 0 };
        }
      } catch (_) { /* fall through to localStorage */ }
    }
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { project: M.normalize(parsed), source: 'localStorage', savedAt: 0 };
      }
      const legacy = localStorage.getItem(LEGACY_LS_KEY);
      if (legacy) {
        return { project: M.migrateLegacy(JSON.parse(legacy)), source: 'legacy', savedAt: 0 };
      }
    } catch (_) { /* ignore corrupted storage */ }
    return null;
  };

  M.saveStored = async (project) => {
    const savedAt = Date.now();
    const db = await openDb();
    if (db) {
      try {
        await idbPut(db, { project, savedAt });
        return { source: 'indexeddb', savedAt };
      } catch (_) { /* fall back */ }
    }
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(project));
      return { source: 'localStorage', savedAt };
    } catch (error) {
      throw new Error('浏览器本地存储空间不足，请导出 JSON 备份。');
    }
  };

  M.clearStored = async () => {
    try { localStorage.removeItem(LS_KEY); } catch (_) { /* ignore */ }
    const db = await openDb();
    if (!db) return;
    try { await idbDelete(db); } catch (_) { /* ignore */ }
  };

  M.problemById = (project, id) => (project.problems || []).find((problem) => problem.id === id) || null;

  M.pageById = (project, id) => (project.pages || []).find((page) => page.id === id) || null;

  M.problemIndex = (project, problemId) => (project.problems || []).findIndex((problem) => problem.id === problemId);

  M.pagesOfProblem = (project, problemId) => (project.pages || []).filter((page) => page.problemId === problemId && (page.type === 'problem' || page.type === 'solution'));

  M.problemSequence = (project, page) => {
    if (!page || !page.problemId) return 0;
    const pages = M.pagesOfProblem(project, page.problemId);
    const index = pages.findIndex((item) => item.id === page.id);
    return index < 0 ? 0 : index + 1;
  };

  M.nextProblemCode = (project) => {
    const used = new Set((project.problems || []).map((problem) => String(problem.code || '').toUpperCase()));
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const letter of letters) if (!used.has(letter)) return letter;
    let i = 1;
    while (used.has(`A${i}`)) i += 1;
    return `A${i}`;
  };

  M.pageLabel = (project, page) => {
    if (!page) return '';
    if (page.type === 'cover') return '封面';
    if (page.type === 'agenda') return page.title || '题目一览';
    if (page.type === 'custom') return page.title || '自定义页';
    const problem = M.problemById(project, page.problemId);
    const code = problem ? problem.code : '';
    if (page.type === 'problem') return `${code} · ${problem ? problem.name : '题目'}`;
    return `${code}${M.problemSequence(project, page)} · ${page.title || '解法'}`;
  };

  M.pageKicker = (page) => {
    if (!page) return '';
    if (page.type === 'cover') return 'COVER';
    if (page.type === 'agenda') return 'AGENDA';
    if (page.type === 'problem') return 'PROBLEM';
    if (page.type === 'solution') return 'SOLUTION';
    return 'NOTE';
  };

  M.insertAfter = (pages, afterId, newPages) => {
    const index = pages.findIndex((page) => page.id === afterId);
    const at = index < 0 ? pages.length : index + 1;
    pages.splice(at, 0, ...newPages);
  };

  M.insertAtEndOfProblem = (project, problemId, newPages) => {
    let at = project.pages.length;
    for (let i = project.pages.length - 1; i >= 0; i -= 1) {
      if (project.pages[i].problemId === problemId) { at = i + 1; break; }
    }
    project.pages.splice(at, 0, ...newPages);
  };

  function openDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      };
      const timer = window.setTimeout(() => finish(null), 2600);
      let request;
      try {
        request = indexedDB.open(DB_NAME, 1);
      } catch (_) {
        finish(null);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => finish(request.result);
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
    });
  }

  function idbGet(db) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, 'readonly');
      const request = transaction.objectStore(DB_STORE).get(DB_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('读取失败'));
    });
  }

  function idbPut(db, value) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, 'readwrite');
      transaction.objectStore(DB_STORE).put(value, DB_KEY);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error || new Error('写入失败'));
      transaction.onabort = () => reject(transaction.error || new Error('写入中止'));
    });
  }

  function idbDelete(db) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, 'readwrite');
      transaction.objectStore(DB_STORE).delete(DB_KEY);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error || new Error('删除失败'));
    });
  }
})();
