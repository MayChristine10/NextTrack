const axios = require("axios");

const BASE_URL = "https://musicbrainz.org/ws/2";

const HEADERS = {
    "User-Agent": "NextTrack/1.0 (student-project)"
};


// =========================================================
// HELPERS
// =========================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


function cleanText(value) {
    return String(value || "")
        .toLowerCase()
        .trim();
}


function getArtistName(recording) {
    return (
        recording?.["artist-credit"]?.[0]?.artist?.name ||
        recording?.["artist-credit"]?.[0]?.name ||
        "Unknown artist"
    );
}


function getArtistId(recording) {
    return (
        recording?.["artist-credit"]?.[0]?.artist?.id ||
        null
    );
}


// =========================================================
// MUSICBRAINZ REQUEST CONTROL
// =========================================================


let lastMusicBrainzRequestAt = 0;


async function musicBrainzGet(
    url,
    config = {},
    maxRetries = 2
) {
    for (
        let attempt = 0;
        attempt <= maxRetries;
        attempt++
    ) {
        const elapsed =
            Date.now() -
            lastMusicBrainzRequestAt;

        const waitTime =
            Math.max(
                0,
                1100 - elapsed
            );

        if (waitTime > 0) {
            await sleep(waitTime);
        }


        try {
            lastMusicBrainzRequestAt =
                Date.now();


            const response =
                await axios.get(
                    url,
                    {
                        ...config,

                        timeout: 15000,

                        headers: {
                            ...HEADERS,
                            ...(config.headers || {})
                        }
                    }
                );


            return response;

        } catch (error) {
            const status =
                error.response?.status;


            const retryable =
                status === 429 ||
                status === 502 ||
                status === 503 ||
                status === 504 ||
                error.code === "ECONNABORTED" ||
                error.code === "ETIMEDOUT";


            if (
                !retryable ||
                attempt === maxRetries
            ) {
                throw error;
            }


            const retryAfter =
                Number(
                    error.response
                        ?.headers
                        ?.["retry-after"]
                );


            const delay =
                Number.isFinite(retryAfter) &&
                retryAfter > 0
                    ? retryAfter * 1000
                    : 1500 * (attempt + 1);


            console.log(
                `MusicBrainz temporary error` +
                `${status ? ` ${status}` : ""}. ` +
                `Retrying (${attempt + 1}/${maxRetries})...`
            );


            await sleep(delay);
        }
    }


    throw new Error(
        "MusicBrainz request failed."
    );
}


// =========================================================
// SEARCH SONG
// =========================================================


async function searchSong(
    songName,
    artistName = ""
) {
    if (
        !songName ||
        !String(songName).trim()
    ) {
        return [];
    }


    try {
        let query =
            `recording:"${String(songName).trim()}"`;


        if (
            artistName &&
            String(artistName).trim()
        ) {
            query +=
                ` AND artist:"${String(artistName).trim()}"`;
        }


        const response =
            await musicBrainzGet(
                `${BASE_URL}/recording`,
                {
                    params: {
                        query,
                        fmt: "json",
                        limit: 15
                    }
                }
            );


        return (
            response?.data?.recordings ||
            []
        );

    } catch (error) {
        console.error(
            "MusicBrainz song search error:",
            error.message
        );

        return [];
    }
}


// =========================================================
// FIND STARTING / SEED RECORDING
// =========================================================

