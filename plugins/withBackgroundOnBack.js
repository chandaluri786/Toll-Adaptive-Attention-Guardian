// Config plugin: MainActivity moves Toll's task to the background on the default Back, instead of finishing it.
//
// Why: the Storm screen leaves with BackHandler.exitApp(). The Expo template only calls moveTaskToBack on
// Android 11 and older; on 12+ it falls through to Activity.onBackPressed, which on the S25 (Android 16) finishes
// MainActivity. The next blocker deep link (toll://blocked?…) then builds a new Activity and a second React root.
// Keeping the Activity alive means each intercept arrives through onNewIntent on the same root.
const { withMainActivity } = require('expo/config-plugins');

const MARKER = '// toll: background-on-back';

const BODY = `  override fun invokeDefaultOnBackPressed() {
      ${MARKER}
      // Root activity: send the whole task to the background so the React root survives.
      if (!moveTaskToBack(false)) {
          // Not the task root: finish it as usual.
          super.invokeDefaultOnBackPressed()
      }
  }`;

/** Replaces the template's invokeDefaultOnBackPressed (to the end of the method) with BODY. Idempotent. */
function patchMainActivity(src) {
  if (src.includes(MARKER)) return src;
  const start = src.indexOf('override fun invokeDefaultOnBackPressed()');
  if (start === -1) {
    throw new Error('withBackgroundOnBack: invokeDefaultOnBackPressed not found in MainActivity.kt');
  }
  // Walk the braces from the method's opening brace to its matching close.
  const open = src.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (; end < src.length; end++) {
    if (src[end] === '{') depth++;
    else if (src[end] === '}' && --depth === 0) break;
  }
  const lineStart = src.lastIndexOf('\n', start) + 1;
  return src.slice(0, lineStart) + BODY + src.slice(end + 1);
}

const withBackgroundOnBack = (config) =>
  withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error('withBackgroundOnBack: expected a Kotlin MainActivity');
    }
    return { ...cfg, modResults: { ...cfg.modResults, contents: patchMainActivity(cfg.modResults.contents) } };
  });

module.exports = withBackgroundOnBack;
module.exports.patchMainActivity = patchMainActivity;
