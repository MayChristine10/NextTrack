const express = require("express");
const cors = require("cors");

const {
    searchSong,
    buildCandidatePool
} = require("./services/musicbrainz");

const {
    recommendTracks
} = require("./services/recommendationEngine");

const {
    saveMetadataToCache,
    getCachedMetadata,
    saveSearchHistory,
    getSearchHistory,
    getStats,
    saveFavorite,
    getFavorites,
    deleteFavorite
} = require("./database/database");


const app = express();


// =========================================================
// MIDDLEWARE
// =========================================================

app.use(cors());
app.use(express.json());
app.use(express.static("public"));


// =========================================================
// SEARCH FOR A SONG
// =========================================================

app.get("/api/search", async (req, res) => {

    const song = req.query.song;

    if (!song || !song.trim()) {

        return res.status(400).json({
            error: "Please provide a song name."
        });

    }


    try {

        const results =
            await searchSong(
                song.trim()
            );


        res.json({

            query:
                song.trim(),

            results:
                results.map(track => ({

                    id:
                        track.id,

                    title:
                        track.title,

                    artist:
                        track["artist-credit"]?.[0]?.artist?.name ||
                        track["artist-credit"]?.[0]?.name ||
                        "Unknown artist",

                    score:
                        Number(track.score) || 0

                }))

        });


    } catch (error) {

        console.error(
            "Search endpoint error:",
            error.message
        );


        res.status(500).json({

            error:
                "Unable to search for the song."

        });

    }

});


// =========================================================
// GENERATE RECOMMENDATIONS
// =========================================================

app.post("/api/recommend", async (req, res) => {

    const {

        song,

        genre = "",

        mood = "",

        artist = "",

        limit = 5

    } = req.body;


// -----------------------------------------------------
// SONG IS THE ONLY REQUIRED FIELD
// -----------------------------------------------------

    if (
        !song ||
        !song.trim()
    ) {

        return res.status(400).json({

            error:
                "Please provide at least one song."

        });

    }


    try {

// -------------------------------------------------
// CLEAN CURRENT REQUEST
// -------------------------------------------------

        const cleanInput = {

            song:
                song.trim(),

            artist:
                artist
                    ? artist.trim()
                    : "",

            genre:
                genre
                    ? genre.trim()
                    : "",

            mood:
                mood
                    ? mood.trim()
                    : ""

        };


// -------------------------------------------------
// IDENTIFY SEED + BUILD CANDIDATE POOL
// -------------------------------------------------

        const poolResult =
    await buildCandidatePool({

        song:
            cleanInput.song,

        artist:
            cleanInput.artist,

        genre:
            cleanInput.genre,

        mood:
            cleanInput.mood

    });


// -------------------------------------------------
// NO SEED FOUND
// -------------------------------------------------

        if (!poolResult.seed) {

            return res.status(404).json({

                error:
                    `MusicBrainz could not find the song "${cleanInput.song}". Please check the song title and try again.`

            });

        }


// -------------------------------------------------
// SONG + ARTIST COULD NOT BE VERIFIED
//
// Example:
// The user means LISA from BLACKPINK,
// but MusicBrainz cannot confidently connect the
// entered song with that artist.
//
// In this case we STOP rather than silently selecting
// another artist such as Lisa Lisa.
// -------------------------------------------------

        if (poolResult.validationError) {

            return res.status(400).json({

                error:
                    poolResult.validationError,

                input: {
                    ...cleanInput
                },

                possibleMatch: {

                    title:
                        poolResult.seed.title,

                    artist:
                        poolResult.seed.artist

                }

            });

        }


        const candidates =
            poolResult.candidates || [];


// -------------------------------------------------
// NO RECOMMENDATION CANDIDATES
// -------------------------------------------------

        if (candidates.length === 0) {

            return res.status(404).json({

                error:
                    "The starting song was found, but no suitable recommendation candidates were available."

            });

        }


// -------------------------------------------------
// GENERATE RANKED RECOMMENDATIONS
// -------------------------------------------------

        
    const recommendations =
    recommendTracks(
        candidates,
        cleanInput.song,
        {
            genre:
                cleanInput.genre,

            mood:
                cleanInput.mood,

            artist:
                cleanInput.artist,

            limit:
                Number(limit),

            seed:
                poolResult.seed
        }
    );


// -------------------------------------------------
// SAVE RETURNED TRACK METADATA TO CACHE
// -------------------------------------------------

        recommendations.forEach(
            track => {

                saveMetadataToCache(
                    track
                );

            }
        );


// -------------------------------------------------
// SAVE SEARCH HISTORY
// -------------------------------------------------

        saveSearchHistory({

            song:
                cleanInput.song,

            genre:
                cleanInput.genre,

            mood:
                cleanInput.mood,

            artist:
                cleanInput.artist

        });


// -------------------------------------------------
// RETURN RESPONSE
// -------------------------------------------------

        res.json({

            input: {
                ...cleanInput
            },

            seed: {

                id:
                    poolResult.seed.id || null,
                title:
                    poolResult.seed.title,

                artist:
                    poolResult.seed.artist,

                artistId:
                    poolResult.seed.artistId,

                musicbrainzScore:
                    poolResult.seed.musicbrainzScore

            },


            candidateCount:
                candidates.length,


            recommendations

        });


    } catch (error) {

        console.error(
            "Recommendation endpoint error:",
            error
        );


        res.status(500).json({

            error:
                "Unable to generate recommendations at this time."

        });

    }

});


