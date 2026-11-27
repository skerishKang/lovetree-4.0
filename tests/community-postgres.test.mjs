import test from 'node:test';import assert from 'node:assert/strict';
import {applySchema,createPool,createWorkspaceRepo} from '../server/db/postgres.js';
import {createAccountRepo} from '../server/db/account-postgres.js';
import {subjectHash} from '../server/account-service.js';
import {createTree,addMoment} from '../src/domain.js';
import {createShareRepo} from '../server/db/shares-postgres.js';
import {createShareService,createShareHandler} from '../server/share-service.js';
import {createShareShowPendingRepo} from '../server/db/share-show-pending-postgres.js';
import {createStageIndexRepo} from '../server/db/stage-index-postgres.js';
import {createStageVoteRepo} from '../server/db/stage-votes-postgres.js';
import {hasRealCustomersFromEnv} from '../server/db/ranking-policy-sql.js';
import {createCommunityHandler,createCommunityService} from '../server/community-service.js';
import {lockVideo} from '../server/db/stage-assignments-postgres.js';
import {stageKeyForMoment} from '../src/stage-key.js';
import {listVisibleStageMoments} from '../server/db/stage-visibility-sql.js';
import {createCommunityRepo} from '../server/db/community-postgres.js';
import {createTreeVisibilityRepo} from '../server/db/tree-visibility-postgres.js';
import {createTreeDiscoverRepo} from '../server/db/tree-discover-postgres.js';
import {createStatsRepo} from '../server/db/stats-postgres.js';
import {createMemoryStatsRepo} from '../server/testing/memory-stats-repo.js';
import {createMemoryAccountRepo} from '../server/testing/memory-account-repo.js';
import {createMemoryWorkspaceRepo} from '../server/testing/memory-workspace-repo.js';
import {createMemoryShareRepo} from '../server/testing/memory-share-repo.js';
import {createMemoryTreeVisibilityRepo} from '../server/testing/memory-tree-visibility-repo.js';
import {createModelAdminRoleStore} from '../server/testing/model-admin-role-store.js';
import {assertIsolatedTestDatabase} from '../server/testing/isolated-test-database.js';
const DATABASE_URL=process.env.LOVETREE_TEST_DATABASE_URL??'',skip=DATABASE_URL?false:'isolated PostgreSQL unavailable';
const suffix=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,9);
const stageTestUrl = 'https://youtu.be/AbC123xyZ_0';

async function publishStageTestTree(pool, productId, subjectId, clips) {
  const input = { title: '순간', emotion: '설렘' };
  let tree = createTree({ subject: '공연', ...input, ...clips[0] });
  // 계정별로 복원한 트리·순간은 서로 같은 로컬 ID를 가질 수 있다.
  tree.id = 'same-tree';
  tree.moments[0].id = 'm0';
  for (let i = 1; i < Math.max(3, clips.length); i++) {
    tree = addMoment(tree, { ...input, ...clips[i] }, 'm0');
    tree.moments[i].id = 'm' + i;
  }
  const shareId = ('share-' + subjectId).padEnd(24, 'x');
  await pool.query('INSERT INTO lovetree_workspaces(product_id,subject_id,doc) VALUES($1,$2,$3)',
    [productId, subjectId, { version: 1, trees: [tree] }]);
  await createShareRepo(pool).upsertAutoShare({ productId, subjectId, treeId: tree.id, shareId,
    entryMomentId: 'm0', momentCount: tree.moments.length });
  await createTreeDiscoverRepo(pool).set({ productId, subjectId, treeId: tree.id, discover: true });
  return { tree, shareId };
}

test('공개 무대 백필은 기준 구간을 고정하고 재실행·동시 등록에도 같은 ID를 보존한다', { skip }, async () => {
  assertIsolatedTestDatabase(DATABASE_URL);
  const pool = await createPool(DATABASE_URL, { max: 4 });
  try {
    await applySchema(pool);
    const productId = 'lt-' + suffix();
    const repo = createStageIndexRepo(pool);
    const clip = (startSeconds, endSeconds) => ({ url: stageTestUrl, startSeconds, endSeconds });
    const bookmark = { url: stageTestUrl + '?t=42s' };
    await publishStageTestTree(pool, productId, 'a-middle', [clip(14, 26), bookmark]);
    await publishStageTestTree(pool, productId, 'b-last', [clip(18, 30), { url: stageTestUrl, startSeconds: 42 }]);
    await publishStageTestTree(pool, productId, 'z-first', [clip(10, 22), clip(10, 22)]);
    const readIds = async () => new Map((await listVisibleStageMoments(pool, { productId }))
      .map(row => [row.subject_id + '/' + row.moment_id, row.stage_id]));
    const audit = () => repo.audit({ productId });
    assert.deepEqual(await audit(), { expected: 6, actual: 0, missing: 6, extra: 0, invalidTrees: 0 });
    await repo.reconcile({ productId });
    assert.deepEqual(await audit(), { expected: 6, actual: 6, missing: 0, extra: 0, invalidTrees: 0 });
    const ids = await readIds();
    assert.equal(ids.size, 6);
    assert.equal(ids.get('z-first/m0'), ids.get('z-first/m1'));
    assert.equal(ids.get('z-first/m0'), ids.get('a-middle/m0'), '시작 초 순서로 등록한 고정 기준과 정확히 절반 겹친다');
    assert.notEqual(ids.get('z-first/m0'), ids.get('b-last/m0'), '가운데 구간을 거쳐 연쇄 병합하지 않는다');
    assert.equal(ids.get('a-middle/m1'), ids.get('b-last/m1'), '옛 URL의 책갈피는 같은 초의 저장된 책갈피와 같다');
    assert.notEqual(ids.get('a-middle/m1'), ids.get('a-middle/m0'));
    assert.deepEqual(await repo.reconcile({ productId }), { owners: 3, inserted: 0, updated: 0, removed: 0, invalidTrees: 0 });
    assert.deepEqual(await readIds(), ids);
    await pool.query('UPDATE lovetree_workspaces SET revision=revision+1 WHERE product_id=$1 AND subject_id=$2',
      [productId, 'a-middle']);
    assert.deepEqual(await audit(), { expected: 6, actual: 6, missing: 2, extra: 2, invalidTrees: 0 });
    await repo.reconcile({ productId, subjectId: 'a-middle' });
    assert.deepEqual(await audit(), { expected: 6, actual: 6, missing: 0, extra: 0, invalidTrees: 0 });

    const newClip = { url: 'https://youtu.be/ZZZ123xyZ_0', startSeconds: 0, endSeconds: 10 };
    for (const owner of ['concurrent-a', 'concurrent-b']) await publishStageTestTree(pool, productId, owner, [newClip]);
    await Promise.all(['concurrent-a', 'concurrent-b'].map(subjectId => repo.reconcile({ productId, subjectId })));
    const concurrentIds = await readIds();
    assert.ok(concurrentIds.get('concurrent-a/m0'));
    assert.equal(concurrentIds.get('concurrent-a/m0'), concurrentIds.get('concurrent-b/m0'));
    await repo.reconcile({ productId });
    assert.deepEqual(await readIds(), concurrentIds);
    const { rows } = await pool.query(`SELECT
      (SELECT count(*)::int FROM lovetree_stages WHERE product_id=$1) AS stages,
      (SELECT count(*)::int FROM lovetree_stage_assignments WHERE product_id=$1) AS assignments,
      (SELECT count(*)::int FROM lovetree_community_votes WHERE product_id=$1) AS votes`, [productId]);
    assert.deepEqual(rows, [{ stages: 4, assignments: 5, votes: 0 }]);
  } finally { await pool.end(); }
});

