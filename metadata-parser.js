// Take an HTML document and parse for open graph meta data
// Based on https://github.com/mozilla/page-metadata-parser

// Use Sizzle for selecting elements since nwmatcher's metaprogramming is not supported in workers
import Sizzle from "./sizzle.js";

import {
  DOMParser,
  Element,
} from "https://deno.land/x/deno_dom@v0.1.15-alpha/deno-dom-wasm.ts";

function makeUrlAbsolute(base, relative) {
  return new URL(relative, base).href;
}

function parseUrl(url) {
  return new URL(url).host;
}

function getProvider(host) {
  return host.replace(/www[a-zA-Z0-9]*\./, "")
}

const hrefAttribute = (element) => element.getAttribute("href");
const contentAttribute = (element) => element.getAttribute("content");
const textContent = (element) => element.textContent;

const metadataRuleSets = {
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

  description: {
    rules: [
      [
        'meta[property="og:description"]',
        contentAttribute,
      ],
      [
        'meta[name="description"]',
        contentAttribute,
      ],
    ],
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
      ['link[rel="icon"]', hrefAttribute],
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

  type: {
    rules: [
      [
        'meta[property="og:type"]',
        contentAttribute,
      ],
    ],
  },

  keywords: {
    rules: [
      ['meta[name="keywords"]', contentAttribute],
    ],
    processors: [
      (keywords, context) =>
        keywords.split(",").map((keyword) => keyword.trim()),
    ],
  },

  language: {
    rules: [
      ["html[lang]", (element) => element.getAttribute("lang")],
      ['meta[name="language"]', contentAttribute],
    ],
    processors: [
      (language, context) => language.split("-")[0],
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
    const querySelector = Sizzle(doc);
    let maxScore = 0;
    let maxValue;

    for (let currRule = 0; currRule < ruleSet.rules.length; currRule++) {
      const [query, handler] = ruleSet.rules[currRule];
      const elements = querySelector(query, doc);

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
