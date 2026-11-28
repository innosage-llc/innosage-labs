const { staging, production } = require('./recorder-free-targets.json');

module.exports = ({ config }) => {
  const parityRelease = process.env.RECORDER_PARITY_ANDROID_RELEASE === '1';
  const stagingRelease = process.env.RECORDER_STAGING_ANDROID_RELEASE === '1';
  if (process.env.EXPO_PUBLIC_RECORDER_VOICE_PROFILES === 'true' && !stagingRelease) {
    throw new Error('Voice profiles require an explicitly staged Recorder Android candidate.');
  }
  if (stagingRelease && (parityRelease || process.env.EXPO_PUBLIC_RECORDER_PRODUCTION_GATEWAY_URL)) {
    throw new Error('The Recorder Staging-only Android release must exclude the Production Free gateway.');
  }
  if ((parityRelease || stagingRelease) &&
      process.env.EXPO_PUBLIC_RECORDER_GATEWAY_URL?.replace(/\/$/, '') !== staging) {
    throw new Error('The Recorder Android release requires the approved Staging Free gateway build input.');
  }
  if (parityRelease && process.env.EXPO_PUBLIC_RECORDER_PRODUCTION_GATEWAY_URL?.replace(/\/$/, '') !== production) {
    throw new Error('The Recorder Android parity release requires the approved Production Free gateway build input.');
  }
  return config;
};
