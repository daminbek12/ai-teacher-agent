const MAP = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "x", ҳ: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "'", ь: "", ы: "i", э: "e", ю: "yu", я: "ya", ў: "o'", қ: "q", "ғ": "g'",
  ә: "a", ұ: "u", ү: "u", ө: "o", ў: "o'", ң: "ng", і: "i", һ: "h",
};

const UPPER = {};
for (const [k, v] of Object.entries(MAP)) {
  UPPER[k.toLocaleUpperCase("en-US")] = v;
}

function capFirst(v, wasUpper, prevLetter) {
  if (!wasUpper) return v;
  if (/^[aeiouo'yghn]+/i.test(v) && v.length > 1) {
    return v.charAt(0).toUpperCase() + v.slice(1);
  }
  return v.charAt(0).toUpperCase() + v.slice(1);
}

export function cyrToLatUz(text) {
  if (!text) return "";
  let out = "";
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const lower = ch.toLocaleLowerCase("en-US");
    if (ch === "е" || ch === "Е") {
      const prev = i > 0 ? chars[i - 1] : "";
      const atWordStart = i === 0 || !/[a-zA-Zа-яА-ЯёЁ0-9ўқғҳәұүөңі']/.test(prev);
      const v = atWordStart ? "ye" : "e";
      out += capFirst(v, ch === "Е", prev);
      continue;
    }
    const v = MAP[lower];
    if (v === undefined) {
      out += ch;
      continue;
    }
    out += capFirst(v, ch !== lower, chars[i - 1] || "");
  }
  return out.replace(/\s{2,}/g, " ").replace(/'{2,}/g, "'");
}

export function isCyrillic(text) {
  return /[а-яА-ЯёЁўқғҳәұүөңіӨӘҚҒҲЎҰҮ]*[а-яА-ЯёЁўқғҳәұүөңі]/.test(text) && !/[a-zA-Z]{8,}/.test(text.slice(0, 40));
}

export function latinifyChunk(content) {
  const cleaned = content.replace(/^-- SAHIFA \d+ --\s*/gm, "").replace(/^-- \d+ of \d+ --\s*/gm, "").trim();
  return cyrToLatUz(cleaned);
}