test('첫 무대 등록이 영상 잠금을 기다리는 동안 소개를 철회하면 영구 배정을 만들지 않는다', { skip }, async () => {
  assertIsolatedTestDatabase(DATABASE_URL);
  const pool = await createPool(DATABASE_URL, { max: 3 });
  try {
    await applySchema(pool);
    const productId = 'lt-' + suffix(), subjectId = 'owner';
    const { tree } = await publishStageTestTree(pool, productId, subjectId, [{ url: stageTestUrl }]);
    const blocker = await pool.connect();
    let pending, failure;
    try {
      await blocker.query('BEGIN');
      await lockVideo(blocker, productId, stageKeyForMoment(tree.moments[0]));
      const pid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      pending = createStageIndexRepo(pool).reconcile({ productId, subjectId }).catch(error => { failure = error; });
      // 실제로 두 번째 세션이 이 영상 잠금에서 대기하는 것을 확인한 뒤 소개를 끈다.
      const deadline = Date.now() + 5000;
      for (;;) {
        if (failure) throw failure;
        const waiting = await pool.query(
          `SELECT EXISTS(SELECT 1 FROM pg_locks l WHERE NOT l.granted AND l.locktype='advisory'
             AND $1::int = ANY(pg_blocking_pids(l.pid))) AS waiting`, [pid]
        );
        if (waiting.rows[0].waiting) break;
        assert.ok(Date.now() < deadline, '첫 등록이 영상 잠금에 도달해야 한다');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      await createTreeDiscoverRepo(pool).set({ productId, subjectId, treeId: tree.id, discover: false });
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await pending;
    }
    if (failure) throw failure;
    const { rows } = await pool.query(`SELECT
      (SELECT count(*)::int FROM lovetree_stages WHERE product_id=$1) AS stages,
      (SELECT count(*)::int FROM lovetree_stage_assignments WHERE product_id=$1) AS assignments,
      (SELECT count(*)::int FROM lovetree_stage_moments WHERE product_id=$1) AS moments`, [productId]);
    assert.deepEqual(rows[0], { stages: 0, assignments: 0, moments: 0 });
  } finally { await pool.end(); }
});

test('공개 무대 읽기는 원본 revision·소개·공개·별칭 숨김·차단·역할을 요청마다 확인한다', { skip }, async () => {
  assertIsolatedTestDatabase(DATABASE_URL);
  const pool = await createPool(DATABASE_URL, { max: 3 });
  try {
    await applySchema(pool);
    const productId = 'lt-' + suffix();
    const repo = createStageIndexRepo(pool);
    const shares = createShareRepo(pool);
    const discover = createTreeDiscoverRepo(pool);
    const visibility = createTreeVisibilityRepo(pool);
    const context = { productId, subjectId: 'owner', treeId: 'same-tree' };
    const clip = { url: stageTestUrl };
    const { tree, shareId } = await publishStageTestTree(pool, productId, 'owner', [clip]);
    await publishStageTestTree(pool, productId, 'honor', [clip]);
    await publishStageTestTree(pool, productId, 'tester', [clip]);
    await publishStageTestTree(pool, productId, 'unlisted', [{ url: 'https://youtu.be/XyZ123abc_1' }]);
    await discover.set({ ...context, subjectId: 'unlisted', discover: false });
    await pool.query(`INSERT INTO lovetree_product_roles(product_id,subject_id,role)
      VALUES($1,'honor','ai_customer'),($1,'tester','tester')`, [productId]);
    const alias = 'owner-alias'.padEnd(24, 'x');
    await shares.create({ ...context, shareId: alias, entryMomentId: 'm0', view: 'book', momentCount: 3 });
    await repo.reconcile({ productId });
    assert.equal((await pool.query('SELECT stage_id FROM lovetree_stages WHERE product_id=$1 AND video_id=$2',
      [productId, 'XyZ123abc_1'])).rowCount, 0, '링크로만 공유한 영상은 무대 등록부에도 넣지 않는다');
    const visible = (options = {}) => listVisibleStageMoments(pool, { productId, ...options });
    const owners = async (options) => (await visible(options)).map(row => row.subject_id).sort();
    const initial = await visible();
    assert.deepEqual(initial.map(row => row.subject_id).sort(), ['honor', 'owner']);
    const stageId = initial.find(row => row.subject_id === 'owner').stage_id;
    assert.equal(initial.find(row => row.subject_id === 'owner').share_id, shareId);
    assert.equal(initial.find(row => row.subject_id === 'honor').ai_tester, true);
    assert.deepEqual(await owners({ stageId }), ['honor', 'owner']);
    assert.deepEqual(await visible({ stageId: 'missing' }), []);

    const community = createCommunityRepo(pool);
    await community.blockOwner({ productId, blockerSubjectId: 'viewer-a', blockedSubjectId: 'owner' });
    await community.blockOwner({ productId, blockerSubjectId: 'owner', blockedSubjectId: 'viewer-b' });
    for (const viewerSubjectId of ['viewer-a', 'viewer-b']) assert.deepEqual(await owners({ viewerSubjectId }), ['honor']);
    await pool.query(`INSERT INTO lovetree_community_hidden_shares(product_id,share_id,hidden_by) VALUES($1,$2,'admin')`, [productId, alias]);
    assert.deepEqual(await owners(), ['honor'], '대표가 아닌 공유 주소를 숨겨도 같은 트리 모든 주소가 빠진다');
    await pool.query('DELETE FROM lovetree_community_hidden_shares WHERE product_id=$1 AND share_id=$2', [productId, alias]);
    await shares.revoke({ ...context, shareId });
    assert.equal((await visible()).find(row => row.subject_id === 'owner').share_id, alias);
    await shares.revoke({ ...context, shareId: alias });
    assert.deepEqual(await owners(), ['honor']);
    await shares.upsertAutoShare({ ...context, shareId, entryMomentId: 'm0', momentCount: 3 });
    assert.equal((await shares.load({ productId, shareId })).status, 'revoked', '#1046: 동기화가 주인이 내린 자동 행을 되살리지 않는다');
    assert.deepEqual(await owners(), ['honor'], '#1046: 옛 주소는 여전히 공개되지 않는다');
    // #1046: 다시 공유는 공유 창에서 직접 켤 때만 — 새 주소로 만든다.
    const resharedId = 'owner-reshared'.padEnd(24, 'x');
    await shares.create({ ...context, shareId: resharedId, entryMomentId: 'm0', view: 'book', momentCount: 3 });
    await visibility.set({ ...context, visibility: 'private' });
    assert.deepEqual(await owners(), ['honor']);
    await visibility.set({ ...context, visibility: 'public' });
    await discover.set({ ...context, discover: false });
    assert.deepEqual(await owners(), ['honor']);
    await repo.reconcile(context);
    await discover.set({ ...context, discover: true });
    await repo.reconcile(context);
    assert.deepEqual(await owners({ stageId }), ['honor', 'owner']);

    const replaceTree = (value) => pool.query(
      'UPDATE lovetree_workspaces SET revision=revision+1, doc=$2 WHERE product_id=$1 AND subject_id=$3',
      [productId, { version: 1, trees: [value] }, context.subjectId]);
    await replaceTree(tree);
    assert.deepEqual(await owners(), ['honor'], '미갱신 소속은 같은 내용이어도 현재 revision이 아니면 숨긴다');
    const sharing = createShareService({ productId, shareRepo: shares, workspaceRepo: createWorkspaceRepo(pool), stageIndex: repo, pendingShowSync: createShareShowPendingRepo(pool) });
    await sharing.afterSave(context.subjectId);
    await sharing.waitForShowSync();
    assert.deepEqual(await owners({ stageId }), ['honor', 'owner']);
    await replaceTree({ ...tree, moments: tree.moments.slice(0, 2) });
    await repo.reconcile(context);
    assert.deepEqual(await owners(), ['honor'], '공유 행의 moment_count가 아직 3이어도 원본이 2면 제외한다');
  } finally { await pool.end(); }
});
test('community rows are independent, idempotent and auditable',{skip},async()=>{
 assertIsolatedTestDatabase(DATABASE_URL);const pool=await createPool(DATABASE_URL,{max:3});
 try{
  await applySchema(pool);const repo=createCommunityRepo(pool),tag=suffix(),productId='lt-'+tag,shareId=('s'+tag).padEnd(24,'x').slice(0,24);
  await pool.query(`INSERT INTO lovetree_shares(product_id,share_id,subject_id,tree_id,entry_moment_id,initial_view,discoverable,moment_count) VALUES($1,$2,$3,'tree','moment','book',true,3)`,[productId,shareId,'owner-'+tag]);
  // 2026-11-16 대표 결정: 소개가 켜진 트리만 목록에 나온다(기본 꺼짐) — 시드 뒤 켠다.
  await pool.query(`INSERT INTO lovetree_tree_discover(product_id,subject_id,tree_id,discover) VALUES($1,$2,'tree',true)`,[productId,'owner-'+tag]);
  assert.equal((await repo.listDiscoverable({productId})).length,1);
  await repo.setFavorite({productId,shareId,subjectId:'reader',enabled:true});await repo.setFavorite({productId,shareId,subjectId:'reader',enabled:true});
  await repo.setReaction({productId,shareId,subjectId:'reader',enabled:true});
  assert.deepEqual(await repo.stats({productId,shareId,viewerSubjectId:'reader'}),{favorites:1,hearts:1,comments:0,favored:true,hearted:true,reactions:{heart:1,like:0,love:0,laugh:0,wow:0,sad:0,angry:0},mine:['heart']});
  const first=await repo.createComment({productId,commentId:'comment-'+tag,shareId,subjectId:'reader',body:'hello',clientKey:'comment-key-'+tag});
  const replay=await repo.createComment({productId,commentId:'other-'+tag,shareId,subjectId:'reader',body:'changed',clientKey:'comment-key-'+tag});
  assert.equal(replay.id,first.id);assert.equal(replay.body,'hello');
  const concurrent=await Promise.all([repo.createComment({productId,commentId:'parallel-a-'+tag,shareId,subjectId:'reader',body:'same',clientKey:'parallel-key-'+tag}),repo.createComment({productId,commentId:'parallel-b-'+tag,shareId,subjectId:'reader',body:'same',clientKey:'parallel-key-'+tag})]);assert.equal(concurrent[0].id,concurrent[1].id);
  const report=await repo.createReport({productId,reportId:'report-'+tag,shareId,subjectId:'reader',reason:'check',clientKey:'report-key-'+tag});
  assert.equal((await repo.moderateReport({productId,reportId:report.id,status:'resolved',visibility:'hidden',actorSubjectId:'admin'})).hidden,true);
  assert.equal((await repo.listDiscoverable({productId})).length,0);
  assert.equal((await repo.moderateReport({productId,reportId:report.id,status:'dismissed',visibility:'visible',actorSubjectId:'admin'})).hidden,false);
  const {rows}=await pool.query(`SELECT count(*)::int AS n FROM lovetree_community_moderation_audit WHERE product_id=$1`,[productId]);assert.equal(rows[0].n,4);
  const service=createCommunityService({communityRepo:repo,shareRepo:createShareRepo(pool),workspaceRepo:createWorkspaceRepo(pool),productId,admin:{roleFor:async()=>null}});
  await assert.rejects(()=>service.report('reader',shareId,'','report-key-'+tag+'-empty'),e=>e.status===400&&e.code==='report_reason_required');
  const exact500=await service.report('reader',shareId,'가'.repeat(500),'report-key-'+tag+'-exact500');
  assert.equal((await repo.listReports({productId,limit:100})).find(r=>r.id===exact500.id).reason.length,500);
  await assert.rejects(()=>service.report('reader',shareId,'가'.repeat(501),'report-key-'+tag+'-too-long'),e=>e.status===400&&e.code==='report_reason_required');
  await assert.rejects(()=>service.tagMoments({tag:'',viewerSubjectId:null}),e=>e.status===400&&e.code==='tag_invalid');
  await repo.blockOwner({productId,blockerSubjectId:'reader',blockedSubjectId:'owner-'+tag});
  assert.equal((await repo.listDiscoverable({productId,viewerSubjectId:'reader'})).length,0);
 }finally{await pool.end();}
});
test('탈퇴하면 해당 제품에서 내 무대 소속·담기·표만 지워지고 공유 무대와 구간 배정은 보존된다', { skip }, async () => {
  assertIsolatedTestDatabase(DATABASE_URL);
  const pool = await createPool(DATABASE_URL, { max: 2 });
  try {
    await applySchema(pool);
    const productId = 'lt-' + suffix();
    const otherProductId = productId + '-other';
    const videoId = 'aBcDeFgHiJ1';
    const stages = new Map();
    for (const [product, members] of [[productId, ['leaving', 'remaining']], [otherProductId, ['leaving']]]) {
      const { rows } = await pool.query(
        `INSERT INTO lovetree_stages(product_id, platform, video_id, kind)
         VALUES ($1, 'youtube', $2, 'whole') RETURNING stage_id`, [product, videoId]
      );
      const stageId = rows[0].stage_id;
      stages.set(product, stageId);
      await pool.query(
        `INSERT INTO lovetree_stage_assignments(product_id, key_version, platform, video_id, kind, stage_id)
         VALUES ($1, 1, 'youtube', $2, 'whole', $3)`, [product, videoId, stageId]
      );
      for (const subject of members) {
        const tree = createTree({ subject: '무대', title: '공연', emotion: '설렘', url: 'https://youtu.be/' + videoId });
        await pool.query(
          'INSERT INTO lovetree_workspaces(product_id, subject_id, doc) VALUES ($1, $2, $3)',
          [product, subject, { version: 1, trees: [tree] }]
        );
        await pool.query(
          `INSERT INTO lovetree_stage_moments(product_id, subject_id, tree_id, moment_id, stage_id, source_revision)
           VALUES ($1, $2, $3, $4, $5, 1)`, [product, subject, tree.id, tree.moments[0].id, stageId]
        );
        await pool.query(
          `INSERT INTO lovetree_community_votes(product_id, target_kind, target_id, subject_id)
           VALUES ($1, 'stage', $2, $3)`, [product, stageId, subject]
        );
        await pool.query(
          'INSERT INTO lovetree_stage_saves(product_id, stage_id, subject_id) VALUES ($1, $2, $3)',
          [product, stageId, subject]
        );
      }
    }

    const { tables } = await createAccountRepo(pool).deleteAll({
      productId, subjectId: 'leaving', subjectHash: subjectHash('leaving')
    });
    for (const table of ['lovetree_stage_moments', 'lovetree_stage_saves', 'lovetree_community_votes']) {
      assert.equal(tables[table], 1, table);
      for (const [product, remainingSubject] of [[productId, 'remaining'], [otherProductId, 'leaving']]) {
        const { rows } = await pool.query(`SELECT subject_id FROM ${table} WHERE product_id = $1`, [product]);
        assert.deepEqual(rows, [{ subject_id: remainingSubject }], table);
      }
    }
    for (const table of ['lovetree_stages', 'lovetree_stage_assignments']) {
      for (const [product, stageId] of stages) {
        const { rows } = await pool.query(`SELECT stage_id FROM ${table} WHERE product_id = $1`, [product]);
        assert.deepEqual(rows, [{ stage_id: stageId }], table);
      }
    }
  } finally {
    await pool.end();
  }
});
test('browse reaction counts keep every kind and deletes remove only the requested kind',{skip},async()=>{
 assertIsolatedTestDatabase(DATABASE_URL);const pool=await createPool(DATABASE_URL,{max:3});
 try{
  await applySchema(pool);const repo=createCommunityRepo(pool),tag=suffix(),productId='lt-'+tag,shareId=('r'+tag).padEnd(24,'x').slice(0,24);
  await pool.query(`INSERT INTO lovetree_shares(product_id,share_id,subject_id,tree_id,entry_moment_id,initial_view,discoverable,moment_count) VALUES($1,$2,$3,'tree','moment','book',true,3)`,[productId,shareId,'owner-'+tag]);
  await pool.query(`INSERT INTO lovetree_tree_discover(product_id,subject_id,tree_id,discover) VALUES($1,$2,'tree',true)`,[productId,'owner-'+tag]);
  const card=async viewer=>{const rows=await repo.listDiscoverableSummaries({productId,viewerSubjectId:viewer});return rows.find(row=>row.share.shareId===shareId);};
  await repo.setReaction({productId,shareId,subjectId:'reader-a',kind:'like',enabled:true});
  const first=await card('reader-a');
  assert.deepEqual(first.stats.reactions,{heart:0,like:1,love:0,laugh:0,wow:0,sad:0,angry:0});
  assert.deepEqual(first.stats.mine,['like']);
  await repo.setReaction({productId,shareId,subjectId:'reader-b',kind:'heart',enabled:true});
  await repo.setReaction({productId,shareId,subjectId:'reader-a',kind:'love',enabled:true});
  const both=await card('reader-a');
  assert.equal(both.stats.reactions.heart,1);assert.equal(both.stats.reactions.like,1);assert.equal(both.stats.reactions.love,1);
  assert.deepEqual([...both.stats.mine].sort(),['like','love']);
  await repo.setReaction({productId,shareId,subjectId:'reader-a',kind:'like',enabled:false});
  const afterDelete=await card('reader-a');
  assert.deepEqual(afterDelete.stats.reactions,{heart:1,like:0,love:1,laugh:0,wow:0,sad:0,angry:0});
  assert.deepEqual(afterDelete.stats.mine,['love']);
  await repo.setReaction({productId,shareId,subjectId:'reader-a',kind:'love',enabled:false});
  await repo.setReaction({productId,shareId,subjectId:'reader-a',kind:'like',enabled:true});
  const switched=await card('reader-a');
  assert.deepEqual(switched.stats.mine,['like']);
  assert.equal(switched.stats.reactions.like,1);assert.equal(switched.stats.reactions.love,0);
  await repo.setReaction({productId,shareId,subjectId:'reader-a',kind:'heart',enabled:true});
  await repo.setReaction({productId,shareId,subjectId:'reader-a',kind:'heart',enabled:false});
  const heartOff=await card('reader-a');
  assert.deepEqual(heartOff.stats.mine,['like']);
  assert.equal(heartOff.stats.reactions.heart,1);
 }finally{await pool.end();}
});
test('#538 둘러보기 SQL: 소개 켬 + 순간 3개 이상·트리당 한 행·비공개 제외·숨김은 트리 단위(261116 대표 결정)',{skip},async()=>{
 assertIsolatedTestDatabase(DATABASE_URL);const pool=await createPool(DATABASE_URL,{max:3});
 try{
  await applySchema(pool);const repo=createCommunityRepo(pool),visibility=createTreeVisibilityRepo(pool),discover=createTreeDiscoverRepo(pool),tag=suffix(),productId='lt-'+tag;
  const insert=async(shareId,subjectId,treeId,{origin='auto',momentCount=3,discoverable=false})=>{
   await pool.query(`INSERT INTO lovetree_shares(product_id,share_id,subject_id,tree_id,entry_moment_id,initial_view,discoverable,origin,moment_count) VALUES($1,$2,$3,$4,'moment','book',$5,$6,$7)`,
    [productId,shareId,subjectId,treeId,discoverable,origin,momentCount]);
  };
  const sid=prefix=>(prefix+tag).padEnd(24,'x').slice(0,24);
  const listedTrees=async()=>(await repo.listDiscoverable({productId})).map(row=>row.treeId).sort();
  await insert(sid('auto3'),'own-a','tree-a',{});await discover.set({productId,subjectId:'own-a',treeId:'tree-a',discover:true}); // 켬 → 나온다
  await insert(sid('own3'),'own-b','tree-b',{origin:'owner',discoverable:true});await discover.set({productId,subjectId:'own-b',treeId:'tree-b',discover:true}); // 옛 스위치 행도 소개 표가 켜져야 나온다
  await insert(sid('two'),'own-c','tree-c',{momentCount:2});await discover.set({productId,subjectId:'own-c',treeId:'tree-c',discover:true}); // 2개 → 안 나온다
  await insert(sid('off'),'own-f','tree-f',{});                             // 기본 꺼짐 → 안 나온다
  await insert(sid('priv'),'own-d','tree-d',{});await discover.set({productId,subjectId:'own-d',treeId:'tree-d',discover:true}); // 켜도 비공개는 안 나온다
  await visibility.set({productId,subjectId:'own-d',treeId:'tree-d',visibility:'private'});
  await insert(sid('dupO'),'own-e','tree-e',{origin:'owner',discoverable:true});await discover.set({productId,subjectId:'own-e',treeId:'tree-e',discover:true}); // 같은 트리에
  await insert(sid('dupA'),'own-e','tree-e',{});                            // 자동 행과 옛 행 → 한 행만
  assert.deepEqual(await listedTrees(),['tree-a','tree-b','tree-e'],'2개·비공개·소개 꺼짐은 빠지고 트리당 한 행만');
  const dup=(await repo.listDiscoverable({productId})).find(row=>row.treeId==='tree-e');
  assert.equal(dup.shareId,sid('dupA'),'트리당 자동 공개 행을 우선한다');
  // 숨김은 트리 단위: 자동 행을 숨겨도 같은 트리의 옛 행으로 다시 나오지 않는다.
  await pool.query(`INSERT INTO lovetree_community_hidden_shares(product_id,share_id,hidden_by) VALUES($1,$2,'admin')`,[productId,sid('dupA')]);
  assert.deepEqual(await listedTrees(),['tree-a','tree-b']);
  // 고객이 끄면 빠지고, 다시 켜면 돌아온다(무료 — 재실행 안전).
  await discover.set({productId,subjectId:'own-a',treeId:'tree-a',discover:false});
  assert.deepEqual(await listedTrees(),['tree-b'],'끄면 목록에서 빠진다');
  await discover.set({productId,subjectId:'own-a',treeId:'tree-a',discover:true});
  assert.deepEqual(await listedTrees(),['tree-a','tree-b'],'다시 켜면 목록에 돌아온다');
 }finally{await pool.end();}
});

// #655 2차: 운영센터 전체 숫자의 집계 질의. 실제 PostgreSQL 이 메모리 모형과 같은 숫자를 내는지 함께 본다.
test('운영센터 전체 숫자 집계: 계정·트리·순간·공개·둘러보기·AI 테스터를 한 번의 집계로 세고 메모리 모형과 같다',{skip},async()=>{
 assertIsolatedTestDatabase(DATABASE_URL);const pool=await createPool(DATABASE_URL,{max:3});
 try{
  await applySchema(pool);const tag=suffix(),productId='lt-'+tag;
  const REAL_ONE='sub_a'+tag,REAL_TWO='sub_b'+tag,AI_ONE='sub_c'+tag;
  const recent=new Date(Date.now()-3600e3).toISOString(),old='2026-05-01T00:00:00.000Z';
  const tree=(id,subject,moments,createdAt=old)=>({id,subject,title:'나무 '+id,coverMomentId:'',coverDesign:'',inbox:false,createdAt,updatedAt:createdAt,
    moments:moments.map((createdAt,index)=>({id:`${id}-m${index}`,parentId:null,links:[],title:'순간',note:'',emotion:'설렘',date:'2026-05-01',url:'',createdAt}))});
  const docs=new Map([
    [REAL_ONE,{version:1,trees:[tree('t1','윤슬',[recent,old]),tree('t2','윤슬',[old])]}],
    [REAL_TWO,{version:1,trees:[tree('t3','윤슬',[recent],recent)]}],
    [AI_ONE,{version:1,trees:[tree('t4','윤슬',[old,old,old])]}]
  ]);
  for(const [subjectId,doc] of docs)await pool.query('INSERT INTO lovetree_workspaces(product_id,subject_id,doc) VALUES($1,$2,$3::jsonb)',[productId,subjectId,JSON.stringify(doc)]);
  // AI 테스터 역할과 공유 행. '계정'과 '새 계정'은 로그인 표(lovetree_account_emails)의
  // created_at(첫 로그인 시각 = 가입일)으로 가른다 — 문서를 하나도 안 쓴 로그인만 계정도 센다.
  await pool.query("INSERT INTO lovetree_product_roles(product_id,subject_id,role) VALUES($1,$2,'ai_customer')",[productId,AI_ONE]);
  const LOGIN_ONLY='sub_d'+tag;
  // #671: 레인 시험 계정 표식 tester — 실제 사용자와 갈라 센다.
  const TESTER_ONE='sub_e'+tag;
  await pool.query("INSERT INTO lovetree_product_roles(product_id,subject_id,role) VALUES($1,$2,'tester')",[productId,TESTER_ONE]);
  const login=(subjectId,createdAt)=>pool.query('INSERT INTO lovetree_account_emails(product_id,subject_id,email,created_at) VALUES($1,$2,$3,$4)',[productId,subjectId,subjectId+'@example.test',createdAt]);
  await login(REAL_ONE,old);
  await login(REAL_TWO,old);
  await login(AI_ONE,old);
  await login(LOGIN_ONLY,recent);
  await login(TESTER_ONE,recent);
  await pool.query('INSERT INTO lovetree_workspaces(product_id,subject_id,doc) VALUES($1,$2,$3::jsonb)',[productId,TESTER_ONE,JSON.stringify({version:1,trees:[{id:'t5',createdAt:recent,moments:[{id:'t5-m0',createdAt:recent},{id:'t5-m1',createdAt:recent}]}]})]);
  const share=(shareId,subjectId,treeId,momentCount,createdDaysAgo)=>pool.query(
    `INSERT INTO lovetree_shares(product_id,share_id,subject_id,tree_id,entry_moment_id,initial_view,origin,moment_count,created_at)
     VALUES($1,$2,$3,$4,$5,'book','auto',$6,now()-($7||' days')::interval)`,[productId,shareId,subjectId,treeId,treeId+'-m0',momentCount,String(createdDaysAgo)]);
  await share(('s1'+tag).padEnd(24,'x').slice(0,24),REAL_ONE,'t1',3,30);
  await share(('s2'+tag).padEnd(24,'x').slice(0,24),REAL_ONE,'t2',1,30);
  await share(('s3'+tag).padEnd(24,'x').slice(0,24),AI_ONE,'t4',3,30);
  await share(('s4'+tag).padEnd(24,'x').slice(0,24),REAL_TWO,'t3',3,0);
  // 2026-11-16 대표 결정: 소개 켬 트리만 둘러보기 숫자에 센다 — t1·t4는 켜고, t2(1개)도 켜 보아 순간 수 조건을 함께 본다.
  await pool.query(`INSERT INTO lovetree_tree_discover(product_id,subject_id,tree_id,discover) VALUES($1,$2,'t1',true),($1,$3,'t4',true),($1,$2,'t2',true)`,[productId,REAL_ONE,AI_ONE]);
  // 비공개 트리는 공유 행이 있어도 공개·둘러보기에서 빠진다.
  await pool.query("INSERT INTO lovetree_tree_visibility(product_id,subject_id,tree_id,visibility) VALUES($1,$2,'t3','private')",[productId,REAL_TWO]);

  const stats=await createStatsRepo(pool).aggregate({productId,since:new Date(Date.now()-7*86400e3).toISOString()});
  // #743: 트리 계열 카드의 펼침 내역에 쓰는 제목 목록(최대 20)도 같은 집계에서 온다 — 제목만 싣는다.
  // t5는 제목이 없어 목록에서 빠진다(빈 이름을 지어내지 않는다). 순서는 제목·id 순(두 구현 같은 규칙).
  assert.deepEqual(stats,{
    accountsReal:3,accountsAi:1,accountsTester:1,accountsNewReal:1,accountsNewAi:0,accountsNewTester:1,
    treesReal:3,treesAi:1,treesTester:1,
    momentsReal:4,momentsAi:3,momentsTester:2,momentsNewReal:2,momentsNewAi:0,momentsNewTester:2,
    publicReal:2,publicAi:1,publicTester:0,
    featuredReal:1,featuredAi:1,featuredTester:0,
    treesTitles:['나무 t1','나무 t2','나무 t3','나무 t4'],
    publicTitles:['나무 t1','나무 t2','나무 t4'],
    featuredTitles:['나무 t1','나무 t4']
  });

  // 같은 자료를 메모리 저장소로도 쌓아 두 구현이 같은 숫자를 내는지 본다(계약이 갈라지면 여기서 걸린다).
  const workspaceRepo=createMemoryWorkspaceRepo();
  let writes=0;
  for(const [subjectId,doc] of docs)await workspaceRepo.commit({productId,subjectId,doc,expectedRevision:0,clientKey:'k'+(++writes),requestHash:'a'.repeat(64)});
  const accountRepo=createMemoryAccountRepo();
  for(const [subjectId,createdAt] of [[REAL_ONE,old],[REAL_TWO,old],[AI_ONE,old],[LOGIN_ONLY,recent],[TESTER_ONE,recent]]){
    await accountRepo.upsertEmail({productId,subjectId,email:subjectId+'@example.test',at:createdAt});
  }
  const shareRepo=createMemoryShareRepo({now:Date.now()-30*86400e3});
  for(const [subjectId,treeId,momentCount,daysAgo] of [[REAL_ONE,'t1',3,30],[REAL_ONE,'t2',1,30],[AI_ONE,'t4',3,30],[REAL_TWO,'t3',3,0]]){
    await shareRepo.upsertAutoShare({productId,subjectId,shareId:'m'+subjectId+treeId,treeId,entryMomentId:treeId+'-m0',momentCount});
  }
  const roleStore=createModelAdminRoleStore();
  await roleStore.assign({productId,subjectId:AI_ONE,role:'ai_customer'});
  await roleStore.assign({productId,subjectId:TESTER_ONE,role:'tester'});
  await workspaceRepo.commit({productId,subjectId:TESTER_ONE,doc:{version:1,trees:[{id:'t5',createdAt:recent,moments:[{id:'t5-m0',createdAt:recent},{id:'t5-m1',createdAt:recent}]}]},expectedRevision:0,clientKey:'k-tester',requestHash:'b'.repeat(64)});
  const visibilityRepo=createMemoryTreeVisibilityRepo();
  await visibilityRepo.set({productId,subjectId:REAL_TWO,treeId:'t3',visibility:'private'});
  const memory=await createMemoryStatsRepo({workspaceRepo,shareRepo,accountRepo,roleStore,visibilityRepo}).aggregate({productId,since:new Date(Date.now()-7*86400e3).toISOString()});
  assert.deepEqual(memory,stats);
 }finally{await pool.end();}
});

const week = { since: '2026-11-15T15:00:00.000Z', until: '2026-11-22T15:00:00.000Z' };
const video = (i) => 'V' + String(i).padStart(10, '0');
const clip = (i, fields = {}) => ({ url: 'https://youtu.be/' + video(i), ...fields });

async function voteFixture(t) {
  assertIsolatedTestDatabase(DATABASE_URL);
  const pool = await createPool(DATABASE_URL, { max: 5 });
  t.after(() => pool.end());
  await applySchema(pool);
  const productId = 'lt-' + suffix();
  const addTree = async (label, clips) => {
    const subjectId = 'private-owner-' + label, shareId = ('public-' + label).padEnd(24, 'x');
    const input = { subject: '공연', emotion: '설렘', title: '장면 ' + label, note: 'unpublished-note' };
    let tree = createTree({ ...input, ...clips[0] });
    for (let i = 1; i < Math.max(3, clips.length); i++) tree = addMoment(tree, { ...input, ...clips[i] }, tree.moments[0].id);
    tree.title = '책 ' + label;
    await pool.query('INSERT INTO lovetree_workspaces(product_id,subject_id,doc) VALUES($1,$2,$3)',
      [productId, subjectId, { version: 1, trees: [tree] }]);
    const source = { productId, subjectId, treeId: tree.id, momentId: tree.moments[0].id, shareId };
    await createShareRepo(pool).upsertAutoShare({ ...source, entryMomentId: source.momentId, momentCount: tree.moments.length });
    await createTreeDiscoverRepo(pool).set({ ...source, discover: true });
    return source;
  };
  const index = async () => {
    await createStageIndexRepo(pool).reconcile({ productId });
    const { rows } = await pool.query('SELECT video_id,stage_id FROM lovetree_stages WHERE product_id=$1', [productId]);
    return new Map(rows.map(row => [row.video_id, row.stage_id]));
  };
  const addVotes = (kind, target, subjects, at = week.since) => pool.query(`INSERT INTO lovetree_community_votes
    (product_id,target_kind,target_id,subject_id,voted_at) SELECT $1,$2,$3,s,$4::timestamptz FROM unnest($5::text[]) AS s`,
    [productId, kind, target, at, subjects]);
  return { pool, productId, addTree, index, addVotes, repo: createStageVoteRepo(pool) };
}

test('같은 무대를 다른 트리에서 동시에 담고 해제해도 최초 표·시각은 하나다', { skip }, async (t) => {
  const { pool, productId, addTree, index, addVotes, repo } = await voteFixture(t);
  const sourceA = await addTree('a', [clip(0), clip(0)]), sourceB = await addTree('b', [clip(0)]);
  const stageId = (await index()).get(video(0));
  for (const { shareId, momentId } of [sourceA, sourceB]) {
    assert.deepEqual(await repo.resolveMoment({ productId, shareId, momentId }), { stageId });
  }
  const subjectId = 'reader';
  const options = { productId, stageId, subjectId, ...week, votedAt: week.since };
  const vote = (enabled) => repo.setVote({ ...options, enabled });
  const original = () => pool.query(`SELECT voted_at::text FROM lovetree_community_votes
    WHERE product_id=$1 AND target_kind='stage' AND target_id=$2 AND subject_id=$3`, [productId, stageId, subjectId]);
  for (const result of await Promise.all([vote(true), vote(true), vote(true)])) {
    assert.deepEqual(result, { saved: true, voted: true, weeklyVoters: null });
  }
  const { rows } = await original();
  assert.equal(rows.length, 1);
  await Promise.all([vote(false), vote(true), vote(false)]);
  await vote(false);
  const unsaved = await repo.detail({ ...options, viewerSubjectId: subjectId });
  assert.equal(unsaved.saved, false);
  assert.equal(unsaved.voted, true);
  await addVotes('stage', stageId, ['new-a', 'new-b'], week.until);
  const resaved = await repo.setVote({ ...options, enabled: true, since: week.until,
    until: '2026-11-29T15:00:00Z', votedAt: week.until });
  assert.equal(resaved.weeklyVoters, null, '다음 주의 두 표에 재담기를 더하지 않는다');
  assert.deepEqual((await original()).rows, rows);
  assert.equal((await repo.detail({ ...options, viewerSubjectId: subjectId })).saved, true);
  await createAccountRepo(pool).deleteAll({ productId, subjectId, subjectHash: subjectHash(subjectId) });
  assert.equal(await vote(true), null, '탈퇴 전에 인증했던 요청을 늦게 쓰더라도 표를 되살리지 않는다');
  assert.equal((await original()).rowCount, 0);
  assert.equal((await pool.query('SELECT 1 FROM lovetree_stage_saves WHERE product_id=$1 AND subject_id=$2',
    [productId, subjectId])).rowCount, 0);
});

test('실제 가입 기록으로 7일 직전 PUT은 403, 정확히 7일인 PUT은 최초 시각을 남긴다', { skip }, async (t) => {
  const { pool, productId, addTree, index, addVotes, repo } = await voteFixture(t);
  await addTree('age', [clip(0)]);
  const stageId = (await index()).get(video(0)), subjectId = 'reader';
  const accounts = createAccountRepo(pool);
  await accounts.upsertEmail({ productId, subjectId, email: subjectId + '@' + 'example.invalid' });
  const signedUp = await accounts.createdAtFor({ productId, subjectId });
  let at = signedUp.getTime() + 7 * 86400000 - 1;
  const service = createCommunityService({ productId, stageVoteRepo: repo, signupAtFor: accounts.createdAtFor, now: () => at });
  const handle = createCommunityHandler({ productId, service, authenticate: async () => ({ productId, subjectId }) });
  const put = () => handle({ method: 'PUT', path: '/api/community/stages/' + stageId + '/vote', headers: {} });
  const counts = async () => (await pool.query(`SELECT
    (SELECT count(*)::int FROM lovetree_stage_saves WHERE product_id=$1) AS saved,
    (SELECT count(*)::int FROM lovetree_community_votes WHERE product_id=$1) AS votes`, [productId])).rows[0];
  const denied = await put();
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, 'vote_too_new');
  assert.deepEqual(await counts(), { saved: 0, votes: 0 });
  at++;
  await addVotes('stage', stageId, ['prior-a', 'prior-b'], new Date(at));
  const accepted = await put();
  assert.equal(accepted.status, 200);
  assert.deepEqual(accepted.body, { saved: true, voted: true, weeklyVoters: 3 });
  assert.deepEqual(await counts(), { saved: 1, votes: 3 });
  const { rows } = await pool.query('SELECT voted_at FROM lovetree_community_votes WHERE product_id=$1 AND subject_id=$2', [productId, subjectId]);
  assert.equal(rows[0].voted_at.getTime(), at);
});

