type ESearchResponse = {
  esearchresult?: {
    count?: string;
    idlist?: string[];
  };
};

type ESummaryRecord = {
  uid?: string;
  title?: string;
  source?: string;
  pubdate?: string;
  authors?: Array<{ name?: string }>;
};

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

function cleanFormula(value: string | null) {
  return (value ?? "").toUpperCase().replace(/[^CHON0-9]/g, "").slice(0, 32);
}

function cleanNumber(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? String(value).slice(0, 18) : "";
}

function cleanPpm(value: string | null) {
  return (value ?? "")
    .split(",")
    .map(Number)
    .filter((item) => Number.isFinite(item) && item >= -5 && item <= 30)
    .slice(0, 6)
    .map((item) => item.toFixed(3));
}

const MULTIPLICITY_TERMS: Record<string, string> = {
  s: "singlet",
  d: "doublet",
  dd: "doublet of doublets",
  ddd: "doublet of doublet of doublets",
  t: "triplet",
  q: "quartet",
  m: "multiplet",
};

function cleanMultiplicity(value: string | null) {
  return (value ?? "")
    .split(",")
    .map((item) => item.split(":"))
    .map(([ppm, code]) => ({ ppm: Number(ppm), code: (code ?? "").toLowerCase() }))
    .filter((item) => Number.isFinite(item.ppm) && item.ppm >= -5 && item.ppm <= 30 && Boolean(MULTIPLICITY_TERMS[item.code]))
    .slice(0, 6)
    .map((item) => ({ ppm: item.ppm.toFixed(3), code: item.code, name: MULTIPLICITY_TERMS[item.code] }));
}

async function search(term: string) {
  const url = new URL(`${EUTILS}/esearch.fcgi`);
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("retmode", "json");
  url.searchParams.set("retmax", "3");
  url.searchParams.set("sort", "relevance");
  url.searchParams.set("tool", "nmr_insight_lab");
  url.searchParams.set("term", term);
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`PubMed ESearch ${response.status}`);
  return response.json() as Promise<ESearchResponse>;
}

export async function GET(request: Request) {
  const input = new URL(request.url).searchParams;
  const formula = cleanFormula(input.get("formula"));
  const mz = cleanNumber(input.get("mz"));
  const ppm = cleanPpm(input.get("ppm"));
  const multiplicities = cleanMultiplicity(input.get("multiplicity"));

  if (!formula || !mz) {
    return Response.json({ error: "formula and m/z are required" }, { status: 400 });
  }

  const nmrTerms = `("nuclear magnetic resonance"[Title/Abstract] OR NMR[Title/Abstract] OR "chemical shift"[Title/Abstract])`;
  const massTerms = `("mass spectrometry"[Title/Abstract] OR "mass spectrum"[Title/Abstract] OR "m/z"[Title/Abstract])`;
  const numericTerms = [
    `"${mz}"[All Fields]`,
    ...ppm.slice(0, 4).map((value) => `"${value}"[All Fields]`),
  ].join(" OR ");
  const multiplicityTerms = multiplicities.map((signal) => `("${signal.ppm}"[All Fields] AND "${signal.name}"[All Fields])`);
  const confirmedSignalQuery = multiplicityTerms.length ? ` AND (${multiplicityTerms.join(" OR ")})` : "";
  const preciseQuery = `"${formula}"[All Fields] AND ${nmrTerms} AND ${massTerms} AND (${numericTerms})${confirmedSignalQuery}`;
  const fallbackQuery = multiplicityTerms.length
    ? `"${formula}"[All Fields] AND ${nmrTerms} AND (${multiplicities.map((signal) => `"${signal.name}"[All Fields]`).join(" OR ")})`
    : `"${formula}"[All Fields] AND (${nmrTerms} OR ${massTerms})`;

  try {
    let query = preciseQuery;
    let result = await search(query);
    let fallback = false;
    if (!(result.esearchresult?.idlist?.length)) {
      query = fallbackQuery;
      result = await search(query);
      fallback = true;
    }

    const ids = result.esearchresult?.idlist ?? [];
    let records: Array<{
      uid: string;
      title: string;
      source: string;
      pubdate: string;
      authors: string[];
      url: string;
    }> = [];

    if (ids.length) {
      const summaryUrl = new URL(`${EUTILS}/esummary.fcgi`);
      summaryUrl.searchParams.set("db", "pubmed");
      summaryUrl.searchParams.set("retmode", "json");
      summaryUrl.searchParams.set("tool", "nmr_insight_lab");
      summaryUrl.searchParams.set("id", ids.join(","));
      const response = await fetch(summaryUrl, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`PubMed ESummary ${response.status}`);
      const summary = await response.json() as { result?: Record<string, ESummaryRecord | string[]> };
      records = ids.map((id) => summary.result?.[id] as ESummaryRecord | undefined).filter(Boolean).map((record) => ({
        uid: record?.uid ?? "",
        title: (record?.title ?? "제목 정보 없음").replace(/<[^>]+>/g, ""),
        source: record?.source ?? "PubMed",
        pubdate: record?.pubdate ?? "",
        authors: (record?.authors ?? []).map((author) => author.name ?? "").filter(Boolean),
        url: `https://pubmed.ncbi.nlm.nih.gov/${record?.uid ?? ""}/`,
      }));
    }

    return Response.json({
      query,
      searchUrl: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(preciseQuery)}`,
      count: Number(result.esearchresult?.count ?? 0),
      records,
      fallback,
      confirmedMultiplicities: multiplicities,
    }, {
      headers: { "Cache-Control": "public, max-age=900" },
    });
  } catch {
    return Response.json({ error: "PubMed is temporarily unavailable" }, { status: 502 });
  }
}
