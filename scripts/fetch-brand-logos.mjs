import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "images", "marcas");

const brands = [
  {
    file: "gwm",
    initials: "GWM",
    urls: [
      "https://www.gwm.cl/favicon.ico",
      "https://upload.wikimedia.org/wikipedia/commons/3/3d/GWM_logo_2021.svg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/GWM_logo_2021.svg",
    ],
  },
  {
    file: "haval",
    initials: "Haval",
    urls: [
      "https://www.gwm.cl/favicon.ico",
      "https://upload.wikimedia.org/wikipedia/commons/6/6b/Haval_logo.svg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Haval_logo.svg",
    ],
  },
  {
    file: "chery",
    initials: "Chery",
    urls: [
      "https://www.cheryautos.cl/favicon.ico",
      "https://upload.wikimedia.org/wikipedia/commons/1/14/Chery_Auto_logo.svg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Chery_Auto_logo.svg",
    ],
  },
  {
    file: "changan",
    initials: "Changan",
    urls: [
      "https://www.changan.cl/favicon.ico",
      "https://upload.wikimedia.org/wikipedia/commons/8/8a/Changan_Auto_logo.svg",
    ],
  },
  {
    file: "jac",
    initials: "JAC",
    urls: [
      "https://www.jac.cl/favicon.ico",
      "https://upload.wikimedia.org/wikipedia/commons/4/4e/New_Jac_motors_logo.png",
    ],
  },
  {
    file: "geely",
    initials: "Geely",
    urls: [
      "https://www.geely.cl/favicon.ico",
      "https://upload.wikimedia.org/wikipedia/commons/3/30/Geely_Auto_logo.svg",
    ],
  },
  {
    file: "byd",
    initials: "BYD",
    urls: [
      "https://www.byd.com/favicon.ico",
      "https://upload.wikimedia.org/wikipedia/commons/b/be/BYD_Auto_logo.svg",
    ],
  },
  {
    file: "mg",
    initials: "MG",
    urls: [
      "https://www.mgmotor.cl/favicon.ico",
      "https://upload.wikimedia.org/wikipedia/commons/9/91/MG_Motor_logo.svg",
    ],
  },
  {
    file: "maxus",
    initials: "Maxus",
    urls: [
      "https://www.maxus.cl/favicon.ico",
      "https://upload.wikimedia.org/wikipedia/commons/4/40/MAXUS_logo.svg",
    ],
  },
  {
    file: "mahindra",
    initials: "Mahindra",
    urls: [
      "https://www.mahindra.cl/favicon.ico",
      "https://upload.wikimedia.org/wikipedia/commons/4/4a/Mahindra_logo.svg",
    ],
  },
];

function placeholderSvg(initials) {
  const label = initials.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120" role="img">
  <rect width="200" height="120" rx="8" fill="#eef2f7"/>
  <text x="100" y="72" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#1a2b4b">${label}</text>
</svg>`;
}

function isImage(buf) {
  if (!buf || buf.length < 4) return false;
  const h = buf.slice(0, 12);
  if (h[0] === 0x89 && h[1] === 0x50) return true; // PNG
  if (h[0] === 0xff && h[1] === 0xd8) return true; // JPEG
  if (h[0] === 0x47 && h[1] === 0x49) return true; // GIF
  if (buf.slice(0, 4).toString("utf8") === "<svg") return true;
  if (buf.slice(0, 5).toString("utf8").includes("<?xml")) return true;
  if (h[0] === 0 && h[1] === 0 && h[2] === 1 && h[3] === 0) return true; // ICO
  return false;
}

async function download(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AndesAutoParts/1.0)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!isImage(buf)) throw new Error("not image");
  return buf;
}

fs.mkdirSync(outDir, { recursive: true });

const report = [];

for (const brand of brands) {
  const pngPath = path.join(outDir, `${brand.file}.png`);
  const svgPath = path.join(outDir, `${brand.file}.svg`);
  let saved = false;

  for (const url of brand.urls) {
    try {
      const buf = await download(url);
      const isSvg =
        url.endsWith(".svg") ||
        buf.slice(0, 100).toString("utf8").includes("<svg");
      if (isSvg) {
        fs.writeFileSync(svgPath, buf);
        fs.writeFileSync(pngPath, buf);
        report.push({ file: brand.file, source: url, type: "svg-as-png" });
      } else {
        fs.writeFileSync(pngPath, buf);
        report.push({ file: brand.file, source: url, type: "binary" });
      }
      saved = true;
      break;
    } catch (e) {
      /* try next */
    }
  }

  if (!saved) {
    const svg = placeholderSvg(brand.initials);
    fs.writeFileSync(svgPath, svg);
    fs.writeFileSync(pngPath, svg);
    report.push({ file: brand.file, source: "placeholder", type: "svg-placeholder" });
  }
}

console.log(JSON.stringify(report, null, 2));
