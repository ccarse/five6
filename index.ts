import puppeteer, { Browser } from "puppeteer";
import { stringify } from "@std/csv/stringify";
import cliProgress from "cli-progress";
import { $ } from "bun";

let browser: Browser;
let multiBar: cliProgress.MultiBar;

// Function to search for a product and find the cheapest in-stock option
async function findCheapestProduct(card: string) {
  try {
    const page = await browser.newPage();

    // Construct the search URL
    const searchUrl = `https://five6gaming.com/search?type=product&q=${encodeURIComponent(card)}&view=json`;

    // Fetch the search results
    await page.goto(searchUrl);
    const response = await page.evaluate(() => document.body.innerText);
    const searchResults = JSON.parse(response).results;

    if (searchResults.length === 0) {
      await browser.close();
      multiBar.log(`\nCard not found: ${card}\n`);
      return { card, url: "Card not found.", price: "" };
    }

    let cheapestProduct = null;
    let lowestPrice = Infinity;

    for (const product of searchResults) {
      const productUrl = `https://five6gaming.com${product.url}`;

      // Navigate to the product page to fetch price
      await page.goto(productUrl);

      const price = await page.evaluate(() => {
        if (document.querySelector(".tt-label-out-stock")) {
          return null;
        }
        const priceElement = document.querySelector(".new-price") as HTMLElement;
        return priceElement ? parseFloat(priceElement.innerText.replace(/[^0-9.]/g, "")) : null;
      });

      if (price !== null && price < lowestPrice) {
        const title = product.title.split("[")[0].trim().toLowerCase();
        // Skip products that don't match the card name
        if (title === card.toLowerCase()) {
          lowestPrice = price;
          cheapestProduct = {
            title: product.title,
            card,
            url: productUrl,
            price: `${lowestPrice}`,
          };
        }
      }
    }

    if (!cheapestProduct) {
      multiBar.log(`Card out of stock: ${card}\n`);
      await Bun.sleep(1000);
    } else {
      if (process.platform === "darwin") {
        // macOS
        await $`open ${cheapestProduct.url}`;
      } else if (process.platform === "win32") {
        // Windows
        await $`start ${cheapestProduct.url}`;
      } else {
        console.log("Unsupported OS");
      }
      
    }

    return cheapestProduct || { card, url: "Not in stock", price: "" };
  } catch (error) {
    return { card, url: `Error: ${error}`, price: "" };
  }
}

async function main() {
  multiBar = new cliProgress.MultiBar(
    { format: " {bar} | {card} | {value}/{total}", clearOnComplete: true },
    cliProgress.Presets.shades_classic
  );

  browser = await puppeteer.launch();

  const deckListPath = Bun.argv[2];
  const deckListText = await Bun.file(deckListPath).text();
  const deckList = deckListText
    .split("\n")
    .map((l) => l.trim())
    .map((l) => l.replace(/^\d+\s*x?\s*/g, ""))
    .filter(Boolean);

  const progressBar = multiBar.create(deckList.length, 0);

  const results = [];
  for (const [index, card] of deckList.entries()) {
    progressBar.update(index + 1, { card });
    results.push(await findCheapestProduct(card));
  }
  multiBar.stop();

  const columns = ["url", "price"];
  const sortedResults = results.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const totalPrice = sortedResults.reduce((acc, r) => acc + parseFloat(r.price || "0"), 0);

  console.error(`Total price of in stock cards: ${formatter.format(totalPrice)}`);

  console.log(stringify(sortedResults, { columns }));

  await browser.close();
}

main();
