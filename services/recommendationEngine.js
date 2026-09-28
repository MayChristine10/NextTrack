// =========================================================
// NextTrack Recommendation Engine
// =========================================================
//
// Purpose:
// Rank candidate tracks as possible NEXT songs.
//
// Recommendation priorities:
//
// 1. Similarity to the starting song / seed metadata
// 2. User genre preference
// 3. User mood preference
// 4. Artist preference 
// 5. MusicBrainz metadata relevance
//
// The engine does NOT recommend songs because their titles
// look similar to the song typed by the user.
//
// Maximum score:
// Seed/context similarity       40
// Genre preference             25
// Mood preference              15
// Artist preference            10
// MusicBrainz relevance        10
//                              ---
//                              100
//
// =========================================================


// =========================================================
// BASIC HELPERS
// =========================================================

function normalizeText(value) {
    return String(value || "")
        .toLowerCase()
        .trim()
        .replace(/[’']/g, "'")
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}


function unique(values = []) {
    return [
        ...new Set(
            values
                .map(value => normalizeText(value))
                .filter(Boolean)
        )
    ];
}


function textMatches(first, second) {
    const a = normalizeText(first);
    const b = normalizeText(second);

    if (!a || !b) {
        return false;
    }

    return (
        a === b ||
        a.includes(b) ||
        b.includes(a)
    );
}


function arraysOverlap(first = [], second = []) {
    const a = unique(first);
    const b = unique(second);

    return a.filter(value =>
        b.some(other =>
            value === other ||
            value.includes(other) ||
            other.includes(value)
        )
    );
}


// =========================================================
// ARTIST HELPERS
// =========================================================

function getArtistName(candidate) {
    return (
        candidate?.["artist-credit"]?.[0]?.artist?.name ||
        candidate?.["artist-credit"]?.[0]?.name ||
        candidate?.artist ||
        "Unknown artist"
    );
}


function getArtistId(candidate) {
    return (
        candidate?.["artist-credit"]?.[0]?.artist?.id ||
        candidate?.artistId ||
        null
    );
}


// =========================================================
// TITLE NORMALISATION
// =========================================================

function normalizeTitle(title) {
    let value = normalizeText(title);

    const removableWords = [
        "remix",
        "mix",
        "radio edit",
        "edit",
        "extended",
        "extended version",
        "live",
        "live version",
        "acoustic",
        "acoustic version",
        "remaster",
        "remastered",
        "remastered version",
        "instrumental",
        "karaoke",
        "demo",
        "version"
    ];

    removableWords.forEach(word => {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const pattern = new RegExp(
            `\\b${escaped}\\b`,
            "gi"
        );

        value = value.replace(pattern, " ");
    });

    return value
        .replace(/\s+/g, " ")
        .trim();
}


// =========================================================
// BAD / ALTERNATE VERSION FILTER
// =========================================================

function isAlternateVersion(title) {
    const value = normalizeText(title);

    if (!value) {
        return false;
    }

    const unwanted = [
        "remix",
        "extended mix",
        "extended version",
        "radio edit",
        "dj mix",
        "mashup",
        "karaoke",
        "instrumental",
        "demo",
        "live version",
        "acoustic version"
    ];

    return unwanted.some(term =>
        value.includes(term)
    );
}


// =========================================================
// DUPLICATE / INPUT SONG FILTER
// =========================================================

function removeDuplicatesAndInputSong(
    candidates,
    inputSong,
    seed = null
) {
    const inputTitle = normalizeTitle(inputSong);

    const seedTitle = normalizeTitle(
        seed?.title
    );

    const seedArtist = normalizeText(
        seed?.artist
    );

    const seen = new Set();
    const filtered = [];

    for (const candidate of candidates || []) {
        if (!candidate || !candidate.title) {
            continue;
        }

        const candidateTitle =
            normalizeTitle(candidate.title);

        const candidateArtist =
            normalizeText(
                getArtistName(candidate)
            );

        if (!candidateTitle) {
            continue;
        }

        // Remove exact input song.
        if (
            inputTitle &&
            candidateTitle === inputTitle
        ) {
            continue;
        }

        // Remove identified seed recording.
        if (
            seed?.id &&
            candidate.id === seed.id
        ) {
            continue;
        }

        // Remove same seed title by the seed artist.
        if (
            seedTitle &&
            candidateTitle === seedTitle &&
            (
                !seedArtist ||
                candidateArtist === seedArtist
            )
        ) {
            continue;
        }

        // Avoid obvious remix/mashup/etc. versions.
        if (isAlternateVersion(candidate.title)) {
            continue;
        }

        // Remove duplicate title + artist.
        const duplicateKey =
            `${candidateTitle}|${candidateArtist}`;

        if (seen.has(duplicateKey)) {
            continue;
        }

        seen.add(duplicateKey);
        filtered.push(candidate);
    }

    return filtered;
}


// =========================================================
// CANDIDATE METADATA
// =========================================================

function candidateGenres(candidate) {
    return unique(
        candidate?.genres || []
    );
}


function candidateTags(candidate) {
    return unique(
        candidate?.tags || []
    );
}


function candidateDiscoveryTerms(candidate) {
    return unique(
        candidate?.discoveryTerms || []
    );
}


function candidateMetadata(candidate) {
    return unique([
        ...candidateGenres(candidate),
        ...candidateTags(candidate),
        ...candidateDiscoveryTerms(candidate)
    ]);
}


function candidateSources(candidate) {
    return unique(
        candidate?.candidateSources || []
    );
}


// =========================================================
// SEED METADATA
// =========================================================

function seedGenres(seed) {
    return unique(
        seed?.genres || []
    );
}


function seedTags(seed) {
    return unique(
        seed?.tags || []
    );
}


function seedDiscoveryTerms(seed) {
    return unique(
        seed?.discoveryTerms || []
    );
}


function seedMetadata(seed) {
    return unique([
        ...seedGenres(seed),
        ...seedTags(seed),
        ...seedDiscoveryTerms(seed)
    ]);
}


// =========================================================
// SEED / STARTING-TRACK SIMILARITY
// Maximum: 40
// =========================================================

function calculateSeedSimilarity(
    candidate,
    seed = {}
) {
    const candidateGenreList =
        candidateGenres(candidate);

    const candidateTagList =
        candidateTags(candidate);

    const candidateTerms =
        candidateMetadata(candidate);

    const seedGenreList =
        seedGenres(seed);

    const seedTagList =
        seedTags(seed);

    const seedTerms =
        seedMetadata(seed);

    const matchedGenres =
        arraysOverlap(
            seedGenreList,
            candidateGenreList
        );

    const matchedTags =
        arraysOverlap(
            seedTagList,
            candidateTagList
        );

    const matchedTerms =
        arraysOverlap(
            seedTerms,
            candidateTerms
        );

    const discoveryTerms =
        candidateDiscoveryTerms(candidate);

    const sources =
        candidateSources(candidate);

    let points = 0;

    // ---------------------------------------------
    // Strong evidence:
    // candidate and seed share genre metadata.
    // ---------------------------------------------
    if (matchedGenres.length > 0) {
        points += Math.min(
            24,
            18 +
            ((matchedGenres.length - 1) * 3)
        );
    }

    // ---------------------------------------------
    // Shared MusicBrainz tags.
    // ---------------------------------------------
    if (matchedTags.length > 0) {
        points += Math.min(
            10,
            6 +
            ((matchedTags.length - 1) * 2)
        );
    }

    // ---------------------------------------------
    // Other shared metadata terms.
    // ---------------------------------------------
    if (
        matchedTerms.length > 0 &&
        matchedGenres.length === 0 &&
        matchedTags.length === 0
    ) {
        points += Math.min(
            18,
            10 +
            ((matchedTerms.length - 1) * 2)
        );
    }

    // ---------------------------------------------
    // IMPORTANT:
    // Candidate was discovered using metadata from
    // the starting song.
    //
    // Current MusicBrainz service may use either:
    // "metadata" or "seed-metadata".
    // ---------------------------------------------
    const discoveredFromSeedMetadata =
        sources.includes("metadata") ||
        sources.includes("seed metadata") ||
        sources.includes("seed-metadata");

    if (discoveredFromSeedMetadata) {
        if (points === 0) {
            // still have evidence that this track was
            // retrieved through seed metadata even when
            // MusicBrainz has incomplete tags/genres.
            points = 20;
        } else {
            points += 6;
        }
    }

    // ---------------------------------------------
    // Discovery terms give additional evidence.
    // ---------------------------------------------
    if (
        discoveredFromSeedMetadata &&
        discoveryTerms.length > 0
    ) {
        points += 4;
    }

    return {
        points: Math.min(points, 40),

        matchedGenres,
        matchedTags,
        matchedTerms,

        discoveryTerms,

        discoveredFromSeedMetadata
    };
}


// =========================================================
// USER GENRE PREFERENCE
// Maximum: 25
// =========================================================

function calculateGenrePreference(
    candidate,
    requestedGenre
) {
    const genre =
        normalizeText(requestedGenre);

    if (!genre) {
        return {
            points: 0,
            matched: false,
            evidence: null
        };
    }

    const genres =
        candidateGenres(candidate);

    const tags =
        candidateTags(candidate);

    const discoveryTerms =
        candidateDiscoveryTerms(candidate);

    // Strongest evidence:
    // actual candidate genre.
    const directGenreMatch =
        genres.some(value =>
            textMatches(value, genre)
        );

    if (directGenreMatch) {
        return {
            points: 25,
            matched: true,
            evidence: "genre"
        };
    }

    // Tag can also provide genre-like metadata.
    const tagMatch =
        tags.some(value =>
            textMatches(value, genre)
        );

    if (tagMatch) {
        return {
            points: 22,
            matched: true,
            evidence: "tag"
        };
    }

    // Candidate was discovered using the
    // user's requested genre.
    const discoveryMatch =
        discoveryTerms.some(value =>
            textMatches(value, genre)
        );

    if (discoveryMatch) {
        return {
            points: 18,
            matched: true,
            evidence: "discovery"
        };
    }

    return {
        points: 0,
        matched: false,
        evidence: null
    };
}


// =========================================================
// MOOD HELPERS
// =========================================================
//
// MusicBrainz does not provide Spotify-style audio
// mood analysis.
//
// These groups only help normalise common words typed
// by users. A candidate still needs metadata/tag evidence.
// =========================================================

const MOOD_GROUPS = {
    romantic: [
        "romantic",
        "romance",
        "love",
        "love song",
        "love songs"
    ],

    happy: [
        "happy",
        "happiness",
        "cheerful",
        "joy",
        "joyful",
        "uplifting",
        "positive"
    ],

    sad: [
        "sad",
        "sadness",
        "melancholy",
        "melancholic",
        "emotional",
        "heartbreak",
        "heartbroken"
    ],

    energetic: [
        "energetic",
        "energy",
        "upbeat",
        "dance",
        "danceable"
    ],

    calm: [
        "calm",
        "relaxing",
        "relaxed",
        "soft",
        "peaceful",
        "chill"
    ],

    dark: [
        "dark",
        "moody",
        "dramatic",
        "atmospheric"
    ]
};


function normaliseMood(value) {
    const mood = normalizeText(value);

    if (!mood) {
        return "";
    }

    // Accept common plural input such as "romantics".
    if (
        mood === "romantics" ||
        mood === "romance"
    ) {
        return "romantic";
    }

    for (
        const [mainMood, words]
        of Object.entries(MOOD_GROUPS)
    ) {
        if (
            words.some(word =>
                textMatches(mood, word)
            )
        ) {
            return mainMood;
        }
    }

    return mood;
}


function moodTerms(value) {
    const mood =
        normaliseMood(value);

    if (!mood) {
        return [];
    }

    if (MOOD_GROUPS[mood]) {
        return unique([
            mood,
            ...MOOD_GROUPS[mood]
        ]);
    }

    return [mood];
}


// =========================================================
// USER MOOD PREFERENCE
// Maximum: 15
// =========================================================

function calculateMoodPreference(
    candidate,
    requestedMood
) {
    const mood =
        normaliseMood(requestedMood);

    if (!mood) {
        return {
            points: 0,
            matched: false,
            evidence: null,
            normalisedMood: ""
        };
    }

    const requestedTerms =
        moodTerms(mood);

    const genres =
        candidateGenres(candidate);

    const tags =
        candidateTags(candidate);

    const discoveryTerms =
        candidateDiscoveryTerms(candidate);

    const tagMatch =
        requestedTerms.some(term =>
            tags.some(value =>
                textMatches(value, term)
            )
        );

    if (tagMatch) {
        return {
            points: 15,
            matched: true,
            evidence: "tag",
            normalisedMood: mood
        };
    }

    const metadataMatch =
        requestedTerms.some(term =>
            genres.some(value =>
                textMatches(value, term)
            )
        );

    if (metadataMatch) {
        return {
            points: 12,
            matched: true,
            evidence: "metadata",
            normalisedMood: mood
        };
    }

    const discoveryMatch =
        requestedTerms.some(term =>
            discoveryTerms.some(value =>
                textMatches(value, term)
            )
        );

    if (discoveryMatch) {
        return {
            points: 10,
            matched: true,
            evidence: "discovery",
            normalisedMood: mood
        };
    }

    return {
        points: 0,
        matched: false,
        evidence: null,
        normalisedMood: mood
    };
}


// =========================================================
// USER ARTIST PREFERENCE
// Maximum: 10
// =========================================================
//
// IMPORTANT:
// Artist is only a small bonus.
//
// NextTrack should be allowed to recommend another artist
// when that song has stronger musical metadata similarity.
// =========================================================

function calculateArtistPreference(
    candidate,
    requestedArtist
) {
    const artist =
        normalizeText(requestedArtist);

    if (!artist) {
        return {
            points: 0,
            matched: false
        };
    }

    const candidateArtist =
        normalizeText(
            getArtistName(candidate)
        );

    if (!candidateArtist) {
        return {
            points: 0,
            matched: false
        };
    }

    const matched =
        candidateArtist === artist ||
        candidateArtist.includes(artist) ||
        artist.includes(candidateArtist);

    return {
        points: matched ? 10 : 0,
        matched
    };
}


// =========================================================
// MUSICBRAINZ RELEVANCE
// Maximum: 10
// =========================================================
//
// This is only a supporting signal.
//
// MusicBrainz search score should NOT be treated as
// musical similarity.
// =========================================================

function calculateMusicBrainzPoints(
    candidate
) {
    const relevance =
        Math.max(
            0,
            Math.min(
                100,
                Number(candidate?.score) || 0
            )
        );

    return Math.round(
        relevance * 0.10
    );
}


// =========================================================
// SCORE ONE CANDIDATE
// =========================================================

function calculateScore(
    candidate,
    preferences = {}
) {
    const seed =
        preferences.seed || {};

    const seedSimilarity =
        calculateSeedSimilarity(
            candidate,
            seed
        );

    const genrePreference =
        calculateGenrePreference(
            candidate,
            preferences.genre
        );

    const moodPreference =
        calculateMoodPreference(
            candidate,
            preferences.mood
        );

    const artistPreference =
        calculateArtistPreference(
            candidate,
            preferences.artist
        );

    const musicBrainzPoints =
        calculateMusicBrainzPoints(
            candidate
        );

    const total =
        Math.min(
            100,

            seedSimilarity.points +
            genrePreference.points +
            moodPreference.points +
            artistPreference.points +
            musicBrainzPoints
        );

    return {
        total,

        seedSimilarity,
        genrePreference,
        moodPreference,
        artistPreference,
        musicBrainzPoints
    };
}


// =========================================================
// EXPLANATION BUILDER
// =========================================================

function buildExplanation(
    candidate,
    preferences,
    scoreBreakdown
) {
    const reasons = [];

    const seedSimilarity =
        scoreBreakdown.seedSimilarity;

    // ---------------------------------------------
    // Shared genre with starting song
    // ---------------------------------------------
    if (
        seedSimilarity.matchedGenres.length > 0
    ) {
        reasons.push(
            `Shares genre metadata with the starting track: ${
                seedSimilarity.matchedGenres
                    .slice(0, 2)
                    .join(", ")
            }`
        );
    }

    // ---------------------------------------------
    // Shared tags with starting song
    // ---------------------------------------------
    if (
        seedSimilarity.matchedTags.length > 0
    ) {
        reasons.push(
            `Shares MusicBrainz tags with the starting track: ${
                seedSimilarity.matchedTags
                    .slice(0, 2)
                    .join(", ")
            }`
        );
    }

    // ---------------------------------------------
    // Candidate discovered using seed metadata
    // ---------------------------------------------
    if (
        seedSimilarity.discoveredFromSeedMetadata &&
        seedSimilarity.matchedGenres.length === 0 &&
        seedSimilarity.matchedTags.length === 0
    ) {
        if (
            seedSimilarity.discoveryTerms.length > 0
        ) {
            reasons.push(
                `Discovered through metadata from the starting track: ${
                    seedSimilarity.discoveryTerms
                        .slice(0, 2)
                        .join(", ")
                }`
            );
        } else {
            reasons.push(
                "Discovered using metadata related to the starting track"
            );
        }
    }

    // ---------------------------------------------
    // User genre preference
    // ---------------------------------------------
    if (
        preferences.genre &&
        scoreBreakdown.genrePreference.matched
    ) {
        reasons.push(
            `Matches your genre preference: ${preferences.genre}`
        );
    }

    // ---------------------------------------------
    // User mood preference
    // ---------------------------------------------
    if (
        preferences.mood &&
        scoreBreakdown.moodPreference.matched
    ) {
        reasons.push(
            `Matches available metadata for your mood preference: ${
                scoreBreakdown.moodPreference.normalisedMood ||
                preferences.mood
            }`
        );
    }

    // ---------------------------------------------
    // User artist preference
    // ---------------------------------------------
    if (
        preferences.artist &&
        scoreBreakdown.artistPreference.matched
    ) {
        reasons.push(
            `Also matches your artist preference: ${preferences.artist}`
        );
    }

    // ---------------------------------------------
    // Release metadata
    // ---------------------------------------------
    if (
        candidate?.releaseTitle &&
        reasons.length < 3
    ) {
        reasons.push(
            `Release metadata: ${candidate.releaseTitle}`
        );
    }

    // ---------------------------------------------
    // MusicBrainz relevance
    // ---------------------------------------------
    const relevance =
        Math.max(
            0,
            Math.min(
                100,
                Number(candidate?.score) || 0
            )
        );

    reasons.push(
        `MusicBrainz metadata relevance: ${relevance}/100`
    );

    return reasons.slice(0, 4);
}


// =========================================================
// RECOMMENDATION QUALITY
// =========================================================
//
// do not want MusicBrainz search relevance alone to
// create a recommendation.
//
// A candidate should have at least some recommendation
// evidence whenever that evidence is available.
// =========================================================

function hasRecommendationEvidence(
    item,
    preferences
) {
    const breakdown =
        item.scoreBreakdown || {};

    const sources =
        unique(
            item.candidateSources || []
        );

    const releaseTitle =
        normalizeText(
            item.releaseTitle || ""
        );

    // ---------------------------------------------
    // 1. Reject obviously unsuitable releases
    // ---------------------------------------------
    const unwantedReleaseTerms = [
        "karaoke",
        "tribute",
        "instrumental",
        "remix",
        "remixes",
        "live album",
        "greatest karaoke",
        "backing track"
    ];

    const badRelease =
        unwantedReleaseTerms.some(term =>
            releaseTitle.includes(term)
        );

    if (badRelease) {
        return false;
    }

    // ---------------------------------------------
    // 2. Strongest evidence:
    // actual relationship with the starting track
    // ---------------------------------------------
    const hasSeedEvidence =
        Number(
            breakdown.seedMetadata || 0
        ) > 0;

    if (hasSeedEvidence) {
        return true;
    }

    // ---------------------------------------------
    // 3. User mood evidence is useful because it
    // provides another signal beyond broad genre.
    // ---------------------------------------------
    const hasMoodEvidence =
        Number(
            breakdown.mood || 0
        ) > 0;

    if (hasMoodEvidence) {
        return true;
    }

    // ---------------------------------------------
    // 4. Same artist is acceptable supporting
    // evidence, but diversity is handled later.
    // ---------------------------------------------
    const hasArtistEvidence =
        Number(
            breakdown.artist || 0
        ) > 0;

    if (hasArtistEvidence) {
        return true;
    }

    // ---------------------------------------------
    // 5. Genre alone can be weak.
    //
    // A broad search such as "pop" should not make
    // an unrelated track a strong recommendation
    // simply because MusicBrainz returned it.
    //
    // Require enriched candidate metadata when
    // genre is the only recommendation signal.
    // ---------------------------------------------
    const hasGenreEvidence =
        Number(
            breakdown.genre || 0
        ) > 0;

    const hasActualMetadata =
        (item.genres || []).length > 0 ||
        (item.tags || []).length > 0;

    if (
        hasGenreEvidence &&
        hasActualMetadata
    ) {
        return true;
    }

    // ---------------------------------------------
    // MusicBrainz search relevance by itself is
    // NOT musical similarity.
    // ---------------------------------------------
    return false;
}

function selectDiverseRecommendations(
    ranked,
    limit
) {
    const selected = [];
    const artistCounts = new Map();

    // First pass:
    // maximum two tracks from one artist.
    for (const item of ranked) {
        if (selected.length >= limit) {
            break;
        }

        const artist =
            normalizeText(item.artist) ||
            "unknown";

        const count =
            artistCounts.get(artist) || 0;

        if (count >= 2) {
            continue;
        }

        selected.push(item);

        artistCounts.set(
            artist,
            count + 1
        );
    }

    // Fill remaining positions if necessary.
    if (selected.length < limit) {
        for (const item of ranked) {
            if (selected.length >= limit) {
                break;
            }

            const alreadySelected =
                selected.some(
                    selectedItem =>
                        selectedItem.id === item.id
                );

            if (!alreadySelected) {
                selected.push(item);
            }
        }
    }

    return selected;
}


// =========================================================
// MAIN RECOMMENDATION FUNCTION
// =========================================================

function recommendTracks(
    candidates,
    inputSong,
    preferences = {}
) {
    const requestedLimit =
        Math.max(
            1,
            Math.min(
                10,
                Number(preferences.limit) || 5
            )
        );

    const seed =
        preferences.seed || {};

    // ---------------------------------------------
    // Clean candidate pool
    // ---------------------------------------------
    const cleanedCandidates =
        removeDuplicatesAndInputSong(
            candidates || [],
            inputSong,
            seed
        );

    // ---------------------------------------------
    // Score candidates
    // ---------------------------------------------
    let scored =
        cleanedCandidates.map(candidate => {
            const breakdown =
                calculateScore(
                    candidate,
                    preferences
                );

            return {
                id:
                    candidate.id,

                title:
                    candidate.title ||
                    "Unknown title",

                artist:
                    getArtistName(candidate),

                artistId:
                    getArtistId(candidate),

                score:
                    breakdown.total,

                musicbrainzScore:
                    Number(
                        candidate.score
                    ) || 0,

                genres:
                    candidateGenres(candidate),

                tags:
                    candidateTags(candidate),

                releaseTitle:
                    candidate.releaseTitle ||
                    null,

                releaseDate:
                    candidate.releaseDate ||
                    null,

                candidateSources:
                    candidate.candidateSources ||
                    [],

                discoveryTerms:
                    candidate.discoveryTerms ||
                    [],

                reasons:
                    buildExplanation(
                        candidate,
                        preferences,
                        breakdown
                    ),

                scoreBreakdown: {
                    seedMetadata:
                        breakdown
                            .seedSimilarity
                            .points,

                    genre:
                        breakdown
                            .genrePreference
                            .points,

                    mood:
                        breakdown
                            .moodPreference
                            .points,

                    artist:
                        breakdown
                            .artistPreference
                            .points,

                    musicbrainz:
                        breakdown
                            .musicBrainzPoints
                }
            };
        });

    // ---------------------------------------------
    // Prefer candidates with actual recommendation
    // evidence.
    // ---------------------------------------------
    const evidenceBased =
        scored.filter(item =>
            hasRecommendationEvidence(
                item,
                preferences
            )
        );

    // Only use the stricter evidence-based set if
    // there are enough useful candidates.
    //
    // Otherwise keep the complete pool so incomplete
    // MusicBrainz metadata does not produce an empty UI.
    if (evidenceBased.length > 0) {
    scored = evidenceBased;
    }

    // ---------------------------------------------
    // Sort strongest recommendation first
    // ---------------------------------------------
    scored.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }

        // Seed similarity is the most important
        // tie breaker.
        if (
            b.scoreBreakdown.seedMetadata !==
            a.scoreBreakdown.seedMetadata
        ) {
            return (
                b.scoreBreakdown.seedMetadata -
                a.scoreBreakdown.seedMetadata
            );
        }

        // Then genre.
        if (
            b.scoreBreakdown.genre !==
            a.scoreBreakdown.genre
        ) {
            return (
                b.scoreBreakdown.genre -
                a.scoreBreakdown.genre
            );
        }

        // Then mood.
        if (
            b.scoreBreakdown.mood !==
            a.scoreBreakdown.mood
        ) {
            return (
                b.scoreBreakdown.mood -
                a.scoreBreakdown.mood
            );
        }

        // MusicBrainz relevance is only the final
        // tie breaker.
        return (
            b.musicbrainzScore -
            a.musicbrainzScore
        );
    });

    // ---------------------------------------------
    // Diversity
    // ---------------------------------------------
    return selectDiverseRecommendations(
        scored,
        requestedLimit
    );
}


// =========================================================
// EXPORTS
// =========================================================

module.exports = {
    recommendTracks,
    removeDuplicatesAndInputSong,
    calculateScore
};