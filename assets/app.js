"use strict";

const $ = id => document.getElementById(id);

const lomake = $("rivi-lomake");
const kentat = Array.from(
  { length: 7 },
  (_, i) => $(`numero-${i + 1}`)
);

const painikkeet = [
  $("tarkista-rivi"),
  $("arvo-rivi"),
  $("arvo-uusi-rivi")
];

let arvonnat = [];
let vanhatArvonnat = [];
let aineistoValmis = false;
let vanhaAineistoValmis = false;
let vanhaAineistoLataus = null;

const numeroRuudukko = $("numero-ruudukko");
const valitutNumerot = $("valitut-numerot");

function nykyisetValinnat() {
  return kentat
    .map(kentta => Number(kentta.value))
    .filter(numero => Number.isInteger(numero) && numero >= 1 && numero <= 40);
}

function paivitaNumeroruudukko() {
  const valitut = new Set(nykyisetValinnat());

  numeroRuudukko.querySelectorAll("button").forEach(painike => {
    const numero = Number(painike.dataset.numero);
    const valittu = valitut.has(numero);
    painike.classList.toggle("selected", valittu);
    painike.setAttribute("aria-pressed", String(valittu));
  });

  const jarjestetty = [...valitut].sort((a, b) => a - b);
  valitutNumerot.textContent =
    jarjestetty.length ? jarjestetty.join(" · ") : "ei vielä valittu";
}

function asetaNumerot(numerot) {
  const jarjestetty = [...numerot].sort((a, b) => a - b);

  kentat.forEach((kentta, i) => {
    kentta.value = jarjestetty[i] ?? "";
  });

  paivitaNumeroruudukko();
}

function luoNumeroruudukko() {
  for (let numero = 1; numero <= 40; numero++) {
    const painike = document.createElement("button");
    painike.type = "button";
    painike.textContent = numero;
    painike.dataset.numero = numero;
    painike.setAttribute("aria-pressed", "false");
    painike.setAttribute("aria-label", `Numero ${numero}`);

    painike.addEventListener("click", () => {
      naytaVirhe("");
      piilotaTulokset();

      const valitut = new Set(nykyisetValinnat());

      if (valitut.has(numero)) {
        valitut.delete(numero);
      } else {
        if (valitut.size >= 7) {
          naytaVirhe("Valitse enintään seitsemän numeroa.");
          return;
        }
        valitut.add(numero);
      }

      asetaNumerot([...valitut]);
    });

    numeroRuudukko.appendChild(painike);
  }

  paivitaNumeroruudukko();
}


const paivamuoto = new Intl.DateTimeFormat("fi-FI", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
  timeZone: "UTC"
});

function muotoilePaiva(isoPaiva) {
  return paivamuoto.format(
    new Date(`${isoPaiva}T00:00:00Z`)
  );
}

function naytaVirhe(viesti) {
  $("lomakevirhe").textContent = viesti;
  $("lomakevirhe").hidden = !viesti;
}

function piilotaTulokset() {
  $("tulokset").hidden = true;
  $("vanha-historia-tulos").hidden = true;
  $("halpaaon-kutsu").hidden = true;
}

/*
 * CSV-lukija:
 * käsittelee lainausmerkit, pilkut lainatun kentän
 * sisällä, rivinvaihdot ja UTF-8 BOM -tunnisteen.
 */
