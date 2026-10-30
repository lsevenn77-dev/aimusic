import { sqliteTable, text, integer, real, primaryKey, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const adminSessions=sqliteTable('admin_sessions',{tokenHash:text('token_hash').primaryKey(),credentialVersion:text('credential_version').notNull(),created:integer('created').notNull(),expires:integer('expires').notNull()},t=>[index('admin_sessions_expiry').on(t.expires)]);
export const playPurchases=sqliteTable('play_purchases',{tokenHash:text('token_hash').primaryKey(),purchaseToken:text('purchase_token').notNull(),userId:text('user_id').notNull().references(()=>users.id),productId:text('product_id').notNull(),kind:text('kind').notNull(),state:text('state').notNull(),expiry:integer('expiry').notNull().default(0),baselineUntil:integer('baseline_until').notNull().default(0),lastGranted:integer('last_granted').notNull().default(0),created:integer('created').notNull(),updated:integer('updated').notNull()},t=>[index('play_purchases_user').on(t.userId,t.kind)]);
export const pushDevices=sqliteTable('push_devices',{token:text('token').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),sessionToken:text('session_token').notNull(),updated:integer('updated').notNull()},t=>[index('push_devices_user').on(t.userId)]);
export const pushPreferences=sqliteTable('push_preferences',{userId:text('user_id').primaryKey().references(()=>users.id),dm:integer('dm').notNull().default(1),comment:integer('comment').notNull().default(1),gift:integer('gift').notNull().default(1)},t=>[check('push_dm_boolean',sql`${t.dm} IN (0,1)`),check('push_comment_boolean',sql`${t.comment} IN (0,1)`),check('push_gift_boolean',sql`${t.gift} IN (0,1)`)]);
export const pushOutbox=sqliteTable('push_outbox',{id:text('id').primaryKey(),recipient:text('recipient').notNull().references(()=>users.id),kind:text('kind').notNull(),target:text('target').notNull(),created:integer('created').notNull(),delivered:integer('delivered').notNull().default(0),leaseUntil:integer('lease_until').notNull().default(0),attempts:integer('attempts').notNull().default(0)},t=>[index('push_outbox_pending').on(t.delivered,t.leaseUntil,t.created)]);
export const activityNotifications=sqliteTable('activity_notifications',{
 id:text('id').primaryKey(),recipient:text('recipient').notNull().references(()=>users.id),actorId:text('actor_id').references(()=>users.id),kind:text('kind').notNull(),target:text('target').notNull(),sourceTitle:text('source_title').notNull().default(''),giftName:text('gift_name').notNull().default(''),quantity:integer('quantity').notNull().default(1),currency:text('currency').notNull().default(''),amount:integer('amount').notNull().default(0),created:integer('created').notNull(),readAt:integer('read_at').notNull().default(0)
},t=>[index('activity_recipient_order').on(t.recipient,t.created,t.id),index('activity_recipient_unread').on(t.recipient,t.readAt)]);
// Crews have one active membership per person. Chat/DM retries are idempotent.
export const users=sqliteTable('users',{
 accountType:text('account_type').notNull().default('human'),id:text('id').primaryKey(), email:text('email').notNull(), name:text('name').notNull(), password:text('password'), provider:text('provider').notNull().default('email'), subject:text('subject'), created:integer('created').notNull(), premiumUntil:integer('premium_until').notNull().default(0), applePremiumUntil:integer('apple_premium_until').notNull().default(0), playlistSelection:text('playlist_selection').notNull().default('[]')
},t=>[uniqueIndex('users_identity').on(t.provider,t.subject),uniqueIndex('users_email_provider').on(t.email,t.provider)]);
export const sessions=sqliteTable('sessions',{token:text('token').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),expires:integer('expires').notNull()});
// Public identity is independent of authentication UUIDs. No FK: retired numbers
// remain reserved after account deletion. Allocation/immutability live in SQL triggers.
export const publicMemberIds=sqliteTable('public_member_ids',{
 number:integer('number').primaryKey({autoIncrement:true}),userId:text('user_id').notNull()
},t=>[uniqueIndex('public_member_ids_user').on(t.userId),check('public_member_ids_positive',sql`${t.number}>0`)]);
export const personalRelations=sqliteTable('personal_relations',{
 id:text('id').primaryKey(),firstUser:text('first_user').notNull().references(()=>users.id),secondUser:text('second_user').notNull().references(()=>users.id),requestedBy:text('requested_by').notNull().references(()=>users.id),state:text('state').notNull().default('pending'),firstPublic:integer('first_public').notNull().default(0),secondPublic:integer('second_public').notNull().default(0),created:integer('created').notNull(),updated:integer('updated').notNull()
},t=>[uniqueIndex('personal_relations_pair').on(t.firstUser,t.secondUser),check('personal_relations_order',sql`${t.firstUser}<${t.secondUser}`),check('personal_relations_requester',sql`${t.requestedBy} IN (${t.firstUser},${t.secondUser})`),check('personal_relations_state',sql`${t.state} IN ('pending','accepted','declined','ended')`)]);
export const relationXp=sqliteTable('relation_xp',{
 relationId:text('relation_id').notNull().references(()=>personalRelations.id),sourceKey:text('source_key').notNull(),kind:text('kind').notNull(),amount:integer('amount').notNull(),created:integer('created').notNull()
},t=>[primaryKey({columns:[t.relationId,t.sourceKey]}),check('relation_xp_positive',sql`${t.amount}>0`)]);
export const giftInventory=sqliteTable('gift_inventory',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),giftType:text('gift_type').notNull(),giftName:text('gift_name').notNull(),currency:text('currency').notNull(),value:integer('value').notNull(),source:text('source').notNull(),requestId:text('request_id').notNull(),unit:integer('unit').notNull(),created:integer('created').notNull(),usedAt:integer('used_at').notNull().default(0),sendRequestId:text('send_request_id'),recipientId:text('recipient_id').references(()=>producers.id)
},t=>[uniqueIndex('gift_inventory_request_unit').on(t.userId,t.requestId,t.unit),uniqueIndex('gift_inventory_send_request').on(t.userId,t.sendRequestId),index('gift_inventory_owner').on(t.userId,t.usedAt),check('gift_inventory_currency',sql`${t.currency} IN ('gold','silver','reward')`),check('gift_inventory_value',sql`${t.value}>=0`)]);
export const giftInventoryLots=sqliteTable('gift_inventory_lots',{
 inventoryId:text('inventory_id').notNull().references(()=>giftInventory.id),purchaseId:text('purchase_id').notNull().references(()=>goldPurchases.id),gold:integer('gold').notNull(),netMw:integer('net_mw').notNull()
},t=>[primaryKey({columns:[t.inventoryId,t.purchaseId]}),check('gift_inventory_lot_positive',sql`${t.gold}>0 AND ${t.netMw}>=0`)]);
export const accountHandles=sqliteTable('account_handles',{userId:text('user_id').primaryKey().references(()=>users.id,{onDelete:'cascade'}),normalized:text('normalized').notNull()},t=>[uniqueIndex('account_handles_normalized').on(t.normalized)]);
export const oauth=sqliteTable('oauth_states',{state:text('state').primaryKey(),provider:text('provider').notNull(),verifier:text('verifier').notNull(),nonce:text('nonce').notNull(),expires:integer('expires').notNull()});
export const producers=sqliteTable('producers',{id:text('id').primaryKey(),nicknameConfirmed:integer('nickname_confirmed').notNull().default(0),userId:text('user_id').notNull().references(()=>users.id),name:text('name').notNull(),bio:text('bio').notNull().default(''),imageVersion:text('image_version').notNull().default(''),imageType:text('image_type').notNull().default(''),bannerVersion:text('banner_version').notNull().default(''),bannerType:text('banner_type').notNull().default(''),created:integer('created').notNull()},t=>[uniqueIndex('producers_owner').on(t.userId)]);
export const artists=sqliteTable('artists',{id:text('id').primaryKey(),producerId:text('producer_id').notNull().references(()=>producers.id),name:text('name').notNull(),bio:text('bio').notNull().default(''),imageVersion:text('image_version').notNull().default(''),imageType:text('image_type').notNull().default(''),genre:text('genre').notNull().default(''),created:integer('created').notNull()},t=>[index('artists_producer').on(t.producerId)]);
export const artistPhotos=sqliteTable('artist_photos',{id:text('id').primaryKey(),artistId:text('artist_id').notNull().references(()=>artists.id,{onDelete:'cascade'}),imageVersion:text('image_version').notNull(),imageType:text('image_type').notNull(),created:integer('created').notNull()},t=>[index('artist_photos_artist_created').on(t.artistId,t.created)]);
export const tracks=sqliteTable('tracks',{
 releaseDate:text('release_date').notNull().default(''),
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),artistId:text('artist_id').notNull().references(()=>artists.id),producerId:text('producer_id').notNull().references(()=>producers.id),title:text('title').notNull(),genre:text('genre').notNull(),genresJson:text('genres_json').notNull().default('[]'),moodsJson:text('moods_json').notNull().default('[]'),classificationSource:text('classification_source').notNull().default('legacy'),classificationUpdated:integer('classification_updated').notNull().default(0),classificationRevision:integer('classification_revision').notNull().default(0),tags:text('tags').notNull().default(''),description:text('description').notNull().default(''),lyrics:text('lyrics').notNull().default(''),lyricsMode:text('lyrics_mode').notNull().default('none'),aiTool:text('ai_tool').notNull(),isAi:integer('is_ai').notNull().default(1),participation:text('participation').notNull().default(''),rightsAccepted:integer('rights_accepted').notNull(),status:text('status').notNull().default('uploading'),originalKey:text('original_key').notNull().default(''),originalExt:text('original_ext').notNull(),originalBytes:integer('original_bytes').notNull(),duration:real('duration').notNull().default(0),hasCover:integer('has_cover').notNull().default(0),coverVersion:text('cover_version').notNull().default(''),coverType:text('cover_type').notNull().default(''),error:text('error'),created:integer('created').notNull(),leaseUntil:integer('lease_until').notNull().default(0),leaseToken:text('lease_token'),attempts:integer('attempts').notNull().default(0),karaokeTerms:text('karaoke_terms').notNull().default(''),karaokeAt:integer('karaoke_at').notNull().default(0),kind:text('kind').notNull().default('original'),originalId:text('original_id'),performanceMode:text('performance_mode').notNull().default('solo'),coverMode:text('cover_mode').notNull().default('solo'),duetParentId:text('duet_parent_id').references(()=>tracks.id),duetPart:text('duet_part').notNull().default(''),duetOpen:integer('duet_open').notNull().default(0),duetGuide:text('duet_guide').notNull().default(''),uploadedAt:integer('uploaded_at').notNull().default(0),firstPublishedAt:integer('first_published_at').notNull().default(0)
},t=>[index('tracks_status_created').on(t.status,t.created),index('tracks_original').on(t.originalId,t.status),index('tracks_user').on(t.userId),index('tracks_duet_parent').on(t.duetParentId,t.status),index('tracks_duet_open').on(t.coverMode,t.duetOpen,t.status,t.created),index('tracks_upload_quota').on(t.userId,t.kind,t.uploadedAt),index('tracks_artist').on(t.artistId),index('tracks_producer').on(t.producerId)]);
export const likes=sqliteTable('likes',{userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),trackId:text('track_id').references(()=>tracks.id,{onDelete:'cascade'}),dubbingId:text('dubbing_id').references(()=>dubbingProjects.id,{onDelete:'cascade'}),created:integer('created').notNull()},t=>[uniqueIndex('likes_user_track').on(t.userId,t.trackId),uniqueIndex('likes_user_dubbing').on(t.userId,t.dubbingId),index('likes_track').on(t.trackId),index('likes_track_created').on(t.trackId,t.created),check('likes_one_target',sql`(${t.trackId} IS NOT NULL) != (${t.dubbingId} IS NOT NULL)`)]);
export const follows=sqliteTable('follows',{userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),kind:text('kind').notNull(),targetId:text('target_id').notNull(),created:integer('created').notNull()},t=>[primaryKey({columns:[t.userId,t.kind,t.targetId]}),index('follows_target').on(t.kind,t.targetId)]);
export const comments=sqliteTable('comments',{id:text('id').primaryKey(),trackId:text('track_id').references(()=>tracks.id,{onDelete:'cascade'}),dubbingId:text('dubbing_id').references(()=>dubbingProjects.id,{onDelete:'cascade'}),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),parentId:text('parent_id'),body:text('body').notNull(),timestamp:real('timestamp'),created:integer('created').notNull(),edited:integer('edited'),deletedAt:integer('deleted_at').notNull().default(0),deletedBy:text('deleted_by')},t=>[index('comments_track').on(t.trackId,t.created),index('comments_dubbing').on(t.dubbingId,t.created),check('comments_one_target',sql`(${t.trackId} IS NOT NULL) != (${t.dubbingId} IS NOT NULL)`)]);
export const commentLikes=sqliteTable('comment_likes',{userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),commentId:text('comment_id').notNull().references(()=>comments.id,{onDelete:'cascade'})},t=>[primaryKey({columns:[t.userId,t.commentId]})]);
export const playlists=sqliteTable('playlists',{imageVersion:text('image_version').notNull().default(''),imageType:text('image_type').notNull().default(''),id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),name:text('name').notNull(),description:text('description').notNull().default(''),isPublic:integer('is_public').notNull().default(0),created:integer('created').notNull()},t=>[index('playlists_owner').on(t.userId)]);
export const playlistTracks=sqliteTable('playlist_tracks',{playlistId:text('playlist_id').notNull().references(()=>playlists.id,{onDelete:'cascade'}),trackId:text('track_id').notNull().references(()=>tracks.id,{onDelete:'cascade'}),created:integer('created').notNull(),position:integer('position').notNull().default(0)},t=>[primaryKey({columns:[t.playlistId,t.trackId]})]);
export const playlistSaves=sqliteTable('playlist_saves',{userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),playlistId:text('playlist_id').notNull().references(()=>playlists.id,{onDelete:'cascade'}),created:integer('created').notNull()},t=>[primaryKey({columns:[t.userId,t.playlistId]}),index('playlist_saves_playlist').on(t.playlistId)]);
export const playlistPreferences=sqliteTable('playlist_preferences',{userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),playlistId:text('playlist_id').notNull().references(()=>playlists.id,{onDelete:'cascade'}),pinned:integer('pinned').notNull().default(0),position:integer('position').notNull().default(0)},t=>[primaryKey({columns:[t.userId,t.playlistId]})]);
export const listens=sqliteTable('listens',{id:text('id').primaryKey(),trackId:text('track_id').notNull().references(()=>tracks.id,{onDelete:'cascade'}),listener:text('listener').notNull(),userId:text('user_id').references(()=>users.id,{onDelete:'cascade'}),started:integer('started').notNull(),seconds:real('seconds').notNull().default(0),day:text('day').notNull(),qualified:integer('qualified').notNull().default(0)},t=>[index('listens_track_day').on(t.trackId,t.day),index('listens_track_qualified_started').on(t.trackId,t.qualified,t.started),index('listens_user_time').on(t.userId,t.started)]);
export const limits=sqliteTable('rate_limits',{key:text('key').primaryKey(),count:integer('count').notNull(),expires:integer('expires').notNull()});
export const billingTerms=sqliteTable('billing_terms',{version:text('version').primaryKey(),body:text('body').notNull(),created:integer('created').notNull()});
export const subscriptions=sqliteTable('billing_subscriptions',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),state:text('state').notNull(),bidCipher:text('bid_cipher'),cardName:text('card_name').notNull().default(''),cancelRequested:integer('cancel_requested').notNull().default(0),periodStart:integer('period_start').notNull().default(0),periodEnd:integer('period_end').notNull().default(0),cycle:integer('cycle').notNull().default(0),anchorDay:integer('anchor_day').notNull(),lastPaymentId:text('last_payment_id'),consentVersion:text('consent_version').notNull(),consentAt:integer('consent_at').notNull(),price:integer('price').notNull(),baselineUntil:integer('baseline_until').notNull().default(0),leaseToken:text('lease_token'),leaseUntil:integer('lease_until').notNull().default(0),created:integer('created').notNull(),updated:integer('updated').notNull()
},t=>[uniqueIndex('billing_subscription_user').on(t.userId),index('billing_subscription_due').on(t.state,t.cancelRequested,t.periodEnd)]);
export const billingPayments=sqliteTable('billing_payments',{
 id:text('id').primaryKey(),subscriptionId:text('subscription_id').notNull().references(()=>subscriptions.id),cycle:integer('cycle').notNull(),amount:integer('amount').notNull(),status:text('status').notNull(),tid:text('tid'),periodStart:integer('period_start').notNull(),periodEnd:integer('period_end').notNull(),entitlementEnd:integer('entitlement_end').notNull().default(0),refunded:integer('refunded').notNull().default(0),created:integer('created').notNull(),updated:integer('updated').notNull(),lastChecked:integer('last_checked').notNull().default(0),submittedAt:integer('submitted_at').notNull().default(0)
},t=>[uniqueIndex('billing_payment_cycle').on(t.subscriptionId,t.cycle),uniqueIndex('billing_payment_tid').on(t.tid),index('billing_payment_status').on(t.status,t.lastChecked)]);
export const billingWorker=sqliteTable('billing_worker',{id:text('id').primaryKey(),lastSeen:integer('last_seen').notNull()});
export const lyricJobs=sqliteTable('lyric_jobs',{
 trackId:text('track_id').primaryKey().references(()=>tracks.id,{onDelete:'cascade'}),id:text('id').notNull(),sourceText:text('source_text').notNull(),language:text('language').notNull(),state:text('state').notNull().default('queued'),resultLrc:text('result_lrc').notNull().default(''),needsAttention:integer('needs_attention').notNull().default(0),attempts:integer('attempts').notNull().default(0),leaseUntil:integer('lease_until').notNull().default(0),leaseToken:text('lease_token'),error:text('error'),created:integer('created').notNull(),updated:integer('updated').notNull()
},t=>[uniqueIndex('lyric_jobs_id').on(t.id),index('lyric_jobs_queue').on(t.state,t.leaseUntil,t.created)]);
// One karaoke build per track: MR (separated or creator-supplied) plus word timings aligned on the separated vocals.
export const karaokeJobs=sqliteTable('karaoke_jobs',{
 trackId:text('track_id').primaryKey().references(()=>tracks.id,{onDelete:'cascade'}),id:text('id').notNull(),state:text('state').notNull().default('queued'),mrSource:text('mr_source').notNull().default('auto'),mrExt:text('mr_ext').notNull().default(''),mrBytes:integer('mr_bytes').notNull().default(0),mrReady:integer('mr_ready').notNull().default(0),vocalsReady:integer('vocals_ready').notNull().default(0),lyricsText:text('lyrics_text').notNull().default(''),language:text('language').notNull().default('ko'),words:text('words').notNull().default(''),wordsState:text('words_state').notNull().default('none'),attempts:integer('attempts').notNull().default(0),leaseUntil:integer('lease_until').notNull().default(0),leaseToken:text('lease_token'),error:text('error'),created:integer('created').notNull(),updated:integer('updated').notNull()
},t=>[uniqueIndex('karaoke_jobs_id').on(t.id),index('karaoke_jobs_queue').on(t.state,t.leaseUntil,t.created)]);
// Gold is bought in lots; gifts spend the oldest paid lots first. The check keeps a lot from being overspent
// or spent once refunded, so a concurrent gift or refund rolls its whole batch back instead of corrupting balances.
export const goldPurchases=sqliteTable('gold_purchases',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),channel:text('channel').notNull(),gold:integer('gold').notNull(),used:integer('used').notNull().default(0),priceKrw:integer('price_krw').notNull(),feeKrw:integer('fee_krw').notNull().default(0),taxKrw:integer('tax_krw').notNull().default(0),status:text('status').notNull().default('pending'),providerRef:text('provider_ref'),created:integer('created').notNull(),paidAt:integer('paid_at').notNull().default(0)
},t=>[index('gold_purchases_user').on(t.userId,t.status,t.paidAt),uniqueIndex('gold_purchases_ref').on(t.channel,t.providerRef),check('gold_purchases_usage',sql`${t.used} >= 0 AND ${t.used} <= ${t.gold} AND (${t.status} = 'paid' OR ${t.used} = 0)`)]);
// Shares are frozen per gift in milli-won: the cover singer, the original's creator and the platform.
export const gifts=sqliteTable('gifts',{
 quantity:integer('quantity').notNull().default(1),
 giftType:text('gift_type'),giftName:text('gift_name'),requestId:text('request_id'),
 id:text('id').primaryKey(),senderId:text('sender_id').notNull().references(()=>users.id),trackId:text('track_id').references(()=>tracks.id),gold:integer('gold').notNull(),netMw:integer('net_mw').notNull(),singerProfileId:text('singer_profile_id'),creatorProfileId:text('creator_profile_id').notNull(),singerMw:integer('singer_mw').notNull().default(0),creatorMw:integer('creator_mw').notNull(),platformMw:integer('platform_mw').notNull(),month:text('month').notNull(),created:integer('created').notNull()
},t=>[index('gifts_track').on(t.trackId,t.created),index('gifts_sender').on(t.senderId,t.created),index('gifts_singer').on(t.singerProfileId,t.month),index('gifts_creator').on(t.creatorProfileId,t.month),uniqueIndex('gifts_request').on(t.senderId,t.requestId)]);
// Free cheers are earned, never sold or converted into gold or payout earnings.
export const freeGiftWallets=sqliteTable('free_gift_wallets',{
 userId:text('user_id').primaryKey().references(()=>users.id),balance:integer('balance').notNull().default(0)
},t=>[check('free_gift_balance',sql`${t.balance} >= 0`)]);
export const freeGiftClaims=sqliteTable('free_gift_claims',{
 userId:text('user_id').notNull().references(()=>users.id),day:text('day').notNull(),kind:text('kind').notNull(),amount:integer('amount').notNull(),created:integer('created').notNull()
},t=>[primaryKey({columns:[t.userId,t.day,t.kind]})]);
export const freeGifts=sqliteTable('free_gifts',{
 silver:integer('silver').notNull().default(1),giftType:text('gift_type').notNull().default('star'),giftName:text('gift_name').notNull().default('은화'),quantity:integer('quantity').notNull().default(1),
 recipientProfileId:text('recipient_profile_id').references(()=>producers.id),id:text('id').primaryKey(),senderId:text('sender_id').notNull().references(()=>users.id),trackId:text('track_id').references(()=>tracks.id),requestId:text('request_id').notNull(),created:integer('created').notNull()
},t=>[uniqueIndex('free_gifts_request').on(t.senderId,t.requestId),index('free_gifts_track').on(t.trackId,t.created)]);
export const giftLots=sqliteTable('gift_lots',{
 giftId:text('gift_id').notNull().references(()=>gifts.id),purchaseId:text('purchase_id').notNull().references(()=>goldPurchases.id),gold:integer('gold').notNull(),netMw:integer('net_mw').notNull()
},t=>[primaryKey({columns:[t.giftId,t.purchaseId]})]);
// Creator payout details. Account and resident numbers are stored only as AES-GCM ciphertext bound to the user.
export const payoutAccounts=sqliteTable('payout_accounts',{
 userId:text('user_id').primaryKey().references(()=>users.id),holder:text('holder').notNull(),bank:text('bank').notNull(),accountLast4:text('account_last4').notNull(),accountCipher:text('account_cipher').notNull(),residentHint:text('resident_hint').notNull(),residentCipher:text('resident_cipher').notNull(),consentAt:integer('consent_at').notNull(),updated:integer('updated').notNull()
});
export const payoutPeriods=sqliteTable('payout_periods',{period:text('period').primaryKey(),closedAt:integer('closed_at').notNull(),closedBy:text('closed_by').notNull()});
// One statement per profile per closed month; it covers every unpaid month since that profile's previous statement.
export const payoutStatements=sqliteTable('payout_statements',{
 id:text('id').primaryKey(),profileId:text('profile_id').notNull().references(()=>producers.id),userId:text('user_id').notNull().references(()=>users.id),period:text('period').notNull(),fromMonth:text('from_month').notNull(),grossKrw:integer('gross_krw').notNull(),incomeTaxKrw:integer('income_tax_krw').notNull().default(0),localTaxKrw:integer('local_tax_krw').notNull().default(0),netKrw:integer('net_krw').notNull(),status:text('status').notNull(),dueOn:text('due_on').notNull(),paidAt:integer('paid_at').notNull().default(0),paidRef:text('paid_ref'),paidBy:text('paid_by'),accountSnapshot:text('account_snapshot'),created:integer('created').notNull()
},t=>[uniqueIndex('payout_statements_period').on(t.profileId,t.period),index('payout_statements_status').on(t.status,t.dueOn),index('payout_statements_user').on(t.userId)]);
export const adminAudit=sqliteTable('admin_audit',{id:text('id').primaryKey(),adminId:text('admin_id').notNull(),action:text('action').notNull(),target:text('target').notNull(),created:integer('created').notNull()},t=>[index('admin_audit_time').on(t.created)]);

