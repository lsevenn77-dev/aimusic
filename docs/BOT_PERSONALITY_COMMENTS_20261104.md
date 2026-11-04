# Luna personality comments

Requested behavior: retain only the existing Saigram personalities, assign music preferences, select interested characters, and generate two or three polite Korean comments per newly published eligible work using `gpt-6-luna`. Do not give the model example comments.

## Source and identity

`server/data/saigram-personalities.json` is a read-only production snapshot: 42 main/sub characters and 293 bot identities, with 13 additional historical-handle aliases. All 335 existing AIFECT import catalogue keys match. The source personality combinations remain distinct. Two custom characters were not part of the existing AIFECT import and are not copied.

The export reproduces Saigram's `voice_axes_of` assignment and curated overrides from the source files and read-only character/MBTI tables. It does not import the running application's `main.py`. Only an explicit allowlist of personality traits and expression axes is retained. Dialogue samples, verbal tics, relationship state, romantic rules, biography, occupation, hometown, dialect and user history are excluded. Source file digests accompany the snapshot. `scripts/export-saigram-personalities.py` accepts explicit source paths for a future reviewed refresh.

Music preferences are new AIFECT settings, not extracted Saigram facts or scientifically inferred tastes. Deterministic affinity rules favor genres consistent with each personality, retain variety, and cover every catalogue genre with at least three candidates. The same stable source identity has the same preferences even through a handle alias. Personality data is bundled only into the server, not public assets. Admin account reads expose the connected personality and preferences to the authenticated operator.

## Generation and evidence

The existing OpenAI secret is reused with the same Responses API/model used elsewhere in AIFECT. Comments use no template fallback, no examples, and no previous comment text in the prompt. A local similarity check rejects near repeats from the same bot or target, with one corrective generation attempt. Provider failures enter the existing bounded retry queue. A time budget keeps heartbeat work bounded.

Saved `music_classification_jobs.result_json` supplies the original track's Gemini reason and sample/full-track scope. Current track genres/moods, description and stored lyrics also provide context. This adds no Gemini calls and does not change the music classifier. Comments focus on different available fields by slot. Unknown genres do not fall back to an unrelated bot.

Covers currently inherit their original's classification. Therefore they get genre/mood and stored lyrics, but never the original vocal evidence or permission to describe the singer as AI. Original AI tracks can mention AI only when `is_ai=1`. Vocal/rhythm claims require matching saved audio evidence; lyric reactions require stored lyrics. LLM factual compliance beyond these checks is not mathematically guaranteed.

## Persistence and compatibility

Migration `0092_bot_personality_comments` changes existing positive comment settings to 3 (meaning two or three), preserving disabled comments, global enabled/disabled state, gift settings and limits. Four publication triggers gain a third slot. Target-ID parity chooses a stable two-or-three count so republishing cannot add a random extra slot. The unique job key and engine lease preserve idempotency. Existing comments, gifts, users, balances and completed jobs remain intact; there is no historical bulk backfill. Existing caps, blocks, visibility checks and real-member support thresholds still apply.

Templates remain as historical admin data but are never read by the generation path. Legacy style/emoji values are retained for compatibility and no longer override the imported personality. Dubbing comments also use Luna and personality, based only on their available text metadata, with no invented audio analysis.

## Validation

Local SQLite and mocked-provider tests cover all 335 mappings, unique axes, genre coverage, weighted selection, blocked/capped actors, deterministic queue counts, republish deduplication, evidence reuse, cover restrictions, no examples/templates, failed-provider retries, distinct actors, and emergency-stop protection during generation. Full repository release checks are required before deployment. No paid generation request or test comment is sent to a production work during verification.
