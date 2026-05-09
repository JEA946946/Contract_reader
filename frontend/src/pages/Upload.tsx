import { useState } from "react";
import { useNavigate } from "react-router-dom";
import FileUpload from "../components/FileUpload";
import { parseText } from "../api/client";
import type { UploadResponse } from "../types";

function PasteSection({
  accentColor,
  placeholder,
  buttonLabel,
  onReview,
}: {
  accentColor: string;
  placeholder: string;
  buttonLabel: string;
  onReview: (res: UploadResponse) => void;
}) {
  const [text, setText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleParseText() {
    if (!text.trim()) return;
    setProcessing(true);
    setError(null);
    setResult(null);
    try {
      const res = await parseText(text);
      setResult(res);
      if (res.status === "failed") {
        setError(res.message);
      }
    } catch {
      setError("Failed to process text");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={processing}
        placeholder={placeholder}
        style={{
          width: "100%",
          minHeight: 140,
          padding: "0.6rem",
          border: "1px solid #ddd",
          borderRadius: 8,
          fontSize: "0.8rem",
          fontFamily: "monospace",
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.5rem" }}>
        <button
          onClick={handleParseText}
          disabled={processing || !text.trim()}
          style={{
            background: processing || !text.trim() ? "#ccc" : accentColor,
            color: "#fff",
            border: "none",
            padding: "0.4rem 1.2rem",
            borderRadius: 6,
            cursor: processing || !text.trim() ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: "0.8rem",
          }}
        >
          {processing ? "Processing..." : buttonLabel}
        </button>
        {text.trim() && (
          <span style={{ fontSize: "0.75rem", color: "#888" }}>
            {text.trim().split("\n").length} lines
          </span>
        )}
      </div>

      {error && (
        <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", background: "#ffebee", border: "1px solid #fca5a5", borderRadius: 6, color: "#b91c1c", fontSize: "0.8rem" }}>
          {error}
        </div>
      )}

      {result && result.status !== "failed" && (
        <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", background: "#e3f2fd", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: "0.8rem" }}>{result.message}</strong>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            {result.row_count != null && result.row_count > 0 && (
              <span style={{ background: "#1565c0", color: "#fff", padding: "2px 8px", borderRadius: 12, fontSize: "0.75rem" }}>
                {result.row_count} rows
              </span>
            )}
            {result.id > 0 && (
              <button
                onClick={() => onReview(result)}
                style={{ padding: "2px 8px", borderRadius: 12, border: "none", background: accentColor, color: "#fff", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600 }}
              >
                Review
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Upload() {
  const navigate = useNavigate();

  const handleReview = (res: UploadResponse) => {
    const cat = res.document_category;
    const path = cat === "restaurant"
      ? `/review-restaurant/${res.id}`
      : cat === "transportation"
      ? `/review-transportation/${res.id}`
      : `/review/${res.id}`;
    navigate(path);
  };

  const panelStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    background: "#fff",
    borderRadius: 12,
    border: "1px solid #ddd",
    padding: "1.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  };

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: "1.5rem" }}>Upload Documents</h2>

      <div style={{ display: "flex", gap: "1.5rem", alignItems: "stretch" }}>
        {/* Hotel Panel */}
        <div style={panelStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <div style={{ width: 4, height: 24, borderRadius: 2, background: "#e94560" }} />
            <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#1a1a2e" }}>Hotel Contracts</h3>
          </div>
          <p style={{ color: "#888", fontSize: "0.8rem", margin: 0 }}>
            Upload hotel pricing contracts to extract room rates, seasons, and supplements.
          </p>
          <FileUpload
            label="Drop hotel contracts here"
            accentColor="#e94560"
            onResult={handleReview}
          />
          <div style={{ borderTop: "1px solid #eee", paddingTop: "0.75rem" }}>
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "#888", fontWeight: 500 }}>
              Or paste hotel pricing text:
            </p>
            <PasteSection
              accentColor="#e94560"
              placeholder="Paste hotel pricing text here..."
              buttonLabel="Process Hotel Text"
              onReview={handleReview}
            />
          </div>
        </div>

        {/* Restaurant Panel */}
        <div style={panelStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <div style={{ width: 4, height: 24, borderRadius: 2, background: "#ff9800" }} />
            <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#1a1a2e" }}>Restaurant Menus</h3>
          </div>
          <p style={{ color: "#888", fontSize: "0.8rem", margin: 0 }}>
            Upload restaurant menu pricing for lunch, dinner, gala, and farewell events.
          </p>
          <FileUpload
            label="Drop restaurant menus here"
            accentColor="#ff9800"
            onResult={handleReview}
          />
          <div style={{ borderTop: "1px solid #eee", paddingTop: "0.75rem" }}>
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "#888", fontWeight: 500 }}>
              Or paste restaurant menu text:
            </p>
            <PasteSection
              accentColor="#ff9800"
              placeholder="Paste restaurant menu pricing here..."
              buttonLabel="Process Menu Text"
              onReview={handleReview}
            />
          </div>
        </div>

        {/* Transportation Panel */}
        <div style={panelStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <div style={{ width: 4, height: 24, borderRadius: 2, background: "#4caf50" }} />
            <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#1a1a2e" }}>Transportation</h3>
          </div>
          <p style={{ color: "#888", fontSize: "0.8rem", margin: 0 }}>
            Upload transportation pricing for transfers, roundtrips, excursions, and more.
          </p>
          <FileUpload
            label="Drop transport pricing here"
            accentColor="#4caf50"
            onResult={handleReview}
          />
          <div style={{ borderTop: "1px solid #eee", paddingTop: "0.75rem" }}>
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "#888", fontWeight: 500 }}>
              Or paste transport pricing text:
            </p>
            <PasteSection
              accentColor="#4caf50"
              placeholder="Paste transportation pricing here..."
              buttonLabel="Process Transport Text"
              onReview={handleReview}
            />
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 800px) {
          div[style*="display: flex"][style*="gap: 1.5rem"] {
            flex-direction: column !important;
          }
        }
      `}</style>
    </div>
  );
}
