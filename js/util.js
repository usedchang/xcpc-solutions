(function () {
  'use strict';

  const TX = window.TX = window.TX || {};
  const U = TX.util = {};

  U.$ = (selector, root = document) => root.querySelector(selector);
  U.$$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  U.uid = (prefix = 'id') => {
    const time = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${time}-${random}`;
  };

  U.escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  U.escapeAttr = U.escapeHtml;

  U.safeSlug = (value, fallback = '题解') => {
    const text = String(value ?? '')
      .replace(/[\\/:*?"<>|\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 64);
    return text || fallback;
  };

  U.debounce = (fn, wait = 300) => {
    let timer = 0;
    let lastArgs = null;
    const wrapped = (...args) => {
      lastArgs = args;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = 0;
        fn(...lastArgs);
      }, wait);
    };
    wrapped.flush = () => {
      if (!timer) return;
      window.clearTimeout(timer);
      timer = 0;
      fn(...(lastArgs || []));
    };
    wrapped.cancel = () => {
      window.clearTimeout(timer);
      timer = 0;
    };
    return wrapped;
  };

  U.formatBytes = (bytes) => {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  };

  U.clamp = (number, min, max) => Math.min(max, Math.max(min, number));

  U.isHexColor = (value) => /^#[0-9a-f]{6}$/i.test(String(value || ''));

  U.isImageData = (value) => /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(String(value || ''));

  U.readAsDataURL = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('文件读取失败。'));
    reader.readAsDataURL(file);
  });

  U.loadImage = (source) => new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片无法读取，请换一张图片。'));
    image.src = source;
  });

  U.imageSize = async (source) => {
    const image = await U.loadImage(source);
    return { width: image.naturalWidth, height: image.naturalHeight };
  };

  U.fileToAsset = async (file, options = {}) => {
    const maxWidth = options.maxWidth || 1800;
    const maxHeight = options.maxHeight || 1400;
    const maxBytes = options.maxBytes || 2400000;
    if (!file || !/^image\//i.test(file.type || '')) throw new Error('请选择图片文件（PNG / JPG / WebP / GIF）。');
    if (file.type === 'image/svg+xml') throw new Error('暂不支持 SVG，请先导出为 PNG。');
    if (file.size > 16 * 1024 * 1024) throw new Error('图片超过 16 MB，请先压缩。');

    if (file.type === 'image/gif') {
      if (file.size > 2500000) throw new Error('GIF 超过 2.5 MB，请压缩后再上传。');
      const data = await U.readAsDataURL(file);
      const size = await U.imageSize(data);
      return { name: file.name || '动图', data, width: size.width, height: size.height, bytes: data.length };
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await U.loadImage(objectUrl);
      const naturalWidth = image.naturalWidth || 1;
      const naturalHeight = image.naturalHeight || 1;
      let scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight);
      let data = '';
      let attempt = 0;
      while (attempt < 4) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(naturalHeight * scale));
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        if (file.type === 'image/jpeg') {
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const candidates = [];
        if (file.type === 'image/png') candidates.push(canvas.toDataURL('image/png'));
        candidates.push(canvas.toDataURL('image/webp', attempt > 1 ? 0.82 : 0.9));
        if (file.type === 'image/jpeg') candidates.push(canvas.toDataURL('image/jpeg', attempt > 1 ? 0.82 : 0.9));
        data = candidates.filter(Boolean).sort((a, b) => a.length - b.length)[0] || '';
        if (data.length <= maxBytes) break;
        attempt += 1;
        scale *= 0.78;
      }
      if (!data) throw new Error('浏览器无法处理这张图片。');
      if (data.length > maxBytes) throw new Error('图片压缩后仍然太大，请换一张较小的图片。');
      const size = await U.imageSize(data);
      return { name: file.name || '插图', data, width: size.width, height: size.height, bytes: data.length };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  U.download = (name, data, mime = 'application/octet-stream') => {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  U.copyText = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    textarea.remove();
    if (!ok) throw new Error('复制失败，请手动选择文本。');
    return true;
  };

  U.nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  U.doubleFrame = async () => { await U.nextFrame(); await U.nextFrame(); };

  U.wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  U.query = (name) => new URLSearchParams(window.location.search).get(name);

  U.modLabel = /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘' : 'Ctrl';

  U.isEditableTarget = (target) => {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  };

  U.unicodeLength = (text) => Array.from(String(text || '')).length;

  U.normalizeMathSource = (text) => String(text || '')
    .replace(/^\s*\$\$?/, '')
    .replace(/\$\$?\s*$/, '')
    .trim();
})();
