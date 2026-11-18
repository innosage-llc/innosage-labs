"""Pure fixture tests: never invokes Xcode, Keychain, networking, or a device."""
import copy
import datetime as dt
import unittest
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import Mock, call, patch

import ios_device as driver

from ios_device import (
    DriverError, select_wired_phone, profile_matches, app_matches,
    running_app, device_error,
)

BUNDLE = "co.example.airecorder"
TEAM = "FIXTURE123"
UDID = "00000000-0000000000000001"
NOW = dt.datetime(2030, 1, 1, tzinfo=dt.timezone.utc)


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
        self.assertTrue(app_matches([self.app], BUNDLE, "0.1.9", "10"))

    def test_missing_wrong_or_stale_install_is_not_success(self):
        variants = [
            [], [{**self.app, "bundleIdentifier": BUNDLE + ".other"}],
            [{**self.app, "version": "0.1.8"}],
            [{**self.app, "bundleVersion": "9"}],
            [{"name": "AI Recorder"}],
        ]
        for apps in variants:
            with self.subTest(apps=apps):
                self.assertFalse(app_matches(apps, BUNDLE, "0.1.9", "10"))

    def test_bundle_only_query_is_supported(self):
        self.assertTrue(app_matches([self.app], BUNDLE))

    def test_running_executable_exact_suffix(self):
        p = {"executable": "/private/var/containers/Bundle/Application/fixture/AIRecorder.app/AIRecorder",
             "processIdentifier": 123}
        self.assertTrue(running_app([p]))

    def test_nonmatching_processes_are_not_running_evidence(self):
        for path in ("/fixture/AIRecorder.app/AIRecorderOther",
                     "/fixture/OtherAIRecorder.app/AIRecorder",
                     "/fixture/AIRecorder.app/AIRecorder/debug",
                     "/fixture/AIRecorder.app/Helper"):
            with self.subTest(path=path):
                self.assertFalse(running_app([{"executable": path, "processIdentifier": 123}]))
        self.assertFalse(running_app([]))
        self.assertFalse(running_app([{"name": "AIRecorder", "processIdentifier": 123}]))


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
            "build": (TEAM, p, "1.0", "7"), "device": {},
            "installed": [{"bundleIdentifier": driver.BUNDLE, "version": "1.0", "bundleVersion": "7"}],
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
        self.mocks["process_verified"].assert_called_once()

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
