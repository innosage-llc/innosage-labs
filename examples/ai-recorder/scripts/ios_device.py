#!/usr/bin/env python3
"""Local-only AI Recorder development builds, using existing Apple signing."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import signal
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
NATIVE = ROOT / "ios"
WORKSPACE = NATIVE / "AIRecorder.xcworkspace"
CACHE = NATIVE / ".ai-recorder-device"
APP = CACHE / "DerivedData/Build/Products/Release-iphoneos/AIRecorder.app"
BUNDLE = "co.innosage.labs.airecorder"


class DriverError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def select_wired_phone(devices):
    wired = [d for d in devices
             if d.get("hardwareProperties", {}).get("deviceType") == "iPhone"
             and d.get("connectionProperties", {}).get("transportType") == "wired"]
    if len(wired) != 1:
        raise DriverError("wired_phone_count", f"Connect exactly one USB iPhone (found {len(wired)}).")
    phone = wired[0]
    if not phone.get("identifier") or not phone["hardwareProperties"].get("udid"):
        raise DriverError("wired_phone_incomplete", "The USB iPhone is not ready. Unlock it and confirm trust if prompted.")
    return phone


def profile_matches(profile, bundle_id, udid, team=None, as_of=None):
    expires = profile.get("ExpirationDate")
    now = as_of or datetime.now(timezone.utc)
    if not isinstance(expires, datetime):
        return False
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    if expires <= now or not isinstance(udid, str) or not udid:
        return False
    ent = profile.get("Entitlements", {})
    pteam = ent.get("com.apple.developer.team-identifier")
    app_id = ent.get("application-identifier")
    prefixes = profile.get("ApplicationIdentifierPrefix") or [pteam]
    return (ent.get("get-task-allow") is True and bool(pteam)
            and pteam in profile.get("TeamIdentifier", [])
            and (team is None or pteam == team)
            and any(app_id in (f"{p}.{bundle_id}", f"{p}.*") for p in prefixes if p)
            and udid.lower() in {d.lower() for d in profile.get("ProvisionedDevices", [])})


def app_matches(apps, bundle_id, version=None, build=None):
    return any(a.get("bundleIdentifier") == bundle_id
               and (version is None or a.get("version") == version)
               and (build is None or a.get("bundleVersion") == build)
               for a in apps)


def running_app(processes, executable="AIRecorder"):
    suffix = f"/{executable}.app/{executable}"
    return any(str(p.get("executable", p.get("executablePath", ""))).endswith(suffix)
               for p in processes)


def device_error(output):
    low = output.lower()
    if "developer mode" in low and any(x in low for x in ("turned off", "not enabled", "disabled")):
        return "developer_mode_disabled"
    if any(x in low for x in ("still locked", "not been unlocked", "device is locked")):
        return "device_locked"
    if any(x in low for x in ("operation not permitted", "permission denied", "sandbox", "not authorized")):
        return "coredevice_access"
    if any(x in low for x in ("coredeviceservice", "command timeout", "connection invalid")):
        return "coredevice_unavailable"
    return "device_command_failed"


PHONE_GUIDANCE = {
    "device_locked": "Unlock the test iPhone and leave it connected.",
    "developer_mode_disabled": "Enable Developer Mode on the test iPhone, restart, confirm it on-device, and unlock.",
    "coredevice_access": "This process cannot access local CoreDevice. Use an authorized local Mac session.",
    "coredevice_unavailable": "CoreDevice did not respond. Try an authorized local Mac session; check USB pairing in Xcode if it still fails.",
}


def command(args, timeout=30, env=None):
    try:
        return subprocess.run(args, cwd=ROOT, env=env, capture_output=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        return subprocess.CompletedProcess(args, 124, b"", b"command timeout or executable unavailable")


def output(result):
    return (result.stdout + result.stderr).decode("utf-8", errors="replace")


def device(args, mutation=False):
    with tempfile.TemporaryDirectory(prefix="ai-recorder-device-") as temp:
        result_path = Path(temp) / "result.json"
        # Keep all options before install/launch positional arguments.
        action, options = args
        result = command(["xcrun", "devicectl", *action, "--timeout", "45" if mutation else "12",
                          "--json-output", str(result_path), *options], 50 if mutation else 16)
        info = {}
        try:
            info = json.loads(result_path.read_text())
        except (OSError, ValueError):
            pass
        if result.returncode or not isinstance(info.get("result"), dict):
            code = device_error(output(result) + " " + json.dumps(info.get("error", {})))
            raise DriverError(code, PHONE_GUIDANCE.get(code, "CoreDevice did not complete the requested operation. Check the device in Xcode."))
        return info["result"]


def wired_phone():
    devices = device((["list", "devices"], []))
    if not isinstance(devices.get("devices"), list):
        raise DriverError("coredevice_unavailable", PHONE_GUIDANCE["coredevice_unavailable"])
    return select_wired_phone(devices["devices"])


def target_options(phone):
    return ["--device", phone["identifier"]]


def phone_details(phone):
    target = target_options(phone)
    lock = device((["device", "info", "lockState"], target))
    if lock.get("passcodeRequired") is True or lock.get("unlockedSinceBoot") is False:
        raise DriverError("device_locked", PHONE_GUIDANCE["device_locked"])
    if lock.get("passcodeRequired") is not False or lock.get("unlockedSinceBoot") is not True:
        raise DriverError("device_lock_unknown", "CoreDevice could not verify that this iPhone is unlocked.")
    info = device((["device", "info", "details"], target))
    mode = str(info.get("deviceProperties", {}).get("developerModeStatus", "")).lower()
    if "disabled" in mode or mode == "off":
        raise DriverError("developer_mode_disabled", PHONE_GUIDANCE["developer_mode_disabled"])
    if mode != "enabled":
        raise DriverError("developer_mode_unknown", "CoreDevice could not verify Developer Mode on this iPhone.")
    return info


def local_profiles():
    for root in (Path.home() / "Library/Developer/Xcode/UserData/Provisioning Profiles",
                 Path.home() / "Library/MobileDevice/Provisioning Profiles"):
        for path in sorted(root.glob("*.mobileprovision")):
            result = command(["security", "cms", "-D", "-i", str(path)])
            if result.returncode == 0:
                try:
                    profile = plistlib.loads(result.stdout)
                except (ValueError, plistlib.InvalidFileException):
                    continue
                if isinstance(profile, dict):
                    yield profile


def identities():
    result = command(["security", "find-identity", "-v", "-p", "codesigning"])
    return {line.group(1).lower() for line in re.finditer(
        r'^\s*\d+\) ([0-9A-F]{40}) "(?:Apple Development|iPhone Developer):',
        output(result), re.M)}


def development_profile_available(udid, keys, team=None):
    return any(profile_matches(p, BUNDLE, udid, team)
               and any(hashlib.sha1(c).hexdigest() in keys for c in p.get("DeveloperCertificates", []))
               for p in local_profiles())


def source_revision():
    head = command(["git", "rev-parse", "--verify", "HEAD"])
    value = head.stdout.decode(errors="replace").strip()
    if head.returncode or not re.fullmatch(r"[0-9a-f]{40,64}", value):
        return "source revision unavailable"
    changed = command(["git", "status", "--porcelain", "--", "."])
    return value[:12] + (" (working-tree changes)" if changed.stdout else "")


def check_source():
    try:
        config = json.loads((ROOT / "app.json").read_text())["expo"]
        valid = "ios" in config["platforms"] and config["ios"]["bundleIdentifier"] == BUNDLE
    except (OSError, ValueError, KeyError, TypeError):
        valid = False
    if not valid:
        raise DriverError("not_ios_checkout", "Use an AI Recorder revision that enables the local iOS bundle.")


def host_issues():
    issues = []
    if sys.platform != "darwin":
        return [DriverError("not_macos", "Build on a Mac with full Xcode and a USB-connected iPhone.")]
    xcode = command(["xcodebuild", "-version"])
    sdk = command(["xcrun", "--sdk", "iphoneos", "--show-sdk-path"])
    if xcode.returncode or sdk.returncode:
        issues.append(DriverError("missing_iphoneos_sdk", "Select full Xcode with an iPhoneOS SDK (DEVELOPER_DIR may be set explicitly)."))
    elif command(["xcodebuild", "-checkFirstLaunchStatus"]).returncode:
        issues.append(DriverError("xcode_setup", "Open Xcode and complete its required first-launch steps yourself."))
    if command(["pod", "--version"]).returncode:
        issues.append(DriverError("missing_pods", "Install CocoaPods through the normal local iOS tooling setup."))
    if command(["node", "--version"]).returncode or command(["npm", "--version"]).returncode:
        issues.append(DriverError("missing_node", "Use Node 24 with npm (Node 24 also runs the transcript tests)."))
    elif not command(["node", "--version"]).stdout.startswith(b"v24."):
        print("Note: Node 24 is recommended for the transcript regression suite.")
    return issues


def selected_team():
    result = command(["xcodebuild", "-workspace", str(WORKSPACE), "-scheme", "AIRecorder",
                      "-configuration", "Release", "-destination", "generic/platform=iOS",
                      "-showBuildSettings", "-json"], 40)
    if result.returncode:
        return None
    try:
        settings = next(x["buildSettings"] for x in json.loads(result.stdout) if x.get("target") == "AIRecorder")
    except (ValueError, KeyError, TypeError, StopIteration):
        return None
    return settings.get("DEVELOPMENT_TEAM") or None


def doctor(host_only):
    issues = host_issues()
    if host_only:
        return show_doctor(issues)
    if not (ROOT / "node_modules/.bin/expo").is_file():
        issues.append(DriverError("missing_node_modules", "Run npm ci from examples/ai-recorder before building."))
    if sys.platform != "darwin" or any(i.code == "missing_iphoneos_sdk" for i in issues):
        return show_doctor(issues)
    phone = None
    try:
        phone = wired_phone()
        phone_details(phone)
        print("USB: one physical iPhone connected and reachable.")
    except DriverError as err:
        issues.append(err)
    if not WORKSPACE.is_dir() or not (NATIVE / "Pods/Manifest.lock").is_file():
        print("Native workspace/Pods not ready. The first run prepares missing generated files.")
    team = selected_team() if WORKSPACE.is_dir() else None
    keys = identities()
    if not team or not keys:
        issues.append(DriverError("local_signing_setup", "In Xcode, sign in to Apple Accounts, choose the intended team for AIRecorder, and set up an existing Apple Development identity/profile. The runner will not register a device or create credentials."))
    elif phone and not development_profile_available(phone["hardwareProperties"]["udid"], keys, team):
        issues.append(DriverError("local_provisioning_setup", "Xcode needs a valid local development profile for this bundle, signing identity and USB iPhone. Approve any Apple device registration or Keychain prompts yourself."))
    return show_doctor(issues)


def show_doctor(issues):
    if not issues:
        print("Doctor passed. No build, install or launch was attempted.")
    else:
        print("Resolve these setup checks before running:")
        for issue in issues:
            print(f"  [{issue.code}] {issue}")
    return 2 if issues else 0


def stage(args, failure_code, hint, timeout, env=None, *, cwd=NATIVE, log_dir=CACHE):
    # Raw Xcode / CocoaPods output can contain account, signing or local-path details.
    log_dir.mkdir(mode=0o700, exist_ok=True)
    log = log_dir / f"{failure_code}.log"
    with os.fdopen(os.open(log, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "wb") as out:
        os.fchmod(out.fileno(), 0o600)
        try:
            child = subprocess.Popen(args, cwd=cwd, env=env, stdout=out,
                                     stderr=subprocess.STDOUT, start_new_session=True)
        except OSError:
            raise DriverError(failure_code, hint)
        try:
            rc = child.wait(timeout=timeout)
        except (subprocess.TimeoutExpired, KeyboardInterrupt) as err:
            stop_stage(child)
            if isinstance(err, KeyboardInterrupt):
                raise
            raise DriverError(failure_code, hint + " The command timed out; check for an owner approval prompt.")
    if rc:
        raise DriverError(failure_code, hint)


def stop_stage(child):
    # The process is the leader of the group created by stage(). Do not
    # terminate unrelated processes or Xcode sessions.
    try:
        os.killpg(child.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    # Give the entire group a short grace period. Signal again before
    # reaping the leader: its exit does not imply descendants have exited.
    time.sleep(0.5)
    try:
        os.killpg(child.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    child.wait()


def prepare_native():
    if not (ROOT / "node_modules/.bin/expo").is_file():
        raise DriverError("missing_node_modules", "Run npm ci from examples/ai-recorder before building.")
    project = NATIVE / "AIRecorder.xcodeproj/project.pbxproj"
    if not project.is_file():
        if NATIVE.exists():
            raise DriverError("partial_native_project", "The existing iOS directory is incomplete. Keep any local changes and repair it manually.")
        hint = "iOS generation did not finish. Run npm run ios:prebuild and inspect its local output."
        # Keep logs outside ios/ until Expo creates the project itself.
        with tempfile.TemporaryDirectory(prefix="ai-recorder-prebuild-") as logs:
            stage(["npm", "run", "ios:prebuild"], "prebuild_failed", hint, 120,
                  {**os.environ, "CI": "1", "EXPO_OFFLINE": "1"}, cwd=ROOT, log_dir=Path(logs))
        if not project.is_file():
            raise DriverError("prebuild_failed", hint)
    lock = NATIVE / "Podfile.lock"
    manifest = NATIVE / "Pods/Manifest.lock"
    if (not WORKSPACE.is_dir() or not (NATIVE / "Pods/Pods.xcodeproj").is_dir()
            or not lock.is_file() or not manifest.is_file() or lock.read_bytes() != manifest.read_bytes()):
        print("Preparing missing native dependencies with CocoaPods…", flush=True)
        stage(["pod", "install", "--no-repo-update"], "pods_failed",
              "CocoaPods did not finish. See ios/.ai-recorder-device/pods_failed.log locally; official dependency endpoints may require normal network approval.",
              600, {**os.environ, "COCOAPODS_DISABLE_STATS": "true"})


def build():
    print("Building a signed local Release app with embedded JavaScript…", flush=True)
    stage(["xcodebuild", "-workspace", str(WORKSPACE), "-scheme", "AIRecorder",
           "-configuration", "Release", "-destination", "generic/platform=iOS",
           "-derivedDataPath", str(CACHE / "DerivedData"), "build"],
          "build_failed", "Xcode did not complete the signed build. See ios/.ai-recorder-device/build_failed.log locally. Check local signing and any protected Keychain prompt; do not publish the log.",
          900, {**os.environ, "CI": "1", "EXPO_OFFLINE": "1"})
    signature = command(["codesign", "--verify", "--deep", "--strict", str(APP)])
    description = command(["codesign", "-dv", "--verbose=4", str(APP)])
    team = re.search(r"^TeamIdentifier=([A-Z0-9]+)$", output(description), re.M)
    profile = command(["security", "cms", "-D", "-i", str(APP / "embedded.mobileprovision")])
    try:
        bundle_info = plistlib.loads((APP / "Info.plist").read_bytes())
        js = APP / "main.jsbundle"
        if (signature.returncode or description.returncode or profile.returncode or not team
                or bundle_info["CFBundleIdentifier"] != BUNDLE or not js.is_file() or js.stat().st_size == 0):
            raise ValueError
        provision = plistlib.loads(profile.stdout)
        if provision.get("Entitlements", {}).get("get-task-allow") is not True:
            raise ValueError
        return team[1], provision, bundle_info["CFBundleShortVersionString"], bundle_info["CFBundleVersion"]
    except (OSError, KeyError, ValueError, plistlib.InvalidFileException):
        raise DriverError("invalid_signed_app", "The artifact lacks a verified signature, matching bundle ID, embedded profile or bundled JavaScript.")


def installed(phone):
    data = device((["device", "info", "apps"], [*target_options(phone), "--bundle-id", BUNDLE]))
    if not isinstance(data.get("apps"), list):
        raise DriverError("installed_apps_unknown", "CoreDevice did not return an installed-app inventory.")
    return data["apps"]


def process_verified(phone):
    result = device((["device", "info", "processes"], [*target_options(phone), "--search", "AIRecorder"]))
    return running_app(result.get("runningProcesses", result.get("processes", [])))


def run(args):
    issues = host_issues()
    if issues:
        show_doctor(issues)
        return 2
    phone = None
    if not args.build_only:
        phone = wired_phone()
        phone_details(phone)
    prepare_native()
    team = selected_team()
    if not team or not identities():
        raise DriverError("local_signing_setup", "Open the generated workspace and select the intended Apple development team in Signing & Capabilities. Set up local development signing first; no registration is automatic.")
    built_team, profile, version, build_no = build()
    if built_team != team:
        raise DriverError("signing_team_changed", "The signed app does not match the development team selected in Xcode.")
    print(f"Signed build verified: {version} ({build_no}).")
    if args.build_only:
        print("Build only: no iPhone installation or launch was attempted.")
        return 0
    current = wired_phone()
    if current["identifier"] != phone["identifier"]:
        raise DriverError("device_changed", "The USB device changed during the build. No installation was attempted.")
    phone_details(current)
    udid = current["hardwareProperties"]["udid"]
    if not profile_matches(profile, BUNDLE, udid, team):
        raise DriverError("device_not_provisioned", "The signed development profile does not cover this iPhone and bundle. Resolve signing in Xcode; the runner will not register a device.")
    target = target_options(current)
    # Installed version/build alone do not prove the identity of an older
    # artifact. Install in place even when those values already match.
    device((["device", "install", "app"], [*target, str(APP)]), mutation=True)
    if not app_matches(installed(current), BUNDLE, version, build_no):
        raise DriverError("install_not_verified", "Installation was not verified on the iPhone; no launch was attempted.")
    print("Verified installed bundle and version on the USB iPhone.")
    device((["device", "process", "launch"], [*target, BUNDLE]), mutation=True)
    time.sleep(3)
    if not process_verified(current):
        raise DriverError("launch_not_verified", "iOS accepted the launch, but the app was not running at the follow-up check.")
    print("AI Recorder is running on the wired iPhone. Recording, playback and providers were not tested.")
    return 0


def verify():
    phone = wired_phone()
    phone_details(phone)
    apps = installed(phone)
    matches = [a for a in apps if a.get("bundleIdentifier") == BUNDLE]
    if len(matches) != 1:
        raise DriverError("app_not_installed", "AI Recorder was not found on the wired iPhone.")
    if not process_verified(phone):
        raise DriverError("app_not_running", "AI Recorder is installed but not currently running.")
    app = matches[0]
    version, build_no = str(app.get("version", "")), str(app.get("bundleVersion", ""))
    info = f" {version} ({build_no})" if all(re.fullmatch(r"[0-9.]+", x) for x in (version, build_no)) else ""
    print(f"AI Recorder{info} is installed and running on the wired iPhone (read-only check).")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    doc = sub.add_parser("doctor", help="Run read-only preflight")
    doc.add_argument("--host-only", action="store_true", help="Check developer tools without accessing a device")
    runner = sub.add_parser("run", help="Build, install, launch and verify on one USB iPhone")
    runner.add_argument("--build-only", action="store_true", help="Build locally without touching a phone")
    sub.add_parser("verify", help="Check the installed app and process without launching or installing anything")
    args = parser.parse_args()
    if not os.environ.get("DEVELOPER_DIR") and os.environ.get("XCODE_APP"):
        os.environ["DEVELOPER_DIR"] = str(Path(os.environ["XCODE_APP"]) / "Contents/Developer")
    try:
        check_source()
        print(f"AI Recorder source: {source_revision()}", flush=True)
        if args.action == "doctor":
            return doctor(args.host_only)
        if args.action == "verify":
            return verify()
        return run(args)
    except DriverError as err:
        print(f"[{err.code}] {err}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("[interrupted] Retry the same command when ready; cached build work is reused.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
