import { App } from "@capacitor/app";
import { ScreenOrientation } from "@capacitor/screen-orientation";

function isNativeAndroid() {
  return (
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === "function" &&
    window.Capacitor.isNativePlatform()
  );
}

window.SportyNovaNative = {
  isNative: isNativeAndroid,

  async enterLandscape() {
    if (!isNativeAndroid()) return false;

    try {
      await ScreenOrientation.lock({
        orientation: "landscape"
      });
      return true;
    } catch (error) {
      console.warn("Landscape lock failed:", error);
      return false;
    }
  },

  async enterPortrait() {
    if (!isNativeAndroid()) return false;

    try {
      await ScreenOrientation.lock({
        orientation: "portrait"
      });
      return true;
    } catch (error) {
      try {
        await ScreenOrientation.unlock();
      } catch (_) {}

      return false;
    }
  }
};

if (isNativeAndroid()) {
  App.addListener("backButton", () => {
    window.dispatchEvent(
      new CustomEvent("sportynova:android-back")
    );
  });
}

console.log("SportyNova Android bridge loaded");
