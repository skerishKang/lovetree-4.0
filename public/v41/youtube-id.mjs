// 유튜브 영상 id·썸네일 단계 주소 정본의 모듈 진입점(#1059·#1060).
// 실제 구현은 public/v41/youtube-id.js 한 벌이다. 일반 스크립트(책·보드)는 그 파일을 먼저
// 싣고, 모듈은 여기서 같은 값을 import해 쓴다 — 주소 글자를 만드는 곳은 구현 파일뿐이다.
import './youtube-id.js';

const canonical = globalThis.LTYouTubeId;
export const YOUTUBE_HOSTS = canonical.YOUTUBE_HOSTS;
export const YTIMG_HOST = canonical.YTIMG_HOST;
export const VIDEO_ID_RE = canonical.VIDEO_ID_RE;
export const youtubeIdFrom = canonical.youtubeIdFrom;
export const safeYoutubeThumb = canonical.safeYoutubeThumb;
export const youtubeStageThumbUrl = canonical.youtubeStageThumbUrl;
export const isVerticalMoment = canonical.isVerticalMoment;