test('무대 담기 커밋이 실패하면 담기 상태와 최초 표가 함께 롤백된다', { skip }, async (t) => {
  const { pool, productId, addTree, index } = await voteFixture(t);
  await addTree('rollback', [clip(0)]);
  const stageId = (await index()).get(video(0));
  // 같은 PostgreSQL 세션에서 커밋 직전에 오류를 발생시킨다. 다른 시험의 표·트리거에는 손대지 않는다.
  const failingPool = {
    query: pool.query.bind(pool),
    async connect() {
      const client = await pool.connect();
      return { release: () => client.release(), async query(sql, params) {
        if (sql === 'COMMIT') await client.query('SELECT 1 / 0');
        return client.query(sql, params);
      } };
    }
  };
  const voting = createStageVoteRepo(failingPool);
  await assert.rejects(voting.setVote({ productId, stageId, subjectId: 'reader', enabled: true, ...week }), { code: '22012' });
  for (const table of ['lovetree_stage_saves', 'lovetree_community_votes']) {
    assert.equal((await pool.query(`SELECT 1 FROM ${table} WHERE product_id=$1`, [productId])).rowCount, 0);
  }
});

test('같은 사람의 투표 잠금 대기 중 공개 근거가 회수되면 쓰지 않는다', { skip }, async (t) => {
  const { pool, productId, addTree, index, repo } = await voteFixture(t);
  const source = await addTree('withdrawn', [clip(0)]);
  const stageId = (await index()).get(video(0)), subjectId = 'reader';
  const blocker = await pool.connect();
  let pending, error;
  try {
    await blocker.query('BEGIN');
    await blocker.query("SELECT pg_advisory_xact_lock(hashtext('lovetree-stage-vote'),hashtext($1))",
      [JSON.stringify([productId, subjectId, stageId])]);
    const { pid } = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0];
    pending = repo.setVote({ productId, stageId, subjectId, enabled: true, ...week }).catch(e => { error = e; });
    const deadline = Date.now() + 5000;
    for (;;) {
      if (error) throw error;
      const { rows } = await pool.query(`SELECT EXISTS(SELECT 1 FROM pg_locks l WHERE NOT l.granted
        AND l.locktype='advisory' AND $1::int=ANY(pg_blocking_pids(l.pid))) AS waiting`, [pid]);
      if (rows[0].waiting) break;
      assert.ok(Date.now() < deadline, '투표 요청이 같은 주체·무대의 잠금을 기다려야 한다');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await createTreeDiscoverRepo(pool).set({ ...source, discover: false });
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
    await pending;
  }
  if (error) throw error;
  assert.equal(await pending, null);
  await repo.setVote({ productId, stageId, subjectId, enabled: false, ...week });
  for (const table of ['lovetree_stage_saves', 'lovetree_community_votes']) {
    assert.equal((await pool.query(`SELECT 1 FROM ${table} WHERE product_id=$1`, [productId])).rowCount, 0);
  }
});