// MCP operations are additive; payment, payout and audio data remain in their existing tables.
export const adminTestGoldGrants=sqliteTable('admin_test_gold_grants',{
 requestId:text('request_id').primaryKey(),operatorId:text('operator_id').notNull(),userId:text('user_id').notNull().references(()=>users.id),gold:integer('gold').notNull(),reason:text('reason').notNull(),payloadHash:text('payload_hash').notNull(),purchaseId:text('purchase_id').notNull().references(()=>goldPurchases.id),created:integer('created').notNull()
},t=>[uniqueIndex('admin_test_gold_purchase').on(t.purchaseId),index('admin_test_gold_created').on(t.created),check('admin_test_gold_amount',sql`${t.gold} BETWEEN 1 AND 10000`)]);
export const adminEmailBugs=sqliteTable('admin_email_bugs',{
 id:text('id').primaryKey(),subject:text('subject').notNull(),summary:text('summary').notNull(),receivedAt:integer('received_at').notNull(),payloadHash:text('payload_hash').notNull(),operatorId:text('operator_id').notNull(),created:integer('created').notNull()
},t=>[index('admin_email_bugs_received').on(t.receivedAt)]);

export const commentReports=sqliteTable('comment_reports',{
 id:text('id').primaryKey(),commentId:text('comment_id').notNull().references(()=>comments.id,{onDelete:'cascade'}),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),reason:text('reason').notNull(),details:text('details').notNull().default(''),bodySnapshot:text('body_snapshot').notNull(),created:integer('created').notNull(),status:text('status').notNull().default('pending'),resolvedBy:text('resolved_by'),resolvedAt:integer('resolved_at').notNull().default(0)
},t=>[uniqueIndex('comment_reports_reporter').on(t.commentId,t.userId),index('comment_reports_status').on(t.status,t.created)]);

