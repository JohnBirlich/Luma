# Radio directory

The Russian directory follows the requested 96 stations and their order. The existing Record and SomaFM channels are listed separately, and the main Record station retains `radio-record-record`. The three Radio MIR entries and the two Maria stations are independent IDs and listening pages.

- Station identities and listening pages: [Индустриальный радиоплеер](https://radioplayer.ru/), [101.ru FM](https://101.ru/radio-fm), and [КИОН Музыка](https://music.mts.ru/radio). The `page` column points to a station listing, not a name search. The Far East and Ural feeds do not reuse the national feed. For Умное радио the AMG listing is kept separate from the unrelated Sarov station.
- The direct URLs are fixed broadcaster or CDN streams. Leads came from the station pages, [101.ru's public player metadata](https://101.ru/api/channel/getServers/780/channel/MP3/128/dataFormat/mobile), the [Radio Browser directory](https://www.radio-browser.info/) and the [community M3U listings](https://github.com/DmitrySandalov/iptv-playlists/blob/master/general/radio/ru.m3u). Luma does not request these directory APIs at runtime, spoof a browser origin, or proxy the audio.
- A station with a known listening page but without a confirmed direct stream is marked **В браузере**. That button opens the specified broadcaster or directory listening page. It does not start an in-app player or add a stream to the queue. This is also the fallback where the only known source is a web player or an HLS playlist. The listener's location and network can affect access even to confirmed direct streams.

## Playback verification

Dispatch the Windows build with `live_radio=true` on the commit under review. This checks the actual Electron renderer decoder and shipped Content Security Policy, including an audio clock advance from each direct URL. It does not record or save media; the only report is the status/URL and optional logo dimensions. A fixture-only test is not evidence that a station is live. If an outlet changes its source, first confirm the station/region and public HTTPS URL; keep its existing ID and listening page. If the replacement is not usable in the renderer, omit its `stream` field.

### Initial lineup verification

73 of the 96 stations have a direct URL that decoded in at least one of the Windows runs; 23 link to the listening page only. The 11 additional Record/SomaFM channels also decoded. The [first check](https://github.com/JohnBirlich/VKX-Modded/actions/runs/44916090618) and [replacement-source check](https://github.com/JohnBirlich/VKX-Modded/actions/runs/44916626589) deliberately failed their aggregate assertion when a candidate could not be decoded; failed candidates without a successful decode are not used. The central Zvezda feed decoded in the first check and timed out in the second, so availability can still vary. These runs do not certify playback from another region or network.
