import {fetchVideoStatus} from '../../public/v41/video-status.mjs';
import originalCSS from './orbit-source.css?inline';
import {titleView, formatDisplayDate, embedUrl} from '../../public/v41/book-usability.mjs';
import {formatRange} from '../../public/v41/domain.mjs';
import {localDaysBetween, relativeDayLabel} from '../../public/v41/local-date.mjs';
import {filterMomentEntries, momentHeadTitle, orderedTrees} from '../../v41/moment-list.js';
import {movedNotice} from '../../public/v41/inbox-model.mjs';
import {tagFacets, filterMomentsByTags} from '../../public/v41/tag-filter.mjs';
import {fallbackCardMarkup, thumbFallbackAttrs, needsFallbackCard, mountThumbFallback, VIDEO_UNAVAILABLE_TEXT, isVerticalMoment, youtubeIdFrom, thumbnailCandidates} from '../../public/v41/thumb-fallback.mjs';
import samples from './orbit-samples.json';
import {escape as esc, orbitRecords, resume, remember} from './memory.js';
import {SERVICE, GO_TREES, READ_BOOK, VIEW_TREE, NEW_TREE, BOOK_IS_READING} from '../terms.js';
import {mediaLinkView} from '../media.js';
import {createView} from './lifecycle.js';
import {safeZoneOf, zoneOverlapArea} from '../../public/v41/orbit-safe-zone.mjs';

export const ORBIT_EXAMPLE = {
  id: 'orbit-example', title: '다시, 그 순간으로', subject: '감상 예시', updatedAt: '2026-01-01',
  moments: samples.map((c,i) => ({id:c.id, title:c.title, note:c.memo || c.whyNext, emotion:c.emotion, date:c.date.replaceAll('.','-'), parentId:i?samples[i-1].id:null, relation:i?samples[i-1].whyNext:'', image:c.image, poster:c.type==='video', nextIds:[c.next,c.branch].filter(Boolean), createdAt:`2026-01-01T00:00:${String(i).padStart(2,'0')}Z`}))
};
// #535: 카드끼리 겹침 줄이기 — 안쪽·바깥 링 반지름 간격을 조금 벌려 이웃 링 카드가 같은 자리에 몰리지 않게 한다.
// 좁은 화면(w<=650)은 원래 반지름을 그대로 쓴다: 화면이 좁으면 벌린 반지름이 오히려 카드를 안전 구역 밖으로 밀어 숨긴다.
const rings={main:{rx:700,ry:330,zAmp:420,zBase:0,speed:1,band:0},inner:{rx:530,ry:250,zAmp:330,zBase:0,speed:1,band:0},outer:{rx:900,ry:420,zAmp:520,zBase:0,speed:1,band:0},upper:{rx:610,ry:290,zAmp:460,zBase:0,speed:1,band:0},lower:{rx:760,ry:350,zAmp:470,zBase:0,speed:1,band:0}};
const ringsNarrow={main:{rx:700,ry:330,zAmp:420,zBase:0,speed:1,band:0},inner:{rx:520,ry:260,zAmp:330,zBase:0,speed:1,band:0},outer:{rx:900,ry:430,zAmp:520,zBase:0,speed:1,band:0},upper:{rx:610,ry:290,zAmp:460,zBase:0,speed:1,band:0},lower:{rx:760,ry:350,zAmp:470,zBase:0,speed:1,band:0}};
let extraCSS=`:host{display:block;height:100dvh;min-height:540px;font-family:var(--ui,system-ui,sans-serif)}.app{height:100%;font-family:var(--ui,system-ui,sans-serif)}.card{text-align:left;padding:0;border:1px solid rgba(255,234,183,.30);box-shadow:0 24px 60px rgba(0,0,0,.38)}.card:after{content:'';position:absolute;inset:2px;border:1px solid rgba(255,234,183,.28);border-radius:inherit;pointer-events:none;transition:border-color .2s,box-shadow .2s}.card .surface{transition:transform .25s ease}/* #586: 끄는 동안(data-lt-busy)은 hover 모양을 바꾸지 않는다 — 카드 위를 지나치며 테두리·번짐·그림자가 계속
   바뀌어 다시 계산·다시 칠하는 일이 끌기를 버겁게 했다. 손을 떼면 원래 hover 모양으로 돌아온다. */
:host(:not([data-lt-busy])) .card:hover,:host(:not([data-lt-busy])) .card:focus-visible{z-index:3000!important;border-color:#ffe6a6;box-shadow:0 24px 60px rgba(0,0,0,.4),0 0 0 2px rgba(255,224,158,.75),0 0 26px rgba(238,190,104,.68)}:host(:not([data-lt-busy])) .card:hover:after,:host(:not([data-lt-busy])) .card:focus-visible:after{border-color:#fff0c7;box-shadow:inset 0 0 18px rgba(255,221,150,.28)}:host(:not([data-lt-busy])) .card:hover .surface,:host(:not([data-lt-busy])) .card:focus-visible .surface{transform:scale(1.035)}:host(:not([data-lt-busy])) .card:hover img,:host(:not([data-lt-busy])) .card:focus-visible img{filter:saturate(.9) brightness(1.06)}@media(prefers-reduced-motion:reduce){.card,.card img,.card .caption,.card:after,.card .surface,.center,.focusLayer,.connectionPeek,.menuPanel,.drawer,.focusInfo,.closeFocus,.mediaViewer,.localNotice,.previewPlaying img,.mediaVisual.previewPlaying img{animation:none;transition:none}}.card.mine{border-width:3px;border-color:var(--lt-gold-deep);box-shadow:0 24px 60px rgba(0,0,0,.38),0 0 0 1px var(--lt-gold-line),0 0 20px var(--lt-gold-glow)}.card.mine:after{border-color:var(--lt-gold-line)}:host([data-lt-theme=garden]) .card.mine{border-color:var(--lt-rose);box-shadow:var(--lt-garden-shadow),0 0 0 1px var(--lt-gold-line),0 0 20px var(--lt-gold-glow)}:host([data-lt-theme=garden]) .recent-card{border-color:var(--lt-rose)}.card:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #e8b8c9;outline-offset:5px}.topbar{z-index:70;gap:16px}.topbar button{pointer-events:auto}.top-actions{display:flex;gap:20px;align-items:center}.center{pointer-events:none;max-width:90vw}.center .actions{pointer-events:none}.center .actions button{pointer-events:auto}.center h1{font-size:clamp(30px,4vw,54px)}.center p{line-height:1.8}.actions{flex-wrap:wrap}.subtleBtn{min-height:44px}.card.clash{visibility:hidden}.primary-cta{background:#eee7e0;color:#28212b;border-color:#eee7e0}.primary-cta:hover{background:#eee7e0;border-color:#eee7e0}:host([data-lt-theme=garden]) .center .primary-cta{background:#eee7e0;color:#28212b;border-color:#eee7e0}:host([data-lt-theme=garden]) .center .primary-cta:hover{background:#eee7e0;border-color:#eee7e0}.hint{pointer-events:none}.caption{pointer-events:none}.card .memoText{overflow:hidden;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow-wrap:anywhere}.orbit-dialog{border:1px solid #564957;color:#eee7e9;background:#151118;border-radius:22px;width:min(900px,94vw);max-height:88dvh;padding:0;overflow:auto}.orbit-dialog::backdrop{background:#030307d9;backdrop-filter:blur(12px)}.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:30px;padding:42px}.detail-image{width:100%;height:390px;object-fit:contain;background:#08070a;border-radius:12px}.detail-image--vertical{display:block;width:auto;max-width:100%;aspect-ratio:9/16;margin:0 auto}.detail-paper{min-height:280px;background:#eae2d3;color:#4d3a40;padding:35px;font:24px/1.7 Georgia,serif;white-space:pre-wrap;overflow-wrap:anywhere;border-radius:8px;transform:rotate(-2deg)}.detail-copy h2{font-size:30px;line-height:1.3;overflow-wrap:anywhere}.detail-copy p{font-size:15px;line-height:1.9;white-space:pre-wrap;overflow-wrap:anywhere;color:#c8beca}.detail-copy small{color:#bd9cad}.detail-buttons{display:flex;flex-wrap:wrap;gap:9px;margin-top:20px}.detail-buttons button,.detail-buttons a,.close{padding:10px 14px;border:1px solid #615364;background:#302537;border-radius:99px;color:#eee3eb;text-decoration:none;cursor:pointer;min-height:44px}.media-unrecognized{display:block;margin-top:20px;padding:10px 14px;border:1px solid #615364;border-radius:10px;background:#241d2a;color:#c8beca;font-size:13px;line-height:1.8;overflow-wrap:anywhere}.close{position:absolute;right:12px;top:10px;z-index:7}.index-list{padding:56px 35px 35px;display:grid;gap:8px}.index-list h2{margin:8px 0 20px}.index-list button{text-align:left;border:1px solid #514454;background:#221b27;color:#eee5ed;padding:14px;border-radius:10px;cursor:pointer}.index-list small{display:block;color:#b9a4be;margin-top:6px}.center-scrim{position:absolute;z-index:10;left:50%;top:50%;width:min(820px,96vw);height:min(560px,74dvh);transform:translate(-50%,-50%);pointer-events:none;background:radial-gradient(ellipse 62% 58% at 50% 49%,rgba(3,3,8,.9) 0%,rgba(3,3,8,.78) 40%,rgba(3,3,8,.42) 68%,rgba(3,3,8,0) 100%)}.center{z-index:22}.center .center-note{margin:15px 0 0;font-size:13px;letter-spacing:0;line-height:1.7;color:#d4cee0}.menuBtn{pointer-events:auto;min-height:44px;padding:10px 15px;border:1px solid rgba(255,255,255,.22);border-radius:999px;background:rgba(9,8,14,.62);color:#ece7f1;font-size:11px;letter-spacing:.06em;backdrop-filter:blur(8px)}.menuBtn:hover{border-color:rgba(255,255,255,.44);background:rgba(255,255,255,.09)}.hint{font-size:13px;letter-spacing:.04em;color:#9c97a6}@media(max-width:650px){.center-scrim{width:min(560px,104vw);height:min(430px,56dvh);background:radial-gradient(ellipse 64% 58% at 50% 47%,rgba(3,3,8,.93) 0%,rgba(3,3,8,.84) 40%,rgba(3,3,8,.46) 70%,rgba(3,3,8,0) 100%)}.center .center-note{font-size:10px}.topbar{padding:14px 18px}.brand{font-size:9px;letter-spacing:.12em}.top-actions{gap:12px}.detail-grid{grid-template-columns:1fr;padding:48px 22px 24px;gap:14px}.detail-image{height:220px}.detail-paper{min-height:150px;padding:20px;font-size:20px}.detail-copy h2{font-size:24px}.center h1{font-size:30px}.hint{font-size:13px;bottom:18px;right:80px}/* 이슈 458: 셸 ＋ 단추(오른쪽 아래 56px) 자리를 비워 둔다 */.actions{gap:8px}.subtleBtn{padding:10px 12px;font-size:12px}.detail-copy p{font-size:14px}}@media(max-width:768px){.brand{font-size:12px}.menuBtn{font-size:14px}.subtleBtn{font-size:14px}.hint{font-size:14px}.center .center-note{font-size:14px}.eyebrow{font-size:12px}.focusActions button,.focusActions a{font-size:14px}.focusInfo .kicker{font-size:12px}.meta{font-size:14px}.why b{font-size:14px}.panelHead strong{font-size:14px}.media-unrecognized{font-size:14px}.card.video .playGlyph{font-size:12px}.card.video .duration{font-size:12px}.card.link .surface:after{font-size:12px}.card.memo .memoKicker{font-size:12px}.card.memo .memoFoot{font-size:12px}.card .caption{font-size:12px}.firstMark{font-size:12px}.index-list small{font-size:14px}}.index-filters{display:flex;flex-wrap:wrap;gap:8px;margin:-6px 0 20px}.indexFilter{padding:7px 14px;border:1px solid #514454;border-radius:999px;background:#221b27;color:#cfc3d6;font:inherit;font-size:13px;cursor:pointer;min-height:36px}.indexFilter.active{border-color:#e8b8c9;color:#fff;background:#3a2c40}.indexFilter:focus-visible{outline:3px solid #e8b8c9;outline-offset:2px}.index-empty{color:#b9a4be;font-size:14px;line-height:1.7;margin:6px 0 0}.indexTagTitle{margin:18px 0 0;font-size:12px;color:#bd9cad}.index-tag-filter{display:grid;gap:10px;margin:-6px 0 20px;padding:14px;border:1px solid #3a2c40;border-radius:12px;background:#1b1520}.indexTagPickedRow{display:flex;flex-wrap:wrap;gap:8px}.lt-tree-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--lt-tree-dot,#8a7f8f);flex:0 0 auto}.lt-tree-tag{display:inline-flex;align-items:center;gap:5px}.indexFilter{display:inline-flex;align-items:center;gap:6px}.indexTagPicked{display:inline-flex;align-items:center;min-height:44px;padding:0 12px;border:1px solid #e8b8c9;border-radius:999px;background:#3a2c40;color:#fff;font:inherit;font-size:13px;cursor:pointer}.indexTagKind{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.indexTagKindName{min-width:52px;color:#bd9cad;font-size:12px}.indexTagChips{display:flex;flex-wrap:wrap;gap:8px}.indexTagChip{display:inline-flex;align-items:center;min-height:44px;padding:0 12px;border:1px solid #514454;border-radius:999px;background:#221b27;color:#cfc3d6;font:inherit;font-size:13px;cursor:pointer}.indexTagChip.active{border-color:#e8b8c9;color:#fff;background:#3a2c40}.indexTagMore{display:inline-flex;align-items:center;min-height:44px;padding:0 10px;border:0;background:none;color:#bd9cad;font:inherit;font-size:13px;cursor:pointer;text-decoration:underline}.indexTagChip:focus-visible,.indexTagMore:focus-visible,.indexTagPicked:focus-visible{outline:3px solid #e8b8c9;outline-offset:2px}.detail-grid{position:relative}.detail-nav{position:absolute;top:50%;transform:translateY(-50%);z-index:6;min-width:44px;min-height:44px;padding:8px 13px;border:1px solid #615364;border-radius:999px;background:#302537;color:#eee3eb;font:inherit;font-size:15px;cursor:pointer}.detail-nav--prev{left:10px}.detail-nav--next{right:10px}.detail-nav:disabled{opacity:.35;cursor:default}.detail-nav:focus-visible{outline:3px solid #e8b8c9;outline-offset:2px}.detail-nav-note{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:6;margin:0;color:#bd9cad;font-size:12px}:host([data-lt-busy]) .card{will-change:transform,filter;box-shadow:0 14px 34px rgba(0,0,0,.34)}:host([data-lt-busy]) .card.mine{box-shadow:0 14px 34px rgba(0,0,0,.34),0 0 0 1px var(--lt-gold-line),0 0 12px var(--lt-gold-glow)}:host([data-lt-busy]) .card:after{box-shadow:none}:host([data-lt-busy]) .recent-card:hover,:host([data-lt-busy]) .recent-card:focus-within{border-color:var(--lt-gold-deep);box-shadow:0 24px 60px rgba(0,0,0,.38),0 0 0 1px var(--lt-gold-line),0 0 22px var(--lt-gold-glow);outline:none}:host([data-lt-theme=garden]) .recent-card:hover,:host([data-lt-theme=garden]) .recent-card:focus-within{border-color:var(--lt-rose)}:host([data-lt-busy]) .recent-card:hover:after,:host([data-lt-busy]) .recent-card:focus-within:after{border-color:var(--lt-gold-line)}
/* 옮기기·칩 순서(2026-11-17): 고르기 칸·행별 옮기기·대상 메뉴·안내 줄·끌기 표시. 색은 이 찾의 기존 값(#514454·#e8b8c9 계열)을 쓴다. */
.index-head-tools{display:inline-flex;gap:8px;margin-left:12px;vertical-align:middle}
.indexPickToggle,.indexMovePicked{min-height:36px;padding:7px 14px;border-radius:999px;border:1px solid #514454;background:#221b27;color:#cfc3d6;font:inherit;font-size:13px;cursor:pointer}
.indexPickToggle[aria-pressed="true"],.indexMovePicked{border-color:#e8b8c9;color:#fff;background:#3a2c40}
.index-row-line{display:flex;gap:8px;align-items:stretch}
.indexPick{flex:0 0 auto;width:44px;min-height:44px;border:1px solid #514454;border-radius:10px;background:#221b27;color:#eee5ed;font:inherit;font-size:16px;cursor:pointer}
.indexPick[aria-pressed="true"]{border-color:#e8b8c9;background:#3a2c40;color:#fff}
.index-row-line>[data-lt-moment-row]{flex:1 1 auto}
.indexMoveOne,.indexMoveCancel{align-self:center;min-height:44px;padding:8px 12px;border:1px solid #514454;border-radius:999px;background:#221b27;color:#cfc3d6;font:inherit;font-size:13px;cursor:pointer}
.indexMoveTarget{display:inline-flex;align-items:center;gap:6px;width:100%;min-height:44px;padding:10px 12px;border:1px solid #514454;border-radius:10px;background:#221b27;color:#eee5ed;font:inherit;font-size:13px;cursor:pointer;text-align:left}
.indexMoveTarget:hover{border-color:#e8b8c9}
.index-move-feedback{display:flex;gap:10px;align-items:center;justify-content:space-between;margin:0 0 14px;padding:12px 14px;border:1px solid #615364;border-radius:10px;background:#241d2a;color:#eee7e9;font-size:13px}
.index-move-undo{min-height:44px;padding:8px 14px;border:1px solid #e8b8c9;border-radius:999px;background:#3a2c40;color:#fff;font:inherit;font-size:13px;cursor:pointer}
.index-move-menu{display:grid;gap:8px;margin:14px 0 0;padding:14px;border:1px solid #3a2c40;border-radius:12px;background:#1b1520}
.indexFilter.drop-ok{border-color:#e8b8c9;color:#fff;background:#3a2c40;box-shadow:0 0 0 2px #e8b8c9}
.index-list .indexFilter{touch-action:none}
.orbit-dialog.lt-dragging{cursor:grabbing}
.orbit-dialog.lt-dragging [data-lt-moment-row]{pointer-events:none;opacity:.7}.index-empty{color:#b9a4be;font-size:14px;line-height:1.7;margin:6px 0 0}.indexTagTitle{margin:18px 0 0;font-size:12px;color:#bd9cad}.index-tag-filter{display:grid;gap:10px;margin:-6px 0 20px;padding:14px;border:1px solid #3a2c40;border-radius:12px;background:#1b1520}.indexTagPickedRow{display:flex;flex-wrap:wrap;gap:8px}.indexTagPicked{display:inline-flex;align-items:center;min-height:44px;padding:0 12px;border:1px solid #e8b8c9;border-radius:999px;background:#3a2c40;color:#fff;font:inherit;font-size:13px;cursor:pointer}.indexTagKind{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.indexTagKindName{min-width:52px;color:#bd9cad;font-size:12px}.indexTagChips{display:flex;flex-wrap:wrap;gap:8px}.indexTagChip{display:inline-flex;align-items:center;min-height:44px;padding:0 12px;border:1px solid #514454;border-radius:999px;background:#221b27;color:#cfc3d6;font:inherit;font-size:13px;cursor:pointer}.indexTagChip.active{border-color:#e8b8c9;color:#fff;background:#3a2c40}.indexTagMore{display:inline-flex;align-items:center;min-height:44px;padding:0 10px;border:0;background:none;color:#bd9cad;font:inherit;font-size:13px;cursor:pointer;text-decoration:underline}.indexTagChip:focus-visible,.indexTagMore:focus-visible,.indexTagPicked:focus-visible{outline:3px solid #e8b8c9;outline-offset:2px}.detail-grid{position:relative}.detail-nav{position:absolute;top:50%;transform:translateY(-50%);z-index:6;min-width:44px;min-height:44px;padding:8px 13px;border:1px solid #615364;border-radius:999px;background:#302537;color:#eee3eb;font:inherit;font-size:15px;cursor:pointer}.detail-nav--prev{left:10px}.detail-nav--next{right:10px}.detail-nav:disabled{opacity:.35;cursor:default}.detail-nav:focus-visible{outline:3px solid #e8b8c9;outline-offset:2px}.detail-nav-note{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:6;margin:0;color:#bd9cad;font-size:12px}:host([data-lt-busy]) .card{will-change:transform,filter;box-shadow:0 14px 34px rgba(0,0,0,.34)}:host([data-lt-busy]) .card.mine{box-shadow:0 14px 34px rgba(0,0,0,.34),0 0 0 1px var(--lt-gold-line),0 0 12px var(--lt-gold-glow)}:host([data-lt-busy]) .card:after{box-shadow:none}:host([data-lt-busy]) .recent-card:hover,:host([data-lt-busy]) .recent-card:focus-within{border-color:var(--lt-gold-deep);box-shadow:0 24px 60px rgba(0,0,0,.38),0 0 0 1px var(--lt-gold-line),0 0 22px var(--lt-gold-glow);outline:none}:host([data-lt-theme=garden]) .recent-card:hover,:host([data-lt-theme=garden]) .recent-card:focus-within{border-color:var(--lt-rose)}:host([data-lt-busy]) .recent-card:hover:after,:host([data-lt-busy]) .recent-card:focus-within:after{border-color:var(--lt-gold-line)}`;

