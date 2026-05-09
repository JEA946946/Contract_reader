import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { uploadDocument } from "../api/client";
import type { UploadResponse } from "../types";

function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div style={{ marginTop: "1.5rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "0.4rem",
          fontSize: "0.9rem",
          color: "#444",
        }}
      >
        <span>{label}</span>
        <span style={{ fontWeight: 600 }}>{Math.round(percent)}%</span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 4,
          background: "#e0e0e0",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${percent}%`,
            borderRadius: 4,
            background:
              percent < 100
                ? "linear-gradient(90deg, #e94560, #f06292)"
                : "#4caf50",
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}

export default function FileUpload({ label, accentColor, onResult }: {
  label?: string;
  accentColor?: string;
  onResult?: (res: UploadResponse) => void;
} = {}) {
  const accent = accentColor || "#e94560";
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [currentFile, setCurrentFile] = useState("");
  const [filePercent, setFilePercent] = useState(0);
  const [results, setResults] = useState<UploadResponse[]>([]);
  const navigate = useNavigate();
  const processingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animate 50% -> 95% during server processing
  const startProcessingAnimation = useCallback(() => {
    let current = 50;
    processingTimerRef.current = setInterval(() => {
      current += (95 - current) * 0.08;
      if (current >= 94.5) current = 95;
      setFilePercent(current);
      if (current >= 95 && processingTimerRef.current) {
        clearInterval(processingTimerRef.current);
      }
    }, 200);
  }, []);

  const stopProcessingAnimation = useCallback(() => {
    if (processingTimerRef.current) {
      clearInterval(processingTimerRef.current);
      processingTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopProcessingAnimation();
  }, [stopProcessingAnimation]);

  const overallPercent =
    progress.total > 0
      ? ((progress.done + filePercent / 100) / progress.total) * 100
      : 0;

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setUploading(true);
      setProgress({ done: 0, total: acceptedFiles.length });
      setFilePercent(0);
      const newResults: UploadResponse[] = [];

      for (let i = 0; i < acceptedFiles.length; i++) {
        const file = acceptedFiles[i];
        setCurrentFile(file.name);
        setFilePercent(0);

        try {
          // Upload phase: 0-50% via onUploadProgress
          const uploadDone = new Promise<void>((resolve) => {
            const checkUpload = setInterval(() => {
              // Wait until filePercent reaches ~50 (upload complete)
              resolve();
              clearInterval(checkUpload);
            }, 100);
          });

          let uploadComplete = false;
          const res = await uploadDocument(file, (percent) => {
            setFilePercent(percent);
            if (percent >= 50 && !uploadComplete) {
              uploadComplete = true;
              // Start server processing animation
              startProcessingAnimation();
            }
          });

          stopProcessingAnimation();
          setFilePercent(100);
          newResults.push(res);
        } catch {
          stopProcessingAnimation();
          setFilePercent(100);
          newResults.push({
            id: 0,
            filename: file.name,
            status: "failed",
            row_count: 0,
            message: "Upload failed",
            rows: [],
            menu_rows: [],
            document_category: "hotel",
          });
        }

        setProgress((prev) => ({ ...prev, done: prev.done + 1 }));
        // Brief pause to show 100% before next file
        await new Promise((r) => setTimeout(r, 300));
      }

      setResults((prev) => [...newResults, ...prev]);
      newResults.forEach((r) => onResult?.(r));
      setUploading(false);
      setCurrentFile("");
      setFilePercent(0);
    },
    [startProcessingAnimation, stopProcessingAnimation]
  );

  const pendingCount = results.filter(
    (r) => r.status === "pending_review" && r.row_count && r.row_count > 0
  ).length;

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    disabled: uploading,
    accept: {
      "application/pdf": [".pdf"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
      "text/csv": [".csv"],
      "text/plain": [".txt"],
      "message/rfc822": [".eml"],
      "application/vnd.ms-outlook": [".msg"],
    },
  });

  return (
    <div>
      <div
        {...getRootProps()}
        style={{
          border: "2px dashed",
          borderColor: uploading
            ? accent
            : isDragActive
            ? accent
            : "#ccc",
          borderRadius: 12,
          padding: "2rem",
          textAlign: "center",
          background: uploading || isDragActive ? accent + "08" : "#fff",
          cursor: uploading ? "default" : "pointer",
          transition: "all 0.2s",
          opacity: uploading ? 0.9 : 1,
        }}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <div>
            <p style={{ color: "#333", fontSize: "0.95rem", margin: "0 0 0.25rem" }}>
              Processing file {progress.done + 1} of {progress.total}
            </p>
            <p
              style={{
                color: "#888",
                fontSize: "0.8rem",
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {currentFile}
            </p>
            <ProgressBar
              percent={filePercent}
              label={filePercent < 50 ? "Uploading..." : filePercent < 100 ? "Parsing document..." : "Done"}
            />
            {progress.total > 1 && (
              <ProgressBar
                percent={overallPercent}
                label={`Overall (${progress.done}/${progress.total} files)`}
              />
            )}
          </div>
        ) : isDragActive ? (
          <p style={{ color: accent, fontSize: "1rem" }}>
            Drop files here...
          </p>
        ) : (
          <div>
            <p style={{ fontSize: "1rem", margin: "0 0 0.3rem" }}>
              {label || "Drag & drop files here, or click to select"}
            </p>
            <p style={{ color: "#888", fontSize: "0.8rem" }}>
              PDF, Word, Excel, CSV, Text, Email
            </p>
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.75rem",
            }}
          >
            <h3 style={{ margin: 0 }}>Upload Results</h3>
            {pendingCount > 0 && (
              <Link
                to="/review"
                style={{
                  padding: "0.45rem 1.25rem",
                  background: "#4caf50",
                  color: "#fff",
                  borderRadius: 6,
                  textDecoration: "none",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                }}
              >
                Review {pendingCount} document{pendingCount !== 1 ? "s" : ""}
              </Link>
            )}
          </div>
          {results.map((r, i) => (
            <div
              key={i}
              style={{
                padding: "0.75rem 1rem",
                marginBottom: "0.5rem",
                borderRadius: 8,
                background:
                  r.status === "failed"
                    ? "#ffebee"
                    : r.status === "pending_review"
                    ? "#e3f2fd"
                    : "#e8f5e9",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <strong>{r.filename}</strong>
                <span style={{ marginLeft: 12, color: "#666" }}>
                  {r.message}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {r.row_count !== null && r.row_count > 0 && (
                  <span
                    style={{
                      background:
                        r.status === "pending_review" ? "#1565c0" : "#4caf50",
                      color: "#fff",
                      padding: "2px 10px",
                      borderRadius: 12,
                      fontSize: "0.85rem",
                    }}
                  >
                    {r.row_count} rows
                  </span>
                )}
                {r.status === "pending_review" && r.id > 0 && (
                  <button
                    onClick={() => {
                      const path = r.document_category === "restaurant"
                        ? `/review-restaurant/${r.id}`
                        : `/review/${r.id}`;
                      navigate(path);
                    }}
                    style={{
                      padding: "2px 10px",
                      borderRadius: 12,
                      border: "none",
                      background: accent,
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                    }}
                  >
                    Review
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
