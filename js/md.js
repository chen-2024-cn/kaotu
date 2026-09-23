/* =====================================================================
 * md.js —— 零依赖安全 Markdown 渲染器（专为八股文答案优化）
 * ---------------------------------------------------------------------
 * 支持：#~###### 标题 / ```围栏代码块(带语言与复制按钮) / 无序·有序嵌套列表 /
 *      表格 / 引用 / 分割线 / **加粗** / ==高亮== / `行内代码` / [[qid]] 跳题 /
 *      自动链接 / 段落
 * 不支持（刻意不支持，避免破坏代码与 SQL）：*斜体*、_斜体_、图片、原始 HTML
 * 安全：先整段 HTML 转义再生成标签，任何用户输入都不会被执行
 * ===================================================================== */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* 行内语法：输入已转义的文本，输出安全 HTML */
  function inline(text) {
    if (!text) return '';
    var out = '';
    // 1) 行内代码先抠出来保护内部不再被处理
    var re = /`([^`\n]+)`/g, m, last = 0, i = 0;
    var codes = [];
    while ((m = re.exec(text)) !== null) {
      out += fmt(text.slice(last, m.index));
      codes.push('<code class="ic">' + m[1] + '</code>');
      out += '\u0000C' + (i++) + '\u0000';
      last = re.lastIndex;
    }
    out += fmt(text.slice(last));
    return out.replace(/\u0000C(\d+)\u0000/g, function (_, n) { return codes[+n]; });
  }

  function fmt(s) {
    return s
      .replace(/\[\[([a-z0-9\-]+)\]\]/gi, function (_, id) {
        var low = esc(id.toLowerCase());
        return '<a class="qlink" href="#/q/' + low + '" data-qid="' + low + '" title="跳转到关联题">' +
          '<svg viewBox="0 0 24 24" class="qi" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/>' +
          '<path d="M14 10a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></svg>' +
          '<span class="qlt">' + low + '</span></a>';
      })
      .replace(/(\*\*|==)(?=\S)([\s\S]*?\S)\1/g, function (m, g, t) {
        return g === '**' ? '<strong>' + t + '</strong>' : '<mark>' + t + '</mark>';
      })
      .replace(/\bhttps?:\/\/[^\s<)"']+/g, function (u) {
        return '<a class="ext" href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>';
      });
  }

  var LANG = {
    java: 'Java', sql: 'SQL', xml: 'XML', yaml: 'YAML', yml: 'YAML', json: 'JSON',
    js: 'JavaScript', javascript: 'JavaScript', bash: 'Shell', sh: 'Shell', shell: 'Shell',
    properties: 'Props', ini: 'Ini', text: 'Text', txt: 'Text', py: 'Python', python: 'Python',
    http: 'HTTP', groovy: 'Groovy', kt: 'Kotlin', plain: 'Text', '': 'Code'
  };

  /* =====================================================================
   * 轻量数学公式渲染：$...$ 行内 / $$...$$ 块级
   * 零依赖：把常用 LaTeX 子集转成带样式的 HTML（分数用 flex 排版）
   * ===================================================================== */
  var GREEK = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ',
    eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν',
    xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ',
    chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
    Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω'
  };
  var SYMS = {
    times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓',
    leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈',
    equiv: '≡', sim: '∼', propto: '∝', cong: '≅',
    infty: '∞', partial: '∂', nabla: '∇', forall: '∀', exists: '∃',
    in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇',
    cup: '∪', cap: '∩', emptyset: '∅', varnothing: '∅',
    to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒',
    Leftarrow: '⇐', leftrightarrow: '↔', Leftrightarrow: '⇔',
    xrightarrow: '→', implies: '⇒', iff: '⇔', mapsto: '↦',
    ldots: '…', cdots: '⋯', dots: '…', vdots: '⋮',
    sum: '∑', prod: '∏', int: '∫', iint: '∬', oint: '∮',
    sqrt: '√', langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋',
    lceil: '⌈', rceil: '⌉', star: '⋆', circ: '∘', bullet: '•',
    triangle: '△', angle: '∠', perpendicular: '⊥', parallel: '∥',
   because: '∵', therefore: '∴', quad: '\u2003', qquad: '\u2003\u2003',
    ',': '\u2009', ':': '\u2005', ';': '\u2005', '!': '', ' ': ' ',
    left: '', right: '', displaystyle: '', textstyle: '',
    bar: '', vec: '', hat: '', tilde: '', overline: '', underline: '',
    mathbf: '', mathbb: '', mathrm: '', mathcal: '', text: '',
    lim: 'lim', max: 'max', min: 'min', sup: 'sup', inf: 'inf',
    log: 'log', ln: 'ln', exp: 'exp', sin: 'sin', cos: 'cos', tan: 'tan',
    det: 'det', gcd: 'gcd', tr: 'tr', rank: 'rank', arg: 'arg',
    bmod: 'mod'
  };

  /** 解析 {…} 分组，返回 [内容, 结束位置]；pos 指向 '{' */
  function readGroup(s, pos) {
    if (s[pos] !== '{') {
      // 单 token：命令或单字符
      if (s[pos] === '\\') {
        var m2 = /\\([a-zA-Z]+|.)/.exec(s.slice(pos));
        return [m2[1], pos + m2[0].length];
      }
      return [s[pos], pos + 1];
    }
    var depth = 0, i = pos;
    for (; i < s.length; i++) {
      if (s[i] === '{') depth++;
      else if (s[i] === '}') { depth--; if (depth === 0) break; }
    }
    return [s.slice(pos + 1, i), i + 1];
  }

  /** 递归渲染 TeX 片段 → HTML（输入未转义，输出自行 esc） */
  function tex(s) {
    var out = '', i = 0;
    while (i < s.length) {
      var ch = s[i];
      if (ch === '\\') {
        var m = /\\([a-zA-Z]+|.)/.exec(s.slice(i));
        if (!m) { out += esc('\\'); i++; continue; }
        var cmd = m[1];
        i += m[0].length;
        if (GREEK[cmd]) { out += esc(GREEK[cmd]); continue; }
        if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') {
          var g1 = readGroup(s, i); i = g1[1];
          var g2 = readGroup(s, i); i = g2[1];
          out += '<span class="mfrac"><span class="mfn">' + tex(g1[0]) + '</span>' +
            '<span class="mfd">' + tex(g2[0]) + '</span></span>';
          continue;
        }
        if (cmd === 'sqrt') {
          if (s[i] === '[') {
            var eb = s.indexOf(']', i);
            var deg = s.slice(i + 1, eb); i = eb + 1;
            var gs = readGroup(s, i); i = gs[1];
            out += '<span class="msqrt"><sup>' + tex(deg) + '</sup>√<span class="msq">' + tex(gs[0]) + '</span></span>';
          } else {
            var gs2 = readGroup(s, i); i = gs2[1];
            out += '<span class="msqrt">√<span class="msq">' + tex(gs2[0]) + '</span></span>';
          }
          continue;
        }
        if (cmd === 'text' || cmd === 'mbox' || cmd === 'mathrm') {
          var gt = readGroup(s, i); i = gt[1];
          out += '<span class="mtxt">' + tex(gt[0]) + '</span>';
          continue;
        }
        if (cmd === 'mathbf' || cmd === 'bm') {
          var gb = readGroup(s, i); i = gb[1];
          out += '<span class="mbf">' + tex(gb[0]) + '</span>';
          continue;
        }
        if (cmd === 'overline') {
          var go = readGroup(s, i); i = go[1];
          out += '<span class="mov">' + tex(go[0]) + '</span>';
          continue;
        }
        if (cmd === 'bar') {
          var gba = readGroup(s, i); i = gba[1];
          out += '<span class="mov">' + tex(gba[0]) + '</span>';
          continue;
        }
        if (cmd === 'hat') {
          var gh = readGroup(s, i); i = gh[1];
          out += '<span class="mhat">' + tex(gh[0]) + '</span>';
          continue;
        }
        if (cmd === 'vec') {
          var gv = readGroup(s, i); i = gv[1];
          out += '<span class="mvec">' + tex(gv[0]) + '</span>';
          continue;
        }
        if (cmd === 'begin' || cmd === 'end') {
          var ge = readGroup(s, i); i = ge[1];
          // cases/matrix 环境：整体走环境解析
          if (cmd === 'begin') {
            var envName = ge[0];
            var endTag = '\\end{' + envName + '}';
            var endPos = s.indexOf(endTag, i);
            var envBody = endPos >= 0 ? s.slice(i, endPos) : s.slice(i);
            i = endPos >= 0 ? endPos + endTag.length : s.length;
            out += renderEnv(envName, envBody);
          }
          continue;
        }
        if (cmd === '\\') { out += '<br>'; continue; }
        if (SYMS[cmd] !== undefined) {
          var sym = SYMS[cmd];
          // 大运算符：吸收上下标为上下限
          if (cmd === 'sum' || cmd === 'prod' || cmd === 'int' || cmd === 'iint') {
            var subTxt = null, supTxt = null;
            // 前瞻 _{...} 或 ^{...}
            var peek = i, guard = 0;
            while (guard++ < 4) {
              while (s[peek] === ' ') peek++;
              if (s[peek] === '_') { var gs3 = readGroup(s, peek + 1); subTxt = gs3[0]; peek = gs3[1]; i = peek; }
              else if (s[peek] === '^') { var gs4 = readGroup(s, peek + 1); supTxt = gs4[0]; peek = gs4[1]; i = peek; }
              else break;
            }
            out += '<span class="mop">' + esc(sym) +
              (supTxt !== null ? '<span class="mop-up">' + tex(supTxt) + '</span>' : '') +
              (subTxt !== null ? '<span class="mop-dn">' + tex(subTxt) + '</span>' : '') +
              '</span>';
            continue;
          }
          if (cmd === 'lim' ) {
            // \lim_{n \to \infty}
            var p2 = i;
            while (s[p2] === ' ') p2++;
            var subLim = null;
            if (s[p2] === '_') { var gl = readGroup(s, p2 + 1); subLim = gl[0]; i = gl[1]; }
            out += '<span class="mop mop-lim">lim' +
              (subLim !== null ? '<span class="mop-dn">' + tex(subLim) + '</span>' : '') +
              '</span>';
            continue;
          }
          var isSpace = (cmd === 'quad' || cmd === 'qquad' || cmd === ',' || cmd === ':' || cmd === ';' || cmd === ' ');
          out += (isSpace ? '<span class="msp">' : '<span>') + esc(sym) + '</span>';
          continue;
        }
        // 未识别命令：显示原名
        out += esc(cmd);
        continue;
      }
      if (ch === '_') {
        var gsub = readGroup(s, ++i); i = gsub[1];
        // 组合上下标：先探 ^
        var supAfter = null;
        var pk = i; while (s[pk] === ' ') pk++;
        if (s[pk] === '^') { var ga = readGroup(s, pk + 1); supAfter = ga[0]; i = ga[1]; }
        if (supAfter !== null) {
          out += '<span class="msc"><sub>' + tex(gsub[0]) + '</sub><sup>' + tex(supAfter) + '</sup></span>';
        } else {
          out += '<sub>' + tex(gsub[0]) + '</sub>';
        }
        continue;
      }
      if (ch === '^') {
        var gsup = readGroup(s, ++i); i = gsup[1];
        var subAfter = null;
        var pk2 = i; while (s[pk2] === ' ') pk2++;
        if (s[pk2] === '_') { var gb2 = readGroup(s, pk2 + 1); subAfter = gb2[0]; i = gb2[1]; }
        if (subAfter !== null) {
          out += '<span class="msc"><sup>' + tex(gsup[0]) + '</sup><sub>' + tex(subAfter) + '</sub></span>';
        } else {
          out += '<sup>' + tex(gsup[0]) + '</sup>';
        }
        continue;
      }
      if (ch === '{') { var gg = readGroup(s, i); i = gg[1]; out += tex(gg[0]); continue; }
      if (ch === '}' ) { i++; continue; }
      if (ch === '~') { out += ' '; i++; continue; }
      if (ch === ' ') { out += ' '; i++; continue; }
      out += esc(ch);
      i++;
    }
    return out;
  }

  /** 环境：cases / matrix / pmatrix / bmatrix / aligned */
  function renderEnv(name, body) {
    var paren = (name === 'cases' ? '<span class="mcase-brace">{</span>' :
      name === 'pmatrix' ? '<span class="mpar">(</span>' :
        name === 'bmatrix' ? '<span class="mpar">[</span>' : '');
    var parenR = (name === 'cases' ? '' :
      name === 'pmatrix' ? '<span class="mpar">)</span>' :
        name === 'bmatrix' ? '<span class="mpar">]</span>' : '');
    var rows = body.split('\\\\').map(function (r) { return r.trim(); }).filter(function (r) { return r !== ''; });
    var html = rows.map(function (row) {
      var cells = row.split('&').map(function (c) { return '<td>' + tex(c) + '</td>'; });
      return '<tr>' + cells.join('') + '</tr>';
    }).join('');
    return '<span class="menv m-' + esc(name) + '">' + paren +
      '<table class="mtbl-env"><tbody>' + html + '</tbody></table>' + parenR + '</span>';
  }

  /** 处理一段文本中的所有 $…$ / $$…$$（在 HTML 转义之前调用） */
  function renderMathIn(text) {
    // 先处理块级 $$…$$（可跨行）
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, function (_, f) {
      return '\u0001MATHBLOCK:' + Buffer64(f) + '\u0001';
    });
    // 行内 $…$：避开货币语境——要求 $ 后非空白且成对闭合于同一行
    text = text.replace(/\$([^$\n]+?)\$/g, function (_, f) {
      if (/^\s|\s$/.test(f)) return '$' + f + '$';
      return '\u0001MATHINLINE:' + Buffer64(f) + '\u0001';
    });
    return text;
  }
  function Buffer64(s) {
    return encodeURIComponent(s).replace(/[!'()*]/g, function (c) {
      return '%' + c.charCodeAt(0).toString(16);
    });
  }
  function restoreMath(escapedHtml) {
    return escapedHtml.replace(/\u0001MATHBLOCK:(.*?)\u0001/g, function (_, b) {
      var f; try { f = decodeURIComponent(b); } catch (e) { return '$$??$$'; }
      return '<span class="mdblk">' + tex(f.trim()) + '</span>';
    }).replace(/\u0001MATHINLINE:(.*?)\u0001/g, function (_, b) {
      var f; try { f = decodeURIComponent(b); } catch (e) { return '$?$'; }
      return '<span class="mdmath">' + tex(f.trim()) + '</span>';
    });
  }

  /**
   * 行渲染统一入口：代码 span 保护 → 公式提取 → 转义 → 行内格式 → 还原公式/代码。
   * 顺序保证：公式里可含 Markdown 特殊字符不破坏排版，代码里的 $ 不被误当公式。
   */
  function renderLine(text) {
    var codes = [];
    var s = String(text == null ? '' : text);
    s = s.replace(/`([^`\n]+)`/g, function (_, c) {
      codes.push(c);
      return '\u0002' + (codes.length - 1) + '\u0002';
    });
    s = renderMathIn(s);
    s = inline(esc(s));
    s = restoreMath(s);
    if (codes.length) {
      s = s.replace(/\u0002(\d+)\u0002/g, function (_, n) {
        return '<code class="ic">' + esc(codes[+n]) + '</code>';
      });
    }
    return s;
  }

  function codeBlock(lang, code) {
    var key = String(lang || '').toLowerCase().trim();
    var label = LANG.hasOwnProperty(key) ? LANG[key] : (key ? key.toUpperCase() : 'Code');
    return '<figure class="codebox" data-lang="' + esc(label) + '">' +
      '<figcaption><span class="clang">' + esc(label) + '</span>' +
      '<button type="button" class="ccopy" data-copy>复制</button></figcaption>' +
      '<pre><code>' + esc(code.replace(/\n$/, '')) + '</code></pre></figure>';
  }

  var HR = /^(-{3,}|\*{3,}|_{3,})$/;
  var UL = /^(\s*)[-*+]\s+(.*)$/;
  var OL = /^(\s*)(\d+)[.)]\s+(.*)$/;
  var HD = /^(#{1,6})\s+(.*)$/;

  function isListItem(l) { return UL.test(l) || OL.test(l); }
  function indentOf(s) { return s.match(/^ */)[0].replace(/\t/g, '    ').length; }

  /** 生成锚点 id（用于答案内目录） */
  function anchorOf(text, n) { return 'ah-' + n + '-' + text.replace(/[^\w\u4e00-\u9fa5]+/g, '-').slice(0, 20); }

  /**
   * 渲染 Markdown 为 HTML
   * @returns {{html:string, toc:Array}} toc: [{level,text,id}] 仅收集 ## / ###
   */
  function render(md) {
    md = String(md == null ? '' : md).replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
    var lines = md.split('\n');
    var html = '', toc = [], hn = 0;
    var i = 0, n = lines.length;

    while (i < n) {
      var line = lines[i];

      // ---- 围栏代码块 ----
      var fence = line.match(/^\s*(`{3,}|~{3,})\s*([^\s`]*)\s*$/);
      if (fence) {
        var marker = fence[1][0], len = fence[1].length, lang = fence[2] || '';
        var buf = [];
        i++;
        while (i < n) {
          var cl = lines[i];
          var close = cl.match(/^\s*(`{3,}|~{3,})\s*$/);
          if (close && close[1][0] === marker && close[1].length >= len) { i++; break; }
          buf.push(cl); i++;
        }
        html += codeBlock(lang, buf.join('\n'));
        continue;
      }

      // ---- 块级公式（$$ 独占行或多行）----
      if (line.trim().indexOf('$$') === 0) {
        var mb = [line.trim().slice(2)];
        if (line.trim().length > 2 && line.trim().slice(-2) === '$$' && line.trim().length > 4) {
          mb = [line.trim().slice(2, -2)];
          i++;
        } else {
          i++;
          while (i < n) {
            var mline = lines[i];
            if (mline.trim().slice(-2) === '$$') {
              mb.push(mline.trim().replace(/\$\$\s*$/, ''));
              i++;
              break;
            }
            mb.push(mline);
            i++;
          }
        }
        html += '<div class="mdblk-wrap"><span class="mdblk">' + tex(mb.join('\n').trim()) + '</span></div>';
        continue;
      }

      // ---- 空行 ----
      if (!line.trim()) { i++; continue; }

      // ---- 标题 ----
      var h = line.match(HD);
      if (h) {
        var lv = h[1].length, txt = h[2].trim();
        var aid = anchorOf(txt, hn++);
        if (lv === 2 || lv === 3) toc.push({ level: lv, text: plain(txt), id: aid });
        html += '<h' + lv + ' id="' + aid + '" class="mh h' + lv + '">' + renderLine(txt) + '</h' + lv + '>';
        i++; continue;
      }

      // ---- 分割线 ----
      if (HR.test(line.trim())) { html += '<hr class="mhr">'; i++; continue; }

      // ---- 引用（支持多行合并） ----
      if (/^\s*>\s?/.test(line)) {
        var qb = [];
        while (i < n && /^\s*>\s?/.test(lines[i])) { qb.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        html += '<blockquote class="bq">' + render(qb.join('\n')).html + '</blockquote>';
        continue;
      }

      // ---- 表格 ----
      if (/^\s*\|/.test(line) && i + 1 < n && /^\s*\|[\s:\-|]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].indexOf('-') >= 0) {
        var headCells = splitRow(line);
        i += 2;
        var rows = [];
        while (i < n && /^\s*\|/.test(lines[i]) && lines[i].trim()) { rows.push(splitRow(lines[i])); i++; }
        html += '<div class="twrap"><table class="mtbl"><thead><tr>' +
          headCells.map(function (c) { return '<th>' + renderLine(c) + '</th>'; }).join('') +
          '</tr></thead><tbody>' +
          rows.map(function (r) {
            return '<tr>' + r.map(function (c) { return '<td>' + renderLine(c) + '</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table></div>';
        continue;
      }

      // ---- 列表（递归解析嵌套） ----
      if (isListItem(line)) {
        var pr = parseList(lines, i, indentOf(line));
        html += pr.html;
        i = pr.next;
        continue;
      }

      // ---- 段落 ----
      var para = [];
      while (i < n && lines[i].trim() && !HD.test(lines[i]) && !/^\s*(`{3,}|~{3,})/.test(lines[i]) &&
        !/^\s*>/.test(lines[i]) && !isListItem(lines[i]) && !HR.test(lines[i].trim()) && !/^\s*\|/.test(lines[i])) {
        para.push(lines[i].trim()); i++;
      }
      if (para.length) html += '<p class="mp">' + renderLine(para.join(' ')) + '</p>';
      else i++;
    }

    return { html: html, toc: toc };
  }

  function splitRow(line) {
    var s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    // 拆分前先掩码「可能含 | 但不该当列分隔符」的内容：\| 转义、行内代码、数学 $...$ / $$...$$
    // 典型坑：$y=|x|$ 的绝对值竖线、`a || b` 的逻辑或，都会被裸 split('|') 误切
    var tok = [];
    function mask(m) { return '\u0007' + tok.push(m) + '\u0007'; }   // push 返回 1-based 序号
    s = s
      .replace(/\\\|/g, function () { return mask('|'); })
      .replace(/`[^`\n]+`/g, mask)
      .replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, mask);
    return s.split('|').map(function (c) {
      return c.trim().replace(/\u0007(\d+)\u0007/g, function (_, n) { return tok[+n - 1]; });
    });
  }

  /**
   * 递归解析列表块。
   * @param lines 全部行
   * @param start 起始行（必须是列表项）
   * @param baseIndent 本层缩进
   * @returns {{html:string, next:number}}
   */
  function parseList(lines, start, baseIndent) {
    var n = lines.length, i = start;
    var firstOrdered = OL.test(lines[start]);
    var html = firstOrdered ? '<ol class="ml">' : '<ul class="ml">';
    var opened = false;   // 是否有未闭合的 <li>

    while (i < n) {
      var line = lines[i];

      // 空行：前瞻是否列表延续
      if (!line.trim()) {
        var j = i;
        while (j < n && !lines[j].trim()) j++;
        if (j < n && (isListItem(lines[j]) && indentOf(lines[j]) >= baseIndent)) { i = j; continue; }
        break;
      }

      var ind = indentOf(line);

      // 本层列表项
      if (isListItem(line) && ind <= baseIndent + 1) {
        if (opened) html += '</li>';
        var m = OL.test(line) ? line.match(OL) : line.match(UL);
        var content = OL.test(line) ? m[3] : m[2];
        var task = content.match(/^\[( |x|X)\]\s+(.*)$/);
        var body = task
          ? '<span class="task ' + (task[1].toLowerCase() === 'x' ? 'done' : '') + '">' +
          (task[1].toLowerCase() === 'x' ? '☑' : '☐') + '</span> ' + renderLine(task[2])
          : renderLine(content);
        html += '<li>' + body;
        opened = true;
        i++;
        // 续行（缩进更深的非列表文本）
        while (i < n && lines[i].trim() && !isListItem(lines[i]) &&
          indentOf(lines[i]) > baseIndent + 1 && !HD.test(lines[i]) && !/^\s*(`{3,}|~{3,})/.test(lines[i])) {
          html += '<p class="mlc">' + renderLine(lines[i].trim()) + '</p>';
          i++;
        }
        continue;
      }

      // 更深层嵌套列表
      if (isListItem(line) && ind > baseIndent + 1) {
        var sub = parseList(lines, i, ind);
        html += sub.html;
        i = sub.next;
        continue;
      }

      // 其它内容：本层列表结束
      break;
    }

    if (opened) html += '</li>';
    html += firstOrdered ? '</ol>' : '</ul>';
    return { html: html, next: i };
  }

  /** 去掉标记，得到纯文本（用于搜索索引、笔记摘要、朗读） */
  function plain(md) {
    return String(md == null ? '' : md)
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/^\s{0,3}#{1,6}\s*/gm, '')
      .replace(/^\s*>/gm, '')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/`+/g, '')
      .replace(/(\*\*|==)/g, '')
      .replace(/^\s*[-*+]\s+/gm, '· ')
      .replace(/^\s*\d+[.)]\s+/gm, '')
      .replace(/^\s*\|?\s*:?-{2,}.*$/gm, ' ')
      .replace(/\|/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** 在已渲染 DOM 中高亮关键词（TreeWalker，安全跳过标签/代码） */
  function highlight(root, words) {
    if (!root) return 0;
    var keys = (Array.isArray(words) ? words : String(words || '').split(/\s+/))
      .map(function (w) { return w.trim(); }).filter(function (w) { return w.length >= 1; });
    if (!keys.length) return 0;
    keys.sort(function (a, b) { return b.length - a.length; });
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p = node.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        var tag = p.nodeName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'MARK') return NodeFilter.FILTER_REJECT;
        if (p.nodeName === 'CODE' || p.closest && p.closest('figure.codebox')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var targets = [], hit = 0;
    while (walker.nextNode()) targets.push(walker.currentNode);
    var re = new RegExp('(' + keys.map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'gi');
    targets.forEach(function (node) {
      var txt = node.nodeValue;
      if (!re.test(txt)) return;
      re.lastIndex = 0;
      var frag = document.createDocumentFragment(), last = 0, m;
      while ((m = re.exec(txt)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
        var mark = document.createElement('mark');
        mark.className = 'hit';
        mark.textContent = m[1];
        frag.appendChild(mark);
        hit++;
        last = re.lastIndex;
        if (m[1] === '') re.lastIndex++;
      }
      if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
      if (hit) node.parentNode.replaceChild(frag, node);
    });
    return hit;
  }

  /** 从答案中提取要点，用于「30 秒速记卡」 */
  function digest(md) {
    var t = String(md || '');
    var seg = t.split(/\n#{1,6}\s+/).filter(function (s) { return /一句话|结论|核心|速记|答题框架/.test(s.split('\n')[0]) || /^一句话/.test(s); });
    var src = seg.length ? seg[0] : t;
    src = src.replace(/^.*\n/, '').trim();
    var lines = src.split('\n').map(function (l) { return l.trim(); })
      .filter(function (l) { return l && !/^#{1,6}\s/.test(l); });
    var text = lines.join(' ');
    text = text.replace(/```[\s\S]*?```/g, ' ').replace(/`/g, '')
      .replace(/(\*\*|==)/g, '').replace(/^\s*[-*+]\s+/g, '').replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\s+/g, ' ').trim();
    return text.length > 220 ? text.slice(0, 218) + '…' : text;
  }

  global.MD = { render: render, plain: plain, inline: inline, esc: esc, highlight: highlight, digest: digest, anchorOf: anchorOf, tex: tex, renderLine: renderLine };
})(window);