extraCSS += '@media(min-width:651px){.detail-grid{padding-left:64px;padding-right:64px}}@media(max-width:650px){.detail-grid{padding-top:60px}.detail-nav{top:6px;transform:none}.detail-nav--prev{left:12px}.detail-nav--next{left:64px;right:auto}.detail-nav-note{top:20px}}';
// #426: 최근 순간 카드 — 궤도의 금빛 내 카드(.card.mine)와 같은 결(테두리·이중선·금빛 번짐). 390에서는 폭=화면-32px, 세로 썸네일 높이 제한.
// 261118 대표 지적 1번(이슈 #884): 카드 층 아래 경계를 둔 것이 바닥에 빈 회색 띠를 만들었다 —
// .world 를 다시 바닥까지 이어 붙이고(링크 줄은 셸이 위에 그리므로 그대로 보인다), 잘림도 거둔다.
extraCSS+=`.center-note{display:flex;flex-wrap:wrap;justify-content:center;align-items:baseline;gap:2px 10px}.center-note[data-off]{display:none}.center-hint{color:var(--lt-muted,#9b98a6)}@media(max-width:650px){.center p.note-with-hint{font-size:12px;line-height:1.5;margin-top:8px}}/* #635 PR C: '드래그 · 금테 카드를 눌러 감상' 안내를 단추 묶음 바로 아래(안내 줄 옆)로 올린다 — 화면 아래 고정 링크 줄과 겹치지 않게. */`;
/* 261117 대표 검수: 마우스로 열었으면 닫기 단추의 초점 테두리를 그리지 않는다(#795 계정 메뉴와 같은 방식) — 키보드로 열었으면 보인다. */
extraCSS+=`dialog[data-lt-opened-by=mouse] .close:focus-visible,dialog[data-lt-opened-by=mouse] .close:focus{outline:0;box-shadow:none}`;
extraCSS+=`.recent-card{pointer-events:auto;position:relative;display:block;width:min(430px,86vw);margin:24px auto 0;padding:0;text-align:left;border:3px solid var(--lt-gold-deep);border-radius:16px;background:rgba(10,9,14,.82);box-shadow:0 24px 60px rgba(0,0,0,.38),0 0 0 1px var(--lt-gold-line),0 0 22px var(--lt-gold-glow);cursor:pointer;overflow:hidden;font:inherit;color:inherit}.recent-media[data-recent-state=loading] .recent-thumb,.recent-media[data-recent-state=loading]::before,.recent-media[data-recent-state=failed] .recent-thumb,.recent-media[data-recent-state=failed]::before{opacity:0}.recent-media[data-recent-video] .recent-thumb,.recent-media[data-recent-video]::before{transition:opacity .2s ease}.recent-media[data-recent-video]+.recent-meta{box-sizing:border-box;height:82px}.recent-media[data-recent-video]+.recent-meta small{line-height:16px}.recent-media[data-recent-state=loading]:after{content:'';position:absolute;inset:0;background:linear-gradient(110deg,transparent 25%,color-mix(in srgb,var(--lt-muted) 12%,transparent) 50%,transparent 75%);background-size:200% 100%;animation:recent-shimmer 1.8s ease-in-out infinite;pointer-events:none}@keyframes recent-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}.recent-media[data-recent-state=loading] .recent-play,.recent-media[data-recent-state=failed] .recent-play,.recent-video-status{display:none}.recent-media[data-recent-state=failed] .recent-video-status{position:absolute;inset:0;display:grid;place-items:center;padding:16px;text-align:center;font-size:14px;line-height:1.5;color:var(--lt-muted)}@media(prefers-reduced-motion:reduce){.recent-media[data-recent-state=loading]:after{animation:none}.recent-media[data-recent-video] .recent-thumb,.recent-media[data-recent-video]::before{transition:none}}.recent-card:after{content:'';position:absolute;inset:2px;border:1px solid var(--lt-gold-line);border-radius:inherit;pointer-events:none}.recent-card:hover,.recent-card:focus-within{border-color:#ffe6a6;box-shadow:0 24px 60px rgba(0,0,0,.4),0 0 0 2px rgba(255,224,158,.75),0 0 26px rgba(238,190,104,.68);outline:none}.recent-card:hover:after,.recent-card:focus-within:after{border-color:#fff0c7}.recent-open{position:absolute;inset:0;z-index:0;width:100%;height:100%;margin:0;border:0;padding:0;background:transparent;cursor:pointer;font:inherit}.recent-media{position:relative;z-index:1;display:block;width:100%;aspect-ratio:16/9;background:#0b0a10;overflow:hidden}.recent-media.vertical{width:100%;aspect-ratio:16/9;margin:0}.recent-media img{width:100%;height:100%;object-fit:cover;display:block}.recent-media.vertical::before{content:'';position:absolute;inset:-12px;background-image:var(--lt-recent-bg);background-size:cover;background-position:center;filter:blur(18px) brightness(.72);opacity:.86;transform:scale(1.06);pointer-events:none}.recent-media.vertical .recent-thumb{position:relative;object-fit:contain}.recent-play{position:absolute;inset:0;width:100%;min-height:44px;min-width:44px;border:0;padding:0;background:transparent;cursor:pointer;display:grid;place-items:center}.recent-play>span{display:grid;place-items:center;min-width:52px;min-height:52px;border-radius:50%;background:#1a1620d9;color:#fff;border:1px solid rgba(255,255,255,.4);font-size:20px;line-height:1}.recent-frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:#000}.recent-meta{position:relative;z-index:1;display:block;padding:10px 14px 12px}.recent-meta small{display:block;font-size:11px;letter-spacing:.04em;color:#b9b2c4}.recent-meta strong{display:block;margin:3px 0 2px;font-size:15px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.recent-media--memo{aspect-ratio:auto;display:grid;place-items:center;padding:16px;min-height:96px}.recent-media--slot{aspect-ratio:auto}.recent-memo{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;font-size:14px;line-height:1.7;color:#e6ddef;overflow-wrap:anywhere}@media(max-width:650px){.center{width:calc(100vw - 16px);max-width:calc(100vw - 16px)}.recent-card{width:calc(100vw - 32px)}.recent-media.vertical{width:100%}}`;
// 261116 PR 2: 머리글 단추(카드 모드 고르기). 눈에 보이는 글자 12px 이상·대비 4.5:1 위, 누름 영역은 :after로 44px를 채운다(menuBtn과 같은 판). 카드 열림(recent-open)과 갈라진다 — 단추 자체가 위에 있어 그쪽이 눌린다.
extraCSS+=`.recent-head{position:relative;display:inline-flex;align-items:baseline;gap:1px;min-height:24px;margin:-4px 0;padding:2px 0;border:0;background:none;cursor:pointer;font:inherit;font-size:13px;letter-spacing:.04em;color:#cdc5da;text-align:left;white-space:nowrap}.recent-head:after{content:'';position:absolute;inset:-10px -12px -10px -8px;border-radius:8px}.recent-head:focus-visible{outline:3px solid #e8b8c9;outline-offset:2px}.recent-head-arrow{font-size:12px;color:#a79db8}.recent-head:hover{color:#eee6f6}`;
// #1109: 정리 창과 같은 닫기 단추·뒤 덮개·390 꽉 찬 창 규칙.
extraCSS+=`.orbit-dialog:not(#guidePanel)::backdrop{background:rgba(3,3,7,.85);backdrop-filter:blur(12px)}.orbit-dialog:not(#guidePanel) .close{box-sizing:border-box;width:44px;height:44px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;padding:0;border:1px solid #615364;border-radius:50%;background:#ffffff07;font-size:24px;line-height:1;color:inherit;position:absolute;right:12px;top:10px;z-index:7}@media(max-width:520px){.orbit-dialog:not(#guidePanel){width:100vw;max-width:none;height:100dvh;max-height:100dvh;inset:0;margin:0;border:0;border-radius:0}.orbit-dialog:not(#guidePanel) .close{top:8px;right:8px;background:#151118e6}}`;

