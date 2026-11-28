package co.innosage.recorderprobe

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.os.SystemClock
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

class RecorderMediaProbeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RecorderMediaProbe")
    AsyncFunction("decodedSamples") Coroutine { uri: String ->
      withContext(Dispatchers.IO) {
        val source = Uri.parse(uri)
        val cache = requireNotNull(appContext.reactContext).cacheDir.canonicalPath
        val file = source.path?.let { File(it).canonicalFile }
        if (source.scheme != "file" || file == null || !file.path.startsWith(cache + File.separator)) 0
        else try { probe(file) } catch (_: Exception) { 0 }
      }
    }
  }

  private fun probe(file: File): Int {
    val extractor = MediaExtractor()
    try {
      extractor.setDataSource(file.path)
      val track = (0 until extractor.trackCount).firstOrNull {
        extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
      } ?: return 0
      extractor.selectTrack(track)
      val format = extractor.getTrackFormat(track)
      val decoder = MediaCodec.createDecoderByType(requireNotNull(format.getString(MediaFormat.KEY_MIME)))
      try {
        decoder.configure(format, null, null, 0)
        decoder.start()
        val info = MediaCodec.BufferInfo()
        val deadline = SystemClock.elapsedRealtime() + 3000
        var packets = 0
        var draining = false
        while (SystemClock.elapsedRealtime() < deadline) {
          if (!draining) {
            val index = decoder.dequeueInputBuffer(10000)
            if (index >= 0) {
              val input = requireNotNull(decoder.getInputBuffer(index))
              val size = if (packets < 32) extractor.readSampleData(input, 0) else -1
              draining = size < 0
              decoder.queueInputBuffer(index, 0, maxOf(0, size), maxOf(0L, extractor.sampleTime),
                if (draining) MediaCodec.BUFFER_FLAG_END_OF_STREAM else 0)
              if (!draining) { packets++; extractor.advance() }
            }
          }
          val output = decoder.dequeueOutputBuffer(info, 10000)
          if (output >= 0) {
            decoder.releaseOutputBuffer(output, false)
            if (info.size > 0 && (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0) return info.size / 2
            if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) break
          }
        }
      } finally { decoder.release() }
    } finally { extractor.release() }
    return 0
  }
}
