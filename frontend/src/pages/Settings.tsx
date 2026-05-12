import { useEffect, useState } from "react";
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

interface AppSettings {
  database_connected: boolean;
  database_url_display: string;
  anthropic_configured: boolean;
  anthropic_key_display: string;
  gmail_enabled: boolean;
  gmail_email: string;
  gmail_poll_interval_minutes: number;
  cmr_configured: boolean;
  cmr_api_base: string;
  ai_validation_pass_enabled: boolean;
  upload_dir: string;
  total_documents: number;
  documents_with_hash: number;
  total_feedback_entries: number;
  avg_confidence_score: number | null;
}

interface GmailSettings {
  gmail_email: string;
  gmail_app_password_display: string;
  gmail_imap_host: string;
  gmail_imap_port: number;
  gmail_poll_interval_minutes: number;
  gmail_poll_enabled: boolean;
}

interface GmailForm {
  gmail_email: string;
  gmail_app_password: string;
  gmail_imap_host: string;
  gmail_imap_port: number;
  gmail_poll_interval_minutes: number;
  gmail_poll_enabled: boolean;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: ok ? "#4caf50" : "#f44336",
        marginRight: 8,
      }}
    />
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 10,
        padding: "1.5rem",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
      }}
    >
      <h3 style={{ margin: "0 0 1rem", fontSize: "1.1rem", color: "#1a1a2e" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0.5rem 0",
        borderBottom: "1px solid #f0f0f0",
      }}
    >
      <span style={{ color: "#666", fontSize: "0.9rem" }}>{label}</span>
      <span style={{ fontWeight: 500, fontSize: "0.9rem" }}>{value}</span>
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        background: color,
        color: "#fff",
        padding: "2px 10px",
        borderRadius: 12,
        fontSize: "0.8rem",
        fontWeight: 600,
      }}
    >
      {text}
    </span>
  );
}

function confidenceBadge(score: number | null) {
  if (score === null) return <span style={{ color: "#999" }}>N/A</span>;
  if (score >= 0.7) return <Badge text={`${score}`} color="#4caf50" />;
  if (score >= 0.4) return <Badge text={`${score}`} color="#ff9800" />;
  return <Badge text={`${score}`} color="#f44336" />;
}

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #ddd",
  fontSize: "0.85rem",
  width: 220,
};