export function mountOrbit(host,{trees,storage,context,actions,authHtml='',onSelect=()=>{},recordNote=null,examples=[],onOpen=null,empty=false,titleDisplay='both',momentList=null,dateStyle='dot',prefs=null,initialPicking=false,initialNotice=null,homePin=null,loggedIn}) {
 performance.mark('m0');
 const example=context.readOnly;
 const {root:shadow, signal, track, dispose}=createView(host);
 const demo=empty?false:(example || !trees.length);
 // #780: 큰 제목·부제목·눈썹·가운데 단추는 카드(mix-empty)가 비었는지보다 로그인 여부를 먼저 본다.
 // mix-empty(사진 3장 미만)에서도 로그인 상태면 회원 문구가 나와야 한다. loggedIn을 넘기지 않으면(4.0) 기존 demo 규칙을 그대로 쓴다.
 // 카드는 demo대로 예시를 유지하고, 안내 줄(center-note)과 힌트도 카드 상태(demo)를 따른다 — mix-empty는 카드·안내 줄에만 영향을 준다.
 const noOwnMoments=loggedIn===true&&Array.isArray(momentList?.entries)&&momentList.entries.length===0;
 const titleDemo=noOwnMoments||(loggedIn===true?false:(loggedIn===false?true:demo));
 const records=orbitRecords(trees);
 // #347 후속: 화면 제목 한 벌(book-usability)로 큰 제목·작은 영상 제목·날짜를 그린다.
 const titleMode=titleDisplay;
 const titleOf=m=>titleView(m,titleMode);
 const mainOf=m=>titleOf(m).main||m.title||'';
 // #441 후속: 첫 화면 날짜도 책·보드·지도와 같은 계정 설정(dateStyle)을 따른다. 이 화면은 저장소를
 // 직접 읽지 않으므로(server-only-contract) 호출하는 쪽(v41/home.js)이 미리 읽어 넘긴다.
 const dateOf=m=>formatDisplayDate(m.date,dateStyle);
 const subMarkup=m=>{const sub=titleOf(m).sub;return sub?'<span class="videoTitle">▶ '+esc(sub)+'</span>':''};
 // 2026-11-08: 내 순간이 궤도 수보다 적으면 남는 자리만 예시로 채운다(흐린 카드).
 // 2026-11-10(#340): 내 기록 YouTube 썸네일 카드(youtubeThumb)는 사진 카드 모양에 재생 표시(.card.video .playGlyph)를 붙인다.
 const memberCards=records.map((m,i)=>({...m,type:m.youtubeThumb&&m.image?'video':(m.image?'photo':'memo'),first:m.parentId===null,ring:Object.keys(rings)[i%5],baseAngle:i*2.399967,phaseOffset:i*.29,zOffset:(i%7-3)*28,tiltX:(i%5-2)*3.2,tiltY:(i%7-3)*4.2,tiltZ:(i%9-4)*1.8,sizeClass:i%3===0?'lg':'md'}));
  // #379: 채우는 예시 카드는 줄여서 궤도를 가볍게 — 내 카드가 먼저 채워진다.
  const fillers=demo?[]:(Array.isArray(examples)?examples:[]).slice(0,Math.max(0,24-memberCards.length)).map((c,extraIndex)=>{const i=memberCards.length+extraIndex;return {...c,key:'example-'+c.id,treeId:ORBIT_EXAMPLE.id,example:true,type:c.image?'photo':'memo',first:false,note:c.memo||c.whyNext,next:c.nextIds?.[0]||null,branch:c.nextIds?.[1]||null,ring:Object.keys(rings)[i%5],baseAngle:i*2.399967,phaseOffset:i*.29,zOffset:(i%7-3)*28,tiltX:(i%5-2)*3.2,tiltY:(i%7-3)*4.2,tiltZ:(i%9-4)*1.8,sizeClass:i%3===0?'lg':'md'};});
  const all=demo?samples.map(c=>({...c,key:c.id,treeId:ORBIT_EXAMPLE.id,note:c.memo||c.whyNext})):[...memberCards,...fillers];
  // #394: 순간 목록은 모든 트리의 순간(최근 순)을 쓴다. 없으면(예시 판본) 기존 카드 목록을 그대로 쓴다.
  // 목록에서 연 순간의 앞·뒤 순서는 열기 전 목록 순서(트리 고르기 포함)를 그대로 따른다.
  let listFilter=momentList?.initialTreeId||'all';
  // 순간 목록에서의 옮기기·칩 순서(2026-11-17, 대표 결정). 쓰기 가능한 내 기록(서버·소유자)에서만 동작한다.
  // demo는 첫 화면 카드가 비었는지(trees prop=cardTrees)만 본다 — 목록의 기록 여부와 무관해 가드에 넣지 않는다.
  // 예시 행은 행별 !c.example 필터로 막는다. 읽기 전용(공유·예시 판본)은 context.readOnly가 막는다.
  const canMoveMoments=()=>!context.readOnly&&Boolean(momentList)&&typeof actions.moveMoments==='function';
  let chipOrder=Array.isArray(prefs?.treeChipOrder)?[...prefs.treeChipOrder]:[];
  let picking=initialPicking===true||momentList?.initialPicking===true;
  let pickedKeys=new Set();
  let indexNotice=(initialNotice&&initialNotice.text)?initialNotice:((momentList?.initialNotice&&momentList.initialNotice.text)?momentList.initialNotice:null);
  let moveMenuFor=null; // 옮기기 메뉴를 띄운 대상('picked' 또는 행 key)
  let suppressClickKey=''; // 손가락 길게 누른 뒤 이어지는 click이 상세를 열지 않게 한 번만 막는다
  const listRows=()=>momentList?filterMomentEntries(momentList.entries,listFilter):all;
  // #678 후속(꼬리표 걸러 보기): 걸러 보기는 저장하지 않는다 — 창을 닫으면 풀린다(닫기 리스너에서 비운다).
  let tagSelected=new Set();
  let tagExpanded=new Set();
  const findMoment=key=>(momentList?momentList.entries:all).find(c=>c.key===key)||all.find(c=>c.key===key)||null;
  const poolFor=c=>(momentList&&momentList.entries.some(x=>x.key===c.key))?momentList.entries:all;
  // #379: 궤도마다 카드 수를 세어 각도를 같은 간격으로 나눈다 — 같은 궤도에 카드가 몰리면 서로 포개진다.
  // 간격은 여기서 한 번만 정하고(회전 중에도 유지), 프레임 계산은 더하지 않는다.
  if(!demo){const ringNames=Object.keys(rings);const perRing={},slot={};for(const c of all)perRing[c.ring]=(perRing[c.ring]||0)+1;for(const c of all){const k=slot[c.ring]||0;slot[c.ring]=k+1;c.baseAngle=(k/perRing[c.ring])*Math.PI*2;c.phaseOffset=ringNames.indexOf(c.ring)*.78;}}
  // #429 2/2: 화면 폭별 카드 수 상한 — 1280 이상 28장, 900~1279 20장, 650~899 14장, 그 아래(390 포함) 10장.
 // 값은 마운트 때 정하지 않고 frame마다 폭으로 다시 판정해 창 크기가 바뀌면 따라간다(넘치는 카드는 숨긴다).
  // #942: 안전 구역 피하기는 자리에 앉은 카드의 크기 클래스별 이름표(crumb)로 계산한다.
  // 그림자 안에서 offsetWidth 는 글꼴·썸네일 로딩 전 0/작은 값일 수 있어 lg 카드가 가운데를 스쳤다.
  const CARD_NOMINAL={wide:{sm:[128,166],md:[180,232],lg:[226,292]},narrow:{sm:[92,120],md:[132,172],lg:[168,218]}};
  const forceLg=()=>globalThis.__LT_FORCE_LG__===true;
  const CARD_CAPS=[[1280,28],[900,20],[650,14],[0,10]];
 const cardCapFor=w=>{for(const [min,cap] of CARD_CAPS)if(w>=min)return cap;return 10;};
  const cards=all.slice(0,48).map((c)=>forceLg()?{...c,sizeClass:'lg'}:c), last=demo?all[0]:resume(storage,trees);
 const lastCard=demo?all[0]:all.find(c=>c.treeId===last?.tree.id&&c.id===last?.moment.id)||all[0];
 // #426: 첫 화면 가운데 "최근 순간 카드" — 모든 트리의 최근 순간 한 장. 궤도가 예시 모드(로그인 후 '섞어서'에서 사진 3장 미만·mix-empty, 또는 예시 고름)여도
 // 순간만 있으면 내 최근 순간 카드를 보여 준다(둘째 줄 안내를 대신한다). 로그아웃은 momentList가 없어 자동으로 카드가 없다.
 // 썸네일은 썸네일 공용 모듈(#435) 그대로: 회색이면 글 카드·최소 카드로 내려간다. 플레이어는 ▶를 누른 뒤에만 만든다.
 // 261116 PR 2: 홈(v41/home.js)이 모드별로 고른 카드(momentList.recent)와 머리글 문구(momentList.recentHeader)를 넘겨 갈아끼운다.
 // 없으면 지금처럼 최근 순간 한 장('마지막 순간 · N일 전'). 머리글은 언제나 눌러 카드 모드를 고르는 단추다(4.1만 — 4.0에는 momentList가 없어 카드 자체가 없다).
 let recentMoment=(Array.isArray(momentList?.entries)&&momentList.entries.length)?(momentList.recent||momentList.entries[0]):null;
 let recentHeader=(momentList&&typeof momentList.recentHeader==='string'&&momentList.recentHeader)?momentList.recentHeader:null;
 const checkRecentVideo=card=>{
  const media=card?.querySelector('[data-recent-video]');
  const id=media?.dataset.recentVideo;
  if(!id)return;
  fetchVideoStatus(id).then(status=>{
   if(!media.isConnected)return;
   if(status==='gone'||status==='private')media.dataset.recentState='failed';
  }).catch(()=>{});
 };
 const recentMarkup=c=>{
  const raw=Date.parse(c.createdAt||c.date||'');
  // #549: '0일 전' 대신 '오늘'·'어제'. 일수는 기기 지역 날짜(#547 local-date) 기준으로 세어 UTC 계산으로 하루가 밀리지 않게 한다.
  const days=Number.isNaN(raw)?null:Math.max(0,localDaysBetween(undefined,raw));
  const head=mainOf(c)||'제목 없는 순간';
  const writable=!c.example;
  const vertical=isVerticalMoment(c);
  const videoId=c.youtubeThumb?youtubeIdFrom(c.url):'';
  const candidates=videoId?thumbnailCandidates(c,{autoLoad:true}):[];
  const bgStyle=src=>vertical&&src?` style="--lt-recent-bg:url('${esc(src)}')"`:'';
  const media=videoId&&candidates.length
   ?`<span class="recent-media${vertical?' vertical':''}"${bgStyle(candidates[0])} data-recent-video="${esc(videoId)}" data-recent-state="loading"><img class="recent-thumb" src="${esc(candidates[0])}" alt="" draggable="false"${thumbFallbackAttrs(c,{candidates,mode:'recent-video'})} referrerpolicy="no-referrer" decoding="async"><span class="recent-video-status" role="status">${VIDEO_UNAVAILABLE_TEXT}</span><button type="button" class="recent-play" data-recent-play aria-label="바로 재생"><span aria-hidden="true">▶</span></button></span>`
   :c.image
   ?`<span class="recent-media${vertical?' vertical':''}"${bgStyle(c.image)}><img class="recent-thumb" src="${esc(c.image)}" alt="" draggable="false"${thumbFallbackAttrs(c,{candidates:c.thumbCandidates||[c.image],writable,variant:'orbit'})}${c.youtubeThumb?' referrerpolicy="no-referrer"':''} decoding="async">${c.youtubeThumb&&c.url?`<button type="button" class="recent-play" data-recent-play aria-label="바로 재생"><span aria-hidden="true">▶</span></button>`:''}</span>`
   :(!c.example&&needsFallbackCard(c,{autoLoad:false})?`<span class="recent-media recent-media--slot">${fallbackCardMarkup(c,{writable,variant:'orbit',dateStyle})}</span>`:`<span class="recent-media recent-media--memo"><span class="recent-memo">${esc(c.note||head)}</span></span>`);
  // #466 M6: 카드 전체를 role="button"으로 감싸면 안의 ▶ 재생 단추(또는 글 카드의 "제목 달기")가
  // 중첩 상호작용(axe nested-interactive)이 된다. 카드는 평범한 div로 두고, 뒤에 깔린 투명 단추
  // (recent-open)가 카드 전체의 클릭·키보드 열기를 맡는다 — media·meta가 그 위(z-index 1)에 있어
  // ▶ 단추·제목 달기는 그대로 따로 눌린다(마우스 클릭 범위·Enter·Space는 이전과 같다).
  return `<div class="recent-card mine" data-do="recent"><button type="button" class="recent-open" data-do="recent" aria-label="${esc(head)} 이어 보기"></button>${media}<span class="recent-meta"><button type="button" class="recent-head" data-recent-head aria-haspopup="true" aria-expanded="false" aria-label="첫 화면 카드 고르기: ${recentHeader!==null?esc(recentHeader):'마지막 순간'}">${recentHeader!==null?esc(recentHeader):`마지막 순간${days===null?'':` · ${relativeDayLabel(days)}`}`}<span class="recent-head-arrow" aria-hidden="true"> ▾</span></button><strong>${esc(head)}</strong><small>${esc(c.subject||'내 트리')} · 이어 보기 →</small></span></div>`;
 };
 performance.mark('m1');shadow.innerHTML=`<style>${originalCSS}${extraCSS}.auth-entry{white-space:nowrap}</style><section class="app" aria-label="${SERVICE} 첫 화면"><div class="topbar"><span class="brand">${SERVICE} · MEMORY ORBIT</span><div class="top-actions"><button class="menuBtn" data-do="index">순간 목록</button>${authHtml}</div></div><div class="world"></div><div class="center-scrim" aria-hidden="true"></div><div class="center" data-lt-keep-clear><div class="eyebrow">${titleDemo?'나의 첫 순간':'WELCOME BACK'}</div><h1>${titleDemo?'좋아하는 순간부터.':'다시, 그 순간으로.'}</h1><p>${titleDemo?'간직하고 싶은 장면에 마음을 남겨 보세요.<br>지금 떠오르는 순간 하나면 충분해요.':'기억은 아직 여기에서 이어지고 있어요.'}</p>${recentMoment?recentMarkup(recentMoment):''}<div class="actions"><button class="subtleBtn primary-cta" data-do="${titleDemo?'new':'continue'}">${titleDemo?NEW_TREE:'이어 보던 순간'}</button><button class="subtleBtn" data-do="${titleDemo?'continue':'new'}">${titleDemo?'예시 순간 감상':NEW_TREE}</button><button class="subtleBtn" data-do="trees">${GO_TREES}</button></div><p class="center-note${demo?' note-with-hint':''}"><span>${demo?(loggedIn===true?'뒤에 떠다니는 카드는 감상 예시예요':'감상 예시 · 내 기록에는 저장되지 않아요'):esc(recordNote??`${all.length}개의 순간 · 서버에 보관`)}</span>${demo?(loggedIn===true?'<span>·</span><span class="center-hint">눌러서 감상</span>':'<span class="center-hint">드래그 · 금테 카드를 눌러 감상</span>'):''}</p></div></section><dialog class="orbit-dialog" aria-label="순간 감상"></dialog>`;
 const app=shadow.querySelector('.app'),world=shadow.querySelector('.world'),dialog=shadow.querySelector('dialog');
 // #1010: 예시 안내 줄 — 떠다니는 예시 카드가 숨는 좁은 화면에서는 함께 숨긴다(아래 배치에서 data-off를 묻는다).
 const centerNote=shadow.querySelector('.center-note');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;let paused=reduced,phase=0,raf=0,previous=0,drag=null,moved=0,opener=null,spin=0,glide=0;
  // #942: 가리키기·클릭으로 배경이 움직이지 않게 카메라는 항상 중심(0,0)에 둔다. 회전은 끌 때만 phase 로 누적한다.
  let cameraTarget={x:0,y:0}, camera={x:0,y:0};
 // #586: 패럴랙스는 pointermove마다 화면 중심을 재지 않는다 — 끄는 동안 pointermove가 프레임보다
 // 자주 불려 강제 배치 읽기가 늘었다. rect는 창 크기가 바뀔 때(fitNotice)만 다시 재고 캐시를 쓴다.
 let appBox=null;
 const motionOn=() => !paused && !hoveredCard && !dialog.open && !document.hidden;
 const neutralizePointer=() => { cameraTarget={x:0,y:0}; camera={x:0,y:0}; };
 // #213 2번: 움직임 켜기/멈춤은 도구 줄의 "보기" 메뉴가 부른다(setMotionPaused).
 // #535-3: 끄는 동안에만 카드 레이어를 미리 승격하고(스타일 재계산 28.8→14.6ms) 금빛 번짐을 가볍게 한다.
 // 손을 떼면 두 표시를 모두 지워, 멈춘 화면 모양은 지금과 완전히 같다.
 const setBusy=(on)=>{const v=on?'1':null;
  if(v===host.getAttribute('data-lt-busy'))return;
  if(v)host.setAttribute('data-lt-busy','1');else host.removeAttribute('data-lt-busy');};
 // #952 후속(261120): 멈춤·재생 모두 이미 걸린 WAAPI 궤도·떠 있음 애니메이션의 재생 속도를 즉시 맞춘다.
 // syncMotion을 부르지 않으면(수정 전) 스위치를 꺼도 rAF 루프만 멈추고 애니메이션은 계속 돌아 카드가 멈추지 않았다.
 // 다만 유효 상태(animRunning)가 실제로 바뀔 때만 맞춘다 — 동작 줄이기 기기에서 셸이 뜰 때 보내는
 // lt41-motion(paused:false)이 syncMotion의 떠 있음 위상 리셋을 새로 발동시켜 #535가 재던 자리를 바꾸지 않게.
 const setMotionPaused=(next)=>{const running=animRunning();paused=!!next;if(paused)neutralizePointer();if(animRunning()!==running)syncMotion();schedule();};
 function rememberCard(c){if(!demo)remember(storage,c.treeId,c.id);}
 // #394 1번: 상세 창에서 열기 전 목록 순서(트리 고르기 포함) 그대로 앞·뒤로 옮겨 본다.
 // 목록에 없는 순간(예시 채움 카드 등)은 옮겨 볼 목록이 없으니 화살표를 두지 않는다.
 let detailMoment=null;
 // 261117 대표 검수: 대화상자를 연 입력 경로(마우스·키보드)를 기록한다 — 마우스로 열었으면 닫기 단추의
 // 초점 테두리를 그리지 않고(#795 계정 메뉴와 같은 방식), 키보드로 열었으면 테두리가 보인다.
 let lastInputWasKeyboard=false;
 shadow.addEventListener('keydown',()=>{lastInputWasKeyboard=true;},{capture:true,signal});
 shadow.addEventListener('pointerdown',()=>{lastInputWasKeyboard=false;},{capture:true,signal});
 const openDialogCentered=(d)=>{d.dataset.ltOpenedBy=lastInputWasKeyboard?'keyboard':'mouse';d.showModal();};
 function stepDetail(dir){const order=listRows();const at=order.findIndex(x=>x.key===detailMoment?.key);const next=order[at+dir];if(!next)return;renderDetail(next);dialog.querySelector(dir<0?'[data-do=prev]':'[data-do=next]')?.focus();}
 function focus(c){if(!c)return;if(!c.example){onSelect(c.id);rememberCard(c);}if(!dialog.open)opener=shadow.activeElement;renderDetail(c);}
 function renderDetail(c){detailMoment=c;
  const children=c.example?[all.find(x=>x.id===c.next),all.find(x=>x.id===c.branch)].filter(Boolean):demo?[all.find(x=>x.id===c.next),all.find(x=>x.id===c.branch)].filter(Boolean):poolFor(c).filter(x=>x.treeId===c.treeId&&x.parentId===c.id);
  const link = mediaLinkView(c.url);
  // #393: 순간 상세 창도 같은 틀 규칙 — 세로 영상(쇼츠·세로 비율 정보)은 세로 틀, 썸네일 잘림 없음.
  const vertical=!!(c.url&&globalThis.LTMedia?.verticalVideo?.(c.url,c.mediaMetadata));
  const order=listRows(),at=order.findIndex(x=>x.key===c.key),hasNav=at>=0&&order.length>1;
  const atStart=hasNav&&at===0,atEnd=hasNav&&at===order.length-1;
  // #394 3번: 제목은 정리 화면과 같은 규칙(momentHeadTitle) — 자동 기본 문구("youtube.com에서 간직한 순간")는
  // 표시하지 않고, 직접 쓴 제목이 없으면 마음 한마디를 큰 글씨로 쓴다(둘 다 없으면 제목 칸을 비워 둔다).
  const head=momentHeadTitle(c,titleMode);
  const nav=hasNav?`<button class="detail-nav detail-nav--prev" data-do="prev" aria-label="이전 순간"${atStart?' disabled':''}>←</button><button class="detail-nav detail-nav--next" data-do="next" aria-label="다음 순간"${atEnd?' disabled':''}>→</button>${atStart||atEnd?`<p class="detail-nav-note" role="status">${atStart?'처음 순간':'마지막 순간'}</p>`:''}`:'';
  dialog.innerHTML=`<button class="close" data-do="close" aria-label="닫기">×</button>${nav}<div class="detail-grid"><div data-lt-thumb-host>${c.image?`<img class="detail-image${vertical?' detail-image--vertical':''}" src="${esc(c.image)}" alt="${esc(head.main||c.title)}"${thumbFallbackAttrs(c,{candidates:c.thumbCandidates||[c.image],writable:!demo&&!c.example,variant:'detail'})} referrerpolicy="no-referrer">`:(!demo&&!c.example&&needsFallbackCard(c,{autoLoad:false})?fallbackCardMarkup(c,{writable:!demo&&!c.example,variant:'detail',dateStyle}):`<div class="detail-paper">${esc(c.note)}</div>`)}</div><div class="detail-copy"><small>${demo||c.example?'감상 예시':esc(c.subject||'내 순간')} · ${esc(c.emotion)}</small>${head.main?`<h2>${esc(head.main)}</h2>`:''}${head.sub?`<span class="videoTitle">▶ ${esc(head.sub)}</span>`:''}<small>${esc(dateOf(c))}${(demo||c.example)&&c.type==='video'?' · 영상 포스터 예시':''}</small>${c.startSeconds!==undefined&&c.startSeconds!==null?`<small class="detail-range">기억할 구간 ${esc(formatRange(c.startSeconds,c.endSeconds))}</small>`:''}${head.memoAsMain?'':`<p>${esc(c.note)}</p>`}${c.relation?`<small>이전 순간에서 이어진 이유</small><p>${esc(c.relation)}</p>`:''}<div class="detail-buttons"><button data-do="book" title="${BOOK_IS_READING}">${READ_BOOK}</button><button data-do="work">${demo||c.example?NEW_TREE:VIEW_TREE}</button>${link ? (link.kind === 'invalid' ? `<span class="media-unrecognized" role="note">${esc(link.text)}</span>` : `<a href="${esc(link.href)}" target="_blank" rel="noopener noreferrer">${esc(link.text)} ↗</a>`) : ''}${homePin&&!demo&&!c.example?`<button data-do="home-pin">${homePin.pinned(c)?'내리기':'첫 화면에 걸기'}</button>`:''}</div>${children.length?`<p>다음으로 이어진 순간</p><div class="detail-buttons">${children.map(x=>`<button data-next="${esc(x.key)}">${esc(mainOf(x))}</button>`).join('')}</div>`:'<p>다음 이야기를 기다리는 순간이에요.</p>'}</div></div>`;
  // #1010: 예시(데모) 카드의 '책 읽기'도 onOpen으로 새지 않게 !demo를 더한다 — openBook이 기존 lt41-example 경로로 예시 기억책을 연다.
  dialog.querySelector('[data-do=book]').onclick=()=>{dialog.close();if(onOpen&&!c.example&&!demo)onOpen(c);else actions.openBook(c.treeId,c.id,demo)};
  dialog.querySelector('[data-do=work]').onclick=()=>{dialog.close();demo?actions.requestMoment('new'):actions.openWorkspace(c.treeId,c.id)};
  // 261116 PR 2: '첫 화면에 걸기' — 홈이 넘겨준 배선(homePin.toggle)으로 계정 설정에 걸고, 걸려 있으면 '내리기'.
  dialog.querySelector('[data-do=home-pin]')?.addEventListener('click',()=>homePin?.toggle?.(c));
  dialog.querySelector('[data-do=prev]')?.addEventListener('click',()=>stepDetail(-1));
  dialog.querySelector('[data-do=next]')?.addEventListener('click',()=>stepDetail(1));
  if(!dialog.open)openDialogCentered(dialog);else dialog.querySelector('.close').focus();
 }
 // #394: 순간 목록 — 모든 트리의 순간을 최근 순으로, 위에서 트리를 골라 본다([전체][모아둔 순간][트리1]…).
 // 제목은 정리 화면과 같은 규칙(momentHeadTitle): 자동 기본 문구는 표시하지 않고 마음 한마디를 큰 글씨로 쓴다.
 function index(options={}){opener=shadow.activeElement;
  // #776가 쓸 문(2026-11-17): 목록을 열 때 트리 칩·고르기·안내를 정해 받을 수 있다(인자만 열어 두었다).
  if(options.treeFilter!==undefined)listFilter=options.treeFilter||'all';
  if(options.picking!==undefined)picking=options.picking===true;
  if(options.notice!==undefined)indexNotice=options.notice||null;
  if(!canMoveMoments())picking=false;
  // #678 후속(꼬리표 걸러 보기): 고른 꼬리표가 모두 붙은 순간만 남긴다(그리고). 꼬리표가 하나도 없는
  // 트리에서는 꼬리표 줄 자체가 숨는다(facets가 비면 tagRowMarkup이 빈 문자열).
  const rowsAll=listRows();
  const rows=tagSelected.size?filterMomentsByTags(rowsAll,[...tagSelected]):rowsAll;
  const facets=tagFacets(rowsAll);
  const TAG_PREVIEW=3;
  const tagRowMarkup=()=>{
   if(!facets.length)return '';
   const picked=[...tagSelected].map(key=>{
    const found=facets.flatMap(f=>f.tags.map(t=>({label:f.label,tag:t}))).find(x=>x.tag.key===key);
    return '<button type="button" class="indexTagPicked" data-tag-pick="' + esc(key) + '">' + esc(found?found.label+' · ':'') + esc(found?found.tag.value:key) + ' ✕</button>';
   }).join('');
   const kinds=facets.map(f=>{
    const kindId=f.kindId||'plain';
    const expanded=tagExpanded.has(kindId);
    const shown=expanded?f.tags:f.tags.slice(0,TAG_PREVIEW);
    const hidden=f.tags.length-shown.length;
    const chips=shown.map(tag=>'<button type="button" class="indexTagChip' + (tagSelected.has(tag.key)?' active':'') + '" data-tag-key="' + esc(tag.key) + '" aria-pressed="' + tagSelected.has(tag.key) + '">' + esc(f.label + ' · ' + tag.value) + ' ' + tag.count + '</button>').join('');
    const more=hidden>0?'<button type="button" class="indexTagMore" data-tag-more="' + esc(kindId) + '">더보기 ' + hidden + '</button>':'';
    return '<div class="indexTagKind"><span class="indexTagKindName">' + esc(f.label) + '</span><span class="indexTagChips">' + chips + more + '</span></div>';
   }).join('');
   const pickedRow=picked?'<div class="indexTagPickedRow" role="group" aria-label="고른 꼬리표">' + picked + '</div>':'';
   return '<div class="index-tag-filter"><p class="indexTagTitle">꼬리표로 찾기</p>' + pickedRow + kinds + '</div>';
  };
  const chipTrees=orderedTrees(momentList?.trees||[],chipOrder);
  const chipDots=t=>t.color?`<span class="lt-tree-dot" style="--lt-tree-dot:${t.color}" aria-hidden="true"></span>`:'';
  const filterChips=chipTrees.map(t=>`<button class="indexFilter${listFilter===t.id?' active':''}" data-tree-filter="${esc(t.id)}" aria-pressed="${listFilter===t.id}">${chipDots(t)}${esc(t.label)}</button>`).join('');

  const filterMarkup=filterChips?`<div class="index-filters" role="group" aria-label="트리별로 보기"><button class="indexFilter${listFilter==='all'?' active':''}" data-tree-filter="all" aria-pressed="${listFilter==='all'}">전체</button>${filterChips}</div>`:'';
  const heading=listFilter==='all'?(demo?'예시 순간':'나의 순간'):(momentList?.trees||[]).find(t=>t.id===listFilter)?.label||'나의 순간';
  const treeColorOf=treeId=>(momentList?.trees||[]).find(t=>t.id===treeId)?.color||'';
  const treeTag=c=>c.treeLabel?'<span class="lt-tree-tag"><span class="lt-tree-dot" style="--lt-tree-dot:'+treeColorOf(c.treeId)+'" aria-hidden="true"></span>'+esc(c.treeLabel)+'</span>':'';
  const rowOf=c=>{
   const head=momentHeadTitle(c,titleMode).main;
   const thumb=c.image?`<span class="index-row-thumb"><img src="${esc(c.image)}" alt=""${thumbFallbackAttrs(c,{candidates:c.thumbCandidates||[c.image],mode:'thumb-slot'})} referrerpolicy="no-referrer" loading="lazy" decoding="async"></span>`:'';
   let inner;
   if(!head&&!demo&&!c.example){
    inner=`<button data-next="${esc(c.key)}" data-lt-moment-row class="index-row-card">${thumb}<span class="index-row-body">${fallbackCardMarkup(c,{writable:!demo&&!c.example,variant:'row',dateStyle})}${listFilter==='all'?treeTag(c):''}</span></button>`;
   }else{
    inner=`<button data-next="${esc(c.key)}" data-lt-moment-row>${thumb}<span class="index-row-body">${head?esc(head):''}<small class="lt-row-unavailable" data-lt-row-unavailable hidden>${VIDEO_UNAVAILABLE_TEXT}</small><small>${listFilter==='all'&&c.treeLabel?treeTag(c)+' · ':''}${esc(dateOf(c))} · ${esc(c.emotion)}</small></span></button>`;
   }
   // 고르기 모드(2026-11-17): 행 왼쪽 고르기 칸 + 행별 '옮기기' 단추(키보드 길). 예시 카드는 옮기지 못한다.
   if(picking&&canMoveMoments()&&!c.example){
    return `<span class="index-row-line"><button type="button" class="indexPick" data-pick="${esc(c.key)}" aria-pressed="${pickedKeys.has(c.key)?'true':'false'}" aria-label="${pickedKeys.has(c.key)?'고른 순간 — 해제':'순간 고르기'}">${pickedKeys.has(c.key)?'✓':''}</button>${inner}<button type="button" class="indexMoveOne" data-move-one="${esc(c.key)}">옮기기</button></span>`;
   }
   return inner;

  };
  // 옮기기 머리 도구(고르기 전환·고른 것 옮기기)와 안내 줄(옮긴 뒤 되돌리기).
  const headTools=canMoveMoments()&&rows.length?`<span class="index-head-tools"><button type="button" class="indexPickToggle" data-pick-toggle="1" aria-pressed="${picking?'true':'false'}">${picking?'고르기 끝':'고르기'}</button>${picking&&pickedKeys.size?`<button type="button" class="indexMovePicked" data-move-picked="1">옮기기(${pickedKeys.size})</button>`:''}</span>`:'';
  const noticeMarkup=(indexNotice&&canMoveMoments())?`<div class="index-move-feedback" role="status"><span>${esc(indexNotice.text)}</span>${indexNotice.undo&&indexNotice.undo.pairs&&indexNotice.undo.pairs.length?`<button type="button" class="index-move-undo" data-move-undo="1">되돌리기</button>`:''}</div>`:'';
  // 옮기기 메뉴: 대상 트리 목록(출발 트리는 뺀다) — 행별 '옮기기'·길게 누르기·고른 것 옮기기가 같은 메뉴를 연다.
  const moveMenu=()=>{
   if(!moveMenuFor)return '';
   const rowsFor=moveMenuFor==='picked'?rows.filter(c=>pickedKeys.has(c.key)&&!c.example):[findMoment(moveMenuFor)].filter(Boolean).filter(c=>c&&!c.example);
   const sources=new Set(rowsFor.map(c=>c.treeId));
   const targets=chipTrees.filter(t=>!sources.has(t.id));
   const what=moveMenuFor==='picked'?`고른 순간 ${rowsFor.length}개`:(()=>{const c=findMoment(moveMenuFor);return c?`‘${momentHeadTitle(c,titleMode).main||c.treeLabel}’ 순간`:'';})();
   if(!targets.length||!rowsFor.length)return `<div class="index-move-menu" role="menu"><p class="index-empty">옮길 다른 트리가 없어요.</p><button type="button" class="indexMoveCancel" data-move-cancel="1">그만두기</button></div>`;
   return `<div class="index-move-menu" role="menu" aria-label="${esc(what)} 옮길 트리"><p class="indexTagTitle">${esc(what)} 옮길 트리</p>${targets.map(t=>`<button type="button" class="indexMoveTarget" data-move-to="${esc(t.id)}" data-move-label="${esc(t.label)}">${chipDots(t)}${esc(t.label)}</button>`).join('')}<button type="button" class="indexMoveCancel" data-move-cancel="1">그만두기</button></div>`;
  };
  dialog.innerHTML=`<button class="close" data-do="close" aria-label="닫기">×</button><div class="index-list"><h2>${esc(heading)} · ${rows.length}${headTools}</h2>${noticeMarkup}${filterMarkup}${tagRowMarkup()}${rows.length?rows.map(rowOf).join(''):`<p class="index-empty">${listFilter==='all'?'아직 순간이 없어요.':'이 트리에 아직 순간이 없어요.'}</p>`}${moveMenu()}</div>`;
  dialog.querySelectorAll('[data-tree-filter]').forEach(b=>b.onclick=()=>{listFilter=b.dataset.treeFilter||'all';tagSelected.clear();tagExpanded.clear();moveMenuFor=null;index();});
  // — 옮기기 배선(2026-11-17) —
  dialog.querySelectorAll('[data-pick-toggle]').forEach(b=>b.onclick=()=>{picking=!picking;if(!picking)pickedKeys.clear();moveMenuFor=null;index();});
  dialog.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{const key=b.dataset.pick||'';if(pickedKeys.has(key))pickedKeys.delete(key);else pickedKeys.add(key);index();});
  dialog.querySelectorAll('[data-move-picked]').forEach(b=>b.onclick=()=>{moveMenuFor='picked';index();});
  dialog.querySelectorAll('[data-move-one]').forEach(b=>b.onclick=()=>{moveMenuFor=b.dataset.moveOne||'';index();});
  dialog.querySelectorAll('[data-move-cancel]').forEach(b=>b.onclick=()=>{moveMenuFor=null;index();});
  dialog.querySelectorAll('[data-move-to]').forEach(b=>b.onclick=()=>{
   const toTreeId=b.dataset.moveTo||'',targetLabel=b.dataset.moveLabel||'';
   const rowsFor=moveMenuFor==='picked'?rows.filter(c=>pickedKeys.has(c.key)&&!c.example):[findMoment(moveMenuFor)].filter(Boolean).filter(c=>c&&!c.example);
   const ids=rowsFor.map(c=>c.id).filter(Boolean);
   const pairs=rowsFor.map(c=>({id:c.id,fromTreeId:c.treeId}));
   moveMenuFor=null;
   if(!ids.length){index();return;}
   const notice=movedNotice({targetLabel});
   actions.moveMoments({momentIds:ids,pairs,toTreeId,targetLabel,noticeText:notice.text});
   picking=false;pickedKeys.clear();
   index();
  });
  dialog.querySelectorAll('[data-move-undo]').forEach(b=>b.onclick=()=>{
   const undo=indexNotice&&indexNotice.undo;
   indexNotice=null;
   if(undo&&undo.pairs&&undo.pairs.length){
    const label=(momentList?.trees||[]).find(t=>t.id===undo.toTreeId)?.label||'';
    const notice=movedNotice({targetLabel:label});
    actions.moveMoments({pairs:undo.pairs,toTreeId:undo.toTreeId,targetLabel:label,noticeText:notice.text});
   }
   index();
  });
  // — 끌기(2026-11-17): 칩을 끌어 순서를 바꾸고, 행을 칩에 끌어다 옮긴다. 마우스는 바로, 손가락은 길게 누른 뒤(행은 메뉴로).
  let dragState=null;
  const chipAt=(x,y)=>[...dialog.querySelectorAll('[data-tree-filter]')].find(b=>{const r=b.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;})||null;
  const clearDrop=()=>dialog.querySelectorAll('.indexFilter.drop-ok').forEach(b=>b.classList.remove('drop-ok'));
  dialog.addEventListener('pointerdown',e=>{
   if(e.button)return;
   if(e.target.closest('.index-move-menu')||e.target.closest('[data-move-undo]')||e.target.closest('[data-pick-toggle]')||e.target.closest('[data-move-picked]')||e.target.closest('[data-pick]')||e.target.closest('[data-move-one]'))return;
   const chip=e.target.closest('[data-tree-filter]');
   const rowBtn=e.target.closest('[data-lt-moment-row]');
   if(chip){dragState={kind:'chip',chip,sx:e.clientX,sy:e.clientY,started:false,long:false,cancelled:false,pointerId:e.pointerId,timer:canMoveMoments()?setTimeout(()=>{dragState&&(dragState.long=true);},450):null};return;}
   if(rowBtn&&canMoveMoments()&&!picking){
    const row=findMoment(rowBtn.dataset.next);
    if(!row||row.example)return;
    suppressClickKey='';
    dragState={kind:'row',row,sx:e.clientX,sy:e.clientY,started:false,long:false,cancelled:false,pointerId:e.pointerId,timer:setTimeout(()=>{if(dragState){dragState.long=true;suppressClickKey=row.key;}},450)};
   }
  },{signal});
  dialog.addEventListener('pointermove',e=>{
   if(!dragState||e.pointerId!==dragState.pointerId)return;
   const dist=Math.hypot(e.clientX-dragState.sx,e.clientY-dragState.sy);
   if(!dragState.started&&!dragState.long&&dist>8&&e.pointerType!=='mouse'){if(dragState.timer)clearTimeout(dragState.timer);dragState.cancelled=true;} // 손가락이 흐르면 길게 누르기 취소(스크롤) — 마우스 끌기는 바로 시작한다
   if(dragState.cancelled)return;
   if(!dragState.started&&(dragState.long?dist>10:dist>6)){dragState.started=true;dialog.classList.add('lt-dragging');}
   if(!dragState.started)return;
   clearDrop();
   const chip=chipAt(e.clientX,e.clientY);
   if(chip&&chip!==dragState.chip&&!(dragState.kind==='row'&&chip.dataset.treeFilter==='all'))chip.classList.add('drop-ok');
  },{signal});
  const endDrag=e=>{
   if(!dragState||e.pointerId!==dragState.pointerId)return;
   if(dragState.timer)clearTimeout(dragState.timer);
   const {kind,chip:srcChip,row,started,long}=dragState;
   dialog.classList.remove('lt-dragging');
   clearDrop();
   const chip=chipAt(e.clientX,e.clientY);
   dragState=null;
   // 손가락 길게 누르기(끌지 않음): 그 행의 옮기기 메뉴를 연다
   if(kind==='row'&&long&&!started){moveMenuFor=row.key;index();return;}
   if(!started||!chip)return;
   if(kind==='chip'){
    const from=srcChip.dataset.treeFilter||'',to=chip.dataset.treeFilter||'';
    if(!from||!to||from==='all'||to==='all'||from===to){index();return;}
    const order=chipTrees.map(t=>t.id);
    const fromIdx=order.indexOf(from),toIdx=order.indexOf(to);
    if(fromIdx>=0&&toIdx>=0){order.splice(toIdx,0,order.splice(fromIdx,1)[0]);chipOrder=order;actions.saveTreeChipOrder(chipOrder);}
    index();return;
   }
   // 행을 칩에 끌어다 놓기 — 그 행(고르기 중이면 고른 것들)을 그 트리로 옮긴다
   const toTreeId=chip.dataset.treeFilter||'';
   if(!toTreeId||toTreeId==='all'){index();return;}
   const target=(momentList?.trees||[]).find(t=>t.id===toTreeId);
   const group=picking?rows.filter(c=>pickedKeys.has(c.key)&&!c.example):[row].filter(c=>c&&!c.example);
   const ids=group.map(c=>c.id).filter(Boolean);
   if(!ids.length){index();return;}
   const pairs=group.map(c=>({id:c.id,fromTreeId:c.treeId}));
   const notice=movedNotice({targetLabel:target?.label||''});
   actions.moveMoments({momentIds:ids,pairs,toTreeId,targetLabel:target?.label||'',noticeText:notice.text});
   picking=false;pickedKeys.clear();
   index();
  };
  dialog.addEventListener('pointerup',endDrag,{signal});
  dialog.addEventListener('pointercancel',e=>{if(dragState&&e.pointerId===dragState.pointerId){if(dragState.timer)clearTimeout(dragState.timer);dragState=null;dialog.classList.remove('lt-dragging');clearDrop();}},{signal});
  // 꼬리표 칩: 누르면 고르고(그리고 걸러 보기), 다시 누르면 푼다. 더보기는 종류의 나머지 칩을 펼친다.
  dialog.querySelectorAll('[data-tag-key]').forEach(b=>b.onclick=()=>{const key=b.dataset.tagKey||'';if(tagSelected.has(key))tagSelected.delete(key);else tagSelected.add(key);index();});
  dialog.querySelectorAll('[data-tag-more]').forEach(b=>b.onclick=()=>{const kind=b.dataset.tagMore||'plain';if(tagExpanded.has(kind))tagExpanded.delete(kind);else tagExpanded.add(kind);index();});
  dialog.querySelectorAll('[data-tag-pick]').forEach(b=>b.onclick=()=>{tagSelected.delete(b.dataset.tagPick||'');index();});
  dialog.querySelector('[data-tag-clear]')?.addEventListener('click',()=>{tagSelected.clear();index();});
  openDialogCentered(dialog);}
 // #426: 최근 순간 카드 — 본문을 누르면(클릭·Enter·Space) 그 순간을 연다(궤도 카드와 같은 onOpen 경로). ▶는 카드 안 재생/정지로 구분하고, 플레이어는 누른 뒤에만 만든다(첫 화면 열 때 YouTube 요청 0건).
