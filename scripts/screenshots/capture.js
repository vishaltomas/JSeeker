// Drives the built renderer with stubbed data and captures a PNG per view —
// the editor (with the assistant docked beside it) and the profile.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const REPO = path.resolve(__dirname, "..", "..");
const OUT = path.join(REPO, "docs", "screenshots");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Clicks the first element matching a CSS selector whose text contains
 *  `text` (or any element for a bare selector). */
const clickJs = (selector, text) => `
  (() => {
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const el = ${text ? `els.find((e) => e.textContent.includes(${JSON.stringify(text)}))` : "els[0]"};
    if (!el) return "not found";
    el.click();
    return "ok";
  })()
`;

/** Captures the window, retrying while the frame comes back empty — the first
 *  capture after a load lands before the compositor has painted often enough
 *  to matter, and an empty capture writes a 0-byte PNG rather than failing. */
async function shot(win, name) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const image = await win.webContents.capturePage();
    const png = image.isEmpty() ? Buffer.alloc(0) : image.toPNG();
    if (png.length) {
      fs.writeFileSync(path.join(OUT, `${name}.png`), png);
      console.log("wrote", name);
      return;
    }
    await wait(500);
  }
  throw new Error(`capture of ${name} came back empty five times`);
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: true,
    backgroundColor: "#1e1f22",
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });

  await win.loadFile(path.join(REPO, "dist/renderer/index.html"));
  // The app opens on the editor. Long enough for the workspace listing, the
  // first compile and the preview iframe to settle.
  await wait(3000);

  // Ask the assistant something about the document on screen — the shot is of
  // the editor working, not of an editor sitting idle. The value is set and
  // submitted in two steps because React has to render the controlled input
  // before the form's submit button stops being disabled.
  await win.webContents.executeJavaScript(`
    (() => {
      const box = document.querySelector('textarea[placeholder="Ask about this document…"]');
      if (!box) return "no chat box";
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      setter.call(box, "Tighten the Northwind bullets — same facts, fewer words.");
      box.dispatchEvent(new Event("input", { bubbles: true }));
      return "typed";
    })()
  `).then(console.log);
  await wait(400);
  await win.webContents
    .executeJavaScript(clickJs('button[title="Send (Enter)"]'))
    .then(console.log);
  await wait(2500);
  await shot(win, "editor");

  console.log(await win.webContents.executeJavaScript(clickJs("header button", "Profile")));
  await wait(600);
  console.log(await win.webContents.executeJavaScript(clickJs("button", "Work experience")));
  await wait(900);
  await shot(win, "profile");

  app.quit();
});