export const trackReports=sqliteTable('track_reports',{
 id:text('id').primaryKey(),trackId:text('track_id').references(()=>tracks.id,{onDelete:'cascade'}),dubbingId:text('dubbing_id').references(()=>dubbingProjects.id,{onDelete:'cascade'}),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),reason:text('reason').notNull(),details:text('details').notNull().default(''),created:integer('created').notNull(),rightsholder:text('rightsholder').notNull().default(''),contact:text('contact').notNull().default(''),evidenceJson:text('evidence_json').notNull().default('[]'),status:text('status').notNull().default('pending'),decision:text('decision').notNull().default(''),appeal:text('appeal').notNull().default(''),appealEvidenceJson:text('appeal_evidence_json').notNull().default('[]'),version:integer('version').notNull().default(1),resolvedBy:text('resolved_by'),resolvedAt:integer('resolved_at').notNull().default(0)
},t=>[uniqueIndex('track_reports_reporter').on(t.trackId,t.userId),index('track_reports_reason').on(t.trackId,t.reason),uniqueIndex('reports_dubbing_reporter').on(t.dubbingId,t.userId),index('reports_dubbing_status').on(t.dubbingId,t.status),check('reports_one_target',sql`(${t.trackId} IS NOT NULL) != (${t.dubbingId} IS NOT NULL)`)]);