const openRecent=()=>{if(!recentMoment)return;if(onOpen&&!recentMoment.example){onOpen(recentMoment);return;}actions.openBook(recentMoment.treeId,recentMoment.id,demo);};
let recentFrame=null;
const toggleRecentPlay=btn=>{if(!recentMoment)return;const card=shadow.querySelector('.recent-card');if(!card)return;const media=card.querySelector('.recent-media');if(!media)return;if(recentFrame){recentFrame.remove();recentFrame=null;media.querySelector('img')?.removeAttribute('hidden');btn.setAttribute('aria-label','바로 재생');const glyph=btn.querySelector('span');if(glyph)glyph.textContent='▶';return;}
 const id=youtubeIdFrom(recentMoment.url)||(globalThis.LTMedia?.describe?.(recentMoment.url)||{}).videoId;
 const embed=id?embedUrl(id):null;
 if(!embed)return;
 const frame=document.createElement('iframe');frame.className='recent-frame';frame.src=embed;frame.title=mainOf(recentMoment)||'YouTube 영상';frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';frame.allowFullscreen=true;frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');media.querySelector('img')?.setAttribute('hidden','');media.append(frame);recentFrame=frame;btn.setAttribute('aria-label','정지');const glyph=btn.querySelector('span');if(glyph)glyph.textContent='■';};
