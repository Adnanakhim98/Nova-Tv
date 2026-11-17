
import { App } from "@capacitor/app";
import { ScreenOrientation } from "@capacitor/screen-orientation";

function isNativeAndroid() {
  return Boolean(
    window.Capacitor &&
    window.Capacitor.isNativePlatform?.() &&
    window.Capacitor.getPlatform?.() === "android"
  );
}

window.SportyNovaNative = {
  isNative: isNativeAndroid,

  async enterLandscape() {
    if (!isNativeAndroid()) return false;
    try {
      await ScreenOrientation.lock({ orientation: "landscape" });
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
      return true;
    } catch (error) {
      console.warn("Portrait lock failed:", error);
      return false;
    }
  }
};

if (isNativeAndroid()) {
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

console.log("SportyNova Android bridge loaded");
