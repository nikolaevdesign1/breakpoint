# Аудит текстов: было / стало (правка 27)

Статус: **на проверку, ничего не применено**. Предложения (колонка «Предлагается») только на английском, как будут на сайте. Единые значения и сюжет: `docs/content-bible.md`. Факты без подтверждения помечены **[?]** и собраны вопросами в конце.

Обозначения: «Сейчас» цитата с сайта (сокращено там, где длинно). Приоритет: **A** ломает правду или противоречит другому месту, **B** клише/слабый текст, **C** мелочь.

---

## 1. Home (`index.html`, `content.js`, `partials/*`)

| Где | Сейчас | Предлагается | Почему |
|---|---|---|---|
| A. Hero, чипы | Open 6 AM–11 PM | Weekdays 6 AM–11 PM | В выходные 7–22. «Open daily» неверно |
| B. Hero, h1 | Tennis club in Miami, Florida. | Slow tennis in Coconut Grove, Miami. **[?]** | Тема клуба из правки 27 и точное место вместо «tennis club in Miami» |
| B. Club, абзац | Break Point is a club for people who play after work. Book a court in under a minute, find a partner at your level, train with a coach who remembers last week, then cool off on the terrace. Sixteen courts, lit until 11 PM. | Break Point is a club for people who play after work. In 2016 Alexander Milevski wrote one page: watered clay, lights until eleven, a court booked in a minute. Sixteen courts, twenty coaches and nobody rushing you off the court. | Связывает главную с about, конкретика вместо списка из четырёх глаголов |
| A. Club, заметка Hours | 6 AM–11 PM, every court lit after dark | Weekdays 6 AM–11 PM, weekends 7 AM–10 PM. Every court is lit after dark. | Часы как в футере и контактах |
| C. Club, заметка Surfaces | ITF-grade, clay rebuilt every spring | Red clay laid by hand, rebuilt every spring **[?]** | «ITF-grade» не подтверждено, «laid by hand» совпадает с about |
| B. Club, заметка On site | Lockers, towels and 80 parking spaces | Showers, lockers and 80 free parking spaces | Конкретно, без «towels» (платные для гостей) |
| A. Club, заметка Clubhouse | Lounge and a terrace over Centre Court | Lounge, café and a terrace over Center Court | Кафе есть в сцене и нигде не названо, американское написание |
| C. Club, заметки | нет сада | On site: add "Kitchen garden behind the café" **[?]** | Сад есть в 3D, нет на сайте |
| A. Services, Clay | Six red clay courts, brushed and watered between every booking. Lit until 11 PM. | Six red clay courts, brushed and watered before every booking. Lit until closing. | Правило 03: игроки метут линии сами; «до закрытия» вместо 11 PM |
| A. Services, Padel | Four covered panoramic padel courts. Rackets and balls on loan at the front desk. | Four covered glass padel courts. Padel rackets and balls are free to borrow at the front desk. | Одно слово («glass») по всему сайту, «free» как в контактах |
| A. Services, Junior | Red, orange and green ball programs that lead into tournament squads. | Red, orange, green and yellow ball groups for ages 5 to 17. The best go on to the junior circuit. | В турнирах есть Yellow ball, лестница из четырёх |
| B. Services | нет карточки травы | New row. Name: Grass. Meta: 60–120 min. Desc: Two outdoor grass courts, Banyan and Royal Palm. Low bounce, long points. Price: from $62 / hour. CTA: Book grass. | 16 кортов, трава 2, в списке услуг её нет |
| C. Book banner, lead | Every court of the club on a live 3D map. Pick a free one, choose the hour, you’re on. | All sixteen courts on one live 3D map. Pick a free one, choose the hour, done. | «you’re on» двусмысленно |
| C. Coaches cloud | Twenty coaches. One of them is yours. | оставить | Работает, числа совпадают с данными |
| B. Community, lead | A live singles ladder, monthly club opens and Friday doubles nights. Members enter first; guests are welcome on most draws. | A singles ladder, Friday doubles and fourteen events in the next four months. Members enter first. Guests are welcome on most draws. | В календаре нет «monthly club opens», есть один Club Open |
| C. Gallery подписи | Junior open, July / Floodlit open, August | Junior Circuit, July / Night Singles, August | Названия как в календаре |
| B. Member partial, h2 | Become part of the club. | Join the club. | Клише «become part of» |
| B. Member partial, lead | Members get the good hours first, people to play with and a place to stay after the match. | Members book the evening hours first, get matched with players at their level and stay on the terrace after the match. | Конкретика вместо «good hours» |
| A. Member card | No. 0417 · since 2026 (на memberships: No. 0412) | No. 000412 · Member since 2026 | Формы просят 6 цифр, карточки показывают 4 и разные номера |
| A. Member perk | Lower court and coaching rates. Every extra hour and every lesson costs less than the drop-in price. | Lower rates. Club and Family save 20% on lessons and extra hours, Weekday 10% on lessons. | Скидки зависят от плана |
| B. Member perk | Member-only ladder and draws. ... draws that open to you before the public. | Ladder and early entry. Members apply a week before the public. | Совпадает с FAQ турниров |
| A. Member perk | Lounge and lockers. Keyless lockers, fresh towels and the terrace over Centre Court. | Lounge and lockers. Keyless lockers on Club and Family, a day locker on Weekday, fresh towels and the terrace over Center Court. | Шкафчик зависит от плана (таблица сравнения) |

