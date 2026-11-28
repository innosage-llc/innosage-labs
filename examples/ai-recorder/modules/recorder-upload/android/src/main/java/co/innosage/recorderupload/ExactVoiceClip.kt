package co.innosage.recorderupload

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.system.Os
import android.system.OsConstants
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest

/** Read one requested interval from an immutable-by-app-policy finalized local capture. */
internal object ExactVoiceClip {
  private const val AAC = "audio/mp4a-latm"
  private const val MAX_SOURCE = 512L * 1024 * 1024
  private val digestShape = Regex("^[a-f0-9]{64}$")
  private val recordingName = Regex("^Recording-[0-9]+-[a-f0-9-]{36}\\.m4a$")

  fun read(filesDir: File, uri: String, expectedBytes: Long, expectedSha256: String, startMs: Long, endMs: Long,
           cancelled: () -> Boolean): ByteArray {
    require(Build.VERSION.SDK_INT >= 28) // MediaExtractor.sampleSize
    val deadline = SystemClock.elapsedRealtime() + 15_000L
    fun checkpoint() = check(!cancelled() && SystemClock.elapsedRealtime() < deadline)
    require(startMs in 0..14_400_000 && endMs in startMs + 2_000..startMs + 30_000)
    require(expectedBytes in 1..MAX_SOURCE && digestShape.matches(expectedSha256))
    val expectedDigest = ByteArray(32) { index -> expectedSha256.substring(index * 2, index * 2 + 2).toInt(16).toByte() }
    val path = Uri.parse(uri)
    require(path.scheme == "file" && path.authority.isNullOrEmpty() && path.query == null && path.fragment == null)
    val appRoot = File(filesDir, "recordings")
    val root = File(filesDir.canonicalFile, "recordings")
    require(root == root.canonicalFile && OsConstants.S_ISDIR(Os.lstat(root.path).st_mode))
    val requested = File(requireNotNull(path.path))
    // Android can expose its own app directory as /data/user/0 or /data/data.
    // Only the platform-supplied spelling and that exact canonical root qualify.
    require((requested.parentFile == appRoot || requested.parentFile == root) && recordingName.matches(requested.name))
    val source = File(root, requested.name)
    require(requested.canonicalFile == source && source == source.canonicalFile)
    checkpoint()
    val fd = Os.open(source.path, OsConstants.O_RDONLY or OsConstants.O_NOFOLLOW or OsConstants.O_NONBLOCK, 0)
    try {
      val original = Os.fstat(fd)
      require(OsConstants.S_ISREG(original.st_mode) && original.st_nlink == 1L && original.st_size == expectedBytes)
      require(digestMatches(fd, expectedBytes, expectedDigest, ::checkpoint))
      val bytes = decode(fd, expectedBytes, startMs, endMs, ::checkpoint)
      // Verify the same descriptor again before accepting output; coarse file
      // timestamps alone do not detect every same-size in-place modification.
      require(digestMatches(fd, expectedBytes, expectedDigest, ::checkpoint))
      val still = Os.lstat(source.path)
      val status = Os.fstat(fd)
      fun unchanged(info: android.system.StructStat) = info.st_ino == original.st_ino &&
        info.st_dev == original.st_dev && info.st_size == original.st_size &&
        info.st_mtime == original.st_mtime && info.st_ctime == original.st_ctime &&
        info.st_nlink == 1L && OsConstants.S_ISREG(info.st_mode)
      check(unchanged(still) && unchanged(status))
      checkpoint()
      return bytes
    } finally {
      Os.close(fd)
    }
  }

  /** Positional reads share the exact decoder FD without seeking or closing it. */
  private fun digestMatches(fd: java.io.FileDescriptor, length: Long, expected: ByteArray,
                            checkpoint: () -> Unit): Boolean {
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(64 * 1024)
    try {
      var offset = 0L
      while (offset < length) {
        checkpoint()
        val required = minOf(buffer.size.toLong(), length - offset).toInt()
        val read = Os.pread(fd, buffer, 0, required, offset)
        if (read !in 1..required) return false
        digest.update(buffer, 0, read)
        offset += read
      }
      checkpoint()
      if (Os.pread(fd, buffer, 0, 1, length) != 0) return false
      return MessageDigest.isEqual(digest.digest(), expected)
    } finally {
      buffer.fill(0)
    }
  }

