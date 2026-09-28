const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withWorkers } = require('@ammarahmed/react-native-workers/metro');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../..')];
// Shared simulation files sit above the app and still need its Babel helpers.
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '../../node_modules'),
];

module.exports = withWorkers(config);
