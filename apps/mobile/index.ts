import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(process.env.EXPO_PUBLIC_GRAPHICS_SMOKE === '1'
  ? require('./game/GraphicsSmoke').default : App);
