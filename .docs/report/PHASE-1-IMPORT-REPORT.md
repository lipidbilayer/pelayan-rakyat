# Phase 1 import report

Date: 2026-11-02
Mode: dry run (`--apply` was not used)
Database: fresh database with the committed Phase 1 migrations
Source files: `.docs/data/parties.csv`, `.docs/data/roster.csv`

## Summary

- Rows read: 183
- Errors: 0
- Warnings: 115
- Parties: 11 created, 0 updated, 0 unchanged
- People: 172 created, 0 updated, 0 unchanged (unique people)
- Positions: 183 created, 0 updated, 0 unchanged
- Sources: 28 created, 0 updated, 0 unchanged (unique URLs)

## Warning summary

| Warning type | Count |
|---|---:|
| source_url_2 is a home page | 109 |
| notes text repeated on 4 rows | 2 |
| notes text repeated on 6 rows | 2 |
| notes text repeated on 100 rows | 1 |
| notes text repeated on 18 rows | 1 |

## Raw report

```json
{
  "rowsRead": 183,
  "parties": {
    "created": 11,
    "updated": 0,
    "unchanged": 0
  },
  "people": {
    "created": 172,
    "updated": 0,
    "unchanged": 0
  },
  "sources": {
    "created": 28,
    "updated": 0,
    "unchanged": 0
  },
  "positions": {
    "created": 183,
    "updated": 0,
    "unchanged": 0
  },
  "verifiedReset": [],
  "missingFromImport": [],
  "errors": [],
  "warnings": [
    {
      "line": 26,
      "personSlug": "basri-baco",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 27,
      "personSlug": "nuchbatillah",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 28,
      "personSlug": "muhammad-hasan-abdillah",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 29,
      "personSlug": "dian-pratama",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 30,
      "personSlug": "ismail",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 31,
      "personSlug": "wa-ode-herlina",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 32,
      "personSlug": "desie-christhyana-sari",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 33,
      "personSlug": "alwi-moehamad-ali",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 34,
      "personSlug": "pandapotan-sinaga",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 35,
      "personSlug": "riano-p-ahmad",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 36,
      "personSlug": "elva-farhi-qolbina",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 37,
      "personSlug": "heri-kustanto",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 38,
      "personSlug": "agustina-hermanto",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 39,
      "personSlug": "dimaz-raditya",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 40,
      "personSlug": "ramly-hi-muhamad",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 41,
      "personSlug": "muhammad-idris",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 42,
      "personSlug": "oman-rohman-rakinda",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 43,
      "personSlug": "anggi-arando-siregar",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 44,
      "personSlug": "suhud-alynudin",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 45,
      "personSlug": "jhonny-simanjuntak",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 46,
      "personSlug": "neneng-hasanah",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 47,
      "personSlug": "hengky-wijaya",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 48,
      "personSlug": "tri-waluyo",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 49,
      "personSlug": "bebizie-sri-mulyati",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 50,
      "personSlug": "imamuddin",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 51,
      "personSlug": "m-subki",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 52,
      "personSlug": "ida-mahmudah",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 53,
      "personSlug": "brando-susanto",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 54,
      "personSlug": "alief-bintang-haryadi",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 55,
      "personSlug": "bun-joi-phiau",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 56,
      "personSlug": "m-taufik-zoelkifli",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 57,
      "personSlug": "ferrial-sofyan",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 58,
      "personSlug": "muhammad-lefy",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 59,
      "personSlug": "adnan-taufiq",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 60,
      "personSlug": "syahroni",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 61,
      "personSlug": "dwi-rio-sambodo",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 62,
      "personSlug": "judistira-hermawan",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 63,
      "personSlug": "ghozi-zulazmi",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 64,
      "personSlug": "mohamad-ongen-sangaji",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 65,
      "personSlug": "josephine-simanjuntak",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 66,
      "personSlug": "mujiyono",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 67,
      "personSlug": "abdurrahman-suhaimi",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 68,
      "personSlug": "nasdiyanto",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 69,
      "personSlug": "zita-anjani",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 70,
      "personSlug": "m-fu-adi-luthfi",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 71,
      "personSlug": "pantas-nainggolan",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 72,
      "personSlug": "alia-noorayu-laksono",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 73,
      "personSlug": "ali-hakim-lubis",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 74,
      "personSlug": "justin-adrian",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 75,
      "personSlug": "fatimah-tania-nadira-alatas",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 76,
      "personSlug": "muhammad-thamrin",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 77,
      "personSlug": "matnoor-tindoan",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 78,
      "personSlug": "ryan-kurnia-ar-rahman",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 79,
      "personSlug": "misan-samsuri",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 80,
      "personSlug": "ahmad-moetaba",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 81,
      "personSlug": "muhammad-al-fatih",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 82,
      "personSlug": "sardy-wahab-sadri",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 83,
      "personSlug": "bambang-kusumanto",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 84,
      "personSlug": "manuara-siahaan",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 85,
      "personSlug": "raden-gusti-arief-yulifard",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 86,
      "personSlug": "sutikno",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 87,
      "personSlug": "wibi-andrino",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 88,
      "personSlug": "khoirudin",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 89,
      "personSlug": "dadiyono",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 90,
      "personSlug": "setyoko",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 91,
      "personSlug": "ali-muhammad-johan-c",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 92,
      "personSlug": "chicha-koeswoyo",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 93,
      "personSlug": "zahrina-nurbaiti",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 94,
      "personSlug": "astrid-kuya",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 95,
      "personSlug": "francine-eustacia",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 96,
      "personSlug": "nabilah-aboe-bakar-alhabsyi",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 97,
      "personSlug": "yusuf",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 98,
      "personSlug": "achmad-yani",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 99,
      "personSlug": "muhammad-bin-salim-alatas",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 100,
      "personSlug": "ade-suherman",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 101,
      "personSlug": "nova-harivan-paloh",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 102,
      "personSlug": "wahyu-dewanto",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 103,
      "personSlug": "yuke-yurike",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 104,
      "personSlug": "nurhasan",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 105,
      "personSlug": "lazarus-simon-ishak",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 106,
      "personSlug": "farah-savira",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 107,
      "personSlug": "august-hamonangan",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 108,
      "personSlug": "william-aditya-sarana",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 109,
      "personSlug": "inggard-joshua",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 110,
      "personSlug": "lukmanul-hakim",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 111,
      "personSlug": "lauw-siegvrieda",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 112,
      "personSlug": "gias-kumari-putra",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 113,
      "personSlug": "nur-afni-sajim",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 114,
      "personSlug": "solikhah",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 115,
      "personSlug": "achmad-ruslan",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 116,
      "personSlug": "dina-masyusin",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 117,
      "personSlug": "andri-santosa",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 118,
      "personSlug": "hilda-kusuma-dewi",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 119,
      "personSlug": "rany-mauliani",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 120,
      "personSlug": "ima-mahdiah",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 121,
      "personSlug": "hardiyanto-kenneth",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 122,
      "personSlug": "jupiter",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 123,
      "personSlug": "abdul-aziz",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 124,
      "personSlug": "yudha-permana",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 125,
      "personSlug": "jamilah-abdul-gani",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 126,
      "personSlug": "wita-susilowati",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 127,
      "personSlug": "inad-luciawaty",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 128,
      "personSlug": "syafi-fabio-djohan",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 129,
      "personSlug": "kevin-wu",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 130,
      "personSlug": "husen",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 131,
      "personSlug": "uwais-el-qoroni",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 181,
      "personSlug": "gani-suwondo-lie",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 182,
      "personSlug": "andika-wisnuadji-putra-soebroto",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 183,
      "personSlug": "ismail-2",
      "message": "source_url_2 is a home page (https://dprd-dkijakartaprov.go.id)"
    },
    {
      "line": 4,
      "personSlug": "arifin",
      "message": "notes text repeated on 6 rows: \"Appointed civil servant (no party). Current incumbent per Wikipedia list.\" (arifin, hendra-hidayat, iin-mutmainnah, syafrin-liputo, munjirin)"
    },
    {
      "line": 18,
      "personSlug": "eric-phahlevi-zakaria-lumbun",
      "message": "notes text repeated on 6 rows: \"Appointed civil servant.\" (eric-phahlevi-zakaria-lumbun, fredy-setiawan, ali-murthadho, firmanudin-ibrahim, kusmanto)"
    },
    {
      "line": 26,
      "personSlug": "basri-baco",
      "message": "notes text repeated on 100 rows: \"Elected under KPU DKI decision 23 Aug 2024; inaugurated 26 Aug 2024. Komisi from DPRD DKI site.\" (basri-baco, nuchbatillah, muhammad-hasan-abdillah, dian-pratama, wa-ode-herlina)"
    },
    {
      "line": 134,
      "personSlug": "ima-mahdiah",
      "message": "notes text repeated on 4 rows: \"Wakil Ketua DPRD since 4 Oct 2024 (DPRD DKI site). Also Anggota row.\" (ima-mahdiah, rany-mauliani, wibi-andrino, basri-baco)"
    },
    {
      "line": 138,
      "personSlug": "mardani-ali-sera",
      "message": "notes text repeated on 18 rows: \"Elected under KPU decision (Keppres 1206/2024, 25 Aug 2024); inaugurated 1 Oct 2024.\" (mardani-ali-sera, anis-byarwati, putra-nababan, habiburokhman, hasbiallah-ilyas)"
    },
    {
      "line": 159,
      "personSlug": "fahira-idris",
      "message": "notes text repeated on 4 rows: \"Independent (no party). DPD RI 2024-2029. Inaugurated 1 Oct 2024 (date approximate by month).\" (fahira-idris, happy-djarot, dailami-firdaus, achmad-azran)"
    }
  ]
}
```
