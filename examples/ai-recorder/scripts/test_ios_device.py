"""Pure fixture tests: never invokes Xcode, Keychain, networking, or a device."""
import copy
import datetime as dt
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import Mock, call, patch

import ios_device as driver

from ios_device import (
    DriverError, select_wired_phone, profile_matches, matching_app,
    running_app, device_error,
)

BUNDLE = "co.example.airecorder"
TEAM = "FIXTURE123"
UDID = "00000000-0000000000000001"
NOW = dt.datetime(2030, 1, 1, tzinfo=dt.timezone.utc)
APP_PATH = "/private/var/containers/Bundle/Application/fixture-local/AIRecorder.app"
APP_URL = "file://" + APP_PATH + "/"
APP_EXECUTABLE = APP_PATH + "/AIRecorder"
APP_PID = 123
LAUNCH = {"process": {"executable": "file:///" + APP_EXECUTABLE, "processIdentifier": APP_PID}}


def phone(identifier="fixture-coredevice", transport="wired", kind="iPhone"):
    return {
        "identifier": identifier,
        "connectionProperties": {"transportType": transport, "pairingState": "paired"},
        "hardwareProperties": {"deviceType": kind, "udid": UDID},
        "deviceProperties": {"developerModeStatus": "enabled"},
    }


def profile():
    return {
        "ExpirationDate": NOW + dt.timedelta(days=1),
        "TeamIdentifier": [TEAM],
        "ApplicationIdentifierPrefix": [TEAM],
        "ProvisionedDevices": [UDID],
        "Entitlements": {
            "application-identifier": TEAM + "." + BUNDLE,
            "com.apple.developer.team-identifier": TEAM,
            "get-task-allow": True,
        },
    }


class DeviceSelectionTests(unittest.TestCase):
    def test_selects_only_one_wired_physical_phone(self):
        expected = phone()
        devices = [
            phone("simulator", "sameMachine"),
            phone("wireless", "localNetwork"),
            phone("tablet", "wired", "iPad"),
            expected,
        ]
        self.assertEqual(select_wired_phone(devices), expected)

    def test_no_phone_never_falls_back_to_simulator_or_wireless(self):
        for devices in ([], [phone("sim", "sameMachine")],
                        [phone("wifi", "localNetwork")],
                        [phone("mac", "wired", "Mac")]):
            with self.subTest(devices=devices), self.assertRaises(DriverError):
                select_wired_phone(devices)

    def test_multiple_phones_are_ambiguous(self):
        with self.assertRaises(DriverError):
            select_wired_phone([phone("one"), phone("two")])

    def test_missing_identifiers_fail_closed(self):
        for path in ("identifier", "udid"):
            p = phone()
            if path == "identifier":
                del p[path]
            else:
                del p["hardwareProperties"][path]
            with self.subTest(path=path), self.assertRaises(DriverError):
                select_wired_phone([p])


class ProfileTests(unittest.TestCase):
    def matches(self, p, **kwargs):
        return profile_matches(p, BUNDLE, UDID, as_of=NOW, **kwargs)

    def test_exact_development_profile(self):
        self.assertTrue(self.matches(profile(), team=TEAM))

    def test_team_wildcard(self):
        p = profile()
        p["Entitlements"]["application-identifier"] = TEAM + ".*"
        self.assertTrue(self.matches(p, team=TEAM))

    def test_wrong_app_or_prefix_cannot_match(self):
        for appid in (TEAM + "." + BUNDLE + ".other",
                      "OTHERTEAM." + BUNDLE, TEAM + ".co.other.*", "*"):
            p = profile()
            p["Entitlements"]["application-identifier"] = appid
            with self.subTest(appid=appid):
                self.assertFalse(self.matches(p, team=TEAM))

    def test_team_must_match(self):
        self.assertFalse(self.matches(profile(), team="OTHERTEAM"))

    def test_wrong_or_missing_device(self):
        for devices in ([], ["different-device"]):
            p = profile()
            p["ProvisionedDevices"] = devices
            with self.subTest(devices=devices):
                self.assertFalse(self.matches(p))

    def test_distribution_or_missing_development_entitlement_is_rejected(self):
        for value in (False, None, "true"):
            p = profile()
            if value is None:
                del p["Entitlements"]["get-task-allow"]
            else:
                p["Entitlements"]["get-task-allow"] = value
            with self.subTest(value=value):
                self.assertFalse(self.matches(p))

    def test_expired_and_expiry_boundary_rejected(self):
        for expiry in (NOW, NOW - dt.timedelta(seconds=1)):
            p = profile()
            p["ExpirationDate"] = expiry
            with self.subTest(expiry=expiry):
                self.assertFalse(self.matches(p))

    def test_plist_naive_utc_datetime_supported(self):
        p = profile()
        p["ExpirationDate"] = (NOW + dt.timedelta(days=1)).replace(tzinfo=None)
        self.assertTrue(self.matches(p))

    def test_missing_essential_fields_fail_closed(self):
        for key in ("ExpirationDate", "Entitlements", "TeamIdentifier", "ProvisionedDevices"):
            p = profile()
            del p[key]
            with self.subTest(key=key):
                self.assertFalse(self.matches(p))


class AppEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.app = {"name": "AI Recorder", "bundleIdentifier": BUNDLE,
                    "version": "0.1.9", "bundleVersion": "10"}

    def test_exact_install_readback(self):
        self.assertTrue(matching_app([self.app], BUNDLE, "0.1.9", "10"))

    def test_missing_wrong_or_stale_install_is_not_success(self):
        variants = [
            [], [{**self.app, "bundleIdentifier": BUNDLE + ".other"}],
            [{**self.app, "version": "0.1.8"}],
            [{**self.app, "bundleVersion": "9"}],
            [{"name": "AI Recorder"}],
        ]
        for apps in variants:
            with self.subTest(apps=apps):
                self.assertFalse(matching_app(apps, BUNDLE, "0.1.9", "10"))

    def test_bundle_only_query_is_supported(self):
        self.assertTrue(matching_app([self.app], BUNDLE))

    def test_duplicate_bundle_is_not_a_unique_install(self):
        self.assertIsNone(matching_app([self.app, self.app], BUNDLE))

    def test_running_executable_matches_exact_bundle_file_url(self):
        executable = driver.app_executable({**self.app, "url": APP_URL})
        self.assertEqual(executable, APP_EXECUTABLE)
        self.assertTrue(running_app([LAUNCH["process"]], executable))
        self.assertTrue(running_app([{"executable": executable, "processIdentifier": APP_PID}], executable, APP_PID))

    def test_app_url_must_identify_local_device_bundle(self):
        for v in (None, "https://example.invalid/AIRecorder.app",
                  "file://example.invalid/AIRecorder.app",
                  "file:///unrelated/Other.app", "file:///AIRecorder.app?x=1"):
            with self.subTest(v=v), self.assertRaises(DriverError):
                driver.app_executable({**self.app, "url": v})

    def test_nonmatching_processes_are_not_running_evidence(self):
        for path in ("/fixture/AIRecorder.app/AIRecorderOther",
                     "/fixture/OtherAIRecorder.app/AIRecorder",
                     "/fixture/AIRecorder.app/AIRecorder/debug",
                     "/fixture/AIRecorder.app/Helper",
                     "/other-install/AIRecorder.app/AIRecorder"):
            with self.subTest(path=path):
                self.assertFalse(running_app([{"executable": path, "processIdentifier": APP_PID}], APP_EXECUTABLE))
        self.assertFalse(running_app([], APP_EXECUTABLE))
        self.assertFalse(running_app([{"name": "AIRecorder", "processIdentifier": APP_PID}], APP_EXECUTABLE))
        self.assertFalse(running_app([{"executable": APP_EXECUTABLE, "processIdentifier": True}], APP_EXECUTABLE))

    def test_same_bundle_path_with_different_pid_does_not_confirm_launch(self):
        self.assertFalse(running_app([LAUNCH["process"]], APP_EXECUTABLE, APP_PID + 1))
        self.assertTrue(running_app([LAUNCH["process"]], APP_EXECUTABLE, APP_PID))


class ErrorClassificationTests(unittest.TestCase):
    def test_observed_device_errors(self):
        cases = {
            "The operation failed because the device was still locked.": "device_locked",
            "The device has not been unlocked recently": "device_locked",
            "The operation failed because Developer Mode is turned off.": "developer_mode_disabled",
            "Installing cryptex is disallowed because developer mode is not enabled.": "developer_mode_disabled",
            "Operation not permitted": "coredevice_access",
            "Permission denied": "coredevice_access",
            "Timed out waiting for CoreDeviceService to fully initialize.": "coredevice_unavailable",
            "CoreDeviceService connection invalid": "coredevice_unavailable",
            "An unspecified device operation failed": "device_command_failed",
        }
        for message, expected in cases.items():
            with self.subTest(message=message):
                self.assertEqual(device_error(message), expected)

    def test_nested_root_cause_beats_generic_wrapper(self):
        self.assertEqual(
            device_error("The developer disk image could not be mounted. "
                         "Installing cryptex is disallowed because developer mode is not enabled."),
            "developer_mode_disabled",
        )


