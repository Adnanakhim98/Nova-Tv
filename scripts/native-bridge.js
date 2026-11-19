import { App } from "@capacitor/app";
import { ScreenOrientation } from "@capacitor/screen-orientation";
import { StatusBar, Style } from "@capacitor/status-bar";

function isNativeAndroid() {
  return Boolean(
    window.Capacitor &&
    window.Capacitor.isNativePlatform?.() &&
    window.Capacitor.getPlatform?.() === "android"
  );
}

let hideTimer = null;

async function hideSystemBars() {
  try {
    await StatusBar.hide();
  } catch (e) {
    console.warn("StatusBar.hide failed:", e);
  }
  try {
    if (window.AndroidFullScreen && typeof window.AndroidFullScreen.immersiveMode === "function") {
      window.AndroidFullScreen.immersiveMode();
    }
  } catch (_) {}
}

async function showSystemBars() {
  try {
    await StatusBar.show();
    await StatusBar.setStyle({ style: Style.Dark });
  } catch (e) {
    console.warn("StatusBar.show failed:", e);
  }
}

function scheduleAutoHide(ms = 4000) {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    hideSystemBars();
  }, ms);
}

window.SportyNovaNative = {
  isNative: isNativeAndroid,

  async enterLandscape() {
    if (!isNativeAndroid()) return false;
    try {
      await ScreenOrientation.lock({ orientation: "landscape" });
      await hideSystemBars();
      scheduleAutoHide(4000);
      return true;
    } catch (error) {
      console.warn("Landscape lock failed:", error);
      return false;
    }
  },

  async enterPortrait() {
    if (!isNativeAndroid()) return false;
    try {
      await ScreenOrientation.lock({ orientation: "portrait" });
      // Keep system bars hidden even in portrait (user request)
      await hideSystemBars();
      scheduleAutoHide(4000);
      return true;
    } catch (error) {
      console.warn("Portrait lock failed:", error);
      return false;
    }
  },

  async hideSystemUI() {
    if (!isNativeAndroid()) return;
    await hideSystemBars();
    scheduleAutoHide(4000);
  },

  async showSystemUI() {
    if (!isNativeAndroid()) return;
    // User wants bars never visible → keep them hidden
    await hideSystemBars();
  },

  /** Call when video starts playing → hide bars immediately + again after 4s */
  async onVideoPlaying() {
    if (!isNativeAndroid()) return;
    await hideSystemBars();
    scheduleAutoHide(4000);
  }
};

if (isNativeAndroid()) {
  // Hide system bars as soon as the app starts
  hideSystemBars();
  scheduleAutoHide(1500);

  App.addListener("backButton", ({ canGoBack }) => {
    const event = new CustomEvent("sportynova:android-back", {
      cancelable: true,
      detail: { canGoBack: Boolean(canGoBack) }
    });

    const notHandled = window.dispatchEvent(event);

    if (notHandled) {
      if (canGoBack) window.history.back();
      else App.exitApp();
    }
  });
}

console.log("SportyNova Android bridge loaded (immersive + 4s auto-hide)");