test('이번 주 인기 무대는 월요일 KST 경계·3표 문턱·동률과 10개 상한을 지킨다', { skip }, async (t) => {
  const { productId, addTree, index, addVotes, repo } = await voteFixture(t);
  await addTree('rank', [clip(0), ...Array.from({ length: 12 }, (_, i) => clip(i))]);
  const ids = await index(), first = ids.get(video(0)), small = ids.get(video(11));
  await addVotes('stage', first, ['before'], '2026-11-15T14:59:59.999Z');
  await addVotes('stage', first, ['start', 'monday', 'tuesday']);
  await addVotes('stage', first, ['end'], '2026-11-22T14:59:59.999Z');
  await addVotes('stage', first, ['next-week'], week.until);
  await addVotes('tree', first, ['tree-voter']);
  const ties = Array.from({ length: 10 }, (_, i) => ids.get(video(i + 1))).sort();
  for (const id of ties) await addVotes('stage', id, ['reader-a', 'reader-b', 'reader-c']);
  await addVotes('stage', small, ['reader-a', 'reader-b']);
  const items = await repo.popular({ productId, ...week });
  assert.deepEqual(items.map(x => [x.stageId, x.weeklyVoters]), [[first, 4], ...ties.slice(0, 9).map(id => [id, 3])]);
  const hidden = await repo.detail({ productId, stageId: small, ...week });
  assert.equal(hidden.weeklyVoters, null);
  assert.equal(hidden.publicTreeCount, null);
});

