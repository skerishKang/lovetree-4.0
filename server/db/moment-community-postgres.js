import { ROLE_AI_CUSTOMER, ROLE_TESTER } from '../admin-roles.js';

const iso=value=>value instanceof Date?value.toISOString():value?String(value):null;
const commentRow=value=>value&&({id:value.comment_id,shareId:value.share_id,subjectId:value.subject_id,body:value.body,status:value.status,targetKind:value.target_kind||'tree',momentId:value.moment_id||'',createdAt:iso(value.created_at),updatedAt:iso(value.updated_at),editedAt:value.edited_at?iso(value.edited_at):null});
const reportRow=value=>value&&({id:value.report_id,shareId:value.share_id,reporterSubjectId:value.reporter_subject_id,reason:value.reason,status:value.status,commentId:value.comment_id||null,createdAt:iso(value.created_at),resolvedAt:iso(value.resolved_at),hidden:value.is_hidden===true||value.hidden===true});

// #1098 2단계 — 순간 단위 ♡·댓글 저장소(덧붙이기).
// 기존 community 저장소를 그대로 받아 위에 얹는다: 기존 메서드(트리 단위)는 한 줄도 바꾸지 않고 그대로 두고,
// 순간 단위 메서드만 여기 둔다. 같은 표(반응·댓글·신고)의 대상 칸(target_kind·moment_id)을 쓰는 것이 규칙이다.
// · 순간 반응은 ♡(heart) 하나 — 종류 검사는 서비스 계층이 맡는다.
// · 공개 숫자는 시험 계정(tester)을 빼고, AI 명예회원(ai_customer) 몫은 aiHearts로 함께 센다.
export function createMomentCommunityRepo(base, pool, { hasRealCustomers = false } = {}){
 void hasRealCustomers; // 운영 플래그 자리 — 순간 숫자는 tester만 빼면 되므로 지금은 쓰지 않는다.
 const testerSql=alias=>`NOT EXISTS (
    SELECT 1 FROM lovetree_product_roles tr
    WHERE tr.product_id = ${alias}.product_id AND tr.subject_id = ${alias}.subject_id AND tr.role = '${ROLE_TESTER}'
  )`;
 return {
  ...base,
  async momentStats({productId,shareId,momentId,viewerSubjectId=null}){
   const {rows}=await pool.query(
    `SELECT
      (SELECT count(*)::int FROM lovetree_community_reactions x
        WHERE x.product_id=$1 AND x.share_id=$2 AND x.moment_id=$3 AND x.target_kind='moment' AND x.kind='heart'
          AND ${testerSql('x')}) AS hearts,
      (SELECT count(*)::int FROM lovetree_community_reactions x
        JOIN lovetree_product_roles ar ON ar.product_id=x.product_id AND ar.subject_id=x.subject_id AND ar.role='${ROLE_AI_CUSTOMER}'
        WHERE x.product_id=$1 AND x.share_id=$2 AND x.moment_id=$3 AND x.target_kind='moment' AND x.kind='heart'
          AND ${testerSql('x')}) AS ai_hearts,
      (SELECT count(*)::int FROM lovetree_community_comments c
        WHERE c.product_id=$1 AND c.share_id=$2 AND c.moment_id=$3 AND c.target_kind='moment' AND c.status='visible'
          AND ${testerSql('c')}) AS comments,
      EXISTS(SELECT 1 FROM lovetree_community_reactions x
        WHERE x.product_id=$1 AND x.share_id=$2 AND x.moment_id=$3 AND x.target_kind='moment' AND x.kind='heart'
          AND x.subject_id=$4) AS hearted`,
    [productId,shareId,momentId,viewerSubjectId]
   );
   const row=rows[0]||{};
   return {hearts:Number(row.hearts||0),aiHearts:Number(row.ai_hearts||0),comments:Number(row.comments||0),hearted:!!row.hearted};
  },
  async setMomentReaction({productId,shareId,momentId,subjectId,enabled,kind='heart'}){
   if(enabled) await pool.query(
    `INSERT INTO lovetree_community_reactions(product_id,share_id,subject_id,kind,target_kind,moment_id)
     VALUES($1,$2,$3,$4,'moment',$5)
     ON CONFLICT (product_id,share_id,subject_id,kind,moment_id) DO NOTHING`,
    [productId,shareId,subjectId,kind,momentId]
   );
   else await pool.query(
    `DELETE FROM lovetree_community_reactions
      WHERE product_id=$1 AND share_id=$2 AND subject_id=$3 AND kind=$4 AND target_kind='moment' AND moment_id=$5`,
    [productId,shareId,subjectId,kind,momentId]
   );
  },
  async listMomentComments({productId,shareId,momentId,limit=50}){
   const {rows}=await pool.query(
    `SELECT c.*, r.role AS author_role
       FROM lovetree_community_comments c
       LEFT JOIN lovetree_product_roles r ON r.product_id=c.product_id AND r.subject_id=c.subject_id
      WHERE c.product_id=$1 AND c.share_id=$2 AND c.moment_id=$3 AND c.target_kind='moment' AND c.status='visible'
        AND r.role IS DISTINCT FROM '${ROLE_TESTER}'
      ORDER BY c.created_at DESC LIMIT $4`,
    [productId,shareId,momentId,limit]
   );
   return rows.map(row=>({...commentRow(row),aiTester:row.author_role===ROLE_AI_CUSTOMER}));
  },
  async createMomentComment(input){
   const {rows}=await pool.query(
    `INSERT INTO lovetree_community_comments(product_id,comment_id,share_id,moment_id,subject_id,body,client_key,target_kind)
     VALUES($1,$2,$3,$4,$5,$6,$7,'moment')
     ON CONFLICT(product_id,subject_id,client_key,target_kind,moment_id) DO UPDATE SET client_key=EXCLUDED.client_key
     RETURNING *`,
    [input.productId,input.commentId,input.shareId,input.momentId,input.subjectId,input.body,input.clientKey]
   );
   return commentRow(rows[0]);
  },
  async getReport({productId,reportId}){
   const {rows}=await pool.query(`SELECT * FROM lovetree_community_reports WHERE product_id=$1 AND report_id=$2`,[productId,reportId]);
   return reportRow(rows[0]);
  },
  // 순간 댓글 신고의 운영센터 처리 — 같은 신고 표·감사 기록(moderation_audit) 길을 쓰되,
  // 숨기기는 트리(공유)가 아니라 그 댓글만 숨긴다. 댓글 복구는 트리 댓글과 같이 두지 않는다(숨기기만).
  async moderateMomentCommentReport({productId,reportId,status,visibility,actorSubjectId}){
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    const {rows}=await client.query(
     `UPDATE lovetree_community_reports SET status=$3,resolved_at=now(),resolved_by=$4
       WHERE product_id=$1 AND report_id=$2 AND comment_id IS NOT NULL RETURNING *`,
     [productId,reportId,status,actorSubjectId]
    );
    if(!rows[0]){await client.query('ROLLBACK');return null;}
    const report=rows[0];
    await client.query(
     `INSERT INTO lovetree_community_moderation_audit(product_id,report_id,target_type,target_id,action,actor_subject_id)
      VALUES($1,$2,'report',$2,$3,$4)`,
     [productId,reportId,status,actorSubjectId]
    );
    let hidden=false;
    if(visibility==='hidden'){
     const changed=await client.query(
      `UPDATE lovetree_community_comments SET status='hidden',updated_at=now()
        WHERE product_id=$1 AND comment_id=$2 AND status='visible' RETURNING comment_id`,
      [productId,report.comment_id]
     );
     hidden=true;
     if(changed.rowCount)await client.query(
      `INSERT INTO lovetree_community_moderation_audit(product_id,target_type,target_id,action,actor_subject_id)
       VALUES($1,'comment',$2,'hide_comment',$3)`,
      [productId,report.comment_id,actorSubjectId]
     );
    }else{
     const state=await client.query(`SELECT status FROM lovetree_community_comments WHERE product_id=$1 AND comment_id=$2`,[productId,report.comment_id]);
     hidden=state.rows[0]?.status==='hidden';
    }
    await client.query('COMMIT');
    return {id:report.report_id,status:report.status,hidden,resolvedAt:iso(report.resolved_at)};
   }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  }
 };
}
