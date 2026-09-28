// =========================================================
// NEXTTRACK
// Frontend interaction and API communication
// =========================================================


// ---------------------------------------------------------
// PAGE ELEMENTS
// ---------------------------------------------------------

const recommendBtn = document.getElementById("recommendBtn");

const songInput = document.getElementById("song");
const artistInput = document.getElementById("artist");
const genreInput = document.getElementById("genre");
const moodInput = document.getElementById("mood");
const limitInput = document.getElementById("limit");

const resultsDiv = document.getElementById("results");
const historyDiv = document.getElementById("history");
const favoritesDiv = document.getElementById("favorites");
const statsDiv = document.getElementById("stats");

const errorMessage = document.getElementById("error-message");
const successMessage = document.getElementById("success-message");


// ---------------------------------------------------------
// SMALL HELPER
// Prevents API text from being inserted as raw HTML
// ---------------------------------------------------------

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


// ---------------------------------------------------------
// FORMAT DATE
// ---------------------------------------------------------

function formatDate(dateValue) {

    if (!dateValue) {
        return "";
    }

    const date = new Date(dateValue);

    // SQLite dates may not always be parsed by the browser.
    // If that happens, display the original database value.

    if (Number.isNaN(date.getTime())) {
        return dateValue;
    }

    return date.toLocaleString();
}


// ---------------------------------------------------------
// SUCCESS MESSAGE
// ---------------------------------------------------------

function showSuccess(message) {

    successMessage.textContent = message;
    successMessage.classList.add("show");

    setTimeout(() => {
        successMessage.classList.remove("show");
    }, 2500);
}


// ---------------------------------------------------------
// GENERATE RECOMMENDATIONS
// ---------------------------------------------------------

async function getRecommendations() {

    const song = songInput.value.trim();
    const artist = artistInput.value.trim();
    const genre = genreInput.value.trim();
    const mood = moodInput.value.trim();
    const limit = Number(limitInput.value);



    if (!song) {

        errorMessage.textContent =
            "Please enter a song title.";

        songInput.focus();

        return;
    }


    errorMessage.textContent = "";


    // Keep recommendation number within project limits.

    if (limit < 1 || limit > 10) {

        errorMessage.textContent =
            "The number of recommendations must be between 1 and 10.";

        return;
    }


    // Loading state.

    resultsDiv.className =
        "recommendation-grid";

    resultsDiv.innerHTML = `
        <div class="loading-state">

            <div class="loader"></div>

            <span>
                Finding tracks from MusicBrainz...
            </span>

        </div>
    `;


    recommendBtn.disabled = true;

    recommendBtn.innerHTML = `
        <span>♫</span>
        Finding Recommendations...
    `;


    try {

        const response =
            await fetch(
                "/api/recommend",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        song,
                        artist,
                        genre,
                        mood,
                        limit
                    })
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Unable to generate recommendations."
            );
        }


        if (
            !data.recommendations ||
            data.recommendations.length === 0
        ) {

            resultsDiv.className =
                "recommendation-grid empty-state";

            resultsDiv.textContent =
                "No recommendations were found. Try another song or artist.";

            return;
        }


        displayRecommendations(
            data.recommendations
        );


        // A recommendation request creates a history record
        // and may add tracks to the metadata cache.

        await Promise.all([
            loadSearchHistory(),
            loadStats()
        ]);


    } catch (error) {

        console.error(
            "Recommendation request failed:",
            error
        );


        resultsDiv.className =
            "recommendation-grid empty-state";


        resultsDiv.textContent =
            error.message ||
            "Something went wrong while generating recommendations. Please try again.";


    } finally {

        recommendBtn.disabled = false;


        recommendBtn.innerHTML = `
            <span>♫</span>
            Get Recommendations
        `;
    }
}


// ---------------------------------------------------------
// DISPLAY RECOMMENDATIONS
// ---------------------------------------------------------

