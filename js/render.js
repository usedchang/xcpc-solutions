(function () {
  'use strict';

  const TX = window.TX = window.TX || {};
  const U = TX.util;
  const R = TX.render = {};

  const DEFAULT_LOGO = `<svg class="deck-logo-default" viewBox="0 0 76 40" role="img" aria-label="题解工坊"><rect x="1" y="6" width="30" height="28" rx="7" fill="#122b43"/><text x="16" y="27" text-anchor="middle" font-size="16" font-weight="700" fill="#ffffff" font-family="Microsoft YaHei, PingFang SC, sans-serif">解</text><rect x="36" y="6" width="8" height="28" rx="4" fill="#1f5f8f"/><rect x="47" y="6" width="8" height="28" rx="4" fill="#d8a02c"/><rect x="58" y="6" width="8" height="28" rx="4" fill="#d34a3c"/></svg>`;

  R.defaultLogo = DEFAULT_LOGO;

  function esc(value) {
    return U.escapeHtml(value);
  }

  function attr(value) {
    return U.escapeAttr(value);
  }

  function assetMap(project) {
    return new Map((project.assets || []).map((asset) => [asset.id, asset]));
  }

  function logoMarkup(meta) {
    if (meta.logo && U.isImageData(meta.logo)) {
      return `<img class="deck-logo" src="${attr(meta.logo)}" alt="">`;
    }
    return DEFAULT_LOGO;
  }

  function pageProblem(project, page) {
    if (!page || !page.problemId) return null;
    return TX.model.problemById(project, page.problemId);
  }

  function headerMarkup(project, page) {
    const meta = project.meta;
    const activeIndex = page && page.problemId ? TX.model.problemIndex(project, page.problemId) : -1;
    const problemCount = (project.problems || []).length;
    const density = problemCount > 22 ? ' dense' : (problemCount > 14 ? ' many' : '');
    const dots = meta.showDots !== false
      ? `<div class="deck-dots${density}" aria-hidden="true">${(project.problems || []).map((problem, index) => {
        const state = index < activeIndex ? 'done' : (index === activeIndex ? 'active' : '');
        return `<span class="deck-dot${state ? ` ${state}` : ''}" title="${attr(problem.code)}"></span>`;
      }).join('')}</div>`
      : '<div class="deck-dots deck-dots-empty" aria-hidden="true"></div>';
    return `<header class="deck-header">
      <div class="deck-brand">${logoMarkup(meta)}</div>
      ${dots}
      <div class="deck-conference">${esc(meta.conference || 'Contest Tutorials')}</div>
    </header>`;
  }

  function footerMarkup(project, pageNo) {
    const meta = project.meta;
    return `<footer class="deck-footer">
      <span class="deck-organizer">${esc(meta.organizer || '')}</span>
      ${meta.footerNote ? `<span class="deck-footer-note">${esc(meta.footerNote)}</span>` : ''}
      <span class="deck-page">${pageNo}</span>
    </footer>`;
  }

  function kickerMarkup(text, problem, sequence) {
    return `<div class="kicker-row">
      <span class="kicker">${esc(text || 'NOTE')}</span>
      <span class="kicker-right">${problem ? `<span class="problem-ref">${esc(problem.code)} · ${esc(problem.name)}</span>` : ''}${sequence ? `<span class="problem-seq">${sequence}</span>` : ''}</span>
    </div>`;
  }

  function titleMarkup(title, code) {
    return `<div class="title-row">${code ? `<span class="problem-code">${esc(code)}</span>` : ''}<h1 class="slide-title">${esc(title || '')}</h1></div>`;
  }

  function prose(source, project, className = '') {
    const html = String(source || '').trim() ? TX.markdown.render(source, project) : '';
    return `<div class="prose ${className}">${html}</div>`;
  }

  function emptyCopy(text) {
    return `<p class="empty-copy">${esc(text)}</p>`;
  }

  function statValue(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^\d[\d,]*$/.test(text)) return `<span class="stat-value c-red">${esc(text)}</span>`;
    return `<span class="stat-value c-red">${esc(text)}</span>`;
  }

  function difficultyClass(value) {
    const text = String(value || '').toLowerCase();
    if (/^(basic|easy|入门|简单)/.test(text)) return 'c-green';
    if (/^(medium|mid|中等)/.test(text)) return 'c-amber';
    if (/^(hard|difficult|困难)/.test(text)) return 'c-red';
    return 'c-blue';
  }

  function asideMarkup(project, problem, preview) {
    if (!problem) return '';
    const lines = [];
    if (problem.ideaBy.trim()) lines.push(`<p class="aside-line">Idea by <strong>${esc(problem.ideaBy)}</strong></p>`);
    if (problem.preparedBy.trim()) lines.push(`<p class="aside-line">Prepared by <strong>${esc(problem.preparedBy)}</strong></p>`);
    if (lines.length) lines.push('<div class="aside-gap"></div>');

    const stats = [];
    if (problem.attempted.trim()) stats.push(`<p class="stat-line">${statValue(problem.attempted)} <span class="c-blue">Teams Attempted</span></p>`);
    if (problem.solved.trim()) stats.push(`<p class="stat-line">${statValue(problem.solved)} <span class="c-green">Teams Solved</span></p>`);
    if (problem.firstBlood.trim()) stats.push(`<p class="stat-line">First Blood: <span class="c-red">${esc(problem.firstBlood)}</span></p>`);
    if (problem.difficulty.trim()) stats.push(`<p class="stat-line">Expected Difficulty: <span class="${difficultyClass(problem.difficulty)}">${esc(problem.difficulty)}</span></p>`);
    if (problem.judgeSolution.trim()) stats.push(`<p class="stat-line">Judge Solution: <span class="aside-strong">${esc(problem.judgeSolution)}</span></p>`);

    if (stats.length) lines.push(`<div class="stat-list">${stats.join('')}</div>`);
    if (problem.tags.trim()) lines.push(`<p class="aside-tags">${esc(problem.tags)}</p>`);
    if (!lines.length && preview) lines.push('<p class="aside-placeholder">比赛数据 / 出题人信息会显示在这里。</p>');
    return `<aside class="problem-aside">${lines.join('')}</aside>`;
  }

  function coverMarkup(project, pageNo, preview) {
    const meta = project.meta;
    const title = String(meta.title || '').trim();
    const subtitle = String(meta.subtitle || '').trim();
    const authors = String(meta.authors || '').trim();
    return `<article class="slide-page cover-page" style="--accent:${attr(meta.accent)}">
      ${headerMarkup(project, null)}
      <div class="cover-body">
        <div class="cover-kicker">${esc(meta.coverKicker || 'CONTEST TUTORIALS')}</div>
        <h1 class="cover-title">${title ? esc(title) : (preview ? '竞赛题解' : '')}</h1>
        ${subtitle ? `<p class="cover-subtitle">${esc(subtitle)}</p>` : ''}
        ${authors ? `<div class="cover-authors">${esc(authors)}</div>` : (preview ? '<div class="cover-authors empty-copy">作者 / 题解团队</div>' : '')}
        <div class="cover-rule" aria-hidden="true"><i></i><i></i><i></i></div>
      </div>
      ${footerMarkup(project, pageNo)}
    </article>`;
  }

  function agendaMarkup(project, page, pageNo, preview) {
    const items = (project.problems || []).map((problem, index) => {
      const pages = TX.model.pagesOfProblem(project, problem.id);
      const solutions = pages.filter((item) => item.type === 'solution').length;
      const meta = [problem.difficulty, problem.tags, `${Math.max(1, solutions)} 页题解`].filter(Boolean).join(' · ');
      return `<div class="agenda-item">
        <span class="agenda-code" style="--item-index:${index}">${esc(problem.code)}</span>
        <div class="agenda-copy"><h3>${esc(problem.name)}</h3><p>${esc(meta)}</p></div>
      </div>`;
    }).join('');
    const intro = String(page.intro || '').trim()
      ? `<div class="agenda-intro">${TX.markdown.render(page.intro, project)}</div>`
      : (preview ? '<p class="empty-copy">可以在这里写一段题解集说明。</p>' : '');
    const problemCount = (project.problems || []).length;
    const columns = problemCount > 12 ? ' cols-4' : (problemCount > 8 ? ' cols-3' : '');
    return `<article class="slide-page agenda-page" style="--accent:${attr(project.meta.accent)}">
      ${headerMarkup(project, page)}
      <div class="slide-body">
        ${kickerMarkup(page.kicker || 'CONTEST OVERVIEW', null, 0)}
        ${titleMarkup(page.title || '题目一览', '')}
        ${intro}
        <div class="agenda-grid${columns}">${items || (preview ? '<p class="empty-copy">还没有题目。</p>' : '')}</div>
      </div>
      ${footerMarkup(project, pageNo)}
    </article>`;
  }

  function problemMarkup(project, page, pageNo, preview) {
    const problem = pageProblem(project, page);
    if (!problem) return coverMarkup(project, pageNo, preview);
    const statement = String(problem.statement || '').trim()
      ? TX.markdown.render(problem.statement, project)
      : (preview ? emptyCopy('在编辑器中写下题面摘要、输入输出或关键转化。') : '');
    const constraints = String(problem.constraints || '').trim()
      ? `<div class="constraint-block"><div class="constraint-label">Constraints</div>${TX.markdown.render(problem.constraints, project)}</div>`
      : (preview ? '<div class="constraint-block placeholder-block"><div class="constraint-label">Constraints</div><p>补充数据范围与关键限制。</p></div>' : '');
    return `<article class="slide-page problem-page" style="--accent:${attr(project.meta.accent)}">
      ${headerMarkup(project, page)}
      <div class="slide-body problem-body">
        <div class="problem-layout">
          <div class="problem-main">
            ${kickerMarkup('PROBLEM', null, TX.model.problemSequence(project, page))}
            ${titleMarkup(problem.name, problem.code)}
            <div class="prose problem-statement">${statement}</div>
            ${constraints}
          </div>
          ${asideMarkup(project, problem, preview)}
        </div>
      </div>
      ${footerMarkup(project, pageNo)}
    </article>`;
  }

  function figureMarkup(project, page, className = '') {
    const map = assetMap(project);
    const asset = page.imageId ? map.get(page.imageId) : null;
    if (!asset) return '';
    const caption = String(page.imageCaption || '').trim();
    return `<figure class="${className}"><img src="${attr(asset.data)}" alt="${attr(caption || asset.name || '题解插图')}">${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>`;
  }

  function solutionMarkup(project, page, pageNo, preview) {
    const problem = pageProblem(project, page);
    const layout = page.layout || 'split';
    const left = String(page.left || '').trim();
    const right = String(page.right || '').trim();
    const hasFigure = Boolean(page.imageId);
    let body = '';
    if (layout === 'visual') {
      const figure = hasFigure ? figureMarkup(project, page, 'hero-figure') : (preview ? '<div class="figure-placeholder">在右侧放一张算法示意图、流程图或关键截图</div>' : '');
      body = `<div class="solution-layout visual-layout">
        ${prose(page.left, project, 'solution-copy')}
        <div class="figure-pane">${figure}</div>
      </div>`;
    } else if (layout === 'figure') {
      const figure = hasFigure ? figureMarkup(project, page, 'hero-figure full-figure') : (preview ? '<div class="figure-placeholder full-placeholder">本页会以整页图片为主</div>' : '');
      body = `<div class="solution-layout figure-layout"><div class="figure-pane full-pane">${figure}</div></div>`;
    } else if (layout === 'single') {
      body = `<div class="solution-layout single-layout">${prose(page.left, project, 'solution-copy')}</div>`;
    } else {
      body = `<div class="solution-layout split-layout">
        ${prose(page.left, project, 'solution-copy')}
        ${prose(page.right, project, 'solution-copy solution-copy-right')}
      </div>`;
    }
    const emptyHint = preview && !left && !right && !hasFigure && layout !== 'figure'
      ? '<p class="empty-copy layout-hint">在左侧编辑器写这一页的讲解；支持 Markdown 与 TeX 公式。</p>'
      : '';
    return `<article class="slide-page solution-page layout-${attr(layout)}" style="--accent:${attr(project.meta.accent)}">
      ${headerMarkup(project, page)}
      <div class="slide-body solution-body">
        ${kickerMarkup(page.kicker || (page.type === 'solution' ? 'SOLUTION' : 'NOTE'), problem, TX.model.problemSequence(project, page))}
        ${titleMarkup(page.title || (page.type === 'solution' ? '解法' : '说明'), '')}
        <div class="solution-content">${body}${emptyHint}</div>
        ${String(page.complexity || '').trim() ? `<div class="slide-complexity"><span>COMPLEXITY</span>${TX.markdown.render(page.complexity, project)}</div>` : ''}
      </div>
      ${footerMarkup(project, pageNo)}
    </article>`;
  }

  R.pageMarkup = (project, page, pageNo, options = {}) => {
    const preview = Boolean(options.preview);
    if (page.type === 'cover') return coverMarkup(project, pageNo, preview);
    if (page.type === 'agenda') return agendaMarkup(project, page, pageNo, preview);
    if (page.type === 'problem') return problemMarkup(project, page, pageNo, preview);
    return solutionMarkup(project, page, pageNo, preview);
  };

  R.hydrate = (root, project) => {
    if (!root) return;
    root.querySelectorAll('.prose, .agenda-intro, .slide-complexity, .constraint-block').forEach((element) => {
      // Markdown content was already rendered to HTML; only finish assets and math.
      TX.markdown.hydrate(element, project);
    });
  };

  R.renderPage = (project, page, pageNo, options = {}) => {
    const html = R.pageMarkup(project, page, pageNo, options);
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    const element = template.content.firstElementChild;
    R.hydrate(element, project);
    return element;
  };

  R.renderDeck = (project) => {
    const pages = project.pages || [];
    const html = pages.map((page, index) => `<div class="print-slide">${R.pageMarkup(project, page, index + 1, { preview: false })}</div>`).join('');
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    template.content.querySelectorAll('.print-slide').forEach((slide) => R.hydrate(slide, project));
    return template.content;
  };

  R.waitForImages = async (root) => {
    if (!root) return;
    const images = Array.from(root.querySelectorAll('img'));
    await Promise.all(images.map((image) => {
      if (image.complete && image.naturalWidth > 0) return Promise.resolve();
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
        window.setTimeout(resolve, 3500);
      });
    }));
  };

  R.preparePrint = async (project, element) => {
    if (!element) return;
    element.innerHTML = '';
    element.appendChild(R.renderDeck(project));
    await R.waitForImages(element);
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (_) { /* ignore */ }
    }
    await U.doubleFrame();
  };
})();
