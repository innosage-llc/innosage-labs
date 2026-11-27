import { registerRootComponent } from 'expo';
import App from './App';
import { registerOffline } from './registerOffline';

registerRootComponent(App);
registerOffline();