// Verified lossless originals; committed jobs retry WAV cleanup without re-encoding or affecting playback.
export const originalArchives=sqliteTable('original_archives',{
 trackId:text('track_id').primaryKey().references(()=>tracks.id),sourceKey:text('source_key').notNull(),sourceBytes:integer('source_bytes').notNull(),state:text('state').notNull().default('queued'),outputKey:text('output_key').notNull().default(''),outputBytes:integer('output_bytes').notNull().default(0),outputSha:text('output_sha').notNull().default(''),pcmSha:text('pcm_sha').notNull().default(''),attempts:integer('attempts').notNull().default(0),leaseToken:text('lease_token'),leaseUntil:integer('lease_until').notNull().default(0),error:text('error'),updated:integer('updated').notNull()
},t=>[index('original_archives_queue').on(t.state,t.leaseUntil)]);

// Independent one-time gold orders; subscriptions never use these orders or balances.
export const goldOrders=sqliteTable('gold_orders',{
 id:text('id').primaryKey().references(()=>goldPurchases.id),userId:text('user_id').notNull().references(()=>users.id),requestId:text('request_id').notNull(),state:text('state').notNull().default('created'),reviewOnly:integer('review_only').notNull().default(0),tid:text('tid'),created:integer('created').notNull(),expires:integer('expires').notNull(),updated:integer('updated').notNull(),lastChecked:integer('last_checked').notNull().default(0),leaseUntil:integer('lease_until').notNull().default(0),refunded:integer('refunded').notNull().default(0)
},t=>[uniqueIndex('gold_orders_request').on(t.userId,t.requestId),uniqueIndex('gold_orders_tid').on(t.tid),index('gold_orders_reconcile').on(t.state,t.lastChecked)]);

