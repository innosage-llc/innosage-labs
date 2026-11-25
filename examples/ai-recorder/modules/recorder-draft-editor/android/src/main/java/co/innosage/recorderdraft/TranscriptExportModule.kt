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

private const val MARKDOWN = "text/markdown"

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

private object CreateTranscript : AppContextActivityResultContract<String, Uri?> {
  override fun createIntent(context: Context, input: String) = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
    addCategory(Intent.CATEGORY_OPENABLE)
    type = MARKDOWN
    putExtra(Intent.EXTRA_TITLE, input)
    putExtra(Intent.EXTRA_LOCAL_ONLY, true)
  }
  override fun parseResult(input: String, resultCode: Int, intent: Intent?): Uri? =
    when (resultCode) {
      Activity.RESULT_CANCELED -> null
      Activity.RESULT_OK -> intent?.data ?: Uri.EMPTY
      else -> Uri.EMPTY
    }
}

class TranscriptExportModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RecorderTranscriptExport")
    lateinit var share: AppContextActivityResultLauncher<String, Unit>
    lateinit var create: AppContextActivityResultLauncher<String, Uri?>
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
      if (save) {
        val uri = create.launch(filename) ?: return@Coroutine "cancelled"
        check(uri.scheme == "content")
        withContext(Dispatchers.IO) {
          requireNotNull(context.contentResolver.openOutputStream(uri, "wt")).use { it.write(markdown.toByteArray(Charsets.UTF_8)) }
        }
        "saved"
      } else {
        val snapshot = withContext(Dispatchers.IO) {
          val root = File(context.cacheDir, "transcript-shares")
          val cutoff = System.currentTimeMillis() - 24L * 60 * 60 * 1000
          root.listFiles()?.filter { it.lastModified() < cutoff }?.forEach { it.deleteRecursively() }
          val directory = File(root, UUID.randomUUID().toString())
          check(directory.mkdirs())
          try {
            File(directory, filename).also { it.writeText(markdown, Charsets.UTF_8) }
          } catch (error: Exception) {
            directory.deleteRecursively()
            throw error
          }
        }
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
