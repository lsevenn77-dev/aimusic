import AVFoundation
import AudioToolbox

/// One effect chain is used for live audition and export, so sliders sound the
/// same while playing and in the saved file.
final class VocalEffectChain {
    let tone = AVAudioUnitEQ(numberOfBands: 3)
    let echo = AVAudioUnitDelay()
    let room = AVAudioUnitReverb()
    let gate = AVAudioUnitEffect(audioComponentDescription: AudioComponentDescription(componentType: kAudioUnitType_Effect, componentSubType: kAudioUnitSubType_DynamicsProcessor, componentManufacturer: kAudioUnitManufacturer_Apple, componentFlags: 0, componentFlagsMask: 0))
    private var roomPreset: AVAudioUnitReverbPreset?
    func connect(_ source: AVAudioNode, engine: AVAudioEngine, format: AVAudioFormat) {
        [tone, echo, room, gate].forEach { engine.attach($0) }
        engine.connect(source, to: tone, format: format)
        engine.connect(tone, to: gate, format: format)
        engine.connect(gate, to: echo, format: format)
        engine.connect(echo, to: room, format: format)
        engine.connect(room, to: engine.mainMixerNode, format: format)
    }
    func apply(_ settings: VocalSettings) {
        let preset: AVAudioUnitReverbPreset = settings.size > 0.8 ? .largeHall : settings.size < 0.3 ? .smallRoom : .mediumRoom
        if preset != roomPreset { room.loadFactoryPreset(preset); roomPreset = preset }
        room.wetDryMix = min(35, max(0, settings.room * 0.5))
        echo.delayTime = settings.preset == "rap" ? 0.09 : 0.18
        echo.feedback = 10; echo.wetDryMix = VocalSettings.echoWetMix(settings.echo)
        tone.bands[0].filterType = .lowShelf; tone.bands[0].frequency = 250; tone.bands[0].gain = -3 * settings.tone; tone.bands[0].bypass = false
        tone.bands[1].filterType = .highShelf; tone.bands[1].frequency = 3500; tone.bands[1].gain = 2 * settings.tone; tone.bands[1].bypass = false
        tone.bands[2].filterType = .highPass; tone.bands[2].frequency = [40, 65, 80, 100, 120][min(4, max(0, settings.noise))]; tone.bands[2].bypass = settings.noise == 0
        gate.bypass = settings.noise == 0
        let values: [(AudioUnitParameterID, Float)] = [
            (kDynamicsProcessorParam_Threshold, 0), (kDynamicsProcessorParam_HeadRoom, 20),
            (kDynamicsProcessorParam_ExpansionRatio, settings.noise == 0 ? 1 : Float(settings.noise + 1)),
            (kDynamicsProcessorParam_ExpansionThreshold, [-80, -52, -46, -40, -34][min(4, max(0, settings.noise))]),
            (kDynamicsProcessorParam_AttackTime, 0.003), (kDynamicsProcessorParam_ReleaseTime, 0.12), (kDynamicsProcessorParam_OverallGain, 0)
        ]
        for (parameter, value) in values { AudioUnitSetParameter(gate.audioUnit, parameter, kAudioUnitScope_Global, 0, value, 0) }
    }
}

enum VocalTimeline {
    static func segment(position: Double, offset: Double, rate: Double, length: Int64) -> (start: Int64, delay: Double, count: UInt32)? {
        guard rate.isFinite, rate > 0, position.isFinite, offset.isFinite, length > 0 else { return nil }
        let start = Int64(max(0, min(Double(length), (position - offset) * rate)))
        guard rate > 0, start < length else { return nil }
        return (start, max(0, offset - position), UInt32(min(Int64(UInt32.max), length - start)))
    }
}

