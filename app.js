(() => {
  'use strict';

  const S = window.SCHEDULE || { days: {}, habits: [] };
  const WD = ['日', '一', '二', '三', '四', '五', '六'];
  const MONTH_ZH = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
  const TYPE_LABEL = {
    lecture: '課程', lab: '實驗', exam: '考試', review: '考試檢討',
    pbl: 'PBL', elective: '選修', study: '自主學習', habit: '習慣'
  };
  const BLOCKING = ['lecture', 'lab', 'exam', 'review', 'pbl', 'elective'];
  const WEEK1_START = Date.UTC(2026, 7, 10); // 第 1 週：2026/08/10
  const app = document.getElementById('app');

  /* ---------- helpers ---------- */
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
  const todayStr = () => ymd(new Date());
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const schoolWeek = s => { const d = parse(s); const w = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - WEEK1_START) / (7 * 864e5)) + 1; return w >= 1 && w <= 23 ? w : null; };

  /* ---------- state (localStorage, 只存在這支手機的這個瀏覽器) ---------- */
  const KEY = 'nfc-sched:v1';
  let state = { done: {}, custom: {}, prefs: { showElective: true, showStudy: true } };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) {
      state.done = saved.done || {};
      state.custom = saved.custom || {};
      state.prefs = Object.assign(state.prefs, saved.prefs || {});
    }
  } catch (e) { /* 無痕模式等情況：仍可使用，只是不會記住 */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } };

  const isDone = (date, id) => !!(state.done[date] && state.done[date][id]);
  function setDone(date, id, v) {
    state.done[date] = state.done[date] || {};
    if (v) state.done[date][id] = true; else delete state.done[date][id];
    if (!Object.keys(state.done[date]).length) delete state.done[date];
    save();
  }

  /* ---------- 資料組合：課程 + 習慣 ---------- */
  function habitItems(date) {
    const wd = parse(date).getDay();
    const out = [];
    for (const h of (S.habits || [])) {
      if (!h.days.includes(wd)) continue;
      if (h.from && date < h.from) continue;
      if (h.until && date > h.until) continue;
      if ((h.skip || []).includes(date)) continue;
      let start = h.start, end = h.end;
      const ov = (h.overrides || {})[date];
      if (ov) { if (ov.skip) continue; start = ov.start || start; end = ov.end || end; }
      out.push({ type: 'habit', title: h.title, start, end });
    }
    return out;
  }

  function dayData(date) {
    const raw = (S.days || {})[date] || [];
    let holiday = null;
    let items = [];
    for (const it of raw) { if (it.type === 'holiday') holiday = it.title; else items.push(Object.assign({}, it)); }
    items = items.concat(habitItems(date));
    items = items.filter(it => !(it.type === 'study' && !state.prefs.showStudy) && !(it.type === 'elective' && !state.prefs.showElective));
    items.sort((a, b) => toMin(a.start) - toMin(b.start) || (a.type === 'habit' ? -1 : 1));
    items.forEach(it => { it.id = hash([date, it.start, it.title, it.content || ''].join('|')); });
    items.forEach(it => {
      if (it.type !== 'habit') return;
      const c = items.find(o => BLOCKING.includes(o.type) && toMin(o.start) < toMin(it.end) && toMin(o.end) > toMin(it.start));
      if (c) it.conflict = c;
    });
    return { date, holiday, items, custom: state.custom[date] || [] };
  }

  function counts(d) {
    const total = d.items.length + d.custom.length;
    const done = d.items.filter(i => isDone(d.date, i.id)).length + d.custom.filter(c => c.done).length;
    return { total, done };
  }

  /* ---------- 顏色 / 簡稱 ---------- */
  function colorFor(it) {
    if (it.type === 'habit') return 'var(--teal)';
    if (it.type === 'study') return 'var(--stone)';
    if (it.type === 'pbl') return 'var(--ochre)';
    if (it.type === 'elective') return 'var(--lav)';
    const t = it.title || '';
    if (t.includes('免疫')) return 'var(--sage)';
    if (t.includes('呼吸')) return 'var(--slate)';
    if (t.includes('解剖')) return 'var(--terra)';
    if (t.includes('人文')) return 'var(--rose)';
    if (t.includes('基礎醫學')) return 'var(--ochre)';
    return 'var(--ink-3)';
  }
  function shortFor(it) {
    if (it.type === 'habit') return it.title;
    if (it.type === 'study') return null;
    if (it.type === 'pbl') return 'PBL';
    if (it.type === 'elective') return '選修';
    const t = it.title || '';
    if (t.includes('免疫')) return '免疫';
    if (t.includes('呼吸')) return '呼吸';
    if (t.includes('解剖')) return '解剖';
    if (t.includes('人文')) return '人文';
    if (t.includes('基礎醫學')) return '基醫';
    return t.slice(0, 2);
  }

  /* ---------- 單日清單（今日頁與月曆下方共用） ---------- */
  function dayHtml(date) {
    const d = dayData(date);
    const { total, done } = counts(d);
    const isToday = date === todayStr();
    const now = isToday ? nowMin() : null;
    let h = '';

    if (d.holiday) h += `<div class="banner">${esc(d.holiday)}　好好休息</div>`;

    if (total) {
      const pct = Math.round((done / total) * 100);
      h += `<div class="progress"><div class="txt"><span>${done === total ? '都完成了，辛苦了' : '完成進度'}</span><span>${done} / ${total}</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
    }

    if (!d.items.length && !d.custom.length) {
      h += `<div class="empty">${d.holiday ? '今天沒有安排' : '這天沒有安排，留給自己吧'}</div>`;
    }

    h += '<ul class="list">';
    for (const it of d.items) {
      const dn = isDone(date, it.id);
      const past = now !== null && toMin(it.end) < now;
      const cur = now !== null && toMin(it.start) <= now && now <= toMin(it.end);
      const meta = [it.teacher, it.room].filter(Boolean).join(' · ');
      const allday = it.allday ? '　全天' : '';
      const title = it.type === 'habit' ? it.title : it.title;
      h += `<li class="item ${it.type}${dn ? ' done' : ''}${past ? ' past' : ''}${cur ? ' current' : ''}" style="--c:${colorFor(it)}">
        <div class="row" role="checkbox" aria-checked="${dn}" tabindex="0" data-kind="item" data-date="${date}" data-id="${it.id}">
          <span class="box"></span>
          <div>
            <div class="time">${it.start} – ${it.end}${allday}
              <span class="tag${it.type === 'exam' ? ' exam' : ''}">${TYPE_LABEL[it.type] || ''}</span>
              ${cur ? '<span class="now">進行中</span>' : ''}</div>
            <div class="title">${esc(title)}</div>
            ${it.content ? `<div class="content">${esc(it.content)}</div>` : ''}
            ${meta ? `<div class="meta">${esc(meta)}</div>` : ''}
            ${it.conflict ? `<div class="warn">⚠ 與「${esc(it.conflict.title)}」時間重疊</div>` : ''}
          </div>
          <span></span>
        </div>
      </li>`;
    }
    h += '</ul>';

    if (d.custom.length) {
      h += '<div class="section-label">自己加的</div><ul class="list">';
      for (const c of d.custom) {
        h += `<li class="item${c.done ? ' done' : ''}" style="--c:var(--ochre)">
          <div class="row" role="checkbox" aria-checked="${!!c.done}" tabindex="0" data-kind="custom" data-date="${date}" data-id="${c.id}">
            <span class="box"></span>
            <div><div class="title">${esc(c.text)}</div></div>
            <button class="del" data-del="${c.id}" data-date="${date}" aria-label="刪除這項">×</button>
          </div></li>`;
      }
      h += '</ul>';
    }

    h += `<form class="add" data-date="${date}"><input name="t" placeholder="＋ 加一件要做的事" maxlength="80" autocomplete="off"><button class="btn" type="submit">加入</button></form>`;
    return h;
  }

  function nextExamHtml() {
    const t = todayStr();
    const dates = Object.keys(S.days || {}).filter(k => k >= t).sort();
    for (const k of dates) {
      const ex = S.days[k].find(i => i.type === 'exam');
      if (!ex) continue;
      const diff = Math.round((parse(k) - parse(t)) / 864e5);
      const dd = parse(k);
      const when = `${dd.getMonth() + 1}/${dd.getDate()}（${WD[dd.getDay()]}）`;
      const name = ex.title.replace(/^\(暫定\)/, '') + (ex.content ? ' ' + ex.content : '');
      return `<div class="note">下一個考核　<b>${when}</b> ${esc(name)}　${diff === 0 ? '就是今天' : `還有 ${diff} 天`}</div>`;
    }
    return '';
  }

  function prefsHtml() {
    return `<div class="prefs">
      <label><input type="checkbox" data-pref="showElective" ${state.prefs.showElective ? 'checked' : ''}> 顯示選修課</label>
      <label><input type="checkbox" data-pref="showStudy" ${state.prefs.showStudy ? 'checked' : ''}> 顯示自主學習時段</label>
    </div>`;
  }

  /* ---------- 今日頁 ---------- */
  function todayView(date) {
    const d = parse(date);
    const w = schoolWeek(date);
    const isToday = date === todayStr();
    const kicker = `${d.getFullYear()} · ${MONTH_ZH[d.getMonth()]}月${w ? ` · 第 ${w} 週` : ''}`;
    app.className = '';
    app.innerHTML = `
      <header class="hero">
        <div class="kicker">${kicker}</div>
        <h1><span class="num">${d.getDate()}</span><span class="wd">週${WD[d.getDay()]}</span>
          ${isToday ? '<span class="pill">TODAY</span>' : '<button class="pill link" data-go="today">回到今天</button>'}</h1>
        <div class="rule"></div>
        <div class="daynav"><button data-go="prev">‹ 前一天</button><button data-go="next">後一天 ›</button></div>
      </header>
      ${dayHtml(date)}
      ${isToday ? nextExamHtml() : ''}
      ${prefsHtml()}`;
    document.title = `${d.getMonth() + 1}/${d.getDate()} 週${WD[d.getDay()]} · 課表與生活`;
  }

  /* ---------- 月曆頁 ---------- */
  function monthView(ym, sel) {
    const [y, m] = ym.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const off = first.getDay();
    const dim = new Date(y, m, 0).getDate();
    const weeks = Math.ceil((off + dim) / 7);
    const start = new Date(y, m - 1, 1 - off);
    const t = todayStr();
    let cells = WD.map(w => `<div class="dow">${w}</div>`).join('');
    const usedColors = {};
    for (let i = 0; i < weeks * 7; i++) {
      const dt = new Date(start); dt.setDate(start.getDate() + i);
      const ds = ymd(dt);
      const d = dayData(ds);
      const { total, done } = counts(d);
      const seen = new Set();
      let chips = '';
      for (const it of d.items) {
        const s = shortFor(it);
        if (!s || seen.has(s)) continue;
        seen.add(s);
        const c = colorFor(it);
        usedColors[s] = c;
        chips += `<i class="chip" style="--c:${c}"><b></b><em>${esc(s)}</em></i>`;
      }
      const exam = d.items.some(i => i.type === 'exam');
      cells += `<button class="cell${dt.getMonth() !== m - 1 ? ' other' : ''}${ds === t ? ' today' : ''}${ds === sel ? ' sel' : ''}" data-cell="${ds}" aria-label="${dt.getMonth() + 1}月${dt.getDate()}日">
        <span class="dn">${dt.getDate()}</span>
        <span class="chips">${chips}</span>
        ${exam ? '<i class="stamp">考</i>' : ''}${d.holiday ? '<i class="hol">假</i>' : ''}
        ${total && done === total ? '<i class="ok">✓</i>' : ''}
      </button>`;
    }
    const prev = new Date(y, m - 2, 1), next = new Date(y, m, 1);
    const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    const legend = Object.entries(usedColors).map(([k, c]) => `<span style="--c:${c}"><i></i>${esc(k)}</span>`).join('');
    const sd = parse(sel);
    app.className = 'wide';
    app.innerHTML = `
      <header class="mhead">
        <h1><span class="y">${y}</span><span class="m">${MONTH_ZH[m - 1]}月</span></h1>
        <div class="nav"><button class="btn" data-month="${key(prev)}" aria-label="上個月">‹</button><button class="btn" data-month="${t.slice(0, 7)}">本月</button><button class="btn" data-month="${key(next)}" aria-label="下個月">›</button></div>
      </header>
      <div class="grid">${cells}</div>
      <div class="legend">${legend}</div>
      <section class="detail">
        <h2><span>${sd.getMonth() + 1} 月 ${sd.getDate()} 日　週${WD[sd.getDay()]}</span><a href="#date=${sel}">整頁開啟 →</a></h2>
        ${dayHtml(sel)}
      </section>`;
    document.title = `${y} 年 ${m} 月 · 課表與生活`;
  }

  /* ---------- 路由 ---------- */
  function currentRoute() {
    const p = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (p.has('month')) {
      const ym = /^\d{4}-\d{2}$/.test(p.get('month')) ? p.get('month') : todayStr().slice(0, 7);
      let sel = p.get('sel');
      if (!sel || !/^\d{4}-\d{2}-\d{2}$/.test(sel) || sel.slice(0, 7) !== ym) sel = ym === todayStr().slice(0, 7) ? todayStr() : ym + '-01';
      return { view: 'month', ym, sel };
    }
    const date = /^\d{4}-\d{2}-\d{2}$/.test(p.get('date') || '') ? p.get('date') : todayStr();
    return { view: 'today', date };
  }

  function render() {
    const y = window.scrollY;
    const r = currentRoute();
    if (r.view === 'month') monthView(r.ym, r.sel); else todayView(r.date);
    document.getElementById('tab-today').classList.toggle('on', r.view === 'today');
    document.getElementById('tab-month').classList.toggle('on', r.view === 'month');
    window.scrollTo(0, y);
  }

  const go = h => { if (location.hash === h || (h === '' && !location.hash)) render(); else location.hash = h; };

  /* ---------- 互動 ---------- */
  function toggleRow(row) {
    const { kind, date, id } = row.dataset;
    if (kind === 'custom') {
      const c = (state.custom[date] || []).find(x => x.id === id);
      if (c) { c.done = !c.done; save(); }
    } else {
      setDone(date, id, !isDone(date, id));
    }
    render();
  }

  app.addEventListener('click', e => {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      const date = del.dataset.date;
      state.custom[date] = (state.custom[date] || []).filter(c => c.id !== del.dataset.del);
      if (!state.custom[date].length) delete state.custom[date];
      save(); render(); return;
    }
    const row = e.target.closest('.row');
    if (row) { toggleRow(row); return; }
    const cell = e.target.closest('[data-cell]');
    if (cell) { const ds = cell.dataset.cell; go(`#month=${ds.slice(0, 7)}&sel=${ds}`); return; }
    const mo = e.target.closest('[data-month]');
    if (mo) { go(`#month=${mo.dataset.month}`); return; }
    const g = e.target.closest('[data-go]');
    if (g) {
      const r = currentRoute();
      const cur = r.view === 'today' ? r.date : todayStr();
      if (g.dataset.go === 'today') go('');
      if (g.dataset.go === 'prev') go(`#date=${addDays(cur, -1)}`);
      if (g.dataset.go === 'next') go(`#date=${addDays(cur, 1)}`);
    }
  });

  app.addEventListener('keydown', e => {
    if ((e.key === ' ' || e.key === 'Enter') && e.target.classList.contains('row')) { e.preventDefault(); toggleRow(e.target); }
  });

  app.addEventListener('submit', e => {
    const f = e.target.closest('form.add');
    if (!f) return;
    e.preventDefault();
    const text = f.t.value.trim();
    if (!text) return;
    const date = f.dataset.date;
    (state.custom[date] = state.custom[date] || []).push({ id: 'c' + Date.now().toString(36), text, done: false });
    save(); render();
  });

  app.addEventListener('change', e => {
    const p = e.target.dataset && e.target.dataset.pref;
    if (p) { state.prefs[p] = e.target.checked; save(); render(); }
  });

  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  window.addEventListener('pageshow', render);
  setInterval(() => { if (!document.hidden && !(document.activeElement && document.activeElement.tagName === 'INPUT')) render(); }, 60000);

  render();
})();
