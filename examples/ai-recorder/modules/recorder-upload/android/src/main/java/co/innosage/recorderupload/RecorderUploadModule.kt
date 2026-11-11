package co.innosage.recorderupload

import android.net.Uri
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

class RecorderUploadModule : Module() {
  private val destroyed = AtomicBoolean(false)
  private val connections = ConcurrentHashMap<String, HttpURLConnection>()
  private val cancelled = ConcurrentHashMap.newKeySet<String>()

  override fun definition() = ModuleDefinition {
    Name("RecorderUpload")

    Function("cancel") { id: String ->
      cancelled.add(id)
      connections[id]?.disconnect()
    }
    Function("release") { id: String ->
      cancelled.remove(id)
    }
    OnDestroy {
      destroyed.set(true)
      connections.values.forEach { it.disconnect() }
      connections.clear()
      cancelled.clear()
    }

    AsyncFunction("upload") Coroutine { id: String, address: String, uri: String,
                                        capability: String, hash: String, expectedBytes: Double ->
      withContext(Dispatchers.IO) {
        val url = URL(address)
        require(url.protocol == "https" && url.userInfo == null && url.query == null && url.ref == null)
        require(Regex("^/v1/sessions/tx_[A-Za-z0-9_-]+/upload$").matches(url.path))
        require(Regex("^[A-Za-z0-9_-]{16,4096}$").matches(capability))
        require(Regex("^[a-f0-9]{64}$").matches(hash))
        val parsed = Uri.parse(uri)
        require(parsed.scheme == "file")
        val source = File(requireNotNull(parsed.path)).canonicalFile
        val root = requireNotNull(appContext.reactContext).filesDir.canonicalFile
        require(source.path.startsWith(root.path + File.separator) && source.isFile)
        require(source.length() > 0 && source.length() <= 512L * 1024 * 1024)
        require(source.length().toDouble() == expectedBytes)
        val connection = url.openConnection() as HttpURLConnection
        connections[id] = connection
        try {
          check(!destroyed.get() && !cancelled.contains(id)) { "Upload cancelled" }
          connection.instanceFollowRedirects = false
          connection.requestMethod = "POST"
          connection.connectTimeout = 30_000
          connection.readTimeout = 30 * 60_000
          connection.doOutput = true
          connection.setFixedLengthStreamingMode(source.length())
          connection.setRequestProperty("Content-Type", "audio/mp4")
          connection.setRequestProperty("Authorization", "Bearer $capability")
          connection.setRequestProperty("X-Content-SHA256", hash)
          source.inputStream().use { input ->
            connection.outputStream.use { output ->
              val buffer = ByteArray(64 * 1024)
              while (true) {
                check(!destroyed.get() && !cancelled.contains(id)) { "Upload cancelled" }
                val count = input.read(buffer)
                if (count < 0) break
                output.write(buffer, 0, count)
              }
            }
          }
          connection.responseCode
        } finally {
          connections.remove(id)
          connection.disconnect()
          cancelled.remove(id)
        }
      }
    }
  }
}