test('무대 상세는 볼 수 있는 대표만 보여 주고 현재 트리의 모든 별칭을 목록에서 뺀다', { skip }, async (t) => {
  const { pool, productId, addTree, index, repo } = await voteFixture(t);
  const sources = [];
  for (let i = 0; i < 14; i++) sources.push(await addTree(String(i).padStart(2, '0'), [
    clip(0, { startSeconds: 10 + (i ? 4 : 0), endSeconds: 22 + (i ? 4 : 0) })
  ]));
  const [first, second, third] = sources;
  const alias = 'share-alias'.padEnd(24, 'x');
  const shares = createShareRepo(pool);
  await shares.create({ ...first, shareId: alias, entryMomentId: first.momentId, view: 'book', momentCount: 3 });
  const stageId = (await index()).get(video(0));
  const options = { productId, stageId, ...week };
  assert.deepEqual(await repo.resolveMoment({ productId, shareId: alias, momentId: first.momentId }), { stageId });
  const detail = await repo.detail({ ...options, currentShareId: alias });
  assert.equal(detail.publicTreeCount, 14);
  assert.deepEqual(detail.displayRange, { startSeconds: 10, endSeconds: 22 });
  assert.deepEqual(detail.trees.map(x => x.shareId), sources.slice(1, 13).map(x => x.shareId));
  assert.equal(detail.nextCursor, detail.trees[11].shareId);
  const page2 = await repo.detail({ ...options, currentShareId: alias, afterShareId: detail.nextCursor });
  assert.deepEqual(page2.trees.map(x => x.shareId), [sources[13].shareId]);
  assert.equal(page2.nextCursor, null);
  assert.doesNotMatch(JSON.stringify(detail), /private-owner-|unpublished-note|subject_id|voted_at/);
  await shares.revoke({ ...first, shareId: alias });
  assert.equal(await repo.resolveMoment({ productId, shareId: alias, momentId: first.momentId }), null);
  await pool.query(`INSERT INTO lovetree_community_hidden_shares(product_id,share_id,hidden_by)
    VALUES($1,$2,'moderator')`, [productId, alias]);
  const community = createCommunityRepo(pool);
  await community.blockOwner({ productId, blockerSubjectId: second.subjectId, blockedSubjectId: 'viewer' });
  await community.blockOwner({ productId, blockerSubjectId: 'viewer', blockedSubjectId: third.subjectId });
  const visible = await repo.detail({ ...options, viewerSubjectId: 'viewer' });
  assert.equal(visible.publicTreeCount, 11);
  assert.deepEqual(visible.displayRange, { startSeconds: 14, endSeconds: 26 });
  assert.doesNotMatch(JSON.stringify(visible), /장면 00|책 00/);
  assert.equal(await repo.resolveMoment({ ...first, viewerSubjectId: 'viewer' }), null);
  assert.equal(await repo.resolveMoment({ ...third, viewerSubjectId: 'viewer' }), null);
  await pool.query('DELETE FROM lovetree_tree_discover WHERE product_id=$1', [productId]);
  assert.equal(await repo.detail(options), null);
  assert.deepEqual(await repo.popular({ productId, ...week }), []);
});

