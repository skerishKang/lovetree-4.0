const iso=value=>value instanceof Date?value.toISOString():value?String(value):null;
const shareRow=value=>value&&({shareId:value.share_id,subjectId:value.subject_id,treeId:value.tree_id,entryMomentId:value.entry_moment_id,view:value.initial_view,status:value.status,createdAt:iso(value.created_at)});
const commentRow=value=>value&&({id:value.comment_id,shareId:value.share_id,subjectId:value.subject_id,body:value.body,status:value.status,createdAt:iso(value.created_at),updatedAt:iso(value.updated_at),editedAt:value.edited_at?iso(value.edited_at):null});
const reportRow=value=>value&&({id:value.report_id,shareId:value.share_id,reporterSubjectId:value.reporter_subject_id,reason:value.reason,status:value.status,createdAt:iso(value.created_at),resolvedAt:iso(value.resolved_at),hidden:value.is_hidden===true||value.hidden===true});

export function createCommunityRepo(pool){
 return {
  async listDiscoverableSummaries({productId,viewerSubjectId=null,limit=240}){
   const {rows}=await pool.query(
    `SELECT s.*,
      (SELECT count(*)::int FROM lovetree_community_favorites WHERE product_id=s.product_id AND share_id=s.share_id) AS fav_count,
      (SELECT count(*)::int FROM lovetree_community_comments WHERE product_id=s.product_id AND share_id=s.share_id AND status='visible') AS comment_count,
      (SELECT max(created_at) FROM lovetree_community_comments WHERE product_id=s.product_id AND share_id=s.share_id AND status='visible') AS last_activity_at,
      (SELECT count(*)::int FROM lovetree_community_reactions WHERE product_id=s.product_id AND share_id=s.share_id AND kind='heart') AS heart_count,
      (SELECT count(*)::int FROM lovetree_community_reactions WHERE product_id=s.product_id AND share_id=s.share_id) AS reacts_count,
      EXISTS(SELECT 1 FROM lovetree_community_favorites WHERE product_id=s.product_id AND share_id=s.share_id AND subject_id=$2) AS favored,
      EXISTS(SELECT 1 FROM lovetree_community_reactions WHERE product_id=s.product_id AND share_id=s.share_id AND subject_id=$2 AND kind='heart') AS hearted,
      (SELECT COALESCE(jsonb_object_agg(k,kind_count),'{}'::jsonb) FROM (
        SELECT 'heart' AS k, count(*)::int AS kind_count FROM lovetree_community_reactions
        WHERE product_id=s.product_id AND share_id=s.share_id GROUP BY kind
      ) t) AS reactions_json,
      (SELECT COALESCE(array_agg(kind ORDER BY kind),'{}') FROM lovetree_community_reactions
        WHERE product_id=s.product_id AND share_id=s.share_id AND subject_id=$2) AS mine_kinds
     FROM lovetree_shares s
     WHERE s.product_id=$1 AND s.status='active' AND s.discoverable=true
       AND NOT EXISTS (
         SELECT 1 FROM lovetree_community_hidden_shares h
         WHERE h.product_id=s.product_id AND h.share_id=s.share_id
       )
       AND ($2::text IS NULL OR NOT EXISTS (
         SELECT 1 FROM lovetree_community_blocks b
         WHERE b.product_id=s.product_id AND b.blocker_subject_id=$2 AND b.blocked_subject_id=s.subject_id
       ))
     ORDER BY COALESCE((SELECT max(created_at) FROM lovetree_community_comments WHERE product_id=s.product_id AND share_id=s.share_id AND status='visible'), s.created_at) DESC,
              s.created_at DESC, s.share_id DESC LIMIT $3`,
    [productId,viewerSubjectId,limit]
   );
   return rows.map(row=>{
    const share=shareRow(row);
    const reactions={heart:0,like:0,love:0,laugh:0,wow:0,sad:0,angry:0};
    if(row.reactions_json&&typeof row.reactions_json==='object')for(const [kind,n] of Object.entries(row.reactions_json))if(Object.prototype.hasOwnProperty.call(reactions,kind))reactions[kind]=Number(n)||0;
    const stats={favorites:Number(row.fav_count||0),hearts:Number(row.heart_count||0),comments:Number(row.comment_count||0),favored:!!row.favored,hearted:!!row.hearted,reactions,mine:Array.isArray(row.mine_kinds)?row.mine_kinds.filter(Boolean):[]};
    return {share,stats,lastActivityAt:row.last_activity_at?iso(row.last_activity_at):share.createdAt};
   });
  },
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
   const counts=await pool.query(
    `SELECT kind,count(*)::int AS n FROM lovetree_community_reactions WHERE product_id=$1 AND share_id=$2 GROUP BY kind`,
    [productId,shareId]
   );
   const reactions={heart:0,like:0,love:0,laugh:0,wow:0,sad:0,angry:0};
   for(const r of counts.rows)reactions[r.kind]=Number(r.n);
   let mine=[];
   if(viewerSubjectId){
    const mineRows=await pool.query(
     `SELECT kind FROM lovetree_community_reactions WHERE product_id=$1 AND share_id=$2 AND subject_id=$3 ORDER BY kind`,
     [productId,shareId,viewerSubjectId]
    );
    mine=mineRows.rows.map(r=>r.kind);
   }
   return {favorites:Number(row.favorites||0),hearts:Number(row.hearts||0),comments:Number(row.comments||0),favored:!!row.favored,hearted:!!row.hearted,reactions,mine};
  },
  async setFavorite({productId,shareId,subjectId,enabled}){
   if(enabled) await pool.query(`INSERT INTO lovetree_community_favorites(product_id,share_id,subject_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[productId,shareId,subjectId]);
   else await pool.query(`DELETE FROM lovetree_community_favorites WHERE product_id=$1 AND share_id=$2 AND subject_id=$3`,[productId,shareId,subjectId]);
  },
  async listFavorites({productId,subjectId}){
   const {rows}=await pool.query(`SELECT share_id FROM lovetree_community_favorites WHERE product_id=$1 AND subject_id=$2 ORDER BY created_at DESC LIMIT 200`,[productId,subjectId]);
   return rows.map(row=>row.share_id);
  },
  async setReaction({productId,shareId,subjectId,enabled,kind='heart'}){
   if(enabled) await pool.query(`INSERT INTO lovetree_community_reactions(product_id,share_id,subject_id,kind) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[productId,shareId,subjectId,kind]);
   else await pool.query(`DELETE FROM lovetree_community_reactions WHERE product_id=$1 AND share_id=$2 AND subject_id=$3 AND kind=$4`,[productId,shareId,subjectId,kind]);
  },
  async isBlocked({productId,blockerSubjectId,blockedSubjectId}){
   const {rows}=await pool.query(
    `SELECT EXISTS(
      SELECT 1 FROM lovetree_community_blocks
      WHERE product_id=$1 AND (
        (blocker_subject_id=$2 AND blocked_subject_id=$3) OR
        (blocker_subject_id=$3 AND blocked_subject_id=$2)
      )
    ) AS blocked`,
    [productId,blockerSubjectId,blockedSubjectId]
   );
   return !!(rows[0]?.blocked);
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
  async getComment({productId,commentId}){
   const {rows}=await pool.query(`SELECT * FROM lovetree_community_comments WHERE product_id=$1 AND comment_id=$2`,[productId,commentId]);
   return commentRow(rows[0]);
  },
  async updateComment({productId,commentId,subjectId,body}){
   const {rows}=await pool.query(`UPDATE lovetree_community_comments SET body=$4,updated_at=now(),edited_at=now() WHERE product_id=$1 AND comment_id=$2 AND status='visible' AND subject_id=$3 RETURNING *`,[productId,commentId,subjectId,body]);
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
