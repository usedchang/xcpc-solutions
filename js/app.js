(function () {
  'use strict';

  const TX = window.TX;
  const U = TX.util;
  const M = TX.model;
  const R = TX.render;

  const $ = U.$;
  const $$ = U.$$;

  const state = {
    project: null,
    activePageId: '',
    lastTextareaId: '',
    formulaTarget: '',
    imageTarget: '',
    imageHero: false,
    source: '',
    booted: false,
    previewTimer: 0,
    saveVersion: 0,
    confirmResolver: null,
    imageBusy: false
  };

  const saveSoon = U.debounce(() => saveNow(), 720);
  const previewSoon = U.debounce(() => renderPreview(), 22);

  function activePage() {
    if (!state.project) return null;
    return M.pageById(state.project, state.activePageId) || state.project.pages[0] || null;
  }

  function currentProblem() {
    const page = activePage();
    if (!page) return null;
    return page.problemId ? M.problemById(state.project, page.problemId) : null;
  }

  function currentProblemOrFirst() {
    return currentProblem() || state.project.problems[0] || null;
  }

  function projectName() {
    const title = String(state.project?.meta?.title || '').split('\n').map((line) => line.trim()).filter(Boolean)[0];
    return title || '未命名题解';
  }

  function escape(value) { return U.escapeHtml(value); }
  function attr(value) { return U.escapeAttr(value); }

  function showToast(message, duration = 2800) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('visible'), duration);
  }

  function setSaveState(kind, text) {
    const node = $('#save-state');
    node.classList.toggle('saving', kind === 'saving');
    node.classList.toggle('error', kind === 'error');
    node.querySelector('span').textContent = text;
  }

  function markDirty() {
    setSaveState('saving', '编辑中');
    saveSoon();
  }

  async function saveNow() {
    if (!state.project) return false;
    const version = ++state.saveVersion;
    setSaveState('saving', '正在保存');
    try {
      await M.saveStored(state.project);
      if (version !== state.saveVersion) return true;
      setSaveState('saved', '已自动保存');
      return true;
    } catch (error) {
      if (version === state.saveVersion) {
        setSaveState('error', '保存失败');
        showToast(error.message || '保存失败，请导出 JSON 备份。', 4200);
      }
      return false;
    }
  }

  function openDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
  }

  function closeDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog && dialog.open) dialog.close();
  }

  function confirmAction(title, message, okLabel = '确认') {
    return new Promise((resolve) => {
      if (state.confirmResolver) {
        state.confirmResolver(false);
        state.confirmResolver = null;
      }
      state.confirmResolver = resolve;
      $('#confirm-title').textContent = title;
      $('#confirm-message').textContent = message;
      $('#confirm-ok').textContent = okLabel;
      openDialog('confirm-dialog');
    });
  }

  function resolveConfirm(value) {
    if (!state.confirmResolver) return;
    const resolve = state.confirmResolver;
    state.confirmResolver = null;
    closeDialog('confirm-dialog');
    resolve(value);
  }

  function layoutLabel(layout) {
    return ({ split: '双栏推导', single: '通栏内容', visual: '图文讲解', figure: '整页图片' })[layout] || '双栏推导';
  }

  function pageKindLabel(page) {
    if (!page) return '';
    if (page.type === 'cover') return '封面 / 赛事信息';
    if (page.type === 'agenda') return '题目目录';
    if (page.type === 'thanks') return '致谢 / 鸣谢';
    if (page.type === 'closing') return '结语 / 写在最后';
    if (page.type === 'problem') return '题目页';
    if (page.type === 'solution') return `解法页 · ${layoutLabel(page.layout)}`;
    return `自定义页 · ${layoutLabel(page.layout)}`;
  }

  function pageIcon(page) {
    if (page.type === 'cover') return 'C';
    if (page.type === 'agenda') return '目';
    if (page.type === 'thanks') return '谢';
    if (page.type === 'closing') return '终';
    if (page.type === 'custom') return '§';
    const problem = M.problemById(state.project, page.problemId);
    const code = problem ? problem.code : '?';
    if (page.type === 'problem') return code;
    return `${code}${M.problemSequence(state.project, page)}`;
  }

  function updateProjectChrome() {
    const name = projectName();
    $('#project-name').textContent = name;
    $('#project-crumb').textContent = name;
    document.title = `${name} · 题解工坊`;
  }

  function updateEditorHead() {
    const page = activePage();
    if (!page) return;
    const index = state.project.pages.findIndex((item) => item.id === page.id);
    let eyebrow = 'PAGE';
    let title = '页面';
    if (page.type === 'cover') { eyebrow = 'COVER'; title = '封面与赛事信息'; }
    else if (page.type === 'problem') {
      const problem = M.problemById(state.project, page.problemId);
      eyebrow = 'PROBLEM';
      title = problem ? `${problem.code} · ${problem.name}` : '题目';
    } else if (page.type === 'agenda') { eyebrow = 'AGENDA'; title = page.title || '题目一览'; }
    else if (page.type === 'thanks') { eyebrow = page.kicker || 'ACKNOWLEDGEMENTS'; title = page.title || '致谢'; }
    else if (page.type === 'closing') { eyebrow = page.kicker || 'CLOSING'; title = page.title || '写在最后'; }
    else if (page.type === 'solution') { eyebrow = page.kicker || 'SOLUTION'; title = page.title || '解法页'; }
    else { eyebrow = page.kicker || 'NOTE'; title = page.title || '自定义页'; }
    $('#editor-eyebrow').textContent = eyebrow;
    $('#editor-title').textContent = title;
    $('#editor-step').textContent = `${String(index + 1).padStart(2, '0')} / ${String(state.project.pages.length).padStart(2, '0')}`;
  }

  function renderSidebar() {
    const project = state.project;
    const pages = project.pages;
    $('#page-count').textContent = String(pages.length);
    $('#outline-list').innerHTML = pages.map((page) => {
      const problem = page.problemId ? M.problemById(project, page.problemId) : null;
      const active = page.id === state.activePageId;
      const classes = [
        'outline-item',
        active ? 'active' : '',
        page.type === 'cover' ? 'is-cover' : '',
        page.type === 'problem' ? 'is-problem' : '',
        page.type === 'thanks' ? 'is-thanks' : '',
        page.type === 'closing' ? 'is-closing' : ''
      ].filter(Boolean).join(' ');
      const label = page.type === 'cover'
        ? '封面'
        : (page.type === 'problem' ? (problem ? problem.name : '题目') : (page.title || pageKindLabel(page)));
      const sub = page.type === 'solution' && problem
        ? `${problem.code} · ${problem.name}`
        : pageKindLabel(page);
      return `<button type="button" class="${classes}" data-page-id="${attr(page.id)}">
        <span class="outline-icon">${escape(pageIcon(page))}</span>
        <span class="outline-copy"><span class="outline-label">${escape(label)}</span><span class="outline-sub">${escape(sub)}</span></span>
      </button>`;
    }).join('');
    updateProjectChrome();
  }

  function renderPreview() {
    if (!state.project) return;
    const page = activePage();
    if (!page) return;
    const frame = $('#preview-frame');
    frame.innerHTML = '';
    const pageNo = state.project.pages.findIndex((item) => item.id === page.id) + 1;
    const node = R.renderPage(state.project, page, pageNo, { preview: true });
    frame.appendChild(node);
    const index = pageNo - 1;
    $('#preview-counter').textContent = `${pageNo} / ${state.project.pages.length}`;
    $('#preview-label').textContent = M.pageLabel(state.project, page);
    $('#prev-page').disabled = state.project.pages.length <= 1;
    $('#next-page').disabled = state.project.pages.length <= 1;
    $('#prev-page').style.opacity = state.project.pages.length <= 1 ? '.35' : '';
    $('#next-page').style.opacity = state.project.pages.length <= 1 ? '.35' : '';
    requestAnimationFrame(measureOverflow);
  }

  function measureOverflow() {
    const frame = $('#preview-frame');
    const page = activePage();
    if (!frame || !page) return;
    const nodes = $$('.slide-body, .solution-layout, .solution-copy, .problem-main, .problem-statement, .problem-aside, .agenda-grid, .thanks-grid, .thanks-copy, .closing-copy', frame);
    const overflow = nodes.some((node) => {
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || node.clientHeight <= 0) return false;
      return node.scrollHeight > node.clientHeight + 3 || node.scrollWidth > node.clientWidth + 3;
    });
    $('#overflow-badge').hidden = !overflow;
    $('#overflow-note').hidden = !overflow;
  }

  function fieldId(bind) {
    return `field-${bind.replace(/[^a-z0-9]+/gi, '-')}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function toolbar(targetId) {
    return `<div class="toolbar" data-toolbar-target="${attr(targetId)}">
      <button type="button" data-cmd="bold" title="粗体">B</button>
      <button type="button" data-cmd="italic" title="斜体"><i>I</i></button>
      <button type="button" data-cmd="highlight" title="高亮">==</button>
      <button type="button" data-cmd="code" title="行内代码">&lt;/&gt;</button>
      <span class="toolbar-sep"></span>
      <button type="button" data-cmd="bullet" title="无序列表">• 列表</button>
      <button type="button" data-cmd="ordered" title="有序列表">1. 列表</button>
      <button type="button" data-cmd="quote" title="引用">❝</button>
      <button type="button" data-cmd="table" title="表格">▦</button>
      <span class="toolbar-sep"></span>
      <button type="button" data-cmd="formula" title="行内 TeX 公式">ƒx</button>
      <button type="button" data-cmd="display" title="独占一行的公式">∑</button>
      <button type="button" data-cmd="image" title="插入图片">▧ 图片</button>
    </div>`;
  }

  function inputField(label, bind, value, options = {}) {
    const id = fieldId(bind);
    const hint = options.hint ? `<p class="field-hint">${options.hint}</p>` : '';
    const meta = options.meta ? `<em>${escape(options.meta)}</em>` : '';
    return `<div class="field">
      <label class="field-label" for="${id}"><span>${label}</span><span class="label-tools">${meta}</span></label>
      <input id="${id}" data-bind="${bind}" type="text" value="${attr(value)}" placeholder="${attr(options.placeholder || '')}">
      ${hint}
    </div>`;
  }

  function textareaField(label, bind, value, options = {}) {
    const id = fieldId(bind);
    const hint = options.hint ? `<p class="field-hint">${options.hint}</p>` : '';
    const meta = options.meta ? `<em>${escape(options.meta)}</em>` : '';
    return `<div class="field">
      <label class="field-label" for="${id}"><span>${label}</span><span class="label-tools">${meta}</span></label>
      ${options.toolbar ? toolbar(id) : ''}
      <textarea id="${id}" data-bind="${bind}" class="${attr(options.className || '')}" rows="${options.rows || 5}" placeholder="${attr(options.placeholder || '')}">${escape(value)}</textarea>
      ${hint}
    </div>`;
  }

  function selectField(label, bind, value, options, hintText = '') {
    const id = fieldId(bind);
    return `<div class="field">
      <label class="field-label" for="${id}"><span>${label}</span></label>
      <select id="${id}" data-bind="${bind}">${options.map((option) => `<option value="${attr(option.value)}"${String(option.value) === String(value) ? ' selected' : ''}>${escape(option.label)}</option>`).join('')}</select>
      ${hintText ? `<p class="field-hint">${hintText}</p>` : ''}
    </div>`;
  }

  function switchField(label, bind, checked, hintText = '') {
    return `<div class="field">
      <div class="switch-row"><div><span class="field-label" style="margin:0">${label}</span>${hintText ? `<p class="field-hint">${hintText}</p>` : ''}</div><label class="switch"><input type="checkbox" data-bind="${bind}"${checked ? ' checked' : ''}><span></span></label></div>
    </div>`;
  }

  function sectionDivider(text) {
    return `<div class="section-divider">${escape(text)}</div>`;
  }

  function logoEditor() {
    const logo = state.project.meta.logo;
    return `<div class="field">
      <span class="field-label"><span>页眉 Logo</span><em>PNG / JPG / WebP</em></span>
      <div class="logo-row">
        <div class="logo-preview">${logo ? `<img src="${attr(logo)}" alt="当前 Logo">` : '<span>默认标记</span>'}</div>
        <button type="button" class="btn btn-ghost btn-small" data-logo-upload>${logo ? '更换' : '上传'}</button>
        ${logo ? '<button type="button" class="btn btn-ghost btn-small" data-logo-remove>移除</button>' : ''}
      </div>
      <p class="field-hint">建议使用横向透明 PNG；不上传时显示内置的「解」标记。</p>
    </div>`;
  }

  function colorEditor() {
    const accent = state.project.meta.accent;
    const swatches = ['#1f5f8f', '#2b5d4b', '#7b3f61', '#8b5a25', '#3d4d63'];
    return `<div class="field">
      <span class="field-label"><span>主题色</span><em>${escape(accent.toUpperCase())}</em></span>
      <div class="color-row">
        <input type="color" data-bind="meta.accent" value="${attr(accent)}" aria-label="主题色">
        ${swatches.map((color) => `<button type="button" class="icon-btn" data-accent="${attr(color)}" style="width:24px;height:24px;background:${attr(color)};border-color:${attr(color)}" aria-label="使用 ${attr(color)}"></button>`).join('')}
      </div>
      <p class="field-hint">只影响强调色；题目页的数字颜色保持红 / 绿语义。</p>
    </div>`;
  }

  function pageTools(page) {
    const isCover = page.type === 'cover';
    const canDuplicate = ['solution', 'custom', 'agenda', 'thanks', 'closing'].includes(page.type);
    if (isCover) return '';
    return `<div class="page-tools">
      <button type="button" data-page-action="up">↑ 上移</button>
      <button type="button" data-page-action="down">↓ 下移</button>
      ${canDuplicate ? '<button type="button" data-page-action="duplicate">复制本页</button>' : '<button type="button" data-page-action="add-solution">＋ 解法页</button>'}
      <button type="button" class="danger-link" data-page-action="delete">删除本页</button>
    </div>`;
  }

  function renderCoverEditor() {
    const meta = state.project.meta;
    $('#editor-fields').innerHTML = `
      ${sectionDivider('COVER')}
      ${inputField('赛事英文标题 / 页眉', 'meta.conference', meta.conference, { placeholder: 'The 2026 ICPC Asia Regional Contest Tutorials' })}
      ${inputField('封面眉题', 'meta.coverKicker', meta.coverKicker, { placeholder: 'CONTEST TUTORIALS' })}
      ${textareaField('主标题', 'meta.title', meta.title, { rows: 3, className: 'tall', meta: '可换行', placeholder: '2026 区域赛\\n竞赛题解' })}
      ${textareaField('副标题', 'meta.subtitle', meta.subtitle, { rows: 2, className: 'short', placeholder: '从核心观察到完整实现' })}
      <div class="field-grid">
        ${inputField('作者 / 题解团队', 'meta.authors', meta.authors, { placeholder: '题解组' })}
        ${inputField('组织 / 命题组', 'meta.organizer', meta.organizer, { placeholder: 'Problem Setting Group' })}
      </div>
      ${inputField('页脚补充说明（可选）', 'meta.footerNote', meta.footerNote, { placeholder: '例如：内部题解，请勿外传' })}
      ${sectionDivider('APPEARANCE')}
      ${logoEditor()}
      ${colorEditor()}
      ${switchField('显示页眉进度点', 'meta.showDots', meta.showDots !== false, '每个题目标一个点，当前题目为蓝色，已讲过的题目为绿色。')}
      <div class="editor-help"><strong>16:9 横向版式</strong><br>封面、题目页、解法页会按左侧结构顺序导出。主标题中的换行会原样保留。</div>
    `;
  }

  function renderAgendaEditor(page) {
    $('#editor-fields').innerHTML = `
      ${sectionDivider('AGENDA PAGE')}
      ${inputField('眉题', 'page.kicker', page.kicker, { placeholder: 'CONTEST OVERVIEW' })}
      ${inputField('标题', 'page.title', page.title, { placeholder: '题目一览' })}
      ${textareaField('说明文字（可选）', 'page.intro', page.intro, { rows: 4, className: 'short', meta: 'Markdown', placeholder: '本场题解按题目顺序编排。' })}
      <div class="editor-help"><strong>自动目录</strong><br>题目名称、难度和题解页数会自动从工程里读取；不需要手动维护列表。</div>
      ${pageTools(page)}
    `;
  }

  function renderThanksEditor(page) {
    const thanks = page.thanks || {};
    const groups = M.THANKS_GROUPS.map((group) => textareaField(
      `${group.label} · ${group.en}`,
      `page.thanks.${group.key}`,
      thanks[group.key] || '',
      {
        rows: 2,
        className: 'short',
        meta: '名单 / 感谢语',
        placeholder: `填写${group.label}的名单，或写一句感谢`
      }
    )).join('');
    $('#editor-fields').innerHTML = `
      ${sectionDivider('ACKNOWLEDGEMENTS PAGE')}
      <div class="field-grid">
        ${inputField('眉题', 'page.kicker', page.kicker, { placeholder: 'ACKNOWLEDGEMENTS' })}
        ${inputField('标题', 'page.title', page.title, { placeholder: '致谢' })}
      </div>
      ${textareaField('总起说明（可选）', 'page.intro', page.intro, { rows: 3, meta: 'Markdown', placeholder: '一场比赛从题目构思到最终榜单，离不开许多人的投入。' })}
      ${sectionDivider('PEOPLE TO THANK')}
      ${groups}
      ${textareaField('收束语（可选）', 'page.outro', page.outro, { rows: 2, meta: 'Markdown', placeholder: '谢谢每一位让这场比赛发生的人。' })}
      <div class="editor-help"><strong>单独成页的致谢</strong><br>五个对象会按「出题组 / 验题人 / 志愿者 / 参赛选手 / 教练与带队老师」排成一组。每个输入框支持换行，也可以写一句具体的感谢。</div>
      ${pageTools(page)}
    `;
  }

  function renderClosingEditor(page) {
    $('#editor-fields').innerHTML = `
      ${sectionDivider('CLOSING PAGE')}
      <div class="field-grid">
        ${inputField('眉题', 'page.kicker', page.kicker, { placeholder: 'CLOSING' })}
        ${inputField('标题', 'page.title', page.title, { placeholder: '写在最后' })}
      </div>
      ${textareaField('想说的话', 'page.body', page.body, {
        rows: 10,
        className: 'tall',
        meta: 'Markdown + TeX',
        toolbar: true,
        placeholder: '无论你处在竞赛的哪个阶段，没有发挥出理想成绩都是一件自然的事……'
      })}
      ${inputField('署名（可选）', 'page.signoff', page.signoff, { placeholder: '题解组' })}
      <div class="editor-help"><strong>给读者的收尾</strong><br>这一页适合写赛后的碎碎念：安慰失利的选手，感谢坚持的教练，也可以只留一句「下一场见」。语气不必端着，真诚比工整重要。</div>
      ${pageTools(page)}
    `;
  }

  function renderProblemEditor(page) {
    const problem = M.problemById(state.project, page.problemId) || currentProblemOrFirst();
    if (!problem) return renderEmptyEditor();
    $('#editor-fields').innerHTML = `
      ${sectionDivider('PROBLEM')}
      <div class="field-grid">
        ${inputField('题号', 'problem.code', problem.code, { placeholder: 'A' })}
        ${inputField('题目名称', 'problem.name', problem.name, { placeholder: '区间合并' })}
      </div>
      ${textareaField('题面摘要 / 改写后的题意', 'problem.statement', problem.statement, { rows: 7, className: 'tall', meta: 'Markdown + TeX', toolbar: true, placeholder: '给定 $n$ 个闭区间 $[l_i,r_i]$……' })}
      ${textareaField('数据范围 / Constraints', 'problem.constraints', problem.constraints, { rows: 3, meta: 'TeX', toolbar: true, placeholder: '$1 \\\\le n \\\\le 2\\\\times 10^5$' })}
      ${sectionDivider('CONTEST DATA')}
      <div class="field-grid">
        ${inputField('尝试队伍', 'problem.attempted', problem.attempted, { placeholder: '312' })}
        ${inputField('通过队伍', 'problem.solved', problem.solved, { placeholder: '286' })}
        ${inputField('首个通过', 'problem.firstBlood', problem.firstBlood, { placeholder: '队名 @ 12 min' })}
        ${inputField('预期难度', 'problem.difficulty', problem.difficulty, { placeholder: 'Basic / Medium / Hard' })}
      </div>
      <div class="field-grid">
        ${inputField('标程长度', 'problem.judgeSolution', problem.judgeSolution, { placeholder: '685 Bytes' })}
        ${inputField('标签（可选）', 'problem.tags', problem.tags, { placeholder: '排序 · 贪心' })}
      </div>
      <div class="field-grid">
        ${inputField('Idea by', 'problem.ideaBy', problem.ideaBy, { placeholder: '出题人' })}
        ${inputField('Prepared by', 'problem.preparedBy', problem.preparedBy, { placeholder: '验题人' })}
      </div>
      <div class="editor-help"><strong>比赛数据可留空</strong><br>右侧信息栏只显示已经填写的字段。不要把非公开比赛数据随工程上传到公开仓库。</div>
      ${pageTools(page)}
    `;
  }

  function imageOptions(selected) {
    const assets = state.project.assets || [];
    return `<option value=""${!selected ? ' selected' : ''}>不使用主图</option>${assets.map((asset) => `<option value="${attr(asset.id)}"${asset.id === selected ? ' selected' : ''}>${escape(asset.name)}</option>`).join('')}`;
  }

  function heroImageEditor(page) {
    const asset = (state.project.assets || []).find((item) => item.id === page.imageId);
    return `<div class="field">
      <span class="field-label"><span>本页主图</span><em>图文 / 整页图布局</em></span>
      <div class="image-select-row">
        <select data-bind="page.imageId">${imageOptions(page.imageId)}</select>
        <button type="button" class="btn btn-ghost btn-small" data-open-images="hero">＋ 上传</button>
      </div>
      ${asset ? `<div class="image-thumb-row"><img src="${attr(asset.data)}" alt=""><button type="button" data-page-action="remove-image">移除主图</button></div>` : '<p class="field-hint">也可以直接上传一张算法示意图；正文里仍然可以插入多张图片。</p>'}
    </div>
    ${inputField('图注（可选）', 'page.imageCaption', page.imageCaption, { placeholder: '图 1：扫描过程示意' })}`;
  }

  function renderSolutionEditor(page) {
    const isSolution = page.type === 'solution';
    const layout = page.layout || 'split';
    const showHero = layout === 'visual' || layout === 'figure';
    const leftLabel = layout === 'single' ? '本页讲解内容' : (showHero ? '左侧讲解' : '左栏内容');
    const rightLabel = '右栏内容';
    $('#editor-fields').innerHTML = `
      ${sectionDivider(isSolution ? 'SOLUTION PAGE' : 'CUSTOM PAGE')}
      <div class="field-grid">
        ${inputField('眉题', 'page.kicker', page.kicker, { placeholder: isSolution ? 'SOLUTION' : 'NOTE' })}
        ${selectField('页面布局', 'page.layout', layout, [
          { value: 'split', label: '双栏推导' },
          { value: 'single', label: '通栏内容' },
          { value: 'visual', label: '图文讲解' },
          { value: 'figure', label: '整页图片' }
        ])}
      </div>
      ${inputField('这一页的标题', 'page.title', page.title, { placeholder: isSolution ? '核心观察' : '补充说明' })}
      ${layout !== 'figure' ? textareaField(leftLabel, 'page.left', page.left, { rows: 9, className: 'tall', meta: 'Markdown + TeX', toolbar: true, placeholder: '先写核心观察，再补推导、证明或实现。' }) : ''}
      ${layout === 'split' ? textareaField(rightLabel, 'page.right', page.right, { rows: 9, className: 'tall', meta: 'Markdown + TeX', toolbar: true, placeholder: '补充证明、边界情况或易错点。' }) : ''}
      ${showHero ? heroImageEditor(page) : ''}
      ${textareaField('复杂度 / 页脚备注', 'page.complexity', page.complexity, { rows: 2, className: 'short', meta: 'TeX', placeholder: '时间复杂度 $O(n\\\\log n)$，空间复杂度 $O(n)$。' })}
      <div class="editor-help"><strong>${escape(layoutLabel(layout))}</strong><br>${layout === 'split' ? '左右两栏各占一半，中间会自动加分隔线。' : layout === 'single' ? '正文占满一栏，适合完整证明或代码。' : layout === 'visual' ? '左侧放讲解，右侧放一张主图。' : '整页只放主图，适合复杂示意图。'}${layout === 'figure' || layout === 'visual' ? ' 正文里仍可插入图片。' : ''}</div>
      ${pageTools(page)}
    `;
  }

  function renderEmptyEditor() {
    $('#editor-fields').innerHTML = '<div class="empty-editor">还没有可编辑的页面。点击左下角的「载入示例」或「新建空白」开始。</div>';
  }

  function renderEditor() {
    const page = activePage();
    if (!page) return renderEmptyEditor();
    updateEditorHead();
    if (page.type === 'cover') renderCoverEditor();
    else if (page.type === 'agenda') renderAgendaEditor(page);
    else if (page.type === 'thanks') renderThanksEditor(page);
    else if (page.type === 'closing') renderClosingEditor(page);
    else if (page.type === 'problem') renderProblemEditor(page);
    else renderSolutionEditor(page);
  }

  function renderAll() {
    if (!state.project) return;
    renderSidebar();
    renderEditor();
    renderPreview();
  }

  function selectPage(id) {
    if (!id || id === state.activePageId) return;
    if (!M.pageById(state.project, id)) return;
    state.activePageId = id;
    state.lastTextareaId = '';
    renderAll();
    $('#editor-fields').scrollTop = 0;
  }

  function navigatePage(delta) {
    if (!state.project) return;
    const pages = state.project.pages;
    const index = pages.findIndex((page) => page.id === state.activePageId);
    if (index < 0) return;
    const next = (index + delta + pages.length) % pages.length;
    state.activePageId = pages[next].id;
    state.lastTextareaId = '';
    renderAll();
    $('#editor-fields').scrollTop = 0;
  }

  function insertText(textarea, text, selectOffset) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.setRangeText(text, start, end, 'end');
    if (selectOffset !== undefined) {
      const position = start + selectOffset;
      textarea.setSelectionRange(position, position + (text.length - selectOffset));
    }
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function wrapSelection(textarea, before, after, placeholder) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end) || placeholder;
    textarea.setRangeText(`${before}${selected}${after}`, start, end, 'select');
    const selectionStart = start + before.length;
    textarea.setSelectionRange(selectionStart, selectionStart + selected.length);
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function prefixLines(textarea, prefix) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end) || '列表项';
    const replacement = selected.split('\n').map((line) => `${prefix}${line}`).join('\n');
    textarea.setRangeText(replacement, start, end, 'select');
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function targetTextarea(targetId) {
    return targetId ? document.getElementById(targetId) : null;
  }

  function markdownCommand(command, targetId) {
    const textarea = targetTextarea(targetId);
    if (!textarea) return;
    state.lastTextareaId = textarea.id;
    if (command === 'formula') return openFormulaDialog(textarea.id, 'inline');
    if (command === 'display') return openFormulaDialog(textarea.id, 'display');
    if (command === 'image') return openImageDialog(textarea.id, false);
    if (command === 'bold') return wrapSelection(textarea, '**', '**', '重点');
    if (command === 'italic') return wrapSelection(textarea, '*', '*', '强调');
    if (command === 'strike') return wrapSelection(textarea, '~~', '~~', '删除');
    if (command === 'highlight') return wrapSelection(textarea, '==', '==', '高亮');
    if (command === 'code') return wrapSelection(textarea, '`', '`', 'code');
    if (command === 'bullet') return prefixLines(textarea, '- ');
    if (command === 'ordered') return prefixLines(textarea, '1. ');
    if (command === 'quote') return prefixLines(textarea, '> ');
    if (command === 'table') {
      return insertText(textarea, '| 项目 | 说明 |\n| --- | --- |\n|  |  |\n');
    }
    if (command === 'codeblock') {
      return insertText(textarea, '\n```cpp\n\n```\n');
    }
  }

  /* ---------- formula dialog ---------- */
  const formulaSymbols = [
    ['≤', '\\le'], ['≥', '\\ge'], ['≠', '\\ne'], ['≈', '\\approx'],
    ['×', '\\times'], ['·', '\\cdot'], ['±', '\\pm'], ['∞', '\\infty'],
    ['∈', '\\in'], ['∉', '\\notin'], ['⊆', '\\subseteq'], ['∪', '\\cup'],
    ['∩', '\\cap'], ['∀', '\\forall'], ['∃', '\\exists'], ['→', '\\to'],
    ['⇒', '\\Rightarrow'], ['⇔', '\\Leftrightarrow'], ['∑', '\\sum'], ['∏', '\\prod'],
    ['∫', '\\int'], ['√', '\\sqrt{}'], ['α', '\\alpha'], ['β', '\\beta'],
    ['θ', '\\theta'], ['λ', '\\lambda'], ['μ', '\\mu'], ['π', '\\pi'],
    ['σ', '\\sigma'], ['φ', '\\varphi'], ['ω', '\\omega'], ['Δ', '\\Delta']
  ];

  const formulaTemplates = [
    ['分数', '\\frac{a}{b}'],
    ['根号', '\\sqrt{x}'],
    ['求和', '\\sum_{i=1}^{n} a_i'],
    ['积分', '\\int_{a}^{b} f(x)\\,dx'],
    ['极限', '\\lim_{n\\to\\infty} a_n'],
    ['组合数', '\\binom{n}{k}'],
    ['对齐', '\\begin{aligned}\n  a &= b + c \\\\\n  d &= e + f\n\\end{aligned}'],
    ['分段', '\\begin{cases}\n  x, & x \\ge 0 \\\\\n  -x, & x < 0\n\\end{cases}'],
    ['矩阵', '\\begin{pmatrix}\n  a & b \\\\\n  c & d\n\\end{pmatrix}'],
    ['取模', 'a \\bmod m']
  ];

  function insertFormulaSymbol(tex) {
    const textarea = $('#formula-source');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.setRangeText(tex, start, end, 'end');
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function formulaMode() {
    const checked = document.querySelector('input[name="formula-mode"]:checked');
    return checked ? checked.value : 'inline';
  }

  function renderFormulaPreview() {
    const source = $('#formula-source').value.trim();
    const preview = $('#formula-preview');
    const error = $('#formula-error');
    error.textContent = '';
    preview.innerHTML = '';
    if (!source) {
      preview.innerHTML = '<span class="preview-empty">在上方输入 TeX</span>';
      return;
    }
    if (!window.katex) {
      preview.textContent = source;
      return;
    }
    try {
      window.katex.render(source, preview, {
        displayMode: formulaMode() === 'display',
        throwOnError: false,
        strict: 'ignore',
        trust: false,
        errorColor: '#b04f45'
      });
      const katexError = preview.querySelector('.katex-error');
      if (katexError) error.textContent = `KaTeX：${katexError.textContent || '公式语法有误'}`;
    } catch (exception) {
      preview.textContent = source;
      error.textContent = exception.message || '公式无法渲染';
    }
  }

  function openFormulaDialog(targetId, mode = 'inline') {
    const textarea = targetTextarea(targetId);
    if (!textarea) {
      showToast('先把光标放到一个正文输入框里。');
      return;
    }
    state.formulaTarget = targetId;
    const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd).trim();
    $('#formula-source').value = selected ? U.normalizeMathSource(selected) : '';
    const radio = document.querySelector(`input[name="formula-mode"][value="${mode}"]`);
    if (radio) radio.checked = true;
    $('#formula-error').textContent = '';
    openDialog('formula-dialog');
    window.setTimeout(() => {
      const source = $('#formula-source');
      source.focus();
      if (source.value) source.select();
      renderFormulaPreview();
    }, 30);
  }

  function insertFormula() {
    const target = targetTextarea(state.formulaTarget);
    const source = $('#formula-source').value.trim();
    if (!target) return;
    if (!source) {
      $('#formula-error').textContent = '先写一点 TeX。';
      return;
    }
    const mode = formulaMode();
    const wrapped = mode === 'display' ? `\n$$\n${source}\n$$\n` : `$${source}$`;
    insertText(target, wrapped);
    state.formulaTarget = '';
    closeDialog('formula-dialog');
    showToast(mode === 'display' ? '已插入独立公式。' : '已插入行内公式。');
  }

  function setupFormulaDialog() {
    $('#formula-palette').innerHTML = formulaSymbols.map(([label, tex]) => `<button type="button" data-tex="${attr(tex)}" title="${attr(tex)}">${escape(label)}</button>`).join('');
    $('#formula-templates').innerHTML = formulaTemplates.map(([label, tex]) => `<button type="button" data-template="${attr(tex)}">${escape(label)}</button>`).join('');
    $('#formula-palette').addEventListener('click', (event) => {
      const button = event.target.closest('[data-tex]');
      if (button) insertFormulaSymbol(button.dataset.tex);
    });
    $('#formula-templates').addEventListener('click', (event) => {
      const button = event.target.closest('[data-template]');
      if (!button) return;
      const source = $('#formula-source');
      source.value = button.dataset.template;
      source.focus();
      renderFormulaPreview();
    });
    $('#formula-source').addEventListener('input', renderFormulaPreview);
    $$('input[name="formula-mode"]').forEach((radio) => radio.addEventListener('change', renderFormulaPreview));
    $('#insert-formula').addEventListener('click', insertFormula);
    $('#formula-source').addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        insertFormula();
      }
    });
    $('#formula-dialog').addEventListener('close', () => {
      state.formulaTarget = '';
    });
  }

  /* ---------- image library ---------- */
  function canSetHero() {
    const page = activePage();
    return page && (page.type === 'solution' || page.type === 'custom');
  }

  function renderImageGrid() {
    const grid = $('#image-grid');
    const assets = state.project.assets || [];
    if (!assets.length) {
      grid.innerHTML = '<div class="image-empty">图片库还是空的。上传第一张示意图或截图吧。</div>';
      return;
    }
    grid.innerHTML = assets.map((asset) => `<div class="image-card">
      <img src="${attr(asset.data)}" alt="${attr(asset.name)}">
      <span class="image-name" title="${attr(asset.name)}">${escape(asset.name)}</span>
      <span class="image-meta">${asset.width || '?'} × ${asset.height || '?'} · ${U.formatBytes(asset.bytes || asset.data.length)}</span>
      <div class="image-actions">
        <button type="button" data-image-insert="${attr(asset.id)}"${state.imageTarget ? '' : ' disabled'}>插入</button>
        <button type="button" data-image-hero="${attr(asset.id)}"${canSetHero() ? '' : ' disabled'}>主图</button>
        <button type="button" class="image-delete" data-image-delete="${attr(asset.id)}" aria-label="删除图片">×</button>
      </div>
    </div>`).join('');
  }

  function openImageDialog(targetId, hero = false) {
    state.imageTarget = targetId || '';
    state.imageHero = Boolean(hero);
    $('#image-status').textContent = '';
    $('#image-input').value = '';
    renderImageGrid();
    openDialog('image-dialog');
  }

  async function addFilesToLibrary(files, options = {}) {
    const list = Array.from(files || []).filter((file) => /^image\//i.test(file.type || ''));
    if (!list.length) {
      showToast('请选择图片文件（PNG / JPG / WebP / GIF）。');
      return [];
    }
    if (state.imageBusy) return [];
    state.imageBusy = true;
    const status = $('#image-status');
    const added = [];
    try {
      for (let index = 0; index < list.length; index += 1) {
        if (status) status.textContent = `正在处理 ${index + 1} / ${list.length}：${list[index].name}`;
        try {
          const asset = await U.fileToAsset(list[index]);
          const duplicate = (state.project.assets || []).find((item) => item.data === asset.data);
          if (duplicate) {
            added.push(duplicate);
            continue;
          }
          const item = {
            id: U.uid('asset'),
            name: asset.name || `插图 ${state.project.assets.length + 1}`,
            data: asset.data,
            width: asset.width,
            height: asset.height,
            bytes: asset.bytes
          };
          state.project.assets.push(item);
          added.push(item);
        } catch (error) {
          showToast(`${list[index].name}：${error.message || '处理失败'}`, 4200);
        }
      }
      if (added.length) {
        markDirty();
        if ($('#image-dialog').open) renderImageGrid();
        if (status) status.textContent = `已添加 ${added.length} 张图片。`;
        showToast(`已添加 ${added.length} 张图片到图片库。`);
      } else if (status) {
        status.textContent = '没有添加新图片。';
      }
      return added;
    } finally {
      state.imageBusy = false;
    }
  }

  function imageMarkdown(asset, caption) {
    const text = (caption || asset.name || '题解插图').replace(/[\[\]()]/g, '');
    return `![${text}](asset:${asset.id})`;
  }

  function insertAsset(asset, targetId, caption) {
    const textarea = targetTextarea(targetId) || targetTextarea(state.lastTextareaId);
    if (!textarea) {
      showToast('没有可插入的正文输入框。');
      return false;
    }
    const selection = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd).trim();
    insertText(textarea, imageMarkdown(asset, selection || caption));
    state.lastTextareaId = textarea.id;
    return true;
  }

  async function uploadAndInsert(files, targetId) {
    const added = await addFilesToLibrary(files);
    if (!added.length) return;
    const target = targetTextarea(targetId) || targetTextarea(state.lastTextareaId);
    if (!target) {
      openImageDialog(targetId, false);
      return;
    }
    added.forEach((asset, index) => {
      insertText(target, `${index ? '\n\n' : ''}${imageMarkdown(asset)}`);
    });
    showToast(`已上传并插入 ${added.length} 张图片。`);
  }

  function setupImageDialog() {
    $('#image-input').addEventListener('change', async (event) => {
      const files = event.target.files;
      await addFilesToLibrary(files);
      event.target.value = '';
    });
    $('#image-drop').addEventListener('dragover', (event) => {
      event.preventDefault();
      $('#image-drop').classList.add('dragging');
    });
    $('#image-drop').addEventListener('dragleave', () => $('#image-drop').classList.remove('dragging'));
    $('#image-drop').addEventListener('drop', async (event) => {
      event.preventDefault();
      $('#image-drop').classList.remove('dragging');
      await addFilesToLibrary(event.dataTransfer.files);
    });
    $('#image-grid').addEventListener('click', async (event) => {
      const insertButton = event.target.closest('[data-image-insert]');
      if (insertButton) {
        const asset = state.project.assets.find((item) => item.id === insertButton.dataset.imageInsert);
        if (asset && insertAsset(asset, state.imageTarget)) {
          closeDialog('image-dialog');
        }
        return;
      }
      const heroButton = event.target.closest('[data-image-hero]');
      if (heroButton) {
        const page = activePage();
        const asset = state.project.assets.find((item) => item.id === heroButton.dataset.imageHero);
        if (!page || !asset) return;
        page.imageId = asset.id;
        if (page.layout !== 'visual' && page.layout !== 'figure') page.layout = 'visual';
        markDirty();
        renderEditor();
        previewSoon();
        closeDialog('image-dialog');
        showToast('已设为本页主图。');
        return;
      }
      const deleteButton = event.target.closest('[data-image-delete]');
      if (deleteButton) {
        const id = deleteButton.dataset.imageDelete;
        const asset = state.project.assets.find((item) => item.id === id);
        if (!asset) return;
        const used = state.project.pages.filter((page) => page.imageId === id || `${page.left || ''}${page.right || ''}`.includes(`asset:${id}`));
        const ok = await confirmAction('删除图片', used.length ? `这张图片在 ${used.length} 个页面中被引用。删除后会留下「图片未找到」占位，仍要删除吗？` : `从图片库删除「${asset.name}」？`, '删除');
        if (!ok) return;
        state.project.assets = state.project.assets.filter((item) => item.id !== id);
        state.project.pages.forEach((page) => {
          if (page.imageId === id) page.imageId = '';
        });
        markDirty();
        renderImageGrid();
        renderAll();
        showToast('图片已从图片库移除。');
      }
    });
    $('#close-image').addEventListener('click', () => closeDialog('image-dialog'));
    $('#finish-images').addEventListener('click', () => closeDialog('image-dialog'));
    $('#image-dialog').addEventListener('close', () => {
      state.imageTarget = '';
      state.imageHero = false;
    });
  }

  /* ---------- page / problem operations ---------- */
  function focusField(bind) {
    window.setTimeout(() => {
      const field = document.querySelector(`[data-bind="${bind}"]`);
      if (field) {
        field.focus();
        if (field.select) field.select();
      }
    }, 50);
  }

  function addProblem() {
    const code = M.nextProblemCode(state.project);
    const problem = M.createProblem(code, '新题目');
    state.project.problems.push(problem);
    const pages = [M.problemPage(problem.id), M.solutionPage(problem.id)];
    // Keep deck order and problem-code order aligned: a new problem is appended.
    state.project.pages.push(...pages);
    state.activePageId = pages[0].id;
    markDirty();
    renderAll();
    focusField('problem.name');
    showToast(`已添加题目 ${code}。`);
  }

  function addSolutionPage() {
    const problem = currentProblemOrFirst();
    if (!problem) return;
    const page = M.solutionPage(problem.id, '新的一步');
    const current = activePage();
    if (current && current.problemId === problem.id) {
      M.insertAfter(state.project.pages, current.id, [page]);
    } else {
      M.insertAtEndOfProblem(state.project, problem.id, [page]);
    }
    state.activePageId = page.id;
    markDirty();
    renderAll();
    focusField('page.title');
    showToast('已添加解法页。');
  }

  function addCustomPage() {
    const problem = currentProblem();
    const page = {
      id: U.uid('page'),
      type: 'custom',
      problemId: problem ? problem.id : '',
      kicker: 'NOTE',
      title: '补充说明',
      layout: 'split',
      left: '',
      right: '',
      complexity: '',
      imageId: '',
      imageCaption: ''
    };
    M.insertAfter(state.project.pages, state.activePageId, [page]);
    state.activePageId = page.id;
    markDirty();
    renderAll();
    focusField('page.title');
    showToast('已添加自定义页。');
  }

  function addAgendaPage() {
    const page = {
      id: U.uid('page'),
      type: 'agenda',
      kicker: 'CONTEST OVERVIEW',
      title: '题目一览',
      intro: ''
    };
    M.insertAfter(state.project.pages, state.activePageId, [page]);
    state.activePageId = page.id;
    markDirty();
    renderAll();
    focusField('page.title');
    showToast('已添加题目目录页。');
  }

  function addThanksPage() {
    const page = M.thanksPage();
    // Keep the closing page last if one already exists.
    const closingIndex = state.project.pages.findIndex((item) => item.type === 'closing');
    if (closingIndex >= 0) state.project.pages.splice(closingIndex, 0, page);
    else state.project.pages.push(page);
    state.activePageId = page.id;
    markDirty();
    renderAll();
    focusField('page.thanks.setters');
    showToast('已添加独立的致谢页，五个感谢对象都可以单独填写。');
  }

  function addClosingPage() {
    const page = M.closingPage();
    state.project.pages.push(page);
    state.activePageId = page.id;
    markDirty();
    renderAll();
    focusField('page.title');
    showToast('已添加结语页，可以写赛后的碎碎念了。');
  }

  async function deletePage(page) {
    if (!page) return;
    if (page.type === 'cover') {
      showToast('封面不能删除。');
      return;
    }
    const removedIndex = state.project.pages.findIndex((item) => item.id === page.id);
    if (page.type === 'problem') {
      if (state.project.problems.length <= 1) {
        showToast('至少保留一道题。');
        return;
      }
      const problem = M.problemById(state.project, page.problemId);
      const count = M.pagesOfProblem(state.project, page.problemId).length;
      const ok = await confirmAction('删除题目', `删除题目「${problem ? problem.name : ''}」以及它的 ${count} 个页面？`, '删除题目');
      if (!ok) return;
      state.project.problems = state.project.problems.filter((item) => item.id !== page.problemId);
      state.project.pages = state.project.pages.filter((item) => item.problemId !== page.problemId);
    } else {
      const ok = await confirmAction('删除页面', `删除「${M.pageLabel(state.project, page)}」？这个操作不能撤销。`, '删除');
      if (!ok) return;
      state.project.pages = state.project.pages.filter((item) => item.id !== page.id);
    }
    if (!state.project.pages.length) state.project.pages.push(M.coverPage());
    const fallbackIndex = Math.max(0, Math.min(state.project.pages.length - 1, removedIndex));
    state.activePageId = state.project.pages[fallbackIndex].id;
    markDirty();
    renderAll();
    showToast('页面已删除。');
  }

  function movePage(delta) {
    const pages = state.project.pages;
    const index = pages.findIndex((page) => page.id === state.activePageId);
    const target = index + delta;
    if (index < 0 || target < 1 || target >= pages.length) return;
    [pages[index], pages[target]] = [pages[target], pages[index]];
    markDirty();
    renderSidebar();
    renderEditor();
    previewSoon();
  }

  function duplicatePage(page) {
    const copy = JSON.parse(JSON.stringify(page));
    copy.id = U.uid('page');
    if (copy.title) copy.title = `${copy.title}（续）`;
    M.insertAfter(state.project.pages, page.id, [copy]);
    state.activePageId = copy.id;
    markDirty();
    renderAll();
    showToast('页面已复制。');
  }

  function handlePageAction(action) {
    const page = activePage();
    if (!page) return;
    if (action === 'up') return movePage(-1);
    if (action === 'down') return movePage(1);
    if (action === 'duplicate') return duplicatePage(page);
    if (action === 'add-solution') return addSolutionPage();
    if (action === 'delete') return deletePage(page);
    if (action === 'remove-image') {
      page.imageId = '';
      page.imageCaption = '';
      markDirty();
      renderEditor();
      previewSoon();
      showToast('已移除本页主图。');
    }
  }

  /* ---------- persistence / project actions ---------- */
  async function loadInitialProject() {
    if (U.query('demo') === '1') {
      return { project: M.normalize(TX.demoProject()), source: 'demo' };
    }
    if (U.query('new') === '1') {
      return { project: M.normalize(M.emptyProject()), source: 'empty' };
    }
    try {
      const stored = await M.loadStored();
      if (stored) return stored;
    } catch (_) { /* use demo */ }
    return { project: M.normalize(TX.demoProject()), source: 'first-demo' };
  }

  async function boot() {
    try {
      const loaded = await loadInitialProject();
      state.project = loaded.project;
      state.source = loaded.source;
      const requestedPage = Number(U.query('page'));
      const target = Number.isFinite(requestedPage) && requestedPage > 0
        ? state.project.pages[requestedPage - 1]
        : null;
      state.activePageId = (target || state.project.pages[0]).id;
      renderAll();
      updateProjectChrome();
      setSaveState('saved', loaded.source === 'indexeddb' || loaded.source === 'localStorage' ? '已恢复本机草稿' : '示例已就绪');
      state.booted = true;
      if (loaded.source === 'legacy') showToast('已把旧版草稿迁移到新格式。', 3600);
      else if (loaded.source === 'first-demo') showToast('已载入示例，可以直接改；点「新建空白」从零开始。', 4600);
      if (U.query('print') === '1') {
        await preparePrintDeck();
      }
    } catch (error) {
      state.project = M.normalize(M.emptyProject());
      state.activePageId = state.project.pages[0].id;
      renderAll();
      updateProjectChrome();
      showToast(error.message || '载入失败，已打开空白工程。', 4500);
    } finally {
      $('#boot').classList.add('hide');
      window.setTimeout(() => $('#boot').remove(), 350);
    }
  }

  async function newProject() {
    if (hasContent()) {
      const ok = await confirmAction('新建空白题解', '当前草稿会被替换。建议先导出 JSON 备份。继续吗？', '新建空白');
      if (!ok) return;
    }
    state.project = M.normalize(M.emptyProject());
    state.activePageId = state.project.pages[0].id;
    await saveNow();
    renderAll();
    showToast('已新建空白题解。');
  }

  async function loadDemo() {
    if (hasContent()) {
      const ok = await confirmAction('载入示例', '当前草稿会被示例内容替换。建议先导出 JSON 备份。继续吗？', '载入示例');
      if (!ok) return;
    }
    state.project = M.normalize(TX.demoProject());
    state.activePageId = state.project.pages[0].id;
    await saveNow();
    renderAll();
    showToast('示例已载入，可以逐页查看版式。');
  }

  function hasContent() {
    if (!state.project) return false;
    const meta = state.project.meta;
    if (meta.title.trim() && meta.title.trim() !== '竞赛题解') return true;
    if (meta.authors.trim()) return true;
    if ((state.project.assets || []).length) return true;
    return (state.project.pages || []).some((page) => {
      if (page.type === 'agenda' || page.type === 'thanks' || page.type === 'closing') return true;
      if (page.type === 'custom') return Boolean((page.title || '').trim() || (page.left || '').trim() || (page.right || '').trim() || page.imageId);
      if (page.type === 'solution') return Boolean((page.title || '').trim() !== '核心观察' || (page.left || '').trim() || (page.right || '').trim() || page.imageId || (page.complexity || '').trim());
      if (page.type === 'problem') {
        const problem = M.problemById(state.project, page.problemId);
        return Boolean(problem && (problem.statement.trim() || problem.constraints.trim() || problem.name.trim() !== '新题目'));
      }
      return false;
    });
  }

  function exportJson() {
    const filename = `${U.safeSlug(projectName())}.json`;
    U.download(filename, JSON.stringify(state.project, null, 2), 'application/json;charset=utf-8');
    showToast('JSON 工程已导出，可用于备份或交给别人导入。');
  }

  async function preparePrintDeck() {
    await R.preparePrint(state.project, $('#print-deck'));
    document.body.dataset.printReady = '1';
  }

  async function openPrintDialog() {
    $('#pdf-page-count').textContent = String(state.project.pages.length);
    openDialog('pdf-dialog');
  }

  async function doPrint() {
    closeDialog('pdf-dialog');
    await saveNow();
    showToast('正在准备打印版式…', 1200);
    const oldTitle = document.title;
    document.title = U.safeSlug(projectName());
    try {
      await preparePrintDeck();
      await U.wait(30);
      window.print();
    } finally {
      window.setTimeout(() => { document.title = oldTitle; }, 800);
    }
  }

  /* ---------- import ---------- */
  function openImport() {
    $('#import-error').textContent = '';
    $('#import-text').value = '';
    $('#json-file').value = '';
    openDialog('import-dialog');
  }

  async function readJsonFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      $('#import-text').value = text;
      $('#import-error').textContent = '';
    } catch (_) {
      $('#import-error').textContent = '无法读取这个文件。';
    }
  }

  async function applyImport() {
    try {
      const text = $('#import-text').value.trim();
      if (!text) throw new Error('先粘贴 JSON 或选择一个文件。');
      const parsed = JSON.parse(text);
      const legacy = !Array.isArray(parsed.pages) && Array.isArray(parsed.slides) && parsed.problem;
      const incoming = legacy ? M.migrateLegacy(parsed) : M.normalize(parsed);
      state.project = incoming;
      state.activePageId = incoming.pages[0].id;
      closeDialog('import-dialog');
      markDirty();
      renderAll();
      showToast('工程已载入。图片已嵌入工程 JSON。');
    } catch (error) {
      $('#import-error').textContent = `无法载入：${error.message || '请检查 JSON 格式。'}`;
    }
  }

  /* ---------- prompt ---------- */
  function promptSnapshot() {
    const copy = JSON.parse(JSON.stringify({
      meta: state.project.meta,
      problems: state.project.problems,
      pages: state.project.pages
    }));
    copy.meta.logo = '';
    copy.pages = copy.pages.map((page) => ({ ...page, imageId: '', imageCaption: page.imageCaption || '' }));
    return copy;
  }

  function makePrompt() {
    return `你是一位严谨的竞赛题解作者。请基于我提供的工程数据，补全一份适合 16:9 横向讲解稿的中文题解。

写作要求：
1. 先独立理解题意，不要编造题目条件、复杂度、结论或比赛数据；无法确定的比赛数据请留空。
2. 每道题拆成「题目页 + 若干解法页」。每页只讲一个清楚的推导步骤，标题短而具体。
3. 先给核心观察，再给证明、算法、复杂度和实现易错点。证明关键不变量，解释边界。
4. 正文用 Markdown；行内公式写 $...$，独立公式写单独一行的 $$...$$。不要使用图片，imageId 一律留空。
5. 只输出一个合法 JSON 对象，不要 Markdown 围栏，不要解释。

字段结构：
{
  "version": 2,
  "meta": {"conference":"赛事英文标题","coverKicker":"CONTEST TUTORIALS","title":"封面主标题（可用 \\n 换行）","subtitle":"副标题","authors":"作者","organizer":"组织","logo":"","accent":"#1f5f8f","showDots":true,"footerNote":""},
  "problems": [{"id":"problem-id","code":"A","name":"题名","statement":"题面摘要","constraints":"数据范围","ideaBy":"","preparedBy":"","attempted":"","solved":"","firstBlood":"","difficulty":"","judgeSolution":"","tags":""}],
  "pages": [
    {"id":"page-cover","type":"cover"},
    {"id":"page-problem","type":"problem","problemId":"problem-id"},
    {"id":"page-solution","type":"solution","problemId":"problem-id","kicker":"SOLUTION","title":"核心观察","layout":"split","left":"左栏 Markdown","right":"右栏 Markdown","complexity":"$O(n\\log n)$","imageId":"","imageCaption":""}
  ],
  "assets": []
}

layout 只能是 split、single、visual、figure。不要输出 assets 的二进制内容。

当前工程数据（仅作为改写参考；请保留已有题目并补全内容）：
${JSON.stringify(promptSnapshot(), null, 2)}`;
  }

  function openPrompt() {
    $('#prompt-text').value = makePrompt();
    $('#prompt-status').textContent = '';
    openDialog('prompt-dialog');
  }

  /* ---------- deploy / copy ---------- */
  const deployText = `题解工坊部署到 GitHub Pages：
1. 新建 GitHub 仓库，把整个项目文件夹上传/推送上去。
2. 进入仓库 Settings → Pages → Build and deployment，把 Source 设为 GitHub Actions。
3. 等待 Actions 完成，访问 https://<your-name>.github.io/<repo>/。
仓库已包含 .github/workflows/pages.yml，推送到 main 会自动部署。
注意：不要上传参考 PDF（.gitignore 已排除）。题解草稿保存在各自浏览器，分享成稿请导出 PDF 或 JSON。`;

  function openDeploy() {
    openDialog('deploy-dialog');
  }

  async function copyText(text, successMessage) {
    try {
      await U.copyText(text);
      showToast(successMessage || '已复制。');
    } catch (error) {
      showToast(error.message || '复制失败，请手动选择文本。', 3600);
    }
  }

  /* ---------- events ---------- */
  function bindCoreEvents() {
    $('#prev-page').addEventListener('click', () => navigatePage(-1));
    $('#next-page').addEventListener('click', () => navigatePage(1));
    $('#outline-list').addEventListener('click', (event) => {
      const item = event.target.closest('[data-page-id]');
      if (item) selectPage(item.dataset.pageId);
    });
    $('#add-problem-button').addEventListener('click', addProblem);
    $('#add-page-button').addEventListener('click', (event) => {
      event.stopPropagation();
      const menu = $('#page-menu');
      menu.hidden = !menu.hidden;
      $('#add-page-button').setAttribute('aria-expanded', String(!menu.hidden));
    });
    $('#page-menu').addEventListener('click', (event) => {
      const button = event.target.closest('[data-add-page]');
      if (!button) return;
      $('#page-menu').hidden = true;
      $('#add-page-button').setAttribute('aria-expanded', 'false');
      if (button.dataset.addPage === 'solution') addSolutionPage();
      else if (button.dataset.addPage === 'custom') addCustomPage();
      else if (button.dataset.addPage === 'agenda') addAgendaPage();
      else if (button.dataset.addPage === 'thanks') addThanksPage();
      else if (button.dataset.addPage === 'closing') addClosingPage();
    });
    $('#demo-button').addEventListener('click', loadDemo);
    $('#new-button').addEventListener('click', newProject);
    $('#import-button').addEventListener('click', openImport);
    $('#export-button').addEventListener('click', exportJson);
    $('#pdf-button').addEventListener('click', openPrintDialog);
    $('#deploy-button').addEventListener('click', openDeploy);
    $('#confirm-pdf').addEventListener('click', doPrint);
    $('#confirm-ok').addEventListener('click', () => resolveConfirm(true));
    $('#confirm-cancel').addEventListener('click', () => resolveConfirm(false));
    $('#confirm-dialog').addEventListener('close', () => {
      if (state.confirmResolver) {
        const resolve = state.confirmResolver;
        state.confirmResolver = null;
        resolve(false);
      }
    });
    $('#focus-preview').addEventListener('click', toggleFocusPreview);
    $('#overflow-help').addEventListener('click', () => showToast('精简这一页的文字，或把后半段拆到下一页；也可以切换成通栏 / 图文布局。', 4200));
  }

  function toggleFocusPreview() {
    const focused = document.body.classList.toggle('focus-preview');
    $('#focus-preview').textContent = focused ? '退出全屏' : '全屏';
    window.setTimeout(() => {
      renderPreview();
    }, 40);
  }

  function bindEditorEvents() {
    const fields = $('#editor-fields');
    fields.addEventListener('input', (event) => {
      const target = event.target;
      if (target.matches('textarea, input[type="text"], input[type="color"]')) {
        if (target.tagName === 'TEXTAREA' && target.id) state.lastTextareaId = target.id;
        if (!target.matches('[data-bind]')) return;
        if (target.tagName === 'SELECT' || target.type === 'checkbox') return;
        applyField(target);
      }
    });
    fields.addEventListener('change', (event) => {
      const target = event.target;
      if (target.matches('[data-bind]')) {
        if (target.tagName === 'SELECT' || target.type === 'checkbox') applyField(target);
      }
      if (target.matches('[data-bind="page.layout"]')) {
        renderEditor();
        renderPreview();
      }
    });
    fields.addEventListener('focusin', (event) => {
      const textarea = event.target.closest('textarea');
      if (textarea && textarea.id) state.lastTextareaId = textarea.id;
    });
    fields.addEventListener('click', (event) => {
      const command = event.target.closest('[data-cmd]');
      if (command) {
        const toolbar = command.closest('[data-toolbar-target]');
        if (toolbar) markdownCommand(command.dataset.cmd, toolbar.dataset.toolbarTarget);
        return;
      }
      const pageAction = event.target.closest('[data-page-action]');
      if (pageAction) {
        handlePageAction(pageAction.dataset.pageAction);
        return;
      }
      const logoUpload = event.target.closest('[data-logo-upload]');
      if (logoUpload) {
        $('#logo-input').value = '';
        $('#logo-input').click();
        return;
      }
      const logoRemove = event.target.closest('[data-logo-remove]');
      if (logoRemove) {
        state.project.meta.logo = '';
        markDirty();
        renderEditor();
        previewSoon();
        showToast('已恢复默认 Logo。');
        return;
      }
      const accentButton = event.target.closest('[data-accent]');
      if (accentButton) {
        state.project.meta.accent = accentButton.dataset.accent;
        markDirty();
        renderEditor();
        previewSoon();
        return;
      }
      const imagesButton = event.target.closest('[data-open-images]');
      if (imagesButton) {
        openImageDialog(state.lastTextareaId, imagesButton.dataset.openImages === 'hero');
      }
    });
    fields.addEventListener('paste', async (event) => {
      const items = Array.from(event.clipboardData?.items || []);
      const files = items.filter((item) => item.kind === 'file' && /^image\//.test(item.type)).map((item) => item.getAsFile()).filter(Boolean);
      if (!files.length) return;
      event.preventDefault();
      const textarea = event.target.closest('textarea');
      await uploadAndInsert(files, textarea ? textarea.id : state.lastTextareaId);
    });
    fields.addEventListener('dragover', (event) => {
      if (event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files')) {
        event.preventDefault();
        fields.classList.add('drag-over');
      }
    });
    fields.addEventListener('dragleave', () => fields.classList.remove('drag-over'));
    fields.addEventListener('drop', async (event) => {
      const files = Array.from(event.dataTransfer?.files || []);
      if (!files.some((file) => /^image\//.test(file.type || ''))) return;
      event.preventDefault();
      fields.classList.remove('drag-over');
      const textarea = event.target.closest('textarea');
      await uploadAndInsert(files, textarea ? textarea.id : state.lastTextareaId);
    });
  }

  function applyField(target) {
    const path = target.dataset.bind;
    if (!path) return;
    const parts = path.split('.');
    const scope = parts[0];
    const value = target.type === 'checkbox' ? target.checked : target.value;
    let object = null;
    if (scope === 'meta') object = state.project.meta;
    else if (scope === 'problem') object = currentProblem();
    else if (scope === 'page') object = activePage();
    if (!object) return;
    for (let index = 1; index < parts.length - 1; index += 1) {
      const segment = parts[index];
      if (!object[segment] || typeof object[segment] !== 'object' || Array.isArray(object[segment])) object[segment] = {};
      object = object[segment];
    }
    const key = parts[parts.length - 1];
    if (!key) return;
    object[key] = value;
    if (scope === 'meta' && key === 'showDots') object[key] = Boolean(value);
    if (scope === 'meta') {
      updateProjectChrome();
      renderSidebar();
    }
    if (scope === 'problem') {
      renderSidebar();
      updateEditorHead();
    }
    if (scope === 'page' && (key === 'title' || key === 'kicker')) {
      renderSidebar();
      updateEditorHead();
    }
    if (scope === 'page' && key === 'imageId') {
      renderEditor();
    }
    markDirty();
    previewSoon();
  }

  function bindGlobalEvents() {
    $('#logo-input').addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        const asset = await U.fileToAsset(file, { maxWidth: 600, maxHeight: 260, maxBytes: 600000 });
        state.project.meta.logo = asset.data;
        markDirty();
        renderEditor();
        renderPreview();
        showToast('Logo 已更新。');
      } catch (error) {
        showToast(error.message || 'Logo 无法读取。', 4000);
      }
      event.target.value = '';
    });
    $('#json-file').addEventListener('change', async (event) => {
      await readJsonFile(event.target.files && event.target.files[0]);
      event.target.value = '';
    });
    $('#json-drop').addEventListener('dragover', (event) => {
      event.preventDefault();
      $('#json-drop').classList.add('dragging');
    });
    $('#json-drop').addEventListener('dragleave', () => $('#json-drop').classList.remove('dragging'));
    $('#json-drop').addEventListener('drop', async (event) => {
      event.preventDefault();
      $('#json-drop').classList.remove('dragging');
      const file = event.dataTransfer.files && event.dataTransfer.files[0];
      await readJsonFile(file);
    });
    $('#apply-import').addEventListener('click', applyImport);
    $('#more-button').addEventListener('click', (event) => {
      event.stopPropagation();
      const menu = $('#more-menu');
      menu.hidden = !menu.hidden;
      $('#more-button').setAttribute('aria-expanded', String(!menu.hidden));
    });
    $('#more-menu').addEventListener('click', (event) => {
      const button = event.target.closest('[data-menu]');
      if (!button) return;
      $('#more-menu').hidden = true;
      $('#more-button').setAttribute('aria-expanded', 'false');
      if (button.dataset.menu === 'new') newProject();
      else if (button.dataset.menu === 'demo') loadDemo();
      else if (button.dataset.menu === 'prompt') openPrompt();
      else if (button.dataset.menu === 'help') openDialog('help-dialog');
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.menu-wrap')) {
        $('#more-menu').hidden = true;
        $('#more-button').setAttribute('aria-expanded', 'false');
      }
      if (!event.target.closest('.add-page-wrap')) {
        $('#page-menu').hidden = true;
        $('#add-page-button').setAttribute('aria-expanded', 'false');
      }
    });
    $('#prompt-button')?.addEventListener('click', openPrompt);
    $('#copy-prompt').addEventListener('click', () => copyText($('#prompt-text').value, '提示词已复制。'));
    $('#copy-deploy-command').addEventListener('click', () => copyText($('#deploy-command').textContent, '命令已复制。'));
    $('#copy-site-hint').addEventListener('click', () => copyText(deployText, '部署说明已复制。'));
    $('#close-image').addEventListener('click', () => closeDialog('image-dialog'));
    $('#finish-images').addEventListener('click', () => closeDialog('image-dialog'));
    document.addEventListener('keydown', (event) => {
      const mod = event.ctrlKey || event.metaKey;
      const dialogOpen = Boolean(document.querySelector('dialog[open]'));
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveNow().then((ok) => showToast(ok ? '工程已保存到本机。' : '保存失败，请导出 JSON 备份。'));
        return;
      }
      if (mod && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        if (dialogOpen) return;
        if (state.lastTextareaId) openFormulaDialog(state.lastTextareaId, 'inline');
        else showToast('先把光标放到一个正文输入框里。');
        return;
      }
      if (mod && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        if (!dialogOpen) openPrintDialog();
        return;
      }
      if (event.key === 'Escape') {
        if (document.body.classList.contains('focus-preview')) {
          document.body.classList.remove('focus-preview');
          $('#focus-preview').textContent = '全屏';
          window.setTimeout(renderPreview, 40);
        }
        $('#more-menu').hidden = true;
        $('#page-menu').hidden = true;
        return;
      }
      if (!dialogOpen && !U.isEditableTarget(event.target) && !event.altKey && !mod) {
        if (event.key === 'ArrowLeft') { event.preventDefault(); navigatePage(-1); }
        if (event.key === 'ArrowRight') { event.preventDefault(); navigatePage(1); }
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && state.project) M.saveStored(state.project).catch(() => {});
    });
    window.addEventListener('beforeunload', () => {
      if (state.project) M.saveStored(state.project).catch(() => {});
    });
    document.addEventListener('click', (event) => {
      const dialog = event.target.closest('dialog');
      if (dialog && event.target === dialog) {
        // Clicking the backdrop closes lightweight dialogs, but not destructive confirms.
        if (dialog.id !== 'confirm-dialog' && dialog.id !== 'image-dialog') dialog.close();
      }
    });
  }

  function setupStaticDialogs() {
    setupFormulaDialog();
    setupImageDialog();
  }

  // Listeners are installed synchronously; boot() waits only for stored data.
  (function start() {
    setupStaticDialogs();
    bindCoreEvents();
    bindEditorEvents();
    bindGlobalEvents();
    boot();
  })();
})();
