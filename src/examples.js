const instant = '2026-10-27T00:00:00.000Z';
const moment = (id, title, note, emotion, parentId, relation, art, date) => ({ id, title, note, emotion, parentId, relation, art, date, url: '', createdAt: instant });
export const EXAMPLES = [
  {
    id: 'demo-voice', subject: '윤슬', title: '그 목소리를 처음 만난 밤', createdAt: instant, updatedAt: instant, theme: 'rose',
    caption: '우연히 들은 노래가, 하루의 가장 따뜻한 장면이 되기까지.',
    moments: [
      moment('voice-1', '우연히 멈춰 선 그 노래', '잠들기 전 우연히 들은 목소리. 마지막 소절에서 나도 모르게 영상을 다시 돌렸다.', '설렘', null, '', 'stage', '2026-09-12'),
      moment('voice-2', '가사 한 줄이 건넨 위로', '“천천히 가도 괜찮아.” 그날 내게 꼭 필요했던 말이라서 오래 기억하고 싶다.', '위로', 'voice-1', '다른 노래도 찾아듣다가', 'sky', '2026-09-18'),
      moment('voice-3', '같은 노래를 함께 부른 날', '이어폰 안에 있던 노래가 공연장 가득 퍼졌다. 이 순간을 기다렸던 것 같다.', '벅참', 'voice-1', '직접 만나 듣고 싶어져서', 'stage', '2026-10-04')
    ]
  },
  {
    id: 'demo-scene', subject: '여름의 편지', title: '자꾸만 돌아보게 되는 장면', createdAt: instant, updatedAt: instant, theme: 'sage',
    caption: '한 편의 이야기에서 발견한, 나와 닮은 마음들.',
    moments: [
      moment('scene-1', '말없이 기다려 준 장면', '대사보다 오래 남은 작은 표정. 이 이야기가 좋아진 순간이다.', '위로', null, '', 'sky', '2026-08-01'),
      moment('scene-2', '친구에게 먼저 보여 준 이야기', '좋아하는 마음을 나누니 내가 놓쳤던 장면도 보이기 시작했다.', '즐거움', 'scene-1', '이 마음을 나누고 싶어서', 'stage', '2026-08-15'),
      moment('scene-3', '계절이 바뀌어 다시 보니', '처음 볼 때와 다른 장면에서 마음이 멈췄다. 그 사이 나도 조금 변했나 보다.', '그리움', 'scene-2', '시간이 흐른 뒤 다시 꺼내 보니', 'sky', '2026-10-12')
    ]
  },
  {
    id: 'demo-stage', subject: '오월', title: '무대가 끝나도 이어지는 마음', createdAt: instant, updatedAt: instant, theme: 'lavender',
    caption: '작은 응원이 모여, 오래 간직하고 싶은 기억이 된 날.',
    moments: [
      moment('stage-1', '첫 무대를 응원하던 마음', '떨리는 손으로 마이크를 잡던 모습. 앞으로의 무대도 함께 보고 싶어졌다.', '설렘', null, '', 'stage', '2026-07-14'),
      moment('stage-2', '우리만 아는 작은 약속', '공연 끝에 다음에 또 만나자는 말. 평범한 인사가 특별하게 느껴졌다.', '고마움', 'stage-1', '다음 무대도 찾아가면서', 'sky', '2026-09-09'),
      moment('stage-3', '다시 환하게 웃던 날', '더 큰 무대에 선 모습을 보며 처음 만났던 날을 떠올렸다.', '벅참', 'stage-2', '그 약속이 다시 이어져서', 'stage', '2026-10-01')
    ]
  }
];
