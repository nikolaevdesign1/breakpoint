// Reviews shown as text messages (partials/reviews.html). One set per page: data-reviews="home|coaching|tournaments|members".
// Avatars are Unsplash portraits, cropped to the face and shown in black and white.

const PORTRAITS = [
  'photo-1500648767791-00dcc994a43e', // 0
  'photo-1494790108377-be9c29b29330', // 1
  'photo-1507003211169-0a1dd7228f2d', // 2
  'photo-1438761681033-6461ffad8d80', // 3
  'photo-1544005313-94ddf0286df2', // 4
  'photo-1506794778202-cad84cf45f1d', // 5
  'photo-1534528741775-53994a69daeb', // 6
  'photo-1539571696357-5a69c17a67c6', // 7
  'photo-1531123897727-8f129e1688ce', // 8
  'photo-1599566150163-29194dcaad36', // 9
  'photo-1524504388940-b1c1722653e1', // 10
  'photo-1547425260-76bcadfb4f2c', // 11
  'photo-1580489944761-15a19d654956', // 12
  'photo-1633332755192-727a05c4013d', // 13
  'photo-1488426862026-3ee34a7d66df', // 14
  'photo-1552058544-f2b08422138a', // 15
  'photo-1546961329-78bef0414d7c', // 16
  'photo-1554151228-14d9def656e4', // 17
  'photo-1527980965255-d3b416303d12', // 18
  'photo-1514932535303-f7b1712cf831', // 19 (row 145: replaces a Nike cap)
  'photo-1508214751196-bcfd4ca60f91', // 20
  'photo-1560250097-0b93528c311a', // 21
];

export const avatarUrl = (i, size = 96) =>
  `https://images.unsplash.com/${PORTRAITS[i]}?auto=format&fit=crop&crop=faces&w=${size}&h=${size}&q=70`;

