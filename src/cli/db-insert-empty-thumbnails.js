const db = require("../db/db");
const cheerio = require("cheerio");
const httpClient = require("../utils/httpClient");
const config = require("../utils/config");

async function main() {
  try {
    await db.initializeDatabase();

    const dbdata = await db.getMoviesWithoutThumbnail();
    for (const data of dbdata) {
      const id = data.id;
      const info = JSON.parse(data.info);
      const name = info.map((item) => item.title);
      const name2 = name[0];
      const formatText = name2 ? name2.replace(/\s+/g, "+") : null;
      const url = `${config.api.rootUrl}/?s=${formatText}`;
        console.log(name2);
        
      const content = await httpClient.getContentWithGot(url);
      const $ = cheerio.load(content);

      const tag = $("div.post-thumbnail");
      const imageTag = tag.find("img");
      const link = imageTag.attr("src");

      if (link) {
        // Remove domain prefix if needed
        const cleanedLink = link.replace(`${config.api.rootUrl}/`, "");
        await db.updateMovieThumbnail(id, cleanedLink);
      } else {
        console.log("No image found for:", name2);
      }
    }
  } catch (error) {
    console.error("Error initializing database:", error);
  }
  finally {
    await db.closeDatabase();
  }
}

main();
