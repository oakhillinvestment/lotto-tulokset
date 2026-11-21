# lotto-tulokset
# Suomen Loton tulokset ja CSV-tulosarkisto

Projekti kerää Suomen Loton arvontatuloksia vuoden 2018 alusta lähtien
ja tarjoaa ne ladattavana CSV-tiedostona.

Tavoitteena on ylläpitää yksinkertaista, automaattisesti päivittyvää
tulosarkistoa ja näyttää verkkosivulla viimeisimmän arvonnan tulos.

## Lataa data

- [Tuloshistoria CSV-muodossa](data/lotto.csv)
- [Viimeisin tallennettu arvonta JSON-muodossa](data/latest.json)

Avaa CSV-linkki ja valitse GitHubin tiedostonäkymästä latauspainike
ladataksesi tiedoston.

## CSV-tiedoston sisältö

Tiedoston ensimmäinen rivi sisältää sarakkeiden nimet.

| Sarake | Sisältö |
|---|---|
| pvm | Arvontapäivä muodossa VVVV-KK-PP |
| arvonta_id | Lähteen käyttämä arvonnan tunniste |
| n1–n7 | Seitsemän päänumeroa |
| lisänumero | Arvonnan lisänumero |
| tuplaus | Rajapinnan results.multiplier-kentän arvo |

Tuplaus-sarakkeen nimi on nykyisen keräysskriptin käyttämä nimi.
Kentän merkitys ja mahdolliset muutokset eri vuosina on tarkistettava
ennen sen käyttöä laskennassa.

CSV käyttää pilkkua sarake-erottimena ja UTF-8-merkistöä BOM-tunnisteella.

## Päivitys

Tiedot haetaan GitHub Actions -työnkululla Veikkauksen
viikkokohtaisesta tulosrajapinnasta.

Ensimmäinen historiakeräys on tehty vuoden 2018 alusta.
Tavallisilla päivitysajoilla tarkistetaan kuluva ja edellinen viikko.

Päivityksen voi käynnistää myös käsin:

Actions → Päivitä Lotto-tulokset → Run workflow

Päivitykset eivät ole reaaliaikaisia.

## Tietolähde

Lähde: Veikkauksen tulosrajapinta.

Esimerkkipyyntö:

https://www.veikkaus.fi/api/draw-results/v1/games/LOTTO/draws/by-week/2018-W01

Veikkauksen tulosarkisto:

https://www.veikkaus.fi/fi/tulokset

## Huomautukset

Tämä on riippumaton projekti, ei Veikkauksen virallinen palvelu.

Aineistossa voi olla puutteita tai virheitä.
Viralliset tulokset ja voitot on tarkistettava Veikkaukselta.

Aineiston kattavuutta ei ole vielä
