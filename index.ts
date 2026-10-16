import { registerRootComponent } from 'expo';

import App from './AppInicio';   // P1-1a: editor 2D sin AR. La versión anterior sigue en App.tsx (menú ⋯)

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
