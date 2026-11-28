(function () {
  const board = (window.LT58Board = window.LT58Board || {});
  const wiring = (board.wiring = board.wiring || {});
  const boundDocuments = wiring.boundDocuments || (wiring.boundDocuments = new WeakSet());

  function bindBoardEvents() {
    if (boundDocuments.has(document)) return;
    boundDocuments.add(document);

    $('#dConn')?.addEventListener('click', e => {
      let b = e.target.closest('.connCard');
      if (!b) return;
      let c = connections.find(x => x.id === b.dataset.cid);
      if (!c) return;
      if (b.dataset.dir === 'next') moveViaConnection(c);
      else pulseConnection(c, () => focusBoardMoment(c.a));
    });
    $('#closeChooser')?.addEventListener('click', closeChooser);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && $('#nextChooser').classList.contains('open')) closeChooser();
    });
    $('#nextChoices')?.addEventListener('click', e => {
      let b = e.target.closest('.routeChoice');
      if (!b) return;
      let c = connections.find(x => x.id === b.dataset.cid);
      if (b.dataset.dir === 'next') moveViaConnection(c);
      else {
        pulseConnection(c, () => focusBoardMoment(c.a));
        $('#nextChooser').classList.remove('open');
      }
    });
    $('#nextMoment')?.addEventListener('click', () => chooseNext('next'));
    $('#prevMoment')?.addEventListener('click', () => chooseNext('prev'));
    $('#mediaFilter')?.addEventListener('change', applyFilters);
    $('#keywordFilter')?.addEventListener('change', applyFilters);
    $('#themeGrid')?.addEventListener('click', e => {
      let b = e.target.closest('.themeBtn');
      if (!b) return;
      document.body.dataset.theme = b.dataset.theme;
      document.querySelectorAll('.themeBtn').forEach(x => x.classList.toggle('active', x === b));
      paintThemeBadge();
      toast(`${b.textContent} 테마로 바꿨어요.`);
    });
    $('#defaultPin')?.addEventListener('change', e => (defaultPinStyle = e.target.value));
    $('#defaultCard')?.addEventListener('change', e => (defaultCardStyle = e.target.value));
    $('#leftCollapse')?.addEventListener('click', () => {
      if (innerWidth < 760) {
        const open = !$('#leftPanel').classList.contains('mobileOpen');
        $('#leftPanel').classList.toggle('mobileOpen', open);
        if (open) pushBoardPanel('tools');
      } else $('#leftPanel').classList.toggle('collapsed');
    });
    $('#leftCollapse')?.addEventListener('click', () => {
      const tools = $('#mobileTools');
      if (tools)
        tools.setAttribute(
          'aria-expanded',
          String($('#leftPanel').classList.contains('mobileOpen'))
        );
    });
    $('#mobileTools')?.addEventListener('click', () => {
      const panel = $('#leftPanel');
      const open = !panel.classList.contains('mobileOpen');
      panel.classList.toggle('mobileOpen', open);
      if (open && typeof pushBoardPanel === 'function') pushBoardPanel('tools');
      $('#mobileTools').setAttribute('aria-expanded', String(open));
      $('#detail').classList.remove('open');
    });
    $('#toolCinema')?.addEventListener('click', () => startCinemaV11(0));
    $('#toolFit')?.addEventListener('click', () => fitAll(true));
  }

  wiring.bindBoardEvents = bindBoardEvents;
  window.bindBoardEvents = bindBoardEvents;
  bindBoardEvents();
})();
