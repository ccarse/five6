import puppeteer, { Browser } from "puppeteer";
import { stringify } from "@std/csv/stringify";
import cliProgress from "cli-progress";
import { $ } from "bun";

let browser: Browser;

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
      console.error(`Card not found: ${card}`);
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
        lowestPrice = price;
        cheapestProduct = {
          card,
          url: productUrl,
          price: `${lowestPrice}`,
        };
      }
    }

    if (!cheapestProduct) {
      console.error(`Card out of stock: ${card}`);
    } else {
      await $`open ${cheapestProduct.url}`;
    }

    return cheapestProduct || { card, url: "Not in stock", price: "" };
  } catch (error) {
    return { card, url: `Error: ${error}`, price: "" };
  }
}

async function main() {
  const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

  browser = await puppeteer.launch();

  const deckListPath = Bun.argv[2];
  const deckListText = await Bun.file(deckListPath).text();
  const deckList = deckListText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  progressBar.start(deckList.length, 0);

  const results = [];
  for (const [index, card] of deckList.entries()) {
    results.push(await findCheapestProduct(card));
    progressBar.update(index + 1);
  }
  progressBar.stop();

  const columns = ["url", "price"];
  console.log(stringify(results, { columns }));

  await browser.close();
}

main();