### Pricing partial (главная и memberships)

| Где | Сейчас | Предлагается | Почему |
|---|---|---|---|
| B. Pay as you play | Book a free court when you feel like playing. | Book any free court up to three days ahead. | Конкретика вместо настроения |
| C. Weekday | For early mornings and lunch breaks before 4 PM. | For mornings and lunch hours, before 4 PM. | Короче |
| A. FAQ Pause | Monthly plans cancel any time before the next billing date. Annual plans can be paused for up to two months for travel or injury. | Monthly plans cancel any time before the next billing date. Weekday pauses for up to one month a year, Club and Family for up to two, for travel or injury. | Одинаково с таблицей и FAQ memberships |
| A. FAQ Partner | ...On Club, bring two guests a month: they pay the drop-in rate for their share. | ...On Club, bring two guests a month: they pay their share of the court rate. | Одна формулировка про гостей |

---

## 2. About (`about.html`)

| Где | Сейчас | Предлагается | Почему |
|---|---|---|---|
| A. Timeline 1998, title/text | Playing career. A scholarship took him to Florida State, where he captained the team. On tour he reached the ATP doubles top 400, playing Challengers on borrowed couches and cheap strings. | 1998, College: A scholarship took him to Florida State, where he captained the team. | Разнести колледж и тур, иначе нет места во времени **[?]** |
| A. Новая карточка | нет | 2002, On tour: Doubles Challengers on borrowed couches and cheap strings. He reached the ATP doubles top 400. **[?]** | Закрыть пропущенные годы |
| A. Timeline 2002 | Coaching. A wrist injury ended the tour years at 24. A week later he was coaching juniors in Miami... | 2004, Coaching: A wrist injury ended the tour at 24. A week later he was coaching juniors in Miami on public courts with cracked lines and lights that died mid-set. **[?]** | В 1988 ему 8, значит 24 года в 2004. Сейчас возраст и год не сходятся |
| A. Timeline 2019 | Two years and forty site visits later he found a lot in Coconut Grove... | Three years and forty site visits later he found a lot in Coconut Grove with old banyans, room for sixteen courts and a bus stop at the gate. He signed the lease that afternoon. | 2016 → 2019 это три года |
| C. Timeline 2021 | Then the indoor hall, the grass and the padel courts. | Then the indoor hall, the grass, the padel courts and the kitchen garden. **[?]** | Сад из сцены |
| C. Timeline Today | He still coaches mornings on Court 1 ... | He still coaches mornings on Court 1, Flamingo, and still picks up the club phone when the desk is busy. **[?]** | Связь с именами кортов booking |
| B. Rules, lead | Short, so everyone keeps them. Questions about a booking or a guest? Ask the front desk. | Six rules, kept short. Questions about a booking or a guest? Ask the front desk. | «so everyone keeps them» объясняет форму |
| C. Rule 03 | Brush the court. Sweep the lines in the last five minutes of your hour. | Brush the court. Use the brush in your last five minutes. We water the clay before the next booking. | Согласовано со Services, там «watered between every booking» |
| A. Rule 04 | Two guests a month. Members bring two guests a month; guests pay the drop-in rate. | Guests. Club and Family members bring two guests a month, Weekday members one. Guests pay their share of the court rate. | Weekday: один проход |
| A. Rule 06 | Lights out at 11. Last bookings start at 10 PM on weekdays, 9 PM on weekends. | Lights out at closing. Weekdays 11 PM, weekends 10 PM. Last bookings start an hour earlier. | Выходные закрываются в 22:00 |

---

## 3. Coaches (`coaches.html`, `coaches-data.js`)

| Где | Сейчас | Предлагается | Почему |
|---|---|---|---|
| C. H1, lead, фильтры | Find the coach who fits your game. / Twenty coaches for tennis and padel... | оставить (правка 23, заголовок остаётся) | Факты верны: 20 |
| A. Nina Petrova, played | Former WTA top 150, Fed Cup player | Former WTA top 150, Billie Jean King Cup player | Fed Cup переименован |
| A. Marcus Bell, played | ITF Futures player, University of Georgia | ITF World Tour player, University of Georgia | Futures переименован |
| A. Karim Haddad, played | Moroccan Davis Cup squad, ITF Futures | Moroccan Davis Cup squad, ITF World Tour | То же |
| C. Университеты и сборные в regalia | Barry University, Rollins College, UCLA, Nova Southeastern, Florida International University и др. | Оставить или заменить на нейтральное: "NCAA Division II All-American" **[?]** | Реальные организации в вымышленных биографиях |
| B. Alexander, отзыв Elena | He watches one rally and knows what you will do in the next ten. Worth every dollar. | He watches one rally and knows what you will do in the next ten. | Пустая похвала |
| C. Alexander, роль | Founder & head coach | Founder and head coach | Единое «and» в тексте, «&» только в коротких метках |
| A. Alexander, years | years: 24 | years: 22 (если принят 2004) **[?]** | Следует из хронологии |

---

## 4. Tournaments (`tournaments.html`, `tournaments-data.js`)

