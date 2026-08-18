/**
 * Korean is not written the way it is spoken, and speech recognition writes what it hears. 민락수변공원
 * is pronounced [밀락수변공원] and came back spelled that way; 동래역 is pronounced [동내역] and came
 * back as 동내역. Neither is a mishearing — each is the pronunciation, spelled out. The rules that
 * produce them are regular, so they can be run forwards and backwards.
 *
 * Forwards gives a pronunciation key: run both a heard name and a search result through the same
 * sound changes and 민락수변공원 meets 밀락수변공원 on the same key, so the map's answer can be
 * recognised as the answer without demanding the two be spelled alike.
 *
 * Backwards gives spellings to search under. It matters because the phonetic spelling can be a query
 * no map answers at all — 동내역 came back as a 503, while 동래역 returns the station on the first
 * result. Confusions that are not phonology, like the 남포동 heard as 난포동, are generated too but
 * never share a key, so they arrive as a question rather than a silent correction.
 */

const SYLLABLE_BASE = 0xac00;
const SYLLABLE_LAST = 0xd7a3;
const MEDIAL_COUNT = 21;
const FINAL_COUNT = 28;

/** Indices into the Unicode jamo tables, named where a rule refers to them. */
const INITIAL_N = 2;
const INITIAL_R = 5;
const FINAL_K = 1;
const FINAL_N = 4;
const FINAL_L = 8;
const FINAL_M = 16;
const FINAL_P = 17;
const FINAL_NG = 21;

/** ㅏ vs ㅐ is a vowel; ㅐ vs ㅔ has not been one for most speakers in a long time. */
const MERGED_VOWELS: readonly (readonly number[])[] = [
  [1, 5], // ㅐ ㅔ
  [3, 7], // ㅒ ㅖ
  [10, 11, 15], // ㅙ ㅚ ㅞ
];

/** A coda that turns a following ㄹ into ㄴ (비음화): 동래 is said 동내, 종로 is said 종노. */
const NASALISING_FINALS = new Set([FINAL_NG, FINAL_M, FINAL_K, FINAL_P]);

/** Codas people and recognisers swap for one another. Not a rule, an ear: 남포동 heard as 난포동. */
const CONFUSABLE_FINALS = [FINAL_N, FINAL_M, FINAL_NG];

/** More than a handful of spellings stops being a second guess and becomes a sweep of the map. */
export const MAX_SPOKEN_NAME_VARIANTS = 6;

type Syllable = { initial: number; medial: number; final: number };

function isSyllable(code: number) {
  return code >= SYLLABLE_BASE && code <= SYLLABLE_LAST;
}

function decompose(code: number): Syllable {
  const offset = code - SYLLABLE_BASE;
  return {
    initial: Math.floor(offset / (MEDIAL_COUNT * FINAL_COUNT)),
    medial: Math.floor(offset / FINAL_COUNT) % MEDIAL_COUNT,
    final: offset % FINAL_COUNT,
  };
}

function compose({ initial, medial, final }: Syllable) {
  return String.fromCharCode(SYLLABLE_BASE + (initial * MEDIAL_COUNT + medial) * FINAL_COUNT + final);
}

/**
 * A name as a sequence of positions, where a Hangul syllable carries its three parts and anything
 * else — a digit, a Latin letter, a space — is carried through untouched so the rules can look at
 * neighbours without losing the rest of the name.
 */
type Position = { syllable: Syllable | null; text: string };

function readPositions(name: string): Position[] {
  return [...name].map((character) => {
    const code = character.charCodeAt(0);
    return isSyllable(code) ? { syllable: decompose(code), text: character } : { syllable: null, text: character };
  });
}

function writePositions(positions: Position[]) {
  return positions.map((position) => (position.syllable ? compose(position.syllable) : position.text)).join('');
}

/**
 * How the name is said, not how it is spelled. Two names with the same key are the same word: one
 * of them was written by someone who knows the spelling and the other by something that only heard it.
 */
