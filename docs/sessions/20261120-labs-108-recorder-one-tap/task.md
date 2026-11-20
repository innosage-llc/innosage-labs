# Recorder one-tap transcription

Related to #108. The previous Android flow reached manual pilot setup in a fresh install when the staging Gateway build value was absent. Preserve the selected service for new jobs and keep each saved job on its original service and identity.

The staging release config is checked against the approved Recorder Gateway route. Guest credentials use environment-specific keys. Recovery accepts the old Staging UUID and JSON formats and requires the original credential. Production Free remains unavailable pending verification of the owning service.

Deterministic checks cover release inputs, credential isolation, legacy recovery and Free limits. Android application acceptance, the three startup gates and independent review apply to the integrated candidate.
