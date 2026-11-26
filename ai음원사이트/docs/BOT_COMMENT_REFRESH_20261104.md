# Existing work comment replacement — 2026-11-04

Owner request: remove the existing bot comments and write new personality-based comments to review their feel. The initial live inspection found nine official bot comments. Human comments, replies, gifts and follows are outside this replacement.

Migration 0093 snapshots the original bot comment text in `ai_bot_audit`, retires existing comment queue slots while retaining historical IDs/activities, and queues two or three Luna comments per existing published original song or completed cover. Private/deleted/reported-removed works and open duets do not receive new comments. No gift jobs are created.

The existing generator and personality/genre matching are reused. Only the explicitly identified refresh jobs bypass the normal human-reaction threshold, random posting probability, new-creator requirement and creator-per-day cap. The master stop switch, enabled categories, per-work setting, daily/global and per-bot caps, blocking and live target checks remain enforced.

The first successful new comment atomically soft-deletes only the backed-up official bot comments and records the replacement audit. API failure or a stopped/stale engine cannot remove the originals. Jobs begin in `refresh_waiting`, so an older Worker cannot process them during deployment; the new engine promotes them under its lease. Stable new comment IDs and queue uniqueness prevent duplicated comments on retries. Human replies are promoted to root comments so they remain visible; historical comment/report records remain valid. Namespaced refresh comment IDs are supported by the existing like, report and owner-delete routes. Refresh comments do not add support follows.

The authenticated transcoder heartbeat accelerates only pending refresh jobs, with the existing durable engine lease and eight-second processing budget. Once complete, normal polling frequency resumes. Authenticated administrator stats expose progress, errors and six recent actual results in `bot_comment_refresh`.

Local fixture coverage checks migration selection, human/reply/history/follow preservation, generation failure, successful atomic replacement, duplicate runs, stop during generation and the ordinary support pipeline. Actual operational model output must be checked after deployment; fixture output is not evidence of generated comment quality.