function lueCsv(teksti, pakotettuErotin = null) {
  teksti = teksti.replace(/^\uFEFF/, "");

  const ensimmäinenRivi = teksti.split(/\r?\n/, 1)[0] || "";
  const erotin = pakotettuErotin || (
    ensimmäinenRivi.split(";").length > ensimmäinenRivi.split(",").length ? ";" : ","
  );

  const rivit = [];
  let rivi = [];
  let kentta = "";
  let lainattu = false;

  for (let i = 0; i < teksti.length; i++) {
    const merkki = teksti[i];

    if (merkki === '"') {
      if (lainattu && teksti[i + 1] === '"') {
        kentta += '"';
        i++;
      } else {
        lainattu = !lainattu;
      }
    } else if (merkki === erotin && !lainattu) {
      rivi.push(kentta);
      kentta = "";
    } else if ((merkki === "\n" || merkki === "\r") && !lainattu) {
      if (merkki === "\r" && teksti[i + 1] === "\n") i++;
      rivi.push(kentta);
      if (rivi.some(arvo => arvo.trim() !== "")) rivit.push(rivi);
      rivi = [];
      kentta = "";
    } else {
      kentta += merkki;
    }
  }

  if (lainattu) throw new Error("CSV:n lainausmerkit ovat keskeneräiset.");

  // Tallenna myös viimeinen kenttä. Historiatiedoston jokaisen rivin
  // lopussa on puolipiste, joten viimeinen kenttä on tarkoituksella tyhjä.
  rivi.push(kentta);
  if (rivi.some(arvo => arvo.trim() !== "")) rivit.push(rivi);

  if (rivit.length < 2) throw new Error("CSV ei sisällä arvontatietoja.");

  const otsikot = rivit.shift().map(arvo => arvo.trim());

  if (new Set(otsikot).size !== otsikot.length) {
    throw new Error("CSV:n sarakeotsikot toistuvat.");
  }

  return rivit.map((arvot, indeksi) => {
    // Hyväksy historiallisessa CSV:ssä mahdollinen ylimääräinen tyhjä loppukenttä.
    // Näin rivin lopussa oleva ';' ei tee muuten kelvollisesta rivistä virheellistä.
    while (arvot.length > otsikot.length && arvot.at(-1).trim() === "") {
      arvot.pop();
    }

    if (arvot.length !== otsikot.length) {
      throw new Error(`CSV-rivin ${indeksi + 2} sarakemäärä on virheellinen.`);
    }

    return Object.fromEntries(
      otsikot.map((otsikko, i) => [otsikko, arvot[i].trim()])
    );
  });
}

function tarkistaAineisto(rivit) {
  const tunnisteet = new Set();

  const tulos = rivit.map((rivi, indeksi) => {
    const rivinumero = indeksi + 2;
    const paiva = rivi.pvm;
    const paivamaara = new Date(`${paiva}T00:00:00Z`);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(paiva) ||
      Number.isNaN(paivamaara.getTime()) ||
      paivamaara.toISOString().slice(0, 10) !== paiva
    ) {
      throw new Error(`Virheellinen päivä rivillä ${rivinumero}.`);
    }

    const numerotekstit = Array.from(
      { length: 7 },
      (_, i) => rivi[`n${i + 1}`]
    );

    if (
      ![...numerotekstit, rivi.lisänumero].every(
        arvo => /^\d+$/.test(arvo)
      )
    ) {
      throw new Error(`Virheellinen numero rivillä ${rivinumero}.`);
    }

    const numerot = numerotekstit.map(Number);
    const lisa = Number(rivi.lisänumero);

    if (
      new Set(numerot).size !== 7 ||
      ![...numerot, lisa].every(n => n >= 1 && n <= 40) ||
      numerot.includes(lisa)
    ) {
      throw new Error(`Virheelliset numerot rivillä ${rivinumero}.`);
    }

    if (
      !rivi.arvonta_id ||
      tunnisteet.has(rivi.arvonta_id)
    ) {
      throw new Error(
        `Puuttuva tai toistuva arvontatunniste rivillä ${rivinumero}.`
      );
    }

    tunnisteet.add(rivi.arvonta_id);

    return {
      pvm: paiva,
      id: rivi.arvonta_id,
      numerot,
      lisa
    };
  });

  return tulos.sort((a, b) => a.pvm.localeCompare(b.pvm));
}

/*
 * Vanha historiallinen CSV on eri muodossa kuin nykyinen lotto.csv.
 * Odotettu rakenne on:
 * date, year, requested_year, requested_week, draw_id,
 * primary, secondary, tertiary
 *
 * primary/secondary/tertiary voivat olla joko JSON-listoja
 * tai pilkulla eroteltuja numeroita.
 */
