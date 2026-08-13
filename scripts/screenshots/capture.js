// Drives the built renderer with stubbed data and captures a PNG per view.
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const REPO = path.resolve(__dirname, "..");
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

async function shot(win, name) {
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, `${name}.png`), image.toPNG());
  console.log("wrote", name);
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
  // Long enough for the landing entrance to settle.
  await wait(3000);
  await shot(win, "landing");

  // The capability showcase. The window grows for this one so the whole row
  // fits without a scrollbar down the side of the shot.
  console.log(await win.webContents.executeJavaScript(clickJs("button", "What I can do")));
  win.setContentSize(1280, 930);
  await wait(1500);
  await shot(win, "capabilities");
  win.setContentSize(1280, 860);
  await wait(500);

  console.log(await win.webContents.executeJavaScript(clickJs("header button", "Profile")));
  await wait(600);
  console.log(await win.webContents.executeJavaScript(clickJs("button", "Work experience")));
  await wait(900);
  await shot(win, "profile");

  console.log(await win.webContents.executeJavaScript(clickJs("header button", "Chat")));
  await wait(600);
  await win.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('input[placeholder="Message"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "I'm looking at a mobile engineer role at Northwind — does my background fit?");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.closest("form").requestSubmit();
      return "sent";
    })()
  `);
  await wait(2500);
  await shot(win, "chat");

  console.log(await win.webContents.executeJavaScript(clickJs("header button", "Builder")));
  await wait(2500);
  await shot(win, "builder");

  console.log(await win.webContents.executeJavaScript(clickJs("header button", "History")));
  await wait(900);
  // The session row is a clickable div, not a button.
  console.log(
    await win.webContents.executeJavaScript(clickJs("li div.cursor-pointer", "Mobile Engineer"))
  );
  await wait(900);
  await shot(win, "history");

  app.quit();
});
