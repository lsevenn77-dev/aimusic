import AVFoundation

struct VocalSettings: Codable, Equatable {
    var preset = "original"
    var echo: Float = 0
    var room: Float = 0
    var size: Float = 0.5
    var tone: Float = 0
    var noise = 0
    var voice: Float = 1
    var backing: Float = 0.8
    var offset = 0.0
    var strength: Float? = nil
    static let presets = [("original", "원음"), ("karaoke", "노래방"), ("studio", "스튜디오"), ("hall", "홀"), ("rap", "랩")]
    // Apple's delay mix grows audibly at very small values. A quadratic
    // control keeps the first few steps subtle instead of jumping into an echo.
    static func echoWetMix(_ control: Float) -> Float { pow(min(20, max(0, control)), 2) * 0.01 }
    mutating func select(_ id: String) {
        if id == "custom" { preset = id; return }
        preset = id
        strength = 0.5
        switch id {
        case "karaoke": echo = 5; room = 10; size = 0.45; tone = 0.5
        case "studio": echo = 0; room = 4; size = 0.15; tone = 0.7
        case "hall": echo = 2; room = 24; size = 0.95; tone = 0.4
        case "rap": echo = 0; room = 0; size = 0.1; tone = 0.8
        default: echo = 0; room = 0; size = 0.5; tone = 0
        }
    }
}

// Android's handling-noise reduction: two Butterworth high-pass stages,
// smoothly gated quiet input, and low-frequency rumble suppression.
final class VocalNoiseCleaner {
    private final class HighPass {
        let b0, b1, a1, a2: Double
        var z1 = 0.0, z2 = 0.0
        init(rate: Double, hz: Double) {
            let w = 2 * Double.pi * hz / rate, c = cos(w), alpha = sin(w) / sqrt(2), a0 = 1 + alpha
            b0 = (1 + c) / 2 / a0; b1 = -(1 + c) / a0; a1 = -2 * c / a0; a2 = (1 - alpha) / a0
        }
        func process(_ x: Double) -> Double { let y = b0 * x + z1; z1 = b1 * x - a1 * y + z2; z2 = b0 * x - a2 * y; return y }
    }
    private let filters: [[HighPass]]
    private let attack, release, up, down, lowCoefficient, rumbleAttack, rumbleRelease: Double
    private var low = 0.0, lowEnvelope = 0.0, envelope = 0.0, gain = 1.0, rumbleGain = 1.0, blend = 0.0
    init(rate: Double) {
        filters = [65.0, 80, 100, 120].map { [HighPass(rate: rate, hz: $0), HighPass(rate: rate, hz: $0)] }
        attack = 1 - exp(-1 / (rate * 0.002)); release = 1 - exp(-1 / (rate * 0.12))
        up = 1 - exp(-1 / (rate * 0.003)); down = 1 - exp(-1 / (rate * 0.07))
        lowCoefficient = 1 - exp(-2 * .pi * 90 / rate)
        rumbleAttack = 1 - exp(-1 / (rate * 0.001)); rumbleRelease = 1 - exp(-1 / (rate * 0.07))
    }
    func process(_ sample: Float, level: Int) -> Float {
        let x = sample.isFinite ? Double(sample) : 0, level = min(4, max(0, level))
        var filtered = x
        for i in 0..<4 { let y = filters[i][1].process(filters[i][0].process(x)); if i == level - 1 { filtered = y } }
        low += (x - low) * lowCoefficient; lowEnvelope += (abs(low) - lowEnvelope) * attack
        let a = abs(filtered); envelope += (a - envelope) * (a > envelope ? attack : release)
        let ratio = level == 0 ? 1 : min(1, envelope / [0, 0.004, 0.008, 0.016, 0.032][level]), target = 0.005 + 0.995 * ratio * ratio
        gain += (target - gain) * (target > gain ? up : down)
        let rumble = level >= 2 && lowEnvelope > 0.04 && lowEnvelope > envelope * 2.5 ? max(0.16, envelope / (lowEnvelope * 0.8)) : 1
        rumbleGain += (rumble - rumbleGain) * (rumble < rumbleGain ? rumbleAttack : rumbleRelease)
        blend += ((level > 0 ? 1.0 : 0.0) - blend) * up
        return Float(x + (filtered * gain * rumbleGain - x) * blend)
    }
    static func clean(_ source: URL, destination: URL, level: Int) throws -> URL {
        guard level > 0 else { return source }
        let file = try AVAudioFile(forReading: source), format = file.processingFormat
        let writer = try AVAudioFile(forWriting: destination, settings: format.settings)
        let processors = (0..<format.channelCount).map { _ in VocalNoiseCleaner(rate: format.sampleRate) }
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4096)!
        while file.framePosition < file.length {
            try file.read(into: buffer)
            guard let channels = buffer.floatChannelData, buffer.frameLength > 0 else { break }
            for channel in processors.indices { for frame in 0..<Int(buffer.frameLength) { channels[channel][frame] = processors[channel].process(channels[channel][frame], level: level) } }
            try writer.write(from: buffer)
        }
        return destination
    }
}