// =========================================================
// METADATA CACHE
// =========================================================

app.get("/api/cache", (req, res) => {

    getCachedMetadata(
        (err, rows) => {

            if (err) {

                return res.status(500).json({

                    error:
                        "Failed to retrieve cached metadata."

                });

            }


            res.json({

                cachedItems:
                    rows || []

            });

        }
    );

});


// =========================================================
// SEARCH HISTORY
// =========================================================

app.get("/api/history", (req, res) => {

    getSearchHistory(
        (err, rows) => {

            if (err) {

                return res.status(500).json({

                    error:
                        "Failed to retrieve search history."

                });

            }


            res.json({

                history:
                    rows || []

            });

        }
    );

});


// =========================================================
// PROTOTYPE STATISTICS
// =========================================================

app.get("/api/stats", (req, res) => {

    getStats(
        (err, stats) => {

            if (err) {

                return res.status(500).json({

                    error:
                        "Failed to retrieve statistics."

                });

            }


            res.json({

                stats:
                    stats || {}

            });

        }
    );

});


// =========================================================
// SAVE FAVORITE
// =========================================================

app.post("/api/favorites", (req, res) => {

    const {

        id,

        title,

        artist

    } = req.body;


    if (
        !title ||
        !artist
    ) {

        return res.status(400).json({

            error:
                "Missing favorite data."

        });

    }


    saveFavorite(

        {

            id,

            title,

            artist

        },

        (err) => {

            if (err) {

                console.error(
                    "Save favorite error:",
                    err
                );


                return res.status(500).json({

                    error:
                        "Failed to save favorite."

                });

            }


            res.json({

                message:
                    "Favorite saved successfully."

            });

        }

    );

});


// =========================================================
// GET FAVORITES
// =========================================================

app.get("/api/favorites", (req, res) => {

    getFavorites(
        (err, rows) => {

            if (err) {

                return res.status(500).json({

                    error:
                        "Failed to retrieve favorites."

                });

            }


            res.json({

                favorites:
                    rows || []

            });

        }
    );

});


// =========================================================
// DELETE FAVORITE
// =========================================================

app.delete(
    "/api/favorites/:id",

    (req, res) => {

        const favoriteId =
            req.params.id;


        deleteFavorite(

            favoriteId,

            (err) => {

                if (err) {

                    return res.status(500).json({

                        error:
                            "Failed to delete favorite."

                    });

                }


                res.json({

                    message:
                        "Favorite deleted successfully."

                });

            }

        );

    }
);


// =========================================================
// START SERVER
// =========================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});