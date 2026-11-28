(function () {
  const board = (window.LT58Board = window.LT58Board || {});
  const cards = (board.cards = board.cards || {});

  function cardHTMLInitial(m) {
    let media = '';
    if (m.url)
      media = LTMedia.markup(m.url, m.title, m.mediaMetadata, m.id, null, null, { compact: true, visitorYoutubeCover: true });
    else if (m.type === 'note') media = `<div class="noteText">“${esc(m.cardMemo || m.memo)}”</div>`;
    else if (m.type === 'video')
      media = `<div class="media"><video muted playsinline loop poster="${m.asset}" src="${m.video}"></video><span class="playBadge">▶</span><span class="duration">${m.duration || '00:03'}</span></div>`;
    else
      media = `<div class="media ${m.type === 'link' || m.type === 'youtube' ? 'linkMedia' : ''}"><img src="${m.asset}" alt=""><span class="${m.type === 'youtube' ? 'playBadge' : ''}">${m.type === 'youtube' ? '▶' : ''}</span></div>`;
    // #601: 카드는 훑기용 — 큰 썸네일 + 제목 2줄 + 감정·날짜 한 줄만. 나머지(마음·출처·키워드·크게 보기)는 상세가 맡는다.
    return `<article class="card ${m.first ? 'first' : ''} ${m.type === 'note' ? 'noteCard' : ''}" data-id="${m.id}" title="끌어서 자리 옮기기" style="--card-x:${m.x}px;--card-y:${m.y}px;--rot:${m.rot}deg;--pin:${colors[m.color]};--halo:${colors[m.color]}55">${m.first ? '<div class="firstTag">첫 순간</div>' : ''}<button class="pin" data-pin="${m.id}" aria-hidden="true" tabindex="-1"></button>${media}<div class="cardBody"><h3 class="cardTitle">${esc(titleMain(m))}</h3><div class="cardMeta"><span class="emotionDot"></span>${esc(m.emotion)} · ${esc(dateText(m.date))}</div></div></article>`;
  }

  function renderInitialCards() {
    cardLayer.innerHTML = moments.map(cardHTMLInitial).join('');
    cardLayer.querySelectorAll('.card').forEach(el => bindCard(el));
    settlePlacedCards();
    if (typeof updateEmptyHint === 'function') updateEmptyHint();
    if (selected) selectMoment(selected, false);
  }

  function cardHTMLExtended(m) {
    let media = '';
    if (m.url)
      media = LTMedia.markup(m.url, m.title, m.mediaMetadata, m.id, null, null, { compact: true, visitorYoutubeCover: true });
    else if (m.type === 'note') media = `<div class="noteText">“${esc(m.cardMemo || m.memo)}”</div>`;
    else if (m.type === 'video')
      media = `<div class="media"><video muted playsinline loop poster="${m.asset}" src="${m.video || ''}"></video><span class="playBadge">▶</span><span class="duration">${m.duration || '00:03'}</span></div>`;
    else {
      let img = m.type === 'youtube' ? youtubeThumb(m.url || '') : m.asset;
      media = `<div class="media ${m.type === 'link' || m.type === 'youtube' ? 'linkMedia' : ''}"><img src="${img}" data-fallback="${ASSET.link}" ${thumbRetryAttrs(m)} alt=""><span class="${m.type === 'youtube' ? 'playBadge' : ''}">${m.type === 'youtube' ? '▶' : ''}</span></div>`;
    }
    // #601: 카드는 훑기용 — 큰 썸네일 + 제목 2줄 + 감정·날짜 한 줄만. 마음·출처·키워드·크게 보기는 상세가 맡는다.
    return `<article class="card ${m.first ? 'first' : ''} ${m.type === 'note' ? 'noteCard' : ''} ${pinClass(m)} ${cardClass(m)}" data-id="${m.id}" style="--card-x:${m.x}px;--card-y:${m.y}px;--rot:${m.rot}deg;--pin:${colors[m.color]};--halo:${colors[m.color]}55">${m.first ? '<div class="firstTag">첫 순간</div>' : ''}<button class="pin" data-pin="${m.id}" aria-hidden="true" tabindex="-1"></button>${media}<div class="cardBody"><h3 class="cardTitle">${esc(titleMain(m))}</h3><div class="cardMeta"><span class="emotionDot"></span>${esc(m.emotion)} · ${esc(dateText(m.date))}</div></div>${cardOrderHTML(m)}</article>`;
  }

  function renderCardList(cardRenderer) {
    cardLayer.innerHTML = moments.map(cardRenderer).join('');
    mobilePicker?.refresh?.();
    cardLayer.querySelectorAll('.card').forEach(el => bindCardV11(el));
    // #894: 카드 안의 그림·링크 기본 끌기를 막는다 — 끌기가 보드 밖(셸)으로 새어 나가 '놓으면 담아요' 판이 떴다.
    cardLayer.querySelectorAll('.card img,.card a').forEach(x => {
      x.draggable = false;
      x.setAttribute('draggable', 'false');
    });
    if (typeof updateEmptyHint === 'function') updateEmptyHint();
    if (selected) selectMoment(selected, false);
    applyFilters();
    if (mobileBoardScroll() && viewport.classList.contains('board-scroll')) applyView(false);
  }

  function renderExtendedCards() {
    renderCardList(cardHTMLExtended);
  }

  const ytId = url => cards.media.ytId(url);
  const originalUrl = m => cards.media.originalUrl(m);
  function cardHTML(m) {
    let media = '';
    if (ytId(originalUrl(m))) media = LTMedia.markup(originalUrl(m), m.title, m.mediaMetadata, m.id, null, { emotion: m.emotion, date: m.date, note: m.memo }, { compact: true, visitorYoutubeCover: true });
    else if (m.url) media = LTMedia.markup(m.url, m.title, m.mediaMetadata, m.id, null, { emotion: m.emotion, date: m.date, note: m.memo }, { compact: true, visitorYoutubeCover: true });
    else if (m.type === 'note') media = `<div class="noteText">“${esc(m.cardMemo || m.memo)}”</div>`;
    else if (m.type === 'video') media = `<div class="media"><video muted playsinline loop poster="${m.asset}" src="${m.video || ''}"></video><span class="playBadge">▶</span><span class="duration">${m.duration || '00:03'}</span></div>`;
    else media = `<div class="media ${m.type === 'link' ? 'linkMedia' : ''}"><img src="${m.asset}" data-fallback="${ASSET.link}" onerror="this.onerror=null;this.src=this.dataset.fallback" alt=""></div>`;
    // #601: 카드는 훑기용 — 큰 썸네일 + 제목 2줄 + 감정·날짜 한 줄만. 마음·출처·크게 보기는 상세가 맡는다.
    // #627: 확정된 꼬리표는 노래 → 멤버 → 무대 순서로 1~3개만 작게(LTTagLine.cardTags 한 벌). 모듈이 늦으면 다음 그리기 때 붙는다.
    const _tags = (window.LTTagLine ? window.LTTagLine.cardTags(m.keywords) : []) || [];
    const _tagRow = _tags.length ? `<div class="cardTags">${_tags.map(_t => `<span class="lt-tag-chip is-card">${esc(_t.value)}</span>`).join('')}</div>` : '';
    let heading = titleMain(m);
    return `<article class="card ${m.first ? 'first' : ''} ${m.type === 'note' ? 'noteCard' : ''} ${_tagRow ? 'hasTags' : ''} ${m.id === featuredMomentId() ? 'isFeatured' : ''} ${pinClass(m)} ${cardClass(m)}" data-id="${m.id}" style="--card-x:${m.x}px;--card-y:${m.y}px;--rot:${m.rot}deg;--pin:${colors[m.color]};--halo:${colors[m.color]}55">${m.first ? '<div class="firstTag">첫 순간</div>' : ''}<button class="pin" data-pin="${m.id}" aria-hidden="true" tabindex="-1"></button>${media}<div class="cardBody"><h3 class="cardTitle">${esc(heading)}</h3><div class="cardMeta"><span class="emotionDot"></span>${esc(m.emotion)} · ${esc(dateText(m.date))}</div>${_tagRow}</div>${cardOrderHTML(m)}</article>`;
  }

  function renderCards() {
    renderCardList(cardHTML);
  }

  cards.renderInitial = renderInitialCards;
  cards.renderExtended = renderExtendedCards;
  cards.cardHTML = cardHTML;
  cards.renderCards = renderCards;
  window.cardHTML = cardHTML;
  window.renderCards = renderCards;
})();
