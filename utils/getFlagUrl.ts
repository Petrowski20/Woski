// Subdivision flags not decodable from regional indicators
const SUBDIVISION_MAP: Record<string, string> = {
  '🏴󠁧󠁢󠁥󠁮󠁧󠁿': 'gb-eng',
  '🏴󠁧󠁢󠁳󠁣󠁴󠁿': 'gb-sct',
  '🏴󠁧󠁢󠁷󠁬󠁳󠁿': 'gb-wls',
};

/**
 * Converts a flag emoji to a FlagCDN image URL.
 * Standard flag emojis encode the ISO 3166-1 alpha-2 code as a pair of
 * Regional Indicator characters (U+1F1E6–U+1F1FF), so no lookup table is needed.
 */
export function getFlagUrl(flagEmoji: string): string {
  if (!flagEmoji) return '';

  if (SUBDIVISION_MAP[flagEmoji]) {
    return `https://flagcdn.com/w40/${SUBDIVISION_MAP[flagEmoji]}.png`;
  }

  const codePoints = [...flagEmoji].map(c => c.codePointAt(0) ?? 0);
  if (
    codePoints.length === 2 &&
    codePoints[0] >= 0x1f1e6 && codePoints[0] <= 0x1f1ff &&
    codePoints[1] >= 0x1f1e6 && codePoints[1] <= 0x1f1ff
  ) {
    const code = String.fromCharCode(
      codePoints[0] - 0x1f1e6 + 65,
      codePoints[1] - 0x1f1e6 + 65,
    ).toLowerCase();
    return `https://flagcdn.com/w40/${code}.png`;
  }

  return '';
}
