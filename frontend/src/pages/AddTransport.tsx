import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createTransportCompany, updateTransportCompany, getTransportDetail, searchPlaces, getPlaceDetails } from "../api/client";
import type { PlacePrediction } from "../api/client";

interface TransportRow {
  code: string;
  price: number | null;
  product: string;
  bus_size: number | null;
  service_type: string;
  days: number | null;
  route_description: string;
  city: string;
  note: string;
}

function emptyTransportRow(): TransportRow {
  return {
    code: "",
    price: null,
    product: "",
    bus_size: null,
    service_type: "",
    days: null,
    route_description: "",
    city: "",
    note: "",
  };
}

const SERVICE_TYPES = ["Transfer", "Roundtrip", "Soiree", "Excursion", "Mise a Dispo"];
const BUS_SIZES = [7, 17, 30, 40, 54];

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 8,
  padding: "1.25rem",
  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
};

const inp: React.CSSProperties = {
  padding: "0.4rem 0.5rem",
  border: "1px solid #ddd",
  borderRadius: 4,
  fontSize: "0.85rem",
  width: "100%",
  boxSizing: "border-box",
};

const sel: React.CSSProperties = { ...inp, background: "#fff" };

const lbl: React.CSSProperties = {
  display: "block",
  marginBottom: "0.15rem",
  fontWeight: 600,
  fontSize: "0.72rem",
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: "0.3px",
};

const num: React.CSSProperties = { ...inp, width: 80, textAlign: "right" as const };

const dashedBtn: React.CSSProperties = {
  background: "none",
  border: "1px dashed #aaa",
  padding: "0.25rem 0.7rem",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: "0.78rem",
  color: "#666",
};

const xBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#b91c1c",
  cursor: "pointer",
  fontSize: "1rem",
  padding: "0 0.25rem",
  lineHeight: 1,
};

