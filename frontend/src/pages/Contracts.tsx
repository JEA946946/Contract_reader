import { useCallback, useEffect, useState } from "react";
import FolderSidebar, { type SelectedFolder } from "../components/FolderSidebar";
import type { Document } from "../types";
import {
  getDocuments,
  getFolderDocuments,
  getUnfiledDocuments,
  deleteDocument,
  updateDocumentEntity,
} from "../api/client";

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  processing: { bg: "#fff3e0", color: "#e65100" },
  pending_review: { bg: "#e3f2fd", color: "#1565c0" },
  completed: { bg: "#e8f5e9", color: "#2e7d32" },
  failed: { bg: "#ffebee", color: "#c62828" },
};

export default function Contracts() {
  const [selected, setSelected] = useState<SelectedFolder>({ type: "all" });
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editCity, setEditCity] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      let result: Document[];
      if (selected.type === "all") {
        result = await getDocuments();
      } else if (selected.type === "unfiled") {
        result = await getUnfiledDocuments();
      } else {
        result = await getFolderDocuments(selected.id);
      }
      setDocs(result);
    } catch {
      setDocs([]);
    }
    setLoading(false);
  }, [selected]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const unfiledCount = docs.filter((d) => d.folder_id === null).length;

  const filtered = search.trim()
    ? docs.filter(
        (d) =>
          d.filename.toLowerCase().includes(search.toLowerCase()) ||
          (d.hotel_name ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : docs;

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
    // Parse entity name — hotel_name can be "Name1, Name2" but we take the first
    const name = (doc.hotel_name ?? "").split(",")[0].trim();
    setEditName(name);
    setEditCity(""); // Will be filled from the saved response
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
      // Refresh folder tree counts
      fetchDocs();
    } catch (err: any) {
      alert(err?.response?.data?.detail ?? "Save failed");
    }
    setSaving(false);
  };

  return (
    <div style={{ display: "flex", height: "calc(100vh - 120px)", gap: "1rem" }}>
      <FolderSidebar
        selected={selected}
        onSelect={setSelected}
        unfiledCount={selected.type === "all" ? unfiledCount : undefined}
        onDocumentMoved={fetchDocs}
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

        {/* Document grid */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: "3rem" }}>
            <p style={{ color: "#888" }}>Loading...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: "3rem" }}>
            <p style={{ color: "#888" }}>No documents found</p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "0.75rem",
              overflowY: "auto",
              flex: 1,
              alignContent: "start",
            }}
          >
            {filtered.map((doc) => {
              const statusStyle = STATUS_COLORS[doc.status] ?? { bg: "#f5f5f5", color: "#666" };
              const retryCount = getRetryCount(doc.notes);
              const isEditing = editingId === doc.id;

              return (
                <div
                  key={doc.id}
                  draggable={!isEditing}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-document-id", String(doc.id));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  style={{
                    background: "#fff",
                    borderRadius: 8,
                    padding: "0.75rem",
                    border: isEditing ? "2px solid #1565c0" : "1px solid #e8e8e8",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.35rem",
                  }}
                >
                  {isEditing ? (
                    /* ---- Edit mode ---- */
                    <>
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
                          padding: "0.3rem 0.5rem",
                          borderRadius: 4,
                          border: "1px solid #ccc",
                          fontSize: "0.85rem",
                          outline: "none",
                        }}
                      />
                      <label style={{ fontSize: "0.7rem", color: "#888", fontWeight: 600, marginTop: "0.2rem" }}>City</label>
                      <input
                        value={editCity}
                        onChange={(e) => setEditCity(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(doc.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        placeholder="City..."
                        style={{
                          padding: "0.3rem 0.5rem",
                          borderRadius: 4,
                          border: "1px solid #ccc",
                          fontSize: "0.85rem",
                          outline: "none",
                        }}
                      />
                      <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.3rem" }}>
                        <button
                          onClick={() => saveEdit(doc.id)}
                          disabled={saving}
                          style={{
                            padding: "4px 12px",
                            borderRadius: 4,
                            border: "none",
                            background: saving ? "#ccc" : "#1565c0",
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
                      </div>
                      <div style={{ fontSize: "0.68rem", color: "#999", marginTop: "0.1rem" }}>
                        {doc.filename}
                      </div>
                    </>
                  ) : (
                    /* ---- Display mode ---- */
                    <>
                      {/* Entity name / filename */}
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "0.85rem",
                          color: "#222",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={doc.hotel_name ?? doc.filename}
                      >
                        {doc.hotel_name ?? doc.filename}
                      </div>

                      {doc.hotel_name && (
                        <div
                          style={{
                            fontSize: "0.72rem",
                            color: "#999",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {doc.filename}
                        </div>
                      )}

                      {/* Meta row */}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
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
                        <span
                          style={{
                            background: "#f0f0f0",
                            color: "#555",
                            padding: "1px 6px",
                            borderRadius: 4,
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            textTransform: "uppercase",
                          }}
                        >
                          {doc.file_type}
                        </span>
                        {doc.row_count !== null && doc.row_count > 0 && (
                          <span style={{ fontSize: "0.7rem", color: "#1565c0", fontWeight: 600 }}>
                            {doc.row_count} rows
                          </span>
                        )}
                        {retryCount > 0 && (
                          <span style={{ fontSize: "0.68rem", color: "#e65100", fontWeight: 600 }}>
                            retry {retryCount}/2
                          </span>
                        )}
                        <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "#999" }}>
                          {new Date(doc.upload_date).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.1rem" }}>
                        {doc.hotel_name && (
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
                            ✏️ Edit
                          </button>
                        )}
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
                          {deleting.has(doc.id) ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
