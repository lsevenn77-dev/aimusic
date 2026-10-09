import AVFoundation
import MediaPlayer
import Combine

@MainActor
final class MusicPlayer: ObservableObject {
    @Published var current: Song?
    @Published var playing = false
    @Published var loading = false
    @Published var position = 0.0
    @Published var duration = 0.0
    @Published var preview = false
    @Published var lyric = ""
    @Published var error: String?
    @Published var repeatOne = false
    @Published var shuffled = false
    let player = AVPlayer()
    @Published private(set) var queue: [Song] = []
    private var observation: NSKeyValueObservation?
    private var statusObservation: NSKeyValueObservation?
    private var timeObserver: Any?
    private var notifications: [NSObjectProtocol] = []
    private var loadTask: Task<Void, Never>?
    private var listenID = ""
    private var heard = 0.0
    private var lastReport = 0.0
    private var nextLyric = 0.0
    private var lyricBusy = false
    private var revision = 0
    init() {
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main) { [weak self] time in
            Task { @MainActor in self?.tick(time.seconds) }
        }
        observation = player.observe(\.timeControlStatus, options: [.new]) { [weak self] player, _ in
            Task { @MainActor in self?.playing = player.timeControlStatus == .playing; self?.nowPlaying() }
        }
        notifications.append(NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main) { [weak self] note in
            Task { @MainActor in
                guard let self, note.object as? AVPlayerItem === self.player.currentItem else { return }
                if self.repeatOne, let song = self.current { self.play(song, queue: self.queue) } else { self.next() }
            }
        })
        notifications.append(NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.pause() }
        })
        notifications.append(NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
            if (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt) == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue {
                Task { @MainActor in self?.pause() }
            }
        })
        let remote = MPRemoteCommandCenter.shared()
        remote.playCommand.addTarget { [weak self] _ in Task { @MainActor in self?.resume() }; return .success }
        remote.pauseCommand.addTarget { [weak self] _ in Task { @MainActor in self?.pause() }; return .success }
        remote.nextTrackCommand.addTarget { [weak self] _ in Task { @MainActor in self?.next() }; return .success }
        remote.previousTrackCommand.addTarget { [weak self] _ in Task { @MainActor in self?.previous() }; return .success }
        remote.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            Task { @MainActor in self?.seek(event.positionTime) }; return .success
        }
    }
    func play(_ song: Song, queue songs: [Song]) {
        ListeningAds.shared.trackFinished(heard: heard, duration: duration, preview: preview)
        loadTask?.cancel(); player.pause(); revision += 1
        let version = revision
        queue = songs.isEmpty ? [song] : songs
        current = song; loading = true; error = nil; lyric = ""; position = 0; duration = 0
        listenID = ""; heard = 0; lastReport = 0; nextLyric = 0
        player.replaceCurrentItem(with: nil)
        loadTask = Task {
            defer { if revision == version { loading = false } }
            do {
                await ListeningAds.shared.breakIfNeeded()
                try Task.checkCancellation()
                guard revision == version else { return }
                let result = try await API.shared.call("/api/playback/\(Endpoint.pathID(song.id))", method: "POST", body: [:])
                try Task.checkCancellation()
                guard revision == version else { return }
                let url = try Endpoint.url(result.string("src"))
                try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
                try AVAudioSession.sharedInstance().setActive(true)
                preview = result["preview"] as? Bool ?? true
                duration = min(result.number("duration"), preview ? 60 : .greatestFiniteMagnitude)
                listenID = result.string("id")
                let asset = AVURLAsset(url: url, options: [AVURLAssetHTTPCookiesKey: API.shared.mediaCookies()])
                let item = AVPlayerItem(asset: asset)
                statusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
                    Task { @MainActor in
                        guard let self, self.revision == version else { return }
                        if item.status == .failed { self.error = "음원을 재생하지 못했습니다. 다시 시도해주세요."; self.loading = false }
                    }
                }
                player.replaceCurrentItem(with: item); player.play(); nowPlaying()
            } catch is CancellationError {} catch { if revision == version { self.error = error.localizedDescription } }
        }
    }
    func pause() { player.pause() }
    func resume() {
        guard current != nil, player.currentItem != nil else { return }
        do { try AVAudioSession.sharedInstance().setCategory(.playback); try AVAudioSession.sharedInstance().setActive(true); player.play() }
        catch { self.error = error.localizedDescription }
    }
    func toggle() { playing ? pause() : resume() }
    func seek(_ value: Double) {
        nextLyric = 0
        player.seek(to: CMTime(seconds: min(max(value, 0), duration), preferredTimescale: 600))
        nowPlaying()
    }
    func next() {
        guard let current, let index = queue.firstIndex(where: { $0.id == current.id }) else { return }
        let candidate = shuffled ? queue.filter { $0.id != current.id }.randomElement() : (index + 1 < queue.count ? queue[index + 1] : nil)
        if let candidate { play(candidate, queue: queue) } else {
            pause(); ListeningAds.shared.trackFinished(heard: heard, duration: duration, preview: preview); heard = 0
            Task { await ListeningAds.shared.breakIfNeeded() }
        }
    }
    func previous() {
        guard position < 3, let current, let index = queue.firstIndex(where: { $0.id == current.id }), index > 0 else { seek(0); return }
        play(queue[index - 1], queue: queue)
    }
    func removeQueue(at offsets: IndexSet) {
        queue.remove(atOffsets: offsets)
        if let current, !queue.contains(where: { $0.id == current.id }) { if let next = queue.first { play(next, queue: queue) } else { close() } }
    }
    func moveQueue(from offsets: IndexSet, to destination: Int) { queue.move(fromOffsets: offsets, toOffset: destination) }
    func close() {
        revision += 1; loadTask?.cancel(); player.pause(); player.replaceCurrentItem(with: nil)
        current = nil; lyric = ""; queue = []; listenID = ""; playing = false; loading = false
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }
    private func tick(_ value: Double) {
        guard value.isFinite, let current else { return }
        position = min(max(0, value), max(duration, 0))
        if preview && value >= 60 { pause() }
        if playing {
            heard += 0.5
            if heard - lastReport >= 15, !listenID.isEmpty {
                lastReport = heard; let id = listenID; let seconds = min(heard, duration)
                Task { _ = try? await API.shared.call("/api/listens/\(Endpoint.pathID(id))", method: "PATCH", body: ["seconds": seconds]) }
            }
        }
        if !lyricBusy, value >= nextLyric, value < duration {
            lyricBusy = true; nextLyric = value + 4; let version = revision
            Task {
                defer { lyricBusy = false }
                guard let result = try? await API.shared.call("/api/tracks/\(Endpoint.pathID(current.id))/lyrics/line?at=\(min(value, current.duration))"), revision == version else { return }
                let line = result["line"] as? [String: Any]
                lyric = line?.string("text") ?? ""
                nextLyric = max(value + 1, line?.number("until") ?? value + 4)
            }
        }
        nowPlaying()
    }
    private func nowPlaying() {
        guard let current else { return }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [MPMediaItemPropertyTitle: current.title,
            MPMediaItemPropertyArtist: current.credit, MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: position, MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0]
    }
}
