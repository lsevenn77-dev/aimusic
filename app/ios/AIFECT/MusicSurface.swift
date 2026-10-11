import SwiftUI

struct MusicSurface: View {
    var feature = false
    var body: some View {
        GeometryReader { geometry in
            LinearGradient(stops: [
                .init(color: Color(aifectHex: feature ? 0x27313B : 0x212733), location: 0),
                .init(color: Color(aifectHex: feature ? 0x272735 : 0x1A1E29), location: 0.58),
                .init(color: Color(aifectHex: feature ? 0x35283B : 0x251F2D), location: 1)
            ], startPoint: .topLeading, endPoint: UnitPoint(x: 1, y: 0.55))
            .overlay(RadialGradient(colors: [AifectDesign.mint.opacity(feature ? 0.15 : 0.05), .clear], center: .topLeading, startRadius: 0, endRadius: max(1, geometry.size.width * 0.85)))
        }.accessibilityHidden(true)
    }
}

struct PartnerBadge: View {
    let person: [String: Any]
    var body: some View {
        let badge = person.string("partner_badge").trimmingCharacters(in: .whitespacesAndNewlines)
        if !badge.isEmpty && badge != "null" {
            Label(badge, systemImage: "checkmark.seal.fill").font(.system(size: 12, weight: .medium)).foregroundStyle(Brand.aqua)
        }
    }
}

enum PlayerAvatarStyle {
    static func showsLevel(kind: String, size: CGFloat, enabled: Bool) -> Bool { enabled && kind == "producer" && size >= 80 }
    static func level(_ xp: Int) -> Int { min(100, max(1, Int((1 + sqrt(1 + Double(max(0, xp)) / 12.5)) / 2))) }
}