| Где | Сейчас | Предлагается | Почему |
|---|---|---|---|
| B. H1 | Amateur draws. Play for something. | Draws by years played, not by rating. | Конкретика, это правда страницы |
| B. Подзаголовок | Pick a weekend. Find your draw. | Fourteen events, four months. | Число берётся из данных |
| C. Lead | Fourteen amateur events over the next four months. Filter by how long you’ve played and your age, then pick a date. | оставить | Работает |
| A. Surface (junior-green) | Hard, outdoor | Hard, indoor | Все 4 хард-корта в зале |
| A. Surface (weekend-doubles) | Hard, outdoor | Hard, indoor | То же |
| A. Prize (friday-doubles) | Dinner at the lounge for the top pair | Dinner on the terrace for the top pair | Ужин на террасе, как в member night |
| C. Mixed Classic, Surface | Grass | оставить | Трава есть |
| A. Registration form, topic | Hi, I’d like to join the club ladder. My rating: (contact-form.js) | Hi, I’d like to join the club ladder. My level: | Уровень по годам игры, не рейтинг |
| C. FAQ rain | Clay matches move to the indoor hard courts. | оставить | Совпадает с memberships FAQ |

---

## 5. Memberships (`memberships.html`, `pricing.html`, `membership-compare.js`)

| Где | Сейчас | Предлагается | Почему |
|---|---|---|---|
| B. H1 | Book first. Pay less. Never play alone. | Book first. Pay less. Find a partner. | Убираем «Never play alone», обещание без гарантии |
| B. Lead | Members see the calendar two weeks ahead, save 20% on lessons and extra hours, and always have someone at their level to play with. Your first week is free. | Club and Family members see the calendar fourteen days ahead, save 20% on lessons and extra hours, and get matched with players at their level. The first week is free. | Weekday 7 дней и 10%; «always» не гарантия |
| A. Число | −20% on coaching and extra court hours | −20% on coaching and extra hours (Club, Family) | Не у всех планов |
| B. Заголовок плана | Pick how often you play. | Four plans. | Заголовок-раздатка |
| A. Лид плана | Three plans and a free one. Switch or freeze any month, save 15% when you pay for the year. | Pay as you play, or pick Weekday, Club or Family. Switch from the next billing date. Pay for the year and save 15%. | «Freeze any month» противоречит лимитам заморозки |
| B. Заголовок сравнения | Every privilege, line by line. | Compare the plans. | Заголовок-раздатка |
| B. Заголовок преимуществ | What changes when you join. | What members get. | Проще |
| A. Карточка 14 days | The calendar opens to members fourteen days out. Guests see three. Tuesday at 7 PM is yours first. | Club and Family members see the calendar fourteen days out, Weekday seven, guests three. Tuesday at 7 PM is yours first. | Weekday: 7 дней |
| A. Карточка Guest passes | Bring a friend twice a month. They pay their share of the court, not a membership. | Club and Family bring a friend twice a month, Weekday once. They pay their share of the court, not a membership. | Один проход в Weekday |
| A. Карточка Lounge | Espresso from the first court, cold towels after the last, and a terrace over Centre Court in between. | Espresso from the first court, cold towels after the last, and a café and terrace over Center Court in between. | Американское написание, кафе |
| C. Карточка Member nights | ...dinner on the terrace after. | оставить, **[?]** кто готовит ужин | Конкретно, но кухня не описана |
| B. Заголовок шагов | Three steps to your first match. | How it starts. | Формула «N steps to X» |
| B. Заголовок формы | Your card, two minutes away. | Start your free week. | Обещание «two minutes» без основания |
| C. Подтверждение | Welcome in, friend. (запасное слово, подставляется имя) | Запасное слово: "you". Итог: Welcome in, Maya. | Запасное «friend» шаблонно |
| A. FAQ Freeze | Weekday freezes up to a month a year, Club and Family for up to two... | оставить | Эталонная формулировка |
| A. FAQ Free week | For seven days you play as a full member... | оставить | Конкретно |

### Таблица сравнения (проверка)
Значения совпадают с эталоном (см. bible, раздел 4). Исправить ссылки в тексте на `Towels $3 each` (есть) и на `Racket restringing` (есть). **[?]** Подтвердить арифметику плана (вопрос 4).

---

## 6. Contacts (`contacts.html`, `contact-form.js`)

