// Clé stable d'une règle d'identification manuelle.
// Même normalisation que le matching TMDB : casse, accents et ponctuation
// n'empêchent pas une règle de s'appliquer aux prochaines releases.
function matchRuleTitleKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchRuleYear(value) {
  const year = String(value ?? '').trim();
  return /^\d{4}$/.test(year) ? year : '';
}

// Articles seuls ou titres trop courts : une règle sur ces titres capterait
// des releases sans rapport (ex. « The » issu d'un nom de release tronqué).
const GENERIC_WORDS = new Set([
  'the', 'a', 'an', 'le', 'la', 'les', 'l', 'un', 'une', 'des', 'de', 'du',
  'der', 'die', 'das', 'ein', 'eine', 'el', 'los', 'las', 'il', 'lo', 'i'
]);

function isSpecificRuleTitle(titleKey) {
  const key = matchRuleTitleKey(titleKey);
  if (key.length < 3) return false;
  return key.split(' ').some(word => !GENERIC_WORDS.has(word));
}

module.exports = { matchRuleTitleKey, matchRuleYear, isSpecificRuleTitle };