test('명예회원 제외 설정은 순위의 공개자와 투표자를 구분하고 개인의 담기 상태를 보존한다', { skip }, async (t) => {
  const { pool, productId, addTree, index, addVotes } = await voteFixture(t);
  const regular = await addTree('regular', [clip(0), clip(2)]);
  const honor = await addTree('honor', [clip(1), clip(2)]);
  await pool.query(`INSERT INTO lovetree_product_roles(product_id,subject_id,role)
    VALUES ($1,$2,'ai_customer'), ($1,'honor-voter','ai_customer')`, [productId, honor.subjectId]);
  const ids = await index(), regularStage = ids.get(video(0)), honorStage = ids.get(video(1)), mixedStage = ids.get(video(2));
  for (const [target, voters] of [[regularStage, ['a', 'b', 'honor-voter']], [honorStage, ['a', 'b', 'c']],
    [mixedStage, ['a', 'b', 'c', 'honor-voter']]]) await addVotes('stage', target, voters);
  await pool.query('INSERT INTO lovetree_stage_saves(product_id,stage_id,subject_id) VALUES($1,$2,$3)',
    [productId, regularStage, 'honor-voter']);
  await addVotes('tree', regular.shareId, ['a', 'b', 'honor-voter']);
  await addVotes('tree', honor.shareId, ['a', 'b', 'c']);
  for (const [env, expected] of [[{}, false], [{ LOVETREE_HAS_REAL_CUSTOMERS: '1' }, true]]) {
    const hasRealCustomers = hasRealCustomersFromEnv(env);
    assert.equal(hasRealCustomers, expected);
    const stages = createStageVoteRepo(pool, { hasRealCustomers });
    const items = await stages.popular({ productId, ...week });
    const counts = Object.fromEntries(items.map(x => [x.stageId, x.weeklyVoters]));
    assert.deepEqual(counts, hasRealCustomers ? { [mixedStage]: 3 } : { [regularStage]: 3, [honorStage]: 3, [mixedStage]: 4 });
    const detail = await stages.detail({ productId, stageId: regularStage, viewerSubjectId: 'honor-voter', ...week });
    assert.deepEqual([detail.saved, detail.voted, detail.weeklyVoters], [true, true, hasRealCustomers ? null : 3]);
    const publicHonor = await stages.detail({ productId, stageId: honorStage, ...week });
    assert.equal(publicHonor.trees[0].aiTester, true);
    const trees = createCommunityRepo(pool, { hasRealCustomers });
    const cards = await trees.listDiscoverableSummaries({ productId, sort: 'popular', weekSince: week.since });
    const treeCounts = Object.fromEntries(cards.map(row => [row.share.shareId, row.stats.weeklyFavorites]));
    assert.deepEqual(treeCounts, hasRealCustomers ? { [regular.shareId]: 2 } : { [regular.shareId]: 3, [honor.shareId]: 3 });
    const weekly = await trees.weeklyVoteCounts({ productId, targetKind: 'tree', since: week.since });
    assert.equal(weekly[regular.shareId], hasRealCustomers ? 2 : 3);
  }
});

