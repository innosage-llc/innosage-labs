package co.innosage.recorderdraft

import android.content.Context
import android.net.Uri
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import android.util.AtomicFile
import android.view.ViewGroup.LayoutParams
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileNotFoundException
import java.io.InputStreamReader

internal fun File.isMissing(): Boolean {
  return try {
    Os.lstat(path)
    false
  } catch (error: ErrnoException) {
    if (error.errno != OsConstants.ENOENT) throw error
    true
  }
}

private const val ORIGIN = "https://appassets.androidplatform.net"
private const val BASE_PATH = "/assets/recorder-draft/"
private const val START = "$ORIGIN${BASE_PATH}index.html"
private const val MAX_MESSAGE = 4_000_000

class RecorderDraftEditorView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onDocumentEvent by EventDispatcher()
  private val onDocumentError by EventDispatcher()
  private val web = WebView(context)
  private var started = false
  private var destroyed = false

  private fun deny() = WebResourceResponse(
    "text/plain", "UTF-8", 403, "Forbidden", emptyMap(),
    ByteArrayInputStream(ByteArray(0))
  )

  private fun isLocal(uri: Uri): Boolean {
    val path = uri.encodedPath ?: return false
    if (uri.scheme != "https" || uri.host != "appassets.androidplatform.net" ||
      uri.port != -1 || uri.encodedUserInfo != null || uri.encodedQuery != null ||
      !path.startsWith(BASE_PATH)) return false
    return path.removePrefix(BASE_PATH).split('/').all {
      it.isNotEmpty() && it != "." && it != ".." && it.matches(Regex("[A-Za-z0-9._-]+"))
    }
  }

  init {
    addView(web, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    web.settings.apply {
      javaScriptEnabled = true
      allowFileAccess = false
      allowContentAccess = false
      domStorageEnabled = false
      cacheMode = WebSettings.LOAD_NO_CACHE
      mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
      javaScriptCanOpenWindowsAutomatically = false
      setSupportMultipleWindows(false)
    }
    val assetLoader = WebViewAssetLoader.Builder()
      .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
      .build()
    web.webViewClient = object : WebViewClient() {
      override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
        !request.isForMainFrame || request.url.toString() != START

      override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse =
        if (request.method == "GET" && isLocal(request.url)) {
          assetLoader.shouldInterceptRequest(request.url) ?: deny()
        } else deny()

      override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
        if (request.isForMainFrame && !destroyed) onDocumentError(mapOf("code" to "local-load"))
      }
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (started || destroyed) return
    started = true
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
      post { if (!destroyed) onDocumentError(mapOf("code" to "unsupported-webview")) }
      return
    }
    WebViewCompat.addWebMessageListener(web, "RecorderDraftHost", setOf(ORIGIN)) { _, message, origin, mainFrame, _ ->
      val data = if (message.type == WebMessageCompat.TYPE_STRING) message.data else null
      if (!destroyed && mainFrame && origin.toString() == ORIGIN && data != null && data.length <= MAX_MESSAGE) {
        onDocumentEvent(mapOf("message" to data))
      }
    }
    web.loadUrl(START)
  }

  fun deliver(message: String?) {
    if (!destroyed && started && message != null && message.length <= MAX_MESSAGE && web.url == START) {
      web.evaluateJavascript("window.receiveRecorderDraftMessage?.(" + JSONObject.quote(message) + ");", null)
    }
  }

  fun close() {
    if (destroyed) return
    destroyed = true
    if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
      WebViewCompat.removeWebMessageListener(web, "RecorderDraftHost")
    }
    web.stopLoading()
    removeView(web)
    web.destroy()
  }
}

class RecorderDraftEditorModule : Module() {
  private val diskLock = Any()
  private fun document(pageId: String): AtomicFile {
    require(pageId.matches(Regex("recorder-[a-f0-9]{64}")))
    val directory = File(requireNotNull(appContext.reactContext).filesDir, "recorder-draft")
    return AtomicFile(File(directory, "$pageId.json"))
  }

  override fun definition() = ModuleDefinition {
    Name("RecorderDraftEditor")
    Function("isBundled") {
      try {
        val manager = requireNotNull(appContext.reactContext).assets
        manager.open("recorder-draft/release.json").use {
          val manifest = JSONObject(it.reader().readText())
          manifest.optString("contract") == "draft-recorder-local-v1" &&
            manifest.optString("source_revision").matches(Regex("[a-f0-9]{40}"))
        }
      } catch (_: Exception) {
        false
      }
    }
    AsyncFunction("readDocument") { pageId: String ->
      synchronized(diskLock) {
        val file = document(pageId)
        try {
          file.openRead().use { stream ->
            require(stream.channel.size() <= MAX_MESSAGE.toLong() * 4)
            InputStreamReader(stream, Charsets.UTF_8.newDecoder()).readText()
          }
        } catch (error: FileNotFoundException) {
          // FileInputStream also throws FileNotFoundException for permission errors.
          // A failed AtomicFile recovery must never expose an older legacy export.
          if (!listOf(file.baseFile, File(file.baseFile.path + ".bak"), File(file.baseFile.path + ".new")).all { it.isMissing() }) throw error
          null
        }
      }
    }
    AsyncFunction("writeDocument") { pageId: String, contents: String ->
      require(contents.length <= MAX_MESSAGE)
      synchronized(diskLock) {
        val file = document(pageId)
        val output = file.startWrite()
        try {
          output.write(contents.toByteArray(Charsets.UTF_8))
          output.fd.sync()
          file.finishWrite(output)
          // Do not let a failed AtomicFile rename be acknowledged as durable.
          check(file.openRead().use { it.readBytes().toString(Charsets.UTF_8) } == contents)
        } catch (error: Exception) {
          file.failWrite(output)
          throw error
        }
      }
    }
    View(RecorderDraftEditorView::class) {
      Events("onDocumentEvent", "onDocumentError")
      AsyncFunction("sendDocumentMessage") { view: RecorderDraftEditorView, message: String -> view.deliver(message) }
      OnViewDestroys { view: RecorderDraftEditorView -> view.close() }
    }
  }
}
