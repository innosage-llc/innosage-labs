package co.innosage.recorderupload

import java.nio.ByteBuffer
import java.nio.ByteOrder

fun main() {
  fun pcm(first: Int, last: Int) = ByteBuffer.allocate((last - first) * 2)
    .order(ByteOrder.LITTLE_ENDIAN).apply {
      for (i in first until last) putShort(i.toShort())
      flip()
    }
  val window = ExactPcmWindow(16_000, 1, 125, 2_125)
  window.append(0, pcm(0, 20_000))
  window.append(1_250_000, pcm(20_000, 40_000))
  check(window.complete)
  val wav = ByteBuffer.wrap(window.wav()).order(ByteOrder.LITTLE_ENDIAN)
  check(wav.capacity() == 64_044)
  check(wav.getInt(24) == 16_000 && wav.getInt(40) == 64_000)
  check(wav.getShort(44).toInt() == 2_000)
  check(wav.getShort(64_042) == 33_999.toShort())
  val gap = ExactPcmWindow(16_000, 1, 0, 2_000)
  gap.append(0, pcm(0, 1024))
  check(runCatching { gap.append(65_000, pcm(1040, 2048)) }.isFailure)
  check(runCatching { gap.append(63_000, pcm(1008, 2048)) }.isFailure)
  check(runCatching { gap.wav() }.isFailure)
  println("PASS: half-open PCM WAV contents, gaps, overlaps, partial result")
}