shadow.addEventListener('click',e=>{const play=e.target.closest('[data-recent-play]');if(play){e.stopPropagation();toggleRecentPlay(play);return;}const b=e.target.closest('button');if(!b){if(!e.target.closest?.('[data-lt-title-edit]')&&e.target.closest?.('[data-do=recent]'))openRecent();return;}if(b.dataset.next){if(suppressClickKey&&suppressClickKey===b.dataset.next){suppressClickKey='';return;}if(picking){const key=b.dataset.next;if(pickedKeys.has(key))pickedKeys.delete(key);else pickedKeys.add(key);index();return;}focus(findMoment(b.dataset.next));return;}switch(b.dataset.do){case'close':dialog.close();break;case'new':actions.requestMoment('new');break;case'trees':actions.navigate('trees');break;case'continue':focus(lastCard);break;case'index':index();break;case'recent':if(!e.target.closest?.('[data-lt-title-edit]'))openRecent();break;}},{signal});
 dialog.addEventListener('close',()=>{opener?.focus();syncMotion();schedule();tagSelected.clear();tagExpanded.clear();picking=false;pickedKeys.clear();moveMenuFor=null;suppressClickKey='';indexNotice=null;},{signal});
 dialog.addEventListener('close',()=>{opener?.focus();syncMotion();schedule();tagSelected.clear();tagExpanded.clear();},{signal});
 // 목록 창도 바깥(동영상 뒤 배경)을 누르면 닫힌다(2026-11-16 대표 지적) — 상세 창은 '맨 위 창 하나' 규칙 그대로.
 dialog.addEventListener('click',event=>{if(event.target===dialog&&!dialog.querySelector('.detail-grid'))dialog.close();},{signal});

 // #394 1번: 상세 창에서 화살표 키와(모바일) 옆으로 밀기로도 앞·뒤 순간으로 옮겨 간다.
 dialog.addEventListener('keydown',e=>{if(!detailMoment)return;if(e.key==='ArrowLeft'){e.preventDefault();stepDetail(-1);}else if(e.key==='ArrowRight'){e.preventDefault();stepDetail(1);}},{signal});
 let detailSwipe=null;
 dialog.addEventListener('touchstart',e=>{if(!detailMoment)return;const t=e.touches[0];detailSwipe={x:t.clientX,y:t.clientY};},{passive:true,signal});
 dialog.addEventListener('touchend',e=>{if(!detailSwipe||!detailMoment)return;const t=e.changedTouches[0];const dx=t.clientX-detailSwipe.x,dy=t.clientY-detailSwipe.y;detailSwipe=null;if(Math.abs(dx)>48&&Math.abs(dx)>Math.abs(dy)*1.5)stepDetail(dx<0?1:-1);},{passive:true,signal});
 const disposeThumb=mountThumbFallback(shadow,{
  isReadOnly:()=>demo,
  onEditTitle:({momentId,treeId})=>{
   if(dialog.open)dialog.close();
   if(typeof window!=='undefined'&&window.parent&&window.parent!==window){
    window.parent.postMessage({type:'lt41-write',mode:'edit',treeId:treeId||'',momentId,focusTitle:true},location.origin);
   }
  }
 });
 track(disposeThumb);
 checkRecentVideo(shadow.querySelector('.recent-card'));
