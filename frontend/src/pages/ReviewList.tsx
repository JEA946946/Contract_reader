import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getDocuments,
  deleteDocument,
  aiReparseDocument,
  batchReparseDocuments,
  getEmailPollingStatus,
  triggerPollNow,
  uploadDocument,
} from "../api/client";
import type { Document, EmailPollingStatus } from "../types";
import FolderSidebar, { type SelectedFolder } from "../components/FolderSidebar";

type ActiveTab = "hotel" | "restaurant" | "transportation";
type StatusGroup = "processing" | "pending_review" | "completed" | "failed" | "needs_reparse";

const COLUMNS: { key: StatusGroup; label: string; color: string; bg: string }[] = [
  { key: "processing", label: "Processing", color: "#e65100", bg: "#fff8f0" },
  { key: "pending_review", label: "Ready to Review", color: "#1565c0", bg: "#f0f7ff" },
  { key: "completed", label: "Confirmed", color: "#2e7d32", bg: "#f2fdf4" },
  { key: "failed", label: "Failed", color: "#c62828", bg: "#fff5f5" },
  { key: "needs_reparse", label: "Needs Re-parse", color: "#6a1b9a", bg: "#f3e5f5" },
];

function groupByStatus(docs: Document[]) {
  const groups: Record<StatusGroup, Document[]> = {
    processing: [],
    pending_review: [],
    completed: [],
    failed: [],
    needs_reparse: [],
  };
  for (const d of docs) {
    // Documents with 0 rows that aren't still processing go to "needs_reparse"
    const zeroRows = (d.row_count === null || d.row_count === 0) && d.status !== "processing";
    if (zeroRows) {
      groups.needs_reparse.push(d);
    } else {
      const key = d.status as StatusGroup;
      if (key in groups && key !== "needs_reparse") groups[key].push(d);
    }
  }
  return groups;
}

