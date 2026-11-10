// Online parts: the worldwide leaderboard and, only if the player ticks the box, flight sharing.
// Supabase REST. The key below is a publishable key: it is meant to ship in the page. The database
// lets this key add rows and read the two leaderboard views, nothing else (see tools/backend.sql).
const Backend = (() => {
  const API = "https://mjzmndrphrjgwozifvrk.supabase.co/rest/v1/", KEY = "sb_publishable_TqAqqn_E7s_qVCYtxDuD-g_W6rbTaW8";
  const head = {apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json"};
  let id = null;                                           // a random id for this device; no account, no email
  try { id = localStorage.getItem("moonpilot.id"); if (!id) { id = crypto.randomUUID(); localStorage.setItem("moonpilot.id", id); } } catch (e) { id = null; }
  const post = (table, row) => !id ? Promise.resolve(false)
    : fetch(API + table, {method: "POST", headers: {...head, Prefer: "return=minimal"}, body: JSON.stringify({player_id: id, ...row})}).then(r => r.ok).catch(() => false);
  const get = q => fetch(API + q, {headers: head}).then(r => r.ok ? r.json() : null).catch(() => null);
  return {
    score: row => post("scores", row),
    flight: row => post("flights", row),
    top: mission => get(`leaderboard?mission=eq.${encodeURIComponent(mission)}&select=name,score,seconds,coach&order=score.desc,seconds.asc&limit=20`),
    overall: () => get("overall?select=name,score&order=score.desc&limit=20"),
  };
})();
