// Moneroo official catalog — countries, currencies, PayIn & Payout methods
// Sandbox toggle: VITE_MONEROO_SANDBOX !== "false" => sandbox (uses demo methods)
// In production, set VITE_MONEROO_SANDBOX=false and switch the MONEROO_API_KEY in Supabase secrets.

export const MONEROO_SANDBOX =
  (import.meta.env.VITE_MONEROO_SANDBOX ?? "true").toString().toLowerCase() !== "false";

export type MonerooMethod = {
  code: string;
  label: string;
  // payout uses msisdn (E.164 phone) by default. Demo uses account_number (integer).
  payoutField?: "msisdn" | "account_number";
};

export type MonerooCountry = {
  code: string; // ISO-2
  name: string;
  currency: string; // default currency
  currencies?: string[]; // other supported currencies via cards/crypto
  payin: MonerooMethod[];
  payout: MonerooMethod[];
  dialPrefix?: string;
};

// ---- Sandbox catalog (demo only) -------------------------------------------
const SANDBOX_COUNTRIES: MonerooCountry[] = [
  {
    code: "US",
    name: "Sandbox (Démo)",
    currency: "USD",
    payin: [{ code: "moneroo_payment_demo", label: "Moneroo Demo (PayIn)" }],
    payout: [{ code: "moneroo_payout_demo", label: "Moneroo Demo (Payout)", payoutField: "account_number" }],
    dialPrefix: "+1",
  },
];

// ---- Live catalog -----------------------------------------------------------
const m = (code: string, label: string, payoutField: "msisdn" | "account_number" = "msisdn"): MonerooMethod =>
  ({ code, label, payoutField });