@MainActor final class RecordingPreview {
    private let engine = AVAudioEngine(), voice = AVAudioPlayerNode(), music = AVAudioPlayerNode()
    private let effects = VocalEffectChain()
    private let vocalFile: AVAudioFile, musicFile: AVAudioFile
    private var start = 0.0, began = 0.0
    private(set) var playing = false
    let duration: Double
    private var settings = VocalSettings()
    var position: Double { min(duration, start + (playing ? max(0, ProcessInfo.processInfo.systemUptime - began) : 0)) }
    init(folder: URL, duration: Double) throws {
        vocalFile = try AVAudioFile(forReading: folder.appendingPathComponent("voice.wav"))
        musicFile = try AVAudioFile(forReading: folder.appendingPathComponent("backing.m4a"))
        self.duration = duration
        engine.attach(voice); engine.attach(music)
        effects.connect(voice, engine: engine, format: vocalFile.processingFormat)
        engine.connect(music, to: engine.mainMixerNode, format: musicFile.processingFormat)
    }
    func update(_ value: VocalSettings) throws {
        let moved = value.offset != settings.offset
        settings = value; voice.volume = value.voice; music.volume = value.backing; effects.apply(value)
        if moved && playing { try play(from: position) }
    }
    func play(from position: Double) throws {
        stop(); start = max(0, min(position, duration))
        guard start < duration else { return }
        let session = AVAudioSession.sharedInstance(); try session.setCategory(.playback); try session.setActive(true)
        try engine.start()
        let host = mach_absolute_time() + AVAudioTime.hostTime(forSeconds: 0.08)
        if let segment = VocalTimeline.segment(position: start, offset: settings.offset, rate: vocalFile.processingFormat.sampleRate, length: vocalFile.length) {
            voice.scheduleSegment(vocalFile, startingFrame: segment.start, frameCount: segment.count, at: AVAudioTime(sampleTime: Int64(segment.delay * vocalFile.processingFormat.sampleRate), atRate: vocalFile.processingFormat.sampleRate))
        }
        if let segment = VocalTimeline.segment(position: start, offset: 0, rate: musicFile.processingFormat.sampleRate, length: musicFile.length) {
            music.scheduleSegment(musicFile, startingFrame: segment.start, frameCount: segment.count, at: nil)
        }
        voice.play(at: AVAudioTime(hostTime: host)); music.play(at: AVAudioTime(hostTime: host))
        began = ProcessInfo.processInfo.systemUptime + 0.08; playing = true
    }
    func stop() { start = position; playing = false; voice.stop(); music.stop(); engine.stop() }
}

final class AudioWorkControl: @unchecked Sendable {
    private let lock = NSLock()
    private var stopped = false
    func cancel() { lock.lock(); stopped = true; lock.unlock() }
    func check() throws { lock.lock(); let value = stopped; lock.unlock(); if value { throw CancellationError() } }
}

enum RecordingSplice {
    /// Replace only the newly sung interval; silence fills an unrecorded intro.
    /// Output is written separately and swapped after success, preserving a draft on failure.
    static func merge(folder: URL, take: URL, start: Double, priorLength: Double, progress: @Sendable (Double) -> Void = { _ in }) throws -> Double {
        let input = try AVAudioFile(forReading: take)
        let rate = input.processingFormat.sampleRate
        let existingURL = folder.appendingPathComponent("voice.wav")
        let old = FileManager.default.fileExists(atPath: existingURL.path) ? try AVAudioFile(forReading: existingURL) : nil
        let offset = Int64(max(0, start) * rate), end = offset + input.length
        let total = max(old?.length ?? Int64(priorLength * rate), end)
        let output = folder.appendingPathComponent("merged-\(UUID().uuidString).wav")
        let writer = try AVAudioFile(forWriting: output, settings: [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: rate, AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false])
        let buffer = AVAudioPCMBuffer(pcmFormat: input.processingFormat, frameCapacity: 4096)!
        var position: Int64 = 0, lastPercent = -1
        while position < total {
            let inTake = position >= offset && position < end
            let boundary = inTake ? end : position < offset ? offset : total
            let count = AVAudioFrameCount(min(4096, min(total - position, boundary - position)))
            buffer.frameLength = count
            for channel in 0..<Int(buffer.format.channelCount) { memset(buffer.floatChannelData![channel], 0, Int(count) * MemoryLayout<Float>.size) }
            if inTake {
                input.framePosition = position - offset; try input.read(into: buffer, frameCount: count)
            } else if let old, position < old.length {
                old.framePosition = position; try old.read(into: buffer, frameCount: min(count, AVAudioFrameCount(old.length - position)))
                buffer.frameLength = count
            }
            try writer.write(from: buffer); position += Int64(count)
            let percent = Int(position * 100 / max(1, total))
            if percent != lastPercent { lastPercent = percent; progress(Double(position) / Double(max(1, total))) }
        }
        // The writer is released before this method returns; POSIX rename safely
        // replaces the old path on this same volume without a missing-file window.
        if rename(output.path, existingURL.path) != 0 { throw CocoaError(.fileWriteUnknown) }
        return Double(total) / rate
    }
}
