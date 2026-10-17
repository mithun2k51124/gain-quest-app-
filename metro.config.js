// metro.config.js — Expo defaults, plus: don't watch native build output.
// Gradle (APK/AAB builds) writes thousands of files under android/ and node_modules/*/android;
// watching them made the dev server crawl after every build.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const nativeBuildDirs = [
  /[\\/]android[\\/](app[\\/])?build[\\/].*/,
  /[\\/]android[\\/]\.gradle[\\/].*/,
  /[\\/]android[\\/]\.cxx[\\/].*/,
  /[\\/]node_modules[\\/].*[\\/]android[\\/](build|\.cxx|\.gradle)[\\/].*/,
];

const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  ...nativeBuildDirs,
];

module.exports = config;
