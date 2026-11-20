const { staging } = require('./recorder-free-targets.json');

module.exports = ({ config }) => {
  if (process.env.RECORDER_STAGING_ANDROID_RELEASE === '1' &&
      process.env.EXPO_PUBLIC_RECORDER_GATEWAY_URL?.replace(/\/$/, '') !== staging) {
    throw new Error('The Recorder Android staging release requires the approved Free gateway build input.');
  }
  return config;
};
