import { useEffect, useState, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { confirmTransportDocument, getParsedRows, deleteDocument } from "../api/client";
import type { ParsedTransportRow } from "../types";

const SERVICE_TYPES = [
  { value: "transfer", label: "Transfer", color: "#e3f2fd", textColor: "#1565c0" },
  { value: "roundtrip", label: "Roundtrip", color: "#e8f5e9", textColor: "#2e7d32" },
  { value: "soiree", label: "Soiree", color: "#fce4ec", textColor: "#c62828" },
  { value: "excursion", label: "Excursion", color: "#fff3e0", textColor: "#e65100" },
  { value: "mise_a_dispo", label: "Mise a Dispo", color: "#f3e5f5", textColor: "#7b1fa2" },
];

function NoteCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(value);
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
        {hasNote ? value.slice(0, 15) + (value.length > 15 ? "..." : "") : "+note"}
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
                onChange(draft.trim());
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
  transportRows: ParsedTransportRow[];
  filename: string;
}

export default function TransportReview() {
  const { documentId } = useParams<{ documentId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const state = location.state as LocationState | null;
  const [rows, setRows] = useState<ParsedTransportRow[]>(state?.transportRows ?? []);
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
            setRows(res.transport_rows || []);
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

  const updateRow = (index: number, field: keyof ParsedTransportRow, value: unknown) => {
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
      await confirmTransportDocument(Number(documentId), rows);
      navigate("/transportation");
    } catch {
      alert("Failed to save transport prices. Please try again.");
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

  if (loading) return <p>Loading transportation document for review...</p>;

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
            background: "#4caf50",
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
          <h2 style={{ margin: 0 }}>Transportation Review: {filename}</h2>
          <p style={{ margin: "0.25rem 0 0", color: "#888", fontSize: "0.8rem" }}>
            {rows.length} transport row{rows.length !== 1 ? "s" : ""} parsed — edit or delete before saving
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
                {["#", "Code", "Price", "Company Code", "Company Name", "Product", "Bus Size", "Service Type", "Days", "Route", "Note", "City", ""].map((h) => (
                  <th key={h} style={{ padding: "0.5rem", textAlign: "left", background: "#2e7d32", color: "#fff", fontSize: "0.65rem", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const typeInfo = SERVICE_TYPES.find((t) => t.value === row.service_type);
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "4px 6px", color: "#aaa", fontSize: "0.65rem" }}>{i + 1}</td>
                    <td style={{ padding: "4px 4px", minWidth: 100 }}>
                      <input style={inputStyle} value={row.code} onChange={(e) => updateRow(i, "code", e.target.value)} />
                    </td>
                    <td style={{ padding: "4px 4px" }}>
                      <input style={numberInputStyle} type="number" step="0.01" value={row.price ?? ""} onChange={(e) => updateRow(i, "price", e.target.value ? Number(e.target.value) : null)} />
                    </td>
                    <td style={{ padding: "4px 4px", minWidth: 80 }}>
                      <input style={inputStyle} value={row.company_code} onChange={(e) => updateRow(i, "company_code", e.target.value)} />
                    </td>
                    <td style={{ padding: "4px 4px", minWidth: 140 }}>
                      <input style={inputStyle} value={row.company_name} onChange={(e) => updateRow(i, "company_name", e.target.value)} />
                    </td>
                    <td style={{ padding: "4px 4px", minWidth: 120 }}>
                      <input style={inputStyle} value={row.product} onChange={(e) => updateRow(i, "product", e.target.value)} />
                    </td>
                    <td style={{ padding: "4px 4px" }}>
                      <input style={{ ...numberInputStyle, width: 60 }} type="number" value={row.bus_size ?? ""} onChange={(e) => updateRow(i, "bus_size", e.target.value ? Number(e.target.value) : null)} />
                    </td>
                    <td style={{ padding: "4px 4px" }}>
                      <select
                        style={{
                          ...inputStyle,
                          width: 130,
                          background: typeInfo?.color ?? "#f5f5f5",
                          color: typeInfo?.textColor ?? "#333",
                          fontWeight: 600,
                        }}
                        value={row.service_type}
                        onChange={(e) => updateRow(i, "service_type", e.target.value)}
                      >
                        {SERVICE_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "4px 4px" }}>
                      <input style={{ ...numberInputStyle, width: 50 }} type="number" value={row.days ?? ""} onChange={(e) => updateRow(i, "days", e.target.value ? Number(e.target.value) : null)} />
                    </td>
                    <td style={{ padding: "4px 4px", minWidth: 180 }}>
                      <input style={inputStyle} value={row.route_description} onChange={(e) => updateRow(i, "route_description", e.target.value)} />
                    </td>
                    <td style={{ padding: "4px 4px", minWidth: 60 }}>
                      <NoteCell value={row.note} onChange={(v) => updateRow(i, "note", v)} />
                    </td>
                    <td style={{ padding: "4px 4px", minWidth: 100 }}>
                      <input style={inputStyle} value={row.city} onChange={(e) => updateRow(i, "city", e.target.value)} />
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