export function pronunciationKey(name: string) {
  // The map annotates what it returns — 동래역[부산지하철1호선] is the station, with the line it is
  // on written after it. That is the map talking, not part of the name anyone says.
  const bare = name.replace(/[[(<][^\])>]*[\])>]/g, '').replace(/\s+/g, '');
  const positions = readPositions(bare);
  for (let index = 1; index < positions.length; index += 1) {
    const previous = positions[index - 1].syllable;
    const current = positions[index].syllable;
    if (!previous || !current) continue;
    // 유음화: ㄴ next to ㄹ is said ㄹ. 민락 → 밀락, 광안리 → 광알리, 칼날 → 칼랄.
    if (previous.final === FINAL_N && current.initial === INITIAL_R) previous.final = FINAL_L;
    else if (previous.final === FINAL_L && current.initial === INITIAL_N) current.initial = INITIAL_R;
    // 비음화: ㄹ after a stop or a nasal is said ㄴ. 동래 → 동내, 종로 → 종노.
    else if (current.initial === INITIAL_R && NASALISING_FINALS.has(previous.final)) current.initial = INITIAL_N;
  }
  for (const position of positions) {
    if (!position.syllable) continue;
    const merged = MERGED_VOWELS.find((group) => group.includes(position.syllable!.medial));
    if (merged) position.syllable.medial = merged[0];
  }
  return writePositions(positions).toLowerCase();
}

/** Whether two names are the same word said aloud, however they were spelled. */
export function soundsLikeSpokenPlace(left: string, right: string) {
  const key = pronunciationKey(left);
  return key.length > 0 && key === pronunciationKey(right);
}

/** How short a name has to be before finding it inside another one means nothing. */
const MIN_CONTAINED_SYLLABLES = 2;

/**
 * Whether a name is spoken inside a longer one: the map answers 남포동 with 중구 남포동 and 광안리 with
 * 광안리해수욕장. Close enough to put in front of someone, never close enough to fill in for them —
 * 광안리해수욕장 is a place at 광안리, not the word 광안리.
 */
export function spokenPlaceContains(candidateName: string, spokenName: string) {
  const spoken = pronunciationKey(spokenName);
  if ([...spoken].length < MIN_CONTAINED_SYLLABLES) return false;
  return pronunciationKey(candidateName).includes(spoken);
}

type Edit = { index: number; syllable: Syllable };

/**
 * Spellings the heard name could have been written as, best guesses first: the regular sound changes
 * run backwards, then the codas an ear confuses. Each is a single change, because a name needing two
 * corrections at once is a name to ask about rather than to guess at.
 */
export function spokenNameVariants(name: string, limit = MAX_SPOKEN_NAME_VARIANTS) {
  const positions = readPositions(name);
  const edits: Edit[] = [];

  for (let index = 0; index < positions.length; index += 1) {
    const current = positions[index].syllable;
    if (!current) continue;
    const previous = index > 0 ? positions[index - 1].syllable : null;
    const next = index + 1 < positions.length ? positions[index + 1].syllable : null;

    // 비음화 backwards: a ㄴ heard after ㅇㅁㄱㅂ may have been written ㄹ. 동내역 → 동래역.
    if (current.initial === INITIAL_N && previous && NASALISING_FINALS.has(previous.final)) {
      edits.push({ index, syllable: { ...current, initial: INITIAL_R } });
    }
    // 유음화 backwards: a ㄹㄹ heard across two syllables may have been written ㄴㄹ or ㄹㄴ.
    if (current.final === FINAL_L && next?.initial === INITIAL_R) {
      edits.push({ index, syllable: { ...current, final: FINAL_N } });
    }
    if (current.initial === INITIAL_R && previous?.final === FINAL_L) {
      edits.push({ index, syllable: { ...current, initial: INITIAL_N } });
    }
  }

  // Ranked after the rules: these are guesses about an ear, not reversals of a sound change.
  for (let index = 0; index < positions.length; index += 1) {
    const current = positions[index].syllable;
    if (!current || !CONFUSABLE_FINALS.includes(current.final)) continue;
    for (const final of CONFUSABLE_FINALS) {
      if (final !== current.final) edits.push({ index, syllable: { ...current, final } });
    }
  }

  const variants: string[] = [];
  const seen = new Set([pronunciationKey(name), name]);
  for (const edit of edits) {
    // ㅐ and ㅔ spell the same sound, so a corrected syllable is offered under both. It is not a
    // second guess: without it 동네역 can only reach 동레역, and never the station it means.
    for (const syllable of vowelSpellings(edit.syllable)) {
      const spelled = writePositions(positions.map((position, index) => (
        index === edit.index ? { syllable, text: position.text } : position
      )));
      if (spelled === name || seen.has(spelled)) continue;
      seen.add(spelled);
      variants.push(spelled);
      if (variants.length >= limit) return variants;
    }
  }
  return variants;
}

function vowelSpellings(syllable: Syllable) {
  const merged = MERGED_VOWELS.find((group) => group.includes(syllable.medial));
  if (!merged) return [syllable];
  return [syllable, ...merged.filter((medial) => medial !== syllable.medial).map((medial) => ({ ...syllable, medial }))];
}

