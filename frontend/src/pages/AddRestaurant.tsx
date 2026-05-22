import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createRestaurant, updateRestaurant, getRestaurantDetail, searchPlaces, getPlaceDetails } from "../api/client";
import type { PlacePrediction } from "../api/client";

interface MenuRow {
  menu_name: string;
  description: string;
  lunch_price: number | null;
  dinner_price: number | null;
  lunch_child_price: number | null;
  dinner_child_price: number | null;
  course_1: string;
  course_2: string;
  course_3: string;
  course_4: string;
  course_5: string;
  min_pax: number | null;
  drink_included: string;
  season_code: string;
  note: string;
}

function emptyMenuRow(): MenuRow {
  return {
    menu_name: "",
    description: "",
    lunch_price: null,
    dinner_price: null,
    lunch_child_price: null,
    dinner_child_price: null,
    course_1: "",
    course_2: "",
    course_3: "",
    course_4: "",
    course_5: "",
    min_pax: null,
    drink_included: "",
    season_code: "",
    note: "",
  };
}

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

export default function AddRestaurant() {
  const navigate = useNavigate();
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const isEdit = !!restaurantId;

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [rows, setRows] = useState<MenuRow[]>([emptyMenuRow()]);
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
      if (details.address) setAddress(details.address);
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
    getRestaurantDetail(Number(restaurantId))
      .then((d) => {
        setName(d.name);
        setCity(d.city);
        setAddress(d.address ?? "");
        setPhone(d.phone ?? "");
        setEmail(d.email ?? "");
        if (d.menu_prices.length > 0) {
          setRows(
            d.menu_prices.map((mp) => ({
              menu_name: mp.menu_name ?? "",
              description: mp.description ?? "",
              lunch_price: mp.lunch_price,
              dinner_price: mp.dinner_price,
              lunch_child_price: mp.lunch_child_price,
              dinner_child_price: mp.dinner_child_price,
              course_1: mp.course_1 ?? "",
              course_2: mp.course_2 ?? "",
              course_3: mp.course_3 ?? "",
              course_4: mp.course_4 ?? "",
              course_5: mp.course_5 ?? "",
              min_pax: mp.min_pax,
              drink_included: mp.drink_included ?? "",
              season_code: mp.season_code ?? "",
              note: mp.note ?? "",
            }))
          );
        }
      })
      .catch(() => setError("Failed to load restaurant"))
      .finally(() => setLoading(false));
  }, [restaurantId, isEdit]);

  const updateRow = (idx: number, field: keyof MenuRow, value: string | number | null) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!name.trim() || !city.trim()) {
      setError("Name and City are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: name.trim(),
        city: city.trim(),
        address: address || null,
        phone: phone || null,
        email: email || null,
        menu_prices: rows.map((r) => ({
          menu_name: r.menu_name || null,
          description: r.description || null,
          lunch_price: r.lunch_price,
          dinner_price: r.dinner_price,
          lunch_child_price: r.lunch_child_price,
          dinner_child_price: r.dinner_child_price,
          course_1: r.course_1 || null,
          course_2: r.course_2 || null,
          course_3: r.course_3 || null,
          course_4: r.course_4 || null,
          course_5: r.course_5 || null,
          min_pax: r.min_pax,
          drink_included: r.drink_included || null,
          season_code: r.season_code || null,
          note: r.note || null,
          date_ranges: [],
        })),
      };
      if (isEdit) {
        await updateRestaurant(Number(restaurantId), payload);
      } else {
        await createRestaurant(payload);
      }
      navigate("/restaurants");
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
        <h2 style={{ margin: 0 }}>{isEdit ? "Edit Restaurant" : "Add Restaurant"}</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => navigate("/restaurants")}
            style={{ padding: "0.4rem 1rem", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: "0.8rem" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "0.4rem 1rem", borderRadius: 6, border: "none",
              background: "#1a1a2e", color: "#fff", cursor: saving ? "default" : "pointer",
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
        <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.9rem" }}>Restaurant Info</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div ref={placesRef} style={{ position: "relative" }}>
            <label style={lbl}>Name *</label>
            <input
              style={inp}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={() => { if (placePredictions.length > 0) setShowPlaces(true); }}
              placeholder="e.g. Restaurant Dar Zellij"
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
            <label style={lbl}>City *</label>
            <input style={inp} value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Address</label>
            <input style={inp} value={address} onChange={(e) => setAddress(e.target.value)} />
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

      {/* Menu Prices table */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h3 style={{ margin: 0, fontSize: "0.9rem" }}>Menu Prices</h3>
          <button style={dashedBtn} onClick={() => setRows((prev) => [...prev, emptyMenuRow()])}>+ Add Row</button>
        </div>

        {rows.length === 0 ? (
          <p style={{ color: "#888", textAlign: "center", padding: "1rem", fontSize: "0.8rem" }}>No menu price rows. Click "+ Add Row" to start.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
              <thead>
                <tr>
                  {["Menu Name", "Description", "Lunch", "Dinner", "Lunch CHD", "Dinner CHD", "Course 1", "Course 2", "Course 3", "Course 4", "Course 5", "Min Pax", "Drinks", "Season", "Note", ""].map((h) => (
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
                        style={{ ...inp, minWidth: 120 }}
                        value={row.menu_name}
                        onChange={(e) => updateRow(idx, "menu_name", e.target.value)}
                      />
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <input
                        style={{ ...inp, minWidth: 120 }}
                        value={row.description}
                        onChange={(e) => updateRow(idx, "description", e.target.value)}
                      />
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <input
                        style={num}
                        type="number"
                        value={row.lunch_price ?? ""}
                        onChange={(e) => updateRow(idx, "lunch_price", e.target.value ? Number(e.target.value) : null)}
                      />
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <input
                        style={num}
                        type="number"
                        value={row.dinner_price ?? ""}
                        onChange={(e) => updateRow(idx, "dinner_price", e.target.value ? Number(e.target.value) : null)}
                      />
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <input
                        style={num}
                        type="number"
                        value={row.lunch_child_price ?? ""}
                        onChange={(e) => updateRow(idx, "lunch_child_price", e.target.value ? Number(e.target.value) : null)}
                      />
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <input
                        style={num}
                        type="number"
                        value={row.dinner_child_price ?? ""}
                        onChange={(e) => updateRow(idx, "dinner_child_price", e.target.value ? Number(e.target.value) : null)}
                      />
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <input
                        style={{ ...inp, minWidth: 100 }}
                        value={row.course_1}
                        onChange={(e) => updateRow(idx, "course_1", e.target.value)}
                      />
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <input
                        style={{ ...inp, minWidth: 100 }}
                        value={row.course_2}
                        onChange={(e) => updateRow(idx, "course_2", e.target.value)}
                      />
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <input
                        style={{ ...inp, minWidth: 100 }}
                        value={row.course_3}
                        onChange={(e) => updateRow(idx, "course_3", e.target.value)}
                      />
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <input
                        style={{ ...inp, minWidth: 100 }}
                        value={row.course_4}
                        onChange={(e) => updateRow(idx, "course_4", e.target.value)}
                      />
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <input
                        style={{ ...inp, minWidth: 100 }}
                        value={row.course_5}
                        onChange={(e) => updateRow(idx, "course_5", e.target.value)}
                      />
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <input
                        style={{ ...num, width: 60 }}
                        type="number"
                        value={row.min_pax ?? ""}
                        onChange={(e) => updateRow(idx, "min_pax", e.target.value ? Number(e.target.value) : null)}
                      />
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <input
                        style={{ ...inp, width: 70 }}
                        value={row.drink_included}
                        onChange={(e) => updateRow(idx, "drink_included", e.target.value)}
                      />
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <input
                        style={{ ...inp, width: 80 }}
                        value={row.season_code}
                        onChange={(e) => updateRow(idx, "season_code", e.target.value)}
                      />
                    </td>
                    <td style={{ padding: "0.3rem" }}>
                      <input
                        style={{ ...inp, minWidth: 100 }}
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