function displayRecommendations(recommendations) {

    resultsDiv.innerHTML = "";

    resultsDiv.className =
        "recommendation-grid";


    recommendations.forEach(
        (track, index) => {

            const card =
                document.createElement(
                    "article"
                );


            card.className =
                "recommendation-card";


            // ---------------------------------------------
            // RECOMMENDATION REASONS
            // ---------------------------------------------

            const reasons =
                Array.isArray(track.reasons)
                    ? track.reasons
                    : Array.isArray(track.reason)
                        ? track.reason
                        : [];

            const reasonsHTML =
                reasons.length > 0

                    ? reasons
                        .map(reason => `
                            <div
                                style="
                                    display: flex;
                                    align-items: flex-start;
                                    gap: 8px;
                                    margin-bottom: 7px;
                                "
                            >

                                <span
                                    style="
                                        color: #f0a58d;
                                        flex-shrink: 0;
                                        font-weight: 700;
                                    "
                                >
                                    ✓
                                </span>

                                <span>
                                    ${escapeHTML(reason)}
                                </span>

                            </div>
                        `)
                        .join("")

                    : `
                        <div>
                            Selected using available
                            MusicBrainz metadata.
                        </div>
                    `;


            // ---------------------------------------------
            // OPEN TRACK
            //
            // I create a YouTube search using the title
            // and artist. NextTrack itself is not acting
            // as a streaming service.
            // ---------------------------------------------

            const searchQuery =
                encodeURIComponent(
                    `${track.title} ${track.artist || ""}`
                );


            const openTrackURL =
                `https://www.youtube.com/results?search_query=${searchQuery}`;


            // ---------------------------------------------
            // CARD HTML
            // ---------------------------------------------

            card.innerHTML = `

                <div class="recommendation-rank">
                    ${index + 1}
                </div>


                <button
                    class="favorite-btn"
                    type="button"
                    aria-label="Save ${escapeHTML(track.title)} to favorites"
                    title="Save to Favorites"
                >
                    ♡
                </button>


                <h3>
                    ${escapeHTML(track.title)}
                </h3>


                <p class="track-artist">
                    ${escapeHTML(
                        track.artist ||
                        "Unknown artist"
                    )}
                </p>


                <div class="track-meta">

                    <span
                        class="meta-badge score-badge"
                        title="NextTrack recommendation score"
                    >
                        NextTrack score:
                        ${escapeHTML(
                            track.score ??
                            track.recommendationScore ??
                            0
                        )}
                    </span>


                    ${
                        track.musicbrainzScore !== undefined &&
                        track.musicbrainzScore !== null

                        ? `
                            <span
                                class="meta-badge"
                                title="MusicBrainz search relevance"
                            >
                                Search relevance:
                                ${escapeHTML(
                                    track.musicbrainzScore
                                )}
                            </span>
                        `

                        : ""
                    }

                </div>


                <div
                    class="recommendation-reason"
                    style="
                        margin-top: 16px;
                        padding-top: 14px;
                        border-top:
                            1px solid
                            rgba(255,255,255,0.07);
                        color: #8f8983;
                        font-size: 10px;
                        line-height: 1.6;
                    "
                >

                    <strong
                        style="
                            color: #c9c1b8;
                            display: block;
                            margin-bottom: 8px;
                        "
                    >
                        Recommendation details
                    </strong>


                    ${reasonsHTML}

                </div>


                <div
                    style="
                        margin-top: 14px;
                        padding-top: 12px;
                        border-top:
                            1px solid
                            rgba(255,255,255,0.05);
                    "
                >

                    <a
                        href="${openTrackURL}"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Search for this track on YouTube"
                        style="
                            color: #f0a58d;
                            text-decoration: none;
                            font-size: 11px;
                            font-weight: 600;
                            display: inline-flex;
                            align-items: center;
                            gap: 5px;
                        "
                    >
                        Open Track ↗
                    </a>

                </div>

            `;


            // ---------------------------------------------
            // FAVORITE BUTTON
            // ---------------------------------------------

            const favoriteButton =
                card.querySelector(
                    ".favorite-btn"
                );


            favoriteButton.addEventListener(
                "click",
                async () => {

                    await saveFavorite(
                        {
                            id: track.id,

                            title:
                                track.title,

                            artist:
                                track.artist ||
                                "Unknown artist"
                        },

                        favoriteButton
                    );
                }
            );


            resultsDiv.appendChild(
                card
            );
        }
    );
}