export default function AddTransport() {
  const navigate = useNavigate();
  const { companyId } = useParams<{ companyId: string }>();
  const isEdit = !!companyId;

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [rows, setRows] = useState<TransportRow[]>([emptyTransportRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Google Places autocomplete
  const [placePredictions, setPlacePredictions] = useState<PlacePrediction[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [showPlaces, setShowPlaces] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const placesRef = useRef<HTMLDivElement>(null);

  // Google Places search on name change
  useEffect(() => {
    if (isEdit || name.trim().length < 2) {
      setPlacePredictions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setPlacesLoading(true);
      try {
        const results = await searchPlaces(name.trim(), "ma");
        setPlacePredictions(results);
        setShowPlaces(results.length > 0);
      } catch {
        setPlacePredictions([]);
      } finally {
        setPlacesLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [name, isEdit]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showPlaces) return;
    const handleClick = (e: MouseEvent) => {
      if (placesRef.current && !placesRef.current.contains(e.target as Node)) {
        setShowPlaces(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPlaces]);

  async function handleSelectPlace(prediction: PlacePrediction) {
    setShowPlaces(false);
    setPlacePredictions([]);
    setLoadingDetails(true);
    try {
      const details = await getPlaceDetails(prediction.place_id);
      setName(details.name || prediction.description);
      if (details.city) setCity(details.city);
      if (details.phone) setPhone(details.phone);
    } catch {
      setName(prediction.description);
    } finally {
      setLoadingDetails(false);
    }
  }

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    getTransportDetail(Number(companyId))
      .then((d) => {
        setName(d.name);
        setCode(d.code);
        setCity(d.city);
        setPhone(d.phone ?? "");
        setEmail(d.email ?? "");
        if (d.transport_prices.length > 0) {
          setRows(
            d.transport_prices.map((tp) => ({
              code: tp.code ?? "",
              price: tp.price,
              product: tp.product ?? "",
              bus_size: tp.bus_size,
              service_type: tp.service_type ?? "",
              days: tp.days,
              route_description: tp.route_description ?? "",
              city: tp.city ?? "",
              note: tp.note ?? "",
            }))
          );
        }
      })
      .catch(() => setError("Failed to load transport company"))
      .finally(() => setLoading(false));
  }, [companyId, isEdit]);

  const updateRow = (idx: number, field: keyof TransportRow, value: string | number | null) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!name.trim() || !code.trim() || !city.trim()) {
      setError("Company Name, Code, and City are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: name.trim(),
        code: code.trim(),
        city: city.trim(),
        phone: phone || null,
        email: email || null,
        transport_prices: rows.map((r) => ({
          code: r.code || null,
          price: r.price,
          product: r.product || null,
          bus_size: r.bus_size,
          service_type: r.service_type || null,
          days: r.days,
          route_description: r.route_description || null,
          note: r.note || null,
          city: r.city || null,
        })),
      };
      if (isEdit) {
        await updateTransportCompany(Number(companyId), payload);
      } else {
        await createTransportCompany(payload);
      }
      navigate("/transportation");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p style={{ color: "#888", padding: "2rem" }}>Loading...</p>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ margin: 0 }}>{isEdit ? "Edit Transport Company" : "Add Transport Company"}</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => navigate("/transportation")}
            style={{ padding: "0.4rem 1rem", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: "0.8rem" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "0.4rem 1rem", borderRadius: 6, border: "none",
              background: "#2e7d32", color: "#fff", cursor: saving ? "default" : "pointer",
              fontSize: "0.8rem", fontWeight: 600, opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "0.5rem 1rem", borderRadius: 6, marginBottom: "1rem", fontSize: "0.8rem" }}>
          {error}
        </div>
      )}

      {/* Info section */}
      <div style={{ ...cardStyle, marginBottom: "1rem" }}>
        <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.9rem" }}>Company Info</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
          <div ref={placesRef} style={{ position: "relative" }}>
            <label style={lbl}>Company Name *</label>
            <input
              style={inp}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={() => { if (placePredictions.length > 0) setShowPlaces(true); }}
              placeholder="e.g. Transport Atlas"
            />
            {loadingDetails && (
              <span style={{ position: "absolute", right: 8, top: 24, fontSize: "0.7rem", color: "#888" }}>Loading...</span>
            )}
            {placesLoading && !loadingDetails && name.trim().length >= 2 && (
              <span style={{ position: "absolute", right: 8, top: 24, fontSize: "0.7rem", color: "#bbb" }}>Searching...</span>
            )}
            {showPlaces && placePredictions.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  zIndex: 200,
                  background: "#fff",
                  border: "1px solid #ddd",
                  borderTop: "none",
                  borderRadius: "0 0 6px 6px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                  maxHeight: 220,
                  overflowY: "auto",
                }}
              >
                {placePredictions.map((p) => (
                  <div
                    key={p.place_id}
                    onClick={() => handleSelectPlace(p)}
                    style={{
                      padding: "0.5rem 0.75rem",
                      cursor: "pointer",
                      fontSize: "0.82rem",
                      borderBottom: "1px solid #f0f0f0",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f4ff")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                  >
                    {p.description}
                  </div>
                ))}
                <div style={{ padding: "0.3rem 0.75rem", fontSize: "0.65rem", color: "#aaa", textAlign: "right" }}>
                  Powered by Google
                </div>
              </div>
            )}
          </div>
          <div>
            <label style={lbl}>Code *</label>
            <input style={inp} value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>City *</label>
            <input style={inp} value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Phone</label>
            <input style={inp} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Email</label>
            <input style={inp} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Transport Prices table */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h3 style={{ margin: 0, fontSize: "0.9rem" }}>Transport Prices</h3>
          <button style={dashedBtn} onClick={() => setRows((prev) => [...prev, emptyTransportRow()])}>+ Add Row</button>
        </div>

        {rows.length === 0 ? (
          <p style={{ color: "#888", textAlign: "center", padding: "1rem", fontSize: "0.8rem" }}>No price rows. Click "+ Add Row" to start.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
              <thead>
                <tr>
                  {["Code", "Price", "Product", "Bus Size", "Service Type", "Days", "Route", "City", "Note", ""].map((h) => (
                    <th key={h} style={{ padding: "0.4rem", textAlign: "left", borderBottom: "2px solid #e5e7eb", fontSize: "0.7rem", color: "#666", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "0.3rem" }}>
                      <input
                        style={{ ...inp, width: 80 }}
                        value={row.code}
                        onChange={(e) => updateRow(idx, "code", e.target.value)}
                      />
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <input
                        style={num}
                        type="number"
                        value={row.price ?? ""}
                        onChange={(e) => updateRow(idx, "price", e.target.value ? Number(e.target.value) : null)}
                      />
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <input
                        style={{ ...inp, minWidth: 100 }}
                        value={row.product}
                        onChange={(e) => updateRow(idx, "product", e.target.value)}
                      />
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <select
                        style={{ ...sel, width: 80 }}
                        value={row.bus_size ?? ""}
                        onChange={(e) => updateRow(idx, "bus_size", e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">-</option>
                        {BUS_SIZES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <select
                        style={{ ...sel, width: 120 }}
                        value={row.service_type}
                        onChange={(e) => updateRow(idx, "service_type", e.target.value)}
                      >
                        <option value="">-</option>
                        {SERVICE_TYPES.map((t) => (
                          <option key={t} value={t.toLowerCase().replace(/ /g, "_")}>{t}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <input
                        style={{ ...num, width: 60 }}
                        type="number"
                        value={row.days ?? ""}
                        onChange={(e) => updateRow(idx, "days", e.target.value ? Number(e.target.value) : null)}
                      />
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <input
                        style={{ ...inp, minWidth: 140 }}
                        value={row.route_description}
                        onChange={(e) => updateRow(idx, "route_description", e.target.value)}
                      />
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <input
                        style={{ ...inp, width: 90 }}
                        value={row.city}
                        onChange={(e) => updateRow(idx, "city", e.target.value)}
                      />
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <input
                        style={{ ...inp, minWidth: 80 }}
                        value={row.note}
                        onChange={(e) => updateRow(idx, "note", e.target.value)}
                      />
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <button style={xBtn} onClick={() => removeRow(idx)} title="Remove row">&times;</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