  private fun decode(fd: java.io.FileDescriptor, length: Long, startMs: Long, endMs: Long,
                     checkpoint: () -> Unit): ByteArray {
    val extractor = MediaExtractor()
    try {
      extractor.setDataSource(fd, 0, length)
      require(extractor.trackCount == 1)
      val format = extractor.getTrackFormat(0)
      fun integerOrZero(key: String) = if (format.containsKey(key)) format.getInteger(key) else 0
      require(format.getString(MediaFormat.KEY_MIME) == AAC &&
        format.getLong(MediaFormat.KEY_DURATION) >= endMs * 1000 &&
        integerOrZero(MediaFormat.KEY_ENCODER_DELAY) == 0 &&
        integerOrZero(MediaFormat.KEY_ENCODER_PADDING) == 0)
      val rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      val channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      require(rate in setOf(16_000, 22_050, 24_000, 32_000, 44_100, 48_000) && channels in 1..2)
      val clip = ExactPcmWindow(rate, channels, startMs, endMs)
      extractor.selectTrack(0)
      // A bounded lead-in primes AAC using only local media and avoids decoding the meeting.
      extractor.seekTo((startMs * 1000 - 250_000).coerceAtLeast(0), MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
      val first = extractor.sampleTime
      require(first in (startMs * 1000 - 2_000_000).coerceAtLeast(0)..startMs * 1000)
      checkpoint()
      val codec = MediaCodec.createDecoderByType(AAC)
      try {
        format.setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
        codec.configure(format, null, null, 0)
        codec.start()
        val info = MediaCodec.BufferInfo()
        var inputEnded = false
        var fmtChecked = false
        var fed = 0
        while (!clip.complete) {
          checkpoint()
          if (!inputEnded) {
            val inputIndex = codec.dequeueInputBuffer(5_000)
            if (inputIndex >= 0) {
              val pts = extractor.sampleTime
              if (pts < 0 || pts > endMs * 1000 + 500_000) {
                codec.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                inputEnded = true
              } else {
                require(++fed <= 4000 && extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_ENCRYPTED == 0)
                val buffer = requireNotNull(codec.getInputBuffer(inputIndex))
                buffer.clear()
                val expected = extractor.sampleSize
                require(expected in 1..minOf(buffer.remaining(), 64 * 1024).toLong())
                val count = extractor.readSampleData(buffer, 0)
                require(count.toLong() == expected)
                codec.queueInputBuffer(inputIndex, 0, count, pts, 0)
                extractor.advance()
              }
            }
          }
          when (val output = codec.dequeueOutputBuffer(info, 5_000)) {
            MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
              val outputFormat = codec.outputFormat
              require(outputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE) == rate &&
                outputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT) == channels &&
                (!outputFormat.containsKey(MediaFormat.KEY_PCM_ENCODING) ||
                outputFormat.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_16BIT))
              fmtChecked = true
            }
            in 0..Int.MAX_VALUE -> {
              try {
                if (info.size > 0) {
                  require(fmtChecked && info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0)
                  val bytes = requireNotNull(codec.getOutputBuffer(output)).duplicate()
                  require(info.offset >= 0 && info.size <= bytes.limit() - info.offset)
                  bytes.limit(info.offset + info.size)
                  bytes.position(info.offset)
                  clip.append(info.presentationTimeUs, bytes.slice())
                }
                check(clip.complete || info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM == 0)
              } finally { codec.releaseOutputBuffer(output, false) }
            }
          }
        }
        checkpoint()
        return clip.wav()
      } finally { codec.release() }
    } finally { extractor.release() }
  }
}

/** Strict timeline continuity inside the half-open interval; format contains only selected PCM. */
internal class ExactPcmWindow(rate: Int, private val channels: Int, startMs: Long, endMs: Long) {
  private val sampleRate = rate
  private val frameSize = channels * 2
  private val first = (startMs * rate + 999) / 1000
  private val end = (endMs * rate + 999) / 1000
  private var cursor = first
  private val payload = ByteArray(((end - first) * frameSize).toInt())
  val complete get() = cursor == end

  fun append(ptsUs: Long, pcm: ByteBuffer) {
    require(ptsUs in 0..14_431_000_000 && pcm.remaining() % frameSize == 0)
    val frame = (ptsUs * sampleRate + 500_000) / 1_000_000
    val last = frame + pcm.remaining() / frameSize
    if (last <= first) return
    val from = maxOf(frame, first)
    val until = minOf(last, end)
    require(from == cursor && until > from)
    pcm.position(pcm.position() + ((from - frame) * frameSize).toInt())
    pcm.get(payload, ((from - first) * frameSize).toInt(), ((until - from) * frameSize).toInt())
    cursor = until
  }

  fun wav(): ByteArray {
    check(complete)
    return ByteBuffer.allocate(44 + payload.size).order(ByteOrder.LITTLE_ENDIAN).apply {
      put("RIFF".toByteArray(Charsets.US_ASCII)); putInt(36 + payload.size)
      put("WAVEfmt ".toByteArray(Charsets.US_ASCII)); putInt(16); putShort(1)
      putShort(channels.toShort()); putInt(sampleRate); putInt(sampleRate * frameSize)
      putShort(frameSize.toShort()); putShort(16)
      put("data".toByteArray(Charsets.US_ASCII)); putInt(payload.size); put(payload)
    }.array()
  }
}
