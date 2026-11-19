package co.innosage.recorderupload

import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer

/** Only new, app-owned captures participate; existing Library names/associations stay untouched. */
internal class FinalizedRecordings(private val root: File) {
  private val pending = File(root, "Audio").canonicalFile
  private val library = File(root, "recordings")
  private val name = Regex("^Recording-[0-9]+-[a-f0-9-]{36}\\.m4a$")

  fun recover(): List<String> = (pending.listFiles() ?: emptyArray())
    .filter { it.isFile && name.matches(it.name) && it.canonicalFile.parentFile == pending }
    .filter { isFinalized(it) }
    .map { commit(Uri.fromFile(it).toString()) }

  fun commit(uri: String): String {
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file")
    val source = File(requireNotNull(parsed.path)).canonicalFile
    require(source.parentFile == pending && name.matches(source.name))
    val saved = File(library, source.name)
    // A repeat after the atomic rename returns the same identity, never a new name.
    if (!source.exists() && saved.isFile) return Uri.fromFile(saved).toString()
    check(isFinalized(source)) { "Recording has not finalized as M4A" }
    check(library.isDirectory || library.mkdirs()) { "Recording directory unavailable" }
    check(!saved.exists()) { "Recording identity already exists" }
    check(source.renameTo(saved)) { "Recording registration failed" }
    return Uri.fromFile(saved).toString()
  }

  private fun isFinalized(file: File): Boolean {
    return try {
    // MediaRecorder appends moov and closes sized boxes on Stop. A nonempty
    // file/metadata alone can accept a partial mdat or a truncated final moov.
    var ftyp = false; var moov = false; var mdat = false
    RandomAccessFile(file, "r").use { input ->
      val length = input.length()
      while (input.filePointer < length) {
        val start = input.filePointer
        if (length - start < 8) return false
        var size = input.readInt().toLong() and 0xffffffffL
        val type = input.readInt()
        val header = if (size == 1L) { size = input.readLong(); 16L } else 8L
        // Open-ended boxes are not proof of a completed native Stop.
        if (size < header || size > length - start) return false
        if (type == 0x66747970 && size > header) ftyp = true // ftyp
        if (type == 0x6d6f6f76 && size > header) moov = true // moov
        if (type == 0x6d646174 && size > header) mdat = true // mdat
        input.seek(start + size)
      }
    }
    if (!ftyp || !moov || !mdat) false else {
      val extractor = MediaExtractor()
      try {
        extractor.setDataSource(file.path)
        val track = (0 until extractor.trackCount).firstOrNull {
          val format = extractor.getTrackFormat(it)
          format.getString(MediaFormat.KEY_MIME) == "audio/mp4a-latm" &&
            format.containsKey(MediaFormat.KEY_DURATION) && format.getLong(MediaFormat.KEY_DURATION) > 0
        }
        if (track == null) false else {
          extractor.selectTrack(track)
          extractor.readSampleData(ByteBuffer.allocate(64 * 1024), 0) > 0 && extractor.sampleTime >= 0
        }
      } finally { extractor.release() }
    }
    } catch (_: Exception) { false }
  }
}