performance.mark('m2'); const elements=cards.map(c=>{const b=document.createElement('button');b.className=`card ${c.type} ${c.sizeClass}${c.example?' example':''}${c.source==='mine'?' mine':''}`;b.style.setProperty('--fit',c.fitMode==='contain'?'contain':'cover');;b.dataset.example=c.example?'1':'';b.setAttribute('tabindex','-1');b.setAttribute('aria-hidden','true');b.innerHTML=`<span class="lt-move"><span class="lt-lift"><span class="surface" data-lt-thumb-host>${c.image?`<img src="${esc(c.image)}" alt="" draggable="false"${thumbFallbackAttrs(c,{candidates:c.thumbCandidates||[c.image],writable:!demo&&!c.example,variant:'orbit'})}${c.youtubeThumb?' referrerpolicy="no-referrer" loading="lazy" decoding="async"':''}>`:(!demo&&!c.example&&needsFallbackCard(c,{autoLoad:false})?fallbackCardMarkup(c,{writable:!demo&&!c.example,variant:'orbit',dateStyle}):`<div class="memoKicker">${esc(dateOf(c))}</div><div class="memoText">${esc(mainOf(c))}</div><div class="memoFoot">${esc(c.emotion)}</div>`)}</span></span></span>${c.youtubeThumb&&c.image?'<span class="playGlyph" aria-hidden="true">▶</span>':''}${c.first?'<div class="firstMark">FIRST</div>':''}<div class="caption"><span>${esc(mainOf(c))}${subMarkup(c)}</span></div>`;
 // #593: 바깥 .card 는 자리(궤도 애니메이션)만 맡는다 — 실제로 눌리고 초점을 받는 것은 안쪽 .surface 다(중첩 단추 방지).
 const surface=b.querySelector('.surface'),surfaceLabel=b.querySelector('.caption span')?.textContent||mainOf(c)||'순간';
 surface.setAttribute('role','button');surface.setAttribute('tabindex','0');surface.setAttribute('aria-label',surfaceLabel);
 surface.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'&&!drag)hoveredCard=surface;},{signal});
 surface.addEventListener('pointerleave',()=>{if(hoveredCard===surface)hoveredCard=null;},{signal});
 // #1010: 예시(데모) 카드 누름은 궤도의 자세히 보기 창으로 돌려 놓는다 — onOpen은 내·공개 카드용이다.
 // 데모 표본에는 example 자리표가 없어(onOpen&&!c.example) onOpen으로 새어 openMine이 조용히 무시됐다(눌러도 무반응).
 // 창의 '책 읽기'는 기존 lt41-example 경로로 예시 기억책을 연다(home-actions openBook).
 surface.addEventListener('click',e=>{if(e.target?.closest?.('[data-lt-title-edit]'))return;if(e.detail===0||moved<9){if(onOpen&&!c.example&&!demo){onOpen(c);return;}focus(c)}},{signal});
 world.append(b);return b;});performance.mark('m3');
 // #429 2/2: 카드 기본 폭·높이와 안전 구역은 둘째 번에 한 번만 잰다. 첫 그리기에서 강제 레이아웃을 하면
 // 뼈대 완성(DOMContentLoaded)이 그 만큼 늦어진다(#400 뼈대 완성 보호 — 첫 그리기는 밀어내기 없이 그린다).
 let layoutBox=null,cardSizes=null,warmups=0;
 // ── #593 애니메이션 엔진 ─────────────────────────────────────────────────────────────
 // 전에는 카드 28장의 transform·filter·z-index 를 매 프레임 JS 로 다시 썼다(실측 #586: 스타일 재계산 ~1000ms/s).
 // 이제 유휴에는 카드마다 걸어 둔 애니메이션(WAAPI)만 돈다. JS 는 배치가 바뀌는 사건(창 크기·좁은 화면 대역·
 // 안전 구역·예시 장수·끌기)에만 카드 자리를 쓴다.
 //  · .card      — 궤도(타원 위 자리·깊이 배율·기울기·밝기·z-index). 카드마다 표본 48개.
 //  · .lt-lift   — 떠 있음(#535: 11·18px, 주기 11~16.1초). .card 와 다른 층이라 궤도와 겹치지 않는다.
 //  · .lt-move   — 패럴랙스(카메라)와 끄는 동안의 자리. 이 층이 있어야 애니메이션 transform 을 덮지 않는다.
 // 끄는 동안·관성 동안에는 .card 에 !important 로 transform 을 직접 써서 잡은 손을 그대로 따라가게 한다
 // (애니메이션보다 인라인 !important 가 이기므로 애니메이션을 껐다 켤 필요가 없다 — 끌 때 다시 트는 비용 0).
 let hoveredCard=null;
  const TWO_PI=Math.PI*2, ORBIT_MS=90000, ORBIT_STEPS=48, PHASE_STEP=.000018;
 const orbitAnims=cards.map(()=>null), floatAnims=cards.map(()=>null);
 const animRunning=()=>!paused&&!reduced&&!dialog.open&&!document.hidden;
 const floatDelay=cards.map((c,i)=>i*370);
 // 멈춤(동작 줄이기·보기 메뉴)·팝업·숨은 탭이면 애니메이션만 세운다. 멈출 때는 떠 있음 위상을 첫 자리(0·18px)로
 // 되돌려, 예전에 elapsed 가 0 에 얼어 있던 화면과 같은 자리를 보여 준다.
 const syncMotion=()=>{const rate=animRunning()?1:0;
  for(const a of orbitAnims)if(a)a.playbackRate=rate;
  floatAnims.forEach((a,i)=>{if(!a)return;a.playbackRate=rate;if(!rate){const d=a.effect.getTiming().duration;a.currentTime=floatDelay[i]%d;}});};
 // 떠 있음: 사인 한 주기를 네 점으로 나눈 표본. 카드마다 위상을 어긋내 한 덩어리로 흔들리지 않게 한다(#535).
 const floatKeyframes=()=>{const ax=11,ay=18,out=[];for(let k=0;k<=4;k++){const ph=k/4*TWO_PI;out.push({offset:k/4,translate:`${(Math.sin(ph)*ax).toFixed(2)}px ${(Math.cos(ph)*ay).toFixed(2)}px`,easing:'cubic-bezier(.37,0,.63,1)'});}return out;};
 // 궤도 키프레임: 아래 drawOnly 에서 카드 한 장에 하던 계산을 그대로 표본마다 되풀이해 굽는다.
 // 밀어내기(#429/#457/#491)도 표본마다 계산하므로, 애니메이션만 돌아도 가운데 안전 구역을 침범하지 않는다.
 const orbitKF=[];
 const orbitKeyframes=(i,w,h,warm)=>{if(orbitKF[i])return orbitKF[i];
  const c=cards[i],narrow=w<=650,cfg=(narrow?ringsNarrow:rings)[c.ring],fit=Math.min(1,w/780,h/850)*(narrow?.5:1),out=[];
  // #593: 판정 사각형을 떠 있음 폭만큼(+24·+40) 부풀려 잡으므로, 목표 구역도 그만큼 넓혀 잡는다 —
  // 부푼 만큼만 밀면 실제 카드가 그 차이만큼 안쪽(가운데 구역)에 서서 미리보기 검사에 걸린다(실측 20px).
  const padX=narrow?30:16,padY=narrow?30:20;
  const zs=safeZone?{l:safeZone.l-padX,t:safeZone.t-padY,r:safeZone.r+padX,b:safeZone.b+padY}:null;
  // 키프레임을 구울 때 placeCard 는 '지금 위상'의 판정 결과를 카드에 직접 쓴다(밝기·숨김). 굽는 동안의
  // 숨김은 화면 상태가 아니므로 되돌리고, 판정이 극단값으로 숨긴 표본은 직전 표본 자리를 그대로 쓴다.
  let last=null,preferSide=null;
  // #593: 표본 하나를 굽는다. 굽는 동안 placeCard 는 '지금 위상'의 판정 결과를 카드에 직접 쓰므로(밝기·숨김)
  // 숨김은 되돌리고, 판정이 극단값으로 숨긴 표본은 직전 표본 자리를 그대로 쓴다.
  const bake=(k)=>{const th=c.baseAngle+k/ORBIT_STEPS*TWO_PI+c.phaseOffset;let x=Math.cos(th)*cfg.rx,y=Math.sin(th)*cfg.ry+cfg.band,z=Math.sin(th+1.1+c.phaseOffset*4)*cfg.zAmp+cfg.zBase+c.zOffset;
   if(w<=650&&((!demo&&cards.length<=8)||(demo&&loggedIn===true)))return null; // 261117 대표 결정: 좁은 화면 소수 카드(≤8)는 궤도 카드를 숨긴다 — 표본 없음=noFit. 로그인 예시(mix-empty 포함)도 390에서 숨긴다(#780 후속)
   if(!demo&&cards.length<=8){const angle=i*TWO_PI/cards.length+k/ORBIT_STEPS*TWO_PI;x=Math.cos(angle)*Math.min(w*.34,420);y=Math.sin(angle)*Math.min(h*.3,250)+(i%2===0?80:-80);z=0;}
   const sc=Math.max(.18,Math.min(narrow?1.1:1.82,1050/(1050-z)));
   const at=placeCard(elements[i],c,i,th,x,y,z,sc,w,h,fit,narrow,zs,warm,preferSide||last?.side)||last;
   if(!at)return null;last=at;at.k=k;at.th=th;return at;};
  const samples=[];
  const bakeSweep=()=>{last=null;const sides={t:0,b:0};samples.length=0;
   for(let k=0;k<ORBIT_STEPS;k++){const at=bake(k);if(at){samples.push(at);if(at.side)sides[at.side]++;}}
   return sides.b>=sides.t?'b':'t';};
  // #949: 좁은 화면은 한 바퀴의 밀어내기 쪽(위/아래)을 많이 앉는 쪽으로 통일해 다시 굽는다 —
  // 표본마다 '가까운 쪽'으로 밀면 한 바퀴 경계에서 위·아래가 갈리고(실측 390 card 7: k0 위, k1 아래),
  // 부드럽게 나누는 pass 가 그 틈을 평균 내며 카드를 가운데로 끌어 들였다(CI 390 침범의 원인).
  const firstSide=bakeSweep();
  if(w<=650){preferSide=firstSide;bakeSweep();}
  // #593: 표본 사이는 브라우저가 직선으로 잇는다. 이웃 두 표본은 각각 구역 밖이어도 그 사이 직선이 가운데
  // 구역을 스칠 수 있다(미리보기 검사에서 1장 침범으로 잡혔다). 판정 사각형을 선형 보간해 보고 걸리는
  // 구간은 가운데를 다시 굽는다 — 두 번 접으면 최대 1/4 표본 간격까지 촘촘해진다.
  const lerpBox=(a,b,t)=>({l:a.judge.l+(b.judge.l-a.judge.l)*t,t:a.judge.t+(b.judge.t-a.judge.t)*t,r:a.judge.r+(b.judge.r-a.judge.r)*t,b:a.judge.b+(b.judge.b-a.judge.b)*t});
  const hits=(a,b)=>{if(!a.judge||!b.judge||b.k-a.k<.2)return false;
   for(const t of [.25,.5,.75]){const x=lerpBox(a,b,t);if(x.l<zs.r&&x.r>zs.l&&x.t<zs.b&&x.b>zs.t)return true;}return false;};
  for(let pass=0;pass<2;pass++){
   const next=[];let added=0;
   for(let n=0;n<samples.length;n++){next.push(samples[n]);
    const a=samples[n],b=samples[n+1];if(!b||!hits(a,b))continue;
    const at=bake((a.k+b.k)/2);if(at&&at.judge){at.side=a.side;next.push(at);added++;}
   }
   samples.length=0;for(const at of next)samples.push(at);
   if(!added)break;
  }
   // #942: 안전 구역 밀어내기가 표본 사이에서 켜질 때 자리가 10~24px 튄다 — 이웃 표본과 부드럽게 나눠 쓴다.
   for(let pass=0;pass<1;pass++){
    const smooth=samples.map((at,i)=>{const a=samples[(i-1+samples.length)%samples.length],b=samples[(i+1)%samples.length];
     return {...at,px:(a.px+2*at.px+b.px)/4,py:(a.py+2*at.py+b.py)/4,scale:(a.scale+2*at.scale+b.scale)/4};});
    samples.splice(0,samples.length,...smooth);
   }
    for(const at of samples){
     const k=at.k,th=at.th;
   // 떠 있음은 .lt-lift 가 따로 맡는다 — 여기서는 궤도 자리만 굽는다.
   // #593: transform 만 굽는다. filter·z-index 를 키프레임에 넣으면 브라우저가 애니메이션을 컴포지터에 넘기지 못하고
   // 매 프레임 스타일 재계산을 다시 한다(실측 120→418ms/s). 깊이 밝기와 순서는 배치(layout) 때 한 번만 쓴다.
   // 사선 잘림 방지: .world가 flat이라 카드가 각자 perspective를 직접 쓴다(공유 3D 공간에서 카드 평면끼리 관통하지 않게).
   out.push({offset:k/ORBIT_STEPS,transform:`perspective(1200px) translate3d(${at.px.toFixed(2)}px,${at.py.toFixed(2)}px,0) scale(${at.scale.toFixed(4)}) rotateX(${(c.tiltX+Math.sin(th)*9).toFixed(2)}deg) rotateY(${(c.tiltY+Math.cos(th)*18).toFixed(2)}deg) rotateZ(${(c.tiltZ+Math.sin(th*.6)*7).toFixed(2)}deg)`});
  }
  // #593: 48 표본이 모두 판정에서 숨겨졌다면(좁은 화면에서 띠에 못 들어가는 큰 카드) 그 카드는 이 폭에서
  // 보여 줄 자리가 없다. 예전 코드는 그런 위상마다 숨겼으므로, 여기서도 숨긴 채로 둔다(가운데 제목을 가로지르지 않게).
  noFit[i]=!out.length;
  // 첫·마지막 표본이 빠졌으면 0·1 로 늘여 붙인다 — 0 이 없으면 애니메이션 시작 구간에서 변형이 적용되지 않아
  // 카드가 제자리(화면 가운데)에 남는다.
  if(out.length){out[0].offset=0;out[out.length-1].offset=1;}
  orbitKF[i]=out;
  // 261117 대표 결정: 표본이 하나도 없으면(noFit — 좁은 화면 소수 카드 궤도 숨김 포함) 굽는 동안의 숨김을 되돌리지 않는다.
  const el0=elements[i];if(el0&&el0.classList.contains('off')&&i<cardCapFor(w)&&!noFit[i])el0.classList.remove('off');
  return out;};
 // 좁은 화면 반지름 표가 다르므로 폭 대역이 바뀔 때만 궤도 애니메이션을 다시 건다(창 크기가 바뀔 때 몇 번).
 let orbitBand=null,orbitBox=null;
 // 이 폭에서 보여 줄 자리가 없는 카드(모든 표본이 안전 구역 판정에서 숨겨짐) — 배치 때 숨긴다.
 const noFit=[];
 const startOrbit=(i,w,h,warm)=>{const el=elements[i];if(!el)return;const at=orbitAnims[i]?.currentTime;orbitAnims[i]?.cancel();
  const cfg=(w<=650?ringsNarrow:rings)[cards[i].ring];
  orbitAnims[i]=el.animate(orbitKeyframes(i,w,h,warm),{duration:Math.round(ORBIT_MS/cfg.speed),iterations:Infinity,id:'lt-orbit'});
  if(at!=null)orbitAnims[i].currentTime=at;
  orbitAnims[i].playbackRate=animRunning()?1:0;};
 const startFloat=(i)=>{const lift=elements[i]?.querySelector('.lt-lift');if(!lift)return;
  floatAnims[i]=lift.animate(floatKeyframes(),{duration:Math.round(1000*(11+(i%4)*1.7)),iterations:Infinity,id:'lt-float',delay:-floatDelay[i]});
  floatAnims[i].playbackRate=animRunning()?1:0;};
 // 애니메이션의 현재 시각을 phase 에 맞춘다(끌고 난 뒤 이어지는 자리가 튀지 않게).
 const syncOrbitTime=()=>{elements.forEach((el,i)=>{const a=orbitAnims[i],cfg=(layoutBox&&layoutBox.w<=650?ringsNarrow:rings)[cards[i].ring];if(!a)return;
  const d=a.effect.getTiming().duration;const t=(phase*cfg.speed/(TWO_PI))%1;a.currentTime=((t+1)%1)*d;});};
 // 카메라(패럴랙스): 가까운 카드가 더 크게 움직인다. 층마다 값을 넘겨 애니메이션 사이에 끼어든다.
 // 깊이별 계수에 쓰는 sc 는 카드가 궤도 한 바퀴에서 갖는 배율의 평균(카드마다 고정) — 흔들림 폭 차이는 눈에 띄지 않는다.
 let avgScales=cards.map(()=>1);
 const camWrite=()=>{elements.forEach((el,i)=>{const move=el.querySelector('.lt-move');if(!move)return;const sc=avgScales[i];
  const mx=(camera.x*(.45+sc*.3)).toFixed(2),my=(camera.y*(.38+sc*.24)).toFixed(2);
  if(move.__mx===mx&&move.__my===my)return;move.__mx=mx;move.__my=my;move.style.transform=`translate3d(${mx}px,${my}px,0)`;});};
