import { chromium } from "playwright";

const executablePath =
  "C:\\Users\\Fahad\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1248\\chrome-headless-shell-win64\\chrome-headless-shell.exe";

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 220, height: 220 } });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto("http://127.0.0.1:4467/index.html", { waitUntil: "networkidle" });
await page.screenshot({ path: "D:\\Fahad\\Apps\\Code Projects\\TimeKeeper\\docs\\mockups\\app-default-checklist.png" });
// check one task to show checkboxes work on first launch
await page.locator(".task-row").nth(1).locator(".retro-checkbox").click();
await page.screenshot({ path: "D:\\Fahad\\Apps\\Code Projects\\TimeKeeper\\docs\\mockups\\app-default-checked.png" });
await browser.close();
console.log("done");
