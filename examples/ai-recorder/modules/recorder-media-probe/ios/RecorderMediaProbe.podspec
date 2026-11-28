Pod::Spec.new do |s|
  s.name = 'RecorderMediaProbe'
  s.version = '1.0.0'
  s.summary = 'Read a bounded local PCM sample from a picker copy.'
  s.author = 'InnoSage'
  s.license = 'MIT'
  s.homepage = 'https://github.com/innosage-llc/innosage-labs'
  s.source = { :git => s.homepage + '.git' }
  s.platform = :ios, '16.4'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
end
