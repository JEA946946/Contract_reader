import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getMenuPrices, getRestaurantCities, deleteRestaurant, pushRestaurantToCmr } from "../api/client";
import type { MenuPrice } from "../types";

export default function Restaurants() {
  const [prices, setPrices] = useState<MenuPrice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [cities, setCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState("");
  const [search, setSearch] = useState("");
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pushingId, setPushingId] = useState<number | null>(null);
  const [snackbar, setSnackbar] = useState<{ msg: string; ok: boolean } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const navigate = useNavigate();
  const pageSize = 50;

  useEffect(() => {
    getRestaurantCities().then(setCities).catch(() => {});
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMenuPrices({
      city: selectedCity || undefined,
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
  }, [selectedCity, search, page, refreshKey]);

  const totalPages = Math.ceil(total / pageSize);

  const toggleRestaurant = (id: number) => {
    setSelectedRestaurantIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    const ids = [...selectedRestaurantIds];
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} restaurant${ids.length > 1 ? "s" : ""} and all their menu prices?`)) return;
    setDeleting(true);
    for (const id of ids) {
      try {
        await deleteRestaurant(id);
      } catch { /* skip */ }
    }
    setSelectedRestaurantIds(new Set());
    setDeleting(false);
    setRefreshKey((k) => k + 1);
  };

  const handleDeleteSingle = async (mp: MenuPrice) => {
    if (!confirm(`Delete "${mp.restaurant.name}" and all its menu prices?`)) return;
    setDeletingId(mp.restaurant.id);
    try {
      await deleteRestaurant(mp.restaurant.id);
      setRefreshKey((k) => k + 1);
    } catch {
      setSnackbar({ msg: "Failed to delete restaurant", ok: false });
      setTimeout(() => setSnackbar(null), 4000);
    } finally {
      setDeletingId(null);
    }
  };

  const handlePush = async (mp: MenuPrice) => {
    setPushingId(mp.restaurant.id);
    try {
      const res = await pushRestaurantToCmr(mp.restaurant.id);
      setSnackbar({ msg: res.message, ok: true });
      // Update local state with the cmr_supplier_id
      if (res.cmr_supplier_id) {
        setPrices((prev) =>
          prev.map((p) =>
            p.restaurant.id === mp.restaurant.id
              ? { ...p, restaurant: { ...p.restaurant, cmr_supplier_id: res.cmr_supplier_id } }
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

  const fmtPrice = (v: number | null) => (v != null ? v.toLocaleString() : "-");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
        <h2 style={{ margin: 0 }}>Restaurant Menu Prices</h2>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {selectedRestaurantIds.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={deleting}
              style={{
                background: "#e53935", color: "#fff", border: "none", padding: "0.45rem 1rem",
                borderRadius: 6, cursor: deleting ? "default" : "pointer", fontWeight: 600,
                fontSize: "0.65rem", opacity: deleting ? 0.6 : 1,
              }}
            >
              {deleting ? "Deleting..." : `Delete ${selectedRestaurantIds.size} restaurant${selectedRestaurantIds.size > 1 ? "s" : ""}`}
            </button>
          )}
          <Link
            to="/add-restaurant"
            style={{
              background: "#1a1a2e", color: "#fff", padding: "0.45rem 1rem",
              borderRadius: 6, textDecoration: "none", fontWeight: 600,
              fontSize: "0.65rem",
            }}
          >
            + Add Restaurant
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

        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ padding: "0.4rem 0.75rem", borderRadius: 6, border: "1px solid #ddd", fontSize: "0.8rem", width: 180 }}
        />
      </div>

      {loading ? (
        <p style={{ color: "#888" }}>Loading menu prices...</p>
      ) : prices.length === 0 ? (
        <p style={{ color: "#888", textAlign: "center", padding: "2rem" }}>No menu prices found.</p>
      ) : (
        <>
          <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #ddd" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", fontSize: "0.75rem" }}>
              <thead>
                <tr>
                  {["", "Actions", "Restaurant", "City", "Menu Name", "Lunch", "Dinner", "Lunch CHD", "Dinner CHD", "Course 1", "Course 2", "Course 3", "Course 4", "Course 5", "Min Pax", "Drinks", "Season", "Dates", "Note"].map((h) => (
                    <th key={h} style={{ padding: "0.5rem", textAlign: "left", background: "#1a1a2e", color: "#fff", fontSize: "0.65rem", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prices.map((mp) => (
                  <tr key={mp.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "4px 6px" }}>
                      <input
                        type="checkbox"
                        checked={selectedRestaurantIds.has(mp.restaurant.id)}
                        onChange={() => toggleRestaurant(mp.restaurant.id)}
                      />
                    </td>
                    <td style={{ padding: "4px 6px" }}>
                      <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
                        <button
                          onClick={() => navigate(`/edit-restaurant/${mp.restaurant.id}`)}
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
                          onClick={() => handlePush(mp)}
                          disabled={pushingId === mp.restaurant.id}
                          style={{
                            background: "none",
                            border: `1px solid ${mp.restaurant.cmr_supplier_id ? "#059669" : "#2563eb"}`,
                            color: mp.restaurant.cmr_supplier_id ? "#059669" : "#2563eb",
                            borderRadius: 4,
                            padding: "2px 6px",
                            cursor: pushingId === mp.restaurant.id ? "default" : "pointer",
                            fontSize: "0.6rem",
                            opacity: pushingId === mp.restaurant.id ? 0.6 : 1,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {pushingId === mp.restaurant.id
                            ? "..."
                            : mp.restaurant.cmr_supplier_id
                              ? "Update"
                              : "Push"}
                        </button>
                        {mp.restaurant.cmr_supplier_id && (
                          <a
                            href="https://crm.vmmorocco.com/suppliers?category=Restaurant"
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
                          onClick={() => handleDeleteSingle(mp)}
                          disabled={deletingId === mp.restaurant.id}
                          style={{
                            background: "none",
                            border: "1px solid #e94560",
                            color: "#e94560",
                            borderRadius: 4,
                            padding: "2px 6px",
                            cursor: deletingId === mp.restaurant.id ? "default" : "pointer",
                            fontSize: "0.6rem",
                            opacity: deletingId === mp.restaurant.id ? 0.6 : 1,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {deletingId === mp.restaurant.id ? "..." : "Delete"}
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: "4px 6px", fontWeight: 600 }}>{mp.restaurant.name}</td>
                    <td style={{ padding: "4px 6px" }}>{mp.restaurant.city}</td>
                    <td style={{ padding: "4px 6px" }}>{mp.menu_name ?? "-"}</td>
                    <td style={{ padding: "4px 6px", fontWeight: 600 }}>{fmtPrice(mp.lunch_price)}</td>
                    <td style={{ padding: "4px 6px", fontWeight: 600 }}>{fmtPrice(mp.dinner_price)}</td>
                    <td style={{ padding: "4px 6px" }}>{fmtPrice(mp.lunch_child_price)}</td>
                    <td style={{ padding: "4px 6px" }}>{fmtPrice(mp.dinner_child_price)}</td>
                    <td style={{ padding: "4px 6px", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={mp.course_1 ?? ""}>{mp.course_1 ?? "-"}</td>
                    <td style={{ padding: "4px 6px", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={mp.course_2 ?? ""}>{mp.course_2 ?? "-"}</td>
                    <td style={{ padding: "4px 6px", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={mp.course_3 ?? ""}>{mp.course_3 ?? "-"}</td>
                    <td style={{ padding: "4px 6px", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={mp.course_4 ?? ""}>{mp.course_4 ?? "-"}</td>
                    <td style={{ padding: "4px 6px", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={mp.course_5 ?? ""}>{mp.course_5 ?? "-"}</td>
                    <td style={{ padding: "4px 6px" }}>{mp.min_pax ?? "-"}</td>
                    <td style={{ padding: "4px 6px" }}>{mp.drink_included ?? "-"}</td>
                    <td style={{ padding: "4px 6px" }}>{mp.season_code ?? "-"}</td>
                    <td style={{ padding: "4px 6px", fontSize: "0.65rem" }}>
                      {mp.season_dates.length > 0
                        ? mp.season_dates.map((sd, idx) => (
                            <div key={idx}>{sd.date_from} ~ {sd.date_to}</div>
                          ))
                        : "-"}
                    </td>
                    <td style={{ padding: "4px 6px", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={mp.note ?? ""}>
                      {mp.note ?? "-"}
                    </td>
                  </tr>
                ))}
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