export const crews=sqliteTable('crews',{
 highestLevel:integer('highest_level').notNull().default(1),growthStarted:integer('growth_started').notNull().default(0),
 joinPolicy:text('join_policy').notNull().default('open'),minimumLevel:integer('minimum_level').notNull().default(1),memberLimit:integer('member_limit').notNull().default(0),version:integer('version').notNull().default(1),notice:text('notice').notNull().default(''),
 nameChangedAt:integer('name_changed_at').notNull().default(0),
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull().references(()=>users.id),name:text('name').notNull(),description:text('description').notNull().default(''),interests:text('interests').notNull().default(''),imageVersion:text('image_version').notNull().default(''),recruiting:integer('recruiting').notNull().default(1),created:integer('created').notNull()
},t=>[uniqueIndex('crews_name').on(t.name)]);
export const crewMembers=sqliteTable('crew_members',{
 muted:integer('muted').notNull().default(0),crewId:text('crew_id').notNull().references(()=>crews.id,{onDelete:'cascade'}),userId:text('user_id').notNull().references(()=>users.id),role:text('role').notNull().default('member'),joined:integer('joined').notNull(),joinedSequence:integer('joined_sequence').notNull().default(0),readSequence:integer('read_sequence').notNull().default(0)
},t=>[primaryKey({columns:[t.crewId,t.userId]}),uniqueIndex('crew_members_user').on(t.userId)]);
export const crewXp=sqliteTable('crew_xp',{
 id:text('id').primaryKey(),crewId:text('crew_id').notNull().references(()=>crews.id,{onDelete:'cascade'}),userId:text('user_id').notNull().references(()=>users.id),amount:integer('amount').notNull(),created:integer('created').notNull()
},t=>[index('crew_xp_crew').on(t.crewId)]);
export const crewChatImages=sqliteTable('crew_chat_images',{
 id:text('id').primaryKey(),crewId:text('crew_id').notNull(),senderId:text('sender_id').notNull().references(()=>users.id),objectKey:text('object_key').notNull(),created:integer('created').notNull(),expires:integer('expires').notNull(),deleted:integer('deleted').notNull().default(0)
},t=>[index('crew_chat_images_expiry').on(t.deleted,t.expires)]);
export const crewMessages=sqliteTable('crew_messages',{
 id:text('id').primaryKey(),crewId:text('crew_id').notNull().references(()=>crews.id,{onDelete:'cascade'}),userId:text('user_id').notNull().references(()=>users.id),body:text('body').notNull(),kind:text('kind').notNull().default('message'),authorRole:text('author_role').notNull().default('member'),requestId:text('request_id').notNull(),created:integer('created').notNull(),imageId:text('image_id').references(()=>crewChatImages.id)
},t=>[uniqueIndex('crew_messages_request').on(t.userId,t.requestId),index('crew_messages_time').on(t.crewId,t.created),index('crew_messages_sequence').on(t.crewId)]);
export const chatImages=sqliteTable('chat_images',{
 id:text('id').primaryKey(),senderId:text('sender_id').notNull().references(()=>users.id),recipientId:text('recipient_id').notNull().references(()=>users.id),objectKey:text('object_key').notNull(),created:integer('created').notNull(),expires:integer('expires').notNull(),deleted:integer('deleted').notNull().default(0)
},t=>[index('chat_images_expiry').on(t.deleted,t.expires)]);
export const dmSettings=sqliteTable('dm_settings',{
 userId:text('user_id').notNull().references(()=>users.id),peerId:text('peer_id').notNull().references(()=>users.id),muted:integer('muted').notNull().default(0),clearedSequence:integer('cleared_sequence').notNull().default(0)
},t=>[primaryKey({columns:[t.userId,t.peerId]})]);
export const directMessages=sqliteTable('direct_messages',{
 crewInviteId:text('crew_invite_id').references(()=>crews.id,{onDelete:'set null'}),
 id:text('id').primaryKey(),senderId:text('sender_id').notNull().references(()=>users.id),recipientId:text('recipient_id').notNull().references(()=>users.id),body:text('body').notNull(),requestId:text('request_id').notNull(),created:integer('created').notNull(),readAt:integer('read_at').notNull().default(0),imageId:text('image_id').references(()=>chatImages.id)
},t=>[uniqueIndex('direct_messages_request').on(t.senderId,t.requestId),index('direct_messages_sender').on(t.senderId,t.recipientId,t.created),index('direct_messages_recipient').on(t.recipientId,t.created),index('direct_messages_pair_sequence').on(t.senderId,t.recipientId),index('direct_messages_sent_sequence').on(t.senderId),index('direct_messages_received_sequence').on(t.recipientId),index('direct_messages_unread').on(t.recipientId,t.readAt),index('direct_messages_sent_unread').on(t.senderId,t.recipientId,t.readAt)]);

export const crewBans=sqliteTable('crew_bans',{crewId:text('crew_id').notNull().references(()=>crews.id,{onDelete:'cascade'}),userId:text('user_id').notNull().references(()=>users.id),created:integer('created').notNull()},t=>[primaryKey({columns:[t.crewId,t.userId]})]);
// Lease-specific output keys prevent an expired encoder from replacing the live AAC 256 file.
export const premiumAudioJobs=sqliteTable('premium_audio_jobs',{
 trackId:text('track_id').primaryKey().references(()=>tracks.id,{onDelete:'cascade'}),state:text('state').notNull().default('queued'),sourceKey:text('source_key').notNull().default(''),outputKey:text('output_key').notNull().default(''),outputSha:text('output_sha').notNull().default(''),outputBytes:integer('output_bytes').notNull().default(0),attempts:integer('attempts').notNull().default(0),leaseUntil:integer('lease_until').notNull().default(0),leaseToken:text('lease_token'),updated:integer('updated').notNull()
},t=>[index('premium_audio_queue').on(t.state,t.leaseUntil,t.updated)]);

// Apple-signed transactions are bound to a stable per-user account token.
export const appleAccounts=sqliteTable('apple_accounts',{
 userId:text('user_id').primaryKey().references(()=>users.id),token:text('token').notNull(),created:integer('created').notNull()
},t=>[uniqueIndex('apple_accounts_token').on(t.token)]);
export const appleTransactions=sqliteTable('apple_transactions',{
 id:text('id').primaryKey(),environment:text('environment').notNull(),transactionId:text('transaction_id').notNull(),originalId:text('original_id').notNull(),userId:text('user_id').notNull().references(()=>users.id),productId:text('product_id').notNull(),purchased:integer('purchased').notNull(),expires:integer('expires').notNull().default(0),revoked:integer('revoked').notNull().default(0),signedDate:integer('signed_date').notNull(),refundReview:integer('refund_review').notNull().default(0),refundedUsed:integer('refunded_used').notNull().default(0),created:integer('created').notNull()
},t=>[uniqueIndex('apple_transaction_unique').on(t.environment,t.transactionId),index('apple_transaction_user').on(t.userId,t.environment,t.expires),index('apple_transaction_original').on(t.environment,t.originalId)]);

// Account removal keeps anonymous ledger keys while uploaded files are durably purged.
export const appleLoginTokens=sqliteTable('apple_login_tokens',{userId:text('user_id').primaryKey().references(()=>users.id,{onDelete:'cascade'}),cipher:text('cipher').notNull()});
export const userBlocks=sqliteTable('user_blocks',{userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),blockedId:text('blocked_id').notNull().references(()=>users.id,{onDelete:'cascade'}),created:integer('created').notNull()},t=>[primaryKey({columns:[t.userId,t.blockedId]}),index('user_blocks_reverse').on(t.blockedId,t.userId)]);
export const accountFileDeletions=sqliteTable('account_file_deletions',{id:text('id').primaryKey(),targets:text('targets').notNull(),readyAt:integer('ready_at').notNull(),pass:integer('pass').notNull().default(0)},t=>[index('account_file_deletions_ready').on(t.readyAt)]);

export const musicClassificationJobs=sqliteTable('music_classification_jobs',{trackId:text('track_id').primaryKey().references(()=>tracks.id,{onDelete:'cascade'}),state:text('state').notNull().default('queued'),attempts:integer('attempts').notNull().default(0),leaseToken:text('lease_token').notNull().default(''),leaseUntil:integer('lease_until').notNull().default(0),resultJson:text('result_json').notNull().default('{}'),error:text('error').notNull().default(''),updated:integer('updated').notNull()},t=>[index('music_classification_queue').on(t.state,t.leaseUntil,t.updated)]);
export const musicClassificationCache=sqliteTable('music_classification_cache',{cacheKey:text('cache_key').primaryKey(),resultJson:text('result_json').notNull(),created:integer('created').notNull()});

