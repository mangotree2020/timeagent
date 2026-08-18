import {
  MAX_SPOKEN_NAME_VARIANTS,
  pronunciationKey,
  soundsLikeSpokenPlace,
  spokenNameVariants,
  spokenPlaceContains,
} from '../place-transcription';

describe('pronunciationKey', () => {
  // Every pair below is one word: the left spelling is what the recogniser wrote after hearing it,
  // the right spelling is what the map calls it. All of them were recorded as failures.
  it.each([
    ['밀락수변공원', '민락수변공원'],
    ['동내역', '동래역'],
    ['광알리', '광안리'],
    ['종노', '종로'],
    ['실라호텔', '신라호텔'],
  ])('reads %s and %s as the same word', (heard, written) => {
    expect(pronunciationKey(heard)).toBe(pronunciationKey(written));
    expect(soundsLikeSpokenPlace(heard, written)).toBe(true);
  });

  it('treats ㅐ and ㅔ as the one sound they have become', () => {
    expect(soundsLikeSpokenPlace('동네역', '동래역')).toBe(true);
    expect(soundsLikeSpokenPlace('해운대', '헤운대')).toBe(true);
  });

  it('keeps different places apart, including the ones that only look close', () => {
    // 남포동 came back as 난포동, which is an ear and not a sound change — it must stay a question.
    expect(soundsLikeSpokenPlace('난포동', '남포동')).toBe(false);
    expect(soundsLikeSpokenPlace('서면역', '역삼역')).toBe(false);
    expect(soundsLikeSpokenPlace('부산역', '구산역')).toBe(false);
    expect(soundsLikeSpokenPlace('초원', '초읍')).toBe(false);
  });

  it('ignores spacing, which speech never supplies the same way twice', () => {
    expect(soundsLikeSpokenPlace('서울 시청', '서울시청')).toBe(true);
  });

  it('has nothing to say about an empty name', () => {
    expect(soundsLikeSpokenPlace('', '')).toBe(false);
    expect(soundsLikeSpokenPlace('   ', '민락수변공원')).toBe(false);
  });

  it('carries through what is not Hangul instead of dropping it', () => {
    expect(pronunciationKey('CGV 서면')).toContain('CGV'.toLowerCase());
    expect(soundsLikeSpokenPlace('부산역 1번출구', '부산역 1번출구')).toBe(true);
  });

  it('drops the note the map writes after a name', () => {
    // Every station the search returns is annotated with its line. Nobody says that part aloud, and
    // matching on it is why a correctly heard 동래역 never matched the station called 동래역.
    expect(soundsLikeSpokenPlace('동래역[부산지하철1호선]', '동래역')).toBe(true);
    expect(soundsLikeSpokenPlace('동래역[부산지하철1호선]', '동내역')).toBe(true);
    expect(soundsLikeSpokenPlace('서면역[부산지하철2호선]', '서면역')).toBe(true);
    expect(soundsLikeSpokenPlace('서울시청(본관)', '서울시청')).toBe(true);
  });
});

describe('spokenPlaceContains', () => {
  it('finds the name inside the longer one the map returned', () => {
    expect(spokenPlaceContains('중구 남포동', '남포동')).toBe(true);
    expect(spokenPlaceContains('광안리해수욕장', '광안리')).toBe(true);
    expect(spokenPlaceContains('민락수변공원 주차장', '밀락수변공원')).toBe(true);
  });

  it('will not let a syllable or two match half the map', () => {
    expect(spokenPlaceContains('국제식품초원농원 양정점', '초')).toBe(false);
    expect(spokenPlaceContains('부산역', '')).toBe(false);
  });

  it('is not the same question as whether two names are one word', () => {
    // 광안리해수욕장 is a place at 광안리, not the word 광안리 — enough to offer, not to fill in.
    expect(soundsLikeSpokenPlace('광안리해수욕장', '광안리')).toBe(false);
  });
});

describe('spokenNameVariants', () => {
  it('recovers the spelling a sound change hid', () => {
    // 동내역 is not merely a bad query — the map answered it with an error, and 동래역 with the station.
    expect(spokenNameVariants('동내역')).toContain('동래역');
    expect(spokenNameVariants('동네역')).toContain('동래역');
    expect(spokenNameVariants('밀락수변공원')).toContain('민락수변공원');
    expect(spokenNameVariants('광알리')).toContain('광안리');
  });

  it('offers the coda an ear confuses, which no sound change would produce', () => {
    expect(spokenNameVariants('난포동')).toContain('남포동');
  });

  it('puts the sound changes before the guesses', () => {
    const variants = spokenNameVariants('동내역');

    // 동래역 reverses a rule; 동내욕/동내영 only swap a coda. The rule goes first or the search
    // budget is spent before reaching it.
    expect(variants[0]).toBe('동래역');
  });

  it('never offers the name it was given, or the same spelling twice', () => {
    const variants = spokenNameVariants('민락수변공원');

    expect(variants).not.toContain('민락수변공원');
    expect(new Set(variants).size).toBe(variants.length);
  });

  it('stays within a budget a search can afford', () => {
    expect(spokenNameVariants('난포동').length).toBeLessThanOrEqual(MAX_SPOKEN_NAME_VARIANTS);
    expect(spokenNameVariants('동내역', 2)).toHaveLength(2);
  });

  it('has nothing to offer where there is nothing to correct', () => {
    expect(spokenNameVariants('')).toEqual([]);
    expect(spokenNameVariants('CGV')).toEqual([]);
    expect(spokenNameVariants('서구')).toEqual([]);
  });
});
