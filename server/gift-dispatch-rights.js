// The existing unit and redemption tables remain the source of live ownership.
export const dispatchRights=where=>`WITH selected AS MATERIALIZED (
 SELECT i.id,i.user_id,i.dispatch_id FROM gift_dispatch_items i WHERE i.state='granted' AND (${where})
), rights AS (
 SELECT i.dispatch_id,i.id item_id,i.user_id,g.id inventory_id,'gift' type,g.expires_at,NULL season_ends_at,NULL active_until,
  CASE WHEN g.used_at>0 THEN 'used' WHEN g.recalled_at IS NOT NULL THEN 'recalled'
   WHEN g.expires_at<=unixepoch() THEN 'expired' WHEN u.provider='deleted' THEN 'unavailable' ELSE 'ready' END state
 FROM selected i JOIN gift_inventory g ON g.dispatch_item=i.id AND g.user_id=i.user_id JOIN users u ON u.id=g.user_id
 UNION ALL
 SELECT i.dispatch_id,i.id,i.user_id,p.id,'decoration',p.redeem_before,p.season_ends_at,r.expires_at,
  CASE WHEN r.inventory_id IS NOT NULL THEN 'used' WHEN p.revoked<>0 THEN 'recalled'
   WHEN p.redeem_before<=unixepoch() OR p.season_ends_at<=unixepoch() THEN 'expired'
   WHEN u.provider='deleted' THEN 'unavailable' ELSE 'ready' END
 FROM selected i JOIN player_inventory p ON p.dispatch_item=i.id AND p.user_id=i.user_id
 JOIN users u ON u.id=p.user_id LEFT JOIN decoration_redemptions r ON p.id=r.inventory_id
)`;
