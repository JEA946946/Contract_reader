import { useEffect, useState } from "react";
import type { EmailFolderRule, Folder } from "../types";
import {
  getEmailRules,
  createEmailRule,
  updateEmailRule,
  deleteEmailRule,
  getFolderTree,
} from "../api/client";

function flattenFolders(folders: Folder[], depth = 0): { id: number; label: string }[] {
  const result: { id: number; label: string }[] = [];
  for (const f of folders) {
    result.push({ id: f.id, label: "\u00A0\u00A0".repeat(depth) + f.name });
    if (f.children.length > 0) {
      result.push(...flattenFolders(f.children, depth + 1));
    }
  }
  return result;
}

export default function EmailRulesPanel() {
  const [rules, setRules] = useState<EmailFolderRule[]>([]);
  const [folders, setFolders] = useState<{ id: number; label: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // New rule form
  const [newKeyword, setNewKeyword] = useState("");
  const [newFolderId, setNewFolderId] = useState<number | "">("");
  const [newPriority, setNewPriority] = useState(0);
  const [newCaseSensitive, setNewCaseSensitive] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editKeyword, setEditKeyword] = useState("");
  const [editFolderId, setEditFolderId] = useState<number | "">("");
  const [editPriority, setEditPriority] = useState(0);
  const [editCaseSensitive, setEditCaseSensitive] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [r, tree] = await Promise.all([getEmailRules(), getFolderTree()]);
      setRules(r);
      setFolders(flattenFolders(tree));
    } catch {
      // ignore
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleAdd = async () => {
    if (!newKeyword.trim() || newFolderId === "") return;
    setSaving(true);
    try {
      await createEmailRule({
        keyword: newKeyword.trim(),
        folder_id: newFolderId as number,
        is_case_sensitive: newCaseSensitive,
        priority: newPriority,
      });
      setNewKeyword("");
      setNewFolderId("");
      setNewPriority(0);
      setNewCaseSensitive(false);
      await refresh();
    } catch {
      // ignore
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this rule?")) return;
    try {
      await deleteEmailRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // ignore
    }
  };

  const startEdit = (rule: EmailFolderRule) => {
    setEditingId(rule.id);
    setEditKeyword(rule.keyword);
    setEditFolderId(rule.folder_id);
    setEditPriority(rule.priority);
    setEditCaseSensitive(rule.is_case_sensitive);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async () => {
    if (editingId === null || !editKeyword.trim() || editFolderId === "") return;
    setSaving(true);
    try {
      await updateEmailRule(editingId, {
        keyword: editKeyword.trim(),
        folder_id: editFolderId as number,
        is_case_sensitive: editCaseSensitive,
        priority: editPriority,
      });
      setEditingId(null);
      await refresh();
    } catch {
      // ignore
    }
    setSaving(false);
  };

  const inputStyle: React.CSSProperties = {
    padding: "4px 8px",
    borderRadius: 4,
    border: "1px solid #ddd",
    fontSize: "0.8rem",
    outline: "none",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    minWidth: 120,
  };

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 8,
        border: "1px solid #e8e8e8",
        padding: "1rem",
        marginBottom: "1rem",
      }}
    >
      <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>Email Folder Rules</h3>
      <p style={{ fontSize: "0.8rem", color: "#888", margin: "0 0 0.75rem" }}>
        Emails matching a keyword in the subject will be auto-assigned to the specified folder. Higher priority rules are checked first.
      </p>

      {loading ? (
        <p style={{ color: "#888", fontSize: "0.85rem" }}>Loading...</p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.83rem",
          }}
        >
          <thead>
            <tr style={{ borderBottom: "2px solid #eee", textAlign: "left" }}>
              <th style={{ padding: "6px 8px" }}>Keyword</th>
              <th style={{ padding: "6px 8px" }}>Folder</th>
              <th style={{ padding: "6px 8px", width: 70 }}>Priority</th>
              <th style={{ padding: "6px 8px", width: 100 }}>Case-sensitive</th>
              <th style={{ padding: "6px 8px", width: 120 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) =>
              editingId === rule.id ? (
                <tr key={rule.id} style={{ borderBottom: "1px solid #f0f0f0", background: "#f9f9ff" }}>
                  <td style={{ padding: "6px 8px" }}>
                    <input
                      value={editKeyword}
                      onChange={(e) => setEditKeyword(e.target.value)}
                      style={{ ...inputStyle, width: "100%" }}
                    />
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    <select
                      value={editFolderId}
                      onChange={(e) => setEditFolderId(Number(e.target.value))}
                      style={selectStyle}
                    >
                      <option value="">Select...</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    <input
                      type="number"
                      value={editPriority}
                      onChange={(e) => setEditPriority(Number(e.target.value))}
                      style={{ ...inputStyle, width: 50 }}
                    />
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={editCaseSensitive}
                      onChange={(e) => setEditCaseSensitive(e.target.checked)}
                    />
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        onClick={saveEdit}
                        disabled={saving}
                        style={{
                          padding: "3px 8px", borderRadius: 4, border: "none",
                          background: "#1565c0", color: "#fff", cursor: "pointer",
                          fontSize: "0.75rem", fontWeight: 600,
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        style={{
                          padding: "3px 8px", borderRadius: 4, border: "1px solid #ddd",
                          background: "#fff", color: "#555", cursor: "pointer",
                          fontSize: "0.75rem",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={rule.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "6px 8px", fontWeight: 600 }}>{rule.keyword}</td>
                  <td style={{ padding: "6px 8px" }}>{rule.folder_name ?? `Folder #${rule.folder_id}`}</td>
                  <td style={{ padding: "6px 8px" }}>{rule.priority}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>{rule.is_case_sensitive ? "Yes" : "No"}</td>
                  <td style={{ padding: "6px 8px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        onClick={() => startEdit(rule)}
                        style={{
                          padding: "3px 8px", borderRadius: 4, border: "1px solid #bbdefb",
                          background: "#e3f2fd", color: "#1565c0", cursor: "pointer",
                          fontSize: "0.75rem", fontWeight: 600,
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        style={{
                          padding: "3px 8px", borderRadius: 4, border: "1px solid #ffcdd2",
                          background: "#fff", color: "#c62828", cursor: "pointer",
                          fontSize: "0.75rem", fontWeight: 600,
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}

            {/* Add new rule row */}
            <tr style={{ borderTop: "2px solid #eee", background: "#fafafa" }}>
              <td style={{ padding: "6px 8px" }}>
                <input
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  placeholder="Keyword..."
                  style={{ ...inputStyle, width: "100%" }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                />
              </td>
              <td style={{ padding: "6px 8px" }}>
                <select
                  value={newFolderId}
                  onChange={(e) => setNewFolderId(Number(e.target.value))}
                  style={selectStyle}
                >
                  <option value="">Select folder...</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              </td>
              <td style={{ padding: "6px 8px" }}>
                <input
                  type="number"
                  value={newPriority}
                  onChange={(e) => setNewPriority(Number(e.target.value))}
                  style={{ ...inputStyle, width: 50 }}
                />
              </td>
              <td style={{ padding: "6px 8px", textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={newCaseSensitive}
                  onChange={(e) => setNewCaseSensitive(e.target.checked)}
                />
              </td>
              <td style={{ padding: "6px 8px" }}>
                <button
                  onClick={handleAdd}
                  disabled={saving || !newKeyword.trim() || newFolderId === ""}
                  style={{
                    padding: "3px 10px", borderRadius: 4, border: "none",
                    background: saving ? "#ccc" : "#2e7d32", color: "#fff",
                    cursor: saving ? "default" : "pointer",
                    fontSize: "0.75rem", fontWeight: 600,
                  }}
                >
                  Add Rule
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
