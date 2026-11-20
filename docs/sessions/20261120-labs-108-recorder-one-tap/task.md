# Recorder one-tap transcription

Related to #108. The previous Android flow reached manual pilot setup in a fresh install when the staging Gateway build value was absent. Preserve the selected service for new jobs and keep each saved job on its original service and identity.

The staging release config is checked against the approved Recorder Gateway route. Guest credentials use environment-specific keys. Recovery accepts the old Staging UUID and JSON formats and requires the original credential. Production Free remains unavailable pending verification of the owning service.

Deterministic checks cover release inputs, credential isolation, legacy recovery and Free limits. Android application acceptance, the three startup gates and independent review apply to the integrated candidate.

The product controller provisions Free access only after the upload action. Reads of saved operations require their bound guest or Pro identity and never provision a replacement guest. The native UI is scoped to the Transcript action panel for V6 delivery.

Preliminary independent review identified a retry race, a terminal speaker denial that could become an unknown status, ambiguous Pro authorization recovery, and an unverified legacy Gateway alias. The controller now waits for a confirmed reserved state before a same-operation retry, preserves terminal denials, offers explicit Free selection only after a definitive pre-upload Pro denial, and restores legacy credentials only for the approved Staging origin.

Exact controller review of `89b0d2e` found two Pro denial cases. A definitive identity denial during a new attempt can offer Free even after a prior operation ended. Once a paid transfer may have started, an authorization denial keeps the same paid operation in recovery and blocks another upload until its status is checked. Regression tests exercise both cases and the pre-transfer persisted denial.