function parseNumeroLista(arvo) {
  if (!arvo) return [];

  const teksti = String(arvo).trim();

  try {
    const json = JSON.parse(teksti);
    if (Array.isArray(json)) {
      return json.map(Number).filter(Number.isFinite);
    }
  } catch (_) {
    // Ei JSON-muotoa — jatketaan tavallisena tekstinä.
  }

  return teksti
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(/[;,|]/)
    .map(x => x.trim().replace(/^["']|["']$/g, ""))
    .filter(x => x !== "")
    .map(Number)
    .filter(Number.isFinite);
}

function tarkistaVanhaAineisto(rivit) {
  const tunnisteet = new Set();

  return rivit.map((rivi, indeksi) => {
    const rivinumero = indeksi + 2;
    const paiva = String(rivi.date || rivi.pvm || "").trim();
    const paivamaara = new Date(`${paiva}T00:00:00Z`);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(paiva) ||
      Number.isNaN(paivamaara.getTime()) ||
      paivamaara.toISOString().slice(0, 10) !== paiva
    ) {
      throw new Error(`Vanhan historian virheellinen päivä rivillä ${rivinumero}.`);
    }

    const numerot = parseNumeroLista(rivi.primary);

    if (
      numerot.length < 6 ||
      numerot.length > 7 ||
      numerot.some(n => !Number.isInteger(n) || n < 1 || n > 40) ||
      new Set(numerot).size !== numerot.length
    ) {
      throw new Error(`Vanhan historian päänumerot ovat virheelliset rivillä ${rivinumero}.`);
    }

    const id = String(
      rivi.draw_id || rivi.arvonta_id || `${paiva}-${indeksi}`
    );

    if (tunnisteet.has(id)) {
      throw new Error(`Vanhan historian arvontatunniste toistuu rivillä ${rivinumero}.`);
    }

    tunnisteet.add(id);

    return {
      pvm: paiva,
      id,
      numerot: numerot.sort((a, b) => a - b)
    };
  }).sort((a, b) => a.pvm.localeCompare(b.pvm));
}

function lueOmaRivi() {
  const arvot = kentat.map(kentta => kentta.value.trim());

  if (arvot.some(arvo => arvo === "")) {
    throw new Error("Täytä kaikki seitsemän numerokenttää.");
  }

  const numerot = arvot.map(Number);

  if (
    !numerot.every(
      numero =>
        Number.isInteger(numero) &&
        numero >= 1 &&
        numero <= 40
    )
  ) {
    throw new Error(
      "Anna vain kokonaislukuja väliltä 1–40."
    );
  }

  if (new Set(numerot).size !== 7) {
    throw new Error(
      "Jokaisen numeron pitää olla eri. Tarkista toistuvat numerot."
    );
  }

  return numerot.sort((a, b) => a - b);
}

function osumaluokka(oikein, lisaOsui) {
  if (oikein === 7) return "7 oikein";
  if (oikein === 6 && lisaOsui) return "6 + 1";
  if (oikein === 6) return "6 oikein";
  if (oikein === 5) return "5 oikein";
  if (oikein === 4) return "4 oikein";
  if (oikein === 3 && lisaOsui) return "3 + lisänumero";

  return null;
}

function vertaaRivi(numerot) {
  const omaRivi = new Set(numerot);
  const osumat = [];

  for (const arvonta of arvonnat) {
    const yhteiset = arvonta.numerot
      .filter(numero => omaRivi.has(numero))
      .sort((a, b) => a - b);

    const lisaOsui = omaRivi.has(arvonta.lisa);
    const luokka = osumaluokka(yhteiset.length, lisaOsui);

    if (luokka) {
      osumat.push({
        pvm: arvonta.pvm,
        luokka,
        yhteiset,
        lisaOsui,
        lisa: arvonta.lisa
      });
    }
  }

  return osumat;
}

function vertaaVanhaHistoria(numerot) {
  const omaRivi = new Set(numerot);
  const osumat = [];

  for (const arvonta of vanhatArvonnat) {
    const yhteiset = arvonta.numerot
      .filter(numero => omaRivi.has(numero))
      .sort((a, b) => a - b);

    if (yhteiset.length >= 4) {
      osumat.push({
        pvm: arvonta.pvm,
        oikein: yhteiset.length,
        yhteiset
      });
    }
  }

  return osumat;
}

function naytaTulokset(numerot, osumat) {
  $("tarkistettu-rivi").textContent = numerot.join(" – ");

  $("tulosyhteenveto").textContent =
    osumat.length === 0
      ? "Rivilläsi ei löytynyt näytettäviä osuma-arvontoja."
      : `Rivilläsi löytyi ${osumat.length} osuma-arvontaa.`;

  const jarjestys = [
    "7 oikein",
    "6 + 1",
    "6 oikein",
    "5 oikein",
    "4 oikein",
    "3 + lisänumero"
  ];

  const yhteenveto = $("osumayhteenveto");
  yhteenveto.replaceChildren();

  for (const luokka of jarjestys) {
    const maara = osumat.filter(
      osuma => osuma.luokka === luokka
    ).length;

    if (maara === 0) continue;

    const nimi = document.createElement("dt");
    nimi.textContent = luokka;

    const arvo = document.createElement("dd");
    arvo.textContent = `${maara} ${maara === 1 ? "kerta" : "kertaa"}`;

    yhteenveto.append(nimi, arvo);
  }

  const taulukko = $("osumataulukko");
  taulukko.replaceChildren();

  for (const osuma of [...osumat].reverse()) {
    const rivi = document.createElement("tr");

    const solut = [
      muotoilePaiva(osuma.pvm),
      osuma.luokka,
      osuma.yhteiset.join(", "),
      osuma.lisaOsui ? String(osuma.lisa) : "–"
    ];

    for (const teksti of solut) {
      const solu = document.createElement("td");
      solu.textContent = teksti;
      rivi.appendChild(solu);
    }

    taulukko.appendChild(rivi);
  }

  $("ei-osumia").hidden = osumat.length !== 0;
  $("osumataulukon-kehys").hidden = osumat.length === 0;
  $("tulokset").hidden = false;

  naytaVanhaHistoria(numerot);

  // Näytetään oma CTA tulosten jälkeen.
  $("halpaaon-kutsu").hidden = false;
}

function naytaVanhaHistoria(numerot) {
  if (!vanhaAineistoValmis) return;

  const osumat = vertaaVanhaHistoria(numerot);
  const taulukko = $("vanha-historia-taulukko");
  taulukko.replaceChildren();

  $("vanha-historia-yhteenveto").textContent =
    osumat.length === 0
      ? "Riville ei löytynyt vähintään neljän päänumeron osumia vanhasta historiasta."
      : `Vanhasta historiasta löytyi ${osumat.length} arvontaa, joissa riville osui vähintään neljä päänumeroa.`;

  for (const osuma of [...osumat].reverse()) {
    const rivi = document.createElement("tr");

    const solut = [
      muotoilePaiva(osuma.pvm),
      `${osuma.oikein} oikein`,
      osuma.yhteiset.join(", ")
    ];

    for (const teksti of solut) {
      const solu = document.createElement("td");
      solu.textContent = teksti;
      rivi.appendChild(solu);
    }

    taulukko.appendChild(rivi);
  }

  $("vanha-historia-ei-osumia").hidden = osumat.length !== 0;
  $("vanha-historia-tulos").hidden = false;
}

function tarkistaNykyinenRivi() {
  if (!aineistoValmis) return;

  naytaVirhe("");

  try {
    const numerot = lueOmaRivi();

    asetaNumerot(numerot);

    naytaTulokset(numerot, vertaaRivi(numerot));
  } catch (virhe) {
    piilotaTulokset();
    naytaVirhe(virhe.message);
  }
}

function satunnainenKokonaisluku(raja) {
  const puskuri = new Uint32Array(1);
  const kokonaisalue = 2 ** 32;
  const hyvaksyttyAlue =
    kokonaisalue - (kokonaisalue % raja);

  do {
    crypto.getRandomValues(puskuri);
  } while (puskuri[0] >= hyvaksyttyAlue);

  return puskuri[0] % raja;
}

function arvoJaTarkista() {
  if (!aineistoValmis) return;

  const numerot = new Set();

  while (numerot.size < 7) {
    numerot.add(satunnainenKokonaisluku(40) + 1);
  }

  const jarjestetty = [...numerot].sort((a, b) => a - b);

  asetaNumerot(jarjestetty);

  tarkistaNykyinenRivi();
}

function naytaAineistonTiedot() {
  const ensimmainen = arvonnat[0];
  const viimeisin = arvonnat[arvonnat.length - 1];

  $("aineiston-alku").textContent =
    muotoilePaiva(ensimmainen.pvm);

  $("aineiston-loppu").textContent =
    muotoilePaiva(viimeisin.pvm);

  $("aineiston-maara").textContent = arvonnat.length;
  $("aineiston-tiivistelma").hidden = false;

  const paiva = $("viimeisin-paiva");
  paiva.textContent = muotoilePaiva(viimeisin.pvm);
  paiva.dateTime = viimeisin.pvm;

  const numerolista = $("viimeisimmat-numerot");
  numerolista.replaceChildren();

  for (const numero of [...viimeisin.numerot].sort((a, b) => a - b)) {
    const kohta = document.createElement("li");
    kohta.textContent = numero;
    numerolista.appendChild(kohta);
  }

  $("viimeisin-lisanumero").textContent = viimeisin.lisa;
  $("viimeisin-tila").hidden = true;
  $("viimeisin-sisalto").hidden = false;
}

async function lataaAineisto() {
  $("lataustila").textContent = "Ladataan arvontahistoriaa…";
  lomake.setAttribute("aria-busy", "true");

  try {
    const vastaus = await fetch("data/lotto.csv", {
      cache: "no-cache"
    });

    if (!vastaus.ok) {
      throw new Error(`Tiedoston lataus epäonnistui: ${vastaus.status}`);
    }

    const teksti = await vastaus.text();
    arvonnat = tarkistaAineisto(lueCsv(teksti));

    if (arvonnat.length === 0) {
      throw new Error("Aineistossa ei ole arvontoja.");
    }

    naytaAineistonTiedot();
    aineistoValmis = true;

    painikkeet.forEach(painike => {
      painike.disabled = false;
    });

    $("tarkista-vanha-historia").disabled = false;

    $("lataustila").textContent =
      "Historia ladattu. Voit tarkistaa oman rivin tai arpoa uuden.";

  } catch (virhe) {
    console.error(virhe);

    $("lataustila").textContent =
      "Arvontahistorian lataaminen epäonnistui. Päivitä sivu ja yritä uudelleen.";

    $("viimeisin-tila").textContent =
      "Arvontatietoja ei voitu ladata.";
  } finally {
    lomake.setAttribute("aria-busy", "false");
  }

}

async function lataaVanhaAineisto() {
  if (vanhaAineistoValmis) return;
  if (vanhaAineistoLataus) return vanhaAineistoLataus;

  vanhaAineistoLataus = (async () => {
    const tila = $("vanha-historia-tila");
    tila.textContent = "Ladataan vanhaa Lottohistoriaa…";

    try {
    const vastaus = await fetch("data/lotto_1971_2017.csv", {
      cache: "no-cache"
    });

    if (!vastaus.ok) {
      throw new Error(`Historiatiedoston lataus epäonnistui: ${vastaus.status}`);
    }

    const teksti = await vastaus.text();
    vanhatArvonnat = tarkistaVanhaAineisto(lueCsv(teksti, ";"));

    if (vanhatArvonnat.length === 0) {
      throw new Error("Historiatiedostossa ei ole arvontoja.");
    }

    vanhaAineistoValmis = true;
    $("tarkista-vanha-historia").disabled = false;
    tila.textContent =
      `Vanha historia ladattu: ${muotoilePaiva(vanhatArvonnat[0].pvm)}–${muotoilePaiva(vanhatArvonnat.at(-1).pvm)}, ${vanhatArvonnat.length} arvontaa.`;

    } catch (virhe) {
      console.error(virhe);
      tila.textContent =
        "Vanhan historian lataaminen epäonnistui. Nykyinen Lotto toimii silti normaalisti.";
      vanhaAineistoLataus = null;
      throw virhe;
    }
  })();

  return vanhaAineistoLataus;
}

lomake.addEventListener("submit", tapahtuma => {
  tapahtuma.preventDefault();
  tarkistaNykyinenRivi();
});

lomake.addEventListener("input", () => {
  naytaVirhe("");
  piilotaTulokset();
});

lomake.addEventListener("reset", () => {
  naytaVirhe("");
  piilotaTulokset();
  asetaNumerot([]);
});

$("arvo-rivi").addEventListener("click", arvoJaTarkista);
$("arvo-uusi-rivi").addEventListener("click", arvoJaTarkista);

luoNumeroruudukko();

$("tarkista-vanha-historia").addEventListener("click", async () => {
  if (!aineistoValmis) return;

  try {
    const numerot = lueOmaRivi();
    const painike = $("tarkista-vanha-historia");
    painike.disabled = true;
    painike.textContent = "⏳ Ladataan vanhaa historiaa…";

    await lataaVanhaAineisto();
    naytaVanhaHistoria(numerot);
    $("vanha-historia").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    painike.disabled = false;
    painike.textContent = "🔎 Tarkista myös vanhasta historiasta";
  } catch (virhe) {
    const painike = $("tarkista-vanha-historia");
    painike.disabled = false;
    painike.textContent = "🔎 Tarkista myös vanhasta historiasta";
    naytaVirhe(virhe.message);
  }
});

lataaAineisto();
