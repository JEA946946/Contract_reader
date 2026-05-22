import { useEffect, useState } from "react";
import axios from "axios";
import type { ManagedCity, ManagedCategory } from "../types";
import {
  getManagedCities,
  createManagedCity,
  updateManagedCity,
  deleteManagedCity,
  getManagedCategories,
  createManagedCategory,
  updateManagedCategory,
  deleteManagedCategory,
} from "../api/client";

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
  cmr_api_token_display: string;
  google_places_configured: boolean;
  google_places_key_display: string;
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
  background: "#696cff",
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

  // Anthropic editing
  const [anthropicKey, setAnthropicKey] = useState("");
  const [anthropicKeyDisplay, setAnthropicKeyDisplay] = useState("");
  const [anthropicEditing, setAnthropicEditing] = useState(false);
  const [anthropicSaving, setAnthropicSaving] = useState(false);
  const [anthropicMsg, setAnthropicMsg] = useState("");

  // CMR editing
  const [cmrBase, setCmrBase] = useState("");
  const [cmrToken, setCmrToken] = useState("");
  const [cmrTokenDisplay, setCmrTokenDisplay] = useState("");
  const [cmrEditing, setCmrEditing] = useState(false);
  const [cmrSaving, setCmrSaving] = useState(false);
  const [cmrMsg, setCmrMsg] = useState("");

  // Google Places editing
  const [gpKey, setGpKey] = useState("");
  const [gpKeyDisplay, setGpKeyDisplay] = useState("");
  const [gpEditing, setGpEditing] = useState(false);
  const [gpSaving, setGpSaving] = useState(false);
  const [gpMsg, setGpMsg] = useState("");

  // Managed cities state
  const [cities, setCities] = useState<ManagedCity[]>([]);
  const [newCityName, setNewCityName] = useState("");
  const [editingCityId, setEditingCityId] = useState<number | null>(null);
  const [editingCityName, setEditingCityName] = useState("");
  const [cityError, setCityError] = useState("");

  // Managed categories state
  const [categories, setCategories] = useState<ManagedCategory[]>([]);
  const [newCatSlug, setNewCatSlug] = useState("");
  const [newCatLabel, setNewCatLabel] = useState("");
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editingCatSlug, setEditingCatSlug] = useState("");
  const [editingCatLabel, setEditingCatLabel] = useState("");
  const [catError, setCatError] = useState("");

  useEffect(() => {
    api
      .get<AppSettings>("/settings")
      .then(({ data }) => setSettings(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    // Load managed cities & categories
    getManagedCities().then(setCities).catch(() => {});
    getManagedCategories().then(setCategories).catch(() => {});

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

    // Load Anthropic settings
    api.get<{ anthropic_api_key_display: string }>("/settings/anthropic").then(({ data }) => {
      setAnthropicKeyDisplay(data.anthropic_api_key_display);
    });

    // Load CMR settings
    api.get<{ cmr_api_base: string; cmr_api_token_display: string }>("/settings/cmr").then(({ data }) => {
      setCmrBase(data.cmr_api_base);
      setCmrTokenDisplay(data.cmr_api_token_display);
    });

    // Load Google Places settings
    api.get<{ google_places_api_key_display: string }>("/settings/google-places").then(({ data }) => {
      setGpKeyDisplay(data.google_places_api_key_display);
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

  const saveAnthropic = async () => {
    setAnthropicSaving(true);
    setAnthropicMsg("");
    try {
      const { data } = await api.put<{ anthropic_api_key_display: string }>("/settings/anthropic", {
        anthropic_api_key: anthropicKey,
      });
      setAnthropicKeyDisplay(data.anthropic_api_key_display);
      setAnthropicKey("");
      setAnthropicEditing(false);
      setAnthropicMsg("Saved");
      const updated = await api.get<AppSettings>("/settings");
      setSettings(updated.data);
      setTimeout(() => setAnthropicMsg(""), 3000);
    } catch {
      setAnthropicMsg("Failed to save");
    } finally {
      setAnthropicSaving(false);
    }
  };

  const saveCmr = async () => {
    setCmrSaving(true);
    setCmrMsg("");
    try {
      const { data } = await api.put<{ cmr_api_base: string; cmr_api_token_display: string }>("/settings/cmr", {
        cmr_api_base: cmrBase,
        cmr_api_token: cmrToken,
      });
      setCmrBase(data.cmr_api_base);
      setCmrTokenDisplay(data.cmr_api_token_display);
      setCmrToken("");
      setCmrEditing(false);
      setCmrMsg("Saved");
      const updated = await api.get<AppSettings>("/settings");
      setSettings(updated.data);
      setTimeout(() => setCmrMsg(""), 3000);
    } catch {
      setCmrMsg("Failed to save");
    } finally {
      setCmrSaving(false);
    }
  };

  const saveGooglePlaces = async () => {
    setGpSaving(true);
    setGpMsg("");
    try {
      const { data } = await api.put<{ google_places_api_key_display: string }>("/settings/google-places", {
        google_places_api_key: gpKey,
      });
      setGpKeyDisplay(data.google_places_api_key_display);
      setGpKey("");
      setGpEditing(false);
      setGpMsg("Saved");
      const updated = await api.get<AppSettings>("/settings");
      setSettings(updated.data);
      setTimeout(() => setGpMsg(""), 3000);
    } catch {
      setGpMsg("Failed to save");
    } finally {
      setGpSaving(false);
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
          {!anthropicEditing ? (
            <>
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
                  anthropicKeyDisplay && anthropicKeyDisplay !== "not set" ? (
                    <code style={{ fontSize: "0.8rem" }}>{anthropicKeyDisplay}</code>
                  ) : (
                    <span style={{ color: "#999" }}>Not set</span>
                  )
                }
              />
              <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: 10 }}>
                <button style={btnStyle} onClick={() => setAnthropicEditing(true)}>
                  Edit
                </button>
                {anthropicMsg && (
                  <span style={{ color: anthropicMsg === "Saved" ? "#4caf50" : "#f44336", fontSize: "0.85rem" }}>
                    {anthropicMsg}
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <Row
                label="Status"
                value={
                  <>
                    <StatusDot ok={settings.anthropic_configured} />
                    {settings.anthropic_configured ? "Configured" : "Not set"}
                  </>
                }
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid #f0f0f0" }}>
                <span style={{ color: "#666", fontSize: "0.9rem" }}>API Key</span>
                <input
                  type="password"
                  style={inputStyle}
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  placeholder={anthropicKeyDisplay || "sk-ant-..."}
                />
              </div>
              <div style={{ marginTop: "1rem", display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  style={{ ...btnStyle, background: "#4caf50" }}
                  onClick={saveAnthropic}
                  disabled={anthropicSaving}
                >
                  {anthropicSaving ? "Saving..." : "Save"}
                </button>
                <button
                  style={{ ...btnStyle, background: "#999" }}
                  onClick={() => { setAnthropicEditing(false); setAnthropicKey(""); setAnthropicMsg(""); }}
                >
                  Cancel
                </button>
                {anthropicMsg && (
                  <span style={{ color: anthropicMsg === "Saved" ? "#4caf50" : "#f44336", fontSize: "0.85rem" }}>
                    {anthropicMsg}
                  </span>
                )}
              </div>
            </>
          )}
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
          {!cmrEditing ? (
            <>
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
              <Row
                label="API Token"
                value={
                  cmrTokenDisplay && cmrTokenDisplay !== "not set" ? (
                    <code style={{ fontSize: "0.8rem" }}>{cmrTokenDisplay}</code>
                  ) : (
                    <span style={{ color: "#999" }}>Not set</span>
                  )
                }
              />
              <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: 10 }}>
                <button style={btnStyle} onClick={() => setCmrEditing(true)}>
                  Edit
                </button>
                {cmrMsg && (
                  <span style={{ color: cmrMsg === "Saved" ? "#4caf50" : "#f44336", fontSize: "0.85rem" }}>
                    {cmrMsg}
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <Row
                label="Status"
                value={
                  <>
                    <StatusDot ok={settings.cmr_configured} />
                    {settings.cmr_configured ? "Configured" : "Not set"}
                  </>
                }
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid #f0f0f0" }}>
                <span style={{ color: "#666", fontSize: "0.9rem" }}>API Base</span>
                <input
                  type="text"
                  style={inputStyle}
                  value={cmrBase}
                  onChange={(e) => setCmrBase(e.target.value)}
                  placeholder="https://crm.example.com"
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid #f0f0f0" }}>
                <span style={{ color: "#666", fontSize: "0.9rem" }}>API Token</span>
                <input
                  type="password"
                  style={inputStyle}
                  value={cmrToken}
                  onChange={(e) => setCmrToken(e.target.value)}
                  placeholder={cmrTokenDisplay || "Enter token"}
                />
              </div>
              <div style={{ marginTop: "1rem", display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  style={{ ...btnStyle, background: "#4caf50" }}
                  onClick={saveCmr}
                  disabled={cmrSaving}
                >
                  {cmrSaving ? "Saving..." : "Save"}
                </button>
                <button
                  style={{ ...btnStyle, background: "#999" }}
                  onClick={() => { setCmrEditing(false); setCmrToken(""); setCmrMsg(""); }}
                >
                  Cancel
                </button>
                {cmrMsg && (
                  <span style={{ color: cmrMsg === "Saved" ? "#4caf50" : "#f44336", fontSize: "0.85rem" }}>
                    {cmrMsg}
                  </span>
                )}
              </div>
            </>
          )}
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

        {/* Google Places */}
        <Card title="Google Places API">
          {!gpEditing ? (
            <>
              <Row
                label="Status"
                value={
                  <>
                    <StatusDot ok={settings.google_places_configured} />
                    {settings.google_places_configured ? "Configured" : "Not set"}
                  </>
                }
              />
              <Row
                label="API Key"
                value={
                  gpKeyDisplay && gpKeyDisplay !== "not set" ? (
                    <code style={{ fontSize: "0.8rem" }}>{gpKeyDisplay}</code>
                  ) : (
                    <span style={{ color: "#999" }}>Not set</span>
                  )
                }
              />
              <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: 10 }}>
                <button style={btnStyle} onClick={() => setGpEditing(true)}>
                  Edit
                </button>
                {gpMsg && (
                  <span style={{ color: gpMsg === "Saved" ? "#4caf50" : "#f44336", fontSize: "0.85rem" }}>
                    {gpMsg}
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <Row
                label="Status"
                value={
                  <>
                    <StatusDot ok={settings.google_places_configured} />
                    {settings.google_places_configured ? "Configured" : "Not set"}
                  </>
                }
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: "1px solid #f0f0f0" }}>
                <span style={{ color: "#666", fontSize: "0.9rem" }}>API Key</span>
                <input
                  type="password"
                  style={inputStyle}
                  value={gpKey}
                  onChange={(e) => setGpKey(e.target.value)}
                  placeholder={gpKeyDisplay || "AIza..."}
                />
              </div>
              <div style={{ marginTop: "1rem", display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  style={{ ...btnStyle, background: "#4caf50" }}
                  onClick={saveGooglePlaces}
                  disabled={gpSaving}
                >
                  {gpSaving ? "Saving..." : "Save"}
                </button>
                <button
                  style={{ ...btnStyle, background: "#999" }}
                  onClick={() => { setGpEditing(false); setGpKey(""); setGpMsg(""); }}
                >
                  Cancel
                </button>
                {gpMsg && (
                  <span style={{ color: gpMsg === "Saved" ? "#4caf50" : "#f44336", fontSize: "0.85rem" }}>
                    {gpMsg}
                  </span>
                )}
              </div>
            </>
          )}
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

      {/* ── Suppliers Section ───────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginTop: "2rem" }}>

        {/* Cities Card */}
        <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e8e8e8", overflow: "hidden" }}>
          {/* Card header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "14px 20px", borderBottom: "1px solid #e8e8e8",
          }}>
            <h5 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "#1a1a2e" }}>
              Managed Cities
            </h5>
            <span style={{ fontSize: "0.78rem", color: "#888", fontWeight: 500 }}>
              {cities.length} {cities.length === 1 ? "city" : "cities"}
            </span>
          </div>
          {/* Card body */}
          <div style={{ padding: 0 }}>
            {cityError && (
              <div style={{ padding: "10px 20px 0", color: "#c62828", fontSize: "0.82rem" }}>{cityError}</div>
            )}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ background: "#fafafa", borderBottom: "1px solid #e8e8e8" }}>
                  <th style={{ textAlign: "left", padding: "10px 20px", color: "#555", fontWeight: 600, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.03em" }}>Name</th>
                  <th style={{ textAlign: "right", padding: "10px 20px", color: "#555", fontWeight: 600, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.03em", width: 140 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cities.map((c, idx) => (
                  <tr key={c.id} style={{ background: idx % 2 === 1 ? "#fafafa" : "#fff", borderBottom: "1px solid #f0f0f0" }}>
                    {editingCityId === c.id ? (
                      <>
                        <td style={{ padding: "8px 20px" }}>
                          <input
                            autoFocus
                            value={editingCityName}
                            onChange={(e) => setEditingCityName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                setCityError("");
                                updateManagedCity(c.id, editingCityName.trim())
                                  .then((updated) => { setCities((prev) => prev.map((x) => (x.id === updated.id ? updated : x))); setEditingCityId(null); })
                                  .catch((err) => setCityError(err?.response?.data?.detail ?? "Save failed"));
                              }
                              if (e.key === "Escape") setEditingCityId(null);
                            }}
                            style={{ padding: "5px 10px", borderRadius: 4, border: "1px solid #ccc", fontSize: "0.85rem", width: "100%", outline: "none" }}
                          />
                        </td>
                        <td style={{ textAlign: "right", padding: "8px 20px" }}>
                          <div style={{ display: "inline-flex", borderRadius: 4, overflow: "hidden", border: "1px solid #ccc" }}>
                            <button
                              onClick={() => {
                                setCityError("");
                                updateManagedCity(c.id, editingCityName.trim())
                                  .then((updated) => { setCities((prev) => prev.map((x) => (x.id === updated.id ? updated : x))); setEditingCityId(null); })
                                  .catch((err) => setCityError(err?.response?.data?.detail ?? "Save failed"));
                              }}
                              style={{ padding: "4px 12px", border: "none", background: "#fff", color: "#4caf50", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600 }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingCityId(null)}
                              style={{ padding: "4px 12px", border: "none", borderLeft: "1px solid #ccc", background: "#fff", color: "#666", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600 }}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: "10px 20px", fontWeight: 500 }}>{c.name}</td>
                        <td style={{ textAlign: "right", padding: "10px 20px" }}>
                          <div style={{ display: "inline-flex", borderRadius: 4, overflow: "hidden", border: "1px solid #ddd" }}>
                            <button
                              onClick={() => { setEditingCityId(c.id); setEditingCityName(c.name); setCityError(""); }}
                              style={{ padding: "4px 10px", border: "none", background: "#fff", color: "#1565c0", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600 }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                setCityError("");
                                if (!confirm(`Delete city "${c.name}"?`)) return;
                                deleteManagedCity(c.id)
                                  .then(() => setCities((prev) => prev.filter((x) => x.id !== c.id)))
                                  .catch((err) => setCityError(err?.response?.data?.detail ?? "Delete failed"));
                              }}
                              style={{ padding: "4px 10px", border: "none", borderLeft: "1px solid #ddd", background: "#fff", color: "#c62828", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600 }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Add row — separated below table */}
            <div style={{ padding: "12px 20px", borderTop: "1px solid #e8e8e8", background: "#fafafa", display: "flex", gap: 10, alignItems: "center" }}>
              <input
                value={newCityName}
                onChange={(e) => setNewCityName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newCityName.trim()) {
                    setCityError("");
                    createManagedCity(newCityName.trim())
                      .then((created) => { setCities((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name))); setNewCityName(""); })
                      .catch((err) => setCityError(err?.response?.data?.detail ?? "Create failed"));
                  }
                }}
                placeholder="Add new city..."
                style={{ flex: 1, padding: "6px 12px", borderRadius: 4, border: "1px solid #ccc", fontSize: "0.85rem", outline: "none" }}
              />
              <button
                onClick={() => {
                  if (!newCityName.trim()) return;
                  setCityError("");
                  createManagedCity(newCityName.trim())
                    .then((created) => { setCities((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name))); setNewCityName(""); })
                    .catch((err) => setCityError(err?.response?.data?.detail ?? "Create failed"));
                }}
                style={{ padding: "6px 16px", borderRadius: 4, border: "none", background: "#696cff", color: "#fff", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600 }}
              >
                Add City
              </button>
            </div>
          </div>
        </div>

        {/* Categories Card */}
        <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e8e8e8", overflow: "hidden" }}>
          {/* Card header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "14px 20px", borderBottom: "1px solid #e8e8e8",
          }}>
            <h5 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "#1a1a2e" }}>
              Managed Categories
            </h5>
            <span style={{ fontSize: "0.78rem", color: "#888", fontWeight: 500 }}>
              {categories.length} {categories.length === 1 ? "category" : "categories"}
            </span>
          </div>
          {/* Card body */}
          <div style={{ padding: 0 }}>
            {catError && (
              <div style={{ padding: "10px 20px 0", color: "#c62828", fontSize: "0.82rem" }}>{catError}</div>
            )}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ background: "#fafafa", borderBottom: "1px solid #e8e8e8" }}>
                  <th style={{ textAlign: "left", padding: "10px 20px", color: "#555", fontWeight: 600, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.03em" }}>Slug</th>
                  <th style={{ textAlign: "left", padding: "10px 20px", color: "#555", fontWeight: 600, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.03em" }}>Label</th>
                  <th style={{ textAlign: "right", padding: "10px 20px", color: "#555", fontWeight: 600, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.03em", width: 140 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat, idx) => (
                  <tr key={cat.id} style={{ background: idx % 2 === 1 ? "#fafafa" : "#fff", borderBottom: "1px solid #f0f0f0" }}>
                    {editingCatId === cat.id ? (
                      <>
                        <td style={{ padding: "8px 20px" }}>
                          <input
                            autoFocus
                            value={editingCatSlug}
                            onChange={(e) => setEditingCatSlug(e.target.value)}
                            style={{ padding: "5px 10px", borderRadius: 4, border: "1px solid #ccc", fontSize: "0.85rem", width: "100%", outline: "none" }}
                          />
                        </td>
                        <td style={{ padding: "8px 20px" }}>
                          <input
                            value={editingCatLabel}
                            onChange={(e) => setEditingCatLabel(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                setCatError("");
                                updateManagedCategory(cat.id, { slug: editingCatSlug.trim(), label: editingCatLabel.trim() })
                                  .then((updated) => { setCategories((prev) => prev.map((x) => (x.id === updated.id ? updated : x))); setEditingCatId(null); })
                                  .catch((err) => setCatError(err?.response?.data?.detail ?? "Save failed"));
                              }
                              if (e.key === "Escape") setEditingCatId(null);
                            }}
                            style={{ padding: "5px 10px", borderRadius: 4, border: "1px solid #ccc", fontSize: "0.85rem", width: "100%", outline: "none" }}
                          />
                        </td>
                        <td style={{ textAlign: "right", padding: "8px 20px" }}>
                          <div style={{ display: "inline-flex", borderRadius: 4, overflow: "hidden", border: "1px solid #ccc" }}>
                            <button
                              onClick={() => {
                                setCatError("");
                                updateManagedCategory(cat.id, { slug: editingCatSlug.trim(), label: editingCatLabel.trim() })
                                  .then((updated) => { setCategories((prev) => prev.map((x) => (x.id === updated.id ? updated : x))); setEditingCatId(null); })
                                  .catch((err) => setCatError(err?.response?.data?.detail ?? "Save failed"));
                              }}
                              style={{ padding: "4px 12px", border: "none", background: "#fff", color: "#4caf50", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600 }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingCatId(null)}
                              style={{ padding: "4px 12px", border: "none", borderLeft: "1px solid #ccc", background: "#fff", color: "#666", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600 }}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: "10px 20px" }}>
                          <span style={{ background: "#e3f2fd", color: "#1565c0", padding: "2px 10px", borderRadius: 12, fontSize: "0.8rem", fontWeight: 600 }}>{cat.slug}</span>
                        </td>
                        <td style={{ padding: "10px 20px", fontWeight: 500 }}>{cat.label}</td>
                        <td style={{ textAlign: "right", padding: "10px 20px" }}>
                          <div style={{ display: "inline-flex", borderRadius: 4, overflow: "hidden", border: "1px solid #ddd" }}>
                            <button
                              onClick={() => { setEditingCatId(cat.id); setEditingCatSlug(cat.slug); setEditingCatLabel(cat.label); setCatError(""); }}
                              style={{ padding: "4px 10px", border: "none", background: "#fff", color: "#1565c0", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600 }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                setCatError("");
                                if (!confirm(`Delete category "${cat.label}"?`)) return;
                                deleteManagedCategory(cat.id)
                                  .then(() => setCategories((prev) => prev.filter((x) => x.id !== cat.id)))
                                  .catch((err) => setCatError(err?.response?.data?.detail ?? "Delete failed"));
                              }}
                              style={{ padding: "4px 10px", border: "none", borderLeft: "1px solid #ddd", background: "#fff", color: "#c62828", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600 }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Add row */}
            <div style={{ padding: "12px 20px", borderTop: "1px solid #e8e8e8", background: "#fafafa", display: "flex", gap: 10, alignItems: "center" }}>
              <input
                value={newCatSlug}
                onChange={(e) => setNewCatSlug(e.target.value)}
                placeholder="slug"
                style={{ width: 120, padding: "6px 12px", borderRadius: 4, border: "1px solid #ccc", fontSize: "0.85rem", outline: "none" }}
              />
              <input
                value={newCatLabel}
                onChange={(e) => setNewCatLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newCatSlug.trim() && newCatLabel.trim()) {
                    setCatError("");
                    createManagedCategory({ slug: newCatSlug.trim(), label: newCatLabel.trim() })
                      .then((created) => { setCategories((prev) => [...prev, created].sort((a, b) => a.slug.localeCompare(b.slug))); setNewCatSlug(""); setNewCatLabel(""); })
                      .catch((err) => setCatError(err?.response?.data?.detail ?? "Create failed"));
                  }
                }}
                placeholder="Display label"
                style={{ flex: 1, padding: "6px 12px", borderRadius: 4, border: "1px solid #ccc", fontSize: "0.85rem", outline: "none" }}
              />
              <button
                onClick={() => {
                  if (!newCatSlug.trim() || !newCatLabel.trim()) return;
                  setCatError("");
                  createManagedCategory({ slug: newCatSlug.trim(), label: newCatLabel.trim() })
                    .then((created) => { setCategories((prev) => [...prev, created].sort((a, b) => a.slug.localeCompare(b.slug))); setNewCatSlug(""); setNewCatLabel(""); })
                    .catch((err) => setCatError(err?.response?.data?.detail ?? "Create failed"));
                }}
                style={{ padding: "6px 16px", borderRadius: 4, border: "none", background: "#696cff", color: "#fff", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600 }}
              >
                Add Category
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
