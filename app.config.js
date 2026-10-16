// Adjusts app.json per build. APP_VARIANT is set by the eas.json profiles.
//
// Android blocks plain-http requests by default. Development and preview
// builds allow them so the app can reach a test ERP on a laptop
// (http://192.168.x.x:8000); production builds keep them blocked - a live
// ERP must be served over https. (iOS allows http only to local-network
// hosts in every build, via NSAllowsLocalNetworking in app.json.)
//
// Note: with this file present, `npx expo install` can't add config plugins
// to app.json automatically - add them to app.json by hand when asked.

const variant = process.env.APP_VARIANT ?? 'development';

module.exports = ({ config }) => ({
  ...config,
  plugins: config.plugins.map((plugin) =>
    Array.isArray(plugin) && plugin[0] === 'expo-build-properties'
      ? [
          plugin[0],
          {
            ...plugin[1],
            android: { ...plugin[1]?.android, usesCleartextTraffic: variant !== 'production' },
          },
        ]
      : plugin,
  ),
});
