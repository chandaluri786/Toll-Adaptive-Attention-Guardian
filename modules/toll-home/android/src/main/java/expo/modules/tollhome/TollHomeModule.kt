package expo.modules.tollhome

import android.content.Intent
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Sends the user to the home screen without finishing Toll's Activity, so its React root survives and the next
 * blocker deep link arrives through onNewIntent. (Leaving via finish() made each intercept build a new root;
 * moveTaskToBack reveals the blocked app underneath, which the blocker then intercepts again.)
 */
class TollHomeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TollHome")

    Function("goHome") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val home = Intent(Intent.ACTION_MAIN)
        .addCategory(Intent.CATEGORY_HOME)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(home)
    }
  }
}
