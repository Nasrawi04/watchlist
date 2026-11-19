/* home-guest.js — the example library a guest's Home shows (owner, 19 Nov 2026): the signed-in Home, filled with
   well-known titles, so someone who hasn't joined sees what theirs will look like. The same for every guest and
   kept in this file (no account, nothing stored, no extra calls for the titles themselves).
   Loaded for guests only: Home (MSSHome.guest), the Library pages (library-view.js) and the profile preview (profile.html).
   mssGuestLibrary() → the rows as library entries (the shape getEntries returns), ids 'guest-0', 'guest-1'…

   Each row: [TMDB type, TMDB id, category, status, title, year, poster path, backdrop path, genres,
              runtime in minutes (movies) or episodes per season (shows), details]
   details: season / episode / watched (where you are), rt (minutes an episode), ago (finished that many days ago),
            score (the example score), next ([season, episode, date]: shown until the live schedule answers). Watchlist rows are Pick for me's pool: 2 movies, 2 shows, 2 anime, 2 cartoons. */
const MSS_GUEST_HOME = [
  ["tv", 1399, "tv", "watching", "Game of Thrones", "2011", "/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg", "/zZqpAXxVSBtxV9qPBcscfXBcL2w.jpg", ["Sci-Fi & Fantasy", "Drama"], [10, 10, 10, 10, 10, 10, 7, 6], {"season": 3, "episode": 8, "watched": 28, "rt": 57}],
  ["movie", 155, "movies", "up_next", "The Dark Knight", "2008", "/qJ2tW6WMUDux911r6m7haRef0WH.jpg", "/cfT29Im5VDvjE0RpyKOSdCKZal7.jpg", ["Action", "Thriller"], 152, {}],
  ["tv", 1396, "tv", "watching", "Breaking Bad", "2008", "/anFx9aTOOYqgS3v7x3R84Kz67ly.jpg", "/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg", ["Drama", "Crime"], [7, 13, 13, 13, 16], {"season": 2, "episode": 5, "watched": 12, "rt": 47}],
  ["tv", 1429, "anime", "watching", "Attack on Titan", "2013", "/hTP1DtLGFamjfu8WqjnuQdP1n4i.jpg", "/rqbCbjB19amtOtFQbb3K2lgm2zv.jpg", ["Animation", "Sci-Fi & Fantasy"], [25, 12, 22, 28], {"season": 1, "episode": 12, "watched": 12, "rt": 24}],
  ["tv", 246, "cartoons", "paused", "Avatar: The Last Airbender", "2005", "/yaGt4GIutpbXHsv48tWceWg6s56.jpg", "/7oBGhqJIghRBvOwo5Qe0yM0cnMc.jpg", ["Animation", "Action & Adventure"], [20, 20, 21], {"season": 2, "episode": 7, "watched": 27, "rt": 24}],
  ["movie", 238, "movies", "queue", "The Godfather", "1972", "/3bhkrj58Vtu7enYsRolD1fZdja1.jpg", "/tSPT36ZKlP2WVHJLM4cQPLSzv3b.jpg", ["Drama", "Crime"], 175, {}],
  ["movie", 27205, "movies", "queue", "Inception", "2010", "/xlaY2zyzMfkhk0HSC5VUwzoZPU1.jpg", "/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg", ["Action", "Science Fiction"], 148, {}],
  ["tv", 66732, "tv", "queue", "Stranger Things", "2016", "/uOOtwVbSr4QDjAGIifLDwpb2Pdl.jpg", "/9P4IIMYY3HifqeruZq0ZZ9g7YUi.jpg", ["Action & Adventure", "Mystery"], [8, 9, 8, 9, 8], {}],
  ["tv", 1398, "tv", "queue", "The Sopranos", "1999", "/rTc7ZXdroqjkKivFPvCPX0Ru7uw.jpg", "/lNpkvX2s8LGB0mjGODMT4o6Up7j.jpg", ["Crime", "Drama"], [13, 13, 13, 13, 13, 21], {}],
  ["tv", 13916, "anime", "queue", "Death Note", "2006", "/tCZFfYTIwrR7n94J6G14Y4hAFU6.jpg", "/z8IPicmEKXUO4I2UDdMEqw7RqOE.jpg", ["Animation", "Mystery"], [37], {}],
  ["tv", 31911, "anime", "queue", "Fullmetal Alchemist: Brotherhood", "2009", "/5ZFUEOULaVml7pQuXxhpR2SmVUw.jpg", "/2UG177tWHy7xRmMKWJHB7nAUmKd.jpg", ["Animation", "Action & Adventure"], [64], {}],
  ["tv", 40075, "cartoons", "queue", "Gravity Falls", "2012", "/qwi3p6PzKfQZ4YXBzv3CP5pO2dE.jpg", "/l0XvAI856XdyDYEfr1njztjH7u0.jpg", ["Animation", "Action & Adventure"], [20, 20], {}],
  ["tv", 94605, "cartoons", "queue", "Arcane", "2021", "/87C0wecB8bHb1PsrKBI4kJiEkgV.jpg", "/5cvnxEHT3e39DvT6ARw4GNCFrB0.jpg", ["Animation", "Action & Adventure"], [9, 9], {}],
  ["movie", 278, "movies", "completed", "The Shawshank Redemption", "1994", "/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg", "/pNjh59JSxChQktamG3LMp9ZoQzp.jpg", ["Drama", "Crime"], 142, {"ago": 2, "score": 9.86}],
  ["tv", 87108, "tv", "completed", "Chernobyl", "2019", "/hlLXt2tOPT6RRnjiUmoxyG1LTFi.jpg", "/900tHlUYUkp7Ol04XFSoAaEIXcT.jpg", ["Drama"], [5], {"ago": 5, "score": 9.62}],
  ["movie", 129, "anime", "completed", "Spirited Away", "2001", "/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg", "/m4TUa2ciEWSlk37rOsjiSIvZDXE.jpg", ["Animation", "Family"], 125, {"ago": 8, "score": 9.41}],
  ["movie", 680, "movies", "completed", "Pulp Fiction", "1994", "/vQWk5YBFWF4bZaofAbv0tShwBvQ.jpg", "/suaEOtk1N1sgg2MTM7oZd2cfVp3.jpg", ["Thriller", "Crime"], 154, {"ago": 12, "score": 9.15}],
  ["tv", 76331, "tv", "completed", "Succession", "2018", "/z0XiwdrCQ9yVIr4O0pxzaAYRxdW.jpg", "/d87JXX3DLkRJMfm5StCmmnmhHuX.jpg", ["Drama", "Comedy"], [10, 10, 9, 10], {"ago": 17, "score": 9.08}],
  ["movie", 496243, "movies", "completed", "Parasite", "2019", "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg", "/TU9NIjwzjoKPwQHoHshkFcQUCG.jpg", ["Comedy", "Thriller"], 133, {"ago": 23, "score": 8.93}],
  ["movie", 372058, "anime", "completed", "Your Name.", "2016", "/vfJFJPepRKapMd5G2ro7klIRysq.jpg", "/mMtUybQ6hL24FXo0F3Z4j2KG7kZ.jpg", ["Animation", "Romance"], 106, {"ago": 31, "score": 8.72}],
  ["tv", 61222, "cartoons", "completed", "BoJack Horseman", "2014", "/6JFWzlChcGgLiIUo2COgNlWGFKy.jpg", "/81BCTObfPk0EvarJpUgnGXHvM9x.jpg", ["Animation", "Comedy"], [12, 12, 12, 12, 12, 16], {"ago": 40, "score": 8.95}],
  ["movie", 862, "cartoons", "completed", "Toy Story", "1995", "/uXDfjJbdP4ijW5hWSBrPrlKpxab.jpg", "/8AqWECiUHnz1Crj69uB9vhiK9Le.jpg", ["Family", "Comedy"], 81, {"ago": 52, "score": 8.31}],
  ["movie", 550, "movies", "completed", "Fight Club", "1999", "/jSziioSwPVrOy9Yow3XhWIBDjq1.jpg", "/c6OLXfKAk5BKeR6broC8pYiCquX.jpg", ["Drama", "Thriller"], 139, {"ago": 66, "score": 8.64}],
  ["movie", 577922, "movies", "completed", "Tenet", "2020", "/rrKH3VhHssGTCfPuaEQkxvEoElv.jpg", "/mQOUyqDybTqxl73hO5LujCZsM1o.jpg", ["Action", "Thriller"], 150, {"ago": 80, "score": 7.18}],
  ["tv", 224372, "tv", "ongoing", "A Knight of the Seven Kingdoms", "2026", "/k8yARbD9iYn2nRX2HvsopfKDN2r.jpg", "/7mkUu1F2hVUNgz24xO8HPx0D6mK.jpg", ["Drama", "Sci-Fi & Fantasy"], [6], {"season": 1, "episode": 6, "watched": 6, "ago": 120, "score": 9.12}],
  ["tv", 224377, "tv", "ongoing", "Harry Potter", "2026", "/6spxkjxCcog8HR3cLsDVROsjz3h.jpg", "/4737GKC5SaD0L7hbjxBG1DF7c4R.jpg", ["Sci-Fi & Fantasy", "Action & Adventure"], [1], {"season": 1, "episode": 0, "watched": 0, "ago": 150, "next": [1, 1, "2026-12-25"]}],
  ["tv", 209867, "anime", "ongoing", "Frieren: Beyond Journey's End", "2023", "/dqZENchTd7lp5zht7BdlqM7RBhD.jpg", "/rBOnrVlck7BIlGeWVlzYiZeg4l2.jpg", ["Animation", "Action & Adventure"], [38], {"season": 1, "episode": 38, "watched": 38, "ago": 200, "score": 9.34}],
  ["tv", 60625, "cartoons", "ongoing", "Rick and Morty", "2013", "/owhkU6KRqdXoUQpjV8uyZGPtX58.jpg", "/iFOkrSrJRwE27PwbyQeYLlMJXzw.jpg", ["Animation", "Comedy"], [11, 10, 10, 10, 10, 10, 10, 10, 10], {"season": 9, "episode": 10, "watched": 91, "ago": 110, "score": 8.47}]
];

