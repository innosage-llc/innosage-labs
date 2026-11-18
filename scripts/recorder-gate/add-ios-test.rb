# Modify only the ignored, freshly generated candidate Xcode project.
require 'xcodeproj'
require 'fileutils'
project_path, swift_source = ARGV
project = Xcodeproj::Project.open(project_path)
app = project.targets.find { |t| t.name == 'AIRecorder' }
raise 'AIRecorder application target missing' unless app
raise 'startup target already present; use a fresh candidate' if project.targets.any? { |t| t.name == 'StartupGateUITests' }
folder = File.join(File.dirname(project_path), 'StartupGateUITests')
FileUtils.mkdir_p(folder)
FileUtils.cp(swift_source, File.join(folder, 'StartupGateTests.swift'))
target = project.new_target(:ui_test_bundle, 'StartupGateUITests', :ios, '16.4')
target.add_dependency(app)
group = project.main_group.new_group('StartupGateUITests', 'StartupGateUITests')
target.add_file_references([group.new_file('StartupGateTests.swift')])
target.build_configurations.each do |config|
  config.build_settings.merge!('TEST_TARGET_NAME' => 'AIRecorder', 'PRODUCT_BUNDLE_IDENTIFIER' => 'co.innosage.labs.startupgate.tests', 'GENERATE_INFOPLIST_FILE' => 'YES', 'SWIFT_VERSION' => '5.0', 'CODE_SIGNING_ALLOWED' => 'NO')
end
project.save
scheme_path = File.join(project_path, 'xcshareddata', 'xcschemes', 'AIRecorder.xcscheme')
scheme = Xcodeproj::XCScheme.new(scheme_path)
scheme.add_test_target(target)
scheme.save_as(project_path, 'AIRecorder', true)
