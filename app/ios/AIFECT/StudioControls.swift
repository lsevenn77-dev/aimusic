import SwiftUI

struct StudioVocalControls: View {
    @ObservedObject var studio: RecordingStudio
    let recording: Bool
    @State private var details = false
    private let presets = [("original", "원음", "minus"), ("karaoke", "노래방", "mic"), ("studio", "스튜디오", "slider.horizontal.3"), ("hall", "홀", "building.columns"), ("rap", "랩", "waveform"), ("custom", "사용자 설정", "slider.horizontal.3")]
    private var description: String {
        switch studio.effects.preset {
        case "original": return "잔향 없이 내 목소리 그대로"
        case "karaoke": return "노래하기 편한 가벼운 에코와 공간감"
        case "studio": return "또렷한 목소리와 짧고 부드러운 울림"
        case "hall": return "넓은 공간에서 부르는 듯한 잔향"
        case "rap": return "가사가 또렷하게 들리는 담백한 목소리"
        default: return "내 목소리에 맞춰 효과를 직접 조절해요"
        }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(recording ? "목소리 효과" : "3. 리버브 효과").font(.title3.bold())
            if recording { Text("모니터링을 켜면 설정한 효과를 바로 들을 수 있어요.").font(.caption).foregroundStyle(.secondary) }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(presets, id: \.0) { item in
                    let selected = studio.effects.preset == item.0
                    Button {
                        if item.0 == "custom" { studio.effects.preset = "custom"; details = true }
                        else { studio.selectPreset(item.0) }
                    } label: {
                        VStack(spacing: 14) {
                            Image(systemName: item.2).font(.system(size: 29, weight: .light))
                            Text(item.1).font(.system(size: 17, weight: selected ? .bold : .regular))
                        }.frame(maxWidth: .infinity, minHeight: 115)
                            .foregroundStyle(selected ? Brand.pink : Color(aifectHex: 0xC9ADBF))
                            .background(selected ? Brand.pink.opacity(0.16) : Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 20))
                            .overlay(RoundedRectangle(cornerRadius: 20).stroke(selected ? Brand.pink : Color.white.opacity(0.16), lineWidth: selected ? 2 : 1))
                    }.buttonStyle(.plain).accessibilityIdentifier("vocal-preset-\(item.0)").accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
            Text(description).font(.subheadline).foregroundStyle(.secondary)
            if studio.effects.preset != "custom" {
                HStack { Text("효과 강도"); Spacer(); Text("\(Int((studio.effects.strength ?? 0.5) * 100))%").foregroundStyle(.secondary).monospacedDigit() }
                Slider(value: Binding(get: { studio.effects.strength ?? 0.5 }, set: { studio.setPresetStrength($0) }), in: 0...1, step: 0.01).accessibilityLabel("효과 강도").disabled(studio.effects.preset == "original")
            }
            DisclosureGroup("잡음 · 세부 설정", isExpanded: $details) {
                VStack(alignment: .leading, spacing: 16) {
                    Text(studio.effects.noise == 0 ? "잡음 제거 · 끔" : "잡음 제거 · \(studio.effects.noise)단계").font(.headline)
                    Picker("잡음 감소", selection: $studio.effects.noise) {
                        Text("끔").tag(0); Text("1단계").tag(1); Text("2단계").tag(2); Text("3단계").tag(3); Text("4단계").tag(4)
                    }.pickerStyle(.segmented).accessibilityIdentifier("noise-level")
                    Text("강도가 높으면 작은 목소리도 줄어들 수 있어요.").font(.caption).foregroundStyle(.secondary)
                    HStack { Text("에코"); Spacer(); Text("\(studio.effects.echo, specifier: "%.1f")%").monospacedDigit().foregroundStyle(.secondary) }
                    Slider(value: Binding(get: { studio.effects.echo }, set: { studio.effects.preset = "custom"; studio.effects.echo = $0 }), in: 0...20, step: 0.1).accessibilityLabel("에코 미세 조절")
                    Text("0.1 단위 미세 조절 · 0은 에코 없음").font(.caption).foregroundStyle(.secondary)
                    Text("음색 보정").font(.subheadline)
                    Slider(value: Binding(get: { studio.effects.tone }, set: { studio.effects.preset = "custom"; studio.effects.tone = $0 }), in: 0...1).accessibilityLabel("음색 보정")
                    Text("룸 리버브 · \(Int(studio.reverb))%").font(.subheadline)
                    Slider(value: Binding(get: { studio.reverb }, set: { studio.effects.preset = "custom"; studio.reverb = $0; studio.effects.room = $0 }), in: 0...100).accessibilityLabel("리버브")
                    Text("룸 크기 · \(Int(studio.effects.size * 100))%").font(.subheadline)
                    Slider(value: Binding(get: { studio.effects.size }, set: { studio.effects.preset = "custom"; studio.effects.size = $0 }), in: 0...1).accessibilityLabel("룸 크기")
                }.padding(.top, 16)
            }.font(.subheadline.bold())
        }.tint(Brand.pink)
    }
}