const LIVE_COUNTRIES: MonerooCountry[] = [
  // ---- West Africa (XOF) ----
  { code: "CI", name: "Côte d'Ivoire", currency: "XOF", currencies: ["XOF"], dialPrefix: "+225",
    payin: [m("orange_ci","Orange Money"), m("mtn_ci","MTN MoMo"), m("moov_ci","Moov Money"), m("wave_ci","Wave"), m("card_xof","Carte XOF"), m("crypto_xof","Crypto XOF")],
    payout:[m("orange_ci","Orange Money"), m("mtn_ci","MTN MoMo"), m("moov_ci","Moov Money"), m("wave_ci","Wave"), m("djamo_ci","Djamo")] },
  { code: "SN", name: "Sénégal", currency: "XOF", dialPrefix: "+221",
    payin: [m("orange_sn","Orange Money"), m("wave_sn","Wave"), m("freemoney_sn","Free Money"), m("e_money_sn","E-Money"), m("wizall_sn","Wizall"), m("crypto_xof","Crypto XOF")],
    payout:[m("orange_sn","Orange Money"), m("wave_sn","Wave"), m("freemoney_sn","Free Money"), m("e_money_sn","E-Money"), m("djamo_sn","Djamo")] },
  { code: "BF", name: "Burkina Faso", currency: "XOF", dialPrefix: "+226",
    payin: [m("orange_bf","Orange Money"), m("moov_bf","Moov Money"), m("card_xof","Carte XOF"), m("crypto_xof","Crypto XOF")],
    payout:[] },
  { code: "ML", name: "Mali", currency: "XOF", dialPrefix: "+223",
    payin: [m("orange_ml","Orange Money"), m("moov_ml","Moov Money"), m("mobi_cash_ml","Mobi Cash"), m("card_xof","Carte XOF"), m("crypto_xof","Crypto XOF")],
    payout:[m("orange_ml","Orange Money")] },
  { code: "TG", name: "Togo", currency: "XOF", dialPrefix: "+228",
    payin: [m("togocel","TogoCel"), m("moov_tg","Moov Money"), m("card_xof","Carte XOF"), m("crypto_xof","Crypto XOF")],
    payout:[m("togocel","TogoCel"), m("moov_tg","Moov Money")] },
  { code: "BJ", name: "Bénin", currency: "XOF", dialPrefix: "+229",
    payin: [m("mtn_bj","MTN MoMo"), m("moov_bj","Moov Money"), m("card_xof","Carte XOF"), m("crypto_xof","Crypto XOF")],
    payout:[m("mtn_bj","MTN MoMo"), m("moov_bj","Moov Money")] },
  { code: "NE", name: "Niger", currency: "XOF", dialPrefix: "+227",
    payin: [m("airtel_ne","Airtel Money"), m("crypto_xof","Crypto XOF")],
    payout:[] },
  { code: "GW", name: "Guinée-Bissau", currency: "XOF", dialPrefix: "+245",
    payin: [m("crypto_xof","Crypto XOF")],
    payout:[] },

  // ---- Central Africa (XAF / CDF) ----
  { code: "CM", name: "Cameroun", currency: "XAF", dialPrefix: "+237",
    payin: [m("mtn_cm","MTN MoMo"), m("orange_cm","Orange Money"), m("eu_mobile_cm","EU Mobile"), m("card_xaf","Carte XAF"), m("crypto_xaf","Crypto XAF")],
    payout:[m("mtn_cm","MTN MoMo"), m("orange_cm","Orange Money"), m("eu_mobile_cm","EU Mobile")] },
  { code: "CF", name: "Centrafrique", currency: "XAF", dialPrefix: "+236",
    payin: [m("card_xaf","Carte XAF"), m("crypto_xaf","Crypto XAF")], payout:[] },
  { code: "CG", name: "Congo-Brazzaville", currency: "XAF", dialPrefix: "+242",
    payin: [m("card_xaf","Carte XAF"), m("crypto_xaf","Crypto XAF")], payout:[] },
  { code: "GA", name: "Gabon", currency: "XAF", dialPrefix: "+241",
    payin: [m("card_xaf","Carte XAF"), m("crypto_xaf","Crypto XAF")], payout:[] },
  { code: "GQ", name: "Guinée Équatoriale", currency: "XAF", dialPrefix: "+240",
    payin: [m("card_xaf","Carte XAF"), m("crypto_xaf","Crypto XAF")], payout:[] },
  { code: "TD", name: "Tchad", currency: "XAF", dialPrefix: "+235",
    payin: [m("card_xaf","Carte XAF"), m("crypto_xaf","Crypto XAF")], payout:[] },
  { code: "CD", name: "Congo-Kinshasa", currency: "CDF", dialPrefix: "+243",
    payin: [m("orange_cd","Orange Money"), m("airtel_cd","Airtel Money"), m("vodacom_cd","Vodacom M-Pesa")],
    payout:[m("orange_cd","Orange Money"), m("airtel_cd","Airtel Money"), m("vodacom_cd","Vodacom M-Pesa")] },

  // ---- Rest of Africa ----
  { code: "NG", name: "Nigeria", currency: "NGN", dialPrefix: "+234",
    payin: [m("mtn_ng","MTN"), m("airtel_ng","Airtel"), m("bank_transfer_ng","Bank Transfer"), m("barter","Barter"), m("card_ngn","Carte NGN"), m("crypto_ngn","Crypto NGN"), m("qr_ngn","QR"), m("ussd_ngn","USSD")],
    payout:[m("mtn_ng","MTN"), m("airtel_ng","Airtel"), m("bank_transfer_ng","Bank Transfer"), m("barter","Barter"), m("card_ngn","Carte NGN"), m("crypto_ngn","Crypto NGN"), m("qr_ngn","QR"), m("ussd_ngn","USSD")] },
  { code: "GH", name: "Ghana", currency: "GHS", dialPrefix: "+233",
    payin: [m("mtn_gh","MTN"), m("vodafone_gh","Vodafone"), m("tigo_gh","Tigo"), m("card_ghs","Carte GHS"), m("crypto_ghs","Crypto GHS")],
    payout:[m("mtn_gh","MTN"), m("vodafone_gh","Vodafone"), m("tigo_gh","Tigo"), m("card_ghs","Carte GHS"), m("crypto_ghs","Crypto GHS")] },
  { code: "GN", name: "Guinée", currency: "GNF", dialPrefix: "+224",
    payin: [m("mtn_gn","MTN"), m("orange_gn","Orange Money")], payout:[] },
  { code: "KE", name: "Kenya", currency: "KES", dialPrefix: "+254",
    payin: [m("mpesa_ke","M-Pesa"), m("card_kes","Carte KES")],
    payout:[m("mpesa_ke","M-Pesa"), m("card_kes","Carte KES")] },
  { code: "TZ", name: "Tanzanie", currency: "TZS", dialPrefix: "+255",
    payin: [m("mpesa_tz","M-Pesa"), m("airtel_tz","Airtel"), m("tigo_tz","Tigo"), m("halopesa_tz","HaloPesa"), m("card_tzs","Carte TZS")],
    payout:[m("mpesa_tz","M-Pesa"), m("airtel_tz","Airtel"), m("tigo_tz","Tigo"), m("halopesa_tz","HaloPesa"), m("card_tzs","Carte TZS")] },
  { code: "UG", name: "Ouganda", currency: "UGX", dialPrefix: "+256",
    payin: [m("mtn_ug","MTN"), m("airtel_ug","Airtel"), m("card_ugx","Carte UGX")],
    payout:[m("mtn_ug","MTN"), m("airtel_ug","Airtel"), m("card_ugx","Carte UGX")] },
  { code: "RW", name: "Rwanda", currency: "RWF", dialPrefix: "+250",
    payin: [m("mtn_rw","MTN"), m("airtel_rw","Airtel")],
    payout:[m("mtn_rw","MTN"), m("airtel_rw","Airtel")] },
  { code: "MW", name: "Malawi", currency: "MWK", dialPrefix: "+265",
    payin: [m("tnm_mw","TNM"), m("airtel_mw","Airtel")],
    payout:[m("tnm_mw","TNM"), m("airtel_mw","Airtel")] },
  { code: "ZM", name: "Zambie", currency: "ZMW", dialPrefix: "+260",
    payin: [m("mtn_zm","MTN"), m("airtel_zm","Airtel"), m("zamtel_zm","Zamtel")],
    payout:[m("mtn_zm","MTN"), m("airtel_zm","Airtel"), m("zamtel_zm","Zamtel")] },
  { code: "ZA", name: "Afrique du Sud", currency: "ZAR", dialPrefix: "+27",
    payin: [m("card_zar","Carte ZAR")], payout:[] },

  // ---- International ----
  { code: "WORLD", name: "International (Carte USD)", currency: "USD", dialPrefix: "+",
    payin: [m("card_usd","Carte internationale (Visa/MC)")], payout:[] },
  { code: "US", name: "États-Unis (Crypto)", currency: "USD", dialPrefix: "+1",
    payin: [m("crypto_usd","Crypto USD")], payout:[] },
];