function mssGuestLibrary() {
  const now = Date.now(), DAY = 864e5;
  return MSS_GUEST_HOME.map(([t, tid, cat, status, title, year, poster, bd, genres, len, x], i) => {
    const movie = t === 'movie', seasons = movie ? null : len, eps = seasons ? seasons.reduce((a, b) => a + b, 0) : null;
    const at = new Date(x.ago != null ? now - x.ago * DAY : now - i * 6e4).toISOString();   // in progress: this order, the first is Continue watching
    const done = status === 'completed' || status === 'ongoing';
    return { id: 'guest-' + i, user_id: 'guest', title, year, cat, status, tmdb_id: tid, tmdb_type: t, poster_url: 'https://image.tmdb.org/t/p/w500' + poster, genres,
      season: x.season ?? null, episode: x.episode ?? null, watched: x.watched ?? null, total_eps: eps, total_seasons: seasons ? seasons.length : null,
      runtime_h: movie ? Math.floor(len / 60) : null, runtime_m: movie ? len % 60 : null, final_score: x.score ?? null,
      updated_at: at, created_at: at, completed_at: done ? at : null, completed_date: done ? at.slice(0, 10) : null,
      ratings: { _media_type: t, _backdrop: bd, ...(seasons ? { _season_breakdown: seasons } : {}), ...(x.rt ? { _ep_runtime: x.rt } : {}) } };
  });
}
