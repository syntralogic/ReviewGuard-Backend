/**
 * Lightweight keyword heuristics that flag incoming Google reviews which
 * look like they violate Google's review policies. This is a first-pass
 * filter, not a verdict: flagged reviews land in "needs attention" for the
 * owner to check before reporting.
 */
export type RiskCategory =
  | "spam"
  | "irrelevant"
  | "harassment"
  | "offensive"
  | "promotional"
  | "conflict_of_interest";

const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|pk|xyz|shop|biz)\b)/i;
const PHONE_RE = /(\+?\d[\d\s-]{8,}\d)/;
const PROMO_RE = /\b(dm me|whatsapp|follow (me|us)|buy now|discount|promo code|cheap(est)?|limited offer|click (here|link)|visit my|subscribe)\b/i;
const OFFENSIVE_RE = /\b(idiots?|stupid|scum|trash|garbage people|disgusting|pathetic|morons?|useless people|f+u+c+k+|sh[i1]t|bastards?|bitch(es)?)\b/i;
const HARASS_RE = /\b(hope (your|the) business (fails|dies|burns|closes)|should be ashamed|kill yourself|i will (find|destroy|ruin) you|scammers?|fraudsters?)\b/i;
const IRRELEVANT_RE = /\b(never (even )?(visited|been|went|used|tried|ate|ordered)|haven'?t (been|visited|tried)|didn'?t (even )?(visit|go))\b/i;
const CONFLICT_RE = /\b(my (ex|competitor)|i (work|worked) (for|at) (a )?competitor|former employee|fired me|the owner (personally|is a))\b|don'?t like the owner/i;

export function detectRisks(text: string): RiskCategory[] {
  const found = new Set<RiskCategory>();
  if (URL_RE.test(text) || PHONE_RE.test(text)) found.add("spam");
  if (PROMO_RE.test(text)) {
    found.add("promotional");
    found.add("spam");
  }
  if (OFFENSIVE_RE.test(text)) found.add("offensive");
  if (HARASS_RE.test(text)) {
    found.add("harassment");
    found.add("offensive");
  }
  if (IRRELEVANT_RE.test(text)) found.add("irrelevant");
  if (CONFLICT_RE.test(text)) found.add("conflict_of_interest");
  return [...found];
}
