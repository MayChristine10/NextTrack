const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "nexttrack.db");

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Database connection error:", err.message);
    } else {
        console.log("Connected to SQLite database.");
    }
});

db.serialize(() => {
    db.run(`
    CREATE TABLE IF NOT EXISTS Favorites (
        favorite_id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id TEXT,
        title TEXT,
        artist TEXT,
        saved_at TEXT
    )
`);
});

function saveMetadataToCache(track) {
    const query = `
        INSERT INTO Music_Metadata_Cache 
        (track_id, title, artist, musicbrainz_score, last_updated)
        VALUES (?, ?, ?, ?, datetime('now'))
    `;

    db.run(query, [
        track.id,
        track.title,
        track.artist,
        track.musicbrainzScore
    ]);
}

function getCachedMetadata(callback) {
    const query = `
        SELECT *
        FROM Music_Metadata_Cache
        ORDER BY metadata_id DESC
        LIMIT 10
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            callback(err, null);
        } else {
            callback(null, rows);
        }
    });
}

function saveSearchHistory(searchData) {
    const query = `
        INSERT INTO Search_History
        (song, genre, mood, artist, searched_at)
        VALUES (?, ?, ?, ?, datetime('now'))
    `;

    db.run(query, [
        searchData.song,
        searchData.genre,
        searchData.mood,
        searchData.artist
    ]);
}

function getSearchHistory(callback) {
    const query = `
        SELECT *
        FROM Search_History
        ORDER BY search_id DESC
        LIMIT 10
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            callback(err, null);
        } else {
            callback(null, rows);
        }
    });
}

function getStats(callback) {
    const query = `
        SELECT 
            (SELECT COUNT(*) FROM Search_History) AS totalSearches,
            (SELECT COUNT(*) FROM Music_Metadata_Cache) AS cachedTracks,
            (SELECT artist FROM Search_History 
             GROUP BY artist 
             ORDER BY COUNT(*) DESC 
             LIMIT 1) AS mostSearchedArtist
    `;

    db.get(query, [], (err, row) => {
        if (err) callback(err, null);
        else callback(null, row);
    });
}

function saveFavorite(track, callback) {
    const query = `
        INSERT INTO Favorites (track_id, title, artist, saved_at)
        VALUES (?, ?, ?, datetime('now'))
    `;

    db.run(query, [track.id, track.title, track.artist], callback);
}

function getFavorites(callback) {
    db.all(`
        SELECT * FROM Favorites
        ORDER BY favorite_id DESC
    `, [], callback);
}

function deleteFavorite(id, callback) {
    db.run(
        "DELETE FROM Favorites WHERE favorite_id = ?",
        [id],
        callback
    );
}

module.exports = {
    db,
    saveMetadataToCache,
    getCachedMetadata,
    saveSearchHistory,
    getSearchHistory,
    getStats,
    saveFavorite,
    getFavorites,
    deleteFavorite,
};