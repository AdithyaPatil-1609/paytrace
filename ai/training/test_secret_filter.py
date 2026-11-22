"""The secret filter: an OTP, PIN or password must never reach the model.

    python3 -m unittest ai/training/test_secret_filter.py
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from alerts import has_secret  # noqa: E402

SECRETS = [
    "123456 is your OTP for Autopay setup of Rs 299 with HEADSPACE.",
    "OTP for txn of Rs 649 is 482199. Valid for 5 mins.",
    "Use OTP 554433 to verify your mandate.",
    "Your PIN: 1234 has been reset",
    "Your one-time password for card XX2291 is 90210",
    "4821 is the OTP to approve Netflix autopay. Never share it with anyone.",
    "Your UPI PIN reset OTP is 771204.",
]

NOT_SECRETS = [
    "Approve the UPI Autopay request from JioHotstar using your UPI PIN in your UPI app.",
    "Approve the autopay request from Cult.fit for Rs 1499 monthly using your UPI PIN.",
    "Never share your OTP or PIN with anyone. -Arclight Bank",
    "Rs.139.00 spent on card XX2291 at SPOTIFY on 11-11-2026.",
    "Your A/c XX9912 debited INR 1,500.00 on 04/11/26. Ref 432198765432. Do not share OTP.",
    "Refund of INR 149.00 credited to your a/c **9912 on 13 Nov. Ref no. RFD77812.",
    "Rs.1500.00 debited for OTT pack. Use your UPI PIN only in the app.",
]


class SecretFilter(unittest.TestCase):
    def test_secrets_are_dropped(self):
        for message in SECRETS:
            with self.subTest(message=message):
                self.assertTrue(has_secret(message))

    def test_ordinary_alerts_pass(self):
        for message in NOT_SECRETS:
            with self.subTest(message=message):
                self.assertFalse(has_secret(message))


if __name__ == "__main__":
    unittest.main()
