(function () {
  const board = (window.LT58Board = window.LT58Board || {});
  const filters = (board.filters = board.filters || {});
  const pickerState = filters.pickerState || (filters.pickerState = {
    refreshes: new WeakMap(), bound: new WeakSet()
  });
  const keywordRefreshes = pickerState.refreshes;
  const keywordBound = pickerState.bound;
  let chooserOrigin = null;
  const collectPathFrom = start => LT58Model.collectPath(start, moments.length, connections);

  function pulseConnection(c, after) {
    let g = threadLayer.querySelector(`[data-cid="${c.id}"]`);
    if (!g) {
      after?.();
      return;
    }
    g.classList.add('selectedPath');
    let p = g.querySelector('.threadColor');
    animateHotTip(p, 760).then(() => {
      setTimeout(() => g.classList.remove('selectedPath'), 600);
      after?.();
    });
  }
  function moveViaConnection(c) {
    $('#nextChooser').classList.remove('open');
    pulseConnection(c, () => focusBoardMoment(c.b));
  }
  function chooseNext(dir = 'next') {
    chooserOrigin = dir === 'next' ? $('#nextMoment') : $('#prevMoment');
    $('#nextChooserTitle').textContent = dir === 'next' ? '다음 경로 선택' : '이전 경로 선택';
    let list = LT58Model.nextConnections(dir, selected, connections);
    if (!list.length)
      return toast(
        dir === 'next' ? '다음으로 연결된 순간이 없어요.' : '이전으로 연결된 순간이 없어요.'
      );
    if (list.length === 1) {
      let c = list[0];
      if (dir === 'next') moveViaConnection(c);
      else {
        pulseConnection(c, () => focusBoardMoment(c.a));
      }
      return;
    }
    let box = $('#nextChoices');
    box.innerHTML = list
      .map(c => {
        let target =
          dir === 'next' ? moments.find(m => m.id === c.b) : moments.find(m => m.id === c.a);
        return `<button class="routeChoice" data-cid="${c.id}" data-dir="${dir}">${esc(titleMain(target))}<small>${esc(c.why)}</small></button>`;
      })
      .join('');
    pushBoardPanel('chooser');
    $('#nextChooser').classList.add('open');
  }
  function closeChooser() {
    $('#nextChooser').classList.remove('open');
    chooserOrigin?.focus();
  }
  function highlightPath(start = selected) {
    let p = collectPathFrom(start);
    activePathIds = new Set(p.ids);
    activePathConns = new Set(p.cons);
    applyPathHighlight();
    return p;
  }
  function highlightPathFromConnection(cid) {
    let c = connections.find(x => x.id === cid);
    if (!c) return;
    activePathIds = new Set([c.a, c.b]);
    activePathConns = new Set([cid]);
    applyPathHighlight();
  }
  function applyPathHighlight() {
    document
      .querySelectorAll('.card')
      .forEach(el => el.classList.toggle('pathMember', activePathIds.has(el.dataset.id)));
  }

  function updateKeywordFilter() {
    let vals = [...new Set(moments.flatMap(m => m.keywords || []))].sort();
    $('#keywordFilter').innerHTML =
      '<option value="all">모든 키워드</option>' +
      vals.map(v => `<option value="${esc(v)}">#${esc(v)}</option>`).join('');
  }
  function applyFilters() {
    scheduleBoardMoreHint();
    const state = {
      mediaFilter: $('#mediaFilter')?.value || 'all',
      keywordFilter: $('#keywordFilter')?.value || 'all',
      maxOrder: LT58Model.maxCreatedOrder(moments)
    };
    document.querySelectorAll('.card').forEach(el => {
      const m = moments.find(x => x.id === el.dataset.id);
      const ok = LT58Model.filterVisible(m, state, connections);
      el.classList.toggle('filteredOut', !ok);
    });
  }
  function tagChipText(raw) {
    try {
      const tl = window.LTTagLine;
      if (tl && tl.parseTag && tl.chipText) {
        const p = tl.parseTag(raw);
        if (p) return tl.chipText(p);
      }
    } catch (e) {}
    return '#' + raw;
  }
  function keywordPickerHTML(prefix, selected = []) {
    const sel = selected || [];
    const offFixed = LT_KEYWORDS.filter(k => !sel.includes(k));
    const btn = (k, on, custom) =>
      `<button type="button" class="keywordBtn ${on ? 'on' : ''}${custom ? ' is-custom-tag' : ''}" data-key="${custom ? esc(k) : k}"${custom ? ` aria-label="${esc(tagChipText(k))} · 누르면 꼬리표를 뗀다"` : ''}>${custom ? esc(tagChipText(k)) : k}</button>`;
    return `<div class="label keywordPickerLead">KEYWORDS · 다중선택</div><div class="keywordPicker" id="${prefix}KeywordPicker">${sel.map(k => btn(k, true, !LT_KEYWORDS.includes(k))).join('')}${offFixed.map(k => btn(k, false, false)).join('')}</div><div class="keywordAddRow"><input class="field" id="${prefix}CustomKeyword" placeholder="커스텀 키워드 추가" aria-label="새 꼬리표 추가"><button type="button" class="miniBtn keywordAddBtn" id="${prefix}AddKeyword">추가</button></div>`;
  }
  function bindKeywordPicker(prefix, refresh) {
    let box = $(`#${prefix}KeywordPicker`);
    keywordRefreshes.set(box, refresh);
    if (!keywordBound.has(box)) {
      keywordBound.add(box);
      box.addEventListener('click', e => {
        let b = e.target.closest('.keywordBtn');
        if (!b) return;
        b.classList.toggle('on');
        keywordRefreshes.get(box)?.();
      });
    }
    const add = $(`#${prefix}AddKeyword`);
    keywordRefreshes.set(add, refresh);
    if (!keywordBound.has(add)) {
      keywordBound.add(add);
      add.addEventListener('click', () => {
        let v = $(`#${prefix}CustomKeyword`).value.trim();
        if (!v) return;
        let existing = [...box.querySelectorAll('.keywordBtn')].find(b => b.dataset.key === v);
        if (existing) {
          existing.classList.add('on');
        } else {
          let b = document.createElement('button');
          b.type = 'button';
          b.className = 'keywordBtn on is-custom-tag';
          b.dataset.key = v;
          b.textContent = tagChipText(v);
          box.appendChild(b);
        }
        $(`#${prefix}CustomKeyword`).value = '';
        keywordRefreshes.get(add)?.();
      });
    }
  }

  Object.assign(filters, {
    collectPathFrom,
    updateKeywordFilter,
    applyFilters,
    chooseNext,
    closeChooser,
    applyPathHighlight
  });
  Object.assign(window, {
    updateKeywordFilter,
    applyFilters,
    tagChipText,
    keywordPickerHTML,
    bindKeywordPicker,
    chooseNext,
    closeChooser,
    highlightPath,
    highlightPathFromConnection,
    applyPathHighlight,
    moveViaConnection,
    pulseConnection
  });
})();
