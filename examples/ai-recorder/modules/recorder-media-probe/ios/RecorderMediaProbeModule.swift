import AVFoundation
import ExpoModulesCore

public class RecorderMediaProbeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RecorderMediaProbe")
    AsyncFunction("decodedSamples") { (uri: String) -> Int in
      guard let url = URL(string: uri), url.isFileURL,
            let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first,
            url.resolvingSymlinksInPath().path.hasPrefix(caches.resolvingSymlinksInPath().path + "/")
      else { return 0 }
      do {
        let file = try AVAudioFile(forReading: url)
        let format = file.processingFormat
        guard format.channelCount > 0, format.channelCount <= 32,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 1024)
        else { return 0 }
        try file.read(into: buffer, frameCount: 1024)
        return Int(buffer.frameLength)
      } catch { return 0 }
    }
  }
}