export default function ReviewList() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("hotel");
  const [docs, setDocs] = useState<Document[]>([]);
  const [polling, setPolling] = useState<EmailPollingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<Set<number>>(new Set());
  const [reparsing, setReparsing] = useState<Set<number>>(new Set());
  const [pollTriggering, setPollTriggering] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [batchReparsing, setBatchReparsing] = useState(false);
  const [folderFilter, setFolderFilter] = useState<SelectedFolder>({ type: "all" });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Use ref so auto-refresh interval always reads the current tab
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // Monotonic counter to discard stale responses after tab switches
  const fetchGenRef = useRef(0);

  const fetchData = useCallback((showLoading = false) => {
    const gen = ++fetchGenRef.current;
    if (showLoading) setLoading(true);
    Promise.all([
      getDocuments(activeTabRef.current),
      getEmailPollingStatus().catch(() => null),
    ]).then(([allDocs, emailStatus]) => {
      // Discard if a newer fetch was started (tab switched)
      if (gen !== fetchGenRef.current) return;
      setDocs(allDocs);
      setPolling(emailStatus);
      setLoading(false);
    });
  }, []);

  // Fetch when tab changes
  useEffect(() => {
    setDocs([]);
    fetchData(true);
  }, [activeTab, fetchData]);

  // Auto-refresh while documents are processing
  useEffect(() => {
    const hasProcessing = docs.some((d) => d.status === "processing");
    if (!hasProcessing) return;
    const interval = setInterval(() => fetchData(), 3000);
    return () => clearInterval(interval);
  }, [docs, fetchData]);

  // Filter docs by selected folder
  const filteredDocs = (() => {
    if (folderFilter.type === "all") return docs;
    if (folderFilter.type === "unfiled") return docs.filter((d) => d.folder_id === null);
    if (folderFilter.type === "folder") return docs.filter((d) => d.folder_id === folderFilter.id);
    return docs;
  })();

  const unfiledCount = docs.filter((d) => d.folder_id === null).length;
  const groups = groupByStatus(filteredDocs);

  // --- Actions ---
  const handleDelete = async (id: number) => {
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

  const handleAiReparse = async (docId: number) => {
    setReparsing((prev) => new Set(prev).add(docId));
    try {
      const res = await aiReparseDocument(docId);
      const cat = res.document_category;
      const reviewPath = cat === "restaurant"
        ? `/review-restaurant/${res.id}`
        : cat === "transportation"
        ? `/review-transportation/${res.id}`
        : `/review/${res.id}`;
      navigate(reviewPath, {
        state: cat === "restaurant"
          ? { menuRows: res.menu_rows, filename: res.filename }
          : cat === "transportation"
          ? { transportRows: res.transport_rows, filename: res.filename }
          : { rows: res.rows, filename: res.filename },
      });
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? "AI parsing failed";
      alert(msg);
      setReparsing((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  };

  const handlePollNow = async () => {
    setPollTriggering(true);
    try {
      const res = await triggerPollNow();
      alert(res.message);
      fetchData();
    } catch {
      alert("Failed to trigger poll.");
    }
    setPollTriggering(false);
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const res = await uploadDocument(file);
      // If it has rows ready, navigate to review
      if (res.status === "pending_review" && res.row_count && res.row_count > 0) {
        const cat = res.document_category;
        const reviewPath = cat === "restaurant"
          ? `/review-restaurant/${res.id}`
          : cat === "transportation"
          ? `/review-transportation/${res.id}`
          : `/review/${res.id}`;
        navigate(reviewPath, {
          state: cat === "restaurant"
            ? { menuRows: res.menu_rows, filename: res.filename }
            : cat === "transportation"
            ? { transportRows: res.transport_rows, filename: res.filename }
            : { rows: res.rows, filename: res.filename },
        });
      } else {
        // Refresh the list — the new doc will appear via server data
        // with the correct category once processing finishes
        fetchData();
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? "Upload failed";
      alert(msg);
    }
    setUploading(false);
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  };

  const handleBatchReparse = async () => {
    if (!confirm("Re-parse all documents with 0 rows? This will queue them for AI extraction.")) return;
    setBatchReparsing(true);
    try {
      const res = await batchReparseDocuments("zero_rows");
      alert(res.message);
      fetchData();
    } catch {
      alert("Batch re-parse failed.");
    }
    setBatchReparsing(false);
  };

  // --- Render ---
  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
        <p style={{ color: "#888", fontSize: "1.1rem" }}>Loading pipeline...</p>
      </div>
    );
  }

  const completedToShow = groups.completed.slice(0, 20);

  return (
    <div style={{ display: "flex", height: "calc(100vh - 3rem)", gap: "0.75rem" }}>
      <FolderSidebar
        selected={folderFilter}
        onSelect={setFolderFilter}
        unfiledCount={unfiledCount}
        compact
        onDocumentMoved={() => fetchData()}
      />
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      {/* Top Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 0",
          marginBottom: "0.75rem",
          borderBottom: "1px solid #eee",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.4rem" }}>Documents Pipeline</h2>
          <div style={{ display: "flex", gap: 0, borderRadius: 6, overflow: "hidden", border: "1px solid #ddd" }}>
            {(["hotel", "restaurant", "transportation"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "0.35rem 1rem",
                  border: "none",
                  background: activeTab === tab
                    ? (tab === "transportation" ? "#4caf50" : "#1a1a2e")
                    : "#fff",
                  color: activeTab === tab ? "#fff" : "#555",
                  cursor: "pointer",
                  fontWeight: activeTab === tab ? 600 : 400,
                  fontSize: "0.8rem",
                }}
              >
                {tab === "hotel" ? "Hotels" : tab === "restaurant" ? "Restaurants" : "Transportation"}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {polling && polling.enabled && (
            <button
              onClick={handlePollNow}
              disabled={pollTriggering}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: 6,
                border: "1px solid #bbdefb",
                background: pollTriggering ? "#eee" : "#e3f2fd",
                color: "#1565c0",
                cursor: pollTriggering ? "default" : "pointer",
                fontWeight: 600,
                fontSize: "0.85rem",
              }}
            >
              {pollTriggering ? "Polling..." : "Poll Email"}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            onChange={onFileSelected}
            style={{ display: "none" }}
            accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.eml,.msg"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: 6,
              border: "none",
              background: uploading ? "#ccc" : "#e94560",
              color: "#fff",
              cursor: uploading ? "default" : "pointer",
              fontWeight: 600,
              fontSize: "0.9rem",
            }}
          >
            {uploading ? "Uploading..." : "+ Upload"}
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(200px, 1fr))",
          gap: "0.75rem",
          flex: 1,
          minHeight: 0,
          overflowX: "auto",
        }}
      >
        {COLUMNS.map((col) => {
          const columnDocs = col.key === "completed" ? completedToShow : groups[col.key];
          const totalCount = groups[col.key].length;

          return (
            <div
              key={col.key}
              style={{
                display: "flex",
                flexDirection: "column",
                background: col.bg,
                borderRadius: 10,
                border: "1px solid #e0e0e0",
                minHeight: 0,
                minWidth: 0,
                flex: "1 1 0",
              }}
            >
              {/* Column Header */}
              <div
                style={{
                  padding: "0.75rem 1rem",
                  borderBottom: "1px solid #e0e0e0",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "#333" }}>
                  {col.label}
                </span>
                <span
                  style={{
                    background: col.color,
                    color: "#fff",
                    padding: "1px 8px",
                    borderRadius: 10,
                    fontSize: "0.75rem",
                    fontWeight: 700,
                  }}
                >
                  {totalCount}
                </span>
                {col.key === "needs_reparse" && totalCount > 0 && (
                  <button
                    onClick={handleBatchReparse}
                    disabled={batchReparsing}
                    style={{
                      marginLeft: "auto",
                      padding: "2px 8px",
                      borderRadius: 4,
                      border: "1px solid #ce93d8",
                      background: batchReparsing ? "#eee" : "#f3e5f5",
                      color: "#6a1b9a",
                      cursor: batchReparsing ? "default" : "pointer",
                      fontSize: "0.68rem",
                      fontWeight: 600,
                    }}
                  >
                    {batchReparsing ? "Queuing..." : "Re-parse All"}
                  </button>
                )}
              </div>

              {/* Card List */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "0.5rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                {columnDocs.length === 0 ? (
                  <p style={{ color: "#aaa", fontSize: "0.8rem", textAlign: "center", margin: "1rem 0" }}>
                    No documents
                  </p>
                ) : (
                  columnDocs.map((doc) => (
                    <KanbanCard
                      key={doc.id}
                      doc={doc}
                      column={col.key}
                      isReparsing={reparsing.has(doc.id)}
                      isDeleting={deleting.has(doc.id)}
                      onReview={() => {
                        const path = doc.document_category === "restaurant"
                          ? `/review-restaurant/${doc.id}`
                          : doc.document_category === "transportation"
                          ? `/review-transportation/${doc.id}`
                          : `/review/${doc.id}`;
                        navigate(path);
                      }}
                      onAiParse={() => handleAiReparse(doc.id)}
                      onDelete={() => handleDelete(doc.id)}
                    />
                  ))
                )}
                {col.key === "completed" && groups.completed.length > 20 && (
                  <p style={{ color: "#888", fontSize: "0.75rem", textAlign: "center", margin: "0.25rem 0" }}>
                    Showing 20 of {groups.completed.length}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Responsive stacking */}
      <style>{`
        @media (max-width: 1100px) {
          div[style*="grid-template-columns: repeat(5"] {
            grid-template-columns: repeat(3, minmax(200px, 1fr)) !important;
          }
        }
        @media (max-width: 750px) {
          div[style*="grid-template-columns: repeat(5"] {
            grid-template-columns: repeat(2, minmax(200px, 1fr)) !important;
          }
        }
        @media (max-width: 560px) {
          div[style*="grid-template-columns: repeat(5"] {
            grid-template-columns: minmax(200px, 1fr) !important;
          }
        }
      `}</style>
    </div>
    </div>
  );
}

// --- Kanban Card Component ---
function KanbanCard({
  doc,
  column,
  isReparsing,
  isDeleting,
  onReview,
  onAiParse,
  onDelete,
}: {
  doc: Document;
  column: StatusGroup;
  isReparsing: boolean;
  isDeleting: boolean;
  onReview: () => void;
  onAiParse: () => void;
  onDelete: () => void;
}) {
  const hasRows = doc.row_count !== null && doc.row_count > 0;
  const isClickable = column === "pending_review" && hasRows && !isReparsing;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-document-id", String(doc.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={isClickable ? onReview : undefined}
      style={{
        background: "#fff",
        borderRadius: 8,
        padding: "0.6rem 0.75rem",
        border: "1px solid #e8e8e8",
        cursor: isClickable ? "pointer" : "default",
        opacity: isReparsing || isDeleting ? 0.6 : 1,
        transition: "box-shadow 0.15s",
        boxShadow: isClickable ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
      }}
      onMouseEnter={(e) => {
        if (isClickable) (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.12)";
      }}
      onMouseLeave={(e) => {
        if (isClickable) (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)";
      }}
    >
      {/* Title: hotel name or filename */}
      <div
        style={{
          fontWeight: 600,
          fontSize: "0.82rem",
          marginBottom: doc.hotel_name ? "0.1rem" : "0.3rem",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          color: "#222",
        }}
        title={doc.hotel_name ?? doc.filename}
      >
        {doc.hotel_name ?? doc.filename}
      </div>
      {doc.hotel_name && (
        <div
          style={{
            fontSize: "0.68rem",
            color: "#999",
            marginBottom: "0.3rem",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={doc.filename}
        >
          {doc.filename}
        </div>
      )}

      {/* Meta row: type badge + date */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.35rem" }}>
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
        <span style={{ fontSize: "0.7rem", color: "#999" }}>
          {new Date(doc.upload_date).toLocaleDateString()}
        </span>
        {doc.row_count !== null && (
          <span
            style={{
              marginLeft: "auto",
              background: hasRows ? "#e3f2fd" : "#fff3e0",
              color: hasRows ? "#1565c0" : "#e65100",
              padding: "1px 7px",
              borderRadius: 8,
              fontSize: "0.7rem",
              fontWeight: 600,
            }}
          >
            {doc.row_count} rows
          </span>
        )}
      </div>

      {/* Error message for failed */}
      {column === "failed" && doc.notes && (
        <div
          style={{
            fontSize: "0.72rem",
            color: "#c62828",
            marginBottom: "0.35rem",
            lineHeight: 1.3,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {doc.notes}
        </div>
      )}

      {/* Processing spinner text */}
      {column === "processing" && (
        <div style={{ fontSize: "0.72rem", color: "#e65100" }}>Processing...</div>
      )}

      {/* Action buttons */}
      {isReparsing ? (
        <div style={{ fontSize: "0.72rem", color: "#1565c0", marginTop: "0.2rem" }}>
          AI Parsing...
        </div>
      ) : (
        <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.3rem", flexWrap: "wrap" }}>
          {(column === "pending_review" || column === "completed") && hasRows && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReview();
              }}
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
              ✏️ {column === "completed" ? "Edit" : "Review"}
            </button>
          )}
          {(column === "pending_review" || column === "needs_reparse") && !hasRows && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAiParse();
              }}
              style={{
                padding: "2px 8px",
                borderRadius: 4,
                border: column === "needs_reparse" ? "1px solid #ce93d8" : "1px solid #bbdefb",
                background: column === "needs_reparse" ? "#f3e5f5" : "#e3f2fd",
                color: column === "needs_reparse" ? "#6a1b9a" : "#1565c0",
                cursor: "pointer",
                fontSize: "0.7rem",
                fontWeight: 600,
              }}
            >
              AI Parse
            </button>
          )}
          {column === "failed" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAiParse();
              }}
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
              Retry
            </button>
          )}
          {(column === "failed" || column === "completed" || column === "processing" || column === "pending_review" || column === "needs_reparse") && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              disabled={isDeleting}
              style={{
                padding: "2px 8px",
                borderRadius: 4,
                border: "1px solid #ffcdd2",
                background: "#fff",
                color: "#c62828",
                cursor: isDeleting ? "default" : "pointer",
                fontSize: "0.7rem",
                fontWeight: 600,
              }}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