const EU_CODES = ["AT","BE","BG","CY","CZ","DE","DK","EE","ES","FI","FR","GR","HR","HU","IE","IT","LT","LU","LV","MT","NL","PL","PT","RO","SE","SI","SK"];
const EU_NAMES: Record<string,string> = { AT:"Autriche", BE:"Belgique", BG:"Bulgarie", CY:"Chypre", CZ:"Tchéquie", DE:"Allemagne", DK:"Danemark", EE:"Estonie", ES:"Espagne", FI:"Finlande", FR:"France", GR:"Grèce", HR:"Croatie", HU:"Hongrie", IE:"Irlande", IT:"Italie", LT:"Lituanie", LU:"Luxembourg", LV:"Lettonie", MT:"Malte", NL:"Pays-Bas", PL:"Pologne", PT:"Portugal", RO:"Roumanie", SE:"Suède", SI:"Slovénie", SK:"Slovaquie" };
for (const c of EU_CODES) {
  LIVE_COUNTRIES.push({
    code: c, name: EU_NAMES[c], currency: "EUR", dialPrefix: "+",
    payin: [m("crypto_eur","Crypto EUR")], payout: [],
  });
}

export const MONEROO_COUNTRIES: MonerooCountry[] = MONEROO_SANDBOX ? SANDBOX_COUNTRIES : LIVE_COUNTRIES;

export const getCountry = (code: string) => MONEROO_COUNTRIES.find(c => c.code === code);
export const getPayinCountries = () => MONEROO_COUNTRIES.filter(c => c.payin.length > 0);
export const getPayoutCountries = () => MONEROO_COUNTRIES.filter(c => c.payout.length > 0);

export const getPayoutFieldName = (methodCode: string): "msisdn" | "account_number" => {
  if (methodCode === "moneroo_payout_demo") return "account_number";
  return "msisdn";
};

export const getMethodByCode = (code: string): MonerooMethod | undefined => {
  for (const c of MONEROO_COUNTRIES) {
    const found = [...c.payin, ...c.payout].find(x => x.code === code);
    if (found) return found;
  }
  return undefined;
};