// B-08(#1064): 트리 id는 화면이 정하므로 계정끼리 겹칠 수 있다(복원 기록). 둘러보기 질의는
// (계정, 트리)로 묶어 한 행을 고르고 숨김도 (계정, 트리) 범위로만 판정한다.
test('같은 tree_id를 가진 두 계정은 둘 다 소개되고 한쪽 숨김이 다른 쪽에 번지지 않는다', { skip }, async () => {
  assertIsolatedTestDatabase(DATABASE_URL);
  const pool = await createPool(DATABASE_URL, { max: 4 });
  try {
    await applySchema(pool);
    const productId = 'lt-' + suffix();
    const treeId = 'same-tree-' + suffix();
    const shares = createShareRepo(pool);
    const discover = createTreeDiscoverRepo(pool);
    const shareIds = {};
    for (const subjectId of ['owner-a', 'owner-b']) {
      const shareId = ('share-' + subjectId + '-' + suffix()).slice(0, 40);
      await pool.query('INSERT INTO lovetree_workspaces(product_id,subject_id,doc) VALUES($1,$2,$3)',
        [productId, subjectId, { version: 1, trees: [{ id: treeId, moments: [{ id: 'm0' }, { id: 'm1' }, { id: 'm2' }] }] }]);
      await shares.create({ productId, subjectId, shareId, treeId, entryMomentId: 'm0', view: 'book', momentCount: 3 });
      await discover.set({ productId, subjectId, treeId, discover: true });
      shareIds[subjectId] = shareId;
    }
    const repo = createCommunityRepo(pool);
    // summaries는 {share:{…}} 모양, listDiscoverable은 행 자체(shareRow)를 돌려준다 — 도우미를 나눠 쓴다.
    const subjectsOf = rows => rows.map(row => row.share.subjectId).sort();
    const subjectIdsOf = rows => rows.map(row => row.subjectId).sort();
    // 두 계정 모두 목록에 나온다 — tree_id 겹침으로 한쪽이 가려지지 않는다.
    assert.deepEqual(subjectsOf(await repo.listDiscoverableSummaries({ productId, limit: 10 })), ['owner-a', 'owner-b']);
    assert.deepEqual(subjectIdsOf(await repo.listDiscoverable({ productId, limit: 10 })), ['owner-a', 'owner-b']);
    assert.deepEqual(await repo.discoverTotals({ productId }), { trees: 2, moments: 6 });
    // #1273 5번: 같은 자료에서 목록 수와 집계 수가 같은 기준으로 나온다.
    assert.equal((await repo.discoverTotals({ productId })).trees, (await repo.listDiscoverableSummaries({ productId, limit: 10 })).length);
    // 한쪽 숨김 — 그 계정만 목록에서 내려가고 같은 tree_id의 다른 계정에 번지지 않는다.
    await pool.query('INSERT INTO lovetree_community_hidden_shares(product_id,share_id,hidden_by) VALUES($1,$2,$3)',
      [productId, shareIds['owner-a'], 'moderator']);
    assert.deepEqual(subjectsOf(await repo.listDiscoverableSummaries({ productId, limit: 10 })), ['owner-b']);
    assert.deepEqual(subjectIdsOf(await repo.listDiscoverable({ productId, limit: 10 })), ['owner-b']);
    assert.deepEqual(await repo.discoverTotals({ productId }), { trees: 1, moments: 3 });
    // 숨김 제거 — 두 계정이 다시 나온다.
    await pool.query('DELETE FROM lovetree_community_hidden_shares WHERE product_id=$1', [productId]);
    assert.deepEqual(subjectsOf(await repo.listDiscoverableSummaries({ productId, limit: 10 })), ['owner-a', 'owner-b']);
  } finally {
    await pool.end();
  }
});

