import { useEffect, useState } from "react";
import { getDocuments, deleteDocument } from "../api/client";
import type { Document } from "../types";

export default function Documents() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const data = await getDocuments();
      setDocs(data);
    } catch {
      // silently fail
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this document and all its extracted prices?")) return;
    try {
      await deleteDocument(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch {
      alert("Failed to delete document");
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Uploaded Documents</h2>

      {docs.length === 0 ? (
        <p style={{ color: "#888" }}>No documents uploaded yet.</p>
      ) : (
        <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #ddd" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
            <thead>
              <tr>
                {["Filename", "Type", "Status", "Rows", "Upload Date", "Notes", ""].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        padding: "0.6rem 0.75rem",
                        textAlign: "left",
                        background: "#1a1a2e",
                        color: "#fff",
                        fontSize: "0.8rem",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id}>
                  <td style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid #eee" }}>
                    {doc.filename}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid #eee" }}>
                    {doc.file_type.toUpperCase()}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid #eee" }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: "0.8rem",
                        background:
                          doc.status === "completed"
                            ? "#e8f5e9"
                            : doc.status === "failed"
                            ? "#ffebee"
                            : doc.status === "pending_review"
                            ? "#e3f2fd"
                            : "#fff3e0",
                        color:
                          doc.status === "completed"
                            ? "#2e7d32"
                            : doc.status === "failed"
                            ? "#c62828"
                            : doc.status === "pending_review"
                            ? "#1565c0"
                            : "#e65100",
                      }}
                    >
                      {doc.status}
                    </span>
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid #eee" }}>
                    {doc.row_count ?? 0}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid #eee", fontSize: "0.85rem" }}>
                    {new Date(doc.upload_date).toLocaleString()}
                  </td>
                  <td
                    style={{
                      padding: "0.5rem 0.75rem",
                      borderBottom: "1px solid #eee",
                      fontSize: "0.8rem",
                      color: "#888",
                      maxWidth: 200,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {doc.notes || "-"}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid #eee" }}>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      style={{
                        padding: "0.3rem 0.6rem",
                        borderRadius: 4,
                        border: "1px solid #ffcdd2",
                        background: "#fff",
                        color: "#c62828",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                      }}
                    >
                      Delete
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
