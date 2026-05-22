import { useEffect, useState, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import {
  confirmDocument,
  getParsedRows,
  deleteDocument,
  getDocumentAttachments,
  getDocumentAttachmentUrl,
  getDocumentFileUrl,
  type DocumentAttachment,
} from "../api/client";
import type { ParsedRow } from "../types";

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
        className="note-trigger"
        onClick={() => setOpen(true)}
        style={{
          cursor: "pointer",
          padding: "4px 6px",
          fontSize: "0.7rem",
          color: hasNote ? "#333" : "#bbb",
          maxWidth: 60,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {hasNote ? value!.slice(0, 15) + (value!.length > 15 ? "..." : "") : "+note"}
        {hasNote && (
          <div className="note-tooltip">
            {value}
          </div>
        )}
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
                background: "#696cff",
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
  rows: ParsedRow[];
  filename: string;
}

export default function Review() {
  const { documentId } = useParams<{ documentId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const state = location.state as LocationState | null;
  const [rows, setRows] = useState<ParsedRow[]>(state?.rows ?? []);
  const [filename, setFilename] = useState(state?.filename ?? "");
  const [loading, setLoading] = useState(!state);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Document preview state
  const [showPreview, setShowPreview] = useState(false);
  const [attachments, setAttachments] = useState<DocumentAttachment[]>([]);
  const [selectedAtt, setSelectedAtt] = useState(0);
  const [fileType, setFileType] = useState<string>("");

  // If no state (direct navigation / refresh), fetch rows from backend
  useEffect(() => {
    if (state || !documentId) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchRows = () => {
      setLoading(true);
      getParsedRows(Number(documentId))
        .then((res) => {
          if (cancelled) return;
          // Redirect to the correct review page if category doesn't match
          if (res.document_category === "restaurant") {
            navigate(`/review-restaurant/${documentId}`, {
              state: { menuRows: res.menu_rows, filename: res.filename },
              replace: true,
            });
            return;
          }
          if (res.document_category === "transportation") {
            navigate(`/review-transportation/${documentId}`, {
              state: { transportRows: res.transport_rows, filename: res.filename },
              replace: true,
            });
            return;
          }
          if (res.status === "processing") {
            // Still processing — poll again in 2s
            pollTimer = setTimeout(fetchRows, 2000);
          } else {
            setRows(res.rows);
            setFilename(res.filename);
            setFileType(res.filename.split(".").pop()?.toLowerCase() ?? "");
            setLoading(false);
          }
        })
        .catch((err) => {
          if (cancelled) return;
          const msg =
            err?.response?.data?.detail ?? "Failed to load document for review";
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

  // Set file type from state
  useEffect(() => {
    if (state?.filename) {
      setFileType(state.filename.split(".").pop()?.toLowerCase() ?? "");
    }
  }, [state]);

  // Load attachments when preview is opened
  useEffect(() => {
    if (!showPreview || !documentId) return;
    getDocumentAttachments(Number(documentId))
      .then((atts) => {
        setAttachments(atts);
        setSelectedAtt(0);
      })
      .catch(() => setAttachments([]));
  }, [showPreview, documentId]);

  const updateRow = (index: number, field: keyof ParsedRow, value: unknown) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const deleteRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = async () => {
    if (rows.length === 0) {
      alert("No rows to save. Add rows or discard the upload.");
      return;
    }
    setSaving(true);
    try {
      await confirmDocument(Number(documentId), rows);
      navigate("/prices");
    } catch {
      alert("Failed to save prices. Please try again.");
    }
    setSaving(false);
  };

  const handleDiscard = () => {
    if (confirm("Discard all parsed rows? The document will remain as pending_review.")) {
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

  if (loading) return <p>Loading document for review...</p>;

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
            background: "#696cff",
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

  // Determine what to show in preview
  const getPreviewUrl = (): string | null => {
    if (!documentId) return null;
    const isEmail = fileType === "eml" || fileType === "msg";
    if (isEmail && attachments.length > 0) {
      return getDocumentAttachmentUrl(Number(documentId), attachments[selectedAtt].index);
    }
    if (!isEmail) {
      return getDocumentFileUrl(Number(documentId));
    }
    return null;
  };

  const previewUrl = showPreview ? getPreviewUrl() : null;
  const currentAtt = attachments[selectedAtt];
  const canEmbed = currentAtt
    ? currentAtt.content_type === "application/pdf"
    : fileType === "pdf";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 3rem)" }}>
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.75rem",
          flexWrap: "wrap",
          gap: "0.5rem",
          flexShrink: 0,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Review: {filename}</h2>
          <p style={{ margin: "0.25rem 0 0", color: "#888", fontSize: "0.8rem" }}>
            {rows.length} row{rows.length !== 1 ? "s" : ""} parsed — edit or delete before saving
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => setShowPreview((p) => !p)}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: 6,
              border: showPreview ? "2px solid #696cff" : "1px solid #ccc",
              background: showPreview ? "rgba(105,108,255,0.08)" : "#fff",
              color: showPreview ? "#696cff" : "#555",
              cursor: "pointer",
              fontSize: "0.8rem",
              fontWeight: 600,
            }}
          >
            {showPreview ? "Hide Document" : "View Document"}
          </button>
          <button
            onClick={handleDelete}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: 6,
              border: "1px solid #ffcdd2",
              background: "#fff",
              color: "#c62828",
              cursor: "pointer",
              fontSize: "0.8rem",
            }}
          >
            Delete
          </button>
          <button
            onClick={handleDiscard}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: 6,
              border: "1px solid #ccc",
              background: "#fff",
              cursor: "pointer",
              fontSize: "0.8rem",
            }}
          >
            Discard
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: 6,
              border: "none",
              background: saving ? "#aaa" : "#4caf50",
              color: "#fff",
              cursor: saving ? "default" : "pointer",
              fontSize: "0.8rem",
              fontWeight: 600,
            }}
          >
            {saving ? "Saving..." : "Confirm & Save"}
          </button>
        </div>
      </div>

      {/* Main content: table + optional preview */}
      <div style={{ display: "flex", gap: "0.75rem", flex: 1, minHeight: 0 }}>
        {/* Table panel */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {rows.length === 0 ? (
            <p style={{ color: "#888", textAlign: "center", padding: "2rem" }}>
              All rows deleted. Click Discard to go back, or upload again.
            </p>
          ) : (
            <div style={{ overflowX: "auto", overflowY: "auto", flex: 1, borderRadius: 8, border: "1px solid #ddd" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  background: "#fff",
                  fontSize: "0.75rem",
                }}
              >
                <thead>
                  <tr>
                    {[
                      "#",
                      "Accommodation",
                      "City",
                      "Stars",
                      "Room",
                      "Type",
                      "Double",
                      "Single",
                      "Twin",
                      "Trp",
                      "Quad",
                      "Meal Plan",
                      "FIT/GIT",
                      "Season",
                      "Dates",
                      "Note",
                      "",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "0.5rem 0.5rem",
                          textAlign: "left",
                          background: "#696cff",
                          color: "#fff",
                          fontSize: "0.65rem",
                          whiteSpace: "nowrap",
                          position: "sticky",
                          top: 0,
                          zIndex: 2,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "4px 6px", color: "#aaa", fontSize: "0.65rem" }}>
                        {i + 1}
                      </td>
                      <td style={{ padding: "4px 4px", minWidth: 180 }}>
                        <input
                          style={inputStyle}
                          value={row.accommodation}
                          onChange={(e) => updateRow(i, "accommodation", e.target.value)}
                        />
                      </td>
                      <td style={{ padding: "4px 4px", minWidth: 100 }}>
                        <input
                          style={inputStyle}
                          value={row.city}
                          onChange={(e) => updateRow(i, "city", e.target.value)}
                        />
                      </td>
                      <td style={{ padding: "4px 4px" }}>
                        <input
                          style={numberInputStyle}
                          type="number"
                          min={1}
                          max={5}
                          value={row.stars ?? ""}
                          onChange={(e) =>
                            updateRow(i, "stars", e.target.value ? Number(e.target.value) : null)
                          }
                        />
                      </td>
                      <td style={{ padding: "4px 4px", minWidth: 100 }}>
                        <input
                          style={inputStyle}
                          value={row.room_desc ?? ""}
                          onChange={(e) =>
                            updateRow(i, "room_desc", e.target.value || null)
                          }
                        />
                      </td>
                      <td style={{ padding: "4px 4px", minWidth: 70 }}>
                        <input
                          style={inputStyle}
                          value={row.hotel_type ?? ""}
                          onChange={(e) =>
                            updateRow(i, "hotel_type", e.target.value || null)
                          }
                        />
                      </td>
                      <td style={{ padding: "4px 4px" }}>
                        <input
                          style={numberInputStyle}
                          type="number"
                          step="0.01"
                          value={row.double_price ?? ""}
                          onChange={(e) =>
                            updateRow(i, "double_price", e.target.value ? Number(e.target.value) : null)
                          }
                        />
                      </td>
                      <td style={{ padding: "4px 4px" }}>
                        <input
                          style={numberInputStyle}
                          type="number"
                          step="0.01"
                          value={row.single_price ?? ""}
                          onChange={(e) =>
                            updateRow(
                              i,
                              "single_price",
                              e.target.value ? Number(e.target.value) : null
                            )
                          }
                        />
                      </td>
                      <td style={{ padding: "4px 4px" }}>
                        <input
                          style={numberInputStyle}
                          type="number"
                          step="0.01"
                          value={row.twin_price ?? ""}
                          onChange={(e) =>
                            updateRow(i, "twin_price", e.target.value ? Number(e.target.value) : null)
                          }
                        />
                      </td>
                      <td style={{ padding: "4px 4px" }}>
                        <input
                          style={numberInputStyle}
                          type="number"
                          step="0.01"
                          value={row.triple_price ?? ""}
                          onChange={(e) =>
                            updateRow(i, "triple_price", e.target.value ? Number(e.target.value) : null)
                          }
                        />
                      </td>
                      <td style={{ padding: "4px 4px" }}>
                        <input
                          style={numberInputStyle}
                          type="number"
                          step="0.01"
                          value={row.quadruple_price ?? ""}
                          onChange={(e) =>
                            updateRow(i, "quadruple_price", e.target.value ? Number(e.target.value) : null)
                          }
                        />
                      </td>
                      <td style={{ padding: "4px 4px" }}>
                        <select
                          style={{ ...inputStyle, width: 70 }}
                          value={row.meal_plan ?? ""}
                          onChange={(e) =>
                            updateRow(i, "meal_plan", e.target.value || null)
                          }
                        >
                          <option value="">--</option>
                          <option value="BB">BB</option>
                          <option value="HB">HB</option>
                          <option value="FB">FB</option>
                          <option value="AI">AI</option>
                          <option value="RO">RO</option>
                        </select>
                      </td>
                      <td style={{ padding: "4px 4px" }}>
                        <select
                          style={{ ...inputStyle, width: 60 }}
                          value={row.fit_git ?? ""}
                          onChange={(e) =>
                            updateRow(i, "fit_git", e.target.value || null)
                          }
                        >
                          <option value="">--</option>
                          <option value="I">I</option>
                          <option value="G">G</option>
                        </select>
                      </td>
                      <td style={{ padding: "4px 4px", minWidth: 70 }}>
                        <input
                          style={inputStyle}
                          value={row.season_code ?? ""}
                          onChange={(e) =>
                            updateRow(i, "season_code", e.target.value || null)
                          }
                        />
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
                              onClick={() => {
                                const updated = [...row.date_ranges, { date_from: null, date_to: null }];
                                updateRow(i, "date_ranges", updated);
                              }}
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
                        <NoteCell
                          value={row.note ?? null}
                          onChange={(v) => updateRow(i, "note", v)}
                        />
                      </td>
                      <td style={{ padding: "4px 4px" }}>
                        <button
                          onClick={() => deleteRow(i)}
                          title="Delete row"
                          style={{
                            background: "none",
                            border: "none",
                            color: "#c62828",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                            fontWeight: "bold",
                            padding: "2px 6px",
                          }}
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

        {/* Document preview panel */}
        {showPreview && (
          <div
            style={{
              width: 500,
              minWidth: 400,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              background: "#fff",
              border: "1px solid #e8e8e8",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {/* Attachment tabs for emails */}
            {attachments.length > 1 && (
              <div
                style={{
                  display: "flex",
                  gap: 0,
                  borderBottom: "1px solid #e8e8e8",
                  background: "#fafafa",
                  overflowX: "auto",
                  flexShrink: 0,
                }}
              >
                {attachments.map((att, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedAtt(idx)}
                    style={{
                      padding: "6px 12px",
                      border: "none",
                      borderBottom: selectedAtt === idx ? "2px solid #696cff" : "2px solid transparent",
                      background: selectedAtt === idx ? "#fff" : "transparent",
                      color: selectedAtt === idx ? "#696cff" : "#555",
                      fontWeight: selectedAtt === idx ? 600 : 400,
                      fontSize: "0.75rem",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {att.filename}
                  </button>
                ))}
              </div>
            )}

            {/* Single attachment header */}
            {attachments.length === 1 && (
              <div
                style={{
                  padding: "6px 12px",
                  borderBottom: "1px solid #e8e8e8",
                  background: "#fafafa",
                  fontSize: "0.75rem",
                  color: "#555",
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {attachments[0].filename}
              </div>
            )}

            {/* No attachments */}
            {attachments.length === 0 && (fileType === "eml" || fileType === "msg") && (
              <div style={{ padding: "2rem", textAlign: "center", color: "#999", fontSize: "0.85rem" }}>
                No attachments found in this email.
              </div>
            )}

            {/* Preview content */}
            {previewUrl && canEmbed ? (
              <iframe
                src={previewUrl}
                style={{
                  flex: 1,
                  border: "none",
                  width: "100%",
                }}
                title="Document preview"
              />
            ) : previewUrl && !canEmbed ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1rem", padding: "2rem" }}>
                <p style={{ color: "#888", fontSize: "0.85rem", textAlign: "center" }}>
                  This file type ({currentAtt?.filename.split(".").pop()?.toUpperCase() ?? fileType.toUpperCase()}) cannot be previewed in the browser.
                </p>
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "0.5rem 1.5rem",
                    background: "#696cff",
                    color: "#fff",
                    borderRadius: 6,
                    textDecoration: "none",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  Download to View
                </a>
              </div>
            ) : !previewUrl && fileType !== "eml" && fileType !== "msg" ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>
                Loading preview...
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