| Где | Сейчас | Предлагается | Почему |
|---|---|---|---|
| B. H1 | Come play. | Gate B, Coconut Grove. | Адрес вместо призыва без смысла |
| A. Подпись | Open daily, 6 AM–11 PM | Weekdays 6 AM–11 PM, weekends 7 AM–10 PM | Часы в выходные другие |
| A. Дорога | Ten minutes from Brickell, five from the Grove. | Ten minutes from Brickell, a short walk from the Grove's main street. **[?]** | Клуб в Coconut Grove |
| C. Rail | Metrorail to Coconut Grove station, then a twelve-minute walk down 27th Avenue. | Проверить время пешком до Bayshore Drive **[?]** | Реальное расстояние больше |
| A. Hours | Last booking an hour before close. The lounge opens with the first court. | оставить | Верно |
| B. Social | Instagram / WhatsApp / YouTube | Instagram, YouTube, WhatsApp | Единый набор по сайту |
| B. Подтверждение | Thanks, friend. Your message is with the front desk. We reply within one business day, usually much sooner. | Thanks, Maya. Your message is with the front desk. We reply within one business day. | Запасное «friend», «usually much sooner» не обещаем |
| A. FAQ Membership | No. Anyone can book a court at the drop-in rate up to three days ahead. Members book up to fourteen days ahead and save 20%. | No. Anyone can book at the drop-in rate up to three days ahead. Club and Family members book fourteen days ahead, Weekday seven. | Окно и скидка зависят от плана |
| A. FAQ Rackets | Padel rackets and balls are free to borrow. Tennis demo rackets are $10 per session and a can of balls is $6 at the desk. | Padel rackets and balls are free to borrow. Tennis demo rackets are $10 per session and a can of balls is $8 at the desk. | $8 в booking |
| A. FAQ Guest | Members can bring two guests a month. Guests pay the drop-in court rate and sign a waiver at the desk. | Club and Family members bring two guests a month, Weekday one. Guests pay their share of the court rate and sign a waiver at the desk. | План и формулировка |
| C. FAQ целиком | 6 вопросов | Убрать со страницы (правка 14), перенести: shoes → about rule 02, rain → memberships FAQ, rackets → pricing FAQ, events → форма | Не терять факты |
| A. Placeholder телефона | +1 305 555 0142 (в формах) | +1 305 555 0100 | Совпадает с номером клуба |
| B. Тема-шаблон | Hi, I’d like to join the club ladder. My rating: | Hi, I’d like to join the club ladder. My level: | Годы игры |

---

## 7. Меню и футер (`nav.html`, `footer.html`)

| Где | Сейчас | Предлагается | Почему |
|---|---|---|---|
| A. Nav, соцсети | Instagram, YouTube, TikTok | Instagram, YouTube, WhatsApp | Совпадает с контактами |
| B. Footer, CTA | Your court is waiting. | Book a court for tonight. | Клише CTA |
| C. Footer, кредит | Created in uixcorp.com | Created by uixcorp.com | Грамматика |
| A. Footer, ссылки | Privacy Policy, Terms of Service, Cookie Policy ведут на # | Создать страницы или убрать ссылки **[?]** | Мёртвые ссылки |
| C. Cookies | We use cookies to see how the site plays: which pages get booked and where people get lost. Nothing sinister, no third-party ads. | We use cookies to see which pages get booked and where people get stuck. No third-party ads. | Шутка не нужна |

---

## 8. Booking (`booking.html`, `src/js/booking/*`)

| Где | Сейчас | Предлагается | Почему |
|---|---|---|---|
| A. Часы слотов | HOURS = 8 до 20 (availability.js) | Слоты с 6 до 22 по будням, 7 до 21 по выходным | Клуб открыт 6–23 / 7–22, последняя бронь за час до закрытия |
| A. Rental rackets | $10 each | Tennis rental rackets $10 each. Padel rackets are free. | Одно правило с контактами **[?]** |
| A. Coach for the session | +$60 / hour | Hitting partner +$60 / hour **[?]** | Иначе конфликт с $120–220 за тренера |
| A. New can | +$8 | оставить $8 | Контакты приводятся к $8 |
| A. Member price | 20% off court time для любой карты | Скидка по плану или переписать план Weekday **[?]** | Weekday не имеет скидки на корты |
| A. Policy | Free cancellation up to 24 hours before. Later cancellations are charged in full. | Free cancellation up to 24 hours before. Later cancellations are charged unless we rebook the court. **[?]** | About говорит «unless the court is rebooked» |
| A. Need a partner, levels | 3.0, 3.5, 4.0, 4.5 | Years played, как в турнирах, или подпись "NTRP" **[?]** | Две системы уровней на сайте |
| A. Member card | Member card, 6 digits | 6 digits везде, пример с 6 цифрами | Сайт показывает 4 цифры |
| C. Places, towels | Towels at the front desk, free for members | оставить | Совпадает с compare |
| C. Places, parking | Free for players ... 2 min walk to the courts (дважды) | убрать дубль note | Повтор |
| C. Cat | Catch the cat on the map for a 10% code. | оставить | Работает |
| C. Confirmation | You’re on court. | оставить | Коротко, по делу |

---

## 9. Отзывы (`reviews-data.js`)

| Где | Сейчас | Предлагается | Почему |
|---|---|---|---|
| B. Home, Marcus T. | Booked court 4 for 9 PM on a Tuesday. Lights on, clay watered, nobody waiting. Perfect. | Booked Guava for 9 PM on a Tuesday. Lights on, clay watered, nobody waiting. | Убрать «Perfect», использовать имя корта |
| A. Home, Diego M. | Padel at 7, tacos at 9. Best Friday plan in Miami. | Padel at 7, a smoothie at the café at 9. Friday sorted. (meta: Fri, 9:48 PM) | Меню кафе, клуб закрыт после 23:00 |
| A. Home, Lena V. | Warm towels after a 95° hour. Who does that. | A cold towel after a 95° hour. Nobody asked for it. | Холодные полотенца по memberships |
| A. Coaching, Omar S. | Daniel filmed my forehand and showed me the exact frame where it breaks. Fixed in two sessions. | Kevin filmed my forehand and showed me the exact frame where it breaks. Fixed in two sessions. | Daniel ведёт только детей, видео у Kevin |
| A. Coaching, Robert H. | I’m 58 and Alexander coaches me like I’m going to Wimbledon... (в данных Lena тоже Robert, 58) | Rename: Roy H. | Дубль человека у двух тренеров |
| A. Members, Ethan R. | Did the math: the plan paid for itself by the second lesson. | Did the math: Club comes to $15.75 a court hour. I used to pay $64 at peak. **[?]** | Старая фраза не следует из цен; арифметика из вопроса 4 |
| A. Members, Noah B. | Thu, 11:20 PM | Thu, 10:20 PM | Время после закрытия |
| A. Tournaments, Paul M. | Lines judged fair, balls new every set, coffee free. Proper event. | Lines judged fair, balls new every set, fruit at the referee’s desk. | Кофе бесплатно нигде не обещано |
| C. Tournaments, Ivan K. | Draw was online by Thursday, order of play by Friday. | оставить | Согласуется с FAQ примерно |
| C. Все | Best Thursday of the month, Best Friday plan, Perfect, Worth every dollar | Заменить конкретикой по одному | Пустые похвалы |
| C. Имена | Priya (2), Marcus (2), Elena (2) | Развести или оставить как совпадения | Мелочь |

