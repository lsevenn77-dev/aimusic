package kr.co.aifect.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import java.text.NumberFormat
import java.util.Locale

internal fun currencyDigits(value: Number) = NumberFormat.getNumberInstance(Locale.KOREA).format(value)

@Composable
internal fun CurrencyAmount(value: Number?, code: String, modifier: Modifier = Modifier,
                           iconSize: Dp = 17.dp, fontSize: TextUnit = TextUnit.Unspecified,
                           lineHeight: TextUnit = TextUnit.Unspecified, fontWeight: FontWeight? = null,
                           color: Color = Color.Unspecified, prefix: String = "") {
    val silver = code == "S"
    val amount = value?.let { prefix + currencyDigits(it) } ?: "—"
    val label = if (silver) "실버" else "골드"
    val medal = if (silver) "silver" else "gold"
    Row(modifier.clearAndSetSemantics { contentDescription = "$label $amount" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        AsyncImage(model = "file:///android_asset/currency/$medal-coin.svg",
            contentDescription = null, modifier = Modifier.size(iconSize))
        Text(amount, color = color, fontSize = fontSize, lineHeight = lineHeight, fontWeight = fontWeight)
    }
}
