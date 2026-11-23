// #791: 미리보기 주소에서만 보이는 체험 예시. 운영 주소에서는 절대 추가하지 않는다.
// 로그아웃 예시 트리(책·보드)와 첫 화면 예시 카드에 같은 순간 3개를 얹는다.
import { hasPreviewExamples } from './host-context.mjs';

const NBA = 'https://www.tiktok.com/@nba/video/7646985299326749983';
const ENHYPEN = 'https://www.tiktok.com/@enhypen/video/7680930477414583573';
const REEL = 'https://www.instagram.com/reel/DR_TeHFCB9m/';

// 공개 영상 주소와 저장해 둔 제목·썸네일(예시 그림)을 함께 넣는다.
export const PREVIEW_MOMENTS = [
  {
    id: 'pv-tt-1', type: 'video', title: 'NBA 순간 #농구', note: '미리보기 체험용 틱톡 순간',
    memo: '미리보기에서만 보이는 틱톡 예시', whyNext: '다음 틱톡 순간으로 이어 봐요',
    image: '/v41/example-media/ex01.webp', url: NBA, externalUrl: NBA, youtubeThumb: true,
    source: 'TikTok', duration: '0:24', date: '2026.11.23', emotion: '설렘',
    first: true, important: true, parentId: null, links: [],
    mediaMetadata: {
      title: 'NBA 순간 #농구', channel: 'nba', source: 'www.tiktok.com',
      thumbnail: '/v41/example-media/ex01.webp', tiktokId: '7646985299326749983', tiktokAuthor: 'nba'
    }
  },
  {
    id: 'pv-tt-2', type: 'video', title: 'ENHYPEN 무대 #ENHYPEN', note: '미리보기 체험용 틱톡 순간',
    memo: '미리보기에서만 보이는 두 번째 틱톡 예시', whyNext: '릴스 글 카드도 이어서 봐요',
    image: '/v41/example-media/ex02.webp', url: ENHYPEN, externalUrl: ENHYPEN, youtubeThumb: true,
    source: 'TikTok', duration: '0:31', date: '2026.11.23', emotion: '벅참',
    first: false, important: true, parentId: 'pv-tt-1', links: [],
    mediaMetadata: {
      title: 'ENHYPEN 무대 #ENHYPEN', channel: 'enhypen', source: 'www.tiktok.com',
      thumbnail: '/v41/example-media/ex02.webp', tiktokId: '7680930477414583573', tiktokAuthor: 'enhypen'
    }
  },
  {
    // 썸네일 없는 릴스 — 캡션·@계정만 있는 글 카드다.
    id: 'pv-ig-1', type: 'video', title: '릴스로 담은 순간 #순간', note: '미리보기 체험용 릴스 순간',
    memo: '미리보기에서만 보이는 릴스 예시(썸네일 없음)', whyNext: '여기서 체험은 끝이에요',
    image: '/v41/example-media/ex03.webp', url: REEL, externalUrl: REEL, youtubeThumb: true,
    source: 'Instagram', duration: '0:18', date: '2026.11.23', emotion: '설렘',
    first: false, important: false, parentId: 'pv-tt-2', links: [],
    mediaMetadata: {
      title: '릴스로 담은 순간 #순간', channel: 'fan', source: 'www.instagram.com',
      instagramAuthor: 'fan', instagramShortcode: 'DR_TeHFCB9m'
    }
  }
];

export const PREVIEW_EDGES = [
  { kind: 'parent', from: 'pv-tt-1', to: 'pv-tt-2', reason: PREVIEW_MOMENTS[0].whyNext },
  { kind: 'parent', from: 'pv-tt-2', to: 'pv-ig-1', reason: PREVIEW_MOMENTS[1].whyNext },
  { kind: 'parent', from: 'pv-ig-1', to: 'm01', reason: PREVIEW_MOMENTS[2].whyNext }
];

// orbit.js의 예시 배열 모양(카드 배치 값 포함). 첫 화면 예시 카드가 이 값을 그대로 쓴다.
export const PREVIEW_SAMPLES = PREVIEW_MOMENTS.map((moment, index) => ({
  ...moment,
  ring: 'main', baseAngle: 0.4 + index * 0.6, phaseOffset: 0.1 * index, zOffset: -40,
  tiltX: 0, tiltY: 0, tiltZ: 0, sizeClass: 'md', next: PREVIEW_MOMENTS[index + 1]?.id || null,
  branch: null, mediaType: 'video', fitMode: 'contain', objectPosition: '50% 50%',
  focalPoint: '50% 50%', viewerFitMode: 'contain', viewerObjectPosition: '50% 50%',
  curated: false, curationClass: 'videoPoster', gender: '', assetSource: '미리보기 예시'
}));

/** 책·보드 예시 트리에만 미리보기 순간을 얹는다. 운영 주소에서는 원본을 그대로 돌려준다. */
export function withPreviewExamples(tree, hostname = globalThis.location?.hostname || '', search = globalThis.location?.search || '') {
  if (!tree || !hasPreviewExamples(hostname, search)) return tree;
  // 앞에 넣어야 첫 화면·책·보드에서 바로 보인다(예시 카드는 뒤쪽을 잘라 내므로).
  const base = (tree.moments || []).map((moment, index) => index === 0 ? { ...moment, first: false, parentId: 'pv-ig-1' } : { ...moment });
  const moments = [...PREVIEW_MOMENTS.map((moment) => ({ ...moment })), ...base];
  const result = { ...tree, moments, edges: [...PREVIEW_EDGES, ...(tree.edges || [])] };
  if (tree.demoData) {
    const demo = (tree.demoData.moments || []).map((moment, index) => index === 0 ? { ...moment, first: false } : { ...moment });
    result.demoData = { ...tree.demoData, moments: [...PREVIEW_MOMENTS.map((moment) => ({ ...moment })), ...demo] };
  }
  return result;
}

/** 첫 화면 예시 카드 배열 — 미리보기에서만 3개를 더한다. */
export function previewSamples(hostname = globalThis.location?.hostname || '', search = globalThis.location?.search || '') {
  return hasPreviewExamples(hostname, search) ? PREVIEW_SAMPLES.map((sample) => ({ ...sample })) : [];
}
