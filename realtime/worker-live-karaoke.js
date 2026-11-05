import {talkingDirectory,talkingDirectoryCard} from './talking-directory.js';
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// protocol.js
var encoder = new TextEncoder();
function fault(status, message) {
  throw Object.assign(new Error(message), { status });
}
__name(fault, "fault");
var reply = /* @__PURE__ */ __name((body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } }), "reply");
function identifier(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value) || ["__proto__", "prototype", "constructor"].includes(value)) fault(400, "\uC798\uBABB\uB41C \uC2DD\uBCC4\uC790\uC608\uC694.");
  return value;
}
__name(identifier, "identifier");
function requestId(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{16,64}$/.test(value)) fault(400, "\uC804\uC1A1 \uC694\uCCAD\uC744 \uB2E4\uC2DC \uC2DC\uC791\uD574\uC8FC\uC138\uC694.");
  return value;
}
__name(requestId, "requestId");
function text(value, max) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) fault(400, "\uC785\uB825 \uB0B4\uC6A9\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  return value.trim();
}
__name(text, "text");
async function key(secret) {
  if (!secret || secret.length < 32) fault(503, "\uD1A0\uD0B9\uB8F8 \uC5F0\uACB0 \uC124\uC815\uC744 \uC900\uBE44\uD558\uACE0 \uC788\uC5B4\uC694.");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
__name(key, "key");
async function verifyRequest(req, secret, body, now = Date.now()) {
  const timestamp = Number(req.headers.get("x-aifect-time")), nonce = req.headers.get("x-aifect-nonce") || "", signature = req.headers.get("x-aifect-signature") || "";
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > 3e4 || !/^[-\w]{16,64}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(signature)) fault(401, "\uC11C\uBC84 \uC778\uC99D\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  const bytes = Uint8Array.from(signature.match(/../g), (x) => parseInt(x, 16));
  if (!await crypto.subtle.verify("HMAC", await key(secret), bytes, encoder.encode(`${timestamp}
${nonce}
${new URL(req.url).pathname}
${body}`))) fault(401, "\uC11C\uBC84 \uC778\uC99D\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  return { nonce, timestamp };
}
__name(verifyRequest, "verifyRequest");
function audioOffer(description, mid) {
  if (description?.type !== "offer" || typeof description.sdp !== "string" || description.sdp.length > 24e3) fault(400, "\uB9C8\uC774\uD06C \uC5F0\uACB0 \uC815\uBCF4\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  const sections = description.sdp.split(/\r?\nm=/).slice(1);
  const directions = sections[0]?.match(/^a=(sendonly|recvonly|sendrecv|inactive)\r?$/gm) || [];
  if (sections.length !== 1 || !sections[0].startsWith("audio ") || !sections[0].includes("a=mid:" + mid + "\r\n") || directions.length !== 1 || !directions[0].includes("a=sendonly")) fault(400, "\uB9C8\uC774\uD06C \uC624\uB514\uC624\uB9CC \uC1A1\uCD9C\uD560 \uC218 \uC788\uC5B4\uC694.");
  return { type: "offer", sdp: description.sdp };
}
__name(audioOffer, "audioOffer");
function audioAnswer(description, mids) {
  if (description?.type !== "answer" || typeof description.sdp !== "string" || description.sdp.length > 24e3) fault(400, "\uC218\uC2E0 \uC5F0\uACB0 \uC815\uBCF4\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  const sections = description.sdp.split(/\r?\nm=/).slice(1), seen = /* @__PURE__ */ new Set();
  for (const section of sections) {
    const mid = section.match(/(?:^|\n)a=mid:([^\r\n]+)/)?.[1];
    const directions = section.match(/^a=(sendonly|recvonly|sendrecv|inactive)\r?$/gm) || [];
    if (!section.startsWith("audio ") || !mids.includes(mid) || seen.has(mid) || directions.length !== 1 || !/(recvonly|inactive)/.test(directions[0])) fault(400, "\uCCAD\uCDE8 \uC5F0\uACB0\uC5D0\uC11C\uB294 \uC74C\uC131\uC744 \uC1A1\uCD9C\uD560 \uC218 \uC5C6\uC5B4\uC694.");
    seen.add(mid);
  }
  if (seen.size !== mids.length) fault(400, "\uC218\uC2E0 \uC5F0\uACB0 \uC815\uBCF4\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  return { type: "answer", sdp: description.sdp };
}
__name(audioAnswer, "audioAnswer");

// ../shared/voice-settings.js
function roomSettings(input, actor, previous = {}) {
  const seating_mode = input.seating_mode ?? previous.seating_mode ?? "approval";
  if (!["approval", "free"].includes(seating_mode)) throw Error("\uC88C\uC11D \uCC38\uC5EC \uBC29\uC2DD\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  const title = String(input.title ?? previous.title ?? "").trim();
  const visibility = input.visibility ?? previous.visibility ?? "public";
  const max_members = Number(input.max_members ?? previous.max_members ?? 30);
  const background = input.background ?? previous.background ?? "navy";
  const announcement = String(input.announcement ?? previous.announcement ?? "").trim();
  const crew_id = visibility === "crew" ? input.crew_id ?? previous.crew_id : null;
  if (!title || title.length > 60 || !["public", "private", "crew", "followers"].includes(visibility) || !Number.isInteger(max_members) || max_members < 2 || max_members > 30 || !["navy", "sunset", "night"].includes(background) || announcement.length > 200) throw Error("\uBC29 \uC124\uC815 \uB0B4\uC6A9\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
  if (visibility === "crew" && (!crew_id || !actor.crews?.includes(crew_id))) throw Error("\uBC29\uC7A5\uC774 \uC18D\uD55C \uD06C\uB8E8\uB97C \uC120\uD0DD\uD574\uC8FC\uC138\uC694.");
  return { seating_mode, title, visibility, max_members, background, announcement, crew_id };
}
__name(roomSettings, "roomSettings");

// ../shared/voice-music.js
var emptyRoomMusic = /* @__PURE__ */ __name(() => ({ queue: [], index: -1, playing: false, position: 0, updated: Date.now(), volume: 0.7, balance: 0.7, repeat: "off", revision: 0, starts: 0 }), "emptyRoomMusic");
function roomMusicPosition(m, now = Date.now()) {
  const duration = m.queue[m.index]?.duration || 0;
  return Math.max(0, Math.min(duration, m.position + (m.playing ? Math.max(0, now - m.updated) / 1e3 : 0)));
}
__name(roomMusicPosition, "roomMusicPosition");
function changeRoomMusic(prior, command, track, now = Date.now()) {
  const m = structuredClone(prior || emptyRoomMusic());
  m.position = roomMusicPosition(m, now);
  m.updated = now;
  const start = /* @__PURE__ */ __name((i) => {
    m.index = i;
    m.position = 0;
    m.playing = i >= 0;
    if (i >= 0) m.starts++;
  }, "start");
  switch (command.operation) {
    case "enqueue":
      if (!track || m.queue.length >= 50) throw Error("\uC7AC\uC0DD\uBAA9\uB85D\uC740 \uCD5C\uB300 50\uACE1\uC774\uC5D0\uC694.");
      m.queue.push(track);
      if (m.index < 0) {
        m.index = m.queue.length - 1;
        m.position = 0;
        m.playing = false;
      }
      break;
    case "play":
      if (m.index < 0 && m.queue.length) start(0);
      else if (m.index >= 0) {
        if (m.position >= m.queue[m.index].duration) start(m.index);
        else if (!m.playing && m.position === 0) m.starts++;
        m.playing = true;
      }
      break;
    case "stop":
      m.playing = false;
      m.position = 0;
      m.index = -1;
      break;
    case "seek": {
      const value = Number(command.position);
      if (m.index < 0 || !Number.isFinite(value) || value < 0 || value > m.queue[m.index].duration) throw Error("\uC7AC\uC0DD \uC704\uCE58\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      m.position = value;
      break;
    }
    case "pause":
      m.playing = false;
      break;
    case "restart":
      if (m.index >= 0) start(m.index);
      break;
    case "previous":
      start(m.index > 0 ? m.index - 1 : m.queue.length ? 0 : -1);
      break;
    case "next":
      start(m.index + 1 < m.queue.length ? m.index + 1 : m.repeat === "all" && m.queue.length ? 0 : -1);
      break;
    case "repeat":
      if (!["off", "all", "one"].includes(command.mode)) throw Error("\uBC18\uBCF5 \uC124\uC815\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      m.repeat = command.mode;
      break;
    case "clear":
      m.queue = [];
      start(-1);
      break;
    case "ended":
      if (!m.playing || command.revision !== m.revision) return prior;
      if (m.position + 0.5 < (m.queue[m.index]?.duration || Infinity)) return prior;
      start(m.repeat === "one" ? m.index : m.index + 1 < m.queue.length ? m.index + 1 : m.repeat === "all" ? 0 : -1);
      break;
    case "remove": {
      const i = command.index;
      if (!Number.isInteger(i) || i < 0 || i >= m.queue.length) throw Error("\uB300\uAE30\uC5F4\uC744 \uB2E4\uC2DC \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      const wasPlaying = m.playing;
      m.queue.splice(i, 1);
      if (i < m.index) m.index--;
      else if (i === m.index) {
        m.index = i < m.queue.length ? i : -1;
        m.position = 0;
        m.playing = wasPlaying && m.index >= 0;
        if (m.playing) m.starts++;
      }
      break;
    }
    case "move": {
      const { index, to } = command;
      if (!Number.isInteger(index) || !Number.isInteger(to) || index < 0 || to < 0 || index >= m.queue.length || to >= m.queue.length) throw Error("\uACE1 \uC21C\uC11C\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      const current = m.queue[m.index];
      m.queue.splice(to, 0, m.queue.splice(index, 1)[0]);
      m.index = current ? m.queue.indexOf(current) : -1;
      break;
    }
    case "volume":
    case "balance": {
      const key2 = command.operation, value = Number(command.value);
      if (!Number.isFinite(value) || value < 0 || value > 1) throw Error("\uC74C\uB7C9\uC740 0~100%\uB85C \uC124\uC815\uD574\uC8FC\uC138\uC694.");
      m[key2] = value;
      if (key2 === "balance") m.volume = value;
      break;
    }
    default:
      throw Error("\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC74C\uC545 \uBA85\uB839\uC774\uC5D0\uC694.");
  }
  m.revision++;
  return m;
}
__name(changeRoomMusic, "changeRoomMusic");

// sfu.js
var Sfu = class {
  static {
    __name(this, "Sfu");
  }
  constructor(env, fetcher = fetch) {
    this.env = env;
    this.fetcher = (...args) => fetcher(...args);
  }
  async call(path, method = "POST", body) {
    if (!this.env.REALTIME_SFU_APP_ID || !this.env.REALTIME_SFU_APP_SECRET) fault(503, "\uC74C\uC131 \uC11C\uBC84 \uC124\uC815\uC744 \uC900\uBE44\uD558\uACE0 \uC788\uC5B4\uC694.");
    let response, result;
    const started = Date.now(), operation = path.replace(/sessions\/(?!new$)[^/]+/, "sessions/[session]");
    try {
      response = await this.fetcher(`https://rtc.live.cloudflare.com/v1/apps/${encodeURIComponent(this.env.REALTIME_SFU_APP_ID)}${path}`, { method, headers: { authorization: `Bearer ${this.env.REALTIME_SFU_APP_SECRET}`, "content-type": "application/json" }, body: body === void 0 ? void 0 : JSON.stringify(body), signal: AbortSignal.timeout(path.endsWith("/tracks/new") ? 12e3 : 8e3) });
      result = await response.json();
    } catch (error) {
      const timeout = ["TimeoutError", "AbortError"].includes(error?.name);
      console.warn(JSON.stringify({ event: "voice_sfu_failure", operation: path.replace(/sessions\/(?!new$)[^/]+/, "sessions/[session]"), kind: error?.name || "network", reason: timeout ? "timeout" : /illegal invocation/i.test(error?.message || "") ? "illegal_invocation" : error instanceof SyntaxError ? "invalid_json" : "request_failed" }));
      throw Object.assign(new Error(timeout ? "\uC74C\uC131 \uC11C\uBC84 \uC751\uB2F5\uC774 \uC9C0\uC5F0\uB3FC\uC694. \uC5F0\uACB0\uC744 \uC815\uB9AC\uD558\uACE0 \uC788\uC5B4\uC694." : "\uC74C\uC131 \uC11C\uBC84\uC5D0 \uC5F0\uACB0\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694."), { status: 502, sfuUncertain: true });
    }
    if (!response.ok || result.errorCode) {
      console.warn(JSON.stringify({ event: "voice_sfu_failure", status: response.status, code: result.errorCode || "http_error" }));
      throw Object.assign(new Error("\uC74C\uC131 \uC11C\uBC84 \uC5F0\uACB0\uC5D0 \uC2E4\uD328\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC5F0\uACB0\uD574\uC8FC\uC138\uC694."), { status: 502, sfuUncertain: true, sessionGone: response.status === 410 && result.errorCode === "session_error" });
    }
    console.info(JSON.stringify({ event: "voice_sfu_complete", operation, elapsed_ms: Date.now() - started, status: response.status }));
    return result;
  }
  async create() {
    const r = await this.call("/sessions/new");
    if (typeof r.sessionId !== "string" || !r.sessionId) fault(502, "\uC74C\uC131 \uC138\uC158\uC744 \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC5B4\uC694.");
    return r.sessionId;
  }
  tracks(session, body) {
    return this.call(`/sessions/${encodeURIComponent(session)}/tracks/new`, "POST", body);
  }
  answer(session, description) {
    return this.call(`/sessions/${encodeURIComponent(session)}/renegotiate`, "PUT", { sessionDescription: description });
  }
  async close(session, mids, media = {}) {
    let state;
    try {
      state = await this.call(`/sessions/${encodeURIComponent(session)}`, "GET");
    } catch (e) {
      if (e.sessionGone) return { resolved: true };
      throw e;
    }
    const tracks = state.tracks || [], inactive = new Set(tracks.filter((t) => t.status === "inactive").map((t) => t.mid));
    const all = [.../* @__PURE__ */ new Set([...mids, ...tracks.map((t) => t.mid).filter(Boolean)])].filter((mid) => !inactive.has(mid));
    if (all.length) {
      const r = await this.call(`/sessions/${encodeURIComponent(session)}/tracks/close`, "PUT", { force: true, tracks: all.map((mid) => ({ mid })) });
      if (r.errorCode || r.tracks?.some((t) => t.errorCode && t.errorCode !== "close_track_error") || r.requiresImmediateRenegotiation) fault(502, "\uC74C\uC131 \uC5F0\uACB0\uC744 \uC815\uB9AC\uD558\uB294 \uC911\uC774\uC5D0\uC694.");
    }
    return { resolved: !media.uncertain || tracks.length >= (media.expected || 1) };
  }
};

// room.js
var LEASE = 75e3;
var SEAT_REQUEST_TTL = 1e4;
var VoiceRoom = class {
  static {
    __name(this, "VoiceRoom");
  }
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sfu = new Sfu(env);
    this.queue = Promise.resolve();
    this.data = null;
    this.cleaning = /* @__PURE__ */ new Set();
  }
  serial(work) {
    const next = this.queue.then(work);
    this.queue = next.catch(() => {
    });
    return next;
  }
  async load() {
    if (this.data) return;
    this.data = await this.ctx.storage.get("room") || { config: null, members: {}, bans: {}, invites: {}, chat: [], gifts: [], cleanup: [], nonces: {}, rates: {}, revision: 0, chatSequence: 0 };
    this.data.seatInvites ||= {};
    this.data.music ||= emptyRoomMusic();
    this.data.musicRequests ||= [];
    this.data.notices ||= [];
    if (this.data.config) this.data.config.seating_mode ??= "approval";
    if (!Number.isSafeInteger(this.data.chatSequence)) {
      this.data.chatSequence = 0;
      for (const message of this.data.chat) message.sequence = ++this.data.chatSequence;
      for (const member of Object.values(this.data.members)) member.chatAfter = this.data.chatSequence;
    }
  }
  async save() {
    await this.ctx.storage.put("room", this.data);
    if (Object.keys(this.data.members).length || this.data.cleanup.length || this.data.directoryDirty || this.data.hostReconnectUntil > Date.now()) await this.ctx.storage.setAlarm(Date.now() + 15e3);
  }
  async syncDirectory() {
    if (!this.data.directoryDirty) return;
    try {
      const room = this.data.config;
      if (room.closed) await this.env.ROOM_DB.prepare("UPDATE voice_rooms SET closed=1 WHERE id=?").bind(room.id).run();
      else await this.env.ROOM_DB.prepare("UPDATE voice_rooms SET host_id=?,background=? WHERE id=?").bind(room.host_id, room.background, room.id).run();
      this.data.directoryDirty = false;
    } catch {
    }
  }
  async closeRoom() {
    if (!this.data.config || this.data.config.closed) return;
    this.data.config.closed = true;
    this.data.music = changeRoomMusic(this.data.music, { operation: "stop" });
    this.data.chat = [];
    this.data.invites = {};
    this.data.seatInvites = {};
    for (const m of Object.values(this.data.members)) this.clearRequest(m);
    this.data.directoryDirty = true;
    await this.save();
    await this.syncDirectory();
  }
  member(actor, generation) {
    const p = this.data.members[actor.id];
    if (!p || p.expires <= Date.now()) fault(403, "\uD1A0\uD0B9\uB8F8\uC5D0 \uB2E4\uC2DC \uC785\uC7A5\uD574\uC8FC\uC138\uC694.");
    if (generation !== void 0 && p.generation !== generation) fault(409, "\uB2E4\uB978 \uC5F0\uACB0\uB85C \uBC14\uB00C\uC5C8\uC5B4\uC694. \uB2E4\uC2DC \uC785\uC7A5\uD574\uC8FC\uC138\uC694.");
    return p;
  }
  access(actor, existing = false) {
    existing = existing && this.data.members[actor.id]?.visibilityRetained === true;
    const c = this.data.config;
    if (!c || c.closed) fault(404, "\uC885\uB8CC\uB418\uC5C8\uAC70\uB098 \uC5C6\uB294 \uD1A0\uD0B9\uB8F8\uC774\uC5D0\uC694.");
    if (this.data.bans[actor.id] > Date.now()) fault(403, "\uC774 \uBC29\uC5D0 \uC785\uC7A5\uD560 \uC218 \uC5C6\uC5B4\uC694.");
    if ((actor.blocks || []).some((id) => this.data.members[id])) fault(403, "\uCC28\uB2E8\uD55C \uAD00\uACC4\uC758 \uD68C\uC6D0\uC774 \uC788\uB294 \uBC29\uC5D0\uB294 \uC785\uC7A5\uD560 \uC218 \uC5C6\uC5B4\uC694.");
    if (!existing && c.visibility === "followers" && actor.id !== c.host_id && !(actor.followedHosts || []).includes(c.host_id)) fault(403, "\uBC29\uC7A5\uC758 \uD314\uB85C\uC6CC\uB9CC \uC785\uC7A5\uD560 \uC218 \uC788\uC5B4\uC694.");
    if (!existing && c.visibility === "crew" && !(actor.crews || []).includes(c.crew_id)) fault(403, "\uC774 \uD06C\uB8E8\uC758 \uBA64\uBC84\uB9CC \uC785\uC7A5\uD560 \uC218 \uC788\uC5B4\uC694.");
    if (!existing && c.visibility === "private" && c.host_id !== actor.id && !(this.data.invites[actor.id] > Date.now())) fault(403, "\uCD08\uB300\uBC1B\uC740 \uD68C\uC6D0\uB9CC \uC785\uC7A5\uD560 \uC218 \uC788\uC5B4\uC694.");
  }
  moderator(actor) {
    const p = this.member(actor);
    if (this.data.config.host_id !== p.id) fault(403, "\uBC29\uC7A5\uB9CC \uD560 \uC218 \uC788\uC5B4\uC694.");
    return p;
  }
  target(actor, id) {
    const by = this.moderator(actor), p = this.data.members[identifier(id)];
    if (!p) fault(404, "\uC774\uBBF8 \uB098\uAC04 \uD68C\uC6D0\uC774\uC5D0\uC694.");
    if (p.role === "host" || p.role === "admin" && by.role !== "host") fault(403, "\uC774 \uD68C\uC6D0\uC744 \uAD00\uB9AC\uD560 \uAD8C\uD55C\uC774 \uC5C6\uC5B4\uC694.");
    return p;
  }
  limited(actor, action, max) {
    const k = actor.id + ":" + action, now = Date.now();
    let v = this.data.rates[k];
    if (!v || v.until <= now) v = this.data.rates[k] = { n: 0, until: now + 6e4 };
    if (++v.n > max) fault(429, "\uC7A0\uC2DC \uAE30\uB2E4\uB9B0 \uB4A4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.");
  }
  snapshot(actor) {
    const p = this.data.members[actor.id], host = p?.id === this.data.config?.host_id;
    return { room: this.data.config, revision: this.data.revision, self: p?.id || null, generation: p?.generation || null, seat_invites: Object.values(this.data.seatInvites).filter((i) => i.target === p?.id && i.expires > Date.now()), cleanup_pending: this.data.cleanup.length > 0, serverNow: Date.now(), music: this.data.music, notices: p ? this.data.notices.filter((n) => n.sequence > (p.chatAfter ?? this.data.chatSequence)) : [], members: Object.values(this.data.members).filter((m) => m.expires > Date.now()).map((m) => ({
      id: m.id,
      profile_id: m.profile_id,
      name: m.name,
      image_version: m.image_version,
      role: m.id === this.data.config.host_id ? "host" : m.role === "host" ? "listener" : m.role,
      seat: m.seat,
      // Request metadata is private to the applicant and host, in HTTP AND WebSocket snapshots.
      ...host || m.id === p?.id ? { requested: !!m.requested, requestedSeat: m.requestedSeat ?? null, requestExpires: m.requestExpires ?? null, requestVersion: m.requested ? m.requestVersion ?? m.requestExpires : null } : {},
      muted: m.muted,
      locked: m.locked,
      publishing: !!m.pub?.ready,
      mediaKey: m.pub?.ready ? m.generation + ":" + m.pub.trackName : null
    })), chat: p ? this.data.chat.filter((m) => m.sequence > (p.chatAfter ?? this.data.chatSequence)) : [] };
  }
  notify(event = { type: "changed" }, recipients = null) {
    for (const ws of this.ctx.getWebSockets?.() || []) {
      try {
        const a = ws.deserializeAttachment(), p = this.data.members[a.id];
        if (!p || p.generation !== a.generation || p.expires <= Date.now()) {
          ws.close(4001, "Rejoin required");
          continue;
        }
        if (recipients && !recipients.includes(p.id)) continue;
        ws.send(JSON.stringify(event.type === "changed" ? { type: "state", state: this.snapshot(p) } : event));
      } catch {
      }
    }
  }
  checkSeatRequest(member, body) {
    if (body.expected_request_version !== undefined && (!member.requested || (member.requestVersion ?? member.requestExpires) !== body.expected_request_version)) fault(409, "좌석 신청 상태가 변경됐어요. 다시 확인해주세요.");
  }
  clearRequest(p) {
    p.requested = false;
    p.requestedSeat = null;
    p.requestExpires = null;
  }
  clearRequests() {
    const affected = Object.values(this.data.members).filter((p) => p.requested);
    for (const p of affected) this.clearRequest(p);
    if (affected.length) {
      this.data.revision++;
      this.notify({ type: "changed" }, [this.data.config.host_id, ...affected.map((p) => p.id)]);
    }
  }
  async audit(actor, action, target = null) {
    await this.env.ROOM_DB.prepare("INSERT INTO voice_room_events(id,room_id,actor_id,action,target_id,created) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(), this.data.config.id, actor.id, action, target, Date.now()).run();
  }
  queueRetire(media) {
    if (!media?.sessionId) return;
    if (!this.data.cleanup.some((c) => c.sessionId === media.sessionId)) this.data.cleanup.push({ sessionId: media.sessionId, owner: media.owner, kind: media.kind || "publish", mids: media.mids || [], uncertain: !!media.uncertain, expected: media.expected || 1, after: Date.now() + 2e3, tries: 0 });
  }
  notice(p, body) {
    this.data.notices.push({ id: crypto.randomUUID(), kind: "system", user_id: p.id, name: p.name, body, created: Date.now(), sequence: ++this.data.chatSequence });
    this.data.notices = this.data.notices.slice(-100);
  }
  startCleanup(job) {
    if (this.cleaning.has(job.sessionId)) return;
    this.cleaning.add(job.sessionId);
    const work = this.sfu.close(job.sessionId, job.mids, job).then((result) => ({ ok: result?.resolved !== false }), () => ({ ok: false })).then((result) => this.serial(async () => {
      const c = this.data.cleanup.find((c2) => c2.sessionId === job.sessionId);
      if (!c) return;
      if (result.ok) this.data.cleanup = this.data.cleanup.filter((c2) => c2 !== job);
      else {
        c.tries++;
        c.after = Date.now() + Math.min(6e4, 2e3 * 2 ** Math.min(c.tries, 5));
      }
      await this.save();
    })).finally(() => this.cleaning.delete(job.sessionId));
    this.ctx.waitUntil?.(work);
    work.catch(() => {
    });
  }
  async retire(media) {
    if (!media?.sessionId) return;
    this.queueRetire(media);
    await this.save();
    this.startCleanup(this.data.cleanup.find((c) => c.sessionId === media.sessionId));
  }
  async stopPublish(p) {
    const old = p.pub;
    p.pub = null;
    p.muted = true;
    await this.retire(old);
  }
  // The caller holds the DO's serial queue. Membership, permissions and theme
  // are saved together before sockets see the new owner.
  electHost(now, recipient) {
    const d = this.data, room = d.config;
    const active = Object.values(d.members).filter((m) => m.expires > now);
    const order = /* @__PURE__ */ __name((m) => m.joinOrder ?? m.chatAfter ?? 0, "order");
    active.sort((a, b) => order(a) - order(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const next = recipient || active[0];
    if (!next || room.closed) return;
    next.role = "host";
    const previous = d.members[room.host_id];
    if (previous && previous !== next) previous.role = "listener";
    d.seatInvites = {}; this.clearRequests();
    if (!Object.values(d.members).some(m=>m!==next && m.seat===0)) next.seat = 0;
    next.locked = false;
    this.clearRequest(next);
    delete d.seatInvites[next.id];
    room.host_id = next.id;
    room.background = "navy";
    room.theme_sku = "navy";
    room.settings_revision = (room.settings_revision || 0) + 1;
    d.hostReconnectUntil = 0;
    delete d.hostReconnectGeneration;
    d.directoryDirty = true;
    if (room.visibility === "followers") for (const m of active) m.visibilityRetained = true;
    this.notice(next, next.name + "\uB2D8\uC774 \uC0C8 \uBC29\uC7A5\uC774 \uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
  }
  async remove(p, temporary = false) {
    const wasHost = p.id === this.data.config.host_id, talk = this.data.config.mode !== "karaoke";
    if (wasHost) { this.clearRequests(); this.data.seatInvites = {}; }
    delete this.data.seatInvites[p.id];
    if (temporary && wasHost) {
      this.data.hostReconnectUntil = Date.now() + 3e5;
      this.data.hostReconnectGeneration = p.generation;
    }
    if (wasHost && !talk && this.data.music?.playing) this.data.music = changeRoomMusic(this.data.music, { operation: "pause" });
    this.notice(p, p.name + "\uB2D8\uC774 \uD1F4\uC7A5\uD588\uC5B4\uC694.");
    delete this.data.members[p.id];
    this.queueRetire(p.pub);
    this.queueRetire(p.sub);
    if (wasHost && !temporary && !this.data.config.closed) this.electHost(Date.now());
    this.data.revision++;
    if (!Object.keys(this.data.members).length && !(this.data.hostReconnectUntil > Date.now())) await this.closeRoom();
    await this.save();
    await this.syncDirectory();
    this.notify();
    await this.retire(p.pub);
    await this.retire(p.sub);
  }
  async expire() {
    const now = Date.now();
    for (const [k, t] of Object.entries(this.data.nonces)) if (t < now - 3e4) delete this.data.nonces[k];
    for (const [k, v] of Object.entries(this.data.rates)) if (v.until < now) delete this.data.rates[k];
    for (const [k, i] of Object.entries(this.data.seatInvites)) if (i.expires <= now || !this.data.members[i.target]) delete this.data.seatInvites[k];
    for (const [k, t] of Object.entries(this.data.invites)) if (t < now) delete this.data.invites[k];
    for (const p of Object.values(this.data.members)) {
      if (p.requested && (!p.requestExpires || p.requestExpires <= now)) {
        this.clearRequest(p);
        this.data.revision++;
        this.notify({ type: "changed" }, [p.id, this.data.config.host_id]);
      }
      if (p.expires <= now) await this.remove(p, true);
      else if (p.pub && !p.pub.ready && p.pub.deadline < Date.now()) await this.stopPublish(p);
      else if (p.sub?.deadline && p.sub.deadline < now) {
        const old = p.sub;
        p.sub = null;
        await this.retire(old);
      }
    }
    if (this.data.config && !this.data.config.closed && !this.data.members[this.data.config.host_id] && !(this.data.hostReconnectUntil > now) && Object.keys(this.data.members).length) {
      this.electHost(now);
      this.data.revision++;
      await this.save();
      this.notify();
    }
    if (!Object.keys(this.data.members).length && !(this.data.hostReconnectUntil > Date.now())) await this.closeRoom();
    const music = this.data.music;
    let guard = 0;
    while (music?.playing && music.index >= 0 && guard++ < 50 && music.position + Math.max(0, Date.now() - music.updated) / 1e3 >= music.queue[music.index].duration) {
      const endedAt = music.updated + (music.queue[music.index].duration - music.position) * 1e3;
      Object.assign(music, changeRoomMusic(music, { operation: "ended", revision: music.revision }, void 0, endedAt));
      this.data.revision++;
      this.notify();
    }
    await this.syncDirectory();
  }
  async alarm() {
    return this.serial(async () => {
      await this.load();
      await this.expire();
      for (const c of this.data.cleanup) {
        if (c.after <= Date.now()) this.startCleanup(c);
      }
      await this.save();
      this.notify();
    });
  }
  async fetch(req) {
    const response = await this.serial(async () => {
      await this.load();
      try {
        const b = req.method === "GET" ? JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(req.headers.get("x-room-payload")), (c) => c.charCodeAt(0)))) : await req.json(), actor = b.actor, action = new URL(req.url).pathname.slice(1);
        if (!actor?.id) fault(401, "\uB85C\uADF8\uC778 \uD6C4 \uC774\uC6A9\uD574\uC8FC\uC138\uC694.");
        await this.expire();
        if (!b.stamp || this.data.nonces[b.stamp.nonce]) fault(409, "\uC911\uBCF5\uB41C \uC11C\uBC84 \uC694\uCCAD\uC774\uC5D0\uC694.");
        this.data.nonces[b.stamp.nonce] = b.stamp.timestamp;
        if (["publish", "subscribe", "answer"].includes(action)) return { media: await this.prepareMedia(action, actor, b.input || {}) };
        const result = await this.command(action, actor, b.input || {}, b.roomId);
        return result instanceof Response ? result : reply(result);
      } catch (e) {
        return reply({ error: e.status ? e.message : "\uD1A0\uD0B9\uB8F8 \uC694\uCCAD\uC744 \uCC98\uB9AC\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694." }, e.status || 500);
      } finally {
        await this.save();
      }
    });
    if (response?.media) {
      try {
        return reply(await response.media());
      } catch (e) {
        return reply({ error: e.status ? e.message : "\uC74C\uC131 \uC5F0\uACB0\uC744 \uCC98\uB9AC\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694." }, e.status || 500);
      }
    }
    return response;
  }
  async command(action, actor, b, roomId) {
    const d = this.data;
    if (action === "create") {
      if (d.config) {
        if (d.config.host_id === actor.id && !d.config.closed) return { room: d.config };
        fault(409, "\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uBC29\uC774\uC5D0\uC694.");
      }
      let settings;
      try {
        settings = roomSettings(b, actor);
      } catch (e) {
        fault(400, e.message);
      }
      const config = { ...settings, id: identifier(roomId), host_id: actor.id, ...b.theme_sku ? { theme_sku: b.theme_sku } : {}, created: Date.now(), closed: false, mic_seats: 8 };
      await this.env.ROOM_DB.prepare("INSERT INTO voice_rooms(id,title,host_id,visibility,crew_id,created,max_members,background,announcement) VALUES(?,?,?,?,?,?,?,?,?)").bind(config.id, config.title, actor.id, config.visibility, config.crew_id, config.created, config.max_members, config.background, config.announcement).run();
      d.config = config;
      await this.command("join", actor, { request_id: crypto.randomUUID() }, roomId);
      return { room: config };
    }
    if (action === 'directory-card') return talkingDirectoryCard(d,b.members,b.mode);
    if (action === "presence") return { active: !!d.config && !d.config.closed && Object.keys(d.members).length > 0, host_id: d.config?.host_id, background: d.config?.background, theme_sku: d.config?.theme_sku, settings_revision: d.config?.settings_revision, mode: d.config?.mode, visibility: d.config?.visibility, member_count: Object.keys(d.members).length, host_name: d.members[d.config?.host_id]?.name || "" };
    if (action === "leave" && !d.members[actor.id]) {
      if (d.config?.host_id === actor.id && d.hostReconnectUntil > Date.now() && b.generation && b.generation === d.hostReconnectGeneration) {
        d.hostReconnectUntil = 0;
        delete d.hostReconnectGeneration;
        if (Object.keys(d.members).length) this.electHost(Date.now());
        else await this.closeRoom();
        d.revision++;
        await this.save();
        await this.syncDirectory();
        this.notify();
      }
      return { ok: true };
    }
    try {
      this.access(actor, action !== "join" && !!d.members[actor.id]);
    } catch (e) {
      const old = d.members[actor.id];
      if (old) await this.remove(old);
      throw e;
    }
    if (action === "join") {
      this.limited(actor, "join", 10);
      requestId(b.request_id);
      let p2 = d.members[actor.id];
      if (p2 && p2.joinRequest === b.request_id) {
        p2.expires = Date.now() + LEASE;
        return this.snapshot(actor);
      }
      if (!p2 && actor.id !== d.config.host_id && Object.keys(d.members).length >= (d.config.max_members || 30)) fault(409, "\uBC29\uC774 \uAC00\uB4DD \uCC3C\uC5B4\uC694. \uCD5C\uB300 30\uBA85\uAE4C\uC9C0 \uC785\uC7A5\uD560 \uC218 \uC788\uC5B4\uC694.");
      const old = p2;
      if (old) {
        await this.stopPublish(old);
        await this.retire(old.sub);
      }
      p2 = { id: actor.id, profile_id: actor.profile_id, name: actor.name, image_version: actor.image_version || "", joinOrder: old?.joinOrder ?? old?.chatAfter ?? d.chatSequence, visibilityRetained: !!old?.visibilityRetained, role: old?.role || (actor.id === d.config.host_id ? "host" : "listener"), seat: old?.seat ?? (actor.id === d.config.host_id ? Array.from({length:8},(_,i)=>i).find(i=>!Object.values(d.members).some(m=>m.seat===i)) ?? null : null), requested: false, locked: old?.locked || false, muted: true, pub: null, sub: null, generation: crypto.randomUUID(), expires: Date.now() + LEASE, joinRequest: b.request_id, chatAfter: old?.chatAfter ?? d.chatSequence };
      if (p2.role === "host") {
        d.hostReconnectUntil = 0;
        delete d.hostReconnectGeneration;
      }
      d.members[actor.id] = p2;
      if (!old) this.notice(p2, p2.name + "\uB2D8\uC774 \uC785\uC7A5\uD588\uC5B4\uC694.");
      d.revision++;
      this.notify();
      return this.snapshot(actor);
    }
    const p = this.member(actor, b.generation);
    this.limited(actor, "requests", 180);
    if (action === "state" || action === "heartbeat") {
      p.expires = Date.now() + LEASE;
      return this.snapshot(actor);
    }
    if (action === "socket") {
      const pair = new WebSocketPair();
      for (const ws of this.ctx.getWebSockets?.() || []) {
        const a = ws.deserializeAttachment();
        if (a.id === actor.id) ws.close(4e3, "Connection replaced");
      }
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].serializeAttachment({ id: actor.id, generation: p.generation });
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (action === "leave") {
      await this.remove(p);
      return { ok: true };
    }
    if (action === "close") {
      this.moderator(actor);
      await this.closeRoom();
      for (const member of Object.values(d.members)) await this.remove(member);
      await this.audit(actor, "close");
      return { ok: true };
    }
    if (action === "settings") {
      this.moderator(actor);
      if (b.revision !== void 0 && b.revision !== (d.config.settings_revision || 0)) fault(409, "\uBC29 \uC124\uC815\uC774 \uBCC0\uACBD\uB410\uC5B4\uC694. \uB2E4\uC2DC \uC5F4\uC5B4\uC8FC\uC138\uC694.");
      let settings;
      try {
        settings = roomSettings(b, actor, d.config);
      } catch (e) {
        fault(400, e.message);
      }
      await this.env.ROOM_DB.prepare("UPDATE voice_rooms SET title=?,visibility=?,crew_id=?,max_members=?,background=?,announcement=? WHERE id=?").bind(settings.title, settings.visibility, settings.crew_id, settings.max_members, settings.background, settings.announcement, d.config.id).run();
      if (settings.visibility !== d.config.visibility) for (const member of Object.values(d.members)) member.visibilityRetained = true;
      if (settings.seating_mode === "free" && d.config.seating_mode !== "free") for (const member of Object.values(d.members)) this.clearRequest(member);
      if (settings.mode !== (d.config.mode || "talk")) resetLiveRoomMode(this, settings.mode, p);
      Object.assign(d.config, settings, b.theme_sku ? { theme_sku: b.theme_sku } : {}, { settings_revision: (d.config.settings_revision || 0) + 1 });
      this.notice(p, "\uBC29 \uC124\uC815\uC774 \uBCC0\uACBD\uB410\uC5B4\uC694.");
      await this.audit(actor, "settings");
    } else if (action === "seat-invite") {
      this.moderator(actor);
      const t = d.members[identifier(b.target_id)];
      if (!t || t.seat !== null) fault(409, "\uD604\uC7AC \uCCAD\uCDE8 \uC911\uC778 \uCC38\uC5EC\uC790\uB97C \uC120\uD0DD\uD574\uC8FC\uC138\uC694.");
      const seat = Number(b.seat);
      if (!Number.isInteger(seat) || seat < 0 || seat > 7 || Object.values(d.members).some((m) => m.seat === seat)) fault(409, "\uBE48 \uC88C\uC11D\uC744 \uB2E4\uC2DC \uC120\uD0DD\uD574\uC8FC\uC138\uC694.");
      d.seatInvites[t.id] = { id: crypto.randomUUID(), target: t.id, seat, expires: Date.now() + SEAT_REQUEST_TTL };
      this.notice(p, t.name + "\uB2D8\uC5D0\uAC8C \uC88C\uC11D \uCD08\uB300\uB97C \uBCF4\uB0C8\uC5B4\uC694.");
    } else if (action === "seat-answer") {
      const invitation = d.seatInvites[p.id];
      if (p.locked || !invitation || invitation.id !== b.invitation_id || invitation.expires <= Date.now()) fault(409, "\uC88C\uC11D \uCD08\uB300\uAC00 \uB9CC\uB8CC\uB410\uC5B4\uC694.");
      delete d.seatInvites[p.id];
      if (b.accept === true) {
        if (p.seat !== null || Object.values(d.members).some((m) => m.seat === invitation.seat)) fault(409, "\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uC88C\uC11D\uC774\uC5D0\uC694.");
        p.seat = invitation.seat;
        p.muted = true;
        p.requested = false;
        p.locked = false;
        this.notice(p, p.name + "\uB2D8\uC774 \uC88C\uC11D \uCD08\uB300\uB97C \uC218\uB77D\uD588\uC5B4\uC694.");
      } else this.notice(p, p.name + "\uB2D8\uC774 \uC88C\uC11D \uCD08\uB300\uB97C \uAC70\uC808\uD588\uC5B4\uC694.");
    } else if (action === "self-mute") {
      if (typeof b.muted !== "boolean" || !p.pub?.ready || p.locked || p.seat === null) fault(409, "\uB9C8\uC774\uD06C \uC5F0\uACB0\uC744 \uB2E4\uC2DC \uC2DC\uC791\uD574\uC8FC\uC138\uC694.");
      if (b.sequence !== void 0) {
        if (!Number.isSafeInteger(b.sequence) || b.sequence < 0) fault(400, "\uB9C8\uC774\uD06C \uC0C1\uD0DC \uBC88\uD638\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
        if (b.sequence <= (p.micSequence ?? -1)) return this.snapshot(actor);
        p.micSequence = b.sequence;
      }
      if (p.muted === b.muted) return this.snapshot(actor);
      p.muted = b.muted;
    } else if (action === "request-mic") {
      this.limited(actor, "mic", 10);
      if (p.requested) return this.snapshot(actor);
      if (p.locked) fault(403, "\uAD00\uB9AC\uC790\uAC00 \uB9C8\uC774\uD06C \uC0AC\uC6A9\uC744 \uC81C\uD55C\uD588\uC5B4\uC694.");
      if (!d.members[d.config.host_id] || d.members[d.config.host_id].expires <= Date.now()) fault(409, "\uBC29\uC7A5\uC774 \uB2E4\uC2DC \uC5F0\uACB0\uB41C \uB4A4 \uC2E0\uCCAD\uD574\uC8FC\uC138\uC694.");
      const seat = b.seat ?? Array.from({ length: 8 }, (_, i) => i).find((i) => !Object.values(d.members).some((m) => m.seat === i));
      if (!Number.isInteger(seat) || seat < 0 || seat > 7 || Object.values(d.members).some((m) => m.seat === seat)) fault(409, "\uBE48 \uC88C\uC11D\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694.");
      if (d.config.seating_mode === "free" || p.seat !== null || p.role === "host") {
        if (p.seat === null) p.muted = true;
        p.seat = seat;
        this.clearRequest(p);
        delete d.seatInvites[p.id];
        this.notice(p, p.name + "\uB2D8\uC774 " + (seat + 1) + "\uBC88 \uC88C\uC11D\uC5D0 \uC62C\uB77C\uC654\uC5B4\uC694.");
        await this.audit(actor, "free-seat", p.id);
      } else {
        p.requested = true;
        p.requestedSeat = seat;
        p.requestVersion = d.revision + 1;
        p.requestExpires = Date.now() + SEAT_REQUEST_TTL;
      }
    } else if (action === "cancel-mic") {
      this.checkSeatRequest(p, b);
      if (!p.requested) return this.snapshot(actor);
      this.clearRequest(p);
    } else if (action === "reject-mic") {
      this.moderator(actor);
      const t = d.members[identifier(b.target_id)];
      if (!t) fault(404, "\uD68C\uC6D0\uC774 \uB098\uAC14\uC5B4\uC694.");
      this.checkSeatRequest(t, b);
      this.clearRequest(t);
      await this.audit(actor, "reject-mic", t.id);
    } else if (action === "approve-mic") {
      this.moderator(actor);
      const t = d.members[identifier(b.target_id)];
      if (!t) fault(404, "\uD68C\uC6D0\uC774 \uB098\uAC14\uC5B4\uC694.");
      this.checkSeatRequest(t, b);
      if (t.seat !== null) return this.snapshot(actor);
      if (t.id === actor.id && Number.isInteger(b.seat) && b.seat >= 0 && b.seat < 8) t.requestedSeat = b.seat;
      if (!t.requested && t.id !== actor.id) fault(409, "\uB9C8\uC774\uD06C \uC2E0\uCCAD\uC744 \uBA3C\uC800 \uBC1B\uC544\uC8FC\uC138\uC694.");
      if (t.seat === null) {
        const used = new Set(Object.values(d.members).map((m) => m.seat));
        if (Number.isInteger(t.requestedSeat) && used.has(t.requestedSeat)) fault(409, "\uC2E0\uCCAD\uD55C \uC88C\uC11D\uC774 \uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC774\uC5D0\uC694. \uC2E0\uCCAD\uC744 \uCDE8\uC18C\uD558\uACE0 \uB2E4\uB978 \uC88C\uC11D\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694.");
        const seat = Number.isInteger(t.requestedSeat) ? t.requestedSeat : Array.from({ length: 8 }, (_, i) => i).find((i) => !used.has(i));
        if (seat === void 0) fault(409, "\uB9C8\uC774\uD06C 8\uC11D\uC774 \uBAA8\uB450 \uC0AC\uC6A9 \uC911\uC774\uC5D0\uC694.");
        t.seat = seat;
      }
      this.notice(t, t.name + "\uB2D8\uC774 " + (t.seat + 1) + "\uBC88 \uC88C\uC11D\uC5D0 \uC62C\uB77C\uC654\uC5B4\uC694.");
      t.locked = false;
      this.clearRequest(t);
      t.muted = true;
      await this.audit(actor, "approve-mic", t.id);
    } else if (action === "release-mic") {
      if (p.role === "host") fault(403, "\uBC29\uC7A5 \uC88C\uC11D\uC740 \uACE0\uC815\uB418\uC5B4 \uC788\uC5B4\uC694.");
      if (p.seat === null) return this.snapshot(actor);
      this.notice(p, p.name + "\uB2D8\uC774 " + (p.seat + 1) + "\uBC88 \uC88C\uC11D\uC5D0\uC11C \uB0B4\uB824\uC654\uC5B4\uC694.");
      await this.stopPublish(p);
      p.seat = null;
      this.clearRequest(p);
    } else if (action === "mute") {
      await this.stopPublish(p);
    } else if (action === "moderate") {
      const t = this.target(actor, b.target_id);
      if (!["mute", "unlock", "kick", "ban-day", "transfer-host", "remove-seat", "move-seat"].includes(b.operation)) fault(400, "\uAD00\uB9AC \uC791\uC5C5\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      if (["remove-seat", "move-seat"].includes(b.operation)) {
        if (t.seat === null) {
          if (b.operation === "remove-seat") return this.snapshot(actor);
          fault(409, "\uC774\uBBF8 \uCCAD\uCDE8 \uC911\uC774\uC5D0\uC694.");
        }
        if (b.operation === "remove-seat") {
          await this.stopPublish(t);
          t.seat = null;
          this.clearRequest(t);
        } else {
          const seat = Number(b.seat);
          if (!Number.isInteger(seat) || seat < 0 || seat > 7 || Object.values(d.members).some((m) => m.seat === seat)) fault(409, "\uBE48 \uC88C\uC11D\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694.");
          t.seat = seat;
        }
        this.notice(t, t.name + "\uB2D8\uC758 \uC88C\uC11D\uC774 \uBCC0\uACBD\uB410\uC5B4\uC694.");
      }
      if (b.operation === "mute") {
        t.locked = true;
        this.clearRequest(t);delete d.seatInvites[t.id];
        await this.stopPublish(t);
      }
      if (b.operation === "unlock") t.locked = false;
      if (b.operation === "transfer-host") { this.electHost(Date.now(), t); await this.syncDirectory(); }
      if (["kick","ban-day"].includes(b.operation)) {
        d.bans[t.id] = Date.now() + (b.operation==="kick"?60000:86400000);
        await this.remove(t);
      }
      if (!["remove-seat", "move-seat","transfer-host"].includes(b.operation)) this.notice(t, t.name + "\uB2D8: " + { mute: "\uB9C8\uC774\uD06C \uC0AC\uC6A9 \uC81C\uD55C", unlock: "\uB9C8\uC774\uD06C \uC81C\uD55C \uD574\uC81C", kick: "\uAC15\uD1F4","ban-day":"1일 추방" }[b.operation]);
      await this.audit(actor, b.operation, t.id);
    } else if (action === "chat") {
      this.limited(actor, "chat", 20);
      const rid = requestId(b.request_id), body = text(b.body, 500), old = d.chat.find((m) => m.request_id === rid && m.user_id === actor.id);
      if (old) {
        if (old.body !== body) fault(409, "\uC774\uBBF8 \uC0AC\uC6A9\uD55C \uBA54\uC2DC\uC9C0 \uC694\uCCAD\uC774\uC5D0\uC694.");
        return { message: old };
      }
      const message = { id: crypto.randomUUID(), request_id: rid, user_id: actor.id, name: p.name, profile_id: p.profile_id, image_version: p.image_version, body, created: Date.now(), sequence: ++d.chatSequence };
      d.chat.push(message);
      d.chat = d.chat.slice(-100);
      d.revision++;
      this.notify();
      return { message };
    } else if (action === "invite") {
      this.limited(actor, "invite", 10);
      if (d.config.visibility === "private") this.moderator(actor);
      const id = identifier(b.target_id);
      if((b.target_blocks||[]).some(uid=>d.members[uid])||
      (d.config.visibility==='followers'&&id!==d.config.host_id&&!(b.target_followed_hosts||[]).includes(d.config.host_id)))fault(403,'이 방에 입장할 수 없는 참여자예요.');
   if(!d.members[id]&&Object.keys(d.members).length>=(d.config.max_members||30))fault(409,'방이 가득 찼어요.');
   if (d.config.visibility === "crew" && !(b.target_crews || []).includes(d.config.crew_id)) fault(403, "\uAC19\uC740 \uD06C\uB8E8 \uBA64\uBC84\uB9CC \uCD08\uB300\uD560 \uC218 \uC788\uC5B4\uC694.");
      if (d.bans[id] > Date.now()) fault(403, "\uCC28\uB2E8\uB41C \uD68C\uC6D0\uC740 \uCD08\uB300\uD560 \uC218 \uC5C6\uC5B4\uC694.");
      d.invites[id] = Date.now() + 864e5;
      return { room: d.config };
    } else if (action === "gift-target") {
      const t = d.members[identifier(b.target_id)];
      if (!t || t.expires <= Date.now()) fault(404, "\uC120\uBB3C \uBC1B\uC744 \uD68C\uC6D0\uC774 \uBC29\uC744 \uB098\uAC14\uC5B4\uC694.");
      return { target: { id: t.id, profile_id: t.profile_id } };
    } else if (action === "gift-receipt") {
      const receipt = b.receipt;
      if (!receipt?.id || !Number.isSafeInteger(receipt.gold) || receipt.gold < 1 || !Number.isInteger(receipt.quantity) || receipt.quantity < 1 || receipt.quantity > 100) fault(400, "\uC120\uBB3C \uC601\uC218\uC99D\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      const giftName = text(receipt.name, 80), recipient = text(b.target_name, 100);
      if (!d.gifts.includes(receipt.id)) {
        const message = { id: "gift-" + receipt.id, kind: "gift", user_id: p.id, name: p.name, recipient_name: recipient, gift: { id: receipt.id, type: receipt.type, name: giftName, quantity: receipt.quantity }, body: `${p.name}\uB2D8\uC774 ${recipient}\uB2D8\uC5D0\uAC8C ${giftName} \xD7${receipt.quantity}\uC744 \uBCF4\uB0C8\uC2B5\uB2C8\uB2E4.`, created: Date.now(), sequence: ++d.chatSequence };
        d.gifts.push(receipt.id);
        d.gifts = d.gifts.slice(-500);
        d.chat.push(message);
        d.chat = d.chat.slice(-100);
        d.revision++;
        await this.save();
        this.notify({ type: "gift", gift: receipt, from: p.name, to: recipient });
      }
      return { ok: true };
    } else if (action === "music") {
      this.moderator(actor);
      if (d.config.mode !== "karaoke" && ["volume", "balance"].includes(b.operation)) fault(400, "\uC74C\uC545 \uBCFC\uB968\uC740 \uB0B4 \uAE30\uAE30\uC5D0\uC11C \uC870\uC808\uD574\uC8FC\uC138\uC694.");
      this.limited(actor, "music", 90);
      const rid = requestId(b.request_id), fingerprint = JSON.stringify(b);
      const prior = d.musicRequests.find((r) => r.id === rid);
      if (prior) {
        if (prior.fingerprint !== fingerprint) fault(409, "\uC774\uBBF8 \uC0AC\uC6A9\uD55C \uC74C\uC545 \uC694\uCCAD\uC774\uC5D0\uC694.");
        return this.snapshot(actor);
      }
      const track = b.track;
      if (b.operation === "enqueue" && (!track || typeof track.id !== "string" || !Number.isFinite(track.duration) || track.duration <= 0 || typeof track.title !== "string")) fault(400, "\uC11C\uBC84\uAC00 \uD655\uC778\uD55C \uACE1\uC774 \uD544\uC694\uD574\uC694.");
      try {
        d.music = changeRoomMusic(d.music, b, track);
      } catch (e) {
        fault(400, e.message);
      }
      d.musicRequests.push({ id: rid, fingerprint });
      d.musicRequests = d.musicRequests.slice(-100);
    } else if (action === "published") {
      if (p.seat === null || p.locked || !p.pub || !p.pub.ready && (!p.pub.negotiated || p.pub.deadline < Date.now())) fault(409, "\uB9C8\uC774\uD06C \uC5F0\uACB0\uC744 \uB2E4\uC2DC \uC2DC\uC791\uD574\uC8FC\uC138\uC694.");
      if (p.pub.ready) return this.snapshot(actor);
      p.pub.ready = true;
      p.pub.deadline = 0;
      p.muted = b.muted === true;
      p.micSequence = -1;
    } else fault(404, "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD1A0\uD0B9\uB8F8 \uC694\uCCAD\uC774\uC5D0\uC694.");
    d.revision++;
    this.notify(action === "music" ? { type: "music", music: d.music, revision: d.revision, serverNow: Date.now() } : { type: "changed" }, ["request-mic", "cancel-mic", "reject-mic"].includes(action) && !(action === "request-mic" && d.config.seating_mode === "free") ? [d.config.host_id, b.target_id || p.id] : null);
    return this.snapshot(actor);
  }
  async prepareMedia(action, actor, b) {
    this.access(actor, !!this.data.members[actor.id]);
    const p = this.member(actor, b.generation);
    this.limited(actor, "media", 60);
    p.expires = Date.now() + LEASE;
    const trace = b.request_id ? requestId(b.request_id) : crypto.randomUUID(), started = Date.now();
    const generation = p.generation, valid = /* @__PURE__ */ __name((media) => this.data.config && !this.data.config.closed && this.data.members[p.id]?.generation === generation && this.data.members[p.id][media.kind === "publish" ? "pub" : "sub"] === media, "valid");
    const discard = /* @__PURE__ */ __name(async (media, error) => {
      console.warn(JSON.stringify({ event: "voice_media_failed", trace, operation: action, status: error?.status || 500, elapsed_ms: Date.now() - started }));
      await this.serial(async () => {
        if (error?.sfuUncertain) media.uncertain = true;
        if (valid(media)) {
          p[media.kind === "publish" ? "pub" : "sub"] = null;
          if (media.kind === "publish") p.muted = true;
        }
        await this.retire(media);
        await this.save();
      });
      throw error;
    }, "discard");
    if (action === "publish") {
      if (p.seat === null || p.locked) fault(403, "\uC2B9\uC778\uB41C \uB9C8\uC774\uD06C \uC88C\uC11D\uC774 \uD544\uC694\uD574\uC694.");
      if (this.data.cleanup.some((c) => c.owner === p.id && c.kind !== "subscribe")) fault(409, "\uC774\uC804 \uC1A1\uCD9C \uC5F0\uACB0\uC744 \uC815\uB9AC\uD558\uACE0 \uC788\uC5B4\uC694. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uCF1C\uC8FC\uC138\uC694.");
      if (p.pub) fault(409, "\uC774\uBBF8 \uC5F0\uACB0 \uC911\uC778 \uB9C8\uC774\uD06C\uC608\uC694.");
      const mid = identifier(b.mid), offer = audioOffer(b.sessionDescription, mid), media = p.pub = { owner: p.id, kind: "publish", mids: [mid], trackName: "mic-" + crypto.randomUUID(), ready: false, negotiated: false, uncertain: true, expected: 1, deadline: Date.now() + 35e3 };
      return async () => {
        try {
          media.sessionId = await this.sfu.create();
          await this.serial(async () => {
            await this.save();
            if (!valid(media) || p.locked || p.seat === null) fault(409, "\uB9C8\uC774\uD06C \uC5F0\uACB0\uC774 \uBCC0\uACBD\uB410\uC5B4\uC694.");
          });
          const r = await this.sfu.tracks(media.sessionId, { sessionDescription: offer, tracks: [{ location: "local", mid, trackName: media.trackName }] });
          return await this.serial(async () => {
            media.uncertain = false;
            media.mids = [.../* @__PURE__ */ new Set([mid, ...(r.tracks || []).map((t) => t.mid).filter(Boolean)])];
            if (!valid(media) || p.locked || p.seat === null) fault(409, "\uB9C8\uC774\uD06C \uC5F0\uACB0\uC774 \uBCC0\uACBD\uB410\uC5B4\uC694.");
            if (!r.sessionDescription || r.tracks?.some((t) => t.errorCode) || r.requiresImmediateRenegotiation) fault(502, "\uB9C8\uC774\uD06C \uD611\uC0C1\uC744 \uB2E4\uC2DC \uC2DC\uC791\uD574\uC8FC\uC138\uC694.");
            console.info(JSON.stringify({ event: "voice_publish_negotiated", trace, elapsed_ms: Date.now() - started }));
            media.negotiated = true;
            media.deadline = Date.now() + 3e4;
            await this.save();
            return { sessionDescription: r.sessionDescription, trace_id: trace };
          });
        } catch (e) {
          return discard(media, e);
        }
      };
    }
    if (action === "subscribe") {
      const targets = Object.values(this.data.members).filter((m) => m.id !== p.id && m.pub?.ready && m.expires > Date.now()).map((m) => ({ id: m.id, sessionId: m.pub.sessionId, trackName: m.pub.trackName }));
      const previous = p.sub;
      p.sub = null;
      await this.retire(previous);
      if (!targets.length) return async () => ({ tracks: [] });
      const sub2 = p.sub = { owner: p.id, kind: "subscribe", mids: [], negotiation: crypto.randomUUID(), uncertain: true, expected: targets.length, deadline: Date.now() + 35e3 };
      return async () => {
        try {
          sub2.sessionId = await this.sfu.create();
          await this.serial(async () => {
            await this.save();
            if (!valid(sub2)) fault(409, "\uC218\uC2E0 \uC5F0\uACB0\uC774 \uBCC0\uACBD\uB410\uC5B4\uC694.");
          });
          const r = await this.sfu.tracks(sub2.sessionId, { tracks: targets.map((t) => ({ location: "remote", sessionId: t.sessionId, trackName: t.trackName })) });
          return await this.serial(async () => {
            sub2.uncertain = false;
            sub2.mids = (r.tracks || []).map((t) => t.mid).filter(Boolean);
            if (!valid(sub2)) fault(409, "\uC218\uC2E0 \uC5F0\uACB0\uC774 \uBCC0\uACBD\uB410\uC5B4\uC694.");
            if (!r.sessionDescription || r.tracks?.some((t) => t.errorCode) || sub2.mids.length !== targets.length || r.tracks.some((t) => !targets.some((m) => m.trackName === t.trackName))) fault(502, "\uC74C\uC131 \uC218\uC2E0 \uD611\uC0C1\uC744 \uB2E4\uC2DC \uC2DC\uC791\uD574\uC8FC\uC138\uC694.");
            sub2.deadline = Date.now() + 3e4;
            await this.save();
            return { sessionDescription: r.sessionDescription, negotiation: sub2.negotiation, tracks: r.tracks.map((t) => ({ mid: t.mid, user_id: targets.find((m) => m.trackName === t.trackName)?.id })), generation };
          });
        } catch (e) {
          return discard(sub2, e);
        }
      };
    }
    const sub = p.sub;
    if (!sub || sub.negotiation !== b.negotiation || !sub.deadline || sub.deadline < Date.now() || sub.answering) fault(409, "\uC74C\uC131 \uD611\uC0C1 \uC2DC\uAC04\uC774 \uB9CC\uB8CC\uB418\uC5C8\uC5B4\uC694.");
    const description = audioAnswer(b.sessionDescription, sub.mids);
    sub.answering = true;
    return async () => {
      try {
        await this.sfu.answer(sub.sessionId, description);
        return await this.serial(async () => {
          if (!valid(sub)) fault(409, "\uC218\uC2E0 \uC5F0\uACB0\uC774 \uBCC0\uACBD\uB410\uC5B4\uC694.");
          sub.deadline = 0;
          sub.answering = false;
          await this.save();
          return { ok: true };
        });
      } catch (e) {
        return discard(sub, e);
      }
    };
  }
  webSocketMessage(ws) {
    ws.close(1008, "Use authenticated HTTP commands");
  }
  webSocketClose(ws) {
    const work = this.serial(async () => {
      await this.load();
      const a = ws.deserializeAttachment(), p = this.data.members[a.id];
      if (p?.role === "host" && p.generation === a.generation && !this.ctx.getWebSockets().some((other) => other !== ws && other.readyState === 1 && other.deserializeAttachment().id === p.id)) {
        this.clearRequests();
        await this.save();
      }
    });
    this.ctx.waitUntil?.(work);
    work.catch(() => {
    });
  }
  webSocketError() {
  }
};

// worker.js
var worker_default = { async fetch(req, env) {
  try {
    const socket = req.method === "GET" && new URL(req.url).pathname.endsWith("/socket");
    if (req.method !== "POST" && !socket) fault(405, "\uD5C8\uC6A9\uB418\uC9C0 \uC54A\uB294 \uC694\uCCAD\uC774\uC5D0\uC694.");
    if (Number(req.headers.get("content-length")) > 4e4) fault(413, "\uC694\uCCAD\uC774 \uB108\uBB34 \uCEE4\uC694.");
    const bytes = socket ? Uint8Array.from(atob(req.headers.get("x-voice-payload") || ""), (c) => c.charCodeAt(0)) : await req.arrayBuffer();
    if (bytes.byteLength > 4e4) fault(413, "\uC694\uCCAD\uC774 \uB108\uBB34 \uCEE4\uC694.");
    const body = new TextDecoder().decode(bytes);
    const stamp = await verifyRequest(req, env.VOICE_BRIDGE_SECRET, body);
    const data = JSON.parse(body);
    identifier(data.actor?.id);
    const match = new URL(req.url).pathname.match(/^\/rooms\/([\w-]+)\/([a-z-]+)$/);
    if (!match) fault(404, "\uD1A0\uD0B9\uB8F8\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.");
    const [, id, action] = match;
  if(id==='directory'&&['candidates','cards'].includes(action))return await talkingDirectory(env,action,data.input,data.actor,stamp);
    if (id === "directory" && action === "list") {
      const crews = (data.actor.crews || []).slice(0, 50), followed = data.actor.followedHosts || [];
      const result = await env.ROOM_DB.prepare(`SELECT id,title,host_id,visibility,crew_id,created,max_members,background FROM voice_rooms WHERE closed=0 AND visibility='public' ORDER BY created DESC LIMIT 100`).bind().all();
      const active = await Promise.all(result.results.map(async (room) => {
        const response = await env.ROOMS.get(env.ROOMS.idFromName(room.id)).fetch(new Request("https://room/presence", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actor: data.actor, input: {}, stamp, roomId: room.id }) }));
        if (!response.ok) fault(503, "\uD1A0\uD0B9\uB8F8 \uBAA9\uB85D\uC744 \uC0C8\uB85C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.");
        const state = await response.json();
        return state.active && state.visibility === "public" ? { ...room, host_id: state.host_id ?? room.host_id, background: state.background ?? room.background, theme_sku: state.theme_sku, settings_revision: state.settings_revision, member_count: state.member_count, host_name: state.host_name, mode: state.mode || "talk" } : null;
      }));
      return reply({ rooms: active.filter(Boolean) });
    }
    const payload = JSON.stringify({ ...data, stamp, roomId: id });
    const headers = socket ? { upgrade: "websocket", "x-room-payload": btoa(String.fromCharCode(...new TextEncoder().encode(payload))) } : { "content-type": "application/json" };
    return env.ROOMS.get(env.ROOMS.idFromName(identifier(id))).fetch(new Request("https://room/" + action, { method: socket ? "GET" : "POST", headers, body: socket ? void 0 : payload }));
  } catch (e) {
    return reply({ error: e.status ? e.message : "\uD1A0\uD0B9\uB8F8 \uC5F0\uACB0\uC5D0 \uC2E4\uD328\uD588\uC5B4\uC694." }, e.status || 500);
  }
} };
export {
  VoiceRoom,
  worker_default as default
};


// Production add-on: extends the 2026-10-26 voice worker without replacing its modern room logic.
// This source is appended to the exact, archived operational worker bundle.
const baseRoomSettings=roomSettings;
roomSettings=function(input,actor,previous={}){
 const s=baseRoomSettings(input,actor,previous),mode=input.mode??previous.mode??'talk';
 if(!['talk','karaoke'].includes(mode))fault(400,'방 유형을 확인해주세요.');
 return {...s,mode};
};
const LIVE_INVITE_MS=15000;
const LIVE_READY_MS=15000;
const liveEmpty=()=>({queue:[],active:null,phase:'idle',startsAt:0,inviteExpiresAt:0,readyExpiresAt:0,revision:0});
const liveHas=(d,id)=>!!d.members[id]&&d.members[id].expires>Date.now();
async function liveStopSinger(room){
 const k=room.data.karaoke;
 if(!k?.active)return;
 const member=room.data.members[k.active.user_id];
 if(member){await room.stopPublish(member);if(member.role!=='host')member.seat=null;}
 k.active=null;k.phase='idle';k.startsAt=0;k.inviteExpiresAt=0;k.readyExpiresAt=0;k.revision++;
}
function liveNext(room,allowEmpty=false){
 const {karaoke:k,members}=room.data;
 while(k.queue.length){
  const next=k.queue.shift(),member=members[next.user_id];
  if(!liveHas(room.data,next.user_id)||member.locked)continue;
  k.active={user_id:member.id,name:member.name,track:next.track,invitation_id:next.request_id};
  k.phase='invited';k.startsAt=0;k.inviteExpiresAt=Date.now()+LIVE_INVITE_MS;k.readyExpiresAt=0;k.revision++;
  if(member.role!=='host')member.seat=1;
  member.muted=true;
  room.notice(member,member.name+'님 차례예요. 15초 안에 시작을 눌러주세요.');
  return;
 }
 if(!allowEmpty)fault(409,'노래 신청 대기열이 비어 있어요.');
}
async function liveCommand(room,actor,b){
 const d=room.data,k=d.karaoke;
 room.access(actor,!!d.members[actor.id]);
 const p=room.member(actor,b.generation),isHost=p.role==='host';
 room.limited(actor,'live-karaoke',75);
 switch(b.operation){
  case 'key': {
   if(!k.active||k.active.invitation_id!==b.invitation_id)fault(409,'현재 곡이 변경됐어요.');
   if(!isHost&&p.id!==k.active.user_id)fault(403,'가창자와 방장만 반주 키를 바꿀 수 있어요.');
   if(!Number.isInteger(b.key)||Math.abs(b.key)>6)fault(400,'반주 키 범위를 확인해주세요.');
   k.active.key=b.key;k.revision++;break;
  }
  case 'invite': {
   const target=d.members[identifier(b.target_id)];
   if(!isHost)fault(403,'방장만 예약에 초대할 수 있어요.');
   if(!target||target.locked||target.id===p.id||k.active?.user_id===target.id||k.queue.some(q=>q.user_id===target.id))fault(409,'초대할 수 없는 참여자예요.');
   const previous=d.seatInvites[target.id];
   if(previous&&previous.expires>Date.now())return room.snapshot(actor);
   d.seatInvites[target.id]={id:crypto.randomUUID(),target:target.id,kind:'reservation',expires:Date.now()+10000};break;
  }
  case 'answer-invite': {
   const invitation=d.seatInvites[p.id];
   if(!invitation||invitation.kind!=='reservation'||invitation.id!==b.invitation_id||invitation.expires<=Date.now())fault(409,'예약 초대가 만료됐어요.');
   delete d.seatInvites[p.id];break;
  }
  case 'request': {
   const rid=requestId(b.request_id),t=b.track;
   if(!t||typeof t.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(t.id)||typeof t.title!=='string'||!t.title.trim()||t.title.length>150||typeof t.artist!=='string'||t.artist.length>150||!Number.isFinite(t.duration)||t.duration<=0||t.duration>600)fault(400,'사용할 수 있는 노래방 곡인지 확인해주세요.');
   if(p.locked)fault(403,'마이크 사용이 제한되어 있어요.');
   if(k.active?.user_id===p.id&&k.active.invitation_id===rid&&k.active.track.id===t.id)return room.snapshot(actor);
   if(k.active?.user_id===p.id)fault(409,'현재 가창자는 다시 신청할 수 없어요.');
   const prior=k.queue.find(x=>x.user_id===p.id);
   if(prior){if(prior.request_id===rid&&prior.track.id===t.id)return room.snapshot(actor);fault(409,'이미 신청한 곡이 있어요.');}
   if(k.queue.length>=20)fault(409,'신청 대기열은 최대 20곡이에요.');
   k.queue.push({user_id:p.id,name:p.name,request_id:rid,track:t});k.revision++;
   room.notice(p,p.name+'님이 '+t.title+' 노래를 신청했어요.');
   if(!k.active)liveNext(room,true);
   break;
  }
  case 'cancel': {
   const target=b.target_id?identifier(b.target_id):p.id;
   if(target!==p.id&&!isHost)fault(403,'다른 사람의 신청은 취소할 수 없어요.');
   const before=k.queue.length;k.queue=k.queue.filter(x=>x.user_id!==target);
   if(k.queue.length===before)fault(404,'신청을 찾을 수 없어요.');
   k.revision++;break;
  }
  case 'call':
   if(!isHost)fault(403,'방장만 다음 가창자를 부를 수 있어요.');
   if(k.active)return room.snapshot(actor); // Older host clients may still call.
   liveNext(room);break;
  case 'accept': {
   if(!k.active||k.active.user_id!==p.id)fault(403,'호출된 본인만 부르기를 누를 수 있어요.');
   if(!b.invitation_id||b.invitation_id!==k.active.invitation_id)fault(409,'노래 순서가 변경됐어요. 현재 차례를 확인해주세요.');
   if(k.phase==='ready')return room.snapshot(actor); // A retry must not restart the invitation timer.
   if(k.phase!=='invited'||Date.now()>=k.inviteExpiresAt)fault(409,'응답 시간이 지났어요. 다시 예약해주세요.');
   k.phase='ready';k.inviteExpiresAt=0;k.readyExpiresAt=Date.now()+LIVE_READY_MS;k.revision++;
   break;
  }
  case 'start':{
   if(!k.active||k.phase!=='ready'||Date.now()>=k.readyExpiresAt)fault(409,'시작할 수 있는 차례가 아니에요.');
   if(k.active.user_id!==p.id)fault(403,'이번 차례인 가창자만 시작할 수 있어요.');
   if(b.invitation_id&&b.invitation_id!==k.active.invitation_id)fault(409,'노래 순서가 변경됐어요. 현재 차례를 확인해주세요.');
   const singer=d.members[k.active.user_id];
   if(!singer||singer.expires<=Date.now()||!singer.pub?.ready||singer.muted)fault(409,'가창자가 마이크를 켜야 시작할 수 있어요.');
   k.phase='singing';k.startsAt=Date.now()+3000;k.readyExpiresAt=0;k.revision++;
   room.notice(singer,'3초 뒤 '+k.active.track.title+' 시작!');
   break;
  }
  case 'abandon':case 'finish':case 'next': {
   if(b.operation==='next'&&!isHost)fault(403,'방장만 다음 순서를 진행할 수 있어요.');
   if(!isHost&&k.active?.user_id!==p.id)fault(403,'방장 또는 가창자만 종료할 수 있어요.');
   if((b.operation==='abandon'||b.invitation_id)&&(!b.invitation_id||b.invitation_id!==k.active?.invitation_id))fault(409,'노래 순서가 변경됐어요. 현재 차례를 확인해주세요.');
   if(b.operation==='abandon'&&k.active){const singer=d.members[k.active.user_id];if(singer)room.notice(singer,singer.name+'님이 노래를 포기했어요.');}
   if(k.active)await liveStopSinger(room);
   liveNext(room,true);
   break;
  }
  default:fault(400,'노래방 명령을 확인해주세요.');
 }
 d.revision++;room.notify();return room.snapshot(actor);
}
// Called only after host authorization, revision validation and the directory update.
function resetLiveRoomMode(room, next, actor){
 const d=room.data;
 d.karaoke=liveEmpty();
 d.music=changeRoomMusic(d.music,{operation:'clear'});
 d.musicRequests=[];d.seatInvites={};
 for(const member of Object.values(d.members)){
  room.clearRequest(member);
  room.queueRetire(member.pub);room.queueRetire(member.sub);
  member.pub=null;member.sub=null;member.muted=true;
  member.seat=member.id===d.config.host_id?0:null;
 }
 room.notice(actor,'방장이 '+(next==='karaoke'?'라이브 노래방':'토킹룸')+'으로 전환했어요.');
}
const originalLoad=VoiceRoom.prototype.load;
VoiceRoom.prototype.load=async function(...a){
 await originalLoad.apply(this,a);this.data.karaoke||=liveEmpty();
 const k=this.data.karaoke;
 // Existing rooms get one bounded preparation window after this upgrade.
 if(this.data.config?.mode==='karaoke'&&k.active&&k.phase==='ready'&&!Number.isFinite(k.readyExpiresAt))k.readyExpiresAt=Date.now()+LIVE_READY_MS;
};
// The base room's 15-second housekeeping alarm is not anchored to the exact
// invitation. Persist the absolute deadline, including across DO restarts.
const originalLiveSave=VoiceRoom.prototype.save;
VoiceRoom.prototype.save=async function(...a){
 await originalLiveSave.apply(this,a);
 const d=this.data;
 if(!d?.config||d.config.closed)return;
 const due=[...Object.values(d.seatInvites||{}).map(i=>i.expires),...Object.values(d.members).filter(m=>m.requested).map(m=>m.requestExpires)];
 const k=d.karaoke;
 if(k?.phase==='invited')due.push(k.inviteExpiresAt);
 if(k?.phase==='ready')due.push(k.readyExpiresAt);
 if(due.length)await this.ctx.storage.setAlarm(Math.max(Date.now()+1,Math.min(Date.now()+15000,...due.filter(Number.isFinite))));
};
const originalSnapshot=VoiceRoom.prototype.snapshot;
VoiceRoom.prototype.snapshot=function(actor){
 const state=originalSnapshot.call(this,actor);
 return {...state,karaoke:this.data.config?.mode==='karaoke'?this.data.karaoke:null};
};
const originalCloseRoom=VoiceRoom.prototype.closeRoom;
VoiceRoom.prototype.closeRoom=async function(...a){
 if(this.data?.karaoke)this.data.karaoke=liveEmpty();
 return originalCloseRoom.apply(this,a);
};
const originalRemove=VoiceRoom.prototype.remove;
VoiceRoom.prototype.remove=async function(p,...args){
 const wasActive=this.data.config?.mode==='karaoke'&&this.data.karaoke.active?.user_id===p.id;
 if(this.data.config?.mode==='karaoke'){
  this.data.karaoke.queue=this.data.karaoke.queue.filter(x=>x.user_id!==p.id);
  if(this.data.karaoke.active?.user_id===p.id)await liveStopSinger(this);
 }
 const result=await originalRemove.call(this,p,...args);
 if(wasActive&&!this.data.config.closed)liveNext(this,true);
 return result;
};
const originalExpire=VoiceRoom.prototype.expire;
VoiceRoom.prototype.expire=async function(...a){
 await originalExpire.apply(this,a);
 const k=this.data?.karaoke;
 if(this.data?.config?.mode==='karaoke'&&!this.data.config.closed&&k&&!k.active&&k.queue.length){liveNext(this,true);this.data.revision++;this.notify();}
 if(this.data?.config?.mode==='karaoke'&&!this.data.config.closed&&k?.active&&k.phase==='invited'&&Date.now()>=k.inviteExpiresAt){
  const member=this.data.members[k.active.user_id];
  if(member)this.notice(member,member.name+'님이 응답하지 않아 다음 예약자로 넘어가요.');
  await liveStopSinger(this);liveNext(this,true);this.data.revision++;this.notify();
 }
 if(this.data?.config?.mode==='karaoke'&&!this.data.config.closed&&k?.active&&k.phase==='ready'&&Date.now()>=k.readyExpiresAt){
  const member=this.data.members[k.active.user_id];
  if(member)this.notice(member,member.name+'님의 마이크 준비 시간이 지나 다음 예약자로 넘어가요.');
  await liveStopSinger(this);liveNext(this,true);this.data.revision++;this.notify();
 }
 if(this.data?.config?.mode==='karaoke'&&!this.data.config.closed&&k?.active&&k.phase==='singing'&&Date.now()>=k.startsAt+(k.active.track.duration+3)*1000){
  await liveStopSinger(this);liveNext(this,true);this.data.revision++;this.notify();
 }
};
const originalCommand=VoiceRoom.prototype.command;
VoiceRoom.prototype.command=async function(action,actor,b={},roomId){
 if(action==='presence'){const result=await originalCommand.call(this,action,actor,b,roomId);return {...result,mode:this.data.config?.mode||'talk'};}
 if(action==='karaoke'){if(this.data.config?.mode!=='karaoke')fault(409,'라이브 노래방에서만 가능한 명령이에요.');return liveCommand(this,actor,b);}
 if(this.data.config?.mode==='karaoke'&&action!=='create'){
  if(['seat-invite','seat-answer','request-mic','cancel-mic','reject-mic','approve-mic','release-mic','music'].includes(action))fault(409,'라이브 노래방은 한 명씩 노래해요.');
  if(action==='moderate'&&['remove-seat','move-seat'].includes(b.operation))fault(409,'노래방 순서에서 관리해주세요.');
  const canSing=this.data.karaoke.active?.user_id===actor.id&&['ready','singing'].includes(this.data.karaoke.phase);
  if(action==='published'&&!canSing)fault(403,'부르기를 수락한 가창자만 송출할 수 있어요.');
  if(action==='self-mute'&&b.muted===false&&!canSing)fault(403,'부르기를 수락한 가창자만 마이크를 켤 수 있어요.');
 }
 return originalCommand.call(this,action,actor,b,roomId);
};
const originalPrepareMedia=VoiceRoom.prototype.prepareMedia;
VoiceRoom.prototype.prepareMedia=function(action,actor,b,...rest){
 if(action==='publish'&&this.data.config?.mode==='karaoke'&&(this.data.karaoke.active?.user_id!==actor.id||!['ready','singing'].includes(this.data.karaoke.phase)))fault(403,'부르기를 수락한 가창자만 마이크를 송출할 수 있어요.');
 return originalPrepareMedia.call(this,action,actor,b,...rest);
};
