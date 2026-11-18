import { chromium } from "playwright";

const executablePath =
  "C:\\Users\\Fahad\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1248\\chrome-headless-shell-win64\\chrome-headless-shell.exe";

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 220, height: 220 } });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto("http://127.0.0.1:4466/index.html", { waitUntil: "networkidle" });
await page.click('[data-testid="key-theme"]');
await page.waitForTimeout(300);

const info = await page.evaluate(() => {
  const w = document.querySelector(".typewriter-widget");
  const lcd = document.querySelector('[data-testid="lcd-display"]');
  const paper = document.querySelector(".paper-sheet");
  const strikeBar = getComputedStyle(document.querySelector(".strike-line") || document.createElement("span"));
  return {
    theme: w.getAttribute("data-theme"),
    lcdColor: getComputedStyle(lcd).color,
    lcdBg: getComputedStyle(lcd).backgroundColor,
    paperBg: getComputedStyle(paper).backgroundColor,
    marginLine: getComputedStyle(paper).backgroundImage.includes("linear-gradient(to right"),
    localStorage: localStorage.getItem("timekeeper.theme"),
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