class PhoneDetailsTests(unittest.TestCase):
    def setUp(self):
        self.guard = patch.object(driver, "command", side_effect=AssertionError("External command forbidden"))
        self.guard.start()
        self.addCleanup(self.guard.stop)

    def test_missing_lock_fields_fail_closed(self):
        for lock in ({}, {"passcodeRequired": False}, {"unlockedSinceBoot": True}):
            with self.subTest(lock=lock), patch.object(driver, "device", return_value=lock) as call:
                with self.assertRaises(DriverError) as caught:
                    driver.phone_details(phone())
                self.assertEqual(caught.exception.code, "device_lock_unknown")
                self.assertEqual(call.call_count, 1)

    def test_missing_developer_mode_fails_closed(self):
        for info in ({}, {"deviceProperties": {}}, {"deviceProperties": {"developerModeStatus": "unknown"}}):
            with self.subTest(info=info), patch.object(driver, "device", side_effect=[
                {"passcodeRequired": False, "unlockedSinceBoot": True}, info
            ]):
                with self.assertRaises(DriverError) as caught:
                    driver.phone_details(phone())
                self.assertEqual(caught.exception.code, "developer_mode_unknown")

    def test_explicit_enabled_unlocked_is_accepted(self):
        info = {"deviceProperties": {"developerModeStatus": "enabled"}}
        with patch.object(driver, "device", side_effect=[
            {"passcodeRequired": False, "unlockedSinceBoot": True}, info
        ]) as call:
            self.assertEqual(driver.phone_details(phone()), info)
            self.assertEqual(call.call_count, 2)


class RunOrchestrationTests(unittest.TestCase):
    """Mock every host/build/device boundary; exercise only orchestration."""
    def setUp(self):
        stack = ExitStack()
        self.addCleanup(stack.close)
        self.mocks = {}
        # Tripwires prevent an incomplete mock from touching the host or device.
        for name in ("command", "stage"):
            stack.enter_context(patch.object(driver, name, side_effect=AssertionError("External action forbidden")))
        p = profile()
        p["Entitlements"]["application-identifier"] = TEAM + "." + driver.BUNDLE
        defaults = {
            "host_issues": [], "wired_phone": phone(), "phone_details": {},
            "prepare_native": None, "selected_team": TEAM, "identities": {"fixture-key"},
            "build": (TEAM, p, "1.0", "7"), "device": LAUNCH,
            "installed": [{"bundleIdentifier": driver.BUNDLE, "version": "1.0", "bundleVersion": "7", "url": APP_URL}],
            "process_verified": True,
        }
        for name, value in defaults.items():
            self.mocks[name] = stack.enter_context(patch.object(driver, name, return_value=value))
        stack.enter_context(patch.object(driver.time, "sleep"))
        stack.enter_context(patch("builtins.print"))

    def test_build_only_never_discovers_or_touches_phone(self):
        self.assertEqual(driver.run(SimpleNamespace(build_only=True)), 0)
        for name in ("wired_phone", "phone_details", "device", "installed", "process_verified"):
            self.mocks[name].assert_not_called()
        self.mocks["build"].assert_called_once_with()

    def test_same_version_still_installs_before_launch(self):
        self.assertEqual(driver.run(SimpleNamespace(build_only=False)), 0)
        calls = self.mocks["device"].call_args_list
        self.assertEqual([c.args[0][0] for c in calls], [
            ["device", "install", "app"], ["device", "process", "launch"]])
        self.assertTrue(all(c.kwargs == {"mutation": True} for c in calls))
        self.mocks["installed"].assert_called_once()
        self.mocks["process_verified"].assert_called_once_with(phone(), APP_EXECUTABLE, APP_PID)

    def test_unknown_install_container_blocks_launch(self):
        self.mocks["installed"].return_value[0].pop("url")
        with self.assertRaises(DriverError) as caught:
            driver.run(SimpleNamespace(build_only=False))
        self.assertEqual(caught.exception.code, "installed_app_path_unverified")
        self.assertEqual(self.mocks["device"].call_count, 1)
        self.mocks["process_verified"].assert_not_called()

    def test_wrong_launch_response_cannot_claim_running_app(self):
        self.mocks["device"].return_value = {"process": {
            "executable": "/other-install/AIRecorder.app/AIRecorder", "processIdentifier": APP_PID}}
        with self.assertRaises(DriverError) as caught:
            driver.run(SimpleNamespace(build_only=False))
        self.assertEqual(caught.exception.code, "launch_not_verified")
        self.mocks["process_verified"].assert_not_called()

    def test_confirmed_launch_that_exits_fails_readback(self):
        self.mocks["process_verified"].return_value = False
        with self.assertRaises(DriverError) as caught:
            driver.run(SimpleNamespace(build_only=False))
        self.assertEqual(caught.exception.code, "launch_not_verified")
        self.mocks["process_verified"].assert_called_once_with(phone(), APP_EXECUTABLE, APP_PID)

    def test_verify_never_launches_and_is_bound_to_installed_container(self):
        self.assertEqual(driver.verify(), 0)
        self.mocks["process_verified"].assert_called_once_with(phone(), APP_EXECUTABLE)
        self.mocks["device"].assert_not_called()

    def test_wrong_profile_blocks_install(self):
        team, p, version, build_no = self.mocks["build"].return_value
        p["ProvisionedDevices"] = ["different-device"]
        with self.assertRaises(DriverError) as caught:
            driver.run(SimpleNamespace(build_only=False))
        self.assertEqual(caught.exception.code, "device_not_provisioned")
        self.mocks["device"].assert_not_called()
        self.mocks["installed"].assert_not_called()

    def test_changed_device_blocks_install(self):
        self.mocks["wired_phone"].side_effect = [phone(), phone(identifier="replacement")]
        with self.assertRaises(DriverError) as caught:
            driver.run(SimpleNamespace(build_only=False))
        self.assertEqual(caught.exception.code, "device_changed")
        self.mocks["device"].assert_not_called()
        self.mocks["installed"].assert_not_called()



