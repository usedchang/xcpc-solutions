(function () {
  'use strict';

  const TX = window.TX = window.TX || {};
  const TEX = TX.tex = {};
  const encoder = new TextEncoder();

  const COLORS = {
    navy: '102A43', text: '172B3A', blue: '0B4F9C', cyan: '0E8FD0',
    green: '299C63', pale: 'D6E3EC', red: 'FF4136', amber: 'F2A300',
    muted: '61747E', rule: 'E1E8ED', highlight: 'FFF0BD'
  };

  function asText(value) {
    return String(value == null ? '' : value);
  }

  function texEscape(value) {
    const map = {
      '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '#': '\\#', '$': '\\$',
      '%': '\\%', '&': '\\&', '_': '\\_', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}'
    };
    return asText(value).replace(/[\\{}#$%&_^~]/g, (character) => map[character]);
  }

  function visualText(value) {
    return asText(value).replace(/<[^>]*>/g, '');
  }

  function texUrl(value) {
    return asText(value).replace(/[{}\\]/g, (character) => ({
      '{': '%7B', '}': '%7D', '\\': '%5C'
    }[character])).replace(/[%#&_]/g, (character) => `\\${character}`);
  }

  function dataUrlParts(data) {
    const match = /^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i.exec(asText(data));
    if (!match) return null;
    let binary = '';
    try { binary = atob(match[2].replace(/\s/g, '')); } catch (_) { return null; }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return { mime: match[1].toLowerCase(), bytes };
  }

  function extensionForMime(mime) {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
    return '';
  }

  async function imageAsPng(data) {
    const image = new Image();
    image.decoding = 'async';
    const loaded = new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('图片无法转换为 PNG。'));
    });
    image.src = data;
    await loaded;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width || 1;
    canvas.height = image.naturalHeight || image.height || 1;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return dataUrlParts(canvas.toDataURL('image/png')).bytes;
  }

  async function prepareAssets(project, warnings) {
    const files = [];
    const names = new Map();
    const assets = Array.isArray(project.assets) ? project.assets : [];
    for (let index = 0; index < assets.length; index += 1) {
      const asset = assets[index] || {};
      const parsed = dataUrlParts(asset.data);
      if (!parsed) {
        warnings.push(`图片“${asText(asset.name) || index + 1}”格式无法识别，已跳过`);
        continue;
      }
      let extension = extensionForMime(parsed.mime);
      let bytes = parsed.bytes;
      if (!extension) {
        try {
          bytes = await imageAsPng(asset.data);
          extension = 'png';
        } catch (_) {
          warnings.push(`图片“${asText(asset.name) || index + 1}”无法转成 LaTeX 可用格式，已跳过`);
          continue;
        }
      }
      const name = `asset-${String(index + 1).padStart(3, '0')}.${extension}`;
      names.set(asText(asset.id), name);
      files.push({ name: `assets/${name}`, data: bytes });
    }

    let logoName = '';
    if (project.meta && project.meta.logo) {
      const parsed = dataUrlParts(project.meta.logo);
      if (parsed) {
        let extension = extensionForMime(parsed.mime);
        let bytes = parsed.bytes;
        if (!extension) {
          try {
            bytes = await imageAsPng(project.meta.logo);
            extension = 'png';
          } catch (_) { warnings.push('自定义 Logo 无法转成 LaTeX 可用格式，已使用默认标记'); }
        }
        if (extension) {
          logoName = `logo.${extension}`;
          files.push({ name: `assets/${logoName}`, data: bytes });
        }
      }
    }
    return { files, names, logoName };
  }

  function imageTex(asset, caption, context) {
    const name = context.assetNames.get(asset.id);
    if (!name) {
      context.warnings.push(`正文引用的图片“${asset.id}”未找到，已省略`);
      return `\\fbox{${texEscape(caption || '图片未找到')}}`;
    }
    const width = (TX.util.clamp(Number(asset.width) || 100, 20, 100) / 100).toFixed(2);
    const height = TX.util.clamp(Number(asset.height) || 100, 20, 200) / 100;
    const maxHeight = (context.imageMaxHeight || 182) / height;
    const graphic = `\\scalebox{1}[${height.toFixed(2)}]{\\includegraphics[width=${width}\\linewidth,height=${maxHeight.toFixed(1)}bp,keepaspectratio]{assets/${name}}}`;
    const body = caption
      ? `${graphic}\\par\\vspace{3pt}{\\fontsize{10}{13}\\selectfont\\color{txmuted}${inlineTex(caption, context)}}`
      : graphic;
    const align = asset.align === 'left' ? '\\raggedright' : (asset.align === 'right' ? '\\raggedleft' : '\\centering');
    return `\\par\\begingroup${align}\\noindent${body}\\par\\endgroup`;
  }

  // Convert the preview's sanitized DOM before KaTeX hydration.
  function domTex(node, context) {
    if (node.nodeType === 3) return texEscape(node.textContent);
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    const children = () => Array.from(node.childNodes).map((child) => domTex(child, context)).join('');
    if (node.hasAttribute('data-tex')) {
      const math = node.getAttribute('data-tex');
      return node.classList.contains('math-display') ? `\\[${math}\\]` : `\\(${math}\\)`;
    }
    if (node.classList.contains('md-figure')) {
      const caption = node.querySelector('.md-caption')?.textContent || '';
      if (node.dataset.assetId) return imageTex({ id: node.dataset.assetId, width: Number(node.dataset.imgW) || 100, height: Number(node.dataset.imgH) || 100, align: node.dataset.imgA || 'center' }, caption, context);
      const href = node.querySelector('img')?.getAttribute('src') || '';
      context.warnings.push(`外部图片“${caption || '图片'}”未打包，请先上传到图片库${/^https?:/i.test(href) ? `（${href}）` : ''}`);
      return `[${texEscape(caption || '外部图片未打包')}]`;
    }
    if (tag === 'pre') {
      const code = node.textContent.replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
      // Render plain code as escaped text so a single .tex includes every code block.
      // Each line is a paragraph: braces and environment terminators stay literal.
      return `\\par{\\ttfamily\\fontsize{12}{16}\\selectfont\\setlength{\\parskip}{0pt}${code.split('\n').map((line) => `\\noindent ${texEscape(line).replace(/ /g, '\\ ')}\\strut\\par`).join('\n')}}\\vspace{6pt}`;
    }
    if (tag === 'code') return `\\texttt{${texEscape(node.textContent)}}`;
    if (tag === 'strong' || tag === 'b') return `\\textbf{${children()}}`;
    if (tag === 'em' || tag === 'i') return `\\emph{${children()}}`;
    if (tag === 'del') return `\\sout{${children()}}`;
    if (tag === 'mark') return `\\textcolor{txamber}{\\bfseries ${children()}}`;
    if (tag === 'br') return '\\\\{}';
    if (tag === 'p') return `\\par ${children()}\\par\\vspace{8pt}`;
    if (/^h[1-6]$/.test(tag)) return `\\par\\vspace{5pt}{\\bfseries ${children()}\\par}\\vspace{3pt}`;
    if (tag === 'ul' || tag === 'ol') {
      const env = tag === 'ul' ? 'itemize' : 'enumerate';
      return `\\begin{${env}}\\fontsize{19}{28}\\selectfont ${children()}\\end{${env}}`;
    }
    if (tag === 'li') return `\\item ${children()}`;
    if (tag === 'blockquote') return `\\begin{TXQuote}${children()}\\end{TXQuote}`;
    if (tag === 'hr') return '\\par\\vspace{5pt}{\\color{txrule}\\hrule}\\vspace{5pt}';
    if (tag === 'a') return `\\href{${texUrl(node.getAttribute('href') || '')}}{${children()}}`;
    if (tag === 'table') {
      const rows = Array.from(node.querySelectorAll('tr'));
      const count = Math.max(1, ...rows.map((row) => row.children.length));
      const spec = Array(count).fill('>{\\RaggedRight\\arraybackslash}X').join('');
      const content = rows.map((row) => Array.from(row.children).map((cell) => domTex(cell, context)).join(' & ') + ' \\\\ ').join(' ');
      return `\\par{\\fontsize{15}{20}\\selectfont\\begin{tabularx}{\\linewidth}{${spec}}\\toprule ${content}\\bottomrule\\end{tabularx}}\\par`;
    }
    if (tag === 'th') return `\\textbf{${children()}}`;
    const color = Array.from(node.classList).find((name) => /^c-(red|green|blue|amber|muted)$/.test(name));
    if (color) return `\\textcolor{tx${color === 'c-blue' ? 'link' : color.slice(2)}}{${children()}}`;
    return children();
  }

  function blockTex(source, context) {
    const root = document.createElement('div');
    root.innerHTML = TX.markdown.render(source, context.project);
    return Array.from(root.childNodes).map((node) => domTex(node, context)).join('');
  }

  function inlineTex(source, context) {
    const root = document.createElement('div');
    root.innerHTML = TX.markdown.render(source, context.project);
    return Array.from(root.childNodes).map((node) => node.nodeType === 1 && node.tagName === 'P'
      ? Array.from(node.childNodes).map((child) => domTex(child, context)).join('')
      : domTex(node, context)).join(' ').trim();
  }

  function lineBreakTex(value, context) {
    return asText(value).split(/\r?\n/).map((line) => inlineTex(line, context)).join('\\\\');
  }

  function titleTex(value, context, cover) {
    const text = asText(value);
    const content = text.split(/\r?\n/).map(texEscape).join('\\\\');
    const initial = Array.from(text)[0] || '';
    const colored = initial ? `\\textcolor{txblue}{\\fontsize{35}{42}\\selectfont ${texEscape(initial)}}${texEscape(text.slice(initial.length))}` : '';
    return cover
      ? `{\\fontsize{48}{72}\\selectfont\\bfseries\\color{txnavy}${content}\\par}`
      : `{\\fontsize{30}{38}\\selectfont\\bfseries\\color{txnavy}${colored}\\par}\\vspace{20pt}`;
  }

  function problemFor(project, page) {
    return (project.problems || []).find((problem) => problem.id === page.problemId) || null;
  }

  function problemIndex(project, page) {
    if (!page || !page.problemId) return -1;
    return (project.problems || []).findIndex((problem) => problem.id === page.problemId);
  }

  function defaultLogoTex() {
    const logo = TX.logo;
    if (!logo || !logo.tikz) return '';
    const scale = (68 / logo.width).toFixed(6);
    return String.raw`\begin{scope}[shift={([xshift=42pt,yshift=-16.2pt]current page.north west)},x=${scale}pt,y=${scale}pt,yscale=-1]
${logo.tikz}
\end{scope}`;
  }

  function headerTex(project, activeIndex, assets, context) {
    const problems = project.problems || [];
    const gap = problems.length > 18 ? 18 : (problems.length > 13 ? 23 : 28);
    const dots = (project.meta.showDots === false ? [] : problems).map((problem, index) => {
      const color = index < activeIndex ? 'txgreen' : (index === activeIndex ? 'txblue' : 'txpale');
      const radius = index === activeIndex ? '5.3pt' : '4.2pt';
      return `\\fill[${color}] ([xshift=${196 + index * gap}pt,yshift=-27pt]current page.north west) circle (${radius});`;
    }).join('\n');
    const logo = assets.logoName
      ? `\\node[anchor=north west,inner sep=0pt] at ([xshift=42pt,yshift=-16.2pt]current page.north west) {\\includegraphics[width=68pt,height=44pt,keepaspectratio]{assets/${assets.logoName}}};`
      : defaultLogoTex();
    const conference = inlineTex(project.meta && project.meta.conference ? project.meta.conference : 'Contest Tutorials', context);
    return `\\begin{tikzpicture}[remember picture,overlay]\n${logo}\n${dots}\n\\node[anchor=north east,align=right,text width=340pt,font=\\bfseries\\fontsize{12.8}{15}\\selectfont,text=txnavy] at ([xshift=-42pt,yshift=-21pt]current page.north east) {${conference}};\n\\end{tikzpicture}`;
  }

  function footerTex(project, pageNo, context) {
    const organizer = inlineTex(project.meta && project.meta.organizer ? project.meta.organizer : '', context);
    const note = inlineTex(project.meta && project.meta.footerNote ? project.meta.footerNote : '', context);
    return `\\begin{tikzpicture}[remember picture,overlay]\n\\node[anchor=south west,font=\\bfseries\\fontsize{12.5}{14}\\selectfont,text=txtext] at ([xshift=42pt,yshift=17pt]current page.south west) {${organizer}};${note ? `\n\\node[anchor=south,font=\\fontsize{10}{12}\\selectfont,text=txmuted] at ([yshift=17pt]current page.south) {${note}};` : ''}\n\\node[anchor=south east,font=\\fontsize{11}{13}\\selectfont,text=txblue] at ([xshift=-42pt,yshift=17pt]current page.south east) {${pageNo}};\n\\end{tikzpicture}`;
  }

  function startFrame(project, page, pageNo, assets, context) {
    return `\\begin{frame}[plain,t,fragile]\n${headerTex(project, problemIndex(project, page), assets, context)}\n${footerTex(project, pageNo, context)}\n\\par\\vspace*{66pt}\\noindent`;
  }

  function endFrame() { return '\\end{frame}'; }

  function kickerTex(value, context) {
    return `{\\fontsize{11}{13}\\selectfont\\bfseries\\color{txcyan}\\MakeUppercase{${inlineTex(value, context)}}\\par}\\vspace{1pt}`;
  }

  function dividerTex() {
    return '\\begin{tikzpicture}[remember picture,overlay]\\draw[txrule,line width=.5pt] ([xshift=480pt,yshift=-160pt]current page.north west) -- ([xshift=480pt,yshift=54pt]current page.south west);\\end{tikzpicture}';
  }

  function solutionTex(project, page, pageNo, assets, context) {
    const problem = problemFor(project, page);
    const title = problem ? problem.name : (page.title || '说明');
    const layout = page.layout || 'split';
    const prefix = [startFrame(project, page, pageNo, assets, context), kickerTex(page.kicker || (page.type === 'solution' ? 'SOLUTION' : 'NOTE'), context), titleTex(title, context, false)];
    if (page.title && problem) {
      prefix.push(`\\begin{tikzpicture}[remember picture,overlay]\\node[anchor=north east,font=\\fontsize{13}{16}\\selectfont,text=txmuted] at ([xshift=-42pt,yshift=-108pt]current page.north east) {${inlineTex(page.title, context)}};\\end{tikzpicture}`);
    }
    const complexity = page.complexity ? `\\vfill{\\fontsize{13}{17}\\selectfont\\color{txtext}\\hrule\\vspace{5pt}{\\color{txblue}\\bfseries COMPLEXITY}\\quad ${inlineTex(page.complexity, context)}\\par}` : '';
    let body = '';
    if (layout === 'single') {
      body = `{\\TXBody ${blockTex(page.left, context)}}`;
    } else if (layout === 'visual') {
      const image = page.imageId ? imageTex({ id: page.imageId, width: Number(page.imageWidth) || 100, height: Number(page.imageHeight) || 100, align: 'center' }, page.imageCaption || '', context) : '';
      body = `${dividerTex()}\\begin{columns}[T,onlytextwidth]\n\\begin{column}{.48\\textwidth}\\TXBody ${blockTex(page.left, context)}\\end{column}\n\\begin{column}{.48\\textwidth}\\TXBody ${image}\\end{column}\n\\end{columns}`;
    } else if (layout === 'figure') {
      const image = page.imageId ? imageTex({ id: page.imageId, width: Number(page.imageWidth) || 100, height: Number(page.imageHeight) || 100, align: 'center' }, page.imageCaption || '', context) : '';
      body = `{\\TXBody ${image}}`;
    } else {
      body = `${dividerTex()}\\begin{columns}[T,onlytextwidth]\n\\begin{column}{.48\\textwidth}\\TXBody ${blockTex(page.left, context)}\\end{column}\n\\begin{column}{.48\\textwidth}\\TXBody ${blockTex(page.right, context)}\\end{column}\n\\end{columns}`;
    }
    return `${prefix.join('\n')}\n${body}\n${complexity}\n${endFrame()}`;
  }

  function problemTex(project, page, pageNo, assets, context) {
    const problem = problemFor(project, page);
    if (!problem) return solutionTex(project, page, pageNo, assets, context);
    const info = [];
    if (problem.ideaBy) info.push(`Idea by \\textbf{${inlineTex(problem.ideaBy, context)}}`);
    if (problem.preparedBy) info.push(`Prepared by \\textbf{${inlineTex(problem.preparedBy, context)}}`);
    if (problem.attempted) info.push(`\\textcolor{txred}{${inlineTex(problem.attempted, context)}} Teams \\textcolor{txlink}{Attempted}`);
    if (problem.solved) info.push(`\\textcolor{txred}{${inlineTex(problem.solved, context)}} Teams \\textcolor{txsolved}{Solved}`);
    if (problem.firstBlood) info.push(`First Blood: \\textcolor{txred}{${inlineTex(problem.firstBlood, context)}}`);
    const difficulty = asText(problem.difficulty).toLowerCase();
    const difficultyColor = /^(basic|easy|入门|简单)/.test(difficulty) ? 'txsolved' : (/^(medium|mid|中等)/.test(difficulty) ? 'txamber' : (/^(hard|difficult|困难)/.test(difficulty) ? 'txred' : 'txlink'));
    if (problem.difficulty) info.push(`Expected Difficulty: \\textcolor{${difficultyColor}}{${inlineTex(problem.difficulty, context)}}`);
    if (problem.judgeSolution) info.push(`Judge Solution: ${inlineTex(problem.judgeSolution, context)}`);
    if (problem.tags) info.push(`{\\fontsize{12}{17}\\selectfont\\color{txmuted}${inlineTex(problem.tags, context)}}`);
    const statement = blockTex(problem.statement || '', context);
    const constraints = problem.constraints ? `\\vspace{13pt}{\\fontsize{13.5}{16}\\selectfont\\bfseries\\color{txamber} Constraints\\par}\\vspace{9pt}${blockTex(problem.constraints, context)}` : '';
    return `${startFrame(project, page, pageNo, assets, context)}\n${kickerTex('PROBLEM', context)}\n${titleTex(problem.name, context, false)}\n${dividerTex()}\\begin{columns}[T,onlytextwidth]\n\\begin{column}{.48\\textwidth}\\TXBody ${statement}\n${constraints}\\end{column}\n\\begin{column}{.48\\textwidth}\\TXBody ${info.map((line) => `\\par ${line}\\par\\vspace{8pt}`).join('\n')}\\end{column}\n\\end{columns}\n${endFrame()}`;
  }

  function coverTex(project, page, pageNo, assets, context) {
    const meta = project.meta || {};
    const authors = meta.authors ? `\\vspace{${meta.subtitle ? 28 : 62}pt}{\\fontsize{20}{25}\\selectfont\\bfseries\\color{txtext}${lineBreakTex(meta.authors, context)}\\par}` : '';
    return `\\begin{frame}[plain,t,fragile]\n${headerTex(project, -1, assets, context)}\n${footerTex(project, pageNo, context)}\n\\par\\vspace*{145pt}\\noindent\n${titleTex(meta.title || '竞赛题解', context, true)}\n${meta.subtitle ? `\\vspace{14pt}{\\fontsize{19}{27}\\selectfont\\color{txmuted}${lineBreakTex(meta.subtitle, context)}\\par}` : ''}\n${authors}\n${endFrame()}`;
  }

  function agendaTex(project, page, pageNo, assets, context) {
    const problems = project.problems || [];
    const columns = problems.length > 12 ? 4 : (problems.length > 8 ? 3 : 2);
    const size = columns === 4 ? 12 : (columns === 3 ? 15 : 19);
    const width = (1 / columns - .025).toFixed(3);
    const rows = [];
    for (let index = 0; index < problems.length; index += columns) {
      rows.push(problems.slice(index, index + columns).map((problem) => {
        const solutions = (project.pages || []).filter((item) => item.type === 'solution' && item.problemId === problem.id).length;
        const details = [problem.difficulty, visualText(problem.tags), `${Math.max(1, solutions)} 页题解`].filter(Boolean).join(' · ');
        return `\\begin{minipage}[t]{${width}\\linewidth}\\vspace{0pt}\\RaggedRight{\\fontsize{${size}}{${size + 5}}\\selectfont\\textcolor{txblue}{\\bfseries ${inlineTex(problem.code, context)}}\\quad\\textbf{${inlineTex(problem.name, context)}}\\par\\vspace{4pt}{\\fontsize{9}{13}\\selectfont\\color{txmuted}${inlineTex(details, context)}\\par}\\vspace{7pt}{\\color{txrule}\\hrule}}\\end{minipage}`;
      }).join('\\hfill') + '\\par\\vspace{14pt}');
    }
    const intro = page.intro ? `{\\fontsize{16}{23}\\selectfont\\color{txtext}${blockTex(page.intro, context)}}\\vspace{8pt}` : '';
    return `${startFrame(project, page, pageNo, assets, context)}\n${kickerTex(page.kicker || 'CONTEST OVERVIEW', context)}\n${titleTex(page.title || '题目一览', context, false)}\n${intro}\n${rows.join('\n')}\n${endFrame()}`;
  }

  function thanksTex(project, page, pageNo, assets, context) {
    const groups = TX.model && TX.model.THANKS_GROUPS ? TX.model.THANKS_GROUPS : [];
    const cells = groups.map((group, index) => {
      const value = page.thanks && page.thanks[group.key] ? page.thanks[group.key] : '';
      return `\\begin{minipage}[t]{.30\\linewidth}{\\fontsize{14}{19}\\selectfont\\textcolor{txblue}{\\bfseries 0${index + 1}}\\quad\\textbf{${inlineTex(group.label, context)}}\\par\\vspace{4pt}{\\fontsize{12}{17}\\selectfont\\color{txtext}${blockTex(value, context)}}}\\end{minipage}`;
    });
    const paired = [];
    for (let index = 0; index < cells.length; index += 3) paired.push(cells.slice(index, index + 3).join('\\hfill'));
    return `${startFrame(project, page, pageNo, assets, context)}\n${page.kicker ? kickerTex(page.kicker, context) : ''}\n${titleTex(page.title || '致谢', context, false)}\n{\\fontsize{16}{23}\\selectfont\\color{txtext}${blockTex(page.intro || '', context)}}\n${page.thanksNote ? `\\vspace{4pt}{\\fontsize{12}{16}\\selectfont\\color{txmuted}${inlineTex(page.thanksNote, context)}\\par}` : ''}\n\\vspace{8pt}${paired.join('\\par\\vspace{18pt}\n')}\n${page.outro ? `\\vfill{\\fontsize{16}{22}\\selectfont\\bfseries\\color{txblue}${blockTex(page.outro, context)}}` : ''}\n${endFrame()}`;
  }

  function closingTex(project, page, pageNo, assets, context) {
    return `${startFrame(project, page, pageNo, assets, context)}\n${page.kicker ? kickerTex(page.kicker, context) : ''}\n${titleTex(page.title || '写在最后', context, false)}\n{\\TXBody ${blockTex(page.body || '', context)}}\n${page.signoff ? `\\vfill\\hfill{\\fontsize{16}{22}\\selectfont\\bfseries\\color{txblue}${inlineTex(page.signoff, context)}}` : ''}\n${endFrame()}`;
  }

  function pageTex(project, page, pageNo, assets, context) {
    context.imageMaxHeight = page.layout === 'figure' ? 300 : (page.layout === 'visual' ? 250 : 182);
    if (page.type === 'cover') return coverTex(project, page, pageNo, assets, context);
    if (page.type === 'agenda') return agendaTex(project, page, pageNo, assets, context);
    if (page.type === 'problem') return problemTex(project, page, pageNo, assets, context);
    if (page.type === 'thanks') return thanksTex(project, page, pageNo, assets, context);
    if (page.type === 'closing') return closingTex(project, page, pageNo, assets, context);
    return solutionTex(project, page, pageNo, assets, context);
  }

  function preamble(project) {
    const accent = TX.util.isHexColor(project.meta.accent) ? project.meta.accent.slice(1) : COLORS.blue;
    return String.raw`% Generated by Tutorial Studio. Compile with XeLaTeX.
\documentclass[10pt]{beamer}
\geometry{paperwidth=960bp,paperheight=540bp}

\setbeamertemplate{navigation symbols}{}
\setbeamersize{text margin left=42pt,text margin right=42pt}
\usepackage{fontspec}
\usepackage{xeCJK}
\IfFontExistsTF{TeX Gyre Heros}{\setsansfont{TeX Gyre Heros}}{}
\newcommand{\TXCJKFont}[1]{\setCJKmainfont{#1}\setCJKsansfont{#1}\setCJKmonofont{#1}}
\IfFontExistsTF{PingFang SC}{\TXCJKFont{PingFang SC}}{\IfFontExistsTF{Microsoft YaHei}{\TXCJKFont{Microsoft YaHei}}{\IfFontExistsTF{Noto Sans CJK SC}{\TXCJKFont{Noto Sans CJK SC}}{\TXCJKFont{FandolHei-Regular}}}}
\renewcommand{\familydefault}{\sfdefault}
\usepackage{graphicx}
\usepackage{tikz}
\usepackage{xcolor}
\usepackage{amsmath,amssymb}
\usepackage{fix-cm}
\usepackage[normalem]{ulem}
\usepackage{booktabs,tabularx,array,ragged2e}
\usepackage{xurl}
\usepackage{hyperref}
\definecolor{txnavy}{HTML}{${COLORS.navy}}
\definecolor{txtext}{HTML}{${COLORS.text}}
\definecolor{txblue}{HTML}{${accent}}
\definecolor{txcyan}{HTML}{${COLORS.cyan}}
\definecolor{txgreen}{HTML}{${COLORS.green}}
\definecolor{txsolved}{HTML}{00C62B}
\definecolor{txpale}{HTML}{${COLORS.pale}}
\definecolor{txred}{HTML}{${COLORS.red}}
\definecolor{txamber}{HTML}{${COLORS.amber}}
\definecolor{txmuted}{HTML}{${COLORS.muted}}
\definecolor{txrule}{HTML}{${COLORS.rule}}
\definecolor{txlogoBlue}{HTML}{4C82C3}
\definecolor{txlogoYellow}{HTML}{FDBA11}
\definecolor{txlogoRed}{HTML}{B22D1B}
\definecolor{txhighlight}{HTML}{${COLORS.highlight}}
\definecolor{txlink}{HTML}{0074D9}
\hypersetup{colorlinks=true,urlcolor=txlink,linkcolor=txlink}
\setlength{\parindent}{0pt}
\setlength{\parskip}{0pt}
\setbeamertemplate{itemize item}{\color{txtext}\scriptsize$\bullet$}
\setbeamertemplate{itemize subitem}{\color{txtext}\tiny$\bullet$}
\setbeamercolor{normal text}{fg=txtext,bg=white}
\setbeamercolor{item}{fg=txtext}
\setlength{\leftmargini}{21pt}
\setlength{\leftmarginii}{17pt}
\newenvironment{TXQuote}{\begin{beamercolorbox}[wd=\linewidth,sep=8pt,leftskip=5pt]{normal text}\color{txmuted}\fontsize{16}{23}\selectfont}{\end{beamercolorbox}}
\newcommand{\TXBody}{\fontsize{19}{28}\selectfont\color{txtext}\RaggedRight}
\providecommand{\R}{\mathbb{R}}
\providecommand{\N}{\mathbb{N}}
\providecommand{\Z}{\mathbb{Z}}
\providecommand{\eps}{\varepsilon}
\begin{document}
`;
  }

  function readme() {
    return `题解工坊 TeX 工程\n\n使用 XeLaTeX 连续编译两次，以正确定位页眉、进度点和页脚：\n  xelatex main.tex\n  xelatex main.tex\n\n也可上传至 Overleaf，编译器选择 XeLaTeX。\n保留 assets/ 目录；文字、公式、代码都可在 main.tex 中编辑。\n页面为 960 × 540 pt。字体和换行可能与浏览器 PDF 略有不同。\n中文字体自动选择苹方、微软雅黑、Noto Sans CJK SC 或 Fandol。\nWebP / GIF 导出为静态 PNG；外链图片请先上传到图片库。\n`;
  }

  function concatBytes(parts) {
    const size = parts.reduce((total, part) => total + part.length, 0);
    const output = new Uint8Array(size);
    let offset = 0;
    parts.forEach((part) => { output.set(part, offset); offset += part.length; });
    return output;
  }

  function u16(value) { return new Uint8Array([value & 255, (value >>> 8) & 255]); }
  function u32(value) { return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]); }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let index = 0; index < bytes.length; index += 1) {
      crc ^= bytes[index];
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function zipBytes(files) {
    const locals = [];
    const central = [];
    let offset = 0;
    files.forEach((file) => {
      const name = encoder.encode(file.name);
      const data = typeof file.data === 'string' ? encoder.encode(file.data) : new Uint8Array(file.data);
      const checksum = crc32(data);
      const local = concatBytes([
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(33), u32(checksum),
        u32(data.length), u32(data.length), u16(name.length), u16(0), name, data
      ]);
      locals.push(local);
      central.push(concatBytes([
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(33), u32(checksum),
        u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name
      ]));
      offset += local.length;
    });
    const directory = concatBytes(central);
    return concatBytes([...locals, directory, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(directory.length), u32(offset), u16(0)]);
  }

  TEX.build = async (project) => {
    if (!project || !Array.isArray(project.pages)) throw new Error('题解工程无效。');
    const warnings = [];
    const assets = await prepareAssets(project, warnings);
    const context = { project, assetNames: assets.names, warnings };
    const pages = project.pages.map((page, index) => pageTex(project, page || {}, index + 1, assets, context)).join('\n\n');
    const source = `${preamble(project)}\n${pages}\n\\end{document}\n`;
    const uniqueWarnings = Array.from(new Set(warnings));
    const files = [{ name: 'main.tex', data: source }, { name: 'README.txt', data: readme() + (uniqueWarnings.length ? `\n导出提示：\n${uniqueWarnings.join('\n')}\n` : '') }, ...assets.files];
    return { source, files, warnings: uniqueWarnings };
  };

  TEX.zip = (files) => new Blob([zipBytes(files)], { type: 'application/zip' });
})();
