import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listHotels, deleteHotel, pushHotelToCmr } from "../api/client";
import type { Hotel } from "../types";

type SortKey = "id" | "name" | "city" | "stars" | "type";
type SortDir = "asc" | "desc";

export default function Hotels() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [pushingId, setPushingId] = useState<number | null>(null);
  const [snackbar, setSnackbar] = useState<{ msg: string; ok: boolean } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    listHotels()
      .then((data) => {
        if (!cancelled) setHotels(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    let result = hotels;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (h) =>
          h.name.toLowerCase().includes(q) ||
          (h.city || "").toLowerCase().includes(q) ||
          (h.email || "").toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "id") {
        cmp = a.id - b.id;
      } else if (sortKey === "stars") {
        cmp = (a.stars ?? 0) - (b.stars ?? 0);
      } else {
        const av = (a[sortKey] || "").toLowerCase();
        const bv = (b[sortKey] || "").toLowerCase();
        cmp = av.localeCompare(bv);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [hotels, search, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleDelete = async (hotel: Hotel) => {
    if (!confirm(`Delete "${hotel.name}"? This will also remove all its prices.`)) return;
    try {
      await deleteHotel(hotel.id);
      setHotels((prev) => prev.filter((h) => h.id !== hotel.id));
    } catch {
      alert("Failed to delete hotel");
    }
  };

  const handlePush = async (hotel: Hotel) => {
    setPushingId(hotel.id);
    try {
      const res = await pushHotelToCmr(hotel.id);
      setSnackbar({ msg: res.message, ok: true });
      // Update local state with the cmr_supplier_id
      if (res.cmr_supplier_id) {
        setHotels((prev) =>
          prev.map((h) =>
            h.id === hotel.id ? { ...h, cmr_supplier_id: res.cmr_supplier_id } : h
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

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h2 style={{ margin: 0 }}>Hotels ({filtered.length})</h2>
        <Link
          to="/add-hotel"
          style={{
            padding: "0.45rem 1rem",
            background: "#e94560",
            color: "#fff",
            borderRadius: 6,
            textDecoration: "none",
            fontWeight: 600,
            fontSize: "0.65rem",
          }}
        >
          + Add Hotel
        </Link>
      </div>

      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: "1rem 1.5rem",
          marginBottom: "1rem",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        <input
          type="text"
          placeholder="Search by name, city, or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "0.6rem 1rem",
            border: "1px solid #ddd",
            borderRadius: 8,
            fontSize: "0.65rem",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      <div
        style={{
          overflowX: "auto",
          borderRadius: 8,
          border: "1px solid #ddd",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
          <thead>
            <tr>
              {(
                [
                  ["id", "#"],
                  ["name", "Name"],
                  ["city", "City"],
                  ["stars", "Stars"],
                  ["type", "Type"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => handleSort(key)}
                  style={{
                    ...thStyle,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  {label}{arrow(key)}
                </th>
              ))}
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Phone</th>
              <th style={{ ...thStyle, width: 140 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: "2rem", textAlign: "center", color: "#888" }}>
                  {hotels.length === 0 ? "No hotels added yet." : "No hotels match your search."}
                </td>
              </tr>
            )}
            {filtered.map((hotel) => (
              <tr
                key={hotel.id}
                onClick={() => navigate(`/edit-hotel/${hotel.id}`)}
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fa")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                <td style={{ ...tdStyle, color: "#888", fontSize: "0.6rem" }}>
                  {hotel.id}
                </td>
                <td style={tdStyle}>
                  <strong>{hotel.name}</strong>
                </td>
                <td style={tdStyle}>{hotel.city || "-"}</td>
                <td style={tdStyle}>{hotel.stars ? "★".repeat(hotel.stars) : "-"}</td>
                <td style={tdStyle}>{hotel.type || "-"}</td>
                <td style={tdStyle}>{hotel.email || "-"}</td>
                <td style={tdStyle}>{hotel.phone || "-"}</td>
                <td style={{ ...tdStyle, display: "flex", gap: "0.3rem" }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePush(hotel);
                    }}
                    disabled={pushingId === hotel.id}
                    style={{
                      background: "none",
                      border: `1px solid ${hotel.cmr_supplier_id ? "#059669" : "#2563eb"}`,
                      color: hotel.cmr_supplier_id ? "#059669" : "#2563eb",
                      borderRadius: 6,
                      padding: "0.25rem 0.6rem",
                      cursor: pushingId === hotel.id ? "default" : "pointer",
                      fontSize: "0.6rem",
                      opacity: pushingId === hotel.id ? 0.6 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {pushingId === hotel.id
                      ? "Syncing..."
                      : hotel.cmr_supplier_id
                        ? "Update CRM"
                        : "Push to CRM"}
                  </button>
                  {hotel.cmr_supplier_id && (
                    <a
                      href="https://crm.vmmorocco.com/suppliers?category=Accommodation"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        background: "none",
                        border: "1px solid #059669",
                        color: "#059669",
                        borderRadius: 6,
                        padding: "0.25rem 0.6rem",
                        fontSize: "0.6rem",
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      CRM
                    </a>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(hotel);
                    }}
                    style={{
                      background: "none",
                      border: "1px solid #e94560",
                      color: "#e94560",
                      borderRadius: 6,
                      padding: "0.25rem 0.6rem",
                      cursor: "pointer",
                      fontSize: "0.6rem",
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "0.6rem 0.75rem",
  fontSize: "0.6rem",
  fontWeight: 600,
  whiteSpace: "nowrap",
  background: "#1a1a2e",
  color: "#fff",
};

const tdStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  fontSize: "0.65rem",
  borderBottom: "1px solid #eee",
};
