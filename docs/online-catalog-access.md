# Онлайн-каталог для общего плеера Luma

**Статус:** проверены публичные страницы и документация. Доступ для Luma и полное воспроизведение через API ещё не подтверждены. Запросы ниже не отправлены.

Цель: полные записи нужных исполнителей в обычном **Поиске** Windows-версии Luma, рядом с текущими каталогами. Кнопки **Слушать онлайн** и **В очередь** работают в нижнем плеере, в том числе при свёрнутом окне, без платной подписки слушателя. Для проекта подходит только бесплатный официальный доступ к API. Не заменяем записи клипами, превью, ремиксами или переходами в браузер. Скачивание, офлайн-копии и изменение фонотеки у провайдера в эту задачу не входят.

## Что действительно добавляет полные записи сейчас

- **Audius — не Jamendo.** Поиск проверяет первые 36 кандидатов вместо 12, по-прежнему только с разрешённым публичным потоком, без превью и без скачивания. Пример за прежней границей: [выдача `ambient` с `offset=12`](https://api.audius.co/v1/tracks/search?query=ambient&app_name=Luma%20Player&limit=1&offset=12) вернула Ob_Sounds — «Ambient New Start #2» (`QVlxV`, 344 с, `access.stream=true`). [Официальный запрос потока](https://api.audius.co/v1/tracks/QVlxV/stream?app_name=Luma%20Player&no_redirect=true) вернул адрес полного медиа, не превью. Это проверка ответов API, не повторный живой прогон звука в Windows.
- **Jamendo v3** может находить то, чего нет в выдаче Openverse, но это тот же музыкальный каталог. Число уникальных дополнительных ID видно в **Поиск → Источники**, если прямой Jamendo настроен и ответили обе службы. Сравнение с настоящим Client ID ещё не выполнено; совпадения, дополнения и сохранение старых ссылок проверены на фикстурах.
- **Контрольный запрос «Руки Вверх — Я не отдам тебя никому».** [Audius](https://api.audius.co/v1/tracks/search?query=%D0%A0%D1%83%D0%BA%D0%B8%20%D0%92%D0%B2%D0%B5%D1%80%D1%85%20%D0%AF%20%D0%BD%D0%B5%20%D0%BE%D1%82%D0%B4%D0%B0%D0%BC%20%D1%82%D0%B5%D0%B1%D1%8F%20%D0%BD%D0%B8%D0%BA%D0%BE%D0%BC%D1%83&app_name=Luma%20Player&limit=5) дал пустой список, [Openverse](https://api.openverse.org/v1/audio/?q=%D0%A0%D1%83%D0%BA%D0%B8%20%D0%92%D0%B2%D0%B5%D1%80%D1%85%20%D0%AF%20%D0%BD%D0%B5%20%D0%BE%D1%82%D0%B4%D0%B0%D0%BC%20%D1%82%D0%B5%D0%B1%D1%8F%20%D0%BD%D0%B8%D0%BA%D0%BE%D0%BC%D1%83&source=jamendo,wikimedia_audio&page_size=10) — только ремикс DJ John, а лицензированный поиск Archive Netlabels по ключевым словам не дал совпадений. Это не подтверждение, что оригинала нет нигде, и не основание заменить его ремиксом или загрузкой от чужого аккаунта.
- Радио, Genius, ListenBrainz и Openwhyd не расширяют каталог записей по запросу. Наличие названия или ссылки не подтверждает право или техническую возможность проиграть оригинал.
- **Главная → VK Музыка** открывает официальный сайт в отдельной сессии; запрос можно явно передать в поиск на сайте. Это не Audio API и не каталог для общей очереди, поэтому результаты и ограничения остаются на стороне VK. [Как пользоваться](services-setup.md#vk-официальный-сайт-внутри-luma).

## Кому обратиться

- **Audiomack — первый кандидат.** На страницах треков есть [«Я не отдам тебя никому» (4:43)](https://audiomack.com/ruki-vverh/song/a-ne-otdam-teba-nikomu-1) и [«Если ты разлюбила» (4:54)](https://audiomack.com/ruki-vverh/song/esli-ty-razlubila-1) с альбома «Совсем без тормозов», ℗ ДЖЕМ. [Data API](https://audiomack.com/data-api/docs) документирует поиск и выдачу ссылки на поток перед воспроизведением, а не только превью; требуются реквизиты приложения. [Бесплатный режим с рекламой](https://audiomack.com/about/privacy-policy) относится к собственному сервису Audiomack, не гарантирует такой же режим в Luma. Отправить текст ниже на [support@audiomack.com](mailto:support@audiomack.com), попросить передать команде Data API или партнёрств. В качестве примера приложить ссылки на эти два трека.
- **SoundCloud — второй кандидат.** В [профиле «Руки Вверх»](https://soundcloud.com/ryki-vverh/sets/all-top-tracks) есть «Крошка моя», «Он тебя целует» и «18 мне уже». Публичная страница или виджет не подтверждают [разрешение API на конкретный трек](https://help.soundcloud.com/hc/en-us/articles/31423603670043-Manage-your-track-s-permissions-and-advanced-settings). [Условия API](https://developers.soundcloud.com/docs/api/terms-of-use#user-content) ограничивают объединение потоков с другими сервисами без явной лицензии. [Маршрут запроса](https://help.soundcloud.com/hc/en-us/articles/115003446727-API-usage-policies) указан в Help Center. Обычная [регистрация приложения требует Artist Pro](https://developers.soundcloud.com/docs/api/register-app). При условии бесплатных API подключение возможно только если SoundCloud предоставит подходящий доступ без этого платного тарифа.

## Текст запроса на английском

**Subject:** Luma — API access for full-track playback without a listener subscription

Hello,

I’m working on [Luma](https://github.com/JohnBirlich/VKX-Modded), an open-source Windows desktop player. Can we use your official API to search eligible recordings and play them in full, on demand, in Luma without requiring a paid subscription for the listener?

The proposed integration would clearly credit your service and link to the source. Audio would play in Luma’s player, including when the window is minimized. The same queue can contain the user’s own files and tracks from other authorized sources, played one at a time without mixing. We are not requesting downloads, offline copies, or use of any restricted tracks.

Could you confirm whether this use is permitted under a no-cost developer API tier and how to apply for access? Please let us know the eligible catalog and regions, any free-account requirements, required ad delivery and play reporting, attribution, and whether test access is available. If a separate agreement is needed, please point us to the right team. A link to the applicable terms and a secure registration process is enough; please do not send credentials by email.

Thank you!

## Проверка перед включением в сборку

1. Получить подтверждение именно на полный поток в общем плеере, очередь с другими источниками и работу при свёрнутом окне. Уточнить квоты, доступные регионы и условия бесплатного режима; ключи приложения не встраивать в установщик и не передавать в чате.
2. Проверить поиск по запросам «Руки Вверх» и «Руки Вверх — Я не отдам тебя никому»: совпадают исполнитель и версия записи, источник подписан. У соседнего ремикса отдельный результат. Наличие метаданных не считается проверкой потока.
3. На Windows без платной подписки запустить хотя бы две согласованные записи в нижнем плеере до конца, проверить перемотку, паузу и переход к следующему треку из другого источника при свёрнутом окне. Проверить отказ для недоступной записи: не подменять её непохожей версией или превью. Соблюсти требования провайдера к рекламе и отчётности.
4. Получать разрешённый поток только при воспроизведении. Не писать краткоживущие ссылки и ключи в очередь, профиль или журналы. Без согласованной конфигурации не добавлять источник в поиск. Существующие источники продолжают работать при сбое нового.