// 카드 한 장의 자리 계산 — 궤도 키프레임을 구울 때와 끄는 동안(JS 쓰기) 모두 이 함수를 쓴다.
 // 안전 구역 밀어내기(#429/#457/#491)는 카드 사각형을 회전·원근까지 투영해 가장 얇은 쪽으로 민다.
 // warm(2번째 배치부터) 전에는 재지 않은 값(카드 크기)이 없으므로 밀어내기를 하지 않는다 — 첫 그리기 보호(#400).
 function placeCard(el,c,i,th,x,y,z,sc,w,h,fit,narrow,zs,warm,prefer){
  let outSide=null;
  // #429 2/2: 폭별 상한을 넘는 카드는 숨긴다(가로 넘침·과밀 방지). 창이 넓어지면 다시 보인다.
  if(i>=cardCapFor(w)){el.classList.add('off');return;}
  if(el.classList.contains('off'))el.classList.remove('off');
  // 카드는 left/top:50% 에 놓이므로 카드 중심을 궤도 자리에 맞추는 -90·-116(카드 기본 폭·높이의 절반)을 늘 더한다.
  let px=x*sc*(!demo&&cards.length<=8?1:fit)-90,py=y*sc*(!demo&&cards.length<=8?1:fit)-116;
  let drawShrink=1,judge=null;
  if(zs&&warm&&cardSizes&&cardSizes[i]){
   // #593: 떠 있음(±11·18px)은 .lt-lift 층이 따로 들고 있어 판정 시점의 사각형에 들어 있지 않다.
   // 흔들려도 안전 구역을 넘지 않도록 판정 사각형을 그만큼(가로 24·세로 40) 부풀려 잡는다.
   const base=cardSizes[i];const size={w:base.w+24,h:base.h+40};
   const AX=(c.tiltX+Math.sin(th)*9)*Math.PI/180,AY=(c.tiltY+Math.cos(th)*18)*Math.PI/180,AZ=(c.tiltZ+Math.sin(th*.6)*7)*Math.PI/180;
   const rX=Math.cos(AX),uX=Math.sin(AX),rY=Math.cos(AY),uY=Math.sin(AY),rZ=Math.cos(AZ),uZ=Math.sin(AZ);
   // 판정 사각형은 '실제 카드 중심' 둘레로만 부풀린다 — 부푼 크기로 중심까지 옮기면 모델이 실제보다
   // 12·20px 어긋나, 아래로 민 카드가 실제로는 20px 더 위(=가운데 구역 안)에 서게 된다(실측 4px 침범).
   const Cx0=w/2+px+base.w/2,Cy0=h/2+py+base.h/2;
   const cScale=narrow?sc*Math.max(.58,fit):sc;
   let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
   for(const corner of [[-1,-1],[1,-1],[-1,1],[1,1]]){
    const X=size.w/2*corner[0],Y=size.h/2*corner[1];
    const x1=X*rZ-Y*uZ,y1=X*uZ+Y*rZ;
    const x2=x1*rY,y2=y1,z2=-x1*uY;
    const y3=y2*rX-z2*uX,z3=y2*uX+z2*rX;
    const k=1200/(1200-z3);
    const sxp=w/2+(Cx0-w/2+x2*cScale)*k,syp=h/2+(Cy0-h/2+y3*cScale)*k;
    if(sxp<minX)minX=sxp;if(sxp>maxX)maxX=sxp;if(syp<minY)minY=syp;if(syp>maxY)maxY=syp;
   }
   if(narrow){
    const fabPad=document.documentElement.hasAttribute('data-lt-fab')?76:0;
    if(minX<0){px-=minX;maxX-=minX;minX=0;}else if(maxX>w-fabPad){const over=maxX-(w-fabPad);px-=over;maxX-=over;minX-=over;}
    if(maxX>zs.l&&minX<zs.r&&maxY>zs.t&&minY<zs.b){
     const pushT=maxY-zs.t,pushB=zs.b-minY,upFits=minY-pushT>=0,downFits=maxY+pushB<=h;
     if(!upFits&&!downFits){
      const band=Math.max(zs.t,h-zs.b),rectH=maxY-minY,rectW=maxX-minX,shrink=Math.max(.5,Math.min(1,band/rectH));
      drawShrink*=shrink;
      const cx=(minX+maxX)/2,cy=(minY+maxY)/2,nw=rectW*shrink,nh=rectH*shrink;
      minX=cx-nw/2;maxX=cx+nw/2;minY=cy-nh/2;maxY=cy+nh/2;
      const pushT2=maxY-zs.t,pushB2=zs.b-minY;
      if(pushT2<=pushB2){py-=pushT2;minY-=pushT2;maxY-=pushT2;}else{py+=pushB2;minY+=pushB2;maxY+=pushB2;}
     }
     else if(upFits&&downFits?(prefer==='b'?false:prefer==='t'?true:pushT<=pushB):upFits){py-=pushT;minY-=pushT;maxY-=pushT;outSide='t';}else{py+=pushB;minY+=pushB;maxY+=pushB;outSide='b';}
    }
    if(minY<0){py-=minY;maxY-=minY;minY=0;}else if(maxY>h){const over=maxY-h;py-=over;maxY-=over;minY-=over;}
    // 마지막 안전망: 그래도 겹치는 극단 경우는 숨긴다(침범 0 보장).
    if(maxX>zs.l&&minX<zs.r&&maxY>zs.t&&minY<zs.b){el.classList.add('off');return;}
   }
   // 261118 대표 지적 5·6번(이슈 #884): 넓은 화면에서 '가장 얇은 쪽으로 밀고 같은 쪽에 붙이는'(prefer)
   // 밀어내기는 거둔다 — 카드가 양옆에 세워져 위아래로만 출렁였고, 좌우 밀린 양이 어긋나 화면이 쏠렸다.
   // 대신 가운데 구역 중심에서 카드 쪽으로 뻗는 방사 방향으로만 벗어나게 민다 — 방향이 위상에 따라
   // 부드럽게 돌아 카드가 구역 둘레를 흐른다(원래 궤도 동작). 밀린 양은 분리 축 계산이라 침범 0 이 보장된다.
   else if(maxX>zs.l&&minX<zs.r&&maxY>zs.t&&minY<zs.b){
     // #942: 화면 중심에서 카드로 뻗는 방향으로만 민다. 가운데 구역 중심에서 밀면 화면 중심 기준
     // 겉보기 각속도가 카드마다 달라져(42~189초) 행성처럼 돌지 않는다.
     const zx=w/2,zy=h/2,cx=(minX+maxX)/2,cy=(minY+maxY)/2;
    let dx=cx-zx,dy=cy-zy;const len=Math.hypot(dx,dy)||1;dx/=len;dy/=len;
    const need=Math.max(0,Math.abs(dx)*(zs.r-zs.l)/2+Math.abs(dy)*(zs.b-zs.t)/2+Math.abs(dx)*(maxX-minX)/2+Math.abs(dy)*(maxY-minY)/2-len);
    if(need>0){px+=dx*need;py+=dy*need;}
   }
   // #593: 모델을 계산한 표본은 밀어내지 않았어도 판정 사각형을 남긴다 — 굽는 쪽이 '표본 사이 직선'이
   // 가운데 구역을 지나는지 검사할 때 쓴다(비어 있으면 그 구간을 건너뛰어 침범이 남았다).
   judge={l:minX,t:minY,r:maxX,b:maxY};
  }
  // #429 2/2: 깊이는 크기와 밝기로만 — 카드는 언제나 불투명(opacity 1, 비침 없음), blur는 쓰지 않는다.
  // #593: 밝기·순서는 궤도 키프레임이 아니라 배치 때 한 번만 쓴다(키프레임에 넣으면 컴포지터로 못 넘어간다).
  const depth=(!demo&&cards.length<=8)?1:Math.max(0,Math.min(1,(z+520)/1040));
  const fv=(0.78+0.22*depth).toFixed(3),bv=((1-depth)*2.2).toFixed(2);
  const depthFilter=`brightness(${fv}) blur(${bv}px)`;
  if(el.__b!==depthFilter){el.__b=depthFilter;el.style.filter=`brightness(${fv}) blur(${bv}px)`;}
  // 사선 잘림 방지: .world를 flat으로 바꾸고 카드가 각자 perspective를 쓰므로, 겹침 순서도 깊이(z)가 아니라
  // 화면 배율로 매긴다 — scale 큰(가까운) 카드가 위. #586 계약은 그대로: z-index는 64 단계 밴드로 묶어
  // 궤도 굽기·끌기 자리 쓰기 때만 다시 쓴다(매 프레임이 아니다) — 밴드 안의 순서 오차는 배율(깊이) 차가 작아 눈에 띄지 않는다.
  const drawScale=sc*(!demo&&cards.length<=8?1:Math.max(.58,fit))*drawShrink;
  const zv=Math.round(drawScale*1000/64)*64;if(el.__z!==zv){el.__z=zv;el.style.zIndex=zv;}
  return {px,py,scale:drawScale,side:outSide,judge};
 }
 // 배치(layout): 창 크기·안전 구역·좁은 화면 대역·예시 장수가 바뀔 때만 카드 자리를 다시 쓴다.
 function layout(){
  const w=app.clientWidth,h=app.clientHeight;
  if(safeZoneDirty){measureSafeZone();safeZoneDirty=false;}
  // #593: 카드 크기는 배치할 때마다 다시 잰다 — 첫 배치 때 크기 클래스(.lg/.sm)·글꼴이 아직 안 붙어
  // 작게 재면, 안전 구역 밀어내기가 실제보다 작은 사각형으로 계산해 카드가 가운데를 침범한다(실측 52px).
  const nominal=(w<=650?CARD_NOMINAL.narrow:CARD_NOMINAL.wide);
  cardSizes=elements.map((el,i)=>{const n=nominal[cards[i].sizeClass]||nominal.md;return {w:Math.max(el.offsetWidth||0,n[0]),h:Math.max(el.offsetHeight||0,n[1])};});
  layoutBox={w,h};
  if(warmups<1)warmups=1;
  const cap=cardCapFor(w);
  // 궤도 애니메이션 — 폭 대역(좁은 화면 반지름 표)이나 안전 구역이 바뀌면 다시 굽고, 아니면 시각만 맞춘다.
  const band=w<=650?'narrow':'wide',boxKey=`${band}|${Math.round(w)}x${Math.round(h)}|${safeZone?`${Math.round(safeZone.l)},${Math.round(safeZone.t)},${Math.round(safeZone.r)},${Math.round(safeZone.b)}`:'-'}|${warmups}|${cards.map((c)=>c.sizeClass).join('')}`;
  const needBake=orbitBox!==boxKey;
  // #593: 지금 위상의 자리로 한 번 배치해 밝기·z-index(placeCard)를 쓰고, 떠 있음 애니메이션을 건다.
  // 유휴에는 이 배치를 다시 부르지 않는다 — 프레임마다 쓰던 style 쓰기가 사라진 자리다.
  const zs=safeZone?{l:safeZone.l-(w<=650?50:12),t:safeZone.t-(w<=650?50:12),r:safeZone.r+(w<=650?50:12),b:safeZone.b+(w<=650?50:12)}:null,fit=Math.min(1,w/780,h/850)*(w<=650?.5:1),narrow=w<=650;
  // 상한을 넘는 카드도 placeCard 를 거쳐야 숨김(display:none)이 유지된다 — 건너뛰면 화면 가운데에 남는다.
  // #1010: 떠다니는 예시 카드가 숨는 좁은 화면(390 등)에서는 예시 안내 줄도 함께 숨긴다 — 카드 없는 안내만 남아 헷갈리지 않게.
  // 신규 사용자(로그아웃 예시)는 390에서도 카드가 보이므로(fewHide=false) 안내 줄이 그대로다.
  const fewHide=w<=650&&((!demo&&cards.length<=8)||(demo&&loggedIn===true)); // 261117 대표 결정: 좁은 화면 소수 카드(≤8)는 궤도 카드를 숨긴다 — 가운데 카드·단추·숫자에 집중(9장 이상은 기존 좁은 화면 궤도). 로그인 예시(mix-empty 포함)도 390에서 숨긴다(#780 후속)
  if(demo)centerNote?.toggleAttribute('data-off',fewHide);
  cards.forEach((c,i)=>{
   avgScales[i]=avgScaleOf(c,w,h);
   const cfg=(narrow?ringsNarrow:rings)[c.ring],th=c.baseAngle+phase*cfg.speed+c.phaseOffset;
   let x=Math.cos(th)*cfg.rx,y=Math.sin(th)*cfg.ry+cfg.band,z=Math.sin(th+1.1+c.phaseOffset*4)*cfg.zAmp+cfg.zBase+c.zOffset;
   if(!fewHide&&!demo&&cards.length<=8){const angle=i*Math.PI*2/cards.length+phase;x=Math.cos(angle)*Math.min(w*.34,420);y=Math.sin(angle)*Math.min(h*.3,250)+(i%2===0?80:-80);z=0;}
   const sc=Math.max(.18,Math.min(narrow?1.1:1.82,1050/(1050-z)));
   if(fewHide){elements[i].classList.add('off');noFit[i]=true;console.log('[few] hide',i,'of',cards.length);}
   else{placeCard(elements[i],c,i,th,x,y,z,sc,w,h,fit,narrow,zs,warmups);
   if(noFit[i])elements[i].classList.add('off');else if(i<cap&&!floatAnims[i])startFloat(i);}});
   if(needBake){
    // #1026 E 2단계: 카드 48장의 궤도 애니메이션 굽기를 한 프레임에 다 하지 않고 여러 프레임에 나눈다.
    // 첫 자리·모양은 위 placeCard 가 이미 다 그렸으므로(화면 변화 0), WAAPI 붙임만 뒤로 미룬다.
    elements.forEach((el,i)=>{orbitKF[i]=null;});
    const total=Math.min(cap,elements.length),chunk=12;
    for(let from=0;from<total;from+=chunk){const start=from;requestAnimationFrame(()=>{for(let i=start;i<Math.min(start+chunk,total);i++)startOrbit(i,w,h,warmups);});}
    orbitBox=boxKey;
   }
   orbitBand=band;
  camWrite();
  dragDraw();
 }
 // 카드가 궤도 한 바퀴에서 갖는 배율의 평균 — 패럴랙스 깊이 계수에만 쓴다.
 function avgScaleOf(c,w,h){
  const narrow=w<=650,cfg=(narrow?ringsNarrow:rings)[c.ring],narrowMax=narrow?1.1:1.82;let sum=0,N=16;
  for(let k=0;k<N;k++){const th=c.baseAngle+k/N*TWO_PI;const z=Math.sin(th+1.1+c.phaseOffset*4)*cfg.zAmp+cfg.zBase+c.zOffset;sum+=Math.max(.18,Math.min(narrowMax,1050/(1050-z)));}
  return sum/N;
 }
 // 끄는 동안·관성 동안의 자리 쓰기. 유휴에는 부르지 않는다 — 그때는 애니메이션만 돈다.
 let jsMode=false;
 function dragDraw(){
  if((!drag&&!glide)||!jsMode)return;
  const w=layoutBox?.w||app.clientWidth,h=layoutBox?.h||app.clientHeight;
  const zs=safeZone?{l:safeZone.l-(w<=650?50:12),t:safeZone.t-(w<=650?50:12),r:safeZone.r+(w<=650?50:12),b:safeZone.b+(w<=650?50:12)}:null,fit=Math.min(1,w/780,h/850)*(w<=650?.5:1),narrow=w<=650;
  cards.forEach((c,i)=>{const el=elements[i],cfg=(narrow?ringsNarrow:rings)[c.ring];const th=c.baseAngle+phase*cfg.speed+c.phaseOffset;
   let x=Math.cos(th)*cfg.rx,y=Math.sin(th)*cfg.ry+cfg.band,z=Math.sin(th+1.1+c.phaseOffset*4)*cfg.zAmp+cfg.zBase+c.zOffset;
   if(w<=650&&((!demo&&cards.length<=8)||(demo&&loggedIn===true))){el.classList.add('off');return;} // 261117: 좁은 화면 소수 카드 숨김 유지. 로그인 예시도 390에서 숨김(#780 후속)
   if(!demo&&cards.length<=8){const angle=i*Math.PI*2/cards.length+phase;x=Math.cos(angle)*Math.min(w*.34,420);y=Math.sin(angle)*Math.min(h*.3,250)+(i%2===0?80:-80);z=0;}
   const sc=Math.max(.18,Math.min(narrow?1.1:1.82,1050/(1050-z)));
   const at=placeCard(el,c,i,th,x,y,z,sc,w,h,fit,narrow,zs,warmups);
   if(!at)return;
   // 애니메이션 transform 을 이기려면 !important — 유휴 때 굽은 키프레임과 같은 자리 식을 쓴다(카드가 각자 perspective를 쓴다).
   el.style.setProperty('transform',`perspective(1200px) translate3d(${at.px.toFixed(2)}px,${at.py.toFixed(2)}px,0) scale(${at.scale.toFixed(4)}) rotateX(${(c.tiltX+Math.sin(th)*9).toFixed(2)}deg) rotateY(${(c.tiltY+Math.cos(th)*18).toFixed(2)}deg) rotateZ(${(c.tiltZ+Math.sin(th*.6)*7).toFixed(2)}deg)`,'important');});
 }
 const dropJsWrite=()=>{elements.forEach(el=>{el.style.removeProperty('transform');});};
 // 움직임이 멈춘 뒤: 손으로 쓴 자리를 걷고 애니메이션 시각을 phase 에 맞춘다(자리가 튀지 않게).
 const endJsMode=()=>{if(!jsMode)return;jsMode=false;dropJsWrite();syncOrbitTime();if(host.getAttribute('data-lt-busy'))setBusy(false);};
 const cameraSettling=()=>Math.abs(camera.x-cameraTarget.x)>.05||Math.abs(camera.y-cameraTarget.y)>.05;
 // #949: 판정은 그리기 전에 한다 — 카드를 놓는 그 rAF 안에서 다음 자리가 가운데 구역과 겹치는지 보고
 // 겹치면 그 프레임에서 숨긴다(clash=visibility:hidden, 사각형은 남아 구역 밖으로 나가면 다시 보인다).
 // 카드 사각형은 button.card 대신 안쪽 img(실제로 그려진 크기)로 잰다 — 3D 변환 직후 button 이 0×0 인 일이 있다.
 // 구역은 가드·시험이 같은 함수(safeZoneOf)로 실측한 값이다. 0.25초 들어온 뒤 숨기는 박동은 없다.
 // #1018: 바닥 고정 UI(셸의 링크 줄·새 소식 카드) 자리 — 떠다니는 예시 카드는 그 뒤를 지나가므로 가운데 구역처럼 숨긴다.
 // 셸은 부모 문서(같은 출처)다. 링크 묶음 상자+여유 12px, 새 소식 카드+12px을 잰다(이슈 판정 자리).
 // 넓은 화면(w>780)만 — 390 등 좁은 화면은 기존 동작 그대로(이슈: 390은 바꾸지 않는다). 예시 카드만 해당(내 카드는 그대로).
 // 0.5초마다 다시 재서 새 소식 카드가 늦게 뜨거나 링크 줄이 바뀌어도 따른다(매 프레임 재측정은 아니다 — #586 캐시).
 let bottomZones=[],bottomZonesAt=0;
 const measureBottomZones=()=>{bottomZones=[];
  if(app.clientWidth<=780)return;
  try{
   const shell=parent.document,fr=frameElement?.getBoundingClientRect(),ox=fr?.left||0,oy=fr?.top||0;
   const add=el=>{if(!el)return;const cs=parent.getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')return;const r=el.getBoundingClientRect();if(r.width<1||r.height<1)return;
    bottomZones.push({l:r.left-ox-12,t:r.top-oy-12,r:r.right-ox+12,b:r.bottom-oy+12});};
   add(shell.querySelector('.home-links'));
   add(shell.getElementById('updates-card'));
  }catch{ /* 부모 문서를 읽을 수 없으면(다른 출처 등) 바닥 구역 없음 — 가운데 가드만 돈다 */ }
 };
 const guardClash=(now)=>{if(!safeZone||!appBox)return;
  if(now-bottomZonesAt>500){measureBottomZones();bottomZonesAt=now;}
  // 구역은 measureSafeZone 이 같은 함수(safeZoneOf)로 실측해 둔 값 — 매 프레임 다시 재지 않는다(#586 rect 캐시).
  const zone={l:safeZone.l+appBox.left,t:safeZone.t+appBox.top,r:safeZone.r+appBox.left,b:safeZone.b+appBox.top};
  // 진단(#949): 가드가 본 구역을 남긴다 — CI 실패 시 시험이 잰 구역과 비교한다.
  const key=`${Math.round(zone.l)},${Math.round(zone.t)},${Math.round(zone.r)},${Math.round(zone.b)}`;
  if(host.dataset.ltGuardZone!==key)host.dataset.ltGuardZone=key;
  for(const [i,el] of elements.entries()){if(el.classList.contains('off'))continue;
   const inner=el.querySelector('.surface img')||el.querySelector('.surface')||el;
   const r=inner.getBoundingClientRect();
   // img 꾸밈 배율(transform:scale)은 카드 크기가 아니다 — 중심 기준으로 나눠 시험과 같은 사각형을 쓴다.
   let k=1;const t=getComputedStyle(inner).transform;
   if(t&&t!=='none'){const m=t.match(/^matrix\(([^)]+)\)/);if(m){const v=m[1].split(',').map(Number);k=Math.hypot(v[0],v[1])||1;}}
   const cx=r.left+r.width/2,cy=r.top+r.height/2,w=r.width/k,h=r.height/k;
   const box={l:cx-w/2,t:cy-h/2,r:cx+w/2,b:cy+h/2};
   const exampleCard=demo||!!cards[i]?.example;
   const hit=w>=2&&h>=2&&(zoneOverlapArea(zone,box)>1||(exampleCard&&bottomZones.some(z=>zoneOverlapArea(z,box)>1)));
   el.classList.toggle('clash',hit);}};
 let layoutPending=true;
 function frame(now){performance.mark('f'+warmups);raf=0;
  if(layoutPending||safeZoneDirty){layoutPending=false;layout();}
  const dt=Math.min(40,now-previous||16);previous=now;
  // #535-3: 손을 뗀 뒤 관성(초당 6%씩 줄어 0.7초쯤 미끄러짐)으로 돌다가 멈춘다. 동작 줄이기면 관성 없음.
  if(glide){phase+=glide*dt/16.7;glide*=Math.pow(.94,dt/16.7);if(Math.abs(glide)<.0004)glide=0;}
  dragDraw();
  if(!drag&&!glide)endJsMode();
  guardClash(now);
  if(!drag&&!glide&&!cameraSettling()&&!animRunning())return;
  schedule();
 }
 function schedule(){if(!raf&&!document.hidden)raf=requestAnimationFrame(frame);}
 app.addEventListener('pointerdown',e=>{if(e.target.closest('.center,.topbar'))return;drag={x:e.clientX,id:e.pointerId,at:performance.now()};moved=0;spin=0;glide=0;},{signal});
 // 261118 대표 지적 4번(이슈 #884): 누르는 것만으로는 무대를 움직이지 않는다 — 카드가 잠깐 흔들렸다.
 // 실제로 누른 채 끌 때(6px 넘을 때)만 끌기 모드로 들어가 자리를 손으로 쓴다. 카드 클릭은 원래 동작 그대로.
 app.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x;moved+=Math.abs(dx);
  if(!jsMode){if(moved>6){jsMode=true;setBusy(true);}else{drag.x=e.clientX;return;}} // 임계값 전에는 위상도 쓰지 않는다(클릭 전후 자리 변화 0)
  // #535-3: 손 움직임 대비 회전량을 화면 폭에 맞춘다. 전에는 화면 폭과 무관한 dx*.0038 이라
  // 1440에서 한 화면 폭을 끌면 313°, 390에서는 85°로 크게 달랐다. 화면 폭만큼 끌면 어디서나 172°가 되게 한다.
  const k=3.0/Math.max(360,app.clientWidth);phase+=dx*k;spin=dx*k;
  drag.x=e.clientX;drag.at=performance.now();schedule();},{signal});
  // 클릭·탭·가리키기만으로는 배경을 움직이지 않는다 — 누른 채 끌 때만 phase 가 바뀐다(#942).

 window.addEventListener('pointerup',()=>{
  // #535-3: 관성 — 손을 뗀 뒤에도 남은 속도로 살짝 미끄러지다 천천히 멈춘다(동작 줄이기면 곧바로 멈춤).
  if(drag&&!reduced&&performance.now()-drag.at<120)glide=Math.max(-.05,Math.min(.05,spin));else glide=0;
  drag=null;schedule();},{signal});window.addEventListener('pointercancel',()=>{drag=null;moved=20},{signal});window.addEventListener('resize',()=>fitNotice(),{signal});document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else{syncMotion();fitNotice();}},{signal});
 // #81 뷰포트 높이 계약은 첫 화면만 갖는다. 동기화 안내가 흐름에 얹히는 만큼만 빼고,
 // 나머지 화면(책장·기억책·작업공간)은 본문 자연 높이 뒤에 안내가 오도록 건드리지 않는다.
 // 가리는 방식(overflow)은 쓰지 않고, 안내가 자라면 첫 화면이 그 만큼 줄어든다.
 const noticeOuter=()=>{const bar=document.getElementById("sync-bar");if(!bar)return 0;const cs=getComputedStyle(bar);return Math.round(bar.getBoundingClientRect().height+parseFloat(cs.marginTop||0)+parseFloat(cs.marginBottom||0));};
 // #429 2/2·#949: 가운데 안전 구역 = 가운데 덩어리(.center: 눈썹~h1~문구~단추~숫자 줄)의 실제 사각형 + 여백 32px.
 // 구역 함수는 겹침 시험(v41-orbit-535)과 같은 것을 쓴다(public/v41/orbit-safe-zone.mjs).
 // 측정은 getBoundingClientRect 강제 레이아웃을 일으키므로 첫 프레임으로 미룬다(#400 뼈대 완성 보호).
 let safeZone=null,safeZoneDirty=true;
 const measureSafeZone=()=>{const c=shadow.querySelector('.center');if(!c){safeZone=null;return;}safeZone=safeZoneOf(c.getBoundingClientRect(),app.getBoundingClientRect());measureBottomZones();};
 const fitNotice=()=>{host.style.height=`calc(100dvh - ${noticeOuter()}px)`;appBox=app.getBoundingClientRect();safeZoneDirty=true;schedule();};
 const noticeResize=typeof ResizeObserver==="function"?new ResizeObserver(fitNotice):null;
 const barNow=document.getElementById("sync-bar");
 if(noticeResize&&barNow)noticeResize.observe(barNow);
 const barWatch=typeof MutationObserver==="function"?new MutationObserver(()=>{if(noticeResize){noticeResize.disconnect();const bar=document.getElementById("sync-bar");if(bar)noticeResize.observe(bar);}fitNotice();}):null;
 if(barWatch)barWatch.observe(document.body,{childList:true});
 // #949: 안전 구역은 실측으로 정한다 — 글꼴 도착(document.fonts.ready) 뒤와 가운데 덩어리 크기 변화
 // (ResizeObserver)마다 다시 잰다. CI(Noto CJK)와 컴1(윈도 글꼴)의 글 덩어리 높이 차이가 남지 않게 한다.
 // fonts.ready 접근은 뼈대 완성 뒤로 미룬다(#400) — 첫 그리기를 막지 않는다.
 const remeasure=()=>{safeZoneDirty=true;schedule();};
 const centerNow=shadow.querySelector('.center');
 const centerResize=typeof ResizeObserver==="function"&&centerNow?new ResizeObserver(remeasure):null;
 if(centerResize)centerResize.observe(centerNow);
 setTimeout(()=>{document.fonts?.ready?.then(remeasure).catch(()=>{});},0);
 track(()=>centerResize?.disconnect());

 track(()=>noticeResize?.disconnect());
 track(()=>barWatch?.disconnect());
 // #394: 트리 드롭다운의 "내 순간 전체 보기"로 열렸으면 순간 목록을 처음부터 연다(트리 골라진 상태).
 if(momentList?.initialOpen)index();
 fitNotice();
 // #593: 첫 배치를 한 번 하고 나면 유휴에는 프레임을 예약하지 않는다. 화면이 살아 있음을 확인하는
 // 낮은 주기 박동(초당 4회)만 남긴다 — 카드 style 은 쓰지 않으므로 스타일 재계산이 들지 않는다.
 layoutPending=true;schedule();
 track(()=>cancelAnimationFrame(raf));track(()=>orbitAnims.forEach(a=>a?.cancel()));track(()=>floatAnims.forEach(a=>a?.cancel()));track(()=>dialog.close());
 // #213 2번: 첫 화면 도구 줄의 "보기" 메뉴가 움직임을 읽고 바꾼다. dispose는 함수 그대로 둔다.
 dispose.motion={get paused(){return paused;},set(value){setMotionPaused(value);},toggle(){setMotionPaused(!paused);return paused;}};
 // 261116 PR 2: 홈(v41/home.js)이 쓰는 좁은 출구 둘. recent.set — 모드가 바뀌면 카드 한 장을 같은 결(recentMarkup)로 갈아끼운다(header가 null이면 '마지막 순간 · N일 전' 기본 문구).
 // index — 순간 목록을 특정 트리 고른 상태로 열게 한다('모아둔' 줄). 재생 중 프레임은 갈아끼우면서 함께 거둔다.
 dispose.recent={set(moment,header=null){if(!moment)return;recentMoment=moment;recentHeader=(typeof header==='string'&&header)?header:null;
  if(recentFrame){recentFrame.remove();recentFrame=null;}
  const card=shadow.querySelector('.recent-card');if(!card)return;
  const wrap=document.createElement('div');wrap.innerHTML=recentMarkup(recentMoment);
  const next=wrap.firstElementChild;if(next){card.replaceWith(next);checkRecentVideo(next);}}};
 dispose.index=(treeId='')=>{if(typeof treeId==='string'&&treeId)listFilter=treeId;index();};
 return dispose;
}
