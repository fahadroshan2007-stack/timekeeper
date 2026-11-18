import { chromium } from "playwright";

const executablePath =
  "C:\\Users\\Fahad\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1248\\chrome-headless-shell-win64\\chrome-headless-shell.exe";

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 220, height: 220 } });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto("http://127.0.0.1:4465/index.html", { waitUntil: "networkidle" });
await page.click('[data-testid="key-load"]');

// check a task to see strike-through + checkbox
const rows = page.locator(".task-row");
await rows.nth(1).locator(".retro-checkbox").click();
// activate first task
await rows.nth(0).locator(".task-text-wrapper").click();
await page.screenshot({ path: "D:\\Fahad\\Apps\\Code Projects\\TimeKeeper\\docs\\mockups\\app-espresso-checklist.png" });

// late-night equivalent
await page.click('[data-testid="key-theme"]');
await page.waitForTimeout(350);
await page.screenshot({ path: "D:\\Fahad\\Apps\\Code Projects\\TimeKeeper\\docs\\mockups\\app-late-checklist.png" });

await browser.close();
console.log("done");
