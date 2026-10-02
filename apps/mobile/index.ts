import { createElement } from 'react';
import { registerRootComponent } from 'expo';

import App from './App';
import { ScenarioGate } from './game/ScenarioGate';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately. The graphics smoke root is gated on
// the era seeds like the app itself.
const GraphicsSmoke = process.env.EXPO_PUBLIC_GRAPHICS_SMOKE === '1' ? require('./game/GraphicsSmoke').default : null;
registerRootComponent(GraphicsSmoke ? () => createElement(ScenarioGate, null, createElement(GraphicsSmoke)) : App);