struct StudioVolumeBalance: View {
    @ObservedObject var studio: RecordingStudio
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("2. 볼륨 밸런스 확인").font(.title3.bold())
            HStack { Label("내 목소리", systemImage: "mic"); Spacer(); Text("\(Int(studio.voiceVolume * 100))%").foregroundStyle(.secondary).monospacedDigit() }
            Slider(value: $studio.voiceVolume, in: 0...1.5).accessibilityLabel("목소리 음량")
            HStack { Label("반주", systemImage: "music.note"); Spacer(); Text("\(Int(studio.backingVolume * 100))%").foregroundStyle(.secondary).monospacedDigit() }
            Slider(value: $studio.backingVolume, in: 0...1).accessibilityLabel("반주 음량")
        }.tint(Brand.pink)
    }
}

/// A bounded lyric wheel lets the singer cue a line without leaving the studio.
/// Automatic following never seeks; only an explicit drag or tap can change audio.
struct StudioLyricWheel: View {
    @ObservedObject var studio: RecordingStudio
    @State private var centered: Int?
    @State private var choosing = false
    @State private var cueTask: Task<Void, Never>?
    private var currentLine: Int { studio.words.lastIndex(where: { $0.0 <= studio.elapsed }) ?? 0 }
    var body: some View {
        VStack(spacing: 8) {
            Text("가사를 위아래로 밀어 부를 위치 선택").font(.subheadline.bold())
            Text("가운데 가사 2초 전부터 준비해요. 녹음 중 이동하면 현재 녹음을 보관하고 멈춥니다.").font(.caption).foregroundStyle(.secondary)
            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(spacing: 0) {
                    ForEach(studio.words.indices, id: \.self) { index in
                        Button { centered = index; choose(index, delay: false) } label: {
                            VStack(spacing: 4) {
                                Text(timeLabel(studio.words[index].0)).font(.caption2.monospacedDigit())
                                Text(lineText(index)).font(centered == index ? .headline : .body).multilineTextAlignment(.center)
                            }.foregroundStyle(centered == index ? Brand.pink : AifectDesign.muted)
                                .frame(maxWidth: .infinity, minHeight: 64).padding(.vertical, 8)
                        }.buttonStyle(.plain).id(index).accessibilityIdentifier("lyric-line-\(index)")
                    }
                }.scrollTargetLayout()
            }.contentMargins(.vertical, 80, for: .scrollContent)
                .frame(height: 240).background(Brand.background.opacity(0.5), in: RoundedRectangle(cornerRadius: 16))
                .scrollTargetBehavior(.viewAligned).scrollPosition(id: $centered, anchor: .center)
                .accessibilityIdentifier("studio-lyric-wheel")
                .simultaneousGesture(DragGesture(minimumDistance: 8).onChanged { _ in
                    if !choosing {
                        choosing = true
                        if studio.recording && !studio.paused { studio.togglePause() }
                    }
                }.onEnded { _ in if let centered { choose(centered, delay: true) } })
                .onChange(of: centered) { _, index in if choosing, let index { choose(index, delay: true) } }
                .onChange(of: currentLine) { _, index in
                    if !choosing && studio.recording && !studio.paused { withAnimation { centered = index } }
                }
                .onAppear { centered = currentLine }
                .onDisappear { cueTask?.cancel() }
                .disabled(studio.processing || studio.countdown > 0)
            if let centered, studio.words.indices.contains(centered) {
                Text("선택한 가사 · \(timeLabel(studio.words[centered].0))").font(.caption).foregroundStyle(Brand.pink).accessibilityIdentifier("selected-lyric-time")
            }
        }
    }
    private func choose(_ index: Int, delay: Bool) {
        choosing = true; cueTask?.cancel()
        cueTask = Task {
            do { if delay { try await Task.sleep(for: .milliseconds(450)) }; try Task.checkCancellation() }
            catch { return }
            await studio.cueLyric(at: index)
            if !Task.isCancelled { choosing = false }
        }
    }
    private func lineText(_ index: Int) -> String {
        let text = studio.words[index].1
        guard studio.duetMode == "lyrics", studio.duetLines.indices.contains(index) else { return text }
        return "[\(DuetGuide.title(part: studio.duetLines[index], ownPart: studio.ownPart))] " + text
    }
}
