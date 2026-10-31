const iso=value=>value instanceof Date?value.toISOString():value?String(value):null;
const shareRow=value=>value&&({shareId:value.share_id,subjectId:value.subject_id,treeId:value.tree_id,entryMomentId:value.entry_moment_id,view:value.initial_view,status:value.status,createdAt:iso(value.created_at)});
const commentRow=value=>value&&({id:value.comment_id,shareId:value.share_id,subjectId:value.subject_id,body:value.body,status:value.status,createdAt:iso(value.created_at),updatedAt:iso(value.updated_at)});
const reportRow=value=>value&&({id:value.report_id,shareId:value.share_id,reporterSubjectId:value.reporter_subject_id,reason:value.reason,status:value.status,createdAt:iso(value.created_at),resolvedAt:iso(value.resolved_at),hidden:value.is_hidden===true||value.hidden===true});

export function createCommunityRepo(pool){
 return {
  async listDiscoverable({productId,viewerSubjectId=null,limit=240}){
   const {rows}=await pool.query(
    `SELECT s.* FROM lovetree_shares s
     WHERE s.product_id=$1 AND s.status='active' AND s.discoverable=true
       AND NOT EXISTS (
         SELECT 1 FROM lovetree_community_hidden_shares h
         WHERE h.product_id=s.product_id AND h.share_id=s.share_id
       )
       AND ($2::text IS NULL OR NOT EXISTS (
         SELECT 1 FROM lovetree_community_blocks b
         WHERE b.product_id=s.product_id AND b.blocker_subject_id=$2 AND b.blocked_subject_id=s.subject_id
       ))
     ORDER BY s.created_at DESC,s.share_id DESC LIMIT $3`,
    [productId,viewerSubjectId,limit]
   );
   return rows.map(shareRow);
  },
  async stats({productId,shareId,viewerSubjectId=null}){
   const {rows}=await pool.query(
    `SELECT
      (SELECT count(*)::int FROM lovetree_community_favorites WHERE product_id=$1 AND share_id=$2) AS favorites,
      (SELECT count(*)::int FROM lovetree_community_reactions WHERE product_id=$1 AND share_id=$2 AND kind='heart') AS hearts,
      (SELECT count(*)::int FROM lovetree_community_comments WHERE product_id=$1 AND share_id=$2 AND status='visible') AS comments,
      EXISTS(SELECT 1 FROM lovetree_community_favorites WHERE product_id=$1 AND share_id=$2 AND subject_id=$3) AS favored,
      EXISTS(SELECT 1 FROM lovetree_community_reactions WHERE product_id=$1 AND share_id=$2 AND subject_id=$3 AND kind='heart') AS hearted`,
    [productId,shareId,viewerSubjectId]
   );
   const row=rows[0]||{};
   return {favorites:Number(row.favorites||0),hearts:Number(row.hearts||0),comments:Number(row.comments||0),favored:!!row.favored,hearted:!!row.hearted};
  },
  async setFavorite({productId,shareId,subjectId,enabled}){
   if(enabled) await pool.query(`INSERT INTO lovetree_community_favorites(product_id,share_id,subject_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[productId,shareId,subjectId]);
   else await pool.query(`DELETE FROM lovetree_community_favorites WHERE product_id=$1 AND share_id=$2 AND subject_id=$3`,[productId,shareId,subjectId]);
  },
  async listFavorites({productId,subjectId}){
   const {rows}=await pool.query(`SELECT share_id FROM lovetree_community_favorites WHERE product_id=$1 AND subject_id=$2 ORDER BY created_at DESC LIMIT 200`,[productId,subjectId]);
   return rows.map(row=>row.share_id);
  },
  async setReaction({productId,shareId,subjectId,enabled}){
   if(enabled) await pool.query(`INSERT INTO lovetree_community_reactions(product_id,share_id,subject_id,kind) VALUES($1,$2,$3,'heart') ON CONFLICT DO NOTHING`,[productId,shareId,subjectId]);
   else await pool.query(`DELETE FROM lovetree_community_reactions WHERE product_id=$1 AND share_id=$2 AND subject_id=$3 AND kind='heart'`,[productId,shareId,subjectId]);
  },
  async listComments({productId,shareId,limit=50}){
   const {rows}=await pool.query(`SELECT * FROM lovetree_community_comments WHERE product_id=$1 AND share_id=$2 AND status='visible' ORDER BY created_at DESC LIMIT $3`,[productId,shareId,limit]);
   return rows.map(commentRow);
  },
  async createComment(input){
   const {rows}=await pool.query(
    `INSERT INTO lovetree_community_comments(product_id,comment_id,share_id,subject_id,body,client_key)
     VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT(product_id,subject_id,client_key) DO UPDATE SET client_key=EXCLUDED.client_key
     RETURNING *`,
    [input.productId,input.commentId,input.shareId,input.subjectId,input.body,input.clientKey]
   );
   return commentRow(rows[0]);
  },
  async deleteComment({productId,commentId,subjectId,admin=false}){
   if(!admin){
    const {rows}=await pool.query(`UPDATE lovetree_community_comments SET status='deleted',updated_at=now() WHERE product_id=$1 AND comment_id=$2 AND status='visible' AND subject_id=$3 RETURNING *`,[productId,commentId,subjectId]);
    return commentRow(rows[0]);
   }
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    const {rows}=await client.query(`UPDATE lovetree_community_comments SET status='hidden',updated_at=now() WHERE product_id=$1 AND comment_id=$2 AND status='visible' RETURNING *`,[productId,commentId]);
    if(!rows[0]){await client.query('ROLLBACK');return null;}
    await client.query(`INSERT INTO lovetree_community_moderation_audit(product_id,target_type,target_id,action,actor_subject_id) VALUES($1,'comment',$2,'hide_comment',$3)`,[productId,commentId,subjectId]);
    await client.query('COMMIT');return commentRow(rows[0]);
   }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  },
  async createReport(input){
   const {rows}=await pool.query(
    `INSERT INTO lovetree_community_reports(product_id,report_id,share_id,reporter_subject_id,reason,client_key)
     VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT(product_id,reporter_subject_id,client_key) DO UPDATE SET client_key=EXCLUDED.client_key
     RETURNING *`,
    [input.productId,input.reportId,input.shareId,input.subjectId,input.reason,input.clientKey]
   );
   return reportRow(rows[0]);
  },
  async blockOwner({productId,blockerSubjectId,blockedSubjectId}){
   await pool.query(`INSERT INTO lovetree_community_blocks(product_id,blocker_subject_id,blocked_subject_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[productId,blockerSubjectId,blockedSubjectId]);
  },
  async listReports({productId,limit=100}){
   const {rows}=await pool.query(`SELECT r.*,EXISTS(SELECT 1 FROM lovetree_community_hidden_shares h WHERE h.product_id=r.product_id AND h.share_id=r.share_id) AS is_hidden FROM lovetree_community_reports r WHERE r.product_id=$1 ORDER BY r.created_at DESC LIMIT $2`,[productId,limit]);
   return rows.map(reportRow);
  },
  async moderateReport({productId,reportId,status,visibility,actorSubjectId}){
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    const {rows}=await client.query(`UPDATE lovetree_community_reports SET status=$3,resolved_at=now(),resolved_by=$4 WHERE product_id=$1 AND report_id=$2 RETURNING *`,[productId,reportId,status,actorSubjectId]);
    if(!rows[0]){await client.query('ROLLBACK');return null;}
    await client.query(`INSERT INTO lovetree_community_moderation_audit(product_id,report_id,target_type,target_id,action,actor_subject_id) VALUES($1,$2,'report',$2,$3,$4)`,[productId,reportId,status,actorSubjectId]);
    let hidden;
    if(visibility==='hidden'){
     const changed=await client.query(`INSERT INTO lovetree_community_hidden_shares(product_id,share_id,report_id,hidden_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[productId,rows[0].share_id,reportId,actorSubjectId]);
     hidden=true;if(changed.rowCount)await client.query(`INSERT INTO lovetree_community_moderation_audit(product_id,report_id,target_type,target_id,action,actor_subject_id) VALUES($1,$2,'share',$4,'hide_share',$3)`,[productId,reportId,actorSubjectId,rows[0].share_id]);
    }else{
     const changed=await client.query(`DELETE FROM lovetree_community_hidden_shares WHERE product_id=$1 AND share_id=$2`,[productId,rows[0].share_id]);
     hidden=false;if(changed.rowCount)await client.query(`INSERT INTO lovetree_community_moderation_audit(product_id,report_id,target_type,target_id,action,actor_subject_id) VALUES($1,$2,'share',$4,'restore_share',$3)`,[productId,reportId,actorSubjectId,rows[0].share_id]);
    }
    await client.query('COMMIT');
    return reportRow({...rows[0],is_hidden:hidden});
   }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  }
 };
}
