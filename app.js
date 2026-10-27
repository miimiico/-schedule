(() => {
  'use strict';

  const S = window.SCHEDULE || { days: {}, habits: [] };
  const WD = ['日', '一', '二', '三', '四', '五', '六'];
  const MONTH_ZH = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
  const TYPE_LABEL = {
    lecture: '課程', lab: '實驗', exam: '考試', review: '考試檢討',
    pbl: 'PBL', elective: '選修', study: '自主學習', habit: '習慣', custom: '自訂'
  };
  const BLOCKING = ['lecture', 'lab', 'exam', 'review', 'pbl', 'elective'];
  const WEEK1_START = Date.UTC(2026, 7, 10); // 第 1 週：2026/08/10
  const DEFAULT_UNTIL = '2027-01-31';
  const app = document.getElementById('app');

  /* ---------- helpers ---------- */
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
  const todayStr = () => ymd(new Date());
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const schoolWeek = s => { const d = parse(s); const w = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - WEEK1_START) / (7 * 864e5)) + 1; return w >= 1 && w <= 23 ? w : null; };

  /* ---------- state (localStorage：只存在這支手機的這個瀏覽器) ---------- */
  const KEY = 'nfc-sched:v1';
  const fresh = () => ({
    done: {},          // done[date][id] = true
    custom: {},        // custom[date] = [{id,text,start,end,note,done}]
    hidden: {},        // hidden[date][id] = true   (從那天移除的項目)
    mod: {},           // mod[date][id] = {title,start,end,content}  (單日修改)
    habitOv: {},       // habitOv[habitId] = {title,start,end}      (內建習慣的全面修改)
    userHabits: [],    // 自己新增的重複行程
    prefs: { showElective: true, showStudy: true }
  });
  let state = fresh();
  function adopt(saved) {
    const f = fresh();
    if (!saved || typeof saved !== 'object') return f;
    for (const k of ['done', 'custom', 'hidden', 'mod', 'habitOv']) if (saved[k] && typeof saved[k] === 'object') f[k] = saved[k];
    if (Array.isArray(saved.userHabits)) f.userHabits = saved.userHabits;
    f.prefs = Object.assign(f.prefs, saved.prefs || {});
    return f;
  }
  try { state = adopt(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { /* 無痕模式：仍可使用，只是不會記住 */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } };

  const isDone = (date, id) => !!(state.done[date] && state.done[date][id]);
  function setDone(date, id, v) {
    state.done[date] = state.done[date] || {};
    if (v) state.done[date][id] = true; else delete state.done[date][id];
    if (!Object.keys(state.done[date]).length) delete state.done[date];
    save();
  }

  /* ---------- 資料組合：課程 + 習慣 + 自訂 ---------- */
  function habitItems(date) {
    const wd = parse(date).getDay();
    const out = [];
    const all = (S.habits || []).map(h => Object.assign({}, h, state.habitOv[h.id] || {}))
      .concat(state.userHabits.map(h => Object.assign({}, h, { user: true })));
    for (const h of all) {
      if (!h.days.includes(wd)) continue;
      if (h.from && date < h.from) continue;
      if (h.until && date > h.until) continue;
      if ((h.skip || []).includes(date)) continue;
      let start = h.start, end = h.end;
      const ov = (h.overrides || {})[date];
      if (ov) { if (ov.skip) continue; start = ov.start || start; end = ov.end || end; }
      out.push({ type: 'habit', title: h.title, start, end, content: h.content || '', hid: h.id, user: !!h.user, id: hash(date + '|h|' + h.id) });
    }
    return out;
  }

  function dayData(date) {
    const raw = (S.days || {})[date] || [];
    let holiday = null;
    let items = [];
    for (const it of raw) {
      if (it.type === 'holiday') holiday = it.title;
      else { const c = Object.assign({}, it); c.id = hash([date, it.start, it.title, it.content || ''].join('|')); items.push(c); }
    }
    items = items.concat(habitItems(date));
    const hidden = state.hidden[date] || {};
    const hiddenCount = Object.keys(hidden).length;
    items = items.filter(it => !hidden[it.id]);
    const mods = state.mod[date] || {};
    items.forEach(it => { const m = mods[it.id]; if (m) { Object.assign(it, m); it.modified = true; } });

    const untimed = [];
    for (const c of (state.custom[date] || [])) {
      const it = { type: 'custom', custom: true, id: c.id, title: c.text, content: c.note || '', start: c.start || '', end: c.end || '', cdone: !!c.done };
      if (it.start && it.end) items.push(it); else untimed.push(it);
    }

    items = items.filter(it => !(it.type === 'study' && !state.prefs.showStudy) && !(it.type === 'elective' && !state.prefs.showElective));
    items.sort((a, b) => toMin(a.start) - toMin(b.start) || (a.type === 'habit' ? -1 : 1));
    items.forEach(it => {
      if (it.type !== 'habit') return;
      const c = items.find(o => BLOCKING.includes(o.type) && toMin(o.start) < toMin(it.end) && toMin(o.end) > toMin(it.start));
      if (c) it.conflict = c;
    });
    return { date, holiday, items, untimed, hiddenCount };
  }

  const doneOf = (date, it) => it.custom ? it.cdone : isDone(date, it.id);
  function counts(d) {
    const all = d.items.concat(d.untimed);
    return { total: all.length, done: all.filter(i => doneOf(d.date, i)).length };
  }

  /* ---------- 顏色 / 簡稱 ---------- */
  function colorFor(it) {
    if (it.type === 'habit') return 'var(--teal)';
    if (it.type === 'custom') return 'var(--ochre)';
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
    if (it.type === 'habit') return it.title.slice(0, 4);
    if (it.type === 'custom') return it.title.slice(0, 3);
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

  /* ---------- 單日清單 ---------- */
  function rowHtml(date, it, now) {
    const dn = doneOf(date, it);
    const timed = !!(it.start && it.end);
    const past = timed && now !== null && toMin(it.end) < now;
    const cur = timed && now !== null && toMin(it.start) <= now && now <= toMin(it.end);
    const meta = [it.teacher, it.room].filter(Boolean).join(' · ');
    const kind = it.custom ? 'custom' : 'item';
    return `<li class="item ${it.type}${dn ? ' done' : ''}${past ? ' past' : ''}${cur ? ' current' : ''}" style="--c:${colorFor(it)}">
      <div class="row" role="checkbox" aria-checked="${dn}" tabindex="0" data-kind="${kind}" data-date="${date}" data-id="${it.id}">
        <span class="box"></span>
        <div>
          <div class="time">${timed ? `${it.start} – ${it.end}${it.allday ? '　全天' : ''}` : ''}
            <span class="tag${it.type === 'exam' ? ' exam' : ''}">${TYPE_LABEL[it.type] || ''}</span>
            ${it.modified ? '<span class="tag mod">已修改</span>' : ''}
            ${cur ? '<span class="now">進行中</span>' : ''}</div>
          <div class="title">${esc(it.title)}</div>
          ${it.content ? `<div class="content">${esc(it.content)}</div>` : ''}
          ${meta ? `<div class="meta">${esc(meta)}</div>` : ''}
          ${it.conflict ? `<div class="warn">⚠ 與「${esc(it.conflict.title)}」時間重疊</div>` : ''}
        </div>
        <button class="edit" data-edit="${it.id}" data-date="${date}" aria-label="編輯 ${esc(it.title)}">編輯</button>
      </div>
    </li>`;
  }

  function dayHtml(date) {
    const d = dayData(date);
    const { total, done } = counts(d);
    const now = date === todayStr() ? nowMin() : null;
    let h = '';

    if (d.holiday) h += `<div class="banner">${esc(d.holiday)}　好好休息</div>`;

    if (total) {
      const pct = Math.round((done / total) * 100);
      h += `<div class="progress"><div class="txt"><span>${done === total ? '都完成了，辛苦了' : '完成進度'}</span><span>${done} / ${total}</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
    } else {
      h += `<div class="empty">${d.holiday ? '今天沒有安排' : '這天沒有安排，留給自己吧'}</div>`;
    }

    if (d.items.length) h += `<ul class="list">${d.items.map(it => rowHtml(date, it, now)).join('')}</ul>`;
    if (d.untimed.length) h += `<div class="section-label">待辦</div><ul class="list">${d.untimed.map(it => rowHtml(date, it, now)).join('')}</ul>`;

    h += `<form class="add" data-date="${date}"><input name="t" placeholder="＋ 快速加一件待辦" maxlength="80" autocomplete="off"><button class="btn" type="submit">加入</button></form>
      <button class="btn wide-btn" data-new="${date}">＋ 新增行程（可設時間、重複）</button>`;
    if (d.hiddenCount) h += `<button class="linkbtn" data-restore="${date}">已移除 ${d.hiddenCount} 項 · 全部還原</button>`;
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
    </div>
    <button class="linkbtn" data-backup>備份／還原我的修改</button>`;
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
      for (const it of d.items.concat(d.untimed)) {
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
    if (document.getElementById('sheetRoot')) return; // 編輯視窗開著時不重繪
    const y = window.scrollY;
    const r = currentRoute();
    if (r.view === 'month') monthView(r.ym, r.sel); else todayView(r.date);
    document.getElementById('tab-today').classList.toggle('on', r.view === 'today');
    document.getElementById('tab-month').classList.toggle('on', r.view === 'month');
    window.scrollTo(0, y);
  }

  const go = h => { if (location.hash === h || (h === '' && !location.hash)) render(); else location.hash = h; };

  /* ---------- 編輯視窗 ---------- */
  function closeSheet() {
    const el = document.getElementById('sheetRoot');
    if (el) el.remove();
    document.body.style.overflow = '';
    render();
  }

  function findItem(date, id) {
    const d = dayData(date);
    return d.items.concat(d.untimed).find(i => i.id === id);
  }

  function openSheet(ctx) {
    const isNew = ctx.mode === 'new';
    const it = isNew ? null : findItem(ctx.date, ctx.id);
    if (!isNew && !it) return;
    const custom = isNew || it.custom;
    const habit = !isNew && it.type === 'habit';
    const val = {
      title: isNew ? '' : it.title,
      start: isNew ? '' : (it.start || ''),
      end: isNew ? '' : (it.end || ''),
      note: isNew ? '' : (it.content || '')
    };
    const root = document.createElement('div');
    root.id = 'sheetRoot';
    root.className = 'sheet-bg';
    root.innerHTML = `
      <form class="sheet" novalidate>
        <h3>${isNew ? '新增行程' : '編輯行程'}</h3>
        <label>標題<input name="title" value="${esc(val.title)}" maxlength="60" autocomplete="off"></label>
        <label>日期<input type="date" name="date" value="${ctx.date}" ${custom ? '' : 'disabled'}></label>
        <div class="two">
          <label>開始<input type="time" name="start" value="${val.start}"></label>
          <label>結束<input type="time" name="end" value="${val.end}"></label>
        </div>
        <label>內容／地點備註<input name="note" value="${esc(val.note)}" maxlength="80" autocomplete="off"></label>
        ${habit ? `<label class="chkline"><input type="checkbox" name="all" checked> 套用到之後所有「${esc(it.title)}」</label>` : ''}
        ${isNew ? `<label>重複
          <select name="repeat"><option value="none">不重複</option><option value="week">每週的這一天</option><option value="day">每天</option></select></label>
          <label class="rep" hidden>重複到<input type="date" name="until" value="${DEFAULT_UNTIL}"></label>` : ''}
        <div class="err" role="alert"></div>
        <div class="acts">
          <button type="submit" class="btn primary">儲存</button>
          <button type="button" class="btn" data-act="cancel">取消</button>
        </div>
        ${isNew ? '' : `<div class="acts sub">
          ${custom ? '<button type="button" class="linkbtn danger" data-act="delete">刪除這項</button>'
            : `<button type="button" class="linkbtn danger" data-act="remove">${habit ? '這天不做' : '從這天移除'}</button>`}
          ${habit && it.user ? '<button type="button" class="linkbtn danger" data-act="delete-series">刪除整個重複行程</button>' : ''}
          ${(!custom && (it.modified || (habit && !it.user && state.habitOv[it.hid]))) ? '<button type="button" class="linkbtn" data-act="reset">還原原本</button>' : ''}
        </div>`}
      </form>`;
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';
    const f = root.querySelector('form');
    const err = msg => { f.querySelector('.err').textContent = msg || ''; };

    const rep = f.querySelector('select[name=repeat]');
    if (rep) rep.addEventListener('change', () => { f.querySelector('.rep').hidden = rep.value === 'none'; });

    root.addEventListener('click', e => {
      if (e.target === root) { closeSheet(); return; }
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      if (act === 'cancel') { closeSheet(); return; }
      if (act === 'delete') {
        state.custom[ctx.date] = (state.custom[ctx.date] || []).filter(c => c.id !== it.id);
        if (!state.custom[ctx.date].length) delete state.custom[ctx.date];
        save(); closeSheet(); return;
      }
      if (act === 'remove') {
        (state.hidden[ctx.date] = state.hidden[ctx.date] || {})[it.id] = true;
        save(); closeSheet(); return;
      }
      if (act === 'delete-series') {
        state.userHabits = state.userHabits.filter(h => h.id !== it.hid);
        save(); closeSheet(); return;
      }
      if (act === 'reset') {
        if (state.mod[ctx.date]) { delete state.mod[ctx.date][it.id]; if (!Object.keys(state.mod[ctx.date]).length) delete state.mod[ctx.date]; }
        if (habit && !it.user) delete state.habitOv[it.hid];
        save(); closeSheet();
      }
    });

    f.addEventListener('submit', e => {
      e.preventDefault();
      const title = f.title.value.trim();
      const start = f.start.value, end = f.end.value;
      const note = f.note.value.trim();
      const newDate = custom ? (f.date.value || ctx.date) : ctx.date;
      if (!title) return err('請輸入標題');
      if ((start && !end) || (!start && end)) return err('開始與結束時間請一起填，或都不填');
      if (start && end && toMin(end) <= toMin(start)) return err('結束時間要晚於開始時間');
      if (!custom && !(start && end)) return err('這個行程需要開始與結束時間');

      if (isNew) {
        const rp = f.repeat.value;
        if (rp !== 'none') {
          if (!(start && end)) return err('重複行程需要設定開始與結束時間');
          const until = f.until.value || DEFAULT_UNTIL;
          if (until < newDate) return err('「重複到」不能早於開始日期');
          state.userHabits.push({
            id: uid('u'), title, content: note, start, end, from: newDate, until,
            days: rp === 'day' ? [0, 1, 2, 3, 4, 5, 6] : [parse(newDate).getDay()]
          });
        } else {
          (state.custom[newDate] = state.custom[newDate] || []).push({ id: uid('c'), text: title, start, end, note, done: false });
        }
      } else if (it.custom) {
        const arr = state.custom[ctx.date] || [];
        const c = arr.find(x => x.id === it.id);
        if (c) {
          c.text = title; c.start = start; c.end = end; c.note = note;
          if (newDate !== ctx.date) {
            state.custom[ctx.date] = arr.filter(x => x.id !== c.id);
            if (!state.custom[ctx.date].length) delete state.custom[ctx.date];
            (state.custom[newDate] = state.custom[newDate] || []).push(c);
          }
        }
      } else if (habit && f.all && f.all.checked) {
        if (it.user) {
          const h = state.userHabits.find(x => x.id === it.hid);
          if (h) { h.title = title; h.start = start; h.end = end; h.content = note; }
        } else {
          state.habitOv[it.hid] = { title, start, end };
        }
        if (state.mod[ctx.date]) delete state.mod[ctx.date][it.id];
      } else {
        (state.mod[ctx.date] = state.mod[ctx.date] || {})[it.id] = { title, start, end, content: note };
      }
      save();
      const dest = newDate;
      closeSheet();
      if (custom && newDate !== ctx.date) {
        const r = currentRoute();
        if (r.view === 'today') go(`#date=${dest}`); else go(`#month=${dest.slice(0, 7)}&sel=${dest}`);
      }
    });
    setTimeout(() => { if (isNew) f.title.focus(); }, 50);
  }

  function openBackup() {
    const root = document.createElement('div');
    root.id = 'sheetRoot';
    root.className = 'sheet-bg';
    root.innerHTML = `
      <div class="sheet">
        <h3>備份／還原</h3>
        <p class="hint">下面是你目前所有修改、勾選與自訂行程。複製後貼到備忘錄保存；換手機時貼回來按「匯入」即可。</p>
        <textarea rows="8" spellcheck="false">${esc(JSON.stringify(state))}</textarea>
        <div class="err" role="alert"></div>
        <div class="acts">
          <button class="btn" data-act="copy">複製</button>
          <button class="btn primary" data-act="import">匯入（會覆蓋目前資料）</button>
          <button class="btn" data-act="cancel">關閉</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';
    const ta = root.querySelector('textarea');
    const err = root.querySelector('.err');
    root.addEventListener('click', e => {
      if (e.target === root) { closeSheet(); return; }
      const a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'cancel') closeSheet();
      if (a.dataset.act === 'copy') {
        ta.select();
        try { navigator.clipboard.writeText(ta.value).then(() => { err.textContent = '已複製'; }, () => { document.execCommand('copy'); err.textContent = '已複製'; }); }
        catch (x) { document.execCommand('copy'); err.textContent = '已複製'; }
      }
      if (a.dataset.act === 'import') {
        try {
          const obj = JSON.parse(ta.value);
          if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('bad');
          state = adopt(obj); save(); closeSheet();
        } catch (x) { err.textContent = '格式不正確，請貼上完整的備份內容'; }
      }
    });
  }

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
    const ed = e.target.closest('[data-edit]');
    if (ed) { e.stopPropagation(); openSheet({ mode: 'edit', date: ed.dataset.date, id: ed.dataset.edit }); return; }
    const nw = e.target.closest('[data-new]');
    if (nw) { openSheet({ mode: 'new', date: nw.dataset.new }); return; }
    const rs = e.target.closest('[data-restore]');
    if (rs) { delete state.hidden[rs.dataset.restore]; save(); render(); return; }
    if (e.target.closest('[data-backup]')) { openBackup(); return; }
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
    (state.custom[date] = state.custom[date] || []).push({ id: uid('c'), text, start: '', end: '', note: '', done: false });
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
