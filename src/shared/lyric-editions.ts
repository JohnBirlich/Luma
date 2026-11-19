import { musicSearchKey } from './russian.js';

/** Public-domain editions, not recording matches. Keep author, edition and source intact. */
const editions = [
  {
    titles: ['Очи чёрные', 'Чёрные очи', 'Dark Eyes', 'Ochi Chyornye', 'Ochi Chernye'],
    author: 'Евгений Гребёнка · 1843',
    page: `https://ru.wikisource.org/wiki/${encodeURIComponent('Чёрные_очи_(Гребёнка)')}`,
    plain: `Очи черные, очи страстные!
Очи жгучие и прекрасные!
Как люблю я вас! Как боюсь я вас!
Знать увидел вас я в недобрый час!

Ох, недаром вы глубины темней!
Вижу траур в вас по душе моей,
Вижу пламя в вас я победное:
Сожжено на нем сердце бедное.

Но не грустен я, не печален я,
Утешительна мне судьба моя:
Всё, что лучшего в жизни Бог дал нам,
В жертву отдал я огневым глазам!`,
  },
  {
    titles: ['Auld Lang Syne'],
    author: 'Robert Burns · The Poetical Works (1887)',
    page: 'https://en.wikisource.org/wiki/The_Poetical_Works_of_Robert_Burns/Auld_Lang_Syne',
    plain: `Should auld acquaintance be forgot,
And never brought to min'?
Should auld acquaintance be forgot,
And days o' lang syne?

For auld lang syne, my dear,
For auld lang syne,
We'll tak a cup o' kindness yet,
For auld lang syne.

We twa hae run about the braes,
And pu'd the gowans fine,
But we've wander'd mony a weary foot
Sin auld lang syne.

We twa hae paidl't i' the burn,
From mornin sun till dine;
But seas between us braid hae roar'd
Sin auld lang syne.

And here's a hand, my trusty fiere,
And gie's a hand o' thine;
And we'll tak a right guid willie-waught,
For auld lang syne.

And surely ye'll be your pint-stowp,
And surely I'll be mine;
And we'll tak a cup o' kindness yet
For auld lang syne.`,
  },
  {
    titles: ['Amazing Grace', "Faith’s Review and Expectation"],
    author: 'John Newton · Olney Hymns (1840)',
    page: 'https://en.wikisource.org/wiki/Olney_Hymns_(1840)/Book_1/Hymn_41',
    plain: `Amazing grace! (how sweet the sound!)
That saved a wretch like me!
I once was lost, but now am found,—
Was blind, but now I see.

'Twas grace that taught my heart to fear,
And grace my fears relieved;
How precious did that grace appear
The hour I first believed!

Through many dangers, toils, and snares.
I have already come;
'Tis grace has brought me safe thus far,
And grace will lead me home.

The Lord has promised good to me,—
His word my hope secures;
He will my shield and portion be
As long as life endures.

Yes, when this flesh and heart shall fail,
And mortal life shall cease,
I shall possess, within the veil,
A life of joy and peace.

The earth shall soon dissolve like snow,
The sun forbear to shine;
But God, who call'd me here below,
Will be for ever mine.`,
  },
];
export const findLyricEdition = (title: string) => editions.find(({ titles }) => titles.some((name) => musicSearchKey(name) === musicSearchKey(title)));
export const isLyricEditionPage = (url: unknown): url is string => editions.some(({ page }) => page === url);
