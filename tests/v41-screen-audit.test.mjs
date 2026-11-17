// #657 ???붾㈃ 怨듯넻 寃?ш린. ?댁뒋留덈떎 ?곕줈 吏???'寃뱀묠 0쨌NaN ?놁쓬쨌湲??12px ?댁긽' 寃?щ? ?섎굹濡?紐⑥???
// 寃???⑥닔??tests/helpers/screen-audit.mjs???덈떎(?좉껸移㉱룰??ㅼ쭚 #635 洹쒖튃 ?↔?濡??섏묠쨌?섎┝ ??쓷??媛???#635 ?ｊ???湲곗???#548 ?ㅼ븣由?以꾩씠 ?꾨옒 留곹겕 以꽷뤄펻 ?⑥텛쨌???뚯떇 移대뱶瑜???? ?딆쓬 #666).
// ?붾㈃ 紐⑸줉: 泥??붾㈃(?덉떆)쨌梨?怨듭쑀 留곹겕, 留덉?留????ы븿)쨌蹂대뱶쨌吏?꽷룸몮?щ낫湲걔룹쓽寃?蹂대궡湲?李?蹂대궡湲??꽷룻썑)쨌?대뼸寃??곕굹???덈궡.
// #666???뷀븳 ?곹깭: ?뚮┝ 以??좎뒪???????덈뒗 ??泥??붾㈃쨌蹂대뱶 ??竊??⑥텛(body.lt-fab-ok)? ???뚯떇 移대뱶媛 ?④퍡 ???먮━?먯꽌 ?곕떎.
// #666 2踰덉씠 ?뷀븳 ?곹깭: 怨꾩젙 硫붾돱媛 ?대┛ ?먮━쨌?ロ엺 ?먮━??泥??몃━ ?덈궡 ??硫붾돱媛 ?대젮 ?덈뒗 ?숈븞 ?덈궡???묓? ?덇퀬 寃뱀묠 0.
// ?ш린쨌?뚮쭏: 390쨌1440 횞 諛ㅒ룹젙?? ?욎쑝濡??붾㈃ ?섎━???꾨옒 SCREENS???붾㈃?대굹 ?곹깭瑜???以??뷀븯??寃껋쑝濡??앸궦??
// #678 ?꾩냽 B媛 ?뷀븳 ?곹깭: ???섍껄 ?㏓텤??怨좎튂湲??대┝ ?????㏓텤?꾩쓽 怨좎튂湲??낅젰移맞룸떒異붋?怨좎묠) ?쒖떆媛 ?④퍡 蹂댁씠???먮━.
//
// ?뚮젮吏?臾몄젣(湲곗?????텛吏 ?딅뒗??: main?먯꽌 ?대? ?섎뒗 ?ㅽ뙣??KNOWN???붾㈃쨌??ぉ쨌?댁뒋 踰덊샇? ?④퍡 ?곴퀬,
// 洹?以꾩? 鍮④컯???꾨땲??蹂닿퀬濡??섍릿?? KNOWN???녿뒗 ?ㅽ뙣留????쒗뿕??鍮④컺寃?留뚮뱺??
// ?щ＼(Playwright chromium)???녿뒗 怨녹뿉?쒕뒗 嫄대꼫?대떎 ??CI(LT_SCREEN_AUDIT_REQUIRE=1)?먯꽌??嫄대꼫????ㅽ뙣濡?蹂몃떎.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { serve, auditPage, failuresOf } from './helpers/screen-audit.mjs';
import { createTree, addMoment } from '../public/v41/domain.mjs';

const REQUIRE = process.env.LT_SCREEN_AUDIT_REQUIRE === '1';
let chromium, skip = false;
try {
  ({ chromium } = await import('playwright'));
  if (!existsSync(chromium.executablePath())) skip = 'Playwright Chromium???놁뼱 ?붾㈃ 怨듯넻 寃?щ? 嫄대꼫?';
} catch { skip = 'playwright ?⑦궎吏媛 ?놁뼱 ?붾㈃ 怨듯넻 寃?щ? 嫄대꼫?'; }
if (REQUIRE && !existsSync(new URL('../dist/v41/home.html', import.meta.url))) skip = '鍮뚮뱶 寃곌낵媛 ?놁뼱 ?붾㈃ 怨듯넻 寃?щ? 嫄대꼫?(npx vite build ?꾩슂)';

