import express from "express";
import fs from "node:fs";
import { getShareFile, getTestByShareToken } from "../services/pdfHost.js";

const router = express.Router();

router.get("/share/pdf/:token", (req, res) => {
  const token = String(req.params.token || "");
  const file = getShareFile(token);
  if (file) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="test.pdf"');
    return fs.createReadStream(file).pipe(res);
  }
  const answers = token.endsWith("-a");
  const baseToken = answers ? token.slice(0, -2) : token;
  const test = getTestByShareToken(baseToken);
  const remote = answers ? test?.pdf_url_answers : test?.pdf_url;
  if (remote && /^https?:\/\//i.test(remote) && !remote.includes("/api/share/pdf/")) {
    return res.redirect(remote);
  }
  return res.status(404).json({ error: "Fayl topilmadi yoki muddati o'tgan" });
});

export default router;