test('#1544 Postgres에서도 숨긴 공유 직접 읽기는 없는 공유와 같은 404다', { skip }, async () => {
  assertIsolatedTestDatabase(DATABASE_URL);
  const pool = await createPool(DATABASE_URL, { max: 4 });
  const productId = 'lt-' + suffix();
  try {
    await applySchema(pool);
    const { shareId, tree } = await publishStageTestTree(pool, productId, 'owner', [{ url: stageTestUrl }]);
    const repo = createCommunityRepo(pool);
    const service = createShareService({
      shareRepo: createShareRepo(pool),
      workspaceRepo: createWorkspaceRepo(pool),
      communityRepo: repo,
      productId
    });
    const handle = createShareHandler({
      authenticate: async () => ({ productId, subjectId: 'owner' }),
      service,
      productId
    });
    const read = (id) => handle({ method: 'GET', path: '/api/public/shares/' + id, headers: {}, body: '' });
    const missing = await read('m'.repeat(24));
    assert.equal(missing.status, 404);
    assert.equal((await read(shareId)).status, 200);
    assert.equal(await repo.isHiddenShare({ productId, shareId, subjectId: 'owner', treeId: tree.id }), false);
    await pool.query('INSERT INTO lovetree_community_hidden_shares(product_id,share_id,hidden_by) VALUES($1,$2,$3)', [productId, shareId, 'moderator']);
    assert.equal(await repo.isHiddenShare({ productId, shareId, subjectId: 'owner', treeId: tree.id }), true);
    const hidden = await read(shareId);
    assert.equal(hidden.status, 404);
    assert.deepEqual(hidden.body, missing.body, '응답 본문이 없는 공유와 같다');
    assert.deepEqual(hidden.headers, missing.headers, '응답 머리말이 없는 공유와 같다');
    await pool.query('DELETE FROM lovetree_community_hidden_shares WHERE product_id=$1 AND share_id=$2', [productId, shareId]);
    assert.equal((await read(shareId)).status, 200, '숨김을 풀면 200');
  } finally {
    await pool.query('DELETE FROM lovetree_community_hidden_shares WHERE product_id=$1', [productId]);
    await pool.end();
  }
});