// ---------------------------------------------------------
// SAVE FAVORITE
// ---------------------------------------------------------

async function saveFavorite(
    track,
    button
) {

    button.disabled = true;


    try {

        const response =
            await fetch(
                "/api/favorites",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(
                            track
                        )
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Unable to save favorite."
            );
        }


        // Visual feedback.

        button.textContent = "♥";

        button.style.color =
            "#f0a58d";


        showSuccess(
            `${track.title} was saved to Favorites.`
        );


        // Refresh Favorites panel.

        await loadFavorites();


    } catch (error) {

        console.error(
            "Favorite save failed:",
            error
        );


        showSuccess(
            "Unable to save this track."
        );


    } finally {

        button.disabled = false;
    }
}


// ---------------------------------------------------------
// LOAD SEARCH HISTORY
// ---------------------------------------------------------

async function loadSearchHistory() {

    try {

        const response =
            await fetch(
                "/api/history"
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Unable to retrieve history."
            );
        }


        if (
            !data.history ||
            data.history.length === 0
        ) {

            historyDiv.className =
                "list-area empty-state";


            historyDiv.textContent =
                "No search history yet.";


            return;
        }


        historyDiv.className =
            "list-area";


        historyDiv.innerHTML = "";


        data.history.forEach(
            item => {

                const historyItem =
                    document.createElement(
                        "div"
                    );


                historyItem.className =
                    "list-item";


                const preferences = [];


                if (item.artist) {

                    preferences.push(
                        `Artist: ${item.artist}`
                    );
                }


                if (item.genre) {

                    preferences.push(
                        `Genre: ${item.genre}`
                    );
                }


                if (item.mood) {

                    preferences.push(
                        `Mood: ${item.mood}`
                    );
                }


                const preferenceText =
                    preferences.length > 0
                        ? preferences.join(" · ")
                        : "No optional preferences";


                historyItem.innerHTML = `

                    <div class="list-item-main">

                        <p class="list-item-title">
                            ${escapeHTML(item.song)}
                        </p>


                        <p class="list-item-subtitle">
                            ${escapeHTML(
                                preferenceText
                            )}
                        </p>


                        ${
                            item.searched_at

                            ? `
                                <p class="list-item-time">
                                    ${escapeHTML(
                                        formatDate(
                                            item.searched_at
                                        )
                                    )}
                                </p>
                            `

                            : ""
                        }

                    </div>

                `;


                historyDiv.appendChild(
                    historyItem
                );
            }
        );


    } catch (error) {

        console.error(
            "History loading failed:",
            error
        );


        historyDiv.className =
            "list-area empty-state";


        historyDiv.textContent =
            "Unable to load search history.";
    }
}


// ---------------------------------------------------------
// LOAD FAVORITES
// ---------------------------------------------------------

async function loadFavorites() {

    try {

        const response =
            await fetch(
                "/api/favorites"
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Unable to retrieve favorites."
            );
        }


        if (
            !data.favorites ||
            data.favorites.length === 0
        ) {

            favoritesDiv.className =
                "list-area empty-state";


            favoritesDiv.textContent =
                "No favorite tracks yet.";


            return;
        }


        favoritesDiv.className =
            "list-area";


        favoritesDiv.innerHTML = "";


        data.favorites.forEach(
            track => {

                const favoriteItem =
                    document.createElement(
                        "div"
                    );


                favoriteItem.className =
                    "list-item";


                favoriteItem.innerHTML = `

                    <div class="list-item-main">

                        <p class="list-item-title">
                            ${escapeHTML(
                                track.title
                            )}
                        </p>


                        <p class="list-item-subtitle">
                            ${escapeHTML(
                                track.artist ||
                                "Unknown artist"
                            )}
                        </p>


                        ${
                            track.saved_at

                            ? `
                                <p class="list-item-time">
                                    Saved:
                                    ${escapeHTML(
                                        formatDate(
                                            track.saved_at
                                        )
                                    )}
                                </p>
                            `

                            : ""
                        }

                    </div>


                    <button
                        class="delete-btn"
                        type="button"
                    >
                        Remove
                    </button>

                `;


                const deleteButton =
                    favoriteItem.querySelector(
                        ".delete-btn"
                    );


                deleteButton.addEventListener(
                    "click",
                    async () => {

                        const confirmed =
                            confirm(
                                `Remove "${track.title}" from Favorites?`
                            );


                        if (!confirmed) {
                            return;
                        }


                        await deleteFavorite(
                            track.favorite_id
                        );
                    }
                );


                favoritesDiv.appendChild(
                    favoriteItem
                );
            }
        );


    } catch (error) {

        console.error(
            "Favorites loading failed:",
            error
        );


        favoritesDiv.className =
            "list-area empty-state";


        favoritesDiv.textContent =
            "Unable to load favorite tracks.";
    }
}


