import { useEffect, useMemo, useState } from "react";
import "./App.css";
import "./Readable.css";

const USP_API = "/api/usp";
const EP_API = "/api/ep";
const BP_API = "/api/bp";
const FX_API = "/api/fx";

function officialUrl(origin, path, fallbackQuery) {
  if (path) return new URL(path, origin).href;
  return `${origin}/search?q=${encodeURIComponent(fallbackQuery)}`;
}

function formatKrw(price, rates) {
  const match = String(price || "").match(/([0-9]+(?:\.[0-9]+)?)\s*(USD|EUR)/i);
  if (!match || !rates[match[2].toUpperCase()]) return "KRW N/A";
  return `₩${Math.round(Number(match[1]) * rates[match[2].toUpperCase()]).toLocaleString("ko-KR")}`;
}

const USP_MONTHS = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

function formatUspValidUseDate(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return value || "";
  const month = USP_MONTHS[match[2].toUpperCase()];
  return month ? `${match[3]}.${month}.${match[1].padStart(2, "0")}` : value;
}

function uspLot(product) {
  if (product.usp_current_lot_number) return product.usp_current_lot_number;

  const latestLot = String(product.usp_lot_details || "")
    .split("##")
    .map((record) => {
      const [lot, , , validUseDate] = record.split("|");
      const timestamp = Date.parse(validUseDate || "");
      return lot && validUseDate
        ? { lot, validUseDate, timestamp: Number.isNaN(timestamp) ? 0 : timestamp }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  return latestLot
    ? `${latestLot.lot} (${formatUspValidUseDate(latestLot.validUseDate)})`
    : "Not published";
}

function mapUspProduct(product) {
  const price =
    product.salePrices?.defaultPriceGroup ??
    product.listPrices?.defaultPriceGroup;
  return {
    id: product.repositoryId || product.id,
    name: product.displayName || product.description || "Unnamed USP product",
    code: product.repositoryId || product.id || "N/A",
    cas:
      product.casNumber ||
      product.cas_number ||
      product.usp_cas_number ||
      product.x_casNumber ||
      "N/A",
    standard: "USP",
    lot: uspLot(product),
    quantity:
      product.x_packagingConfiguration ||
      (product.usp_packing_size && product.usp_uom
        ? `${product.usp_packing_size} ${product.usp_uom}`
        : product.usp_packing_size || product.usp_pack_size || "N/A"),
    price: typeof price === "number" && price > 0 ? `${price} USD` : "N/A",
    source: "USP Store live",
    url: officialUrl(
      "https://store.usp.org",
      product.route || product.url || product.productUrl,
      product.displayName || product.repositoryId || product.id,
    ),
  };
}

function parseEpResults(html) {
  const document = new DOMParser().parseFromString(html, "text/html");
  return [...document.querySelectorAll('a[href*="/db/4DCGI/View="]')]
    .map((link, index) => {
      const row = link.closest("tr");
    const cells = row
      ? [...row.querySelectorAll(":scope > td")].map((cell) =>
          cell.textContent.trim(),
        )
      : [];
    const cas =
      row?.textContent.match(/\b\d{2,7}-\d{2}-\d\b/)?.[0] || "N/A";
      const catalog = link.textContent.trim();
      if (!catalog || cells.length < 4) return null;
      return {
        id: `EP-${catalog}-${index}`,
        name: cells[2],
      code: catalog,
      cas,
      standard: "EP",
        lot: cells[3],
        quantity: cells[4] || "N/A",
        price: cells[5] || "N/A",
        source: "EDQM CRS live",
        url: officialUrl(
          "https://crs.edqm.eu",
          link.getAttribute("href"),
          cells[2],
        ),
      };
    })
    .filter(Boolean);
}

function parseBpResults(html) {
  const document = new DOMParser().parseFromString(html, "text/html");
  return [...document.querySelectorAll('a[href*="/shop/products/"]')]
    .map((link, index) => {
      let container = link.parentElement;
      for (let level = 0; level < 12 && container; level += 1) {
        const text = container.textContent.replace(/\s+/g, " ").trim();
        if (/Current batch/i.test(text)) {
          const batch =
            text.match(
              /Current\s+batch(?:\s+Current\s+batch)?\s*[:#]?\s*([A-Za-z0-9-]+)/i,
            )?.[1] || "N/A";
          const catalog =
            text.match(/Category Number\s+([A-Za-z0-9-]+)/i)?.[1] ||
            link.href.split("/").pop()?.split("?")[0];
        const quantity =
          text
            .match(
              /Pack size\s+Pack size\s+([^]+?)(?=Substance name|CAS Number|Quantitative)/i,
            )?.[1]
            ?.trim() || "N/A";
        const cas =
          text.match(
            /CAS Number(?:\s+CAS Number)?\s*[:#]?\s*(\d{2,7}-\d{2}-\d)/i,
          )?.[1] || "N/A";
          const price =
            text
              .match(
                /Price\s+([^]+?)(?=Order Quantity|Add to basket|Discontinued)/i,
              )?.[1]
              ?.trim() || "N/A";
          return {
            id: `BP-${catalog}-${index}`,
            name: link.textContent.trim(),
          code: catalog,
          cas,
          standard: "BP",
            lot: batch,
            quantity,
            price,
            source: "BPCRS live",
            url: officialUrl(
              "https://www.pharmacopoeia.com",
              link.getAttribute("href"),
              link.textContent.trim(),
            ),
          };
        }
        container = container.parentElement;
      }
      return null;
    })
    .filter(Boolean);
}

function proxyDetailPath(url, apiPrefix) {
  const detailUrl = new URL(url);
  return `${apiPrefix}${detailUrl.pathname}${detailUrl.search}`;
}

async function enrichEpDetails(products) {
  return Promise.all(
    products.map(async (item) => {
      try {
        const response = await fetch(proxyDetailPath(item.url, EP_API));
        if (!response.ok) return item;
        const text = new DOMParser()
          .parseFromString(await response.text(), "text/html")
          .body.textContent.replace(/\s+/g, " ");
        const cas = text.match(
          /CAS\s+Registry\s+Number\s*[:#]?\s*(\d{2,7}-\d{2}-\d)/i,
        )?.[1];
        return cas ? { ...item, cas } : item;
      } catch {
        return item;
      }
    }),
  );
}

async function enrichBpDetails(products) {
  return Promise.all(
    products.map(async (item) => {
      try {
        const response = await fetch(proxyDetailPath(item.url, BP_API));
        if (!response.ok) return item;
        const text = new DOMParser()
          .parseFromString(await response.text(), "text/html")
          .body.textContent.replace(/\s+/g, " ");
        const price = text.match(
          /Price(?:\s+Price)?\s*[:#]?\s*((?:£|GBP|€|EUR|\$|USD)\s*[\d,.]+|[\d,.]+\s*(?:GBP|EUR|USD))/i,
        )?.[1];
        return price ? { ...item, price } : item;
      } catch {
        return item;
      }
    }),
  );
}

function App() {
  const [standards, setStandards] = useState([]);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [liveSearch, setLiveSearch] = useState(false);
  const [liveSource, setLiveSource] = useState("USP Store live");
  const [isSearching, setIsSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [rates, setRates] = useState({ USD: null, EUR: null });
  useEffect(() => {
    Promise.all([
      fetch(`${FX_API}/latest?from=USD&to=KRW`),
      fetch(`${FX_API}/latest?from=EUR&to=KRW`),
    ])
      .then(async ([usdResponse, eurResponse]) => {
        if (!usdResponse.ok || !eurResponse.ok)
          throw new Error("Exchange rates unavailable");
        const [usd, eur] = await Promise.all([
          usdResponse.json(),
          eurResponse.json(),
        ]);
        setRates({ USD: usd.rates?.KRW || null, EUR: eur.rates?.KRW || null });
      })
      .catch(() => setRates({ USD: null, EUR: null }));
  }, []);
  const filteredStandards = useMemo(
    () =>
      standards
        .filter((item) => {
          if (liveSearch)
            return liveSource === "all"
              ? item.source?.endsWith("live")
              : item.source === liveSource;
          const matchesQuery = `${item.name} ${item.code} ${item.cas} ${item.lot}`
            .toLowerCase()
            .includes(query.toLowerCase());
          return (
            matchesQuery &&
            (activeFilter === "All" || item.standard === activeFilter)
          );
        })
        .sort((a, b) =>
          a.name.localeCompare(b.name, "en", {
            sensitivity: "base",
            numeric: true,
          }),
        ),
    [activeFilter, liveSearch, liveSource, query, standards],
  );

  const searchUspStore = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setSearchMessage("Searching USP Store...");
    try {
      const uspFilter = `displayName co "${query.trim().replaceAll('"', "")}"`;
      const response = await fetch(
        `${USP_API}/products?q=${encodeURIComponent(uspFilter)}&limit=20&offset=0&sort=id:asc`,
      );
      if (!response.ok)
        throw new Error(`USP Store returned ${response.status}`);
      const payload = await response.json();
      const products =
        payload.items || payload.products || payload.results || [];
      const liveProducts = products
        .map(mapUspProduct)
        .filter((item) => item.id);
      setStandards(liveProducts);
      setLiveSearch(true);
      setLiveSource("USP Store live");
      setSearchMessage(
        liveProducts.length
          ? `${liveProducts.length} live USP products found.`
          : "No USP products found.",
      );
    } catch (error) {
      setSearchMessage(`USP Store lookup failed: ${error.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const searchEp = async () => {
    setIsSearching(true);
    setSearchMessage("Searching EDQM CRS...");
    try {
      const params = `vSelectName=1&vContains=1&vtUserName=${encodeURIComponent(query.trim())}&OK=Search&vTypeCRS=`;
      const response = await fetch(`${EP_API}/db/4DCGI/search?${params}`);
      if (!response.ok) throw new Error(`EDQM CRS returned ${response.status}`);
      const liveProducts = await enrichEpDetails(
        parseEpResults(await response.text()),
      );
      setStandards(liveProducts);
      setLiveSearch(true);
      setLiveSource("EDQM CRS live");
      setSearchMessage(
        liveProducts.length
          ? `${liveProducts.length} live EP products found.`
          : "No EP products found.",
      );
    } catch (error) {
      setSearchMessage(`EDQM CRS lookup failed: ${error.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const searchBp = async () => {
    setIsSearching(true);
    setSearchMessage("Searching BPCRS catalogue...");
    try {
      const params = `catalogue-search-text=${encodeURIComponent(query.trim())}&search-type=all`;
      const response = await fetch(`${BP_API}/shop/products?${params}`);
      if (!response.ok) throw new Error(`BPCRS returned ${response.status}`);
      const liveProducts = await enrichBpDetails(
        parseBpResults(await response.text()),
      );
      setStandards(liveProducts);
      setLiveSearch(true);
      setLiveSource("BPCRS live");
      setSearchMessage(
        liveProducts.length
          ? `${liveProducts.length} live BP products found.`
          : "No BP products found.",
      );
    } catch (error) {
      setSearchMessage(`BPCRS lookup failed: ${error.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const searchAllSources = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setSearchMessage("Searching USP, BP, and EP catalogues...");
    try {
      const cleanQuery = query.trim();
      const uspFilter = `displayName co "${cleanQuery.replaceAll('"', "")}"`;
      const [uspResponse, epResponse, bpResponse] = await Promise.all([
        fetch(
          `${USP_API}/products?q=${encodeURIComponent(uspFilter)}&limit=20&offset=0&sort=id:asc`,
        ),
        fetch(
          `${EP_API}/db/4DCGI/search?vSelectName=1&vContains=1&vtUserName=${encodeURIComponent(cleanQuery)}&OK=Search&vTypeCRS=`,
        ),
        fetch(
          `${BP_API}/shop/products?catalogue-search-text=${encodeURIComponent(cleanQuery)}&search-type=all`,
        ),
      ]);
      if (!uspResponse.ok || !epResponse.ok || !bpResponse.ok)
        throw new Error(
          "One or more official catalogues could not be reached.",
        );
      const uspPayload = await uspResponse.json();
      const [epHtml, bpHtml] = await Promise.all([
        epResponse.text(),
        bpResponse.text(),
      ]);
      const [epProducts, bpProducts] = await Promise.all([
        enrichEpDetails(parseEpResults(epHtml)),
        enrichBpDetails(parseBpResults(bpHtml)),
      ]);
      const liveProducts = [
        ...(uspPayload.items || uspPayload.products || uspPayload.results || [])
          .map(mapUspProduct)
          .filter((item) => item.id),
        ...epProducts,
        ...bpProducts,
      ];
      setStandards(liveProducts);
      setLiveSearch(true);
      setLiveSource("all");
      setSearchMessage(
        `${liveProducts.length} live products found across USP, BP, and EP.`,
      );
    } catch (error) {
      setSearchMessage(`Official catalogue lookup failed: ${error.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const searchOfficialSource = () => {
    if (activeFilter === "All") return searchAllSources();
    if (activeFilter === "EP") return searchEp();
    if (activeFilter === "BP") return searchBp();
    return searchUspStore();
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">RS</span>
          <span>
            Reference
            <br />
            Standards
          </span>
        </div>
        <div className="workspace-label">OFFICIAL SOURCES</div>
        <nav>
          <button className="nav-item active">
            <span>⌕</span> Search catalogue
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="sync-dot" />
          <div>
            <strong>Live lookup</strong>
            <small>USP · BP · EP</small>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Quality control <span>/</span> Reference standards
          </div>
          <button className="icon-button" aria-label="Settings">
            ⚙
          </button>
        </header>
        <section className="page-heading">
          <div>
            <p className="eyebrow">한국유나이티드제약 서면QC팀</p>
            <h1>Reference standards 통합 조회</h1>
            <p className="subheading">
              Search USP, BP, or EP to find the current lot or batch number.
            </p>
          </div>
        </section>
        <section className="content-grid">
          <div className="list-panel">
            <div className="list-toolbar">
              <div className="search-box">
                <span>⌕</span>
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setLiveSearch(false);
                  }}
                  onKeyDown={(event) =>
                    event.key === "Enter" && searchOfficialSource()
                  }
                  placeholder="Search official catalogue..."
                />
                <button
                  className="search-submit"
                  onClick={searchOfficialSource}
                  disabled={isSearching}
                  aria-label="Search official catalogue"
                >
                  ↵
                </button>
              </div>
              <div className="filters">
                {["All", "USP", "BP", "EP"].map((filter) => (
                  <button
                    key={filter}
                    className={
                      activeFilter === filter ? "filter active" : "filter"
                    }
                    onClick={() => {
                      setActiveFilter(filter);
                      setLiveSearch(false);
                    }}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>
            {searchMessage && (
              <div className="search-message">
                {isSearching ? "◌ " : "↗ "}
                {searchMessage}
              </div>
            )}
            <div className="table-head">
              <span>STANDARD NAME</span>
              <span>COMPENDIUM</span>
              <span>CAS NO.</span>
              <span>CURRENT BATCH / LOT</span>
              <span>SIZE</span>
              <span>PRICE</span>
              <span>SOURCE</span>
            </div>
            <div className="rows">
              {filteredStandards.map((item) => (
                <div className="standard-row" key={item.id}>
                  <span className="name-cell">
                    <a
                      className="name-link"
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${item.name} 공식 사이트에서 열기`}
                    >
                      {item.name}
                      <span aria-hidden="true">↗</span>
                    </a>
                    <small>{item.code}</small>
                  </span>
                  <span>
                    <i className={`compendium ${item.standard.toLowerCase()}`}>
                      {item.standard}
                    </i>
                  </span>
                  <span className="cas-cell">{item.cas || "N/A"}</span>
                  <span className="lot-cell">{item.lot}</span>
                  <span className="value-cell">{item.quantity || "N/A"}</span>
                  <span className="value-cell">
                    <strong>{item.price || "N/A"}</strong>
                    <small>{formatKrw(item.price, rates)}</small>
                  </span>
                  <span className="expiry-cell">
                    <strong>{item.source.replace(" live", "")}</strong>
                  </span>
                </div>
              ))}
            </div>
            {filteredStandards.length === 0 && (
              <div className="empty-state">
                Search an official catalogue to see results.
              </div>
            )}
          </div>
        </section>
        <footer className="disclaimer">
          <span>ⓘ</span>
          <span>
            Lot and batch information is read from the official compendial
            catalogue. Always verify the original certificate before use.
          </span>
          <strong>Source: official catalogue</strong>
        </footer>
      </main>
    </div>
  );
}
export default App;
