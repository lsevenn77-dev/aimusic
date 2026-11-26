package kr.co.aifect.app

import android.app.Application
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.net.URI
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

class OfficialNoticeConversationTest {
    @get:Rule val ui = createComposeRule()

    @Test fun readsEditsAndWithdrawalsInOneReadOnlyChannel() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        assertTrue(context.packageName.endsWith(".test"))
        val server = ServerSocket(0, 10, InetAddress.getByName("127.0.0.1"))
        Endpoint.configureTest("http://127.0.0.1:" + server.localPort)
        val workers = Executors.newCachedThreadPool()
        val revision = AtomicInteger()
        val read = AtomicBoolean()
        val now = System.currentTimeMillis() / 1000
        val mark = "campaign:fixture-notice"
        val picture = "4a6b230b-99cd-4a7a-a012-016a8a223361"
        val image = Bitmap.createBitmap(400, 120, Bitmap.Config.ARGB_8888)
        image.eraseColor(Color.rgb(88, 178, 168))
        val png = ByteArrayOutputStream().also { image.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()
        image.recycle()
        val old = payload("id" to "campaign:fixture-welcome", "created" to now - 120, "read_at" to now - 60,
            "guide" to payload("greeting" to "기존 환영 공지", "intro" to JSONArray(listOf("기존 안내를 보존합니다."))))
        fun item(): JSONObject {
            val edited = revision.get() > 0
            val rich = payload("format" to 1, "title" to if (edited) "수정된 공식 공지" else "새 공식 공지", "blocks" to JSONArray(listOf(
                payload("type" to "p", "runs" to JSONArray(listOf(payload("text" to "네이티브 수신 검증", "bold" to true),
                    payload("text" to " 플레이", "href" to "#play")))),
                payload("type" to "hr"), payload("type" to "image", "asset" to picture, "width" to 70, "align" to "center", "alt" to "공지 이미지")
            )))
            return payload("id" to mark, "created" to now, "read_at" to if (read.get()) now else 0,
                "edited_at" to if (edited) now else 0, "version" to (revision.get() + 1), "rich" to rich)
        }
        workers.execute {
            while (!server.isClosed) {
                val socket = runCatching { server.accept() }.getOrNull() ?: break
                workers.execute {
                    runCatching {
                        socket.use { client ->
                            val input = client.getInputStream().buffered()
                            fun line(): String {
                                val bytes = ByteArrayOutputStream()
                                while (true) {
                                    val value = input.read()
                                    if (value < 0 || value == 10) break
                                    if (value != 13) bytes.write(value)
                                }
                                return bytes.toString("US-ASCII")
                            }
                            val parts = line().split(' ')
                            if (parts.size < 2) return@use
                            val path = URI(parts[1]).path
                            var length = 0
                            while (true) {
                                val next = line()
                                if (next.isEmpty()) break
                                if (next.startsWith("Content-Length:", true)) length = next.substringAfter(':').trim().toInt()
                            }
                            val body = ByteArray(length)
                            var offset = 0
                            while (offset < length) {
                                val amount = input.read(body, offset, length - offset)
                                if (amount < 0) break
                                offset += amount
                            }
                            val output = client.getOutputStream()
                            if (path == "/api/chat/events") {
                                output.write("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n".toByteArray())
                                var sent = -1
                                while (!server.isClosed) {
                                    val current = revision.get()
                                    val event = if (current == sent) "heartbeat" else "change"
                                    output.write("event: $event\ndata: {}\n\n".toByteArray())
                                    output.flush()
                                    sent = current
                                    Thread.sleep(120)
                                }
                                return@use
                            }
                            val endpoint = "/api/notices/official"
                            val binary = path == "$endpoint/fixture-notice/images/$picture"
                            val response = when {
                                binary -> png
                                path == endpoint && parts[0] == "PATCH" -> {
                                    val ids = JSONObject(body.toString(Charsets.UTF_8)).getJSONArray("ids")
                                    if ((0 until ids.length()).any { ids.optString(it) == mark }) read.set(true)
                                    "{}".toByteArray()
                                }
                                path == endpoint -> payload("items" to JSONArray(if (revision.get() == 2) listOf(old) else listOf(old, item())))
                                    .toString().toByteArray(Charsets.UTF_8)
                                else -> "{}".toByteArray()
                            }
                            val type = if (binary) "image/png" else "application/json"
                            val headers = "HTTP/1.1 200 OK\r\nContent-Type: $type\r\nContent-Length: " + response.size + "\r\nConnection: close\r\n\r\n"
                            output.write(headers.toByteArray())
                            output.write(response)
                            output.flush()
                        }
                    }
                }
            }
        }
        val models = ViewModelStore()
        lateinit var model: MusicModel
        try {
            instrumentation.runOnMainSync {
                model = ViewModelProvider(models, ViewModelProvider.AndroidViewModelFactory.getInstance(context.applicationContext as Application))[MusicModel::class.java]
                model.user = payload("id" to "fixture-account", "name" to "격리 테스트 계정")
                model.messagePeer = OfficialNoticePeer
            }
            ui.setContent { MaterialTheme { MessagesSheet(model, embedded = true) } }
            ui.waitUntil(15000) { ui.onAllNodesWithText("새 공식 공지").fetchSemanticsNodes().isNotEmpty() }
            ui.onNodeWithTag("dm-input").assertDoesNotExist()
            ui.onNodeWithText("아이팩트 공식 안내 채널입니다.").assertIsDisplayed()
            ui.waitUntil(10000) { read.get() }
            revision.set(1)
            ui.waitUntil(10000) { ui.onAllNodesWithText("수정된 공식 공지").fetchSemanticsNodes().isNotEmpty() }
            ui.onNodeWithText("수정됨").assertIsDisplayed()
            val bitmap = instrumentation.uiAutomation.takeScreenshot()
            if (bitmap != null) {
                val folder = context.getExternalFilesDir(null) ?: context.filesDir
                File(folder, "official-notice-qa.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
                bitmap.recycle()
            }
            revision.set(2)
            ui.waitUntil(10000) { ui.onAllNodesWithText("수정된 공식 공지").fetchSemanticsNodes().isEmpty() }
            ui.onNodeWithText("기존 환영 공지").assertIsDisplayed()
        } finally {
            ui.runOnIdle { model.user = null }
            instrumentation.runOnMainSync { models.clear() }
            context.stopService(Intent(context, PlaybackService::class.java))
            server.close()
            workers.shutdownNow()
        }
    }
}