// ???뚮젮吏?臾몄젣 紐⑸줉 ??main?먯꽌 ?대? ?섎뒗 寃?湲곗?????텛吏 ?딄퀬 ?곕줈 湲곕줉?쒕떎. 紐⑸줉 諛뽰쓽 ???ㅽ뙣留?鍮④컯???쒕떎) ??// ?뺤떇: { ?붾㈃(以?留???, ??ぉ, 李얠쓣: 以꾩뿉??李얠쓣 ?뺢퇋?? ?댁뒋 }
// #662?먯꽌 蹂대뱶쨌?덈궡쨌梨낆쓽 ??ぉ??紐⑤몢 怨좎퀜 KNOWN?먯꽌 類먮떎 ???댁젣 寃?ш린媛 吏耳쒖꽌 ?덈줈 ?앷린硫?鍮④컯???쒕떎.
// (261116: ?섎윭蹂닿린 移대뱶 10쨌11px(#540쨌#611 3踰???12px ?댁긽?쇰줈 怨좎퀜 KNOWN?먯꽌 類먮떎 ??#705 ?꾩냽. KNOWN 4??嫄?)
const KNOWN = [
  // #666 2踰덉쓽 ???곹깭媛 泥섏쓬 洹몃┛ ?먮━ ??泥??붾㈃ '理쒓렐 ?쒓컙' 移대뱶(src/views/orbit.js:80)???꾨옒 ??以꾩씠 11px??  // (?덇굅??泥??붾㈃ 紐⑥뼇. ?몃━媛 ?덉뼱???⑤?濡?吏湲덇퉴吏 ???곸씠 ?놁뿀??. ???댁뒋?먯꽌???먮?吏 ?딅뒗??
  { ?붾㈃: '怨꾩젙 硫붾돱쨌泥??몃━ ?덈궡', ??ぉ: '?묒?湲??, 李얠쓣: 'small "(留덉?留??쒓컙|?쒗뿕 쨌 ?댁뼱 蹂닿린)', ?댁뒋: '#548(12px 湲곗?)쨌?덇굅??泥??붾㈃' },
  { ?붾㈃: '怨꾩젙 硫붾돱 ?ロ옒쨌泥??몃━ ?덈궡', ??ぉ: '?묒?湲??, 李얠쓣: 'small "(留덉?留??쒓컙|?쒗뿕 쨌 ?댁뼱 蹂닿린)', ?댁뒋: '#548(12px 湲곗?)쨌?덇굅??泥??붾㈃' },
  // '泥??붾㈃ 湲??移대뱶' ?곹깭(261116, #728 ?꾩냽)媛 泥섏쓬 ???먮━ ???덇굅??泥??붾㈃쨌SRC064 ?먮낯??湲곗〈 紐⑥뼇.
  { ?붾㈃: '泥??붾㈃ 湲??移대뱶', ??ぉ: '?묒?湲??, 李얠쓣: 'small "(留덉?留??쒓컙|?쒗뿕 쨌 ?댁뼱 蹂닿린)', ?댁뒋: '#548쨌?덇굅??泥??붾㈃(怨꾩젙 硫붾돱 ?곹깭? 媛숈? 以?' },
  { ?붾㈃: '泥??붾㈃ 湲??移대뱶', ??ぉ: '?묒?湲??, 李얠쓣: 'div.memo(Kicker|Foot)', ?댁뒋: 'SRC064 沅ㅻ룄 硫붾え 移대뱶 ?먮낯 9px(#728 ?꾩냽 ?????댁뒋?먯꽌 ?먮?吏 ?딅뒗??' },
  { ?붾㈃: '泥??붾㈃ 湲??移대뱶', ??ぉ: '寃뱀묠', 李얠쓣: 'span.lt-fallback-date 횞 strong.lt-fallback-title', ?댁뒋: '#728 ?꾩냽 ??legacy box??rect 蹂닿퀬(洹몃┝? 3以?留먯쨪????2070쨌1440 以??ㅼ륫)' },
  { ?붾㈃: '泥??붾㈃ 湲??移대뱶', ??ぉ: '寃뱀묠', 李얠쓣: '(span.lt-fallback-emotion 횞 (strong|small)|strong.lt-fallback-title 횞 button.subtleBtn|small.lt-fallback-notice 횞 button.subtleBtn|div.firstMark 횞 small)', ?댁뒋: '沅ㅻ룄 移대뱶媛 媛?대뜲 UI ?ㅻ? 吏?섍???3D ?먮낯 諛곗튂(#728 ?꾩냽 ??沅ㅻ룄 諛곗튂 遺덈?)' },
  // 吏????Track56 ?먮낯 紐⑥뼇: ?덈궡 臾멸뎄媛 罹붾쾭???ㅼ뿉 源붾젮 ?덈떎(?먮낯 蹂댁〈 而ㅻ컠 b2567fe ???먮낯 援ъ“??諛붽씀吏 ?딅뒗??.
  { ?붾㈃: '吏??, ??ぉ: '媛?ㅼ쭚', 李얠쓣: 'p ??canvas#stage', ?댁뒋: 'Track56 ?먮낯(b2567fe)' },
  // (261116, '?섎윭蹂닿린 ?뚭컻 吏덈Ц'쨌'怨듭쑀 ?먃룹냼媛??ㅼ쐞移? ?곹깭媛 泥섏쓬 ???먮━) ?뚯썝 怨꾩젙??沅ㅻ룄 泥??붾㈃ ??  // ?ㅼ젣 湲곕줉???덉뼱??洹몃━???덇굅??移대뱶??吏湲덇퉴吏 ????怨? #548쨌#728怨?媛숈? ?먮낯 紐⑥뼇?대씪 ???댁뒋?먯꽌 ?먮?吏 ?딅뒗??
  { ?붾㈃: '?섎윭蹂닿린 ?뚭컻 吏덈Ц', ??ぉ: '?묒?湲??, 李얠쓣: 'span.lt-fallback-action "?쒕ぉ ?ш린"', ?댁뒋: '#548(12px 湲곗?)쨌?덇굅??沅ㅻ룄 移대뱶' },
  { ?붾㈃: '?섎윭蹂닿린 ?뚭컻 吏덈Ц', ??ぉ: '?묒?湲??, 李얠쓣: 'small "(留덉?留??쒓컙|紐⑥븘???쒓컙)', ?댁뒋: '#548(12px 湲곗?)쨌?덇굅??沅ㅻ룄 移대뱶' },
  { ?붾㈃: '怨듭쑀 ?먃룹냼媛?爰쇱쭚', ??ぉ: '?묒?湲??, 李얠쓣: 'span.lt-fallback-action "?쒕ぉ ?ш린"', ?댁뒋: '#548(12px 湲곗?)쨌?덇굅??沅ㅻ룄 移대뱶' },
  { ?붾㈃: '怨듭쑀 ?먃룹냼媛?爰쇱쭚', ??ぉ: '?묒?湲??, 李얠쓣: 'small "(留덉?留??쒓컙|紐⑥븘???쒓컙)', ?댁뒋: '#548(12px 湲곗?)쨌?덇굅??沅ㅻ룄 移대뱶' },
  { ?붾㈃: '怨듭쑀 ?먃룹냼媛?耳쒖쭚', ??ぉ: '?묒?湲??, 李얠쓣: 'span.lt-fallback-action "?쒕ぉ ?ш린"', ?댁뒋: '#548(12px 湲곗?)쨌?덇굅??沅ㅻ룄 移대뱶' },
  { ?붾㈃: '怨듭쑀 ?먃룹냼媛?耳쒖쭚', ??ぉ: '?묒?湲??, 李얠쓣: 'small "(留덉?留??쒓컙|紐⑥븘???쒓컙)', ?댁뒋: '#548(12px 湲곗?)쨌?덇굅??沅ㅻ룄 移대뱶' },
  { ?붾㈃: '瑗щ━??吏곸젒 遺숈씠湲?, ??ぉ: '?묒?湲??, 李얠쓣: 'span.lt-fallback-action "?쒕ぉ ?ш린"', ?댁뒋: '#548(12px 湲곗?)쨌?덇굅??沅ㅻ룄 移대뱶' },
  { ?붾㈃: '瑗щ━??吏곸젒 遺숈씠湲?, ??ぉ: '?묒?湲??, 李얠쓣: 'small "(留덉?留??쒓컙|紐⑥븘???쒓컙)', ?댁뒋: '#548(12px 湲곗?)쨌?덇굅??沅ㅻ룄 移대뱶' },
];

// #638: '???섍껄 紐⑸줉' ?곹깭 ???곹깭 留???媛吏쨌?듬?쨌???뚯떇 留곹겕媛 ???붾㈃??蹂댁씠寃??섎뒗 媛吏?寃뚯떆臾?
// #678 ?꾩냽 B: p5?먮뒗 ???㏓텤?????섎굹??怨좎튇 寃???(怨좎묠) ?쒖떆)怨??댁쁺?쇳꽣 ?듬? ?섎굹媛 ?덈떎.
// ?댁쁺?쇳꽣 ?듬???authorType? 'customer'吏留?canEdit쨌canDelete媛 false??怨좎튂湲걔룹??곌린 ?⑥텛媛 洹몃젮吏吏 ?딆븘???쒕떎.
const MINE_POSTS = [
  { id: 1, kind: 'opinion', status: 'received', createdAt: '2026-11-10T09:00:00.000Z', title: '梨??섍린湲곌? ?먮젮??, body: '梨??섍린湲곌? ?먮젮??n390 ?붾㈃?먯꽌 ?뱁엳 洹몃옒??, issueNumber: null, replies: [] },
  { id: 2, kind: 'opinion', status: 'reviewing', createdAt: '2026-11-11T09:00:00.000Z', title: '吏??湲?먭? ?묒븘??, body: '吏??湲?먭? ?묒븘??, issueNumber: null, replies: [{ id: 'r1', mine: false, body: '?댄렣蹂닿퀬 ?덉뼱?? }] },
  { id: 3, kind: 'opinion', status: 'fixed', createdAt: '2026-11-12T09:00:00.000Z', title: '吏???좎쭨媛 ?섎せ 蹂댁뿬??, body: '吏???좎쭨媛 ?섎せ 蹂댁뿬??, issueNumber: 638, replies: [{ id: 'r2', mine: false, body: '4.1.4?먯꽌 怨좎낀?댁슂' }] },
  { id: 4, kind: 'journal', status: 'closed', createdAt: '2026-11-13T09:00:00.000Z', title: '?ㅻ뒛 ?ъ슜 ?쇱?', body: '?ㅻ뒛 ?ъ슜 ?쇱? ?댁슜', issueNumber: null, replies: [] },
  { id: 5, kind: 'opinion', status: 'reviewing', createdAt: '2026-11-15T09:00:00.000Z', title: '???섍껄 ?㏓텤??怨좎튂湲??붾㈃ ?뺤씤', body: '???섍껄 ?㏓텤??怨좎튂湲??붾㈃???뺤씤?섍린 ?꾪븳 ?쒗뿕 ?섍껄?낅땲??, issueNumber: null, replies: [
    { id: 'f1', authorType: 'customer', mine: true, canEdit: true, canDelete: true, edited: false, body: '泥섏쓬 ?④릿 ?㏓텤??, createdAt: '2026-11-15T09:05:00.000Z' },
    { id: 'f2', authorType: 'customer', mine: true, canEdit: true, canDelete: true, edited: true, body: '怨좎퀜????ν븳 ?㏓텤??, createdAt: '2026-11-15T09:06:00.000Z' },
    { id: 'f3', authorType: 'customer', mine: false, canEdit: false, canDelete: false, edited: false, body: '?댁쁺?쇳꽣媛 ?④릿 ?듬??낅땲?? ?㏓텤?꾩씠 ?꾨땲???⑥텛媛 蹂댁씠吏 ?딆븘??', createdAt: '2026-11-15T09:07:00.000Z' }
  ] }
];

// #678 ?꾩냽(?뚯감 吏??: ?섎윭蹂닿린 ?곹깭 ??諛섏쓳???섎굹???녿뒗 怨듦컻 ?몃━ 移대뱶. 0吏쒕━ 移?7媛????// '諛섏쓳 ?④린湲? ??媛쒕쭔 蹂댁씠?붿? 寃?ы븳?? 移대뱶 湲??以?main?먯꽌 ?대? 10쨌11px??寃껋? KNOWN?쇰줈 ?섍릿??
const COMMUNITY_CARDS = [
  { shareId: 'c0000000000000000000000a', title: '?붾㈃ ?뺤씤??怨듦컻 ?몃━', subject: '?뺤씤 ???, summary: '泥??쒓컙 ?뚭컻', createdAt: '2026-11-15T09:00:00.000Z', momentCount: 3, aiTester: false, emotions: ['?ㅻ젞'], cover: { url: '', title: '泥??쒓컙', emotion: '?ㅻ젞' }, stats: { favorites: 0, hearts: 0, favored: false, hearted: false, reactions: { heart: 0, like: 0, love: 0, laugh: 0, wow: 0, sad: 0, angry: 0 }, mine: [] } }
];

const knownHit = (??ぉ, 以? => KNOWN.some((k) => 以?startsWith(k.?붾㈃) && k.??ぉ === ??ぉ && new RegExp(k.李얠쓣).test(以?);

// ?몃꽕???먮━瑜?梨꾩슦??1px PNG ???몃? ?ㅽ듃?뚰겕 ?놁씠 寃곗젙?곸쑝濡??몃꽕??移대뱶 紐⑥뼇) 洹몃┛??
const THUMB = (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') });

// ?쒗뿕 ?몃━(#635? 媛숈? 紐⑥뼇 ???쒓컙 3媛??ъ뒳, 泥??쒓컙? ?좏뒠釉?. 媛吏??곗씠?곕떎.
// 泥??쒓컙????媛덈옒(e2쨌e3)瑜??섍?誘濡?泥??μ뿉 媛덈┝湲???씠 蹂댁씤????#700 ?꾩냽 ??湲???ш린쨌?섎┝ 寃?????
const VIDEO_TITLE = 'Super Shy ??Official MV';
const tree = (() => {
  const moments = [
    { id: 'm1', title: 'super shy ??official mv', date: '2026-11-01', emotion: '?ㅻ젞', note: '泥??좎쓽 湲', parentId: null, relation: '', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', mediaMetadata: { title: VIDEO_TITLE, channel: '?덉떆 梨꾨꼸' }, x: null, y: null, rot: 0, color: 'rose', keywords: [], privacy: 'public' },
    { id: 'm2', title: '?섏㎏ ?쒓컙', date: '2026-11-02', emotion: '?됰났', note: '?댁뼱吏??湲', parentId: 'm1', relation: '媛숈씠 ?ㅼ뼱??, url: '', mediaMetadata: null, x: null, y: null, rot: 0, color: 'sky', keywords: ['臾대?'], privacy: 'public' },
    { id: 'm3', title: '留덉?留??쒓컙', date: '2026-11-03', emotion: '洹몃━?', note: '?앹쓽 湲', parentId: 'm1', relation: '', url: '', mediaMetadata: null, x: null, y: null, rot: 0, color: 'gold', keywords: [], privacy: 'public' }
  ];
  const edges = [
    { id: 'e2', kind: 'parent', from: 'm1', to: 'm2', reason: '媛숈씠 ?ㅼ뼱?? },
    { id: 'e3', kind: 'parent', from: 'm1', to: 'm3', reason: '?ㅻⅨ 寃쎈줈' }
  ];
  return { id: 't1', title: '?쒗뿕 ?몃━', moments, edges };
})();

// 怨듭쑀(媛먯긽) ?몄뒪?????몄씠 LT41.source='share'瑜?iframe???섍린??寃껉낵 媛숈? ?(#635).
const shareHost = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>?몄뒪??/title></head><body data-member="out" data-record-source="share">
<script>window.LT41={source:'share',writable:false,owned:false,momentId:'m1',prefs:{},tree:${JSON.stringify(tree)},trees:[${JSON.stringify(tree)}]};</script>
<iframe src="/v41/views/track59-sketchbook.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

// 泥??붾㈃ ?몄뒪????濡쒓렇?꾩썐 ?곹깭(?덉떆 ?곗씠?곌? 洹몃젮吏꾨떎).
const homeHost = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>泥??붾㈃ ?몄뒪??/title></head><body data-member="out" data-record-source="file" data-tree-count="0">
<script>window.LT41={source:'file',member:'out',treeCount:0,trees:[],prefs:{}};</script>
<iframe src="/v41/home.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

// #666: ?뚮┝ 以꾩쓣 ?ㅼ젣 ?ъ슜??湲몃줈 ?꾩슫????湲곕줉 ?뚯씪???대㈃ ?몄씠 '?뚯씪???댁뿀?댁슂??(?먮뒗 '遺덈윭?ㅺ린 ?ㅽ뙣??) ?덈궡瑜??щ┛??
// ?뚮┝ 以꾩? ??index.html)??#toast?닿퀬, ?꾨옒 留곹겕 以꽷뤄펻 ?⑥텛쨌???뚯떇 移대뱶??媛숈? 臾몄꽌???덈떎.
const raiseToast = async (page) => {
  await page.setInputFiles('#file', { name: 'record.json', mimeType: 'application/json', buffer: Buffer.from('{"trees":"源⑥쭊 媛?}') }).catch(() => {});
  await page.waitForFunction(() => { const t = document.getElementById('toast'); return !!t && !t.hidden; }, null, { timeout: 8000 });
  await page.waitForTimeout(200);
  // ?뚮┝ 以꾩씠 ?ㅼ젣濡????덇퀬, ?먮━媛 ?꾨옒??遺숈? 寃껊뱾 ?꾨줈 ?≫삍?붿? 癒쇱? ?뺤씤?쒕떎(寃?ш? 鍮덉넀?쇰줈 ?듦낵?섏? ?딄쾶).
  const box = await page.evaluate(() => {
    const t = document.getElementById('toast');
    const r = t.getBoundingClientRect();
    return { hidden: t.hidden, top: Math.round(r.top), bottom: Math.round(r.bottom), gap: getComputedStyle(document.documentElement).getPropertyValue('--lt-toast-bottom').trim(), text: t.textContent };
  });
  assert.equal(box.hidden, false, '?뚮┝ 以꾩씠 ???덈떎');
  assert.ok(box.text.trim().length > 0, '?뚮┝ 以꾩뿉 湲?먭? ?덈떎');
  assert.ok(Number.parseFloat(box.gap) > 0, `?뚮┝ 以??먮━瑜??꾨옒??遺숈? 寃껊뱾 ?꾨줈 ?≪븯??--lt-toast-bottom: ${box.gap || '?놁쓬'})`);
  return box;
};
const lowerToast = async (page) => { await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; }); };

// #666 2踰? 泥??몃━ ?덈궡? 怨꾩젙 硫붾돱????踰덉뿉 ?섎굹留? ?덈궡???쒕쾭 湲곕줉쨌濡쒓렇???뚯쑀?먭? 泥??몃━瑜?// 留뚮뱺 ?먮━?먯꽌留??⑤?濡?tipsWanted), 媛吏?/api/workspace濡?洹??먮━瑜?留뚮뱺?? ?몃━ ?섎굹쨌?쒓컙 ?섎굹.
// 湲곕줉 臾몄꽌???꾨찓??洹쒖튃???듦낵?댁빞 ?몄씠 '??湲곕줉'?쇰줈 諛쏆븘 以???먯쑝濡?留뚮뱺 ?몃━??嫄곗젅?쒕떎) ??createTree濡?留뚮뱺??
let firstTree = createTree({ subject: '?쒗뿕', title: '?쒗뿕 ?몃━', note: '湲곕줉', emotion: '?ㅻ젞', date: '2026-11-15', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }, '2026-11-15T00:00:00.000Z');
// #627 PR B: '瑗щ━??以꾩씠 ?대┛ ?곸꽭'쨌'瑗щ━???뺣━ ?붾㈃' ?곹깭???곕뒗 紐⑥뼇 ??泥??쒓컙?먮뒗 瑗щ━?쒓? ?덇퀬(醫낅쪟 ?쒖떆? ???깅쭚 ?욎쓬),
// ?섏㎏ ?쒓컙?먮뒗 ?놁뼱 '?쒕ぉ?먯꽌 瑗щ━????踰덉뿉 ?쒖븞諛쏄린'????곸씠 ?쒕떎. ?꾨찓??洹쒖튃???듦낵?섎뒗 媛믩쭔 ?대떎.
firstTree.moments[0].keywords = ['?몃옒:Super Shy', '臾대?'];
// #678 ?꾩냽(瑗щ━??嫄몃윭 蹂닿린): 嫄몃윭 蹂닿린 ?곹깭 ?꾩슜 ?몃━ ???섏㎏ ?쒓컙(瑗щ━???놁쓬)???덉뼱??// 移⑹쓣 ?뚮?????紐⑸줉??2嫄닳넂1嫄댁쑝濡?以꾩뼱?쒕뒗 寃껋쓣 寃?ы븷 ???덈떎. addMoment??遺덈??대?濡?諛섑솚 ?몃━瑜??대떎.
const twoMomentTree = addMoment(firstTree, { subject: '?쒗뿕', title: '?댁쭊??Super Shy 吏곸틺 @?멸린媛??23716', note: '湲곕줉', emotion: '?ㅻ젞', date: '2026-11-15', url: '' }, firstTree.moments[0].id, '2026-11-15T00:01:00.000Z');
if (!twoMomentTree?.moments || twoMomentTree.moments.length !== 2) throw new Error('?쒗뿕 ?몃━???섏㎏ ?쒓컙??留뚮뱾吏 紐삵뻽??);
const fiveMomentTree = (() => {
  let t = twoMomentTree;
  const rows = [
    { title: '?곕퇃 臾대???泥??몄궗', date: '2026-11-13' },
    { title: '?ъ퐯?먯꽌 ?④퍡 遺瑜??몃옒', date: '2026-11-14' },
    { title: '?ㅼ떆 ?쇱튇 ?곗뒿 ?곸긽', date: '2026-11-15' }
  ];
  rows.forEach((row, i) => {
    t = addMoment(t, { subject: '?쒗뿕', title: row.title, note: '媛吏??붾㈃ ?먭? 湲곕줉', emotion: '?ㅻ젞', date: row.date, url: '' }, t.moments[0].id, `2026-11-15T00:0${i + 2}:00.000Z`);
    t.moments.at(-1).keywords = [];
  });
  return t;
})();
if (!fiveMomentTree?.moments || fiveMomentTree.moments.length < 5) throw new Error('?붾㈃ ?먭???媛吏??몃━???쒓컙???ㅼ꽢 媛?誘몃쭔?대떎');

// #627 PR3: '洹몃옒??蹂닿린' ?곹깭???쒗뿕 ?몃━ ??瑗щ━???덈툕 8醫?臾대?쨌?몃옒쨌硫ㅻ쾭쨌媛??쨌媛숈? ?곸긽 臾띠쓬(stacks)쨌
// 瑗щ━???녿뒗 ?쒓컙 3媛??좊컲쨌?쒖븞諛쏄린 ???. ?꾨찓??洹쒖튃(createTree쨌addMoment)?쇰줈 留뚮뱾???몄씠 洹몃?濡?諛쏄쾶 ?쒕떎 ??// ?몄뒪??LT41 吏곸젒 二쇱엯)? ??二쇱냼(#my/graph) ?묒そ?먯꽌 媛숈? ?몃━瑜??대떎.
const graphTree = (() => {
  const V = 'https://www.youtube.com/watch?v=';
  const defs = [
    { title: '?곕퇃??泥?臾대?', date: '2026-01-10', url: V + 'aaa11111111', keywords: ['媛???섏툩?ы븯痢?, '臾대?:?곕퇃??] },
    { title: '?곕퇃???ㅼ떆 蹂닿린', date: '2026-01-20', url: V + 'aaa11111111', keywords: ['媛???섏툩?ы븯痢?, '臾대?:?곕퇃??] },
    { title: '?쇱콛 1二쇱감', date: '2026-02-05', url: V + 'bbb22222222', keywords: ['媛???섏툩?ы븯痢?, '臾대?:?쇱콛?쇱뼵', '?몃옒:With'] },
    { title: '?쇱콛 2二쇱감', date: '2026-02-12', url: V + 'bbb22222222', keywords: ['媛???섏툩?ы븯痢?, '臾대?:?쇱콛?쇱뼵', '?몃옒:With', '硫ㅻ쾭:?쒕굹'] },
    { title: '?쇱콛 3二쇱감', date: '2026-02-19', url: V + 'ccc33333333', keywords: ['媛???섏툩?ы븯痢?, '臾대?:?쇱콛?쇱뼵', '?몃옒:15-LOVE'] },
    { title: '?쒕굹 吏곸틺', date: '2026-03-01', url: V + 'ddd44444444', keywords: ['媛???섏툩?ы븯痢?, '硫ㅻ쾭:?쒕굹'] },
    { title: '?쒕굹 吏곸틺 ?몃줈', date: '2026-03-02', url: V + 'ddd44444444', keywords: ['媛???섏툩?ы븯痢?, '硫ㅻ쾭:?쒕굹'] },
    { title: '?ъ퐯 ?섏씠?ъ튂', date: '2026-04-10', url: V + 'eee55555555', keywords: ['媛???섏툩?ы븯痢?, '臾대?:?ъ퐯'] },
    { title: '?ъ퐯 ?숈퐫瑜?, date: '2026-04-11', url: V + 'eee55555555', keywords: ['媛???섏툩?ы븯痢?, '臾대?:?ъ퐯'] },
    { title: '硫쒕줎 ?댁썙利?臾대?', date: '2026-05-20', url: V + 'fff66666666', keywords: ['媛???섏툩?ы븯痢?, '臾대?:硫쒕줎裕ㅼ쭅?댁썙利?] },
    { title: 'RESCENE ?⑥껜 而⑥뀎', date: '2026-06-01', url: V + 'ggg77777777', keywords: ['媛??RESCENE'] },
    { title: 'RESCENE 鍮꾪븯?몃뱶', date: '2026-06-02', url: V + 'hhh88888888', keywords: ['媛??RESCENE'] },
    { title: 'With ?곗뒿??, date: '2026-02-22', url: '', keywords: ['?몃옒:With'] },
    { title: '15-LOVE 臾대? ?곸긽', date: '2026-03-15', url: V + 'iii99999999', keywords: ['?몃옒:15-LOVE'] },
    { title: '踰ㅼ튂??湲곗뼲', date: '2026-02-01', url: '', keywords: [] },
    { title: '?곗콉????, date: '2026-04-03', url: '', keywords: [] },
    { title: '李쎈컰??鍮?, date: '2026-05-05', url: '', keywords: [] }
  ];
  let t = createTree({ subject: '?쒗뿕', title: '?쒗뿕 ?몃━(瑗щ━??', note: '湲곕줉', emotion: '?ㅻ젞', date: defs[0].date, url: defs[0].url }, '2026-11-15T00:00:00.000Z');
  t.moments[0].keywords = defs[0].keywords;
  for (let i = 1; i < defs.length; i++) {
    t = addMoment(t, { subject: '?쒗뿕', title: defs[i].title, note: '湲곕줉', emotion: '?ㅻ젞', date: defs[i].date, url: defs[i].url }, t.moments[0].id, '2026-11-15T00:0' + Math.min(i, 9) + ':00.000Z');
    t.moments.at(-1).keywords = defs[i].keywords;
  }
  return t;
})();
// 泥??붾㈃ 湲??移대뱶(261116): ?대젮媛??곸긽(?녿뒗 id ???뚯깋 120횞90)??'?곸긽??蹂????놁뼱?? 移대뱶瑜?// 沅ㅻ룄?먯꽌 洹몃━湲??꾪븳 ?쒗뿕 ?몃━ ??湲??ъ슜???쒕ぉ 1嫄?3以??믪씠 ?덈떒 ???쨌?곸긽 ?쒕ぉ+梨꾨꼸 1嫄?蹂댁“ 以?쨌?ъ쭊 1嫄?
const thumbTree = (() => {
  const V = 'https://www.youtube.com/watch?v=';
  let t = createTree({ subject: '?쒗뿕', title: '湲??移대뱶 ?쒗뿕 ?몃━', note: '湲곕줉', emotion: '?ㅻ젞', date: '2026-11-11', url: V + 'zz404zz404a' }, '2026-11-16T00:00:00.000Z');
  t.moments[0].title = 'CHAERYEONG Moonlit Club ?쇳룷癒쇱뒪瑜?蹂닿퀬 洹?諛ㅼ쓽 臾대? 議곕챸??苑껋쿂???쇱뼱 ?щ옄??湲곗뼲??湲멸퀬 ?대갚?섍쾶 ?곸뼱 蹂몃떎';
  t.moments[0].url = V + 'zz404zz404a';
  t.moments[0].mediaMetadata = { thumbnail: '', width: 1920, height: 1080 };
  t.moments[0].createdAt = '2026-11-13T09:00:00.000Z'; t.moments[0].updatedAt = t.moments[0].createdAt;
  t = addMoment(t, { subject: '?쒗뿕', title: '?대젮媛?吏곸틺 ?곸긽', note: '湲곕줉', emotion: '洹몃━?', date: '2026-11-12', url: V + 'zz404zz404b' }, t.moments[0].id, '2026-11-16T00:01:00.000Z');
  t.moments[1].mediaMetadata = { title: '?좏뒠釉뚯뿉???대젮媛?臾대? 吏곸틺 ?곸긽', channel: 'KBS Kpop', thumbnail: '', width: 1920, height: 1080 };
  t.moments[1].createdAt = '2026-11-12T09:00:00.000Z'; t.moments[1].updatedAt = t.moments[1].createdAt;
  t = addMoment(t, { subject: '?쒗뿕', title: '?ъ쭊 ?쒓컙(?뺤긽)', note: '湲곕줉', emotion: '利먭굅?', date: '2026-11-10', url: '' }, t.moments[0].id, '2026-11-16T00:02:00.000Z');
  t.moments[2].mediaMetadata = { thumbnail: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#8a5a6e"/></svg>').toString('base64') };
  // 261117 ???寃곗젙: ???곹깭??390??沅ㅻ룄 寃뱀묠 寃?ш? 紐⑹쟻 ??9???댁긽(?쒖? 醫곸? ?붾㈃ 沅ㅻ룄)?댁뼱???쒕떎.
  // 8???댄븯 390? 沅ㅻ룄 移대뱶瑜??④린??怨꾩빟(?뚯닔 移대뱶??媛?대뜲??吏묒쨷)?대씪 蹂꾨룄 ?⑥뼵(#657 ?꾩냽 261117)??蹂몃떎.
  for (let fi = 0; fi < 6; fi++) {
    t = addMoment(t, { subject: '?쒗뿕', title: '?ъ쭊 ?쒓컙 梨꾩슦湲?' + (fi + 1), note: '湲곕줉', emotion: '利먭굅?', date: '2026-11-0' + (fi % 9 + 1), url: '' }, t.moments.at(-1).id, '2026-11-16T00:03:0' + fi + '.000Z');
    t.moments.at(-1).mediaMetadata = { thumbnail: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="' + ['#5a6e8a', '#6e8a5a', '#8a7a5a', '#8a5a6e'][fi % 4] + '"/></svg>').toString('base64') };
    t.moments.at(-1).createdAt = '2026-11-09T0' + fi + ':00:00.000Z'; t.moments.at(-1).updatedAt = t.moments.at(-1).createdAt;
  }
  t.moments[2].createdAt = '2026-11-10T09:00:00.000Z'; t.moments[2].updatedAt = t.moments[2].createdAt;
  return t;
})();
// 洹몃옒??蹂닿린??吏湲?二쇱냼(#my/graph)濡쒕쭔 ?대━???붾㈃?대씪 ???곹깭 ????몄뒪?멸? LT41??吏곸젒 ?섍릿??share-host? 媛숈? ?).
const graphHost = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>洹몃옒???몄뒪??/title></head>
<body data-member="in" data-record-source="file"><script>window.LT41={source:'file',writable:false,owned:true,momentId:'m01',prefs:{},tree:${JSON.stringify(graphTree)},trees:[${JSON.stringify(graphTree)}]};</script>
<iframe src="/v41/views/graph/track60-graph.html" style="position:fixed;inset:0;width:100vw;height:100vh;border:0"></iframe></body></html>`;

const frameOf = async (page, test_) => {
  for (let i = 0; i < 80; i++) {
    const f = page.frames().find((f) => f !== page.mainFrame() && test_.test(f.url()));
    if (f) return f;
    await page.waitForTimeout(250);
  }
  return null;
};

const frameUrls = (page) => page.frames().map((f) => { try { return f.url(); } catch { return '<url 議고쉶 ?ㅽ뙣>'; } });
const readyFrame = async (page, test_, { root = null, view = null, timeout = 45000, why = '?꾨젅??以鍮? } = {}) => {
  const deadline = Date.now() + timeout;
  let detail = '?湲??쒖옉';
  while (Date.now() < deadline) {
    const f = page.frames().find((x) => x !== page.mainFrame() && test_.test(x.url()));
    if (f) {
      try {
        const ok = await f.evaluate(({ sel, wantView }) =>
          document.readyState === 'complete' &&
          (!sel || Boolean(document.querySelector(sel))) &&
          (!wantView || document.body?.dataset?.ltView === wantView), { sel: root, wantView: view });
        if (ok) return f;
        detail = '?꾨젅?꾩? ?덉쑝??臾몄꽌 以鍮???readyState쨌猷⑦듃 ?붿냼쨌蹂닿린 ?곹깭)';
      } catch (e) { detail = '?꾨젅???됯? ?ㅽ뙣: ' + String(e?.message || e); }
    } else {
      detail = '????꾨젅?꾩쓣 ?꾩쭅 李얠? 紐삵븿';
    }
    await page.waitForTimeout(250);
  }
  assert.fail(`${why} ?ㅽ뙣 ??${detail} (理쒕? ${timeout / 1000}珥?. ?꾩옱 ?꾨젅??URL: [${frameUrls(page).join(' | ')}]`);
};

test('#657 ?붾㈃ 怨듯넻 寃?ш린: 二쇱슂 ?붾㈃ 17 ?곹깭 횞 390쨌1440 횞 諛ㅒ룹젙?먯뿉??寃뱀묠쨌?섎┝쨌?붿쟻 媛뮻룹옉? 湲?먭? 0?대떎', { skip: REQUIRE ? false : skip, timeout: 900000 }, async () => {
  if (skip) assert.fail(`誘몃━蹂닿린 寃?ъ뿉?쒕뒗 嫄대꼫????ㅽ뙣????${skip}`);
  const server = await serve({ '/share-host.html': shareHost, '/home-host.html': homeHost, '/graph-host.html': graphHost });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const known = [], fresh = [];
  const SIZES = [[1440, 900], [390, 844]];

  // ??議고빀(?ш린쨌?뚮쭏)???뚭퀬 ?ㅽ뙣 以꾩쓣 ?뚮젮以??
  const runCombo = async ([width, height], theme) => {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await context.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await context.route('**://i.ytimg.com/**', THUMB); // ?몃꽕?쇱? ?ㅽ듃?뚰겕 ?놁씠 1px 洹몃┝?쇰줈 ??留됱쑝硫??泥?移대뱶(11px 湲??媛 ?섏? 寃?ш? ?꾨땲??紐⑥뼇???쒕떎
    await context.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    const page = await context.newPage();
    const rows = [];
    const take = async (p, screen) => {
      const audit = await auditPage(p, screen);
      rows.push(...failuresOf(audit, `${width}`, theme));
      const required = screen === '??泥??붾㈃쨌?뚮┝ 以?
        ? (width <= 780 ? ['updates-card횞.home-links', 'updates-card횞#mobile-add'] : ['updates-card횞.home-links'])
        : screen === '???뚯떇 ?リ린 踰꾪듉' ? ['updates-foot횞body-text'] : [];
      for (const pair of required) {
        const check = audit.bottomChecks.find((x) => x.pair === pair);
        assert.ok(check, `${screen} 媛먯궗 ????띿씠 ?ㅼ젣濡?寃?щ릺?덈떎: ${pair}`);
        assert.ok(check.left?.width > 0 && check.left?.height > 0 && check.right?.width > 0 && check.right?.height > 0,
          `${screen} ${pair} ?묒そ ?붿냼媛 ?ㅼ젣濡?蹂댁씤?? ${JSON.stringify(check)}`);
        assert.equal(check.area, 0, `${screen} ${pair} 寃뱀묠 硫댁쟻 0px짼: ${JSON.stringify(check)}`);
      }
    };

    // 泥??붾㈃(?덉떆) ???대뼸寃??곕굹???덈궡
    await page.goto(`${base}/home-host.html`, { waitUntil: 'domcontentloaded' });
    const home = await frameOf(page, /home\.html/);
    assert.ok(home, '泥??붾㈃ ?꾨젅?꾩씠 ?대┛??);
    await home.waitForFunction(() => !!document.getElementById('orbit')?.shadowRoot?.querySelector('[data-do=guide]'), null, { timeout: 20000 });
    await page.waitForTimeout(700);
    await take(page, '泥??붾㈃(?덉떆)');
    await home.evaluate(() => document.getElementById('orbit').shadowRoot.querySelector('[data-do=guide]').click());
    await home.waitForFunction(() => !!document.getElementById('orbit')?.shadowRoot?.querySelector('dialog[aria-label="?대뼸寃??곕굹??]')?.open, null, { timeout: 5000 });
    await page.waitForTimeout(400);
    await take(page, '?대뼸寃??곕굹???덈궡');
    await context.close();

    // 梨?怨듭쑀 留곹겕) ??泥??λ???留덉?留??κ퉴吏 ?섍린硫?留???寃??    const ctx2 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx2.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx2.route('**://i.ytimg.com/**', THUMB);
    await ctx2.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    const page2 = await ctx2.newPage();
    await page2.goto(`${base}/share-host.html`, { waitUntil: 'domcontentloaded' });
    const book = await frameOf(page2, /track59-sketchbook/);
    assert.ok(book, '梨??꾨젅?꾩씠 ?대┛??);
    await book.waitForFunction(() => !!document.querySelector('.moment'), null, { timeout: 20000 });
    // ???섍? ?좊땲硫붿씠?섏씠 ?앸굹湲곕? 湲곕떎由곕떎(#662 CI: 450ms 怨좎젙 ?湲곕뒗 ?섍? 以묎컙??寃?ы빐 img쨌clipping??湲?먮? ??? 寃껋쑝濡??섏솕??.
    const bookIdle = () => book.waitForFunction(() => { try { return machineState === 'IDLE'; } catch { return false; } }, null, { timeout: 5000 }).catch(() => {});
    await bookIdle();
    await page2.waitForTimeout(700);
    // #700 ?꾩냽(媛덈┝湲???: 泥??μ쓽 ??씠 蹂댁씠???먮━?먯꽌 湲???ш린? ?섎┝??吏곸젒 ?⑥젙?쒕떎 ??    // 12px 湲곗?(#548)???⑥텛 洹쒖튃(13px)???곸슜?섍퀬, 臾대?(.stage) 諛뽰쑝濡??섍? ?섎━??紐⑥뼇??留됰뒗??
    const branchTab = await book.evaluate(() => {
      const tab = document.getElementById('branchTab');
      if (!tab || tab.hidden) return null;
      const stage = document.querySelector('.stage');
      const tr = tab.getBoundingClientRect(), sr = stage.getBoundingClientRect();
      return { font: parseFloat(getComputedStyle(tab).fontSize), tabRight: tr.right, stageRight: sr.right, text: tab.textContent.trim(), title: tab.title || '' };
    });
    assert.ok(branchTab, '泥??μ뿉 媛덈┝湲???씠 蹂댁씤???쒗뿕 ?몃━??泥??쒓컙????媛덈옒瑜??섍컙??');
    assert.ok(branchTab.font >= 13, `媛덈┝湲???湲?먮뒗 13px ?댁긽?대떎(?ㅼ륫 ${branchTab.font}px)`);
    assert.ok(branchTab.tabRight <= branchTab.stageRight, `媛덈┝湲???씠 臾대? ?덉そ???덉뼱???쒕떎 ???섎┝ 0(???ㅻⅨ履?${Math.round(branchTab.tabRight)}px / 臾대? ?ㅻⅨ履?${Math.round(branchTab.stageRight)}px)`);
    assert.match(branchTab.text, /媛덈┝湲?s*\d+/, `??? 吏㏃? '媛덈┝湲?N'?대떎(?ㅼ륫: ${branchTab.text})`);
    assert.ok(branchTab.title.includes('?먯꽌 媛덈씪吏?湲?), `湲??쒕ぉ? ?댄똻?먮쭔 ?덈떎(?ㅼ륫: ${branchTab.title})`);
    for (let i = 0; i < 12; i++) {
      await take(page2, i === 0 ? '梨끒룰났??泥??? : `梨끒룰났??${i + 1}??);
      const next = book.locator('#nextBtn');
      if (await next.isDisabled()) break;
      await next.click();
      await bookIdle();
      await page2.waitForTimeout(450);
    }
    await take(page2, '梨끒룰났??留덉?留???);
    await ctx2.close();

    // ???붾㈃ ??蹂대뱶 ??吏?????섎윭蹂닿린(??踰????몄뿉??二쇱냼? ?⑤꼸留?諛붽퓭 蹂몃떎)
    const ctx3 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx3.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx3.route('**://i.ytimg.com/**', THUMB);
    await ctx3.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    const page3 = await ctx3.newPage();
    await page3.goto(`${base}/v41/#board`, { waitUntil: 'load' });
    await frameOf(page3, /views\/track/); // ?덉そ ?붾㈃ ?꾨젅?꾩씠 ???뚭퉴吏(寃???꾨씫 諛⑹?)
    await page3.waitForTimeout(1200);
    await take(page3, '蹂대뱶');
    // #662 ?꾩냽(CTO 吏??: ?덈궡 ?띿꽑? ?곸꽭 ?먯씠 ?ロ? ?덉쓣 ?뚮쭔 ?щ떎 ???먯? 濡쒕뱶 ???좏깮 蹂듭썝?쇰줈 ?대젮 ?덉쑝誘濡?癒쇱? ?ル뒗??
    // ?ロ옒 ?곹깭?먯꽌???띿꽑??罹붾쾭???꾩뿉 ???곹깭濡?寃뱀묠쨌?鍮꾨? ?띿꽑源뚯? ?곕떎(?띿꽑? '?꾧뎄횞罹붾쾭?? ?쒖쇅 ??곸씠 ?꾨땲??.
    const boardFrame = await frameOf(page3, /views\/track/);
    await boardFrame.evaluate(() => document.getElementById('detailClose').click());
    await boardFrame.waitForFunction(() => { const d = document.getElementById('detail'); if (!d || d.classList.contains('open')) return false; const r = d.getBoundingClientRect(); return r.left >= innerWidth || r.top >= innerHeight; }, null, { timeout: 5000 }).catch(() => {});
    await page3.waitForTimeout(300);
    await boardFrame.evaluate(() => toast('?쒓컙???좏깮???곌껐??湲곕줉???댄렣蹂댁꽭??'));
    await page3.waitForTimeout(400);
    await take(page3, '蹂대뱶쨌?덈궡쨌???ロ옒');
    // ?먯쓣 ?대㈃ ?덈궡??移섏썙吏꾨떎(?대? ?쒓컙???좏깮?덉쑝誘濡? ???대┝ ?곹깭?먯꽌??寃뱀묠 0???곕떎.
    await boardFrame.evaluate(() => selectMoment(LTDEMO.get()));
    await page3.waitForTimeout(500);
    assert.equal(await boardFrame.evaluate(() => document.querySelector('.toast').classList.contains('show')), false, '?곸꽭 ?먯씠 ?대졇?쇰㈃ 蹂대뱶 ?덈궡 ?띿꽑? ?щ씪吏꾨떎');
    await take(page3, '蹂대뱶쨌?덈궡쨌???대┝');
    await boardFrame.evaluate(() => document.getElementById('detailClose').click());
    // ???ロ옒 ?섏뼱媛???숈븞(0.35s transform)??湲곕떎由곕떎 ??以묎컙??寃?ы븯硫????앹뿉 嫄몄튇 ?⑥텛媛 '媛?ㅼ쭚'?쇰줈 ?≫엺??
    await boardFrame.waitForFunction(() => { const d = document.getElementById('detail'); if (!d || d.classList.contains('open')) return false; const r = d.getBoundingClientRect(); return r.left >= innerWidth || r.top >= innerHeight; }, null, { timeout: 5000 }).catch(() => {});
    await page3.waitForTimeout(300);
    // #666: 竊??⑥텛(body.lt-fab-ok ??濡쒓렇?명빐 ??湲곕줉???곕뒗 ?먮━?먯꽌留??щ떎)瑜??④퍡 ?꾩슦怨??뚮┝ 以꾩쓣 ?щ┛??
    await page3.evaluate(() => document.body.classList.add('lt-fab-ok'));
    await raiseToast(page3);
    await take(page3, '蹂대뱶쨌?뚮┝ 以?);
    await lowerToast(page3);
    await page3.evaluate(() => document.body.classList.remove('lt-fab-ok'));
    await page3.evaluate(() => { location.hash = '#network'; });
    await page3.waitForTimeout(1800);
    await take(page3, '吏??);
    // 2026-11-16 ???寃곗젙: 蹂닿린 怨좊Ⅴ湲곗뿉 [洹몃옒??媛 ?뗭㎏濡?遺숇뒗????390?먯꽌?????⑥텛媛 癒몃━以꾩뿉 ?ㅼ뼱媛꾨떎(?섏묠쨌寃뱀묠 0).
    const mapHeader = await page3.evaluate(() => {
      const frame = [...document.querySelectorAll('iframe')].find((f) => { try { return /track56-network/.test(f.contentWindow.location.href); } catch { return false; } });
      if (!frame) return null;
      const doc = frame.contentDocument;
      const bar = doc.querySelector('.topbar');
      const switchBtns = [...doc.querySelectorAll('.view-switch .pill')];
      const btns = [...doc.querySelectorAll('.top-actions button')].filter((b) => b.getBoundingClientRect().width > 0);
      const rects = btns.map((b) => b.getBoundingClientRect());
      const pairTexts = [];
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) pairTexts.push(btns[i].textContent.trim() + '횞' + btns[j].textContent.trim());
      }
      return {
        switchCount: switchBtns.length,
        labels: switchBtns.map((b) => b.textContent.trim()),
        netPressed: doc.getElementById('viewNet')?.getAttribute('aria-pressed'),
        graphPressed: doc.getElementById('viewGraph')?.getAttribute('aria-pressed'),
        overflowX: Math.max(0, bar.scrollWidth - bar.clientWidth),
        outOfFrame: btns.filter((b) => b.getBoundingClientRect().right > doc.documentElement.clientWidth + 1).map((b) => b.textContent.trim()),
        pairTexts
      };
    }).catch(() => null);
    assert.ok(mapHeader, '吏??癒몃━以꾩쓣 ?곕떎');
    assert.deepEqual(mapHeader.labels, ['洹몃Ъ??, '?숈떖?먰삎', '洹몃옒??], `蹂닿린 怨좊Ⅴ湲????⑥텛(?ㅼ젣 ${JSON.stringify(mapHeader.labels)})`);
    assert.equal(mapHeader.netPressed, 'true', '?꾩옱 蹂닿린(洹몃Ъ?? aria-pressed=true');
    assert.equal(mapHeader.graphPressed, 'false', '洹몃옒???⑥텛??吏?꾩뿉???뚮━吏 ?딆? ?곹깭');
    assert.equal(mapHeader.overflowX, 0, `吏??癒몃━以?媛濡??섏묠 0(?ㅼ젣 ${mapHeader.overflowX})`);
    assert.deepEqual(mapHeader.outOfFrame, [], '癒몃━以??⑥텛媛 ?붾㈃ 諛뽰쑝濡??섍?吏 ?딅뒗??);
    assert.deepEqual(mapHeader.pairTexts, [], `癒몃━以??⑥텛 寃뱀묠 0(?ㅼ젣 ${JSON.stringify(mapHeader.pairTexts)})`);
    // #638: 吏??390(議곗옉 以? ??iframe ??議곗옉 以꾩씠 ?몄쓽 留곹겕 以꽷뤄펻 ?⑥텛? 寃뱀튂吏 ?딄퀬, 蹂닿린 ?꾪솚 ?⑥텛 ?鍮?4.5:1.
    if (width === 390) {
      const ribbonCheck = await page3.evaluate(() => {
        const rgb = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; const p = m[1].split(',').map((v) => parseFloat(v)); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
        const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
        const mix = (t, b) => [t[0] * t[3] + b[0] * (1 - t[3]), t[1] * t[3] + b[1] * (1 - t[3]), t[2] * t[3] + b[2] * (1 - t[3]), 1];
        const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right }; };
        // iframe? src ?띿꽦??鍮꾩뼱 ?덈떎(?몄씠 contentWindow.location.replace濡??붾㈃??諛붽씔?? ??        // f.url()? DOM iframe???놁뼱????寃?ш? ??鍮덉넀?댁뿀??#638: contentWindow 二쇱냼濡?李얜뒗??.
        const frame = [...document.querySelectorAll('iframe')].find((f) => { try { return /track56-network/.test(f.contentWindow.location.href); } catch { return false; } });
        if (!frame) return null;
        const doc = frame.contentDocument;
        const ribbonEl = doc.getElementById('mobileRibbon');
        if (!ribbonEl || frame.contentWindow.getComputedStyle(ribbonEl).display === 'none') return null;
        const off = box(frame);
        const vp = (o) => o && { t: o.t + off.t, b: o.b + off.t, l: o.l + off.l, r: o.r + off.l };
        const ribbon = vp(box(ribbonEl));
        const links = box(document.querySelector('.home-links'));
        const fab = box(document.getElementById('mobile-add'));
        const ox = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l);
        const oy = (a, b) => Math.min(a.b, b.b) - Math.max(a.t, b.t);
        const contrast = (el) => {
          if (!el || el.getBoundingClientRect().width < 2) return 0; // 醫곸? ?붾㈃?먯꽌 ?⑥? ?⑥텛(?쇱そ ?????鍮꾨? ?ъ? ?딅뒗??          const win = frame.contentWindow;
          const fg = rgb(win.getComputedStyle(el).color);
          const layers = [];
          for (let n = el; n; n = n.parentElement) { const bg = rgb(win.getComputedStyle(n).backgroundColor); if (bg) { layers.push(bg); if (bg[3] >= 1) break; } }
          let bgc = layers.length && layers[layers.length - 1][3] >= 1 ? layers[layers.length - 1] : [255, 255, 255, 1];
          for (let i = layers.length - 2; i >= 0; i--) bgc = mix(layers[i], bgc);
          const fge = fg[3] < 1 ? mix(fg, bgc) : fg;
          return Math.round((Math.max(lum(fge), lum(bgc)) + 0.05) / (Math.min(lum(fge), lum(bgc)) + 0.05) * 100) / 100;
        };
        return {
          cut: Math.max(0, ribbonEl.scrollWidth - ribbonEl.clientWidth),
          linksOverlap: links ? Math.max(0, ox(ribbon, links)) * Math.max(0, oy(ribbon, links)) : 0,
          fabOverlap: fab && fab.r > fab.l ? Math.max(0, ox(ribbon, fab)) * Math.max(0, oy(ribbon, fab)) : 0,
          contrastNet: contrast(doc.getElementById('viewNet')),
          contrastConc: contrast(doc.getElementById('viewConc'))
        };
      }).catch(() => null);
      if (ribbonCheck) {
        const tail = ` 쨌 ${width}쨌${theme}`;
        if (ribbonCheck.cut > 0) rows.push({ ??ぉ: '?섎┝', 以? `吏??390(議곗옉 以? ?섎┝ .mobile-ribbon ${Math.round(ribbonCheck.cut)}px ?섏묠${tail}` });
        if (ribbonCheck.linksOverlap > 0) rows.push({ ??ぉ: '寃뱀묠', 以? `吏??390(議곗옉 以? 寃뱀묠 .mobile-ribbon 횞 .home-links ${Math.round(ribbonCheck.linksOverlap)}px짼${tail}` });
        if (ribbonCheck.fabOverlap > 0) rows.push({ ??ぉ: '寃뱀묠', 以? `吏??390(議곗옉 以? 寃뱀묠 .mobile-ribbon 횞 #mobile-add ${Math.round(ribbonCheck.fabOverlap)}px짼${tail}` });
        for (const [id, v] of [['viewNet', ribbonCheck.contrastNet], ['viewConc', ribbonCheck.contrastConc]]) if (v > 0 && v < 4.5) rows.push({ ??ぉ: '?鍮?, 以? `吏??390(議곗옉 以? ?鍮?#${id} ${v}:1 < 4.5:1${tail}` });
      }
    }
    await ctx3.close();

    // ?섎윭蹂닿린 ???섍껄 蹂대궡湲?李????덈줈 ???몄뿉??吏???붿긽 ?곹깭??醫뚯슦?섏? ?딄쾶)
    const ctx4 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx4.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx4.route('**://i.ytimg.com/**', THUMB);
    await ctx4.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    // #638: ???섍껄 紐⑸줉 ??/api/board/mine留?媛吏?寃뚯떆臾쇰줈 ?듯븳???꾩쓽 ?ш큵 紐⑹쟻 寃쎈줈蹂대떎 ?섏쨷???깅줉??寃껋씠 ?닿릿??.
    await ctx4.route('**/api/board/mine*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, posts: MINE_POSTS }) }));
    await ctx4.route('**/api/community/shares*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: COMMUNITY_CARDS, totalVisible: COMMUNITY_CARDS.length }) }));
    const page4 = await ctx4.newPage();
    await page4.goto(`${base}/v41/`, { waitUntil: 'load' });
    await page4.waitForTimeout(1200);
    // #666: ??泥??붾㈃(留곹겕 以?+ ???뚯떇 移대뱶 + 竊??⑥텛)?먯꽌 ?뚮┝ 以꾩씠 ?닿쾬?ㅼ쓣 ??? ?딅뒗吏 ?곕떎.
    await page4.evaluate(() => document.body.classList.add('lt-fab-ok'));
    if (width === 390) {
      await page4.waitForFunction(() => {
        const card = document.getElementById('updates-card'), fab = document.getElementById('mobile-add');
        return card && !card.hidden && fab && getComputedStyle(fab).display !== 'none';
      }, null, { timeout: 8000 });
      const cardPair = await page4.evaluate(() => {
        const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
        const lines = (el) => { const range = document.createRange(); range.selectNodeContents(el); return range.getClientRects().length; };
        const card = document.getElementById('updates-card'), fab = document.getElementById('mobile-add');
        const text = document.getElementById('updates-card-text'), view = document.getElementById('updates-view');
        return { card: box(card), fab: box(fab), gap: Math.round(fab.getBoundingClientRect().top - card.getBoundingClientRect().bottom), text: text.textContent.trim(), textLines: lines(text), viewLines: lines(view) };
      });
      assert.equal(cardPair.card.width, 358, `390 ???뚯떇 移대뱶媛 ?먮옒 ?꾩껜 ??씠?? ${JSON.stringify(cardPair)}`);
      assert.equal(cardPair.gap, 8, `390 移대뱶 ?꾨옒? 竊???媛꾧꺽??8px?대떎: ${JSON.stringify(cardPair)}`);
      assert.equal(cardPair.textLines, 1, `390 ???뚯떇 移대뱶 臾멸뎄媛 ??以꾩씠?? ${JSON.stringify(cardPair)}`);
      assert.equal(cardPair.viewLines, 1, `390 蹂닿린 ?⑥텛 臾멸뎄媛 ??以꾩씠?? ${JSON.stringify(cardPair)}`);
      assert.match(cardPair.text, /\d+\.\d+\.\d+/, `390 移대뱶??理쒖떊 踰꾩쟾 湲?먭? 蹂댁씤?? ${JSON.stringify(cardPair)}`);
    }
    await raiseToast(page4);
    await take(page4, '??泥??붾㈃쨌?뚮┝ 以?);
    await lowerToast(page4);
    await page4.evaluate(() => document.body.classList.remove('lt-fab-ok'));
    // (2026-11-16) '?먮룞 怨듦컻 ?덈궡' ?좎뒪?몃뒗 吏덈Ц 李??꾨옒 '?섎윭蹂닿린 ?뚭컻 吏덈Ц' ?곹깭)?쇰줈 ??좏빐 ?④린吏 ?딅뒗??
    await page4.evaluate(() => document.getElementById('community-menu')?.click());
    await page4.waitForFunction(() => !!document.getElementById('community-panel')?.open, null, { timeout: 8000 }).catch(() => {});
    // #678 ?꾩냽(?뚯감 吏??: 諛섏쓳???녿뒗 移대뱶??0吏쒕━ 移????'諛섏쓳 ?④린湲? ??媛쒕쭔 蹂댁씤???섏튂濡??먯젙).
    await page4.waitForFunction(() => !!document.querySelector('.community-reaction-open'), null, { timeout: 8000 }).catch(() => {});
    await page4.waitForTimeout(400);
    const reactions = await page4.evaluate(() => ({
      open: document.querySelectorAll('.community-reaction-open').length,
      zeroChips: [...document.querySelectorAll('.community-reaction')].filter((b) => / 0$/.test(b.textContent.trim())).length
    }));
    assert.ok(reactions.open >= 1, '諛섏쓳???놁쑝硫?諛섏쓳 ?④린湲??⑥텛媛 蹂댁씤??);
    assert.equal(reactions.zeroChips, 0, '0吏쒕━ 諛섏쓳 移⑹? 蹂댁씠吏 ?딅뒗??);
    await take(page4, '?섎윭蹂닿린');
    // ?섏? 1?뚯감(261116,#728 ?꾩냽): ?덈꼍(KST 0~9?? UTC ?꾨궇)???댁? ?쒓컙???섎윭蹂닿린 移대뱶 ?좎쭨媛
    // UTC ?덈떒('2026. 11. 15')?쇰줈 ?섏솕????Asia/Seoul ?쒓컙? 臾몃㎘?먯꽌 ?쒓뎅 ?좎쭨濡?蹂댁씠?붿? ?섏튂濡??⑥젙?쒕떎.
    const ctxDate = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', timezoneId: 'Asia/Seoul' });
    await ctxDate.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctxDate.route('**://i.ytimg.com/**', THUMB);
    await ctxDate.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    const CROSSING = '2026-11-15T20:00:00.000Z'; // UTC濡쒕뒗 11-15, ?쒓뎅 ?쒓컙?쇰줈??11-16 05:00(0~9??援ш컙)
    await ctxDate.route('**/api/community/shares*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [Object.assign({}, COMMUNITY_CARDS[0], { createdAt: CROSSING, momentCount: 3 })], totalVisible: 1 }) }));
    const pageDate = await ctxDate.newPage();
    await pageDate.goto(`${base}/v41/`, { waitUntil: 'load' });
    await pageDate.waitForTimeout(1200);
    await pageDate.evaluate(() => document.getElementById('community-menu')?.click());
    await pageDate.waitForFunction(() => !!document.getElementById('community-panel')?.open, null, { timeout: 8000 }).catch(() => {});
    await pageDate.waitForFunction(() => !!document.querySelector('.community-card'), null, { timeout: 8000 }).catch(() => {});
    await pageDate.waitForTimeout(400);
    const cardDate = await pageDate.evaluate((crossing) => {
      const meta = [...document.querySelectorAll('.community-muted')].map((p) => p.textContent).find((t) => /媛??쒓컙/.test(t)) || '';
      const d = new Date(crossing);
      const localToday = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      return { meta, localToday };
    }, CROSSING);
    const utcCut = '2026. 11. 15';
    assert.ok(cardDate.meta.includes(cardDate.localToday.replace(/-/g, '. ')), `?덈꼍 ?쒓컙??移대뱶 ?좎쭨??吏???쒓뎅) ?좎쭨?????ㅼ젣 "${cardDate.meta}" / 湲곕? ${cardDate.localToday}`);
    assert.ok(!cardDate.meta.includes(utcCut), `移대뱶 ?좎쭨媛 UTC ?덈떒(?댁젣)?쇰줈 ?섏삩?? "${cardDate.meta}"`);
    await pageDate.screenshot({ path: 'E:/lovetree-qa/lane/local3-graph/audit-community-date-' + width + '.png', animations: 'disabled', timeout: 10000 }).catch(() => {});
    await ctxDate.close();
    // ?섎윭蹂닿린 ?뚭컻 吏덈Ц(2026-11-16 ???寃곗젙) ????怨꾩젙???ъ슫 異붽? 3踰덉㎏ ??μ뿉????踰?臾삳뒗??
    // [吏湲덉? ???좊옒?? ??discover false쨌?ㅼ떆 ??臾쇱쓬, [?뚭컻?섍린] ??discover true, 怨듭쑀 ???ㅼ쐞移섍? 媛숈? 媛?
    // 諛깊븘(?대? 3媛쑣룹냼媛?耳쒖쭚) 怨꾩젙? 臾살? ?딅뒗?? 李?紐⑥뼇(寃뱀묠쨌?섎┝ 0)? take媛 ?④퍡 ?곕떎.
    const oembed = (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ title: '寃?ш린 ?쒗뿕 ?곸긽', author_name: '?쒗뿕 梨꾨꼸', thumbnail_url: 'https://i.ytimg.com/vi/qaAsk001/hqdefault.jpg' }) });
    const openQuick = async (pageAsk) => {
      if (await pageAsk.evaluate(() => !!document.getElementById('write-panel')?.open)) return;
      // ??μ씠 ?앸궃 ??硫붾돱 ?대쫫??'竊??쒓컙 異붽?'濡??뚯븘???? ?곕떎 ??dirty 媛??explainSaveState)瑜??쇳븯?ㅻ뒗 ?湲곕떎.
      await pageAsk.waitForFunction(() => document.getElementById('write-menu')?.textContent === '竊??쒓컙 異붽?', null, { timeout: 10000 }).catch(() => {});
      await pageAsk.evaluate(() => document.getElementById('write-menu')?.click());
      await pageAsk.waitForFunction(() => !!document.getElementById('quick-url'), null, { timeout: 8000 });
    };
    const quickSave = async (pageAsk, url) => {
      await openQuick(pageAsk);
      await pageAsk.fill('#quick-url', url);
      await pageAsk.click('#quick-submit');
      await pageAsk.waitForTimeout(800);
    };
    const askFlow = async (answer) => {
      const ctxAsk = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      await ctxAsk.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
      await ctxAsk.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      await ctxAsk.route('**://i.ytimg.com/**', THUMB);
      const discoverPuts = [];
      await ctxAsk.route('**/api/workspace*', (r) => {
        if (r.request().method() === 'PUT') {
          const body = r.request().postDataJSON() || {};
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision: Number(body.expectedRevision || 0) + 1, subject: '寃?ш린怨꾩젙' }) });
        }
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [] }, subject: '寃?ш린怨꾩젙', writeSubjectBound: true, savedAt: '2026-11-16T09:00:00.000Z' }) });
      });
      await ctxAsk.route('**/api/youtube/oembed*', oembed);
      await ctxAsk.route('**/api/trees/*/discover', (r) => {
        if (r.request().method() === 'PUT') { const body = r.request().postDataJSON() || {}; discoverPuts.push(body.discover === true); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, treeId: 'askTree', discover: body.discover === true }) }); }
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, treeId: 'askTree', discover: discoverPuts[discoverPuts.length - 1] === true }) });
      });
      const pageAsk = await ctxAsk.newPage();
      await pageAsk.goto(base + '/v41/?account=1', { waitUntil: 'load' });
      await pageAsk.waitForTimeout(1200);
      await quickSave(pageAsk, 'https://www.youtube.com/watch?v=qaAsk01');
      await quickSave(pageAsk, 'https://www.youtube.com/watch?v=qaAsk02');
      await quickSave(pageAsk, 'https://www.youtube.com/watch?v=qaAsk03');
      // 3踰덉㎏ ??μ쓽 ?숆린????吏덈Ц 李쎌씠 ??踰??щ떎(2??).
      await pageAsk.waitForFunction(() => !!document.getElementById('discover-ask')?.open, null, { timeout: 15000 });
      await pageAsk.waitForTimeout(400);
      const buttons = await pageAsk.evaluate(() => [document.getElementById('discover-ask-yes')?.textContent, document.getElementById('discover-ask-no')?.textContent]);
      assert.deepEqual(buttons, ['?뚭컻?섍린', '吏湲덉? ???좊옒??], '吏덈Ц 李??⑥텛???뚭컻?섍린쨌吏湲덉? ???좊옒?붾떎');
      await take(pageAsk, '?섎윭蹂닿린 ?뚭컻 吏덈Ц'); // 寃뱀묠쨌?섎┝ 0 寃?ъ뿉 李쎌씠 ?④퍡 ?좊떎(390쨌1440 횞 諛ㅒ룹젙??
      await pageAsk.screenshot({ path: 'E:/lovetree-qa/lane/local3-graph/audit-discover-ask-' + width + '-' + theme + '.png', animations: 'disabled', timeout: 10000 }).catch(() => {});
      await pageAsk.evaluate((a) => document.getElementById(a === 'yes' ? 'discover-ask-yes' : 'discover-ask-no')?.click(), answer);
      await pageAsk.waitForFunction(() => !document.getElementById('discover-ask')?.open, null, { timeout: 8000 });
      assert.deepEqual(discoverPuts, [answer === 'yes'], '[?뚭컻?섍린]??true, [吏湲덉? ???좊옒????false濡???λ맂??);
      const asked = await pageAsk.evaluate(() => { try { return JSON.parse(localStorage.getItem('lt41.discoverAsked') || '[]'); } catch { return []; } });
      assert.ok(asked.length >= 1, '怨좊Ⅸ ?몃━??discoverAsked??湲곗뼲?쒕떎');
      return { ctxAsk, pageAsk, discoverPuts };
    };
    const addFourth = async (pageAsk) => {
      await quickSave(pageAsk, 'https://www.youtube.com/watch?v=qaAsk09');
      await pageAsk.waitForTimeout(1500);
      assert.equal(await pageAsk.evaluate(() => !!document.getElementById('discover-ask')?.open), false, '怨좊Ⅸ ??媛숈? ?몃━?먯꽌 ?ㅼ떆 臾살? ?딅뒗??);
    };
    const noAsk = await askFlow('no');
    await addFourth(noAsk.pageAsk);
    // 怨듭쑀 ???ㅼ쐞移? 爰쇱쭚 ?곹깭 臾몄옣쨌?⑥텛瑜?????耳쒓린 ??耳쒖쭚 ???ㅼ쐞移????곸옄 ????臾몄옣(?쒓컙 ???뚰듃쨌?곹깭)??媛숈? ?곹깭瑜?留먰븳??
    {
      const { ctxAsk, pageAsk, discoverPuts } = noAsk;
      await pageAsk.evaluate(() => document.getElementById('share-menu')?.click());
      await pageAsk.waitForFunction(() => !!document.getElementById('share-panel')?.open, null, { timeout: 8000 }).catch(() => {});
      await pageAsk.waitForFunction(() => (document.getElementById('share-discover-state')?.textContent || '').length > 0, null, { timeout: 8000 });
      await pageAsk.waitForTimeout(400);
      const box = () => pageAsk.evaluate(() => ({
        hint: document.getElementById('share-moment-hint')?.textContent || '',
        state: document.getElementById('share-discover-state')?.textContent || '',
        toggle: document.getElementById('share-discover-toggle')?.textContent || '',
        toggleState: document.getElementById('share-discover-toggle')?.dataset.state || ''
      }));
      const before = await box();
      assert.ok(before.state.includes('?뚭컻?섏? ?딆쓬'), '???좊옒?붾? 怨좊Ⅸ ?몃━??怨듭쑀 ?먯뿉?쒕룄 爰쇱졇 ?덈떎 ???ㅼ젣 "' + before.state + '"');
      assert.ok(before.hint.includes('?뚭컻?섏? ?딆븘??), '爰쇱쭚 ?곹깭?먯꽌 ?곸옄 泥?以??뚰듃)??媛숈? ?곹깭瑜?留먰븳?????ㅼ젣 "' + before.hint + '"');
      assert.equal(before.toggle, '?뚭컻 耳쒓린', '爰쇱쭊 ?몃━???ㅼ쐞移?湲?먮뒗 ?됰룞(?뚭컻 耳쒓린)??);
      assert.equal(before.toggleState, 'off', '爰쇱쭚? ?뚮몢由?紐⑥뼇(CSS媛 data-state濡?怨좊Ⅸ??');
      await take(pageAsk, '怨듭쑀 ?먃룹냼媛?爰쇱쭚');
      await pageAsk.screenshot({ path: 'E:/lovetree-qa/lane/local3-graph/audit-discover-panel-off-' + width + '-' + theme + '.png', animations: 'disabled', timeout: 10000 }).catch(() => {});
      await pageAsk.evaluate(() => document.getElementById('share-discover-toggle')?.click());
      await pageAsk.waitForFunction(() => (document.getElementById('share-discover-state')?.textContent || '').includes('?뚭컻 以?), null, { timeout: 8000 });
      assert.deepEqual(discoverPuts, [false, true], '怨듭쑀 ???ㅼ쐞移??뚭컻 耳쒓린)??discover PUT?쇰줈 ??ν븳??);
      await pageAsk.waitForTimeout(400);
      const after = await box();
      // ?ㅼ쐞移????곸옄 ??臾몄옣?ㅼ씠 媛숈? ?곹깭瑜?留먰븳??261116 2李?吏????泥?以꾩씠 ??媛믪뿉 癒몃Ъ??寃?.
      assert.ok(after.hint.includes('?뚭컻 以묒씠?먯슂'), '耳쒖쭚 ???뚰듃 以꾩씠 ??媛믪뿉 癒몃Ъ吏 ?딅뒗?????ㅼ젣 "' + after.hint + '"');
      assert.equal(after.toggle, '?뚭컻 ?꾧린', '耳쒖쭊 ?몃━???ㅼ쐞移?湲?먮뒗 ?됰룞(?뚭컻 ?꾧린)????媛믨낵 媛숇떎');
      assert.equal(after.toggleState, 'on', '耳쒖쭚? 媛뺤“??紐⑥뼇');
      await take(pageAsk, '怨듭쑀 ?먃룹냼媛?耳쒖쭚');
      await pageAsk.screenshot({ path: 'E:/lovetree-qa/lane/local3-graph/audit-discover-panel-on-' + width + '-' + theme + '.png', animations: 'disabled', timeout: 10000 }).catch(() => {});
      await ctxAsk.close();
    }
    const yesAsk = await askFlow('yes');
    await addFourth(yesAsk.pageAsk);
    await yesAsk.ctxAsk.close();
    // 諛깊븘 怨꾩젙(?대? 3媛쑣룹냼媛?耳쒖쭚) ??吏덈Ц ?놁씠 嫄대꼫?대떎.
    {
      const ctxBack = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      await ctxBack.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
      await ctxBack.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      await ctxBack.route('**://i.ytimg.com/**', THUMB);
      const now = '2026-11-16T09:00:00.000Z';
      const moments = [1, 2, 3].map((i) => ({ id: 'bm' + i, parentId: i === 1 ? null : 'bm' + (i - 1), links: [], createdAt: now, updatedAt: now, url: 'https://www.youtube.com/watch?v=qaBack00' + i, title: '諛깊븘 ?쒓컙 ' + i, note: '', emotion: '', date: '2026-11-1' + (2 + i) }));
      await ctxBack.route('**/api/workspace*', (r) => {
        if (r.request().method() === 'PUT') { const body = r.request().postDataJSON() || {}; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision: Number(body.expectedRevision || 0) + 1, subject: '寃?ш린怨꾩젙' }) }); }
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 2, state: { version: 1, trees: [{ id: 'askBackTree', subject: '寃?ш린 ?몃━', title: '寃?ш린 ?몃━ ?쒕ぉ', createdAt: now, updatedAt: now, coverMomentId: '', moments }] }, subject: '寃?ш린怨꾩젙', writeSubjectBound: true, savedAt: now }) });
      });
      await ctxBack.route('**/api/youtube/oembed*', oembed);
      await ctxBack.route('**/api/trees/*/discover', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, treeId: 'askBackTree', discover: true }) }));
      const pageBack = await ctxBack.newPage();
      await pageBack.goto(base + '/v41/?account=1', { waitUntil: 'load' });
      await pageBack.waitForTimeout(1200);
      await quickSave(pageBack, 'https://www.youtube.com/watch?v=qaBack09');
      await pageBack.waitForTimeout(1500);
      assert.equal(await pageBack.evaluate(() => !!document.getElementById('discover-ask')?.open), false, '諛깊븘(?대? ?뚭컻 耳쒖쭊) 怨꾩젙? 吏덈Ц ?놁씠 嫄대꼫?대떎');
      await ctxBack.close();
    }
    await ctxDate.close();
    // 瑗щ━??吏곸젒 遺숈씠湲?261116 ???吏?? ???쒖븞???녿뒗 ?곸긽???댁? 吏곹썑??瑗щ━??以?
    // ?묓옒쨌?ㅻ쪟 0??湲곕낯, [吏곸젒 遺숈씠湲?濡???以??쇱묠(44px 媛숈? ?믪씠쨌?덉떆 placeholder쨌媛쒕컻 ?⑹뼱 ?놁쓬),
    // 鍮?媛믪쑝濡?遺숈씠硫??ㅻ쪟 ??以? 'ILLIT'??遺숈씠硫?諛⑷툑 ?댁? ?쒓컙??'媛??ILLIT' ???#742? 媛숈? ?쒓컙 id).
    {
      const ctxTag = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      await ctxTag.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
      await ctxTag.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      await ctxTag.route('**://i.ytimg.com/**', THUMB);
      const tagSaves = []; // keywords媛 ?닿릿 ?쒓컙 湲곕줉({ momentId, keywords })
      const putMoments = []; // ?뚯감蹂?洹몃┝ 湲곕줉 ???뚯감 1???쒓컙怨??뚯감 2???쒓컙 id瑜?媛瑜몃떎
      await ctxTag.route('**/api/workspace*', (r) => {
        if (r.request().method() === 'PUT') {
          const body = r.request().postDataJSON() || {};
          const moments = [];
          for (const tree of body.state?.trees || []) for (const m of tree.moments || []) moments.push(m.id);
          putMoments.push(moments);
          for (const tree of body.state?.trees || []) for (const m of tree.moments || []) {
            if (Array.isArray(m.keywords) && m.keywords.length) tagSaves.push({ momentId: m.id, keywords: [...m.keywords] });
          }
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, revision: Number(body.expectedRevision || 0) + 1, subject: '寃?ш린怨꾩젙' }) });
        }
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [] }, subject: '寃?ш린怨꾩젙', writeSubjectBound: true, savedAt: '2026-11-16T09:00:00.000Z' }) });
      });
      await ctxTag.route('**/api/youtube/oembed*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ title: '?ㅼ뼱吏?먭퀬? #shorts', author_name: '?쒗뿕 梨꾨꼸' }) }));
      await ctxTag.route('**/api/trees/*/discover', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, treeId: 'tagTree', discover: false }) }));
      const pageTag = await ctxTag.newPage();
      await pageTag.goto(base + '/v41/?account=1', { waitUntil: 'load' });
      await pageTag.waitForTimeout(1200);
      const quickSaveOnce = async (n) => {
        await pageTag.evaluate(() => document.getElementById('write-menu')?.click());
        await pageTag.waitForFunction(() => !!document.getElementById('quick-url'), null, { timeout: 8000 });
        await pageTag.fill('#quick-url', 'https://www.youtube.com/watch?v=qaTag00' + n);
        await pageTag.click('#quick-submit');
        await pageTag.waitForTimeout(900);
      };
      await quickSaveOnce(1);
      await quickSaveOnce(2); // 媛숈? 李쎌뿉???곗냽 ?닿린 ??瑗щ━??以꾩? 諛⑷툑 ?댁?(??踰덉㎏) ?쒓컙??媛由ы궓??      await pageTag.waitForFunction(() => !!document.querySelector('#quick-tagline .lt-tagline'), null, { timeout: 10000 });
      // ?묓옒 湲곕낯: ?ㅻ쪟 0쨌?낅젰 以??놁쓬쨌?덈궡+[吏곸젒 遺숈씠湲?. 媛쒕컻 ?⑹뼱('醫낅쪟'쨌'媛?)??泥섏쓬遺???녿떎.
      const folded = await pageTag.evaluate(() => {
        const err = document.querySelector('#quick-tagline .lt-tagline-error');
        return {
          errorHidden: !err || err.hidden,
          row: !!document.querySelector('#quick-tagline .lt-tagline-kind'),
          toggle: !!document.querySelector('#quick-tagline .lt-tagline-toggle'),
          text: (document.querySelector('#quick-tagline')?.textContent || '').replace(/\\s+/g, ' ').trim()
        };
      });
      assert.equal(folded.errorHidden, true, '泥섏쓬 ?곹깭???ㅻ쪟媛 ?녿떎');
      assert.equal(folded.row, false, '吏곸젒 ?낅젰 移몄? ?묓? ?덈떎');
      assert.equal(folded.toggle, true, '[吏곸젒 遺숈씠湲?留?蹂댁씤??);
      assert.ok(folded.text.includes('媛?샕룸끂?섎? 遺숈뿬 ?먮㈃ ?섏쨷????덈줈 臾띠뿬??), '?쒖븞???놁쓣 ?뚮뒗 ?덈궡 ??以꾩씠 蹂댁씤?????ㅼ젣 "' + folded.text + '"');
      assert.ok(!/醫낅쪟|瑗щ━??媛?.test(folded.text), '?묓엺 留먯뿉 媛쒕컻 ?⑹뼱媛 ?녿떎 ???ㅼ젣 "' + folded.text + '"');
      await take(pageTag, '瑗щ━??吏곸젒 遺숈씠湲?);
      await pageTag.screenshot({ path: 'E:/lovetree-qa/lane/local3-graph/tagline-after-folded-' + width + '-' + theme + '.png', animations: 'disabled', timeout: 10000 }).catch(() => {});
      await pageTag.evaluate(() => document.querySelector('#quick-tagline .lt-tagline-toggle')?.click());
      await pageTag.waitForFunction(() => !!document.querySelector('#quick-tagline .lt-tagline-kind'), null, { timeout: 8000 });
      await pageTag.waitForTimeout(300);
      // ?쇱묠: ???붿냼 ?믪씠 媛숈쓬(44px)쨌placeholder ?덉떆쨌媛쒕컻 ?⑹뼱 0.
      const open = await pageTag.evaluate(() => {
        const els = ['.lt-tagline-kind', '.lt-tagline-value', '.lt-tagline-add'].map((sel) => document.querySelector('#quick-tagline ' + sel));
        const hs = els.map((el) => Math.round(el.getBoundingClientRect().height));
        const value = document.querySelector('#quick-tagline .lt-tagline-value');
        return { hs, placeholder: value?.placeholder || '', text: (document.querySelector('#quick-tagline')?.textContent || '').replace(/\\s+/g, ' ').trim() };
      });
      assert.ok(open.hs.every((h) => h >= 44) && (Math.max(...open.hs) - Math.min(...open.hs)) <= 1, '?쇱튇 ???붿냼???믪씠媛 媛숇떎(44px) ???ㅼ젣 ' + JSON.stringify(open.hs));
      assert.equal(open.placeholder, '?? ILLIT', '媛덈옒(媛?????덉떆媛 placeholder濡?蹂댁씤??);
      assert.ok(!/醫낅쪟|瑗щ━??媛?.test(open.text), '?쇱튇 留먯뿉??媛쒕컻 ?⑹뼱媛 ?녿떎 ???ㅼ젣 "' + open.text + '"');
      await pageTag.screenshot({ path: 'E:/lovetree-qa/lane/local3-graph/tagline-after-open-' + width + '-' + theme + '.png', animations: 'disabled', timeout: 10000 }).catch(() => {});
      // 鍮?媛믪쑝濡?[遺숈씠湲? ???ㅻ쪟 ??以?移?諛붾줈 ?꾨옒).
      await pageTag.evaluate(() => document.querySelector('#quick-tagline .lt-tagline-add')?.click());
      await pageTag.waitForFunction(() => { const e = document.querySelector('#quick-tagline .lt-tagline-error'); return !!e && !e.hidden; }, null, { timeout: 8000 });
      const errText = await pageTag.evaluate(() => document.querySelector('#quick-tagline .lt-tagline-error')?.textContent || '');
      assert.equal(errText, '遺숈씪 ?댁슜???곸뼱 二쇱꽭??', '鍮?媛??ㅻ쪟???뚮????뚮쭔 ??以꾨줈 蹂댁씤??);
      await take(pageTag, '瑗щ━??吏곸젒 遺숈씠湲?);
      await pageTag.screenshot({ path: 'E:/lovetree-qa/lane/local3-graph/tagline-after-error-' + width + '-' + theme + '.png', animations: 'disabled', timeout: 10000 }).catch(() => {});
      // 'ILLIT' 遺숈씠湲???諛⑷툑 ?댁? ?쒓컙??'媛??ILLIT' ???泥??쒓컙???꾨땲????#742? 媛숈? ?쒓컙 id).
      await pageTag.fill('#quick-tagline .lt-tagline-value', 'ILLIT');
      await pageTag.evaluate(() => document.querySelector('#quick-tagline .lt-tagline-add')?.click());
      await pageTag.waitForFunction(() => { const c = [...document.querySelectorAll('#quick-tagline .lt-tag-chip.is-confirmed')]; return c.some((x) => x.textContent.includes('ILLIT')); }, null, { timeout: 10000 });
      await pageTag.waitForTimeout(1200); // ???PUT源뚯?
      const firstRound = putMoments[0] || [], secondRound = putMoments[putMoments.length - 1] || [];
      const addedNow = secondRound.find((id) => !firstRound.includes(id));
      assert.ok(addedNow, '??踰덉㎏ ?닿린?먯꽌 ???쒓컙 id瑜?媛由곕떎 ??' + JSON.stringify({ firstRound, secondRound }));
      const save = tagSaves[tagSaves.length - 1];
      assert.ok(save && save.momentId === addedNow, '瑗щ━?쒕뒗 諛⑷툑 ?댁? ?쒓컙????λ맂??#742? 媛숈? ?쒓컙 id) ???ㅼ젣 ' + JSON.stringify(save));
      assert.deepEqual(save.keywords, ['媛??ILLIT'], '媛덈옒? 媛믪쓣 遺숈뿬 ??ν븳??);
      await ctxTag.close();
    }
    await page4.keyboard.press('Escape');    await page4.keyboard.press('Escape');
    await page4.waitForTimeout(300);
    await page4.evaluate(() => document.getElementById('feedback-panel').showModal());
    await page4.waitForTimeout(400);
    await take(page4, '?섍껄 李승룸낫?닿린 ??);
    await page4.selectOption('#feedback-category', 'bug');
    await page4.fill('#feedback-body', '?붾㈃ 怨듯넻 寃?ш린 ?쒗뿕 臾몄옣?낅땲??);
    await page4.click('#feedback-send');
    await page4.waitForFunction(() => !document.getElementById('feedback-done')?.hidden, null, { timeout: 8000 });
    await page4.waitForTimeout(300);
    await take(page4, '?섍껄 李승룸낫????);
    await page4.keyboard.press('Escape');
    await page4.waitForTimeout(400);
    // #638: ???뚯떇 ?쇱묠 ???쇱튇 ???뚯떇 紐⑸줉?먯꽌 寃뱀묠쨌?묒? 湲?먭? 0?몄?.
    await page4.evaluate(() => document.getElementById('updates-link')?.click());
    await page4.waitForFunction(() => !!document.getElementById('updates-panel')?.open, null, { timeout: 8000 }).catch(() => {});
    await page4.waitForTimeout(500);
    const footerWhileOpen = await page4.evaluate(() => {
      const links = document.querySelector('.home-links'), card = document.getElementById('updates-card'), fab = document.getElementById('mobile-add');
      const foot = document.querySelector('#updates-panel .updates-foot');
      const text = document.querySelector('#updates-panel .updates-version');
      const box = (el) => { const r = el?.getBoundingClientRect(); return r && { width: r.width, height: r.height }; };
      return { linksDisplay: links && getComputedStyle(links).display, links: box(links), card: box(card), fab: box(fab), foot: box(foot), text: box(text) };
    });
    assert.equal(footerWhileOpen.linksDisplay, 'none', `李쎌씠 ?대━硫??꾨옒 留곹겕 以꾩쓣 ?④릿?? ${JSON.stringify(footerWhileOpen)}`);
    assert.equal(footerWhileOpen.links?.width, 0, `李쎌씠 ?대━硫??꾨옒 留곹겕 以꾩쓽 ?붾㈃ ??씠 0?대떎: ${JSON.stringify(footerWhileOpen)}`);
    assert.ok(footerWhileOpen.foot?.width > 0 && footerWhileOpen.text?.width > 0, `???뚯떇 李?媛먯궗 ????リ린 以꽷룸낯臾????붾㈃???덈떎: ${JSON.stringify(footerWhileOpen)}`);
    await take(page4, '???뚯떇 ?쇱묠');
    // #638: '?덈줈?뚯쭊 寃?쨌'怨좎튇 寃? ?쒕ぉ? ??踰꾩쟾????踰???異쒖쿂 臾띠쓬留덈떎 ?섑??대릺吏 ?딅뒗???섏튂濡??먯젙).
    const repeats = await page4.evaluate(() => {
      const out = [];
      for (const v of document.querySelectorAll('.updates-version')) {
        const counts = new Map();
        for (const h of v.querySelectorAll('.updates-kind h3')) counts.set(h.textContent.trim(), (counts.get(h.textContent.trim()) || 0) + 1);
        for (const [t, n] of counts) if (n > 1) out.push(`${v.getAttribute('data-updates-version')} 踰꾩쟾 "${t}" ${n}踰?);
      }
      return out;
    });
    for (const r of repeats) rows.push({ ??ぉ: '?섑???, 以? `???뚯떇 ?쇱묠 ?쒕ぉ ?섑???${r} 쨌 ${width}쨌${theme}` });
    // ???뚯떇 李??リ린 洹쒖튃(2026-11-16 ???吏??: 癒몃━ 怨좎젙 횞(aria-label '?リ린')쨌留??꾨옒 '?リ린'쨌Esc.
    // 鍮꾨え?ъ씠???대┛ 梨???硫붾돱瑜??꾨Ⅴ硫?李쎌씠 ?ロ엳怨??대룞?쒕떎(?꾨옒 寃뱀튇 李??リ린?먯꽌 媛숈씠 ?곕떎).
    const closeTop = await page4.evaluate(() => {
      const close = document.querySelector('#updates-panel .panel-heading .close');
      if (!close) return null;
      const r = close.getBoundingClientRect();
      return { label: close.getAttribute('aria-label'), visible: r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight };
    });
    assert.deepEqual(closeTop, { label: '?リ린', visible: true }, '???뚯떇 李?癒몃━???リ린 횞媛 ?ㅽ겕濡ㅺ낵 臾닿??섍쾶 蹂댁씠怨?aria-label? ?リ린??);
    await page4.evaluate(() => { const p = document.getElementById('updates-panel'); if (p) p.scrollTop = p.scrollHeight; });
    await page4.waitForTimeout(300);
    const closeBottom = await page4.evaluate(() => {
      const rows = [...document.querySelectorAll('#updates-panel .updates-foot button')];
      const bottom = rows[rows.length - 1];
      if (!bottom) return null;
      const r = bottom.getBoundingClientRect();
      return { text: bottom.textContent.trim(), visible: r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight };
    });
    assert.deepEqual(closeBottom, { text: '?リ린', visible: true }, '???뚯떇 李?留??꾨옒?먮룄 ?リ린媛 蹂댁씤??);
    await take(page4, '???뚯떇 ?リ린 踰꾪듉');
    // 寃뱀튇 李??リ린(2026-11-16 ???吏??: ???뚯떇(鍮꾨え?? ?꾩뿉錫?링錫곻옙李?怨듭쑀 紐⑸줉쨌紐⑤떖)???꾩슦怨?Esc ??    // 留???李??섎굹留??ロ엺??怨듭쑀 紐⑸줉 ?ロ옒쨌???뚯떇? ?⑥쓬) ??Esc ??踰????????뚯떇 ?ロ옒.
    // 癒몃━ 硫붾돱(怨듭쑀 紐⑸줉 ?⑥텛)??'李쎌씠 ?대┛ 梨??꾨Ⅴ硫?李??リ퀬 ?대룞' 洹쒖튃????곸씠?? 寃뱀튇 李??쒗뿕? 硫붾돱瑜?嫄곗튂吏 ?딄퀬 吏곸젒 ?꾩슫??
    await page4.evaluate(() => document.getElementById('community-panel')?.showModal());
    await page4.waitForFunction(() => !!document.getElementById('community-panel')?.open, null, { timeout: 8000 }).catch(() => {});
    await page4.keyboard.press('Escape');
    await page4.waitForTimeout(500);
    const afterFirst = await page4.evaluate(() => ({ community: !!document.getElementById('community-panel')?.open, updates: !!document.getElementById('updates-panel')?.open }));
    assert.deepEqual(afterFirst, { community: false, updates: true }, 'Esc 1?뚮뒗 留???李?怨듭쑀 紐⑸줉) ?섎굹留??ル뒗???????뚯떇? ?⑤뒗??);
    await take(page4, '寃뱀튇 李??リ린');
    await page4.keyboard.press('Escape');
    await page4.waitForTimeout(500);
    const afterSecond = await page4.evaluate(() => ({ updates: !!document.getElementById('updates-panel')?.open }));
    assert.deepEqual(afterSecond, { updates: false }, 'Esc 2?뚯감?????뚯떇 李쎌씠 ?ロ엺??留???李??섎굹 洹쒖튃)');
    await page4.keyboard.press('Escape');
    await page4.waitForTimeout(400);
    // #638: ???섍껄 紐⑸줉 ??媛吏?寃뚯떆臾쇰줈 ?곹깭 留먃룹텧泥?臾띠쓬??洹몃젮吏?紐⑸줉??寃?ы븳??
    await page4.evaluate(() => document.getElementById('account-my-posts')?.onclick?.());
    await page4.waitForFunction(() => !!document.getElementById('myposts-panel')?.open, null, { timeout: 8000 }).catch(() => {});
    await page4.waitForTimeout(500);
    // #678 ?꾩냽(?뚯감 吏??: ???섍껄 癒몃━ 以꾩뿉 ?댁쁺?쇳꽣? 媛숈? ?섍껄 踰덊샇(#N)媛 ?묎쾶 蹂댁씤??
    const nos = await page4.evaluate(() => [...document.querySelectorAll('.myposts-no')].map((n) => n.textContent.trim()));
    assert.deepEqual(nos, ['#1', '#2', '#3', '#4', '#5'], '寃뚯떆臾쇰쭏???섍껄 踰덊샇(#N)媛 蹂댁씤??);
    await take(page4, '???섍껄 紐⑸줉');
    // #678 ?꾩냽 B: ???㏓텤??怨좎튂湲??대┝ ??怨좎튂湲곕? ?뚮윭 ?낅젰移몄씠 ?대┛ ?먮━. ???㏓텤?꾩뿉留??⑥텛媛 ?덇퀬
    // 怨좎튇 ?㏓텤?꾩뿉??(怨좎묠) ?쒖떆媛 遺숈쑝硫? ?댁쁺?쇳꽣 ?듬??먮뒗 ?⑥텛媛 ?녿뒗 寃껉퉴吏 ???붾㈃?먯꽌 蹂몃떎.
    const editButtons = await page4.locator('.myposts-reply-btn[data-reply-edit]').count();
    assert.equal(editButtons, 2, '???㏓텤???섏뿉留?怨좎튂湲??⑥텛媛 ?덈떎(?댁쁺?쇳꽣 ?듬??먮뒗 ?녿떎)');
    assert.equal(await page4.locator('.myposts-reply-edited').count(), 1, '怨좎튇 ?㏓텤?꾩뿉 (怨좎묠) ?쒖떆媛 ?섎굹 ?덈떎');
    // ?⑥텛???㏓텤??癒몃━ 以??덉뿉 ?덇퀬, 寃됰え?묒? ?묒븘???꾨쫫 ?곸뿭? 44px ?댁긽?대떎(?섏튂濡??먯젙).
    const buttons = await page4.evaluate(() => {
      const list = [...document.querySelectorAll('.myposts-reply-head .myposts-reply-btn')];
      const rects = list.map(b => b.getBoundingClientRect());
      return { count: list.length, inHead: list.every(b => b.closest('.myposts-reply-head')), minH: Math.round(Math.min(...rects.map(r => r.height))), minW: Math.round(Math.min(...rects.map(r => r.width))) };
    });
    assert.equal(buttons.count, 4, '怨좎튂湲걔룹??곌린 ?⑥텛 ??媛????㏓텤????媛 紐⑤몢 癒몃━ 以??덉뿉 ?덈떎');
    assert.equal(buttons.inHead, true, '?⑥텛??遺紐⑤뒗 ?㏓텤??癒몃━ 以꾩씠??);
    assert.ok(buttons.minH >= 44 && buttons.minW >= 44, `?꾨쫫 ?곸뿭 44px ?댁긽(理쒖냼 ${buttons.minW}횞${buttons.minH}px)`);
    await page4.locator('.myposts-reply-btn[data-reply-edit]').first().click();
    // 怨좎튂湲?以묒뿉???먮옒 ?㏓텤??移대뱶媛 ?⑤뒗??媛숈? 湲????踰?蹂댁씠吏 ?딄쾶).
    await page4.waitForFunction(() => !!document.querySelector('.myposts-reply-edit input'), null, { timeout: 8000 });
    await page4.waitForTimeout(400);
    const editState = await page4.evaluate(() => {
      const editInput = document.querySelector('.myposts-reply-edit input');
      const hiddenBoxes = [...document.querySelectorAll('.myposts-reply')].filter(b => b.hidden);
      return { open: Boolean(editInput), hiddenCount: hiddenBoxes.length };
    });
    assert.equal(editState.open, true, '怨좎튂湲??낅젰移몄씠 ?대젮 ?덈떎');
    assert.equal(editState.hiddenCount, 1, '怨좎튂???㏓텤??移대뱶 ?섎굹媛 ?⑤뒗??);
    await take(page4, '???섍껄 ?㏓텤??怨좎튂湲??대┝');
    await ctx4.close();

    // 2026-11-17: ?댁쁺?쇳꽣 '?쒕늿?? ???レ옄 4?Β룻븷 ??3?μ씠 1440쨌1920?먯꽌 媛곴컖 ??以? 390? 以꾨컮轅?媛濡??섏묠 0),
    // 紐⑤뱺 移대뱶媛 媛숈? ?꾨쫫 紐⑥뼇(role쨌tabindex쨌44px ?댁긽)?닿퀬, ??씠 ?덈뒗 移대뱶??洹???쓣 議곌굔?쇰줈 ?대ŉ
    // ??씠 ?녿뒗 移대뱶???댁뿭???쇱튇???ㅼ떆 ?꾨Ⅴ硫??묓옒). 愿由ъ옄 ?몄뀡? 媛吏?API(?묐떟 紐⑦삎)濡?留뚮뱺??
    const ctxAdm = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctxAdm.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctxAdm.route('**://i.ytimg.com/**', THUMB);
    await ctxAdm.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctxAdm.route('**/api/admin/session', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, authenticated: true, admin: true, role: 'admin' }) }));
    await ctxAdm.route('**/api/admin/feedback', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, feedback: [
      { id: 'f1', kind: 'opinion', status: 'received', replyCount: 0, createdAt: '2026-11-14T09:00:00.000Z', displayTitle: '瑗щ━?쒓? ??遺숈뼱??, issueNumber: 741 },
      { id: 'f2', kind: 'opinion', status: 'fixed', replyCount: 2, createdAt: '2026-11-13T09:00:00.000Z', displayTitle: '?몄쭛 李?瑗щ━??, issueNumber: 736 },
      { id: 'f3', kind: 'journal', status: 'reviewing', replyCount: 0, createdAt: '2026-11-12T09:00:00.000Z', displayTitle: '?ㅻ뒛 ?ъ슜 ?쇱?', issueNumber: null }
    ] }) }));
    await ctxAdm.route('**/api/admin/journals', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, journals: [] }) }));
    await ctxAdm.route('**/api/community/admin/reports', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, reports: [
      { id: 'r1', status: 'open', reason: '?쒗뿕 ?좉퀬', shareId: 'share-1', createdAt: '2026-11-14T10:00:00.000Z', hidden: false }
    ] }) }));
    await ctxAdm.route('**/api/admin/stats', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, stats: {
      checkedAt: '2026-11-16T00:00:00.000Z', window: { days: 7, since: '2026-11-09T00:00:00.000Z' },
      accounts: { total: 8, real: 2, aiTester: 4, tester: 2, new: { total: 3, real: 1, aiTester: 1, tester: 1 } },
      trees: { total: 9, real: 4, aiTester: 3, tester: 2, titles: ['媛???몃옒', '寃⑥슱 ?곗콉', '遊꾩쓽 湲곕줉'], public: { total: 3, real: 2, aiTester: 1, tester: 0, titles: ['媛???몃옒', '遊꾩쓽 湲곕줉'] }, featured: { total: 1, real: 1, aiTester: 0, tester: 0, titles: ['媛???몃옒'] } },
      moments: { total: 40, real: 21, aiTester: 12, tester: 7, new: { total: 6, real: 3, aiTester: 2, tester: 1 } }
    } }) }));
    await ctxAdm.route('**://api.github.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ number: 736, title: '?쒗뿕 ?댁뒋', state: 'open' }) }));
    const pageAdm = await ctxAdm.newPage();
    await pageAdm.goto(`${base}/admin.html`, { waitUntil: 'load' });
    await pageAdm.waitForFunction(() => document.querySelectorAll('.lt-stats .lt-stat').length === 4 && document.querySelectorAll('.lt-ov-cards .lt-ov-card').length === 3, null, { timeout: 20000 });
    await pageAdm.waitForTimeout(400);
    const adminCards = await pageAdm.evaluate(() => {
      const stat = [...document.querySelectorAll('.lt-stats .lt-stat')];
      const todo = [...document.querySelectorAll('.lt-ov-cards .lt-ov-card')];
      const all = [...stat, ...todo];
      const rects = all.map((el) => el.getBoundingClientRect());
      const flat = (el) => el.textContent.replace(/\s+/g, ' ').trim();
      return {
        statCount: stat.length, todoCount: todo.length,
        statTops: [...new Set(stat.map((el) => Math.round(el.getBoundingClientRect().top)))],
        todoTops: [...new Set(todo.map((el) => Math.round(el.getBoundingClientRect().top)))],
        minW: Math.round(Math.min(...rects.map((r) => r.width))), minH: Math.round(Math.min(...rects.map((r) => r.height))),
        roles: all.map((el) => el.getAttribute('role')), tabs: all.map((el) => el.getAttribute('tabindex')),
        cursors: [...new Set(all.map((el) => getComputedStyle(el).cursor))],
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        firstStatText: flat(stat[0]),
        treeCardText: flat(stat.find((el) => el.dataset.statToggle === 'public-trees'))
      };
    });
    assert.equal(adminCards.statCount, 4, '?꾩껜 ?レ옄 移대뱶 4媛?);
    assert.equal(adminCards.todoCount, 3, '泥섎━????移대뱶 3媛?);
    if (width >= 1440) {
      assert.equal(adminCards.statTops.length, 1, `?꾩껜 ?レ옄 移대뱶媛 ??以꾩씠??移대뱶 ??醫뚰몴 ${JSON.stringify(adminCards.statTops)})`);
      assert.equal(adminCards.todoTops.length, 1, `泥섎━????移대뱶媛 ??以꾩씠??移대뱶 ??醫뚰몴 ${JSON.stringify(adminCards.todoTops)})`);
    }
    assert.equal(adminCards.overflow, 0, `?댁쁺?쇳꽣 媛濡??섏묠 0(?ㅼ젣 ${adminCards.overflow}px)`);
    assert.ok(adminCards.minH >= 44 && adminCards.minW >= 44, `移대뱶 ?꾨쫫 ?곸뿭 44px ?댁긽(理쒖냼 ${adminCards.minW}횞${adminCards.minH}px)`);
    assert.deepEqual(adminCards.roles, Array(7).fill('button'), '紐⑤뱺 移대뱶媛 role=button?대떎');
    assert.deepEqual(adminCards.tabs, Array(7).fill('0'), '紐⑤뱺 移대뱶媛 tabindex=0?대떎(?ㅻ낫?쒕줈 ?곕떎)');
    assert.deepEqual(adminCards.cursors, ['pointer'], `紐⑤뱺 移대뱶媛 媛숈? ?꾨쫫 紐⑥뼇(而ㅼ꽌 ${JSON.stringify(adminCards.cursors)})`);
    // ?レ옄 ?? ???レ옄媛 '?ㅼ젣 怨좉컼'?닿퀬, ?꾩껜 = ?ㅼ젣 + AI + ?쒗뿕??移대뱶 ?덉뿉 ?④퍡 ?곷뒗??
    assert.ok(adminCards.firstStatText.includes('?ㅼ젣 怨좉컼'), `???レ옄媛 臾댁뾿???몃뒗吏 移대뱶 ?덉뿉 ?곷뒗???ㅼ륫: ${adminCards.firstStatText})`);
    assert.ok(adminCards.firstStatText.includes('?꾩껜 8') && adminCards.firstStatText.includes('AI 4') && adminCards.firstStatText.includes('?쒗뿕 2'), `?꾩껜 = ?ㅼ젣+AI+?쒗뿕???④퍡 ?곷뒗???ㅼ륫: ${adminCards.firstStatText})`);
    assert.ok(adminCards.treeCardText.includes('?꾩껜 3'), `怨듦컻 ?몃━ 移대뱶???꾩껜瑜??④퍡 ?곷뒗???ㅼ륫: ${adminCards.treeCardText})`);
    await take(pageAdm, '?댁쁺?쇳꽣 ?쒕늿??);

    // 1920?먯꽌????臾띠쓬??媛곴컖 ??以꾩씠??#743 ????붿껌).
    if (width >= 1440) {
      await pageAdm.setViewportSize({ width: 1920, height: 1080 });
      await pageAdm.waitForTimeout(400);
      const wide = await pageAdm.evaluate(() => ({
        statTops: [...new Set([...document.querySelectorAll('.lt-stats .lt-stat')].map((el) => Math.round(el.getBoundingClientRect().top)))],
        todoTops: [...new Set([...document.querySelectorAll('.lt-ov-cards .lt-ov-card')].map((el) => Math.round(el.getBoundingClientRect().top)))],
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
      }));
      assert.equal(wide.statTops.length, 1, `1920 ?꾩껜 ?レ옄 ??以??ㅼ륫 ${JSON.stringify(wide.statTops)})`);
      assert.equal(wide.todoTops.length, 1, `1920 泥섎━??????以??ㅼ륫 ${JSON.stringify(wide.todoTops)})`);
      assert.equal(wide.overflow, 0, `1920 媛濡??섏묠 0(?ㅼ젣 ${wide.overflow}px)`);
      await pageAdm.setViewportSize({ width, height });
      await pageAdm.waitForTimeout(300);
    }

    // ??씠 ?녿뒗 移대뱶(?꾩껜 ?レ옄)???댁뿭???쇱퀜吏怨? ?ㅼ떆 ?꾨Ⅴ硫??묓엺?? Enter濡쒕룄 ?대┛??
    const expand = await pageAdm.evaluate(() => {
      const card = document.querySelector('[data-stat-toggle="trees"]');
      card.click();
      const detail = document.getElementById('stat-detail-trees');
      const open = { hidden: detail.hidden, expanded: card.getAttribute('aria-expanded'), titles: detail.querySelectorAll('.lt-stat-titles li').length, split: detail.querySelectorAll('.lt-stat-split li').length, text: detail.textContent.replace(/\s+/g, ' ').trim() };
      card.click();
      const closed = { hidden: detail.hidden, expanded: card.getAttribute('aria-expanded') };
      return { open, closed };
    });
    assert.deepEqual([expand.open.hidden, expand.open.expanded], [false, 'true'], '??씠 ?녿뒗 移대뱶瑜??꾨Ⅴ硫??댁뿭???쇱퀜吏꾨떎');
    assert.equal(expand.open.titles, 3, `?몃━ 移대뱶 ?댁뿭???쒕ぉ 紐⑸줉(理쒕? 20)??蹂댁씤???ㅼ륫 ${expand.open.titles}媛?`);
    assert.equal(expand.open.split, 3, '?댁뿭???ㅼ젣 怨좉컼쨌AI 紐낆삁?뚯썝쨌?쒗뿕 怨꾩젙 媛덈옒 ?섍? ?덈떎');
    assert.ok(expand.open.text.includes('AI 紐낆삁?뚯썝') && !/@/.test(expand.open.text), '?댁뿭???대찓??媛숈? 媛쒖씤?뺣낫???녿떎');
    assert.deepEqual([expand.closed.hidden, expand.closed.expanded], [true, 'false'], '?ㅼ떆 ?꾨Ⅴ硫??댁뿭???묓엺??);
    await pageAdm.focus('[data-stat-toggle="accounts"]');
    await pageAdm.keyboard.press('Enter');
    await pageAdm.waitForTimeout(200);
    const byEnter = await pageAdm.evaluate(() => ({ hidden: document.getElementById('stat-detail-accounts').hidden, expanded: document.querySelector('[data-stat-toggle="accounts"]').getAttribute('aria-expanded') }));
    assert.deepEqual([byEnter.hidden, byEnter.expanded], [false, 'true'], 'Enter濡쒕룄 ?댁뿭???쇱퀜吏꾨떎');
    await pageAdm.keyboard.press('Enter');
    await pageAdm.waitForTimeout(200);

    // ??씠 ?덈뒗 移대뱶??洹???쓣 ?대떦 議곌굔?쇰줈 嫄몃윭 ?곕떎(二쇱냼??議곌굔???⑤뒗??.
    const jump = async (selector) => {
      await pageAdm.evaluate(() => { location.hash = '#overview'; });
      await pageAdm.waitForFunction(() => document.querySelectorAll('.lt-ov-cards .lt-ov-card').length === 3, null, { timeout: 8000 });
      await pageAdm.click(selector);
      await pageAdm.waitForFunction(() => location.hash !== '#overview', null, { timeout: 8000 });
      await pageAdm.waitForTimeout(200);
      return pageAdm.evaluate(() => ({ hash: location.hash, filterNote: !!document.querySelector('[data-clear-filter]') }));
    };
    const pending = await jump('[data-ov-view="board"][data-ov-status="pending"]');
    assert.equal(pending.hash, '#board?status=pending', `泥섎━ ?湲?移대뱶 ??怨좉컼 湲 ??쓽 泥섎━ ?湲??ㅼ젣 ${pending.hash})`);
    const unanswered = await jump('[data-ov-unanswered="1"]');
    assert.equal(unanswered.hash, '#board?unanswered=1', `?듦? 0 移대뱶 ???듦? 0留?嫄곕Ⅸ 怨좉컼 湲(?ㅼ젣 ${unanswered.hash})`);
    assert.equal(unanswered.filterNote, true, '嫄곕Ⅸ 議곌굔??吏?곕뒗 ?⑥텛媛 ?④퍡 蹂댁씤??);
    // 2026-11-17: ????移대뱶留??⑥븯怨??좉퀬쨌怨좎튂????移대뱶???녿떎(怨좉컼 湲 嫄곕Ⅴ湲곕줈 ???).
    assert.equal(await pageAdm.locator('[data-ov-view="reports"]').count(), 0, '?좉퀬 移대뱶 ?놁쓬');
    assert.equal(await pageAdm.locator('[data-ov-view="issues"]').count(), 0, '怨좎튂????移대뱶 ?놁쓬');
    // ?ㅻ낫??Space)濡쒕룄 ?⑥? 移대뱶媛 ?대┛??
    await pageAdm.evaluate(() => { location.hash = '#overview'; });
    await pageAdm.waitForFunction(() => document.querySelectorAll('.lt-ov-cards .lt-ov-card').length === 3, null, { timeout: 8000 });
    await pageAdm.focus('[data-ov-view="board"][data-ov-status="pending"]');
    await pageAdm.keyboard.press(' ');
    await pageAdm.waitForFunction(() => location.hash.startsWith('#board?status='), null, { timeout: 8000 });
    assert.equal(await pageAdm.evaluate(() => location.hash), '#board?status=pending', 'Space濡쒕룄 移대뱶媛 ?대┛??);
    await ctxAdm.close();

    // #666 2踰? 怨꾩젙 硫붾돱媛 ?대┛ ?먮━?먯꽌 泥??몃━ ?덈궡媛 硫붾돱瑜???? ?딅뒗????踰덉뿉 ?섎굹留?.
    // ?덈궡媛 ?④퀬 硫붾돱媛 ?대━硫??덈궡瑜??좎떆 ?묎퀬, 硫붾돱瑜??レ쑝硫??ㅼ떆 ?⑤뒗 寃껉퉴吏 ?뺤씤?쒕떎.
    const ctx5 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx5.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx5.route('**://i.ytimg.com/**', THUMB);
    await ctx5.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx5.route('**/api/workspace**', (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ revision: 1, state: { version: 1, trees: [firstTree], prefs: {} }, subject: '?쒗뿕怨꾩젙', writeSubjectBound: true, savedAt: '2026-11-15T09:00:00.000Z' })
    }));
    await ctx5.route('**/api/trees/*/discover*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, discover: true }) }));
    const page5 = await ctx5.newPage();
    // ?account=1 ? '??湲곕줉??遺덈윭?ㅻ뒗 ?먮━'?쇰뒗 ?쒖떆??shouldLoadMemberRecords) ??濡쒓렇???붾㈃?쇰줈 媛吏 ?딄퀬 湲곕줉???쎈뒗??
    await page5.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await page5.waitForFunction(() => { const a = document.getElementById('account-avatar'); return a && !a.hidden; }, null, { timeout: 20000 });
    await page5.waitForFunction(() => !document.getElementById('tree-tips')?.hidden, null, { timeout: 8000 });
    await page5.click('#account-avatar');
    await page5.waitForFunction(() => !document.getElementById('account-popover')?.hidden, null, { timeout: 8000 });
    await page5.waitForTimeout(300);
    const both = await page5.evaluate(() => ({ tips: !document.getElementById('tree-tips').hidden, pop: !document.getElementById('account-popover').hidden }));
    assert.equal(both.pop, true, '怨꾩젙 硫붾돱媛 ?대졇??);
    assert.equal(both.tips, false, '硫붾돱媛 ?대젮 ?덈뒗 ?숈븞 泥??몃━ ?덈궡???묓? ?덈떎(??踰덉뿉 ?섎굹留?蹂댁씤??');
    await take(page5, '怨꾩젙 硫붾돱쨌泥??몃━ ?덈궡');
    // ?묒뿀?ㅺ퀬 '遊ㅼ쓬'?쇰줈 ?곸? ?딅뒗????硫붾돱瑜??レ쑝硫??덈궡媛 洹몃?濡??뚯븘?⑤떎.
    await page5.click('#account-avatar');
    await page5.waitForTimeout(400);
    const after = await page5.evaluate(() => ({ tips: !document.getElementById('tree-tips').hidden, pop: !document.getElementById('account-popover').hidden, seen: localStorage.getItem('lt41.tips.firstTree') || '' }));
    assert.deepEqual({ tips: after.tips, pop: after.pop }, { tips: true, pop: false }, '硫붾돱瑜??レ쑝硫??덈궡媛 ?ㅼ떆 ?щ떎(遊ㅼ쓬 泥섎━?섏? ?딆쓬)');
    assert.notEqual(after.seen, '1', '?묒뿀?ㅺ퀬 遊ㅼ쓬?쇰줈 ?곸? ?딅뒗??);
    // #678 ?꾩냽(瑗щ━??嫄몃윭 蹂닿린): ?몃━ 硫붾돱?????쒓컙 ?꾩껜 蹂닿린濡???蹂닿린瑜??대㈃ ?쒓컙 紐⑸줉??    // 泥섏쓬遺???대┛??#394 寃쎈줈). ?붾㈃ ?먭? 怨꾩젙? ?쒓컙 ?ㅼ꽢 媛쒖씠硫? 泥??쒓컙??瑗щ━?쒕줈 嫄몃윭 蹂대뒗 寃껊룄 ?뺤씤?쒕떎.
    // ?몄쓽 蹂닿린 ?꾨젅?꾩? src媛 鍮?梨??댁슜??梨꾩썙吏誘濡?    // ?꾨젅?꾩쓣 URL???꾨땲???댁슜(orbit ?쒓컙 紐⑸줉 ?⑥텛)?쇰줈 李얜뒗????留??④퀎 ?ㅼ떆 李얜뒗??
    // ???곹깭?먯꽌留??쒓컙 ?ㅼ꽢 媛쒖쭨由??몃━瑜??대떎 ?????곹깭??泥??몃━ ?덈궡)? '?몃━ ?섎굹쨌?쒓컙 ?섎굹' 議곌굔?대씪 洹몃?濡??붾떎.
    const fiveMomentRoute = (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ revision: 1, state: { version: 1, trees: [fiveMomentTree], prefs: {} }, subject: '?쒗뿕怨꾩젙', writeSubjectBound: true, savedAt: '2026-11-15T09:00:00.000Z' })
    });
    await ctx5.route('**/api/workspace**', fiveMomentRoute);
    const page5b = await ctx5.newPage();
    await page5b.addInitScript(() => localStorage.removeItem('lt41.updatesCardDay'));
    await page5b.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await page5b.waitForFunction(() => { const a = document.getElementById('account-avatar'); return a && !a.hidden; }, null, { timeout: 20000 });
    await page5b.waitForFunction(() => { const t = document.getElementById('toast'); return t && !t.hidden; }, null, { timeout: 8000 });
    await page5b.waitForFunction(() => { const c = document.getElementById('updates-card'); return c && !c.hidden; }, null, { timeout: 10000 });
    await page5b.click('#record-menu');
    await page5b.waitForFunction(() => !document.getElementById('tree-popover')?.hidden, null, { timeout: 8000 });
    await page5b.click('#tree-popover [data-tree-action="moments"]');
    const orbitFrameOf = async () => {
      for (const f of page5b.frames()) {
        if (f === page5b.mainFrame()) continue;
        let ok = false;
        try {
          ok = await Promise.race([
            f.evaluate(() => Boolean(document.getElementById('orbit')?.shadowRoot?.querySelector('[data-do=moments],[data-do=index]'))),
            page5b.waitForTimeout(2000).then(() => false)
          ]);
        } catch { ok = false; }
        if (ok) return f;
      }
      return null;
    };
    const frameEval = async (fn) => {
      const f = await orbitFrameOf();
      if (!f) return null;
      try {
        return await Promise.race([f.evaluate(fn), page5b.waitForTimeout(2000).then(() => null)]);
      } catch { return null; }
    };
    let chips0 = null;
    for (let i = 0; i < 24; i++) {
      const list = await frameEval(() => Boolean(document.getElementById('orbit')?.shadowRoot?.querySelector('.index-list .indexTagChip')));
      if (!list) {
        const f = await orbitFrameOf();
        if (f) await f.evaluate(() => document.getElementById('orbit').shadowRoot.querySelector('[data-do=moments],[data-do=index]').click()).catch(() => {});
        await page5b.waitForTimeout(400);
      }
      chips0 = await frameEval(() => {
        const sr = document.getElementById('orbit')?.shadowRoot;
        return {
          chips: sr ? [...sr.querySelectorAll('.index-list .indexTagChip')].map((b) => b.textContent.trim()) : [],
          rows: sr ? sr.querySelectorAll('.index-list [data-lt-moment-row]').length : 0
        };
      });
      if (chips0 && chips0.chips.some((t) => t.includes('?몃옒 쨌 Super Shy'))) break;
      await page5b.waitForTimeout(400);
    }
    assert.ok(chips0 && chips0.chips.some((t) => t.includes('?몃옒 쨌 Super Shy')), '瑗щ━??移⑹뿉 ?몃옒 쨌 Super Shy媛 ?덈떎 ???ㅼ륫=' + JSON.stringify(chips0));
    assert.equal(chips0.rows, 5, `?쒓컙 紐⑸줉???ㅼ꽢 媛쒖쓽 媛吏??쒓컙???붾㈃???덈떎 ???ㅼ륫=${JSON.stringify(chips0)}`);
    const listState = await frameEval(() => {
      const dialog = document.getElementById('orbit')?.shadowRoot?.querySelector('dialog[open]');
      const list = dialog?.querySelector('.index-list'), r = list?.getBoundingClientRect();
      return { open: !!dialog, width: r?.width || 0, height: r?.height || 0, rows: list?.querySelectorAll('[data-lt-moment-row]').length || 0 };
    });
    assert.ok(listState?.open && listState.width > 0 && listState.height > 0 && listState.rows === 5, `?쒓컙 紐⑸줉 李쎄낵 ?ㅼ꽢 以꾩씠 ?붾㈃???덈떎: ${JSON.stringify(listState)}`);
    const listFooter = await page5b.evaluate(() => ({
      sheet: document.body.classList.contains('lt-sheet-open'),
      links: getComputedStyle(document.querySelector('.home-links')).display,
      card: getComputedStyle(document.getElementById('updates-card')).display
    }));
    assert.deepEqual(listFooter, { sheet: true, links: 'none', card: 'none' }, `?쒓컙 紐⑸줉 李쎌씠 ?대━硫??꾨옒 怨좎젙 ??ぉ???⑤뒗?? ${JSON.stringify(listFooter)}`);
    const toastBox = await page5b.locator('#toast').boundingBox();
    const shellFrameBox = await page5b.locator('#view').boundingBox();
    const listFrame = await orbitFrameOf();
    const listWindowBox = await listFrame.evaluate(() => {
      const r = document.getElementById('orbit')?.shadowRoot?.querySelector('dialog[open]')?.getBoundingClientRect();
      return r && { top: r.top, width: r.width, height: r.height };
    });
    const lastListRow = await listFrame.evaluate(() => {
      const rows = [...(document.getElementById('orbit')?.shadowRoot?.querySelectorAll('dialog[open] .index-list [data-lt-moment-row]') || [])];
      const r = rows.at(-1)?.getBoundingClientRect();
      return r && { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    assert.ok(toastBox?.width > 0 && toastBox?.height > 0 && shellFrameBox?.width > 0 && listWindowBox?.width > 0 && listWindowBox?.height > 0 && lastListRow?.width > 0 && lastListRow?.height > 0,
      `紐⑸줉 李?寃뱀묠 寃?ъ뿉???뚮┝쨌李승룸쭏吏留??쒓컙쨌?꾨젅?꾩씠 紐⑤몢 蹂댁씤?? ${JSON.stringify({ toastBox, shellFrameBox, listWindowBox, lastListRow })}`);
    const rowInPage = { x: shellFrameBox.x + lastListRow.x, y: shellFrameBox.y + lastListRow.y, width: lastListRow.width, height: lastListRow.height };
    const toastOverlap = Math.max(0, Math.min(toastBox.x + toastBox.width, rowInPage.x + rowInPage.width) - Math.max(toastBox.x, rowInPage.x))
      * Math.max(0, Math.min(toastBox.y + toastBox.height, rowInPage.y + rowInPage.height) - Math.max(toastBox.y, rowInPage.y));
    assert.equal(toastOverlap, 0, `?뚮┝ 以꾧낵 ?쒓컙 紐⑸줉 留덉?留?以?寃뱀묠??0px짼?대떎: ${JSON.stringify({ toastBox, rowInPage, toastOverlap })}`);
    assert.ok(toastBox.y + toastBox.height <= shellFrameBox.y + listWindowBox.top, `?뚮┝ 以꾩? 紐⑸줉 李??꾩そ 諛붽묑???덈떎: ${JSON.stringify({ toastBox, shellFrameBox, listWindowBox })}`);
    await take(page5b, '?쒓컙 紐⑸줉 ?ㅼ꽢 媛?);
    const listClose = await frameEval(() => {
      const b = document.getElementById('orbit')?.shadowRoot?.querySelector('dialog[open] [data-do="close"]');
      const r = b?.getBoundingClientRect();
      return r && { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const listFrameBox = await page5b.locator('#view').boundingBox();
    assert.ok(listClose && listFrameBox, `?쒓컙 紐⑸줉 ?リ린 ?⑥텛??醫뚰몴瑜??쎌뿀?? ${JSON.stringify({ listClose, listFrameBox })}`);
    await page5b.mouse.click(listFrameBox.x + listClose.x + listClose.width / 2, listFrameBox.y + listClose.y + listClose.height / 2);
    await page5b.waitForFunction(() => !document.body.classList.contains('lt-sheet-open'), null, { timeout: 8000 });
    const restoredFooter = await page5b.evaluate(() => ({
      links: getComputedStyle(document.querySelector('.home-links')).display,
      card: getComputedStyle(document.getElementById('updates-card')).display
    }));
    assert.deepEqual(restoredFooter, { links: 'flex', card: 'flex' }, `?쒓컙 紐⑸줉 李쎌쓣 ?レ쑝硫??꾨옒 怨좎젙 ??ぉ???뚯븘?⑤떎: ${JSON.stringify(restoredFooter)}`);
    let picked = null;
    for (let i = 0; i < 16; i++) {
      picked = await frameEval(() => {
        const sr = document.getElementById('orbit')?.shadowRoot;
        if (!sr) return null;
        const chips = [...sr.querySelectorAll('.index-list .indexTagChip')];
        return {
          open: !!sr.querySelector('dialog[open]'),
          picked: sr.querySelectorAll('.index-list .indexTagPicked').length,
          rows: sr.querySelectorAll('.index-list [data-lt-moment-row]').length,
          minH: chips.length ? Math.min(...chips.map((b) => Math.round(b.getBoundingClientRect().height))) : null
        };
      });
      // ?ロ엺 dialog ?덉쓽 ?붿냼??getBoundingClientRect媛 0?대떎(?ㅼ륫: ?ロ옒 0 / ?대┝ 44).
      // 李쎌씠 ?대젮 ?덇퀬 移⑹씠 ?ㅼ젣濡?蹂댁씪 ?뚭퉴吏 湲곕떎由??ㅼ뿉留??믪씠瑜??⑥젙?쒕떎.
      if (picked && picked.open && picked.picked >= 1 && picked.rows >= 1 && picked.rows < chips0.rows && picked.minH >= 44) break;
      const f = await orbitFrameOf();
      if (f) await f.evaluate(() => { const sr = document.getElementById('orbit')?.shadowRoot; const b = sr && [...sr.querySelectorAll('.index-list .indexTagChip')].find((b) => b.textContent.includes('?몃옒 쨌 Super Shy')); if (b) b.click(); }).catch(() => {});
      await page5b.waitForTimeout(400);
    }
    const pickDetail = `?ㅼ륫=${JSON.stringify(picked)}, 湲곕떎由?寃? ?대┛ 紐⑸줉 李?+ 怨좊Ⅸ 瑗щ━??1媛??댁긽 + 以???媛먯냼 + 移??믪씠 44px ?댁긽`;
    assert.ok(picked && picked.picked >= 1, '怨좊Ⅸ 瑗щ━?쒓? ?꾩뿉 紐⑥뿬 蹂댁씤????' + pickDetail);
    assert.ok(picked.rows >= 1 && picked.rows < chips0.rows, '嫄몃윭 蹂닿린濡??쒓컙 ?섍? 以????' + pickDetail);
    assert.ok(picked.open, '移⑹쓣 ????紐⑸줉 李쎌씠 ?대젮 ?덈떎 ??' + pickDetail);
    assert.ok(picked.minH >= 44, '移??꾨쫫 ?곸뿭 44px ?댁긽 ??' + pickDetail);
    await take(page5b, '?쒓컙 紐⑸줉 瑗щ━??嫄몃윭 蹂닿린');
    await ctx5.unroute('**/api/workspace**', fiveMomentRoute);
    await page5b.close();
    // #627 PR B: 瑗щ━??以꾩씠 ?대┛ ?곸꽭(蹂대뱶) ???뺤젙 移㈑룹쭅???낅젰??蹂댁씠???먮━?먯꽌 寃뱀묠쨌?섎┝쨌?묒? 湲?먮? ?곕떎.
    // 媛숈? 臾몃㎘?먯꽌 蹂대뱶瑜??덈줈 ?곕떎(二쇱냼??蹂닿린源뚯? ?ｋ뒗?????몄? 遺덈윭???뚯쓽 二쇱냼濡?蹂닿린瑜??뺥븳??.
    await ctx5.route('**/api/workspace**', fiveMomentRoute);
    const page6 = await ctx5.newPage();
    await page6.goto(`${base}/v41/?account=1#board`, { waitUntil: 'load' });
    await frameOf(page6, /views\/track/);
    await page6.waitForTimeout(1500);
    const tagBoard = await frameOf(page6, /track58-pinboard/);
    assert.ok(tagBoard, '蹂대뱶 ?꾨젅?꾩씠 ?대┛??瑗щ━??以??곹깭)');
    await tagBoard.waitForFunction(() => !!document.getElementById('dTags') && document.getElementById('dTags').childNodes.length > 0, null, { timeout: 10000 }).catch(() => {});
    await tagBoard.evaluate(() => selectMoment(LTDEMO.moments[0].id));
    await page6.waitForTimeout(600);
    await page6.waitForFunction(() => document.body.classList.contains('lt-sheet-open'), null, { timeout: 8000 });
    const detailState = await page6.evaluate(() => {
      const detail = document.querySelector('#view')?.contentDocument?.getElementById('detail');
      const r = detail?.getBoundingClientRect();
      return { open: !!detail?.classList.contains('open'), width: r?.width || 0, height: r?.height || 0, footerDisplay: getComputedStyle(document.querySelector('.home-links')).display, cardDisplay: getComputedStyle(document.getElementById('updates-card')).display, fabDisplay: getComputedStyle(document.getElementById('mobile-add')).display, trees: window.LT41?.trees?.length || 0, moments: window.LT41?.tree?.moments?.length || 0 };
    });
    assert.equal(detailState.open, true, `?쒓컙 ?곸꽭 李쎌씠 ?ㅼ젣濡??대젮 ?덈떎: ${JSON.stringify(detailState)}`);
    assert.ok(detailState.width > 0 && detailState.height > 0, `?쒓컙 ?곸꽭 李쎌씠 ?붾㈃???덈떎: ${JSON.stringify(detailState)}`);
    assert.ok(detailState.trees >= 1 && detailState.moments >= 5, `蹂대뱶쨌?곸꽭???몃━ ?섎굹쨌?쒓컙 ?ㅼ꽢 媛??댁긽??媛吏?怨꾩젙?대떎: ${JSON.stringify(detailState)}`);
    assert.equal(detailState.footerDisplay, 'none', `?곸꽭 李쎌씠 ?대━硫??꾨옒 留곹겕 以꾩쓣 ?④릿?? ${JSON.stringify(detailState)}`);
    assert.equal(detailState.cardDisplay, 'none', `?곸꽭 李쎌씠 ?대━硫????뚯떇 移대뱶瑜??④릿?? ${JSON.stringify(detailState)}`);
    assert.equal(detailState.fabDisplay, 'none', `?곸꽭 李쎌씠 ?대━硫?竊??⑥텛瑜??④릿?? ${JSON.stringify(detailState)}`);
    // 吏곸젒 遺숈씠湲곕뒗 ?묓옒??湲곕낯?대떎(261116 ???吏?? ??[吏곸젒 遺숈씠湲?媛 蹂댁씠怨??낅젰 以꾩? ?꾩쭅 ?녿떎.
    const tagFolded = await tagBoard.evaluate(() => ({
      toggle: !!document.querySelector('#dTags .lt-tagline-toggle'),
      row: !!document.querySelector('#dTags .lt-tagline-kind')
    }));
    assert.deepStrictEqual(tagFolded, { toggle: true, row: false }, '瑗щ━??吏곸젒 遺숈씠湲곕뒗 ?묓옒??湲곕낯?대떎 ??[吏곸젒 遺숈씠湲?留?蹂댁씤??);
    await tagBoard.evaluate(() => document.querySelector('#dTags .lt-tagline-toggle')?.click());
    await tagBoard.waitForFunction(() => !!document.querySelector('#dTags .lt-tagline-kind'), null, { timeout: 8000 });
    // ?쇱튇 ?낅젰 以꾩씠 ?ㅼ젣濡?蹂댁씠?붿? ?⑥젙?쒕떎(?④? ?대옒?ㅻ? ?곕㈃ 寃?ш린 寃뱀묠留뚯쑝濡쒕뒗 紐??〓뒗?????ㅼ륫?먯꽌 ?≪븯??寃고븿).
    const tagInputSeen = await tagBoard.evaluate(() => ['.lt-tagline-kind', '.lt-tagline-value', '.lt-tagline-add'].map((s) => {
      const el = document.querySelector(`#dTags ${s}`);
      if (!el) return false;
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility === 'visible' && getComputedStyle(el).display !== 'none';
    }));
    assert.deepStrictEqual(tagInputSeen, [true, true, true], '?쇱튇 瑗щ━???낅젰 以?媛덈옒쨌?댁슜쨌遺숈씠湲????곸꽭 ?먯뿉 蹂댁뿬???쒕떎');
    // #627 2李? '蹂대뱶 1440 ???? ??蹂대뱶 iframe?????댁슜 ??쓣 ???곕뒗吏, 蹂대뱶 ??.app??媛濡쒕줈 諛??    // (?⑥? 媛濡??ㅽ겕濡? ?ㅻⅨ履쎌뿉 寃? 鍮??먮━媛 ?앷린吏 ?딅뒗吏 ?⑥젙?쒕떎. ?ㅽ겕濡ㅼ쓣 遺瑜대뒗 ?숈옉???대룄
    // ?먯씠 諛由ъ? ?딆븘???쒕떎(overflow:clip?쇰줈 ?ㅽ겕濡?而⑦뀒?대꼫媛 ?꾨땲寃?留뚮뱾?덈떎).
    const boardWidth = await page6.evaluate(() => ({
      stageW: document.getElementById('stage').clientWidth,
      frameW: Math.round(document.getElementById('view').getBoundingClientRect().width),
    }));
    assert.equal(boardWidth.frameW, boardWidth.stageW, `蹂대뱶 iframe ??= ???댁슜 ???ㅼ젣: ${JSON.stringify(boardWidth)})`);
    const appScroll = await tagBoard.evaluate(() => {
      const app = document.getElementById('app');
      return { sl: app.scrollLeft, sw: app.scrollWidth, cw: app.clientWidth };
    });
    assert.equal(appScroll.sl, 0, '蹂대뱶 .app??媛濡쒕줈 諛???덉? ?딅떎(寃? 鍮??먮━ ?놁쓬)');
    await tagBoard.evaluate(() => { document.getElementById('app').scrollLeft = 400; });
    assert.equal(await tagBoard.evaluate(() => document.getElementById('app').scrollLeft), 0, '蹂대뱶 .app? 媛濡??ㅽ겕濡?而⑦뀒?대꼫媛 ?꾨땲??overflow:clip ??諛?대룄 ??諛由곕떎)');
    await tagBoard.evaluate(() => document.getElementById('dTags').scrollIntoView({ block: 'center' }));
    await page6.waitForTimeout(200);
    assert.equal(await tagBoard.evaluate(() => document.getElementById('app').scrollLeft), 0, '瑗щ━??以꾨줈 ?ㅽ겕濡ㅽ빐??蹂대뱶 ?먯씠 媛濡쒕줈 諛由ъ? ?딅뒗??);
    // #716: 390 ??以??꾧뎄 以???移대뱶媛 ?꾧뎄 以?諛묒쑝濡??ㅼ뼱媛 瑗щ━?쑣룹젣紐⑹씠 鍮꾩튂吏 ?딅뒗??援먯감 硫댁쟻 0쨌諛뷀깢 ?뚰뙆 1),
    // ?꾧뎄 以꾩씠 ?놁쑝濡??섏튂嫄곕굹 ?⑥텛媛 ?섎━吏 ?딄퀬, '?좏깮???쒓컙' 怨좊Ⅴ湲?移몃룄 ?꾧뎄 以꾧낵 寃뱀튂吏 ?딅뒗??
    if (width === 390) {
      const bar = await tagBoard.evaluate(() => {
        const box = (el) => { const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, rt: r.right }; };
        const header = document.querySelector('header');
        const hb = box(header);
        const cs = getComputedStyle(header);
        const stops = cs.backgroundImage.match(/rgba?\([^)]*\)/g) || [];
        const alphas = stops.map((s) => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return 1; const p = m[1].split(',').map((v) => parseFloat(v)); return p.length > 3 ? p[3] : 1; });
        if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') alphas.push(1);
        const items = [...header.querySelectorAll('button, .boardThemeSwitch, .boardModeSwitch, .tree-title')].filter((el) => {
          const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0;
        }).map((el) => ({ text: (el.textContent || '').trim().slice(0, 12), ...box(el) }));
        const vw = innerWidth;
        const texts = [...document.querySelectorAll('#cardLayer .card h3, #cardLayer .card .cardMeta, #cardLayer .card .keywordOnCard, #cardLayer .card .videoTitle, #cardLayer .card .domain, #cardLayer .card small, #cardLayer .card .firstTag')].filter((el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; });
        const frame = box(document.getElementById('viewport'));
        let area = 0;
        for (const el of texts) {
          const r = box(el);
          // ??.boardFrame)? overflow:hidden ?대씪 ?꾨줈 ?먯졇?섏삩 移대뱶???섎젮 蹂댁씠吏 ?딅뒗????          // ?꾧뎄 以??ㅻ줈 '蹂댁씠?? 寃뱀묠留??〓뒗???띿뒪?????꾧뎄 以?????蹂댁씠???곸뿭).
          const w = Math.min(hb.rt, r.rt, frame.rt) - Math.max(hb.l, r.l, frame.l);
          const h = Math.min(hb.b, r.b, frame.b) - Math.max(hb.t, r.t, frame.t);
          if (w > 0 && h > 0) area += w * h;
        }
        const frameTop = Math.round(frame.t);
        const picker = document.querySelector('.lt-moment-picker');
        const pb = picker ? box(picker) : null;
        const pickerOverlap = pb ? Math.max(0, Math.min(hb.b, pb.b) - Math.max(hb.t, pb.t)) : 0;
        return {
          alphas, overlapArea: Math.round(area),
          overflowRight: Math.round(Math.max(0, ...items.map((i) => i.rt - vw))),
          cut: items.filter((i) => i.rt > vw + 0.5 || i.l < -0.5).map((i) => i.text).join(','),
          frameTop, headerBottom: Math.round(hb.b), pickerOverlap: Math.round(pickerOverlap)
        };
      });
      assert.equal(bar.alphas.some((a) => a < 1), false, `390 ?꾧뎄 以?諛뷀깢? 遺덊닾紐낇븯???뺤? ???뚰뙆 ${JSON.stringify(bar.alphas)})`);
      assert.equal(bar.overlapArea, 0, `390 ?꾧뎄 以??ㅻ줈 移대뱶 湲?먭? ?ㅼ뼱媛吏 ?딅뒗??援먯감 硫댁쟻 ${bar.overlapArea}px짼)`);
      assert.equal(bar.overflowRight, 0, `390 ?꾧뎄 以꾩씠 媛濡쒕줈 ?섏튂吏 ?딅뒗???섏묠 ${bar.overflowRight}px)`);
      assert.equal(bar.cut, '', `390 ?섎┛ ?⑥텛媛 ?녿떎(?섎┝: ${bar.cut || '?놁쓬'})`);
      assert.ok(bar.frameTop >= bar.headerBottom, `390 ?먯씠 ?꾧뎄 以??꾨옒??${bar.headerBottom}px)遺???쒖옉?쒕떎(?ㅼ젣 ${bar.frameTop}px)`);
      assert.equal(bar.pickerOverlap, 0, `390 '?좏깮???쒓컙' 怨좊Ⅴ湲?移몄씠 ?꾧뎄 以꾧낵 寃뱀튂吏 ?딅뒗??寃뱀묠 ${bar.pickerOverlap}px)`);
    }
    await take(page6, '瑗щ━??以꾩씠 ?대┛ ?곸꽭');
    // #627 PR B: 瑗щ━???뺣━ ?붾㈃ ??紐⑸줉쨌媛쒖닔? '?쒕ぉ?먯꽌 瑗щ━????踰덉뿉 ?쒖븞諛쏄린'媛 洹몃젮吏??먮━瑜??곕떎.
    await page6.evaluate(() => document.getElementById('record-menu')?.click());
    await page6.waitForTimeout(400);
    await page6.evaluate(() => document.querySelector('[data-tree-action="tags"]')?.click());
    await page6.waitForFunction(() => !!document.getElementById('tag-panel')?.open, null, { timeout: 8000 });
    await page6.waitForTimeout(300);
    await page6.evaluate(() => document.getElementById('tag-suggest-open')?.click());
    await page6.waitForTimeout(400);
    await take(page6, '瑗щ━???뺣━ ?붾㈃');
    // #627 ?꾩냽: 梨?履?移대뱶)?먮룄 ?뺤젙 袁由ы몴媛 洹몃젮吏?붿? ?⑥젙?쒕떎 ??梨??섏씠吏??book-extra.js媛
    // momentContent瑜???뼱 ??paintTitle濡??쒕ぉ 以꾩쓣 ?ㅼ떆 洹몃━誘濡? 嫄곌린??袁由ы몴媛 ?놁쑝硫?梨?移대뱶?먮뒗
    // ?앸궡 蹂댁씠吏 ?딅뒗???ㅼ륫?먯꽌 ?≪븯??寃고븿). 泥??쒓컙???좏깮??梨?梨낆쑝濡??섏뼱媛 移⑹쓣 ?쇰떎.
    await page6.evaluate(() => { location.hash = '#my/book?tree=' + LT41.tree.id; });
    await frameOf(page6, /track59-sketchbook/);
    await page6.waitForTimeout(1500);
    const bookChips = await (await readyFrame(page6, /track59-sketchbook/, { why: '梨?履??뺤젙 袁由ы몴瑜??쎌쓣 梨??꾨젅?? })).evaluate(() =>
      [...document.querySelectorAll('.moment-title .lt-tag-chip')].map((n) => n.textContent.trim()));
    assert.ok(bookChips.includes('Super Shy') && bookChips.includes('臾대?'), `梨?履쎌뿉 ?뺤젙 袁由ы몴 移⑹씠 洹몃젮?몄빞 ?쒕떎(?ㅼ젣: ${JSON.stringify(bookChips)})`);
    // 蹂대뱶 泥?吏꾩엯 ???덈궡(390) ?????뚮┝('??湲곕줉??遺덈윭?붿뼱??')怨?蹂대뱶 ?덈궡 留먰뭾??'?쒓컙???좏깮?닳?)??    // 媛숈? ?먮━???ш컻吏吏 ?딅뒗?? 蹂대뱶????00px?먯꽌 留먰뭾?좎쓣 ?붾㈃ ?꾨옒 以묒븰(bottom 95px)???꾩슦怨?
    // ???뚮┝??#666 洹쒖튃?쇰줈 ?꾨옒 以묒븰(--lt-toast-bottom)???щ떎. 蹂대뱶?????뚮┝?????덈뒗 ?숈븞
    // 湲곕떎?몃떎 留먰뭾?좎쓣 ?꾩슫???????곸옄媛 ?숈떆??蹂댁씠???숈븞?먮뒗 寃뱀묠 硫댁쟻??0?댁뼱???쒕떎.
    // 1440? 留먰뭾???ㅻⅨ履??꾨옒)쨌?뚮┝(?꾨옒 以묒븰)???ㅻⅨ 紐⑥꽌由щ씪 湲고븯?숈쟻?쇰줈 寃뱀튂吏 ?딄퀬, ?좏깮 蹂듭썝?쇰줈
    // ?곸꽭 ?먯씠 ?대젮 ?덈궡媛 ?⑥? ?딅뒗 ??씠?댁꽌 390?먯꽌留??곕떎.
    // ??臾몃㎘?쇰줈 ?꾩슫????λ맂 蹂닿린쨌?좏깮???놁뼱??泥?吏꾩엯 ?먮쫫 ??900ms ??留먰뭾?? ???뚮┝? ??3珥??????ы쁽?쒕떎).
    if (width === 390) {
      const ctxNotice = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      await ctxNotice.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
      await ctxNotice.route('**://i.ytimg.com/**', THUMB);
      await ctxNotice.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      await ctxNotice.route('**/api/workspace**', (r) => r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ revision: 1, state: { version: 1, trees: [firstTree], prefs: {} }, subject: '?쒗뿕怨꾩젙', writeSubjectBound: true, savedAt: '2026-11-15T09:00:00.000Z' })
      }));
      const pageNotice = await ctxNotice.newPage();
      await pageNotice.goto(`${base}/v41/?account=1#board`, { waitUntil: 'domcontentloaded' });
      await readyFrame(pageNotice, /track58-pinboard/, { root: '#cardLayer', why: '390 蹂대뱶 泥?吏꾩엯 ?꾨젅?? });
      const twoNotices = await pageNotice.evaluate(async () => {
        const boxOf = (el) => { const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, rt: r.right }; };
        const overlapArea = (a, b) => Math.max(0, Math.min(a.rt, b.rt) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
        // 蹂대뱶 臾몄꽌??#view쨌#view-next 媛?대뜲 吏湲?#cardLayer(蹂대뱶)瑜???履쎌씠???몄씠 ???꾨젅?꾩쓣 媛덉븘?쇱슫??.
        const boardToast = () => {
          for (const id of ['view', 'view-next']) {
            const doc = document.getElementById(id)?.contentDocument;
            const toast = doc && doc.getElementById('toast');
            if (toast && doc.getElementById('cardLayer')) return toast;
          }
          return null;
        };
        // 蹂대뱶 ?덈궡?????뚮┝(??3珥????щ씪吏???600ms留덈떎 理쒕? 10踰??ㅼ떆 ?쒕룄???щ떎(理쒕? ??7珥?.
        // 怨좎젙 ?잛닔濡??щ㈃ ?먮┛ 湲곌린?먯꽌 ?덈궡媛 ?④린 ?꾩뿉 寃?ш? ?앸굹 鍮덉넀 ?ㅽ뙣媛 ?쒕떎 ??        // ???덈궡瑜?紐⑤몢 '?ㅼ젣濡?蹂? ?ㅼ뿉 ?앸궡怨? 紐?蹂대㈃ 留덉?留?愿李??곹깭瑜?硫붿떆吏???④릿??
        const state = () => {
          const shell = document.getElementById('toast');
          const board = boardToast();
          return {
            shellUp: !!shell && !shell.hidden,
            boardUp: !!board && board.classList.contains('show'),
            shellText: shell ? (shell.textContent || '').trim().slice(0, 60) : null,
            boardText: board ? (board.textContent || '').trim().slice(0, 60) : null,
            frames: [...document.querySelectorAll('iframe')].map((f) => { try { return f.contentWindow?.location?.href || ''; } catch { return ''; } }).filter((url) => /track58/.test(url))
          };
        };
        let sawShell = false, sawBoard = false, maxArea = 0, bothAt = -1, last = null, samples = 0;
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline && !(sawShell && sawBoard)) {
          last = state();
          if (last.shellUp) sawShell = true;
          if (last.boardUp) sawBoard = true;
          if (last.shellUp && last.boardUp) {
            bothAt = samples;
            maxArea = Math.max(maxArea, overlapArea(boxOf(document.getElementById('toast')), boxOf(boardToast())));
          }
          samples += 1;
          await new Promise((r) => setTimeout(r, 200));
        }
        const detail = `${samples}??愿李? 留덉?留??곹깭: ???뚮┝=${last?.shellUp ? '蹂댁엫' : '?놁쓬'}(${last?.shellText ?? '?붿냼 ?놁쓬'}), 蹂대뱶 留먰뭾??${last?.boardUp ? '蹂댁엫' : '?놁쓬'}(${last?.boardText ?? '?붿냼 ?놁쓬'}), 蹂대뱶 ?꾨젅??[${(last?.frames || []).join(' | ')}]`;
        return { sawShell, sawBoard, maxArea: Math.round(maxArea), bothAt, detail };
      });
      assert.ok(twoNotices.sawShell, `390 ???뚮┝(湲곕줉 遺덈윭?ㅺ린 ?덈궡)?????덈뒗 ?먮━瑜?蹂몃떎(鍮덉넀 ?듦낵 湲덉?) ??${twoNotices.detail}`);
      assert.ok(twoNotices.sawBoard, `390 蹂대뱶 ?덈궡 留먰뭾?좎씠 ?⑤뒗 ?먮━瑜?蹂몃떎(鍮덉넀 ?듦낵 湲덉?) ??${twoNotices.detail}`);
      assert.equal(twoNotices.maxArea, 0, `390 ???뚮┝怨?蹂대뱶 ?덈궡 留먰뭾?좎씠 媛숈? ?먮━???ш컻吏吏 ?딅뒗??寃뱀묠 ${twoNotices.maxArea}px짼, ?숈떆 ?몄텧: ${twoNotices.bothAt < 0 ? '?놁쓬' : twoNotices.bothAt + '踰덉㎏ 愿李?})`);
      await pageNotice.close();
      await ctxNotice.close();
    }
    // 2026-11-16 ???寃곗젙: 吏?꾟넂洹몃옒?꾟넂?숈떖?먰삎?믨렇臾쇳삎 ?뺣났 ??湲곗〈 ?붾㈃ ?꾪솚 硫붿떆吏(lt41-navigate) ??湲몃줈
    // ?ㅺ?怨? 吏湲??몃━쨌?쒓컙???좎??섎뒗吏(媛숈? ?몃━쨌媛숈? ?쒓컙쨌洹몃옒???쒖떆???쒓컙 ??源뚯? ?곕떎.
    // ?곌린 媛??臾몃㎘(ctx5 ???덉떆媛 ?꾨땲??吏湲??몃━瑜?遺瑜??먮━)?먯꽌留??섎?媛 ?덉뼱 ?ш린???쒕떎.
    const pageMap = await ctx5.newPage();
    await pageMap.goto(`${base}/v41/?account=1#network`, { waitUntil: 'load' });
    await readyFrame(pageMap, /track56-network/, { root: '#mapMain', why: '吏??泥??닿린' });
    await pageMap.waitForTimeout(1500);
    const treeBeforeTrip = await pageMap.evaluate(() => ({ id: window.LT41?.tree?.id || '', moments: (window.LT41?.tree?.moments || []).length, momentId: window.LT41?.momentId || '' }));
    assert.ok(treeBeforeTrip.id, '吏湲??몃━媛 遺瑜??곹깭?먯꽌 ?뺣났??蹂몃떎');
    // ?꾨젅??援먯껜쨌?ъ쟻??李?蹂닿린 ?⑥텛瑜??꾨Ⅸ 吏곹썑 二쇱냼媛 ?좉퉸 ?ㅻⅨ 臾몄꽌濡?蹂댁씠??????find()媛 undefined瑜?    // ?뚮젮 undefined.evaluate濡?二쎈뜕 ?먮━(#657 CI 2李??ㅼ륫) ??以鍮꾨맂 frame??湲곕떎由ш퀬, ?놁쑝硫?URL 紐⑸줉??    // ?댁? 硫붿떆吏濡??ㅽ뙣?쒕떎(null.evaluate TypeError媛 ?섏? ?딄쾶).
    const tripMapFrame = (why) => readyFrame(pageMap, /track56-network/, { root: '#mapMain', why });
    await (await tripMapFrame('吏?꾟넂洹몃옒?? 吏???꾨젅??)).evaluate(() => document.getElementById('viewGraph').click());
    await pageMap.waitForFunction(() => [...document.querySelectorAll('iframe')].some((f) => { try { return /track60-graph/.test(f.contentWindow.location.href); } catch { return false; } }), null, { timeout: 10000 });
    // 洹몃옒??紐⑤뱢??洹몃젮吏??뚭퉴吏(諛곗?媛 梨꾩썙吏??뚭퉴吏) 湲곕떎由곕떎 ???꾨젅??二쇱냼留뚯쑝濡쒕뒗 洹몃━湲??꾩씠??
    await pageMap.waitForFunction(() => {
      const f = [...document.querySelectorAll('iframe')].find((x) => { try { return /track60-graph/.test(x.contentWindow.location.href); } catch { return false; } });
      return Boolean(f && (f.contentDocument.getElementById('gBadge')?.textContent || '').length > 0);
    }, null, { timeout: 10000 });
    const gFrameTrip = await readyFrame(pageMap, /track60-graph/, { root: '#gBadge', why: '吏?꾩쓽 [洹몃옒?? ?⑥텛濡?洹몃옒??蹂닿린媛 ?대┛??湲곗〈 lt41-navigate ??湲?' });
    const tripGraph = await gFrameTrip.evaluate(() => {
      const b = [...document.querySelectorAll('.g-view-switch .pill')];
      return { n: b.length, pressed: b.map((x) => x.getAttribute('aria-pressed')), badge: document.getElementById('gBadge')?.textContent || '' };
    });
    assert.equal(tripGraph.n, 3, '洹몃옒??癒몃━以?蹂닿린 怨좊Ⅴ湲????⑥텛');
    assert.deepEqual(tripGraph.pressed, ['false', 'false', 'true'], '?꾩옱 蹂닿린(洹몃옒??留?aria-pressed=true');
    assert.ok(tripGraph.badge.startsWith(`?쒓컙 ${treeBeforeTrip.moments}`), `洹몃옒???쒖떆???쒓컙 ?섍? 吏湲??몃━? 媛숇떎(?ㅼ젣 ${tripGraph.badge})`);
    const navCurrent = await pageMap.evaluate(() => document.querySelector('.tree-views [data-view="track56-network.html"]')?.getAttribute('aria-current'));
    assert.equal(navCurrent, 'true', '洹몃옒??蹂닿린?먯꽌 ?꾩そ 硫붾돱(梨끒룸낫?쑣룹?????吏?꾧? 耳쒖쭊 ?곹깭??);
    await gFrameTrip.evaluate(() => document.getElementById('gViewConc').click());
    await pageMap.waitForFunction(() => {
      const f = [...document.querySelectorAll('iframe')].find((x) => { try { return /track56-network/.test(x.contentWindow.location.href); } catch { return false; } });
      return Boolean(f && f.contentDocument?.body && f.contentDocument.body.dataset.ltView === 'concentric');
    }, null, { timeout: 10000 });
    const mapAfterConc = await (await tripMapFrame('?숈떖??蹂듦?: 吏???꾨젅??)).evaluate(() => ({ view: document.body.dataset.ltView, concPressed: document.getElementById('viewConc')?.getAttribute('aria-pressed'), stored: localStorage.getItem('lt41.network.view') }));
    assert.equal(mapAfterConc.view, 'concentric', '洹몃옒?꾩쓽 [?숈떖?먰삎]?쇰줈 吏?꾧? ?숈떖?먰삎 蹂닿린濡??대┛??);
    assert.equal(mapAfterConc.concPressed, 'true', '?숈떖?먰삎???뚮┛ ?곹깭(aria-pressed=true)');
    assert.equal(mapAfterConc.stored, 'concentric', '吏??蹂닿린 ?????lt41.network.view)媛 諛붾먮떎');
    await (await tripMapFrame('洹몃Ъ 蹂듦? ?꾨Ⅴ湲? 吏???꾨젅??)).evaluate(() => document.getElementById('viewNet').click());
    const treeAfterTrip = await pageMap.evaluate(() => ({ id: window.LT41?.tree?.id || '', moments: (window.LT41?.tree?.moments || []).length, momentId: window.LT41?.momentId || '' }));
    const mapAfterNet = await (await readyFrame(pageMap, /track56-network/, { root: '#mapMain', view: 'network', timeout: 45000, why: '洹몃Ъ 蹂듦? ?뺤씤: 吏???꾨젅?꾩씠 ?ㅼ떆 遺숆퀬 以鍮꾨맆 ?뚭퉴吏' })).evaluate(() => ({ view: document.body.dataset.ltView, netPressed: document.getElementById('viewNet')?.getAttribute('aria-pressed') }));
    assert.equal(mapAfterNet.view, 'network', '吏?꾩쓽 [洹몃Ъ???쇰줈 洹몃Ъ 蹂닿린濡??뚯븘?⑤떎');
    assert.equal(mapAfterNet.netPressed, 'true', '洹몃Ъ?뺤씠 ?뚮┛ ?곹깭(aria-pressed=true)');
    assert.deepEqual(treeAfterTrip, treeBeforeTrip, '?뺣났 ?ㅼ뿉??吏湲??몃━쨌?쒓컙???좎??쒕떎');
    await pageMap.close();
    await ctx5.close();

    // #627 PR3: 洹몃옒??蹂닿린 ??吏湲덉? 二쇱냼(#my/graph)濡쒕쭔 ?대━???붾㈃?대씪 ?몄뒪?멸? LT41??吏곸젒 ?섍릿??    // (share-host? 媛숈? ?, ?ㅼ젣 ?몃━ = ?몄씠 ?섍린???쒓컙?ㅺ낵 媛숈? 紐⑥뼇). ?덈툕 ?대쫫 ?곸옄 寃뱀묠 0쨌
    // 媛濡??섏묠 0쨌怨좊━ ?몃꽕???숆렇?쇰? 蹂댁엫???섏튂濡??⑥젙?쒕떎.
    const ctx7 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx7.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx7.route('**://i.ytimg.com/**', THUMB);
    await ctx7.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    // #627 3?④퀎 '?ㅻⅨ ??蹂닿린' 媛吏??묐떟: 臾대? ?덈툕 瑗щ━?쒕뒗 5嫄?AI 紐낆삁?뚯썝 1嫄?, 洹???瑗щ━?쒕뒗 鍮??묐떟 ??    // 3媛?誘몃━蹂닿린쨌'??蹂닿린'쨌鍮??곹깭 臾멸뎄瑜????곹깭?먯꽌 ?⑥젙?쒕떎. (playwright???섏쨷???깆옣??寃쎈줈媛 癒쇱? 留욌뒗??)
    const fansFixture = [
      { shareId: 'fan1', link: '/t/fan1', treeTitle: '?쒗뿕 ?ъ슜?먯쓽 湲곗뼲 ?섎Т', title: '?곕퇃??吏곴? 湲곕줉', url: 'https://www.youtube.com/watch?v=aaa11111111', thumbnail: 'https://i.ytimg.com/vi/aaa11111111/hqdefault.jpg', date: '2026-01-10', aiTester: false },
      { shareId: 'fan2', link: '/t/fan2', treeTitle: 'AI 紐낆삁?뚯썝 ?섎Т', title: '?곕퇃???ㅼ떆 蹂닿린', url: '', thumbnail: '', date: '2026-01-20', aiTester: true },
      { shareId: 'fan3', link: '/t/fan3', treeTitle: '?吏???⑤쾾', title: '?곕퇃???붾뵫 硫섑듃', url: 'https://www.youtube.com/watch?v=bbb22222222', thumbnail: 'https://i.ytimg.com/vi/bbb22222222/hqdefault.jpg', date: '2026-01-12', aiTester: false },
      { shareId: 'fan4', link: '/t/fan4', treeTitle: '誘쇱쓽 ?щ떞', title: '?곕퇃??由ы뿀???꾧린', url: '', thumbnail: '', date: '2026-01-11', aiTester: false },
      { shareId: 'fan5', link: '/t/fan5', treeTitle: '?쒗쁽???쒓컙', title: '?곕퇃??泥??뚰솚', url: '', thumbnail: '', date: '2026-01-09', aiTester: false }
    ];
    await ctx7.route('**/api/public/tag-moments**', (r) => {
      const tag = new URL(r.request().url()).searchParams.get('tag') || '';
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tag, items: tag.startsWith('臾대?:') ? fansFixture : [] }) });
    });
    const page7 = await ctx7.newPage();
    await page7.goto(`${base}/graph-host.html`, { waitUntil: 'domcontentloaded' });
    const graphFrame = await frameOf(page7, /track60-graph/);
    assert.ok(graphFrame, '洹몃옒???꾨젅?꾩씠 ?대┛??);
    await page7.waitForTimeout(700);
    // 2026-11-16 ???寃곗젙: 洹몃옒??癒몃━以꾩뿉??吏?꾩? 媛숈? 紐⑥뼇??蹂닿린 怨좊Ⅴ湲곌? ?덇퀬 洹몃옒?꾧? ?뚮┛ ?곹깭??
    const graphSwitch = await graphFrame.evaluate(() => {
      const b = [...document.querySelectorAll('.g-view-switch .pill')];
      return {
        n: b.length,
        labels: b.map((x) => x.textContent.trim()),
        pressed: b.map((x) => x.getAttribute('aria-pressed')),
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
      };
    }).catch(() => null);
    assert.ok(graphSwitch, '洹몃옒??癒몃━以?蹂닿린 怨좊Ⅴ湲곕? ?곕떎');
    assert.deepEqual(graphSwitch.labels, ['洹몃Ъ??, '?숈떖?먰삎', '洹몃옒??], `蹂닿린 怨좊Ⅴ湲????⑥텛(?ㅼ젣 ${JSON.stringify(graphSwitch.labels)})`);
    assert.deepEqual(graphSwitch.pressed, ['false', 'false', 'true'], '?꾩옱 蹂닿린(洹몃옒??留?aria-pressed=true');
    assert.equal(graphSwitch.overflow, 0, `洹몃옒??癒몃━以꾩뿉??媛濡??섏묠 0(?ㅼ젣 ${graphSwitch.overflow})`);
    await take(page7, '洹몃옒??蹂닿린');
    const graphCheck = await page7.evaluate(() => {
      const f = [...document.querySelectorAll('iframe')].at(-1);
      const doc = f.contentDocument;
      const names = [...doc.querySelectorAll('.g-hubname')];
      const boxes = names.map((x) => x.getBoundingClientRect());
      let hubPairs = 0;
      const pairTexts = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
          hubPairs++;
          pairTexts.push(names[i].textContent + '횞' + names[j].textContent + ' @' + Math.round(a.left) + ',' + Math.round(a.top));
        }
      }
      return {
        hubPairs,
        pairTexts,
        hubs: names.length,
        thumbs: doc.querySelectorAll('#gsvg image').length,
        stacks: [...doc.querySelectorAll('.g-stackcount')].map((x) => x.textContent),
        overflow: Math.max(0, doc.documentElement.scrollWidth - doc.documentElement.clientWidth),
        badge: doc.getElementById('gBadge')?.textContent || '',
        // CTO 吏??#714 ?꾩냽): ?대쫫 ?곸옄媛 鍮?怨노쭔 ?쇳븯?붿?濡쒕뒗 遺議깊븯?????꾨옒 ??媛吏瑜??곕떎.
        narrow: doc.documentElement.clientWidth < 700,
        hubDots: [...doc.querySelectorAll('.g-hubdot')].map((c) => {
          const r = c.getBoundingClientRect();
          return { key: c.parentElement?.getAttribute('data-hub-key'), cr: Number(c.parentElement?.getAttribute('data-cr') || 0), x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }),
        nameBoxes: [...doc.querySelectorAll('.g-hubname')].filter((x) => !x.classList.contains('g-hubsub') && x.getBoundingClientRect().width > 0).map((x) => {
          const r = x.getBoundingClientRect();
          return { key: x.parentElement?.getAttribute('data-hub-key'), cx: r.left + r.width / 2, cy: r.top + r.height / 2, h: r.height, t: x.textContent };
        }),
        rings: [...doc.querySelectorAll('.g-ring')].map((c) => { const r = c.getBoundingClientRect(); return { key: c.getAttribute('data-key'), x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; }),
        counts: [...doc.querySelectorAll('.g-stackcount')].map((x) => {
          const box = x.getBoundingClientRect();
          const dot = x.parentElement?.querySelector('circle');
          const dr = dot ? dot.getBoundingClientRect() : null;
          return { t: x.textContent, x: box.left + box.width / 2, y: box.top + box.height / 2, h: box.height, dotX: dr ? dr.left + dr.width / 2 : null, dotY: dr ? dr.top + dr.height / 2 : null, dotR: dr ? dr.width / 2 : null };
        })
      };
    });
    // ??媛??덈툕 ?대쫫??以묒떖? ?먭린 怨좊━ 以묒떖?먯꽌 (怨좊━ 諛섏?由?+ ?대쫫 ?믪씠 + ?ъ쑀) ?덉뿉 ?덈떎(醫곸? ?붾㈃).
    if (graphCheck.narrow) {
      const tooFar = graphCheck.nameBoxes.map((n) => {
        const dot = graphCheck.hubDots.find((d) => d.key === n.key);
        if (!dot) return n.t + ' ???먭린 怨좊━瑜?紐?李얠쓬';
        const dist = Math.hypot(n.cx - dot.x, n.cy - dot.y);
        const limit = dot.cr + n.h + 12;
        return dist <= limit ? null : `${n.t} 嫄곕━ ${Math.round(dist)} > ${Math.round(limit)}`;
      }).filter(Boolean);
      assert.deepEqual(tooFar, [], `390 ?덈툕 ?대쫫? ?먭린 怨좊━ 諛붾줈 ?꾨옒???덉뼱???쒕떎: ${JSON.stringify(tooFar)}`);
      // ??醫곸? ?붾㈃?먯꽌???덈툕 ?대쫫???④린吏 ?딅뒗??
      const hidden = graphCheck.hubDots.length - graphCheck.nameBoxes.length;
      assert.equal(hidden, 0, `390?먯꽌 ?④꺼吏??덈툕 ?대쫫 0(?ㅼ젣 ${hidden}媛??④?)`);
    }
    // ??怨좊━?쇰━ 寃뱀묠 0(????嫄곕━, 2px ?ъ쑀).
    const ringPairs = [];
    for (let i = 0; i < graphCheck.rings.length; i++) for (let j = i + 1; j < graphCheck.rings.length; j++) {
      const a = graphCheck.rings[i], b = graphCheck.rings[j];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist < a.r + b.r - 2) ringPairs.push(`${a.key}횞${b.key} @嫄곕━${Math.round(dist)} < r${Math.round(a.r)}+${Math.round(b.r)}`);
    }
    assert.deepEqual(ringPairs, [], `怨좊━?쇰━ 寃뱀묠 0: ${JSON.stringify(ringPairs)}`);
    // '횞N' 媛쒖닔 ?쒖떆???먭낵 ??嫄곕━濡??먯젙?쒕떎(?곸옄 寃뱀묠???꾨땲?? ?????쒕㈃?먯꽌 ?⑥뼱???덉뼱???쒕떎.
    const countTouch = graphCheck.counts.map((c) => {
      if (c.dotX == null) return null;
      const dist = Math.hypot(c.x - c.dotX, c.y - c.dotY);
      return dist >= c.dotR + c.h / 2 + 1 ? null : `${c.t} ???쒕㈃?먯꽌 ${Math.round(dist - c.dotR)}px`;
    }).filter(Boolean);
    assert.deepEqual(countTouch, [], `臾대뜑湲?媛쒖닔(횞N)媛 ?먯뿉 ?우? ?딄쾶 ?⑥뼱???덈떎: ${JSON.stringify(countTouch)}`);
    assert.equal(graphCheck.hubPairs, 0, `?덈툕 ?대쫫 ?곸옄 寃뱀묠 0(?ㅼ젣 ${graphCheck.hubPairs}: ${JSON.stringify(graphCheck.pairTexts)})`);
    assert.equal(graphCheck.overflow, 0, `洹몃옒??蹂닿린 媛濡??섏묠 0(?ㅼ젣 ${graphCheck.overflow})`);
    assert.ok(graphCheck.hubs >= 4, `?덈툕媛 洹몃젮吏꾨떎(?ㅼ젣 ${graphCheck.hubs})`);
    assert.ok(graphCheck.thumbs >= 3, `怨좊━ ?몃꽕???숆렇?쇰?媛 蹂댁씤???ㅼ젣 ${graphCheck.thumbs})`);
    assert.ok(graphCheck.stacks.length >= 1, `媛숈? ?곸긽쨌媛숈? 臾대? 臾대뜑湲?媛쒖닔媛 ?쒖떆?쒕떎(?ㅼ젣 ${JSON.stringify(graphCheck.stacks)})`);
    assert.match(graphCheck.badge, /?쒓컙 17/, '?쒖떆???쒓컙 ?섍? ?덈떎');
    // CTO 吏??#713 ?꾩냽): 寃?ш린媛 ?대쫫 ?곸옄?쇰━留??ъ뿀?????대쫫?뷀뿀釉??먃룹씠由꾟넄'泥섏쓬/吏湲?쨌'횞N'?붿젏??0?댁뼱???쒕떎.
    const graphTouch = await page7.evaluate(() => {
      const f = [...document.querySelectorAll('iframe')].at(-1);
      const doc = f.contentDocument;
      const rect = (x) => x.getBoundingClientRect().toJSON();
      const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const out = { nameOnDot: [], nameOnMark: [], countOnDot: [] };
      const dots = [...doc.querySelectorAll('.g-hubdot')].map((c) => ({ key: c.parentElement.getAttribute('data-hub-key'), r: rect(c) }));
      const marks = [...doc.querySelectorAll('.g-mark')].map((x) => ({ r: rect(x) }));
      for (const name of [...doc.querySelectorAll('.g-hubname')]) {
        const nr = rect(name);
        const key = name.parentElement?.getAttribute('data-hub-key');
        const own = dots.find((d) => d.key === key);
        if (own && hit(nr, own.r)) out.nameOnDot.push(name.textContent + ' ???먭린 ??@' + Math.round(nr.left) + ',' + Math.round(nr.top) + ' w' + Math.round(nr.width) + ' | dot @' + Math.round(own.r.left) + ',' + Math.round(own.r.top) + ' w' + Math.round(own.r.width) + ' h' + Math.round(own.r.height));
        for (const mk of marks) if (hit(nr, mk.r)) out.nameOnMark.push(name.textContent + ' ??泥섏쓬/吏湲?);
      }
      for (const count of [...doc.querySelectorAll('.g-stackcount')]) {
        const cr = rect(count);
        const dot = count.parentElement?.querySelector('circle');
        if (dot && hit(cr, rect(dot))) out.countOnDot.push(count.textContent + ' ????);
      }
      return out;
    });
    assert.deepEqual(graphTouch.nameOnDot, [], `?덈툕 ?대쫫???먭린 ???꾩뿉 寃뱀튇?? ${JSON.stringify(graphTouch.nameOnDot)}`);
    assert.deepEqual(graphTouch.nameOnMark, [], `?덈툕 ?대쫫??'泥섏쓬/吏湲? ?쒖떆? 寃뱀튇?? ${JSON.stringify(graphTouch.nameOnMark)}`);
    assert.deepEqual(graphTouch.countOnDot, [], `臾대뜑湲?媛쒖닔(횞N)媛 ???꾩뿉 寃뱀튇?? ${JSON.stringify(graphTouch.countOnDot)}`);
    assert.match(graphCheck.badge, /?쒓컙 17/, '?쒖떆???쒓컙 ?섍? ?덈떎');
    // #627 3?④퀎: ?덈툕 ?곸꽭??'媛숈? ?몃옒瑜??댁? ?ㅻⅨ ?? 移???媛吏??묐떟(臾대?=5嫄는텮I 1嫄? 洹???鍮??묐떟)?쇰줈
    // 3媛?誘몃━蹂닿린쨌AI 紐낆삁?뚯썝 ?쒖떆쨌'??蹂닿린'쨌鍮??곹깭 臾멸뎄쨌????諛곗튂(寃뱀묠쨌?섏묠 0)瑜??⑥젙?쒕떎.
    const fansCheck = await page7.evaluate(async () => {
      const f = [...document.querySelectorAll('iframe')].at(-1);
      const doc = f.contentDocument;
      const hub = [...doc.querySelectorAll('#gsvg g[role="button"]')].find((g) => (g.getAttribute('aria-label') || '').startsWith('臾대?'));
      hub?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((res) => setTimeout(res, 700));
      const box = doc.querySelector('.d-fans');
      const cardR = doc.getElementById('detailCard').getBoundingClientRect();
      const rows = box ? [...box.children].filter((x) => x.querySelector?.('.d-fans-row')) : [];
      const rowRects = rows.map((x) => x.getBoundingClientRect());
      let rowPairs = 0;
      for (let i = 0; i < rowRects.length; i++) for (let j = i + 1; j < rowRects.length; j++) {
        const a = rowRects[i], b = rowRects[j];
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) rowPairs++;
      }
      const outside = rows.filter((x) => { const r = x.getBoundingClientRect(); return r.width === 0 || r.left < cardR.left - 1 || r.right > cardR.right + 1; }).length;
      return {
        head: doc.querySelector('.d-fanshead')?.textContent || '',
        rows: rows.length,
        rowPairs,
        outside,
        aiBadge: doc.querySelector('.d-fans-ai')?.textContent || '',
        aiOnRow: rows[1]?.querySelector('.d-fans-ai')?.textContent || '',
        links: rows.map((x) => x.querySelector('a')?.getAttribute('href') || ''),
        more: doc.querySelector('.d-fans-more')?.textContent || '',
        thumbs: rows.filter((x) => x.querySelector('.d-fans-thumb')).length
      };
    });
    assert.match(fansCheck.head, /媛숈? 臾대?瑜?蹂??ㅻⅨ ??, `移??쒕ぉ? ?뚯뒪 ?곸닔(?ㅼ젣 "${fansCheck.head}")`);
    assert.equal(fansCheck.rows, 3, `泥섏쓬??3媛쒕쭔 蹂댁씤???ㅼ젣 ${fansCheck.rows})`);
    assert.equal(fansCheck.rowPairs, 0, `?ㅻⅨ ??以꾨겮由?寃뱀묠 0(?ㅼ젣 ${fansCheck.rowPairs})`);
    assert.equal(fansCheck.outside, 0, `?ㅻⅨ ??以꾩씠 ?곸꽭 ???덉뿉 ?덈떎(踰쀬뼱??以?${fansCheck.outside})`);
    assert.equal(fansCheck.aiBadge, 'AI 紐낆삁?뚯썝', 'AI 紐낆삁?뚯썝 ?쒖떆媛 ?덈떎');
    assert.equal(fansCheck.aiOnRow, 'AI 紐낆삁?뚯썝', 'AI ?쒖떆??aiTester 以?fixture 2踰덉㎏)??遺숇뒗??);
    assert.ok(fansCheck.links.every((l) => l.startsWith('/t/')), `以꾩씠 怨듦컻 ?몃━ 留곹겕(/t/???? ${JSON.stringify(fansCheck.links)}`);
    assert.ok(fansCheck.thumbs >= 1, '?몃꽕??以꾩씠 ?덈떎(?몃꽕???녿뒗 以꾩? ?먮━瑜?鍮꾩슦吏 ?딅뒗??');
    assert.match(fansCheck.more, /??蹂닿린/, "?섎㉧吏??'??蹂닿린'濡?);
    const afterMore = await page7.evaluate(async () => {
      const f = [...document.querySelectorAll('iframe')].at(-1);
      const doc = f.contentDocument;
      doc.querySelector('.d-fans-more')?.click();
      await new Promise((res) => setTimeout(res, 250));
      return [...doc.querySelectorAll('.d-fans > li')].filter((x) => x.querySelector('.d-fans-row')).length;
    });
    assert.equal(afterMore, 5, `'??蹂닿린'濡??섎㉧吏媛 蹂댁씤???ㅼ젣 ${afterMore})`);
    const emptyCheck = await page7.evaluate(async () => {
      const f = [...document.querySelectorAll('iframe')].at(-1);
      const doc = f.contentDocument;
      const hub = [...doc.querySelectorAll('#gsvg g[role="button"]')].find((g) => (g.getAttribute('aria-label') || '').startsWith('?몃옒'));
      hub?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((res) => setTimeout(res, 700));
      return {
        empty: doc.querySelector('.d-fans-empty')?.textContent || '',
        head: doc.querySelector('.d-fanshead')?.textContent || '',
        overflow: Math.max(0, doc.documentElement.scrollWidth - doc.documentElement.clientWidth)
      };
    });
    assert.equal(emptyCheck.head, '媛숈? ?몃옒瑜??댁? ?ㅻⅨ ??, '?몃옒 ?덈툕??移??쒕ぉ(?뚯뒪 ?곸닔)');
    assert.equal(emptyCheck.empty, '?꾩쭅 媛숈? ?몃옒瑜??댁? ?ㅻⅨ ?ъ씠 ?놁뼱??, `鍮??곹깭 臾멸뎄(?ㅼ젣 "${emptyCheck.empty}")`);
    assert.equal(emptyCheck.overflow, 0, `?ㅻⅨ ??移몄씠 ?덉뼱??媛濡??섏묠 0(?ㅼ젣 ${emptyCheck.overflow})`);
    await ctx7.close();

    // 二쇱냼濡??대━?붿?(#my/graph) ???몄씠 洹몃옒??蹂닿린瑜??붾㈃ ?뚯씪濡??꾩슦?붿? ?⑥젙?쒕떎(硫붾돱 ?⑥텛???녿떎).
    const ctx8 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx8.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
    await ctx8.route('**://i.ytimg.com/**', THUMB);
    await ctx8.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx8.route('**/api/workspace**', (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ revision: 1, state: { version: 1, trees: [graphTree], prefs: {} }, subject: '?쒗뿕怨꾩젙', writeSubjectBound: true, savedAt: '2026-11-15T09:00:00.000Z' })
    }));
    const page8 = await ctx8.newPage();
    await page8.goto(`${base}/v41/?account=1#my/graph`, { waitUntil: 'load' });
    const graphByHash = await frameOf(page8, /track60-graph/);
    assert.ok(graphByHash, '#my/graph 二쇱냼濡?洹몃옒??蹂닿린媛 ?대┛??硫붾돱 ?곌껐 ?놁씠 二쇱냼濡쒕쭔)');
    // ?꾨젅?꾩씠 ?대졇?대룄 二쇱냼媛 ?由щ㈃ 諛고룷媛 4.0 泥??붾㈃?쇰줈 ?섎룎??以??2026-11-16 蹂닿퀬) ??臾몄꽌 ?쒖떆源뚯? 蹂몃떎.
    // ?섍껄 #26 ?섏젙?쇰줈 ?몃━ 媛믪씠 荑쇰━??遺숈쓣 ???덈떎 ???섏쐞 ?대뜑 寃쎈줈 ?먯껜??洹몃?濡쒕떎.
    assert.match(graphByHash.url(), /views\/graph\/track60-graph\.html(?:\?|$)/, '#my/graph ?꾨젅??二쇱냼??洹몃옒???섏쐞 ?대뜑媛 ?덈떎');
    assert.equal(await graphByHash.evaluate(() => document.documentElement.getAttribute('data-v41-screen')), 'graph', '#my/graph ?꾨젅??臾몄꽌媛 洹몃옒???붾㈃?대떎');
    await ctx8.close();

    // 261117 ???寃곗젙: 湲??移대뱶 ?몃? 寃??議댁옱쨌以꽷룸쭚以꾩엫쨌諛곗튂)??1440?먯꽌 ?쒕떎 ??390? 媛?대뜲媛 而ㅼ졇
    // ?꽷룹븘???좉? 移대뱶瑜?紐??댁븘 ?덉쟾留앹씠 沅ㅻ룄 移대뱶瑜??④만 ???덈떎(?뚯닔 移대뱶 ?④? 怨꾩빟?
    // '#657 ?꾩냽 261117' ?⑥뼵??蹂몃떎). 390?먯꽌 ???곹깭??寃뱀묠 寃?щ뒗 蹂댁씠??移대뱶媛 ?놁뼱 ?먮룞 留뚯”?대떎.
    if (width === 1440) {
    // shadowRoot ?덉뿉??以?媛먯젙쨌?좎쭨쨌?쒕ぉ쨌?뚮┝)??吏?ㅻ뒗吏 ???쒕ぉ??3以??믪씠 ??max-height ?덈떒)쨌移대뱶 ??諛곗튂쨌
    // '泥??쒓컙' 諛곗?? 媛먯젙 移?寃뱀묠 0???섏튂濡??⑥젙?쒕떎. 移대뱶??洹몃┝???덉뿉 ?덉쑝誘濡?shadowRoot濡?    // ?ㅼ퐫?묓븳??#730怨?媛숈? ?먯젙). ?몄씠 lt41-date-style ?숆린?붾줈 ?꾨젅?꾩쓣 ?ㅼ떆 ?꾩슦誘濡?留ㅻ쾲 ???꾨젅??寃??
    const ctx9 = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await ctx9.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); localStorage.setItem('lt41.homeCards', 'mine'); } catch {} }, theme);
    await ctx9.route('**://i.ytimg.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90"><rect width="120" height="90" fill="#282828"/><text x="60" y="52" font-size="18" fill="#777" text-anchor="middle">...</text></svg>' }));
    await ctx9.route('**/api/**', (r) => {
      if (/api\/workspace/.test(r.request().url())) {
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [thumbTree], prefs: {} }, subject: '?쒗뿕怨꾩젙', writeSubjectBound: true, savedAt: '2026-11-16T00:00:00.000Z' }) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' });
    });
    const page9 = await ctx9.newPage();
    await page9.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    let homeFrame = null;
    for (let i = 0; i < 80 && !homeFrame; i++) {
      for (const fr of page9.frames()) {
        if (fr === page9.mainFrame()) continue;
        try { if (await fr.evaluate(() => !!document.getElementById('orbit')?.shadowRoot?.querySelector('.card .lt-fallback-title'))) { homeFrame = fr; break; } } catch {}
      }
      if (!homeFrame) await page9.waitForTimeout(300);
    }
    assert.ok(homeFrame, '泥??붾㈃ 湲??移대뱶媛 洹몃젮吏꾨떎(?대젮媛??곸긽 ??湲 移대뱶)');
    const cardCheck = await homeFrame.evaluate(() => {
      const sh = document.getElementById('orbit').shadowRoot;
      const cards = [...sh.querySelectorAll('.card .lt-fallback-card, .recent-media .lt-fallback-card')];
      const bad = [];
      for (const card of cards) {
        const cr = card.getBoundingClientRect();
        const title = card.querySelector('.lt-fallback-title');
        if (!title) { bad.push('?쒕ぉ 移몄씠 ?녿떎'); continue; }
        const tcs = getComputedStyle(title);
        const limit = parseFloat(tcs.fontSize) * parseFloat(tcs.lineHeight) * 3 + 2;
        if (title.clientHeight > limit) bad.push(`?쒕ぉ??3以??믪씠瑜??섎뒗??${title.clientHeight}px > ${Math.round(limit)}px ??max-height 3以??덈떒)`);
        const inside = (el) => { const r = el.getBoundingClientRect(); return r.top >= cr.top - 1 && r.bottom <= cr.bottom + 1 && r.left >= cr.left - 1 && r.right <= cr.right + 1; };
        for (const sel of ['.lt-fallback-head', '.lt-fallback-title', '.lt-fallback-notice']) {
          const el = card.querySelector(sel);
          if (el && !inside(el)) bad.push(sel + '??媛) 移대뱶 諛뽰쑝濡??섏삩??);
        }
        const emo = card.querySelector('.lt-fallback-emotion');
        const date = card.querySelector('.lt-fallback-date');
        if (emo && date) {
          const er = emo.getBoundingClientRect(), dr = date.getBoundingClientRect();
          /* 媛먯젙 移?諛뺤뒪???⑤뵫???ы븿???좎쭨 移멸낵 理쒕? 4px 留욌떯?????덈떎(湲??異⑸룎 ?꾨떂 ??2070 以??ㅼ륫).
             ?먯젙? '?좎쭨媛 媛먯젙蹂대떎 ??以??꾨옒?먯꽌 ?쒖옉?섎뒗媛'(媛곸옄 ?ㅻⅨ 以?濡??쒕떎. */
          if (!(dr.top >= er.top + parseFloat(getComputedStyle(emo).fontSize) - 1)) bad.push('媛먯젙怨??좎쭨媛 媛숈? 以꾩뿉 遺숈뼱 ?덈떎(媛먯젙 ' + Math.round(er.top) + ' / ?좎쭨 ' + Math.round(dr.top) + ')');
        }
        /* 4px ?댄븯???덈? ?꾩튂 ?뚮┝(?섎떒 怨좎젙)쨌諛섏삱由??쒓퀎 ???쒓컖 寃고븿???꾨땲??2070쨌1440 ?ㅼ륫). */
        if (card.scrollHeight > card.clientHeight + 4) bad.push(`移대뱶 ?댁슜??移대뱶 諛뽰쑝濡??섏튇??${card.scrollHeight - card.clientHeight}px)`);
      }
      for (const fm of [...sh.querySelectorAll('.card .firstMark')]) {
        const fb = fm.parentElement?.querySelector('.surface .lt-fallback-card');
        const emo = fb?.querySelector('.lt-fallback-emotion');
        if (!fb || !emo) continue;
        const a = fm.getBoundingClientRect(), b = emo.getBoundingClientRect();
        const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        if (ox * oy > 0) bad.push(`'泥??쒓컙' 諛곗?? 媛먯젙 移⑹씠 寃뱀튇??${Math.round(ox * oy)}px짼)`);
      }
      return { cards: cards.length, bad, overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth) };
    });
    assert.ok(cardCheck.cards >= 1, `泥??붾㈃ 湲??移대뱶 ???ㅼ젣 ${cardCheck.cards})`);
    assert.deepEqual(cardCheck.bad, [], `泥??붾㈃ 湲??移대뱶 以꽷룸쭚以꾩엫쨌諛곗튂: ${JSON.stringify(cardCheck.bad)}`);
    assert.equal(cardCheck.overflow, 0, `泥??붾㈃ 媛濡??섏묠 0(?ㅼ젣 ${cardCheck.overflow})`);
    await take(page9, '泥??붾㈃ 湲??移대뱶');
    await ctx9.close();
    } // width 1440 ??390? ???⑥뼵(沅ㅻ룄 移대뱶 0??????좏븳??
    await context.close();
    return rows;
  };

  try {
    // ??議고빀???섎???媛숈? 釉뚮씪?곗????ㅻⅨ 臾몃㎘) ?????쒓컙??吏?ㅺ린 ?꾪빐?쒕떎.
    for (const theme of ['night', 'garden']) {
      const pairs = await Promise.all(SIZES.map((s) => runCombo(s, theme)));
      for (const rows of pairs) for (const row of rows) (knownHit(row.??ぉ, row.以? ? known : fresh).push(row);
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (known.length) console.log(`#657 ?뚮젮吏?臾몄젣(${known.length}嫄???KNOWN 紐⑸줉???덈떎, 湲곗? 洹몃?濡?:\n` + known.map((r) => '  ' + r.以?.join('\n'));
  assert.deepEqual(fresh, [], `?뚮젮吏?臾몄젣 諛뽰쓽 ???붾㈃ ?ㅽ뙣 ${fresh.length}嫄?\n` + fresh.map((r) => '  ' + r.以?.join('\n'));
});

// #713 ?꾩냽(2026-11-16 蹂닿퀬): #my/graph媛 洹몃옒?꾧? ?꾨땲??泥??붾㈃?쇰줈 ?대졇????screenUrl??洹몃옒?꾩쓽
// ?섏쐞 ?대뜑(views/graph/)瑜?鍮좊쑉???녿뒗 二쇱냼瑜?諛고룷媛 4.0 泥??붾㈃(SPA ?대갚)?쇰줈 ?섎룎??以щ떎.
// ??寃쎌슦 紐⑤몢 iframe ?뚯씪 ?대쫫쨌?꾨젅??臾몄꽌 ?쒖떆(data-v41-screen)쨌二쇱냼瑜?臾몄옄濡?湲곕줉???⑥젙?쒕떎(???먮떒 ?놁쓬).
test('#my/graph??濡쒓렇??吏꾩엯쨌濡쒓렇???뺣났쨌hash ?대룞 ??寃쎌슦 紐⑤몢 洹몃옒???붾㈃???곕떎', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  if (skip) assert.fail(`誘몃━蹂닿린 寃?ъ뿉?쒕뒗 嫄대꼫????ㅽ뙣????${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const GRAPH_FRAME = /views\/graph\/track60-graph\.html/;
  const workspace = (r, owned) => r.fulfill({
    status: owned ? 200 : 401, contentType: 'application/json',
    body: owned
      ? JSON.stringify({ revision: 1, state: { version: 1, trees: [graphTree], prefs: {} }, subject: '?쒗뿕怨꾩젙', writeSubjectBound: true, savedAt: '2026-11-16T09:00:00.000Z' })
      : '{"error":"auth"}'
  });
  const frameShown = (file) => () => {
    const f = document.getElementById('view');
    return !!f && !f.hidden && new RegExp(file).test(f.contentWindow?.location?.href || '');
  };
  const graphState = async (page) => {
    const f = await frameOf(page, GRAPH_FRAME);
    const screen = f ? await f.evaluate(() => document.documentElement.getAttribute('data-v41-screen') || '') : '';
    return { frame: f ? f.url() : '(?꾨젅???놁쓬)', screen, hash: await page.evaluate(() => location.hash) };
  };
  try {
    // ??濡쒓렇?몃맂 ?곹깭?먯꽌 二쇱냼李쎌뿉 #my/graph ?낅젰(???섏씠吏 濡쒕뱶).
    const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await ctx1.route('**://i.ytimg.com/**', THUMB);
    await ctx1.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx1.route('**/api/workspace**', (r) => workspace(r, true));
    const page1 = await ctx1.newPage();
    await page1.goto(`${base}/v41/#my/graph`, { waitUntil: 'load' });
    await page1.waitForFunction(frameShown('track60-graph'), null, { timeout: 20000 });
    const got1 = await graphState(page1);
    assert.match(got1.frame, GRAPH_FRAME, '??濡쒓렇???곹깭 #my/graph: iframe ?뚯씪??views/graph/track60-graph.html?대떎');
    assert.equal(got1.screen, 'graph', '???꾨젅??臾몄꽌媛 洹몃옒???붾㈃?대떎(data-v41-screen)');
    assert.match(got1.hash, /^#my\/graph/, '??二쇱냼媛 #my/graph濡??⑤뒗??);
    await ctx1.close();

    // ??濡쒓렇?꾩썐 ?곹깭?먯꽌 #my/graph濡??ㅼ뼱? 濡쒓렇?몄쓣 嫄곗퀜 ?뚯븘??寃쎌슦 ??媛숈? ??씠 hash ?놁씠 ?뚯븘?ㅺ퀬
    // 蹂닿? 寃쎈줈(pending-owner-route)濡?洹몃옒?꾨? ?섏궡由곕떎. 濡쒓렇???뺣났? ?account=1 ?뚯븘??+ ?뚯썝 ?묐떟?쇰줈 ?됰궡 ?몃떎.
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    let owned = false;
    await ctx2.route('**://i.ytimg.com/**', THUMB);
    await ctx2.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx2.route('**/api/workspace**', (r) => workspace(r, owned));
    const page2 = await ctx2.newPage();
    await page2.goto(`${base}/v41/#my/graph`, { waitUntil: 'load' });
    await page2.waitForTimeout(1200);
    const stash = await page2.evaluate(() => sessionStorage.getItem('lovetree.v41.pending-owner-route.v1') || '');
    assert.equal(stash, '#my/graph', '??濡쒓렇????蹂닿? 寃쎈줈媛 ?⑤뒗??);
    owned = true;
    await page2.goto(`${base}/v41/?account=1`, { waitUntil: 'load' });
    await page2.waitForFunction(frameShown('track60-graph'), null, { timeout: 20000 });
    const got2 = await graphState(page2);
    assert.match(got2.frame, GRAPH_FRAME, '??濡쒓렇???뺣났 ?ㅼ뿉??洹몃옒???붾㈃???곕떎');
    assert.equal(got2.screen, 'graph', '???꾨젅??臾몄꽌媛 洹몃옒???붾㈃?대떎');
    assert.match(got2.hash, /^#my\/graph/, '???뚯븘????二쇱냼媛 #my/graph濡??곗씤??);
    await ctx2.close();

    // ???ㅻⅨ ?붾㈃(梨????덈떎媛 hash留?#my/graph濡?諛붽씔 寃쎌슦.
    const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await ctx3.route('**://i.ytimg.com/**', THUMB);
    await ctx3.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
    await ctx3.route('**/api/workspace**', (r) => workspace(r, true));
    const page3 = await ctx3.newPage();
    await page3.goto(`${base}/v41/#my/book`, { waitUntil: 'load' });
    await page3.waitForFunction(frameShown('track59-sketchbook'), null, { timeout: 20000 });
    await page3.evaluate(() => { location.hash = '#my/graph'; });
    await page3.waitForFunction(frameShown('track60-graph'), null, { timeout: 20000 });
    const got3 = await graphState(page3);
    assert.match(got3.frame, GRAPH_FRAME, '??hash留?諛붽퓭??洹몃옒???붾㈃???곕떎');
    assert.equal(got3.screen, 'graph', '???꾨젅??臾몄꽌媛 洹몃옒???붾㈃?대떎');
    assert.match(got3.hash, /^#my\/graph/, '??二쇱냼媛 #my/graph??);
    await ctx3.close();
  } finally {
    await browser.close();
    server.close();
  }
});

// 261116 ???吏?????댁쁺?쇳꽣 癒몃━以꾩씠 蹂??붾㈃ ??癒몃━以꾧낵 媛숈? 洹쒖튃?몄? ?レ옄濡??먯젙?쒕떎.
// 390쨌1440쨌2560?먯꽌 ??/v41/)怨??댁쁺?쇳꽣(admin.html)??濡쒓퀬 left쨌?ㅻⅨ履????⑥텛 right쨌癒몃━以??믪씠媛
// ?ㅼ감 2px ?덉뿉??媛숈븘???쒕떎. 愿由ъ옄 ?몄뀡? 媛吏?API(?몄뀡 愿由ъ옄쨌鍮?紐⑸줉)濡?留뚮뱾怨? ???쒗뿕 ?뚯씪 ?놁씠
// ??寃?ш린 ?뚯씪???붾떎. ?멸낵 ?댁쁺?쇳꽣??媛숈? 臾몃㎘???ㅻⅨ ??쑝濡??댁뼱 媛숈? 酉고룷?몄뿉???곕떎.
const headerEdges = () => {
  const header = document.querySelector('.app-header');
  const brand = header.querySelector('.brand');
  const rightBtn = [...header.querySelectorAll('button, a')]
    .filter((el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && el.getBoundingClientRect().width > 0; })
    .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
  const box = header.getBoundingClientRect();
  return {
    logoLeft: Math.round(brand.getBoundingClientRect().left),
    rightBtnRight: rightBtn ? Math.round(rightBtn.getBoundingClientRect().right) : 0,
    rightBtnName: rightBtn ? `${rightBtn.tagName.toLowerCase()}.${[...rightBtn.classList].join('.')}` : '(?놁쓬)',
    height: Math.round(box.height)
  };
};
test('?댁쁺?쇳꽣 癒몃━以꾩씠 蹂??붾㈃ ??癒몃━以꾧낵 媛숈? ??룹쐞移섎떎(390쨌1440쨌2560 ??濡쒓퀬 left쨌?ㅻⅨ履????⑥텛 right쨌?믪씠, ?ㅼ감 2px)', { skip: REQUIRE ? false : skip, timeout: 300000 }, async () => {
  if (skip) assert.fail(`誘몃━蹂닿린 寃?ъ뿉?쒕뒗 嫄대꼫????ㅽ뙣????${skip}`);
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1440, 2560]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
      await context.route('**://i.ytimg.com/**', THUMB);
      // ?ㅼ뿉 ?깅줉??寃껋씠 ?닿릿????怨듯넻 ?묐떟??癒쇱?, 愿由ъ옄 ?묐떟???섏쨷??
      await context.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
      await context.route('**/api/admin/session', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, authenticated: true, admin: true }) }));
      await context.route('**/api/admin/feedback', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"feedback":[]}' }));
      await context.route('**/api/admin/journals', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"journals":[]}' }));
      await context.route('**/api/community/admin/reports', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"reports":[]}' }));
      const shell = await context.newPage();
      await shell.goto(`${base}/v41/`, { waitUntil: 'load' });
      await shell.waitForSelector('.app-header', { timeout: 10000 });
      await shell.waitForTimeout(400);
      const admin = await context.newPage();
      await admin.goto(`${base}/admin.html`, { waitUntil: 'load' });
      await admin.waitForSelector('.app-header .brand', { timeout: 10000 });
      await admin.waitForTimeout(400);
      const s = await shell.evaluate(headerEdges);
      const a = await admin.evaluate(headerEdges);
      assert.ok(Math.abs(a.logoLeft - s.logoLeft) <= 2, `${width}: 濡쒓퀬 left媛 ?멸낵 媛숇떎(??${s.logoLeft} / ?댁쁺?쇳꽣 ${a.logoLeft})`);
      assert.ok(Math.abs(a.rightBtnRight - s.rightBtnRight) <= 2, `${width}: ?ㅻⅨ履????⑥텛 right媛 ?멸낵 媛숇떎(??${s.rightBtn}=${s.rightBtnRight} / ?댁쁺?쇳꽣 ${a.rightBtn}=${a.rightBtnRight})`);
      assert.ok(Math.abs(a.height - s.height) <= 2, `${width}: 癒몃━以??믪씠媛 ?멸낵 媛숇떎(??${s.height} / ?댁쁺?쇳꽣 ${a.height})`);
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
});

// 261117 ???寃곗젙: 醫곸? ?붾㈃(390)?먯꽌 沅ㅻ룄 移대뱶媛 8???댄븯??怨꾩젙? 沅ㅻ룄 移대뱶瑜??④릿????// 而ㅼ쭊 媛?대뜲(?꾩そ '+ ?쒓컙 異붽?'쨌?뺣낫 以?媛 ?뚯닔 移대뱶???먯쓣 ??뼱 諛?대궦 移대뱶媛 ?쒖옄由ъ뿉 ?볦???// (?ㅼ륫 3???숈씪 醫뚰몴). 9???댁긽? 湲곗〈 醫곸? ?붾㈃ 沅ㅻ룄瑜?洹몃?濡??대떎(湲??移대뱶 ?곹깭媛 390 寃뱀묠???곕떎).
test('#657 ?꾩냽 261117: 醫곸? ?붾㈃ ?뚯닔 移대뱶(??) 怨꾩젙? 沅ㅻ룄 移대뱶 0????媛?대뜲??吏묒쨷?쒕떎', { skip: REQUIRE ? false : skip, timeout: 120000 }, async () => {
  const { createTree, addMoment } = await import('../public/v41/domain.mjs');
  let t = createTree({ subject: '?쒗뿕', title: '移대뱶 ?곸? ?몃━', note: '湲곕줉', emotion: '?ㅻ젞', date: '2026-11-11', url: '' }, '2026-11-16T00:00:00.000Z');
  t = addMoment(t, { subject: '?쒗뿕', title: '?ъ쭊 ?쒓컙', note: '湲곕줉', emotion: '利먭굅?', date: '2026-11-11', url: '' }, t.moments[0].id, '2026-11-16T00:01:00.000Z');
  t.moments[1].mediaMetadata = { thumbnail: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#8a5a6e"/></svg>').toString('base64') };
  t = addMoment(t, { subject: '?쒗뿕', title: '硫붾え ?쒓컙', note: '湲곕줉', emotion: '洹몃━?', date: '2026-11-12', url: '' }, t.moments[1].id, '2026-11-16T00:02:00.000Z');
  const fewTrees = [t];
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await context.addInitScript((theme) => {
      try {
        localStorage.setItem('lt41.theme', theme);
        localStorage.setItem('lt41.dateStyle', 'dot');
        localStorage.setItem('lt41.titleDisplay', 'both');
        localStorage.setItem('lt41.homeCards', 'mine');
      } catch {}
    }, 'night');
    await context.route('**://i.ytimg.com/**', THUMB);
    await context.route('**/api/**', (r) => {
      if (/api\/workspace/.test(r.request().url())) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: fewTrees, prefs: {} }, subject: '?쒗뿕怨꾩젙', writeSubjectBound: true, savedAt: '2026-11-16T00:00:00.000Z' }) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' });
    });
    const page = await context.newPage();
    await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(6000);
    const visible = await page.evaluate(() => {
      // ?몄씠 ?꾨젅?꾩쓣 媛덉븘?쇱슫??#view쨌#view-next) ??吏湲?蹂댁씠??履쎌쓽 沅ㅻ룄瑜?蹂몃떎(?덉쟾 ?꾨젅?꾩쓽 ?덉떆 沅ㅻ룄? ?욎씠吏 ?딄쾶).
      const els = [...document.querySelectorAll('#view,#view-next')].filter((e) => e.getClientRects().length > 0 && !e.hidden);
      const sh = (els[0] || document.getElementById('view'))?.contentDocument?.getElementById('orbit')?.shadowRoot;
      if (!sh) return null;
      return [...sh.querySelectorAll('button.card')].filter((c) => c.style.display !== 'none').length;
    });
    assert.equal(visible, 0, `390 ?뚯닔 移대뱶 怨꾩젙: 沅ㅻ룄 移대뱶 0???ㅼ젣 ${visible}??`);
    await context.close();
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

// 2026-11-17 CTO 罹≪쿂 ?꾩냽: 390?먯꽌 沅ㅻ룄 移대뱶媛 0?μ씠?대룄 ?ㅻⅨ 痢?移대뱶媛 諛붾떏 留곹겕 以꾩뿉 寃뱀튂吏 ?딅뒗??
// ?덉씠 ?꾨땲???섏튂濡??먯젙?쒕떎 ??蹂댁씠??移대뱶 ?? 移대뱶?붾쭅??寃뱀묠 ??0, 移대뱶 ?꾨옒????留곹겕 以?top??(1440??寃뱀묠 0).
test('#657 ?꾩냽 261117: 移대뱶 痢듭? 諛붾떏 留곹겕 以??꾩뿉???먮Ⅸ??390 few쨌many, 1440)', { skip: REQUIRE ? false : skip, timeout: 180000 }, async () => {
  const { createTree, addMoment } = await import('../public/v41/domain.mjs');
  const treeWith = (n) => {
    let t = createTree({ subject: '?쒗뿕', title: '移대뱶 怨꾩젙', note: '湲곕줉', emotion: '?ㅻ젞', date: '2026-11-11', url: '' }, '2026-11-16T00:00:00.000Z');
    for (let i = 1; i < n; i++) {
      t = addMoment(t, { subject: '?쒗뿕', title: `?쒓컙 ${i}`, note: '湲곕줉', emotion: '?ㅻ젞', date: '2026-11-11', url: '' }, t.moments[i - 1].id, `2026-11-16T00:0${i % 10}:00.000Z`);
      t.moments[i].mediaMetadata = { thumbnail: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#8a5a6e"/></svg>').toString('base64') };
    }
    return t;
  };
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    for (const [label, width, count] of [['few-390', 390, 3], ['many-390', 390, 12], ['many-1440', 1440, 12]]) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
      await ctx.addInitScript(() => { try { localStorage.setItem('lt41.theme', 'night'); localStorage.setItem('lt41.homeCards', 'mine'); } catch {} });
      await ctx.route('**://i.ytimg.com/**', THUMB);
      await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
      await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: [treeWith(count)], prefs: {} }, subject: '?쒗뿕怨꾩젙', writeSubjectBound: true, savedAt: '2026-11-16T00:00:00.000Z' }) }));
      const page = await ctx.newPage();
      await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(6000);
      const measured = await page.evaluate(() => {
        const frames = [...document.querySelectorAll('#view,#view-next')].filter((f) => f.getClientRects().length > 0 && !f.hidden);
        const sh = (frames[0] || document.getElementById('view'))?.contentDocument?.getElementById('orbit')?.shadowRoot;
        const cards = sh ? [...sh.querySelectorAll('button.card')].filter((c) => c.style.display !== 'none' && getComputedStyle(c).display !== 'none') : [];
        const rects = cards.map((c) => {
          const a = c.getBoundingClientRect(), s = c.querySelector('.surface')?.getBoundingClientRect() || a;
          return { l: Math.min(a.left, s.left), r: Math.max(a.right, s.right), t: Math.min(a.top, s.top), b: Math.max(a.bottom, s.bottom) };
        });
        const allLinks = [...document.querySelectorAll('.home-links a,.home-links button')].map((e) => { const r = e.getBoundingClientRect(); return { text: e.textContent.trim().slice(0, 8), l: r.left, r: r.right, t: r.top, b: r.bottom, shown: r.r > r.l && r.b > r.t }; });
        const links = allLinks.filter((l) => l.shown);
        const overlaps = rects.reduce((n, c) => n + links.filter((l) => Math.min(c.r, l.r) - Math.max(c.l, l.l) > 0 && Math.min(c.b, l.b) - Math.max(c.t, l.t) > 0).length, 0);
        const lr = document.querySelector('.home-links')?.getBoundingClientRect();
        window.scrollTo(0, document.documentElement.scrollHeight);
        const scroll = { scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight, links: allLinks.map((l) => ({ text: l.text, shown: l.shown, top: Math.round(l.t), bottom: Math.round(l.b), inView: !l.shown || (l.t >= -1 && l.b <= globalThis.innerHeight + 1) })) };
        return { count: cards.length, overlaps, ceiling: lr ? Math.round(lr.top) - 8 : null, lowest: rects.length ? Math.round(Math.max(...rects.map((c) => c.b))) : null, scroll };
      });
      assert.equal(measured.overlaps, 0, `${label}: 移대뱶?붾컮??留곹겕 寃뱀묠 ${measured.overlaps}??);
      if (label === 'few-390') assert.equal(measured.count, 0, `390 ?뚯닔 移대뱶 怨꾩젙: 蹂댁씠??移대뱶 ${measured.count}??湲곗〈 沅ㅻ룄 ?④? ?좎?)`);
      if (measured.ceiling > 0 && measured.lowest !== null) assert.ok(measured.lowest <= measured.ceiling, `${label}: 移대뱶 ?꾨옒??${measured.lowest} > 留곹겕 以???${measured.ceiling}`);
      assert.equal(measured.scroll.links.length, 4, `${label}: 諛붾떏 留곹겕 4媛쒕? ?곕떎`);
      assert.ok(measured.scroll.links.every((l) => l.inView), `${label}: 留??꾨옒 ?ㅽ겕濡???留곹겕媛 ?붾㈃ 諛???${JSON.stringify(measured.scroll.links)}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
// 2026-11-17 11:28 ???吏?? 媛숈? ??以꾩씠??湲???ш린쨌援듦린瑜?留욎텛怨? 怨좊Ⅸ 移몄? 臾띠쓬 ?덉そ??苑?梨꾩슫??
test('#657 ?꾩냽 261117: ?곷떒 ??湲???듭씪怨?怨좊Ⅸ ??移??믪씠(390쨌1440 횞 ?뺤썝쨌諛?', { skip: REQUIRE ? false : skip, timeout: 240000 }, async () => {
  const { createTree } = await import('../public/v41/domain.mjs');
  const oneTree = [createTree({ subject: '?쒗뿕', title: '紐⑥븘???쒓컙', note: '湲곗뼲', emotion: '?ㅻ젞', date: '2026-11-17', url: '' }, '2026-11-17T00:00:00.000Z')];
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    for (const theme of ['night', 'garden']) {
      for (const width of [1440, 390]) {
        const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
        await ctx.addInitScript((t) => { try { localStorage.setItem('lt41.theme', t); } catch {} }, theme);
        await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
        await ctx.route('**/api/workspace**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1, state: { version: 1, trees: oneTree, prefs: {} }, subject: '?쒗뿕怨꾩젙', writeSubjectBound: true, savedAt: '2026-11-17T00:00:00.000Z' }) }));
        const page = await ctx.newPage();
        await page.goto(`${base}/v41/?account=1`, { waitUntil: 'load', timeout: 30000 });
        await page.waitForFunction(() => !document.getElementById('tree-views')?.hidden, null, { timeout: 10000 });
        const fonts = await page.evaluate(() => {
          const style = (sel) => { const s = getComputedStyle(document.querySelector(sel)); return { size: s.fontSize, weight: s.fontWeight, color: s.color }; };
          const topViews = ['track32-bookshelf.html', 'track59-sketchbook.html', 'track58-pinboard.html', 'track56-network.html'];
          return { browse: style('#community-menu'), picker: style('#record-menu'), tabs: [...document.querySelectorAll('#tree-views button[data-view]')].filter((b) => topViews.includes(b.dataset.view)).map((b) => ({ view: b.dataset.view, size: getComputedStyle(b).fontSize, weight: getComputedStyle(b).fontWeight, color: getComputedStyle(b).color, current: b.getAttribute('aria-current') === 'true' })) };
        });
        assert.equal(fonts.tabs.length, 4, `${width}/${theme}: ??4媛?);
        for (const tab of fonts.tabs) {
          assert.equal(tab.size, fonts.browse.size, `${width}/${theme}/${tab.view}: ?섎윭蹂닿린? 媛숈? 湲???ш린`);
          assert.equal(tab.weight, fonts.browse.weight, `${width}/${theme}/${tab.view}: ?섎윭蹂닿린? 媛숈? 援듦린`);
          assert.equal(tab.size, fonts.picker.size, `${width}/${theme}/${tab.view}: ?몃━ 怨좊Ⅴ湲곗? 媛숈? 湲???ш린`);
          assert.equal(tab.weight, fonts.picker.weight, `${width}/${theme}/${tab.view}: ?몃━ 怨좊Ⅴ湲곗? 媛숈? 援듦린`);
        }
        const unselected = fonts.tabs.filter((t) => !t.current);
        assert.ok(unselected.length >= 3, `${width}/${theme}: 고르지 않은 탭 3개 이상`);
        for (const tab of unselected) assert.equal(tab.color, unselected[0].color, `${width}/${theme}/${tab.view}: 탭 글자색 RGB ${tab.color} = ${unselected[0].color}`);
        const labels = { 'track32-bookshelf.html': '서재', 'track59-sketchbook.html': '책', 'track58-pinboard.html': '보드', 'track56-network.html': '지도' };
        for (const view of ['track32-bookshelf.html', 'track59-sketchbook.html', 'track58-pinboard.html', 'track56-network.html']) {
          if (width === 390) {
            await page.locator('#mobile-more').click();
            await page.locator('#header-overflow button').filter({ hasText: new RegExp('^' + labels[view] + '$') }).evaluate((el) => el.click());
          } else {
            await page.locator(`#tree-views button[data-view="${view}"]`).click();
          }
          await page.waitForTimeout(250);
          if (width === 1440) {
            const box = await page.evaluate(() => {
              const frame = document.querySelector('.tree-frame').getBoundingClientRect();
              const btn = document.querySelector('#tree-views button[aria-current="true"]');
              const r = btn.getBoundingClientRect();
              return { innerTop: Math.round(frame.top + 2), innerBottom: Math.round(frame.bottom - 2), innerHeight: Math.round(frame.height - 4), top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), radius: getComputedStyle(btn).borderTopRightRadius, last: btn === document.querySelector('#tree-views button:last-child') };
            });
            assert.ok(Math.abs(box.height - box.innerHeight) <= 2, `${width}/${theme}/${view}: 移좏븳 ?믪씠 ${box.height} = 臾띠쓬 ?덉そ ${box.innerHeight}`);
            assert.ok(Math.abs(box.top - box.innerTop) <= 2, `${width}/${theme}/${view}: ???щ갚 ${box.top - box.innerTop}px`);
            assert.ok(Math.abs(box.bottom - box.innerBottom) <= 2, `${width}/${theme}/${view}: ?꾨옒 ?щ갚 ${box.innerBottom - box.bottom}px`);
            if (box.last) assert.ok(parseFloat(box.radius) >= 900, `${width}/${theme}/${view}: 留덉?留????ㅻⅨ履??κ?湲?${box.radius}`);
          }
        }
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
