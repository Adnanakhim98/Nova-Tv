
SPORTYNOVA 1.0 — Live TV (GitHub Pages)
A mobile-first live TV web UI inspired by the supplied reference video. Supports HLS (.m3u8) using hls.js and MPEG-DASH (.mpd) using dash.js.
Files
index.html — the complete website/player.
channels.json — edit this file to manage your channel list from GitHub.
Add your own authorized streams
Edit channels.json and replace the example URLs with streams you own or are authorized to distribute:
[
  {
    "name": "My Sports Channel",
    "category": "SPORTS",
    "logo": "⚽",
    "tone": "blue",
    "url": "https://your-authorized-host.example/live/index.m3u8"
  },
  {
    "name": "My DASH Channel",
    "category": "SPORTS",
    "logo": "▶",
    "tone": "red",
    "url": "https://your-authorized-host.example/live/manifest.mpd"
  }
]
channels.json must be valid JSON. URLs must be HTTPS when your site is HTTPS. The stream provider must permit playback in a browser (CORS and compatible codecs). DRM-protected streams require the provider's authorized DRM configuration; this starter does not bypass DRM.
Publish from an Android phone
Open your GitHub repository in Chrome and sign in.
Tap Add file → Upload files.
Upload index.html, channels.json, and this README (or create the files individually).
Commit the changes to the main branch.
Open Settings → Pages.
Under Build and deployment, select Deploy from a branch.
Choose branch main and folder / (root), then tap Save.
Wait for the Pages URL to appear. Open it on your phone.
When you want to change channels later, edit only channels.json on GitHub and commit. The page reads the config on load.
M3U playlist
The page includes a Playlist button. You can paste M3U content or try importing a playlist URL. Remote URL imports can fail if that server blocks browser CORS. For reliable management, put your authorized stream URLs in channels.json.
Example M3U:
#EXTM3U
#EXTINF:-1 group-title="SPORTS",My Sports Channel
https://your-authorized-host.example/live/index.m3u8
Only add streams you own or have permission to use. A GitHub Pages site is static hosting; it does not proxy or hide the original stream URL.
