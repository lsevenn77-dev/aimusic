import SwiftUI

/// Android parity values from NativeScreens.kt. This is an importable UI foundation,
/// not a replacement for the iOS project's navigation, audio or account services.
enum AifectDesign {
    static let background = Color(aifectHex: 0x10131B)
    static let surface = Color(aifectHex: 0x191E29)
    static let raised = Color(aifectHex: 0x242C38)
    static let stroke = Color(aifectHex: 0x2B2E39)
    static let text = Color(aifectHex: 0xF3F6F8)
    static let secondaryText = Color(aifectHex: 0xCDD2DC)
    static let muted = Color(aifectHex: 0xA6ADBA)
    static let pink = Color(aifectHex: 0xEF86B6)
    static let mint = Color(aifectHex: 0x8EDDD2)
    static let violet = Color(aifectHex: 0xD6B5ED)
    static let iconBackground = Color(aifectHex: 0x0F1117)
    static let gutter: CGFloat = 20
    static let cardRadius: CGFloat = 22
    static let artworkRadius: CGFloat = 16
    static let touchTarget: CGFloat = 48
    static let mainTabs = ["홈", "커뮤니티", "부르기", "메시지", "마이"]
    static let communityTabs = ["추천", "커버", "듀엣", "크루", "팔로잉"]
}

private extension Color {
    init(aifectHex value: UInt32) {
        self.init(.sRGB, red: Double((value >> 16) & 255) / 255,
                  green: Double((value >> 8) & 255) / 255,
                  blue: Double(value & 255) / 255, opacity: 1)
    }
}

/// Import AifectWordmark.imageset first; preserve its original gradient and white letters.
struct AifectWordmark: View {
    var body: some View {
        Image("AifectWordmark")
            .renderingMode(.original)
            .resizable()
            .scaledToFit()
            .frame(width: 124, height: 30)
            .accessibilityLabel("AIFECT")
    }
}

struct AifectAppMark: View {
    var size: CGFloat = 108
    var body: some View {
        Image("AifectMark")
            .renderingMode(.original)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityLabel("AIFECT")
    }
}
