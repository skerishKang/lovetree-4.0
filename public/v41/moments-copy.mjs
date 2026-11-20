// #1025 2단계: 공개 순간을 내 트리에 새 순간으로 복사하는 순수 규칙.
// 원본 공개 트리는 건드리지 않고, 대상 트리의 순간 배열만 만들어 셸이 상태 전체를 저장한다.
import {addMoment} from './domain.mjs';

export function copyPublicMoment(tree,item,origin=''){
 if(!tree?.moments?.length)throw new Error('트리를 선택해 주세요.');
 const parent=tree.moments[0];
 const grown=addMoment(tree,{
  title:item.title||'',
  url:item.url||'',
  note:'',
  emotion:item.emotion||'설렘',
  date:item.date||'',
  startSeconds:item.startSeconds,
  endSeconds:item.endSeconds,
  mediaMetadata:item.mediaMetadata||null
 },parent.id);
 const moments=[...grown.moments];
 const copied=moments[moments.length-1];
 // 마음 글은 비우고 어느 공개 트리에서 담았는지만 남긴다.
 const source=`원래 출처: ${item.treeTitle||'공개 트리'}${item.shareId&&origin?` · ${origin}/t/${encodeURIComponent(item.shareId)}`:''}`;
 moments[moments.length-1]={...copied,keywords:[...(Array.isArray(item.keywords)?item.keywords:[])],note:source};
 return {moments,treeId:tree.id,momentId:parent.id,copiedId:copied.id};
}