async function findSeedRecording(
    songName,
    artistName = ""
) {
    const clean = value =>
        String(value || "")
            .toLowerCase()
            .trim()
            .replace(/[’']/g, "'");


    const requestedSong =
        clean(songName);

    const requestedArtist =
        clean(artistName);


    // =====================================================
    // SONG + ARTIST
    // =====================================================

    if (artistName) {
        const results =
            await searchSong(
                songName,
                artistName
            );


        if (
            !results ||
            results.length === 0
        ) {
            return {
                recording: null,

                title:
                    songName,

                artist:
                    "",

                artistId:
                    null,

                musicbrainzScore:
                    0,

                artistVerified:
                    false
            };
        }


        const valid =
            results.filter(recording => {
                const title =
                    clean(recording.title);

                const resultArtist =
                    clean(
                        getArtistName(
                            recording
                        )
                    );


                const titleMatches =
                    title === requestedSong ||
                    title.includes(
                        requestedSong
                    ) ||
                    requestedSong.includes(
                        title
                    );


                const artistMatches =
                    resultArtist ===
                        requestedArtist ||

                    resultArtist.includes(
                        requestedArtist
                    ) ||

                    requestedArtist.includes(
                        resultArtist
                    );


                return (
                    titleMatches &&
                    artistMatches
                );
            });


        if (valid.length === 0) {
            return {
                recording: null,

                title:
                    songName,

                artist:
                    "",

                artistId:
                    null,

                musicbrainzScore:
                    0,

                artistVerified:
                    false
            };
        }


        valid.sort(
            (a, b) =>
                (Number(b.score) || 0) -
                (Number(a.score) || 0)
        );


        const seed =
            valid[0];


        return {
            recording:
                seed,

            title:
                seed.title ||
                songName,

            artist:
                getArtistName(seed),

            artistId:
                getArtistId(seed),

            musicbrainzScore:
                Number(seed.score) || 0,

            artistVerified:
                true
        };
    }


    // =====================================================
    // TITLE ONLY
    // =====================================================

    const results =
        await searchSong(songName);


    if (
        !results ||
        results.length === 0
    ) {
        return null;
    }


    let exactTitleResults =
        results.filter(
            recording =>
                clean(recording.title) ===
                requestedSong
        );


    if (
        exactTitleResults.length === 0
    ) {
        exactTitleResults =
            results.filter(recording => {
                const title =
                    clean(recording.title);


                return (
                    title.includes(
                        requestedSong
                    ) ||
                    requestedSong.includes(
                        title
                    )
                );
            });
    }


    if (
        exactTitleResults.length === 0
    ) {
        return null;
    }


    // Count how often each artist appears for the exact title.
    const artistCounts = {};


    exactTitleResults.forEach(
        recording => {
            const artist =
                clean(
                    getArtistName(
                        recording
                    )
                );


            if (!artist) {
                return;
            }


            artistCounts[artist] =
                (
                    artistCounts[artist] ||
                    0
                ) + 1;
        }
    );


    // Rank possible seed recordings.
    const ranked =
        exactTitleResults.map(
            recording => {
                const artist =
                    clean(
                        getArtistName(
                            recording
                        )
                    );


                const mbScore =
                    Number(
                        recording.score
                    ) || 0;


                const appearances =
                    artistCounts[artist] ||
                    0;


                const releases =
                    Array.isArray(
                        recording.releases
                    )
                        ? recording.releases
                        : [];


                let identificationScore =
                    0;


                if (
                    clean(
                        recording.title
                    ) === requestedSong
                ) {
                    identificationScore +=
                        100;
                }


                identificationScore +=
                    Math.round(
                        mbScore * 0.35
                    );


                identificationScore +=
                    Math.min(
                        appearances * 12,
                        48
                    );


                if (
                    releases.length > 0
                ) {
                    identificationScore +=
                        10;
                }


                if (
                    releases.length >= 2
                ) {
                    identificationScore +=
                        8;
                }


                if (
                    releases.length >= 4
                ) {
                    identificationScore +=
                        7;
                }


                return {
                    recording,
                    identificationScore,
                    mbScore,
                    appearances,
                    releaseCount:
                        releases.length
                };
            }
        );


    ranked.sort(
        (a, b) => {
            if (
                b.identificationScore !==
                a.identificationScore
            ) {
                return (
                    b.identificationScore -
                    a.identificationScore
                );
            }


            if (
                b.appearances !==
                a.appearances
            ) {
                return (
                    b.appearances -
                    a.appearances
                );
            }


            if (
                b.releaseCount !==
                a.releaseCount
            ) {
                return (
                    b.releaseCount -
                    a.releaseCount
                );
            }


            return (
                b.mbScore -
                a.mbScore
            );
        }
    );


    const best =
        ranked[0];

    const seed =
        best.recording;


    return {
        recording:
            seed,

        title:
            seed.title ||
            songName,

        artist:
            getArtistName(seed),

        artistId:
            getArtistId(seed),

        musicbrainzScore:
            Number(seed.score) || 0,

        artistVerified:
            true,

        identificationScore:
            best.identificationScore
    };
}


// =========================================================
// SEARCH BY ARTIST ID
// =========================================================

async function searchArtistRecordingsById(
    artistId
) {
    if (!artistId) {
        return [];
    }


    try {
        const response =
            await musicBrainzGet(
                `${BASE_URL}/recording`,
                {
                    params: {
                        query:
                            `arid:${artistId}`,

                        fmt:
                            "json",

                        limit:
                            25
                    }
                }
            );


        return (
            response?.data?.recordings ||
            []
        );

    } catch (error) {
        console.error(
            "Artist recording search error:",
            error.message
        );

        return [];
    }
}


// =========================================================
// SEARCH BY ARTIST NAME
// =========================================================

async function searchArtistRecordings(
    artistName
) {
    if (!artistName) {
        return [];
    }


    try {
        const response =
            await musicBrainzGet(
                `${BASE_URL}/recording`,
                {
                    params: {
                        query:
                            `artist:"${artistName}"`,

                        fmt:
                            "json",

                        limit:
                            25
                    }
                }
            );


        return (
            response?.data?.recordings ||
            []
        );

    } catch (error) {
        console.error(
            "Artist name search error:",
            error.message
        );

        return [];
    }
}


// =========================================================
// SEARCH BY GENRE / TAG
// =========================================================

async function searchGenreRecordings(genre) {
    if (!genre) {
        return [];
    }

    try {
        const cleanGenre = String(genre).trim();

        const query = [
            `tag:"${cleanGenre}"`,
            `NOT secondarytype:live`,
            `NOT secondarytype:remix`,
            `NOT secondarytype:demo`,
            `NOT secondarytype:interview`,
            `NOT secondarytype:spokenword`
        ].join(" AND ");

        const response = await musicBrainzGet(
            `${BASE_URL}/recording`,
            {
                params: {
                    query,
                    fmt: "json",
                    limit: 25
                }
            }
        );

        const recordings =
            response?.data?.recordings || [];

        const unwantedTerms = [
            "karaoke",
            "instrumental",
            "remix",
            "extended mix",
            "radio edit",
            "live version",
            "acoustic version",
            "demo",
            "tribute"
        ];

        return recordings.filter(recording => {
            const title =
                cleanText(recording?.title);

            if (!title) {
                return false;
            }

            return !unwantedTerms.some(term =>
                title.includes(term)
            );
        });

    } catch (error) {
        console.error(
            "Genre search error:",
            error.message
        );

        return [];
    }
}


// =========================================================
// GET RECORDING METADATA
// =========================================================

async function getRecordingMetadata(
    recordingId
) {
    if (!recordingId) {
        return null;
    }


    try {
        const response =
            await musicBrainzGet(
                `${BASE_URL}/recording/${recordingId}`,
                {
                    params: {
                        inc:
                            "genres+tags+releases+release-groups+artist-credits",

                        fmt:
                            "json"
                    }
                }
            );


        return (
            response?.data ||
            null
        );

    } catch (error) {
        console.error(
            `Metadata lookup failed for ${recordingId}:`,
            error.message
        );

        return null;
    }
}


// =========================================================
// EXTRACT TAGS
// =========================================================

function extractTags(metadata) {
    if (!metadata) {
        return [];
    }


    const tags = [];


    if (
        Array.isArray(
            metadata.tags
        )
    ) {
        metadata.tags.forEach(
            tag => {
                if (tag?.name) {
                    tags.push(
                        cleanText(
                            tag.name
                        )
                    );
                }
            }
        );
    }


    return [
        ...new Set(
            tags.filter(Boolean)
        )
    ];
}


// =========================================================
// EXTRACT GENRES
// =========================================================

function extractGenres(metadata) {
    if (!metadata) {
        return [];
    }


    const genres = [];


    if (
        Array.isArray(
            metadata.genres
        )
    ) {
        metadata.genres.forEach(
            genre => {
                if (genre?.name) {
                    genres.push(
                        cleanText(
                            genre.name
                        )
                    );
                }
            }
        );
    }


    return [
        ...new Set(
            genres.filter(Boolean)
        )
    ];
}


// =========================================================
// EXTRACT RELEASE INFO
// =========================================================

function extractReleaseInfo(
    metadata
) {
    if (
        !metadata ||
        !Array.isArray(
            metadata.releases
        ) ||
        metadata.releases.length === 0
    ) {
        return {
            releaseTitle:
                null,

            releaseDate:
                null
        };
    }


    const release =
        metadata.releases[0];


    return {
        releaseTitle:
            release.title ||
            null,

        releaseDate:
            release.date ||
            null
    };
}


// =========================================================
// ADD CANDIDATE
// =========================================================

function addCandidate(
    candidateMap,
    track,
    source,
    discoveryTerm = null
) {
    if (!track?.id) {
        return;
    }


    if (
        candidateMap.has(
            track.id
        )
    ) {
        const existing =
            candidateMap.get(
                track.id
            );


        if (
            !existing
                .candidateSources
                .includes(source)
        ) {
            existing
                .candidateSources
                .push(source);
        }


        if (
            discoveryTerm &&
            !existing
                .discoveryTerms
                .includes(discoveryTerm)
        ) {
            existing
                .discoveryTerms
                .push(discoveryTerm);
        }


        if (
            Number(
                track.score || 0
            ) >
            Number(
                existing.score || 0
            )
        ) {
            existing.score =
                track.score;
        }


        return;
    }


    candidateMap.set(
        track.id,
        {
            ...track,

            candidateSources: [
                source
            ],

            discoveryTerms:
                discoveryTerm
                    ? [discoveryTerm]
                    : [],

            tags: [],

            genres: [],

            releaseTitle:
                null,

            releaseDate:
                null,

            metadataEnriched:
                false
        }
    );
}


// =========================================================
// ENRICH CANDIDATES
// =========================================================

async function enrichCandidates(
    candidates,
    maximum = 10
) {
    const sorted = [
        ...candidates
    ];

    sorted.sort(
        (a, b) => {
            const sourceDifference =
                (
                    b
                        .candidateSources
                        ?.length ||
                    0
                ) -
                (
                    a
                        .candidateSources
                        ?.length ||
                    0
                );


            if (
                sourceDifference !== 0
            ) {
                return sourceDifference;
            }


            return (
                Number(
                    b.score || 0
                ) -
                Number(
                    a.score || 0
                )
            );
        }
    );


    const shortlist =
        sorted.slice(
            0,
            maximum
        );


    const remaining =
        sorted.slice(
            maximum
        );


    const enriched = [];


    for (
        const candidate of
        shortlist
    ) {
        const metadata =
            await getRecordingMetadata(
                candidate.id
            );


        if (!metadata) {
            enriched.push(
                candidate
            );

            continue;
        }


        const releaseInfo =
            extractReleaseInfo(
                metadata
            );


        enriched.push({
            ...candidate,

            tags:
                extractTags(
                    metadata
                ),

            genres:
                extractGenres(
                    metadata
                ),

            releaseTitle:
                releaseInfo
                    .releaseTitle,

            releaseDate:
                releaseInfo
                    .releaseDate,

            metadataEnriched:
                true
        });
    }


    return [
        ...enriched,
        ...remaining
    ];
}


// =========================================================
// SEED METADATA CONTEXT
// =========================================================

async function discoverSeedContext(seed) {
    if (!seed?.recording?.id) {
        return {
            genres: [],
            tags: [],
            discoveryTerms: []
        };
    }

    try {
        const metadata =
            await getRecordingMetadata(
                seed.recording.id
            );

        if (!metadata) {
            return {
                genres: [],
                tags: [],
                discoveryTerms: []
            };
        }

        const genres =
            extractGenres(metadata);

        const tags =
            extractTags(metadata);

        const ignoredTerms =
            new Set([
                "seen live",
                "favorites",
                "favourite",
                "favorite",
                "male vocalists",
                "female vocalists",
                "english",
                "american",
                "british",
                "albums i own",
                "songs i own",
                "spotify",
                "lastfm",
                "music",
                "songs",
                "track"
            ]);

        const broadTerms =
            new Set([
                "pop",
                "rock",
                "alternative",
                "electronic",
                "dance",
                "indie",
                "country",
                "folk",
                "jazz",
                "metal",
                "punk",
                "soul",
                "r&b",
                "hip hop",
                "rap"
            ]);

        function useful(term) {
            const value =
                cleanText(term);

            return (
                value &&
                !ignoredTerms.has(value)
            );
        }

        function specificityScore(term) {
            const value =
                cleanText(term);

            if (!value) {
                return 0;
            }

            
            if (broadTerms.has(value)) {
                return 1;
            }

            const words =
                value
                    .split(/\s+/)
                    .filter(Boolean);

            
            if (words.length >= 2) {
                return 4;
            }

           
            return 3;
        }

        const cleanGenres =
            [...new Set(
                genres
                    .map(cleanText)
                    .filter(useful)
            )];

        const cleanTags =
            [...new Set(
                tags
                    .map(cleanText)
                    .filter(useful)
            )];

        // -------------------------------------------------
        // Build possible discovery terms.
        // -------------------------------------------------
        const termMap =
            new Map();

        cleanGenres.forEach(term => {
            termMap.set(
                term,
                {
                    term,
                    type: "genre",
                    score:
                        specificityScore(term) + 1
                }
            );
        });

        cleanTags.forEach(term => {
            const score =
                specificityScore(term);

            const existing =
                termMap.get(term);

            if (
                !existing ||
                score > existing.score
            ) {
                termMap.set(
                    term,
                    {
                        term,
                        type: "tag",
                        score
                    }
                );
            }
        });

        const rankedTerms =
            [...termMap.values()]
                .sort((a, b) => {
                    if (b.score !== a.score) {
                        return b.score - a.score;
                    }

                   
                    return (
                        a.term.length -
                        b.term.length
                    );
                });

      
        const specificTerms =
            rankedTerms.filter(
                item =>
                    !broadTerms.has(
                        cleanText(item.term)
                    )
            );

        const broadFallbackTerms =
            rankedTerms.filter(
                item =>
                    broadTerms.has(
                        cleanText(item.term)
                    )
            );

        const selectedTerms = [];

        for (const item of specificTerms) {
            if (selectedTerms.length >= 3) {
                break;
            }

            selectedTerms.push(item.term);
        }

       
        for (const item of broadFallbackTerms) {
            if (selectedTerms.length >= 3) {
                break;
            }

            if (
                !selectedTerms.includes(
                    item.term
                )
            ) {
                selectedTerms.push(item.term);
            }
        }

        return {
            genres:
                cleanGenres,

            tags:
                cleanTags,

            discoveryTerms:
                selectedTerms
        };

    } catch (error) {
        console.error(
            "Seed context discovery error:",
            error.message
        );

        return {
            genres: [],
            tags: [],
            discoveryTerms: []
        };
    }
}

// =========================================================
// BUILD CANDIDATE POOL
// =========================================================

async function buildCandidatePool({
    song,
    artist = "",
    genre = "",
    mood = ""
}) {

    // -----------------------------------------------------
    // 1. IDENTIFY STARTING TRACK
    // -----------------------------------------------------

    const seed =
        await findSeedRecording(
            song,
            artist
        );


    if (
        !seed ||
        !seed.recording
    ) {
        if (artist) {
            return {
                seed: {
                    id: null,
                    title: song,
                    artist,
                    artistId: null,
                    musicbrainzScore: 0,
                    artistVerified: false,

                    genres: [],
                    tags: []
                },

                candidates: [],

                validationError:
                    `MusicBrainz could not confidently match "${song}" with artist "${artist}". Please check the song and artist name.`
            };
        }


        return {
            seed: null,
            candidates: []
        };
    }


    // -----------------------------------------------------
    // 2. DISCOVER STARTING TRACK METADATA
    // -----------------------------------------------------

    const seedContext =
        await discoverSeedContext(
            seed
        );


    const candidateMap =
        new Map();


    // -----------------------------------------------------
    // 3. SEED GENRE / TAG DISCOVERY
    // -----------------------------------------------------
    //
    // This replaces the old:
    //
    //     searchSong(song)
    //
    // recommendation behaviour.
    //
    // We are no longer looking for similar titles.
    // -----------------------------------------------------

    for (
        const term of
        seedContext.discoveryTerms
    ) {
        const tracks =
            await searchGenreRecordings(
                term
            );


        tracks.forEach(
            recording => {
                addCandidate(
                    candidateMap,
                    recording,
                    "seed-metadata",
                    term
                );
            }
        );
    }


    // -----------------------------------------------------
    // 4. USER-SUPPLIED GENRE
    // -----------------------------------------------------

    if (genre) {
        const genreCandidates =
            await searchGenreRecordings(
                genre
            );


        genreCandidates.forEach(
            recording => {
                addCandidate(
                    candidateMap,
                    recording,
                    "genre",
                    cleanText(genre)
                );
            }
        );
    }


    // -----------------------------------------------------
    // 5. USER-SUPPLIED MOOD
    // -----------------------------------------------------
  

    if (mood) {
        const moodCandidates =
            await searchGenreRecordings(
                mood
            );


        moodCandidates.forEach(
            recording => {
                addCandidate(
                    candidateMap,
                    recording,
                    "mood",
                    cleanText(mood)
                );
            }
        );
    }


    // -----------------------------------------------------
    // 6. USER-SUPPLIED ARTIST
    // -----------------------------------------------------

    if (
        artist &&
        seed.artistVerified &&
        seed.artistId
    ) {
        const artistCandidates =
            await searchArtistRecordingsById(
                seed.artistId
            );


        artistCandidates.forEach(
            recording => {
                addCandidate(
                    candidateMap,
                    recording,
                    "artist",
                    cleanText(artist)
                );
            }
        );
    }


    // -----------------------------------------------------
    // 7. FALLBACK
    // -----------------------------------------------------
 
 
    candidateMap.delete(
        seed.recording.id
    );


    let candidates =
        Array.from(
            candidateMap.values()
        );


    candidates =
        candidates.filter(
            candidate =>
                candidate &&
                candidate.id &&
                candidate.title
        );


    // -----------------------------------------------------
    // 8. ENRICH STRONGEST CANDIDATES
    // -----------------------------------------------------

    candidates =
        await enrichCandidates(
            candidates,
            15
        );


    // -----------------------------------------------------
    // 9. RETURN SEED + CANDIDATES
    // -----------------------------------------------------

    return {
        seed: {
            id:
                seed.recording.id,

            title:
                seed.title,

            artist:
                seed.artist,

            artistId:
                seed.artistId,

            musicbrainzScore:
                seed.musicbrainzScore,

            artistVerified:
                seed.artistVerified,

            // This is important for the NEW scoring engine.
            genres:
                seedContext.genres,

            tags:
                seedContext.tags,

            discoveryTerms:
                seedContext.discoveryTerms
        },

        candidates
    };
}


// =========================================================
// EXPORTS
// =========================================================

module.exports = {
    searchSong,
    findSeedRecording,
    searchArtistRecordings,
    searchArtistRecordingsById,
    searchGenreRecordings,
    getRecordingMetadata,
    buildCandidatePool
};