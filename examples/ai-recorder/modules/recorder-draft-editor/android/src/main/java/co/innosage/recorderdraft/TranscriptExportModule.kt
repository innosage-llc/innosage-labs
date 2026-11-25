package co.innosage.recorderdraft

import android.app.Activity
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.InputStreamReader
import java.util.UUID

internal const val MARKDOWN = "text/markdown"

// Some Android versions report application/octet-stream for .md. WebAPK uses the
// resolver as well as ACTION_SEND's type when constructing the multipart File.
class TranscriptProvider : FileProvider() {
  override fun getType(uri: Uri): String = MARKDOWN
}

private object ShareTranscript : AppContextActivityResultContract<String, Unit> {
  override fun createIntent(context: Context, input: String): Intent {
    val attachment = Uri.parse(input)
    val send = Intent(Intent.ACTION_SEND).apply {
      type = MARKDOWN
      putExtra(Intent.EXTRA_STREAM, attachment)
      clipData = ClipData.newUri(context.contentResolver, "Transcript", attachment)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    return Intent.createChooser(send, null)
  }
  override fun parseResult(input: String, resultCode: Int, intent: Intent?) = Unit
}

// This launcher reports the outcome to a surviving JS screen. The private Activity,
// rather than this transient Expo callback, owns the actual picker and write.
private object CreateTranscript : AppContextActivityResultContract<String, Int> {
  override fun createIntent(context: Context, input: String): Intent {
    val snapshot = File(input)
    return Intent(context, SaveTranscriptActivity::class.java)
      .putExtra("job", requireNotNull(snapshot.parentFile).name)
      .putExtra("filename", snapshot.name)
  }

  override fun parseResult(input: String, resultCode: Int, intent: Intent?) = resultCode
}

private fun stageSnapshot(root: File, filename: String, markdown: String): File {
  val cutoff = System.currentTimeMillis() - 24L * 60 * 60 * 1000
  root.listFiles()?.filter { it.lastModified() < cutoff }?.forEach { it.deleteRecursively() }
  val directory = File(root, UUID.randomUUID().toString())
  check(directory.mkdirs())
  try {
    return File(directory, filename).also { snapshot ->
      snapshot.outputStream().use { output ->
        output.write(markdown.toByteArray(Charsets.UTF_8))
        output.fd.sync()
      }
    }
  } catch (error: Exception) {
    directory.deleteRecursively()
    throw error
  }
}

class TranscriptExportModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RecorderTranscriptExport")
    lateinit var share: AppContextActivityResultLauncher<String, Unit>
    lateinit var create: AppContextActivityResultLauncher<String, Int>
    RegisterActivityContracts {
      share = registerForActivityResult(ShareTranscript)
      create = registerForActivityResult(CreateTranscript)
    }
    AsyncFunction("readSidecar") { name: String ->
      require(File(name).name == name && listOf(".m4a.original.txt", ".m4a.revision.txt", ".m4a.speakers.json").any { name.endsWith(it) })
      val file = File(File(appContext.persistentFilesDirectory, "recordings"), name)
      if (file.isMissing()) null else file.inputStream().use { InputStreamReader(it, Charsets.UTF_8.newDecoder()).readText() }
    }
    AsyncFunction("exportMarkdown") Coroutine { filename: String, markdown: String, save: Boolean ->
      require(filename.endsWith(".md") && File(filename).name == filename)
      val context = requireNotNull(appContext.reactContext)
      val snapshot = withContext(Dispatchers.IO) {
        val root = if (save) File(context.noBackupFilesDir, "transcript-saves") else File(context.cacheDir, "transcript-shares")
        stageSnapshot(root, filename, markdown)
      }
      if (save) {
        when (create.launch(snapshot.path)) {
          Activity.RESULT_OK -> "saved"
          Activity.RESULT_CANCELED -> "cancelled"
          else -> throw IllegalStateException("Could not write the selected document.")
        }
      } else {
        val attachment = FileProvider.getUriForFile(context, context.packageName + ".transcripts", snapshot)
        try {
          share.launch(attachment.toString())
        } finally {
          // A receiving process can open its grant after the chooser returns.
          snapshot.parentFile?.setLastModified(System.currentTimeMillis())
        }
        "dismissed"
      }
    }
  }
}