class StageCleanupTests(unittest.TestCase):
    def test_cli_sigterm_releases_active_build_group_and_stops_before_device_mutation(self):
        child = Mock(pid=12345, args=["fixture-build"])

        def wait(timeout=None):
            if timeout is None:
                return 0
            driver.request_termination(driver.signal.SIGTERM, None)
            raise driver.subprocess.TimeoutExpired(child.args, timeout)

        child.wait.side_effect = wait
        with TemporaryDirectory() as d, ExitStack() as stack:
            for name, value in {"check_source": None, "source_revision": "synthetic", "host_issues": [],
                                "wired_phone": phone(), "phone_details": {}, "selected_team": TEAM,
                                "identities": {"fixture-key"}, "prepare_native": None}.items():
                stack.enter_context(patch.object(driver, name, return_value=value))
            stack.enter_context(patch.object(driver.sys, "argv", ["ios_device.py", "run"]))
            stack.enter_context(patch.object(driver, "_termination_requested", False))
            stack.enter_context(patch.object(driver, "command", side_effect=AssertionError("External command forbidden")))
            device = stack.enter_context(patch.object(driver, "device", side_effect=AssertionError("Device forbidden")))
            install = stack.enter_context(patch.object(driver, "installed", side_effect=AssertionError("Device forbidden")))
            stack.enter_context(patch.object(driver.subprocess, "Popen", return_value=child))
            send = stack.enter_context(patch.object(driver.os, "killpg"))
            stack.enter_context(patch.object(driver.time, "sleep"))
            stack.enter_context(patch.object(driver, "build", side_effect=lambda: driver.stage(
                child.args, "build_failed", "synthetic", 30, cwd=Path(d), log_dir=Path(d))))
            stack.enter_context(patch("builtins.print"))
            self.assertEqual(driver.main(), 143)
            self.assertEqual(send.call_args_list, [
                call(child.pid, driver.signal.SIGTERM), call(child.pid, driver.signal.SIGKILL),
            ])
            self.assertEqual(child.wait.call_args, call())
            self.assertEqual(child.wait.call_count, 2)
            device.assert_not_called()
            install.assert_not_called()

    def test_canceled_command_never_spawns_process(self):
        with patch.object(driver, "_termination_requested", True), patch.object(driver.subprocess, "run") as started:
            with self.assertRaises(driver.Terminated):
                driver.command(["synthetic"])
            started.assert_not_called()

    def test_denied_group_signal_does_not_claim_cleanup(self):
        child = Mock(pid=12345)
        with patch.object(driver.os, "killpg", side_effect=PermissionError) as send:
            with self.assertRaises(DriverError) as caught:
                driver.stop_stage(child)
            self.assertEqual(caught.exception.code, "cleanup_unverified")
            send.assert_called_once_with(child.pid, driver.signal.SIGTERM)
            child.wait.assert_not_called()

    def test_signals_the_owned_group_before_reaping_the_leader(self):
        child = Mock(pid=12345)
        with patch.object(driver.os, "killpg") as send, patch.object(driver.time, "sleep"):
            observe = Mock()
            observe.attach_mock(send, "send")
            observe.attach_mock(child.wait, "wait")
            driver.stop_stage(child)
            self.assertEqual(observe.mock_calls, [
                call.send(12345, driver.signal.SIGTERM),
                call.send(12345, driver.signal.SIGKILL),
                call.wait(),
            ])


if __name__ == "__main__":
    unittest.main()
