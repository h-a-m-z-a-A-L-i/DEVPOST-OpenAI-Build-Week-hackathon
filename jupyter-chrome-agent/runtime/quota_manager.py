"""Thread-safe request pacing and daily quota accounting."""

from __future__ import annotations

import threading
import time
from typing import Callable


class QuotaError(RuntimeError):
    pass


class RequestQuota:
    def __init__(
        self,
        requests_per_minute: int,
        requests_per_day: int,
        monotonic: Callable[[], float] = time.monotonic,
        utc_day: Callable[[], str] | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if requests_per_minute <= 0 or requests_per_day <= 0:
            raise ValueError("Quota limits must be positive.")
        self.requests_per_minute = requests_per_minute
        self.requests_per_day = requests_per_day
        self.min_interval = 60 / requests_per_minute
        self._monotonic = monotonic
        self._utc_day = utc_day or (lambda: time.strftime("%Y-%m-%d", time.gmtime()))
        self._sleep = sleep
        self._last_request = 0.0
        self._request_day = ""
        self._daily_requests = 0
        self._lock = threading.Lock()

    def acquire(self) -> None:
        with self._lock:
            request_day = self._utc_day()
            if request_day != self._request_day:
                self._request_day = request_day
                self._daily_requests = 0
            if self._daily_requests >= self.requests_per_day:
                raise QuotaError(
                    f"The daily request limit of {self.requests_per_day:,} has been reached."
                )
            wait = self.min_interval - (self._monotonic() - self._last_request)
            if wait > 0:
                self._sleep(wait)
            self._last_request = self._monotonic()
            self._daily_requests += 1

    def snapshot(self) -> dict[str, int | float | str]:
        with self._lock:
            return {
                "requestsPerMinute": self.requests_per_minute,
                "requestsPerDay": self.requests_per_day,
                "dailyRequests": self._daily_requests,
                "dailyRemaining": max(self.requests_per_day - self._daily_requests, 0),
                "requestDay": self._request_day,
                "minimumIntervalSeconds": self.min_interval,
            }
