/**
 * Completely made-up "agency intelligence" about the recipient. A few entries
 * are picked per name with a seeded generator, so the same person always gets
 * the same facts no matter who opens the file or how often.
 */
const OUTRAGEOUS_FACTS = [
    'Tuumapomme kahjutuks tehtud: 7',
    'Pikim hüpe elektritõukerattaga: 67 meetrit',
    'Päikesetõuse nähtud Marsil: 2',
    'Maailmameistritiitleid lusikaga söömises: 4',
    'Keskmine kiirus hommikusöögil: 185 km/h',
    'Keeli räägib soravalt: 23 (sh delfiini keel)',
    'Suurim väljakannatatud ülekoormus: 12 G',
    'Põgenemisi lootusetust olukorrast: 31',
    'Jõuluvanaga sõlmitud salalepinguid: 3',
    'Vihmavarje avatud vabalangemisel: 11',
    'Aastaid mägedes vaikides elatud: 4',
    'Maailmarekordeid, mida keegi ei tunnista: 9',
    'Krokodille taltsutatud: 6',
    'Hinge kinni hoitud vee all: 740 sekundit',
    'Tiibadeta lennatud: 28 meetrit',
    'Kordi jäljetult kadunud: 14',
    'Salajasi retsepte peas: 12',
    'Vulkaane maha rahustatud: 2',
    'Lugemiskiirus: 4100 sõna minutis',
    'Piparkooke ühe hingetõmbega söödud: 56',
    'Tunde järjest tantsitud: 73',
    'Kommikarpe üle piiri toimetatud: 312',
    'Kõrgeim tipp, kuhu sokkides tõustud: 5640 m',
    'Puid ühe ööga istutatud: 2200',
    'Karusid maadluses võidetud: 5',
    'Jäälõhkujaid käsitsi lahti lükatud: 1',
    'Piknikke peetud tornaados: 3',
    'Paberlennukitega maandumisi: 2',
    'Kaotatud kindaid tagasi toodud: 1480',
    'Malepartiisid võidetud silmad ja kõrvad kinni: 88',
    'Kaamelite võidusõite võidetud: 3',
    'Rahvusvahelisi piire ületatud saanisõiduga: 17',
    'Päästetud kassipoegi puu otsast: 204',
    'Kõige pikem kulmukortsutus: 9 tundi 40 minutit',
    'Lõhutud lukke lihtsalt vaadates: 41',
    'Sukeldumisi Titanicule: 2 (teisel korral unustas midagi)',
    'Vanaemade kudumisvõistlusi võidetud: 5',
    'Pikim telefonikõne: 6 päeva 3 tundi',
    'Jäätist söödud ilma külmavärinateta: 48 pallikest',
    'Välgulööke, millega on sõbraks saadud: 3',
    'Kirjutatud ülestunnistusi, mis on hiljem tagasi võetud: 12',
    'Lumememmi ehitatud juulis: 27',
    'Kiirusrekordeid rulluiskudel allamäge: 4',
    'Jalanõusid pingi all peidetud, mida keegi pole leidnud: 19',
    'Räägib põhjapõdra keelt: jah, aktsendiga',
    'Pingviine õpetanud lendama: 1 (osaliselt)',
    'Tornikellasid käsitsi tagasi keeratud: 8',
    'Eksimatu suunataju: pimedas 100% juhtudest',
    'Päevi ilma une ja kohvita: 11',
    'Avastatud saari, mis on hiljem kaardilt kadunud: 2',
    'Parkimisaparaate ainult naeratusega võidetud: 63',
    'Pannkooke korraga õhus hoitud: 14',
    'Loobutud rahvusvahelistest preemiatest: 7',
    'Hundikarju, kes teda ülemaks peavad: 2',
    'Allkirju antud nii, et pastakas ei puudutanud paberit: 300+',
    'Kuu kaugus mõõdetud sammudega: 1 kord, viga alla 2%',
    'Varjunimesid kasutusel: 9, neist 1 isegi talle endale teadmata',
    'Lifti ootamise rekord ilma kannatust kaotamata: 4 tundi',
    'Kiirtoidurestoranide salaretsepte paljastatud: 5',
    'Kõrgeim tsitruseline, kust on hüpatud: 3. korruse sidrunipuu',
    'Tähekujusid nimetatud enda järgi: 2 (ametlikult tunnistamata)',
    'Peatatud kellasid pelgalt pilguga: 16',
    'Esinenud ooperis, ilma et oleks lavale läinud: 1',
    'Lume keskel grillitud: 38 korda',
    'Lahendatud salakoode enne hommikukohvi: 212',
    'Lipnikke kurgitükkidest ehitatud: 1, kannab ikka veel',
    'Vihmapiiskadest kõrvale põigatud: 4096 järjest',
    'Jalgratta tagaratast eest sõites ära kaotatud: 1, märkas alles kodus',
    'Jõulukuuske kasvatatud taskus: 3',
    'Maailma kiireim kinkepaberi pakkija: 0,8 sekundit kink',
    'Kuulsaid detektiive nõustatud: 4',
    'Kaheksajalgu poolehoidjaks võidetud: 2',
    'Teejoomise rekord ilma puhkepausita: 61 tassi',
    'Mägironimisi pidžaamas: 6',
    'Vaikseid sammu lumel: 10 000 ilma ühegi krõbinata',
    'Autasusid, mida on keelatud mainida: 13',
    'Sünnipäevatorte korraga puhutud: 11 küünalderida',
    'Koeri treenitud vargaid tagasi viima: 2',
    'Kaugeim visatud lumepall: 212 meetrit, tabas',
    'Salapäraseid koputusi aknal, millele on vastatud: 77',
    'Kirjandusauhindu ostunimekirja eest: 1',
    'Kiirabi kutsutud liiga hea nalja tõttu: 2',
    'Laviine kõneosavusega peatatud: 1',
    'Kummikuid kaotatud: 0 (ainus inimene maailmas)',
    'Sõidetud bussiliine, mida ametlikult ei eksisteeri: 3',
    'Kinnitatud: oskab vilistada kahte lugu korraga',
    'Kohtumisi Jetiga: 2, mõlemad sõbralikud',
];

/** Stable pseudo-random generator seeded from a string, so facts don't change on reload. */
function factRandom(seed) {
    let state = 2166136261;
    for (let i = 0; i < seed.length; i++) {
        state = Math.imul(state ^ seed.charCodeAt(i), 16777619) >>> 0;
    }
    return function () {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

/** Picks a few distinct facts for a name. */
function outrageousFacts(name, count) {
    const random = factRandom(name);
    const pool = OUTRAGEOUS_FACTS.slice();
    const picked = [];
    while (picked.length < count && pool.length > 0) {
        const index = Math.floor(random() * pool.length);
        picked.push(pool.splice(index, 1)[0]);
    }
    return picked;
}
