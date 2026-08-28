import fs from "node:fs";
import path from "node:path";

const SRC = "/tmp/zipich/tarix_strukturali_json";
const OUT = "/workspace/server/textbook_imports";
fs.mkdirSync(OUT, { recursive: true });

const manifest = [
  ["5-sinf 5-Sinf Tarixdan hikoyalar_strukturali.json", "5_sinf_tarixdan_hikoyalar.json", "Tarixdan hikoyalar (5-sinf)", "5", ""],
  ["6 sinf tarix yangi darslik 2022 yil_strukturali.json", "6_sinf_tarix_2022.json", "Tarix yangi darslik (6-sinf, 2022)", "6", "2022"],
  ["7 jahon 2022_strukturali.json", "7_sinf_jahon_tarixi_2022.json", "Jahon tarixi (7-sinf, 2022)", "7", "2022"],
  ["7 uzb 2022 tahrir_strukturali.json", "7_sinf_uzbekiston_tarixi_2022.json", "O‘zbekiston tarixi (7-sinf, 2022)", "7", "2022"],
  ["8 jahon 2024 ttomchi_strukturali.json", "8_sinf_jahon_tarixi_2024.json", "Jahon tarixi (8-sinf, 2024)", "8", "2024"],
  ["O‘zbekiston tarixi (8 sinf)_strukturali.json", "8_sinf_uzbekiston_tarixi.json", "O‘zbekiston tarixi (8-sinf)", "8", ""],
  ["9 jahon 2024__strukturali.json", "9_sinf_jahon_tarixi_2024.json", "Jahon tarixi (9-sinf, 2024)", "9", "2024"],
  ["9-sinf O‘zbek tarixi 2024_strukturali.json", "9_sinf_uzbekiston_tarixi_2024.json", "O‘zbekiston tarixi (9-sinf, 2024)", "9", "2024"],
  ["10-sinf O'zbekiston tarixi (@testlider)_strukturali.json", "10_sinf_uzbekiston_tarixi.json", "O‘zbekiston tarixi (10-sinf)", "10", ""],
  ["10-sinf Jahon tarixi 2022-yil nashri_strukturali.json", "10_sinf_jahon_tarixi_2022.json", "Jahon tarixi (10-sinf, 2022)", "10", "2022"],
  ["Jahon_tarixi_strukturali.json", "10_sinf_jahon_tarixi_keng.json", "Jahon tarixi (10-sinf, batafsil)", "10", ""],
  ["11-sinf O'zb tarixi (2025)_strukturali.json", "11_sinf_uzbekiston_tarixi_2025.json", "O‘zbekiston tarixi (11-sinf, 2025)", "11", "2025"],
  ["11-sinf jahon tarixi (2025)_strukturali.json", "11_sinf_jahon_tarixi_2025.json", "Jahon tarixi (11-sinf, 2025)", "11", "2025"],
];

fs.writeFileSync(
  path.join(OUT, "manifest.json"),
  JSON.stringify(manifest.map((m) => ({ file: m[1], title: m[2], grade: m[3], edition_year: m[4] })), null, 1)
);

for (const [src, dst] of manifest) {
  fs.copyFileSync(path.join(SRC, src), path.join(OUT, dst));
  console.log("nusxalandi:", dst);
}
console.log("jami:", manifest.length);
