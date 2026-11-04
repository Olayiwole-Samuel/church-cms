// Builds the web logo and home-screen icons from assets/logo-original.png.
// To change the logo, replace that file and run: node scripts/make-icons.mjs
import sharp from "sharp";

const SOURCE = "assets/logo-original.png";

await sharp(SOURCE).resize({ width: 560 }).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile("public/logo.png");

for (const size of [192, 512]) {
  // Maskable icons can be cropped to a circle, so the logo stays inside the middle 80%.
  const inner = Math.round(size * 0.78);
  const logo = await sharp(SOURCE).resize({ width: inner, height: inner, fit: "inside" }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#ffffff" } })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(`public/icon-${size}.png`);
}
console.log("Logo and icons written to public/");
