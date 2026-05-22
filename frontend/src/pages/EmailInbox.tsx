import { useCallback, useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import FolderSidebar, { type SelectedFolder } from "../components/FolderSidebar";
import EmailRulesPanel from "../components/EmailRulesPanel";
import type { ProcessedEmail, EmailLabel, ManagedCity } from "../types";
import { EMAIL_LABELS } from "../types";
import {
  getEmails,
  getEmailDetail,
  triggerPollNow,
  assignEmailFolder,
  setEmailLabel,
  requeueEmail,
  getManagedCities,
  updateDocumentEntity,
} from "../api/client";

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  processed: { bg: "#e8f5e9", color: "#2e7d32" },
  failed: { bg: "#ffebee", color: "#c62828" },
  skipped: { bg: "#f5f5f5", color: "#666" },
};

const LABEL_COLORS: Record<string, { bg: string; color: string }> = {
  accommodation: { bg: "#e3f2fd", color: "#1565c0" },
  restaurant: { bg: "#fce4ec", color: "#c62828" },
  transportation: { bg: "#e8f5e9", color: "#2e7d32" },
  entrees: { bg: "#fff3e0", color: "#e65100" },
  packages: { bg: "#f3e5f5", color: "#7b1fa2" },
};

const LABEL_DISPLAY: Record<string, string> = {
  accommodation: "Accommodation",
  restaurant: "Restaurant",
  transportation: "Transportation",
  entrees: "Entrees",
  packages: "Packages",
};

