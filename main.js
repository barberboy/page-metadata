import { parse } from "./metadata-parser.js";

const SA_URL = "https://api.scrapingant.com/v1/general";
const SA_API_KEY = Deno.env.get("SCRAPINGANT_API_KEY");

addEventListener("fetch", async (event) => {
  const { searchParams } = new URL(event.request.url);

  const url = searchParams.get("url");
  const browser = searchParams.get("browser");
  const excerpt = searchParams.get("excerpt");

  if (!url) {
    return error(event, 400, "Missing 'url' parameter");
  }

  let html;
  try {
    if (browser && SA_API_KEY) {
      html = await fetchWithBrowser(url);
    } else {
      const res = await fetch(url);
      html = await res.text();
    }

    const doc = parse(url, html);
    // If the user passes an excerpt, use that as the snipppet.
    if (excerpt) {
      doc.snippet = excerpt;
    }
    console.log(url, doc);
    return json(event, doc);
  } catch (err) {
    console.trace(err);
    return error(event, 500, err.message);
  }
});

async function fetchWithBrowser(url) {
  const res = await fetch(SA_URL + "?url=" + url, {
    headers: { "x-api-key": SA_API_KEY },
  });

  const response = await res.json();

  // An error occurred.
  if (response.detail) {
    throw new Error(response.detail);
  } else {
    return response.content;
  }
}

function error(event, status, text) {
  event.respondWith(
    new Response(text, {
      status: status,
      headers: {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
      },
    }),
  );
}

function json(event, data) {
  event.respondWith(
    // new Response(JSON.stringify(data), {
    new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "Access-Control-Allow-Origin": "*",
      },
    }),
  );
}