// XP sources survive content removal: publishing the same song twice never awards twice.
export const playerXp=sqliteTable('player_xp',{
 userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),sourceKey:text('source_key').notNull(),kind:text('kind').notNull(),amount:integer('amount').notNull(),created:integer('created').notNull()
},t=>[primaryKey({columns:[t.userId,t.sourceKey]}),index('player_xp_recent').on(t.userId,t.created),check('player_xp_positive',sql`${t.amount}>0`)]);
export const playerInventory=sqliteTable('player_inventory',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),itemKey:text('item_key').notNull(),source:text('source').notNull(),sourceRef:text('source_ref').notNull(),grantedAt:integer('granted_at').notNull(),expiresAt:integer('expires_at').notNull().default(0),revoked:integer('revoked').notNull().default(0)
},t=>[uniqueIndex('player_inventory_grant').on(t.userId,t.source,t.sourceRef),index('player_inventory_user').on(t.userId)]);
export const playerEquipment=sqliteTable('player_equipment',{
 userId:text('user_id').primaryKey().references(()=>users.id,{onDelete:'cascade'}),frameInventoryId:text('frame_inventory_id').references(()=>playerInventory.id,{onDelete:'set null'})
});
// Cosmetic sales spend existing gold lots; they never enter creator gift settlement.
export const decorationOrders=sqliteTable('decoration_orders',{
 id:text('id').primaryKey(),payerId:text('payer_id').notNull().references(()=>users.id),recipientId:text('recipient_id').notNull().references(()=>users.id),requestId:text('request_id').notNull(),sku:text('sku').notNull(),periodCode:text('period_code').notNull(),gold:integer('gold').notNull(),inventoryId:text('inventory_id').notNull().references(()=>playerInventory.id),created:integer('created').notNull()
},t=>[uniqueIndex('decoration_order_request').on(t.payerId,t.requestId),index('decoration_order_inventory').on(t.inventoryId),check('decoration_price_positive',sql`${t.gold}>0`),check('decoration_period',sql`${t.periodCode} IN ('P7D','P1M','P3M')`)]);
export const decorationOrderLots=sqliteTable('decoration_order_lots',{
 orderId:text('order_id').notNull().references(()=>decorationOrders.id),purchaseId:text('purchase_id').notNull().references(()=>goldPurchases.id),gold:integer('gold').notNull(),netMw:integer('net_mw').notNull()
},t=>[primaryKey({columns:[t.orderId,t.purchaseId]}),check('decoration_lot_positive',sql`${t.gold}>0 AND ${t.netMw}>=0`)]);
export const decorationRedemptions=sqliteTable('decoration_redemptions',{
 inventoryId:text('inventory_id').primaryKey().references(()=>playerInventory.id),userId:text('user_id').notNull().references(()=>users.id),requestId:text('request_id').notNull(),activeInventoryId:text('active_inventory_id').notNull().references(()=>playerInventory.id),previousExpires:integer('previous_expires').notNull(),previousRevoked:integer('previous_revoked').notNull(),expiresAt:integer('expires_at').notNull(),created:integer('created').notNull()
},t=>[uniqueIndex('decoration_redemption_request').on(t.userId,t.requestId),index('decoration_redemption_active').on(t.activeInventoryId)]);
export const decorationTransfers=sqliteTable('decoration_transfers',{
 id:text('id').primaryKey(),inventoryId:text('inventory_id').notNull().references(()=>playerInventory.id),senderId:text('sender_id').notNull().references(()=>users.id),recipientId:text('recipient_id').notNull().references(()=>users.id),requestId:text('request_id').notNull(),created:integer('created').notNull()
},t=>[uniqueIndex('decoration_transfer_request').on(t.senderId,t.requestId)]);
// Display settings are separate from realtime voice transport and its database.
export const roomDecorations=sqliteTable('room_decorations',{
 roomId:text('room_id').primaryKey(),hostId:text('host_id').notNull().references(()=>users.id),sku:text('sku').notNull(),revision:integer('revision').notNull(),updated:integer('updated').notNull()
});
export const musicClassificationHistory=sqliteTable('music_classification_history',{id:text('id').primaryKey(),trackId:text('track_id').notNull().references(()=>tracks.id),beforeJson:text('before_json').notNull(),afterJson:text('after_json').notNull(),created:integer('created').notNull()},t=>[index('music_classification_history_track').on(t.trackId,t.created)]);

// Monetary precision stays in milli-won; 1 diamond is 100 KRW, not one ledger unit.
export const diamondLedger=sqliteTable('diamond_ledger',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),kind:text('kind').notNull(),sourceKey:text('source_key').notNull(),amountMw:integer('amount_mw').notNull(),eligibleMw:integer('eligible_mw').notNull().default(0),gold:integer('gold').notNull().default(0),period:text('period').notNull(),detail:text('detail').notNull().default(''),created:integer('created').notNull()
},t=>[uniqueIndex('diamond_source').on(t.userId,t.sourceKey),index('diamond_user').on(t.userId,t.created)]);
export const creatorPartners=sqliteTable('creator_partners',{
 userId:text('user_id').primaryKey().references(()=>users.id),basis:text('basis').notNull(),active:integer('active').notNull().default(1),activated:integer('activated').notNull(),reviewedBy:text('reviewed_by').notNull(),reason:text('reason').notNull()
});
export const giftExclusions=sqliteTable('gift_exclusions',{
 giftId:text('gift_id').primaryKey().references(()=>gifts.id),reason:text('reason').notNull(),reviewedBy:text('reviewed_by').notNull(),created:integer('created').notNull()
});
export const profilePhotos=sqliteTable('profile_photos',{
 id:text('id').primaryKey(),producerId:text('producer_id').notNull().references(()=>producers.id,{onDelete:'cascade'}),imageVersion:text('image_version').notNull(),imageType:text('image_type').notNull(),created:integer('created').notNull()
},t=>[index('profile_photos_producer_created').on(t.producerId,t.created)]);
// Existing photos stay public; adding privacy does not rewrite the original media rows.
export const profilePhotoPrivacy=sqliteTable('profile_photo_privacy',{
 photoId:text('photo_id').primaryKey().references(()=>profilePhotos.id,{onDelete:'cascade'}),isPublic:integer('is_public').notNull().default(1)
},t=>[check('profile_photo_privacy_boolean',sql`${t.isPublic} IN (0,1)`)]);
export const streamSettlements=sqliteTable('stream_settlements',{
 period:text('period').primaryKey(),paidKrw:integer('paid_krw').notNull(),refundedKrw:integer('refunded_krw').notNull(),feeKrw:integer('fee_krw').notNull(),taxKrw:integer('tax_krw').notNull(),poolMw:integer('pool_mw').notNull(),allocatedMw:integer('allocated_mw').notNull(),evidence:text('evidence').notNull(),reviewedBy:text('reviewed_by').notNull(),created:integer('created').notNull()
});

export const chartDailySnapshots=sqliteTable('chart_daily_snapshots',{day:text('day').notNull(),period:text('period').notNull(),captured:integer('captured').notNull(),ranksJson:text('ranks_json').notNull()},t=>[primaryKey({columns:[t.day,t.period]})]);
export const karaokeVocalParts=sqliteTable('karaoke_vocal_parts',{
 trackId:text('track_id').primaryKey().references(()=>tracks.id,{onDelete:'cascade'}),jobId:text('job_id').notNull(),version:integer('version').notNull(),state:text('state').notNull().default('queued'),attempts:integer('attempts').notNull().default(0),leaseToken:text('lease_token').notNull().default(''),leaseUntil:integer('lease_until').notNull().default(0),resultJson:text('result_json').notNull().default(''),error:text('error').notNull().default(''),updated:integer('updated').notNull()
},t=>[index('karaoke_vocal_parts_pending').on(t.state,t.leaseUntil,t.updated)]);
export const voiceMusicPermissions=sqliteTable('voice_music_permissions',{trackId:text('track_id').primaryKey().references(()=>tracks.id,{onDelete:'cascade'}),ownerId:text('owner_id').notNull().references(()=>users.id),terms:text('terms').notNull(),acceptedAt:integer('accepted_at').notNull()});

