// Leaving the Storm screen when the blocker opened it. Both ways keep Toll's Activity (and its React root) alive,
// so the next toll://blocked link arrives through onNewIntent instead of building a second root.
//
//   'home'  Back / dismiss: to the home screen through the local TollHome module (modules/toll-home), which
//           starts the launcher. Revealing the blocked app instead would only get it intercepted again.
//   'app'   "Open <app>" after a window opened: BackHandler.exitApp(), which plugins/withBackgroundOnBack.js
//           turns into moveTaskToBack, so the app the user was in shows again.
//
// Either way /blocked is then popped (the stack is anchored on (tabs)), so opening Toll later shows the tabs.
import { router } from 'expo-router';
import { requireOptionalNativeModule } from 'expo';
import { BackHandler } from 'react-native';

type TollHome = { goHome(): void };

const native = requireOptionalNativeModule<TollHome>('TollHome');

export type LeaveTo = 'home' | 'app';

export function leaveToHome(to: LeaveTo): void {
  if (to === 'home' && native) {
    try {
      native.goHome();
    } catch (e) {
      // Never strand the user on the Storm screen: fall back to the old way out.
      console.warn('TollHome.goHome failed, leaving with exitApp', e);
      BackHandler.exitApp();
    }
  } else {
    BackHandler.exitApp();
  }
  if (router.canGoBack()) router.back();
}
