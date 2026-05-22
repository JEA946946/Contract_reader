import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import FolderSidebar, { type SelectedFolder } from "../components/FolderSidebar";
import type { Document, ManagedCity } from "../types";
import {
  getDocuments,
  getFolderDocuments,
  getUnfiledDocuments,
  deleteDocument,
  updateDocumentEntity,
  getEmailByDocument,
  getManagedCities,
  batchReparseDocuments,
} from "../api/client";

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  processing: { bg: "#fff3e0", color: "#e65100" },
  pending_review: { bg: "#e3f2fd", color: "#1565c0" },
  completed: { bg: "#e8f5e9", color: "#2e7d32" },
  failed: { bg: "#ffebee", color: "#c62828" },
};

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  hotel: { bg: "#e3f2fd", color: "#1565c0" },
  restaurant: { bg: "#fce4ec", color: "#c62828" },
  transportation: { bg: "#e8f5e9", color: "#2e7d32" },
};

const CATEGORY_LABEL: Record<string, string> = {
  hotel: "Hotel",
  restaurant: "Restaurant",
  transportation: "Transport",
};

export default function Contracts() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<SelectedFolder>({ type: "all" });
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editCity, setEditCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [managedCities, setManagedCities] = useState<ManagedCity[]>([]);
  const [allDocs, setAllDocs] = useState<Document[]>([]);
  const [reprocessing, setReprocessing] = useState(false);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      let result: Document[];
      if (selected.type === "all" || selected.type === "status") {
        result = await getDocuments();
      } else if (selected.type === "unfiled") {
        result = await getUnfiledDocuments();
      } else {
        result = await getFolderDocuments(selected.id);
      }
      setDocs(result);
      // Keep allDocs in sync for sidebar counts (always from full list)
      if (selected.type === "all" || selected.type === "status") {
        setAllDocs(result);
      }
    } catch {
      setDocs([]);
    }
    setLoading(false);
  }, [selected]);

  // Fetch allDocs on mount for sidebar counts
  useEffect(() => {
    getDocuments().then(setAllDocs).catch(() => {});
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  useEffect(() => {
    getManagedCities().then(setManagedCities).catch(() => {});
  }, []);

  const unfiledCount = docs.filter((d) => d.folder_id === null).length;

  const activeStatus = selected.type === "status" ? selected.status : null;

  // Apply status filter first (from sidebar selection), then search
  const statusFiltered = !activeStatus
    ? docs
    : activeStatus === "zero_rows"
      ? docs.filter((d) => (d.row_count === 0 || d.row_count === null) && d.status !== "processing")
      : docs.filter((d) => d.status === activeStatus);

  const filtered = search.trim()
    ? statusFiltered.filter(
        (d) =>
          d.filename.toLowerCase().includes(search.toLowerCase()) ||
          (d.hotel_name ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : statusFiltered;

  // Sidebar counts from allDocs (global, not affected by folder/search)
  const statusCounts = {
    pending_review: allDocs.filter((d) => d.status === "pending_review").length,
    completed: allDocs.filter((d) => d.status === "completed").length,
    failed: allDocs.filter((d) => d.status === "failed").length,
    zero_rows: allDocs.filter((d) => (d.row_count === 0 || d.row_count === null) && d.status !== "processing").length,
    processing: allDocs.filter((d) => d.status === "processing").length,
  };

  const handleBatchReprocess = async () => {
    if (activeStatus !== "failed" && activeStatus !== "zero_rows") return;
    setReprocessing(true);
    try {
      const result = await batchReparseDocuments(activeStatus as "failed" | "zero_rows");
      alert(result.message);
      fetchDocs();
      // Refresh allDocs for sidebar counts
      getDocuments().then(setAllDocs).catch(() => {});
    } catch {
      alert("Batch reprocess failed");
    }
    setReprocessing(false);
  };

  const getRetryCount = (notes: string | null): number => {
    if (!notes) return 0;
    return (notes.match(/Auto-retry #\d+/g) || []).length;
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("Delete this document? This cannot be undone.")) return;
    setDeleting((prev) => new Set(prev).add(id));
    try {
      await deleteDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch {
      // ignore
    }
    setDeleting((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const startEdit = (e: React.MouseEvent, doc: Document) => {
    e.stopPropagation();
    const parts = (doc.hotel_name ?? doc.filename).split(",");
    const name = parts[0].trim();
    const city = parts.length > 1 ? parts.slice(1).join(",").trim() : "";
    setEditName(name);
    setEditCity(city);
    setEditingId(doc.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditCity("");
  };

  const saveEdit = async (docId: number) => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const updated = await updateDocumentEntity(docId, editName.trim(), editCity.trim());
      setDocs((prev) => prev.map((d) => (d.id === docId ? updated : d)));
      setEditingId(null);
      fetchDocs();
    } catch (err: any) {
      alert(err?.response?.data?.detail ?? "Save failed");
    }
    setSaving(false);
  };

  const isEmail = (doc: Document) => doc.file_type === "eml";
  const needsAttention = (doc: Document) =>
    (doc.row_count === null || doc.row_count === 0) && doc.status !== "processing";

  const getReviewPath = (doc: Document) => {
    if (doc.document_category === "restaurant") return `/review-restaurant/${doc.id}`;
    if (doc.document_category === "transportation") return `/review-transportation/${doc.id}`;
    return `/review/${doc.id}`;
  };

  return (
    <div style={{ display: "flex", height: "calc(100vh - 3rem)", gap: "1rem" }}>
      <FolderSidebar
        selected={selected}
        onSelect={setSelected}
        unfiledCount={selected.type === "all" ? unfiledCount : undefined}
        onDocumentMoved={fetchDocs}
        statusCounts={statusCounts}
      />

      {/* Right panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Search bar */}
        <div style={{ marginBottom: "0.75rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: "1.3rem" }}>Contracts</h2>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents..."
            style={{
              flex: 1,
              maxWidth: 400,
              padding: "0.4rem 0.75rem",
              borderRadius: 6,
              border: "1px solid #ddd",
              fontSize: "0.85rem",
              outline: "none",
            }}
          />
          <span style={{ fontSize: "0.8rem", color: "#888" }}>
            {filtered.length} document{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Reprocess button (shown when viewing failed or zero_rows) */}
        {(activeStatus === "failed" || activeStatus === "zero_rows") && (
          <div style={{ marginBottom: "0.75rem" }}>
            <button
              onClick={handleBatchReprocess}
              disabled={reprocessing || filtered.length === 0}
              style={{
                padding: "4px 14px",
                borderRadius: 6,
                border: "1px solid #c8e6c9",
                background: reprocessing ? "#e0e0e0" : "#e8f5e9",
                color: reprocessing ? "#999" : "#2e7d32",
                cursor: reprocessing || filtered.length === 0 ? "default" : "pointer",
                fontSize: "0.78rem",
                fontWeight: 700,
                opacity: filtered.length === 0 ? 0.5 : 1,
              }}
            >
              {reprocessing ? "Reprocessing..." : `Reprocess All (${filtered.length})`}
            </button>
          </div>
        )}

        {/* Document table */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: "3rem" }}>
            <p style={{ color: "#888" }}>Loading...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: "3rem" }}>
            <p style={{ color: "#888" }}>No documents found</p>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", background: "#fff", borderRadius: 8, border: "1px solid #e8e8e8" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e8e8e8", background: "#fafafa" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#888", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Name</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#888", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>File</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#888", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Category</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#888", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#888", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Rows</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#888", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Date</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#888", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((doc, idx) => {
                  const statusStyle = STATUS_COLORS[doc.status] ?? { bg: "#f5f5f5", color: "#666" };
                  const retryCount = getRetryCount(doc.notes);
                  const isEditing = editingId === doc.id;
                  const attention = needsAttention(doc);
                  const catStyle = CATEGORY_COLORS[doc.document_category] ?? { bg: "#f0f0f0", color: "#555" };
                  const rowBg = idx % 2 === 0 ? "#fff" : "#fafafa";

                  if (isEditing) {
                    return (
                      <tr key={doc.id} style={{ background: "#f0f4ff", borderBottom: "1px solid #e8e8e8" }}>
                        <td colSpan={7} style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                            <label style={{ fontSize: "0.7rem", color: "#888", fontWeight: 600 }}>Name</label>
                            <input
                              autoFocus
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit(doc.id);
                                if (e.key === "Escape") cancelEdit();
                              }}
                              style={{
                                padding: "4px 8px",
                                borderRadius: 4,
                                border: "1px solid #ccc",
                                fontSize: "0.82rem",
                                outline: "none",
                                width: 200,
                              }}
                            />
                            <label style={{ fontSize: "0.7rem", color: "#888", fontWeight: 600 }}>City</label>
                            <input
                              list={`cities-${doc.id}`}
                              value={editCity}
                              onChange={(e) => setEditCity(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit(doc.id);
                                if (e.key === "Escape") cancelEdit();
                              }}
                              placeholder="Select or type city..."
                              style={{
                                padding: "4px 8px",
                                borderRadius: 4,
                                border: "1px solid #ccc",
                                fontSize: "0.82rem",
                                outline: "none",
                                width: 160,
                              }}
                            />
                            <datalist id={`cities-${doc.id}`}>
                              {managedCities.map((c) => (
                                <option key={c.id} value={c.name} />
                              ))}
                            </datalist>
                            <button
                              onClick={() => saveEdit(doc.id)}
                              disabled={saving}
                              style={{
                                padding: "4px 12px",
                                borderRadius: 4,
                                border: "none",
                                background: saving ? "#ccc" : "#696cff",
                                color: "#fff",
                                cursor: saving ? "default" : "pointer",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                              }}
                            >
                              {saving ? "Saving..." : "Save"}
                            </button>
                            <button
                              onClick={cancelEdit}
                              style={{
                                padding: "4px 12px",
                                borderRadius: 4,
                                border: "1px solid #ddd",
                                background: "#fff",
                                color: "#555",
                                cursor: "pointer",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                              }}
                            >
                              Cancel
                            </button>
                            <span style={{ fontSize: "0.7rem", color: "#999" }}>{doc.filename}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={doc.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/x-document-id", String(doc.id));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      style={{
                        background: attention ? "#fff8e1" : rowBg,
                        borderBottom: "1px solid #e8e8e8",
                        cursor: "default",
                      }}
                    >
                      {/* Name */}
                      <td
                        style={{
                          padding: "6px 12px",
                          fontWeight: doc.hotel_name ? 600 : 400,
                          color: doc.hotel_name ? "#222" : "#aaa",
                          maxWidth: 220,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontStyle: doc.hotel_name ? "normal" : "italic",
                        }}
                        title={doc.hotel_name ?? doc.filename}
                      >
                        {doc.hotel_name ?? "Unlabeled"}
                      </td>
                      {/* File */}
                      <td
                        style={{
                          padding: "6px 12px",
                          color: "#999",
                          maxWidth: 200,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontSize: "0.75rem",
                        }}
                        title={doc.filename}
                      >
                        {doc.filename}
                      </td>
                      {/* Category */}
                      <td style={{ padding: "6px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span
                            style={{
                              background: catStyle.bg,
                              color: catStyle.color,
                              padding: "1px 6px",
                              borderRadius: 4,
                              fontSize: "0.7rem",
                              fontWeight: 600,
                            }}
                          >
                            {CATEGORY_LABEL[doc.document_category] ?? doc.document_category}
                          </span>
                          {isEmail(doc) && (
                            <span
                              style={{
                                background: "#f3e5f5",
                                color: "#7b1fa2",
                                padding: "1px 6px",
                                borderRadius: 4,
                                fontSize: "0.7rem",
                                fontWeight: 600,
                              }}
                            >
                              Email
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Status */}
                      <td style={{ padding: "6px 12px" }}>
                        <span
                          style={{
                            background: statusStyle.bg,
                            color: statusStyle.color,
                            padding: "1px 8px",
                            borderRadius: 4,
                            fontSize: "0.7rem",
                            fontWeight: 600,
                          }}
                        >
                          {doc.status.replace("_", " ")}
                        </span>
                        {retryCount > 0 && (
                          <span style={{ fontSize: "0.68rem", color: "#e65100", fontWeight: 600, marginLeft: 4 }}>
                            retry {retryCount}/2
                          </span>
                        )}
                      </td>
                      {/* Rows */}
                      <td style={{ padding: "6px 12px", textAlign: "right" }}>
                        {doc.row_count !== null && doc.row_count > 0 ? (
                          <span style={{ fontSize: "0.75rem", color: "#1565c0", fontWeight: 600 }}>
                            {doc.row_count}
                          </span>
                        ) : attention ? (
                          <span style={{ fontSize: "0.75rem", color: "#e65100", fontWeight: 600 }}>0</span>
                        ) : (
                          <span style={{ color: "#ccc" }}>—</span>
                        )}
                      </td>
                      {/* Date */}
                      <td style={{ padding: "6px 12px", color: "#999", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                        {new Date(doc.upload_date).toLocaleDateString()}
                      </td>
                      {/* Actions */}
                      <td style={{ padding: "6px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", gap: 4 }}>
                          {(doc.status === "pending_review" || doc.status === "completed") && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(getReviewPath(doc));
                              }}
                              style={{
                                padding: "2px 8px",
                                borderRadius: 4,
                                border: "1px solid #c8e6c9",
                                background: "#e8f5e9",
                                color: "#2e7d32",
                                cursor: "pointer",
                                fontSize: "0.7rem",
                                fontWeight: 600,
                              }}
                            >
                              Review
                            </button>
                          )}
                          {isEmail(doc) && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const { email_id } = await getEmailByDocument(doc.id);
                                  navigate(`/email?id=${email_id}`);
                                } catch {
                                  navigate("/email");
                                }
                              }}
                              style={{
                                padding: "2px 8px",
                                borderRadius: 4,
                                border: "1px solid #e1bee7",
                                background: "#f3e5f5",
                                color: "#7b1fa2",
                                cursor: "pointer",
                                fontSize: "0.7rem",
                                fontWeight: 600,
                              }}
                            >
                              Email
                            </button>
                          )}
                          <button
                            onClick={(e) => startEdit(e, doc)}
                            style={{
                              padding: "2px 8px",
                              borderRadius: 4,
                              border: "1px solid #bbdefb",
                              background: "#e3f2fd",
                              color: "#1565c0",
                              cursor: "pointer",
                              fontSize: "0.7rem",
                              fontWeight: 600,
                            }}
                          >
                            {doc.hotel_name ? "Edit" : "Label"}
                          </button>
                          <button
                            onClick={(e) => handleDelete(e, doc.id)}
                            disabled={deleting.has(doc.id)}
                            style={{
                              padding: "2px 8px",
                              borderRadius: 4,
                              border: "1px solid #ffcdd2",
                              background: "#fff",
                              color: "#c62828",
                              cursor: deleting.has(doc.id) ? "default" : "pointer",
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              opacity: deleting.has(doc.id) ? 0.5 : 1,
                            }}
                          >
                            {deleting.has(doc.id) ? "..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