const btnStyle: React.CSSProperties = {
  padding: "8px 20px",
  borderRadius: 6,
  border: "none",
  background: "#1a1a2e",
  color: "#fff",
  fontSize: "0.85rem",
  fontWeight: 600,
  cursor: "pointer",
};

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Gmail editing
  const [gmailForm, setGmailForm] = useState<GmailForm>({
    gmail_email: "",
    gmail_app_password: "",
    gmail_imap_host: "imap.gmail.com",
    gmail_imap_port: 993,
    gmail_poll_interval_minutes: 15,
    gmail_poll_enabled: false,
  });
  const [gmailPasswordDisplay, setGmailPasswordDisplay] = useState("");
  const [gmailEditing, setGmailEditing] = useState(false);
  const [gmailSaving, setGmailSaving] = useState(false);
  const [gmailMsg, setGmailMsg] = useState("");

  useEffect(() => {
    api
      .get<AppSettings>("/settings")
      .then(({ data }) => setSettings(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    // Load Gmail settings
    api.get<GmailSettings>("/settings/gmail").then(({ data }) => {
      setGmailForm({
        gmail_email: data.gmail_email,
        gmail_app_password: "",
        gmail_imap_host: data.gmail_imap_host,
        gmail_imap_port: data.gmail_imap_port,
        gmail_poll_interval_minutes: data.gmail_poll_interval_minutes,
        gmail_poll_enabled: data.gmail_poll_enabled,
      });
      setGmailPasswordDisplay(data.gmail_app_password_display);
    });
  }, []);

  const saveGmail = async () => {
    setGmailSaving(true);
    setGmailMsg("");
    try {
      const { data } = await api.put<GmailSettings>("/settings/gmail", gmailForm);
      setGmailPasswordDisplay(data.gmail_app_password_display);
      setGmailForm((f) => ({ ...f, gmail_app_password: "" }));
      setGmailEditing(false);
      setGmailMsg("Saved");
      // Refresh main settings to update status dot
      const updated = await api.get<AppSettings>("/settings");
      setSettings(updated.data);
      setTimeout(() => setGmailMsg(""), 3000);
    } catch (err) {
      setGmailMsg("Failed to save");
    } finally {
      setGmailSaving(false);
    }
  };

  if (loading)
    return (
      <p style={{ textAlign: "center", marginTop: "3rem", color: "#999" }}>
        Loading settings...
      </p>
    );
  if (error)
    return (
      <p style={{ textAlign: "center", marginTop: "3rem", color: "#f44336" }}>
        Error: {error}
      </p>
    );
  if (!settings) return null;

  return (
    <div>
      <h2 style={{ marginBottom: "1.5rem" }}>Settings</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1.5rem",
        }}
      >
        {/* Database */}
        <Card title="Database">
          <Row
            label="Status"
            value={
              <>
                <StatusDot ok={settings.database_connected} />
                {settings.database_connected ? "Connected" : "Disconnected"}
              </>
            }
          />
          <Row
            label="URL"
            value={
              <code style={{ fontSize: "0.8rem" }}>
                {settings.database_url_display}
              </code>
            }
          />
          <Row label="Total documents" value={settings.total_documents} />
        </Card>

        {/* Anthropic API */}
        <Card title="Anthropic API">
          <Row
            label="Status"
            value={
              <>
                <StatusDot ok={settings.anthropic_configured} />
                {settings.anthropic_configured ? "Configured" : "Not set"}
              </>
            }
          />
          <Row
            label="API Key"
            value={
              <code style={{ fontSize: "0.8rem" }}>
                {settings.anthropic_key_display}
              </code>
            }
          />
        </Card>

        {/* Gmail Polling */}
        <Card title="Gmail Polling">
          {!gmailEditing ? (
            <>
              <Row
                label="Status"
                value={
                  <>
                    <StatusDot ok={settings.gmail_enabled} />
                    {settings.gmail_enabled ? "Active" : "Disabled"}
                  </>
                }
              />
              <Row
                label="Email"
                value={settings.gmail_email || <span style={{ color: "#999" }}>Not set</span>}
              />
              <Row
                label="App Password"
                value={
                  gmailPasswordDisplay ? (
                    <code style={{ fontSize: "0.8rem" }}>{gmailPasswordDisplay}</code>
                  ) : (
                    <span style={{ color: "#999" }}>Not set</span>
                  )
                }
              />
              <Row label="IMAP Host" value={gmailForm.gmail_imap_host} />
              <Row label="IMAP Port" value={gmailForm.gmail_imap_port} />
              <Row
                label="Poll interval"
                value={`${settings.gmail_poll_interval_minutes} min`}
              />
              <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: 10 }}>
                <button style={btnStyle} onClick={() => setGmailEditing(true)}>
                  Edit
                </button>
                {gmailMsg && (
                  <span style={{ color: gmailMsg === "Saved" ? "#4caf50" : "#f44336", fontSize: "0.85rem" }}>
                    {gmailMsg}
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Enabled toggle */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid #f0f0f0" }}>
                <span style={{ color: "#666", fontSize: "0.9rem" }}>Enabled</span>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={gmailForm.gmail_poll_enabled}
                    onChange={(e) => setGmailForm({ ...gmailForm, gmail_poll_enabled: e.target.checked })}
                    style={{ width: 18, height: 18 }}
                  />
                  <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                    {gmailForm.gmail_poll_enabled ? "Active" : "Disabled"}
                  </span>
                </label>
              </div>
              {/* Email */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid #f0f0f0" }}>
                <span style={{ color: "#666", fontSize: "0.9rem" }}>Email</span>
                <input
                  type="email"
                  style={inputStyle}
                  value={gmailForm.gmail_email}
                  onChange={(e) => setGmailForm({ ...gmailForm, gmail_email: e.target.value })}
                  placeholder="user@gmail.com"
                />
              </div>
              {/* App Password */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid #f0f0f0" }}>
                <span style={{ color: "#666", fontSize: "0.9rem" }}>App Password</span>
                <input
                  type="password"
                  style={inputStyle}
                  value={gmailForm.gmail_app_password}
                  onChange={(e) => setGmailForm({ ...gmailForm, gmail_app_password: e.target.value })}
                  placeholder={gmailPasswordDisplay || "Enter app password"}
                />
              </div>
              {/* IMAP Host */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid #f0f0f0" }}>
                <span style={{ color: "#666", fontSize: "0.9rem" }}>IMAP Host</span>
                <input
                  type="text"
                  style={inputStyle}
                  value={gmailForm.gmail_imap_host}
                  onChange={(e) => setGmailForm({ ...gmailForm, gmail_imap_host: e.target.value })}
                />
              </div>
              {/* IMAP Port */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid #f0f0f0" }}>
                <span style={{ color: "#666", fontSize: "0.9rem" }}>IMAP Port</span>
                <input
                  type="number"
                  style={{ ...inputStyle, width: 100 }}
                  value={gmailForm.gmail_imap_port}
                  onChange={(e) => setGmailForm({ ...gmailForm, gmail_imap_port: parseInt(e.target.value) || 993 })}
                />
              </div>
              {/* Poll Interval */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid #f0f0f0" }}>
                <span style={{ color: "#666", fontSize: "0.9rem" }}>Poll interval (min)</span>
                <input
                  type="number"
                  style={{ ...inputStyle, width: 100 }}
                  value={gmailForm.gmail_poll_interval_minutes}
                  min={1}
                  onChange={(e) => setGmailForm({ ...gmailForm, gmail_poll_interval_minutes: parseInt(e.target.value) || 15 })}
                />
              </div>
              {/* Buttons */}
              <div style={{ marginTop: "1rem", display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  style={{ ...btnStyle, background: "#4caf50" }}
                  onClick={saveGmail}
                  disabled={gmailSaving}
                >
                  {gmailSaving ? "Saving..." : "Save"}
                </button>
                <button
                  style={{ ...btnStyle, background: "#999" }}
                  onClick={() => {
                    setGmailEditing(false);
                    setGmailMsg("");
                  }}
                >
                  Cancel
                </button>
                {gmailMsg && (
                  <span style={{ color: gmailMsg === "Saved" ? "#4caf50" : "#f44336", fontSize: "0.85rem" }}>
                    {gmailMsg}
                  </span>
                )}
              </div>
            </>
          )}
        </Card>

        {/* CMR Integration */}
        <Card title="CMR Integration">
          <Row
            label="Status"
            value={
              <>
                <StatusDot ok={settings.cmr_configured} />
                {settings.cmr_configured ? "Configured" : "Not set"}
              </>
            }
          />
          <Row
            label="API Base"
            value={
              settings.cmr_api_base || (
                <span style={{ color: "#999" }}>Not set</span>
              )
            }
          />
        </Card>

        {/* AI Parser */}
        <Card title="AI Parser Pipeline">
          <Row
            label="Pass 1 (Analysis)"
            value={<Badge text="Haiku" color="#2196f3" />}
          />
          <Row
            label="Pass 2 (Extraction + Validation)"
            value={<Badge text="Sonnet" color="#9c27b0" />}
          />
          <Row
            label="Separate validation pass"
            value={
              settings.ai_validation_pass_enabled ? (
                <Badge text="Enabled" color="#4caf50" />
              ) : (
                <Badge text="Disabled (inline)" color="#666" />
              )
            }
          />
          <Row
            label="Grounding check"
            value={<Badge text="Sonnet" color="#9c27b0" />}
          />
        </Card>

        {/* Extraction Stats */}
        <Card title="Extraction Pipeline Stats">
          <Row
            label="Documents with content hash"
            value={`${settings.documents_with_hash} / ${settings.total_documents}`}
          />
          <Row
            label="User feedback entries"
            value={settings.total_feedback_entries}
          />
          <Row
            label="Avg confidence score"
            value={confidenceBadge(settings.avg_confidence_score)}
          />
          <Row label="Upload directory" value={settings.upload_dir} />
        </Card>
      </div>

      <div
        style={{
          marginTop: "2rem",
          padding: "1rem 1.5rem",
          background: "#fff3e0",
          borderRadius: 8,
          fontSize: "0.9rem",
          color: "#e65100",
        }}
      >
        Most settings are configured via environment variables in{" "}
        <code>backend/.env</code>. See <code>backend/.env.example</code> for all
        available options. Gmail polling can be edited above and takes effect
        immediately. Other changes require a server restart.
      </div>
    </div>
  );
}