// Dubbing is a separate content domain: it never enters the music settlement ledger.
export const dubbingProjects=sqliteTable('dubbing_projects',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 title:text('title').notNull(),optionsJson:text('options_json').notNull(),scriptJson:text('script_json').notNull(),scriptKey:text('script_key').notNull(),
 creationHash:text('creation_hash').notNull(),source:text('source').notNull().default('manual'),generationId:text('generation_id'),
 state:text('state').notNull().default('script_ready'),visibility:text('visibility').notNull().default('private'),
 rootId:text('root_id'),deletedAt:integer('deleted_at').notNull().default(0),
 roleCount:integer('role_count').notNull(),duration:real('duration').notNull(),revision:integer('revision').notNull().default(1),
 writeToken:text('write_token').notNull(),rightsAt:integer('rights_at').notNull().default(0),firstRecordedAt:integer('first_recorded_at').notNull().default(0),
 created:integer('created').notNull(),updated:integer('updated').notNull()
},t=>[index('dubbing_projects_owner').on(t.ownerId,t.updated),index('dubbing_projects_root').on(t.rootId,t.created),index('dubbing_projects_browse').on(t.visibility,t.state,t.created),
 check('dubbing_roles_range',sql`${t.roleCount} BETWEEN 1 AND 6`),check('dubbing_duration_range',sql`${t.duration} > 0 AND ${t.duration} <= 300`)]);
