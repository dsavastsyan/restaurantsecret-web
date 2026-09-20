export function formatDescription(text: unknown, fallback = "") {
  if (typeof text !== "string") return fallback;
  const normalized = text.trim();
  if (!normalized) return fallback;
  if (normalized.toLowerCase() === "nan") return fallback;
  return normalized;
}

export function getRussianPluralWord(
  count: number,
  one: string,
  few: string,
  many: string
): string {
  const value = Math.abs(Number(count)) % 100;
  const lastDigit = value % 10;

  if (value >= 11 && value <= 14) return many;
  if (lastDigit === 1) return one;
  if (lastDigit >= 2 && lastDigit <= 4) return few;
  return many;
}

const RU_STOP_WORDS = new Set([
  "и",
  "в",
  "во",
  "на",
  "с",
  "со",
  "к",
  "ко",
  "по",
  "за",
  "из",
  "под",
  "над",
  "для",
  "от",
  "до",
  "о",
  "об",
  "обо",
  "у",
  "а",
  "но",
  "или",
]);

const RU_ADJECTIVE_ENDINGS = [
  "ого",
  "его",
  "ому",
  "ему",
  "ыми",
  "ими",
  "ый",
  "ий",
  "ой",
  "ое",
  "ее",
  "ая",
  "яя",
  "ую",
  "юю",
  "ых",
  "их",
  "ым",
  "им",
  "ом",
  "ем",
];

const RU_COMMON_ENDINGS = [
  "ами",
  "ями",
  "ях",
  "ах",
  "ам",
  "ям",
  "ов",
  "ев",
  "ом",
  "ем",
  "ой",
  "ей",
  "ия",
  "ие",
  "ию",
  "иям",
  "иях",
  "а",
  "я",
  "ы",
  "и",
  "у",
  "ю",
  "е",
  "о",
];

function normalizeSearchText(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function transliterateCyrillicToLatin(input: string): string {
  const map: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "kh",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "shch",
    ы: "y",
    э: "e",
    ю: "yu",
    я: "ya",
  };

  return input
    .split("")
    .map((char) => map[char] ?? char)
    .join("");
}

function transliterateLatinToCyrillic(input: string): string {
  const map: [string, string][] = [
    ["shch", "щ"],
    ["zh", "ж"],
    ["kh", "х"],
    ["ts", "ц"],
    ["ch", "ч"],
    ["sh", "ш"],
    ["yo", "е"],
    ["yu", "ю"],
    ["ya", "я"],
    ["ye", "е"],
    ["e", "е"],
    ["y", "й"],
    ["a", "а"],
    ["b", "б"],
    ["v", "в"],
    ["g", "г"],
    ["d", "д"],
    ["z", "з"],
    ["i", "и"],
    ["k", "к"],
    ["l", "л"],
    ["m", "м"],
    ["n", "н"],
    ["o", "о"],
    ["p", "п"],
    ["r", "р"],
    ["s", "с"],
    ["t", "т"],
    ["u", "у"],
    ["f", "ф"],
  ];

  let idx = 0;
  let result = "";

  while (idx < input.length) {
    const substring = input.slice(idx);
    const match = map.find(([latin]) => substring.startsWith(latin));

    if (match) {
      result += match[1];
      idx += match[0].length;
    } else {
      result += substring[0];
      idx += 1;
    }
  }

  return result;
}

function buildTokenVariants(token: string): string[] {
  const variants = new Set<string>();
  const add = (value: string) => {
    const normalized = normalizeSearchText(value).replace(/\s+/g, "");
    if (!normalized) return;

    variants.add(normalized);

    const stem = stemRussianToken(normalized);
    if (stem) variants.add(stem);
  };

  add(token);
  add(transliterateCyrillicToLatin(token));
  add(transliterateLatinToCyrillic(token));

  return Array.from(variants);
}

function tokenizeSearchText(text: string): string[] {
  if (!text) return [];
  return normalizeSearchText(text)
    .split(" ")
    .map((v) => v.trim())
    .filter((v) => v.length >= 2 && !RU_STOP_WORDS.has(v));
}

function stripEnding(token: string, endings: string[], minStem = 4): string {
  for (const ending of endings) {
    if (!token.endsWith(ending)) continue;
    const stem = token.slice(0, -ending.length);
    if (stem.length >= minStem) return stem;
  }
  return token;
}

function stemRussianToken(token: string): string {
  if (!/^[а-я]+$/iu.test(token)) return token;

  const fromAdjective = stripEnding(token, RU_ADJECTIVE_ENDINGS, 4);
  if (fromAdjective !== token) return fromAdjective;

  const fromCommon = stripEnding(token, RU_COMMON_ENDINGS, 4);
  if (fromCommon !== token) return fromCommon;

  if (/[аеёиоуыэюя]$/iu.test(token) && token.length >= 5) {
    return token.slice(0, -1);
  }

  return token;
}

function almostEqualByPrefix(a: string, b: string): boolean {
  const minLen = Math.min(a.length, b.length);
  if (minLen < 5) return false;

  let prefix = 0;
  while (prefix < minLen && a[prefix] === b[prefix]) {
    prefix += 1;
  }
  return prefix >= minLen - 1;
}

function isNearSubsequence(queryToken: string, targetToken: string): boolean {
  if (queryToken.length < 4 || targetToken.length < 4) return false;
  if (Math.abs(queryToken.length - targetToken.length) > 2) return false;

  const shorter = queryToken.length <= targetToken.length ? queryToken : targetToken;
  const longer = queryToken.length <= targetToken.length ? targetToken : queryToken;
  let cursor = 0;

  for (const char of longer) {
    if (char === shorter[cursor]) cursor += 1;
    if (cursor === shorter.length) return true;
  }

  return false;
}

