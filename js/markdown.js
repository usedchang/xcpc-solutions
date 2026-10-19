(function () {
  'use strict';

  const TX = window.TX = window.TX || {};
  const U = TX.util;
  const MD = TX.markdown = {};
  const TOKEN = /@@TXMATH(\d+)@@/g;

  let renderer = null;
  if (window.marked && window.marked.Renderer) {
    renderer = new window.marked.Renderer();
    renderer.image = (href, title, text) => {
      const alt = U.escapeAttr(text || title || '');
      const caption = text ? `<span class="md-caption">${U.escapeHtml(text)}</span>` : '';
      if (/^asset:/i.test(href || '')) {
        const id = String(href).slice(6);
        return `<span class="md-figure"><img data-asset="${U.escapeAttr(id)}" alt="${alt}"${title ? ` title="${U.escapeAttr(title)}"` : ''}>${caption}</span>`;
      }
      if (/^(https?:|data:image\/)/i.test(href || '')) {
        return `<span class="md-figure"><img src="${U.escapeAttr(href)}" alt="${alt}"${title ? ` title="${U.escapeAttr(title)}"` : ''}>${caption}</span>`;
      }
      return `<span class="missing-image">[图片：${U.escapeHtml(text || href || '')}]</span>`;
    };
    if (window.marked.use) {
      window.marked.use({
        extensions: [{
          name: 'highlight',
          level: 'inline',
          start(src) { return src.indexOf('=='); },
          tokenizer(src) {
            const match = /^==([^=\n]+)==/.exec(src);
            if (!match) return undefined;
            return { type: 'highlight', raw: match[0], text: match[1], tokens: this.lexer.inlineTokens(match[1]) };
          },
          renderer(token) {
            return `<mark class="hl">${this.parser.parseInline(token.tokens)}</mark>`;
          }
        }]
      });
    }
    if (window.marked.setOptions) {
      window.marked.setOptions({ gfm: true, breaks: true, renderer });
    }
  }

  function findUnescaped(source, needle, from, stopAtNewline) {
    let index = from;
    while (index < source.length) {
      if (source[index] === '\\') { index += 2; continue; }
      if (source.startsWith(needle, index)) return index;
      if (stopAtNewline && source[index] === '\n') return -1;
      index += 1;
    }
    return -1;
  }

  function protectMath(source) {
    const formulas = [];
    const input = String(source ?? '');
    let output = '';
    let index = 0;
    let inFence = false;
    const push = (display, tex) => {
      formulas.push({ display, tex });
      return `@@TXMATH${formulas.length - 1}@@`;
    };

    while (index < input.length) {
      const lineStart = index === 0 || input[index - 1] === '\n';
      if (lineStart && input.startsWith('```', index)) {
        const end = input.indexOf('\n', index);
        const lineEnd = end < 0 ? input.length : end + 1;
        output += input.slice(index, lineEnd);
        index = lineEnd;
        inFence = !inFence;
        continue;
      }
      if (inFence) {
        output += input[index];
        index += 1;
        continue;
      }
      if (input[index] === '`') {
        const end = input.indexOf('`', index + 1);
        if (end > index && !input.slice(index, end).includes('\n')) {
          output += input.slice(index, end + 1);
          index = end + 1;
          continue;
        }
      }
      if (input.startsWith('$$', index)) {
        const end = findUnescaped(input, '$$', index + 2, false);
        if (end > index) {
          output += `\n\n${push(true, input.slice(index + 2, end))}\n\n`;
          index = end + 2;
          continue;
        }
      }
      if (input.startsWith('\\[', index)) {
        const end = findUnescaped(input, '\\]', index + 2, false);
        if (end > index) {
          output += `\n\n${push(true, input.slice(index + 2, end))}\n\n`;
          index = end + 2;
          continue;
        }
      }
      if (input.startsWith('\\(', index)) {
        const end = findUnescaped(input, '\\)', index + 2, true);
        if (end > index) {
          output += push(false, input.slice(index + 2, end));
          index = end + 2;
          continue;
        }
      }
      if (input[index] === '$' && input[index - 1] !== '\\') {
        const end = findUnescaped(input, '$', index + 1, true);
        if (end > index) {
          output += push(false, input.slice(index + 1, end));
          index = end + 1;
          continue;
        }
      }
      output += input[index];
      index += 1;
    }
    return { text: output, formulas };
  }

  function sanitize(html) {
    if (!window.DOMPurify) return html;
    return window.DOMPurify.sanitize(html, {
      ADD_ATTR: ['data-asset'],
      FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'option'],
      FORBID_ATTR: ['style', 'srcdoc'],
      ALLOW_DATA_ATTR: true,
      USE_PROFILES: { html: true }
    });
  }

  function restoreMath(html, formulas) {
    return html.replace(TOKEN, (match, rawIndex) => {
      const formula = formulas[Number(rawIndex)];
      if (!formula) return '';
      const className = formula.display ? 'math-display' : 'math-inline';
      return `<span class="${className}" data-tex="${U.escapeAttr(formula.tex)}"></span>`;
    });
  }

  function resolveAssetImages(root, project) {
    const map = new Map((project.assets || []).map((asset) => [asset.id, asset]));
    root.querySelectorAll('img[data-asset]').forEach((image) => {
      const asset = map.get(image.getAttribute('data-asset'));
      if (!asset) {
        const placeholder = document.createElement('span');
        placeholder.className = 'missing-image';
        placeholder.textContent = '[图片未找到]';
        image.replaceWith(placeholder);
        return;
      }
      image.src = asset.data;
      image.removeAttribute('data-asset');
      image.loading = 'eager';
      image.decoding = 'async';
      if (!image.alt) image.alt = asset.name || '题解插图';
    });
  }

  MD.renderMath = (root) => {
    if (!root || !root.querySelectorAll) return;
    const nodes = root.querySelectorAll('[data-tex]:not([data-rendered])');
    nodes.forEach((element) => {
      const tex = element.getAttribute('data-tex') || '';
      const display = element.classList.contains('math-display');
      if (!window.katex) {
        element.textContent = display ? `$$${tex}$$` : `$${tex}$`;
        element.dataset.rendered = 'true';
        return;
      }
      try {
        window.katex.render(tex, element, {
          displayMode: display,
          throwOnError: false,
          strict: 'ignore',
          trust: false,
          output: 'htmlAndMathml',
          macros: {
            '\\R': '\\mathbb{R}',
            '\\N': '\\mathbb{N}',
            '\\Z': '\\mathbb{Z}',
            '\\eps': '\\varepsilon'
          }
        });
        element.dataset.rendered = 'true';
      } catch (_) {
        element.textContent = display ? `$$${tex}$$` : `$${tex}$`;
        element.classList.add('math-fallback');
      }
    });
  };

  MD.render = (source, project) => {
    const protectedSource = protectMath(source);
    let html = '';
    if (window.marked && window.marked.parse) {
      html = window.marked.parse(protectedSource.text, { renderer, gfm: true, breaks: true });
    } else {
      html = `<p>${U.escapeHtml(protectedSource.text).replace(/\n/g, '<br>')}</p>`;
    }
    html = restoreMath(html, protectedSource.formulas);
    return sanitize(html);
  };

  MD.hydrate = (root, project) => {
    if (!root) return;
    resolveAssetImages(root, project);
    MD.renderMath(root);
  };

  MD.fill = (element, source, project) => {
    if (!element) return;
    element.innerHTML = MD.render(source, project);
    MD.hydrate(element, project);
  };

  MD.renderInto = MD.fill;
})();
