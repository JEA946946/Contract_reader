import { useEffect, useState, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { confirmRestaurantDocument, getParsedRows, deleteDocument } from "../api/client";
import type { ParsedMenuRow } from "../types";

function NoteCell({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(value ?? "");
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, value]);

  const hasNote = value && value.trim().length > 0;

  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={() => setOpen(true)}
        style={{
          cursor: "pointer",
          padding: "4px 6px",
          fontSize: "0.7rem",
          color: hasNote ? "#1a1a2e" : "#bbb",
          maxWidth: 60,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {hasNote ? value!.slice(0, 15) + (value!.length > 15 ? "..." : "") : "+note"}
      </div>
      {open && (
        <div
          ref={ref}
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            zIndex: 100,
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            padding: "0.5rem",
            width: 280,
          }}
        >
          <textarea
            autoFocus
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 8px",
              border: "1px solid #ddd",
              borderRadius: 4,
              fontSize: "0.7rem",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              onClick={() => setOpen(false)}
              style={{
                padding: "3px 10px",
                fontSize: "0.55rem",
                border: "1px solid #ccc",
                borderRadius: 4,
                background: "#fff",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onChange(draft.trim() || null);
                setOpen(false);
              }}
              style={{
                padding: "3px 10px",
                fontSize: "0.55rem",
                border: "none",
                borderRadius: 4,
                background: "#1a1a2e",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface LocationState {
  menuRows: ParsedMenuRow[];
  filename: string;
}

export default function RestaurantReview() {
  const { documentId } = useParams<{ documentId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const state = location.state as LocationState | null;
  const [rows, setRows] = useState<ParsedMenuRow[]>(state?.menuRows ?? []);
  const [filename, setFilename] = useState(state?.filename ?? "");
  const [loading, setLoading] = useState(!state);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (state || !documentId) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchRows = () => {
      setLoading(true);
      getParsedRows(Number(documentId))
        .then((res) => {
          if (cancelled) return;
          if (res.status === "processing") {
            pollTimer = setTimeout(fetchRows, 2000);
          } else {
            setRows(res.menu_rows || []);
            setFilename(res.filename);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (cancelled) return;
          const msg = err?.response?.data?.detail ?? "Failed to load document for review";
          setError(msg);
          setLoading(false);
        });
    };

    fetchRows();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [documentId, state]);

  const updateRow = (index: number, field: keyof ParsedMenuRow, value: unknown) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const deleteRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = async () => {
    if (rows.length === 0) {
      alert("No rows to save.");
      return;
    }
    setSaving(true);
    try {
      await confirmRestaurantDocument(Number(documentId), rows);
      navigate("/restaurants");
    } catch {
      alert("Failed to save menu prices. Please try again.");
    }
    setSaving(false);
  };

  const handleDiscard = () => {
    if (confirm("Discard all parsed rows?")) {
      navigate("/review");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this document and its uploaded file? This cannot be undone.")) return;
    try {
      await deleteDocument(Number(documentId));
      navigate("/review");
    } catch {
      alert("Failed to delete document.");
    }
  };

  if (loading) return <p>Loading restaurant document for review...</p>;

  if (error) {
    return (
      <div style={{ textAlign: "center", padding: "3rem" }}>
        <h2>Cannot review this document</h2>
        <p style={{ color: "#888" }}>{error}</p>
        <button
          onClick={() => navigate("/review")}
          style={{
            marginTop: "1rem",
            padding: "0.5rem 1.5rem",
            background: "#e94560",
            color: "#fff",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
          }}
        >
          Back to Review List
        </button>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "4px 6px",
    border: "1px solid #ddd",
    borderRadius: 4,
    fontSize: "0.7rem",
    boxSizing: "border-box",
  };

  const numberInputStyle: React.CSSProperties = {
    ...inputStyle,
    width: 80,
  };

  const courseInputStyle: React.CSSProperties = {
    ...inputStyle,
    width: 120,
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Restaurant Review: {filename}</h2>
          <p style={{ margin: "0.25rem 0 0", color: "#888", fontSize: "0.8rem" }}>
            {rows.length} menu row{rows.length !== 1 ? "s" : ""} parsed — edit or delete before saving
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={handleDelete} style={{ padding: "0.5rem 1.25rem", borderRadius: 6, border: "1px solid #ffcdd2", background: "#fff", color: "#c62828", cursor: "pointer", fontSize: "0.8rem" }}>
            Delete Document
          </button>
          <button onClick={handleDiscard} style={{ padding: "0.5rem 1.25rem", borderRadius: 6, border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontSize: "0.8rem" }}>
            Discard
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            style={{ padding: "0.5rem 1.25rem", borderRadius: 6, border: "none", background: saving ? "#aaa" : "#4caf50", color: "#fff", cursor: saving ? "default" : "pointer", fontSize: "0.8rem", fontWeight: 600 }}
          >
            {saving ? "Saving..." : "Confirm & Save"}
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p style={{ color: "#888", textAlign: "center", padding: "2rem" }}>
          All rows deleted. Click Discard to go back, or upload again.
        </p>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #ddd" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", fontSize: "0.75rem" }}>
            <thead>
              <tr>
                {["#", "Restaurant", "City", "Menu Name", "Lunch", "Dinner", "Lunch CHD", "Dinner CHD", "Course 1", "Course 2", "Course 3", "Course 4", "Course 5", "Min Pax", "Drinks", "Season", "Dates", "Note", ""].map((h) => (
                  <th key={h} style={{ padding: "0.5rem", textAlign: "left", background: "#1a1a2e", color: "#fff", fontSize: "0.65rem", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "4px 6px", color: "#aaa", fontSize: "0.65rem" }}>{i + 1}</td>
                  <td style={{ padding: "4px 4px", minWidth: 160 }}>
                    <input style={inputStyle} value={row.restaurant_name} onChange={(e) => updateRow(i, "restaurant_name", e.target.value)} />
                  </td>
                  <td style={{ padding: "4px 4px", minWidth: 100 }}>
                    <input style={inputStyle} value={row.city} onChange={(e) => updateRow(i, "city", e.target.value)} />
                  </td>
                  <td style={{ padding: "4px 4px", minWidth: 120 }}>
                    <input style={inputStyle} value={row.menu_name ?? ""} onChange={(e) => updateRow(i, "menu_name", e.target.value || null)} />
                  </td>
                  <td style={{ padding: "4px 4px" }}>
                    <input style={numberInputStyle} type="number" step="0.01" value={row.lunch_price ?? ""} onChange={(e) => updateRow(i, "lunch_price", e.target.value ? Number(e.target.value) : null)} />
                  </td>
                  <td style={{ padding: "4px 4px" }}>
                    <input style={numberInputStyle} type="number" step="0.01" value={row.dinner_price ?? ""} onChange={(e) => updateRow(i, "dinner_price", e.target.value ? Number(e.target.value) : null)} />
                  </td>
                  <td style={{ padding: "4px 4px" }}>
                    <input style={numberInputStyle} type="number" step="0.01" value={row.lunch_child_price ?? ""} onChange={(e) => updateRow(i, "lunch_child_price", e.target.value ? Number(e.target.value) : null)} />
                  </td>
                  <td style={{ padding: "4px 4px" }}>
                    <input style={numberInputStyle} type="number" step="0.01" value={row.dinner_child_price ?? ""} onChange={(e) => updateRow(i, "dinner_child_price", e.target.value ? Number(e.target.value) : null)} />
                  </td>
                  <td style={{ padding: "4px 4px" }}>
                    <input style={courseInputStyle} value={row.course_1 ?? ""} onChange={(e) => updateRow(i, "course_1", e.target.value || null)} />
                  </td>
                  <td style={{ padding: "4px 4px" }}>
                    <input style={courseInputStyle} value={row.course_2 ?? ""} onChange={(e) => updateRow(i, "course_2", e.target.value || null)} />
                  </td>
                  <td style={{ padding: "4px 4px" }}>
                    <input style={courseInputStyle} value={row.course_3 ?? ""} onChange={(e) => updateRow(i, "course_3", e.target.value || null)} />
                  </td>
                  <td style={{ padding: "4px 4px" }}>
                    <input style={courseInputStyle} value={row.course_4 ?? ""} onChange={(e) => updateRow(i, "course_4", e.target.value || null)} />
                  </td>
                  <td style={{ padding: "4px 4px" }}>
                    <input style={courseInputStyle} value={row.course_5 ?? ""} onChange={(e) => updateRow(i, "course_5", e.target.value || null)} />
                  </td>
                  <td style={{ padding: "4px 4px" }}>
                    <input style={{ ...numberInputStyle, width: 60 }} type="number" value={row.min_pax ?? ""} onChange={(e) => updateRow(i, "min_pax", e.target.value ? Number(e.target.value) : null)} />
                  </td>
                  <td style={{ padding: "4px 4px" }}>
                    <select style={{ ...inputStyle, width: 100 }} value={row.drink_included ?? ""} onChange={(e) => updateRow(i, "drink_included", e.target.value || null)}>
                      <option value="">--</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                      <option value="wine_included">Wine incl.</option>
                      <option value="soft_drinks_only">Soft only</option>
                    </select>
                  </td>
                  <td style={{ padding: "4px 4px", minWidth: 70 }}>
                    <input style={inputStyle} value={row.season_code ?? ""} onChange={(e) => updateRow(i, "season_code", e.target.value || null)} />
                  </td>
                  <td style={{ padding: "4px 4px", minWidth: 140 }}>
                    {(row.date_ranges ?? []).length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {row.date_ranges.map((dr, di) => (
                          <div key={di} style={{ display: "flex", alignItems: "center", gap: 2, fontSize: "0.65rem" }}>
                            <input
                              type="date"
                              style={{ ...inputStyle, width: 110, fontSize: "0.6rem", padding: "2px 3px" }}
                              value={dr.date_from ?? ""}
                              onChange={(e) => {
                                const updated = [...row.date_ranges];
                                updated[di] = { ...updated[di], date_from: e.target.value || null };
                                updateRow(i, "date_ranges", updated);
                              }}
                            />
                            <span style={{ color: "#999" }}>~</span>
                            <input
                              type="date"
                              style={{ ...inputStyle, width: 110, fontSize: "0.6rem", padding: "2px 3px" }}
                              value={dr.date_to ?? ""}
                              onChange={(e) => {
                                const updated = [...row.date_ranges];
                                updated[di] = { ...updated[di], date_to: e.target.value || null };
                                updateRow(i, "date_ranges", updated);
                              }}
                            />
                            <button
                              onClick={() => {
                                const updated = row.date_ranges.filter((_, idx) => idx !== di);
                                updateRow(i, "date_ranges", updated);
                              }}
                              style={{ background: "none", border: "none", color: "#c62828", cursor: "pointer", fontSize: "0.7rem", padding: "0 2px" }}
                            >x</button>
                          </div>
                        ))}
                        <button
                          onClick={() => updateRow(i, "date_ranges", [...row.date_ranges, { date_from: null, date_to: null }])}
                          style={{ background: "none", border: "1px solid #ddd", borderRadius: 3, cursor: "pointer", fontSize: "0.55rem", color: "#666", padding: "1px 4px", alignSelf: "flex-start" }}
                        >+ range</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => updateRow(i, "date_ranges", [{ date_from: null, date_to: null }])}
                        style={{ background: "none", border: "1px solid #ddd", borderRadius: 3, cursor: "pointer", fontSize: "0.6rem", color: "#888", padding: "2px 6px" }}
                      >+ Add dates</button>
                    )}
                  </td>
                  <td style={{ padding: "4px 4px", minWidth: 60 }}>
                    <NoteCell value={row.note ?? null} onChange={(v) => updateRow(i, "note", v)} />
                  </td>
                  <td style={{ padding: "4px 4px" }}>
                    <button
                      onClick={() => deleteRow(i)}
                      title="Delete row"
                      style={{ background: "none", border: "none", color: "#c62828", cursor: "pointer", fontSize: "0.8rem", fontWeight: "bold", padding: "2px 6px" }}
                    >
                      x
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
