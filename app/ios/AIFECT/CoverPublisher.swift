import Foundation

struct CoverReceipt: Codable {
    var id: String
    var phase: String
}

@MainActor
enum CoverPublisher {
    static func submit(draft: RecordingDraft, audio: URL, description: String, ownVoice: Bool, rights: Bool, duetConsent: Bool = false, api: API? = nil) async throws -> String {
        let api = api ?? API.shared
        guard ownVoice && rights else { throw APIError(status: 0, message: "직접 부른 녹음이며 공개할 권리가 있는지 확인해주세요.") }
        if draft.duetFirst == true && !duetConsent { throw APIError(status: 0, message: "듀엣 참여 허용에 동의해주세요.") }
        let me = try await api.call("/api/me")
        guard (me["user"] as? [String: Any])?.string("id") == draft.owner else { throw APIError(status: 401, message: "녹음한 계정으로 다시 로그인해주세요.") }
        let receiptURL = draft.directory.appendingPathComponent("submission.json")
        let frozenURL = draft.directory.appendingPathComponent("submission.wav")
        var receipt: CoverReceipt
        if FileManager.default.fileExists(atPath: receiptURL.path) {
            receipt = try JSONDecoder().decode(CoverReceipt.self, from: Data(contentsOf: receiptURL))
            guard !receipt.id.isEmpty else {
                throw APIError(status: 0, message: "이전 게시 요청의 응답을 확인하지 못했습니다. 중복 게시를 막기 위해 웹 스튜디오에서 업로드 상태를 확인해주세요. 녹음 초안은 보관되어 있습니다.")
            }
            let status = try await api.call("/api/studio/tracks/\(Endpoint.pathID(receipt.id))")
            let phase = (status["profile"] as? [String: Any])?.string("status") ?? ""
            if ["queued", "processing", "published", "hidden"].contains(phase) { return receipt.id }
            guard phase == "uploading" else { throw APIError(status: 0, message: "웹 스튜디오에서 음원 처리 상태를 확인해주세요. 초안은 보관되어 있습니다.") }
        } else {
            let bytes = try Data(contentsOf: audio)
            guard bytes.count >= 100 && bytes.count <= 80 * 1024 * 1024 else {
                throw APIError(status: 0, message: "게시할 WAV 파일은 80MB 이하여야 합니다. 현재 녹음은 파일로 내보낼 수 있습니다.")
            }
            try bytes.write(to: frozenURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            receipt = CoverReceipt(id: "", phase: "creating")
            try JSONEncoder().encode(receipt).write(to: receiptURL, options: .atomic)
            do {
                var body: [String: Any] = ["original_id": draft.song.id, "cover_mode": draft.duetFirst == true || draft.duetParentID != nil ? "duet" : "solo", "extension": "wav", "bytes": bytes.count, "description": description, "own_voice": true, "rights": true]
                if let parent = draft.duetParentID { body["duet_parent_id"] = parent; body["duet_slot"] = "second" }
                if draft.duetFirst == true {
                    body["duet_slot"] = "first"; body["duet_consent"] = duetConsent
                    let lines = draft.duetLines ?? []
                    let mode = draft.duetMode ?? (lines.isEmpty ? "free" : "lyrics")
                    body["duet_guide"] = ["version": 1, "mode": mode, "lines": mode == "lyrics" ? lines : []]
                }
                let created = try await api.call("/api/covers", method: "POST", body: body)
                guard !created.string("id").isEmpty else { throw URLError(.badServerResponse) }
                receipt = CoverReceipt(id: created.string("id"), phase: "uploading")
                try JSONEncoder().encode(receipt).write(to: receiptURL, options: .atomic)
            } catch let error as APIError where (400..<500).contains(error.status) {
                // A definite server rejection did not create a track. Preserve the draft audio.
                try? FileManager.default.removeItem(at: receiptURL)
                throw error
            }
        }
        let bytes = try Data(contentsOf: frozenURL)
        _ = try await api.request("/api/uploads/\(Endpoint.pathID(receipt.id))/audio", method: "PUT", bytes: bytes)
        _ = try await api.call("/api/uploads/\(Endpoint.pathID(receipt.id))/complete", method: "POST", body: [:])
        receipt.phase = "submitted"
        try JSONEncoder().encode(receipt).write(to: receiptURL, options: .atomic)
        return receipt.id
    }
}
