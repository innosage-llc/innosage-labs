# Labs #104

Refs https://github.com/innosage-llc/innosage-labs/issues/104

The V6 worker added one accessible Share audio action beside Transcript in
each native Library row. The lead-owned service presents a single M4A copy
through the operating system. The device's receiving app controls its copy.

The service reuses a complete cache copy when the same unchanged recording is
shared again. A cancelled chooser therefore does not require space for a second
copy. The service discards incomplete writes and keeps recent complete copies
available for recipients to read after the chooser returns. The expiry is
refreshed at dismissal to cover a chooser left open for an extended time. Sharing leaves the
source recording and transcript associations in place.

The regression suite exercises constrained-space retry, partial-copy recovery,
distinct recording URIs, a full-volume cache marker failure and a missing source. Exact-candidate runtime and
recipient verification are tracked on the draft PR.
