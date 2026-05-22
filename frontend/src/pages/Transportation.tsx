import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getTransportPrices, getTransportCities, getTransportCompanies, deleteTransportCompany, pushTransportToCmr } from "../api/client";
import type { TransportPrice } from "../types";

const TYPE_CHIPS: { value: string; label: string; color: string; textColor: string }[] = [
  { value: "", label: "All", color: "#f5f5f5", textColor: "#333" },
  { value: "transfer", label: "Transfer", color: "#e3f2fd", textColor: "#1565c0" },
  { value: "roundtrip", label: "Roundtrip", color: "#e8f5e9", textColor: "#2e7d32" },
  { value: "soiree", label: "Soiree", color: "#fce4ec", textColor: "#c62828" },
  { value: "excursion", label: "Excursion", color: "#fff3e0", textColor: "#e65100" },
  { value: "mise_a_dispo", label: "Mise a Dispo", color: "#f3e5f5", textColor: "#7b1fa2" },
];

const BUS_SIZES = [7, 17, 30, 40, 54];

export default function Transportation() {
  const [prices, setPrices] = useState<TransportPrice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [cities, setCities] = useState<string[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedCompany, setSelectedCompany] = useState("");
  const [selectedBusSize, setSelectedBusSize] = useState<number | "">("");
  const [search, setSearch] = useState("");
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pushingId, setPushingId] = useState<number | null>(null);
  const [snackbar, setSnackbar] = useState<{ msg: string; ok: boolean } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const navigate = useNavigate();
  const pageSize = 50;

  useEffect(() => {
    getTransportCities().then(setCities).catch(() => {});
    getTransportCompanies().then(setCompanies).catch(() => {});
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTransportPrices({
      city: selectedCity || undefined,
      company: selectedCompany || undefined,
      service_type: selectedType || undefined,
      bus_size: selectedBusSize || undefined,
      search: search || undefined,
      page,
      page_size: pageSize,
    })
      .then((data) => {
        if (!cancelled) {
          setPrices(data.items);
          setTotal(data.total);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedCity, selectedType, selectedCompany, selectedBusSize, search, page, refreshKey]);

  const totalPages = Math.ceil(total / pageSize);

  const toggleCompany = (id: number) => {
    setSelectedCompanyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    const ids = [...selectedCompanyIds];
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} transport company${ids.length > 1 ? "ies" : "y"} and all their prices?`)) return;
    setDeleting(true);
    for (const id of ids) {
      try {
        await deleteTransportCompany(id);
      } catch { /* skip */ }
    }
    setSelectedCompanyIds(new Set());
    setDeleting(false);
    setRefreshKey((k) => k + 1);
  };

  const handleDeleteSingle = async (tp: TransportPrice) => {
    if (!confirm(`Delete "${tp.company.name}" and all its prices?`)) return;
    setDeletingId(tp.company.id);
    try {
      await deleteTransportCompany(tp.company.id);
      setRefreshKey((k) => k + 1);
    } catch {
      setSnackbar({ msg: "Failed to delete transport company", ok: false });
      setTimeout(() => setSnackbar(null), 4000);
    } finally {
      setDeletingId(null);
    }
  };

  const handlePush = async (tp: TransportPrice) => {
    setPushingId(tp.company.id);
    try {
      const res = await pushTransportToCmr(tp.company.id);
      setSnackbar({ msg: res.message, ok: true });
      if (res.cmr_supplier_id) {
        setPrices((prev) =>
          prev.map((p) =>
            p.company.id === tp.company.id
              ? { ...p, company: { ...p.company, cmr_supplier_id: res.cmr_supplier_id } }
              : p
          )
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Push failed";
      setSnackbar({ msg, ok: false });
    } finally {
      setPushingId(null);
      setTimeout(() => setSnackbar(null), 4000);
    }
  };

  const typeLabel = (stype: string | null) => {
    const found = TYPE_CHIPS.find((t) => t.value === stype);
    return found ? found : TYPE_CHIPS[0];
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
        <h2 style={{ margin: 0 }}>Transportation Prices</h2>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {selectedCompanyIds.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={deleting}
              style={{
                background: "#e53935", color: "#fff", border: "none", padding: "0.45rem 1rem",
                borderRadius: 6, cursor: deleting ? "default" : "pointer", fontWeight: 600,
                fontSize: "0.65rem", opacity: deleting ? 0.6 : 1,
              }}
            >
              {deleting ? "Deleting..." : `Delete ${selectedCompanyIds.size} company${selectedCompanyIds.size > 1 ? "ies" : "y"}`}
            </button>
          )}
          <Link
            to="/add-transport"
            style={{
              background: "#2e7d32", color: "#fff", padding: "0.45rem 1rem",
              borderRadius: 6, textDecoration: "none", fontWeight: 600,
              fontSize: "0.65rem",
            }}
          >
            + Add Transport
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={selectedCity}
          onChange={(e) => { setSelectedCity(e.target.value); setPage(1); }}
          style={{ padding: "0.4rem 0.75rem", borderRadius: 6, border: "1px solid #ddd", fontSize: "0.8rem" }}
        >
          <option value="">All Cities</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={selectedCompany}
          onChange={(e) => { setSelectedCompany(e.target.value); setPage(1); }}
          style={{ padding: "0.4rem 0.75rem", borderRadius: 6, border: "1px solid #ddd", fontSize: "0.8rem" }}
        >
          <option value="">All Companies</option>
          {companies.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={selectedBusSize}
          onChange={(e) => { setSelectedBusSize(e.target.value ? Number(e.target.value) : ""); setPage(1); }}
          style={{ padding: "0.4rem 0.75rem", borderRadius: 6, border: "1px solid #ddd", fontSize: "0.8rem" }}
        >
          <option value="">All Sizes</option>
          {BUS_SIZES.map((s) => <option key={s} value={s}>{s} seater</option>)}
        </select>

        <div style={{ display: "flex", gap: "0.35rem" }}>
          {TYPE_CHIPS.map((chip) => (
            <button
              key={chip.value}
              onClick={() => { setSelectedType(chip.value); setPage(1); }}
              style={{
                padding: "0.3rem 0.8rem",
                borderRadius: 16,
                border: selectedType === chip.value ? "2px solid " + chip.textColor : "1px solid #ddd",
                background: chip.color,
                color: chip.textColor,
                cursor: "pointer",
                fontWeight: selectedType === chip.value ? 700 : 500,
                fontSize: "0.75rem",
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ padding: "0.4rem 0.75rem", borderRadius: 6, border: "1px solid #ddd", fontSize: "0.8rem", width: 180 }}
        />
      </div>

      {loading ? (
        <p style={{ color: "#888" }}>Loading transport prices...</p>
      ) : prices.length === 0 ? (
        <p style={{ color: "#888", textAlign: "center", padding: "2rem" }}>No transport prices found.</p>
      ) : (
        <>
          <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #ddd" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", fontSize: "0.75rem" }}>
              <thead>
                <tr>
                  {["", "Actions", "Code", "Price", "Company", "Product", "Bus Size", "Type", "Days", "Route", "Note", "City"].map((h) => (
                    <th key={h} style={{ padding: "0.5rem", textAlign: "left", background: "#2e7d32", color: "#fff", fontSize: "0.65rem", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prices.map((tp) => {
                  const tag = typeLabel(tp.service_type);
                  return (
                    <tr key={tp.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "4px 6px" }}>
                        <input
                          type="checkbox"
                          checked={selectedCompanyIds.has(tp.company.id)}
                          onChange={() => toggleCompany(tp.company.id)}
                        />
                      </td>
                      <td style={{ padding: "4px 6px" }}>
                        <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
                          <button
                            onClick={() => navigate(`/edit-transport/${tp.company.id}`)}
                            style={{
                              background: "none",
                              border: "1px solid #6366f1",
                              color: "#6366f1",
                              borderRadius: 4,
                              padding: "2px 6px",
                              cursor: "pointer",
                              fontSize: "0.6rem",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handlePush(tp)}
                            disabled={pushingId === tp.company.id}
                            style={{
                              background: "none",
                              border: `1px solid ${tp.company.cmr_supplier_id ? "#059669" : "#2563eb"}`,
                              color: tp.company.cmr_supplier_id ? "#059669" : "#2563eb",
                              borderRadius: 4,
                              padding: "2px 6px",
                              cursor: pushingId === tp.company.id ? "default" : "pointer",
                              fontSize: "0.6rem",
                              opacity: pushingId === tp.company.id ? 0.6 : 1,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {pushingId === tp.company.id
                              ? "..."
                              : tp.company.cmr_supplier_id
                                ? "Update"
                                : "Push"}
                          </button>
                          {tp.company.cmr_supplier_id && (
                            <a
                              href="https://crm.vmmorocco.com/suppliers?category=Transport"
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                border: "1px solid #059669",
                                color: "#059669",
                                borderRadius: 4,
                                padding: "2px 6px",
                                fontSize: "0.6rem",
                                textDecoration: "none",
                                whiteSpace: "nowrap",
                              }}
                            >
                              CRM
                            </a>
                          )}
                          <button
                            onClick={() => handleDeleteSingle(tp)}
                            disabled={deletingId === tp.company.id}
                            style={{
                              background: "none",
                              border: "1px solid #e94560",
                              color: "#e94560",
                              borderRadius: 4,
                              padding: "2px 6px",
                              cursor: deletingId === tp.company.id ? "default" : "pointer",
                              fontSize: "0.6rem",
                              opacity: deletingId === tp.company.id ? 0.6 : 1,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {deletingId === tp.company.id ? "..." : "Delete"}
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: "4px 6px", fontFamily: "monospace", fontSize: "0.7rem" }}>{tp.code ?? "-"}</td>
                      <td style={{ padding: "4px 6px", fontWeight: 600 }}>
                        {tp.price != null ? tp.price.toLocaleString() : "-"}
                      </td>
                      <td style={{ padding: "4px 6px", fontWeight: 600 }}>{tp.company.name}</td>
                      <td style={{ padding: "4px 6px" }}>{tp.product ?? "-"}</td>
                      <td style={{ padding: "4px 6px", textAlign: "center" }}>{tp.bus_size ?? "-"}</td>
                      <td style={{ padding: "4px 6px" }}>
                        <span style={{
                          padding: "2px 8px", borderRadius: 12, fontSize: "0.7rem", fontWeight: 600,
                          background: tag.color, color: tag.textColor,
                        }}>
                          {tag.label}
                        </span>
                      </td>
                      <td style={{ padding: "4px 6px", textAlign: "center" }}>{tp.days ?? "-"}</td>
                      <td style={{ padding: "4px 6px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={tp.route_description ?? ""}>
                        {tp.route_description ?? "-"}
                      </td>
                      <td style={{ padding: "4px 6px", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={tp.note ?? ""}>
                        {tp.note ?? "-"}
                      </td>
                      <td style={{ padding: "4px 6px" }}>{tp.city ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "1rem", alignItems: "center" }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                style={{ padding: "0.3rem 0.8rem", borderRadius: 4, border: "1px solid #ddd", background: "#fff", cursor: page <= 1 ? "default" : "pointer", fontSize: "0.8rem" }}
              >
                Prev
              </button>
              <span style={{ fontSize: "0.8rem", color: "#666" }}>
                Page {page} of {totalPages} ({total} total)
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                style={{ padding: "0.3rem 0.8rem", borderRadius: 4, border: "1px solid #ddd", background: "#fff", cursor: page >= totalPages ? "default" : "pointer", fontSize: "0.8rem" }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {snackbar && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            padding: "0.75rem 1.25rem",
            borderRadius: 8,
            background: snackbar.ok ? "#059669" : "#dc2626",
            color: "#fff",
            fontSize: "0.8rem",
            fontWeight: 600,
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            zIndex: 9999,
          }}
        >
          {snackbar.msg}
        </div>
      )}
    </div>
  );
}