---

## 10. Что дальше

1. Подтвердить «библию» (хронология, часы, цены, формулы).
2. После подтверждения применить правки одним проходом: сначала данные (`content.js`, `tournaments-data.js`, `reviews-data.js`, `coaches-data.js`, `membership-compare.js`, `availability.js`), затем HTML.
3. Проверить: `rg "Centre"`, `rg "friend"`, `rg "—"`, `rg "\$6"`, `rg "six digits|6 digits"`.

---

## Вопросы пользователю (по приоритету)

1. **Даты Alexander.** Родился в 1980? Колледж 1998–2002, тур 2002–2004, травма в 24 года в 2004, тренер с 2004 (тогда у него 22 года тренерского стажа вместо 24)? Идея 2016, участок 2019 (три года), открытие в субботу в марте 2022, 200 гостей. Что из этого верно, что поменять?
2. **«Slow tennis».** Использовать как явный девиз (hero, about) или только как тон текстов? Если девиз, одна формулировка на английском?
3. **Часы.** Подтвердить: Пн–Пт 6 AM–11 PM, Сб–Вс 7 AM–10 PM, последняя бронь за час до закрытия. Часы кафе (7 AM–10 PM) и pro shop (8 AM–8 PM) верны и в выходные? Слоты в booking расширяем до 6 AM–10 PM?
4. **Цены тарифов.** 12 часов корта за $189 это $15.75 за час при обычных $48–$80. Weekday: $16.50 за час, Family: $17.45. Это задумано? Если нет, какие цены и количество часов?
5. **Скидка в booking.** 20% на корт получает любой с картой. Оставить так (и дописать «20% off extra hours» в Weekday) или привязать к плану?
6. **Отмена брони.** Бесплатно за 24 часа, позже платная «unless the court is rebooked» (about) или «in full» (booking)?
7. **Кафе и сад.** Кафе и кухонный сад (оранжерея) реальные части клуба? Что подают, кто готовит ужин в четверг, связан ли сад с кафе? Показываем ли их на сайте?
8. **Названия кортов.** Использовать на сайте имена (Flamingo, Hibiscus, Banyan и т. д.)? Какой корт «Court 1» и какой «Center Court»?
9. **Дополнения booking.** Мяч $8 (контакты $6), падел-ракетки бесплатно, полотенце $3 гостям, «Coach for the session +$60» переименовать в hitting partner?
10. **Лестница и «monthly club opens».** Клубная лестница существует? Добавить события ladder в календарь или убрать упоминания?
11. **Контакты.** Номер, почта, адрес, время от Brickell и пешком от Metrorail настоящие или заглушки? Соцсети: Instagram, YouTube, WhatsApp, нужен ли TikTok?
12. **Тренеры и юридические страницы.** Оставить реальные университеты и турнирные регалии или обезличить? Нужны ли страницы Privacy, Terms, Cookie Policy (сейчас ссылки на #)? Уровни в «Need a partner» оставить в NTRP или перейти на годы игры?

---

## Применено (2026-10-28, нейтральные формулировки)

Пользователь не ответил на 12 вопросов и сказал «Ставь нейтральные формулировки». Правила: часы Пн–Пт 6 AM–11 PM, Сб–Вс 7 AM–10 PM; ответ «the same day»; числа берутся из данных (membership-compare.js, content.js), иначе без цифр; без реальных вузов и профстатусов; без ладдера, TikTok, меню кафе, полотенец. Разметка и дизайн не менялись. Слоты booking (availability.js) не тронуты.

| Где | Было | Стало |
|---|---|---|
| content.js, Clay | brushed and watered between every booking. Lit until 11 PM. | brushed and watered between bookings. Lit after dark. |
| content.js, Padel | covered panoramic padel courts | covered glass padel courts |
| content.js, Junior | Red, orange and green ball programs that lead into tournament squads | Red, orange, green and yellow ball groups that lead into the junior circuit |
| index.html, meta | play the club ladder | play in club tournaments |
| index.html, gallery | Spring ladder final / Junior open / Floodlit open | Spring singles final / Junior Circuit / Night Singles (подпись, alt, aria) |
| index.html, community | Friday night doubles, club opens and ... | Friday Night Doubles, the Club Open and ... |
| about.html, письмо | lights until eleven | lights until closing |
| about.html, rules | Short, so everyone keeps them. | Six rules, kept short. |
| about.html, rule 01 | Later cancellations are charged, unless the court is rebooked. | Later cancellations may be charged. |
| about.html, rule 04 | Two guests a month / pay the drop-in rate | Guest passes / guests pay their share of the court |
| about.html, rule 06 | Lights out at 11 / last bookings 10 PM, 9 PM | Lights out at closing / Weekdays 11 PM, weekends 10 PM, last booking an hour earlier |
| contacts.html, статус | Open daily, 6 AM–11 PM | Weekdays 6 AM–11 PM (дальше подставляет club-hours.js) |
| contacts.html, форма (3 места) | We reply within 2 hours / 2 hours / Usual reply time | We reply the same day / Same day |
| contacts.html, подтверждение | Thanks, friend. | Thanks, you. (подставляется имя) |
| contacts.html, адрес | Ten minutes from Brickell, five from the Grove. | Ten minutes from Brickell. |
| map-routes.js | valet for members on weekends; racks by the lounge | Free parking at gate B; bike racks at gate B |
| memberships.html, lead | two weeks ahead, save 20% ..., always have someone | further ahead, pay less for lessons and extra hours, have someone |
| memberships.html, факты | Booking window for members; 20% off lessons and extra hours | Booking window on Club and Family; Off lessons on the Club plan |
| memberships.html, Member nights | dinner on the terrace after | убрано |
| memberships.html, Lounge | Espresso ..., terrace over Centre Court | A lounge that opens with the first court and a terrace over the main court |
| memberships.html, шаг Play | The calendar is yours fourteen days ahead | Club and Family see the calendar fourteen days ahead |
| memberships.html + membership-apply.js | within one business day | the same day; запасное «friend» → «you» |
| pricing.html | Balls and towels at the desk; Club ladder and member nights; Annual plans paused up to two months; bring two guests, drop-in rate | Balls at the desk; Member nights and early entry to draws; Weekday 1 month, Club and Family 2; Club and Family two guests, pay their share |
| member.html | Member-only ladder and draws; fresh towels; Centre Court | Member nights and early draws; убрано; the main court |
| member-card.html, member-scene.js | Ladder Rank 12; Singles ladder | Draws Early entry; Member draw |
| membership-compare.js | строка Towels; Ladder and member draws | строка убрана; Member draws |
| footer.html | Open every day, lit until 11 PM; Privacy/Terms/Cookie Policy на # | Every court is lit after dark; ссылки на privacy.html, terms.html, cookies.html |
| nav.html | Instagram, YouTube, TikTok | Instagram, YouTube |
| cookies.js | where people get lost. Nothing sinister, no third-party ads. Cookie Policy (#) | where people get stuck. No third-party ads. ссылка на /cookies.html |
| tournaments-data.js | Hard, outdoor (2 события); club towel; dinner at the lounge; champagne; dinner for two | Hard, indoor; медали; A club prize for the top pair; Trophies and the club plate; Trophies and a club prize |
| tournaments.html, FAQ | New balls, towels and fruit | New balls |
| tournament-apply.js | send the draw ... within 24 hours | без срока |
| contact-form.js | join the club ladder. My rating: | join a tournament. My level: |
| coaches-data.js, played (20 тренеров) | WTA, ATP, NCAA, Fed Cup, ITF Futures, FIP, Florida State, UCLA, Barry, Rollins и др. | нейтрально: Former college player, Certified coach, Former junior national player и т. п. |
| coaches-data.js, Alexander | Founder & head coach; ATP doubles top 400, captain at Florida State | Founder and head coach; Founder of the club, coaching for over twenty years |
| coaches-data.js, отзывы | Worth every dollar; Elena, club ladder #3 | убрано; Elena, club member |
| reviews-data.js | Perfect; court 4; tacos/smoothie; cold towels (3); Robert H. (дубль); ladder group; coffee free; plan paid for itself; Nobody fights; dinner on the terrace; 11:20 PM | нейтральные версии без меню, полотенец, ладдера и пустых похвал; Roy H.; Thu, 10:20 PM |
| privacy.html, terms.html, cookies.html (новые) | ссылки на # | короткие страницы-заглушки в стиле rules (page-legal.css, pages/legal.js), добавлены в vite.config.js |

Проверка: `npm run build` проходит; 0 ошибок консоли на index, about, coaches, tournaments, memberships, contacts, privacy, terms, cookies (1440, без горизонтального скролла). Grep по Fed Cup, Futures, NCAA, WTA, ATP, Florida State, TikTok, Centre Court, 2 hours, business day, Hard outdoor: чисто по сайту; «ladder» остался только в booking (фича локальная) и в CSS-классах.

### Остались спорные места для пользователя

1. Хронология Alexander не выведена на сайт (даты убраны); «coaching for over twenty years» и years: 24 в coaches-data.js нужно подтвердить.
2. Booking: слоты 8–20 против часов клуба 6–23 / 7–22 (availability.js не менялся); скидка 20% на корт у любой карты против плана Weekday; мяч $8 против контактов; ракетки $10 против «padel rackets are free» (contacts FAQ ещё в старой редакции, если он остался); тренер +$60; отмена «in full» против «may be charged»; уровни NTRP; ladder в booking. Тексты booking не правились.
3. Названия событий в календаре и gallery главной (Spring singles final, Doubles night, Friday mixer) придуманы и не подтверждены.
4. Призы и взносы турниров ($300–$1,000 credit, pro shop credit) в данных не подтверждены.
5. Арифметика планов ($189 за 12 часов) не согласована; тексты написаны без цен за час.
6. Реальные номер, почта, адрес, Instagram/YouTube-ссылки (сейчас # и 555).
7. Тексты privacy/terms/cookies короткие и не юридические: нужен юрист перед запуском.
8. Заголовки-клише из раздела 7 библии («Never play alone», «Come play», «Your court is waiting» и др.) не менялись, так как правила выбора их не покрывали.

---

## Применено (2026-10-28, расхождения booking и сайта, единый модуль фактов)

Источник истины: `src/js/shared/club-facts.js` (контакты, часы, цены кортов, дополнения, планы и скидки, отмена, уровни). Скрипты импортируют модуль; статичный HTML читает его через токены `{{fact:ключ}}`, которые подставляет `vite.config.js` (dev и build). Неизвестный токен ломает сборку.

### Инвентаризация расхождений и единые значения

| Что | Где расходилось | Стало |
|---|---|---|
| Часы слотов | availability.js `HOURS` 8-20; клуб 6-23 / 7-22 | Старты 6-22 по будням, 7-21 по выходным (`OPEN` в club-facts). `isOpenHour(dayKey, hour)`; закрытые часы читаются как занятые. Полоса часов в HUD строится из часов дня (17 плиток, 3 ряда), шкала в доке и баннер «Pick a court» читают те же часы. Ночью 21-22 доступны, на кортах свет |
| Скидка на корт | booking: 20% любому с картой; сайт: по плану | Правило плана: `PLAN.*.courtOff` (Club и Family 20% на часы сверх плана, Weekday и гости 0). Поле «Club member» теперь No / Weekday / Club / Family, строка итога «Club plan, −20%». Таблица сравнения получила строку «Extra court hours» |
| Мяч | $6 (контакты) и $8 (booking) | `ADDONS.balls` = $8 |
| Ракетки | $10 на любом корте и «padel rackets are free» | Теннис $10, падел 0 (`racketPrice`); стартовый набор со скидкой $4 только на теннисе |
| Тренер | «+$60 / hour» против $120-220 | Не доплата: «Add a coach, $120-220, billed by the coach» (`COACH_RATE`), в итог не входит, в билете «coach (billed by the coach)» |
| Отмена | «charged in full» / «may be charged» / «unless rebooked» | `CANCEL`: «Free cancellation up to 24 hours before; later cancellations may be charged.» (booking, terms, about rule 01, подсказка о дожде) |
| Уровни | 3.0-4.5 без объяснений | Beginner / Intermediate / Advanced (`LEVELS`, `levelLabel`); число остаётся внутренним (level 3.5). Флаги «Partner wanted · Intermediate», open play, ticket, отзывы и тренеры без цифр |
| Цены планов, окна, гости, заморозка, −15% | pricing.html, memberships.html, membership-compare.js, pricing.js | Все из `PLAN`, `ANNUAL_OFF`, `ROLLOVER_HOURS`, `JUNIOR_EXTRA` |
| Цены кортов и услуг | content.js, booking, баннер | `RATES`, `COACH_RATE`, `GROUP_LESSON`, `ACADEMY_MONTH`; content.js реэкспортирует |
| Телефон, почта, WhatsApp | footer, nav, contacts, формы, 555 | Одна константа `CONTACT` (заглушка, заменить в одном месте) |
| Часы в тексте | footer, nav, contacts, about rule 06 | Токены `hours.weekday`, `hours.weekend` |

### Непроверенные факты

| Было | Стало |
|---|---|
| Alexander `years: 24`, «coaching for over twenty years» | Без стажа и цифр |
| Призы $300, $500, $750, $1,000 | «A prize pool», «A prize for the winner», трофеи и медали без сумм |
| Названия событий в галерее главной | Типы: Club Open, Doubles night, Mixed doubles, Junior Circuit, Evening singles, Club Championship |
| Телефон +1 (305) 555-0142 и hello@breakpoint.club | Оставлены как есть, вынесены в `CONTACT` |

### Заголовки-клише: было / стало

| Где | Было | Стало |
|---|---|---|
| memberships H1 | Book first. Pay less. Never play alone. | Book first. Pay less. Stay longer. |
| memberships, планы | Pick how often you play. | Four plans. |
| memberships, сравнение | Every privilege, line by line. | Compare the plans. |
| memberships, перки | What changes when you join. | What members get. |
| memberships, шаги | Three steps to your first match. | How it starts. |
| memberships, форма | Your card, two minutes away. | Start your free week. |
| member partial | Become part of the club. | Join the club. |
| footer | Your court is waiting. | Book a court for tonight. |
| contacts H1 | Come play. | Gate B, Coconut Grove. |
| tournaments H1 | Amateur draws. Play for something. | Draws by years played. |
| tournaments, календарь | Pick a weekend. Find your draw. | Fourteen events, four months. |

Заголовок coaches («Find the coach who fits your game») оставлен по правке 23.

### Что осталось
- Life-модули (`booking/life/*`, не трогались) знают только `HOURS` и `isSlotTaken`: в выходные в 6:00 и 22:00 корты для них «заняты», возможны игроки до открытия. Нужен `isOpenHour` в rallies, padel, lessons.
- Арифметика планов ($189 за 12 часов), скидка «extra hours» для Family и сам список планов в booking требуют подтверждения.

---

## Применено (2026-10-28, раунд 10: единый модуль фактов)

Источник правды: `src/js/shared/club-facts.js` (контакты, часы, ставки кортов, дополнения, планы и скидки, отмена, уровни игроков). Скрипты импортируют его; статический HTML читает через токены `{{fact:ключ}}`, которые подставляет `vite.config.js` на dev и build (неизвестный ключ роняет сборку).

### Инвентаризация расхождений и единое значение

| Что | Где было | Стало |
|---|---|---|
| Часы слотов | availability.js HOURS 8-20; club-hours.js свой HOURS; тексты в footer, nav, contacts | club-facts.js OPEN: будни 6-23, выходные 7-22. Старты 6-22 / 7-21, закрытые часы в availability.js читаются как занятые; HUD рисует только часы дня; шкала дока, баннер «Pick a court» (16-22, горизонтальная прокрутка) читают те же часы |
| Скидка на корт | booking: 20% любому с картой; сайт: у плана Weekday скидки нет | По плану: Club и Family 20% на часы сверх плана, Weekday и гости 0. В booking выбор плана (No / Weekday / Club / Family) + карта; строка в итоге «Club plan, −20%». Новая строка «Extra court hours» в таблице сравнения |
| Мяч, ракетки | booking $8 / $10 всем кортам, на сайте «rackets on loan» | Банка $8 везде; теннисная ракетка $10, падел-ракетки бесплатно (в booking «Padel rackets are free», starter kit для падела без скидки) |
| Тренер | booking «Coach for the session +$60 / hour» против $120–220 | «Add a coach: $120–220, billed by the coach»: в итог не входит, тренер оплачивается по своему тарифу сверх корта. Диапазон в COACH_RATE |
| Отмена | booking «charged in full»; about, terms, HUD по-разному | Одна строка: «Free cancellation up to 24 hours before; later cancellations may be charged.» (booking, terms, about rule 01, подсказка про дождь) |
| Уровни | booking 3.0–4.5 подписями; отзывы «3.5 player»; перк «3.5» на memberships | Подписи Beginner / Intermediate / Advanced; число остаётся внутренним (`level 3.5`), флаги «Partner wanted · Intermediate»; отзывы словами; перк «All levels» |
| Цены планов, окна, гости, заморозка, −15% | pricing.html, memberships.html, membership-compare.js, pricing.js | Всё из PLAN / ANNUAL_OFF club-facts.js (токены и импорты) |
| Цены кортов и услуг | content.js дублировал 56/48/40/120/45/280 | content.js берёт из club-facts.js |
| Телефон и почта (заглушки 555) | footer, nav, contacts, формы | Один объект CONTACT в club-facts.js: заменить там, остальное подтянется. Пример телефона в формах теперь отдельное поле phoneExample |

### Непроверенные факты

| Было | Стало |
|---|---|
| Alexander `years: 24`, «coaching for over twenty years» | Стаж убран; в профиле нет строки «years coaching» у тренера без данных; роль «Founder of the club» |
| Призы $500 pro shop credit, $300, $1,000, $750 | «A prize pool for the winner», «A prize for the winner», «Your name on the board and a prize pool», «A prize pool and the grass trophy» |
| Галерея главной: Spring singles final / Friday mixer / Night Singles / Club championship | Club Open / Mixed doubles / Evening singles / Club Championship (Doubles night, Junior Circuit без изменений) |

### Заголовки-клише: было / стало

| Где | Было | Стало |
|---|---|---|
| memberships H1 | Never play alone. | Book first. Pay less. Stay longer. |
| memberships h2 план | Pick how often you play. | Four plans. |
| memberships h2 сравнение | Every privilege, line by line. | Compare the plans. |
| memberships h2 перки | What changes when you join. | What members get. |
| memberships h2 шаги | Three steps to your first match. | How it starts. |
| memberships h2 форма | Your card, two minutes away. | Start your free week. |
| contacts H1 | Come play. | Gate B, Coconut Grove. |
| footer | Your court is waiting. | Book a court for tonight. |
| coaches H1 | Find the coach who fits your game. | Tennis and padel coaches. |
| tournaments H1 | Amateur draws. Play for something. | Draws by years played. |
| tournaments h2 | Pick a weekend. Find your draw. | Fourteen events, four months. |
| member partial | Become part of the club. | Join the club. |

«Slow tennis» лозунгом не названо.

Проверка: `npm run build` проходит; 0 ошибок консоли на index, memberships, contacts, about, coaches, tournaments, booking (1440 и 390), без горизонтального скролла. Дев-хук three.js `isReady` на booking в headless (swiftshader) периодически падает независимо от правок. Расчёт цен через priceOf сверен с RATES.

### Что осталось для пользователя
1. Реальные телефон и почта: `CONTACT` в club-facts.js.
2. Скидка Family на часы сверх плана 20% принята по аналогии с Club, подтвердить.
3. Players/life (чужая зона): life-системы используют `isSlotTaken` и `HOURS`; в субботу и воскресенье в 6:00 и 22:00 (клуб закрыт) корты читаются как занятые, лучше добавить проверку `isOpenHour` из availability.js.
