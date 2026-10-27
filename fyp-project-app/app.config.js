// Extends app.json.
//
// When serving the app to Expo Go (`expo start`), drop the EAS projectId from the
// manifest so Expo Go does not tie the project to the Expo account that owns it.
// This lets teammates open the app from Expo Go signed in with ANY account.
// EAS builds/updates (`eas ...`, `expo config`) still receive the projectId.
const isDevServer = process.argv.includes('start');

module.exports = ({ config }) => {
  if (!isDevServer || !config.extra?.eas) {
    return config;
  }

  const { eas, ...extra } = config.extra;
  return { ...config, extra };
};
