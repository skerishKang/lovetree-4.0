// Display labels only. Data types, IDs and user-authored text stay unchanged.
window.LTLabels=Object.freeze({
 type:value=>({photo:'사진',video:'영상',link:'링크',note:'마음 한마디',memo:'마음 한마디',text:'편지',collage:'사진 모음',archive:'기록',companion:'연결된 순간'})[value]||'순간',
 mode:value=>({OVERVIEW:'전체 보기',CLUSTER_PATH_OVERVIEW:'경로 보기',CLUSTER_FOCUS:'순간 묶음',ORIGIN_REVEAL:'첫 순간의 연결',MOMENT_FOCUS:'선택한 순간',ROUTE_PLAYING:'경로 따라가기',BRANCH_PAUSE:'갈림길 선택'})[value]||'관계 지도'
});
