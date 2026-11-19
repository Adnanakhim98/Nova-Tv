/**
 * After `npx cap add android` + `npx cap sync`, run this script.
 * Makes MainActivity always use IMMERSIVE_STICKY mode.
 * Status bar + navigation bar icons auto-hide and only reappear
 * temporarily when the user swipes from the edge.
 */
import { readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let mainActivity = null;
try {
  const found = execSync('find android -name "MainActivity.java" 2>/dev/null | head -1', { encoding: "utf8" }).trim();
  if (found) mainActivity = path.resolve(root, found);
} catch {}

if (!mainActivity) {
  console.warn("MainActivity.java not found – skip immersive patch");
  process.exit(0);
}

let src = await readFile(mainActivity, "utf8");

if (src.includes("BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE") || src.includes("SYSTEM_UI_FLAG_IMMERSIVE_STICKY")) {
  console.log("MainActivity already has immersive code – skip");
  process.exit(0);
}

const importsToAdd = `
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
`.trim();

if (!src.includes("import android.view.WindowInsetsController")) {
  src = src.replace(
    /(import com\.getcapacitor\.BridgeActivity;)/,
    `$1\n${importsToAdd}`
  );
}

const method = `
    private final Handler immersiveHandler = new Handler(Looper.getMainLooper());
    private final Runnable immersiveRunnable = this::enableImmersiveMode;

    private void enableImmersiveMode() {
        Window window = getWindow();
        if (window == null) return;
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            View decor = window.getDecorView();
            decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            );
        }
    }

    /** Call this whenever bars might have reappeared (e.g. after 4s of video). */
    public void forceHideSystemBars() {
        enableImmersiveMode();
        immersiveHandler.removeCallbacks(immersiveRunnable);
        immersiveHandler.postDelayed(immersiveRunnable, 4000);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enableImmersiveMode();
            // Re-apply after 4 seconds in case system bars reappeared
            immersiveHandler.removeCallbacks(immersiveRunnable);
            immersiveHandler.postDelayed(immersiveRunnable, 4000);
        }
    }
`;

if (!src.includes("enableImmersiveMode")) {
  const lastBrace = src.lastIndexOf("}");
  if (lastBrace > 0) {
    src = src.slice(0, lastBrace) + method + "\n" + src.slice(lastBrace);
  }
}

if (src.includes("super.onCreate") && !src.includes("enableImmersiveMode();")) {
  src = src.replace(
    /(super\.onCreate\([^)]*\);)/,
    `$1\n        enableImmersiveMode();\n        immersiveHandler.postDelayed(immersiveRunnable, 4000);`
  );
}

await writeFile(mainActivity, src, "utf8");
console.log("Patched MainActivity for always-on immersive sticky + 4s re-hide:", mainActivity);