export default function EmailInbox() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<SelectedFolder>({ type: "all" });
  const [emails, setEmails] = useState<ProcessedEmail[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [totalAll, setTotalAll] = useState(0);
  const [unfiledCount, setUnfiledCount] = useState(0);

  // Preview state
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [previewEmail, setPreviewEmail] = useState<ProcessedEmail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Auto-open email from URL param ?id=X
  const autoOpenHandled = useRef(false);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number | boolean> = { page, page_size: pageSize };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      if (labelFilter) params.label = labelFilter;
      if (selected.type === "folder") params.folder_id = selected.id;
      else if (selected.type === "unfiled") params.unfiled = true;
      const result = await getEmails(params);
      setEmails(result.items);
      setTotal(result.total);
    } catch {
      setEmails([]);
      setTotal(0);
    }
    setLoading(false);
  }, [page, pageSize, search, statusFilter, labelFilter, selected]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  // Fetch total email count (unfiltered) for sidebar "All Documents"
  const refreshTotalAll = useCallback(() => {
    getEmails({ page: 1, page_size: 1 }).then(r => setTotalAll(r.total)).catch(() => {});
    getEmails({ page: 1, page_size: 1, unfiled: true }).then(r => setUnfiledCount(r.total)).catch(() => {});
  }, []);

  useEffect(() => { refreshTotalAll(); }, [refreshTotalAll]);

  useEffect(() => {
    getManagedCities().then(setManagedCities).catch(() => {});
  }, []);

  // Auto-open email from URL param after first load
  useEffect(() => {
    if (autoOpenHandled.current || loading) return;
    const idParam = searchParams.get("id");
    if (idParam) {
      const emailId = parseInt(idParam, 10);
      if (!isNaN(emailId)) {
        autoOpenHandled.current = true;
        // Remove the param from URL to avoid re-triggering
        setSearchParams({}, { replace: true });
        // Open the preview
        setPreviewId(emailId);
        setPreviewLoading(true);
        getEmailDetail(emailId)
          .then((detail) => setPreviewEmail(detail))
          .catch(() => setPreviewEmail(null))
          .finally(() => setPreviewLoading(false));
      }
    }
  }, [loading, searchParams, setSearchParams]);

  // Folder filtering is now server-side
  const filtered = emails;

  const handlePollNow = async () => {
    setPolling(true);
    try {
      await triggerPollNow();
      setTimeout(() => {
        fetchEmails();
        refreshTotalAll();
        setPolling(false);
      }, 3000);
    } catch {
      setPolling(false);
    }
  };

  const handleSelectEmail = async (emailItem: ProcessedEmail) => {
    if (previewId === emailItem.id) {
      setPreviewId(null);
      setPreviewEmail(null);
      return;
    }
    setPreviewId(emailItem.id);
    setPreviewLoading(true);
    setEditingDocLabel(false);
    setDocLabelMsg("");
    try {
      const detail = await getEmailDetail(emailItem.id);
      setPreviewEmail(detail);
    } catch {
      setPreviewEmail(null);
    }
    setPreviewLoading(false);
  };

  const handleFolderAssign = async (emailItem: ProcessedEmail, folderId: number | null) => {
    try {
      await assignEmailFolder(emailItem.id, folderId);
      setEmails((prev) =>
        prev.map((e) =>
          e.id === emailItem.id ? { ...e, folder_id: folderId } : e
        )
      );
    } catch {
      // ignore
    }
  };

  const handleLabelChange = async (emailId: number, newLabel: EmailLabel | null) => {
    try {
      await setEmailLabel(emailId, newLabel);
      setEmails((prev) =>
        prev.map((e) =>
          e.id === emailId ? { ...e, label: newLabel } : e
        )
      );
      if (previewEmail && previewEmail.id === emailId) {
        setPreviewEmail({ ...previewEmail, label: newLabel });
      }
    } catch {
      // ignore
    }
  };

  const [requeuing, setRequeuing] = useState<number | null>(null);

  // Document label editing (name + city)
  const [managedCities, setManagedCities] = useState<ManagedCity[]>([]);
  const [editingDocLabel, setEditingDocLabel] = useState(false);
  const [docLabelName, setDocLabelName] = useState("");
  const [docLabelCity, setDocLabelCity] = useState("");
  const [docLabelSaving, setDocLabelSaving] = useState(false);
  const [docLabelMsg, setDocLabelMsg] = useState("");

  const handleRequeue = async (emailId: number) => {
    setRequeuing(emailId);
    try {
      await requeueEmail(emailId);
      // Update local state to reflect processing
      setEmails((prev) =>
        prev.map((e) =>
          e.id === emailId
            ? { ...e, status: "processing", document_status: "processing", document_row_count: null }
            : e
        )
      );
      if (previewEmail && previewEmail.id === emailId) {
        setPreviewEmail({
          ...previewEmail,
          status: "processing",
          document_status: "processing",
          document_row_count: null,
        });
      }
      // Refresh after a delay to pick up re-parse results
      setTimeout(fetchEmails, 5000);
    } catch {
      // ignore
    }
    setRequeuing(null);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const parseAttachments = (json: string | null): string[] => {
    if (!json) return [];
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  };

  return (
    <div style={{ display: "flex", height: "calc(100vh - 3rem)", gap: "1rem" }}>
      <FolderSidebar
        selected={selected}
        onSelect={(sel) => { setSelected(sel); setPage(1); }}
        onDocumentMoved={() => { fetchEmails(); refreshTotalAll(); }}
        totalCount={totalAll}
        unfiledCount={unfiledCount}
      />

      {/* Middle: email list */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Top bar */}
        <div
          style={{
            marginBottom: "0.75rem",
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.3rem" }}>Email Inbox</h2>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search..."
            style={{
              flex: 1,
              maxWidth: 200,
              padding: "0.4rem 0.75rem",
              borderRadius: 6,
              border: "1px solid #ddd",
              fontSize: "0.85rem",
              outline: "none",
            }}
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            style={{
              padding: "0.4rem 0.5rem",
              borderRadius: 6,
              border: "1px solid #ddd",
              fontSize: "0.8rem",
              outline: "none",
            }}
          >
            <option value="">All statuses</option>
            <option value="processed">Processed</option>
            <option value="failed">Failed</option>
          </select>
          <select
            value={labelFilter}
            onChange={(e) => { setLabelFilter(e.target.value); setPage(1); }}
            style={{
              padding: "0.4rem 0.5rem",
              borderRadius: 6,
              border: "1px solid #ddd",
              fontSize: "0.8rem",
              outline: "none",
            }}
          >
            <option value="">All labels</option>
            {EMAIL_LABELS.map((l) => (
              <option key={l} value={l}>{LABEL_DISPLAY[l]}</option>
            ))}
            <option value="unlabeled">Unlabeled</option>
          </select>
          <button
            onClick={handlePollNow}
            disabled={polling}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "none",
              background: polling ? "#ccc" : "#1565c0",
              color: "#fff",
              cursor: polling ? "default" : "pointer",
              fontSize: "0.8rem",
              fontWeight: 600,
            }}
          >
            {polling ? "Polling..." : "Poll Now"}
          </button>
          <button
            onClick={() => setShowRules(!showRules)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: showRules ? "2px solid #e94560" : "1px solid #ddd",
              background: showRules ? "#fff5f5" : "#fff",
              color: showRules ? "#e94560" : "#555",
              cursor: "pointer",
              fontSize: "0.8rem",
              fontWeight: 600,
            }}
          >
            Rules
          </button>
          <span style={{ fontSize: "0.78rem", color: "#888" }}>
            {total} email{total !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Rules panel */}
        {showRules && <EmailRulesPanel />}

        {/* Email list */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: "3rem" }}>
            <p style={{ color: "#888" }}>Loading...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: "3rem" }}>
            <p style={{ color: "#888" }}>No emails found</p>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filtered.map((em) => {
              const statusStyle = STATUS_COLORS[em.status] ?? { bg: "#f5f5f5", color: "#666" };
              const attachments = parseAttachments(em.attachment_names);
              const isSelected = previewId === em.id;
              const labelStyle = em.label ? LABEL_COLORS[em.label] : null;

              return (
                <div
                  key={em.id}
                  draggable
                  onDragStart={(e) => {
                    if (em.document_id) {
                      e.dataTransfer.setData("application/x-document-id", String(em.document_id));
                      e.dataTransfer.effectAllowed = "move";
                    }
                  }}
                  onClick={() => handleSelectEmail(em)}
                  style={{
                    padding: "8px 10px",
                    borderBottom: "1px solid #f0f0f0",
                    cursor: "pointer",
                    background: isSelected ? "#e8f0fe" : "#fff",
                    borderLeft: isSelected ? "3px solid #1565c0" : "3px solid transparent",
                    display: "flex",
                    flexDirection: "column",
                    gap: "3px",
                  }}
                >
                  {/* Row 1: status + sender + date */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span
                      style={{
                        background: statusStyle.bg,
                        color: statusStyle.color,
                        padding: "1px 6px",
                        borderRadius: 3,
                        fontSize: "0.68rem",
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {em.status}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "#333",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={em.sender ?? ""}
                    >
                      {em.sender ?? "Unknown"}
                    </span>
                    <span style={{ fontSize: "0.72rem", color: "#999", flexShrink: 0 }}>
                      {em.received_date
                        ? new Date(em.received_date).toLocaleDateString()
                        : ""}
                    </span>
                  </div>
                  {/* Row 2: subject */}
                  <div
                    style={{
                      fontSize: "0.82rem",
                      color: "#222",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={em.subject ?? ""}
                  >
                    {em.subject ?? "(no subject)"}
                  </div>
                  {/* Row 3: label + folder + attachments */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {em.label && labelStyle ? (
                      <span
                        style={{
                          background: labelStyle.bg,
                          color: labelStyle.color,
                          padding: "1px 6px",
                          borderRadius: 3,
                          fontSize: "0.68rem",
                          fontWeight: 600,
                        }}
                      >
                        {LABEL_DISPLAY[em.label]}
                      </span>
                    ) : (
                      <span style={{ color: "#ccc", fontSize: "0.68rem", fontStyle: "italic" }}>
                        No label
                      </span>
                    )}
                    {em.folder_name && (
                      <span
                        style={{
                          background: "#f0f0f0",
                          color: "#555",
                          padding: "1px 6px",
                          borderRadius: 3,
                          fontSize: "0.68rem",
                        }}
                      >
                        {em.folder_name}
                      </span>
                    )}
                    {em.document_row_count === 0 && em.document_status !== "processing" && (
                      <span style={{ fontSize: "0.68rem", color: "#c62828", fontWeight: 600 }}>
                        0 rows
                      </span>
                    )}
                    {em.document_status === "processing" && (
                      <span style={{ fontSize: "0.68rem", color: "#e65100", fontWeight: 600 }}>
                        Processing...
                      </span>
                    )}
                    {attachments.length > 0 && (
                      <span style={{ fontSize: "0.7rem", color: "#888", marginLeft: "auto" }}>
                        {attachments.length} file{attachments.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {total > pageSize && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "1rem",
              padding: "0.5rem 0",
              borderTop: "1px solid #eee",
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{
                padding: "4px 12px",
                borderRadius: 4,
                border: "1px solid #ddd",
                background: page <= 1 ? "#f5f5f5" : "#fff",
                color: page <= 1 ? "#ccc" : "#333",
                cursor: page <= 1 ? "default" : "pointer",
                fontSize: "0.8rem",
              }}
            >
              Prev
            </button>
            <span style={{ fontSize: "0.8rem", color: "#666" }}>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={{
                padding: "4px 12px",
                borderRadius: 4,
                border: "1px solid #ddd",
                background: page >= totalPages ? "#f5f5f5" : "#fff",
                color: page >= totalPages ? "#ccc" : "#333",
                cursor: page >= totalPages ? "default" : "pointer",
                fontSize: "0.8rem",
              }}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Right: preview pane */}
      {previewId !== null && (
        <div
          style={{
            width: 420,
            minWidth: 420,
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #e8e8e8",
            display: "flex",
            flexDirection: "column",
            height: "100%",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {previewLoading ? (
            <div style={{ padding: "2rem", textAlign: "center" }}>
              <p style={{ color: "#888" }}>Loading...</p>
            </div>
          ) : previewEmail ? (
            <>
              {/* Header */}
              <div
                style={{
                  padding: "14px 16px",
                  borderBottom: "1px solid #eee",
                  flexShrink: 0,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "0.95rem",
                      fontWeight: 600,
                      color: "#222",
                      lineHeight: 1.3,
                      wordBreak: "break-word",
                    }}
                  >
                    {previewEmail.subject ?? "(no subject)"}
                  </h3>
                  <button
                    onClick={() => { setPreviewId(null); setPreviewEmail(null); }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#999",
                      fontSize: "1.1rem",
                      padding: "0 0 0 8px",
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                    title="Close"
                  >
                    x
                  </button>
                </div>
                <div style={{ marginTop: "8px", fontSize: "0.78rem", color: "#555", display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div><strong>From:</strong> {previewEmail.sender}</div>
                  <div><strong>Date:</strong> {previewEmail.received_date ? new Date(previewEmail.received_date).toLocaleString() : "-"}</div>

                  {/* Label selector */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                    <strong style={{ fontSize: "0.78rem" }}>Label:</strong>
                    <select
                      value={previewEmail.label ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        handleLabelChange(
                          previewEmail.id,
                          val ? (val as EmailLabel) : null
                        );
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        padding: "2px 6px",
                        borderRadius: 4,
                        border: "1px solid #ddd",
                        fontSize: "0.78rem",
                        outline: "none",
                        background: previewEmail.label
                          ? LABEL_COLORS[previewEmail.label]?.bg ?? "#fff"
                          : "#fff",
                        color: previewEmail.label
                          ? LABEL_COLORS[previewEmail.label]?.color ?? "#333"
                          : "#999",
                        fontWeight: previewEmail.label ? 600 : 400,
                      }}
                    >
                      <option value="">No label</option>
                      {EMAIL_LABELS.map((l) => (
                        <option key={l} value={l}>{LABEL_DISPLAY[l]}</option>
                      ))}
                    </select>
                  </div>

                  {/* Folder + review link */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px" }}>
                    {previewEmail.folder_name ? (
                      <span
                        style={{
                          background: "#f0f0f0",
                          color: "#555",
                          padding: "1px 8px",
                          borderRadius: 3,
                          fontSize: "0.72rem",
                          fontWeight: 600,
                        }}
                      >
                        {previewEmail.folder_name}
                      </span>
                    ) : (
                      <span style={{ color: "#bbb", fontSize: "0.72rem" }}>Unfiled</span>
                    )}
                    {previewEmail.document_id && (
                      <a
                        href={`/review/${previewEmail.document_id}`}
                        style={{ color: "#1565c0", textDecoration: "none", fontWeight: 600, fontSize: "0.75rem" }}
                      >
                        View in Review
                      </a>
                    )}
                  </div>

                  {/* Document label (name + city) */}
                  {previewEmail.document_id && (
                    <div style={{ marginTop: "6px", borderTop: "1px solid #f0f0f0", paddingTop: "6px" }}>
                      {!editingDocLabel ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <strong style={{ fontSize: "0.78rem" }}>Document:</strong>
                          <span style={{ fontSize: "0.78rem", color: "#333" }}>
                            {previewEmail.subject ?? "(unlabeled)"}
                          </span>
                          <button
                            onClick={() => {
                              setEditingDocLabel(true);
                              setDocLabelName("");
                              setDocLabelCity("");
                              setDocLabelMsg("");
                            }}
                            style={{
                              padding: "2px 8px",
                              borderRadius: 4,
                              border: "1px solid #bbdefb",
                              background: "#e3f2fd",
                              color: "#1565c0",
                              cursor: "pointer",
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              marginLeft: "auto",
                            }}
                          >
                            Label
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <label style={{ fontSize: "0.72rem", color: "#666", fontWeight: 600, width: 36 }}>Name</label>
                            <input
                              autoFocus
                              value={docLabelName}
                              onChange={(e) => setDocLabelName(e.target.value)}
                              placeholder="Entity name..."
                              style={{
                                flex: 1,
                                padding: "3px 6px",
                                borderRadius: 4,
                                border: "1px solid #ccc",
                                fontSize: "0.78rem",
                                outline: "none",
                              }}
                            />
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <label style={{ fontSize: "0.72rem", color: "#666", fontWeight: 600, width: 36 }}>City</label>
                            <input
                              list="email-doc-cities"
                              value={docLabelCity}
                              onChange={(e) => setDocLabelCity(e.target.value)}
                              placeholder="Select or type city..."
                              style={{
                                flex: 1,
                                padding: "3px 6px",
                                borderRadius: 4,
                                border: "1px solid #ccc",
                                fontSize: "0.78rem",
                                outline: "none",
                              }}
                            />
                            <datalist id="email-doc-cities">
                              {managedCities.map((c) => (
                                <option key={c.id} value={c.name} />
                              ))}
                            </datalist>
                          </div>
                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            <button
                              onClick={async () => {
                                if (!docLabelName.trim()) return;
                                setDocLabelSaving(true);
                                setDocLabelMsg("");
                                try {
                                  await updateDocumentEntity(previewEmail.document_id!, docLabelName.trim(), docLabelCity.trim());
                                  setEditingDocLabel(false);
                                  setDocLabelMsg("Saved");
                                  fetchEmails();
                                  setTimeout(() => setDocLabelMsg(""), 3000);
                                } catch (err: any) {
                                  setDocLabelMsg(err?.response?.data?.detail ?? "Save failed");
                                }
                                setDocLabelSaving(false);
                              }}
                              disabled={docLabelSaving || !docLabelName.trim()}
                              style={{
                                padding: "3px 10px",
                                borderRadius: 4,
                                border: "none",
                                background: docLabelSaving ? "#ccc" : "#4caf50",
                                color: "#fff",
                                cursor: docLabelSaving ? "default" : "pointer",
                                fontSize: "0.72rem",
                                fontWeight: 600,
                              }}
                            >
                              {docLabelSaving ? "Saving..." : "Save"}
                            </button>
                            <button
                              onClick={() => { setEditingDocLabel(false); setDocLabelMsg(""); }}
                              style={{
                                padding: "3px 10px",
                                borderRadius: 4,
                                border: "1px solid #ddd",
                                background: "#fff",
                                color: "#555",
                                cursor: "pointer",
                                fontSize: "0.72rem",
                                fontWeight: 600,
                              }}
                            >
                              Cancel
                            </button>
                            {docLabelMsg && (
                              <span style={{ fontSize: "0.72rem", color: docLabelMsg === "Saved" ? "#4caf50" : "#c62828" }}>
                                {docLabelMsg}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Attachments */}
              {parseAttachments(previewEmail.attachment_names).length > 0 && (
                <div
                  style={{
                    padding: "8px 16px",
                    borderBottom: "1px solid #eee",
                    flexShrink: 0,
                  }}
                >
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#555", marginBottom: "4px" }}>
                    Attachments
                  </div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {parseAttachments(previewEmail.attachment_names).map((name, i) => (
                      <span
                        key={i}
                        style={{
                          background: "#f5f5f5",
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: "0.73rem",
                          color: "#555",
                          border: "1px solid #e8e8e8",
                        }}
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Body */}
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
                {previewEmail.body_text ? (
                  <pre
                    style={{
                      margin: 0,
                      fontSize: "0.8rem",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      lineHeight: 1.5,
                      color: "#333",
                      fontFamily: "inherit",
                    }}
                  >
                    {previewEmail.body_text}
                  </pre>
                ) : (
                  <p style={{ color: "#999", fontSize: "0.8rem" }}>No text body available</p>
                )}
              </div>

              {/* Footer actions */}
              {previewEmail.document_id && (
                <div
                  style={{
                    padding: "10px 16px",
                    borderTop: "1px solid #eee",
                    display: "flex",
                    gap: "8px",
                    alignItems: "center",
                    flexWrap: "wrap",
                    flexShrink: 0,
                  }}
                >
                  {/* Requeue button — show when 0 rows extracted or failed */}
                  {(previewEmail.document_row_count === 0 || previewEmail.document_row_count === null || previewEmail.document_status === "failed") &&
                    previewEmail.document_status !== "processing" && (
                    <button
                      onClick={() => handleRequeue(previewEmail.id)}
                      disabled={requeuing === previewEmail.id}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 4,
                        border: "none",
                        background: requeuing === previewEmail.id ? "#ccc" : "#e65100",
                        color: "#fff",
                        cursor: requeuing === previewEmail.id ? "default" : "pointer",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                      }}
                    >
                      {requeuing === previewEmail.id ? "Requeuing..." : "Re-process Email"}
                    </button>
                  )}
                  {previewEmail.document_status === "processing" && (
                    <span style={{ fontSize: "0.78rem", color: "#e65100", fontWeight: 600 }}>
                      Processing...
                    </span>
                  )}
                  {previewEmail.document_row_count !== null && previewEmail.document_row_count > 0 && (
                    <span style={{ fontSize: "0.78rem", color: "#2e7d32", fontWeight: 600 }}>
                      {previewEmail.document_row_count} rows extracted
                    </span>
                  )}
                  {previewEmail.folder_id && (
                    <button
                      onClick={() => {
                        const em = emails.find((e) => e.id === previewId);
                        if (em) handleFolderAssign(em, null);
                      }}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 4,
                        border: "1px solid #ddd",
                        background: "#fff",
                        color: "#555",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        marginLeft: "auto",
                      }}
                    >
                      Remove from folder
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: "2rem", textAlign: "center" }}>
              <p style={{ color: "#999" }}>Failed to load email</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