// ---------------------------------------------------------
// DELETE FAVORITE
// ---------------------------------------------------------

async function deleteFavorite(
    favoriteId
) {

    try {

        const response =
            await fetch(
                `/api/favorites/${favoriteId}`,
                {
                    method: "DELETE"
                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Unable to remove favorite."
            );
        }


        showSuccess(
            "Track removed from Favorites."
        );


        await loadFavorites();


    } catch (error) {

        console.error(
            "Favorite delete failed:",
            error
        );


        showSuccess(
            "Unable to remove this favorite."
        );
    }
}


// ---------------------------------------------------------
// LOAD PROTOTYPE STATISTICS
// ---------------------------------------------------------

async function loadStats() {

    try {

        const response =
            await fetch(
                "/api/stats"
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Unable to retrieve statistics."
            );
        }


        if (!data.stats) {

            statsDiv.innerHTML =
                "No statistics available.";

            return;
        }


        const totalSearches =
            data.stats.totalSearches ?? 0;


        const cachedTracks =
            data.stats.cachedTracks ?? 0;


        const mostSearchedArtist =
            data.stats.mostSearchedArtist ||
            "Not available";


        statsDiv.innerHTML = `

            <div class="stat-item">

                <span class="stat-label">
                    Total Searches
                </span>

                <span class="stat-value">
                    ${escapeHTML(
                        totalSearches
                    )}
                </span>

            </div>


            <div class="stat-item">

                <span class="stat-label">
                    Cached Tracks
                </span>

                <span class="stat-value">
                    ${escapeHTML(
                        cachedTracks
                    )}
                </span>

            </div>


            <div class="stat-item">

                <span class="stat-label">
                    Most Searched Artist
                </span>

                <span
                    class="stat-value"
                    title="${escapeHTML(
                        mostSearchedArtist
                    )}"
                >
                    ${escapeHTML(
                        mostSearchedArtist
                    )}
                </span>

            </div>

        `;


    } catch (error) {

        console.error(
            "Statistics loading failed:",
            error
        );


        statsDiv.innerHTML =
            "Unable to load statistics.";
    }
}


// ---------------------------------------------------------
// SIDEBAR ACTIVE STATE
// ---------------------------------------------------------

const navLinks =
    document.querySelectorAll(
        ".nav-link"
    );


navLinks.forEach(link => {

    link.addEventListener(
        "click",
        () => {

            navLinks.forEach(
                item => {

                    item.classList.remove(
                        "active"
                    );
                }
            );


            link.classList.add(
                "active"
            );
        }
    );
});


// ---------------------------------------------------------
// ALLOW ENTER KEY TO START A SEARCH
// ---------------------------------------------------------

[
    songInput,
    artistInput,
    genreInput,
    moodInput

].forEach(input => {

    input.addEventListener(
        "keydown",
        event => {

            if (event.key === "Enter") {

                getRecommendations();
            }
        }
    );
});


// ---------------------------------------------------------
// BUTTON EVENT
// ---------------------------------------------------------

recommendBtn.addEventListener(
    "click",
    getRecommendations
);


// ---------------------------------------------------------
// LOAD STORED APPLICATION DATA WHEN PAGE OPENS
// ---------------------------------------------------------

async function initialisePage() {

    await Promise.all([
        loadSearchHistory(),
        loadFavorites(),
        loadStats()
    ]);
}


initialisePage();