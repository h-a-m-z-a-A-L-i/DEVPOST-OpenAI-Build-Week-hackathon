import sys
import unittest
from pathlib import Path


RUNTIME_PATH = Path(__file__).parents[1] / "runtime"
sys.path.insert(0, str(RUNTIME_PATH))

from quota_manager import QuotaError, RequestQuota  # noqa: E402


class FakeClock:
    def __init__(self):
        self.now = 0.0
        self.day = "day-1"
        self.sleeps = []

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds

    def utc_day(self):
        return self.day


class QuotaManagerTests(unittest.TestCase):
    def make_quota(self, rpm=28, rpd=2):
        clock = FakeClock()
        quota = RequestQuota(rpm, rpd, clock.monotonic, clock.utc_day, clock.sleep)
        return quota, clock

    def test_paces_requests_and_reports_usage(self):
        quota, clock = self.make_quota()
        quota.acquire()
        quota.acquire()

        self.assertAlmostEqual(clock.sleeps[0], 60 / 28)
        self.assertEqual(quota.snapshot()["dailyRequests"], 2)
        self.assertEqual(quota.snapshot()["dailyRemaining"], 0)

    def test_enforces_daily_limit_and_resets_on_new_day(self):
        quota, clock = self.make_quota(rpd=1)
        quota.acquire()
        with self.assertRaises(QuotaError):
            quota.acquire()

        clock.day = "day-2"
        quota.acquire()
        self.assertEqual(quota.snapshot()["requestDay"], "day-2")

    def test_rejects_invalid_limits(self):
        with self.assertRaises(ValueError):
            RequestQuota(0, 10)
        with self.assertRaises(ValueError):
            RequestQuota(10, 0)


if __name__ == "__main__":
    unittest.main()
