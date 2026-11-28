import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShelf, COVER_PALETTE } from '../public/v41/views/shelf/shelf-model.mjs';
import { thumbnailCandidates } from '../public/v41/thumb-fallback.mjs';

const VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const videoMoment = (i) => ({
  id: 'test-moment-'+i, type: 'video', title: '유튜브 기록 '+i,
  date: '2026-11-28', url: VIDEO_URL, externalUrl: VIDEO_URL,
  image: '', youtubeThumb: false, mediaMetadata: null
});
const trees = Array.from({length: 4}, (_, i) => ({
  id: 'test-tree-'+i, title: '시험 트리 '+(i+1), subject: '공연',
  moments: [videoMoment(i), videoMoment(i+4)]
}));

test('#1596 회원 유튜브 순간 4개 트리의 최근 카드 썸네일은 저장 이미지가 없어도 만들어진다', () => {
  const books = buildShelf(trees, COVER_PALETTE, value => value);
  assert.equal(books.length, 4);
  for (const book of books) {
    assert.equal(book.chapters.length, 2);
    for (const chapter of book.chapters) {
      assert.equal(chapter.image, '', '원본 영상에는 별도 이미지가 없다');
      assert.ok(chapter.thumbCandidates.length > 0, '유튜브 주소에서 후보가 생성된다');
      assert.ok(chapter.thumbCandidates.every(src => /^https:\/\/i\.ytimg\.com\/vi\/dQw4w9WgXcQ\//.test(src)));
    }
  }
});

test('#1596 공개 사진 규칙과 무관하게 개인 기록에서도 유튜브만 자동 후보를 만든다', () => {
  assert.ok(thumbnailCandidates(videoMoment(0), {autoLoad:true}).length>0);
  assert.deepEqual(thumbnailCandidates({type:'link',url:'https://example.invalid/unsafe-photo.jpg',image:'',mediaMetadata:null}, {autoLoad:true}), []);
  const books = buildShelf([{...trees[0], moments: [{id:'plain',type:'memo',title:'메모',url:'',image:'',mediaMetadata:null}]}],COVER_PALETTE);
  assert.equal(books[0].chapters[0].thumbCandidates.length, 0);
});
