package kr.co.aifect.app

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject

internal data class CoverPickState(
    val coverId: String?,
    val hasPick: Boolean,
    val revision: Long,
    val canManage: Boolean,
    val performer: String
) {
    constructor(raw: JSONObject) : this(
        raw.opt("cover_id") as? String,
        raw.optBoolean("has_pick"),
        raw.optLong("revision"),
        raw.optBoolean("can_manage"),
        raw.optJSONObject("cover")?.let { Song(it).credit } ?: "표시할 수 없는 커버"
    )
}

private val CoverPickGradient = Brush.horizontalGradient(
    0f to Color(0xFF8EDDD2), .48f to Color(0xFFAB94F5), 1f to Color(0xFFED8DCB)
)

@Composable
private fun CoverPickBadge() {
    Box(
        Modifier.height(18.dp)
            .border(1.dp, CoverPickGradient, CircleShape)
            .padding(horizontal = 7.dp)
            .semantics { contentDescription = "원곡 제작자가 선택한 커버곡입니다." },
        contentAlignment = Alignment.Center
    ) {
        Text(
            "PICK", color = Color(0xFFF0EDF8), fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
            lineHeight = 11.sp, maxLines = 1, softWrap = false,
            style = TextStyle(platformStyle = PlatformTextStyle(includeFontPadding = false))
        )
    }
}

@Composable
internal fun CoverPickTitle(
    song: Song,
    model: MusicModel,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
    fontSize: TextUnit = TextUnit.Unspecified,
    fontWeight: FontWeight? = null,
    lineHeight: TextUnit = TextUnit.Unspecified,
    maxLines: Int = Int.MAX_VALUE,
    overflow: TextOverflow = TextOverflow.Clip,
    textAlign: TextAlign? = null,
    style: TextStyle = LocalTextStyle.current
) {
    if (model.isCoverPicked(song)) {
        Row(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(song.title, Modifier.weight(1f, fill = false), color, fontSize, fontWeight = fontWeight,
                lineHeight = lineHeight, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = textAlign, style = style)
            CoverPickBadge()
        }
    } else {
        Text(song.title, modifier, color, fontSize, fontWeight = fontWeight, lineHeight = lineHeight,
            maxLines = maxLines, overflow = overflow, textAlign = textAlign, style = style)
    }
}