export const dubbingRoleClaims=sqliteTable('dubbing_role_claims',{
 projectId:text('project_id').notNull().references(()=>dubbingProjects.id,{onDelete:'cascade'}),roleId:text('role_id').notNull(),
 userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),created:integer('created').notNull()
},t=>[primaryKey({columns:[t.projectId,t.roleId]}),uniqueIndex('dubbing_one_role_per_user').on(t.projectId,t.userId)]);
export const dubbingGenerations=sqliteTable('dubbing_generations',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),inputHash:text('input_hash').notNull(),
 state:text('state').notNull(),resultJson:text('result_json'),usageJson:text('usage_json').notNull().default('{}'),providerId:text('provider_id').notNull().default(''),
 quotaSource:text('quota_source').notNull().default('daily'),
 error:text('error').notNull().default(''),created:integer('created').notNull(),updated:integer('updated').notNull()
},t=>[index('dubbing_generations_user').on(t.userId,t.created)]);
export const dubbingSoundJobs=sqliteTable('dubbing_sound_jobs',{
 id:text('id').primaryKey(),projectId:text('project_id').notNull().references(()=>dubbingProjects.id,{onDelete:'cascade'}),
 scriptKey:text('script_key').notNull(),mode:text('mode').notNull(),timelineJson:text('timeline_json').notNull(),
 state:text('state').notNull().default('queued'),leaseToken:text('lease_token'),leaseUntil:integer('lease_until').notNull().default(0),
 attempts:integer('attempts').notNull().default(0),nextPoll:integer('next_poll').notNull().default(0),
 outputKey:text('output_key'),outputMeta:text('output_meta'),error:text('error').notNull().default(''),
 created:integer('created').notNull(),updated:integer('updated').notNull()
},t=>[uniqueIndex('dubbing_sound_script').on(t.projectId,t.scriptKey),index('dubbing_sound_queue').on(t.state,t.nextPoll,t.leaseUntil)]);
export const dubbingSoundAssets=sqliteTable('dubbing_sound_assets',{
 jobId:text('job_id').notNull().references(()=>dubbingSoundJobs.id,{onDelete:'cascade'}),cueId:text('cue_id').notNull(),
 state:text('state').notNull().default('pending'),providerId:text('provider_id'),outputUrl:text('output_url'),
 usageJson:text('usage_json').notNull().default('{}'),billingJson:text('billing_json').notNull().default('{}'),
 attempts:integer('attempts').notNull().default(0),updated:integer('updated').notNull()
},t=>[primaryKey({columns:[t.jobId,t.cueId]})]);
export const dubbingScriptRewards=sqliteTable('dubbing_script_rewards',{
 transactionId:text('transaction_id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 day:text('day').notNull(),completedAt:integer('completed_at').notNull()
},t=>[index('dubbing_rewards_user_day').on(t.userId,t.day)]);
export const dubbingScriptCredits=sqliteTable('dubbing_script_credits',{
 id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 amount:integer('amount').notNull(),issuedBy:text('issued_by').notNull(),reason:text('reason').notNull(),created:integer('created').notNull()
},t=>[index('dubbing_credits_user').on(t.userId,t.created),check('dubbing_credit_amount',sql`${t.amount} BETWEEN 1 AND 20`)]);
export const dubbingAdSessions=sqliteTable('dubbing_ad_sessions',{
 id:text('id').primaryKey(),requestId:text('request_id').notNull(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 day:text('day').notNull(),adUnit:text('ad_unit').notNull(),source:text('source').notNull().default('web_gpt_client'),
 state:text('state').notNull().default('open'),created:integer('created').notNull(),expiresAt:integer('expires_at').notNull(),completedAt:integer('completed_at').notNull().default(0)
},t=>[uniqueIndex('dubbing_ad_request').on(t.requestId),index('dubbing_ad_user_state').on(t.userId,t.state),
 check('dubbing_ad_state',sql`${t.state} IN ('open','granted','cancelled','expired','capped')`)]);
// Financial history survives project deletion, like the existing gift ledger.
export const dubbingGoldOrders=sqliteTable('dubbing_gold_orders',{
 jobId:text('job_id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),projectId:text('project_id').notNull(),
 gold:integer('gold').notNull(),state:text('state').notNull().default('charged'),reason:text('reason').notNull().default(''),
 created:integer('created').notNull(),updated:integer('updated').notNull()
},t=>[index('dubbing_gold_user').on(t.userId,t.created),index('dubbing_gold_state').on(t.state),
 check('dubbing_gold_amount',sql`${t.gold} > 0`),check('dubbing_gold_state_valid',sql`${t.state} IN ('charged','fulfilled','refunded','refund_review')`)]);
export const dubbingGoldLots=sqliteTable('dubbing_gold_lots',{
 jobId:text('job_id').notNull().references(()=>dubbingGoldOrders.jobId),purchaseId:text('purchase_id').notNull().references(()=>goldPurchases.id),
 gold:integer('gold').notNull(),refundedGold:integer('refunded_gold').notNull().default(0)
},t=>[primaryKey({columns:[t.jobId,t.purchaseId]}),check('dubbing_gold_refund_range',sql`${t.gold} > 0 AND ${t.refundedGold} >= 0 AND ${t.refundedGold} <= ${t.gold}`)]);
export const dubbingRecordings=sqliteTable('dubbing_recordings',{
 id:text('id').primaryKey(),projectId:text('project_id').notNull().references(()=>dubbingProjects.id,{onDelete:'cascade'}),roleId:text('role_id').notNull(),
 userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),scriptKey:text('script_key').notNull(),state:text('state').notNull().default('draft'),
 revision:integer('revision').notNull().default(1),writeToken:text('write_token').notNull(),rightsAt:integer('rights_at').notNull().default(0),created:integer('created').notNull(),updated:integer('updated').notNull()
},t=>[uniqueIndex('dubbing_recording_role').on(t.projectId,t.roleId),check('dubbing_recording_state',sql`${t.state} IN ('draft','submitted')`)]);
export const dubbingRecordingLines=sqliteTable('dubbing_recording_lines',{
 recordingId:text('recording_id').notNull().references(()=>dubbingRecordings.id,{onDelete:'cascade'}),lineId:text('line_id').notNull(),
 takeId:text('take_id').notNull(),audioKey:text('audio_key').notNull(),audioHash:text('audio_hash').notNull(),duration:real('duration').notNull(),bytes:integer('bytes').notNull(),updated:integer('updated').notNull()
},t=>[primaryKey({columns:[t.recordingId,t.lineId]}),uniqueIndex('dubbing_recording_take').on(t.takeId)]);
export const dubbingFinalJobs=sqliteTable('dubbing_final_jobs',{
 id:text('id').primaryKey(),projectId:text('project_id').notNull().references(()=>dubbingProjects.id,{onDelete:'cascade'}),scriptKey:text('script_key').notNull(),
 state:text('state').notNull().default('queued'),manifestJson:text('manifest_json').notNull(),leaseToken:text('lease_token'),leaseUntil:integer('lease_until').notNull().default(0),attempts:integer('attempts').notNull().default(0),
 outputKey:text('output_key'),outputMeta:text('output_meta'),error:text('error').notNull().default(''),created:integer('created').notNull(),updated:integer('updated').notNull()
},t=>[uniqueIndex('dubbing_final_project').on(t.projectId,t.scriptKey),index('dubbing_final_queue').on(t.state,t.leaseUntil)]);

// Operator changes are versioned; each sound order keeps its agreed price.
export const dubbingSettings=sqliteTable('dubbing_settings',{
 key:text('key').primaryKey(),soundGold:integer('sound_gold').notNull().default(50),version:integer('version').notNull().default(1),updated:integer('updated').notNull(),updatedBy:text('updated_by').notNull()
},t=>[check('dubbing_settings_singleton',sql`${t.key} = 'default'`),check('dubbing_settings_price',sql`${t.soundGold} BETWEEN 1 AND 10000`)]);
// Anonymous provider accounting survives content/account removal; no script, audio URL or user data.
export const dubbingProviderUsage=sqliteTable('dubbing_provider_usage',{
 jobId:text('job_id').notNull(),cueId:text('cue_id').notNull(),providerId:text('provider_id'),state:text('state').notNull(),
 usageJson:text('usage_json').notNull().default('{}'),billingJson:text('billing_json').notNull().default('{}'),created:integer('created').notNull(),updated:integer('updated').notNull()
},t=>[primaryKey({columns:[t.jobId,t.cueId]}),index('dubbing_provider_usage_time').on(t.created)]);

export const crewApplications=sqliteTable('crew_applications',{crewId:text('crew_id').notNull().references(()=>crews.id,{onDelete:'cascade'}),userId:text('user_id').notNull().references(()=>users.id),state:text('state').notNull().default('pending'),created:integer('created').notNull()},t=>[primaryKey({columns:[t.crewId,t.userId]})]);
export const crewAudit=sqliteTable('crew_audit',{id:text('id').primaryKey(),crewId:text('crew_id').notNull().references(()=>crews.id,{onDelete:'cascade'}),actorId:text('actor_id').notNull().references(()=>users.id),action:text('action').notNull(),detail:text('detail').notNull().default(''),created:integer('created').notNull()},t=>[index('crew_audit_time').on(t.crewId,t.created)]);

export const profileArtistPins=sqliteTable('profile_artist_pins',{producerId:text('producer_id').primaryKey().references(()=>producers.id,{onDelete:'cascade'}),idsJson:text('ids_json').notNull().default('[]')});
export const crewGrowthEvents=sqliteTable('crew_growth_events',{evidenceId:text('evidence_id').notNull().default(''),id:text('id').primaryKey(),crewId:text('crew_id').notNull().references(()=>crews.id,{onDelete:'cascade'}),userId:text('user_id').notNull(),sourceId:text('source_id').notNull(),credited:integer('credited').notNull().default(1),kind:text('kind').notNull(),collaboration:integer('collaboration').notNull().default(0),created:integer('created').notNull()},t=>[index('crew_growth_period').on(t.crewId,t.created),index('crew_growth_member_day').on(t.userId,t.created)]);
export const crewMissions=sqliteTable('crew_missions',{crewId:text('crew_id').notNull().references(()=>crews.id,{onDelete:'cascade'}),missionKey:text('mission_key').notNull(),periodStart:integer('period_start').notNull(),progress:integer('progress').notNull(),target:integer('target').notNull(),reward:integer('reward').notNull()},t=>[primaryKey({columns:[t.crewId,t.missionKey,t.periodStart]})]);
export const crewNotices=sqliteTable('crew_notices',{id:text('id').primaryKey(),crewId:text('crew_id').notNull().references(()=>crews.id,{onDelete:'cascade'}),authorId:text('author_id').notNull(),editorId:text('editor_id').notNull(),title:text('title').notNull(),body:text('body').notNull(),isPinned:integer('is_pinned').notNull().default(0),created:integer('created').notNull(),updated:integer('updated').notNull(),deletedAt:integer('deleted_at').notNull().default(0)});
export const crewNoticeImages=sqliteTable('crew_notice_images',{id:text('id').primaryKey(),crewId:text('crew_id').notNull().references(()=>crews.id,{onDelete:'cascade'}),authorId:text('author_id').notNull(),noticeId:text('notice_id').references(()=>crewNotices.id),r2Key:text('r2_key').notNull(),mimeType:text('mime_type').notNull(),sortOrder:integer('sort_order').notNull().default(0),created:integer('created').notNull()});

export * from './ai-bots';
export * from './cover-compression';

// Public profile codes never replace users.id or legacy numeric public_member_ids.
export const publicProfileIds=sqliteTable('public_profile_ids',{userId:text('user_id').primaryKey(),code:text('code').notNull()},t=>[uniqueIndex('public_profile_ids_code').on(t.code),check('public_profile_ids_format',sql`length(${t.code})=7 AND ${t.code} GLOB '[A-Z][A-Z][A-Z][0-9][0-9][0-9][0-9]'`)]);
export const nicknameChanges=sqliteTable('nickname_changes',{userId:text('user_id').primaryKey().references(()=>users.id,{onDelete:'cascade'}),changedAt:integer('changed_at').notNull()});

// Fanpage records are isolated from song comments. Existing photo rows stay intact.
export const artistFanpages=sqliteTable('artist_fanpages',{
 artistId:text('artist_id').primaryKey().references(()=>artists.id,{onDelete:'cascade'}),revision:integer('revision').notNull().default(0),bannerVersion:text('banner_version').notNull().default(''),bannerType:text('banner_type').notNull().default(''),
 desktopX:integer('desktop_x').notNull().default(50),desktopY:integer('desktop_y').notNull().default(50),mobileX:integer('mobile_x').notNull().default(50),mobileY:integer('mobile_y').notNull().default(50),
 photoOrder:text('photo_order').notNull().default('[]'),carouselIds:text('carousel_ids').notNull().default('[]'),intro:text('intro').notNull().default(''),style:text('style').notNull().default(''),world:text('world').notNull().default('')
});
export const artistOperators=sqliteTable('artist_operators',{artistId:text('artist_id').notNull().references(()=>artists.id,{onDelete:'cascade'}),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'})},t=>[primaryKey({columns:[t.artistId,t.userId]})]);
export const artistFanPosts=sqliteTable('artist_fan_posts',{
 id:text('id').primaryKey(),artistId:text('artist_id').notNull().references(()=>artists.id,{onDelete:'cascade'}),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),kind:text('kind').notNull(),parentId:text('parent_id'),title:text('title').notNull().default(''),body:text('body').notNull(),requestId:text('request_id').notNull(),pinned:integer('pinned').notNull().default(0),revision:integer('revision').notNull().default(0),created:integer('created').notNull(),updated:integer('updated').notNull(),deletedAt:integer('deleted_at').notNull().default(0)
},t=>[uniqueIndex('artist_fan_request').on(t.artistId,t.userId,t.requestId),index('artist_fan_feed').on(t.artistId,t.kind,t.created),check('artist_fan_kind',sql`${t.kind} IN ('lounge','news')`),check('artist_fan_pinned',sql`${t.pinned} IN (0,1)`)]);
export const artistFanLikes=sqliteTable('artist_fan_likes',{postId:text('post_id').notNull().references(()=>artistFanPosts.id,{onDelete:'cascade'}),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'})},t=>[primaryKey({columns:[t.postId,t.userId]})]);
export const artistFanReports=sqliteTable('artist_fan_reports',{id:text('id').primaryKey(),postId:text('post_id').notNull().references(()=>artistFanPosts.id,{onDelete:'cascade'}),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),reason:text('reason').notNull(),bodySnapshot:text('body_snapshot').notNull(),status:text('status').notNull().default('pending'),created:integer('created').notNull()},t=>[uniqueIndex('artist_fan_reporter').on(t.postId,t.userId),index('artist_fan_reports_pending').on(t.status,t.created)]);
