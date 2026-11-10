package kr.co.aifect.app

import androidx.compose.runtime.Composable
import androidx.compose.runtime.produceState
import kotlinx.coroutines.CancellationException

/**
 * Temporary native fallback until catalog endpoints include AI comments.
 * Read only on a composed (visible) row; do not request every catalog item.
 * The comments API already returns both human and active bot comments.
 */
@Composable
internal fun verifiedSongCommentCount(song: Song, model: MusicModel): Int {
 val baseline = song.comments
 val revision = model.api.readRevision
 val count = produceState(initialValue = baseline, key1 = song.id, key2 = baseline, key3 = revision) {
  try {
   val response = model.api.call("/api/tracks/${song.id}/comments")
   val items = response.optJSONArray("comments")
   // The API limits this response to 500 rows. Never truncate a larger count.
   if (items != null && model.api.readRevision == revision)
    value = if (items.length() >= 500) maxOf(baseline, items.length()) else items.length()
  } catch (e: CancellationException) {
   throw e
  } catch (_: Exception) {
   // Keep the catalog's count if the optional verification request fails.
  }
 }
 return count.value
}
