// Take an HTML document and parse for open graph meta data
// https://github.com/mozilla/page-metadata-parser

import {
  DOMParser,
  Element,
} from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

function makeUrlAbsolute(base, relative) {
  return new URL(relative, base).href;
}

function parseUrl(url) {
  return new URL(url).host;
}

function getProvider(host) {
  return host
    .replace(/www[a-zA-Z0-9]*\./, "")
    .replace(".co.", ".")
    .split(".")
    .slice(0, -1)
    .join(" ");
}

const hrefAttribute = (element) => element.getAttribute("href");
const contentAttribute = (element) => element.getAttribute("content");
const textContent = (element) => element.textContent;

const metadataRuleSets = {
  description: {
    rules: [
      [
        'meta[property="og:description"]',
        contentAttribute,
      ],
      [
        'meta[name="description" i]',
        contentAttribute,
      ],
    ],
  },

  icon: {
    rules: [
      [
        'link[rel="apple-touch-icon"]',
        hrefAttribute,
      ],
      [
        'link[rel="apple-touch-icon-precomposed"]',
        hrefAttribute,
      ],
      ['link[rel="icon" i]', hrefAttribute],
      ['link[rel="fluid-icon"]', hrefAttribute],
      ['link[rel="shortcut icon"]', hrefAttribute],
      ['link[rel="Shortcut Icon"]', hrefAttribute],
      ['link[rel="mask-icon"]', hrefAttribute],
    ],
    scorers: [
      // Handles the case where multiple icons are listed with specific sizes ie
      // <link rel="icon" href="small.png" sizes="16x16">
      // <link rel="icon" href="large.png" sizes="32x32">
      (element, score) => {
        const sizes = element.getAttribute("sizes");

        if (sizes) {
          const sizeMatches = sizes.match(/\d+/g);
          if (sizeMatches) {
            return sizeMatches[0];
          }
        }
      },
    ],
    defaultValue: (context) => "favicon.ico",
    processors: [
      (icon_url, context) => makeUrlAbsolute(context.url, icon_url),
    ],
  },

  image: {
    rules: [
      [
        'meta[property="og:image:secure_url"]',
        contentAttribute,
      ],
      [
        'meta[property="og:image:url"]',
        contentAttribute,
      ],
      [
        'meta[property="og:image"]',
        contentAttribute,
      ],
      [
        'meta[name="twitter:image"]',
        contentAttribute,
      ],
      [
        'meta[property="twitter:image"]',
        contentAttribute,
      ],
      ['meta[name="thumbnail"]', contentAttribute],
    ],
    processors: [
      (image_url, context) => makeUrlAbsolute(context.url, image_url),
    ],
  },

  keywords: {
    rules: [
      ['meta[name="keywords" i]', contentAttribute],
    ],
    processors: [
      (keywords, context) =>
        keywords.split(",").map((keyword) => keyword.trim()),
    ],
  },

  title: {
    rules: [
      [
        'meta[property="og:title"]',
        contentAttribute,
      ],
      [
        'meta[name="twitter:title"]',
        contentAttribute,
      ],
      [
        'meta[property="twitter:title"]',
        contentAttribute,
      ],
      ['meta[name="hdl"]', contentAttribute],
      ["title", textContent],
    ],
  },

  language: {
    rules: [
      ["html[lang]", (element) => element.getAttribute("lang")],
      ['meta[name="language" i]', contentAttribute],
    ],
    processors: [
      (language, context) => language.split("-")[0],
    ],
  },

  type: {
    rules: [
      [
        'meta[property="og:type"]',
        contentAttribute,
      ],
    ],
  },

  url: {
    rules: [
      ["a.amp-canurl", hrefAttribute],
      ['link[rel="canonical"]', hrefAttribute],
      ['meta[property="og:url"]', contentAttribute],
    ],
    defaultValue: (context) => context.url,
    processors: [
      (url, context) => makeUrlAbsolute(context.url, url),
    ],
  },

  provider: {
    rules: [
      [
        'meta[property="og:site_name"]',
        contentAttribute,
      ],
    ],
    defaultValue: (context) => getProvider(parseUrl(context.url)),
  },

  snippet: {
    rules: [
      ["article p", textContent],
      ["main p", textContent],
      ["#main p", textContent],
      ["p", textContent],
      ["main", textContent],
      [".post__content", textContent],
      [".post .content", textContent],
      ["#pagebody .storycontent", textContent],
    ],
    processors: [
      (text, context) => (text || "").replace(/[\n ]+/g, " ").slice(0, 500),
    ],
  },
};

export function parse(url, html) {
  const doc = new DOMParser().parseFromString(html, "text/html");

  const metadata = {};
  const context = {
    url,
  };

  const ruleSets = metadataRuleSets;

  Object.keys(ruleSets).map((ruleSetKey) => {
    const ruleSet = ruleSets[ruleSetKey];
    const builtRuleSet = buildRuleSet(ruleSet);

    metadata[ruleSetKey] = builtRuleSet(doc, context);
  });

  return metadata;
}

function buildRuleSet(ruleSet) {
  return (doc, context) => {
    let maxScore = 0;
    let maxValue;

    for (let currRule = 0; currRule < ruleSet.rules.length; currRule++) {
      const [query, handler] = ruleSet.rules[currRule];

      const elements = Array.from(doc.querySelectorAll(query));

      if (elements.length) {
        for (const element of elements) {
          let score = ruleSet.rules.length - currRule;

          if (ruleSet.scorers) {
            for (const scorer of ruleSet.scorers) {
              const newScore = scorer(element, score);

              if (newScore) {
                score = newScore;
              }
            }
          }

          if (score > maxScore) {
            maxScore = score;
            maxValue = handler(element);
          }
        }
      }
    }

    if (!maxValue && ruleSet.defaultValue) {
      maxValue = ruleSet.defaultValue(context);
    }

    if (maxValue) {
      if (ruleSet.processors) {
        for (const processor of ruleSet.processors) {
          maxValue = processor(maxValue, context);
        }
      }

      if (maxValue.trim) {
        maxValue = maxValue.trim();
      }

      return maxValue;
    }
  };
}
