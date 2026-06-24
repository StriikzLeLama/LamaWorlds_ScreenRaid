import { isWebApp } from './lib/platform';
import { AppWeb } from './App.web';
import { AppReceiver } from './App.receiver';

export default function App() {
  return isWebApp() ? <AppWeb /> : <AppReceiver />;
}
