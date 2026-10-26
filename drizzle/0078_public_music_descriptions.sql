-- Operator-requested promotional introductions based on existing titles, genres and credits.
-- No invented listening history, biography or production events. Only exact previously reviewed metadata is changed.
-- Record before/after values atomically with each update; never modify audio, rights, revenue or publication state.
CREATE TRIGGER public_copy_0078_audit BEFORE UPDATE OF description ON tracks
WHEN coalesce(OLD.description,'')!=NEW.description AND ((OLD.id='a12c93eb-4894-4109-8345-971c507febec' AND NEW.description='같은 노래를 서로 다른 목소리로 이어 부르면 어떤 이야기가 될까요? 리스너 8ee92b09가 공개한 ‘별일 아닌 것처럼’의 듀엣 참여용 녹음입니다. Vibe의 원곡을 바탕으로 다음 목소리를 기다리는 작품으로, 완성된 솔로 커버와는 별도로 만나볼 수 있습니다.

원곡에 등록된 Indie Pop·Pop·Acoustic의 분위기를 살펴보고, 내 목소리로 어떤 감정을 더할지 떠올려 보세요. 먼저 공개된 파트를 확인한 뒤 듀엣 참여 화면에서 함께 부를 구간을 고를 수 있습니다.')
 OR (OLD.id='e8ce3d21-43f4-4eee-bf8c-e6187b417d7d' AND NEW.description='아무렇지 않은 인사 한마디에도 말하지 못한 마음이 남을 때가 있습니다. ‘별일 아닌 것처럼’이라는 제목이 떠올리게 하는 그 순간을, 원곡과 다른 한 사람의 목소리로 만나보세요.

Vibe의 제작곡에 리스너 8ee92b09가 보컬로 참여한 솔로 커버입니다. Indie Pop·Pop·Acoustic 장르의 원곡과 이 커버를 번갈아 들으며, 같은 가사가 목소리와 호흡에 따라 어떻게 다가오는지 직접 비교해 볼 수 있습니다. 듀엣 모집용 녹음과 구분되는 단독 커버 작품입니다.')
 OR (OLD.id='40d9c296-8098-4f3a-a4d5-344a3621d60f' AND NEW.description='비행기가 지나간 뒤에도 하늘에 잠시 남는 흔적. ‘비행운’이라는 제목을 따라, 지나갔지만 쉽게 잊히지 않는 사람이나 하루를 떠올려 보세요.

Veil의 원곡 ‘비행운’을 리스너 8ee92b09가 부른 솔로 커버입니다. 원곡은 Indie Pop·Folk 장르로 등록되어 있으며, 이 작품은 그 노래에 회원의 보컬이 더해진 별도 녹음입니다. 원곡 페이지와 오가며 두 버전을 감상하고, 자신에게 더 오래 남는 구절을 찾아보세요.')
 OR (OLD.id='2b4a4bce-a7e9-4f80-b688-d49b551c0cef' AND NEW.description='분명히 눈앞에 있었는데 어느새 옅어지는 것들이 있습니다. 하늘을 가로지르는 비행운처럼, 지나간 순간의 모양을 잠깐 더 붙잡아 보고 싶은 날을 위한 음악 소개입니다.

Veil이 공개한 ‘비행운’은 Indie Pop과 Folk 장르로 등록된 작품입니다. 제목이 떠올리게 하는 풍경에 여러분의 기억을 겹쳐 보세요. 미리듣기로 곡을 만나거나, 같은 곡을 부른 회원의 커버로 이어가며 하나의 노래가 여러 목소리로 바뀌는 모습을 발견할 수 있습니다.')
 OR (OLD.id='1026bba2-0b78-4bea-8a08-04398a6bd497' AND NEW.description='하루의 소음을 조금 내려놓고, 지금 마음을 끄는 음악에 집중해 보세요. ‘Turn it up’이라는 제목은 볼륨 숫자보다도 잠시 미뤄 둔 기분을 앞으로 꺼내 보자는 초대처럼 읽힙니다.

DÉON의 이름으로 공개된 Synth Pop·R&B 작품이며, 등록된 분위기는 로맨스와 밤입니다. 불빛이 하나둘 켜지는 시간, 자신만의 밤 장면을 떠올리며 들어보세요. 같은 아티스트의 다른 공개곡과 함께 나만의 야간 플레이리스트에 담아 볼 수 있습니다.')
 OR (OLD.id='8aa3c4cb-dcc0-41af-9260-b6f758075d05' AND NEW.description='어떤 순간은 지나간 뒤에야 더 크게 느껴집니다. 제목 ‘Aftershock’이 가리키는 여진처럼, 끝난 줄 알았던 감정이 다시 움직이는 장면을 떠올려 보세요.

인아의 이름으로 공개된 K-POP·Synth Pop·Dance 장르의 작품입니다. 등록된 분위기는 에너지와 드라이브이며, 창작자 사이그램은 참여 항목에 작사를 기재했습니다. 하루의 흐름을 바꾸고 싶은 시간에 미리듣기로 만나보고, 이 제목이 여러분에게 남기는 장면을 댓글로 나눠 주세요.')
 OR (OLD.id='8be24352-e0b4-4645-b0fb-1f31f14f41b3' AND NEW.description='여행지의 이름 하나만으로도 마음속 풍경이 달라질 때가 있습니다. ‘Okinawa’라는 제목에서 푸른 바다, 해가 진 뒤의 거리, 창문 밖으로 지나가는 불빛 중 어떤 장면이 먼저 떠오르나요?

Hiviki가 공개한 Synth Pop·Dance·Pop 장르의 작품으로, 드라이브와 밤의 분위기가 등록되어 있습니다. 실제 여행 이야기로 단정하기보다 여러분만의 여행 장면을 겹쳐 들어보세요. 떠나기 전의 설렘과 돌아오는 길의 여운을 담을 플레이리스트에서 만나볼 수 있습니다.')
 OR (OLD.id='4cef5b92-6ab0-4e89-882e-63574db0f783' AND NEW.description='모든 것을 또렷하게 설명하지 않아도 되는 순간. ‘Blurry on purpose’라는 제목을 따라, 선명한 정답 대신 흔들리는 불빛과 아직 이름 붙이지 않은 기분을 상상해 보세요.

그램의 이름으로 공개된 Dance·K-POP·Synth Pop 작품입니다. 창작자 코코가 작사 참여를 등록했으며, 에너지와 드라이브의 분위기로 분류되어 있습니다. 제목 속 ‘일부러 흐리게’라는 표현을 여러분은 어떻게 받아들이는지, 음악과 함께 각자의 해석을 찾아보세요.')
 OR (OLD.id='fa24aee4-6ef5-41f9-b2e6-819a144d72b0' AND NEW.description='작은 돌 하나가 수면을 몇 번 더 건너가는 동안, 짧은 순간에도 여러 개의 동그라미가 남습니다. ‘물수제비’라는 제목을 떠올리며 오늘의 사소한 기쁨이나 누군가에게 건네고 싶은 작은 말을 생각해 보세요.

Veil이 공개한 Indie Pop·Pop·Acoustic 작품으로, 위로와 로맨스, 드라이브의 분위기가 등록되어 있습니다. 기존 소개의 ‘잘 불러보세요’라는 인사처럼, 감상 뒤에는 준비된 반주와 함께 내 목소리로 이 곡을 표현해 보는 것도 좋겠습니다.')
 OR (OLD.id='28a2aa28-c0ed-4198-a0f0-4bf7a76abf8b' AND NEW.description='숨겨 둔 표정이나 마음이 들킨 듯한 짧은 순간, ‘Caught Ya!’라는 제목의 느낌표에서 어떤 장면이 떠오르나요? 장난스러운 발견일 수도, 더는 모른 척할 수 없는 마음일 수도 있습니다.

그램의 K-POP·Dance 작품으로, 에너지와 드라이브의 분위기가 등록되어 있습니다. 그램의 다른 공개곡 ‘Blurry on purpose’와 함께 제목이 만드는 서로 다른 이미지를 비교해 보세요. 해석을 미리 정하기보다 음악을 듣고 자신만의 장면을 찾아볼 수 있습니다.')
 OR (OLD.id='fef77394-8dd9-4638-9e82-a241b77b738c' AND NEW.description='다음으로 미뤄 둔 말, 망설이다 지나친 선택, 오늘이 아니면 놓칠 것 같은 순간. ‘한 번뿐이니까’라는 제목 앞에서 지금 해 보고 싶은 일을 하나 떠올려 보세요.

사이그램이 공개하고 작사 참여를 등록한 K-POP·Dance·Synth Pop 작품입니다. 에너지·위로·드라이브의 분위기로 분류되어 있습니다. 시작을 앞둔 시간이나 하루를 새롭게 바꾸고 싶은 순간에 들어보고, 여러분에게 ‘한 번뿐’인 것이 무엇인지 음악과 함께 생각해 보세요.')
 OR (OLD.id='068aa26a-cb99-41be-96e1-7e61beb54de1' AND NEW.description='거창한 이유 없이도 ‘참 좋다’고 말하고 싶은 날이 있습니다. 익숙한 길을 함께 걷는 일, 기다리던 연락, 아무 말 없이 나란히 있는 시간처럼 작은 장면 하나를 떠올려 보세요.

코코가 공개한 K-POP·Ballad 장르의 작품이며, 작사 참여와 위로·로맨스의 분위기가 등록되어 있습니다. 제목처럼 담백한 한마디를 누구에게 전하고 싶은지 생각하며 감상해 보세요. 특별한 날뿐 아니라 평범한 하루의 기분을 기록하는 플레이리스트에도 담아 볼 수 있습니다.')
 OR (OLD.id='d4c239cc-d765-4ca3-a62e-97283a7c9e8b' AND NEW.description='겉으로는 평소와 같은 하루인데, 혼자 있을 때 다시 떠오르는 말이 있습니다. ‘별일 아닌 것처럼’이라는 제목을 따라 아무렇지 않은 표정 뒤에 남겨 둔 마음을 생각해 보세요.

Vibe의 이름으로 공개된 Indie Pop·Pop·Acoustic 작품으로, 창작자 코코가 작사와 보컬 참여를 등록했습니다. 위로·회상·밤의 분위기로 분류되어 있습니다. 원곡을 감상한 뒤 연결된 솔로 커버와 듀엣 녹음으로 이어가며 같은 제목이 다른 목소리에서는 어떻게 다가오는지도 만나보세요.')
 OR (OLD.id='91252ca1-1715-4dfb-9fee-aa01a05ca6be' AND NEW.description='큰 다툼 한 번보다 짧아진 대화와 늦어진 안부가 더 오래 마음에 남을 때가 있습니다. ‘조금씩 멀어지고 있었나 봐’라는 제목은 뒤늦게 알아차린 거리, 그리고 그 사이에 놓쳤던 작은 순간들을 떠올리게 합니다.

Vibe의 Indie Pop·Ballad 작품이며, 창작자 코코가 작사와 보컬 참여를 등록했습니다. 회상과 위로의 분위기로 분류되어 있습니다. 누군가와의 거리를 한 가지 답으로 정리하기보다, 지금 자신의 마음에서 가장 오래 머무는 장면을 찾아보며 감상해 보세요.')
 OR (OLD.id='d4eeb934-5662-4a85-9474-ba29b85d8e75' AND NEW.description='단호해 보이는 한 문장도 말하는 사람과 듣는 사람에게는 다르게 남을 수 있습니다. ‘널 사랑하지 않아’라는 제목을 보고 여러분은 이별의 선언, 스스로에게 하는 다짐, 혹은 끝내 전하지 못한 말을 떠올리나요?

Veil이 공개한 Ballad·Pop 작품으로, 위로와 회상의 분위기가 등록되어 있습니다. 창작자는 작사·작곡·편곡·보컬·믹싱 참여를 기재했습니다. 제목만으로 감정의 결론을 정하기보다, 음악을 들으며 자신에게 남는 의미를 찾아보세요.')
 OR (OLD.id='b545d1c3-6c8d-46b7-bf64-0a5c91032cf2' AND NEW.description='괜찮다는 대답이 익숙해졌지만, 오늘만큼은 다른 말을 해도 되는 시간. ‘난 안 괜찮아’라는 제목에서 애써 감추지 않아도 되는 마음과 잠시 멈춰 설 자리를 떠올려 보세요.

Vibe의 이름으로 공개된 Indie Pop·Pop·R&B 작품이며, 회상·비·밤의 분위기가 등록되어 있습니다. 비가 오는 저녁이나 하루를 정리하는 시간에 미리듣기로 만나보세요. 감정을 빨리 바꾸려 하기보다 지금의 기분에 어울리는 음악을 찾는 플레이리스트에 담아 볼 수 있습니다.')
 OR (OLD.id='f922a40a-6aa8-4be2-9ba6-17eb2237ad63' AND NEW.description='위험하지만 즐기고 있는 사랑. 창작자가 남긴 짧은 소개를 따라, 멀어져야 한다는 생각과 다시 다가가고 싶은 마음이 엇갈리는 순간을 상상해 보세요. ‘금단증상’이라는 제목은 여기서 사랑을 둘러싼 강한 끌림을 떠올리게 합니다.

코코가 공개하고 작사 참여를 등록한 K-POP·Synth Pop·R&B 작품입니다. 밤과 회상의 분위기로 분류되어 있습니다. 제목을 의학적인 의미보다 감정의 비유로 읽으며, 여러분이 느낀 관계의 거리와 망설임을 음악 안에서 찾아보세요.')
 OR (OLD.id='fb173848-a634-4f2d-a30d-22b57fb7776e' AND NEW.description='도깨비 신부 설화에서 출발한 음악입니다. 익숙한 현실 너머의 존재와 인연을 맺는다는 상상, 서로 다른 세계 사이에서 약속을 지킨다는 장면을 떠올려 보세요. 특정 설화의 결말을 미리 정하기보다 여러분이 알고 있는 이야기와 새롭게 그려지는 풍경을 겹쳐 감상할 수 있습니다.

코코가 공개한 Pop·Ballad 작품으로, 작사 참여와 위로·회상의 분위기가 등록되어 있습니다. 제목 속 두 인물이 어떤 마음으로 서로를 바라볼지 상상하며 들어보세요.')
 OR (OLD.id='69e208a7-f7c0-45b9-8f2d-1621ace4fabb' AND NEW.description='이루어질 수 없는 사랑에 대한 노래입니다. ‘조금’이라고 말하고 싶지만 사실은 ‘많이’ 좋아하는 마음, 가까이 다가가고 싶은 바람과 지켜야 할 거리 사이의 망설임을 제목에 겹쳐 보세요.

코코가 공개하고 작사 참여를 등록한 Indie Pop·Ballad 작품으로, 위로·회상·밤의 분위기가 등록되어 있습니다. 마음을 전하지 못했던 시간이나 혼자 간직한 안부가 떠오른다면, 지금의 자신에게 어떤 말을 건네고 싶은지 생각하며 감상해 보세요.'))
BEGIN
 INSERT INTO admin_audit(id,admin_id,action,target,created) VALUES('public-copy-0078:'||OLD.id,'operator-requested-editorial:0078','track_description_editorial',json_object('track_id',OLD.id,'title',OLD.title,'producer_id',OLD.producer_id,'before',OLD.description,'after',NEW.description,'basis','registered title, genre, mood, credits and existing description; operator-requested editorial'),unixepoch());
END;
--> statement-breakpoint
UPDATE tracks SET description='같은 노래를 서로 다른 목소리로 이어 부르면 어떤 이야기가 될까요? 리스너 8ee92b09가 공개한 ‘별일 아닌 것처럼’의 듀엣 참여용 녹음입니다. Vibe의 원곡을 바탕으로 다음 목소리를 기다리는 작품으로, 완성된 솔로 커버와는 별도로 만나볼 수 있습니다.

원곡에 등록된 Indie Pop·Pop·Acoustic의 분위기를 살펴보고, 내 목소리로 어떤 감정을 더할지 떠올려 보세요. 먼저 공개된 파트를 확인한 뒤 듀엣 참여 화면에서 함께 부를 구간을 고를 수 있습니다.' WHERE id='a12c93eb-4894-4109-8345-971c507febec' AND title='별일 아닌 것처럼' AND producer_id='ff6a2f36-5277-4a99-b00d-9586543580d0' AND kind='cover' AND cover_mode='duet' AND original_id IS 'd4c239cc-d765-4ca3-a62e-97283a7c9e8b' AND status='published' AND coalesce(description,'')='';
--> statement-breakpoint
UPDATE tracks SET description='아무렇지 않은 인사 한마디에도 말하지 못한 마음이 남을 때가 있습니다. ‘별일 아닌 것처럼’이라는 제목이 떠올리게 하는 그 순간을, 원곡과 다른 한 사람의 목소리로 만나보세요.

Vibe의 제작곡에 리스너 8ee92b09가 보컬로 참여한 솔로 커버입니다. Indie Pop·Pop·Acoustic 장르의 원곡과 이 커버를 번갈아 들으며, 같은 가사가 목소리와 호흡에 따라 어떻게 다가오는지 직접 비교해 볼 수 있습니다. 듀엣 모집용 녹음과 구분되는 단독 커버 작품입니다.' WHERE id='e8ce3d21-43f4-4eee-bf8c-e6187b417d7d' AND title='별일 아닌 것처럼' AND producer_id='ff6a2f36-5277-4a99-b00d-9586543580d0' AND kind='cover' AND cover_mode='solo' AND original_id IS 'd4c239cc-d765-4ca3-a62e-97283a7c9e8b' AND status='published' AND coalesce(description,'')='';
--> statement-breakpoint
UPDATE tracks SET description='비행기가 지나간 뒤에도 하늘에 잠시 남는 흔적. ‘비행운’이라는 제목을 따라, 지나갔지만 쉽게 잊히지 않는 사람이나 하루를 떠올려 보세요.

Veil의 원곡 ‘비행운’을 리스너 8ee92b09가 부른 솔로 커버입니다. 원곡은 Indie Pop·Folk 장르로 등록되어 있으며, 이 작품은 그 노래에 회원의 보컬이 더해진 별도 녹음입니다. 원곡 페이지와 오가며 두 버전을 감상하고, 자신에게 더 오래 남는 구절을 찾아보세요.' WHERE id='40d9c296-8098-4f3a-a4d5-344a3621d60f' AND title='비행운' AND producer_id='ff6a2f36-5277-4a99-b00d-9586543580d0' AND kind='cover' AND cover_mode='solo' AND original_id IS '2b4a4bce-a7e9-4f80-b688-d49b551c0cef' AND status='published' AND coalesce(description,'')='';
--> statement-breakpoint
UPDATE tracks SET description='분명히 눈앞에 있었는데 어느새 옅어지는 것들이 있습니다. 하늘을 가로지르는 비행운처럼, 지나간 순간의 모양을 잠깐 더 붙잡아 보고 싶은 날을 위한 음악 소개입니다.

Veil이 공개한 ‘비행운’은 Indie Pop과 Folk 장르로 등록된 작품입니다. 제목이 떠올리게 하는 풍경에 여러분의 기억을 겹쳐 보세요. 미리듣기로 곡을 만나거나, 같은 곡을 부른 회원의 커버로 이어가며 하나의 노래가 여러 목소리로 바뀌는 모습을 발견할 수 있습니다.' WHERE id='2b4a4bce-a7e9-4f80-b688-d49b551c0cef' AND title='비행운' AND producer_id='75e8dbe4-b8b9-4b8a-83f2-e92583ebfdae' AND kind='original' AND cover_mode='solo' AND original_id IS NULL AND status='published' AND coalesce(description,'')='0000';
--> statement-breakpoint
UPDATE tracks SET description='하루의 소음을 조금 내려놓고, 지금 마음을 끄는 음악에 집중해 보세요. ‘Turn it up’이라는 제목은 볼륨 숫자보다도 잠시 미뤄 둔 기분을 앞으로 꺼내 보자는 초대처럼 읽힙니다.

DÉON의 이름으로 공개된 Synth Pop·R&B 작품이며, 등록된 분위기는 로맨스와 밤입니다. 불빛이 하나둘 켜지는 시간, 자신만의 밤 장면을 떠올리며 들어보세요. 같은 아티스트의 다른 공개곡과 함께 나만의 야간 플레이리스트에 담아 볼 수 있습니다.' WHERE id='1026bba2-0b78-4bea-8a08-04398a6bd497' AND title='Turn it up' AND producer_id='75e8dbe4-b8b9-4b8a-83f2-e92583ebfdae' AND kind='original' AND cover_mode='solo' AND original_id IS NULL AND status='published' AND coalesce(description,'')='';
--> statement-breakpoint
UPDATE tracks SET description='어떤 순간은 지나간 뒤에야 더 크게 느껴집니다. 제목 ‘Aftershock’이 가리키는 여진처럼, 끝난 줄 알았던 감정이 다시 움직이는 장면을 떠올려 보세요.

인아의 이름으로 공개된 K-POP·Synth Pop·Dance 장르의 작품입니다. 등록된 분위기는 에너지와 드라이브이며, 창작자 사이그램은 참여 항목에 작사를 기재했습니다. 하루의 흐름을 바꾸고 싶은 시간에 미리듣기로 만나보고, 이 제목이 여러분에게 남기는 장면을 댓글로 나눠 주세요.' WHERE id='8aa3c4cb-dcc0-41af-9260-b6f758075d05' AND title='Aftershock' AND producer_id='3f8cfa01-9f9c-4c09-88d5-2ff01cc67dec' AND kind='original' AND cover_mode='solo' AND original_id IS NULL AND status='published' AND coalesce(description,'')='';
--> statement-breakpoint
UPDATE tracks SET description='여행지의 이름 하나만으로도 마음속 풍경이 달라질 때가 있습니다. ‘Okinawa’라는 제목에서 푸른 바다, 해가 진 뒤의 거리, 창문 밖으로 지나가는 불빛 중 어떤 장면이 먼저 떠오르나요?

Hiviki가 공개한 Synth Pop·Dance·Pop 장르의 작품으로, 드라이브와 밤의 분위기가 등록되어 있습니다. 실제 여행 이야기로 단정하기보다 여러분만의 여행 장면을 겹쳐 들어보세요. 떠나기 전의 설렘과 돌아오는 길의 여운을 담을 플레이리스트에서 만나볼 수 있습니다.' WHERE id='8be24352-e0b4-4645-b0fb-1f31f14f41b3' AND title='Okinawa' AND producer_id='38abf68f-60b7-4086-967c-834a09ffc954' AND kind='original' AND cover_mode='solo' AND original_id IS NULL AND status='published' AND coalesce(description,'')='';
--> statement-breakpoint
UPDATE tracks SET description='모든 것을 또렷하게 설명하지 않아도 되는 순간. ‘Blurry on purpose’라는 제목을 따라, 선명한 정답 대신 흔들리는 불빛과 아직 이름 붙이지 않은 기분을 상상해 보세요.

그램의 이름으로 공개된 Dance·K-POP·Synth Pop 작품입니다. 창작자 코코가 작사 참여를 등록했으며, 에너지와 드라이브의 분위기로 분류되어 있습니다. 제목 속 ‘일부러 흐리게’라는 표현을 여러분은 어떻게 받아들이는지, 음악과 함께 각자의 해석을 찾아보세요.' WHERE id='4cef5b92-6ab0-4e89-882e-63574db0f783' AND title='Blurry on purpose' AND producer_id='b4a74727-a644-4a1b-bc96-5b8b45cae068' AND kind='original' AND cover_mode='solo' AND original_id IS NULL AND status='published' AND coalesce(description,'')='';
--> statement-breakpoint
UPDATE tracks SET description='작은 돌 하나가 수면을 몇 번 더 건너가는 동안, 짧은 순간에도 여러 개의 동그라미가 남습니다. ‘물수제비’라는 제목을 떠올리며 오늘의 사소한 기쁨이나 누군가에게 건네고 싶은 작은 말을 생각해 보세요.

Veil이 공개한 Indie Pop·Pop·Acoustic 작품으로, 위로와 로맨스, 드라이브의 분위기가 등록되어 있습니다. 기존 소개의 ‘잘 불러보세요’라는 인사처럼, 감상 뒤에는 준비된 반주와 함께 내 목소리로 이 곡을 표현해 보는 것도 좋겠습니다.' WHERE id='fa24aee4-6ef5-41f9-b2e6-819a144d72b0' AND title='물수제비' AND producer_id='75e8dbe4-b8b9-4b8a-83f2-e92583ebfdae' AND kind='original' AND cover_mode='solo' AND original_id IS NULL AND status='published' AND coalesce(description,'')='잘 불러보세요';
--> statement-breakpoint
UPDATE tracks SET description='숨겨 둔 표정이나 마음이 들킨 듯한 짧은 순간, ‘Caught Ya!’라는 제목의 느낌표에서 어떤 장면이 떠오르나요? 장난스러운 발견일 수도, 더는 모른 척할 수 없는 마음일 수도 있습니다.

그램의 K-POP·Dance 작품으로, 에너지와 드라이브의 분위기가 등록되어 있습니다. 그램의 다른 공개곡 ‘Blurry on purpose’와 함께 제목이 만드는 서로 다른 이미지를 비교해 보세요. 해석을 미리 정하기보다 음악을 듣고 자신만의 장면을 찾아볼 수 있습니다.' WHERE id='28a2aa28-c0ed-4198-a0f0-4bf7a76abf8b' AND title='Caught Ya!' AND producer_id='b4a74727-a644-4a1b-bc96-5b8b45cae068' AND kind='original' AND cover_mode='solo' AND original_id IS NULL AND status='published' AND coalesce(description,'')='';
--> statement-breakpoint
UPDATE tracks SET description='다음으로 미뤄 둔 말, 망설이다 지나친 선택, 오늘이 아니면 놓칠 것 같은 순간. ‘한 번뿐이니까’라는 제목 앞에서 지금 해 보고 싶은 일을 하나 떠올려 보세요.

사이그램이 공개하고 작사 참여를 등록한 K-POP·Dance·Synth Pop 작품입니다. 에너지·위로·드라이브의 분위기로 분류되어 있습니다. 시작을 앞둔 시간이나 하루를 새롭게 바꾸고 싶은 순간에 들어보고, 여러분에게 ‘한 번뿐’인 것이 무엇인지 음악과 함께 생각해 보세요.' WHERE id='fef77394-8dd9-4638-9e82-a241b77b738c' AND title='한 번뿐이니까' AND producer_id='3f8cfa01-9f9c-4c09-88d5-2ff01cc67dec' AND kind='original' AND cover_mode='solo' AND original_id IS NULL AND status='published' AND coalesce(description,'')='';
--> statement-breakpoint
UPDATE tracks SET description='거창한 이유 없이도 ‘참 좋다’고 말하고 싶은 날이 있습니다. 익숙한 길을 함께 걷는 일, 기다리던 연락, 아무 말 없이 나란히 있는 시간처럼 작은 장면 하나를 떠올려 보세요.

코코가 공개한 K-POP·Ballad 장르의 작품이며, 작사 참여와 위로·로맨스의 분위기가 등록되어 있습니다. 제목처럼 담백한 한마디를 누구에게 전하고 싶은지 생각하며 감상해 보세요. 특별한 날뿐 아니라 평범한 하루의 기분을 기록하는 플레이리스트에도 담아 볼 수 있습니다.' WHERE id='068aa26a-cb99-41be-96e1-7e61beb54de1' AND title='참 좋다' AND producer_id='b4a74727-a644-4a1b-bc96-5b8b45cae068' AND kind='original' AND cover_mode='solo' AND original_id IS NULL AND status='published' AND coalesce(description,'')='';
--> statement-breakpoint
UPDATE tracks SET description='겉으로는 평소와 같은 하루인데, 혼자 있을 때 다시 떠오르는 말이 있습니다. ‘별일 아닌 것처럼’이라는 제목을 따라 아무렇지 않은 표정 뒤에 남겨 둔 마음을 생각해 보세요.

Vibe의 이름으로 공개된 Indie Pop·Pop·Acoustic 작품으로, 창작자 코코가 작사와 보컬 참여를 등록했습니다. 위로·회상·밤의 분위기로 분류되어 있습니다. 원곡을 감상한 뒤 연결된 솔로 커버와 듀엣 녹음으로 이어가며 같은 제목이 다른 목소리에서는 어떻게 다가오는지도 만나보세요.' WHERE id='d4c239cc-d765-4ca3-a62e-97283a7c9e8b' AND title='별일 아닌 것처럼' AND producer_id='b4a74727-a644-4a1b-bc96-5b8b45cae068' AND kind='original' AND cover_mode='solo' AND original_id IS NULL AND status='published' AND coalesce(description,'')='';
--> statement-breakpoint
UPDATE tracks SET description='큰 다툼 한 번보다 짧아진 대화와 늦어진 안부가 더 오래 마음에 남을 때가 있습니다. ‘조금씩 멀어지고 있었나 봐’라는 제목은 뒤늦게 알아차린 거리, 그리고 그 사이에 놓쳤던 작은 순간들을 떠올리게 합니다.

Vibe의 Indie Pop·Ballad 작품이며, 창작자 코코가 작사와 보컬 참여를 등록했습니다. 회상과 위로의 분위기로 분류되어 있습니다. 누군가와의 거리를 한 가지 답으로 정리하기보다, 지금 자신의 마음에서 가장 오래 머무는 장면을 찾아보며 감상해 보세요.' WHERE id='91252ca1-1715-4dfb-9fee-aa01a05ca6be' AND title='조금씩 멀어지고 있었나 봐' AND producer_id='b4a74727-a644-4a1b-bc96-5b8b45cae068' AND kind='original' AND cover_mode='solo' AND original_id IS NULL AND status='published' AND coalesce(description,'')='';
--> statement-breakpoint
UPDATE tracks SET description='단호해 보이는 한 문장도 말하는 사람과 듣는 사람에게는 다르게 남을 수 있습니다. ‘널 사랑하지 않아’라는 제목을 보고 여러분은 이별의 선언, 스스로에게 하는 다짐, 혹은 끝내 전하지 못한 말을 떠올리나요?

Veil이 공개한 Ballad·Pop 작품으로, 위로와 회상의 분위기가 등록되어 있습니다. 창작자는 작사·작곡·편곡·보컬·믹싱 참여를 기재했습니다. 제목만으로 감정의 결론을 정하기보다, 음악을 들으며 자신에게 남는 의미를 찾아보세요.' WHERE id='d4eeb934-5662-4a85-9474-ba29b85d8e75' AND title='널 사랑하지 않아' AND producer_id='75e8dbe4-b8b9-4b8a-83f2-e92583ebfdae' AND kind='original' AND cover_mode='solo' AND original_id IS NULL AND status='published' AND coalesce(description,'')='-';
--> statement-breakpoint
UPDATE tracks SET description='괜찮다는 대답이 익숙해졌지만, 오늘만큼은 다른 말을 해도 되는 시간. ‘난 안 괜찮아’라는 제목에서 애써 감추지 않아도 되는 마음과 잠시 멈춰 설 자리를 떠올려 보세요.

Vibe의 이름으로 공개된 Indie Pop·Pop·R&B 작품이며, 회상·비·밤의 분위기가 등록되어 있습니다. 비가 오는 저녁이나 하루를 정리하는 시간에 미리듣기로 만나보세요. 감정을 빨리 바꾸려 하기보다 지금의 기분에 어울리는 음악을 찾는 플레이리스트에 담아 볼 수 있습니다.' WHERE id='b545d1c3-6c8d-46b7-bf64-0a5c91032cf2' AND title='난 안 괜찮아' AND producer_id='b4a74727-a644-4a1b-bc96-5b8b45cae068' AND kind='original' AND cover_mode='solo' AND original_id IS NULL AND status='published' AND coalesce(description,'')='없음';
--> statement-breakpoint
UPDATE tracks SET description='위험하지만 즐기고 있는 사랑. 창작자가 남긴 짧은 소개를 따라, 멀어져야 한다는 생각과 다시 다가가고 싶은 마음이 엇갈리는 순간을 상상해 보세요. ‘금단증상’이라는 제목은 여기서 사랑을 둘러싼 강한 끌림을 떠올리게 합니다.

코코가 공개하고 작사 참여를 등록한 K-POP·Synth Pop·R&B 작품입니다. 밤과 회상의 분위기로 분류되어 있습니다. 제목을 의학적인 의미보다 감정의 비유로 읽으며, 여러분이 느낀 관계의 거리와 망설임을 음악 안에서 찾아보세요.' WHERE id='f922a40a-6aa8-4be2-9ba6-17eb2237ad63' AND title='금단증상' AND producer_id='b4a74727-a644-4a1b-bc96-5b8b45cae068' AND kind='original' AND cover_mode='solo' AND original_id IS NULL AND status='published' AND coalesce(description,'')='위험하지만 즐기고 있는 사랑';
--> statement-breakpoint
UPDATE tracks SET description='도깨비 신부 설화에서 출발한 음악입니다. 익숙한 현실 너머의 존재와 인연을 맺는다는 상상, 서로 다른 세계 사이에서 약속을 지킨다는 장면을 떠올려 보세요. 특정 설화의 결말을 미리 정하기보다 여러분이 알고 있는 이야기와 새롭게 그려지는 풍경을 겹쳐 감상할 수 있습니다.

코코가 공개한 Pop·Ballad 작품으로, 작사 참여와 위로·회상의 분위기가 등록되어 있습니다. 제목 속 두 인물이 어떤 마음으로 서로를 바라볼지 상상하며 들어보세요.' WHERE id='fb173848-a634-4f2d-a30d-22b57fb7776e' AND title='도깨비 신부' AND producer_id='b4a74727-a644-4a1b-bc96-5b8b45cae068' AND kind='original' AND cover_mode='solo' AND original_id IS NULL AND status='published' AND coalesce(description,'')='도깨비신부 설화';
--> statement-breakpoint
UPDATE tracks SET description='이루어질 수 없는 사랑에 대한 노래입니다. ‘조금’이라고 말하고 싶지만 사실은 ‘많이’ 좋아하는 마음, 가까이 다가가고 싶은 바람과 지켜야 할 거리 사이의 망설임을 제목에 겹쳐 보세요.

코코가 공개하고 작사 참여를 등록한 Indie Pop·Ballad 작품으로, 위로·회상·밤의 분위기가 등록되어 있습니다. 마음을 전하지 못했던 시간이나 혼자 간직한 안부가 떠오른다면, 지금의 자신에게 어떤 말을 건네고 싶은지 생각하며 감상해 보세요.' WHERE id='69e208a7-f7c0-45b9-8f2d-1621ace4fabb' AND title='조금 많이 좋아해서..' AND producer_id='b4a74727-a644-4a1b-bc96-5b8b45cae068' AND kind='original' AND cover_mode='solo' AND original_id IS NULL AND status='published' AND coalesce(description,'')='이루어질 수 없는 사랑에 대한 노래';
--> statement-breakpoint
DROP TRIGGER public_copy_0078_audit;
