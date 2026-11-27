package co.innosage.recorderdraft

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.Toast
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors

/** Android redelivers the picker result here even if Recorder's JS screen was destroyed. */
class SaveTranscriptActivity : Activity() {
  private lateinit var snapshot: File
  private var writing = false
  private val jobDirectory get() = requireNotNull(snapshot.parentFile)

  override fun onCreate(state: Bundle?) {
    super.onCreate(state)
    setResult(RESULT_FIRST_USER)
    try {
      val job = UUID.fromString(intent.getStringExtra("job")).toString()
      val filename = requireNotNull(intent.getStringExtra("filename"))
      require(File(filename).name == filename && filename.endsWith(".md"))
      snapshot = File(File(File(noBackupFilesDir, "transcript-saves"), job), filename)
      check(snapshot.isFile)
      val progress = ProgressBar(this).apply { contentDescription = "Saving Markdown file" }
      setContentView(FrameLayout(this).apply {
        addView(progress, FrameLayout.LayoutParams(-2, -2, Gravity.CENTER))
      })
      val destination = File(jobDirectory, "destination")
      when {
        destination.isFile -> writeDocument(Uri.parse(destination.readText()))
        state == null -> startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = MARKDOWN
          putExtra(Intent.EXTRA_TITLE, filename)
          putExtra(Intent.EXTRA_LOCAL_ONLY, true)
        }, PICK_DOCUMENT)
        // Android will deliver the pending result to the recreated Activity.
      }
    } catch (_: Exception) {
      complete(RESULT_FIRST_USER)
    }
  }

  @Deprecated("Framework callback for the system document picker")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode != PICK_DOCUMENT) return
    if (resultCode == RESULT_CANCELED) {
      complete(RESULT_CANCELED)
      return
    }
    try {
      val uri = requireNotNull(data?.data)
      check(resultCode == RESULT_OK && uri.scheme == "content")
      // The small local receipt lets a recreated Activity continue a pending copy.
      val pending = File(jobDirectory, "destination.pending")
      pending.writeText(uri.toString())
      check(pending.renameTo(File(jobDirectory, "destination")))
      writeDocument(uri)
    } catch (_: Exception) {
      complete(INCOMPLETE)
    }
  }

  private fun writeDocument(uri: Uri) {
    check(uri.scheme == "content")
    writing = true
    writer.execute {
      val result = when (MarkdownDocumentCopy.write(
        snapshot, File(jobDirectory, "attempted"),
        { requireNotNull(contentResolver.openInputStream(uri)) },
        { requireNotNull(contentResolver.openOutputStream(uri, "wt")) },
      )) {
        MarkdownDocumentCopy.Result.SAVED -> RESULT_OK
        MarkdownDocumentCopy.Result.OCCUPIED -> OCCUPIED
        else -> INCOMPLETE
      }
      runOnUiThread {
        if (!isDestroyed && !isFinishing) complete(result)
      }
    }
  }

  @Deprecated("Keep the write owner alive until the selected file closes")
  override fun onBackPressed() {
    if (!writing) complete(RESULT_CANCELED)
  }

  private fun complete(result: Int) {
    if (::snapshot.isInitialized) jobDirectory.deleteRecursively()
    if (result != RESULT_CANCELED) {
      val message = when (result) {
        RESULT_OK -> "Markdown file saved."
        OCCUPIED -> "That document already contains data. Save again with a new filename."
        INCOMPLETE -> "The destination may contain an incomplete file. Save again with a new filename, then check the last line."
        else -> "Could not finish saving the Markdown file. Retry from Recorder."
      }
      Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }
    setResult(result)
    finish()
  }

  companion object {
    const val OCCUPIED = RESULT_FIRST_USER + 1
    const val INCOMPLETE = RESULT_FIRST_USER + 2
    private const val PICK_DOCUMENT = 1
    private val writer = Executors.newSingleThreadExecutor()
  }
}
