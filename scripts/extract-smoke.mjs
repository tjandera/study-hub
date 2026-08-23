import { readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/extract-smoke.mjs <pptx>");
  process.exit(1);
}

const bytes = await readFile(file);
const zip = await JSZip.loadAsync(bytes);
const slides = Object.keys(zip.files)
  .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
  .sort((a, b) => Number(a.match(/slide(\d+)/i)[1]) - Number(b.match(/slide(\d+)/i)[1]));

function decodeXml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

let chars = 0;
const sample = [];
for (const name of slides) {
  const xml = await zip.files[name].async("string");
  const texts = [...xml.matchAll(/<(?:a:)?t(?:\s[^>]*)?>([^<]*)<\/(?:a:)?t>/g)].map((m) =>
    decodeXml(m[1]),
  );
  const block = texts.filter(Boolean).join(" ");
  chars += block.length;
  if (sample.length < 6 && block.trim()) sample.push(block.trim().slice(0, 120));
}

console.log(
  JSON.stringify(
    {
      file: path.basename(file),
      slides: slides.length,
      chars,
      sample,
    },
    null,
    2,
  ),
);