// tone: ink (default) · sun (Malibu Sun cream) · clay (Rich Red)
export const REVIEW_SETS = {
  home: {
    title: 'What members text us after a <em>match</em>',
    items: [
      { text: 'Booked a clay court for 9 PM on a Tuesday. Lights on, clay watered, nobody waiting.', name: 'Marcus T.', meta: 'Tue, 10:42 PM', avatar: 0 },
      { text: 'One hour with Sofia and my second serve finally goes in. Three years of double faults, gone.', name: 'Priya N.', meta: 'Sat, 11:05 AM', avatar: 8, tone: 'sun' },
      { text: 'My son just beat me on clay. Thanks, I guess.', name: 'Anna K.', meta: 'Academy parent', avatar: 3 },
      { text: 'Padel at 7, the terrace after. Friday sorted.', name: 'Diego M.', meta: 'Fri, 9:58 PM', avatar: 2, tone: 'clay' },
      { text: 'Met my doubles partner at the Friday mixer. We play twice a week now.', name: 'Sofia L.', meta: 'Member since spring', avatar: 1 },
      { text: 'Rain at 5, moved indoors by 5:10. I didn’t even call the desk, they texted me first.', name: 'James O.', meta: 'Wed, 5:14 PM', avatar: 13 },
      { text: 'Shade on the terrace after a 95° hour. Exactly what I needed.', name: 'Lena V.', meta: 'Sun, 2:30 PM', avatar: 6, tone: 'sun' },
      { text: 'First lesson ever at 41. Nobody made me feel slow.', name: 'Rachel B.', meta: 'Adult beginners', avatar: 14 },
      { text: 'Split session with my sister every Thursday. Half the bill, double the trash talk.', name: 'Leila H.', meta: 'Thu, 8:47 PM', avatar: 12, tone: 'clay' },
      { text: 'Booked the 6 AM slot from bed. Back at my desk by 8 with a win.', name: 'Kevin W.', meta: 'Mon, 8:03 AM', avatar: 18 },
    ],
  },
  coaching: {
    title: 'What players text their <em>coach</em>',
    items: [
      { text: 'Kevin filmed my forehand and showed me the exact frame where it breaks. Fixed in two sessions.', name: 'Omar S.', meta: 'Private coaching', avatar: 5 },
      { text: 'Lena remembers what we worked on last month. Better than I do.', name: 'Hannah G.', meta: 'Adult intermediate group', avatar: 17, tone: 'sun' },
      { text: 'My daughter used to cry before lessons. Now she packs her bag on Sunday night.', name: 'Carla D.', meta: 'Orange ball parent', avatar: 4 },
      { text: 'Asked for fitness, got footwork. Turns out that was the whole problem.', name: 'Ben R.', meta: 'Tue, 9:20 PM', avatar: 11 },
      { text: 'Four players, one coach, everyone hits. No standing in line for twenty minutes.', name: 'Mia F.', meta: 'Morning clinic', avatar: 10, tone: 'clay' },
      { text: 'I’m 58 and Alexander coaches me like I’m going to Wimbledon. I’m not. I love it.', name: 'Roy H.', meta: 'Private coaching', avatar: 21 },
      { text: 'He sent me a drill video after the lesson. Did it in the garage, it worked.', name: 'Tariq A.', meta: 'Sat, 6:12 PM', avatar: 9, tone: 'sun' },
      { text: 'Two months of privates and I moved up a group. Sofia called it in week one.', name: 'Elena P.', meta: 'Private coaching', avatar: 16 },
    ],
  },
  tournaments: {
    title: 'Texts from the <em>draw</em>',
    items: [
      { text: 'Lost in the semis 10–8 in the match tiebreak. Already signed up for next month.', name: 'Nadia B.', meta: 'Club Open', avatar: 20 },
      { text: 'First tournament ever and they put me with people at my level. Won two rounds!', name: 'Chris L.', meta: 'Under 1 year draw', avatar: 7, tone: 'sun' },
      { text: 'Draw was online by Thursday, order of play by Friday. Zero waiting around.', name: 'Ivan K.', meta: 'Fri, 7:41 PM', avatar: 15 },
      { text: 'Doubles night with a random partner. We’re playing the Mixed Classic together now.', name: 'Grace W.', meta: 'Doubles night', avatar: 1, tone: 'clay' },
      { text: 'Lines judged fair, balls new every set. Well run.', name: 'Paul M.', meta: '45+ Clay Classic', avatar: 19 },
      { text: 'My 11-year-old played her first green ball event. She has a trophy and a new best friend.', name: 'Dana R.', meta: 'Junior circuit', avatar: 12 },
      { text: 'Rain on Sunday, final moved indoors in under an hour. Played it at 4 instead of 2.', name: 'Luis F.', meta: 'Sun, 6:55 PM', avatar: 2, tone: 'sun' },
      { text: 'Consolation draw means you never drive home after one match. Love that.', name: 'Ava J.', meta: 'Club Championship', avatar: 6 },
    ],
  },
  members: {
    title: 'What members text us after <em>joining</em>',
    items: [
      { text: 'Week one: booked Tuesday 7 PM two weeks out. Never got that slot as a guest.', name: 'Jordan P.', meta: 'Club member', avatar: 7 },
      { text: 'The desk matched me with three intermediate players. I have a standing Sunday game now.', name: 'Maya C.', meta: 'Weekday member', avatar: 10, tone: 'sun' },
      { text: 'Did the math. On the plan, every extra hour costs less.', name: 'Ethan R.', meta: 'Thu, 9:12 PM', avatar: 5 },
      { text: 'Family plan. My wife plays mornings, the kids take the academy, I get Saturdays. Everyone gets a slot.', name: 'Carlos V.', meta: 'Family member', avatar: 21, tone: 'clay' },
      { text: 'Froze my membership for six weeks after knee surgery. One message, done.', name: 'Ruth A.', meta: 'Member since 2024', avatar: 16 },
      { text: 'Member night: four courts, one coach rotating between them.', name: 'Noah B.', meta: 'Thu, 10:20 PM', avatar: 18, tone: 'sun' },
      { text: 'Brought my brother on a guest pass. He signed up the next morning.', name: 'Aisha M.', meta: 'Club member', avatar: 8 },
      { text: 'Racket restrung while I played. Picked it up at the desk on my way out.', name: 'Victor L.', meta: 'Sat, 6:40 PM', avatar: 9 },
    ],
  },
};