function boundedEditDistance(a: string, b: string, maxDistance: number): number {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = current[0];

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
      current[j] = value;
      rowMin = Math.min(rowMin, value);
    }

    if (rowMin > maxDistance) return maxDistance + 1;
    previous = current;
  }

  return previous[b.length];
}

function isNearEditMatch(queryToken: string, targetToken: string): boolean {
  const minLen = Math.min(queryToken.length, targetToken.length);
  if (minLen < 4) return false;

  const maxDistance = minLen <= 4 ? 2 : 1;
  return boundedEditDistance(queryToken, targetToken, maxDistance) <= maxDistance;
}

function tokenVariantMatches(queryToken: string, targetToken: string): boolean {
  if (!queryToken || !targetToken) return false;
  if (targetToken.includes(queryToken) || queryToken.includes(targetToken)) return true;
  if (almostEqualByPrefix(queryToken, targetToken)) return true;
  if (isNearSubsequence(queryToken, targetToken)) return true;
  if (isNearEditMatch(queryToken, targetToken)) return true;

  return false;
}

function tokenMatches(queryToken: string, targetToken: string): boolean {
  const queryVariants = buildTokenVariants(queryToken);
  const targetVariants = buildTokenVariants(targetToken);

  return queryVariants.some((queryVariant) =>
    targetVariants.some((targetVariant) => tokenVariantMatches(queryVariant, targetVariant))
  );
}

/**
 * Flexible search matcher for dish names:
 * - ignores word order
 * - tolerates common Russian inflections
 * - matches Latin/Cyrillic transliteration both ways
 * - tolerates 1-char ending differences (e.g. "капучина" -> "капучино")
 * - tolerates one or two missing letters (e.g. "пста" -> "паста")
 */
export function matchesSearchQuery(candidate: unknown, query: unknown): boolean {
  const candidateText = typeof candidate === "string" ? candidate : "";
  const queryText = typeof query === "string" ? query : "";
  const normalizedQuery = normalizeSearchText(queryText);

  const qTokens = tokenizeSearchText(queryText);
  if (!qTokens.length) {
    if (!normalizedQuery) return true;
    return normalizeSearchText(candidateText).includes(normalizedQuery);
  }

  const cTokens = tokenizeSearchText(candidateText);
  if (!cTokens.length) return false;

  return qTokens.every((qToken) => cTokens.some((cToken) => tokenMatches(qToken, cToken)));
}

function tokenMatchScore(queryToken: string, targetToken: string): number {
  if (!queryToken || !targetToken) return 0;
  if (queryToken === targetToken) return 100;
  if (targetToken.startsWith(queryToken)) return 80;
  if (targetToken.includes(queryToken)) return 60;
  if (queryToken.includes(targetToken)) return 45;
  if (almostEqualByPrefix(queryToken, targetToken)) return 35;
  if (isNearEditMatch(queryToken, targetToken)) return 25;
  if (isNearSubsequence(queryToken, targetToken)) return 15;

  return 0;
}

function bestTokenScore(queryToken: string, targetToken: string): number {
  const queryVariants = buildTokenVariants(queryToken);
  const targetVariants = buildTokenVariants(targetToken);
  let best = 0;

  for (const queryVariant of queryVariants) {
    for (const targetVariant of targetVariants) {
      best = Math.max(best, tokenMatchScore(queryVariant, targetVariant));
    }
  }

  return best;
}

export function getSearchQueryScore(candidate: unknown, query: unknown): number {
  const candidateText = typeof candidate === "string" ? candidate : "";
  const queryText = typeof query === "string" ? query : "";
  const normalizedCandidate = normalizeSearchText(candidateText);
  const normalizedQuery = normalizeSearchText(queryText);

  if (!normalizedQuery) return 0;
  if (!normalizedCandidate) return Number.NEGATIVE_INFINITY;

  const compactCandidate = normalizedCandidate.replace(/\s+/g, "");
  const compactQuery = normalizedQuery.replace(/\s+/g, "");

  if (normalizedCandidate === normalizedQuery || compactCandidate === compactQuery) {
    return 10000;
  }

  let phraseScore = 0;
  if (normalizedCandidate.startsWith(normalizedQuery)) {
    phraseScore = 9000;
  } else if (normalizedCandidate.includes(` ${normalizedQuery}`)) {
    phraseScore = 8200;
  } else if (normalizedCandidate.includes(normalizedQuery)) {
    phraseScore = 7600;
  } else if (compactCandidate.includes(compactQuery)) {
    phraseScore = 7000;
  }

  const qTokens = tokenizeSearchText(queryText);
  const cTokens = tokenizeSearchText(candidateText);
  if (!qTokens.length || !cTokens.length) return phraseScore;

  let tokenScore = 0;
  for (const qToken of qTokens) {
    let best = 0;
    for (const cToken of cTokens) {
      best = Math.max(best, bestTokenScore(qToken, cToken));
    }
    if (best <= 0) return phraseScore || Number.NEGATIVE_INFINITY;
    tokenScore += best;
  }

  const averageTokenScore = tokenScore / qTokens.length;
  const coverageBonus = qTokens.length > 1 ? qTokens.length * 10 : 0;

  return Math.max(phraseScore, 1000 + averageTokenScore + coverageBonus);
}
