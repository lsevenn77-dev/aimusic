#if DEBUG
import SwiftUI

// Only reachable in Debug with a test launch argument. No content is uploaded.
struct AdIntegrationTestView: View {
    @ObservedObject private var ads = ListeningAds.shared
    @State private var result = "idle"
    @State private var uploadID = UUID().uuidString
    var body: some View {
        VStack(spacing: 18) {
            Text("AIFECT 테스트 광고 검증").font(.headline)
            Text(ads.diagnostic).accessibilityIdentifier("ad-state")
            Text("\(ads.impressions)").accessibilityIdentifier("ad-impressions")
            Text("\(ads.dismissals)").accessibilityIdentifier("ad-dismissals")
            Text(result).accessibilityIdentifier("ad-result")
            Button("감상 5곡 완료") {
                Task {
                    for _ in 0..<5 { ads.trackFinished(heard: 60, duration: 100, preview: false) }
                    await ads.breakIfNeeded(); result = "listening-resumed"
                }
            }
            Button("녹음 업로드 완료") {
                Task {
                    uploadID = UUID().uuidString
                    await ads.uploadCompleted(id: uploadID); result = "cover-resumed"
                }
            }
            Button("음원 업로드 완료") {
                Task {
                    uploadID = UUID().uuidString
                    await ads.uploadCompleted(id: uploadID); result = "original-resumed"
                }
            }
            Button("동일 업로드 재시도") {
                Task { await ads.uploadCompleted(id: uploadID); result = "duplicate-skipped" }
            }
            Button("Premium 제외 확인") {
                Task {
                    ads.setAccount("ad-integration", premium: true)
                    await ads.uploadCompleted(id: UUID().uuidString); result = "premium-skipped"
                }
            }
        }.padding().task {
            ads.setAccount("ad-integration", premium: false)
            await ads.consent()
        }
    }
}
#endif
